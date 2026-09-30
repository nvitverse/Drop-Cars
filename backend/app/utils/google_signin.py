# utils/google_signin.py
"""
Verifies a Google Sign-In ID token using the `google-auth` package
(already a dependency of this backend - see requirements.txt, used
elsewhere for GCS credential handling in utils/google_auth.py) rather than
pulling in Firebase Admin SDK. See utils/sms_gateway.py's module docstring
for the full "why not Firebase" rationale. Named separately from
google_auth.py on purpose - that file is GCS service-account credential
bootstrapping, unrelated to end-user sign-in; conflating the two names
would be confusing.

Needs GOOGLE_OAUTH_CLIENT_ID set (the Web/Android/iOS OAuth client ID from
Google Cloud Console -> APIs & Services -> Credentials, same GCP project
Cloud SQL already lives in - no new Google Cloud project needed). Client
apps must request an ID token audienced to this same client ID.
"""
import os
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_auth_requests

GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID")


class GoogleAuthNotConfigured(Exception):
    pass


class InvalidGoogleToken(Exception):
    pass


def verify_google_id_token(id_token_str: str) -> dict:
    """Returns the verified token payload: {sub, email, email_verified,
    name, picture, ...}. Raises GoogleAuthNotConfigured if
    GOOGLE_OAUTH_CLIENT_ID isn't set, InvalidGoogleToken if the token is
    malformed/expired/wrong-audience - never a raw exception, so callers
    can turn either into a clean 4xx response."""
    if not GOOGLE_OAUTH_CLIENT_ID:
        raise GoogleAuthNotConfigured(
            "GOOGLE_OAUTH_CLIENT_ID is not set. Create an OAuth Client ID in Google Cloud Console "
            "(the same GCP project Cloud SQL is in) and set it as an env var."
        )
    try:
        payload = google_id_token.verify_oauth2_token(
            id_token_str, google_auth_requests.Request(), GOOGLE_OAUTH_CLIENT_ID
        )
    except ValueError as e:
        raise InvalidGoogleToken(str(e))

    if not payload.get("email"):
        raise InvalidGoogleToken("Google token did not include an email address.")
    return payload
