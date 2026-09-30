# crud/system_settings.py
"""
Central system configuration CRUD backed by PlatformSetting model.
Allows dynamic administration of platform parameters (fees, rate limits, thresholds, search radius)
without hardcoding values in code.
"""
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.platform_setting import PlatformSetting

SYSTEM_SETTING_DEFAULTS = {
    "registration_fee": "500",
    "platform_commission_pct": "10",
    "gps_spoof_speed_kmh": "140",
    "otp_rate_limit_max": "5",
    "driver_search_radius_km": "25",
    "yearly_fee": "1000",
    "monthly_fee": "199",
    "suspend_threshold": "-100",
    "driver_auto_acceptance_timeout_minutes": "15",
    # Same key crud/customer_booking_request.py's PHONE_REVEAL_HOURS_BEFORE_KEY
    # reads (get_masked_customer_number) - sharing this generic settings
    # table/screen instead of a second, admin-UI-less endpoint that nothing
    # in the Admin App ever called.
    "phone_reveal_hours_before_pickup": "6",
    # Booking commission model (utils/commission.py) - Owner-editable, no hard-coded numbers
    "platform_fee_pct": "2",             # app owner fee, % of the driver fare, on every non-website booking
    "platform_all_inclusive_pct": "15",  # website / admin all-inclusive split kept by the platform
    "min_driver_hold": "500",            # minimum wallet hold on the accepting driver (no-show guarantee)
    "drop_bid_fee_pct": "5",             # platform cut on confirmed Drop Bid trips (customer-direct negotiated fare)
}


def get_all_system_settings(db: Session) -> Dict[str, Any]:
    """Retrieve all platform settings merged with default fallback values."""
    rows = db.query(PlatformSetting).all()
    results = dict(SYSTEM_SETTING_DEFAULTS)
    for r in rows:
        results[r.key] = r.value
    
    # Cast known numeric values for convenience in response schemas
    formatted = {}
    for key, value in results.items():
        if value.isdigit() or (value.startswith('-') and value[1:].isdigit()):
            formatted[key] = int(value)
        else:
            try:
                formatted[key] = float(value)
            except ValueError:
                formatted[key] = value
    return formatted


def update_system_settings(db: Session, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Update system settings in the PlatformSetting table."""
    for key, val in updates.items():
        if val is None:
            continue
        val_str = str(val)
        row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        if row:
            row.value = val_str
        else:
            row = PlatformSetting(key=key, value=val_str)
        db.add(row)
    db.commit()
    return get_all_system_settings(db)
