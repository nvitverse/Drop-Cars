from jose import jwt
from slowapi import Limiter
from slowapi.util import get_remote_address


def client_key(request) -> str:
    """Who a rate limit counts against.

    On Cloud Run the socket peer is Google's front end, the SAME address for every caller, so counting by `request.client.host`
    (slowapi's default) made one shared bucket for the whole platform: five trip starts in ten minutes by ALL drivers together, and
    one driver retrying a code locked out everybody (found 2026-10-14 - drivers told "OTP not working").
    Signed-in callers are counted by their own account; everyone else by the real client address Google appends to X-Forwarded-For."""
    auth = request.headers.get("authorization", "")
    if auth[:7].lower() == "bearer ":
        try:
            who = jwt.get_unverified_claims(auth[7:].strip()).get("sub")      # only a counting key - the route still verifies the token
            if who:
                return f"user:{who}"
        except Exception:
            pass
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[-1].strip() or get_remote_address(request)
    return get_remote_address(request)


limiter = Limiter(key_func=client_key)
