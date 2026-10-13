"""I paid directly (UPI / bank) - tell us, we credit it.

  Driver App   GET  /api/wallet/manual-upi              the UPI ID / payee shown for manual payment (Admin-editable platform settings)
               POST /api/wallet/payment-claims          report a payment: amount, UTR, what it was for (+ optional screenshot link)
               GET  /api/wallet/payment-claims          my claims and what happened to each
  Admin App    GET  /api/admin/payment-claims           the queue (status=PENDING by default)
               POST /api/admin/payment-claims/{id}/approve   credit the wallet (and switch the Trusted plan on when it was for the plan)
               POST /api/admin/payment-claims/{id}/reject    with a reason the person is shown
Razorpay stays the preferred way (it confirms itself); this is the safety net so manual money is never lost or unexplained."""
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_admin, get_current_vehicleOwner_id
from app.crud.admin_activity_log import log_admin_action
from app.database.session import get_db
from app.models.payment_claim import PaymentClaim
from app.models.vehicle_owner import VehicleOwnerCredentials

owner_router = APIRouter(tags=["Payment claims"])
admin_router = APIRouter(prefix="/admin/payment-claims", tags=["Payment claims"])

_UTR = re.compile(r"^[A-Za-z0-9]{6,30}$")
PURPOSES = ("WALLET", "SUBSCRIPTION_MONTHLY", "SUBSCRIPTION_YEARLY", "OTHER")
MAX_PENDING_PER_PERSON = 5
DEFAULT_UPI = "7200217986-1@okbizaxis"          # fallback only - the real one is the platform setting `manual_upi_id`


def _setting(db: Session, key: str, default: str) -> str:
    try:
        from app.crud.customer_booking_request import get_platform_setting_value
        return str(get_platform_setting_value(db, key, default) or default)
    except Exception:  # noqa: BLE001
        return default


class ClaimBody(BaseModel):
    amount: int = Field(..., ge=1, le=200000)
    utr: str = Field(..., description="UPI transaction ID / UTR / bank reference (the 12-digit number in the payment app)")
    purpose: str = "WALLET"
    method: str = "UPI"
    note: Optional[str] = Field(None, max_length=300)
    screenshot_url: Optional[str] = Field(None, max_length=500)


class DecideBody(BaseModel):
    note: Optional[str] = Field(None, max_length=300)
    credit_amount: Optional[int] = Field(None, ge=1, le=200000, description="Approve for a different amount than claimed (e.g. the bank shows less)")


def _out(c: PaymentClaim, owner_name: Optional[str] = None, owner_phone: Optional[str] = None) -> dict:
    return {
        "id": str(c.id), "amount": c.amount, "utr": c.utr, "method": c.method, "purpose": c.purpose, "note": c.note,
        "screenshot_url": c.screenshot_url, "status": c.status, "decision_note": c.decision_note, "decided_by": c.decided_by,
        "decided_at": c.decided_at.isoformat() if c.decided_at else None, "credited_amount": c.credited_amount,
        "created_at": c.created_at.isoformat() if c.created_at else None, "vehicle_owner_id": str(c.vehicle_owner_id),
        "person_name": owner_name, "person_phone": owner_phone,
    }


@owner_router.get("/wallet/manual-upi")
def manual_upi(db: Session = Depends(get_db), vehicle_owner_id: str = Depends(get_current_vehicleOwner_id)):
    return {"upi_id": _setting(db, "manual_upi_id", DEFAULT_UPI), "payee_name": _setting(db, "manual_upi_payee", "Drop Cars"),
            "note": "Online payment (Razorpay) is faster: it confirms by itself. Use this only if online payment is not working."}


@owner_router.post("/wallet/payment-claims")
def create_claim(body: ClaimBody, db: Session = Depends(get_db), vehicle_owner_id: str = Depends(get_current_vehicleOwner_id)):
    utr = re.sub(r"\s", "", body.utr or "").upper()
    if not _UTR.match(utr):
        raise HTTPException(status_code=400, detail="The reference number looks wrong. Copy the 12-digit UPI transaction ID / UTR from your payment app (letters and numbers only).")
    purpose = body.purpose.upper() if body.purpose.upper() in PURPOSES else "OTHER"
    method = "BANK" if body.method.upper() == "BANK" else "UPI"
    existing = db.query(PaymentClaim).filter(PaymentClaim.utr == utr).first()
    if existing:
        if str(existing.vehicle_owner_id) == str(vehicle_owner_id):
            raise HTTPException(status_code=409, detail=f"You already reported this payment ({existing.status.title()}). Check 'My payment reports'.")
        raise HTTPException(status_code=409, detail="This reference number was already reported. If it is yours, contact support.")
    pending = db.query(PaymentClaim).filter(PaymentClaim.vehicle_owner_id == vehicle_owner_id, PaymentClaim.status == "PENDING").count()
    if pending >= MAX_PENDING_PER_PERSON:
        raise HTTPException(status_code=429, detail="You already have several payment reports waiting. We will check them soon.")
    c = PaymentClaim(vehicle_owner_id=vehicle_owner_id, amount=body.amount, utr=utr, method=method, purpose=purpose,
                     note=(body.note or "").strip() or None, screenshot_url=body.screenshot_url, status="PENDING")
    db.add(c)
    db.commit()
    db.refresh(c)
    try:
        from app.crud.portal_trips import notify_admins
        notify_admins(db, "\U0001F4B8 Payment report", f"Rs {body.amount} paid by UPI/bank, UTR {utr}, for {purpose.replace('_', ' ').title()}. Please check and approve.")
    except Exception:  # noqa: BLE001
        pass
    return {"success": True, "claim": _out(c), "message": "Thank you. We will check your payment and credit it - usually within a few hours."}


