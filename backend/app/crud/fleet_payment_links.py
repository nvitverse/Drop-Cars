"""Standard -> Trusted upgrade for a fleet partner: one place for the plan rules, the payment channels the owner allows, the
Razorpay payment link staff share on WhatsApp, and the step that turns a paid link (or a recorded UPI/bank/cash payment) into an
active plan. Nothing here is hardcoded: fees come from billing settings (monthly_fee / yearly_fee), the channel list, the WhatsApp
message and the link lifetime are platform settings the owner can change from the Admin App."""
import logging
import urllib.parse
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.fleet_subscription import FleetSubscriptionHistory
from app.models.vehicle_owner import VehicleOwnerCredentials
from app.models.vehicle_owner_details import VehicleOwnerDetails

logger = logging.getLogger(__name__)

CHANNELS_KEY = "fleet_payment_channels"
MESSAGE_KEY = "fleet_payment_link_message"
EXPIRY_KEY = "fleet_payment_link_expiry_hours"
DEFAULT_CHANNELS = "Wallet,GPay,PhonePe,Paytm,Bank Transfer,Cash in Hand"
DEFAULT_MESSAGE = (
    "Hello {name}, please pay Rs.{amount} for your Drop Cars {plan} Trusted Partner plan using this secure link:\n{link}\n"
    "Your account is upgraded automatically as soon as the payment is done. - Drop Cars"
)
PLAN_DAYS = {"MONTHLY": 30, "YEARLY": 365}


def _setting(db: Session, key: str, default: str) -> str:
    from app.crud.customer_booking_request import get_platform_setting_value
    try:
        return get_platform_setting_value(db, key, default) or default
    except Exception:
        return default


def razorpay_configured() -> bool:
    import os
    return bool(os.getenv("RAZORPAY_KEY_ID") and os.getenv("RAZORPAY_KEY_SECRET"))


def get_options(db: Session) -> dict:
    """Everything the Admin App needs to draw the upgrade screen - nothing is baked into the app."""
    from app.crud.billing import get_billing_settings
    fees = get_billing_settings(db)
    channels = [c.strip() for c in _setting(db, CHANNELS_KEY, DEFAULT_CHANNELS).split(",") if c.strip()]
    try:
        expiry = int(_setting(db, EXPIRY_KEY, "48"))
    except ValueError:
        expiry = 48
    from app.crud.system_settings import SYSTEM_SETTING_DEFAULTS
    return {
        "plans": [
            {"key": "MONTHLY", "label": "Monthly", "fee": int(fees.get("monthly_fee") or SYSTEM_SETTING_DEFAULTS["monthly_fee"]), "days": PLAN_DAYS["MONTHLY"]},
            {"key": "YEARLY", "label": "Yearly", "fee": int(fees.get("yearly_fee") or SYSTEM_SETTING_DEFAULTS["yearly_fee"]), "days": PLAN_DAYS["YEARLY"]},
        ],
        "channels": channels,
        "payment_link_enabled": razorpay_configured(),
        "message_template": _setting(db, MESSAGE_KEY, DEFAULT_MESSAGE),
        "link_expiry_hours": expiry,
    }


