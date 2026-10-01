"""Unified chat API - one set of endpoints for every app and every kind of conversation (customer <-> admin, customer
<-> driver, driver <-> vendor, staff <-> staff, ...). See models/conversation.py for the model and crud/conversations.py
for the rules. The older /booking-chat and /support endpoints keep working; crud/chat_bridge.py keeps both in sync."""
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import get_current_user_flexible
from app.crud import chat_bridge as bridge
from app.crud import conversations as C
from app.database.session import get_db
from app.models.conversation import Conversation, ConversationMessage, ConversationParticipant
from app.models.orders import Order
from app.utils import chat_media
from app.utils.gcs import upload_image_to_gcs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["Conversations"], dependencies=[Depends(get_current_user_flexible)])
# Voice notes / photos are fetched by the audio / image players, which cannot send a login header.
media_router = APIRouter(prefix="/conversations", tags=["Conversations"])

_ROLE_FROM_TOKEN = {"CUSTOMER": C.CUSTOMER, "DRIVER": C.DRIVER, "VEHICLE_OWNER": C.FLEET_OWNER, "VENDOR": C.VENDOR}
AUDIO_MAX = 6 * 1024 * 1024
IMAGE_MAX = 8 * 1024 * 1024
NUMBER_NOTICE = "Phone numbers can't be shared in this chat until the customer number opens for this booking."


def _actor(db: Session, who: dict) -> C.Actor:
    role, uid = who["role"], str(who["user_id"])
    if role == "ADMIN":
        from app.models.admin import Admin
        admin = db.query(Admin).filter(Admin.id == uid).first()
        chat_role = C.DIRECTOR if admin is not None and (admin.role or "").lower() == "owner" else C.STAFF
        return C.Actor(chat_role, uid, (admin.username if admin is not None and admin.username else "Drop Cars"))
    chat_role = _ROLE_FROM_TOKEN.get(role)
    if chat_role is None:
        raise HTTPException(status_code=403, detail="This account cannot use chat")
    return C.Actor(chat_role, uid, C.display_name(db, chat_role, uid))


def _load(db: Session, who: dict, conversation_id: str, *, write: bool = False):
    actor = _actor(db, who)
    conv = C.get_conversation(db, conversation_id)
    if conv is None or not C.may_read(db, conv, actor):
        raise HTTPException(status_code=404, detail="Conversation not found")      # 404, not 403: do not reveal it exists
    if write and not C.may_post(db, conv, actor):
        raise HTTPException(status_code=403, detail="You can only read this chat.")
    return actor, conv


def _order_of(db: Session, conv: Conversation):
    return db.query(Order).filter(Order.id == conv.order_id).first() if conv.order_id else None


def _summary(db: Session, conv: Conversation, actor: C.Actor) -> dict:
    parts = C.participants_of(db, conv.id)
    out = {
        "id": str(conv.id), "type": conv.type, "title": C.title_for(conv, actor, parts), "order_id": conv.order_id,
        "is_closed": bool(conv.is_closed), "can_post": C.may_post(db, conv, actor),
        "participants": [{"role": p.role, "name": p.display_name} for p in parts if p.role != C.BOT],
    }
    if conv.type == "BOOKING":
        order = _order_of(db, conv)
        out["number_revealed"] = C.numbers_allowed(db, order)
        out["number_policy"] = None if out["number_revealed"] else NUMBER_NOTICE
    return out


