"""Two-way bridge between the older chat tables and the unified conversations.

Shipped apps keep calling /api/booking-chat/* and /api/support/*; newer apps use /api/conversations/*. To make both
generations see the same chat without a risky big-bang migration, the route that stores a message ALSO stores it in
the other generation. Every copy is tagged (legacy_source / legacy_id) so nothing is ever copied twice, and nothing
here can fail the request that called it (errors are logged, the original message is already safe).

  legacy -> unified : booking_chat send, support send / admin reply   (legacy_*_to_new)
  unified -> legacy : a message in a BOOKING or SUPPORT conversation   (new_*_to_legacy)
  backfill          : copies the rows that already existed             (backfill_legacy)
"""
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.crud import conversations as C
from app.models.conversation import Conversation, ConversationMessage

logger = logging.getLogger(__name__)

LEGACY_SUPPORT_ROLE = {C.FLEET_OWNER: "OWNER", C.DRIVER: "DRIVER", C.VENDOR: "VENDOR", C.CUSTOMER: "CUSTOMER"}
NEW_SUPPORT_ROLE = {v: k for k, v in LEGACY_SUPPORT_ROLE.items()}


def legacy_key_for(db: Session, role: str, principal_id: str) -> str:
    """The older support chat keys a fleet owner's thread by the owner DETAILS row id (that is what its auth returns),
    while tokens and the unified chat use the account id. Everyone else uses the same id in both."""
    if role == C.FLEET_OWNER:
        from app.models.vehicle_owner_details import VehicleOwnerDetails
        d = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == principal_id).first()
        return str(d.id) if d is not None else str(principal_id)
    return str(principal_id)


def principal_for_legacy_key(db: Session, role: str, key: str) -> str:
    if role == C.FLEET_OWNER:
        from app.models.vehicle_owner_details import VehicleOwnerDetails
        try:
            d = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.id == key).first()
        except Exception:
            db.rollback()
            d = None
        return str(d.vehicle_owner_id) if d is not None else str(key)
    return str(key)


def _already(db: Session, source: str, legacy_id: int) -> bool:
    return db.query(ConversationMessage.id).filter(
        ConversationMessage.legacy_source == source, ConversationMessage.legacy_id == legacy_id).first() is not None


def _admin_role(db: Session, admin_id: Optional[str]) -> str:
    if not admin_id:
        return C.STAFF
    from app.models.admin import Admin
    a = db.query(Admin).filter(Admin.id == admin_id).first()
    return C.DIRECTOR if a is not None and (a.role or "").lower() == "owner" else C.STAFF


# ------------------------------------------------------------------ booking chat
def legacy_booking_to_new(db: Session, order, legacy_msg, caller_role: str, caller_id: str, caller_name: str) -> None:
    """caller_role is the legacy token role: VENDOR | OWNER | DRIVER | ADMIN."""
    try:
        if _already(db, "booking_chat", legacy_msg.id):
            return
        conv = C.get_or_create_booking_conversation(db, order)
        if caller_role == "ADMIN":
            role = _admin_role(db, caller_id)
            name = f"Drop Cars · {caller_name}" if caller_name and caller_name != "Drop Cars admin" else "Drop Cars admin"
        elif caller_role == "VENDOR":
            role, name = C.VENDOR, caller_name
        elif caller_role == "DRIVER":
            role, name = C.DRIVER, caller_name
        else:
            role, name = C.FLEET_OWNER, caller_name
        C.ensure_participant(db, conv, role, caller_id, caller_name)
        attachments = [{"kind": "VOICE", "url": legacy_msg.voice_url}] if legacy_msg.voice_url else None
        msg = C.add_message(
            db, conv, sender_role=role, sender_id=caller_id, sender_name=name, text=legacy_msg.text,
            kind="VOICE" if legacy_msg.voice_url else "TEXT", attachments=attachments,
            legacy_source="booking_chat", legacy_id=legacy_msg.id, created_at=legacy_msg.created_at,
        )
        db.commit()
        C.notify_participants(db, conv, msg)
    except Exception:
        db.rollback()
        logger.exception("legacy booking chat -> unified copy failed (original message is safe)")


def new_booking_to_legacy(db: Session, conv: Conversation, order, msg: ConversationMessage) -> None:
    """Show a unified-chat message to the shipped apps that still read booking_chat_messages."""
    try:
        from app.crud import booking_chat as legacy
        from app.models.booking_chat import BookingChatMessage
        a = legacy.active_assignment(db, order.id)
        if a is None:
            return
        if str(getattr(a.assignment_status, "value", a.assignment_status)) == "COMPLETED":
            return
        role, sid = msg.sender_role, str(msg.sender_id or "")
        if role in C.ADMIN_ROLES or role == C.VENDOR:
            side = "POSTER"
        elif role == C.DRIVER:
            side = "DRIVER"
        elif role == C.FLEET_OWNER:
            side = "POSTER" if (order.posted_by_vehicle_owner_id is not None and str(order.posted_by_vehicle_owner_id) == sid) else "DRIVER"
        else:
            return       # customers / bots have no side in the older chat
        voice = next((x.url for x in _attachments(db, msg) if x.kind == "VOICE"), None)
        row = BookingChatMessage(
            order_id=order.id, sender_side=side, sender_id=sid, sender_name=msg.sender_name,
            kind="VOICE" if voice else "TEXT", text=msg.text, voice_url=voice,
        )
        db.add(row)
        db.flush()
        msg.legacy_source, msg.legacy_id = "booking_chat", row.id
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("unified booking chat -> legacy copy failed (message is safe in the new chat)")


