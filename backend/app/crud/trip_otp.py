# crud/trip_otp.py
"""Booking-level trip OTPs - see Order.start_trip_otp for why they live on
the booking and are copied onto each assignment."""
import secrets

from sqlalchemy.orm import Session


def _new_otp() -> str:
    return f"{secrets.randbelow(10000):04d}"


def ensure_order_otps(db: Session, order) -> tuple:
    """Return the booking's (start, end) OTPs, creating them if missing.
    Flushes but never commits - the caller owns the transaction."""
    if order is None:
        return _new_otp(), _new_otp()
    changed = False
    if not order.start_trip_otp:
        order.start_trip_otp = _new_otp()
        changed = True
    if not order.end_trip_otp:
        order.end_trip_otp = _new_otp()
        changed = True
    if changed:
        db.add(order)
        db.flush()
    return order.start_trip_otp, order.end_trip_otp


def apply_order_otps_to_assignment(db: Session, assignment) -> None:
    """Copy the booking's OTPs onto an assignment (creating them first if
    the booking has none yet)."""
    from app.models.orders import Order
    order = db.query(Order).filter(Order.id == assignment.order_id).first()
    start, end = ensure_order_otps(db, order)
    assignment.start_trip_otp = start
    assignment.end_trip_otp = end


def _status(value) -> str:
    return str(getattr(value, "value", value) or "").upper()


def otps_visible(order=None, assignment=None) -> bool:
    """Trip OTPs only mean something while the trip can still be started or
    ended. Once the booking or this assignment is completed or cancelled the
    codes are dead: they are hidden from every app and start/end refuse them."""
    if order is not None:
        s = _status(order.trip_status)
        if s == "COMPLETED" or "CANCEL" in s:
            return False
    if assignment is not None:
        s = _status(assignment.assignment_status)
        if s in ("COMPLETED", "CANCELLED"):
            return False
    return True
