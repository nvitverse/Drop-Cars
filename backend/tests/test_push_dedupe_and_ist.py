from datetime import datetime, timezone

from app.crud.notification import dedupe_push_payloads
from app.utils.timezone import format_pickup_time_ist, to_ist


def test_same_phone_same_message_is_sent_once():
    a = {"to": "ExponentPushToken[abc]", "title": "New trip", "body": "Chennai"}
    b = {"to": "ExponentPushToken[abc]", "title": "New trip", "body": "Chennai"}     # another account on the same phone
    c = {"to": "ExponentPushToken[xyz]", "title": "New trip", "body": "Chennai"}
    wake = {"to": "ExponentPushToken[abc]", "data": {"bubble_wakeup": True}}          # the silent companion is a different message
    out = dedupe_push_payloads([a, b, c, wake])
    assert [p["to"] for p in out] == ["ExponentPushToken[abc]", "ExponentPushToken[xyz]", "ExponentPushToken[abc]"]
    assert out[2] is wake


def test_stored_utc_time_is_shown_as_indian_time():
    utc = datetime(2026, 10, 9, 2, 0, tzinfo=timezone.utc)             # 07:30 in India
    assert "07:30 AM" in format_pickup_time_ist(utc)
    assert to_ist(utc).hour == 7 and to_ist(utc).minute == 30
    assert "07:30 AM" in format_pickup_time_ist(datetime(2026, 10, 9, 2, 0))   # naive = UTC as stored
    assert to_ist(None) is None
