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
    assert (o.cost_per_km, o.extra_cost_per_km) == (15, 0)                       # the customer's 15 reaches the driver as booked: 15 | 0
    assert o.vendor_price == 2190 + 135                                           # the customer total moves with the rate: +1/km on 135 km
    assert r.admin_cost_per_km == 15 and r.admin_total_amount == 2325


def test_an_untouched_booking_posts_exactly_as_before(pg_session, quiet):
    r = _request(pg_session)
    _, o = _post(pg_session, r)
    assert (o.cost_per_km, o.extra_cost_per_km, o.driver_allowance) == (14, 0, 300) and o.vendor_price == 2190


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
    assert o.cost_per_km == 15 and o.vendor_price == 2500


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
    assert out == {"cost_per_km": 15, "driver_allowance": 400, "toll_charges": 100, "permit_charges": 0, "gst_amount": 121, "total_amount": 2646,
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
    assert (o.cost_per_km, o.extra_cost_per_km) == (15, 0)                       # the customer's 15/km reaches the driver as booked: 15 | 0
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


# ------------------------------------------------------------------ the driver tariff (owner, 2026-10-02)
import json  # noqa: E402

from app.core.security import create_access_token  # noqa: E402


def _admin(db, role="Staff"):
    from app.models.admin import Admin
    a = Admin(username=f"{role.lower()}-{uuid.uuid4().hex[:6]}", password="x", role=role, phone="9000000000", email="a@a.a")
    db.add(a)
    db.flush()
    return a


def _auth(kind, account):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(account.id), "user": kind, "token_version": getattr(account, "token_version", 1) or 1})}


from app.crud import driver_tariff as DT  # noqa: E402
from app.models.platform_setting import PlatformSetting  # noqa: E402

TARIFF = DT.validate({
    "vehicles": {"SEDAN_4_PLUS_1": {"km_rate": None, "bata": 300}, "SUV_6_PLUS_1": {"km_rate": 17, "bata": 300}},
    "permits": [
        {"label": "Pondicherry 6+1", "keywords": ["Pondicherry", "Puducherry"], "vehicles": ["SUV_6_PLUS_1"], "driver": 800},
        {"label": "Andhra 6+1", "keywords": ["andhra", "tirupati"], "vehicles": ["SUV_6_PLUS_1"], "driver": 1000},
        {"label": "7+1 anywhere", "keywords": ["chennai", "bangalore", "pondicherry", "tirupati"], "vehicles": ["SUV_7_PLUS_1"], "driver": 1000},
    ],
})


def _split(car, stops, km=15, bata=400, permit=0):
    return DT.split_fare(TARIFF, car_type=car, pickup_drop_location=stops, customer_km_rate=km, customer_bata=bata, customer_permit=permit)


def test_default_is_the_customers_rate_driver_300_bata_and_the_customers_permit():
    """15 | 0, 300 | 100, 400 | 0 (the owner's example for a sedan)."""
    out = _split("SEDAN_4_PLUS_1", {"0": "Chennai", "1": "Vellore"}, km=15, bata=400, permit=400)
    assert (out["cost_per_km"], out["extra_cost_per_km"]) == (15, 0)
    assert (out["driver_allowance"], out["extra_driver_allowance"]) == (300, 100)
    assert (out["permit_charges"], out["extra_permit_charges"]) == (400, 0)


def test_a_driver_km_rate_below_the_customers_leaves_the_difference_as_extra():
    out = _split("SUV_6_PLUS_1", {"0": "Chennai", "1": "Vellore"}, km=20, bata=500)
    assert (out["cost_per_km"], out["extra_cost_per_km"]) == (17, 3) and (out["driver_allowance"], out["extra_driver_allowance"]) == (300, 200)


