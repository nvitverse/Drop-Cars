# models/customer_wallet_topup.py
from sqlalchemy import Column, String, TIMESTAMP, func, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class CustomerWalletTopup(Base):
    """One row per Razorpay order successfully verified against
    /subscriptions/wallet/topup/verify. rp_order_id is unique so a replayed
    verify call for the same order (same valid signature, called twice)
    raises an IntegrityError instead of crediting the wallet a second time -
    Razorpay order ids are per-attempt, so this is also a natural
    transaction log for a future wallet history screen."""
    __tablename__ = "customer_wallet_topup"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customer.id"), nullable=False)
    rp_order_id = Column(String, unique=True, nullable=False, index=True)
    rp_payment_id = Column(String, nullable=False)
    amount = Column(Integer, nullable=False)  # rupees credited
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
