"""Permanent-block list: nobody whose phone / Aadhaar / PAN / licence / vehicle / e-mail was blocked can open a new account.

Used by (1) set_permanent_block, which records every identifier of the blocked account (and of the drivers and cars under a fleet owner), and
(2) every sign-up path, which calls assert_not_blocked before anything is created.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
from typing import Iterable, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.blocked_identifier import BlockedIdentifier

log = logging.getLogger(__name__)

PHONE, EMAIL, AADHAAR, PAN, LICENCE, VEHICLE = "PHONE", "EMAIL", "AADHAAR", "PAN", "LICENCE", "VEHICLE"

IDENTITY_BLOCKED_MESSAGE = (
    "This mobile number / ID cannot be used to open a Drop Cars account. "
    "Please contact the Drop Cars operations team. [IDENTITY_BLOCKED]"
)


def _pepper() -> bytes:
    key = os.getenv("BLOCKLIST_PEPPER") or os.getenv("SECRET_KEY")
    if not key:
        try:
            from app.core.security import SECRET_KEY as key  # type: ignore
        except Exception:  # noqa: BLE001
            key = "dropcars-blocklist"
    return str(key).encode("utf-8")


def normalize(id_type: str, value) -> Optional[str]:
    """Canonical form of an identifier, or None when it is empty / too short to mean anything."""
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if id_type == PHONE:
        digits = re.sub(r"\D", "", raw)[-10:]
        return digits if len(digits) == 10 else None
    if id_type == EMAIL:
        v = raw.lower()
        return v if "@" in v else None
    if id_type == AADHAAR:
        digits = re.sub(r"\D", "", raw)
        return digits if len(digits) == 12 else None
    if id_type in (PAN, LICENCE, VEHICLE):
        v = re.sub(r"[^A-Za-z0-9]", "", raw).upper()
        return v if len(v) >= 5 else None
    return None


def hash_identifier(id_type: str, normalized: str) -> str:
    return hmac.new(_pepper(), f"{id_type}:{normalized}".encode("utf-8"), hashlib.sha256).hexdigest()


def _pairs(items: Iterable[Tuple[str, object]]) -> List[Tuple[str, str, str]]:
    out, seen = [], set()
    for id_type, value in items:
        n = normalize(id_type, value)
        if not n or (id_type, n) in seen:
            continue
        seen.add((id_type, n))
        out.append((id_type, n, hash_identifier(id_type, n)))
    return out


def find_block(db: Session, items: Iterable[Tuple[str, object]]) -> Optional[BlockedIdentifier]:
    pairs = _pairs(items)
    if not pairs:
        return None
    cond = or_(*[and_(BlockedIdentifier.id_type == t, BlockedIdentifier.id_hash == h) for t, _n, h in pairs])
    return db.query(BlockedIdentifier).filter(cond).first()


def assert_not_blocked(db: Session, *, phone=None, phone2=None, email=None, aadhaar=None, pan=None, licence=None, vehicle=None) -> None:
    """Raise 403 when any identifier belongs to a permanently blocked person. Never reveals which one matched."""
    try:
        hit = find_block(db, [(PHONE, phone), (PHONE, phone2), (EMAIL, email), (AADHAAR, aadhaar), (PAN, pan), (LICENCE, licence), (VEHICLE, vehicle)])
    except Exception:  # noqa: BLE001  (a missing table must never stop a normal sign-up)
        db.rollback()
        log.exception("blocklist lookup failed")
        return
    if hit is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=IDENTITY_BLOCKED_MESSAGE)


def block_identifiers(db: Session, items: Iterable[Tuple[str, object]], *, reason: str, by: str, source_type: str, source_id) -> int:
    """Record identifiers (idempotent). Returns how many NEW entries were added. Does not commit."""
    added = 0
    for id_type, n, h in _pairs(items):
        if db.query(BlockedIdentifier.id).filter(BlockedIdentifier.id_type == id_type, BlockedIdentifier.id_hash == h).first():
            continue
        db.add(BlockedIdentifier(id_type=id_type, id_hash=h, hint=n[-4:], reason=reason, blocked_by=by,
                                 source_account_type=source_type, source_account_id=str(source_id)))
        added += 1
    db.flush()
    return added


def unblock_by_source(db: Session, source_id) -> int:
    """Lift exactly the entries that were added for this account. Does not commit."""
    return db.query(BlockedIdentifier).filter(BlockedIdentifier.source_account_id == str(source_id)).delete(synchronize_session=False)


def driver_items(d) -> List[Tuple[str, object]]:
    return [(PHONE, d.primary_number), (PHONE, getattr(d, "secondary_number", None)), (EMAIL, getattr(d, "email", None)),
            (LICENCE, getattr(d, "licence_number", None)), (AADHAAR, getattr(d, "aadhar_number", None))]


def owner_identifiers(db: Session, owner_id) -> List[Tuple[str, object]]:
    """Everything that identifies a fleet owner AND the drivers and cars under him."""
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.car_driver import CarDriver
    from app.models.car_details import CarDetails

    items: List[Tuple[str, object]] = []
    cred = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == owner_id).first()
    if cred is not None:
        items += [(PHONE, cred.primary_number), (EMAIL, getattr(cred, "email", None))]
    det = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == owner_id).first()
    if det is not None:
        items += [(PHONE, det.primary_number), (PHONE, det.secondary_number), (PHONE, getattr(det, "gpay_number", None)),
                  (AADHAAR, det.aadhar_number), (PAN, det.pan_number)]
    for d in db.query(CarDriver).filter(CarDriver.vehicle_owner_id == owner_id).all():
        items += driver_items(d)
    for c in db.query(CarDetails).filter(CarDetails.vehicle_owner_id == owner_id).all():
        items.append((VEHICLE, c.car_number))
    return items


def vendor_identifiers(db: Session, vendor_id) -> List[Tuple[str, object]]:
    from app.models.vendor import VendorCredentials
    from app.models.vendor_details import VendorDetails

    items: List[Tuple[str, object]] = []
    cred = db.query(VendorCredentials).filter(VendorCredentials.id == vendor_id).first()
    if cred is not None:
        items += [(PHONE, cred.primary_number), (EMAIL, getattr(cred, "email", None))]
    det = db.query(VendorDetails).filter(VendorDetails.vendor_id == vendor_id).first()
    if det is not None:
        items += [(PHONE, det.primary_number), (PHONE, getattr(det, "gpay_number", None)), (AADHAAR, det.aadhar_number)]
    return items
