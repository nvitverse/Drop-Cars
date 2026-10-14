"""Trip exceptions - things that go wrong between "driver accepted" and "trip closed" that a person must decide, never a timer.

Owner rules (2026-10-14, after a trip was closed automatically with the driver's money still held):
  * A booking is NEVER closed by itself. If a trip is not started after its pickup time the office gets ONE alert and chooses:
    close it by hand (admin_trip_close), cancel it with a refund, or mark the customer as a no-show.
  * A driver whose customer cancelled or never turned up asks for a no-show; only the office, or the vendor who posted the booking,
    can confirm it. The request is recorded either way.
  * A booking that comes back to the pool after its driver was penalised waits for the office to approve it - or for a set time
    (setting repost_approval_minutes) - before drivers see it again.
Everything here is plain functions on the session; the routes and the minute sweep call them."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.end_records import EndRecord
from app.models.order_assignments import AssignmentStatusEnum, OrderAssignment
from app.models.orders import Order


def _int_setting(db: Session, key: str, default: int) -> int:
    from app.crud.customer_booking_request import get_platform_setting_value
    try:
        return int(float(get_platform_setting_value(db, key, str(default))))
    except (TypeError, ValueError):
        return default


def _aware(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def route_text(order) -> str:
    loc = order.pickup_drop_location if isinstance(order.pickup_drop_location, dict) else {}
    parts = [str(v) for _, v in sorted(loc.items(), key=lambda kv: str(kv[0])) if v]
    return " > ".join(parts[:2]) if parts else "trip"


def _push_vendor(db: Session, vendor_id, title: str, body: str) -> None:
    """Push to the vendor who posted a booking (best effort, never raises)."""
    try:
        from app.models.notification import Notification
        from app.crud.notification import _enqueue_expo_push, _is_muted
        rows = db.query(Notification).filter(Notification.user == "vendor", Notification.sub == str(vendor_id)).all()
        payloads = [{"to": n.token, "title": title, "body": body, "sound": "notification_tone.wav", "priority": "high"}
                    for n in rows if n.token and not _is_muted(n)]
        if payloads:
            _enqueue_expo_push(db, payloads)
    except Exception as e:      # noqa: BLE001
        print(f"vendor push failed: {e}")


def _tell_poster(db: Session, order, title: str, body: str) -> None:
    """Whoever posted the booking: the vendor, or the fleet owner / driver who used Create Booking."""
    if getattr(order, "vendor_id", None):
        _push_vendor(db, order.vendor_id, title, body)
    else:
        from app.crud.notification import notify_booking_poster
        notify_booking_poster(db, order, title, body)


async def _tell_admins(db: Session, title: str, body: str) -> None:
    try:
        from app.crud.notification import send_push_notification_to_admin
        await send_push_notification_to_admin(db, title, body)
    except Exception as e:      # noqa: BLE001
        print(f"admin push failed: {e}")


async def _tell_driver_and_owner(db: Session, order_id: int, title: str, body: str) -> None:
    try:
        from app.crud.notification import notify_order_reminder
        await notify_order_reminder(db, order_id, title, body)
    except Exception as e:      # noqa: BLE001
        print(f"driver push failed: {e}")


# ------------------------------------------------------------------ trip not started after pickup
async def alert_no_start_assignments(db: Session) -> int:
    """Driver and car assigned but the trip was never started: once `no_start_alert_after_minutes` (default 120) have passed since
    pickup, tell the office, the poster and the driver - once. Nothing is closed and no money moves."""
    minutes = _int_setting(db, "no_start_alert_after_minutes", 120)
    now = datetime.now(timezone.utc)
    rows = (
        db.query(OrderAssignment, Order)
        .join(Order, Order.id == OrderAssignment.order_id)
        .filter(
            OrderAssignment.assignment_status == AssignmentStatusEnum.ASSIGNED,
            OrderAssignment.driver_id.isnot(None),
            OrderAssignment.no_start_alerted_at.is_(None),
            Order.trip_status == "PENDING",
            Order.start_date_time.isnot(None),
        )
        .all()
    )
    done = 0
    for a, order in rows:
        try:
            pickup = _aware(order.start_date_time)
            if now < pickup + timedelta(minutes=minutes):
                continue
            if db.query(EndRecord).filter(EndRecord.order_id == order.id).first():
                continue                                    # it did start
            a.no_start_alerted_at = datetime.utcnow()
            db.commit()
            late = int((now - pickup).total_seconds() // 60)
            where = route_text(order)
            await _tell_admins(db, f"Booking #{order.id} was not started",
                               f"{where} - pickup was {late} min ago and the driver has not started the trip. Open the booking: close it by hand, mark a no-show, or cancel with refund.")
            _tell_poster(db, order, f"Booking #{order.id} not started yet",
                         f"{where} - the driver has not started the trip {late} min after pickup. Drop Cars has been told.")
            await _tell_driver_and_owner(db, order.id, f"Booking #{order.id} - trip not started",
                                         "Start the trip with the customer's code, or call support if the customer is not there. The office will decide - nothing is closed automatically.")
            done += 1
        except Exception as e:      # noqa: BLE001
            db.rollback()
            print(f"no-start alert failed for assignment {a.id}: {e}")
    return done


# ------------------------------------------------------------------ booking back in the pool after a penalty
def start_repost_hold(db: Session, order, now: Optional[datetime] = None) -> bool:
    """Hold a reposted booking back from drivers until the office approves or the wait is over. False = announce straight away
    (wait set to 0, or the pickup is too close to wait)."""
    now = now or datetime.now(timezone.utc)
    minutes = _int_setting(db, "repost_approval_minutes", 10)
    pickup = _aware(order.start_date_time)
    if minutes <= 0 or pickup is None:
        return False
    room = (pickup - now).total_seconds() / 60.0
    wait = min(float(minutes), max(0.0, room / 2.0))      # never wait longer than half the time that is left
    if wait < 1:
        return False
    order.repost_hold_until = now + timedelta(minutes=wait)
    order.repost_announced_at = None
    return True


def repost_is_held(order, now: Optional[datetime] = None) -> bool:
    hold = getattr(order, "repost_hold_until", None)
    if hold is None or getattr(order, "repost_announced_at", None) is not None:
        return False
    return _aware(hold) > (now or datetime.now(timezone.utc))


def announce_repost(db: Session, order) -> None:
    """Show the booking to drivers again with the "Available again" push. Caller commits."""
    order.repost_announced_at = datetime.now(timezone.utc)
    try:
        from app.crud.notification import send_new_booking_notification_sync
        from app.crud.orders import _new_booking_push_text
        from app.utils.timezone import format_pickup_time_ist
        tt = order.trip_type.value if hasattr(order.trip_type, "value") else str(order.trip_type)
        t, m = _new_booking_push_text(tt, order.pickup_drop_location, format_pickup_time_ist(order.start_date_time), order.car_type,
                                      order.vendor_price or order.estimated_price or 0)
        send_new_booking_notification_sync(db, f"Available again - {t.replace('🚖 ', '')}", m, ordered_city=order.pick_near_city, order_id=order.id)
    except Exception as e:      # noqa: BLE001
        print(f"Repost re-notify failed for order {order.id} (booking still back in the pool): {e}")


async def announce_due_reposts(db: Session) -> int:
    """Minute sweep: bookings whose approval wait is over go back in front of drivers."""
    now = datetime.now(timezone.utc)
    rows = db.query(Order).filter(
        Order.trip_status == "PENDING", Order.repost_hold_until.isnot(None),
        Order.repost_announced_at.is_(None), Order.repost_hold_until <= now,
    ).all()
    n = 0
    for order in rows:
        try:
            active = db.query(OrderAssignment).filter(
                OrderAssignment.order_id == order.id,
                OrderAssignment.assignment_status.notin_([AssignmentStatusEnum.CANCELLED]),
            ).first()
            if active:
                order.repost_announced_at = now              # somebody took it meanwhile (admin assign) - nothing to announce
            else:
                announce_repost(db, order)
                n += 1
            db.commit()
        except Exception as e:      # noqa: BLE001
            db.rollback()
            print(f"announce repost failed for order {order.id}: {e}")
    return n


def approve_repost(db: Session, order_id: int) -> dict:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Booking not found")
    if str(getattr(order.trip_status, "value", order.trip_status)).upper() != "PENDING":
        raise ValueError("This booking is no longer open")
    if not repost_is_held(order):
        raise ValueError("This booking is not waiting for approval")
    announce_repost(db, order)
    db.commit()
    return {"message": f"Booking #{order_id} is back in front of drivers", "order_id": order_id}


# ------------------------------------------------------------------ no-show
def _active_assignment(db: Session, order_id: int):
    return db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.assignment_status.in_([AssignmentStatusEnum.ASSIGNED, AssignmentStatusEnum.DRIVING]),
    ).order_by(desc(OrderAssignment.created_at)).first()


async def request_no_show(db: Session, order_id: int, driver_id: str, reason: str) -> dict:
    """The driver says the customer cancelled or did not turn up. Recorded and sent to the office and the poster; nothing changes
    until one of them confirms (mark_no_show)."""
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise ValueError("Please say what happened (customer cancelled, phone off, not at the pickup...)")
    a = _active_assignment(db, order_id)
    if not a or str(a.driver_id) != str(driver_id):
        raise ValueError("This booking is not assigned to you")
    if db.query(EndRecord).filter(EndRecord.order_id == order_id).first():
        raise ValueError("The trip has already started - end it in the app, or call support")
    order = db.query(Order).filter(Order.id == order_id).first()
    a.no_show_requested_at = datetime.utcnow()
    a.no_show_reason = reason[:400]
    db.commit()
    where = route_text(order)
    await _tell_admins(db, f"No-show request - booking #{order_id}", f"{where}: the driver says \"{reason[:120]}\". Confirm the no-show or call the customer.")
    _tell_poster(db, order, f"Driver reports a no-show - booking #{order_id}",
                 f"{where}: \"{reason[:120]}\". Open the booking to confirm the no-show, or contact the driver.")
    return {"message": "Sent. Drop Cars (or the person who posted the booking) will confirm. Your held amount stays safe until then.", "order_id": order_id}


async def mark_no_show(db: Session, order_id: int, by: str, vendor_id: Optional[str] = None, note: Optional[str] = None) -> dict:
    """Close a booking as a customer no-show: the booking is cancelled (customer side), the driver's held commission goes back to
    their wallet in full - they did what they were asked - and the poster's holds are released. Only before the trip starts.
    `by` is a label for the history ("Admin <name>" or the vendor's name); vendor_id restricts a vendor to their own bookings."""
    from app.models.orders import CancelledByEnum
    from app.crud.wallet import get_trip_hold, credit_wallet, release_poster_advance_hold
    from app.crud.order_assignments import release_vendor_payout_hold_for_order

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order or (vendor_id is not None and str(order.vendor_id) != str(vendor_id)):
        raise ValueError("Booking not found")
    status = str(getattr(order.trip_status, "value", order.trip_status)).upper()
    if status in ("CANCELLED", "COMPLETED") or "CANCEL" in status:
        raise ValueError(f"This booking is already {status.lower()}")
    if db.query(EndRecord).filter(EndRecord.order_id == order_id).first():
        raise ValueError("The trip has already started - close it with the real km instead of a no-show")
    a = _active_assignment(db, order_id)
    if not a:
        raise ValueError("Nobody has accepted this booking, so there is no driver to settle - use Cancel instead")

    why = (note or a.no_show_reason or "").strip()
    now = datetime.utcnow()
    order.trip_status = "CANCELLED"
    try:
        order.cancelled_by = CancelledByEnum.CANCELLED_BY_CUSTOMER
    except AttributeError:
        pass
    order.cancel_note = f"No-show - confirmed by {by}" + (f": {why}" if why else "")
    a.assignment_status = AssignmentStatusEnum.CANCELLED
    a.cancelled_at = now
    a.cancel_reason = "NO_SHOW"
    a.cancel_note = order.cancel_note
    refunded = 0
    owner_id = str(a.vehicle_owner_id)
    try:
        hold = get_trip_hold(db, order_id, owner_id)
        if hold > 0:
            credit_wallet(db, vehicle_owner_id=owner_id, amount=hold, reference_id=str(order_id), reference_type="TRIP_HOLD_REFUND",
                          notes=f"Refund: booking {order_id} - customer no-show (confirmed by {by}); your held amount is returned")
            refunded = hold
    except Exception as e:      # noqa: BLE001
        print(f"no-show hold refund failed for order {order_id}: {e}")
    release_poster_advance_hold(db, order, "customer no-show")
    release_vendor_payout_hold_for_order(db, order, f"Driver payout hold released - order {order_id} customer no-show")
    db.commit()

    where = route_text(order)
    await _tell_driver_and_owner_after_close(db, a, order_id, where, refunded, by)
    _tell_poster(db, order, f"Booking #{order_id} closed as no-show", f"{where}: confirmed by {by}.")
    try:
        from app.utils.website_status_webhook import notify_website_of_status
        notify_website_of_status(db=db, order_id=order_id, status="CANCELLED")
    except Exception as e:      # noqa: BLE001
        print(f"website status after no-show failed: {e}")
    return {"message": f"Booking #{order_id} closed as a customer no-show. ₹{refunded} held amount returned to the driver's wallet.", "order_id": order_id, "refunded": refunded}


async def _tell_driver_and_owner_after_close(db: Session, a, order_id: int, where: str, refunded: int, by: str) -> None:
    """The assignment is already CANCELLED, so notify_order_reminder (active assignments only) cannot be used."""
    try:
        from app.models.notification import Notification
        from app.crud.notification import _post_expo_payloads
        from app.utils.notification_settings import apply_notification_extras
        title = f"Booking #{order_id} closed - customer no-show"
        body = f"{where}: confirmed by {by}." + (f" Your held ₹{refunded} is back in your wallet." if refunded else "")
        payloads = []
        for user, sub in (("vehicle_owner", a.vehicle_owner_id), ("driver", a.driver_id)):
            if not sub:
                continue
            for n in db.query(Notification).filter(Notification.user == user, Notification.sub == str(sub)).all():
                if n.token:
                    payloads.append(apply_notification_extras({"to": n.token, "title": title, "body": body}, db, "booking_reminder"))
        if payloads:
            await _post_expo_payloads(payloads)
    except Exception as e:      # noqa: BLE001
        print(f"no-show driver push failed: {e}")


def no_show_state(db: Session, order_id: int) -> dict:
    """For the poster's booking screen: can they mark a no-show now, and did the driver ask for one?"""
    order = db.query(Order).filter(Order.id == order_id).first()
    a = _active_assignment(db, order_id)
    open_trip = bool(order and str(getattr(order.trip_status, "value", order.trip_status)).upper() == "PENDING")
    started = bool(db.query(EndRecord).filter(EndRecord.order_id == order_id).first())
    can = bool(a and open_trip and not started)
    return {"can_no_show": can, "no_show_requested": bool(can and a.no_show_requested_at), "no_show_reason": (a.no_show_reason if can and a.no_show_requested_at else None)}


# ------------------------------------------------------------------ one list for the Admin App
def attention_list(db: Session) -> dict:
    """What needs a person right now: trips not started after pickup, no-show requests, reposts waiting for approval."""
    from app.models.car_driver import CarDriver
    now = datetime.now(timezone.utc)
    out = {"not_started": [], "no_show_requests": [], "repost_waiting": []}

    def _driver(a):
        d = db.query(CarDriver).filter(CarDriver.id == a.driver_id).first() if a.driver_id else None
        return (d.full_name if d else None), (d.primary_number if d else None)

    rows = (
        db.query(OrderAssignment, Order).join(Order, Order.id == OrderAssignment.order_id)
        .filter(OrderAssignment.assignment_status.in_([AssignmentStatusEnum.ASSIGNED, AssignmentStatusEnum.DRIVING]), Order.trip_status == "PENDING")
        .filter((OrderAssignment.no_start_alerted_at.isnot(None)) | (OrderAssignment.no_show_requested_at.isnot(None)))
        .order_by(Order.start_date_time).all()
    )
    for a, o in rows:
        if db.query(EndRecord).filter(EndRecord.order_id == o.id).first():
            continue
        name, phone = _driver(a)
        base = {"order_id": o.id, "route": route_text(o), "pickup": _aware(o.start_date_time).isoformat() if o.start_date_time else None,
                "driver_name": name, "driver_phone": phone, "vendor_id": str(o.vendor_id) if o.vendor_id else None}
        if a.no_show_requested_at:
            out["no_show_requests"].append({**base, "reason": a.no_show_reason, "requested_at": a.no_show_requested_at.isoformat()})
        elif a.no_start_alerted_at and o.start_date_time:
            out["not_started"].append({**base, "minutes_late": int((now - _aware(o.start_date_time)).total_seconds() // 60)})
    held = db.query(Order).filter(Order.trip_status == "PENDING", Order.repost_hold_until.isnot(None), Order.repost_announced_at.is_(None),
                                  Order.repost_hold_until > now).order_by(Order.repost_hold_until).all()
    for o in held:
        out["repost_waiting"].append({"order_id": o.id, "route": route_text(o), "pickup": _aware(o.start_date_time).isoformat() if o.start_date_time else None,
                                      "goes_out_at": _aware(o.repost_hold_until).isoformat()})
    out["total"] = sum(len(v) for v in out.values() if isinstance(v, list))
    return out


async def dismiss_no_show(db: Session, order_id: int, by: str) -> dict:
    """The office does not accept the no-show request: the trip carries on and the driver is told."""
    a = _active_assignment(db, order_id)
    if not a or not a.no_show_requested_at:
        raise ValueError("There is no no-show request on this booking")
    a.no_show_requested_at = None
    db.commit()
    await _tell_driver_and_owner(db, order_id, f"Booking #{order_id} - carry on with the trip",
                                 f"{by} did not accept the no-show request. Please carry on, or call support if the customer really cannot be reached.")
    return {"message": "Request dismissed - the trip carries on", "order_id": order_id}
