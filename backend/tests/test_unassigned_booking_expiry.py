"""
Unassigned booking auto-removal runs against real Postgres (pg_session,
rolled back afterwards). The old version wrapped the asserts in
`except Exception`, which also swallowed AssertionError, so it could never
fail.
"""
import logging

import pytest

from app.utils.unassigned_booking_expiry import auto_remove_unassigned_bookings


def test_unassigned_booking_auto_removal_contract(pg_session):
    res = auto_remove_unassigned_bookings(pg_session, custom_timeout_mins=30)

    assert res["success"] is True
    assert res["timeout_minutes_used"] == 30
    assert isinstance(res["processed_count"], int)
    assert isinstance(res["expired_order_ids"], list)


@pytest.mark.xfail(
    strict=True,
    reason="Pre-existing on main: the engine filters NewOrder.Driver_assigned / "
    "Car_assigned, which do not exist, so it always hits its except branch and "
    "returns success with 0. Needs its own backlog item; flip to pass when fixed.",
)
def test_unassigned_booking_auto_removal_query_runs(pg_session, caplog):
    with caplog.at_level(logging.ERROR):
        auto_remove_unassigned_bookings(pg_session, custom_timeout_mins=30)
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


def test_unassigned_admin_routes_require_admin():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    assert client.post("/api/admin/auto-remove-unassigned").status_code in (401, 403)
    assert client.get("/api/admin/settings/unassigned-timeout").status_code in (401, 403)
    assert client.post(
        "/api/admin/settings/unassigned-timeout", json={"unassigned_removal_timeout_minutes": 30}
    ).status_code in (401, 403)
    assert client.put("/api/orders/1/bump-fare", json={"new_driver_fare": 999}).status_code in (401, 403)
