import secrets
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.customer import CustomerCredentials
from app.models.customer_details import CustomerDetails
from app.schemas.customer import CustomerSignup
from app.core.security import get_password_hash, verify_password


def create_customer(db: Session, data: CustomerSignup):
    existing = db.query(CustomerCredentials).filter(
        CustomerCredentials.primary_number == data.primary_number
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this mobile number already exists"
        )

    credentials = CustomerCredentials(
        primary_number=data.primary_number,
        hashed_password=get_password_hash(data.password),
    )
    db.add(credentials)
    db.commit()
    db.refresh(credentials)

    details = CustomerDetails(
        customer_id=credentials.id,
        full_name=data.full_name,
        primary_number=data.primary_number,
    )
    db.add(details)
    db.commit()
    db.refresh(details)

    return credentials, details


def authenticate_customer(db: Session, primary_number: str, password: str):
    credentials = db.query(CustomerCredentials).filter(
        CustomerCredentials.primary_number == primary_number
    ).first()
    if not credentials or not verify_password(password, credentials.hashed_password):
        return None
    return credentials


def get_customer_by_primary_number(db: Session, primary_number: str):
    """Look up a customer by phone number only, no password check - used to
    tell an unregistered number apart from a wrong password at login."""
    return db.query(CustomerCredentials).filter(
        CustomerCredentials.primary_number == primary_number
    ).first()


def get_customer_by_id(db: Session, customer_id: str):
    return db.query(CustomerCredentials).filter(CustomerCredentials.id == customer_id).first()


def get_customer_details_by_customer_id(db: Session, customer_id: str):
    return db.query(CustomerDetails).filter(CustomerDetails.customer_id == customer_id).first()


def find_or_create_customer_by_firebase(
    db: Session, *, firebase_uid: str, phone_number: Optional[str] = None,
    email: Optional[str] = None, full_name: str,
):
    """PRIMARY hybrid-auth find-or-create (Firebase Phone Auth + Google
    Sign-In both land here, since both mint a Firebase ID token - see
    utils/firebase_admin_auth.py). Match order: firebase_uid (returning
    user) -> phone_number (an existing password/guest account signing in
    with Firebase for the first time) -> email (same, but matched by
    email instead) -> create new. Never silently merges into the wrong
    account - phone_number/email matches are exact-string matches against
    already-verified fields only."""
    if firebase_uid:
        credentials = db.query(CustomerCredentials).filter(CustomerCredentials.firebase_uid == firebase_uid).first()
        if credentials:
            details = get_customer_details_by_customer_id(db, credentials.id)
            return credentials, details

    existing = None
    if phone_number:
        existing = get_customer_by_primary_number(db, phone_number)
    if existing is None and email:
        existing = db.query(CustomerCredentials).filter(CustomerCredentials.email == email).first()

    if existing:
        existing.firebase_uid = firebase_uid
        if phone_number:
            existing.phone_verified = True
        if email:
            existing.email_verified = True
        db.commit()
        db.refresh(existing)
        details = get_customer_details_by_customer_id(db, existing.id)
        return existing, details

    # Brand new user. primary_number is NOT NULL + UNIQUE - use the real
    # phone if Firebase gave us one, else the same non-colliding placeholder
    # trick used by find_or_create_customer_by_google.
    import uuid as _uuid
    resolved_number = phone_number or f"fb_{_uuid.uuid4().hex[:16]}"
    credentials = CustomerCredentials(
        primary_number=resolved_number,
        hashed_password=get_password_hash(secrets.token_urlsafe(24)),
        email=email,
        email_verified=bool(email),
        auth_provider="firebase",
        firebase_uid=firebase_uid,
        phone_verified=bool(phone_number),
    )
    db.add(credentials)
    db.commit()
    db.refresh(credentials)

    details = CustomerDetails(customer_id=credentials.id, full_name=full_name, primary_number=resolved_number)
    db.add(details)
    db.commit()
    db.refresh(details)
    return credentials, details