def test_permit_by_vehicle_and_destination():
    """6+1: customer 1000, driver 800 for Pondicherry only; Andhra 6+1: customer 2000, driver 1000; 7+1: customer 1500, driver 1000."""
    pondy = _split("SUV_6_PLUS_1", {"0": "Chennai", "1": "Puducherry"}, permit=1000)
    assert (pondy["permit_charges"], pondy["extra_permit_charges"], pondy["permit_rule"]) == (800, 200, "Pondicherry 6+1")
    andhra = _split("SUV_6_PLUS_1", {"0": "Chennai", "1": "Tirupati"}, permit=2000)
    assert (andhra["permit_charges"], andhra["extra_permit_charges"]) == (1000, 1000)
    seven = _split("SUV_7_PLUS_1", {"0": "Madurai", "1": "Bangalore"}, permit=1500)
    assert (seven["permit_charges"], seven["extra_permit_charges"]) == (1000, 500)
    other = _split("SUV_6_PLUS_1", {"0": "Chennai", "1": "Madurai"}, permit=1000)           # no rule for this destination: the driver gets the customer's amount
    assert (other["permit_charges"], other["extra_permit_charges"], other["permit_rule"]) == (1000, 0, None)
    assert _split("SEDAN_4_PLUS_1", {"0": "Chennai", "1": "Puducherry"}, permit=500)["permit_charges"] == 500       # the rule is for 6+1 only


def test_only_stops_after_the_pickup_count():
    assert _split("SUV_6_PLUS_1", {"0": "Pondicherry", "1": "Chennai"}, permit=1000)["permit_charges"] == 1000


def test_the_driver_never_gets_more_than_the_customer_pays():
    out = _split("SUV_6_PLUS_1", {"0": "Chennai", "1": "Puducherry"}, km=10, bata=250, permit=600)
    assert out["cost_per_km"] == 10 and out["driver_allowance"] == 250 and out["permit_charges"] == 600 and out["extra_permit_charges"] == 0


@pytest.mark.parametrize("bad,why", [
    ({"vehicles": {"ROCKET": {}}}, "Unknown vehicle"),
    ({"vehicles": {"SEDAN_4_PLUS_1": {"km_rate": 999}}}, "between"),
    ({"vehicles": {"SEDAN_4_PLUS_1": {"bata": -5}}}, "between"),
    ({"permits": [{"label": "x", "keywords": [], "driver": 5}]}, "place name"),
    ({"permits": [{"label": "x", "keywords": ["a"], "vehicles": ["NOPE"], "driver": 5}]}, "unknown vehicle"),
    ({"permits": [{"label": "x", "keywords": ["a"], "driver": "abc"}]}, "number"),
])
def test_a_bad_tariff_is_refused_with_a_readable_reason(bad, why):
    with pytest.raises(ValueError, match=why):
        DT.validate(bad)


def test_posting_uses_the_saved_driver_tariff(pg_session, quiet):
    """Website booking, customer 15/km + bata 400 + permit 1000 to Pondicherry in a 6+1: driver 15 | 0, 300 | 100, permit 800 | 200."""
    DT.save(pg_session, {"vehicles": {"SUV_6_PLUS_1": {"km_rate": None, "bata": 300}}, "permits": [
        {"label": "Pondicherry 6+1", "keywords": ["pondicherry"], "vehicles": ["SUV_6_PLUS_1"], "driver": 800}]})
    r = _request(pg_session, car_type="SUV_6_PLUS_1", pickup_drop_location={"0": "Chennai", "1": "Pondicherry"}, quoted_cost_per_km=15, quoted_driver_allowance=400,
                 quoted_permit_charges=1000, quoted_total_amount=135 * 15 + 400 + 1000, quoted_driver_amount=135 * 15 + 400 + 1000)
    _, o = _post(pg_session, r)
    assert (o.cost_per_km, o.extra_cost_per_km) == (15, 0)
    assert (o.driver_allowance, o.extra_driver_allowance) == (300, 100)
    assert (o.permit_charges, o.extra_permit_charges) == (800, 200)
    assert o.vendor_price == 135 * 15 + 400 + 1000                            # the customer's total is untouched; the driver part is smaller, the rest is extras
    assert o.estimated_price == 135 * 15 + 300 + 800                          # what the driver sees as his fare


