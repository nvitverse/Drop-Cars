from sqlalchemy.orm import Session
from app.models.notification import Notification
from app.schemas.notification import NotificationCreate,NotificationUpdate, NotificationPermissionUpdate
import httpx
import asyncio
from concurrent.futures import ThreadPoolExecutor
from app.models.orders import Order
from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.models.car_details import CarDetails
from app.models.car_driver import CarDriver
from app.models.order_assignments import OrderAssignment
from typing import List, Optional
from sqlalchemy import text
from app.utils.cities import get_cities
from app.utils.notification_settings import apply_notification_extras, DRIVER_CHANNEL_URGENT, VENDOR_CHANNEL_ORDERS
from app.crud.notification_log import log_notification
from app.utils.timezone import format_pickup_time_ist
import os
from dotenv import load_dotenv
load_dotenv()

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
BOT_TOKEN = os.getenv("BOT_TOKEN")
CHAT_ID = os.getenv("CHAT_ID")
# Expo's push API hard-rejects any single request carrying more than 100
# messages (top-level VALIDATION_ERROR, "Must contain at most 100
# element(s)") - and rejects the WHOLE batch, not just the excess ones. Any
# city/broadcast send with more than 100 recipient tokens was silently
# dropping every single notification in that batch. All sends now chunk
# through _post_expo_payloads[_sync] below instead of posting the raw list.
EXPO_BATCH_SIZE = 100
# Chunks fire concurrently (not one-by-one) so every recipient gets pushed at
# essentially the same instant. Capped rather than unbounded so a very large
# broadcast (e.g. 10,000+ tokens = 100+ chunks) doesn't open 100+ simultaneous
# connections to Expo (or spin up 100+ threads) in one go - 20 concurrent
# requests still delivers ~2,000 tokens per wave, so even a 10k-token send
# finishes in a handful of waves, each completing in well under a second.
EXPO_MAX_CONCURRENT_REQUESTS = 20


def _chunk_list(items: list, size: int = EXPO_BATCH_SIZE):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _chunk_result_to_data(chunk: list, result) -> list:
    """Normalise one chunk's raw Expo response into a per-token ticket list,
    padding with error tickets on a whole-chunk failure (validation error,
    network error, etc.) so tokens/tickets stay aligned after merging."""
    data = result.get("data") if isinstance(result, dict) else None
    if isinstance(data, list) and len(data) == len(chunk):
        return data
    return [{"status": "error", "message": str(result)}] * len(chunk)


async def _post_expo_payloads(payloads: list) -> dict:
    """Send an arbitrarily-long list of Expo push messages, splitting into
    <=100-message requests (Expo's hard limit) and firing every chunk
    CONCURRENTLY (not one after another) so every recipient's push reaches
    Expo at essentially the same moment regardless of how many chunks the
    batch needed. Results are merged back into a single 'data' list in
    original order, so existing callers that zip(tokens, expo_result['data'])
    keep working unchanged."""
    from app.utils.notification_settings import apply_device_sound_channels
    payloads = apply_device_sound_channels(payloads)
    if not payloads:
        return {"data": []}
    chunks = list(_chunk_list(payloads))
    semaphore = asyncio.Semaphore(EXPO_MAX_CONCURRENT_REQUESTS)

    async def send_one(chunk: list):
        async with semaphore:
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.post(EXPO_PUSH_URL, json=chunk)
                    return resp.json()
            except Exception as e:
                return {"error": str(e)}

    results = await asyncio.gather(*(send_one(c) for c in chunks))
    merged_data = []
    for chunk, result in zip(chunks, results):
        merged_data.extend(_chunk_result_to_data(chunk, result))
    return {"data": merged_data}


def _post_expo_payloads_sync(payloads: list) -> dict:
    """Sync counterpart of _post_expo_payloads, for the two notification
    paths that run synchronously right after booking creation. Chunks are
    fired concurrently via a thread pool for the same "everyone at once"
    reason as the async version above."""
    payloads = dedupe_push_payloads(payloads)
    from app.utils.notification_settings import apply_device_sound_channels
    payloads = apply_device_sound_channels(payloads)
    if not payloads:
        return {"data": []}
    chunks = list(_chunk_list(payloads))

    def send_one(chunk: list):
        try:
            with httpx.Client(timeout=15) as client:
                resp = client.post(EXPO_PUSH_URL, json=chunk)
                return resp.json()
        except Exception as e:
            return {"error": str(e)}

    with ThreadPoolExecutor(max_workers=min(EXPO_MAX_CONCURRENT_REQUESTS, len(chunks))) as pool:
        results = list(pool.map(send_one, chunks))

    merged_data = []
    for chunk, result in zip(chunks, results):
        merged_data.extend(_chunk_result_to_data(chunk, result))
    return {"data": merged_data}


# Cloud Tasks queue that decouples the actual Expo HTTP round-trip from the
# booking-creation request - see main.py's /api/internal/dispatch-expo-push
# (the queue's target) and this project's scaling notes: at higher traffic,
# blocking a driver's booking-creation response on an outbound push call to
# Expo adds latency to exactly the request most sensitive to it.
_GCP_PROJECT = os.getenv("GCP_PROJECT", "drop-cars2")
_TASKS_LOCATION = os.getenv("CLOUD_TASKS_LOCATION", "asia-south1")
_TASKS_QUEUE = os.getenv("CLOUD_TASKS_QUEUE", "notification-dispatch")
_DISPATCH_URL = os.getenv(
    "INTERNAL_DISPATCH_URL",
    "https://drop-cars-api-207918408785.asia-south2.run.app/api/internal/dispatch-expo-push",
)
_INTERNAL_TASK_SECRET = os.getenv("INTERNAL_TASK_SECRET", "")

_SWEEP_URL = os.getenv(
    "INTERNAL_SWEEP_URL",
    "https://drop-cars-api-207918408785.asia-south2.run.app/api/internal/run-sweep",
)

_tasks_client = None


def schedule_internal_sweep(delay_seconds: int) -> bool:
    """Ask Cloud Tasks to call the deadline sweep after `delay_seconds`. The in-process timer only runs while an instance
    is alive, and Cloud Run stops idle instances - so a website booking's "auto-post after 15 minutes" could simply never
    fire. A scheduled task wakes the service at the right moment. Best effort, never raises."""
    if not _INTERNAL_TASK_SECRET:
        return False
    try:
        from datetime import datetime, timedelta
        from google.protobuf import timestamp_pb2
        client = _get_tasks_client()
        parent = client.queue_path(_GCP_PROJECT, _TASKS_LOCATION, _TASKS_QUEUE)
        ts = timestamp_pb2.Timestamp()
        ts.FromDatetime(datetime.utcnow() + timedelta(seconds=max(1, int(delay_seconds))))
        client.create_task(request={"parent": parent, "task": {
            "http_request": {
                "http_method": 1,
                "url": _SWEEP_URL,
                "headers": {"Content-Type": "application/json", "X-Internal-Secret": _INTERNAL_TASK_SECRET},
                "body": b"{}",
            },
            "schedule_time": ts,
        }})
        return True
    except Exception as e:
        print(f"schedule_internal_sweep failed (in-process timer still runs): {e}")
        return False


def _get_tasks_client():
    global _tasks_client
    if _tasks_client is None:
        from google.cloud import tasks_v2
        _tasks_client = tasks_v2.CloudTasksClient()
    return _tasks_client


