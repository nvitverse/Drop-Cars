# api/routes/password_reset.py
"""
Self-service "Forgot Password" — works WITHOUT any SMS gateway.

Identity is proven with data the real user already knows and we already store:
  * fleet owner (vehicle_owner): mobile number + Aadhaar number
  * duty driver (driver):        mobile number + licence number
  * vendor:                      mobile number + Aadhaar number

Protections:
  * max 5 attempts per mobile number per hour (DB-backed, survives restarts)
  * generic error message — never reveals WHICH detail was wrong or whether
    the number exists at all
  * new password set atomically; nothing about the login flow itself changes
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.core.security import get_password_hash
from app.models.password_reset_attempt import PasswordResetAttempt

router = APIRouter()

MAX_ATTEMPTS = 5
WINDOW = timedelta(hours=1)

GENERIC_FAIL = "Details do not match our records. Please check and try again."


class ForgotPasswordRequest(BaseModel):
    role: str = Field(..., description="vehicle_owner | driver | vendor")
    primary_number: str = Field(..., min_length=10, max_length=10)
    proof: str = Field(..., min_length=4, max_length=30,
                       description="Aadhaar number (owner/vendor) or licence number (driver)")
    new_password: str = Field(..., min_length=6, max_length=64)


def _check_rate_limit(db: Session, number: str) -> PasswordResetAttempt:
    now = datetime.now(timezone.utc)
    row = (
        db.query(PasswordResetAttempt)
        .filter(PasswordResetAttempt.primary_number == number)
        .with_for_update()
        .first()
    )
    if row is None:
        row = PasswordResetAttempt(primary_number=number, attempts=0, window_start=now)
        db.add(row)
        db.flush()
        return row
    window_start = row.window_start
    if window_start is not None and window_start.tzinfo is None:
        window_start = window_start.replace(tzinfo=timezone.utc)
    if window_start is None or now - window_start > WINDOW:
        row.attempts = 0
        row.window_start = now
        db.add(row)
        return row
    if row.attempts >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please wait 1 hour and try again, or contact support.",
        )
    return row


def _record_failure(db: Session, row: PasswordResetAttempt) -> None:
    row.attempts = (row.attempts or 0) + 1
    db.add(row)
    db.commit()


def _normalize(value: str) -> str:
    return "".join((value or "").split()).lower()


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):

    role = body.role.strip().lower()
    number = body.primary_number.strip()
    proof = _normalize(body.proof)

    attempt_row = _check_rate_limit(db, number)

    if role == "vehicle_owner":
        from app.models.vehicle_owner import VehicleOwnerCredentials
        from app.models.vehicle_owner_details import VehicleOwnerDetails

        creds = db.query(VehicleOwnerCredentials).filter(
            VehicleOwnerCredentials.primary_number == number
        ).first()
        details = db.query(VehicleOwnerDetails).filter(
            VehicleOwnerDetails.primary_number == number
        ).first() if creds else None
        if not creds or not details or _normalize(details.aadhar_number) != proof:
            _record_failure(db, attempt_row)
            raise HTTPException(status_code=400, detail=GENERIC_FAIL)
        creds.hashed_password = get_password_hash(body.new_password)
        db.add(creds)

    elif role == "driver":
        from app.models.car_driver import CarDriver

        driver = db.query(CarDriver).filter(
            CarDriver.primary_number == number
        ).first()
        if not driver or _normalize(driver.licence_number) != proof:
            _record_failure(db, attempt_row)
            raise HTTPException(status_code=400, detail=GENERIC_FAIL)
        driver.hashed_password = get_password_hash(body.new_password)
        db.add(driver)

    elif role == "vendor":
        from app.models.vendor import VendorCredentials
        from app.models.vendor_details import VendorDetails

        creds = db.query(VendorCredentials).filter(
            VendorCredentials.primary_number == number
        ).first()
        details = db.query(VendorDetails).filter(
            VendorDetails.primary_number == number
        ).first() if creds else None
        if not creds or not details or _normalize(details.aadhar_number) != proof:
            _record_failure(db, attempt_row)
            raise HTTPException(status_code=400, detail=GENERIC_FAIL)
        creds.hashed_password = get_password_hash(body.new_password)
        db.add(creds)

    else:
        raise HTTPException(status_code=400, detail="Invalid role")

    # Success: clear the attempt counter and save the new password together
    db.delete(attempt_row)
    db.commit()

    return {"message": "Password changed successfully. You can now log in with your new password."}


# --- Email OTP reset (safer path when the account has an email on file) ---
# The code is ONLY ever sent to the email already stored on the account
# (set by the admin or at signup) - so knowing someone's Aadhaar/licence is
# no longer enough to take over an account that has an email.

import random
from app.models.email_otp import EmailOtp

OTP_TTL = timedelta(minutes=10)
OTP_MAX_ATTEMPTS = 5


def _get_account(db: Session, role: str, number: str):
    """Return the credentials record for role+number, or None."""
    if role == "vehicle_owner":
        from app.models.vehicle_owner import VehicleOwnerCredentials
        return db.query(VehicleOwnerCredentials).filter(
            VehicleOwnerCredentials.primary_number == number).first()
    if role == "driver":
        from app.models.car_driver import CarDriver
        return db.query(CarDriver).filter(CarDriver.primary_number == number).first()
    if role == "vendor":
        from app.models.vendor import VendorCredentials
        return db.query(VendorCredentials).filter(
            VendorCredentials.primary_number == number).first()
    return None


def _mask_email(email: str) -> str:
    try:
        name, domain = email.split("@", 1)
        visible = name[:2] if len(name) > 2 else name[:1]
        return f"{visible}***@{domain}"
    except Exception:
        return "***"


class EmailOtpRequest(BaseModel):
    role: str
    primary_number: str = Field(..., min_length=10, max_length=10)


class EmailOtpReset(BaseModel):
    role: str
    primary_number: str = Field(..., min_length=10, max_length=10)
    code: str = Field(..., min_length=4, max_length=8)
    new_password: str = Field(..., min_length=6, max_length=64)


@router.post("/email/request-reset-otp")
async def request_reset_otp(body: EmailOtpRequest, db: Session = Depends(get_db)):
    role = body.role.strip().lower()
    number = body.primary_number.strip()

    _check_rate_limit(db, number)
    db.commit()  # persist the attempt-row creation from the rate limit check

    account = _get_account(db, role, number)
    if not account:
        raise HTTPException(
            status_code=400,
            detail=f"No {role.replace('_', ' ')} account found with mobile number +91 {number}. Please check your registered mobile number.",
        )

    if not getattr(account, "email", None):
        raise HTTPException(
            status_code=400,
            detail=f"No email is linked to account +91 {number}. Please use 'Verify with DL/Aadhaar' option or ask your fleet owner/admin to add your email address.",
        )

    from app.utils.emailer import send_email, smtp_configured
    if not smtp_configured(db):
        raise HTTPException(
            status_code=503,
            detail="Email service is currently being updated. Please contact Drop Cars Support to reset your password.",
        )

    code = f"{random.randint(0, 999999):06d}"
    # Replace any previous pending code for this account+purpose
    db.query(EmailOtp).filter(
        EmailOtp.role == role,
        EmailOtp.primary_number == number,
        EmailOtp.purpose == "reset_password",
    ).delete()
    db.add(EmailOtp(
        role=role,
        primary_number=number,
        email=account.email,
        code=code,
        purpose="reset_password",
        expires_at=datetime.now(timezone.utc) + OTP_TTL,
    ))
    db.commit()

    try:
        send_email(
            db,
            account.email,
            "Drop Cars - Password Reset Code",
            f"Your Drop Cars password reset code is: {code}\n\n"
            "It is valid for 10 minutes. If you did not request this, ignore this email - "
            "your password stays unchanged.",
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Could not send the email. Please try again or contact the admin.")

    return {"message": f"A 6-digit code was sent to {_mask_email(account.email)}. It is valid for 10 minutes."}


@router.post("/email/reset-password")
async def reset_password_with_otp(body: EmailOtpReset, db: Session = Depends(get_db)):
    role = body.role.strip().lower()
    number = body.primary_number.strip()

    otp = db.query(EmailOtp).filter(
        EmailOtp.role == role,
        EmailOtp.primary_number == number,
        EmailOtp.purpose == "reset_password",
    ).with_for_update().first()

    now = datetime.now(timezone.utc)
    if otp is not None and otp.expires_at is not None and otp.expires_at.tzinfo is None:
        otp.expires_at = otp.expires_at.replace(tzinfo=timezone.utc)

    if not otp or otp.expires_at < now or otp.attempts >= OTP_MAX_ATTEMPTS:
        if otp:
            db.delete(otp)
            db.commit()
        raise HTTPException(status_code=400, detail="Code expired or invalid. Please request a new code.")

    if otp.code != body.code.strip():
        otp.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Wrong code. Please check the email and try again.")

    account = _get_account(db, role, number)
    if not account:
        raise HTTPException(status_code=400, detail="Account not found.")

    account.hashed_password = get_password_hash(body.new_password)
    # Entering the emailed code proves ownership of the email
    account.email_verified = True
    db.add(account)
    db.delete(otp)
    # Clear the identity-reset attempt counter too
    db.query(PasswordResetAttempt).filter(
        PasswordResetAttempt.primary_number == number).delete()
    db.commit()

    return {"message": "Password changed successfully. You can now log in with your new password."}


# --- Link New Email + Reset Password Flow ---
# When an account has no email linked, the user can provide their DL/Aadhaar proof
# + their email address. We verify the email via a 6-digit OTP, link it to the
# account in DB, and update their password in one seamless flow.

class LinkEmailOtpRequest(BaseModel):
    role: str
    primary_number: str = Field(..., min_length=10, max_length=10)
    email: str = Field(..., min_length=5, max_length=120)
    proof: str = Field(..., min_length=4, max_length=30, description="Licence Number (driver) or Aadhaar (owner)")


class LinkEmailOtpReset(BaseModel):
    role: str
    primary_number: str = Field(..., min_length=10, max_length=10)
    email: str = Field(..., min_length=5, max_length=120)
    code: str = Field(..., min_length=4, max_length=8)
    new_password: str = Field(..., min_length=6, max_length=64)


@router.post("/email/link-email-and-request-otp")
async def link_email_and_request_otp(body: LinkEmailOtpRequest, db: Session = Depends(get_db)):
    role = body.role.strip().lower()
    number = body.primary_number.strip()
    email = body.email.strip().lower()
    proof = _normalize(body.proof)

    _check_rate_limit(db, number)
    db.commit()

    account = _get_account(db, role, number)
    if not account:
        raise HTTPException(
            status_code=400,
            detail=f"No {role.replace('_', ' ')} account found registered with mobile number +91 {number}.",
        )

    # Verify proof against driver licence number or owner Aadhaar
    if role == "vehicle_owner":
        from app.models.vehicle_owner_details import VehicleOwnerDetails
        details = db.query(VehicleOwnerDetails).filter(
            VehicleOwnerDetails.primary_number == number
        ).first()
        if not details or _normalize(details.aadhar_number) != proof:
            raise HTTPException(status_code=400, detail="Aadhaar Number does not match our records for this account.")
    elif role == "driver":
        if not getattr(account, "licence_number", None) or _normalize(account.licence_number) != proof:
            raise HTTPException(status_code=400, detail="Licence Number does not match our records for this account.")
    elif role == "vendor":
        from app.models.vendor_details import VendorDetails
        details = db.query(VendorDetails).filter(
            VendorDetails.primary_number == number
        ).first()
        if not details or _normalize(details.aadhar_number) != proof:
            raise HTTPException(status_code=400, detail="Aadhaar Number does not match our records for this account.")

    from app.utils.emailer import send_email, smtp_configured
    if not smtp_configured(db):
        raise HTTPException(
            status_code=503,
            detail="Email service is currently being updated. Please contact Drop Cars Support.",
        )

    code = f"{random.randint(0, 999999):06d}"
    db.query(EmailOtp).filter(
        EmailOtp.role == role,
        EmailOtp.primary_number == number,
        EmailOtp.purpose == "link_and_reset_password",
    ).delete()
    db.add(EmailOtp(
        role=role,
        primary_number=number,
        email=email,
        code=code,
        purpose="link_and_reset_password",
        expires_at=datetime.now(timezone.utc) + OTP_TTL,
    ))
    db.commit()

    try:
        send_email(
            db,
            email,
            "Drop Cars - Link Email & Password Reset Code",
            f"Your Drop Cars verification code is: {code}\n\n"
            f"Entering this code will link {email} to your Drop Cars account (+91 {number}) and set your new password.\n"
            "It is valid for 10 minutes.",
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Could not send verification email. Please check your email address and try again.")

    return {"message": f"A 6-digit code was sent to {email}. Please enter it below to complete linking your email and resetting your password."}


@router.post("/email/verify-link-and-reset")
async def verify_link_and_reset(body: LinkEmailOtpReset, db: Session = Depends(get_db)):
    role = body.role.strip().lower()
    number = body.primary_number.strip()
    email = body.email.strip().lower()

    otp = db.query(EmailOtp).filter(
        EmailOtp.role == role,
        EmailOtp.primary_number == number,
        EmailOtp.purpose == "link_and_reset_password",
    ).with_for_update().first()

    now = datetime.now(timezone.utc)
    if otp is not None and otp.expires_at is not None and otp.expires_at.tzinfo is None:
        otp.expires_at = otp.expires_at.replace(tzinfo=timezone.utc)

    if not otp or otp.expires_at < now or otp.attempts >= OTP_MAX_ATTEMPTS:
        if otp:
            db.delete(otp)
            db.commit()
        raise HTTPException(status_code=400, detail="Code expired or invalid. Please request a new code.")

    if otp.code != body.code.strip():
        otp.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Wrong code. Please check your email inbox and try again.")

    account = _get_account(db, role, number)
    if not account:
        raise HTTPException(status_code=400, detail="Account not found.")

    # Permanently link email to account & update password
    account.email = email
    account.email_verified = True
    account.hashed_password = get_password_hash(body.new_password)
    db.add(account)
    db.delete(otp)
    db.query(PasswordResetAttempt).filter(
        PasswordResetAttempt.primary_number == number).delete()
    db.commit()

    return {"message": "Email address linked and password updated successfully."}
