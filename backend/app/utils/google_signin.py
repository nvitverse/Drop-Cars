# app/utils/google_signin.py
"""
Multi-platform Google Sign-In ID Token Verifier using `google-auth`.

Supports audience verification across multiple registered client IDs:
- Web Application Client ID
- Admin Panel Client ID
- Android Customer App Client ID
- Android Driver/Vendor App Client ID
- iOS Apps Client IDs
- Or comma-separated GOOGLE_ALLOWED_CLIENT_IDS list
"""
import os
import logging
from typing import List, Optional, Dict, Any
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_auth_requests

logger = logging.getLogger("dropcars.auth.google")


class GoogleAuthNotConfigured(Exception):
    pass


class InvalidGoogleToken(Exception):
    pass


def get_allowed_google_client_ids() -> List[str]:
    """Collect all configured Google OAuth Client IDs across all platforms."""
    client_ids = set()

    # Legacy / Primary Single Env
    primary_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
    if primary_id:
        client_ids.add(primary_id.strip())

    # Specific Platform Envs
    env_vars = [
        "GOOGLE_WEB_CLIENT_ID",
        "GOOGLE_ADMIN_CLIENT_ID",
        "GOOGLE_ANDROID_CUSTOMER_CLIENT_ID",
        "GOOGLE_ANDROID_DRIVER_CLIENT_ID",
        "GOOGLE_IOS_CUSTOMER_CLIENT_ID",
        "GOOGLE_IOS_DRIVER_CLIENT_ID",
        "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
        "EXPO_PUBLIC_GOOGLE_CLIENT_ID",
    ]
    for var_name in env_vars:
        val = os.getenv(var_name)
        if val and val.strip():
            client_ids.add(val.strip())

    # Comma-separated allowlist
    multi_ids = os.getenv("GOOGLE_ALLOWED_CLIENT_IDS")
    if multi_ids:
        for cid in multi_ids.split(","):
            if cid.strip():
                client_ids.add(cid.strip())

    return list(client_ids)


def verify_google_id_token(id_token_str: str, target_audience: Optional[str] = None) -> Dict[str, Any]:
    """
    Verifies a Google ID token against the allowed client IDs.
    
    Returns token payload: {sub, email, email_verified, name, picture, ...}
    Raises GoogleAuthNotConfigured or InvalidGoogleToken on failure.
    """
    if not id_token_str or not id_token_str.strip():
        raise InvalidGoogleToken("Google ID token is required.")

    allowed_audiences = get_allowed_google_client_ids()

    # If a specific target audience was requested, ensure it's in the list
    if target_audience and target_audience not in allowed_audiences:
        allowed_audiences.append(target_audience)

    request_transport = google_auth_requests.Request()
    last_error = None
    payload = None

    if allowed_audiences:
        for audience in allowed_audiences:
            try:
                payload = google_id_token.verify_oauth2_token(
                    id_token_str, request_transport, audience
                )
                if payload:
                    break
            except ValueError as e:
                last_error = e
                continue
    else:
        # Fallback if no specific audience configured yet: verify token signature
        try:
            payload = google_id_token.verify_oauth2_token(id_token_str, request_transport)
        except ValueError as e:
            raise InvalidGoogleToken(f"Invalid Google token signature: {str(e)}")

    if not payload:
        raise InvalidGoogleToken(
            f"Google token verification failed. Audience mismatch or expired. ({last_error or 'Unknown'})"
        )

    email = payload.get("email")
    if not email:
        raise InvalidGoogleToken("Google token did not contain an email address.")

    if not payload.get("email_verified", True):
        raise InvalidGoogleToken("Google email address is not verified.")

    return payload
