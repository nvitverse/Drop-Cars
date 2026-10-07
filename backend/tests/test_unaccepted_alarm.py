from datetime import datetime, timedelta, timezone

from app.crud.order_assignments import unaccepted_alarm_fire_at

UTC = timezone.utc


def test_posted_well_ahead_rings_two_hours_before_pickup():
    posted = datetime(2026, 10, 7, 6, 0, tzinfo=UTC)
    pickup = datetime(2026, 10, 8, 10, 0, tzinfo=UTC)
    assert unaccepted_alarm_fire_at(posted, pickup) == pickup - timedelta(hours=2)


def test_posted_inside_four_hours_rings_at_half_the_time():
    posted = datetime(2026, 10, 7, 7, 0, tzinfo=UTC)
    pickup = datetime(2026, 10, 7, 10, 0, tzinfo=UTC)
    assert unaccepted_alarm_fire_at(posted, pickup) == datetime(2026, 10, 7, 8, 30, tzinfo=UTC)


def test_settings_change_the_rule():
    posted = datetime(2026, 10, 7, 7, 0, tzinfo=UTC)
    pickup = datetime(2026, 10, 7, 10, 0, tzinfo=UTC)
    assert unaccepted_alarm_fire_at(posted, pickup, short_percent=25) == datetime(2026, 10, 7, 7, 45, tzinfo=UTC)
