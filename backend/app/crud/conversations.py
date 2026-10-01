"""Core of the unified chat: who may see / post in a conversation, phone-number masking, unread + read receipts,
push to the other participants and retention. The HTTP layer lives in api/routes/conversations.py, the bridge to the
older chat tables in crud/chat_bridge.py.

Privacy rules (owner, 2026-10-01):
  * a conversation is visible only to its participants, plus admin oversight (BOOKING / SUPPORT for any admin; STAFF and
    DIRECT chats only for their members and the director);
  * in a BOOKING chat nobody (except admins) can pass a phone number before the booking's "customer number reveal
    rule" has opened it (crud/order_assignments.py customer_number_reveal_at) - digits are replaced and the message is
    flagged; the API never returns anyone's phone number.
"""
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.conversation import (
    Conversation, ConversationAttachment, ConversationMessage, ConversationParticipant,
)

logger = logging.getLogger(__name__)

TYPES = ("BOOKING", "SUPPORT", "STAFF", "DIRECT", "BROADCAST", "ASSISTANT")
CUSTOMER, DRIVER, FLEET_OWNER, VENDOR, STAFF, DIRECTOR, BOT = "CUSTOMER", "DRIVER", "FLEET_OWNER", "VENDOR", "STAFF", "DIRECTOR", "BOT"
HUMAN_ROLES = (CUSTOMER, DRIVER, FLEET_OWNER, VENDOR, STAFF, DIRECTOR)
ADMIN_ROLES = (STAFF, DIRECTOR)
# Roles whose BOOKING-chat messages may not carry a phone number before the reveal rule opens it.
MASKED_SENDERS = (CUSTOMER, DRIVER, FLEET_OWNER, VENDOR)
OVERSIGHT_TYPES = ("BOOKING", "SUPPORT", "BROADCAST")

# How long messages are kept, per conversation type (days). Editable: platform setting chat_retention_days_<type>.
RETENTION_DEFAULT_DAYS = {"BOOKING": 10, "SUPPORT": 90, "STAFF": 365, "DIRECT": 365, "BROADCAST": 30, "ASSISTANT": 30}

MAX_TEXT = 2000


@dataclass
class Actor:
    """Whoever is calling, in chat terms."""
    role: str
    principal_id: str
    name: str

    @property
    def is_admin(self) -> bool:
        return self.role in ADMIN_ROLES

    @property
    def is_director(self) -> bool:
        return self.role == DIRECTOR


# ------------------------------------------------------------------ phone numbers
_DIGIT_WORDS = "zero|one|two|three|four|five|six|seven|eight|nine"
_NUMBER_RUN = re.compile(r"(?<!\w)(?:\+?\d[\s\-.()]{0,2}){8,}(?!\d)")
_WORD_RUN = re.compile(rf"\b(?:(?:{_DIGIT_WORDS})[\s\-,.]*){{7,}}", re.I)
HIDDEN = "•••• ••••••"


def mask_phone_numbers(text: str) -> Tuple[str, bool]:
    """Hide anything that looks like a phone number (8+ digits, with or without + - . spaces, or spelled-out digits).
    Returns (new_text, was_anything_hidden)."""
    hit = False

    def _digits(m):
        nonlocal hit
        if sum(c.isdigit() for c in m.group(0)) >= 8:
            hit = True
            return HIDDEN
        return m.group(0)

    def _words(m):
        nonlocal hit
        hit = True
        return HIDDEN

    out = _NUMBER_RUN.sub(_digits, text or "")
    out = _WORD_RUN.sub(_words, out)
    return out, hit


def numbers_allowed(db: Session, order) -> bool:
    """True once the customer number reveal rule has opened for this booking."""
    if order is None:
        return False
    try:
        from app.crud.order_assignments import is_customer_number_revealed
        return bool(is_customer_number_revealed(db, order))
    except Exception:
        return False   # fail closed: never leak because the rule could not be read


