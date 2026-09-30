from sqlalchemy import Column, String, TIMESTAMP, Integer, func, Enum as SqlEnum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from app.database.session import Base


class WalletEntryTypeEnum(str, enum.Enum):
    CREDIT = "CREDIT"
    DEBIT = "DEBIT"


class WalletLedger(Base):
    __tablename__ = "wallet_ledger"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=False)
    reference_id = Column(String, nullable=True)  # e.g., Razorpay payment/order id or assignment id
    reference_type = Column(String, nullable=True)  # e.g., RAZORPAY_PAYMENT, ORDER_ACCEPT
    entry_type = Column(SqlEnum(WalletEntryTypeEnum, name="wallet_entry_type_enum"), nullable=False)
    amount = Column(Integer, nullable=False)
    balance_before = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


