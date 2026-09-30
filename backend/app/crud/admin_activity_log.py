# crud/admin_activity_log.py
from datetime import datetime
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from app.models.admin_activity_log import AdminActivityLog


def resolve_account_display_name(db: Session, account_type: Optional[str], account_id: Optional[str]) -> Optional[str]:
    """Best-effort real name for an account, for the activity-log's
    target_name - without this, entries like PERMANENT_BLOCK/
    ACCOUNT_STATUS_CHANGE/WALLET_ADJUST had no target_name at all, so the
    Staff Activity Log fell back to a generic "a vehicle_owner"/"a vendor"
    instead of naming who was actually affected. A fresh single-row lookup
    (not reusing whatever the calling CRUD function already fetched) since
    those functions return credentials rows, not the *_details rows the
    display name actually lives on, across 3+ different call sites -
    simplest to keep this one lookup point in sync for all of them."""
    if not account_type or not account_id:
        return None
    t = str(account_type).lower()
    try:
        if t in ("vendor", "vendors"):
            from app.models.vendor_details import VendorDetails
            row = db.query(VendorDetails).filter(VendorDetails.vendor_id == account_id).first()
            return (row.business_name or row.full_name) if row else None
        if t in ("vehicle_owner", "vehicle_owners", "vehicleowner"):
            from app.models.vehicle_owner_details import VehicleOwnerDetails
            row = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == account_id).first()
            return row.full_name if row else None
        if t in ("driver", "drivers", "quickdriver", "quickdrivers"):
            from app.models.car_driver import CarDriver
            row = db.query(CarDriver).filter(CarDriver.id == account_id).first()
            return row.full_name if row else None
    except Exception:
        return None
    return None


def log_admin_action(
    db: Session,
    *,
    admin_id: Optional[str],
    admin_username: str,
    admin_role: Optional[str] = None,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    target_name: Optional[str] = None,
    details: Optional[dict] = None,
) -> None:
    """Record one sensitive admin action for the Owner-visible activity feed.

    Deliberately swallows its own errors (logs to stdout, never raises) -
    an audit-trail write failing should never block the real action it's
    describing from completing."""
    try:
        entry = AdminActivityLog(
            admin_id=admin_id,
            admin_username=admin_username or "Unknown",
            admin_role=admin_role,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            target_name=target_name,
            details=details,
        )
        db.add(entry)
        db.commit()
    except Exception as e:
        print(f"admin activity log write failed (action still applied): {e}")
        db.rollback()


def get_admin_activity_log(
    db: Session, skip: int = 0, limit: int = 50, since: Optional[datetime] = None, until: Optional[datetime] = None
) -> Tuple[List[AdminActivityLog], int]:
    query = db.query(AdminActivityLog)
    if since is not None:
        query = query.filter(AdminActivityLog.created_at >= since)
    if until is not None:
        query = query.filter(AdminActivityLog.created_at < until)
    total_count = query.count()
    rows = (
        query
        .order_by(AdminActivityLog.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return rows, total_count


def clear_admin_activity_log(db: Session, since: Optional[datetime] = None, until: Optional[datetime] = None) -> int:
    """Bulk-delete activity log rows. `since=None` clears everything;
    otherwise only rows in [since, until) are removed."""
    query = db.query(AdminActivityLog)
    if since is not None:
        query = query.filter(AdminActivityLog.created_at >= since)
    if until is not None:
        query = query.filter(AdminActivityLog.created_at < until)
    deleted = query.delete(synchronize_session=False)
    db.commit()
    return deleted
