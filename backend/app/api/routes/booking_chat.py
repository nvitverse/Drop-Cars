"""Chat per booking (WhatsApp-style): the poster (vendor / driver who posted the booking) <-> the driver side (the
fleet owner who accepted it + the assigned driver). Works with any of the app tokens (vendor, fleet owner, driver);
the side is worked out from the booking itself, never trusted from the client."""
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, Query, status, UploadFile, File
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.core.security import get_current_vendor, get_current_user, get_current_driver, get_current_admin, get_current_user_flexible
from app.models.orders import Order
from app.models.booking_chat import BookingChatMessage
from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
from app.crud import booking_chat as chat
from app.utils.gcs import upload_image_to_gcs
from app.utils.chat_media import media_url

router = APIRouter(prefix="/booking-chat", tags=["Booking Chat"], dependencies=[Depends(get_current_user_flexible)])


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
        # Admin can read AND reply here - e.g. when a driver's "which trip?"
        # question routes to a booking that has no vendor/owner poster
        # (order.vendor_id and posted_by_vehicle_owner_id both null - a pure
        # Website/Admin booking), Admin support is the only real human on
        # the other side of this chat. Sent as POSTER so it slots into the
        # same read/unread bucket the driver already sees the poster in;
        # sender_name still shows "Drop Cars admin" so it's never confused
        # with the vendor/owner.
        return Actor("POSTER", str(caller.id), "Drop Cars admin")
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


def _msg_out(m: BookingChatMessage, me: str, by_id: Optional[dict] = None, options: Optional[list] = None) -> dict:
    out = {
        "id": m.id, "side": m.sender_side, "mine": m.sender_side == me, "sender_name": m.sender_name,
        "kind": m.kind, "quick_key": m.quick_key, "text": m.text, "voice_url": media_url(m.voice_url),
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "read": m.read_at is not None,
        "reply_to": None,
        "reply_options": options or [],
    }
    rid = getattr(m, "reply_to_id", None)
    if rid:
        q = (by_id or {}).get(rid)
        if q is not None:
            out["reply_to"] = {"id": q.id, "side": q.sender_side, "mine": q.sender_side == me, "kind": q.kind,
                               "text": (q.text or "")[:160], "sender_name": q.sender_name}
    return out


def _other_party(db: Session, o: Order, a, side: str):
    """(name, role, phone) of the person on the other end of this booking chat."""
    other, other_role, other_phone = None, None, None
    if side == "POSTER":
        from app.models.car_driver import CarDriver
        d = db.query(CarDriver).filter(CarDriver.id == a.driver_id).first() if a.driver_id else None
        other = d.full_name if d else "Driver"
        other_role = "DRIVER"
        other_phone = d.primary_number if d else None
    elif o.vendor_id:
        from app.models.vendor import VendorCredentials
        v = db.query(VendorCredentials).filter(VendorCredentials.id == o.vendor_id).first()
        other = f"Vendor #{v.reg_id}" if v and v.reg_id else "Vendor"
        other_role = "VENDOR"
        other_phone = v.primary_number if v else None
    elif o.posted_by_vehicle_owner_id:
        from app.models.vehicle_owner import VehicleOwnerCredentials
        ow = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == o.posted_by_vehicle_owner_id).first()
        other = f"Fleet Driver #{ow.reg_id}" if ow and ow.reg_id else "Fleet Driver"
        other_role = "OWNER"
        other_phone = ow.primary_number if ow else None
    else:
        other = "Drop Cars Admin"
        other_role = "ADMIN"
    return other, other_role, other_phone


