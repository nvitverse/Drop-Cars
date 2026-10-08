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
    "platform_fee_pct": "2",             # RETIRED 2026-09-24 (old 2% taken from the driver) - unused, kept so old rows don't error
    "ai_bot_enabled": "1",  # Help Bot uses the AI model when a key is configured on the server
    "ai_bot_daily_limit": "30",
    "ai_bot_global_daily_limit": "3000",
    "doc_ai_enabled": "0",  # OFF until the owner switches it on (sends document photos to Google Gemini)
    "doc_ai_daily_limit": "2000",
    "website_booking_post_mode": "AUTO",  # MANUAL = staff approve every booking; AUTO = auto-post after the review window; AUTO_IF_NO_STAFF = auto-post only while no staff is on duty
    "platform_share_pct": "1",           # platform's share, % of the km fare, carved out of the commission (poster/vendor gets the rest)
    "platform_share_min": "30",          # ... but at least this many rupees (never above the commission itself)
    "commission_min": "200",             # Standard Outstation bookings: minimum commission the driver pays
    "convenience_fee": "30",             # flat fee added to EVERY booking's customer bill, settled to the platform
    "platform_all_inclusive_pct": "15",  # website / admin all-inclusive split kept by the platform
    "min_driver_hold": "500",            # minimum wallet hold on the accepting driver (no-show guarantee)
    "drop_bid_fee_pct": "5",             # platform cut on confirmed Drop Bid trips (customer-direct negotiated fare)
    # Printed on every GST tax invoice (Website's invoice-gst.php, and the
    # backend's own PDF invoice) - Owner-editable so a wrong/placeholder
    # GSTIN never stays baked into code. Owner-confirmed 2026-09-23: one
    # GSTIN currently covers both the "Drop Cars" and "Arunachala Travels"
    # brands.
    "gst_number": "33BBVPN8562P1ZJ",
    "gst_business_name": "Drop Cars",
    "gst_business_address": "",
    # Standard -> Trusted upgrade screen + staff accounts (crud/fleet_payment_links.py, api/routes/admin.py) - Owner-editable text
    # Posted bookings nobody accepted -> staff alarm (api/routes/admin.py), and how many "last minutes" pushes drivers get
    "unaccepted_alarm_minutes_before": "120",   # ring this many minutes before pickup ...
    "unaccepted_short_notice_hours": "4",       # ... but a booking posted inside this many hours of pickup ...
    "unaccepted_short_notice_percent": "50",    # ... rings once this % of the time between posting and pickup has passed
    "multicity_waiting_rate_per_hour": "60",    # Rs billed per hour of waiting on a multi-city trip (60 = the old Rs 1 per minute)
    "multicity_waiting_free_minutes": "0",      # waiting minutes that are never billed (waiting hours included in the booking are free too)
    "min_app_build_driver": "0",                # an installed Driver App with a build number below this must update (0 = off)
    "min_app_build_customer": "0",              # same for the Customer App
    "trip_otp_enforced": "1",                   # 1 = a trip cannot start or end without the customer's code; 0 = emergency switch only
    "urgent_reminder_max_count": "1",           # drivers get this many "closing soon" pushes per booking (was one per minute)
    "fleet_payment_channels": "Wallet,GPay,PhonePe,Paytm,Bank Transfer,Cash in Hand",   # comma separated; "Wallet" debits the partner's wallet
    "fleet_payment_link_message": "Hello {name}, please pay Rs.{amount} for your Drop Cars {plan} Trusted Partner plan using this secure link:\n{link}\nYour account is upgraded automatically as soon as the payment is done. - Drop Cars",
    "fleet_payment_link_expiry_hours": "48",
    "staff_permission_keys": "",                                                         # extra staff permission keys, comma separated
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
