# models/car_driver.py
from sqlalchemy import Column, String, Text, Integer, Float, TIMESTAMP, Date, func, Boolean, Enum as SqlEnum, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from app.database.session import Base
import uuid
import enum
from app.models.common_enums import DocumentStatusEnum
class AccountStatusEnum(enum.Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    DRIVING = "DRIVING"
    BLOCKED = "BLOCKED"
    PROCESSING = "PROCESSING"


class CarDriver(Base):
    __tablename__ = "car_driver"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    # Human-friendly registration number, e.g. 2600042 (YY + serial of the year)
    reg_id = Column(String, unique=True, nullable=True, index=True)
    # Optional email (for OTP password reset + notifications); verified via emailed code
    email = Column(String, nullable=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=False)
    full_name = Column(String, nullable=False)
    primary_number = Column(String, nullable=False, unique=True)
    secondary_number = Column(String, nullable=True, unique=True)
    hashed_password = Column(String, nullable=False)
    licence_number = Column(String, nullable=False, unique=True)
    licence_front_img = Column(String, nullable=True, unique=True)
    licence_front_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    # 'MANUAL' or 'API_AUTO' once set - null means not yet verified either
    # way. See crud/auto_verify.py - the auto-verify API isn't wired yet
    # (no API key), this column just leaves room for it.
    licence_verification_source = Column(String, nullable=True)
    # Optional - added later so existing drivers are unaffected
    licence_back_img = Column(String, nullable=True, unique=True)
    manual_inactive_reason = Column(Text, nullable=True)   # a person switched this driver off (reason shown to the owner)
    auto_inactive_reason = Column(Text, nullable=True)     # low customer rating (daily sweep)
    # Police Verification Certificate: what makes a DRIVER "Verified" (together with the licence)
    police_verification_img = Column(String, nullable=True)
    police_verification_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    document_notes = Column(Text, nullable=True)  # JSON {doc: why it is INVALID / waiting} - see crud/document_notes.py
    licence_back_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    # Expiry date for the daily document-expiry reminder sweep (see
    # crud/document_expiry.py). Nullable - not every existing driver has
    # this entered yet; the reminder simply skips rows with no date set.
    licence_expiry_date = Column(Date, nullable=True)
    # Aadhaar (front/back + number) - collected when the owner adds a duty
    # driver (same fields the fleet-owner signup already has). Nullable so
    # every existing driver row is unaffected.
    aadhar_number = Column(String, nullable=True)
    aadhar_front_img = Column(String, nullable=True)
    aadhar_front_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    aadhar_back_img = Column(String, nullable=True)
    aadhar_back_status = Column(SqlEnum(DocumentStatusEnum, name="document_status_enum"), nullable=True, default=DocumentStatusEnum.PENDING)
    # Selfie/profile photo, compared against licence_front_img's printed
    # photo for a face-match check (added 2026-09-04, zero-cost - see
    # utils/document_verifier.py's compare_faces).
    profile_img = Column(String, unique=True, nullable=True)
    # Permanent block (fraud/confirmed-bad-actor) - distinct from the normal
    # BLOCKED driver_status, which is easily reversible via the everyday
    # toggle. This is a deliberate, separate flag so a permanently-blocked
    # driver stands out (e.g. from a fake-document upload) and isn't
    # accidentally un-blocked by a routine status toggle.
    permanently_blocked = Column(Boolean, nullable=False, default=False, server_default="false")
    permanently_blocked_reason = Column(String, nullable=True)
    # True when this driver record represents the fleet owner driving their own car
    is_owner_driver = Column(Boolean, nullable=False, default=False, server_default="false")
    address = Column(String, nullable=False)
    city = Column(String, nullable=False)
    pincode = Column(String, nullable=False)
    driver_status = Column(
        SqlEnum(AccountStatusEnum, name="driver_status_enum"),
        default=AccountStatusEnum.OFFLINE,
        nullable=False
    )  # Online, Offline, Driving, Blocked, Processing
    token_version = Column(Integer,nullable=False,default=0)
    # Firebase Phone Auth - see api/routes/car_driver.py's
    # /cardriver/firebase/verify. A driver record is never CREATED by this
    # flow (drivers are added by their fleet owner via the existing
    # add-driver flow, with real KYC docs) - Firebase here only verifies an
    # EXISTING driver's phone ownership and issues a session, same as the
    # password signin already does.
    auth_provider = Column(String, nullable=False, server_default='password')
    firebase_uid = Column(String, unique=True, nullable=True)
    # Aggregate customer rating (1.0-5.0 stars), recomputed whenever a new
    # Rating row is submitted for a trip this driver completed.
    rating_avg = Column(Float, nullable=False, default=0.0, server_default="0")
    rating_count = Column(Integer, nullable=False, default=0, server_default="0")
    wallet_balance = Column(Integer, nullable=False, default=0, server_default="0")
    subscription_tier = Column(String, nullable=True, default="FREE", server_default="FREE")
    subscription_expires_at = Column(TIMESTAMP(timezone=True), nullable=True)
    auto_renew_from_wallet = Column(Boolean, nullable=False, default=True, server_default="true")
    pending_profile_edits = Column(JSON, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