def dedupe_push_payloads(payloads: list) -> list:
    """One phone, one notification. The same device token can be registered on several accounts (a fleet owner and his drivers on one
    phone, or an old install that was never cleaned), and every account used to get its own copy: three identical notifications at
    once, with ONE sound because Android silences alerts that arrive within a moment of each other. Same token + same title + same
    body = send once."""
    seen, out = set(), []
    for p in payloads or []:
        key = (str(p.get("to")), str(p.get("title")), str(p.get("body")))
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def _enqueue_expo_push(db: Session, payloads: list) -> None:
    """Queues the actual Expo push send instead of doing it inline. Falls
    back to sending synchronously (the old, always-correct behavior) if
    Cloud Tasks isn't reachable/configured for any reason - queueing is a
    latency optimization, never something allowed to block or drop a real
    notification. Token-cleanup (_handle_expo_response) runs wherever the
    send actually happens: inside /api/internal/dispatch-expo-push when
    queued, or right here on the synchronous fallback."""
    payloads = dedupe_push_payloads(payloads)
    if not payloads:
        return
    if not _INTERNAL_TASK_SECRET:
        result = _post_expo_payloads_sync(payloads)
        _handle_expo_response(db, result, [p.get("to") for p in payloads])
        return
    try:
        import json as _json
        client = _get_tasks_client()
        parent = client.queue_path(_GCP_PROJECT, _TASKS_LOCATION, _TASKS_QUEUE)
        task = {
            "http_request": {
                "http_method": 1,  # POST
                "url": _DISPATCH_URL,
                "headers": {
                    "Content-Type": "application/json",
                    "X-Internal-Secret": _INTERNAL_TASK_SECRET,
                },
                "body": _json.dumps({"payloads": payloads}).encode(),
            }
        }
        client.create_task(request={"parent": parent, "task": task})
    except Exception as e:
        print(f"_enqueue_expo_push failed, sending synchronously instead: {e}")
        result = _post_expo_payloads_sync(payloads)
        _handle_expo_response(db, result, [p.get("to") for p in payloads])


def _handle_expo_response(db: Session, expo_result, tokens: list) -> None:
    """Expo's push API returns HTTP 200 even when an individual ticket fails
    (stale token, uninstalled app, etc.) - a status_code check alone can
    never see this, which is exactly the class of bug where the in-app
    notification log shows an entry but no push/sound ever reaches the
    device. Log each failing ticket so server logs reveal the real reason,
    and clear DeviceNotRegistered tokens so we stop wasting sends on them."""
    try:
        tickets = expo_result.get("data") if isinstance(expo_result, dict) else None
        if not isinstance(tickets, list):
            return
        for token, ticket in zip(tokens, tickets):
            if not isinstance(ticket, dict) or ticket.get("status") != "error":
                continue
            error_code = (ticket.get("details") or {}).get("error")
            print(f"⚠️ Expo push ticket error for token {str(token)[:20]}...: {ticket.get('message')} ({error_code})")
            if error_code == "DeviceNotRegistered":
                db.query(Notification).filter(Notification.token == token).update({"token": None})
                db.commit()
    except Exception as e:
        print(f"_handle_expo_response failed (non-fatal): {e}")

def notify_document_rejected(db: Session, notif_user_type: str, sub: str, document_label: str, reason: Optional[str] = None) -> None:
    """Tell an account holder (vendor/vehicle_owner/driver) WHY their document
    was rejected - admin used to just flip the status to INVALID with no
    explanation, leaving the user to guess and resubmit blind. Sync (called
    directly from the sync admin_management CRUD functions right after the
    status flip) and best-effort: a notification failure must never break
    the admin's document-review action itself."""
    try:
        title = f"{document_label} Rejected"
        if reason and reason.strip():
            body = f"Your {document_label} was rejected: {reason.strip()}. Please re-upload a valid document."
        else:
            body = f"Your {document_label} was rejected. Please check and re-upload a valid document."

        try:
            log_notification(db, notif_user_type, str(sub), title, body, "document_rejected", action_required=True)
        except Exception as e:
            print(f"document-rejected notification log failed (status still updated): {e}")

        rows = db.query(Notification).filter(
            Notification.user == notif_user_type,
            Notification.sub == str(sub)
        ).all()
        tokens = [r.token for r in rows if r.token and not _is_muted(r)]
        if not tokens:
            return
        payloads = [
            apply_notification_extras({"to": token, "title": title, "body": body}, db, "document_rejected")
            for token in tokens
        ]
        _post_expo_payloads_sync(payloads)
    except Exception as e:
        print(f"notify_document_rejected failed (status still updated): {e}")


def get_notification(db: Session, sub: str):
    print("The Sube us ",sub[0])
    return db.query(Notification).filter(Notification.sub == sub[0]).first()

def create_notification(db: Session, sub: str, data: NotificationCreate):
    db_notification = Notification(
        user = sub[1],
        sub=sub[0],
        permission1=data.permission1,
        permission2=data.permission2,
        token=data.token
    )
    db.add(db_notification)
    db.commit()
    db.refresh(db_notification)
    return db_notification

def update_notification(db: Session, sub: str, data: NotificationUpdate):
    notification = get_notification(db, sub)
    if notification:
        notification.permission1 = data.permission1
        notification.permission2 = data.permission2
        # Never let a failed client-side token fetch (empty string / 'EMPTY')
        # wipe a working push token - that silently stopped every booking
        # notification and sound for the user until they logged in again.
        # An empty token is only honoured as an explicit "notifications OFF".
        new_token = (data.token or "").strip()
        if new_token.startswith(("ExponentPushToken[", "ExpoPushToken[")):
            notification.token = new_token
        elif not data.permission1 and not data.permission2:
            notification.token = new_token
        db.commit()
        db.refresh(notification)
    return notification

def update_permissions_only(db: Session, sub: str, data: NotificationPermissionUpdate):
    notification = get_notification(db, sub)
    if not notification:
        return None

    if data.permission1 is not None:
        notification.permission1 = data.permission1
    if data.permission2 is not None:
        notification.permission2 = data.permission2

    db.commit()
    db.refresh(notification)
    return notification

def mute_notifications(db: Session, sub: str, minutes: int):
    """Temporary snooze (Settings > Mute Notifications). Stored server-side
    (not just a client-side flag) so it works even while the app is fully
    closed - every push-send function checks this before including a token."""
    from datetime import datetime, timedelta, timezone
    notification = get_notification(db, sub)
    if not notification:
        return None
    notification.muted_until = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    db.commit()
    db.refresh(notification)
    return notification


def unmute_notifications(db: Session, sub: str):
    notification = get_notification(db, sub)
    if not notification:
        return None
    notification.muted_until = None
    db.commit()
    db.refresh(notification)
    return notification


def _is_muted(row: "Notification") -> bool:
    from datetime import datetime, timezone
    muted_until = getattr(row, "muted_until", None)
    if muted_until is None:
        return False
    if muted_until.tzinfo is None:
        muted_until = muted_until.replace(tzinfo=timezone.utc)
    return muted_until > datetime.now(timezone.utc)