@router.get("/threads")
def list_threads(request: Request, db: Session = Depends(get_db)):
    """All bookings this user can chat about (WhatsApp-style list), newest activity first."""
    role, caller = _resolve_caller(request, db)
    cutoff = datetime.now(timezone.utc) - timedelta(days=chat.CHAT_RETENTION_DAYS)
    if role == "ADMIN":
        # Bookings with no vendor/owner poster (posted via Website/Admin
        # directly) - Admin is the only real POSTER-side party for these,
        # so Admin App's Chats needs to see and reply to them too. Anything
        # posted by a vendor/owner stays out of Admin's inbox; that's a
        # private thread between the driver and that vendor/owner.
        me = "POSTER"
        orders = (
            db.query(Order)
            .filter(Order.vendor_id.is_(None), Order.posted_by_vehicle_owner_id.is_(None))
            .order_by(Order.created_at.desc()).limit(200).all()
        )
    elif role == "VENDOR":
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
        if role in ("VENDOR", "ADMIN"):
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
        other, other_role, other_phone = _other_party(db, o, a, side)
        out.append({
            "order_id": o.id, "title": chat.booking_title(o), "trip_type": chat._v(o.trip_type), "car_type": chat._v(o.car_type),
            "start_date_time": o.start_date_time.isoformat() if o.start_date_time else None,
            "assignment_status": st, "my_side": side, "other_party": other, "other_role": other_role, "other_phone": other_phone,
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
    by_id = {m.id: m for m in all_msgs}
    _opt_cache: dict = {}
    st = str(getattr(a.assignment_status, "value", a.assignment_status)) if a else None
    resp = {
        "order_id": order.id, "title": chat.booking_title(order), "trip_type": chat._v(order.trip_type), "car_type": chat._v(order.car_type),
        "start_date_time": order.start_date_time.isoformat() if order.start_date_time else None,
        "assignment_status": st, "my_side": actor.side, "read_only": actor.read_only or st == "COMPLETED",
        **dict(zip(("other_party", "other_role", "other_phone"),
                   _other_party(db, order, a, actor.side) if a and actor.side in ("POSTER", "DRIVER") else (None, None, None))),
        "messages": [
            _msg_out(m, actor.side, by_id, chat.reply_options(db, order, m, actor.side, st, _opt_cache))
            for m in msgs
        ],
        "quick_menu": chat.driver_menu(st) if actor.side == "DRIVER" else [],
        "suggestions": chat.poster_suggestions(db, order, chat.unanswered_driver_questions(all_msgs)) if actor.side == "POSTER" else [],
        # Poster's "+" sheet: every booking detail, to send on demand.
        "send_menu": (_opt_cache.get("all") or chat.poster_suggestions(db, order, list(chat.DRIVER_QUESTIONS.keys()))) if actor.side == "POSTER" and st != "COMPLETED" else [],
    }
    return resp


class SendPayload(BaseModel):
    text: Optional[str] = None
    quick_key: Optional[str] = None
    voice_url: Optional[str] = None
    reply_to_id: Optional[int] = None


@router.post("/upload-voice")
def upload_chat_voice_note(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Any of the 4 app tokens (vendor/owner/driver/admin) can upload a
    voice note - the same recording ends up attached to whichever chat
    message the client posts right after (booking chat or Support chat),
    so this endpoint doesn't need to know which one in advance."""
    _resolve_caller(request, db)  # just needs to be someone real
    if not (file.content_type or "").startswith("audio/"):
        raise HTTPException(status_code=400, detail="File must be an audio recording")
    url = upload_image_to_gcs(file, folder="chat_voice_notes")
    return {"voice_url": url}


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
    voice_url = (payload.voice_url or "").strip() or None
    kind = "TEXT"
    if voice_url:
        kind = "VOICE"
        text = text or "\U0001F3A4 Voice message"
    elif actor.side == "DRIVER" and key in chat.DRIVER_QUESTIONS and not text:
        text = chat.DRIVER_QUESTIONS[key]
        kind = "QUICK"
    elif key:
        kind = "QUICK"
    if not text:
        raise HTTPException(status_code=400, detail="Message can't be empty.")
    if len(text) > 1000:
        raise HTTPException(status_code=400, detail="Message is too long.")

    reply_to = None
    if payload.reply_to_id:
        reply_to = db.query(BookingChatMessage).filter(
            BookingChatMessage.id == payload.reply_to_id, BookingChatMessage.order_id == order.id
        ).first()
    m = BookingChatMessage(order_id=order.id, sender_side=actor.side, sender_id=actor.ident, sender_name=actor.name,
                           kind=kind, quick_key=key, text=text, voice_url=voice_url,
                           reply_to_id=reply_to.id if reply_to else None)
    db.add(m)
    # Poster deliberately sharing the customer number in chat = the same "show customer number" decision as the switch
    if actor.side == "POSTER" and key == "CUSTOMER_NUMBER":
        order.data_visibility_vehicle_owner = True
    db.commit()
    db.refresh(m)
    chat.notify_other_side(db, order, actor.side, text, a)
    return _msg_out(m, actor.side, {reply_to.id: reply_to} if reply_to else None)
