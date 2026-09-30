# notification_settings.py
"""
Admin-editable push-notification content, stored in platform_settings (same
key/value table used for SMTP/billing) - never hardcoded, so the owner can
change the alert sound or the spoken sentence per event without a code change.

Each event has:
- sound: filename of a bundled alert-chime, must exist in both apps' assets/sounds/
- speak_text: sentence read aloud on-device (expo-speech) when the app is open
  or the notification is tapped. Background notifications only get the chime -
  phones cannot run custom code while fully closed.
- channel: the Android notification channel id this event's app registers the
  sound under (see each app's channel-setup code). Android freezes a
  channel's sound the moment the channel is first created on a device, and
  Expo routes a push to whatever channelId is on the payload (falling back to
  a soundless "default" channel if omitted) - so this must be set explicitly
  for the sound to actually play, not just bundled. Left unset for events
  whose app's channel setup hasn't been verified.
"""
from sqlalchemy.orm import Session
from app.models.platform_setting import PlatformSetting

# Category-Specific Android Notification Channels per App
DRIVER_CHANNEL_URGENT = "dropcars-urgent-booking-v1"
DRIVER_CHANNEL_NEW_BOOKING = "dropcars-new-booking-v1"
DRIVER_CHANNEL_TRIP_LIFECYCLE = "dropcars-trip-lifecycle-v1"
DRIVER_CHANNEL_WALLET = "dropcars-wallet-earnings-v1"
DRIVER_CHANNEL_ACCOUNT = "dropcars-documents-account-v1"

VENDOR_CHANNEL_ORDERS = "dropcars-vendor-orders-v1"
VENDOR_CHANNEL_WALLET = "dropcars-vendor-wallet-v1"
VENDOR_CHANNEL_ACCOUNT = "dropcars-vendor-account-v1"

CUSTOMER_CHANNEL_DROPBID = "dropcars-customer-dropbid-v1"
CUSTOMER_CHANNEL_TRIP = "dropcars-customer-trip-v1"
CUSTOMER_CHANNEL_WALLET = "dropcars-customer-wallet-v1"

ADMIN_CHANNEL_FINANCIAL = "dropcars-admin-financial-v1"
ADMIN_CHANNEL_ROUTINE = "dropcars-admin-routine-v1"

DRIVER_APP_CHANNEL = DRIVER_CHANNEL_NEW_BOOKING
VENDOR_APP_CHANNEL = VENDOR_CHANNEL_ORDERS

NOTIFICATION_EVENTS = {
    "urgent_booking": {
        "label": "Driver app: Urgent booking alert",
        "sound": "notification_tone.wav",
        "speak_text": "Urgent trip alert from Drop Cars! Immediate response required.",
        "channel": DRIVER_CHANNEL_URGENT,
    },
    "new_booking": {
        "label": "Driver app: New booking alert",
        "sound": "notification_tone.wav",
        "speak_text": "New booking from Drop Cars! Have a safe journey.",
        "channel": DRIVER_CHANNEL_NEW_BOOKING,
    },
    "drop_bid_driver_request": {
        "label": "Driver app: Drop Bid match request",
        "sound": "notification_tone.wav",
        "speak_text": "Drop Market driver request! Urgent response required.",
        "channel": DRIVER_CHANNEL_URGENT,
    },
    "assignment_deadline_warning": {
        "label": "Driver app: Assign driver & car - deadline warning",
        "sound": "notification_tone.wav",
        "speak_text": "Assign a driver and car now, or the booking will be removed with a penalty.",
        "channel": DRIVER_CHANNEL_URGENT,
    },
    "trip_status": {
        "label": "Driver app: Trip lifecycle status",
        "sound": "notification_tone.wav",
        "speak_text": "Trip status updated.",
        "channel": DRIVER_CHANNEL_TRIP_LIFECYCLE,
    },
    "wallet_update": {
        "label": "Driver app: Wallet & payout update",
        "sound": "notification_tone.wav",
        "speak_text": "Wallet transaction update from Drop Cars.",
        "channel": DRIVER_CHANNEL_WALLET,
    },
    "document_update": {
        "label": "Driver app: Document & account status",
        "sound": "notification_tone.wav",
        "speak_text": "Account document status update.",
        "channel": DRIVER_CHANNEL_ACCOUNT,
    },
    "booking_accepted": {
        "label": "Vendor app: Booking accepted",
        "sound": "notification_tone.wav",
        "speak_text": "Your booking has been accepted by a driver.",
        "channel": VENDOR_CHANNEL_ORDERS,
    },
    "driver_assigned": {
        "label": "Vendor app: Driver assigned",
        "sound": "notification_tone.wav",
        "speak_text": "A driver and car have been assigned to your booking.",
        "channel": VENDOR_CHANNEL_ORDERS,
    },
    "trip_completed": {
        "label": "Vendor app: Trip completed",
        "sound": "notification_tone.wav",
        "speak_text": "Your trip has been completed. Thank you for booking with Drop Cars.",
        "channel": VENDOR_CHANNEL_ORDERS,
    },
    "booking_auto_cancelled": {
        "label": "Vendor app: Booking auto-cancelled",
        "sound": "notification_tone.wav",
        "speak_text": "Your booking was auto cancelled because no driver was assigned in time.",
        "channel": VENDOR_CHANNEL_ORDERS,
    },
    "booking_price_updated": {
        "label": "Driver app: Booking price updated",
        "sound": "notification_tone.wav",
        "speak_text": "The fare for one of your bookings has been updated.",
        "channel": DRIVER_APP_CHANNEL,
    },
    "booking_reminder": {
        "label": "Driver app: Manual booking reminder (vendor-triggered)",
        "sound": "notification_tone.wav",
        "speak_text": "Reminder from Drop Cars about a pending booking.",
        "channel": DRIVER_APP_CHANNEL,
    },
    "booking_cancelled_by_vendor": {
        "label": "Driver app: Booking cancelled by vendor",
        "sound": "notification_tone.wav",
        "speak_text": "A booking you accepted has been cancelled by the vendor.",
        "channel": DRIVER_APP_CHANNEL,
    },
    "booking_expired": {
        "label": "Vendor app: Booking expired (not accepted)",
        "sound": "notification_tone.wav",
        "speak_text": "Your booking was not accepted by any driver and has been cancelled.",
        "channel": VENDOR_APP_CHANNEL,
    },
    "customer_booking_approved": {
        "label": "Customer app: Booking request approved",
        "sound": "notification_tone.wav",
        "speak_text": "Your booking request has been approved by Drop Cars.",
    },
    "customer_booking_rejected": {
        "label": "Customer app: Booking request declined",
        "sound": "notification_tone.wav",
        "speak_text": "Your booking request was declined.",
    },
    "customer_driver_assigned": {
        "label": "Customer app: Driver and car assigned",
        "sound": "notification_tone.wav",
        "speak_text": "A driver and vehicle have been assigned to your trip.",
    },
    "customer_trip_completed": {
        "label": "Customer app: Trip completed",
        "sound": "notification_tone.wav",
        "speak_text": "Your journey has ended. Please complete the payment. Thank you for riding with us.",
    },
}

