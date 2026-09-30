# utils/sms_gateway.py
"""
SMS sending for Phone OTP sign-in - sibling of utils/emailer.py, same
"credentials live in platform_settings, admin-editable, never hardcoded"
pattern.

Architecture note (answering the "Firebase Admin SDK vs direct SMS gateway"
question this was built alongside): this deliberately does NOT use Firebase
Phone Auth. Two reasons:
  1. Firebase Phone Auth would be a second, parallel identity/session system
     next to the JWT auth this backend already has everywhere (Admin,
     Vendor, Driver, Customer) - every other login flow already reduces to
     "verify credential -> issue our own JWT". Doing the same for phone
     (generate+verify our own OTP, matching the EmailOtp pattern already
     built for email) keeps ONE auth system, not two.
  2. Google Sign-In doesn't need Firebase either - verify_google_id_token
     below uses the `google-auth` package (already a dependency, used
     elsewhere for GCS) to verify the raw Google ID token directly. Firebase
     would add nothing there but a second project to manage.

No SMS gateway account exists yet (checked - no MSG91/Fast2SMS/Twilio
credentials anywhere in this codebase). `send_sms` raises a clear,
catchable "not configured" error until an Owner sets these via platform
settings - the OTP generation/storage/verification logic around it is
real and fully working today; only the literal "deliver the SMS" call
needs a real account.
"""
import httpx
from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting

SMS_GATEWAY_DEFAULTS = {
    "sms_gateway_provider": "",   # "msg91" | "fast2sms" - empty means "not configured"
    "sms_gateway_api_key": "",
    "sms_gateway_sender_id": "DRPCAR",
}


def get_sms_settings(db: Session) -> dict:
    settings = dict(SMS_GATEWAY_DEFAULTS)
    rows = db.query(PlatformSetting).filter(PlatformSetting.key.in_(list(SMS_GATEWAY_DEFAULTS.keys()))).all()
    for row in rows:
        settings[row.key] = row.value
    return settings


def sms_gateway_configured(db: Session) -> bool:
    settings = get_sms_settings(db)
    return bool(settings["sms_gateway_provider"] and settings["sms_gateway_api_key"])


class SmsGatewayNotConfigured(Exception):
    pass


async def send_sms(db: Session, phone_number: str, message: str) -> None:
    """Sends one SMS via the admin-configured provider. Raises
    SmsGatewayNotConfigured (never a raw exception) if no provider is set
    up yet - callers should catch this and surface a clear "SMS sign-in
    isn't available yet, contact support" error, same as
    utils/emailer.py's smtp_configured() check does for email."""
    settings = get_sms_settings(db)
    if not sms_gateway_configured(db):
        raise SmsGatewayNotConfigured("No SMS gateway is configured (set sms_gateway_provider + sms_gateway_api_key in Settings).")

    provider = settings["sms_gateway_provider"].lower()
    async with httpx.AsyncClient(timeout=10.0) as client:
        if provider == "msg91":
            resp = await client.post(
                "https://control.msg91.com/api/v5/flow/",
                headers={"authkey": settings["sms_gateway_api_key"], "content-type": "application/json"},
                json={"mobiles": f"91{phone_number}", "sender": settings["sms_gateway_sender_id"], "message": message},
            )
        elif provider == "fast2sms":
            resp = await client.get(
                "https://www.fast2sms.com/dev/bulkV2",
                headers={"authorization": settings["sms_gateway_api_key"]},
                params={"route": "q", "message": message, "numbers": phone_number},
            )
        else:
            raise SmsGatewayNotConfigured(f"Unknown SMS gateway provider: {provider}")
        resp.raise_for_status()