# ------------------------------------------------------------------ names
def display_name(db: Session, role: str, principal_id: str) -> str:
    try:
        if role == CUSTOMER:
            from app.crud.customer import get_customer_details_by_customer_id
            d = get_customer_details_by_customer_id(db, principal_id)
            return (getattr(d, "full_name", None) or "Customer") if d else "Customer"
        if role == DRIVER:
            from app.models.car_driver import CarDriver
            d = db.query(CarDriver).filter(CarDriver.id == principal_id).first()
            return (d.full_name if d and d.full_name else "Driver")
        if role == FLEET_OWNER:
            from app.models.vehicle_owner_details import VehicleOwnerDetails
            d = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == principal_id).first()
            return (d.full_name if d and d.full_name else "Fleet owner")
        if role == VENDOR:
            from app.crud.vendor import get_vendor_details_by_vendor_id
            d = get_vendor_details_by_vendor_id(db, principal_id)
            return (getattr(d, "business_name", None) or getattr(d, "full_name", None) or "Vendor") if d else "Vendor"
        if role in ADMIN_ROLES:
            from app.models.admin import Admin
            a = db.query(Admin).filter(Admin.id == principal_id).first()
            return (a.username if a and a.username else "Drop Cars")
    except Exception:
        db.rollback()
    return {CUSTOMER: "Customer", DRIVER: "Driver", FLEET_OWNER: "Fleet owner", VENDOR: "Vendor"}.get(role, "Drop Cars")


def staff_label(actor: Actor) -> str:
    """How an admin shows up to customers / drivers: the team name plus who is typing."""
    return f"Drop Cars · {actor.name}" if actor.is_admin else actor.name


# ------------------------------------------------------------------ conversations + participants
def get_conversation(db: Session, conversation_id) -> Optional[Conversation]:
    try:
        cid = conversation_id if isinstance(conversation_id, uuid.UUID) else uuid.UUID(str(conversation_id))
    except (ValueError, AttributeError):
        return None
    return db.query(Conversation).filter(Conversation.id == cid).first()


def get_or_create_conversation(db: Session, subject_key: str, **fields) -> Conversation:
    conv = db.query(Conversation).filter(Conversation.subject_key == subject_key).first()
    if conv is None:
        conv = Conversation(subject_key=subject_key, **fields)
        db.add(conv)
        db.flush()
    return conv


def get_participant(db: Session, conv_id, role: str, principal_id: str) -> Optional[ConversationParticipant]:
    return db.query(ConversationParticipant).filter(
        ConversationParticipant.conversation_id == conv_id,
        ConversationParticipant.role == role,
        ConversationParticipant.principal_id == str(principal_id),
    ).first()


def ensure_participant(db: Session, conv: Conversation, role: str, principal_id: str, name: Optional[str] = None) -> ConversationParticipant:
    p = get_participant(db, conv.id, role, principal_id)
    if p is None:
        p = ConversationParticipant(conversation_id=conv.id, role=role, principal_id=str(principal_id),
                                    display_name=name or display_name(db, role, str(principal_id)))
        db.add(p)
        db.flush()
    elif name and p.display_name != name:
        p.display_name = name
    return p


def participants_of(db: Session, conv_id) -> List[ConversationParticipant]:
    return db.query(ConversationParticipant).filter(ConversationParticipant.conversation_id == conv_id).all()


def booking_parties(db: Session, order) -> List[Tuple[str, str, str]]:
    """Everyone who belongs in this booking's chat right now: [(role, principal_id, name)]. Worked out from the booking
    itself (never trusted from a client)."""
    from app.crud import booking_chat as legacy
    parties: List[Tuple[str, str, str]] = []
    if order.vendor_id:
        parties.append((VENDOR, str(order.vendor_id), display_name(db, VENDOR, str(order.vendor_id))))
    elif order.posted_by_vehicle_owner_id:
        parties.append((FLEET_OWNER, str(order.posted_by_vehicle_owner_id), display_name(db, FLEET_OWNER, str(order.posted_by_vehicle_owner_id))))
    a = legacy.active_assignment(db, order.id)
    if a is not None:
        if a.vehicle_owner_id:
            parties.append((FLEET_OWNER, str(a.vehicle_owner_id), display_name(db, FLEET_OWNER, str(a.vehicle_owner_id))))
        if a.driver_id:
            parties.append((DRIVER, str(a.driver_id), display_name(db, DRIVER, str(a.driver_id))))
    try:
        from app.models.customer_booking_request import CustomerBookingRequest
        r = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.linked_order_id == order.id).first()
        if r is not None:
            parties.append((CUSTOMER, str(r.customer_id), r.customer_name or display_name(db, CUSTOMER, str(r.customer_id))))
    except Exception:
        db.rollback()
    seen, out = set(), []
    for role, pid, name in parties:
        if (role, pid) not in seen:
            seen.add((role, pid))
            out.append((role, pid, name))
    return out


