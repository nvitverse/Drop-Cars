"""Car-substitution ("Request for my car") flow, steps that need pushes or the real accept path.

A fleet without the exact vehicle type asks to do a booking with a different car. The booking's POSTER (vendor / fleet owner) or the office
(any admin, for every booking) approves. Approval is a PASS:
  * the driver's wallet already covers the normal hold  -> the booking is accepted and the car + driver assigned for him at once;
  * the wallet is short                                  -> he is told exactly how much to recharge, and taps Accept afterwards
    (accept_order honours the pass: no vehicle-type gate, but the normal wallet hold).
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

log = logging.getLogger(__name__)


def push_to(db: Session, user_type: str, sub: str, title: str, body: str, data: Optional[dict] = None) -> None:
    """Best-effort push to every device of one account (never raises)."""
    try:
        from app.models.notification import Notification
        from app.crud.notification import _enqueue_expo_push, _is_muted
        rows = db.query(Notification).filter(Notification.user == user_type, Notification.sub == str(sub)).all()
        tokens = [n.token for n in rows if n.token and not _is_muted(n)]
        if not tokens:
            return
        payloads = [{
            "to": t, "title": title, "body": body, "sound": "notification_tone.wav", "priority": "high",
            "channelId": "dropcars-new-booking-v1", "data": data or {},
            "android": {"channelId": "dropcars-new-booking-v1", "sound": "notification_tone.wav", "priority": "high"},
        } for t in tokens]
        _enqueue_expo_push(db, payloads)
    except Exception:  # noqa: BLE001
        log.exception("substitution push failed (non-fatal)")


def _label(t) -> str:
    return str(getattr(t, "value", t) or "").replace("_", " ").title()


async def notify_new_request(db: Session, req, order) -> None:
    """Tell the poster (vendor or fleet owner) and the office that a request is waiting."""
    text = f"A fleet wants to do Booking #{req.order_id} with a {_label(req.offered_car_type)} instead of the {_label(req.required_car_type)}. Open Vehicle requests to approve or decline."
    data = {"type": "substitution_request", "order_id": req.order_id, "request_id": req.id}
    if getattr(order, "vendor_id", None):
        push_to(db, "vendor", str(order.vendor_id), "🚗 Vehicle request for your booking", text, data)
    elif getattr(order, "posted_by_vehicle_owner_id", None):
        push_to(db, "vehicle_owner", str(order.posted_by_vehicle_owner_id), "🚗 Vehicle request for your booking", text, data)
    try:
        from app.crud.notification import send_push_notification_to_admin
        await send_push_notification_to_admin(db, title="🚗 Car Substitution Request", message=text)
    except Exception:  # noqa: BLE001
        log.exception("admin push failed (non-fatal)")


def notify_driver_decision(db: Session, req, approved: bool, auto_accepted: bool) -> None:
    owner = str(req.vehicle_owner_id)
    data = {"type": "substitution_decision", "order_id": req.order_id, "request_id": req.id}
    if not approved:
        push_to(db, "vehicle_owner", owner, "Vehicle request declined", f"Your request to do Booking #{req.order_id} with your other car was declined.", data)
        return
    if auto_accepted:
        push_to(db, "vehicle_owner", owner, "✅ Vehicle request approved", f"Booking #{req.order_id} is yours - your car and driver are assigned.", data)
    elif (req.funds_needed or 0) > 0:
        push_to(db, "vehicle_owner", owner, "✅ Approved - recharge to accept",
                f"Booking #{req.order_id} is approved for your car. Add Rs {req.funds_needed} to your wallet, then tap Accept.", data)
    else:
        push_to(db, "vehicle_owner", owner, "✅ Vehicle request approved", f"Booking #{req.order_id} is approved for your car. Tap Accept to take it.", data)


async def approve_and_accept(db: Session, request_id: int, decider_id: Optional[str], decider_kind: str, decider_name: Optional[str], notes: Optional[str]):
    """Approve, then - when the wallet already covers the hold - accept the booking and assign car + driver straight away.
    Returns (request, auto_accepted: bool, message: str)."""
    from app.crud.vehicle_matching import decide_substitution_request
    req = decide_substitution_request(db, request_id, approve=True, decider_id=decider_id, notes=notes, decider_kind=decider_kind, decider_name=decider_name)

    auto = False
    if (req.funds_needed or 0) == 0:
        try:
            from app.api.routes.order_assignments import accept_order, assign_car_driver
            from app.crud.vehicle_owner import get_vehicle_owner_by_id
            from app.schemas.order_assignments import OrderAssignmentCreate, UpdateCarDriverRequest
            owner = get_vehicle_owner_by_id(db, req.vehicle_owner_id)
            assignment = await accept_order(OrderAssignmentCreate(order_id=req.order_id), db=db, current_user=owner)
            await assign_car_driver(assignment.id, UpdateCarDriverRequest(driver_id=req.driver_id, car_id=req.car_id), db=db, current_user=owner)
            auto = True
        except Exception as e:  # noqa: BLE001  (the pass stays valid: he can still tap Accept himself)
            log.warning("auto-accept after approval failed (pass kept): %s", getattr(e, "detail", e))
            try:
                db.rollback()
            except Exception:  # noqa: BLE001
                pass
    db.refresh(req)
    notify_driver_decision(db, req, True, auto)
    if auto:
        msg = "Approved and assigned: the car and driver are on the booking."
    elif (req.funds_needed or 0) > 0:
        msg = f"Approved. The driver's wallet is Rs {req.funds_needed} short of the hold - he has been told to recharge and then accept."
    else:
        msg = "Approved. The driver has been told to tap Accept."
    return req, auto, msg
