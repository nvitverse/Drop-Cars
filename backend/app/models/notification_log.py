# models/notification_log.py
from sqlalchemy import Column, String, Boolean, Integer, TIMESTAMP, func
from app.database.session import Base


class NotificationLog(Base):
    """In-app notification history (Phase 06 / UX Area 03) - separate from
    the `notifications` table above, which only stores push tokens/settings.
    One row per notification actually sent to a user, so the app can show an
    inbox instead of only a fire-and-forget push. user/sub match the same
    (user_type, id) pairing used everywhere else in this file (e.g. "driver"/
    driver_id, "vehicle_owner"/vehicle_owner_id)."""
    __tablename__ = "notification_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_type = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(String, nullable=False)
    event_key = Column(String, nullable=True)
    action_required = Column(Boolean, nullable=False, server_default='false')
    is_read = Column(Boolean, nullable=False, server_default='false')
    related_order_id = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
