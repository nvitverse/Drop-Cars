from sqlalchemy import Column, String, TIMESTAMP, Integer, func, ForeignKey, Enum as SqlEnum
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from app.database.session import Base


class VendorLedgerEntryType(str, enum.Enum):
    CREDIT = "CREDIT"
    DEBIT = "DEBIT"


class VendorWalletLedger(Base):
    __tablename__ = "vendor_wallet_ledger"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendor.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    entry_type = Column(SqlEnum(VendorLedgerEntryType, name="vendor_wallet_entry_type_enum"), nullable=False)
    amount = Column(Integer, nullable=False)
    balance_before = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    notes = Column(String, nullable=True)
    # Same pattern as WalletLedger (the vehicle-owner wallet's ledger) -
    # without these, entries like a "DRIVER_PAYOUT_HOLD" hold can't be
    # distinguished from a regular trip credit/debit, so code that later
    # needs to find and release a specific hold for a specific order has
    # nothing to query against.
    reference_id = Column(String, nullable=True)  # e.g. an order id
    reference_type = Column(String, nullable=True)  # e.g. DRIVER_PAYOUT_HOLD
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


