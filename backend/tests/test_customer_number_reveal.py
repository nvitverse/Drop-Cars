"""Customer number reveal: normal window, and the short-notice countdown.
Short notice = the normal window is already open when the driver accepts
(e.g. pickup only 2 minutes away). The number then unlocks after the longer of
5 minutes or 10% of the time left to pickup, counted from acceptance."""
from datetime import datetime, timedelta

from app.crud.order_assignments import compute_reveal_at

T0 = datetime(2026, 10, 1, 12, 0, 0)


def test_advance_booking_uses_the_normal_window():
    pickup = T0 + timedelta(hours=10)
    assert compute_reveal_at(pickup, T0, 6) == pickup - timedelta(hours=6)


def test_pickup_in_two_minutes_waits_five_minutes():
    pickup = T0 + timedelta(minutes=2)
    assert compute_reveal_at(pickup, T0, 6) == T0 + timedelta(minutes=5)


def test_short_notice_uses_ten_percent_when_it_is_longer():
    # 2 hours to pickup -> 10% = 12 min (more than 5)
    pickup = T0 + timedelta(hours=2)
    assert compute_reveal_at(pickup, T0, 6) == T0 + timedelta(minutes=12)
    # 1 hour to pickup -> 6 min
    pickup = T0 + timedelta(hours=1)
    assert compute_reveal_at(pickup, T0, 6) == T0 + timedelta(minutes=6)


def test_five_minute_floor_when_ten_percent_is_smaller():
    pickup = T0 + timedelta(minutes=30)   # 10% = 3 min -> floor 5
    assert compute_reveal_at(pickup, T0, 6) == T0 + timedelta(minutes=5)


def test_accepting_after_pickup_time_still_waits_the_minimum():
    pickup = T0 - timedelta(minutes=10)
    assert compute_reveal_at(pickup, T0, 6) == T0 + timedelta(minutes=5)


def test_not_accepted_yet_keeps_the_normal_window():
    pickup = T0 + timedelta(hours=3)
    assert compute_reveal_at(pickup, None, 6) == pickup - timedelta(hours=6)