# Only sounds that are ACTUALLY bundled in the app right now. More distinct
# chimes need real audio files added to assets/sounds/ in both apps first
# (Claude cannot generate audio) - add their filenames here once they exist.
AVAILABLE_SOUNDS = [
    "notification_tone.wav",
]


def _keys(event_key: str):
    return f"notif_sound_{event_key}", f"notif_text_{event_key}"


def get_notification_setting(db: Session, event_key: str) -> dict:
    defaults = NOTIFICATION_EVENTS.get(event_key, {"sound": "alert_classic.wav", "speak_text": "", "channel": None})
    sound_key, text_key = _keys(event_key)
    rows = db.query(PlatformSetting).filter(PlatformSetting.key.in_([sound_key, text_key])).all()
    values = {row.key: row.value for row in rows}
    return {
        "sound": values.get(sound_key, defaults["sound"]),
        "speak_text": values.get(text_key, defaults["speak_text"]),
        # Not admin-editable (unlike sound/speak_text) - it's tied to how the
        # app registered its Android channel, not a content choice.
        "channel": defaults.get("channel"),
    }


def get_all_notification_settings(db: Session) -> dict:
    return {event_key: get_notification_setting(db, event_key) for event_key in NOTIFICATION_EVENTS}


def update_notification_settings(db: Session, updates: dict) -> dict:
    """updates: {event_key: {"sound": ..., "speak_text": ...}}"""
    for event_key, values in updates.items():
        if event_key not in NOTIFICATION_EVENTS:
            continue
        sound_key, text_key = _keys(event_key)
        for key, value in ((sound_key, values.get("sound")), (text_key, values.get("speak_text"))):
            if value is None:
                continue
            row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
            if row:
                row.value = str(value)
            else:
                row = PlatformSetting(key=key, value=str(value))
            db.add(row)
    db.commit()
    return get_all_notification_settings(db)


def apply_notification_extras(payload: dict, db: Session, event_key: str) -> dict:
    """Mutate an Expo push payload dict with the configured sound + spoken text
    (+ Android channelId, when known - see the "channel" note above; without
    it Android silently falls back to a soundless default channel).

    An admin-uploaded custom sound (see the /upload-sound endpoint) is stored
    as a GCS URL rather than a bundled filename. Expo's native `sound` field
    can only reference a sound bundled in the app, so a URL can't go there -
    it's passed via `data.custom_sound_url` instead, and each app's JS
    notification-received listener plays it with expo-av when the app is
    foreground. A background/closed-app notification still just gets
    whatever tone the Android channel was created with (OS limitation)."""
    setting = get_notification_setting(db, event_key)
    sound_value = setting["sound"] or ""
    is_custom_url = sound_value.startswith("http://") or sound_value.startswith("https://")
    payload["sound"] = "default" if is_custom_url else sound_value
    if setting.get("channel"):
        payload["channelId"] = setting["channel"]
    data = payload.get("data") or {}
    data["speak_text"] = setting["speak_text"]
    data["event_key"] = event_key
    if is_custom_url:
        data["custom_sound_url"] = sound_value
    payload["data"] = data
    return payload
