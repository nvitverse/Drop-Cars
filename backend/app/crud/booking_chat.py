"""Booking chat: default questions for the driver side, auto-suggested replies for the poster side (built from that
booking's own data), notifications and the 10-day purge."""
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from sqlalchemy.orm import Session

from app.models.booking_chat import BookingChatMessage
from app.models.orders import Order
from app.models.new_orders import NewOrder
from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum

CHAT_RETENTION_DAYS = 10

# Driver-side default questions ("quick menu"), keyed. The menu shown depends on how far the booking has got.
DRIVER_QUESTIONS: Dict[str, str] = {
    "PICKUP_LOCATION": "📍 Please share the pickup location",
    "CUSTOMER_NUMBER": "📞 Please send me the customer number",
    "TARIFF": "💰 Please send the tariff details",
    "CASH_COLLECTION": "💵 How much cash should I collect from the customer?",
    "PICKUP_TIME": "🕐 Please confirm the pickup date and time",
    "DROP_DETAILS": "🗺️ Please confirm the drop / route details",
    "READY": "✅ I am ready for the trip",
    "REACHED_PICKUP": "📍 I have reached the pickup point",
    "CUSTOMER_UNREACHABLE": "⚠️ The customer is not reachable - please help",
    "EXTRA_STOP": "➕ Customer wants an extra stop - what should I charge?",
    "TOLL_PARKING": "🅿️ Toll / parking - can I collect it from the customer?",
}
_MENU_BEFORE_TRIP = ["PICKUP_LOCATION", "CUSTOMER_NUMBER", "TARIFF", "CASH_COLLECTION", "PICKUP_TIME", "DROP_DETAILS", "READY"]
_MENU_ON_TRIP = ["REACHED_PICKUP", "CUSTOMER_UNREACHABLE", "CASH_COLLECTION", "EXTRA_STOP", "TOLL_PARKING", "DROP_DETAILS"]


def _v(x):
    return x.value if hasattr(x, "value") else x


def _cities(order: Order) -> tuple:
    loc = order.pickup_drop_location if isinstance(order.pickup_drop_location, dict) else {}
    try:
        keys = sorted(loc.keys(), key=lambda k: int(k))
    except Exception:
        keys = list(loc.keys())
    pickup = str(loc.get(keys[0], "")) if keys else ""
    drop = ""
    if len(keys) > 1:
        drop = str(loc.get(keys[-1], ""))
        if len(keys) > 2 and drop == pickup:
            drop = str(loc.get(keys[-2], ""))
    return pickup, drop


def booking_title(order: Order) -> str:
    p, d = _cities(order)
    return f"{p} → {d}" if d else p


def active_assignment(db: Session, order_id: int) -> Optional[OrderAssignment]:
    return (
        db.query(OrderAssignment)
        .filter(OrderAssignment.order_id == order_id, OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED)
        .order_by(OrderAssignment.created_at.desc())
        .first()
    )


def driver_menu(assignment_status: Optional[str]) -> List[dict]:
    st = str(assignment_status or "").upper()
    if st == "COMPLETED":
        return []
    keys = _MENU_ON_TRIP if st == "DRIVING" else _MENU_BEFORE_TRIP
    return [{"key": k, "label": DRIVER_QUESTIONS[k]} for k in keys]


def _fmt_dt(dt) -> str:
    try:
        return dt.strftime("%d %b %Y, %I:%M %p")
    except Exception:
        return str(dt or "")


