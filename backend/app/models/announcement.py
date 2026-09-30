# models/announcement.py
"""
Admin -> driver broadcast messages, shown when the Driver App is opened
(GET /announcements/active). Simple flat list, no per-driver targeting -
admin turns one on/off with `active`; an optional `expires_at` auto-hides it
without needing a follow-up admin action.
"""
from sqlalchemy import Column, String, TIMESTAMP, Integer, Text, Boolean, func
from app.database.session import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=True)
