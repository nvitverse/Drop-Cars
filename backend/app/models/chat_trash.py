"""A chat the staff moved to Trash (problem solved / booking finished). Kept for 30 days, then the conversation is deleted for good
(crud/chat_trash.py). A new message from the driver / owner brings a support thread back out of the Trash by itself."""
import uuid

from sqlalchemy import Column, String, TIMESTAMP, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID

from app.database.session import Base


class ChatTrash(Base):
    __tablename__ = "chat_trash"
    __table_args__ = (UniqueConstraint("thread_type", "thread_key", name="uq_chat_trash_thread"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    thread_type = Column(String, nullable=False, index=True)    # SUPPORT | BOOKING
    thread_key = Column(String, nullable=False, index=True)     # support thread key, or the booking (order) id as text
    reason = Column(String, nullable=True)                      # SOLVED | MANUAL
    trashed_by = Column(String, nullable=True)
    trashed_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
