# api/routes/hybrid_auth.py
"""
Customer App hybrid auth: Firebase Phone Auth + Google Sign-In (via
Firebase), alongside the existing email+password /users/customer/signup|
signin (untouched).

Every flow here ends the same way the existing password flow already
does - issue our own JWT via create_access_token with the same
{"sub", "token_version", "user": "customer"} payload shape and return the
same CustomerTokenResponse - so nothing downstream (get_current_customer,
any customer-authenticated endpoint) needs to know or care which method a
customer used to sign in.

/auth/firebase/verify is the PRIMARY path (direct Firebase, per product
decision - bypasses SMS DLT registration overhead). The earlier
non-Firebase /auth/google/verify + /auth/phone/request-otp|verify-otp
endpoints below are kept working as a documented fallback (see
utils/google_signin.py / utils/sms_gateway.py's module docstrings) - no
functional harm in leaving them, and they were already built + tested.
"""
import random
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.core.limiter import limiter
from app.database.session import get_db
from app.core.security import create_access_token, get_current_customer, CUSTOMER_ACCESS_TOKEN_EXPIRE_MINUTES
from app.schemas.customer import CustomerTokenResponse, CustomerOut
from app.crud.customer import (
    find_or_create_customer_by_google, find_or_create_customer_by_phone, find_or_create_customer_by_firebase,
    get_customer_by_id, get_customer_details_by_customer_id, get_customer_by_primary_number,
)
from app.models.phone_otp import PhoneOtp
from app.utils.google_signin import verify_google_id_token, GoogleAuthNotConfigured, InvalidGoogleToken
from app.utils.firebase_admin_auth import verify_firebase_id_token, FirebaseNotConfigured, InvalidFirebaseToken
from app.utils.sms_gateway import send_sms, sms_gateway_configured, SmsGatewayNotConfigured

router = APIRouter()

OTP_TTL = timedelta(minutes=10)
OTP_MAX_ATTEMPTS = 5