def test_the_admin_api_is_owner_only_and_saves_what_was_edited(pg_session, client_with_db):
    staff, owner = _admin(pg_session), _admin(pg_session, "Owner")
    assert client_with_db.get("/api/admin/driver-tariff", headers=_auth("admin", staff)).status_code == 200
    body = {"vehicles": {"SEDAN_4_PLUS_1": {"km_rate": 13, "bata": 300}}, "permits": [{"label": "Pondy", "keywords": ["pondicherry"], "vehicles": ["*"], "driver": 400}]}
    assert client_with_db.put("/api/admin/driver-tariff", json=body, headers=_auth("admin", staff)).status_code == 403
    r = client_with_db.put("/api/admin/driver-tariff", json=body, headers=_auth("admin", owner))
    assert r.status_code == 200 and r.json()["config"]["vehicles"]["SEDAN_4_PLUS_1"]["km_rate"] == 13
    again = client_with_db.get("/api/admin/driver-tariff", headers=_auth("admin", owner)).json()
    assert again["config"]["permits"][0]["driver"] == 400 and "SEDAN_4_PLUS_1" in again["car_types"] and "Pondicherry" in again["suggested_regions"]
    assert client_with_db.put("/api/admin/driver-tariff", json={"vehicles": {"SEDAN_4_PLUS_1": {"km_rate": 9999}}}, headers=_auth("admin", owner)).status_code == 400
    assert pg_session.query(PlatformSetting).filter(PlatformSetting.key == "driver_tariff").one()


def test_toll_permit_and_gst_are_separated_when_the_website_sends_them():
    """Sedan inclusive fare: 15 x 135 = 2025, bata 400, toll 270 (2/km), state entry tax 500, GST 5% of 2425 = 121 -> 3316."""
    out = apply_website_quote({"total_km": 135, "total_amount": 3000}, WebsiteQuotedFare(per_km_rate=15, driver_bata=400, billable_km=135, total_fare=3316,
                                                                                       include_taxes=True, include_tolls=True, toll_amount=270, permit_amount=500))
    assert (out["toll_charges"], out["permit_charges"], out["gst_amount"], out["total_amount"]) == (270, 500, 121, 3316)
    assert out["driver_amount"] == 2025 + 400 + 270 + 500


def test_website_permit_reaches_the_order_and_the_driver_tariff_splits_it(pg_session, quiet):
    DT.save(pg_session, {"vehicles": {}, "permits": [{"label": "Pondy", "keywords": ["pondicherry"], "vehicles": ["*"], "driver": 400}]})
    out = apply_website_quote({"total_km": 135, "total_amount": 3000}, WebsiteQuotedFare(per_km_rate=15, driver_bata=400, billable_km=135, total_fare=3316,
                                                                                       include_taxes=True, include_tolls=True, toll_amount=270, permit_amount=500))
    r = _request(pg_session, pickup_drop_location={"0": "Chennai", "1": "Pondicherry"}, quoted_cost_per_km=out["cost_per_km"], quoted_driver_allowance=out["driver_allowance"],
                 quoted_permit_charges=out["permit_charges"], quoted_toll_charges=out["toll_charges"], quoted_total_amount=out["total_amount"],
                 quoted_driver_amount=out["driver_amount"], gst_included=True, gst_amount=out["gst_amount"])
    _, o = _post(pg_session, r)
    assert (o.permit_charges, o.extra_permit_charges) == (400, 100)               # customer 500, driver 400 for Pondicherry, 100 to the extras
    assert (o.cost_per_km, o.extra_cost_per_km, o.driver_allowance, o.extra_driver_allowance) == (15, 0, 300, 100)
    assert o.toll_charges == 270 and o.gst_amount == 121 and o.vendor_price == 3316


def test_a_star_place_means_any_destination():
    cfg = DT.validate({"permits": [{"label": "Sedan permit", "keywords": ["*"], "vehicles": ["SEDAN_4_PLUS_1"], "driver": 400}]})
    out = DT.split_fare(cfg, car_type="SEDAN_4_PLUS_1", pickup_drop_location={"0": "Chennai", "1": "Madurai"}, customer_km_rate=15, customer_bata=400, customer_permit=500)
    assert (out["permit_charges"], out["extra_permit_charges"]) == (400, 100)
