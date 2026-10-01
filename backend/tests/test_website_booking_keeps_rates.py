"""A website booking confirmed by a dispatcher at a custom rate must be posted at that rate (owner, 2026-10-01: confirmed 15/km, posted 14/km)."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.crud import customer_booking_request as crb
from app.models.new_orders import NewOrder


def _phone():
    return "9" + str(uuid.uuid4().int)[:9]


def _request(db, **over):
    from app.models.customer import CustomerCredentials
    from app.models.customer_booking_request import CustomerBookingRequest
    c = CustomerCredentials(primary_number=_phone(), hashed_password="x")
    db.add(c)
    db.flush()
    f = dict(
        customer_id=c.id, pickup_drop_location={"0": "Chennai", "1": "Vellore"}, trip_type="Oneway", car_type="SEDAN_4_PLUS_1",
        start_date_time=datetime.now(timezone.utc) + timedelta(hours=30), customer_name="Test", customer_number=_phone(),
        quoted_cost_per_km=14, quoted_driver_allowance=300, quoted_extra_driver_allowance=0, quoted_permit_charges=0,
        quoted_extra_permit_charges=0, quoted_hill_charges=0, quoted_toll_charges=0, quoted_extra_cost_per_km=0, quoted_night_charges=0,
        quoted_total_amount=2190, quoted_driver_amount=2190, quoted_trip_distance=135, quoted_trip_time="3 h", status="PENDING", source="WEBSITE",
    )
    f.update(over)
    r = CustomerBookingRequest(**f)
    db.add(r)
    db.flush()
    return r


@pytest.fixture
def quiet(monkeypatch):
    """No real pushes / Telegram while the booking is posted."""
    from app.utils import notification_dispatch as nd
    monkeypatch.setattr(nd, "_send_expo", lambda *a, **k: {"status": "sent"})
    yield


def _post(db, r):
    master = crb.approve_customer_booking_request(db, r, decided_by="AUTO")
    return master, db.query(NewOrder).filter(NewOrder.order_id == master.source_order_id).one()       # the posted rates live on the NewOrder


def test_the_dispatchers_rate_survives_posting(pg_session, quiet):
    """Quote 14/km; the dispatcher confirmed 15/km (set through PATCH .../rates, the total was not edited)."""
    r = _request(pg_session, admin_cost_per_km=15)
    _, o = _post(pg_session, r)
    assert (o.cost_per_km, o.extra_cost_per_km) == (14, 1)                       # driver 14 + vendor extra 1 = the customer's 15
    assert o.vendor_price == 2190 + 135                                           # the customer total moves with the rate: +1/km on 135 km
    assert r.admin_cost_per_km == 15 and r.admin_total_amount == 2325


def test_an_untouched_booking_posts_exactly_as_before(pg_session, quiet):
    r = _request(pg_session)
    _, o = _post(pg_session, r)
    assert (o.cost_per_km, o.extra_cost_per_km, o.driver_allowance) == (13, 1, 300) and o.vendor_price == 2190


def test_gst_set_by_the_dispatcher_is_kept(pg_session, quiet):
    r = _request(pg_session, admin_cost_per_km=15, gst_included=True, gst_amount=116)
    _, o = _post(pg_session, r)
    assert o.gst_included is True and o.gst_amount == 116


def test_other_edited_charges_move_the_total_too(pg_session, quiet):
    r = _request(pg_session, admin_toll_charges=100, admin_extra_driver_allowance=100)
    _, o = _post(pg_session, r)
    assert o.toll_charges == 100 and o.extra_driver_allowance == 100 and o.vendor_price == 2190 + 100 + 100


def test_a_fully_edited_fare_is_left_alone(pg_session, quiet):
    """Edit fare (admin) sets the total: nothing is recalculated or overwritten."""
    r = _request(pg_session, admin_total_amount=2500, admin_driver_amount=2300, admin_cost_per_km=15, admin_driver_allowance=300, admin_extra_driver_allowance=0)
    _, o = _post(pg_session, r)
    assert o.cost_per_km == 14 and o.vendor_price == 2500


def test_complete_admin_fare_only_fills_what_is_missing():
    from types import SimpleNamespace
    r = SimpleNamespace(admin_total_amount=None, quoted_trip_distance=100, quoted_total_amount=1000, quoted_driver_amount=900, admin_driver_amount=None,
                        quoted_cost_per_km=10, admin_cost_per_km=12, quoted_extra_cost_per_km=0, admin_extra_cost_per_km=None,
                        **{f"quoted_{k}": 0 for k in crb._TOTAL_PARTS}, **{f"admin_{k}": None for k in crb._TOTAL_PARTS})
    crb.complete_admin_fare(r)
    assert r.admin_cost_per_km == 12 and r.admin_extra_cost_per_km == 0 and r.admin_toll_charges == 0
    assert r.admin_total_amount == 1200 and r.admin_driver_amount == 1100


# ------------------------------------------------------------------ booking #344: the fare the customer confirmed on the website
from app.crud.website_quote import WebsiteQuotedFare, apply_website_quote  # noqa: E402

BACKEND_FARE = {"total_km": 135, "total_amount": 2190}
WEBSITE = dict(per_km_rate=15, driver_bata=400, billable_km=135, total_fare=2646, include_taxes=True, include_tolls=True)


def test_the_website_fare_is_split_into_rate_bata_toll_and_gst():
    """15/km x 135 = 2025, bata 400, GST 5% of 2425 = 121, toll 100 -> total 2646 (the customer's confirmed price)."""
    out = apply_website_quote(BACKEND_FARE, WebsiteQuotedFare(**WEBSITE))
    assert out == {"cost_per_km": 15, "driver_allowance": 400, "toll_charges": 100, "gst_amount": 121, "total_amount": 2646,
                   "driver_amount": 2025 + 400 + 100, "total_km": 135}


def test_without_tax_inclusion_everything_left_over_is_toll():
    out = apply_website_quote(BACKEND_FARE, WebsiteQuotedFare(**{**WEBSITE, "include_taxes": False, "total_fare": 2525}))
    assert out["gst_amount"] is None and out["toll_charges"] == 100


def test_a_discounted_fare_adds_nothing_extra():
    out = apply_website_quote(BACKEND_FARE, WebsiteQuotedFare(**{**WEBSITE, "total_fare": 2300}))        # lower than km + bata: a flat discount
    assert out["toll_charges"] == 0 and out["gst_amount"] is None and out["total_amount"] == 2300


@pytest.mark.parametrize("quote", [
    dict(WEBSITE, billable_km=20),            # km nowhere near the backend's route km
    dict(WEBSITE, total_fare=99999),          # total far above anything the backend would quote
    dict(WEBSITE, total_fare=500),
])
def test_a_quote_that_does_not_make_sense_is_ignored(quote):
    assert apply_website_quote(BACKEND_FARE, WebsiteQuotedFare(**quote)) is None


def test_no_quote_keeps_the_backend_tariff():
    assert apply_website_quote(BACKEND_FARE, None) is None


def test_booking_344_end_to_end(pg_session, client_with_db, quiet, monkeypatch):
    """Website posts a booking with the confirmed fare; the order that reaches drivers carries it."""
    from app.api.routes import website_bookings as wb
    from app.models.customer_booking_request import CustomerBookingRequest
    monkeypatch.setattr(wb, "WEBSITE_INTEGRATION_KEY", "k-test")
    rates = dict(cost_per_km=14, driver_allowance=300, extra_driver_allowance=0, permit_charges=0, extra_permit_charges=0, hill_charges=0,
                 toll_charges=0, extra_cost_per_km=0, night_charges=0)
    fare = dict(BACKEND_FARE, total_amount=2190, driver_amount=2190, trip_time="3 h")
    monkeypatch.setattr("app.api.routes.customer_bookings._calculate_fare_internal", lambda *a, **k: (fare, rates))
    monkeypatch.setattr(wb, "schedule_internal_sweep", lambda *a, **k: None, raising=False)
    body = {"customer_name": "Test", "customer_number": _phone(), "pickup_drop_location": {"0": "Chennai", "1": "Vellore"}, "trip_type": "Oneway",
            "car_type": "SEDAN_4_PLUS_1", "start_date_time": (datetime.now(timezone.utc) + timedelta(hours=30)).isoformat(), "quoted_fare": WEBSITE}
    r = client_with_db.post("/api/website/bookings", json=body, headers={"X-DropCars-Website-Key": "k-test"})
    assert r.status_code == 201, r.text
    assert r.json()["quoted_total_amount"] == 2646
    req = pg_session.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == r.json()["id"]).one()
    assert (req.quoted_cost_per_km, req.quoted_driver_allowance, req.quoted_toll_charges, req.gst_included, req.gst_amount) == (15, 400, 100, True, 121)

    _, o = _post(pg_session, req)
    assert (o.cost_per_km, o.extra_cost_per_km) == (14, 1)                       # the customer's 15/km: driver 14 + vendor extra 1
    assert (o.driver_allowance, o.extra_driver_allowance) == (300, 100)          # the "300 | 100" bata
    assert o.toll_charges == 100 and o.gst_included is True and o.gst_amount == 121
    assert o.vendor_price == 2646


