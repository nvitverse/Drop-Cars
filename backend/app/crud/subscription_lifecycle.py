"""Subscription lifecycle (owner rule 2026-10-23).

    new account ................. Standard user for 30 days (free), then it needs the monthly subscription
    subscription not renewed .... the plan lapses -> Standard again for 30 more days (time to pay) -> then SUSPENDED
    suspended ................... the app shows one screen "subscribe to continue / contact operations"; paying the plan lifts it at once

Dormant until an admin switches it on (platform setting subscription_required_enabled). When it is switched on, every EXISTING Standard
account gets a fresh 30 days from that day (lifecycle_start_date), so nobody is suspended by surprise. Accounts that are Preferred for any
reason (paid plan, Driver Pro, staff-granted trusted) are never suspended by this. A permanently blocked account is not touched here.

run_subscription_lifecycle(dry_run=True) only reports who WOULD be suspended; the real run is part of the daily sweep.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting
from app.models.vehicle_owner import VehicleOwnerCredentials
from app.models.vehicle_owner_details import VehicleOwnerDetails

REASON = "SUBSCRIPTION_REQUIRED"

DEFAULTS = {
    "subscription_required_enabled": "false",
    "standard_free_days": "30",       # a new account may be used without a plan for this long
    "lapse_grace_days": "30",         # after a plan ends the owner has this long (as Standard) to subscribe again
    "lifecycle_start_date": "",       # day the rule was switched on; existing accounts get free days counted from here
}


def _raw(db: Session, key: str) -> str:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    return (row.value if row and row.value is not None else DEFAULTS.get(key, "")) or ""


def get_settings(db: Session) -> dict:
    start = _raw(db, "lifecycle_start_date")
    return {
        "enabled": _raw(db, "subscription_required_enabled") == "true",
        "standard_free_days": int(_raw(db, "standard_free_days") or 30),
        "lapse_grace_days": int(_raw(db, "lapse_grace_days") or 30),
        "start_date": start or None,
    }


def update_settings(db: Session, *, enabled: Optional[bool] = None, standard_free_days: Optional[int] = None, lapse_grace_days: Optional[int] = None) -> dict:
    def _set(key: str, value: str) -> None:
        row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        if row:
            row.value = value
        else:
            row = PlatformSetting(key=key, value=value)
        db.add(row)

    if standard_free_days is not None:
        _set("standard_free_days", str(max(1, int(standard_free_days))))
    if lapse_grace_days is not None:
        _set("lapse_grace_days", str(max(1, int(lapse_grace_days))))
    if enabled is not None:
        _set("subscription_required_enabled", "true" if enabled else "false")
        if enabled and not _raw(db, "lifecycle_start_date"):
            _set("lifecycle_start_date", date.today().isoformat())    # first switch-on: existing accounts start their 30 days today
    db.commit()
    return get_settings(db)


def _as_date(v) -> Optional[date]:
    if v is None:
        return None
    return v.date() if hasattr(v, "date") else v


def standing(details: VehicleOwnerDetails, created_at, settings: dict, today: Optional[date] = None) -> dict:
    """Where one fleet owner stands. state: SUBSCRIBED | STANDARD | SUSPENDED. free_until/days_left only for STANDARD/SUSPENDED."""
    today = today or date.today()
    if details.tier == "PREFERRED":
        return {"state": "SUBSCRIBED", "free_until": None, "days_left": None, "valid_until": details.billing_next_date.isoformat() if details.billing_next_date else None}
    start = settings.get("start_date")
    start_d = date.fromisoformat(start) if start else None
    free = int(settings["standard_free_days"])
    grace = int(settings["lapse_grace_days"])
    had_plan = details.registration_fee_paid_at is not None or details.billing_next_date is not None
    if had_plan:
        lapsed_on = details.billing_next_date or _as_date(details.registration_fee_paid_at) or today
        free_until = lapsed_on + timedelta(days=grace)
    else:
        base = _as_date(created_at) or today
        free_until = base + timedelta(days=free)
    if start_d is not None:
        free_until = max(free_until, start_d + timedelta(days=free))     # nobody loses the app on the day the rule starts
    already = bool(details.billing_suspended) and (details.billing_suspended_reason or "") == REASON
    if already or today > free_until:
        return {"state": "SUSPENDED", "free_until": free_until.isoformat(), "days_left": 0, "valid_until": None}
    return {"state": "STANDARD", "free_until": free_until.isoformat(), "days_left": (free_until - today).days, "valid_until": None}


def owner_standing(db: Session, vehicle_owner_id) -> dict:
    details = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id).first()
    cred = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == vehicle_owner_id).first()
    settings = get_settings(db)
    if details is None:
        return {"enabled": settings["enabled"], "state": "UNKNOWN"}
    out = standing(details, details.created_at or (cred.created_at if cred else None), settings)
    out["enabled"] = settings["enabled"]
    out["monthly_fee"] = int(_raw_fee(db))
    return out


def _raw_fee(db: Session) -> int:
    from app.crud.billing import get_billing_settings
    return int(get_billing_settings(db).get("monthly_fee") or 199)


def run_subscription_lifecycle(db: Session, dry_run: bool = True) -> dict:
    """Suspend the owners whose free window has run out. Returns who was (or would be) suspended."""
    from app.core import account_gate

    settings = get_settings(db)
    out = {"dry_run": dry_run, "enabled": settings["enabled"], "settings": settings, "suspended": [], "ending_soon": [], "checked": 0}
    if not settings["enabled"]:
        return out
    today = date.today()
    now = datetime.now(timezone.utc)
    rows = (
        db.query(VehicleOwnerDetails, VehicleOwnerCredentials)
        .join(VehicleOwnerCredentials, VehicleOwnerCredentials.id == VehicleOwnerDetails.vehicle_owner_id)
        .filter(VehicleOwnerCredentials.permanently_blocked.is_(False))
        .all()
    )
    for d, c in rows:
        out["checked"] += 1
        if d.billing_suspended and (d.billing_suspended_reason or "") != REASON:
            continue                                  # suspended by staff for another reason - not ours to touch
        st = standing(d, d.created_at or c.created_at, settings, today)
        item = {"vehicle_owner_id": str(d.vehicle_owner_id), "name": d.full_name, "phone": d.primary_number, "free_until": st["free_until"]}
        if st["state"] == "SUSPENDED" and not (d.billing_suspended and (d.billing_suspended_reason or "") == REASON):
            out["suspended"].append(item)
            if not dry_run:
                d.billing_suspended = True
                d.billing_suspended_at = now
                d.billing_suspended_by = "system"
                d.billing_suspended_reason = REASON
                db.add(d)
                account_gate.invalidate(d.vehicle_owner_id)
        elif st["state"] == "STANDARD" and st["days_left"] is not None and st["days_left"] <= 3:
            out["ending_soon"].append({**item, "days_left": st["days_left"]})
    if not dry_run and out["suspended"]:
        db.commit()
    return out


def lift_suspension(details: VehicleOwnerDetails) -> None:
    """A subscription was bought: forget the lifecycle suspension (the caller commits)."""
    if (details.billing_suspended_reason or "") == REASON:
        details.billing_suspended = False
        details.billing_suspended_reason = None
        details.billing_suspended_at = None
        details.billing_suspended_by = None
        try:
            from app.core import account_gate
            account_gate.invalidate(details.vehicle_owner_id)
        except Exception:  # noqa: BLE001
            pass
