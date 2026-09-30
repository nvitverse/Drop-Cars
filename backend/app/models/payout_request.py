# models/payout_request.py
"""
A fleet owner's self-serve request to cash out their wallet balance.
Manual settlement for now - admin pays the owner outside the app (bank
transfer/UPI) and marks the request Paid here, same as every other
manual-money pattern in this codebase (ADMIN_ADD_MONEY, registration fees).
No payment-API integration.
"""
from sqlalchemy import Column, String, TIMESTAMP, Integer, Boolean, func, ForeignKey, Enum as SqlEnum
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from app.database.session import Base


class PayoutRequestStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    REJECTED = "REJECTED"


class PayoutRequest(Base):
    __tablename__ = "payout_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Exactly one of these two is set - vehicle_owner_id for a fleet-owner
    # payout, vendor_id for a vendor payout. Kept nullable/dual rather than a
    # separate table per role, to reuse one status/admin-review flow.
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=True, index=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendor.id"), nullable=True, index=True)
    amount = Column(Integer, nullable=False)
    status = Column(SqlEnum(PayoutRequestStatusEnum, name="payout_request_status_enum"), nullable=False, default=PayoutRequestStatusEnum.PENDING)
    requested_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    processed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    processed_by_admin_id = Column(UUID(as_uuid=True), ForeignKey("admin.id"), nullable=True)
    notes = Column(String, nullable=True)
    # How admin actually paid it out (UPI/BANK) - a label only, no real
    # payment processing happens in-app.
    paid_via = Column(String, nullable=True)
    # True when admin paid someone directly with a remark, without the
    # user having submitted a PENDING request first.
    initiated_by_admin = Column(Boolean, nullable=False, default=False)
