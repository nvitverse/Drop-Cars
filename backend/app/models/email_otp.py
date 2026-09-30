# models/email_otp.py
"""One-time codes sent by email (email verification + password reset)."""
from sqlalchemy import Column, String, Integer, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID
import uuid

from app.database.session import Base


class EmailOtp(Base):
    __tablename__ = "email_otps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role = Column(String, nullable=False)            # vehicle_owner | driver | vendor
    primary_number = Column(String, nullable=False, index=True)
    email = Column(String, nullable=False)
    code = Column(String, nullable=False)
    purpose = Column(String, nullable=False)         # verify_email | reset_password
    attempts = Column(Integer, nullable=False, default=0)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
