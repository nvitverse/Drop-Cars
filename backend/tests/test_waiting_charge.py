"""Waiting time is billed on every trip type except Hourly Rental (owner 2026-10-15). Multi-city keeps its own two settings; every other
trip type has `waiting_rate_per_hour` / `waiting_free_minutes` (they default to the multi-city values until the owner changes them)."""
from types import SimpleNamespace

from app.crud import end_records
from app.models.new_orders import OrderTypeEnum


def _db_with(values):
    """multicity_waiting_charge only asks for platform settings; fake just that."""
    return values


def test_other_trip_types_use_their_own_rate_and_free_minutes(monkeypatch):
    settings = {"multicity_waiting_rate_per_hour": "60", "multicity_waiting_free_minutes": "0",
                "waiting_rate_per_hour": "120", "waiting_free_minutes": "15"}
    from app.crud import customer_booking_request as cbr
    monkeypatch.setattr(cbr, "get_platform_setting_value", lambda db, key, default: settings.get(key, default))
    # 75 minutes on a one-way trip: 15 free, 60 billed at Rs 120/hour = Rs 120
    assert end_records.multicity_waiting_charge(None, 75, None, 1, multicity=False) == 120
    # the same 75 minutes on a multi-city trip use the multi-city pair: 75 min at Rs 60/hour = Rs 75
    assert end_records.multicity_waiting_charge(None, 75, None, 1, multicity=True) == 75
    # hours already included in the booking are free on top of the free minutes
    assert end_records.multicity_waiting_charge(None, 135, 1, 1, multicity=False) == 120 * 1 * (135 - 15 - 60) // 60


def test_other_settings_default_to_the_multicity_ones(monkeypatch):
    settings = {"multicity_waiting_rate_per_hour": "90", "multicity_waiting_free_minutes": "30"}
    from app.crud import customer_booking_request as cbr
    monkeypatch.setattr(cbr, "get_platform_setting_value", lambda db, key, default: settings.get(key, default))
    assert end_records.multicity_waiting_charge(None, 90, None, 1, multicity=False) == 90   # 60 billed minutes at Rs 90/hour


def test_hourly_rental_never_bills_waiting():
    assert end_records._waiting_applies(SimpleNamespace(trip_type=OrderTypeEnum.HOURLY_RENTAL)) is False
    for t in (OrderTypeEnum.ONEWAY, OrderTypeEnum.ROUND_TRIP, OrderTypeEnum.MULTY_CITY, OrderTypeEnum.LOCAL):
        assert end_records._waiting_applies(SimpleNamespace(trip_type=t)) is True
