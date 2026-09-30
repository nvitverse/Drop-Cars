# models/phone_otp.py
"""One-time codes sent by SMS - sibling of models/email_otp.py, same shape,
used for the Customer App's Phone Sign-In/verify flow (see
api/routes/hybrid_auth.py). Kept as its own table rather than reusing
EmailOtp (which is explicitly scoped to email delivery, and to the
vehicle_owner/driver/vendor roles only, not customer)."""
from sqlalchemy import Column, String, Integer, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID
import uuid

from app.database.session import Base


class PhoneOtp(Base):
    __tablename__ = "phone_otps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    primary_number = Column(String, nullable=False, index=True)
    code = Column(String, nullable=False)
    purpose = Column(String, nullable=False)  # "signin" | "link_phone"
    attempts = Column(Integer, nullable=False, default=0)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
