# app/utils/savaari_monitor.py
"""
Background engine for monitoring Savaari vendor panel bookings.
Periodically fetches available bookings from Savaari vendor portal/session,
deduplicates against `savaari_bookings` DB table, evaluates admin alert filters,
and sends Expo push notifications with custom sound to all admin devices.
"""
import logging
import requests
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.database.session import SessionLocal
from app.models.savaari_booking import SavaariBooking
from app.models.savaari_alert_filter import SavaariAlertFilter
from app.models.notification import Notification
from app.crud.notification import _post_expo_payloads_sync

logger = logging.getLogger("dropcars.savaari_monitor")

# Base URL for Savaari Vendor Portal acceptance links
SAVAARI_VENDOR_BASE_URL = "https://vendor.savaari.com/bookings"


def fetch_savaari_bookings_from_source(session_cookie: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Fetches raw booking list from Savaari vendor portal.
    If credentials/session are configured, calls Savaari vendor endpoint.
    Returns a normalized list of booking dicts.
    """
    # Demo/Fallback structure if real network session is unconfigured or offline
    # In production, this issues HTTP request with stored vendor cookies/token.
    try:
        if session_cookie:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Cookie": session_cookie,
                "Accept": "application/json"
            }
            # Example endpoint placeholder - replaces with configured partner portal URL
            resp = requests.get("https://vendor.savaari.com/api/v1/available-bookings", headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list):
                    return data
                elif isinstance(data, dict) and "bookings" in data:
                    return data["bookings"]
    except Exception as e:
        logger.warning(f"Network fetch from Savaari vendor portal failed: {e}")

    return []


def check_booking_matches_filters(booking_data: Dict[str, Any], filters: List[SavaariAlertFilter]) -> tuple[bool, Optional[str]]:
    """
    Evaluates whether a booking matches any active admin filter.
    Returns (matches: bool, matched_filter_name: str).
    If no filters exist in the database, defaults to True (alert all bookings).
    """
    if not filters:
        return True, "Default (All Bookings)"

    price = float(booking_data.get("price") or 0)
    pickup = (booking_data.get("pickup_city") or "").strip().lower()
    drop = (booking_data.get("drop_city") or "").strip().lower()
    car_type = (booking_data.get("car_type") or "").strip().lower()
    trip_type = (booking_data.get("trip_type") or "").strip().lower()

    for flt in filters:
        if not flt.is_active:
            continue

        # Check pickup city filter
        if flt.pickup_city and flt.pickup_city.strip().lower() not in pickup:
            continue

        # Check drop city filter
        if flt.drop_city and flt.drop_city.strip().lower() not in drop:
            continue

        # Check car type filter
        if flt.car_type and flt.car_type.strip().lower() not in car_type:
            continue

        # Check trip type filter
        if flt.trip_type and flt.trip_type.strip().lower() not in trip_type:
            continue

        # Check minimum price threshold
        if flt.min_price is not None and price < float(flt.min_price):
            continue

        return True, flt.filter_name

    return False, None


def notify_all_admins_savaari_booking(db: Session, booking: SavaariBooking, filter_name: str) -> bool:
    """
    Sends Expo Push Notification with custom alert sound to all registered admin devices.
    """
    try:
        # Retrieve all registered push tokens in notifications table (admin, vendor, drivers)
        all_notifs = db.query(Notification).filter(
            Notification.token.isnot(None),
            Notification.token != ""
        ).all()

        # Deduplicate tokens
        tokens = list(set([n.token for n in all_notifs if n.token and str(n.token).strip()]))
        if not tokens:
            logger.info("No registered push tokens found for Savaari push alert.")
            return False

        price_str = f"₹{int(booking.price):,}" if booking.price else "Price N/A"
        route_str = f"{booking.pickup_city or 'Pickup'} → {booking.drop_city or 'Drop'}"
        title = f"🚨 Savaari Alert: {price_str} ({booking.car_type or 'Cab'})"
        body = f"{route_str} | ID: {booking.booking_id} | Click to view & accept immediately!"

        payloads = [
            {
                "to": token,
                "title": title,
                "body": body,
                "sound": "notification_tone.wav",
                "priority": "high",
                "channelId": "dropcars-custom-sound-v2",
                "data": {
                    "type": "savaari_booking",
                    "booking_id": booking.booking_id,
                    "savaari_url": booking.savaari_url or f"{SAVAARI_VENDOR_BASE_URL}/{booking.booking_id}",
                    "price": booking.price,
                },
                "android": {
                    "channelId": "dropcars-custom-sound-v2",
                    "sound": "notification_tone.wav",
                    "priority": "max"
                }
            }
            for token in tokens
        ]
        from app.utils.notification_settings import apply_notification_extras
        for p in payloads:
            apply_notification_extras(p, db, "savaari_booking_alert")

        res = _post_expo_payloads_sync(payloads)
        logger.info(f"Savaari alert push sent to {len(tokens)} admin(s): {res}")
        return True
    except Exception as e:
        logger.error(f"Failed to send Savaari push notification: {e}")
        return False


def run_savaari_monitor_cycle(db: Session) -> Dict[str, Any]:
    """
    Executes one background sweep cycle of the Savaari monitor.
    Deduplicates new bookings, inserts them into DB, checks filters, and alerts admins.
    """
    new_detected = 0
    notifications_sent = 0

    # Fetch active alert filters
    active_filters = db.query(SavaariAlertFilter).filter(SavaariAlertFilter.is_active == True).all()

    # Get bookings from source
    raw_bookings = fetch_savaari_bookings_from_source()

    for item in raw_bookings:
        b_id = str(item.get("booking_id") or item.get("id") or "").strip()
        if not b_id:
            continue

        # Check if already processed
        existing = db.query(SavaariBooking).filter(SavaariBooking.booking_id == b_id).first()
        if existing:
            continue

        price_val = float(item.get("price") or item.get("amount") or 0)
        s_url = item.get("savaari_url") or f"{SAVAARI_VENDOR_BASE_URL}/{b_id}"

        new_booking = SavaariBooking(
            booking_id=b_id,
            pickup_city=item.get("pickup_city"),
            drop_city=item.get("drop_city"),
            car_type=item.get("car_type"),
            trip_type=item.get("trip_type", "Oneway"),
            price=price_val,
            pickup_time_str=item.get("pickup_time"),
            savaari_url=s_url,
            is_notified=False,
            raw_data=item
        )
        db.add(new_booking)
        db.flush()

        new_detected += 1

        # Evaluate filters
        matches, filter_name = check_booking_matches_filters(item, active_filters)
        if matches:
            sent = notify_all_admins_savaari_booking(db, new_booking, filter_name or "Filter Match")
            if sent:
                new_booking.is_notified = True
                notifications_sent += 1

    db.commit()
    return {
        "new_detected": new_detected,
        "notifications_sent": notifications_sent
    }
