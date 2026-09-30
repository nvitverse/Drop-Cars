from sqlalchemy import Column, String, TIMESTAMP, Integer, func, Enum as SqlEnum, ForeignKey, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from app.database.session import Base


class RazorpayPaymentStatusEnum(str, enum.Enum):
    CREATED = "created"
    AUTHORIZED = "authorized"
    CAPTURED = "captured"
    FAILED = "failed"
    REFUNDED = "refunded"


class RazorpayTransaction(Base):
    __tablename__ = "razorpay_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=False)

    # Razorpay identifiers
    rp_order_id = Column(String, nullable=False, index=True)
    rp_payment_id = Column(String, nullable=True, index=True)
    rp_signature = Column(String, nullable=True)

    amount = Column(Integer, nullable=False)  # in paise
    currency = Column(String, nullable=False, default="INR")

    status = Column(SqlEnum(RazorpayPaymentStatusEnum, name="razorpay_payment_status_enum"), nullable=False, default=RazorpayPaymentStatusEnum.CREATED)
    captured = Column(Boolean, nullable=False, default=False)

    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


