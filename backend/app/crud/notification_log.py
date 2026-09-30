from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.notification_log import NotificationLog


def log_notification(
    db: Session,
    user_type: str,
    user_id: str,
    title: str,
    body: str,
    event_key: Optional[str] = None,
    action_required: bool = False,
    related_order_id: Optional[int] = None,
) -> NotificationLog:
    """Record one in-app notification history row. Called alongside (never
    instead of) the actual Expo push send in app/crud/notification.py -
    failures here must never block the push itself."""
    row = NotificationLog(
        user_type=user_type,
        user_id=str(user_id),
        title=title,
        body=body,
        event_key=event_key,
        action_required=action_required,
        related_order_id=related_order_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_notifications(
    db: Session, user_type: str, user_id: str, filter: str = "all"
) -> List[NotificationLog]:
    query = db.query(NotificationLog).filter(
        NotificationLog.user_type == user_type,
        NotificationLog.user_id == str(user_id),
    )
    if filter == "unread":
        query = query.filter(NotificationLog.is_read == False)  # noqa: E712
    elif filter == "action_required":
        query = query.filter(NotificationLog.action_required == True)  # noqa: E712
    return query.order_by(NotificationLog.created_at.desc()).limit(200).all()


def mark_read(db: Session, user_type: str, user_id: str, notification_id: int) -> Optional[NotificationLog]:
    row = db.query(NotificationLog).filter(
        NotificationLog.id == notification_id,
        NotificationLog.user_type == user_type,
        NotificationLog.user_id == str(user_id),
    ).first()
    if not row:
        return None
    row.is_read = True
    db.commit()
    db.refresh(row)
    return row


def mark_all_read(db: Session, user_type: str, user_id: str) -> int:
    count = db.query(NotificationLog).filter(
        NotificationLog.user_type == user_type,
        NotificationLog.user_id == str(user_id),
        NotificationLog.is_read == False,  # noqa: E712
    ).update({"is_read": True})
    db.commit()
    return count


def delete_notification(db: Session, user_type: str, user_id: str, notification_id: int) -> bool:
    row = db.query(NotificationLog).filter(
        NotificationLog.id == notification_id,
        NotificationLog.user_type == user_type,
        NotificationLog.user_id == str(user_id),
    ).first()
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def bulk_delete_notifications(db: Session, user_type: str, user_id: str, ids: List[int]) -> int:
    count = db.query(NotificationLog).filter(
        NotificationLog.user_type == user_type,
        NotificationLog.user_id == str(user_id),
        NotificationLog.id.in_(ids),
    ).delete(synchronize_session=False)
    db.commit()
    return count
