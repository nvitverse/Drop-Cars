"""Every push type can carry its own uploaded MP3, and a phone that has made
the matching channel gets its pushes on that channel (plays when closed)."""
import re
import uuid

from app.core.security import create_access_token
from app.models.notification import Notification
from app.models.platform_setting import PlatformSetting
from app.utils.notification_settings import (
    NOTIFICATION_EVENTS, apply_notification_extras, apply_device_sound_channels, custom_channel_id,
)

URL = "https://storage.googleapis.com/test-bucket/notification_sounds/horn.mp3"
# phones get the API-served address (the bucket is private) - the channel id is derived from it
from app.utils.notification_settings import public_sound_url
PHONE_URL = public_sound_url(URL)


def test_every_event_key_used_in_code_is_in_the_catalogue():
    import pathlib
    used = set()
    for path in pathlib.Path("app").rglob("*.py"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        used |= set(re.findall(r'apply_notification_extras\([^)]*?db,\s*"([a-z_]+)"\s*\)', text, re.S))
        used |= set(re.findall(r'event_(?:key|type)\s*=\s*"([a-z_]+)"', text))
        used |= set(re.findall(r'notif_type\s*=\s*"([a-z_]+)"', text))
    # log_notification (in-app inbox) keys are not push types
    inbox_only = {"low_rating", "trip_completed"} - set(NOTIFICATION_EVENTS)
    missing = sorted(used - set(NOTIFICATION_EVENTS) - inbox_only)
    assert not missing, f"push types without a sound setting: {missing}"
    for key, meta in NOTIFICATION_EVENTS.items():
        assert meta.get("app") in ("driver", "vendor", "customer", "admin", "all"), key


def _owner_with_token(db, token):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    owner = VehicleOwnerCredentials(primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    db.add(owner)
    db.flush()
    db.add(Notification(user="vehicle_owner", sub=str(owner.id), token=token))
    db.flush()
    return owner


def test_device_channel_used_only_when_phone_has_it(pg_session):
    pg_session.merge(PlatformSetting(key="notif_sound_new_booking", value=URL))  # merge: the startup hook may already have set the default
    pg_session.flush()
    has, hasnt = "ExponentPushToken[has-channel]", "ExponentPushToken[no-channel]"
    _owner_with_token(pg_session, has)
    _owner_with_token(pg_session, hasnt)
    cid = custom_channel_id("new_booking", PHONE_URL)
    pg_session.query(Notification).filter(Notification.token == has).update({"sound_channels": {"new_booking": cid}})
    pg_session.flush()

    payloads = [apply_notification_extras({"to": t, "title": "x", "body": "y"}, pg_session, "new_booking") for t in (has, hasnt)]
    apply_device_sound_channels(payloads, pg_session)

    assert payloads[0]["channelId"] == cid and payloads[0]["data"]["sound_on_channel"] is True
    assert payloads[1]["channelId"] == "dropcars-new-booking-v1"
    assert "sound_on_channel" not in payloads[1]["data"]
    # A new upload means a new channel id; the old channel is not used any more.
    assert custom_channel_id("new_booking", PHONE_URL + "?v2") != cid


def test_manifest_and_device_report(client_with_db, pg_session):
    pg_session.merge(PlatformSetting(key="notif_sound_urgent_booking", value=URL))
    token = "ExponentPushToken[report]"
    owner = _owner_with_token(pg_session, token)
    auth = {"Authorization": "Bearer " + create_access_token({"sub": str(owner.id), "user": "vehicle_owner", "token_version": 0})}

    res = client_with_db.get("/api/notification-sounds?app=driver", headers=auth)
    assert res.status_code == 200, res.text
    sound = next(s for s in res.json()["sounds"] if s["event_key"] == "urgent_booking")
    assert sound["channel_id"] == custom_channel_id("urgent_booking", PHONE_URL)

    ok = client_with_db.post("/api/notification-sounds/device-channels", headers=auth,
                             json={"token": token, "channels": {"urgent_booking": sound["channel_id"], "bogus": "dcs-x"}})
    assert ok.status_code == 200, ok.text
    row = pg_session.query(Notification).filter(Notification.token == token).first()
    assert row.sound_channels == {"urgent_booking": sound["channel_id"]}

    other = _owner_with_token(pg_session, "ExponentPushToken[other]")
    auth2 = {"Authorization": "Bearer " + create_access_token({"sub": str(other.id), "user": "vehicle_owner", "token_version": 0})}
    assert client_with_db.post("/api/notification-sounds/device-channels", headers=auth2,
                               json={"token": token, "channels": {}}).status_code == 403
    assert client_with_db.get("/api/notification-sounds").status_code in (401, 403)