# ------------------------------------------------------------------ support chat
def legacy_support_to_new(db: Session, legacy_msg, admin_id: Optional[str] = None) -> None:
    try:
        if _already(db, "support", legacy_msg.id):
            return
        owner_role = NEW_SUPPORT_ROLE.get(legacy_msg.thread_role, C.FLEET_OWNER)
        owner_id = principal_for_legacy_key(db, owner_role, legacy_msg.thread_key)
        conv = C.get_or_create_conversation(
            db, f"SUPPORT:{owner_role}:{owner_id}", type="SUPPORT", title=legacy_msg.thread_name,
            created_by_role=owner_role, created_by_id=owner_id,
        )
        C.ensure_participant(db, conv, owner_role, owner_id, legacy_msg.thread_name)
        if legacy_msg.sender_side == "ADMIN":
            role = _admin_role(db, admin_id)
            sender_id = admin_id or "admin"
            if admin_id:
                C.ensure_participant(db, conv, role, admin_id, legacy_msg.sender_name)
            name = f"Drop Cars · {legacy_msg.sender_name}" if legacy_msg.sender_name else "Drop Cars"
        else:
            role, sender_id, name = owner_role, owner_id, legacy_msg.sender_name
        attachments = [{"kind": "VOICE", "url": legacy_msg.voice_url}] if legacy_msg.voice_url else None
        msg = C.add_message(
            db, conv, sender_role=role, sender_id=sender_id, sender_name=name, text=legacy_msg.text,
            kind="VOICE" if legacy_msg.voice_url else "TEXT", attachments=attachments, apply_privacy=False,
            legacy_source="support", legacy_id=legacy_msg.id, created_at=legacy_msg.created_at,
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("legacy support -> unified copy failed (original message is safe)")


def new_support_to_legacy(db: Session, conv: Conversation, msg: ConversationMessage) -> None:
    try:
        from app.models.support_message import SupportMessage
        owner = next((p for p in C.participants_of(db, conv.id) if p.role in LEGACY_SUPPORT_ROLE), None)
        if owner is None:
            return
        is_admin = msg.sender_role in C.ADMIN_ROLES
        voice = next((x.url for x in _attachments(db, msg) if x.kind == "VOICE"), None)
        row = SupportMessage(
            thread_key=legacy_key_for(db, owner.role, owner.principal_id), thread_role=LEGACY_SUPPORT_ROLE[owner.role],
            thread_name=conv.title or owner.display_name, sender_side="ADMIN" if is_admin else "DRIVER_OWNER",
            sender_name=(msg.sender_name or "").replace("Drop Cars · ", "") or None, text=msg.text, voice_url=voice,
        )
        db.add(row)
        db.flush()
        msg.legacy_source, msg.legacy_id = "support", row.id
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("unified support -> legacy copy failed (message is safe in the new chat)")


def _attachments(db: Session, msg: ConversationMessage):
    from app.models.conversation import ConversationAttachment
    return db.query(ConversationAttachment).filter(ConversationAttachment.message_id == msg.id).all()


# ------------------------------------------------------------------ one-time copy of what already exists
def backfill_legacy(db: Session, limit: int = 500) -> dict:
    """Copy older chat rows that have no unified copy yet (idempotent, run in batches until it returns 0 / 0)."""
    from app.models.booking_chat import BookingChatMessage
    from app.models.orders import Order
    from app.models.support_message import SupportMessage

    copied_support = copied_booking = 0
    done_support = {r[0] for r in db.query(ConversationMessage.legacy_id).filter(ConversationMessage.legacy_source == "support").all()}
    for m in db.query(SupportMessage).order_by(SupportMessage.id.asc()).all():
        if m.id in done_support:
            continue
        legacy_support_to_new(db, m)
        copied_support += 1
        if copied_support >= limit:
            break

    done_booking = {r[0] for r in db.query(ConversationMessage.legacy_id).filter(ConversationMessage.legacy_source == "booking_chat").all()}
    for m in db.query(BookingChatMessage).order_by(BookingChatMessage.id.asc()).all():
        if m.id in done_booking:
            continue
        order = db.query(Order).filter(Order.id == m.order_id).first()
        if order is None:
            continue
        # side -> role: POSTER is the vendor / the posting fleet owner / the admin; DRIVER is the accepting owner or driver
        if m.sender_side == "POSTER":
            role = "VENDOR" if order.vendor_id and str(order.vendor_id) == str(m.sender_id) else ("ADMIN" if not order.vendor_id and not order.posted_by_vehicle_owner_id else "OWNER")
        else:
            role = "DRIVER" if m.sender_id and C.get_participant(db, C.get_or_create_booking_conversation(db, order).id, C.DRIVER, str(m.sender_id)) else "OWNER"
        legacy_booking_to_new(db, order, m, role, str(m.sender_id or ""), m.sender_name or "")
        copied_booking += 1
        if copied_booking >= limit:
            break
    return {"support": copied_support, "booking": copied_booking}