@owner_router.get("/wallet/payment-claims")
def my_claims(db: Session = Depends(get_db), vehicle_owner_id: str = Depends(get_current_vehicleOwner_id)):
    rows = db.query(PaymentClaim).filter(PaymentClaim.vehicle_owner_id == vehicle_owner_id).order_by(PaymentClaim.created_at.desc()).limit(30).all()
    return {"claims": [_out(c) for c in rows]}


@admin_router.get("")
def list_claims(status: str = "PENDING", db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    q = db.query(PaymentClaim)
    if status.upper() != "ALL":
        q = q.filter(PaymentClaim.status == status.upper())
    rows = q.order_by(PaymentClaim.created_at.desc()).limit(200).all()
    people = {}
    if rows:
        for o in db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id.in_({c.vehicle_owner_id for c in rows})).all():
            people[str(o.id)] = o
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    names = {}
    if rows:
        for d in db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id.in_({c.vehicle_owner_id for c in rows})).all():
            names[str(d.vehicle_owner_id)] = getattr(d, "full_name", None)
    return {"claims": [_out(c, names.get(str(c.vehicle_owner_id)), getattr(people.get(str(c.vehicle_owner_id)), "primary_number", None)) for c in rows]}


def _admin_name(a) -> str:
    return getattr(a, "username", None) or getattr(a, "name", None) or "Admin"


@admin_router.post("/{claim_id}/approve")
def approve_claim(claim_id: str, body: DecideBody, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    try:
        cid = uuid.UUID(str(claim_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    c = db.query(PaymentClaim).filter(PaymentClaim.id == cid).with_for_update().first()
    if c is None:
        raise HTTPException(status_code=404, detail="Claim not found")
    if c.status != "PENDING":
        raise HTTPException(status_code=409, detail=f"Already {c.status.lower()}")
    amount = int(body.credit_amount or c.amount)
    from app.crud.wallet import credit_wallet
    credit_wallet(db, str(c.vehicle_owner_id), amount, reference_id=f"claim:{c.utr}", reference_type="MANUAL_UPI_PAYMENT",
                  notes=f"Payment received by {c.method} (UTR {c.utr}) - confirmed by {_admin_name(current_admin)}")
    c.status, c.credited_amount = "APPROVED", amount
    c.decided_by, c.decided_at = _admin_name(current_admin), datetime.now(timezone.utc)
    c.decision_note = (body.note or "").strip() or f"Rs {amount} added to your wallet."
    db.commit()
    plan_msg = None
    if c.purpose in ("SUBSCRIPTION_MONTHLY", "SUBSCRIPTION_YEARLY"):
        try:
            from app.crud.billing import activate_plan_from_payment
            plan = c.purpose.split("_", 1)[1]
            if activate_plan_from_payment(db, c.vehicle_owner_id, plan):
                plan_msg = f"{plan.title()} Trusted plan is now active."
                c.decision_note = f"Rs {amount} received. {plan_msg}"
                db.commit()
        except Exception as e:  # noqa: BLE001
            db.rollback()
            plan_msg = f"Wallet credited, but the plan could not be switched on automatically ({type(e).__name__}). Record it in Fleet Subscriptions."
    try:
        log_admin_action(db, admin_id=str(current_admin.id), admin_username=_admin_name(current_admin), admin_role=getattr(current_admin, "role", None),
                         action="PAYMENT_CLAIM_APPROVED", target_type="vehicle_owner", target_id=str(c.vehicle_owner_id), target_name=None,
                         details={"utr": c.utr, "amount": amount, "purpose": c.purpose})
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
    _tell_person(db, c, "Payment received", c.decision_note or "")
    return {"success": True, "claim": _out(c), "plan_message": plan_msg}


@admin_router.post("/{claim_id}/reject")
def reject_claim(claim_id: str, body: DecideBody, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    if not (body.note or "").strip():
        raise HTTPException(status_code=400, detail="Give a reason - the person is shown it")
    try:
        cid = uuid.UUID(str(claim_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    c = db.query(PaymentClaim).filter(PaymentClaim.id == cid).with_for_update().first()
    if c is None:
        raise HTTPException(status_code=404, detail="Claim not found")
    if c.status != "PENDING":
        raise HTTPException(status_code=409, detail=f"Already {c.status.lower()}")
    c.status, c.decided_by, c.decided_at, c.decision_note = "REJECTED", _admin_name(current_admin), datetime.now(timezone.utc), body.note.strip()
    db.commit()
    _tell_person(db, c, "Payment report not accepted", c.decision_note)
    return {"success": True, "claim": _out(c)}


def _tell_person(db: Session, c: PaymentClaim, title: str, body: str) -> None:
    """Best-effort push to the person's phone (their wallet screen also shows the result)."""
    try:
        from app.models.notification import Notification
        from app.crud.notification import _is_muted, _post_expo_payloads_sync
        rows = db.query(Notification).filter(Notification.sub == str(c.vehicle_owner_id)).all()
        tokens = [r.token for r in rows if getattr(r, "token", None) and not _is_muted(r)]
        if tokens:
            _post_expo_payloads_sync([{"to": t, "title": title, "body": body[:140], "priority": "high", "data": {"type": "payment_claim"}} for t in tokens])
    except Exception:  # noqa: BLE001
        pass
