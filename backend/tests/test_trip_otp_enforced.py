import pytest

from app.crud import trip_otp


def _enforce(monkeypatch, value):
    monkeypatch.setattr("app.crud.customer_booking_request.get_platform_setting_value", lambda db, key, default: value if key == "trip_otp_enforced" else default)


def test_blank_code_is_refused_when_the_trip_has_one(monkeypatch):
    _enforce(monkeypatch, "1")
    for blank in (None, "", "   "):
        with pytest.raises(ValueError):
            trip_otp.check_trip_otp(None, "4821", blank, "start")


def test_wrong_code_is_refused_and_right_code_passes(monkeypatch):
    _enforce(monkeypatch, "1")
    with pytest.raises(ValueError):
        trip_otp.check_trip_otp(None, "4821", "1111", "end")
    trip_otp.check_trip_otp(None, "4821", " 4821 ", "end")


def test_trips_without_a_code_are_not_blocked(monkeypatch):
    _enforce(monkeypatch, "1")
    trip_otp.check_trip_otp(None, None, "", "start")


def test_switch_off_only_relaxes_the_blank_case(monkeypatch):
    _enforce(monkeypatch, "0")
    trip_otp.check_trip_otp(None, "4821", "", "start")
    with pytest.raises(ValueError):
        trip_otp.check_trip_otp(None, "4821", "9999", "start")


def test_website_trip_codes_route_needs_the_website_key():
    from fastapi.testclient import TestClient
    from app.main import app
    res = TestClient(app).get("/api/website/bookings/00000000-0000-0000-0000-000000000000/trip-codes")
    assert res.status_code in (401, 403)


def test_no_codes_before_a_driver_is_assigned():
    from types import SimpleNamespace
    req = SimpleNamespace(linked_order_id=None)
    assert trip_otp.trip_codes_for_request(None, req) == {"start_trip_otp": None, "end_trip_otp": None, "available": False}