def test_a_bad_quote_never_blocks_the_booking(pg_session, client_with_db, quiet, monkeypatch):
    from app.api.routes import website_bookings as wb
    monkeypatch.setattr(wb, "WEBSITE_INTEGRATION_KEY", "k-test")
    rates = dict(cost_per_km=14, driver_allowance=300, extra_driver_allowance=0, permit_charges=0, extra_permit_charges=0, hill_charges=0,
                 toll_charges=0, extra_cost_per_km=0, night_charges=0)
    fare = dict(BACKEND_FARE, driver_amount=2190, trip_time="3 h")
    monkeypatch.setattr("app.api.routes.customer_bookings._calculate_fare_internal", lambda *a, **k: (fare, rates))
    monkeypatch.setattr(wb, "schedule_internal_sweep", lambda *a, **k: None, raising=False)
    body = {"customer_name": "Test", "customer_number": _phone(), "pickup_drop_location": {"0": "Chennai", "1": "Vellore"}, "trip_type": "Oneway",
            "car_type": "SEDAN_4_PLUS_1", "start_date_time": (datetime.now(timezone.utc) + timedelta(hours=30)).isoformat(),
            "quoted_fare": {"per_km_rate": "abc", "total_fare": -5}}
    r = client_with_db.post("/api/website/bookings", json=body, headers={"X-DropCars-Website-Key": "k-test"})
    assert r.status_code == 201 and r.json()["quoted_total_amount"] == 2190         # the backend's own tariff
