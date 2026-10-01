"""The facts a chat bot may see - ONE person's own data per call, never anyone else's.

Strict scoping is the whole point of this module:
  - every builder takes the principal's own id and filters every query by it
  - nothing here ever returns a phone number, an OTP, another party's money (a customer never sees driver fare or
    commission; a driver never sees the customer's quote), or a booking the person is not a party to
  - the booking-group (dispatch) facts are logistics only, so they are safe for EVERY participant of that chat
tests/test_chat_bots.py checks these rules with two people of every role.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.crud import conversations as C

logger = logging.getLogger(__name__)

NOT_A_PARTY = "No booking facts are available."


def _v(x):
    return x.value if hasattr(x, "value") else x


def _ist(dt) -> str:
    try:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (dt + timedelta(hours=5, minutes=30)).strftime("%d %b %I:%M %p")
    except Exception:  # noqa: BLE001
        return str(dt)


def _route(order_or_request) -> str:
    loc = getattr(order_or_request, "pickup_drop_location", None)
    loc = loc if isinstance(loc, dict) else {}
    try:
        keys = sorted(loc.keys(), key=lambda k: int(k))
    except Exception:  # noqa: BLE001
        keys = list(loc.keys())
    stops = [str(loc[k]) for k in keys if loc.get(k)]
    return " -> ".join(stops) if stops else "?"


def _first_name(name: Optional[str]) -> str:
    return (name or "").strip().split(" ")[0] if name else ""


# ------------------------------------------------------------------ customer
def customer_facts(db: Session, customer_id: str) -> str:
    """The customer's own booking requests (quote they were shown, status, driver first name once assigned)."""
    from app.crud import booking_chat as legacy
    from app.models.customer_booking_request import CustomerBookingRequest
    from app.models.orders import Order

    lines: List[str] = ["Role: CUSTOMER"]
    name = C.display_name(db, C.CUSTOMER, customer_id)
    if name and name != "Customer":
        lines.append(f"Name: {_first_name(name)}")
    rows = (db.query(CustomerBookingRequest).filter(CustomerBookingRequest.customer_id == customer_id)
            .order_by(CustomerBookingRequest.start_date_time.desc()).limit(5).all())
    if not rows:
        lines.append("No bookings yet.")
    for r in rows:
        line = (f"- Request {str(r.id)[:8]}: {_route(r)}, {r.trip_type}, {r.car_type}, pickup {_ist(r.start_date_time)}, "
                f"status {r.status}, quoted total Rs {r.admin_total_amount or r.quoted_total_amount}")
        if r.linked_order_id:
            o = db.query(Order).filter(Order.id == r.linked_order_id).first()
            if o is not None:
                a = legacy.active_assignment(db, o.id)
                driver = ""
                if a is not None and a.driver_id:
                    driver = f", driver {_first_name(C.display_name(db, C.DRIVER, str(a.driver_id)))}"
                elif a is not None:
                    driver = ", a fleet owner has accepted (driver being arranged)"
                line += f"; trip {_v(o.trip_status)}{driver}"
        lines.append(line)
    return "\n".join(lines)


