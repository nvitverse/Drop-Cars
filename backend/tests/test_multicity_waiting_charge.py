from app.crud import end_records


def _with_settings(monkeypatch, **values):
    monkeypatch.setattr("app.crud.customer_booking_request.get_platform_setting_value", lambda db, key, default: str(values.get(key, default)))


def test_default_rate_matches_the_old_one_rupee_per_minute(monkeypatch):
    _with_settings(monkeypatch)
    assert end_records.multicity_waiting_charge(None, 450, None, 3) == 450
    assert end_records.multicity_waiting_charge(None, 0, None, 3) == 0


def test_included_waiting_hours_are_free(monkeypatch):
    _with_settings(monkeypatch)
    assert end_records.multicity_waiting_charge(None, 450, 2, 3) == 330      # 450 min - 2 free hours = 330 min
    assert end_records.multicity_waiting_charge(None, 100, 2, 3) == 0


def test_cannot_wait_longer_than_the_trip(monkeypatch):
    _with_settings(monkeypatch)
    assert end_records.multicity_waiting_charge(None, 999999, None, 2) == 2 * 24 * 60


def test_rate_and_free_minutes_come_from_settings(monkeypatch):
    _with_settings(monkeypatch, multicity_waiting_rate_per_hour=120, multicity_waiting_free_minutes=30)
    assert end_records.multicity_waiting_charge(None, 90, None, 1) == 120    # 60 billable minutes at Rs 120/hour