def apply_subscription_payment(db: Session, details: VehicleOwnerDetails, vehicle_owner_id, plan: str, amount: float,
                               channel: str, ref: Optional[str], notes: Optional[str], duration: Optional[int],
                               mark_trusted: bool, admin_id, admin_username: str, admin_role: str = "Owner"):
    """Make the partner's plan paid and (optionally) Trusted, write the history row and the audit log. Does NOT commit.
    Returns the new end date."""
    from app.crud.admin_activity_log import log_admin_action
    today = date.today()
    now_utc = datetime.now(timezone.utc)
    duration = duration or PLAN_DAYS.get(plan, 30)
    if details.billing_next_date and details.billing_next_date > today:
        end_date = details.billing_next_date + timedelta(days=duration)     # paid early: extend from the current end
    else:
        end_date = today + timedelta(days=duration)
    clean_channel = (channel or "").strip()
    clean_ref = (ref or "").strip() or None
    clean_notes = (notes or "").strip() or f"{plan.title()} payment via {clean_channel}"

    details.subscription_type = plan
    details.registration_fee_paid_at = now_utc
    details.subscription_paid_at = now_utc
    details.subscription_paid_amount = amount
    details.subscription_payment_channel = clean_channel
    details.subscription_payment_ref = clean_ref
    details.billing_next_date = end_date
    details.billing_last_charged_at = now_utc
    details.billing_suspended = False
    details.billing_suspended_at = None
    details.billing_suspended_by = None
    details.billing_suspended_reason = None
    if mark_trusted:
        details.admin_trusted_override = True
        details.trusted_override_by = admin_username
        details.trusted_override_reason = f"Verified subscription payment via {clean_channel} (Ref: {clean_ref or 'Direct'})"
        details.trusted_override_at = now_utc

    db.add(FleetSubscriptionHistory(
        id=uuid.uuid4(), vehicle_owner_id=vehicle_owner_id, event_type="MANUAL_PAYMENT", payment_channel=clean_channel,
        payment_ref=clean_ref, amount=amount, plan_type=plan, duration_days=duration, period_start=today, period_end=end_date,
        is_trusted=mark_trusted, reason=clean_notes, admin_id=admin_id, admin_username=admin_username, created_at=now_utc,
    ))
    log_admin_action(
        db, admin_id=str(admin_id) if admin_id else None, admin_username=admin_username, admin_role=admin_role,
        action="FLEET_SUBSCRIPTION_MANUAL_PAY", target_type="vehicle_owner", target_id=str(vehicle_owner_id),
        target_name=details.full_name,
        details={"channel": clean_channel, "ref": clean_ref, "amount": float(amount), "plan": plan,
                 "valid_until": end_date.isoformat(), "marked_trusted": mark_trusted},
    )
    return end_date


def create_payment_link(db: Session, vehicle_owner_id, plan: str, amount: Optional[int], admin) -> dict:
    plan = (plan or "").upper()
    if plan not in PLAN_DAYS:
        raise HTTPException(status_code=400, detail="Plan must be MONTHLY or YEARLY")
    if not razorpay_configured():
        raise HTTPException(status_code=503, detail="Online payment links are not set up yet (Razorpay keys missing). Use a recorded payment instead.")
    creds = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == vehicle_owner_id).first()
    details = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id).first()
    if not creds or not details:
        raise HTTPException(status_code=404, detail="Fleet Owner account not found")
    opts = get_options(db)
    fee = next(p["fee"] for p in opts["plans"] if p["key"] == plan)
    amt = int(amount or fee or 0)
    if amt <= 0:
        raise HTTPException(status_code=400, detail=f"No {plan.title()} fee is set. Enter the amount, or set the fee in billing settings.")

    from app.utils.razorpay_client import RazorpayClient
    contact = "".join(ch for ch in str(creds.primary_number or "") if ch.isdigit())[-10:]
    ref_id = f"fleet-{uuid.uuid4().hex[:30]}"
    try:
        link = RazorpayClient().create_payment_link(
            amount_rupees=amt, description=f"Drop Cars {plan.title()} Trusted Partner plan", reference_id=ref_id,
            customer_name=details.full_name, customer_contact=f"+91{contact}" if len(contact) == 10 else None,
            notes={"purpose": "fleet_subscription", "vehicle_owner_id": str(vehicle_owner_id), "plan": plan},
            expire_in_hours=opts["link_expiry_hours"],
        )
    except Exception as e:                                            # Razorpay down / rejected: say so plainly
        logger.warning("payment link create failed: %s", e)
        raise HTTPException(status_code=502, detail="Razorpay could not create the payment link right now. Try again in a minute.")

    now = datetime.now(timezone.utc)
    db.add(FleetSubscriptionHistory(
        id=uuid.uuid4(), vehicle_owner_id=vehicle_owner_id, event_type="PAYMENT_LINK_CREATED", payment_channel="Razorpay Link",
        payment_ref=link["id"], amount=amt, plan_type=plan, reason=link.get("short_url"),
        admin_id=getattr(admin, "id", None), admin_username=getattr(admin, "username", "Admin"), created_at=now,
    ))
    db.commit()
    message = opts["message_template"].format(name=details.full_name or "Partner", plan=plan.title(), amount=amt, link=link["short_url"])
    wa_number = f"91{contact}" if len(contact) == 10 else ""
    return {
        "link_id": link["id"], "short_url": link["short_url"], "amount": amt, "plan": plan, "message": message,
        "whatsapp_url": f"https://wa.me/{wa_number}?text={urllib.parse.quote(message)}" if wa_number else None,
        "phone": wa_number or None,
    }


