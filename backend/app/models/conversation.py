"""Unified conversations (WhatsApp-style) for every Drop Cars app.

One model for every kind of chat:
  BOOKING    group around one booking: customer + poster (vendor / fleet owner) + accepting fleet owner + driver
             (+ admin, + bot later)
  SUPPORT    one user (customer / driver / fleet owner / vendor) <-> the Drop Cars admin team
  STAFF      internal: staff <-> staff, staff <-> director, small groups (members + the director only)
  DIRECT     reserved for 1:1 chats created on demand
  BROADCAST  admin / vendor -> a group of drivers (schema ready, endpoints later)

The older tables (booking_chat_messages, support_messages) keep working for shipped apps; routes dual-write
into these tables (see crud/chat_bridge.py) so nothing is lost and both generations of apps see the same chat.
"""
import uuid

from sqlalchemy import (
    BigInteger, Boolean, Column, ForeignKey, Integer, JSON, String, Text, TIMESTAMP, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database.session import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type = Column(String, nullable=False, index=True)             # BOOKING | SUPPORT | STAFF | DIRECT | BROADCAST
    # Idempotency: "BOOKING:123", "SUPPORT:DRIVER:<id>", "STAFF:direct:<a>:<b>" - get-or-create never duplicates.
    subject_key = Column(String, nullable=True, unique=True, index=True)
    title = Column(String, nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    created_by_role = Column(String, nullable=True)
    created_by_id = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    last_message_id = Column(BigInteger, nullable=True)
    last_message_at = Column(TIMESTAMP(timezone=True), nullable=True, index=True)
    last_message_preview = Column(String, nullable=True)
    is_closed = Column(Boolean, nullable=False, default=False, server_default="false")
    meta = Column(JSON, nullable=True)


class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"
    __table_args__ = (UniqueConstraint("conversation_id", "role", "principal_id", name="uq_conversation_participant"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False, index=True)
    role = Column(String, nullable=False)                          # CUSTOMER | DRIVER | FLEET_OWNER | VENDOR | STAFF | DIRECTOR | BOT
    principal_id = Column(String, nullable=False, index=True)      # that person's account id
    display_name = Column(String, nullable=True)
    joined_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    # Read receipts: everything up to this message id has been opened by this participant.
    last_read_message_id = Column(BigInteger, nullable=False, default=0, server_default="0")
    muted_until = Column(TIMESTAMP(timezone=True), nullable=True)
    blocked = Column(Boolean, nullable=False, default=False, server_default="false")


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"
    __table_args__ = (UniqueConstraint("legacy_source", "legacy_id", name="uq_conversation_message_legacy"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False, index=True)
    sender_role = Column(String, nullable=False)                   # a participant role, BOT, or SYSTEM
    sender_id = Column(String, nullable=True)
    sender_name = Column(String, nullable=True)
    kind = Column(String, nullable=False, default="TEXT")          # TEXT | VOICE | IMAGE | SYSTEM | BOT | QUICK
    text = Column(Text, nullable=False)
    reply_to_id = Column(BigInteger, nullable=True)
    masked = Column(Boolean, nullable=False, default=False, server_default="false")   # a phone number was hidden
    meta = Column(JSON, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False, index=True)
    deleted_at = Column(TIMESTAMP(timezone=True), nullable=True)
    # Set when this row is a copy of an older-table message (booking_chat_messages / support_messages).
    legacy_source = Column(String, nullable=True)                  # "booking_chat" | "support"
    legacy_id = Column(Integer, nullable=True)


class ConversationAttachment(Base):
    __tablename__ = "conversation_attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id = Column(BigInteger, ForeignKey("conversation_messages.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)                          # VOICE | IMAGE
    url = Column(String, nullable=False)
    mime = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