def get_users_with_permission1(db: Session, city_list: List[str]):
    """Who gets a booking alert for these cities (name kept - many callers).

    Owner's rule (2026-10-01): a driver who picked cities gets the bookings of THOSE cities; a driver who picked
    none gets every booking; and nobody is left out because of an account / permission flag - everyone with a push
    token is in the audience (a temporary mute still silences them). `permission1` used to be required, but it is
    False by default for rows created by the city picker, so drivers silently fell out of every alert."""
    if not city_list:
        return []

    vehicle_owners = db.query(Notification).filter(
        Notification.user == "vehicle_owner",
        Notification.token.isnot(None),
    ).all()

    if "ALL" in city_list:
        return vehicle_owners
    
    # Check active vacant cities from vehicle_owner_details table
    vacant_owner_ids = set()
    try:
        from app.models.vehicle_owner_details import VehicleOwnerDetails
        from datetime import datetime, timezone, timedelta
        cutoff_24h = datetime.now(timezone.utc) - timedelta(hours=24)

        vo_rows = db.query(VehicleOwnerDetails.vehicle_owner_id, VehicleOwnerDetails.vacant_cities).filter(
            VehicleOwnerDetails.vacant_cities.isnot(None),
            VehicleOwnerDetails.vacant_cities_updated_at.isnot(None),
            VehicleOwnerDetails.vacant_cities_updated_at >= cutoff_24h,
        ).all()

        for vo_id, v_cities in vo_rows:
            if v_cities and set(v_cities) & set(city_list):
                vacant_owner_ids.add(str(vo_id))
    except Exception as e:
        print(f"Error querying vacant cities for notifications: {e}")
    
    # Filter by city overlap (notification selected_city OR active vacant_cities)
    #
    # "All cities" owners: someone who ticked All Cities earlier is missing
    # every city added to the master list AFTER they did (and any place that
    # was never in the list at all), so an exact-name match silently dropped
    # those bookings for them. Anyone with the large majority of the master
    # list selected is treated as All Cities and gets every booking.
    try:
        from app.utils.cities import get_cities as _get_master_cities
        _master = set(_get_master_cities())
    except Exception:
        _master = set()
    _all_threshold = int(len(_master) * 0.6) if _master else None

    filtered_users = []
    for user in vehicle_owners:
        is_vacant_match = str(user.sub) in vacant_owner_ids
        is_notif_city_match = bool(user.selected_city and set(user.selected_city) & set(city_list))
        is_all_cities = bool(
            _all_threshold
            and user.selected_city
            and len(set(user.selected_city) & _master) >= _all_threshold
        )
        no_city_choice = not user.selected_city   # never picked cities = wants everything
        if is_vacant_match or is_notif_city_match or is_all_cities or no_city_choice:
            filtered_users.append(user)

    return filtered_users
    
async def send_push_notifications_vehicle_owner(db: Session, title: str, message: str,ordered_city : list):
    if ordered_city == ["ALL"]:
        ordered_city = get_cities()
    users = get_users_with_permission1(db,ordered_city)
    print("hellow world",end='\n')
    tokens = [user.token for user in users if user.token and not _is_muted(user)]
    print("HEllp Notifcation Testing")
    print(tokens)

    if not tokens:
        return {"status": "No tokens found for users with permission1 = True"}

    payloads = [
        apply_notification_extras(
            {"to": token, "title": title, "body": message},
            db, "new_booking",
        )
        for token in tokens
    ]

    expo_result = await _post_expo_payloads(payloads)

    return {
        "status": "Notifications sent",
        "tokens": tokens,
        "expo_response": expo_result
    }


async def send_push_notification_to_admin(db: Session, title: str, message: str):
    """Alarm push for admins: fires whenever a website booking is created and
    needs approval. One-shot per booking - the persistent nag-until-acted-on
    behaviour lives in the website's in-panel siren, not in repeated pushes."""
    admins = db.query(Notification).filter(Notification.user == "admin").all()
    tokens = [row.token for row in admins if row.token and not _is_muted(row)]

    if not tokens:
        return {"status": "No tokens found for admin"}

    payloads = [
        apply_notification_extras({"to": token, "title": title, "body": message, "priority": "high"}, db, "admin_booking_approval")
        for token in tokens
    ]

    expo_result = await _post_expo_payloads(payloads)

    return {
        "status": "Notifications sent",
        "tokens": tokens,
        "expo_response": expo_result
    }


async def send_custom_sound_notification_vehicle_owner(db: Session, title: str, message: str, ordered_city: list, is_urgent: bool = False, channel_id: Optional[str] = None):
    if ordered_city == ["ALL"]:
        ordered_city = get_cities()
    users = get_users_with_permission1(db, ordered_city)
    tokens = [user.token for user in users if user.token and not _is_muted(user)]

    if not tokens:
        return {"status": "No tokens found for users with permission1 = True"}

    target_channel = channel_id or ("dropcars-urgent-booking-v1" if is_urgent else "dropcars-new-booking-v1")

    payloads = [
        {
            "to": token,
            "title": title,
            "body": message,
            "sound": "notification_tone.wav",
            "priority": "high",
            "channelId": target_channel,
            "data": {"test": True, "is_urgent": is_urgent},
            "android": {
                "channelId": target_channel,
                "sound": "notification_tone.wav",
                "priority": "max" if is_urgent else "high"
            }
        }
        for token in tokens
    ]
    for p in payloads:
        apply_notification_extras(p, db, "drop_bid_driver_request" if is_urgent else "new_booking")
        if channel_id:
            p["channelId"] = channel_id

    expo_result = await _post_expo_payloads(payloads)

    return {
        "status": "Custom sound notifications sent",
        "tokens": tokens,
        "expo_response": expo_result
    }


def notify_booking_poster(db: Session, order, title: str, message: str) -> None:
    """Live-status push for a booking a fleet owner/driver POSTED (Driver App
    "Create Booking"): accepted, driver+car assigned, trip started/ended,
    cancelled. The vendor-side notify_* functions look the recipient up via
    order.vendor_id, which is None for these bookings, so the poster used to
    get none of them. Best-effort and synchronous-safe: never raises (called
    inline from accept/assign/trip flows that must not fail because of a
    push). Vendor-posted bookings are untouched - they have a vendor and
    keep using the existing vendor notifications."""
    try:
        poster_id = getattr(order, "posted_by_vehicle_owner_id", None)
        if not poster_id or getattr(order, "vendor_id", None):
            return
        rows = db.query(Notification).filter(
            Notification.user == "vehicle_owner",
            Notification.sub == str(poster_id),
        ).all()
        tokens = [n.token for n in rows if n.token and not _is_muted(n)]
        if not tokens:
            return
        payloads = [
            {
                "to": token,
                "title": title,
                "body": message,
                "sound": "notification_tone.wav",
                "priority": "high",
                "channelId": "dropcars-new-booking-v1",
                "data": {"order_id": order.id, "type": "poster_booking_update"},
                "android": {"channelId": "dropcars-new-booking-v1", "sound": "notification_tone.wav", "priority": "high"},
            }
            for token in tokens
        ]
        for p in payloads:
            apply_notification_extras(p, db, "booking_poster_update")
        _enqueue_expo_push(db, payloads)
    except Exception as e:
        print(f"notify_booking_poster failed (non-fatal): {e}")


def _send_bubble_wakeup_push(db: Session, tokens: list, order_id: Optional[int]) -> None:
    """Fires a SEPARATE, silent (no title/body) companion push whose only
    job is to wake the Driver App's background JS so the floating bubble
    can show - see services/bubble/bubbleOverlay.ts's
    maybeShowBubbleForNotification.

    Why a second push instead of just adding order_id to the main one
    (which was the first fix, and is still needed/kept): Android's FCM SDK
    auto-displays any push that HAS a title/body via the system tray when
    the app is backgrounded or killed, and deliberately never hands that
    push to the app's own code in that case - so the main notification
    (title+body, needed for guaranteed delivery in every app state) can
    never itself trigger app code while backgrounded. A push with no
    title/body at all is routed to the app's background task instead,
    which is exactly what the bubble needs. Sent as a true no-op if it
    fails (best-effort) - the driver still got the real notification
    either way.
    """
    if not tokens or order_id is None:
        return
    try:
        payloads = [
            {
                "to": token,
                "priority": "high",
                "data": {"order_id": order_id, "bubble_wakeup": True},
                "android": {"priority": "high"},
            }
            for token in tokens
        ]
        _enqueue_expo_push(db, payloads)
    except Exception as e:
        print(f"_send_bubble_wakeup_push failed (main notification unaffected): {e}")


