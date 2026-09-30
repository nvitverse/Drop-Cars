from typing import Dict, Any
from sqlalchemy.orm import Session
from app.models.platform_setting import PlatformSetting

ASSIGNMENT_PRIORITY_DEFAULTS: Dict[str, Any] = {
    "priority_cutoff_hours": 3,
    "priority_cutoff_pct": 50,
    "assignment_default_mins": 30,
    "assignment_pct": 50,
    "assignment_min_mins": 7,
    "alarm_pct": 50,
    "alarm_duration_secs": 15,
    "grace_under_1h_mins": 5,
    "grace_over_1h_mins": 30,
}

SETTING_KEY_PREFIX = "ASSIGNMENT_PRIORITY_"


def get_assignment_priority_config(db: Session) -> Dict[str, Any]:
    """Retrieve current assignment & priority configuration from PlatformSetting table."""
    keys = [f"{SETTING_KEY_PREFIX}{k.upper()}" for k in ASSIGNMENT_PRIORITY_DEFAULTS.keys()]
    rows = db.query(PlatformSetting).filter(PlatformSetting.key.in_(keys)).all()
    setting_map = {row.key: row.value for row in rows if row.value is not None}

    result = {}
    for key, default_val in ASSIGNMENT_PRIORITY_DEFAULTS.items():
        db_key = f"{SETTING_KEY_PREFIX}{key.upper()}"
        val_str = setting_map.get(db_key)
        if val_str is not None and val_str.isdigit():
            result[key] = int(val_str)
        else:
            result[key] = default_val

    return result


def update_assignment_priority_config(db: Session, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Update assignment & priority configuration in PlatformSetting table."""
    for key, val in updates.items():
        if key in ASSIGNMENT_PRIORITY_DEFAULTS:
            db_key = f"{SETTING_KEY_PREFIX}{key.upper()}"
            val_str = str(int(val))
            row = db.query(PlatformSetting).filter(PlatformSetting.key == db_key).first()
            if row:
                row.value = val_str
            else:
                row = PlatformSetting(key=db_key, value=val_str)
                db.add(row)

    db.commit()
    return get_assignment_priority_config(db)
