from datetime import datetime
import uuid
from sqlalchemy import Column, Integer, String, Boolean, TIMESTAMP, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database.session import Base

class FleetDriverSwapAudit(Base):
    __tablename__ = "fleet_driver_swap_audit"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    swap_uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False, index=True)
    swap_type = Column(String, nullable=False, default="DRIVER")  # "DRIVER" or "CAR"
    driver_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    car_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    car_number = Column(String, nullable=True, index=True)
    old_owner_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    new_owner_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    initiated_by = Column(String, nullable=False, default="OWNER")  # OWNER, DRIVER, ADMIN
    otp_hash = Column(String, nullable=True)  # Cryptographic hash of the OTP
    otp_salt = Column(String, nullable=True)
    otp_expires_at = Column(TIMESTAMP, nullable=True)
    otp_attempts = Column(Integer, nullable=False, default=0)
    is_verified = Column(Boolean, nullable=False, default=False)
    admin_override = Column(Boolean, nullable=False, default=False)
    admin_override_reason = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="PENDING_OTP")  # PENDING_OTP, COMPLETED, LOCKED, EXPIRED, CANCELLED
    created_at = Column(TIMESTAMP, nullable=False, default=datetime.utcnow)
    completed_at = Column(TIMESTAMP, nullable=True)