# ------------------------------------------------------------------ list / create
@router.get("")
def list_conversations(type: Optional[str] = Query(None), q: Optional[str] = Query(None, max_length=60),
                       scope: str = Query("mine", pattern="^(mine|all)$"), limit: int = Query(100, ge=1, le=200),
                       who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    """My conversations, newest first, with unread counts. Admins can pass scope=all for oversight (booking and
    support chats; internal staff chats only for the director)."""
    actor = _actor(db, who)
    items = C.list_for_actor(db, actor, type, q, scope, limit)
    db.commit()
    return items


@router.get("/unread-count")
def unread_count(who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    actor = _actor(db, who)
    mine = [(r[0], r[1]) for r in db.query(ConversationParticipant.conversation_id, Conversation.type).join(
        Conversation, Conversation.id == ConversationParticipant.conversation_id).filter(
        ConversationParticipant.role == actor.role, ConversationParticipant.principal_id == actor.principal_id).all()]
    counts = C.unread_by_conversation(db, actor, [c for c, _ in mine])
    by_type: dict = {}
    for cid, t in mine:
        by_type[t] = by_type.get(t, 0) + counts.get(cid, 0)
    return {"total": sum(counts.values()), "by_type": by_type}


@router.get("/search")
def search_messages(q: str = Query(..., min_length=2, max_length=60), who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    """Find a word in the messages of my conversations."""
    actor = _actor(db, who)
    ids = [r[0] for r in db.query(ConversationParticipant.conversation_id).filter(
        ConversationParticipant.role == actor.role, ConversationParticipant.principal_id == actor.principal_id).all()]
    if not ids:
        return []
    rows = (db.query(ConversationMessage).filter(
        ConversationMessage.conversation_id.in_(ids), ConversationMessage.deleted_at.is_(None),
        ConversationMessage.text.ilike(f"%{q.strip()}%")).order_by(ConversationMessage.id.desc()).limit(30).all())
    convs = {c.id: c for c in db.query(Conversation).filter(Conversation.id.in_({m.conversation_id for m in rows})).all()}
    return [{"message_id": m.id, "conversation_id": str(m.conversation_id), "title": C.title_for(convs[m.conversation_id], actor, C.participants_of(db, m.conversation_id)),
             "type": convs[m.conversation_id].type, "sender_name": m.sender_name, "text": m.text,
             "created_at": m.created_at.isoformat() if m.created_at else None} for m in rows]


@router.post("/support")
def open_support_chat(who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    """My chat with the Drop Cars team (created the first time)."""
    actor = _actor(db, who)
    if actor.is_admin:
        raise HTTPException(status_code=400, detail="Admins answer support chats from the Chats list")
    conv = C.get_or_create_support_conversation(db, actor)
    db.commit()
    return _summary(db, conv, actor)


@router.post("/booking/{order_id}")
def open_booking_chat(order_id: int, who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    """The group chat of one booking. Only the booking's own parties (customer, poster, accepting owner, driver) and
    admins can open it."""
    actor = _actor(db, who)
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    parties = C.booking_parties(db, order)
    if not actor.is_admin and not any(r == actor.role and p == actor.principal_id for r, p, _ in parties):
        raise HTTPException(status_code=403, detail="You are not part of this booking's chat.")
    conv = C.get_or_create_booking_conversation(db, order)
    db.commit()
    return _summary(db, conv, actor)


class StaffChatPayload(BaseModel):
    with_admin_id: Optional[str] = None
    title: Optional[str] = Field(default=None, max_length=80)
    member_ids: Optional[List[str]] = None


@router.get("/staff/directory")
def staff_directory(who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    """Team members I can start an internal chat with (no phone numbers)."""
    actor = _actor(db, who)
    if not actor.is_admin:
        raise HTTPException(status_code=403, detail="Team chat is for the Drop Cars team")
    from app.models.admin import Admin
    return [{"id": str(a.id), "name": a.username, "role": "DIRECTOR" if (a.role or "").lower() == "owner" else "STAFF", "on_duty": bool(a.is_on_duty)}
            for a in db.query(Admin).order_by(Admin.username.asc()).all() if str(a.id) != actor.principal_id]


@router.post("/staff")
def open_staff_chat(body: StaffChatPayload, who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    """A direct chat with one team member, or a small group (title + member_ids). Only members and the director can read it."""
    actor = _actor(db, who)
    if not actor.is_admin:
        raise HTTPException(status_code=403, detail="Team chat is for the Drop Cars team")
    try:
        if body.member_ids:
            conv = C.create_staff_group(db, actor, body.title or "Team", body.member_ids)
        elif body.with_admin_id:
            conv = C.get_or_create_staff_direct(db, actor, body.with_admin_id)
        else:
            raise HTTPException(status_code=400, detail="Pick a team member")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    return _summary(db, conv, actor)


# ------------------------------------------------------------------ media
@router.post("/upload")
def upload_chat_media(file: UploadFile = File(...), who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    """Upload a voice note or a photo; the returned url goes into the next message."""
    _actor(db, who)
    ctype = (file.content_type or "").lower()
    if ctype.startswith("audio/"):
        kind, cap = "VOICE", AUDIO_MAX
    elif ctype.startswith("image/"):
        kind, cap = "IMAGE", IMAGE_MAX
    else:
        raise HTTPException(status_code=400, detail="Only voice notes and photos can be sent")
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size <= 0 or size > cap:
        raise HTTPException(status_code=413, detail=f"File too large (max {cap // (1024 * 1024)} MB)")
    url = chat_media.media_url(upload_image_to_gcs(file, folder="chat_media"))
    return {"url": url, "kind": kind, "mime": ctype, "size_bytes": size}


@media_router.get("/media/{folder}/{filename}")
def chat_media_file(folder: str, filename: str):
    if folder not in chat_media.CHAT_FOLDERS or not chat_media.FILE_NAME.match(filename):
        raise HTTPException(status_code=404, detail="Not found")
    try:
        from app.utils.gcs import bucket
        blob = bucket.blob(f"{folder}/{filename}")
        data = blob.download_as_bytes()
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(status_code=404, detail="Not found")
    ext = filename.rsplit(".", 1)[-1].lower()
    default = ("audio/mp4" if ext == "m4a" else f"audio/{ext}") if ext in chat_media.AUDIO_EXT else f"image/{'jpeg' if ext == 'jpg' else ext}"
    return Response(content=data, media_type=blob.content_type or default, headers={"Cache-Control": "private, max-age=86400"})


# ------------------------------------------------------------------ one conversation
@router.get("/{conversation_id}")
def get_conversation_detail(conversation_id: str, who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    actor, conv = _load(db, who, conversation_id)
    return _summary(db, conv, actor)


@router.get("/{conversation_id}/messages")
def get_messages(conversation_id: str, after_id: int = Query(0, ge=0), before_id: Optional[int] = Query(None, ge=1),
                 limit: int = Query(100, ge=1, le=200), who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    """Newer than after_id (polling while the chat is open) or the page before before_id (scrolling up).
    Opening a chat does not mark it read - the app calls /read when the messages are on screen."""
    actor, conv = _load(db, who, conversation_id)
    if conv.type == "BOOKING" and C.get_participant(db, conv.id, actor.role, actor.principal_id) is None and not actor.is_admin:
        C.join_if_needed(db, conv, actor)
        db.commit()
    return {"messages": C.messages_page(db, conv, actor, after_id, limit, before_id), "can_post": C.may_post(db, conv, actor)}


class MessagePayload(BaseModel):
    text: Optional[str] = Field(default=None, max_length=C.MAX_TEXT)
    voice_url: Optional[str] = None
    image_url: Optional[str] = None
    reply_to_id: Optional[int] = None


@router.post("/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
def send_message(conversation_id: str, body: MessagePayload, who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    actor, conv = _load(db, who, conversation_id, write=True)
    attachments, kind = [], "TEXT"
    for field, att_kind in (("voice_url", "VOICE"), ("image_url", "IMAGE")):
        url = (getattr(body, field) or "").strip()
        if url:
            if not chat_media.is_chat_media_url(url):
                raise HTTPException(status_code=400, detail="Attach media uploaded through the chat only")
            attachments.append({"kind": att_kind, "url": chat_media.media_url(url)})
            kind = att_kind
    text = (body.text or "").strip()
    if not text and not attachments:
        raise HTTPException(status_code=400, detail="Message can't be empty.")
    C.join_if_needed(db, conv, actor)            # an admin replying to a booking / support chat joins it
    try:
        msg = C.add_message(
            db, conv, sender_role=actor.role, sender_id=actor.principal_id, sender_name=C.staff_label(actor), text=text, kind=kind,
            reply_to_id=body.reply_to_id, attachments=attachments or None,
        )
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    db.refresh(msg)
    if msg.masked:
        logger.info("chat: phone number hidden conv=%s role=%s", conv.id, actor.role)
    if conv.type == "BOOKING":
        order = _order_of(db, conv)
        if order is not None:
            bridge.new_booking_to_legacy(db, conv, order, msg)
    elif conv.type == "SUPPORT":
        bridge.new_support_to_legacy(db, conv, msg)
    C.notify_participants(db, conv, msg, C.staff_label(actor))
    out = C.messages_page(db, conv, actor, after_id=msg.id - 1, limit=1)
    result = out[0] if out else {"id": msg.id}
    if msg.masked:
        result["notice"] = NUMBER_NOTICE
    return result


class ReadPayload(BaseModel):
    up_to_id: Optional[int] = None


@router.post("/{conversation_id}/read")
def mark_conversation_read(conversation_id: str, body: ReadPayload = ReadPayload(), who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    actor, conv = _load(db, who, conversation_id)
    last = C.mark_read(db, conv, actor, body.up_to_id)
    db.commit()
    return {"last_read_message_id": last}


class MutePayload(BaseModel):
    minutes: Optional[int] = Field(default=None, ge=0, le=60 * 24 * 365)    # None / 0 = unmute


@router.patch("/{conversation_id}/mute")
def mute_conversation(conversation_id: str, body: MutePayload, who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    actor, conv = _load(db, who, conversation_id)
    p = C.get_participant(db, conv.id, actor.role, actor.principal_id)
    if p is None:
        raise HTTPException(status_code=400, detail="Join the chat first")
    p.muted_until = datetime.now(timezone.utc) + timedelta(minutes=body.minutes) if body.minutes else None
    db.commit()
    return {"muted_until": p.muted_until.isoformat() if p.muted_until else None}


class BlockPayload(BaseModel):
    blocked: bool


@router.patch("/{conversation_id}/block")
def block_conversation(conversation_id: str, body: BlockPayload, who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    """Stop getting (and sending) messages in this chat. Admins can always still read it (oversight)."""
    actor, conv = _load(db, who, conversation_id)
    if conv.type in ("SUPPORT", "STAFF", "DIRECT"):
        raise HTTPException(status_code=400, detail="Support and team chats can be muted, not blocked")
    p = C.get_participant(db, conv.id, actor.role, actor.principal_id)
    if p is None:
        raise HTTPException(status_code=400, detail="Join the chat first")
    p.blocked = body.blocked
    db.commit()
    return {"blocked": p.blocked}


@router.post("/admin/backfill-legacy")
def backfill_legacy_chats(limit: int = Query(300, ge=1, le=2000), who: dict = Depends(get_current_user_flexible), db: Session = Depends(get_db)):
    """Director only: copy the booking / support messages that existed before this system into it (run until 0 / 0)."""
    actor = _actor(db, who)
    if not actor.is_director:
        raise HTTPException(status_code=403, detail="Only the director can run this")
    return bridge.backfill_legacy(db, limit)
