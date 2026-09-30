# models/transfer_transactions.py
from sqlalchemy import Column, String, TIMESTAMP, Integer, func, Boolean, Enum as SqlEnum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from app.database.session import Base

class TransferStatusEnum(enum.Enum):
    PENDING = "Pending"
    APPROVED = "Approved"
    REJECTED = "Rejected"

class TransferTransactions(Base):
    __tablename__ = "transfer_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendor.id"), nullable=False)
    requested_amount = Column(Integer, nullable=False)
    wallet_balance_before = Column(Integer, nullable=False)
    bank_balance_before = Column(Integer, nullable=False)
    wallet_balance_after = Column(Integer, nullable=True)  # Updated after approval/rejection
    bank_balance_after = Column(Integer, nullable=True)    # Updated after approval/rejection
    status = Column(
        SqlEnum(TransferStatusEnum, name="transfer_status_enum"),
        default=TransferStatusEnum.PENDING,
        nullable=False
    )
    admin_notes = Column(Text, nullable=True)  # Admin can add notes when approving/rejecting
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
