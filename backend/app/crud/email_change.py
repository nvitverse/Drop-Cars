# crud/email_change.py
"""
Self-service email add/change for LOGGED-IN users, verified by a code sent
to the NEW email address (proves they own the inbox). The admin path
(PUT /admin/users/email) stays OTP-free - the admin vouches for it.
"""
import random
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.email_otp import EmailOtp

OTP_TTL = timedelta(minutes=10)
OTP_MAX_ATTEMPTS = 5


def _valid_email(email: str) -> bool:
    return "@" in email and "." in email.split("@")[-1]


def request_email_change_otp(db: Session, role: str, primary_number: str, new_email: str) -> dict:
    new_email = (new_email or "").strip()
    if not _valid_email(new_email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address")

    from app.utils.emailer import send_email, smtp_configured
    if not smtp_configured(db):
        raise HTTPException(status_code=503, detail="Email is not configured yet. Please contact the admin.")

    # Simple abuse guard: max 3 codes per hour per account
    hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    recent = db.query(EmailOtp).filter(
        EmailOtp.role == role,
        EmailOtp.primary_number == primary_number,
        EmailOtp.purpose == "verify_email",
        EmailOtp.created_at >= hour_ago,
    ).count()
    if recent >= 3:
        raise HTTPException(status_code=429, detail="Too many codes requested. Please wait an hour and try again.")

    code = f"{random.randint(0, 999999):06d}"
    # Replace any previous pending verify code (keep created_at history rows? No - replace)
    db.query(EmailOtp).filter(
        EmailOtp.role == role,
        EmailOtp.primary_number == primary_number,
        EmailOtp.purpose == "verify_email",
        EmailOtp.expires_at >= datetime.now(timezone.utc),
    ).delete()
    db.add(EmailOtp(
        role=role,
        primary_number=primary_number,
        email=new_email,
        code=code,
        purpose="verify_email",
        expires_at=datetime.now(timezone.utc) + OTP_TTL,
    ))
    db.commit()

    try:
        send_email(
            db,
            new_email,
            "Drop Cars - Email Verification Code",
            f"Your Drop Cars email verification code is: {code}\n\n"
            "It is valid for 10 minutes. If you did not request this, ignore this email.",
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Could not send the email. Check the address and try again.")

    return {"message": f"A 6-digit code was sent to {new_email}. It is valid for 10 minutes."}


def confirm_email_change(db: Session, role: str, primary_number: str, new_email: str, code: str, account) -> dict:
    new_email = (new_email or "").strip()

    otp = db.query(EmailOtp).filter(
        EmailOtp.role == role,
        EmailOtp.primary_number == primary_number,
        EmailOtp.purpose == "verify_email",
    ).order_by(EmailOtp.created_at.desc()).with_for_update().first()

    now = datetime.now(timezone.utc)
    if otp is not None and otp.expires_at is not None and otp.expires_at.tzinfo is None:
        otp.expires_at = otp.expires_at.replace(tzinfo=timezone.utc)

    if not otp or otp.expires_at < now or otp.attempts >= OTP_MAX_ATTEMPTS:
        if otp:
            db.delete(otp)
            db.commit()
        raise HTTPException(status_code=400, detail="Code expired or invalid. Please request a new code.")

    if otp.email != new_email or otp.code != (code or "").strip():
        otp.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Wrong code. Please check the email and try again.")

    account.email = new_email
    account.email_verified = True
    db.add(account)
    db.delete(otp)
    db.commit()

    return {"message": "Email verified and saved.", "email": new_email, "email_verified": True}
