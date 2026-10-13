"""Wallet money added (or taken) twice by mistake.

Two parts:
  1. A guard for manual wallet adjustments: the SAME credit / debit (same person, same direction, same amount) within the last
     `wallet_adjust_duplicate_hours` (default 24) is refused with a clear message unless staff confirm it is intentional.
     (A driver asks twice, staff add the refund twice - Sellappandian, Rs 870, 2026-10-13.)
  2. An audit that lists money that really looks doubled: the same reference credited twice (a definite duplicate), or the same amount
     credited to the same person for the same reason within a day (needs a human look). Read-only."""
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.models.vendor_details import VendorDetails
from app.models.vendor_wallet_ledger import VendorLedgerEntryType, VendorWalletLedger
from app.models.wallet_ledger import WalletEntryTypeEnum, WalletLedger

DUPLICATE_MARK = "[DUPLICATE]"
DEFAULT_WINDOW_HOURS = 24


def window_hours(db: Session) -> int:
    try:
        from app.crud.customer_booking_request import get_platform_setting_value
        return max(1, int(float(get_platform_setting_value(db, "wallet_adjust_duplicate_hours", str(DEFAULT_WINDOW_HOURS)) or DEFAULT_WINDOW_HOURS)))
    except Exception:  # noqa: BLE001
        return DEFAULT_WINDOW_HOURS


def _when(ts) -> str:
    try:
        return (ts + timedelta(hours=5, minutes=30)).strftime("%d %b %H:%M") if ts else "earlier"
    except Exception:  # noqa: BLE001
        return "earlier"


def find_recent_identical_adjust(db: Session, role: str, target_uuid, direction: str, amount: int) -> Optional[dict]:
    """The latest manual adjustment of the same kind and amount inside the window, or None."""
    since = datetime.now(timezone.utc) - timedelta(hours=window_hours(db))
    if role == "vehicle_owner":
        et = WalletEntryTypeEnum.CREDIT if direction == "credit" else WalletEntryTypeEnum.DEBIT
        row = (db.query(WalletLedger)
               .filter(WalletLedger.vehicle_owner_id == target_uuid, WalletLedger.reference_type == "ADMIN_MANUAL_ADJUST",
                       WalletLedger.entry_type == et, WalletLedger.amount == amount, WalletLedger.created_at >= since)
               .order_by(WalletLedger.created_at.desc()).first())
    else:
        et = VendorLedgerEntryType.CREDIT if direction == "credit" else VendorLedgerEntryType.DEBIT
        row = (db.query(VendorWalletLedger)
               .filter(VendorWalletLedger.vendor_id == target_uuid, VendorWalletLedger.order_id.is_(None), VendorWalletLedger.entry_type == et,
                       VendorWalletLedger.amount == amount, VendorWalletLedger.created_at >= since)
               .order_by(VendorWalletLedger.created_at.desc()).first())
    if row is None:
        return None
    return {"at": row.created_at, "when": _when(row.created_at), "notes": row.notes, "amount": row.amount}


def duplicate_message(direction: str, amount: int, previous: dict, hours: int) -> str:
    return (f"{DUPLICATE_MARK} The same Rs {amount} {direction} was already done at {previous['when']} (within the last {hours} hours)"
            f"{': ' + previous['notes'] if previous.get('notes') else ''}. Adding it again would double it. If this is a second, separate payment, confirm to add it again.")


# ----------------------------------------------------------------------------------------------------------------------
def _entry(r, kind: str) -> dict:
    et = getattr(r.entry_type, "value", r.entry_type)
    return {"id": str(r.id), "at": r.created_at.isoformat() if r.created_at else None, "when": _when(r.created_at), "amount": r.amount, "type": str(et),
            "reference_type": getattr(r, "reference_type", None), "reference_id": getattr(r, "reference_id", None), "notes": r.notes, "wallet": kind}


def audit(db: Session, days: int = 14, search: Optional[str] = None, limit: int = 100) -> Dict[str, List[dict]]:
    """Doubled money in the last `days` days. `search` = part of a name or phone number."""
    since = datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 120)))
    names: Dict[str, dict] = {}
    q = db.query(VehicleOwnerDetails)
    if search:
        s = f"%{search.strip()}%"
        q = q.filter(VehicleOwnerDetails.full_name.ilike(s) | VehicleOwnerDetails.primary_number.ilike(s))
    owner_filter = None
    if search:
        found = q.limit(200).all()
        owner_filter = {o.vehicle_owner_id for o in found}
        for o in found:
            names[str(o.vehicle_owner_id)] = {"name": o.full_name, "phone": o.primary_number}
    rows = db.query(WalletLedger).filter(WalletLedger.entry_type == WalletEntryTypeEnum.CREDIT, WalletLedger.created_at >= since)
    if owner_filter is not None:
        rows = rows.filter(WalletLedger.vehicle_owner_id.in_(owner_filter or [None]))
    rows = rows.order_by(WalletLedger.created_at.asc()).limit(20000).all()

    definite: Dict[tuple, list] = {}
    possible: Dict[tuple, list] = {}
    for r in rows:
        if r.reference_id and r.reference_type and r.reference_type not in ("ADMIN_MANUAL_ADJUST",):
            definite.setdefault((str(r.vehicle_owner_id), r.reference_type, r.reference_id), []).append(r)
        possible.setdefault((str(r.vehicle_owner_id), r.reference_type, r.amount), []).append(r)

    groups: List[dict] = []
    for (oid, rtype, rid), items in definite.items():
        if len(items) >= 2:
            groups.append({"strength": "DEFINITE", "why": f"The same {rtype} reference was credited {len(items)} times", "owner_id": oid,
                           "amount": items[0].amount, "total_extra": items[0].amount * (len(items) - 1), "entries": [_entry(i, "vehicle_owner") for i in items]})
    seen_ids = {e["id"] for g in groups for e in g["entries"]}
    for (oid, rtype, amt), items in possible.items():
        if len(items) < 2:
            continue
        for a, b in zip(items, items[1:]):                       # consecutive credits of the same amount and reason inside a day
            if (b.created_at - a.created_at) <= timedelta(hours=24) and str(a.id) not in seen_ids and str(b.id) not in seen_ids:
                groups.append({"strength": "POSSIBLE", "why": f"Rs {amt} ({rtype or 'credit'}) added twice within a day", "owner_id": oid, "amount": amt,
                               "total_extra": amt, "entries": [_entry(a, "vehicle_owner"), _entry(b, "vehicle_owner")]})
                seen_ids.update({str(a.id), str(b.id)})
    missing = {g["owner_id"] for g in groups if g["owner_id"] not in names}
    if missing:
        for o in db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id.in_(list(missing))).all():
            names[str(o.vehicle_owner_id)] = {"name": o.full_name, "phone": o.primary_number}
    for g in groups:
        g.update({"name": (names.get(g["owner_id"]) or {}).get("name"), "phone": (names.get(g["owner_id"]) or {}).get("phone")})
    groups.sort(key=lambda g: (g["strength"] != "DEFINITE", -g["total_extra"]))
    return {"groups": groups[:limit], "days": days, "checked_entries": len(rows),
            "possible_extra_total": sum(g["total_extra"] for g in groups[:limit])}