def sync_booking_participants(db: Session, conv: Conversation, order) -> List[ConversationParticipant]:
    """Make sure every party of the booking has a participant row (a driver who accepted after the chat started, ...)."""
    return [ensure_participant(db, conv, role, pid, name) for role, pid, name in booking_parties(db, order)]


def get_or_create_booking_conversation(db: Session, order) -> Conversation:
    from app.crud import booking_chat as legacy
    conv = get_or_create_conversation(
        db, f"BOOKING:{order.id}", type="BOOKING", order_id=order.id, title=legacy.booking_title(order),
    )
    sync_booking_participants(db, conv, order)
    return conv


def get_or_create_support_conversation(db: Session, actor: Actor) -> Conversation:
    conv = get_or_create_conversation(
        db, f"SUPPORT:{actor.role}:{actor.principal_id}", type="SUPPORT", title=actor.name,
        created_by_role=actor.role, created_by_id=actor.principal_id,
    )
    ensure_participant(db, conv, actor.role, actor.principal_id, actor.name)
    return conv


def staff_direct_key(a: str, b: str) -> str:
    x, y = sorted([str(a), str(b)])
    return f"STAFF:direct:{x}:{y}"


def get_or_create_staff_direct(db: Session, actor: Actor, other_admin_id: str) -> Conversation:
    from app.models.admin import Admin
    other = db.query(Admin).filter(Admin.id == other_admin_id).first()
    if other is None or str(other.id) == actor.principal_id:
        raise ValueError("Pick another team member")
    other_role = DIRECTOR if (other.role or "").lower() == "owner" else STAFF
    conv = get_or_create_conversation(
        db, staff_direct_key(actor.principal_id, str(other.id)), type="STAFF", title=None,
        created_by_role=actor.role, created_by_id=actor.principal_id,
    )
    ensure_participant(db, conv, actor.role, actor.principal_id, actor.name)
    ensure_participant(db, conv, other_role, str(other.id), other.username or "Staff")
    return conv


def create_staff_group(db: Session, actor: Actor, title: str, member_ids: Iterable[str]) -> Conversation:
    from app.models.admin import Admin
    conv = Conversation(type="STAFF", title=(title or "Team").strip()[:80], subject_key=f"STAFF:group:{uuid.uuid4()}",
                        created_by_role=actor.role, created_by_id=actor.principal_id, meta={"group": True})
    db.add(conv)
    db.flush()
    ensure_participant(db, conv, actor.role, actor.principal_id, actor.name)
    for mid in dict.fromkeys(str(m) for m in member_ids):
        a = db.query(Admin).filter(Admin.id == mid).first()
        if a is not None and str(a.id) != actor.principal_id:
            ensure_participant(db, conv, DIRECTOR if (a.role or "").lower() == "owner" else STAFF, str(a.id), a.username or "Staff")
    return conv


# ------------------------------------------------------------------ who may do what
def is_booking_party(db: Session, conv: Conversation, actor: Actor) -> bool:
    if conv.type != "BOOKING" or conv.order_id is None:
        return False
    from app.models.orders import Order
    order = db.query(Order).filter(Order.id == conv.order_id).first()
    return order is not None and any(r == actor.role and p == actor.principal_id for r, p, _ in booking_parties(db, order))


def may_read(db: Session, conv: Conversation, actor: Actor) -> bool:
    if get_participant(db, conv.id, actor.role, actor.principal_id) is not None:
        return True
    if actor.is_admin:
        if conv.type in OVERSIGHT_TYPES:
            return True
        return actor.is_director and conv.type in ("STAFF", "DIRECT")     # internal chats: members and the director only (an admin's assistant chat is private to that admin)
    return is_booking_party(db, conv, actor)


