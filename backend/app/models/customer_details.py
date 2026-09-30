# models/customer_details.py
from sqlalchemy import Column, String, TIMESTAMP, func, ForeignKey, JSON, Enum as SqlEnum, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from app.database.session import Base


class CustomerSegmentEnum(enum.Enum):
    INDIVIDUAL = "INDIVIDUAL"
    B2B = "B2B"
    CORPORATE = "CORPORATE"


class CustomerDetails(Base):
    __tablename__ = "customer_details"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customer.id"), nullable=False)
    full_name = Column(String, nullable=False)
    primary_number = Column(String, unique=True, nullable=False)
    # Saved addresses for quick rebooking, e.g. [{"label": "Home", "address": "..."}]
    saved_addresses = Column(JSON, nullable=True)
    # Admin-set segment (no self-serve B2B signup flow exists yet - an admin
    # tags a customer as B2B/Corporate manually after onboarding them, e.g.
    # over a call). company_name/gst_number are only meaningful for those
    # two segments, left blank for INDIVIDUAL.
    segment = Column(SqlEnum(CustomerSegmentEnum, name="customer_segment_enum"), nullable=False, default=CustomerSegmentEnum.INDIVIDUAL, server_default="INDIVIDUAL")
    company_name = Column(String, nullable=True)
    gst_number = Column(String, nullable=True)
    wallet_balance = Column(Integer, nullable=False, default=0, server_default="0")
    subscription_tier = Column(String, nullable=True, default="FREE", server_default="FREE")
    subscription_expires_at = Column(TIMESTAMP(timezone=True), nullable=True)
    auto_renew_from_wallet = Column(Boolean, nullable=False, default=True, server_default="true")
    is_verified_carpooler = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