def _settled(db: Session, link_id: str) -> Optional[str]:
    row = (db.query(FleetSubscriptionHistory.event_type)
           .filter(FleetSubscriptionHistory.payment_ref == link_id,
                   FleetSubscriptionHistory.event_type.in_(["PAYMENT_LINK_PAID", "PAYMENT_LINK_EXPIRED"])).first())
    return row[0] if row else None


def check_link(db: Session, created_row: FleetSubscriptionHistory) -> dict:
    """Ask Razorpay about one link; if it is paid, upgrade the partner exactly once. Safe to call any number of times."""
    link_id = created_row.payment_ref
    done = _settled(db, link_id)
    if done == "PAYMENT_LINK_PAID":
        return {"link_id": link_id, "status": "PAID"}
    if done == "PAYMENT_LINK_EXPIRED":
        return {"link_id": link_id, "status": "EXPIRED"}
    from app.utils.razorpay_client import RazorpayClient
    info = RazorpayClient().get_payment_link(link_id)
    status = (info.get("status") or "").lower()
    now = datetime.now(timezone.utc)
    if status == "paid":
        details = (db.query(VehicleOwnerDetails)
                   .filter(VehicleOwnerDetails.vehicle_owner_id == created_row.vehicle_owner_id).with_for_update().first())
        if _settled(db, link_id):                                      # lost a race with another checker
            db.rollback()
            return {"link_id": link_id, "status": "PAID"}
        pays = [p for p in (info.get("payments") or []) if (p.get("status") or "").lower() in ("captured", "paid")]
        pay_id = (pays[0].get("payment_id") if pays else None) or link_id
        paid_amount = float(created_row.amount or 0)
        apply_subscription_payment(
            db, details, created_row.vehicle_owner_id, created_row.plan_type, paid_amount, "Razorpay Link", pay_id,
            f"{created_row.plan_type.title()} plan paid through the Razorpay payment link", None, True,
            created_row.admin_id, created_row.admin_username or "Admin")
        db.add(FleetSubscriptionHistory(
            id=uuid.uuid4(), vehicle_owner_id=created_row.vehicle_owner_id, event_type="PAYMENT_LINK_PAID",
            payment_channel="Razorpay Link", payment_ref=link_id, amount=paid_amount, plan_type=created_row.plan_type,
            reason="Payment link paid - plan activated", created_at=now))
        db.commit()
        return {"link_id": link_id, "status": "PAID", "activated": True}
    if status in ("expired", "cancelled"):
        db.add(FleetSubscriptionHistory(
            id=uuid.uuid4(), vehicle_owner_id=created_row.vehicle_owner_id, event_type="PAYMENT_LINK_EXPIRED",
            payment_channel="Razorpay Link", payment_ref=link_id, amount=created_row.amount, plan_type=created_row.plan_type,
            reason=f"Payment link {status}", created_at=now))
        db.commit()
        return {"link_id": link_id, "status": "EXPIRED"}
    return {"link_id": link_id, "status": "PENDING"}


def latest_link_for_owner(db: Session, vehicle_owner_id) -> Optional[FleetSubscriptionHistory]:
    return (db.query(FleetSubscriptionHistory)
            .filter(FleetSubscriptionHistory.vehicle_owner_id == vehicle_owner_id,
                    FleetSubscriptionHistory.event_type == "PAYMENT_LINK_CREATED")
            .order_by(FleetSubscriptionHistory.created_at.desc()).first())


def reconcile_pending_links(db: Session, max_links: int = 25) -> dict:
    """Sweep step: finish every recent payment link that was paid while nobody was looking at the screen."""
    if not razorpay_configured():
        return {"checked": 0, "activated": 0}
    since = datetime.now(timezone.utc) - timedelta(days=7)
    rows = (db.query(FleetSubscriptionHistory)
            .filter(FleetSubscriptionHistory.event_type == "PAYMENT_LINK_CREATED", FleetSubscriptionHistory.created_at >= since)
            .order_by(FleetSubscriptionHistory.created_at.desc()).limit(200).all())
    checked = activated = 0
    for r in rows:
        if checked >= max_links:
            break
        if _settled(db, r.payment_ref):
            continue
        checked += 1
        try:
            if check_link(db, r).get("activated"):
                activated += 1
        except Exception as e:
            db.rollback()
            logger.warning("payment link check failed for %s: %s", r.payment_ref, e)
    return {"checked": checked, "activated": activated}
