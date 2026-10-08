# crud/payout_requests.py
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.payout_request import PayoutRequest, PayoutRequestStatusEnum
from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.models.vendor_details import VendorDetails
from app.crud.wallet import get_owner_balance, debit_wallet, credit_wallet
from app.crud.vendor_wallet import get_vendor_wallet_balance, debit_vendor_wallet, credit_vendor_wallet

DEFAULT_MIN_RETAINED_BALANCE = 500  # owner's rule: wallet must keep at least this after a payout - the live value is the setting payout_min_retained_balance


def min_retained_balance(db) -> int:
    from app.crud.customer_booking_request import get_platform_setting_value
    try:
        return max(0, int(float(get_platform_setting_value(db, "payout_min_retained_balance", str(DEFAULT_MIN_RETAINED_BALANCE)) or DEFAULT_MIN_RETAINED_BALANCE)))
    except (TypeError, ValueError):
        return DEFAULT_MIN_RETAINED_BALANCE


def _balance_for(db: Session, *, vehicle_owner_id: Optional[str], vendor_id: Optional[str]) -> int:
    if vehicle_owner_id:
        return get_owner_balance(db, vehicle_owner_id)
    return get_vendor_wallet_balance(db, vendor_id)


def create_payout_request(
    db: Session,
    amount: int,
    *,
    vehicle_owner_id: Optional[str] = None,
    vendor_id: Optional[str] = None,
) -> PayoutRequest:
    if bool(vehicle_owner_id) == bool(vendor_id):
        raise HTTPException(status_code=400, detail="Exactly one of vehicle_owner_id or vendor_id is required")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payout amount must be greater than zero")

    balance = _balance_for(db, vehicle_owner_id=vehicle_owner_id, vendor_id=vendor_id)
    keep = min_retained_balance(db)
    max_redeemable = balance - keep
    if amount > max_redeemable:
        raise HTTPException(
            status_code=400,
            detail=f"You can redeem up to ₹{max(max_redeemable, 0)} - a minimum of ₹{keep} must stay in your wallet."
        )

    # Only one payout request in flight at a time - avoids the same balance
    # being requested twice before the first is settled.
    filters = [PayoutRequest.status == PayoutRequestStatusEnum.PENDING]
    filters.append(PayoutRequest.vehicle_owner_id == vehicle_owner_id if vehicle_owner_id else PayoutRequest.vendor_id == vendor_id)
    existing = db.query(PayoutRequest).filter(*filters).first()
    if existing:
        raise HTTPException(status_code=400, detail="You already have a payout request pending")

    request = PayoutRequest(vehicle_owner_id=vehicle_owner_id, vendor_id=vendor_id, amount=amount)
    db.add(request)
    db.commit()
    db.refresh(request)

    if vehicle_owner_id:
        try:
            from app.utils.trip_emails import send_payout_requested_email
            send_payout_requested_email(db, vehicle_owner_id, request)
        except Exception as e:
            print(f"payout-requested email failed (request still created): {e}")

    return request


def get_payout_requests_for_owner(
    db: Session,
    *,
    vehicle_owner_id: Optional[str] = None,
    vendor_id: Optional[str] = None,
) -> List[PayoutRequest]:
    query = db.query(PayoutRequest)
    if vehicle_owner_id:
        query = query.filter(PayoutRequest.vehicle_owner_id == vehicle_owner_id)
    else:
        query = query.filter(PayoutRequest.vendor_id == vendor_id)
    return query.order_by(PayoutRequest.requested_at.desc()).all()


def get_payout_requests(db: Session, status: Optional[str] = None, skip: int = 0, limit: int = 50) -> List[dict]:
    """Admin queue view - enriched with the requester's name/phone and role
    so admin doesn't have to cross-reference a separate screen to know who
    to pay. Covers both fleet-owner and vendor payout requests."""
    query = db.query(PayoutRequest)
    if status:
        query = query.filter(PayoutRequest.status == status)
    requests = query.order_by(PayoutRequest.requested_at.desc()).offset(skip).limit(limit).all()

    owner_ids = {str(r.vehicle_owner_id) for r in requests if r.vehicle_owner_id}
    vendor_ids = {str(r.vendor_id) for r in requests if r.vendor_id}
    owners_by_id = {
        str(d.vehicle_owner_id): d
        for d in db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id.in_(owner_ids)).all()
    } if owner_ids else {}
    vendors_by_id = {
        str(d.vendor_id): d
        for d in db.query(VendorDetails).filter(VendorDetails.vendor_id.in_(vendor_ids)).all()
    } if vendor_ids else {}

    result = []
    for request in requests:
        if request.vehicle_owner_id:
            role, details = "VEHICLE_OWNER", owners_by_id.get(str(request.vehicle_owner_id))
        else:
            role, details = "VENDOR", vendors_by_id.get(str(request.vendor_id))
        result.append({
            "id": request.id,
            "vehicle_owner_id": request.vehicle_owner_id,
            "vendor_id": request.vendor_id,
            "role": role,
            "amount": request.amount,
            "status": request.status.value,
            "requested_at": request.requested_at,
            "processed_at": request.processed_at,
            "processed_by_admin_id": request.processed_by_admin_id,
            "notes": request.notes,
            "paid_via": request.paid_via,
            "initiated_by_admin": request.initiated_by_admin,
            "owner_name": details.full_name if details else None,
            "owner_phone": details.primary_number if details else None,
            # Where the admin should actually send the money - previously
            # fetched (details) but never surfaced, forcing the admin to go
            # find the account manually before paying.
            "bank_account_number": details.bank_account_number if details else None,
            "bank_ifsc": details.bank_ifsc if details else None,
            "bank_account_holder_name": details.bank_account_holder_name if details else None,
            "upi_id": details.upi_id if details else None,
            "gpay_number": getattr(details, "gpay_number", None) if details else None,
        })
    return result


