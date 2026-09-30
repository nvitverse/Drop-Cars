# models/admin_wallet_ledger.py
from sqlalchemy import Column, String, TIMESTAMP, Integer, func, Enum as SqlEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from app.database.session import Base

class AdminLedgerEntryType(str, enum.Enum):
    CREDIT = "CREDIT"
    DEBIT = "DEBIT"

class AdminWalletLedger(Base):
    __tablename__ = "admin_wallet_ledger"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    admin_id = Column(UUID(as_uuid=True), ForeignKey("admin.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    entry_type = Column(SqlEnum(AdminLedgerEntryType, name="admin_wallet_entry_type_enum"), nullable=False)
    amount = Column(Integer, nullable=False)
    balance_before = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    notes = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