def _sync_booking_cities_to_master(db: Session, cities: list) -> None:
    """Any pickup city on a real booking that is not yet in the shared city
    list is added to it automatically, so every app's city picker (and the
    owners' All-Cities selection) picks it up without manual admin work."""
    try:
        from app.utils.cities import get_cities as _gc, save_cities as _sc
        master = list(_gc())
        known = {c.lower() for c in master}
        new = []
        for c in cities or []:
            name = str(c).strip()
            if name and name.upper() != "ALL" and name.lower() not in known:
                new.append(name)
                known.add(name.lower())
        if new:
            _sc(db, master + new)
            print(f"city sync: added {new} to master city list")
    except Exception as e:
        print(f"city sync failed (non-fatal): {e}")


def send_new_booking_notification_sync(db: Session, title: str, message: str, ordered_city: list, is_urgent: bool = False, channel_id: Optional[str] = None, order_id: Optional[int] = None):
    try:
        if ordered_city == ["ALL"]:
            ordered_city = get_cities()
        else:
            _sync_booking_cities_to_master(db, ordered_city)

        users = get_users_with_permission1(db, ordered_city)
        tokens = [user.token for user in users if user.token and not _is_muted(user)]
        if not tokens:
            return {"status": "No tokens found for users with permission1 = True"}

        target_channel = channel_id or ("dropcars-urgent-booking-v1" if is_urgent else "dropcars-new-booking-v1")

        # order_id here is what the Driver App's floating bubble (see
        # services/bubble/bubbleOverlay.ts's maybeShowBubbleForNotification)
        # keys off of - without it in `data`, every new-booking push this
        # function sends is silently ignored for bubble purposes (its
        # bookingId lookup returns null and it no-ops), which is exactly
        # what was happening before this - the single most common
        # notification type could never trigger the bubble.
        payloads = [
            {
                "to": token,
                "title": title,
                "body": message,
                "sound": "notification_tone.wav",
                "priority": "high",
                "channelId": target_channel,
                "data": {"is_urgent": is_urgent, "order_id": order_id},
                "android": {
                    "channelId": target_channel,
                    "sound": "notification_tone.wav",
                    "priority": "max" if is_urgent else "high"
                }
            }
            for token in tokens
        ]

        # Apply the admin's Notification Settings for this event (uploaded
        # custom MP3 via data.custom_sound_url + the spoken sentence). This
        # broadcast - the most common push of all - never called it before,
        # so an uploaded sound was silently ignored for new-booking alerts.
        try:
            from app.utils.notification_settings import apply_notification_extras
            event_key = "urgent_booking" if is_urgent else "new_booking"
            template = apply_notification_extras({"data": {}}, db, event_key)  # one settings lookup, not one per token
            for p in payloads:
                p["sound"] = template.get("sound", p.get("sound"))
                p["channelId"] = channel_id or template.get("channelId") or p.get("channelId")
                p["data"] = {**(p.get("data") or {}), **template.get("data", {})}
        except Exception as extras_err:
            print(f"notification extras not applied (push still sent): {extras_err}")

        # Queued (Cloud Tasks) rather than sent inline - see _enqueue_expo_push.
        # Falls back to the old synchronous send automatically if Cloud
        # Tasks isn't configured/reachable, so this is never a regression,
        # only a latency win when it's available.
        _enqueue_expo_push(db, payloads)
        print(f"send_new_booking_notification_sync: queued {len(tokens)} token(s) on channel '{target_channel}'")
        _send_bubble_wakeup_push(db, tokens, order_id)
        return {"status": "queued", "count": len(tokens)}
    except Exception as e:
        print(f"send_new_booking_notification_sync failed: {e}")
        return {"status": "failed", "error": str(e)}


def send_new_booking_notification_to_driver_sync(db: Session, title: str, message: str, driver_id: str, order_id: Optional[int] = None):
    """Same booking-posted alert as send_new_booking_notification_sync, but
    for a booking posted directly to one driver (send_to="DRIVER") instead of
    a city-wide fleet-owner broadcast. Notifies that driver's fleet owner
    (who is the one who actually calls acceptorder) and the driver themselves
    (FYI only - drivers can't accept orders directly). Sync + exceptions
    swallowed for the same reason as send_new_booking_notification_sync -
    called synchronously right after order creation, must never fail the
    booking itself."""
    try:
        driver = db.query(CarDriver).filter(CarDriver.id == driver_id).first()
        if not driver:
            return {"status": "Driver not found"}

        owner_notifications = db.query(Notification).filter(
            Notification.user == "vehicle_owner",
            Notification.sub == str(driver.vehicle_owner_id)
        ).all()
        driver_notifications = db.query(Notification).filter(
            Notification.user == "driver",
            Notification.sub == str(driver_id)
        ).all()

        # New-booking alerts are push-only, not written to the persistent
        # in-app inbox - see send_new_booking_notification_sync for why.
        tokens = [n.token for n in (owner_notifications + driver_notifications) if n.token and not _is_muted(n)]
        if not tokens:
            return {"status": "No tokens found for owner/driver"}

        # See send_new_booking_notification_sync's comment on order_id - same
        # bubble-trigger requirement, this function's payloads had no `data`
        # field at all before.
        payloads = [
            apply_notification_extras(
                {
                    "to": token,
                    "title": title,
                    "body": message,
                    "priority": "high",
                    "android": {"priority": "max"},
                    "data": {"order_id": order_id},
                },
                db, "new_booking",
            )
            for token in tokens
        ]

        _enqueue_expo_push(db, payloads)
        print(f"send_new_booking_notification_to_driver_sync: queued {len(tokens)} token(s)")
        _send_bubble_wakeup_push(db, tokens, order_id)
        return {"status": "queued", "count": len(tokens)}
    except Exception as e:
        print(f"send_new_booking_notification_to_driver_sync failed (booking still created): {e}")
        return {"status": "failed", "error": str(e)}


def get_users_vendor_permission_2(db: Session, user_id: str):
    return db.query(Notification).filter(
        Notification.permission2 == True,
        Notification.user == "vendor",
        Notification.sub == user_id  # assuming this is a string
    ).all()

async def send_push_notification_to_vendor(db: Session, order_id: str, title: str, message: str, vehicle_owner_id : str):
    order = db.query(Order).filter(Order.id == order_id).first()
    vehicle_owner = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id).first()
    if not order:
        return {"status": "Order not found"}

    user_id = str(order.vendor_id)  # convert UUID to string if necessary
    notifications = get_users_vendor_permission_2(db, user_id)

    # Extract tokens
    tokens = [n.token for n in notifications if n.token and not _is_muted(n)]

    if not tokens:
        return {"status": f"No Expo push tokens found for vendor with ID: {user_id}"}

    # Prepare payloads (one payload per token)
    payloads = [
        apply_notification_extras(
            {"to": token, "title": title, "body": message + str(" "+vehicle_owner.full_name)},
            db, "booking_accepted",
        )
        for token in tokens
    ]

    # Send notification to Expo
    expo_result = await _post_expo_payloads(payloads)

    return {
        "status": "Notification(s) sent",
        "tokens": tokens,
        "expo_response": expo_result
    }

# async def send_push_notification_to_vendor_driver(db: Session, order_id: str, vehicle_owner_id : str , driver_id : str, car_id :str):
#     order = db.query(Order).filter(Order.id == order_id).first()
#     vehicle_owner = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id).first()
#     car_info = db.query(CarDetails).filter(CarDetails.id == car_id).first()
#     car_driver = db.query(CarDriver).filter(CarDriver.id == driver_id).first()
#     if not order:
#         return {"status": "Order not found"}

#     user_id = str(order.vendor_id)  # convert UUID to string if necessary
#     notifications = get_users_vendor_permission_2(db, user_id)

#     # Extract tokens
#     tokens = [n.token for n in notifications if n.token and not _is_muted(n)]

#     if not tokens:
#         return {"status": f"No Expo push tokens found for vendor with ID: {user_id}"}

