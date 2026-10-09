"""Chat Trash: solved support chats and finished booking chats wait here for TRASH_DAYS, then are deleted for good.

  - staff move a chat to Trash (it is gone from the live lists, still readable and restorable)
  - a finished (COMPLETED) booking chat counts as trash from the day the trip finished - no tap needed
  - a new message from the driver / owner pulls a support thread back out of Trash on its own
  - the daily clean-up deletes the messages of every chat that has been in Trash longer than the retention
Active chats keep the old rolling clean-up (messages older than 10 days) - the 10-day purge skips anything in Trash."""
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Set, Tuple

from sqlalchemy.orm import Session

from app.models.chat_trash import ChatTrash

DEFAULT_TRASH_DAYS = 30


def trash_days(db: Session) -> int:
    from app.crud.customer_booking_request import get_platform_setting_value
    try:
        return max(1, int(float(get_platform_setting_value(db, "chat_trash_days", str(DEFAULT_TRASH_DAYS)) or DEFAULT_TRASH_DAYS)))
    except (TypeError, ValueError):
        return DEFAULT_TRASH_DAYS


def _aware(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def move_to_trash(db: Session, thread_type: str, thread_key: str, by: str, reason: str = "SOLVED") -> ChatTrash:
    thread_type = thread_type.upper()
    row = db.query(ChatTrash).filter(ChatTrash.thread_type == thread_type, ChatTrash.thread_key == str(thread_key)).first()
    if row is None:
        row = ChatTrash(thread_type=thread_type, thread_key=str(thread_key), reason=reason, trashed_by=by)
        db.add(row)
    else:
        row.trashed_at = datetime.now(timezone.utc)
        row.reason = reason
        row.trashed_by = by
    db.commit()
    return row


def restore(db: Session, thread_type: str, thread_key: str) -> bool:
    n = db.query(ChatTrash).filter(ChatTrash.thread_type == thread_type.upper(), ChatTrash.thread_key == str(thread_key)).delete(synchronize_session=False)
    db.commit()
    return bool(n)


def trash_map(db: Session, thread_type: str) -> Dict[str, ChatTrash]:
    return {r.thread_key: r for r in db.query(ChatTrash).filter(ChatTrash.thread_type == thread_type.upper()).all()}


def days_left(db: Session, trashed_at) -> int:
    t = _aware(trashed_at)
    if t is None:
        return trash_days(db)
    end = t + timedelta(days=trash_days(db))
    return max(0, (end - datetime.now(timezone.utc)).days + (1 if (end - datetime.now(timezone.utc)).seconds > 0 else 0))


def protected_keys(db: Session) -> Tuple[Set[str], Set[int]]:
    """(support thread keys, booking order ids) whose messages the rolling 10-day clean-up must leave alone: they are in Trash
    (or, for bookings, finished within the retention window and therefore Trash by definition)."""
    rows = db.query(ChatTrash).all()
    support = {r.thread_key for r in rows if r.thread_type == "SUPPORT"}
    orders: Set[int] = set()
    for r in rows:
        if r.thread_type == "BOOKING":
            try:
                orders.add(int(r.thread_key))
            except ValueError:
                pass
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    since = datetime.now(timezone.utc) - timedelta(days=trash_days(db))
    for (oid,) in db.query(OrderAssignment.order_id).filter(
        OrderAssignment.assignment_status == AssignmentStatusEnum.COMPLETED, OrderAssignment.completed_at >= since
    ).all():
        orders.add(oid)
    return support, orders


def purge_expired_trash(db: Session) -> dict:
    """Delete the conversations that have been in Trash longer than the retention (daily). Returns counts."""
    from app.models.support_message import SupportMessage
    from app.models.booking_chat import BookingChatMessage
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    cutoff = datetime.now(timezone.utc) - timedelta(days=trash_days(db))
    out = {"support_messages": 0, "booking_messages": 0, "trash_rows": 0}
    old = db.query(ChatTrash).filter(ChatTrash.trashed_at < cutoff).all()
    for r in old:
        if r.thread_type == "SUPPORT":
            out["support_messages"] += db.query(SupportMessage).filter(SupportMessage.thread_key == r.thread_key).delete(synchronize_session=False)
        else:
            try:
                out["booking_messages"] += db.query(BookingChatMessage).filter(BookingChatMessage.order_id == int(r.thread_key)).delete(synchronize_session=False)
            except ValueError:
                pass
        db.delete(r)
        out["trash_rows"] += 1
    # finished trips: the chat is Trash from the completion day and goes with it
    done = [oid for (oid,) in db.query(OrderAssignment.order_id).filter(
        OrderAssignment.assignment_status == AssignmentStatusEnum.COMPLETED, OrderAssignment.completed_at < cutoff).all()]
    if done:
        out["booking_messages"] += db.query(BookingChatMessage).filter(BookingChatMessage.order_id.in_(done)).delete(synchronize_session=False)
    db.commit()
    return out
