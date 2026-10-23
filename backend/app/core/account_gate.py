"""Request gate for accounts that must not use the app.

* a permanently BLOCKED account (fleet owner, its drivers, a vendor) gets 403 "[ACCOUNT_BLOCKED]" on every call, even with a token that was
  issued before the block (set_permanent_block also bumps token_version, so the next call is a logout and the next login is refused too);
* a fleet owner (and the drivers under him) whose subscription lifecycle has run out is "suspended for subscription": every call is refused with
  "[ACCOUNT_SUSPENDED_SUBSCRIPTION]" except the few that let him pay and see his status (ALLOWED_WHEN_SUSPENDED).

The apps recognise the bracketed code in the message and show one plain screen ("your account is blocked / suspended, contact the
operations team" or "subscribe to continue"). Old apps simply show the readable text before the code.

Cost: one JWT decode per call and one small database lookup per account per minute (cached); everything fails OPEN - an error here
never locks a good account out.
"""
from __future__ import annotations

import logging
import time
from typing import Dict, Optional, Tuple

from jose import JWTError, jwt
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse

log = logging.getLogger(__name__)

BLOCKED_MESSAGE = "Your Drop Cars account is blocked. You cannot use the app. Please contact the Drop Cars operations team. [ACCOUNT_BLOCKED]"
SUSPENDED_MESSAGE = ("Your account is suspended because the monthly subscription is not paid. Subscribe to start using the app again, "
                     "or contact the Drop Cars operations team. [ACCOUNT_SUSPENDED_SUBSCRIPTION]")

# what a subscription-suspended account may still call: pay (wallet / plan / UPI claim), see its own status, updates, help
ALLOWED_WHEN_SUSPENDED = (
    "/api/wallet/", "/api/subscriptions/", "/api/driver/status", "/api/driver/subscribe",
    "/api/users/vehicle-owner/billing-status", "/api/app-updates", "/api/app-content", "/api/support",
    "/api/users/vehicleowner/login", "/api/users/cardriver/signin", "/api/users/logout", "/api/notifications/token",
)

_TTL = 60.0
_cache: Dict[str, Tuple[float, Optional[str]]] = {}      # account id -> (expires, None | "BLOCKED" | "SUSPENDED")


def invalidate(*account_ids) -> None:
    for a in account_ids:
        _cache.pop(str(a), None)


def _status_of(sub: str) -> Optional[str]:
    """Blocking database lookup (run in a thread). None = fine / unknown account (customers, admins, staff)."""
    from app.database.session import SessionLocal
    from app.models.car_driver import CarDriver
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.vendor import VendorCredentials

    db = SessionLocal()
    try:
        owner = db.query(VehicleOwnerCredentials.permanently_blocked, VehicleOwnerCredentials.account_status, VehicleOwnerCredentials.blocked_reason).filter(VehicleOwnerCredentials.id == sub).first()
        owner_id = sub if owner is not None else None
        if owner is not None:
            if owner[0]:
                return "BLOCKED"
            if str(getattr(owner[1], "value", owner[1]) or "").upper() == "INACTIVE" and owner[2]:
                return "BLOCKED"         # switched off by the admin
        else:
            drv = db.query(CarDriver.permanently_blocked, CarDriver.vehicle_owner_id).filter(CarDriver.id == sub).first()
            if drv is not None:
                if drv[0]:
                    return "BLOCKED"
                owner_id = drv[1]
                o = db.query(VehicleOwnerCredentials.permanently_blocked).filter(VehicleOwnerCredentials.id == owner_id).first()
                if o is not None and o[0]:
                    return "BLOCKED"
            else:
                ven = db.query(VendorCredentials.permanently_blocked).filter(VendorCredentials.id == sub).first()
                return "BLOCKED" if ven is not None and ven[0] else None
        if owner_id is not None:
            d = db.query(VehicleOwnerDetails.billing_suspended, VehicleOwnerDetails.billing_suspended_reason).filter(
                VehicleOwnerDetails.vehicle_owner_id == owner_id).first()
            if d is not None and d[0] and (d[1] or "") == "SUBSCRIPTION_REQUIRED":
                return "SUSPENDED"
        return None
    finally:
        db.close()


def _safe_status_of(sub: str) -> Optional[str]:
    try:
        return _status_of(sub)
    except Exception:  # noqa: BLE001  (not a UUID, table missing, database hiccup ...) -> treat as fine and remember it for a minute
        log.debug("account gate lookup failed for %s", sub, exc_info=True)
        return None


def _subject(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        from app.core.security import ALGORITHM, SECRET_KEY
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    except Exception:  # noqa: BLE001
        return None
    sub = payload.get("sub")
    return str(sub) if sub else None


async def check(request: Request) -> Optional[JSONResponse]:
    """Return a 403 response when the caller's account must not use this endpoint, else None."""
    try:
        path = request.url.path
        if request.method == "OPTIONS" or not path.startswith("/api/"):
            return None
        sub = _subject(request)
        if sub is None:
            return None
        now = time.monotonic()
        hit = _cache.get(sub)
        if hit is None or hit[0] < now:
            st = await run_in_threadpool(_safe_status_of, sub)
            if len(_cache) > 20000:
                _cache.clear()
            _cache[sub] = (now + _TTL, st)
        else:
            st = hit[1]
        if st == "BLOCKED":
            return JSONResponse(status_code=403, content={"detail": BLOCKED_MESSAGE}, headers={"X-Account-Status": "BLOCKED"})
        if st == "SUSPENDED" and not any(path.startswith(p) for p in ALLOWED_WHEN_SUSPENDED):
            return JSONResponse(status_code=403, content={"detail": SUSPENDED_MESSAGE}, headers={"X-Account-Status": "SUSPENDED"})
    except Exception:  # noqa: BLE001  (fail open)
        log.exception("account gate failed (letting the call through)")
    return None
