"""Unaccepted Bookings Desk: the staff rescue flow for a posted booking nobody has accepted.

ALARM CADENCE (owner rule 2026-10-10, every number editable in Admin > settings, nothing hard-coded):
  1st alarm   an advance booking: 2 hours before pickup. A booking posted inside the last 4 hours: when half of the time between posting
              and pickup has passed.
  next ones   once an alarm has been seen (or snoozed), the next one rings after HALF of the time that is left until pickup - 3 h left ->
              1 h 30 min later, then 45 min, 22 min ... so it keeps coming without becoming a nuisance. Never closer than the minimum gap
              (10 min), no more automatic alarms in the last 10 min (the case stays red on the desk), at most 8 alarms.
  snooze      15 / 30 / 60 min (never past pickup - 10 min). After the snooze the alarm rings again.
WHAT STAFF CAN DO: share the booking to a driver group, hand it to a vendor / fleet (manual allocation), mark it as executed elsewhere (who, where,
driver, cab, commission due), or cancel it (the customer gets a detailed e-mail with the refund position)."""
import logging
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.unaccepted_case import UnacceptedCase

logger = logging.getLogger(__name__)

ACTIVE = ("OPEN", "SHARED")
DEFAULTS = {
    "unaccepted_alarm_minutes_before": "120", "unaccepted_short_notice_hours": "4", "unaccepted_short_notice_percent": "50",
    "unaccepted_repeat_percent": "50", "unaccepted_min_gap_minutes": "10", "unaccepted_stop_minutes_before": "10", "unaccepted_max_alarms": "8",
    "unaccepted_snooze_options": "15,30,60", "unaccepted_follow_up_hours": "2",
}


def _utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def get_cfg(db: Session) -> Dict[str, float]:
    from app.crud.customer_booking_request import get_platform_setting_value as gv
    out: Dict[str, Any] = {}
    for k, d in DEFAULTS.items():
        try:
            raw = gv(db, k, d)
        except Exception:
            raw = d
        out[k] = raw
    num = lambda k: float(out[k]) if str(out[k]).replace(".", "", 1).isdigit() else float(DEFAULTS[k])    # noqa: E731
    return {
        "before_min": num("unaccepted_alarm_minutes_before"), "short_hours": num("unaccepted_short_notice_hours"), "short_pct": num("unaccepted_short_notice_percent"),
        "repeat_pct": num("unaccepted_repeat_percent"), "min_gap": num("unaccepted_min_gap_minutes"), "stop_min": num("unaccepted_stop_minutes_before"),
        "max_alarms": int(num("unaccepted_max_alarms")), "follow_up_hours": num("unaccepted_follow_up_hours"),
        "snooze_options": [int(x) for x in str(out["unaccepted_snooze_options"]).split(",") if x.strip().isdigit()] or [15, 30, 60],
    }


# ---------------------------------------------------------------- the cadence (pure functions)
def first_alarm_at(posted: datetime, pickup: datetime, c: Dict[str, Any]) -> datetime:
    total_min = (pickup - posted).total_seconds() / 60.0
    if total_min <= c["short_hours"] * 60:
        return posted + timedelta(minutes=total_min * c["short_pct"] / 100.0)
    return pickup - timedelta(minutes=c["before_min"])


def next_alarm_after(at: datetime, pickup: datetime, c: Dict[str, Any]) -> Optional[datetime]:
    """The next alarm after one that rang / was seen at `at`: half of the time left, but not sooner than the minimum gap and not inside the
    last few minutes before pickup (None = no more automatic alarms)."""
    left_min = (pickup - at).total_seconds() / 60.0
    gap = max(left_min * c["repeat_pct"] / 100.0, c["min_gap"])
    nxt = at + timedelta(minutes=gap)
    if (pickup - nxt).total_seconds() / 60.0 < c["stop_min"]:
        return None
    return nxt


