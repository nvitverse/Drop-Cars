"""A partner / driver says "I paid by UPI / bank directly" - the money is in our bank but nothing in the system knows who it is for.

Before this, the manual UPI ID in the Wallet screen took the money and told nobody (a driver paid Rs 210 for the Trusted plan to the UPI ID
after Razorpay declined his card, and stayed Standard with an empty wallet). Now the app asks for the UTR (+ an optional screenshot), staff see the
claim in the Admin App, check it against the bank statement and with ONE tap credit the wallet / switch the plan on."""
import uuid

from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID

from app.database.session import Base


class PaymentClaim(Base):
    __tablename__ = "payment_claims"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)                      # rupees the person says they paid
    utr = Column(String(40), nullable=False, unique=True, index=True)   # UPI reference / UTR - one claim per payment
    method = Column(String(20), nullable=False, default="UPI")    # UPI | BANK
    purpose = Column(String(30), nullable=False, default="WALLET")  # WALLET | SUBSCRIPTION_MONTHLY | SUBSCRIPTION_YEARLY | OTHER
    note = Column(Text, nullable=True)
    screenshot_url = Column(String, nullable=True)
    screenshot_scan = Column(Text, nullable=True)                 # JSON: UTR / amount / paid-to read from the screenshot (the text itself is not kept)
    status = Column(String(12), nullable=False, default="PENDING", index=True)   # PENDING | APPROVED | REJECTED
    decided_by = Column(String, nullable=True)
    decided_at = Column(TIMESTAMP(timezone=True), nullable=True)
    decision_note = Column(Text, nullable=True)                   # shown to the person (why it was rejected / what was done)
    credited_amount = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
