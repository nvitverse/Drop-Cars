"""Who gets a new-booking alert (owner, 2026-10-01): drivers who picked cities get those cities' bookings; drivers who
picked none get everything; nobody is dropped because of a permission/status flag. Plus: uploaded sounds are served by
the API (the bucket is private, so storage URLs gave phones a 403)."""
import uuid

import pytest


def _row(db, selected=None, token="auto", permission1=False, muted=False):
    from app.models.notification import Notification
    n = Notification(
        user="vehicle_owner", sub=str(uuid.uuid4()),
        token=f"ExponentPushToken[{uuid.uuid4().hex[:12]}]" if token == "auto" else token,
        permission1=permission1, permission2=False, selected_city=selected,
    )
    db.add(n)
    db.flush()
    return n


@pytest.fixture
def clean(pg_session):
    from app.models.notification import Notification
    pg_session.query(Notification).filter(Notification.user == "vehicle_owner").update({Notification.token: None}, synchronize_session=False)
    pg_session.flush()
    return pg_session


def _audience(db, cities):
    from app.crud.notification import get_users_with_permission1
    return {u.sub for u in get_users_with_permission1(db, cities)}


def test_driver_who_picked_no_cities_gets_every_booking(clean):
    nobody_picked = _row(clean, selected=None)
    empty_pick = _row(clean, selected=[])
    assert {nobody_picked.sub, empty_pick.sub} <= _audience(clean, ["Chennai"])


def test_driver_with_cities_gets_only_those(clean):
    chennai = _row(clean, selected=["Chennai"])
    madurai = _row(clean, selected=["Madurai"])
    got = _audience(clean, ["Chennai"])
    assert chennai.sub in got and madurai.sub not in got


def test_permission_flag_does_not_leave_anyone_out(clean):
    flag_off = _row(clean, selected=None, permission1=False)
    flag_on = _row(clean, selected=None, permission1=True)
    assert {flag_off.sub, flag_on.sub} <= _audience(clean, ["Chennai"])


def test_no_token_means_nothing_to_send_to(clean):
    tokenless = _row(clean, selected=None, token=None)
    assert tokenless.sub not in _audience(clean, ["Chennai"])


def test_all_cities_driver_still_matches(clean):
    from app.utils.cities import get_cities
    everything = _row(clean, selected=list(get_cities()))
    assert everything.sub in _audience(clean, ["Some Brand New Town"])


def test_storage_url_becomes_an_api_url():
    from app.utils.notification_settings import public_sound_url, PUBLIC_API_BASE
    u = "https://storage.googleapis.com/drop-cars-production-bucket/notification_sounds/drop-cars-booking-notification.mp3"
    assert public_sound_url(u) == f"{PUBLIC_API_BASE}/api/notification-sounds/file/drop-cars-booking-notification.mp3"
    assert public_sound_url("notification_tone.wav") == "notification_tone.wav"
    other = "https://example.com/a.mp3"
    assert public_sound_url(other) == other


def test_sound_file_route_refuses_odd_names(client_with_db):
    for bad in ("..%2F..%2Fsecret.mp3", "a.exe", "nested%2Fa.mp3"):
        r = client_with_db.get(f"/api/notification-sounds/file/{bad}")
        assert r.status_code in (404, 422), (bad, r.status_code)
