# models/customer.py
from sqlalchemy import Column, String, TIMESTAMP, Integer, func, Boolean
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class CustomerCredentials(Base):
    __tablename__ = "customer"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    primary_number = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    email = Column(String, nullable=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    token_version = Column(Integer, nullable=False, default=1)

    # Hybrid auth (Google Sign-In / Phone OTP) - additive, existing
    # email+password rows are untouched (default 'email_smtp'). A Google-
    # or Phone-signed-up account still gets a hashed_password row (a random
    # unusable one, same trick already used by find_or_create_guest_customer
    # for website bookings) - NOT a nullable column change, so this can
    # never break the existing NOT NULL constraint or any code that reads it.
    auth_provider = Column(String, nullable=False, server_default='email_smtp')
    google_sub = Column(String, unique=True, nullable=True)  # Google's stable per-user ID ("sub" claim) - non-Firebase fallback path, see utils/google_signin.py
    firebase_uid = Column(String, unique=True, nullable=True)  # Firebase's stable per-user ID - the PRIMARY hybrid-auth path, see utils/firebase_admin_auth.py
    phone_verified = Column(Boolean, nullable=False, server_default='false')
    # None = auto (email_push if an email is on file, else sms) - matches
    # utils/notification_dispatch.py's Condition 1/3. 'email_push' or 'sms'
    # once the customer picks explicitly in Profile/Settings.
    notification_preference = Column(String, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
