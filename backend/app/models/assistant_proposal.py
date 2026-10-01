"""A thing the admin assistant WANTS to do, waiting for a human to press Confirm.

The model can only create these (through a propose_* tool). Nothing runs until the same admin calls
POST /admin/assistant/execute with the proposal id. The arguments live here, never in the request, so the Confirm card cannot be
edited on the way (tampering) and an id works exactly once.
"""
import uuid

from sqlalchemy import JSON, Column, Integer, String, Text, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID

from app.database.session import Base


class AssistantProposal(Base):
    __tablename__ = "assistant_proposals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id = Column(String, nullable=False, index=True)                 # the only admin who may execute it
    conversation_id = Column(String, nullable=True, index=True)
    tool = Column(String, nullable=False)
    args = Column(JSON, nullable=False)                                    # validated, normalised arguments
    args_hash = Column(String, nullable=False)                             # sha256(tool + args + admin), checked again at execute time
    summary = Column(Text, nullable=False)                                 # written by the SERVER from the validated args, not by the model
    risk = Column(String, nullable=False, default="medium")               # low | medium | high | sensitive
    status = Column(String, nullable=False, default="PENDING", index=True)   # PENDING | EXECUTED | FAILED | DISMISSED | EXPIRED
    result = Column(JSON, nullable=True)                                   # short outcome (never an OTP)
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    decided_at = Column(TIMESTAMP(timezone=True), nullable=True)