def may_post(db: Session, conv: Conversation, actor: Actor) -> bool:
    if conv.is_closed:
        return False
    p = get_participant(db, conv.id, actor.role, actor.principal_id)
    if p is not None:
        return not p.blocked
    if actor.is_admin:
        return conv.type in ("BOOKING", "SUPPORT", "BROADCAST")
    return is_booking_party(db, conv, actor)


def join_if_needed(db: Session, conv: Conversation, actor: Actor) -> ConversationParticipant:
    return ensure_participant(db, conv, actor.role, actor.principal_id, actor.name)


# ------------------------------------------------------------------ messages
def _preview(text: str, kind: str) -> str:
    if kind == "VOICE":
        return "\U0001F3A4 Voice message"
    if kind == "IMAGE":
        return "\U0001F4F7 Photo" + (f": {text[:100]}" if text and text != "\U0001F4F7 Photo" else "")
    return (text or "")[:140]


def prepare_text(db: Session, conv: Conversation, sender_role: str, text: str) -> Tuple[str, bool]:
    """Apply the phone-number rule to what is about to be stored."""
    text = (text or "").strip()
    if conv.type == "BOOKING" and sender_role in MASKED_SENDERS and conv.order_id is not None:
        from app.models.orders import Order
        order = db.query(Order).filter(Order.id == conv.order_id).first()
        if not numbers_allowed(db, order):
            return mask_phone_numbers(text)
    return text, False


def add_message(
    db: Session, conv: Conversation, *, sender_role: str, sender_id: Optional[str], sender_name: Optional[str],
    text: str, kind: str = "TEXT", reply_to_id: Optional[int] = None, attachments: Optional[List[dict]] = None,
    meta: Optional[dict] = None, legacy_source: Optional[str] = None, legacy_id: Optional[int] = None,
    created_at: Optional[datetime] = None, apply_privacy: bool = True,
) -> ConversationMessage:
    """Store one message (no commit). Privacy masking, last-message bookkeeping and the sender's own read mark."""
    masked = False
    if apply_privacy:
        text, masked = prepare_text(db, conv, sender_role, text)
    text = (text or "").strip()
    if not text and not attachments:
        raise ValueError("Message can't be empty")
    if len(text) > MAX_TEXT:
        raise ValueError("Message is too long")
    if reply_to_id:
        ok = db.query(ConversationMessage.id).filter(ConversationMessage.id == reply_to_id, ConversationMessage.conversation_id == conv.id).first()
        reply_to_id = reply_to_id if ok else None
    m = ConversationMessage(
        conversation_id=conv.id, sender_role=sender_role, sender_id=sender_id, sender_name=sender_name, kind=kind,
        text=text or _preview("", kind), reply_to_id=reply_to_id, masked=masked, meta=meta,
        legacy_source=legacy_source, legacy_id=legacy_id,
    )
    if created_at is not None:
        m.created_at = created_at
    db.add(m)
    db.flush()
    for a in attachments or []:
        db.add(ConversationAttachment(message_id=m.id, kind=a["kind"], url=a["url"], mime=a.get("mime"), size_bytes=a.get("size_bytes")))
    conv.last_message_id = m.id
    conv.last_message_at = m.created_at or datetime.now(timezone.utc)
    conv.last_message_preview = _preview(m.text, kind)
    if sender_id:
        p = get_participant(db, conv.id, sender_role, sender_id)
        if p is not None and (p.last_read_message_id or 0) < m.id:
            p.last_read_message_id = m.id
    return m


def mark_read(db: Session, conv: Conversation, actor: Actor, up_to_id: Optional[int] = None) -> int:
    p = get_participant(db, conv.id, actor.role, actor.principal_id)
    if p is None:
        return 0
    target = up_to_id or conv.last_message_id or 0
    if target > (p.last_read_message_id or 0):
        p.last_read_message_id = target
    return int(p.last_read_message_id or 0)


