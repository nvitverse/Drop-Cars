"""Active / Inactive and Verified - two different things, for cars, drivers, partners (fleet owners) and vendors.

ACTIVE   = may work (take / be given bookings). A car or driver is INACTIVE while ANY reason applies:
             * a document is past its date (car: Insurance / Permit / FC when the vehicle needs one; driver: licence)
             * a document was marked INVALID (wrong document / not an original / the date typed does not match)
             * a person switched it off (manual_inactive_reason - e.g. "customer complaints")
             * its customer rating is below the limit set in the Admin App (auto_inactive_reason, refreshed by the daily sweep)
VERIFIED = the paperwork was really checked: car = every required document VERIFIED (originals checked);
           driver = licence AND the police verification certificate VERIFIED.
Verified is a badge; it never switches anyone off. "Not verified yet" is not "inactive".
Every threshold is a platform setting (Admin App > Settings), nothing hardcoded."""
from datetime import date
from typing import List, Optional

from app.models.common_enums import DocumentStatusEnum

V = DocumentStatusEnum.VERIFIED


def _setting(db, key: str, default: str) -> str:
    from app.crud.customer_booking_request import get_platform_setting_value
    try:
        return str(get_platform_setting_value(db, key, default) or default)
    except Exception:
        return default


def _num(db, key: str, default: float) -> float:
    try:
        return float(_setting(db, key, str(default)))
    except ValueError:
        return default


def car_verified_status(car, today: Optional[date] = None) -> dict:
    """{verified: bool, missing: [names of documents that are not VERIFIED yet]}"""
    from app.crud.verification import fc_status_for_car
    need = [("RC front", "rc_front_status"), ("RC back", "rc_back_status"), ("Insurance", "insurance_status"), ("Permit", "permit_status")]
    if fc_status_for_car(car, today)["required"]:
        need.append(("FC", "fc_status"))
    missing = [label for label, f in need if getattr(car, f, None) != V]
    return {"verified": not missing, "missing": missing}


def driver_verified_status(driver) -> dict:
    need = [("Driving licence front", "licence_front_status"), ("Driving licence back", "licence_back_status"),
            ("Police verification certificate", "police_verification_status")]
    missing = [label for label, f in need if getattr(driver, f, None) != V]
    return {"verified": not missing, "missing": missing}


def car_activity(car, today: Optional[date] = None) -> dict:
    from app.crud.verification import car_document_problems
    reasons: List[str] = list(car_document_problems(car, today))     # documents + switched-off-by-staff + low rating
    v = car_verified_status(car, today)
    return {"active": not reasons, "inactive_reasons": reasons, "verified": v["verified"], "not_verified": v["missing"]}


def driver_activity(driver, today: Optional[date] = None) -> dict:
    from app.crud.verification import driver_document_problems
    reasons: List[str] = list(driver_document_problems(driver, today))
    v = driver_verified_status(driver)
    return {"active": not reasons, "inactive_reasons": reasons, "verified": v["verified"], "not_verified": v["missing"]}


def partner_activity(details) -> dict:
    reasons = []
    if getattr(details, "manual_inactive_reason", None):
        reasons.append(f"Switched off by Drop Cars: {details.manual_inactive_reason}")
    return {"active": not reasons, "inactive_reasons": reasons}


def refresh_auto_inactive(db) -> dict:
    """Daily: switch cars / drivers off (or back on) by customer rating. Settings (0 = off):
         min_car_rating, min_driver_rating, min_rating_count (ratings needed before the limit applies)."""
    from app.models.car_details import CarDetails
    from app.models.car_driver import CarDriver
    min_car = _num(db, "min_car_rating", 0)
    min_driver = _num(db, "min_driver_rating", 0)
    min_count = int(_num(db, "min_rating_count", 5))
    out = {"cars_off": 0, "cars_on": 0, "drivers_off": 0, "drivers_on": 0}

    def _apply(rows, limit, label, key):
        for r in rows:
            low = bool(limit) and (r.rating_count or 0) >= min_count and (r.rating_avg or 0) < limit
            want = f"{label} rating is {round(r.rating_avg or 0, 1)} (limit {limit:g}) from {r.rating_count} customer ratings" if low else None
            if (r.auto_inactive_reason or None) != want:
                r.auto_inactive_reason = want
                out[f"{key}_off" if want else f"{key}_on"] += 1
    _apply(db.query(CarDetails).all(), min_car, "Car quality", "cars")
    _apply(db.query(CarDriver).all(), min_driver, "Driver", "drivers")
    db.commit()
    return out


KINDS = {"car", "driver", "partner", "vendor"}


def set_manual_active(db, kind: str, entity_id, active: bool, reason: Optional[str]):
    """Switch an account off (reason required) or back on. Returns the entity."""
    from fastapi import HTTPException
    import uuid as _uuid
    if kind not in KINDS:
        raise HTTPException(status_code=400, detail="kind must be car, driver, partner or vendor")
    if not active and not (reason or "").strip():
        raise HTTPException(status_code=400, detail="Give a reason - the owner is shown it")
    try:
        eid = _uuid.UUID(str(entity_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    if kind == "car":
        from app.models.car_details import CarDetails as M
        row = db.query(M).filter(M.id == eid).first()
    elif kind == "driver":
        from app.models.car_driver import CarDriver as M
        row = db.query(M).filter(M.id == eid).first()
    elif kind == "partner":
        from app.models.vehicle_owner_details import VehicleOwnerDetails as M
        row = db.query(M).filter(M.vehicle_owner_id == eid).first()
    else:
        from app.models.vendor_details import VendorDetails as M
        row = db.query(M).filter(M.vendor_id == eid).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"{kind} not found")
    row.manual_inactive_reason = None if active else reason.strip()[:500]
    if active and kind in ("car", "driver"):
        row.auto_inactive_reason = None   # turning it back on also clears the rating switch-off until the next daily sweep re-checks
    db.add(row)
    return row
