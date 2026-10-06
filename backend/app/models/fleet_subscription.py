from sqlalchemy import Column, String, TIMESTAMP, Integer, Date, Boolean, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class FleetSubscriptionHistory(Base):
    __tablename__ = "fleet_subscription_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    vehicle_owner_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    event_type = Column(String, nullable=False)  # 'MANUAL_PAYMENT', 'PAUSED', 'RESUMED', 'TRUSTED_OVERRIDE'
    payment_channel = Column(String, nullable=True)  # 'GPay', 'PhonePe', 'Bank Transfer', 'Cash', 'Razorpay', etc.
    payment_ref = Column(String, nullable=True)  # UTR, Transaction ID, Receipt #
    amount = Column(Numeric(10, 2), nullable=True)
    plan_type = Column(String, nullable=True)  # 'MONTHLY', 'YEARLY', 'CUSTOM'
    duration_days = Column(Integer, nullable=True)
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    is_trusted = Column(Boolean, default=False)
    reason = Column(Text, nullable=True)
    admin_id = Column(UUID(as_uuid=True), nullable=True)
    admin_username = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False, index=True)