def unread_by_conversation(db: Session, actor: Actor, conv_ids: List) -> Dict:
    """{conversation_id: unread count} for this actor (messages from others after their read mark)."""
    if not conv_ids:
        return {}
    rows = (
        db.query(ConversationMessage.conversation_id, func.count(ConversationMessage.id))
        .join(ConversationParticipant, (ConversationParticipant.conversation_id == ConversationMessage.conversation_id)
              & (ConversationParticipant.role == actor.role) & (ConversationParticipant.principal_id == actor.principal_id))
        .filter(
            ConversationMessage.conversation_id.in_(conv_ids),
            ConversationMessage.id > ConversationParticipant.last_read_message_id,
            ConversationMessage.deleted_at.is_(None),
            ~((ConversationMessage.sender_role == actor.role) & (ConversationMessage.sender_id == actor.principal_id)),
        )
        .group_by(ConversationMessage.conversation_id).all()
    )
    return {cid: int(n) for cid, n in rows}


def total_unread(db: Session, actor: Actor) -> int:
    ids = [r[0] for r in db.query(ConversationParticipant.conversation_id).filter(
        ConversationParticipant.role == actor.role, ConversationParticipant.principal_id == actor.principal_id).all()]
    return sum(unread_by_conversation(db, actor, ids).values())


def message_out(m: ConversationMessage, actor: Actor, participants: List[ConversationParticipant],
                attachments: Optional[List[ConversationAttachment]] = None, reply: Optional[ConversationMessage] = None) -> dict:
    mine = bool(m.sender_id) and m.sender_role == actor.role and str(m.sender_id) == actor.principal_id
    others_read = [
        p for p in participants
        if p.role in HUMAN_ROLES and not (p.role == m.sender_role and p.principal_id == str(m.sender_id)) and (p.last_read_message_id or 0) >= m.id
    ]
    voice = next((a for a in attachments or [] if a.kind == "VOICE"), None)
    image = next((a for a in attachments or [] if a.kind == "IMAGE"), None)
    return {
        "id": m.id, "conversation_id": str(m.conversation_id), "sender_role": m.sender_role, "sender_name": m.sender_name,
        "mine": mine, "kind": m.kind, "text": m.text,
        "voice_url": voice.url if voice else None, "image_url": image.url if image else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "read": bool(others_read), "read_count": len(others_read),
        "masked": bool(m.masked),
        "reply_to": ({"id": reply.id, "sender_name": reply.sender_name, "text": (reply.text or "")[:160], "kind": reply.kind} if reply else None),
        "meta": m.meta or None,
    }


def messages_page(db: Session, conv: Conversation, actor: Actor, after_id: int = 0, limit: int = 100, before_id: Optional[int] = None) -> List[dict]:
    q = db.query(ConversationMessage).filter(ConversationMessage.conversation_id == conv.id, ConversationMessage.deleted_at.is_(None))
    if before_id:
        q = q.filter(ConversationMessage.id < before_id).order_by(ConversationMessage.id.desc()).limit(limit)
        msgs = list(reversed(q.all()))
    else:
        q = q.filter(ConversationMessage.id > after_id).order_by(ConversationMessage.id.asc()).limit(limit)
        msgs = q.all()
    if not msgs:
        return []
    ids = [m.id for m in msgs]
    atts: Dict[int, List[ConversationAttachment]] = {}
    for a in db.query(ConversationAttachment).filter(ConversationAttachment.message_id.in_(ids)).all():
        atts.setdefault(a.message_id, []).append(a)
    reply_ids = [m.reply_to_id for m in msgs if m.reply_to_id]
    replies = {r.id: r for r in db.query(ConversationMessage).filter(ConversationMessage.id.in_(reply_ids)).all()} if reply_ids else {}
    parts = participants_of(db, conv.id)
    return [message_out(m, actor, parts, atts.get(m.id), replies.get(m.reply_to_id)) for m in msgs]


