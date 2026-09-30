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

# Every push the backend sends carries one of these types (data.event_key),
# so each one can get its own sound. "app" = which app receives it.
NOTIFICATION_EVENTS = {
    "new_booking": {
        "app": "driver",
        "label": "New booking posted",
        "sound": "notification_tone.wav",
        "speak_text": "New booking from Drop Cars! Have a safe journey.",
        "channel": DRIVER_CHANNEL_NEW_BOOKING,
    },
    "urgent_booking": {
        "app": "driver",
        "label": "Urgent booking / Notify-again alarm",
        "sound": "notification_tone.wav",
        "speak_text": "Urgent trip alert from Drop Cars! Immediate response required.",
        "channel": DRIVER_CHANNEL_URGENT,
    },
    "booking_reminder": {
        "app": "driver",
        "label": "Booking reminder (Notify pressed on an accepted booking)",
        "sound": "notification_tone.wav",
        "speak_text": "Reminder from Drop Cars about a pending booking.",
        "channel": DRIVER_CHANNEL_NEW_BOOKING,
    },
    "booking_directly_assigned": {
        "app": "driver",
        "label": "Booking directly assigned to you",
        "sound": "notification_tone.wav",
        "speak_text": "A booking has been assigned directly to you.",
        "channel": DRIVER_CHANNEL_URGENT,
    },
    "assignment_deadline_warning": {
        "app": "driver",
        "label": "Assign driver & car - deadline warning",
        "sound": "notification_tone.wav",
        "speak_text": "Assign a driver and car now, or the booking will be removed with a penalty.",
        "channel": DRIVER_CHANNEL_URGENT,
    },
    "drop_bid_driver_request": {
        "app": "driver",
        "label": "Drop Bid: new request",
        "sound": "notification_tone.wav",
        "speak_text": "Drop Market driver request! Urgent response required.",
        "channel": DRIVER_CHANNEL_URGENT,
    },
    "drop_bid_accepted": {
        "app": "driver",
        "label": "Drop Bid: your offer accepted",
        "sound": "notification_tone.wav",
        "speak_text": "Your Drop Bid offer was accepted.",
        "channel": DRIVER_CHANNEL_URGENT,
    },
    "drop_bid_counter": {
        "app": "driver",
        "label": "Drop Bid: counter offer",
        "sound": "notification_tone.wav",
        "speak_text": "You received a Drop Bid counter offer.",
        "channel": DRIVER_CHANNEL_URGENT,
    },
    "drop_bid_event": {
        "app": "driver",
        "label": "Drop Bid: other updates",
        "sound": "notification_tone.wav",
        "speak_text": "Drop Bid update from Drop Cars.",
        "channel": DRIVER_CHANNEL_URGENT,
    },
    "priority_lock_released": {
        "app": "driver",
        "label": "Priority window opened for everyone",
        "sound": "notification_tone.wav",
        "speak_text": "A priority booking is now open for all drivers.",
        "channel": DRIVER_CHANNEL_NEW_BOOKING,
    },
    "priority_timeline_changed": {
        "app": "driver",
        "label": "Priority window changed",
        "sound": "notification_tone.wav",
        "speak_text": "The priority window of a booking has changed.",
        "channel": DRIVER_CHANNEL_NEW_BOOKING,
    },
    "booking_price_updated": {
        "app": "driver",
        "label": "Booking fare updated",
        "sound": "notification_tone.wav",
        "speak_text": "The fare for one of your bookings has been updated.",
        "channel": DRIVER_CHANNEL_NEW_BOOKING,
    },
    "booking_cancelled_by_vendor": {
        "app": "driver",
        "label": "Booking cancelled by vendor",
        "sound": "notification_tone.wav",
        "speak_text": "A booking you accepted has been cancelled by the vendor.",
        "channel": DRIVER_APP_CHANNEL,
    },
    "booking_poster_update": {
        "app": "driver",
        "label": "Your posted booking: status update",
        "sound": "notification_tone.wav",
        "speak_text": "Update on a booking you posted.",
        "channel": DRIVER_APP_CHANNEL,
    },
    "poster_unaccepted_trip_alarm": {
        "app": "driver",
        "label": "Your posted booking was not accepted",
        "sound": "notification_tone.wav",
        "speak_text": "A booking you posted was not accepted by any driver.",
        "channel": DRIVER_CHANNEL_URGENT,
    },
    "trip_status": {
        "app": "driver",
        "label": "Trip started / status update",
        "sound": "notification_tone.wav",
        "speak_text": "Trip status updated.",
        "channel": DRIVER_CHANNEL_TRIP_LIFECYCLE,
    },
    "wallet_update": {
        "app": "driver",
        "label": "Wallet & payout update",
        "sound": "notification_tone.wav",
        "speak_text": "Wallet transaction update from Drop Cars.",
        "channel": DRIVER_CHANNEL_WALLET,
    },
    "document_update": {
        "app": "driver",
        "label": "Document & account status",
        "sound": "notification_tone.wav",
        "speak_text": "Account document status update.",
        "channel": DRIVER_CHANNEL_ACCOUNT,
    },
    "document_rejected": {
        "app": "driver",
        "label": "Document rejected",
        "sound": "notification_tone.wav",
        "speak_text": "One of your documents was rejected. Please upload it again.",
        "channel": DRIVER_CHANNEL_ACCOUNT,
    },
    "low_rating_penalty": {
        "app": "driver",
        "label": "Low rating / penalty notice",
        "sound": "notification_tone.wav",
        "speak_text": "You received a low rating on a trip.",
        "channel": DRIVER_CHANNEL_ACCOUNT,
    },
    "fleet_swap_otp": {
        "app": "driver",
        "label": "Driver / car transfer OTP",
        "sound": "notification_tone.wav",
        "speak_text": "A fleet transfer was requested. Check the code.",
        "channel": DRIVER_CHANNEL_URGENT,
    },
    "profile_updated": {
        "app": "driver",
        "label": "Profile / car / driver updated",
        "sound": "notification_tone.wav",
        "speak_text": "Your profile was updated.",
        "channel": DRIVER_CHANNEL_ACCOUNT,
    },
    "savaari_booking_alert": {
        "app": "driver",
        "label": "Savaari booking alert",
        "sound": "notification_tone.wav",
        "speak_text": "New Savaari booking available.",
        "channel": 'dropcars-custom-sound-v2',
    },
    "booking_accepted": {
        "app": "vendor",
        "label": "Booking accepted by a driver",
        "sound": "notification_tone.wav",
        "speak_text": "Your booking has been accepted by a driver.",
        "channel": VENDOR_CHANNEL_ORDERS,
    },
    "driver_assigned": {
        "app": "vendor",
        "label": "Driver & car assigned",
        "sound": "notification_tone.wav",
        "speak_text": "A driver and car have been assigned to your booking.",
        "channel": VENDOR_CHANNEL_ORDERS,
    },
    "trip_completed": {
        "app": "vendor",
        "label": "Trip completed",
        "sound": "notification_tone.wav",
        "speak_text": "Your trip has been completed. Thank you for booking with Drop Cars.",
        "channel": VENDOR_CHANNEL_ORDERS,
    },
    "booking_auto_cancelled": {
        "app": "vendor",
        "label": "Booking auto-cancelled (no driver assigned)",
        "sound": "notification_tone.wav",
        "speak_text": "Your booking was auto cancelled because no driver was assigned in time.",
        "channel": VENDOR_CHANNEL_ORDERS,
    },
    "booking_expired": {
        "app": "vendor",
        "label": "Booking expired (nobody accepted)",
        "sound": "notification_tone.wav",
        "speak_text": "Your booking was not accepted by any driver and has been cancelled.",
        "channel": VENDOR_CHANNEL_ORDERS,
    },
    "unaccepted_trip_alarm": {
        "app": "vendor",
        "label": "Unaccepted trip alarm",
        "sound": "notification_tone.wav",
        "speak_text": "A trip was not accepted by any driver.",
        "channel": VENDOR_CHANNEL_ORDERS,
    },
    "customer_booking_approved": {
        "app": "customer",
        "label": "Booking request approved",
        "sound": "notification_tone.wav",
        "speak_text": "Your booking request has been approved by Drop Cars.",
        "channel": None,
    },
    "customer_booking_rejected": {
        "app": "customer",
        "label": "Booking request declined",
        "sound": "notification_tone.wav",
        "speak_text": "Your booking request was declined.",
        "channel": None,
    },
    "customer_driver_assigned": {
        "app": "customer",
        "label": "Driver & vehicle assigned",
        "sound": "notification_tone.wav",
        "speak_text": "A driver and vehicle have been assigned to your trip.",
        "channel": None,
    },
    "customer_trip_completed": {
        "app": "customer",
        "label": "Trip completed",
        "sound": "notification_tone.wav",
        "speak_text": "Your journey has ended. Please complete the payment. Thank you for riding with us.",
        "channel": None,
    },
    "driver_trip_cancelled": {
        "app": "customer",
        "label": "Trip cancelled by driver (re-assigning)",
        "sound": "notification_tone.wav",
        "speak_text": "Your trip was cancelled by the driver. We are assigning another driver.",
        "channel": None,
    },
    "drop_bid_activity": {
        "app": "customer",
        "label": "Drop Bid updates",
        "sound": "notification_tone.wav",
        "speak_text": "Drop Market update from Drop Cars.",
        "channel": None,
    },
    "customer_notification": {
        "app": "customer",
        "label": "Other customer alerts",
        "sound": "notification_tone.wav",
        "speak_text": "Update from Drop Cars.",
        "channel": None,
    },
    "admin_booking_approval": {
        "app": "admin",
        "label": "New website booking waiting for approval",
        "sound": "notification_tone.wav",
        "speak_text": "New booking waiting for approval.",
        "channel": ADMIN_CHANNEL_ROUTINE,
    },
    "admin_sos_alert": {
        "app": "admin",
        "label": "SOS emergency alert",
        "sound": "notification_tone.wav",
        "speak_text": "SOS emergency! Immediate action required.",
        "channel": ADMIN_CHANNEL_FINANCIAL,
    },
    "chat_message": {
        "app": "all",
        "label": "Chat message",
        "sound": "notification_tone.wav",
        "speak_text": "New chat message.",
        "channel": None,
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
    defaults = NOTIFICATION_EVENTS.get(event_key, {"sound": "notification_tone.wav", "speak_text": "", "channel": None})
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


# ---------------------------------------------------------------------------
# Uploaded MP3s when the app is CLOSED
#
# Android plays a notification's sound from its channel, and a channel's
# sound can't change after it is created. So each phone downloads every
# uploaded MP3 and creates one channel per (type, sound) with that MP3 as the
# channel sound - id below changes whenever the MP3 changes. The phone then
# tells the backend which of these channels it has (Notification.sound_channels)
# and every push to that phone is sent on the matching channel. A phone that
# hasn't made the channel yet keeps getting the normal channel (bundled tone),
# never a channel it doesn't have.
# ---------------------------------------------------------------------------
import hashlib as _hashlib


def is_custom_sound(value: str) -> bool:
    return bool(value) and (value.startswith("http://") or value.startswith("https://"))


def custom_channel_id(event_key: str, sound_url: str) -> str:
    digest = _hashlib.sha1(sound_url.encode("utf-8")).hexdigest()[:10]
    return f"dcs-{event_key.replace('_', '-')}-{digest}"


def get_sound_manifest(db: Session, app: str = None) -> list:
    """Every type that has an uploaded MP3, for the apps to build channels."""
    out = []
    settings = get_all_notification_settings(db)
    for key, meta in NOTIFICATION_EVENTS.items():
        if app and meta.get("app") not in (app, "all"):
            continue
        url = (settings.get(key) or {}).get("sound") or ""
        if not is_custom_sound(url):
            continue
        out.append({
            "event_key": key,
            "label": meta["label"],
            "app": meta.get("app"),
            "sound_url": url,
            "channel_id": custom_channel_id(key, url),
            "urgent": meta.get("channel") == DRIVER_CHANNEL_URGENT or key in ("admin_sos_alert", "urgent_booking"),
        })
    return out


def apply_device_sound_channels(payloads: list, db: Session = None) -> list:
    """Send each push on the phone's own custom-sound channel when that phone
    has created it for this exact MP3. Opens its own short DB session so it
    can run inside every send path (sync, async, Cloud Tasks relay)."""
    wanted = [p for p in payloads if isinstance(p, dict) and p.get("to")
              and is_custom_sound(((p.get("data") or {}).get("custom_sound_url") or ""))]
    if not wanted:
        return payloads
    try:
        from app.database.session import SessionLocal
        from app.models.notification import Notification
        own = db is None
        session = SessionLocal() if own else db
        try:
            tokens = list({p["to"] for p in wanted})
            rows = session.query(Notification.token, Notification.sound_channels).filter(
                Notification.token.in_(tokens), Notification.sound_channels.isnot(None)
            ).all()
        finally:
            if own:
                session.close()
        by_token = {}
        for token, channels in rows:
            if isinstance(channels, dict):
                by_token.setdefault(token, {}).update(channels)
        for p in wanted:
            data = p["data"]
            key = data.get("event_key")
            expected = custom_channel_id(key, data["custom_sound_url"]) if key else None
            if expected and by_token.get(p["to"], {}).get(key) == expected:
                p["channelId"] = expected
                p["sound"] = "default"
                data["sound_on_channel"] = True  # app: don't play the MP3 again in the foreground
    except Exception as e:
        print(f"device sound channel mapping skipped: {e}")
    return payloads
