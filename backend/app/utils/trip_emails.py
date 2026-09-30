# utils/trip_emails.py
"""
Best-effort transactional emails to a fleet owner's verified email (see
crud/email_change.py - email is only ever saved once OTP-verified).
Every call here MUST be wrapped in try/except by the caller (or use the
`_safe_send` helper below) - a mail server hiccup must never block the
underlying trip/payout action.
"""
import logging
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _owner_email(db: Session, vehicle_owner_id) -> Optional[str]:
    from app.models.vehicle_owner import VehicleOwnerCredentials
    creds = db.query(VehicleOwnerCredentials).filter(
        VehicleOwnerCredentials.id == vehicle_owner_id
    ).first()
    return creds.email if creds and creds.email else None


def _safe_send(db: Session, vehicle_owner_id, subject: str, body: str) -> None:
    try:
        to_email = _owner_email(db, vehicle_owner_id)
        if not to_email:
            return
        from app.utils.emailer import send_email, smtp_configured
        if not smtp_configured(db):
            return
        send_email(db, to_email, subject, body)
    except Exception:
        logger.warning("Trip email failed (non-blocking)", exc_info=True)


def send_trip_accepted_email(db: Session, vehicle_owner_id, order) -> None:
    pickup_drop = order.pickup_drop_location or {}
    pickup = pickup_drop.get("pickup", "") if isinstance(pickup_drop, dict) else ""
    drop = pickup_drop.get("drop", "") if isinstance(pickup_drop, dict) else ""
    body = (
        f"You accepted a booking.\n\n"
        f"Booking ID: {order.id}\n"
        f"Trip type: {order.trip_type.value if order.trip_type else ''}\n"
        f"Customer: {order.customer_name} ({order.customer_number})\n"
        f"Pickup: {pickup}\n"
        f"Drop: {drop}\n"
        f"Start: {order.start_date_time}\n\n"
        f"Total booking amount: Rs.{order.vendor_price or 0}\n"
        f"Advance received: Rs.{order.advance_received or 0}\n\n"
        f"You can review full trip and payment details anytime in the app."
    )
    _safe_send(db, vehicle_owner_id, f"Drop Cars - Booking Accepted (#{order.id})", body)


def send_payout_requested_email(db: Session, vehicle_owner_id, payout) -> None:
    body = (
        f"Your payout request has been placed.\n\n"
        f"Request ID: {payout.id}\n"
        f"Amount: Rs.{payout.amount}\n"
        f"Status: Pending\n\n"
        f"The admin will process this manually. You'll get another email when it's paid or rejected."
    )
    _safe_send(db, vehicle_owner_id, f"Drop Cars - Payout Requested (#{payout.id})", body)


def send_payout_paid_email(db: Session, vehicle_owner_id, payout) -> None:
    body = (
        f"Your payout has been marked PAID.\n\n"
        f"Request ID: {payout.id}\n"
        f"Amount: Rs.{payout.amount}\n\n"
        f"If you haven't received the money yet, please contact the admin."
    )
    _safe_send(db, vehicle_owner_id, f"Drop Cars - Payout Paid (#{payout.id})", body)


def send_billing_suspended_email(db: Session, vehicle_owner_id, balance_after: int, threshold: int) -> None:
    body = (
        f"Your account has been suspended because your wallet balance (Rs.{balance_after}) "
        f"fell below the allowed minimum (Rs.{threshold}) after your subscription fee was charged.\n\n"
        f"Please top up your wallet within 3 days to reactivate your account and keep receiving bookings. "
        f"Your account reactivates automatically as soon as your balance is back above the minimum."
    )
    _safe_send(db, vehicle_owner_id, "Drop Cars - Account Suspended (Low Balance)", body)


def send_trip_completed_email(
    db: Session,
    vehicle_owner_id,
    order_id,
    driver_profit: int,
    cash_collection: Optional[int],
    settlement: Optional[int],
) -> None:
    """Fires once at trip completion with the final settlement numbers -
    previously the only trip-lifecycle emails were accept/payout/suspension,
    with nothing telling the owner what they actually ended up owed/owing
    once cash collection was reconciled against driver_profit."""
    if cash_collection is None or settlement is None:
        settlement_line = "Cash collection was not recorded for this trip."
    elif settlement > 0:
        settlement_line = f"Cash collected: Rs.{cash_collection} (Rs.{settlement} credited to your wallet as owed to you)."
    elif settlement < 0:
        settlement_line = f"Cash collected: Rs.{cash_collection} (Rs.{-settlement} debited from your wallet - you collected more than owed)."
    else:
        settlement_line = f"Cash collected: Rs.{cash_collection} (matched exactly - no wallet adjustment needed)."

    body = (
        f"Your trip has been completed and settled.\n\n"
        f"Booking ID: {order_id}\n"
        f"Your earning (driver profit): Rs.{driver_profit}\n"
        f"{settlement_line}\n\n"
        f"You can review the full settlement breakdown anytime in the app's wallet history."
    )
    _safe_send(db, vehicle_owner_id, f"Drop Cars - Trip Settled (#{order_id})", body)


def send_document_expiry_email(db: Session, vehicle_owner_id, doc_label: str, item_name: str, expiry_date) -> None:
    """RC/Insurance/Licence expiry reminder - see crud/document_expiry.py's
    daily sweep for the calling logic (which decides who's due and how
    often to re-send)."""
    from datetime import date
    days_left = (expiry_date - date.today()).days
    if days_left < 0:
        urgency = f"expired {-days_left} day(s) ago"
    elif days_left == 0:
        urgency = "expires today"
    else:
        urgency = f"expires in {days_left} day(s)"

    body = (
        f"Your {doc_label} for \"{item_name}\" {urgency} ({expiry_date.strftime('%d %b %Y')}).\n\n"
        f"Please renew and update the document in the app as soon as possible to avoid "
        f"any interruption to bookings.\n\n"
        f"If you've already renewed it, please update the expiry date and re-upload the document."
    )
    _safe_send(db, vehicle_owner_id, f"Drop Cars - {doc_label} {'Expired' if days_left < 0 else 'Expiring Soon'}", body)


def send_payout_rejected_email(db: Session, vehicle_owner_id, payout) -> None:
    body = (
        f"Your payout request was rejected.\n\n"
        f"Request ID: {payout.id}\n"
        f"Amount: Rs.{payout.amount}\n"
        + (f"Reason: {payout.notes}\n" if payout.notes else "")
        + "\nContact the admin if you have questions."
    )
    _safe_send(db, vehicle_owner_id, f"Drop Cars - Payout Rejected (#{payout.id})", body)