def is_due(case: UnacceptedCase, now: datetime, c: Dict[str, Any]) -> bool:
    if case.status not in ACTIVE or case.next_alarm_at is None or case.alarms_fired >= c["max_alarms"]:
        return False
    if case.snoozed_until is not None and now < _utc(case.snoozed_until):
        return False
    return now >= _utc(case.next_alarm_at)


def _log(case: UnacceptedCase, who: str, action: str, detail: str = "") -> None:
    h = list(case.history or [])
    h.append({"at": datetime.now(timezone.utc).isoformat(), "by": who, "action": action, "detail": detail})
    case.history = h[-80:]


# ---------------------------------------------------------------- cases
def _order(db: Session, order_id: int):
    from app.models.orders import Order
    o = db.query(Order).filter(Order.id == order_id).first()
    if o is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return o


def get_or_create_case(db: Session, order, c: Optional[Dict[str, Any]] = None) -> UnacceptedCase:
    case = db.query(UnacceptedCase).filter(UnacceptedCase.order_id == order.id).first()
    c = c or get_cfg(db)
    if case is None:
        case = UnacceptedCase(order_id=order.id, status="OPEN", history=[])
        db.add(case)
        db.flush()
    if case.next_alarm_at is None and case.alarms_fired == 0 and order.created_at is not None and order.start_date_time is not None:
        case.next_alarm_at = first_alarm_at(_utc(order.created_at), _utc(order.start_date_time), c)
    return case


def _has_taker(db: Session, order_id: int) -> bool:
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    return db.query(OrderAssignment).filter(OrderAssignment.order_id == order_id, OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED).first() is not None


def open_orders(db: Session, now: datetime, horizon_days: int = 3, limit: int = 80):
    """Posted bookings nobody has accepted that have not started yet."""
    from sqlalchemy import exists
    from app.models.orders import Order, Trip_status
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    taker = exists().where(OrderAssignment.order_id == Order.id, OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED)
    return (db.query(Order).filter(Order.trip_status == Trip_status.PENDING, Order.cancelled_by.is_(None), Order.start_date_time > now,
                                   Order.start_date_time <= now + timedelta(days=horizon_days), ~taker)
            .order_by(Order.start_date_time.asc()).limit(limit).all())


def _route(order) -> str:
    try:
        from app.crud.new_orders import _origin_and_destination_from_index_map
        o, d = _origin_and_destination_from_index_map(order.pickup_drop_location or {})
        return f"{o} → {d}"
    except Exception:
        return ""