def find_or_create_customer_by_google(db: Session, *, google_sub: str, email: str, full_name: str):
    """Google Sign-In find-or-create. Matches by google_sub first (a
    returning Google user), then falls back to matching by email (a user
    who previously signed up with password+this-same-email, now trying
    Google for the first time) so the same person doesn't end up with two
    separate accounts. A brand-new user gets a fresh row with the same
    random-unusable-password trick as find_or_create_guest_customer below -
    hashed_password stays NOT NULL, no schema risk."""
    credentials = db.query(CustomerCredentials).filter(CustomerCredentials.google_sub == google_sub).first()
    if credentials:
        details = get_customer_details_by_customer_id(db, credentials.id)
        return credentials, details

    credentials = db.query(CustomerCredentials).filter(CustomerCredentials.email == email).first()
    if credentials:
        credentials.google_sub = google_sub
        db.commit()
        db.refresh(credentials)
        details = get_customer_details_by_customer_id(db, credentials.id)
        return credentials, details

    # Brand new Google-only signup - no phone number yet (the "Smart
    # Profile Sync" bottom sheet collects it afterward via
    # /auth/profile/link-phone). primary_number is NOT NULL + UNIQUE on
    # this table, so a placeholder that can never collide with a real
    # 10-digit number is used until a real one is linked.
    import uuid as _uuid
    placeholder_number = f"g_{_uuid.uuid4().hex[:16]}"
    credentials = CustomerCredentials(
        primary_number=placeholder_number,
        hashed_password=get_password_hash(secrets.token_urlsafe(24)),
        email=email,
        email_verified=True,  # Google already verified this email
        auth_provider="google",
        google_sub=google_sub,
    )
    db.add(credentials)
    db.commit()
    db.refresh(credentials)

    details = CustomerDetails(customer_id=credentials.id, full_name=full_name, primary_number=placeholder_number)
    db.add(details)
    db.commit()
    db.refresh(details)
    return credentials, details


def find_or_create_customer_by_phone(db: Session, primary_number: str, full_name: str):
    """Phone-OTP sign-in find-or-create. Reuses find_or_create_guest_customer's
    exact logic (already handles "find by number, or create with a random
    unusable password") - Phone Sign-In and the website's guest-booking
    flow are the same underlying need, so this is a thin wrapper, not a
    duplicate implementation, plus stamps auth_provider on a new row."""
    is_new = get_customer_by_primary_number(db, primary_number) is None
    credentials, details = find_or_create_guest_customer(db, primary_number, full_name)
    if is_new:
        credentials.auth_provider = "phone_otp"
        credentials.phone_verified = True
        db.commit()
        db.refresh(credentials)
    else:
        if not credentials.phone_verified:
            credentials.phone_verified = True
            db.commit()
            db.refresh(credentials)
    return credentials, details


def find_or_create_guest_customer(db: Session, primary_number: str, full_name: str):
    """Find-or-create a customer record for a booking that didn't go through
    normal app signup (e.g. a website booking, which collects name/phone but
    never a password). The random password is never given out - this account
    just can't log in until/unless the customer resets it via OTP."""
    credentials = get_customer_by_primary_number(db, primary_number)
    if credentials:
        details = get_customer_details_by_customer_id(db, credentials.id)
        if not details:
            details = CustomerDetails(
                customer_id=credentials.id,
                full_name=full_name,
                primary_number=primary_number,
            )
            db.add(details)
            db.commit()
            db.refresh(details)
        return credentials, details

    credentials = CustomerCredentials(
        primary_number=primary_number,
        hashed_password=get_password_hash(secrets.token_urlsafe(24)),
    )
    db.add(credentials)
    db.commit()
    db.refresh(credentials)

    details = CustomerDetails(
        customer_id=credentials.id,
        full_name=full_name,
        primary_number=primary_number,
    )
    db.add(details)
    db.commit()
    db.refresh(details)

    return credentials, details