# ------------------------------------------------------------------ partners (fleet owner / driver / vendor)
def partner_facts(db: Session, role: str, principal_id: str) -> str:
    from app.models.order_assignments import AssignmentStatusEnum, OrderAssignment
    from app.models.orders import Order

    lines: List[str] = [f"Role: {role}"]
    live = [AssignmentStatusEnum.PENDING, AssignmentStatusEnum.ASSIGNED, AssignmentStatusEnum.DRIVING]

    def trip_line(o, a=None) -> str:
        s = f"- Booking #{o.id}: {_route(o)}, pickup {_ist(o.start_date_time) if o.start_date_time else '?'}, trip {_v(o.trip_status)}"
        if a is not None:
            s += f", assignment {_v(a.assignment_status)}, held Rs {a.held_amount or 0}"
        return s

    try:
        if role == C.FLEET_OWNER:
            from app.models.vehicle_owner_details import VehicleOwnerDetails
            from app.models.wallet_ledger import WalletLedger
            lines.append(f"Name: {_first_name(C.display_name(db, role, principal_id))}")
            det = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == principal_id).first()
            if det is not None:
                lines.append(f"Wallet balance: Rs {det.wallet_balance}")
            ledger = (db.query(WalletLedger).filter(WalletLedger.vehicle_owner_id == principal_id)
                      .order_by(WalletLedger.created_at.desc()).limit(6).all())
            if ledger:
                lines.append("Last wallet entries (newest first):")
                for r in ledger:
                    lines.append(f"- {_ist(r.created_at)} {_v(r.entry_type)} Rs {r.amount} ({r.reference_type or ''} {r.reference_id or ''}) {(r.notes or '')[:90]}")
            q = (db.query(OrderAssignment).filter(OrderAssignment.vehicle_owner_id == principal_id,
                                                  OrderAssignment.assignment_status.in_(live))
                 .order_by(OrderAssignment.created_at.desc()).limit(4).all())
        elif role == C.DRIVER:
            lines.append(f"Name: {_first_name(C.display_name(db, role, principal_id))}")
            lines.append("Wallet figures are not shown to drivers in chat (see the Wallet screen).")
            q = (db.query(OrderAssignment).filter(OrderAssignment.driver_id == principal_id,
                                                  OrderAssignment.assignment_status.in_(live))
                 .order_by(OrderAssignment.created_at.desc()).limit(4).all())
        elif role == C.VENDOR:
            lines.append("Vendor account (posts bookings for drivers to take).")
            posted = (db.query(Order).filter(Order.vendor_id == principal_id).order_by(Order.created_at.desc()).limit(5).all())
            lines.append("Recent bookings posted:" if posted else "No bookings posted yet.")
            lines.extend(trip_line(o) for o in posted)
            return "\n".join(lines)
        else:
            return "Role: unknown"
        if q:
            lines.append("Current / upcoming trips:")
            for a in q:
                o = db.query(Order).filter(Order.id == a.order_id).first()
                if o is not None:
                    lines.append(trip_line(o, a))
        else:
            lines.append("No current or upcoming trips.")
    except Exception as e:  # noqa: BLE001
        db.rollback()
        logger.warning("chat bot partner facts failed: %s", type(e).__name__)
    return "\n".join(lines)


# ------------------------------------------------------------------ booking group (dispatch assistant)
def booking_group_facts(db: Session, order) -> str:
    """Logistics of ONE booking, safe for every party in its chat: no phone numbers, no OTPs, no money."""
    from app.crud import booking_chat as legacy
    from app.crud.order_assignments import customer_number_notice

    a = legacy.active_assignment(db, order.id)
    lines = [
        f"Booking #{order.id}", f"Route: {_route(order)}",
        f"Pickup: {_ist(order.start_date_time) if order.start_date_time else '?'}", f"Trip status: {_v(order.trip_status)}",
        f"Car type: {_v(order.car_type)}",
    ]
    if order.customer_name:
        lines.append(f"Customer: {_first_name(order.customer_name)}")
    if a is None:
        lines.append("Assignment: no driver / car assigned yet")
    else:
        lines.append(f"Assignment: {_v(a.assignment_status)}")
        if a.driver_id:
            lines.append(f"Driver: {_first_name(C.display_name(db, C.DRIVER, str(a.driver_id)))}")
        if getattr(a, "expires_at", None):
            lines.append(f"Assign driver before: {_ist(a.expires_at)}")
    try:
        notice = customer_number_notice(db, order, a)
        if notice:
            lines.append(f"Customer phone number: hidden until it opens. {notice}")
    except Exception:  # noqa: BLE001
        db.rollback()
    lines.append("Phone numbers and OTPs are never shared in this chat.")
    return "\n".join(lines)