#     # Prepare payloads (one payload per token)
#     payloads = [
#         {
#             "to": token,
#             "sound": "default",
#             "title": "title",
#             "body": "message" + str(vehicle_owner.full_name)
#         }
#         for token in tokens
#     ]

#     # Send notification to Expo
#     async with httpx.AsyncClient() as client:
#         response = await client.post(EXPO_PUSH_URL, json=payloads)

#     return {
#         "status": "Notification(s) sent",
#         "tokens": tokens,
#         "expo_response": response.json()
#     }

async def send_push_notification_to_customer(db: Session, customer_id: str, title: str, message: str, event_key: str):
    """Send a push notification to a customer's registered push tokens."""
    notifications = db.query(Notification).filter(
        Notification.user == "customer",
        Notification.sub == str(customer_id)
    ).all()
    tokens = [n.token for n in notifications if n.token and not _is_muted(n)]
    if not tokens:
        return {"status": f"No Expo tokens found for customer {customer_id}"}

    payloads = [
        apply_notification_extras(
            {"to": token, "title": title, "body": message},
            db, event_key,
        )
        for token in tokens
    ]

    expo_result = await _post_expo_payloads(payloads)

    return {
        "status": "Notification sent to customer",
        "tokens": tokens,
        "expo_response": expo_result
    }


async def send_push_notification_to_vendor_driver(
    db: Session,
    order_id: str,
    vehicle_owner_id: str,
    driver_id: str,
    car_id: str
):
    order = db.query(Order).filter(Order.id == order_id).first()
    vehicle_owner = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id).first()
    car = db.query(CarDetails).filter(CarDetails.id == car_id).first()
    driver = db.query(CarDriver).filter(CarDriver.id == driver_id).first()

    if not order:
        return {"status": "Order not found"}

    # Driver-posted booking (no vendor): the poster is the one waiting on this.
    if car and driver:
        notify_booking_poster(
            db, order,
            "🚗 Driver assigned to your booking",
            f"Booking #{order_id}: {driver.full_name} with {car.car_name} ({car.car_number}) is assigned. Start/end OTPs are in My Trips.",
        )

    vendor_id = str(order.vendor_id) if order.vendor_id else None

    # Fetch vendor tokens
    vendor_tokens = []
    if vendor_id:
        vendor_notifications = db.query(Notification).filter(Notification.user == "vendor", Notification.sub == vendor_id).all()
        vendor_tokens = [n.token for n in vendor_notifications if n.token and not _is_muted(n)]

    # Fetch driver tokens (if needed)
    driver_tokens = []
    if driver:
        driver_notifications = db.query(Notification).filter(Notification.user == "driver", Notification.sub == str(driver_id)).all()
        driver_tokens = [n.token for n in driver_notifications if n.token and not _is_muted(n)]

    payloads = []

    # Notify vendor about car update
    if car and vendor_tokens:
        for token in vendor_tokens:
            payloads.append(apply_notification_extras(
                {
                    "to": token,
                    "title": f"Order ID: {order_id} -> Car Updated",
                    "body": f"'{car.car_name}' has been Assigned for this order by {vehicle_owner.full_name}.",
                },
                db, "driver_assigned",
            ))

    # Notify vendor about driver update
    if driver and vendor_tokens:
        for token in vendor_tokens:
            payloads.append(apply_notification_extras(
                {
                    "to": token,
                    "title": f"Order ID: {order_id} -> Driver Updated",
                    "body": f"Driver '{driver.full_name}' has been Assigned for this order by {vehicle_owner.full_name}.",
                },
                db, "driver_assigned",
            ))

    # Notify driver about update
    if driver and driver_tokens:
        for token in driver_tokens:
            payloads.append(apply_notification_extras({
                "to": token,
                "sound": "default",
                "title": "Your Profile Updated",
                "body": "Your driver profile or assignment details have been updated."
            }, db, "profile_updated"))
        try:
            log_notification(db, "driver", str(driver_id), "Your Profile Updated", "Your driver profile or assignment details have been updated.", "driver_assigned")
        except Exception as e:
            print(f"driver-updated notification log failed (push still sent): {e}")

    # Send all collected payloads
    result = {"status": "No valid Expo tokens found for vendor or driver"}
    if payloads:
        expo_result = await _post_expo_payloads(payloads)
        result = {
            "status": "Notification(s) sent",
            "vendor_tokens": vendor_tokens,
            "driver_tokens": driver_tokens,
            "expo_response": expo_result
        }

    # Notify customer if this is a customer-originated order
    try:
        from app.models.customer_booking_request import CustomerBookingRequest
        customer_booking = db.query(CustomerBookingRequest).filter(
            CustomerBookingRequest.linked_order_id == int(order_id)
        ).first()
        if customer_booking:
            driver_name = driver.full_name if driver else "A driver"
            car_name = car.car_name if car else "a car"
            await send_push_notification_to_customer(
                db,
                customer_id=str(customer_booking.customer_id),
                title="Driver Assigned",
                message=f"{driver_name} has been assigned with {car_name} for your trip.",
                event_key="customer_driver_assigned"
            )
    except Exception as e:
        print(f"Failed to send assignment notification to customer: {e}")

    return result
    
async def send_trip_status_notification_to_vendor_and_vehicle_owner(
    db: Session,
    order_id: int,
    status: str  # 'started' or 'ended'
):
    if status not in ["started", "ended"]:
        return {"status": "Invalid status. Must be 'started' or 'ended'"}

    # Fetch the order
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return {"status": "Order not found"}

    # Get the active assignment for this order
    assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.assignment_status.in_(["ASSIGNED", "DRIVING", "COMPLETED"])  # Allow active/ended statuses
    ).first()

    if not assignment:
        return {"status": "No active assignment found for this order"}

    vendor_id = str(order.vendor_id) if order.vendor_id else None
    vehicle_owner_id = str(assignment.vehicle_owner_id)

    # Create the message
    if status == "started":
        title = f"Order ID: {order_id} Trip Started"
        body = f"The trip for customer '{order.customer_name}' has started."
    else:
        title = f"Order ID: {order_id} Trip Ended"
        body = f"The trip for customer '{order.customer_name}' has Completed."

    # Driver-posted booking (no vendor): the poster gets the same live update
    # a vendor would (no-op for vendor-posted bookings).
    notify_booking_poster(db, order, title, body)

    payloads = []

    # Fetch vendor tokens
    vendor_tokens = []
    if vendor_id:
        vendor_notifications = db.query(Notification).filter(
            Notification.user == "vendor",
            Notification.sub == vendor_id
        ).all()
        vendor_tokens = [n.token for n in vendor_notifications if n.token and not _is_muted(n)]

    # Fetch fleet owner tokens
    owner_notifications = db.query(Notification).filter(
        Notification.user == "vehicle_owner",
        Notification.sub == vehicle_owner_id
    ).all()
    owner_tokens = [n.token for n in owner_notifications if n.token and not _is_muted(n)]

    # Prepare payloads
    # Was "new_booking" for a started trip, so a sound uploaded for new
    # bookings also played on every trip start.
    event_key = "trip_completed" if status == "ended" else "trip_status"
    for token in vendor_tokens:
        payloads.append(apply_notification_extras(
            {"to": token, "title": title, "body": body}, db, event_key,
        ))

    for token in owner_tokens:
        payloads.append(apply_notification_extras(
            {"to": token, "title": title, "body": body}, db, event_key,
        ))

    # Send vendor/owner notifications
    if payloads:
        await _post_expo_payloads(payloads)

    try:
        if owner_tokens:
            log_notification(db, "vehicle_owner", vehicle_owner_id, title, body, event_key, related_order_id=order_id)
    except Exception as e:
        print(f"trip-status notification log failed (push still sent): {e}")

    # Notify customer if this is a customer-originated order
    try:
        from app.models.customer_booking_request import CustomerBookingRequest
        customer_booking = db.query(CustomerBookingRequest).filter(
            CustomerBookingRequest.linked_order_id == order_id
        ).first()
        if customer_booking:
            cust_title = "Trip Started" if status == "started" else "Trip Ended"
            cust_body = "Your trip has started. Have a safe journey!" if status == "started" else "Your trip has completed. Thank you for riding with us!"
            cust_event = "customer_driver_assigned" if status == "started" else "customer_trip_completed"
            await send_push_notification_to_customer(
                db,
                customer_id=str(customer_booking.customer_id),
                title=cust_title,
                message=cust_body,
                event_key=cust_event
            )
    except Exception as e:
        print(f"Failed to send trip status notification to customer: {e}")

    return {
        "status": f"Trip {status} notifications processed",
        "vendor_tokens": vendor_tokens,
        "vehicle_owner_tokens": owner_tokens
    }

