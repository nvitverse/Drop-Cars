# utils/firebase_admin_auth.py
"""
Verifies Firebase ID tokens (from Firebase Phone Auth AND Google Sign-In -
both mint a Firebase ID token once the client completes
`signInWithCredential`, so one verifier covers both). Direct-Firebase
switch per explicit product decision (bypasses SMS DLT registration
overhead for phone OTP) - supersedes the earlier non-Firebase
google_signin.py/sms_gateway.py approach as the PRIMARY path; those two
modules are left in place (harmless, fully working, already tested) as a
fallback if Firebase ever needs to be swapped out again.

Lazy singleton init - the Admin SDK is only initialized on the first
actual verify call, from a service account JSON. This means the app
boots fine with zero Firebase config present; only a call to
verify_firebase_id_token raises (a clean, catchable error) until the
service account is provided. Never crashes app startup.
"""
import json
import os
from typing import Optional

import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

_app: Optional[firebase_admin.App] = None


class FirebaseNotConfigured(Exception):
    pass


class InvalidFirebaseToken(Exception):
    pass


def _get_app() -> firebase_admin.App:
    global _app
    if _app is not None:
        return _app

    # Two ways to supply the service account, same "don't hardcode
    # secrets, read from env" convention used everywhere else in this
    # backend (JWT_SECRET_KEY, DB_PASSWORD, etc):
    #  - FIREBASE_SERVICE_ACCOUNT_JSON: the raw JSON content (as one env
    #    var - convenient for Cloud Run, where you set it as a secret).
    #  - FIREBASE_SERVICE_ACCOUNT_PATH: a path to the downloaded
    #    serviceAccountKey.json file (convenient for local dev).
    raw_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")

    if raw_json:
        try:
            cred_info = json.loads(raw_json)
        except json.JSONDecodeError as e:
            raise FirebaseNotConfigured(f"FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: {e}")
        cred = credentials.Certificate(cred_info)
    elif path:
        if not os.path.exists(path):
            raise FirebaseNotConfigured(f"FIREBASE_SERVICE_ACCOUNT_PATH is set but the file doesn't exist: {path}")
        cred = credentials.Certificate(path)
    else:
        raise FirebaseNotConfigured(
            "Firebase isn't configured yet. Set FIREBASE_SERVICE_ACCOUNT_JSON (or "
            "FIREBASE_SERVICE_ACCOUNT_PATH) to the Admin SDK service account key from "
            "Firebase Console -> Project Settings -> Service Accounts -> Generate New Private Key."
        )

    _app = firebase_admin.initialize_app(cred)
    return _app


def verify_firebase_id_token(id_token: str) -> dict:
    """Returns the decoded token: {uid, phone_number?, email?,
    email_verified?, firebase: {sign_in_provider: "google.com"|"phone"}, ...}.
    Raises FirebaseNotConfigured / InvalidFirebaseToken (never a raw
    exception) so callers turn either into a clean 4xx/503 response."""
    app = _get_app()  # raises FirebaseNotConfigured if unset - let it propagate
    try:
        return firebase_auth.verify_id_token(id_token, app=app)
    except firebase_auth.InvalidIdTokenError as e:
        raise InvalidFirebaseToken(f"Invalid Firebase token: {e}")
    except firebase_auth.ExpiredIdTokenError as e:
        raise InvalidFirebaseToken(f"Expired Firebase token: {e}")
    except Exception as e:
        # firebase_admin can raise several other narrower exception types
        # (RevokedIdTokenError, CertificateFetchError, etc) - all of them
        # mean "this token/verification failed", not an app-crashing bug.
        raise InvalidFirebaseToken(f"Could not verify Firebase token: {e}")
