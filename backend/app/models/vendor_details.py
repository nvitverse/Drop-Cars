# models/vendor_details.py
from sqlalchemy import Column, String, Text, TIMESTAMP, Integer, func, Boolean, Enum as SqlEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from app.database.session import Base
from app.models.common_enums import DocumentStatusEnum

class VendorDetails(Base):
    __tablename__ = "vendor_details"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendor.id"), nullable=False)
    full_name = Column(String, nullable=False)
    # Shown to drivers/duty-drivers as "Vendor: X" instead of the vendor's
    # personal name, wherever set. Optional - falls back to full_name
    # everywhere vendor_name is populated (see crud/order_details.py,
    # crud/order_assignments.py).
    business_name = Column(String, nullable=True)
    manual_inactive_reason = Column(Text, nullable=True)   # a person switched this vendor off
    primary_number = Column(String, unique=True, nullable=False)
    secondary_number = Column(String, unique=True, nullable=True)
    wallet_balance = Column(Integer, nullable=False, default=0)
    bank_balance = Column(Integer, nullable=False, default=0)
    gpay_number = Column(String, unique=True, nullable=False)
    aadhar_number = Column(String, unique=True, nullable=False)
    aadhar_front_img = Column(String, unique=True, nullable=True)
    aadhar_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    # 'MANUAL' or 'API_AUTO' once set - null means not yet verified either
    # way. See crud/auto_verify.py - the auto-verify API isn't wired yet
    # (no API key), this column just leaves room for it.
    aadhar_verification_source = Column(String, nullable=True)
    address = Column(String, nullable=False)
    city = Column(String, nullable=False)
    pincode = Column(String, nullable=False)
    # Payout destination - either bank OR UPI is enough, both nullable/optional.
    bank_account_number = Column(String, nullable=True)
    bank_ifsc = Column(String, nullable=True)
    bank_account_holder_name = Column(String, nullable=True)
    upi_id = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    
