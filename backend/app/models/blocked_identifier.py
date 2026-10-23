"""Identifiers (phone, e-mail, Aadhaar, PAN, licence, vehicle number) of accounts that were blocked for good.

When an account is permanently blocked its documents are erased, but WHO it was must not be forgotten, otherwise the same person can sign up
again with the same phone / Aadhaar / licence / vehicle. We keep only a salted hash of each identifier (plus the last 4 characters, so staff can
recognise it) - never the document or the number itself.
"""
import uuid

from sqlalchemy import Column, String, Text, TIMESTAMP, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID

from app.database.session import Base


class BlockedIdentifier(Base):
    __tablename__ = "blocked_identifiers"
    __table_args__ = (UniqueConstraint("id_type", "id_hash", name="uq_blocked_identifier"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    id_type = Column(String(12), nullable=False, index=True)       # PHONE | EMAIL | AADHAAR | PAN | LICENCE | VEHICLE
    id_hash = Column(String(64), nullable=False, index=True)       # HMAC-SHA256 of the normalised value
    hint = Column(String(8), nullable=True)                        # last 4 characters, for staff only
    reason = Column(Text, nullable=True)
    blocked_by = Column(String, nullable=True)                     # admin name
    source_account_type = Column(String(20), nullable=True)        # vehicle_owner | vendor | driver
    source_account_id = Column(String, nullable=True, index=True)  # so an un-block can lift exactly these entries
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
