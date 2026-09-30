# models/vendor.py
from sqlalchemy import Column, String, TIMESTAMP, Integer, func, Boolean, Enum as SqlEnum
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from app.database.session import Base

class AccountStatusEnum(enum.Enum):
    ACTIVE = "Active"
    INACTIVE = "Inactive"
    PENDING = "Pending"
    
class VendorCredentials(Base):
    __tablename__ = "vendor"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    # Human-friendly registration number, e.g. 2600042 (YY + serial of the year)
    reg_id = Column(String, unique=True, nullable=True, index=True)
    # Optional email (for OTP password reset + notifications); verified via emailed code
    email = Column(String, nullable=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    # organization_id = Column(String)
    primary_number = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    account_status = Column(
        SqlEnum(AccountStatusEnum, name="account_status_enum"),
        default=AccountStatusEnum.PENDING,
        nullable=False
    )
    # Set only when an admin deliberately blocks this account (as opposed to
    # it just never having been activated) - lets the Inactive tab show a
    # "Blocked" sub-section instead of lumping both cases together. Null =
    # not manually blocked. See crud/auto_verify.py for the related
    # auto-verify hook (Active/Pending distinction once that ships).
    blocked_reason = Column(String, nullable=True)
    # Permanent block (fraud/confirmed-bad-actor) - distinct from the normal
    # blocked_reason above, which is easily reversible via the everyday
    # Active/Inactive toggle. This is a deliberate, separate flag.
    permanently_blocked = Column(Boolean, nullable=False, default=False, server_default="false")
    permanently_blocked_reason = Column(String, nullable=True)
    token_version = Column(Integer,nullable=False,default=0)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    
