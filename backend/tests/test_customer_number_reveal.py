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


def test_pickup_more_than_two_hours_away_is_not_delayed_after_accepting():
    # Pickup in 4 hrs, normal window (6 hrs before) already passed when accepted:
    # more than 2 hrs left -> no countdown, open straight away.
    pickup = T0 + timedelta(hours=4)
    at = compute_reveal_at(pickup, T0, 6)
    assert at == pickup - timedelta(hours=6) and at < T0


def test_exactly_two_hours_left_is_still_short_notice():
    pickup = T0 + timedelta(hours=2)
    assert compute_reveal_at(pickup, T0, 6) == T0 + timedelta(minutes=12)


def test_driver_schemas_carry_the_countdown_and_notice_fields():
    # The API silently drops fields the response model does not declare.
    from app.schemas.order_assignments import DriverOrderListResponse, BaseResponce_pending_orders
    from app.schemas.order_details import VehicleOwnerOrderDetailResponse
    for f in ("customer_number_revealed", "customer_number_reveal_at", "customer_number_reveal_in_seconds", "customer_number_notice"):
        assert f in DriverOrderListResponse.model_fields, f
    assert "customer_number_notice" in BaseResponce_pending_orders.model_fields
    assert "customer_number_notice" in VehicleOwnerOrderDetailResponse.model_fields


def _order(start, fixed=None, manual=False):
    from types import SimpleNamespace
    return SimpleNamespace(id=1, start_date_time=start, customer_phone_reveal_at=fixed, data_visibility_vehicle_owner=manual)


def test_notice_wording(pg_session):
    from app.crud.order_assignments import customer_number_notice
    now = datetime.utcnow()
    far = _order(now + timedelta(hours=20))
    assert "6 hrs before pickup" in customer_number_notice(pg_session, far)
    mid = _order(now + timedelta(hours=4))
    assert customer_number_notice(pg_session, mid) == "Customer number is shown as soon as you accept."
    soon = _order(now + timedelta(minutes=30))
    assert "5 min after you accept" in customer_number_notice(pg_session, soon)
    assert customer_number_notice(pg_session, _order(now + timedelta(hours=20), manual=True)) == "Customer number is shown as soon as you accept."
    fixed = _order(now + timedelta(hours=20), fixed=now + timedelta(hours=3))
    assert "Customer number is shown at" in customer_number_notice(pg_session, fixed)


def test_fixed_moment_beats_the_automatic_rule(pg_session):
    from app.crud.order_assignments import customer_number_reveal_at
    now = datetime.utcnow()
    at = now + timedelta(hours=3)
    assert customer_number_reveal_at(pg_session, _order(now + timedelta(hours=20), fixed=at), assignment=None) == at
