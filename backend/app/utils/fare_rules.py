import json
from typing import Dict

# Admin-editable fare constants (Settings > Fare Rules). Stored in
# platform_settings like the city list, so the owner can tune them without a
# deploy. Read fresh from the DB on every call - this is only hit on
# quote/confirm and the settings screen, so there's no need for the extra
# complexity of an in-memory cache with invalidation.
FARE_RULES_SETTING_KEY = "fare_rules_json"

DEFAULT_FARE_RULES: Dict[str, int] = {
    # Oneway: flat minimum billable km for the whole trip (unchanged from the
    # original hardcoded behavior).
    "oneway_min_km": 130,
    # Round Trip / Multi City: minimum billable km PER DAY of the trip.
    # Fare = max(min_km_per_day * days, actual_km) * rate + driver_allowance * days
    "round_trip_min_km_per_day": 250,
    "multicity_min_km_per_day": 250,
}


def get_fare_rules() -> Dict[str, int]:
    try:
        from app.database.session import SessionLocal
        from app.models.platform_setting import PlatformSetting

        db = SessionLocal()
        try:
            row = db.query(PlatformSetting).filter(
                PlatformSetting.key == FARE_RULES_SETTING_KEY
            ).first()
            if row and row.value:
                stored = json.loads(row.value)
                if isinstance(stored, dict):
                    merged = dict(DEFAULT_FARE_RULES)
                    merged.update({k: int(v) for k, v in stored.items() if k in DEFAULT_FARE_RULES})
                    return merged
            return dict(DEFAULT_FARE_RULES)
        finally:
            db.close()
    except Exception:
        # Settings table not ready / DB hiccup - fare calc must never break
        return dict(DEFAULT_FARE_RULES)


def save_fare_rules(db, rules: Dict[str, int]) -> Dict[str, int]:
    from app.models.platform_setting import PlatformSetting

    merged = dict(DEFAULT_FARE_RULES)
    merged.update({k: int(v) for k, v in rules.items() if k in DEFAULT_FARE_RULES and v is not None})

    row = db.query(PlatformSetting).filter(
        PlatformSetting.key == FARE_RULES_SETTING_KEY
    ).first()
    value = json.dumps(merged)
    if row:
        row.value = value
    else:
        row = PlatformSetting(key=FARE_RULES_SETTING_KEY, value=value)
    db.add(row)
    db.commit()
    return merged