async def notify_order_price_edited(db: Session, order_id: int, new_vendor_price: int):
    """Notify the assigned fleet owner and driver (if any) that the vendor
    changed this booking's price after posting - the vendor doesn't need
    notifying since they're the one who made the edit. See
    app/crud/orders.py:edit_order and app/api/routes/orders.py."""
    assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.assignment_status.in_(["PENDING", "ASSIGNED", "DRIVING"])
    ).order_by(OrderAssignment.created_at.desc()).first()

    if not assignment:
        return {"status": "No active assignment to notify"}

    title = f"Order ID: {order_id} Price Updated"
    body = f"The fare for this booking has been updated to ₹{new_vendor_price}."

    payloads = []
    owner_notifications = db.query(Notification).filter(
        Notification.user == "vehicle_owner",
        Notification.sub == str(assignment.vehicle_owner_id)
    ).all()
    for n in owner_notifications:
        if n.token:
            payloads.append(apply_notification_extras({"to": n.token, "title": title, "body": body}, db, "booking_price_updated"))

    if assignment.driver_id:
        driver_notifications = db.query(Notification).filter(
            Notification.user == "driver",
            Notification.sub == str(assignment.driver_id)
        ).all()
        for n in driver_notifications:
            if n.token:
                payloads.append(apply_notification_extras({"to": n.token, "title": title, "body": body}, db, "booking_price_updated"))

    # In-app inbox entry - written regardless of whether a push token exists,
    # so the notification still shows up even without push permission.
    try:
        log_notification(db, "vehicle_owner", str(assignment.vehicle_owner_id), title, body, "booking_price_updated", related_order_id=order_id)
        if assignment.driver_id:
            log_notification(db, "driver", str(assignment.driver_id), title, body, "booking_price_updated", related_order_id=order_id)
    except Exception as e:
        print(f"price-updated notification log failed (push still sent): {e}")

    if not payloads:
        return {"status": "No tokens found"}

    expo_result = await _post_expo_payloads(payloads)
    return {"status": "Notification(s) sent", "expo_response": expo_result}


async def notify_order_cancelled_by_vendor(db: Session, order_id: int, assignment) -> dict:
    """Notify the fleet owner and driver (if any) that the vendor cancelled
    this booking after they'd already accepted it. Mirrors
    notify_order_price_edited's owner+driver targeting. See
    app/crud/order_assignments.py:cancel_order_by_vendor."""
    title = f"Booking ID: {order_id} Cancelled"
    body = "This booking was cancelled by the vendor."
    _note = (getattr(assignment, "cancel_note", None) or "").strip()
    if _note:
        body = f"{body} Reason: {_note}"

    payloads = []
    owner_notifications = db.query(Notification).filter(
        Notification.user == "vehicle_owner",
        Notification.sub == str(assignment.vehicle_owner_id)
    ).all()
    for n in owner_notifications:
        if n.token:
            payloads.append(apply_notification_extras({"to": n.token, "title": title, "body": body}, db, "booking_cancelled_by_vendor"))

    if assignment.driver_id:
        driver_notifications = db.query(Notification).filter(
            Notification.user == "driver",
            Notification.sub == str(assignment.driver_id)
        ).all()
        for n in driver_notifications:
            if n.token:
                payloads.append(apply_notification_extras({"to": n.token, "title": title, "body": body}, db, "booking_cancelled_by_vendor"))

    try:
        log_notification(db, "vehicle_owner", str(assignment.vehicle_owner_id), title, body, "booking_cancelled_by_vendor", related_order_id=order_id)
        if assignment.driver_id:
            log_notification(db, "driver", str(assignment.driver_id), title, body, "booking_cancelled_by_vendor", related_order_id=order_id)
    except Exception as e:
        print(f"cancelled-by-vendor notification log failed (push still sent): {e}")

    if not payloads:
        return {"status": "No tokens found"}

    expo_result = await _post_expo_payloads(payloads)
    return {"status": "Notification(s) sent", "expo_response": expo_result}


async def notify_order_reminder(db: Session, order_id: int, title: str, body: str):
    """Manual re-ping for a booking that already has an active assignment -
    triggered by the vendor's "Notify" button (see app/crud/orders.py:
    notify_order_manually). Reuses the same owner+driver targeting as
    notify_order_price_edited, just with reminder text instead of a price
    change."""
    assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.assignment_status.in_(["PENDING", "ASSIGNED", "DRIVING"])
    ).order_by(OrderAssignment.created_at.desc()).first()

    if not assignment:
        return {"status": "No active assignment to notify"}

    payloads = []
    owner_notifications = db.query(Notification).filter(
        Notification.user == "vehicle_owner",
        Notification.sub == str(assignment.vehicle_owner_id)
    ).all()
    for n in owner_notifications:
        if n.token:
            payloads.append(apply_notification_extras({"to": n.token, "title": title, "body": body}, db, "booking_reminder"))

    if assignment.driver_id:
        driver_notifications = db.query(Notification).filter(
            Notification.user == "driver",
            Notification.sub == str(assignment.driver_id)
        ).all()
        for n in driver_notifications:
            if n.token:
                payloads.append(apply_notification_extras({"to": n.token, "title": title, "body": body}, db, "booking_reminder"))

    # Booking reminders are push-only, not written to the persistent in-app
    # inbox - same reasoning as new-booking alerts (high volume, stale fast).

    if not payloads:
        return {"status": "No tokens found"}

    expo_result = await _post_expo_payloads(payloads)
    return {"status": "Notification(s) sent", "expo_response": expo_result}


async def notify_specific_vehicle_owner(db: Session, vehicle_owner_id: str, order_id: int, title: str, body: str, event_key: str = "booking_reminder"):
    """Vendor-triggered targeted ping to ONE specific idle fleet owner (found
    via the Vacant Drivers screen) about a pending booking they haven't
    accepted yet - as opposed to notify_order_reminder above, which only
    re-pings whoever already has an active assignment. This never assigns
    the booking; the fleet owner still has to accept it themselves."""
    payloads = []
    owner_notifications = db.query(Notification).filter(
        Notification.user == "vehicle_owner",
        Notification.sub == str(vehicle_owner_id)
    ).all()
    for n in owner_notifications:
        if n.token:
            payloads.append(apply_notification_extras({"to": n.token, "title": title, "body": body}, db, event_key))

    # Push-only, not written to the persistent in-app inbox (see notify_order_reminder).

    if not payloads:
        return {"status": "No tokens found for this fleet owner"}

    expo_result = await _post_expo_payloads(payloads)
    return {"status": "Notification sent", "expo_response": expo_result}


