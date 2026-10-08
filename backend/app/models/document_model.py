"""A document approved by staff as the reference for what a genuine one looks like (e.g. "Karnataka RC", "Kerala Permit").
Later uploads of the same kind that look like a saved model are verified automatically - see utils/doc_model.py."""
import uuid

from sqlalchemy import Boolean, Column, Integer, JSON, String, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID

from app.database.session import Base


class DocumentModel(Base):
    __tablename__ = "document_models"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    doc_kind = Column(String, nullable=False, index=True)       # rc, insurance, fc, permit, licence, police, aadhar, pan
    label = Column(String, nullable=False)                      # "Karnataka RC" - one kind can have many models (one per state / format)
    fingerprint = Column(JSON, nullable=False)                  # colour histogram + layout hash + aspect (utils/doc_model.fingerprint)
    source_url = Column(String, nullable=True)                  # the approved document it was made from (staff can look at it again)
    created_by = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    match_count = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
