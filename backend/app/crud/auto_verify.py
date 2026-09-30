# crud/auto_verify.py
"""
Hook point for automated RC / Driving Licence / Aadhaar verification via a
paid third-party or government API - NOT WIRED YET (no API key/vendor
chosen as of this writing). This module exists so that, once the owner has
an API key, plugging it in is a matter of filling in these three
functions - the schema (aadhar_verification_source / rc_verification_source
/ licence_verification_source columns on VendorDetails/VehicleOwnerDetails/
CarDetails/CarDriver) and the calling sites are already in place.

Intended flow once wired: a verify_* call either raises AutoVerifyNotConfigured
(today, always) or returns True/False. On True, the caller should set the
document's *_status to VERIFIED and its *_verification_source to
'API_AUTO', matching the existing manual-verify code path exactly (see
crud/admin_management.py's update_*_document_status functions) - just with
'API_AUTO' instead of leaving verification_source untouched. On False,
leave the document PENDING for manual review (a human still has to look at
the physical/uploaded doc) - never auto-set INVALID from an API mismatch,
since false negatives (OCR misreads, formatting differences) are common and
an unfair auto-reject is worse than an extra manual check.
"""
from sqlalchemy.orm import Session

from app.crud.customer_booking_request import get_platform_setting_value


class AutoVerifyNotConfigured(Exception):
    """Raised by every verify_* function until a real API key is set."""
    pass


AUTO_VERIFY_AADHAAR_KEY = "auto_verify_aadhaar_api_key"
AUTO_VERIFY_RC_KEY = "auto_verify_rc_api_key"
AUTO_VERIFY_LICENCE_KEY = "auto_verify_licence_api_key"


def is_auto_verify_configured(db: Session, key: str) -> bool:
    return bool(get_platform_setting_value(db, key, ""))


def verify_aadhaar(db: Session, aadhaar_number: str) -> bool:
    """Returns True if the Aadhaar number is verified as genuine via the
    configured API. Raises AutoVerifyNotConfigured if no API key is set."""
    if not is_auto_verify_configured(db, AUTO_VERIFY_AADHAAR_KEY):
        raise AutoVerifyNotConfigured("Aadhaar auto-verify API key not configured")
    raise NotImplementedError("Aadhaar auto-verify API call not implemented yet - fill in once a vendor/API is chosen")


def verify_rc(db: Session, rc_number: str) -> bool:
    """Returns True if the vehicle RC number is verified as genuine via the
    configured API. Raises AutoVerifyNotConfigured if no API key is set."""
    if not is_auto_verify_configured(db, AUTO_VERIFY_RC_KEY):
        raise AutoVerifyNotConfigured("RC auto-verify API key not configured")
    raise NotImplementedError("RC auto-verify API call not implemented yet - fill in once a vendor/API is chosen")


def verify_licence(db: Session, licence_number: str) -> bool:
    """Returns True if the driving licence number is verified as genuine via
    the configured API. Raises AutoVerifyNotConfigured if no API key is set."""
    if not is_auto_verify_configured(db, AUTO_VERIFY_LICENCE_KEY):
        raise AutoVerifyNotConfigured("Licence auto-verify API key not configured")
    raise NotImplementedError("Licence auto-verify API call not implemented yet - fill in once a vendor/API is chosen")