# ------------------------------------------------------------------ listing
def _attach_actor_to_booking_conversations(db: Session, actor: Actor) -> None:
    """A driver / owner / vendor / customer who became part of a booking AFTER its chat was created has no participant
    row yet - add it, so the chat shows up in their list."""
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.models.orders import Order
    order_ids: List[int] = []
    if actor.role == FLEET_OWNER:
        order_ids += [r[0] for r in db.query(OrderAssignment.order_id).filter(
            OrderAssignment.vehicle_owner_id == actor.principal_id, OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED).limit(300).all()]
        order_ids += [r[0] for r in db.query(Order.id).filter(Order.posted_by_vehicle_owner_id == actor.principal_id).limit(300).all()]
    elif actor.role == DRIVER:
        order_ids += [r[0] for r in db.query(OrderAssignment.order_id).filter(
            OrderAssignment.driver_id == actor.principal_id, OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED).limit(300).all()]
    elif actor.role == VENDOR:
        order_ids += [r[0] for r in db.query(Order.id).filter(Order.vendor_id == actor.principal_id).limit(300).all()]
    elif actor.role == CUSTOMER:
        from app.models.customer_booking_request import CustomerBookingRequest
        order_ids += [r[0] for r in db.query(CustomerBookingRequest.linked_order_id).filter(
            CustomerBookingRequest.customer_id == actor.principal_id, CustomerBookingRequest.linked_order_id.isnot(None)).limit(300).all()]
    if not order_ids:
        return
    have = {r[0] for r in db.query(ConversationParticipant.conversation_id).filter(
        ConversationParticipant.role == actor.role, ConversationParticipant.principal_id == actor.principal_id).all()}
    for conv in db.query(Conversation).filter(Conversation.type == "BOOKING", Conversation.order_id.in_(order_ids)).all():
        if conv.id not in have:
            ensure_participant(db, conv, actor.role, actor.principal_id, actor.name)


def title_for(conv: Conversation, actor: Actor, parts: List[ConversationParticipant]) -> str:
    others = [p for p in parts if p.role != BOT and not (p.role == actor.role and p.principal_id == actor.principal_id)]
    if conv.type == "SUPPORT":
        return conv.title if actor.is_admin else "Drop Cars Support"
    if conv.type in ("STAFF", "DIRECT"):
        if (conv.meta or {}).get("group"):
            return conv.title or "Team"
        names = [p.display_name or "Staff" for p in others if p.role in ADMIN_ROLES]
        return names[0] if names else (conv.title or "Team")
    if conv.type == "BOOKING":
        return f"{conv.title or 'Booking'} · #{conv.order_id}" if conv.order_id else (conv.title or "Booking")
    return conv.title or "Chat"


def list_for_actor(db: Session, actor: Actor, type_: Optional[str] = None, q: Optional[str] = None,
                   scope: str = "mine", limit: int = 100) -> List[dict]:
    if actor.role in (FLEET_OWNER, DRIVER, VENDOR, CUSTOMER):
        _attach_actor_to_booking_conversations(db, actor)
        db.flush()

    mine_ids = db.query(ConversationParticipant.conversation_id).filter(
        ConversationParticipant.role == actor.role, ConversationParticipant.principal_id == actor.principal_id)
    query = db.query(Conversation)
    if scope == "all" and actor.is_admin:
        cond = Conversation.type.in_(OVERSIGHT_TYPES)
        cond = or_(cond, Conversation.id.in_(mine_ids)) if not actor.is_director else or_(cond, Conversation.type.in_(("STAFF", "DIRECT")))
        query = query.filter(cond)
    else:
        query = query.filter(Conversation.id.in_(mine_ids))
    if type_:
        query = query.filter(Conversation.type == type_.upper())
    if q:
        like = f"%{q.strip()}%"
        part_match = db.query(ConversationParticipant.conversation_id).filter(ConversationParticipant.display_name.ilike(like))
        query = query.filter(or_(Conversation.title.ilike(like), Conversation.last_message_preview.ilike(like), Conversation.id.in_(part_match)))
    convs = query.order_by(func.coalesce(Conversation.last_message_at, Conversation.created_at).desc()).limit(limit).all()
    if not convs:
        return []
    ids = [c.id for c in convs]
    parts_by: Dict = {}
    for p in db.query(ConversationParticipant).filter(ConversationParticipant.conversation_id.in_(ids)).all():
        parts_by.setdefault(p.conversation_id, []).append(p)
    unread = unread_by_conversation(db, actor, ids)
    now = datetime.now(timezone.utc)
    out = []
    for c in convs:
        parts = parts_by.get(c.id, [])
        me = next((p for p in parts if p.role == actor.role and p.principal_id == actor.principal_id), None)
        muted = bool(me and me.muted_until and (me.muted_until if me.muted_until.tzinfo else me.muted_until.replace(tzinfo=timezone.utc)) > now)
        out.append({
            "id": str(c.id), "type": c.type, "title": title_for(c, actor, parts), "order_id": c.order_id,
            "last_message": c.last_message_preview, "last_at": c.last_message_at.isoformat() if c.last_message_at else None,
            "unread": int(unread.get(c.id, 0)), "is_closed": bool(c.is_closed), "muted": muted,
            "member": me is not None, "needs_human": bool((c.meta or {}).get("needs_human")),
            "participants": [{"role": p.role, "name": p.display_name} for p in parts if p.role != BOT and p is not me][:6],
        })
    return out


