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


def trip_otp_enforced(db) -> bool:
    """Is a trip start / end code REQUIRED? Setting `trip_otp_enforced` (default on). Until 2026-10-07 the server only compared a code
    when one was typed, so a blank code started and ended any trip without the customer being there. Switch it off from the
    settings table only in an emergency (a flow where customers cannot get their code)."""
    try:
        from app.crud.customer_booking_request import get_platform_setting_value
        return str(get_platform_setting_value(db, "trip_otp_enforced", "1")).strip().lower() not in ("0", "false", "off", "no")
    except Exception:
        return True


def check_trip_otp(db, expected, supplied, which: str) -> None:
    """Raise a plain ValueError message when the code is wrong or (while enforced) missing. `expected` None = no code on this trip."""
    if not expected:
        return
    given = (supplied or "").strip()
    if not given:
        if trip_otp_enforced(db):
            raise ValueError(f"Ask the customer for the trip {which} code - it is required to {'start' if which == 'start' else 'end'} the trip")
        return
    if given != str(expected).strip():
        raise ValueError(f"Incorrect trip {which} code - ask the customer for the code from their booking")


def trip_codes_for_request(db, request) -> dict:
    """The start / end codes of a customer's booking, for the customer only (website My Bookings page, Customer App).
    Empty until a driver + car is assigned, and again once the trip is completed or cancelled."""
    from app.models.orders import Order
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    empty = {"start_trip_otp": None, "end_trip_otp": None, "available": False}
    if not getattr(request, "linked_order_id", None):
        return empty
    order = db.query(Order).filter(Order.id == request.linked_order_id).first()
    a = (
        db.query(OrderAssignment)
        .filter(OrderAssignment.order_id == request.linked_order_id,
                OrderAssignment.assignment_status.in_([AssignmentStatusEnum.ASSIGNED, AssignmentStatusEnum.DRIVING]))
        .order_by(OrderAssignment.created_at.desc()).first()
    )
    if not a or not (a.driver_id and a.car_id) or not otps_visible(order, a):
        return empty
    return {"start_trip_otp": a.start_trip_otp, "end_trip_otp": a.end_trip_otp, "available": True}


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
