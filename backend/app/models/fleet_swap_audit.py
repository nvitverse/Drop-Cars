from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, TIMESTAMP, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database.session import Base
import uuid

class FleetDriverSwapAudit(Base):
    __tablename__ = "fleet_driver_swap_audit"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    driver_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    old_owner_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    new_owner_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    initiated_by = Column(String, nullable=False, default="OWNER")  # OWNER, DRIVER, ADMIN
    otp_code = Column(String, nullable=True)
    otp_expires_at = Column(TIMESTAMP, nullable=True)
    otp_attempts = Column(Integer, nullable=False, default=0)
    is_verified = Column(Boolean, nullable=False, default=False)
    admin_override = Column(Boolean, nullable=False, default=False)
    admin_override_reason = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="PENDING_OTP")  # PENDING_OTP, COMPLETED, LOCKED, EXPIRED, CANCELLED
    created_at = Column(TIMESTAMP, nullable=False, default=datetime.utcnow)
    completed_at = Column(TIMESTAMP, nullable=True)
