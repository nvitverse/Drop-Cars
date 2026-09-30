# utils/reg_id.py
"""
Human-friendly registration IDs: "YY" + 5-digit serial, e.g. 2600042 = the
42nd account registered in 2026. One shared counter per year across vendors,
fleet owners and drivers, so every reg_id is unique platform-wide.

The UUID primary keys are untouched — reg_id is display/search only.
Assignment is wrapped so a counter problem can never fail a signup.
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting


def _next_serial(db: Session, yy: str) -> int:
    """Atomically increment and return the registration counter for a year (row-locked)."""
    key = f"reg_seq_{yy}"
    row = (
        db.query(PlatformSetting)
        .filter(PlatformSetting.key == key)
        .with_for_update()
        .first()
    )
    if row is None:
        row = PlatformSetting(key=key, value="1")
        db.add(row)
        db.flush()
        return 1
    serial = int(row.value) + 1
    row.value = str(serial)
    db.add(row)
    return serial


def make_reg_id(db: Session, created_at=None) -> str:
    """Build the next reg_id for the year of created_at (default: now)."""
    moment = created_at or datetime.now(timezone.utc)
    yy = moment.strftime("%y")
    serial = _next_serial(db, yy)
    return f"{yy}{serial:05d}"


def assign_reg_id(db: Session, record) -> None:
    """
    Set record.reg_id inside the caller's transaction. Never raises:
    a signup must not fail because of the ID counter. Rows left without a
    reg_id are picked up by the startup backfill.
    """
    try:
        if getattr(record, "reg_id", None):
            return
        record.reg_id = make_reg_id(db)
    except Exception as e:
        print(f"reg_id assignment skipped (continuing): {e}")