def case_view(case: UnacceptedCase, order, now: datetime, c: Dict[str, Any]) -> Dict[str, Any]:
    pickup = _utc(order.start_date_time)
    mins = int((pickup - now).total_seconds() // 60) if pickup else None
    snoozed = case.snoozed_until is not None and now < _utc(case.snoozed_until)
    return {
        "order_id": order.id, "status": case.status, "route": _route(order), "customer_name": order.customer_name, "customer_number": order.customer_number,
        "car_type": getattr(order.car_type, "value", order.car_type), "trip_type": getattr(order.trip_type, "value", order.trip_type),
        "source": getattr(order.source, "value", order.source), "start_date_time": pickup.isoformat() if pickup else None, "mins_to_pickup": mins,
        "posted_at": _utc(order.created_at).isoformat() if order.created_at else None, "vendor_price": order.vendor_price, "advance_received": getattr(order, "advance_received", None),
        "alarms_fired": case.alarms_fired, "alarm_due": is_due(case, now, c), "next_alarm_at": _utc(case.next_alarm_at).isoformat() if case.next_alarm_at else None,
        "snoozed_until": _utc(case.snoozed_until).isoformat() if snoozed else None, "snooze_count": case.snooze_count,
        "critical": mins is not None and mins <= c["stop_min"] + 20, "shared_count": case.shared_count, "last_shared_by": case.last_shared_by,
        "exec": {"platform": case.exec_platform, "by": case.exec_by, "driver_name": case.exec_driver_name, "driver_phone": case.exec_driver_phone,
                 "vehicle_number": case.exec_vehicle_number, "note": case.exec_note, "commission_due": case.commission_due, "commission_received": bool(case.commission_received),
                 "follow_up_at": _utc(case.follow_up_at).isoformat() if case.follow_up_at else None, "follow_up_done": bool(case.follow_up_done)},
        "cancel_reason": case.cancel_reason, "customer_emailed": bool(case.customer_emailed), "handled_by": case.handled_by, "history": case.history or [],
    }


def desk(db: Session) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    c = get_cfg(db)
    rows = []
    for o in open_orders(db, now):
        case = get_or_create_case(db, o, c)
        if case.status in ACTIVE:
            rows.append(case_view(case, o, now, c))
    # handled recently (executed elsewhere with a follow-up due, commission not received) stay visible until closed
    from app.models.orders import Order
    for case in db.query(UnacceptedCase).filter(UnacceptedCase.status == "EXECUTED_ELSEWHERE").order_by(UnacceptedCase.updated_at.desc()).limit(40).all():
        if case.follow_up_done and (case.commission_received or not case.commission_due):
            continue
        o = db.query(Order).filter(Order.id == case.order_id).first()
        if o is not None:
            rows.append(case_view(case, o, now, c))
    db.commit()
    return {"cases": rows, "snooze_options": c["snooze_options"], "now": now.isoformat()}


def seen(db: Session, order_id: int, who: str) -> UnacceptedCase:
    """An alarm was acknowledged (or rang for its time): count it and schedule the next one at half of the time that is left."""
    now = datetime.now(timezone.utc)
    c = get_cfg(db)
    o = _order(db, order_id)
    case = get_or_create_case(db, o, c)
    case.alarms_fired += 1
    case.last_alarm_at = now
    case.snoozed_until = None
    case.next_alarm_at = next_alarm_after(now, _utc(o.start_date_time), c)
    _log(case, who, "ALARM_SEEN", f"#{case.alarms_fired}, next {case.next_alarm_at.isoformat() if case.next_alarm_at else 'none'}")
    db.commit()
    return case


def snooze(db: Session, order_id: int, minutes: int, who: str) -> UnacceptedCase:
    now = datetime.now(timezone.utc)
    c = get_cfg(db)
    o = _order(db, order_id)
    case = get_or_create_case(db, o, c)
    if minutes not in c["snooze_options"]:
        raise HTTPException(status_code=422, detail="Choose one of the snooze times: " + ", ".join(str(x) for x in c["snooze_options"]) + " minutes")
    latest = _utc(o.start_date_time) - timedelta(minutes=c["stop_min"])
    until = min(now + timedelta(minutes=minutes), latest)
    if until <= now:
        raise HTTPException(status_code=409, detail="Pickup is too close to snooze - act on this booking now")
    case.snoozed_until = until
    case.next_alarm_at = until
    case.snooze_count += 1
    _log(case, who, "SNOOZED", f"{minutes} min -> {until.isoformat()}")
    db.commit()
    return case


# ---------------------------------------------------------------- share to a group
def _tariff_source(db: Optional[Session], order):
    """The itemised tariff lives on the underlying NewOrder (km rate, bata, permit ...); fall back to the order itself."""
    try:
        if db is not None and str(getattr(order.source, "value", order.source)) == "NEW_ORDERS":
            from app.models.new_orders import NewOrder
            no = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
            if no is not None:
                return no
    except Exception:       # noqa: BLE001
        pass
    return order


def group_message(order, brand: str = "DROP CARS", db: Optional[Session] = None) -> str:
    """The text staff paste into a driver / vendor group. Booking and driver tariff details; the customer's number stays hidden."""
    def n(v):
        return int(v or 0)
    t = _tariff_source(db, order)
    pickup = _utc(order.start_date_time)
    ist = pickup.astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%a %d %b %Y, %I:%M %p") if pickup else "-"
    car = str(getattr(order.car_type, "value", order.car_type) or "").replace("_", " ").title()
    ttype = str(getattr(order.trip_type, "value", order.trip_type) or "")
    lines = [f"\U0001F696 *{brand} - TRIP AVAILABLE* \U0001F696", f"\U0001F4CC *Booking #{order.id}*", "", f"\U0001F4CD *Route:* {_route(order) or '-'}",
             f"\U0001F4C5 *Pickup:* {ist}", f"\U0001F697 *Vehicle:* {car}", f"\U0001F4BC *Trip type:* {ttype}"]
    if order.trip_distance:
        lines.append(f"\U0001F6E3️ *Distance:* ~{n(order.trip_distance)} km")
    lines += ["", "\U0001F4B0 *Driver tariff*"]
    if n(getattr(t, "cost_per_km", 0)):
        lines.append(f"• Rate: ₹{n(t.cost_per_km)} per km" + (f" (+ ₹{n(t.extra_cost_per_km)} extra)" if n(getattr(t, "extra_cost_per_km", 0)) else ""))
    if n(getattr(t, "driver_allowance", 0)):
        lines.append(f"• Driver bata: ₹{n(t.driver_allowance)}" + (f" (+ ₹{n(t.extra_driver_allowance)} extra)" if n(getattr(t, "extra_driver_allowance", 0)) else ""))
    if n(getattr(t, "permit_charges", 0)):
        lines.append(f"• Permit: ₹{n(t.permit_charges)}")
    if n(getattr(t, "hill_charges", 0)):
        lines.append(f"• Hill charges: ₹{n(t.hill_charges)}")
    if n(getattr(t, "toll_charges", 0)):
        lines.append(f"• Toll: ₹{n(t.toll_charges)}")
    if n(order.estimated_price):
        lines.append(f"• *Estimated trip earning: ₹{n(order.estimated_price):,}*")
    lines += ["", "✅ Accept in the *Drop Cars Driver App* (the customer's number is shown after you accept).",
              "Driver App: https://play.google.com/store/apps/details?id=com.dropcars.driverapp", "", "\U0001F4DE Helpline: +91 7200217986"]
    return "\n".join(lines)


def share(db: Session, order_id: int, who: str) -> Dict[str, Any]:
    o = _order(db, order_id)
    case = get_or_create_case(db, o)
    if case.status not in ACTIVE:
        raise HTTPException(status_code=409, detail=f"This booking is already {case.status.replace('_', ' ').lower()}")
    msg = group_message(o, db=db)
    case.status = "SHARED"
    case.shared_count += 1
    case.last_shared_at = datetime.now(timezone.utc)
    case.last_shared_by = who
    _log(case, who, "SHARED", "group message built")
    db.commit()
    return {"message": msg, "whatsapp_url": "https://wa.me/?text=" + urllib.parse.quote(msg), "shared_count": case.shared_count}


# ---------------------------------------------------------------- executed elsewhere
def suggest_commission(price: Optional[int]) -> int:
    """Commission model v2: 10% with a minimum of Rs 200 (staff can change the figure)."""
    return max(200, int(round((price or 0) * 0.10)))


def executed_elsewhere(db: Session, order_id: int, who: str, platform: str, by: str, driver_name: str, driver_phone: str, vehicle_number: str,
                       note: str, commission_due: Optional[int]) -> UnacceptedCase:
    c = get_cfg(db)
    o = _order(db, order_id)
    if not (platform or "").strip():
        raise HTTPException(status_code=422, detail="Say where it is being executed (another fleet's app, a vendor, another platform ...)")
    case = get_or_create_case(db, o, c)
    if case.status in ("CANCELLED", "RESOLVED"):
        raise HTTPException(status_code=409, detail=f"This booking is already {case.status.lower()}")
    case.status = "EXECUTED_ELSEWHERE"
    case.exec_platform, case.exec_by = platform.strip(), (by or "").strip() or None
    case.exec_driver_name, case.exec_driver_phone = (driver_name or "").strip() or None, (driver_phone or "").strip() or None
    case.exec_vehicle_number = (vehicle_number or "").strip().upper() or None
    case.exec_note = (note or "").strip() or None
    case.commission_due = commission_due if commission_due is not None else suggest_commission(o.vendor_price)
    case.handled_by = who
    end = _utc(o.end_date_time) if getattr(o, "end_date_time", None) else _utc(o.start_date_time) + timedelta(hours=6)
    case.follow_up_at = end + timedelta(hours=c["follow_up_hours"])
    case.follow_up_done = False
    _log(case, who, "EXECUTED_ELSEWHERE", f"{case.exec_platform} / {case.exec_by or '-'} / {case.exec_driver_name or '-'} / commission {case.commission_due}")
    db.commit()
    try:                                    # the customer's booking page / e-mail follow the manual details
        if case.exec_driver_name:
            from app.utils.website_status_webhook import notify_website_of_status
            notify_website_of_status(db, o.id, "ASSIGNED", driver_name=case.exec_driver_name, driver_phone=case.exec_driver_phone, vehicle_number=case.exec_vehicle_number)
    except Exception as e:                  # noqa: BLE001
        logger.warning("website status update failed for %s: %s", o.id, e)
    return case


def mark_commission(db: Session, order_id: int, received: bool, who: str) -> UnacceptedCase:
    case = db.query(UnacceptedCase).filter(UnacceptedCase.order_id == order_id).first()
    if case is None:
        raise HTTPException(status_code=404, detail="No desk entry for this booking")
    case.commission_received = bool(received)
    _log(case, who, "COMMISSION_RECEIVED" if received else "COMMISSION_NOT_RECEIVED", str(case.commission_due or 0))
    db.commit()
    return case


def close_follow_up(db: Session, order_id: int, outcome: str, who: str) -> UnacceptedCase:
    case = db.query(UnacceptedCase).filter(UnacceptedCase.order_id == order_id).first()
    if case is None:
        raise HTTPException(status_code=404, detail="No desk entry for this booking")
    case.follow_up_done = True
    _log(case, who, "FOLLOW_UP_DONE", (outcome or "").strip()[:300])
    db.commit()
    return case


# ---------------------------------------------------------------- cancel + the customer's e-mail
def cancel_email(order, customer_name: str, advance_paid: int, reason: Optional[str]) -> Dict[str, str]:
    """The e-mail a customer gets when we cannot give a vehicle: warm and specific - the booking, the real reason in plain words, exactly what
    happens to the advance, a way back to us, and how to rebook. No blame, no scare."""
    pickup = _utc(order.start_date_time)
    ist = pickup.astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%A, %d %B %Y at %I:%M %p") if pickup else "-"
    car = str(getattr(order.car_type, "value", order.car_type) or "").replace("_", " ").title()
    route = _route(order)
    why = (reason or "").strip() or "a vehicle could not be arranged for your pickup time"
    if advance_paid and advance_paid > 0:
        refund = (f"You had paid an advance of Rs {int(advance_paid):,}. The full amount will be refunded to the account you paid from within 7 working days. "
                  f"You do not need to do anything; if it has not reached you by then, just reply to this e-mail with the booking number and we will chase it the same day.")
        refund_html = (f"<p style='margin:0 0 6px'><b>Advance paid: Rs {int(advance_paid):,}</b></p><p style='margin:0'>The full amount will be refunded to the account you paid "
                       f"from <b>within 7 working days</b>. You do not need to do anything. If it has not reached you by then, reply to this e-mail with the booking number and "
                       f"we will chase it the same day.</p>")
    else:
        refund = "Advance paid: Rs 0. You had not paid anything, so there is nothing to refund and no charge of any kind applies."
        refund_html = "<p style='margin:0 0 6px'><b>Advance paid: Rs 0</b></p><p style='margin:0'>You had not paid anything, so there is nothing to refund and no charge of any kind applies.</p>"
    subject = f"Update on your Drop Cars booking #{order.id} - we are sorry we could not take you"
    text = "\n".join([
        f"Dear {customer_name or 'Customer'},", "",
        "Thank you for choosing Drop Cars. We are truly sorry - we were not able to arrange a vehicle for the trip below, so this booking has been cancelled.", "",
        f"Booking: #{order.id}", f"Route: {route or '-'}", f"Pickup: {ist}", f"Vehicle: {car}", f"Reason: {why[:1].upper() + why[1:]}", "",
        "ABOUT YOUR PAYMENT", refund, "",
        "WE WOULD LIKE TO MAKE IT UP TO YOU", "- Reply to this e-mail or call / WhatsApp +91 7200217986 and we will try to arrange another vehicle for the same trip - even at short notice.",
        "- Your trip details are saved: book again in a minute at https://dropcars.in and we will give your booking priority.",
        "- Planning a trip further ahead? Book early - confirmed vehicles are held for you.", "",
        "This was our shortfall, not yours, and we apologise for the trouble it has caused. We hope to serve you very soon.", "",
        "Warm regards,", "Drop Cars Team", "+91 7200217986  |  https://dropcars.in"])
    html = f"""<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:auto;color:#1e293b;line-height:1.55">
<div style="background:#0f2a4a;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0"><div style="font-size:20px;font-weight:700">Drop Cars</div><div style="opacity:.85;font-size:13px">Update on your booking</div></div>
<div style="border:1px solid #e2e8f0;border-top:0;padding:22px;border-radius:0 0 12px 12px">
<p>Dear {customer_name or 'Customer'},</p>
<p>Thank you for choosing Drop Cars. We are truly sorry - we were not able to arrange a vehicle for the trip below, so this booking has been <b>cancelled</b>.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:14px 0">
<tr><td style="padding:6px 0;color:#64748b;width:110px">Booking</td><td><b>#{order.id}</b></td></tr><tr><td style="padding:6px 0;color:#64748b">Route</td><td>{route or '-'}</td></tr>
<tr><td style="padding:6px 0;color:#64748b">Pickup</td><td>{ist}</td></tr><tr><td style="padding:6px 0;color:#64748b">Vehicle</td><td>{car}</td></tr>
<tr><td style="padding:6px 0;color:#64748b">Reason</td><td>{why[:1].upper() + why[1:]}</td></tr></table>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;margin:14px 0"><div style="font-weight:700;margin-bottom:6px">About your payment</div>{refund_html}</div>
<div style="font-weight:700;margin:16px 0 6px">We would like to make it up to you</div>
<ul style="margin:0;padding-left:18px"><li>Reply to this e-mail or call / WhatsApp <b>+91 7200217986</b> - we will try to arrange another vehicle for the same trip, even at short notice.</li>
<li>Your trip details are saved: <a href="https://dropcars.in">book again in a minute</a> and we will give your booking priority.</li>
<li>Planning ahead? Book early - confirmed vehicles are held for you.</li></ul>
<p style="margin-top:16px">This was our shortfall, not yours, and we apologise for the trouble. We hope to serve you very soon.</p>
<p>Warm regards,<br><b>Drop Cars Team</b><br><span style="color:#64748b">+91 7200217986 &middot; dropcars.in</span></p></div></div>"""
    return {"subject": subject, "text": text, "html": html}


def customer_target(db: Session, order):
    """(customer name, e-mail, advance paid) for a booking - website bookings keep the e-mail on the request."""
    from app.utils.website_status_webhook import _find_website_booking_request
    req = _find_website_booking_request(db, order.id)
    email = getattr(req, "customer_email", None) if req is not None else None
    advance = int(getattr(order, "advance_received", 0) or 0)
    if not advance and req is not None and getattr(req, "is_paid", False):
        advance = int(getattr(req, "advance_amount", 0) or 0)
    return (order.customer_name, email, advance)


def email_customer_cancelled(db: Session, order, reason: Optional[str]) -> Dict[str, Any]:
    """Sends the cancellation e-mail when we have an address and mail is set up. Never raises (the cancel itself must always succeed)."""
    try:
        name, email, advance = customer_target(db, order)
        if not email:
            return {"sent": False, "why": "no e-mail address for this customer"}
        from app.utils.emailer import send_email, smtp_configured
        if not smtp_configured(db):
            return {"sent": False, "why": "e-mail is not set up"}
        mail = cancel_email(order, name, advance, reason)
        send_email(db, email, mail["subject"], mail["text"], mail["html"])
        return {"sent": True, "to": email, "advance": advance}
    except Exception as e:      # noqa: BLE001
        logger.warning("cancel e-mail failed for %s: %s", getattr(order, "id", "?"), e)
        return {"sent": False, "why": str(e)[:160]}


def cancel(db: Session, order_id: int, reason: str, who: str, send_email_to_customer: bool = True) -> Dict[str, Any]:
    """Mark the booking cancelled (same engine as the Cancel button on a booking card) and tell the customer."""
    from app.crud.order_assignments import cancel_order_by_admin
    o = _order(db, order_id)
    try:
        result = cancel_order_by_admin(db, order_id, reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.refresh(o)
    case = get_or_create_case(db, o)
    case.status = "CANCELLED"
    case.cancel_reason = (reason or "").strip()[:300] or None
    case.handled_by = who
    mail = email_customer_cancelled(db, o, reason) if send_email_to_customer else {"sent": False, "why": "skipped by staff"}
    case.customer_emailed = bool(mail.get("sent"))
    case.customer_email_to = mail.get("to")
    _log(case, who, "CANCELLED", f"{case.cancel_reason or ''} | e-mail: {'sent to ' + str(mail.get('to')) if mail.get('sent') else mail.get('why')}")
    db.commit()
    try:
        from app.utils.website_status_webhook import notify_website_of_status
        notify_website_of_status(db, o.id, "CANCELLED")
    except Exception as e:      # noqa: BLE001
        logger.warning("website status update failed for %s: %s", o.id, e)
    return {"cancel": result, "email": mail}


def resolve_accepted(db: Session) -> int:
    """Housekeeping: a booking that was finally accepted leaves the desk."""
    n = 0
    for case in db.query(UnacceptedCase).filter(UnacceptedCase.status.in_(ACTIVE)).all():
        if _has_taker(db, case.order_id):
            case.status = "RESOLVED"
            _log(case, "system", "ACCEPTED", "a driver accepted it")
            n += 1
    if n:
        db.commit()
    return n


async def push_due_alarms(db: Session) -> int:
    """Called by the minute sweep: when a case's alarm is due, send the staff a push notification ONCE for that alarm number (so staff who are
    not looking at the app still hear about it). The in-app ringing comes from the alarm list the Admin App polls."""
    now = datetime.now(timezone.utc)
    c = get_cfg(db)
    resolve_accepted(db)
    sent = 0
    for o in open_orders(db, now):
        case = get_or_create_case(db, o, c)
        if not is_due(case, now, c) or case.notified_alarm_no >= case.alarms_fired + 1:
            continue
        case.notified_alarm_no = case.alarms_fired + 1
        db.commit()
        mins = int((_utc(o.start_date_time) - now).total_seconds() // 60)
        try:
            from app.crud.notification import send_push_notification_to_admin
            await send_push_notification_to_admin(
                db, f"Booking #{o.id} - nobody has accepted it" + (f" (reminder {case.alarms_fired + 1})" if case.alarms_fired else ""),
                f"{_route(o) or 'Trip'} - pickup in {mins} min. Open the Unaccepted desk: snooze, share to a group, hand to a vendor, or cancel.")
            sent += 1
        except Exception as e:      # noqa: BLE001
            logger.warning("desk push failed for %s: %s", o.id, e)
    db.commit()
    return sent