# ------------------------------------------------------------------ push
def notify_participants(db: Session, conv: Conversation, msg: ConversationMessage, sender_label: Optional[str] = None) -> None:
    """Best-effort push to everyone else in the chat (never raises)."""
    try:
        from app.models.notification import Notification
        from app.crud.notification import _is_muted
        from app.utils.notification_dispatch import _send_expo

        now = datetime.now(timezone.utc)
        subs: List[str] = []
        notify_all_admins = False
        for p in participants_of(db, conv.id):
            if p.role == BOT or (p.role == msg.sender_role and p.principal_id == str(msg.sender_id)):
                continue
            if p.blocked or (p.muted_until and (p.muted_until if p.muted_until.tzinfo else p.muted_until.replace(tzinfo=timezone.utc)) > now):
                continue
            subs.append(p.principal_id)
            if p.role == DRIVER:
                from app.models.car_driver import CarDriver
                d = db.query(CarDriver).filter(CarDriver.id == p.principal_id).first()
                if d is not None and d.vehicle_owner_id:
                    subs.append(str(d.vehicle_owner_id))     # the Driver App registers its token under the owner too
        if conv.type in ("SUPPORT", "BOOKING") and msg.sender_role not in ADMIN_ROLES:
            if conv.type == "SUPPORT" or not any(p.role in ADMIN_ROLES for p in participants_of(db, conv.id)):
                notify_all_admins = True
        rows = db.query(Notification).filter(Notification.sub.in_(subs)).all() if subs else []
        if notify_all_admins:
            rows += db.query(Notification).filter(Notification.user == "admin").all()
        tokens = [r.token for r in rows if r.token and not _is_muted(r)]
        if not tokens:
            return
        title = f"\U0001F4AC {conv.title or 'Chat'}" if conv.type != "BOOKING" else f"\U0001F4AC Booking #{conv.order_id}"
        body = f"{sender_label or msg.sender_name or ''}: {_preview(msg.text, msg.kind)}".strip(": ")
        _send_expo(tokens, title, body[:160], {"type": "chat", "conversation_id": str(conv.id), "order_id": conv.order_id}, db, "chat_message")
    except Exception:
        logger.exception("chat push failed (message stored)")


# ------------------------------------------------------------------ retention
def retention_days(db: Session, type_: str) -> int:
    from app.models.platform_setting import PlatformSetting
    row = db.query(PlatformSetting).filter(PlatformSetting.key == f"chat_retention_days_{type_.lower()}").first()
    try:
        return max(1, int(float(row.value))) if row and row.value else RETENTION_DEFAULT_DAYS[type_]
    except (TypeError, ValueError):
        return RETENTION_DEFAULT_DAYS[type_]


def purge_old_conversation_messages(db: Session) -> int:
    """Delete messages older than the retention of their conversation type (called from the hourly sweep)."""
    total = 0
    now = datetime.now(timezone.utc)
    for type_ in TYPES:
        cutoff = now - timedelta(days=retention_days(db, type_))
        conv_ids = [r[0] for r in db.query(Conversation.id).filter(Conversation.type == type_).all()]
        if not conv_ids:
            continue
        old_ids = [r[0] for r in db.query(ConversationMessage.id).filter(
            ConversationMessage.conversation_id.in_(conv_ids), ConversationMessage.created_at < cutoff).all()]
        if not old_ids:
            continue
        db.query(ConversationAttachment).filter(ConversationAttachment.message_id.in_(old_ids)).delete(synchronize_session=False)
        total += db.query(ConversationMessage).filter(ConversationMessage.id.in_(old_ids)).delete(synchronize_session=False)
    db.commit()
    return int(total)