def mark_payout_paid(db: Session, request_id: int, admin_id: str, notes: Optional[str] = None, paid_via: Optional[str] = None) -> PayoutRequest:
    # Locked for the rest of this transaction - two near-simultaneous
    # "mark paid" calls on the same request (e.g. an admin double-clicking,
    # or two admins racing) could otherwise both pass the PENDING check
    # below before either commits, causing one payout to be debited twice.
    # Matches the row-locking already used correctly in
    # crud/transfer_transactions.py's approval flow.
    request = db.query(PayoutRequest).filter(PayoutRequest.id == request_id).with_for_update().first()
    if not request:
        raise HTTPException(status_code=404, detail="Payout request not found")
    if request.status != PayoutRequestStatusEnum.PENDING:
        raise HTTPException(status_code=400, detail=f"Payout request is already {request.status.value}")

    # The admin has already paid the requester outside the app (bank
    # transfer/UPI) - this just records it and debits the wallet to match.
    if request.vehicle_owner_id:
        debit_wallet(
            db,
            vehicle_owner_id=str(request.vehicle_owner_id),
            amount=request.amount,
            reference_id=str(request.id),
            reference_type="PAYOUT_PAID",
            notes=notes or f"Payout request #{request.id} paid",
        )
    else:
        debit_vendor_wallet(
            db,
            vendor_id=str(request.vendor_id),
            amount=request.amount,
            order_id=None,
            notes=notes or f"Payout request #{request.id} paid",
        )
    request.status = PayoutRequestStatusEnum.PAID
    request.processed_at = datetime.now(timezone.utc)
    request.processed_by_admin_id = admin_id
    request.notes = notes
    request.paid_via = paid_via
    db.commit()
    db.refresh(request)

    if request.vehicle_owner_id:
        try:
            from app.utils.trip_emails import send_payout_paid_email
            send_payout_paid_email(db, str(request.vehicle_owner_id), request)
        except Exception as e:
            print(f"payout-paid email failed (payout still recorded): {e}")

    return request


def reject_payout_request(db: Session, request_id: int, admin_id: str, notes: Optional[str] = None) -> PayoutRequest:
    request = db.query(PayoutRequest).filter(PayoutRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Payout request not found")
    if request.status != PayoutRequestStatusEnum.PENDING:
        raise HTTPException(status_code=400, detail=f"Payout request is already {request.status.value}")

    request.status = PayoutRequestStatusEnum.REJECTED
    request.processed_at = datetime.now(timezone.utc)
    request.processed_by_admin_id = admin_id
    request.notes = notes
    db.commit()
    db.refresh(request)

    if request.vehicle_owner_id:
        try:
            from app.utils.trip_emails import send_payout_rejected_email
            send_payout_rejected_email(db, str(request.vehicle_owner_id), request)
        except Exception as e:
            print(f"payout-rejected email failed (rejection still recorded): {e}")

    return request


def admin_initiated_payout(
    db: Session,
    admin_id: str,
    amount: int,
    remark: str,
    *,
    vehicle_owner_id: Optional[str] = None,
    vendor_id: Optional[str] = None,
    paid_via: Optional[str] = None,
) -> PayoutRequest:
    """Admin pays someone directly (no prior request) - debits their wallet
    and logs a PAID PayoutRequest row (initiated_by_admin=True) so it shows
    up in their transaction/payout history with the remark, same as a
    self-requested payout would."""
    if bool(vehicle_owner_id) == bool(vendor_id):
        raise HTTPException(status_code=400, detail="Exactly one of vehicle_owner_id or vendor_id is required")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    if vehicle_owner_id:
        debit_wallet(
            db,
            vehicle_owner_id=vehicle_owner_id,
            amount=amount,
            reference_id=None,
            reference_type="PAYOUT_PAID",
            notes=remark,
        )
    else:
        debit_vendor_wallet(db, vendor_id=vendor_id, amount=amount, order_id=None, notes=remark)

    request = PayoutRequest(
        vehicle_owner_id=vehicle_owner_id,
        vendor_id=vendor_id,
        amount=amount,
        status=PayoutRequestStatusEnum.PAID,
        processed_at=datetime.now(timezone.utc),
        processed_by_admin_id=admin_id,
        notes=remark,
        paid_via=paid_via,
        initiated_by_admin=True,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request