def poster_suggestions(db: Session, order: Order, unanswered_keys: List[str]) -> List[dict]:
    """One-tap replies for the poster, filled from this booking's data. Only for what the driver actually asked."""
    from app.crud.order_assignments import collect_fields_for_order
    from app.utils.commission import estimate_split_for_order

    new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first() if _v(order.source) == "NEW_ORDERS" else None
    pickup, drop = _cities(order)
    links = (getattr(order, "location_links", None) or {}) if isinstance(getattr(order, "location_links", None), dict) else {}
    pickup_link = links.get("0") or ""
    out: List[dict] = []

    def add(key, label, text):
        out.append({"key": key, "label": label, "text": text})

    for k in unanswered_keys:
        if k == "PICKUP_LOCATION":
            txt = f"📍 Pickup: {pickup}."
            if pickup_link:
                txt += f" Map: {pickup_link}"
            if new_order and new_order.pickup_notes and new_order.pickup_notes not in ("NILL", "null"):
                txt += f" Note: {new_order.pickup_notes}"
            add(k, "Send pickup location", txt)
        elif k == "CUSTOMER_NUMBER":
            add(k, "Send customer number", f"📞 Customer: {order.customer_name or 'Customer'} - {order.customer_number}")
        elif k == "TARIFF":
            parts = []
            if new_order:
                if new_order.cost_per_km:
                    parts.append(f"₹{new_order.cost_per_km}/km")
                if new_order.driver_allowance:
                    parts.append(f"driver bata ₹{new_order.driver_allowance}")
                if new_order.permit_charges:
                    parts.append(f"permit ₹{new_order.permit_charges}")
                if new_order.toll_charges:
                    parts.append(f"toll ₹{new_order.toll_charges}")
            try:
                net = estimate_split_for_order(db, order)["driver_net"]
                earn = f" You will earn about ₹{net} for this trip after fees."
            except Exception:
                earn = ""
            add(k, "Send tariff details", "💰 Tariff: " + (", ".join(parts) if parts else f"₹{order.estimated_price}") + f" ({order.trip_distance or ''} km)." + earn + " Toll, parking and other excluded items are paid extra by the customer.")
        elif k == "CASH_COLLECTION":
            c = collect_fields_for_order(db, order)
            add(k, "Send cash to collect",
                f"💵 Collect ₹{c['collect_from_customer']} from the customer" +
                (f" (trip total ₹{c['customer_total']}, ₹{c['advance_received']} advance already paid)." if c["advance_received"] else f" (trip total ₹{c['customer_total']})."))
        elif k == "PICKUP_TIME":
            add(k, "Confirm pickup time", f"🕐 Pickup is on {_fmt_dt(order.start_date_time)} at {pickup}.")
        elif k == "DROP_DETAILS":
            add(k, "Send route details", f"🗺️ Route: {booking_title(order)} ({order.trip_distance or ''} km, {_v(order.trip_type)}).")
        elif k in ("READY", "REACHED_PICKUP"):
            add(k, "👍 Okay", "👍 Okay, noted.")
        elif k == "CUSTOMER_UNREACHABLE":
            add(k, "I'll call the customer", "⏳ I'll try to reach the customer and tell you shortly.")
        elif k == "EXTRA_STOP":
            add(k, "Extra stop - charge extra", "➕ Extra stop is allowed - please collect the extra charge from the customer for the additional distance/time.")
        elif k == "TOLL_PARKING":
            add(k, "Collect toll/parking", "🅿️ Yes, collect toll and parking from the customer on actuals and enter them when you close the trip.")
    add("GENERIC_OK", "👍 Okay", "👍 Okay")
    add("GENERIC_WAIT", "⏳ Please wait", "⏳ Please wait, I will confirm shortly.")
    add("GENERIC_CALL", "📞 Call me", "📞 Please call me.")
    # de-dup by key
    seen, uniq = set(), []
    for s in out:
        if s["key"] in seen:
            continue
        seen.add(s["key"])
        uniq.append(s)
    return uniq


def unanswered_driver_questions(messages: List[BookingChatMessage]) -> List[str]:
    """Driver quick-questions with no POSTER message after them yet."""
    keys: List[str] = []
    for m in messages:
        if m.sender_side == "POSTER":
            keys = []
        elif m.sender_side == "DRIVER" and m.quick_key in DRIVER_QUESTIONS and m.quick_key not in keys:
            keys.append(m.quick_key)
    return keys


def purge_old_chat_messages(db: Session) -> int:
    """Delete chat older than CHAT_RETENTION_DAYS (called from the periodic sweep)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=CHAT_RETENTION_DAYS)
    n = db.query(BookingChatMessage).filter(BookingChatMessage.created_at < cutoff).delete(synchronize_session=False)
    db.commit()
    return int(n or 0)


def notify_other_side(db: Session, order: Order, sender_side: str, text: str, assignment: Optional[OrderAssignment]) -> None:
    """Best-effort push to whoever should read the new message."""
    try:
        from app.models.notification import Notification
        from app.crud.notification import _enqueue_expo_push, _is_muted

        subs: List[str] = []
        if sender_side == "POSTER":
            if assignment is not None:
                subs.append(str(assignment.vehicle_owner_id))
                if assignment.driver_id:
                    subs.append(str(assignment.driver_id))
        else:
            if order.vendor_id:
                subs.append(str(order.vendor_id))
            elif order.posted_by_vehicle_owner_id:
                subs.append(str(order.posted_by_vehicle_owner_id))
        if not subs:
            return
        rows = db.query(Notification).filter(Notification.sub.in_(subs)).all()
        tokens = [r.token for r in rows if r.token and not _is_muted(r)]
        if not tokens:
            return
        title = f"💬 Booking #{order.id} • {booking_title(order)}"
        payloads = [{
            "to": t, "title": title, "body": text[:140], "priority": "high",
            "data": {"type": "chat", "chat_order_id": order.id},
        } for t in tokens]
        _enqueue_expo_push(db, payloads)
    except Exception as e:
        print(f"chat notify failed (message still saved): {e}")
