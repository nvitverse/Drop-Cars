"""Chat per booking (WhatsApp-style): the poster (vendor / driver who posted the booking) <-> the driver side (the
fleet owner who accepted it + the assigned driver). Works with any of the app tokens (vendor, fleet owner, driver);
the side is worked out from the booking itself, never trusted from the client."""
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.core.security import get_current_vendor, get_current_user, get_current_driver, get_current_admin
from app.models.orders import Order
from app.models.booking_chat import BookingChatMessage
from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
from app.crud import booking_chat as chat

router = APIRouter(prefix="/booking-chat", tags=["Booking Chat"])


class Actor:
    def __init__(self, side: str, ident: str, name: str, read_only: bool = False):
        self.side, self.ident, self.name, self.read_only = side, ident, name, read_only


def _creds(request: Request) -> HTTPAuthorizationCredentials:
    h = request.headers.get("authorization") or request.headers.get("Authorization")
    if not h or not h.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=h.split(" ", 1)[1])


def _resolve_caller(request: Request, db: Session):
    """(role, caller) for whichever app token this is."""
    creds = _creds(request)
    for role, getter in (("VENDOR", get_current_vendor), ("OWNER", get_current_user), ("DRIVER", get_current_driver), ("ADMIN", get_current_admin)):
        try:
            return role, getter(creds, db)
        except HTTPException:
            continue
    raise HTTPException(status_code=401, detail="Could not validate credentials")


def _actor_for_order(role: str, caller, order: Order, db: Session) -> Actor:
    if role == "ADMIN":
        return Actor("ADMIN", str(caller.id), "Drop Cars admin", read_only=True)
    if role == "VENDOR":
        if order.vendor_id and str(order.vendor_id) == str(caller.id):
            return Actor("POSTER", str(caller.id), getattr(caller, "business_name", None) or getattr(caller, "full_name", None) or "Vendor")
        raise HTTPException(status_code=403, detail="This booking isn't yours.")
    owner_id = str(getattr(caller, "vehicle_owner_id", None) or getattr(caller, "id", ""))
    name = getattr(caller, "full_name", None) or "Driver"
    if order.posted_by_vehicle_owner_id is not None and str(order.posted_by_vehicle_owner_id) == owner_id:
        return Actor("POSTER", owner_id, name)
    a = chat.active_assignment(db, order.id)
    if a is not None and str(a.vehicle_owner_id) == owner_id:
        return Actor("DRIVER", str(getattr(caller, "id", owner_id)), name)
    raise HTTPException(status_code=403, detail="You are not part of this booking's chat.")


def _load(request: Request, db: Session, order_id: int):
    role, caller = _resolve_caller(request, db)
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Booking not found")
    return _actor_for_order(role, caller, order, db), order


def _msg_out(m: BookingChatMessage, me: str) -> dict:
    return {
        "id": m.id, "side": m.sender_side, "mine": m.sender_side == me, "sender_name": m.sender_name,
        "kind": m.kind, "quick_key": m.quick_key, "text": m.text,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "read": m.read_at is not None,
    }


@router.get("/threads")
def list_threads(request: Request, db: Session = Depends(get_db)):
    """All bookings this user can chat about (WhatsApp-style list), newest activity first."""
    role, caller = _resolve_caller(request, db)
    cutoff = datetime.now(timezone.utc) - timedelta(days=chat.CHAT_RETENTION_DAYS)
    if role == "ADMIN":
        return []
    if role == "VENDOR":
        me = "POSTER"
        orders = db.query(Order).filter(Order.vendor_id == str(caller.id)).order_by(Order.created_at.desc()).limit(200).all()
    else:
        owner_id = str(getattr(caller, "vehicle_owner_id", None) or getattr(caller, "id", ""))
        posted = db.query(Order).filter(Order.posted_by_vehicle_owner_id == owner_id).order_by(Order.created_at.desc()).limit(200).all()
        accepted_ids = [
            r[0] for r in db.query(OrderAssignment.order_id)
            .filter(OrderAssignment.vehicle_owner_id == owner_id, OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED)
            .order_by(OrderAssignment.created_at.desc()).limit(200).all()
        ]
        accepted = db.query(Order).filter(Order.id.in_(accepted_ids)).all() if accepted_ids else []
        by_id = {o.id: o for o in posted}
        for o in accepted:
            by_id.setdefault(o.id, o)
        orders = list(by_id.values())
        me = None  # decided per order below
    out = []
    for o in orders:
        a = chat.active_assignment(db, o.id)
        if a is None:
            continue  # nothing to chat about until a driver accepts
        st = str(getattr(a.assignment_status, "value", a.assignment_status))
        if role == "VENDOR":
            side = "POSTER"
        else:
            side = "POSTER" if (o.posted_by_vehicle_owner_id is not None and str(o.posted_by_vehicle_owner_id) == owner_id) else "DRIVER"
        finished = st == "COMPLETED"
        done_at = a.completed_at or a.created_at
        if finished and done_at is not None:
            d = done_at if done_at.tzinfo else done_at.replace(tzinfo=timezone.utc)
            if d < cutoff:
                continue  # chat for a trip finished >10 days ago is already purged
        last = db.query(BookingChatMessage).filter(BookingChatMessage.order_id == o.id).order_by(BookingChatMessage.id.desc()).first()
        unread = db.query(func.count(BookingChatMessage.id)).filter(
            BookingChatMessage.order_id == o.id, BookingChatMessage.sender_side != side, BookingChatMessage.read_at.is_(None)
        ).scalar() or 0
        other = None
        if side == "POSTER":
            from app.models.car_driver import CarDriver
            d = db.query(CarDriver).filter(CarDriver.id == a.driver_id).first() if a.driver_id else None
            other = d.full_name if d else "Driver"
        else:
            other = "Booking owner"
        out.append({
            "order_id": o.id, "title": chat.booking_title(o), "trip_type": chat._v(o.trip_type), "car_type": chat._v(o.car_type),
            "start_date_time": o.start_date_time.isoformat() if o.start_date_time else None,
            "assignment_status": st, "my_side": side, "other_party": other,
            "last_text": last.text if last else None,
            "last_at": last.created_at.isoformat() if last and last.created_at else None,
            "unread": int(unread),
        })
    out.sort(key=lambda t: (t["last_at"] or t["start_date_time"] or ""), reverse=True)
    return out