def _issue_customer_session(credentials, details) -> CustomerTokenResponse:
    access_token = create_access_token(
        {"sub": str(credentials.id), "token_version": credentials.token_version, "user": "customer"},
        expires_delta=timedelta(minutes=CUSTOMER_ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return CustomerTokenResponse(
        access_token=access_token,
        customer=CustomerOut(
            id=credentials.id, full_name=details.full_name, primary_number=details.primary_number,
            email=credentials.email, created_at=details.created_at,
        ),
    )


# ---------------------------------------------------------------------------
# FIREBASE VERIFY - the primary hybrid-auth endpoint. Client flow (either
# Phone Auth or Google Sign-In via Firebase - see MODULE 1/2 in the
# frontend deliverable) ends with `await user.getIdToken()`; that token is
# posted here. One endpoint covers both credential types because Firebase
# already unifies them into one ID token shape - the decoded
# `firebase.sign_in_provider` claim ("phone" vs "google.com") is informational
# only, not branched on, since phone_number/email presence in the token
# already tells find_or_create_customer_by_firebase everything it needs.
# ---------------------------------------------------------------------------
class FirebaseVerifyRequest(BaseModel):
    id_token: str
    full_name_fallback: str = "Rider"


@router.post("/auth/firebase/verify", response_model=CustomerTokenResponse)
def firebase_verify(body: FirebaseVerifyRequest, db: Session = Depends(get_db)):
    try:
        payload = verify_firebase_id_token(body.id_token)
    except FirebaseNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except InvalidFirebaseToken as e:
        raise HTTPException(status_code=401, detail=f"Invalid sign-in: {e}")

    phone_number = payload.get("phone_number")
    if phone_number and phone_number.startswith("+91"):
        phone_number = phone_number[3:]  # strip country code - this table stores bare 10-digit numbers

    credentials, details = find_or_create_customer_by_firebase(
        db,
        firebase_uid=payload["uid"],
        phone_number=phone_number,
        email=payload.get("email"),
        full_name=payload.get("name") or body.full_name_fallback,
    )
    return _issue_customer_session(credentials, details)


# ---------------------------------------------------------------------------
# Google Sign-In (non-Firebase fallback - see module docstring)
# ---------------------------------------------------------------------------
class GoogleVerifyRequest(BaseModel):
    id_token: str
    full_name_fallback: str = "Rider"  # used only if Google didn't return a name


@router.post("/auth/google/verify", response_model=CustomerTokenResponse)
def google_verify(body: GoogleVerifyRequest, db: Session = Depends(get_db)):
    try:
        payload = verify_google_id_token(body.id_token)
    except GoogleAuthNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except InvalidGoogleToken as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google sign-in: {e}")

    credentials, details = find_or_create_customer_by_google(
        db, google_sub=payload["sub"], email=payload["email"], full_name=payload.get("name") or body.full_name_fallback,
    )
    return _issue_customer_session(credentials, details)


# ---------------------------------------------------------------------------
# Phone OTP sign-in
# ---------------------------------------------------------------------------
class PhoneOtpRequest(BaseModel):
    primary_number: str = Field(..., min_length=10, max_length=10)


class PhoneOtpVerify(BaseModel):
    primary_number: str = Field(..., min_length=10, max_length=10)
    code: str = Field(..., min_length=4, max_length=8)
    full_name_fallback: str = "Rider"


@router.post("/auth/phone/request-otp")
@limiter.limit("5/minute")
async def phone_request_otp(request: Request, body: PhoneOtpRequest, db: Session = Depends(get_db)):
    if not sms_gateway_configured(db):
        raise HTTPException(status_code=503, detail="Phone sign-in isn't available yet. Please use email/password or contact support.")

    code = f"{random.randint(0, 999999):06d}"
    number = body.primary_number.strip()
    db.query(PhoneOtp).filter(PhoneOtp.primary_number == number, PhoneOtp.purpose == "signin").delete()
    db.add(PhoneOtp(primary_number=number, code=code, purpose="signin", expires_at=datetime.now(timezone.utc) + OTP_TTL))
    db.commit()

    try:
        await send_sms(db, number, f"Your Drop Cars sign-in code is {code}. Valid for 10 minutes.")
    except SmsGatewayNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        raise HTTPException(status_code=502, detail="Could not send the SMS. Please try again.")

    return {"message": f"A 6-digit code was sent to {number[-4:]}. It is valid for 10 minutes."}


@router.post("/auth/phone/verify-otp", response_model=CustomerTokenResponse)
@limiter.limit("10/minute")
def phone_verify_otp(request: Request, body: PhoneOtpVerify, db: Session = Depends(get_db)):
    number = body.primary_number.strip()
    otp = (
        db.query(PhoneOtp)
        .filter(PhoneOtp.primary_number == number, PhoneOtp.purpose == "signin")
        .with_for_update()
        .first()
    )
    now = datetime.now(timezone.utc)
    if otp is not None and otp.expires_at is not None and otp.expires_at.tzinfo is None:
        otp.expires_at = otp.expires_at.replace(tzinfo=timezone.utc)

    if not otp or otp.expires_at < now or otp.attempts >= OTP_MAX_ATTEMPTS:
        if otp:
            db.delete(otp)
            db.commit()
        raise HTTPException(status_code=400, detail="Code expired or too many attempts. Please request a new one.")

    if otp.code != body.code.strip():
        otp.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail=f"Incorrect code. {OTP_MAX_ATTEMPTS - otp.attempts} attempts left.")

    db.delete(otp)
    db.commit()

    credentials, details = find_or_create_customer_by_phone(db, number, body.full_name_fallback)
    return _issue_customer_session(credentials, details)


# ---------------------------------------------------------------------------
# Smart Profile Sync - collect the missing piece after a Google/Phone login
# ---------------------------------------------------------------------------
class LinkPhoneRequest(BaseModel):
    primary_number: str = Field(..., min_length=10, max_length=10)


class LinkPhoneVerify(BaseModel):
    primary_number: str = Field(..., min_length=10, max_length=10)
    code: str = Field(..., min_length=4, max_length=8)


class LinkEmailRequest(BaseModel):
    email: str


@router.post("/auth/profile/link-phone/request-otp")
async def link_phone_request_otp(
    body: LinkPhoneRequest, db: Session = Depends(get_db), current_customer=Depends(get_current_customer),
):
    """Step 1 of the Smart Profile Sync bottom sheet for a Google-signed-in
    customer with no real phone number yet (their primary_number is still
    the g_<uuid> placeholder from find_or_create_customer_by_google)."""
    if not sms_gateway_configured(db):
        raise HTTPException(status_code=503, detail="Phone verification isn't available yet.")
    number = body.primary_number.strip()
    if get_customer_by_primary_number(db, number):
        raise HTTPException(status_code=400, detail="This number is already linked to another account.")

    code = f"{random.randint(0, 999999):06d}"
    db.query(PhoneOtp).filter(PhoneOtp.primary_number == number, PhoneOtp.purpose == "link_phone").delete()
    db.add(PhoneOtp(primary_number=number, code=code, purpose="link_phone", expires_at=datetime.now(timezone.utc) + OTP_TTL))
    db.commit()
    try:
        await send_sms(db, number, f"Your Drop Cars verification code is {code}. Valid for 10 minutes.")
    except SmsGatewayNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"message": f"A 6-digit code was sent to {number[-4:]}."}