async def notify_vendor_auto_cancelled_order(
    db: Session,
    vendor_id: str,
    order_id: int,
    penalty_amount: int
):
    # Fetch vendor notification tokens
    notifications = db.query(Notification).filter(
        Notification.user == "vendor",
        Notification.sub == str(vendor_id)
    ).all()

    tokens = [n.token for n in notifications if n.token and not _is_muted(n)]

    if not tokens:
        return {"status": f"No Expo tokens found for vendor {vendor_id}"}

    # Build notification content
    title = "Booking Auto-Cancelled"
    if penalty_amount and penalty_amount > 0:
        body = f"Booking #{order_id} was auto-cancelled. A penalty of ₹{penalty_amount} has been received."
    else:
        body = f"Booking #{order_id} was auto-cancelled - the fleet owner did not assign a driver/car in time."

    payloads = [
        apply_notification_extras(
            {"to": token, "title": title, "body": body},
            db, "booking_auto_cancelled",
        )
        for token in tokens
    ]

    # Send push notification
    expo_result = await _post_expo_payloads(payloads)

    return {
        "status": "Auto-cancel notification sent",
        "tokens": tokens,
        "expo_response": expo_result
    }


async def notify_vendor_booking_expired(db: Session, vendor_id: str, order_id: int):
    """Nobody accepted the booking before its deadline - alert the vendor
    loudly so they can repost or adjust the price."""
    notifications = db.query(Notification).filter(
        Notification.user == "vendor",
        Notification.sub == str(vendor_id)
    ).all()
    tokens = [n.token for n in notifications if n.token and not _is_muted(n)]
    if not tokens:
        return {"status": f"No Expo tokens found for vendor {vendor_id}"}

    payloads = [
        apply_notification_extras(
            {
                "to": token,
                "priority": "high",
                "title": "⚠️ Booking Expired - Not Accepted",
                "body": f"Booking #{order_id} was NOT accepted by any driver and has been cancelled. Repost it or adjust the fare.",
            },
            db, "booking_expired",
        )
        for token in tokens
    ]
    expo_result = await _post_expo_payloads(payloads)
    return {"status": "Booking-expired notification sent", "expo_response": expo_result}


async def notify_unaccepted_expired_booking(db: Session, order):
    """
    Nobody accepted the booking before/by pickup time:
    - Vendor-posted: alert specific vendor
    - Fleet owner / Driver-posted: alert specific fleet owner
    - Website or Admin-posted: alert Admin with high-priority alarm notification
    """
    order_id = order.id
    pickup_time_str = format_pickup_time_ist(order.start_date_time)
    pickup_loc = getattr(order, "pickup_location", "Pickup")
    drop_loc = getattr(order, "drop_location", "Drop")
    
    title = f"🚨 UNACCEPTED TRIP ALARM — Order #{order_id}"
    body = f"Trip #{order_id} ({pickup_loc} → {drop_loc}) scheduled for {pickup_time_str} was NOT accepted by any driver."

    if getattr(order, "vendor_id", None):
        notifications = db.query(Notification).filter(
            Notification.user == "vendor",
            Notification.sub == str(order.vendor_id)
        ).all()
        tokens = [n.token for n in notifications if n.token and not _is_muted(n)]
        if tokens:
            payloads = [
                {
                    "to": token,
                    "title": title,
                    "body": body,
                    "sound": "notification_tone.wav",
                    "priority": "high",
                    "channelId": VENDOR_CHANNEL_ORDERS,
                    "data": {"order_id": str(order_id), "type": "unaccepted_pickup_alarm"},
                    "android": {"channelId": VENDOR_CHANNEL_ORDERS, "sound": "notification_tone.wav", "priority": "max"}
                }
                for token in tokens
            ]
            for p in payloads:
                apply_notification_extras(p, db, "unaccepted_trip_alarm")
            await _post_expo_payloads(payloads)

    elif getattr(order, "posted_by_vehicle_owner_id", None):
        # Was `order.vehicle_owner_id`, an attribute Order doesn't have, so a
        # driver-posted booking nobody accepted always fell through to the
        # Admin alarm instead of alerting the driver who posted it.
        notifications = db.query(Notification).filter(
            Notification.user == "vehicle_owner",
            Notification.sub == str(order.posted_by_vehicle_owner_id)
        ).all()
        tokens = [n.token for n in notifications if n.token and not _is_muted(n)]
        if tokens:
            payloads = [
                {
                    "to": token,
                    "title": title,
                    "body": body,
                    "sound": "notification_tone.wav",
                    "priority": "high",
                    "channelId": DRIVER_CHANNEL_URGENT,
                    "data": {"order_id": str(order_id), "type": "unaccepted_pickup_alarm"},
                    "android": {"channelId": DRIVER_CHANNEL_URGENT, "sound": "notification_tone.wav", "priority": "max"}
                }
                for token in tokens
            ]
            for p in payloads:
                apply_notification_extras(p, db, "poster_unaccepted_trip_alarm")
            await _post_expo_payloads(payloads)

    else:
        # Website or Admin-posted -> Notify Admin Alarm!
        await send_push_notification_to_admin(
            db=db,
            title=title,
            message=body
        )


async def send_trip_to_telegram(
    pickup_location: str,
    drop_location: str,
    trip_type: str,
    vehicle_type: str,
    pickup_datetime: str,
    master_id : int,
    route : str
):
    print("Notification CRUD module loaded successfully")
    print(f"BOT_TOKEN: {BOT_TOKEN}, CHAT_ID: {CHAT_ID}")

    message = f"""
🚖 🚖 <b>DROP CARS</b> 🚖 🚖

<b>Booking ID :</b> {master_id}

<b>From :</b> {pickup_location}
<b>To :</b> {drop_location}

<b>Route : </b> 
{route}

<b>Trip Type :</b> {trip_type}
<b>Vehicle :</b> {vehicle_type}

<b>Pickup Time :</b> {pickup_datetime}

⚠ <b>Booking ONLY using the Drop Cars Driver App</b>

<b>Driver App :</b>
https://play.google.com/store/apps/details?id=com.dropcars.driverapp

<b>Follow Drop Cars - Driver Partners on Telegram :</b>
https://t.me/drop_cars

<b>Follow Drop Cars - Driver Partners on WhatsApp :</b>
https://whatsapp.com/channel/0029VbB6Wj04tRrza58IwZ2p
    """

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

    payload = {
            "chat_id": CHAT_ID,
            "text": message,
            "parse_mode": "HTML"
        }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload)
        print("Telegram notification sent, response:", response.json())
        return {
            "status": "Telegram message sent",
            "telegram_response": response.json()
        }


def send_trip_to_telegram_sync(
    pickup_location: str,
    drop_location: str,
    trip_type: str,
    vehicle_type: str,
    pickup_datetime: str,
    master_id: int,
    route: str
):
    """Sync counterpart of send_trip_to_telegram - the route handlers that
    call this (oneway/roundtrip/multicity confirm) run as plain `def`
    functions in AnyIO's worker thread pool (see the async-def-to-def
    blocking-call fix), which has no event loop of its own, so the old
    `asyncio.ensure_future(send_trip_to_telegram(...))` fire-and-forget
    pattern crashed with "There is no current event loop in thread
    'AnyIO worker thread'". A plain sync call has no such requirement."""
    message = f"""
🚖 🚖 <b>DROP CARS</b> 🚖 🚖

<b>Booking ID :</b> {master_id}

<b>From :</b> {pickup_location}
<b>To :</b> {drop_location}

<b>Route : </b>
{route}

<b>Trip Type :</b> {trip_type}
<b>Vehicle :</b> {vehicle_type}

<b>Pickup Time :</b> {pickup_datetime}

⚠ <b>Booking ONLY using the Drop Cars Driver App</b>

<b>Driver App :</b>
https://play.google.com/store/apps/details?id=com.dropcars.driverapp

<b>Follow Drop Cars - Driver Partners on Telegram :</b>
https://t.me/drop_cars

<b>Follow Drop Cars - Driver Partners on WhatsApp :</b>
https://whatsapp.com/channel/0029VbB6Wj04tRrza58IwZ2p
    """

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {"chat_id": CHAT_ID, "text": message, "parse_mode": "HTML"}

    try:
        with httpx.Client(timeout=15) as client:
            response = client.post(url, json=payload)
            return {"status": "Telegram message sent", "telegram_response": response.json()}
    except Exception as e:
        print(f"send_trip_to_telegram_sync failed: {e}")
        return {"status": "failed", "error": str(e)}