@router.get("/orders/{order_id}")
def get_chat(order_id: int, request: Request, after_id: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """Messages (optionally only newer than after_id) + the quick menu (driver) or auto-suggested replies (poster).
    Opening a chat marks the other side's messages as read."""
    actor, order = _load(request, db, order_id)
    a = chat.active_assignment(db, order.id)
    q = db.query(BookingChatMessage).filter(BookingChatMessage.order_id == order_id)
    all_msgs = q.order_by(BookingChatMessage.id.asc()).all()
    now = datetime.now(timezone.utc)
    if actor.side in ("POSTER", "DRIVER"):
        changed = False
        for m in all_msgs:
            if m.sender_side != actor.side and m.read_at is None:
                m.read_at = now
                changed = True
        if changed:
            db.commit()
    msgs = [m for m in all_msgs if m.id > after_id]
    st = str(getattr(a.assignment_status, "value", a.assignment_status)) if a else None
    resp = {
        "order_id": order.id, "title": chat.booking_title(order), "trip_type": chat._v(order.trip_type), "car_type": chat._v(order.car_type),
        "start_date_time": order.start_date_time.isoformat() if order.start_date_time else None,
        "assignment_status": st, "my_side": actor.side, "read_only": actor.read_only or st == "COMPLETED",
        "messages": [_msg_out(m, actor.side) for m in msgs],
        "quick_menu": chat.driver_menu(st) if actor.side == "DRIVER" else [],
        "suggestions": chat.poster_suggestions(db, order, chat.unanswered_driver_questions(all_msgs)) if actor.side == "POSTER" else [],
    }
    return resp


class SendPayload(BaseModel):
    text: Optional[str] = None
    quick_key: Optional[str] = None


@router.post("/orders/{order_id}", status_code=status.HTTP_201_CREATED)
def send_message(order_id: int, payload: SendPayload, request: Request, db: Session = Depends(get_db)):
    actor, order = _load(request, db, order_id)
    if actor.read_only or actor.side not in ("POSTER", "DRIVER"):
        raise HTTPException(status_code=403, detail="You can only read this chat.")
    a = chat.active_assignment(db, order.id)
    if a is None:
        raise HTTPException(status_code=400, detail="Chat opens once a driver accepts this booking.")
    st = str(getattr(a.assignment_status, "value", a.assignment_status))
    if st == "COMPLETED":
        raise HTTPException(status_code=400, detail="This trip is completed - chat is closed.")

    key = (payload.quick_key or "").strip() or None
    text = (payload.text or "").strip()
    kind = "TEXT"
    if actor.side == "DRIVER" and key in chat.DRIVER_QUESTIONS and not text:
        text = chat.DRIVER_QUESTIONS[key]
        kind = "QUICK"
    elif key:
        kind = "QUICK"
    if not text:
        raise HTTPException(status_code=400, detail="Message can't be empty.")
    if len(text) > 1000:
        raise HTTPException(status_code=400, detail="Message is too long.")

    m = BookingChatMessage(order_id=order.id, sender_side=actor.side, sender_id=actor.ident, sender_name=actor.name,
                           kind=kind, quick_key=key, text=text)
    db.add(m)
    # Poster deliberately sharing the customer number in chat = the same "show customer number" decision as the switch
    if actor.side == "POSTER" and key == "CUSTOMER_NUMBER":
        order.data_visibility_vehicle_owner = True
    db.commit()
    db.refresh(m)
    chat.notify_other_side(db, order, actor.side, text, a)
    return _msg_out(m, actor.side)