@router.post("/auth/profile/link-phone/verify", response_model=CustomerOut)
def link_phone_verify(
    body: LinkPhoneVerify, db: Session = Depends(get_db), current_customer=Depends(get_current_customer),
):
    number = body.primary_number.strip()
    otp = (
        db.query(PhoneOtp)
        .filter(PhoneOtp.primary_number == number, PhoneOtp.purpose == "link_phone")
        .with_for_update()
        .first()
    )
    now = datetime.now(timezone.utc)
    if not otp or otp.expires_at.replace(tzinfo=timezone.utc) < now or otp.code != body.code.strip():
        raise HTTPException(status_code=400, detail="Invalid or expired code.")
    db.delete(otp)

    current_customer.primary_number = number
    current_customer.phone_verified = True
    db.commit()
    db.refresh(current_customer)

    details = get_customer_details_by_customer_id(db, str(current_customer.id))
    details.primary_number = number
    db.commit()
    db.refresh(details)
    return CustomerOut(id=current_customer.id, full_name=details.full_name, primary_number=details.primary_number, email=current_customer.email, created_at=details.created_at)


@router.post("/auth/profile/link-email", response_model=CustomerOut)
def link_email(
    body: LinkEmailRequest, db: Session = Depends(get_db), current_customer=Depends(get_current_customer),
):
    """Step for a Phone-signed-in customer with no email yet (required for
    GST invoice delivery per the product spec). No OTP round-trip here -
    email verification for the customer role can reuse the existing
    EmailOtp table's verify_email purpose the same way vehicle_owner/
    driver/vendor already do, left as a follow-up since it's a bigger
    change (EmailOtp.role is currently typed to those three roles only);
    for now this stores the email unverified, matching how CustomerDetails/
    CustomerCredentials.email already worked before this feature (an admin-
    editable, not-yet-verified field)."""
    current_customer.email = body.email.strip()
    db.commit()
    db.refresh(current_customer)
    details = get_customer_details_by_customer_id(db, str(current_customer.id))
    return CustomerOut(id=current_customer.id, full_name=details.full_name, primary_number=details.primary_number, email=current_customer.email, created_at=details.created_at)


# ---------------------------------------------------------------------------
# Notification preference - Profile/Settings toggle backing
# ("Receive Trip Invoices & Updates via: Email & App Notification | SMS")
# ---------------------------------------------------------------------------
class NotificationPreferenceUpdate(BaseModel):
    preference: str  # "email_push" | "sms"


@router.patch("/auth/profile/notification-preference", response_model=CustomerOut)
def update_notification_preference(
    body: NotificationPreferenceUpdate, db: Session = Depends(get_db), current_customer=Depends(get_current_customer),
):
    if body.preference not in ("email_push", "sms"):
        raise HTTPException(status_code=422, detail="preference must be 'email_push' or 'sms'")
    if body.preference == "sms" and (not current_customer.primary_number or current_customer.primary_number.startswith(("g_", "fb_"))):
        raise HTTPException(status_code=400, detail="Add and verify a phone number before choosing SMS - see /auth/profile/link-phone/*.")

    current_customer.notification_preference = body.preference
    db.commit()
    db.refresh(current_customer)
    details = get_customer_details_by_customer_id(db, str(current_customer.id))
    return CustomerOut(id=current_customer.id, full_name=details.full_name, primary_number=details.primary_number, email=current_customer.email, created_at=details.created_at)