def send_trip_to_telegram_hourly_sync(
    pickup_location: str,
    trip_type: str,
    vehicle_type: str,
    pickup_datetime: str,
    master_id: int
):
    """Sync counterpart of send_trip_to_telegram_hourly - see
    send_trip_to_telegram_sync's docstring for why this exists."""
    message = f"""
🚖 🚖 <b>DROP CARS</b> 🚖 🚖

<b>Booking ID :</b> {master_id}

<b>From :</b> {pickup_location}

<b>Trip Type :</b> {trip_type}
<b>Vehicle :</b> {vehicle_type}

<b>Pickup Time :</b> {pickup_datetime}

⚠ <b>Booking ONLY using the Drop Cars Driver App</b>

<b>Driver App :</b>
https://play.google.com/store/apps/details?id=com.dropcars.driverapp

<b>Follow Drop Cars - Driver Partners on Telegram :</b>
https://t.me/drop_cars

<b>Follow Drop Cars - Driver Partners on WhatsApp :</b>
https://whatsapp.com/channel/0029VbB6Wj04tRrza58IwZ2p
"""

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {"chat_id": CHAT_ID, "text": message, "parse_mode": "HTML"}

    try:
        with httpx.Client(timeout=15) as client:
            response = client.post(url, json=payload)
            return {"status": "Telegram message sent", "telegram_response": response.json()}
    except Exception as e:
        print(f"send_trip_to_telegram_hourly_sync failed: {e}")
        return {"status": "failed", "error": str(e)}


async def send_trip_to_telegram_hourly(
    pickup_location: str,
    trip_type: str,
    vehicle_type: str,
    pickup_datetime: str,
    master_id : int
    
):

    message = f"""
🚖 🚖 <b>DROP CARS</b> 🚖 🚖

<b>Booking ID :</b> {master_id}

<b>From :</b> {pickup_location}

<b>Trip Type :</b> {trip_type}
<b>Vehicle :</b> {vehicle_type}

<b>Pickup Time :</b> {pickup_datetime}

⚠ <b>Booking ONLY using the Drop Cars Driver App</b>

<b>Driver App :</b>
https://play.google.com/store/apps/details?id=com.dropcars.driverapp

<b>Follow Drop Cars - Driver Partners on Telegram :</b>
https://t.me/drop_cars

<b>Follow Drop Cars - Driver Partners on WhatsApp :</b>
https://whatsapp.com/channel/0029VbB6Wj04tRrza58IwZ2p
"""

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

    payload = {
        "chat_id": CHAT_ID,
        "text": message,
        "parse_mode": "HTML"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload)

    return {
        "status": "Telegram message sent",
        "telegram_response": response.json()
    }
    
async def send_booking_accepted_to_telegram(master_id: int):
    message = f"""
✅ ✅ <b>BOOKING ACCEPTED</b> ✅ ✅

<b>Booking ID :</b> {master_id}

🚖 <b>This booking has been successfully accepted by a Driver.</b>

📲 <b>Please check the Driver App for Upcomming  Bookings.</b>

<b>Driver App :</b>
https://play.google.com/store/apps/details?id=com.dropcars.driverapp

📢 <b>Stay Updated :</b>
Telegram: https://t.me/drop_cars
WhatsApp: https://whatsapp.com/channel/0029VbB6Wj04tRrza58IwZ2p
"""

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

    payload = {
        "chat_id": CHAT_ID,
        "text": message,
        "parse_mode": "HTML"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload)

    return {
        "status": "Booking accepted message sent",
        "telegram_response": response.json()
    }
    
async def send_booking_cancelled_to_telegram(master_id: int):
    message = f"""
❌ ❌ <b>BOOKING CANCELLED</b> ❌ ❌

<b>Booking ID :</b> {master_id}

🚫 <b>This booking has been cancelled.</b>

📲 <b>Please check the Driver App for Upcomming  Bookings.</b>

<b>Driver App :</b>
https://play.google.com/store/apps/details?id=com.dropcars.driverapp

📢 <b>Stay Updated :</b>
Telegram: https://t.me/drop_cars
WhatsApp: https://whatsapp.com/channel/0029VbB6Wj04tRrza58IwZ2p
"""

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

    payload = {
        "chat_id": CHAT_ID,
        "text": message,
        "parse_mode": "HTML"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload)

    return {
        "status": "Booking cancelled message sent",
        "telegram_response": response.json()
    }


def notify_drop_bid_event(
    db: Session,
    user_type: str,
    user_sub: str,
    title: str,
    body: str,
    event_type: str = "drop_bid_event",
    is_urgent: bool = True
) -> None:
    """Dispatches real-time push notification and logs in-app notification entry for Drop Bid events."""
    try:
        log_notification(db, user_type, str(user_sub), title, body, event_type, action_required=True)
    except Exception as e:
        print(f"notify_drop_bid_event log error: {e}")

    try:
        rows = db.query(Notification).filter(
            Notification.user == user_type,
            Notification.sub == str(user_sub)
        ).all()
        tokens = [r.token for r in rows if r.token and not _is_muted(r)]
        if not tokens:
            return

        target_channel = "dropcars-urgent-booking-v1" if is_urgent else "dropcars-new-booking-v1"
        payloads = [
            apply_notification_extras(
                {
                    "to": token,
                    "title": title,
                    "body": body,
                    "sound": "notification_tone.wav",
                    "priority": "high",
                    "channelId": target_channel,
                    "android": {
                        "channelId": target_channel,
                        "sound": "notification_tone.wav",
                        "priority": "max" if is_urgent else "high"
                    }
                },
                db, event_type
            )
            for token in tokens
        ]
        _post_expo_payloads_sync(payloads)
    except Exception as e:
        print(f"notify_drop_bid_event push error: {e}")


def notify_priority_lock_changed(
    db: Session,
    order_id: int,
    start_city: str,
    action_type: str = "RELEASED",
    new_cutoff_str: Optional[str] = None
) -> None:
    """
    Triggers Expo Push Notifications & In-App Alerts when a booking's Trusted-Partner
    priority lock is released early or its timeline is updated.
    """
    try:
        if action_type == "RELEASED":
            title = "🔓 Priority Lock Released!"
            body = f"Booking #{order_id} ({start_city}) priority lock released early! Open for all drivers to accept now."
            notif_type = "priority_lock_released"
        else:
            title = "⏰ Priority Timeline Changed"
            body = f"Booking #{order_id} ({start_city}) priority cutoff has been updated."
            if new_cutoff_str:
                body += f" New cutoff: {new_cutoff_str}"
            notif_type = "priority_timeline_changed"

        ordered_city = [start_city] if start_city else ["ALL"]
        users = get_users_with_permission1(db, ordered_city)
        tokens = [u.token for u in users if u.token and not _is_muted(u)]

        for u in users:
            try:
                log_notification(db, u.user, str(u.sub), title, body, notif_type, action_required=False)
            except Exception:
                pass

        if tokens:
            payloads = [
                apply_notification_extras(
                    {
                        "to": token,
                        "title": title,
                        "body": body,
                        "sound": "notification_tone.wav",
                        "priority": "high",
                        "channelId": "dropcars-urgent-booking-v1",
                        "data": {"order_id": order_id, "type": notif_type}
                    },
                    db, notif_type
                )
                for token in tokens
            ]
            _post_expo_payloads_sync(payloads)
    except Exception as e:
        print(f"notify_priority_lock_changed failed (non-fatal): {e}")
