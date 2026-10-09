"""Admin App > Website Approvals: staff choose when a booking posts, hold to the last window, customize the driver fare."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.api.routes import website_booking_schedule as wbs
from app.crud import website_post_rules as pr
from app.crud.website_booking_approvals import list_pending_website_bookings


def _phone():
    return "9" + str(uuid.uuid4().int)[:9]


def _request(db, hours_to_pickup=100, **over):
    from app.models.customer import CustomerCredentials
    from app.models.customer_booking_request import CustomerBookingRequest
    c = CustomerCredentials(primary_number=_phone(), hashed_password="x")
    db.add(c)
    db.flush()
    f = dict(
        customer_id=c.id, pickup_drop_location={"0": "Chennai", "1": "Vellore"}, trip_type="Oneway", car_type="SEDAN_4_PLUS_1",
        start_date_time=datetime.now(timezone.utc) + timedelta(hours=hours_to_pickup), customer_name="Test", customer_number=_phone(),
        quoted_cost_per_km=16, quoted_driver_allowance=400, quoted_extra_driver_allowance=0, quoted_permit_charges=0,
        quoted_extra_permit_charges=0, quoted_hill_charges=0, quoted_toll_charges=0, quoted_extra_cost_per_km=0, quoted_night_charges=0,
        quoted_total_amount=2560 + 400, quoted_driver_amount=2960, quoted_trip_distance=160, quoted_trip_time="3 h", status="PENDING", source="WEBSITE",
    )
    f.update(over)
    r = CustomerBookingRequest(**f)
    db.add(r)
    db.flush()
    return r


def _plan(r, db, staff_on=False):
    return pr.compute_post_plan(r, now=datetime.now(timezone.utc), staff_on=staff_on, rules=pr.get_rules(db), mode="AUTO")


def test_advance_booking_posts_15_hours_before_pickup_and_staff_can_move_it(pg_session):
    r = _request(pg_session)
    plan = _plan(r, pg_session)
    assert plan["tier"] == "ADVANCE" and abs((plan["deadline"] - (r.start_date_time - timedelta(hours=15))).total_seconds()) < 2
    when = datetime.now(timezone.utc) + timedelta(hours=10)
    pr.set_post_time(pg_session, r, when)
    plan = _plan(r, pg_session)
    assert plan["tier"] == "SCHEDULED" and plan["deadline"] == when.replace(microsecond=when.microsecond)
    pr.set_post_time(pg_session, r, None)
    assert _plan(r, pg_session)["tier"] == "ADVANCE"                                     # back to the rule's own time


def test_schedule_must_be_in_the_future_and_before_the_last_window(pg_session):
    r = _request(pg_session, hours_to_pickup=50)
    with pytest.raises(HTTPException):
        pr.set_post_time(pg_session, r, datetime.now(timezone.utc) - timedelta(minutes=5))
    with pytest.raises(HTTPException) as e:
        pr.set_post_time(pg_session, r, r.start_date_time - timedelta(hours=1))        # later than pickup - 2 hrs
    assert "2 hrs before pickup" in e.value.detail
    pr.set_post_time(pg_session, r, r.start_date_time - timedelta(hours=3))


def test_hold_pauses_until_two_hours_before_pickup(pg_session):
    r = _request(pg_session)
    until = pr.hold_to_last_window(pg_session, r)
    assert abs((until - (r.start_date_time - timedelta(hours=2))).total_seconds()) < 2
    plan = _plan(r, pg_session)
    assert plan["held"] and plan["deadline"] == until                                    # the normal rule posts it then
    close = _request(pg_session, hours_to_pickup=1.5)
    with pytest.raises(HTTPException):
        pr.hold_to_last_window(pg_session, close)                                        # too close to pickup to hold


def test_pending_list_shows_when_confirmed_when_it_posts_and_what_the_driver_gets(pg_session):
    r = _request(pg_session)
    row = next(x for x in list_pending_website_bookings(pg_session) if x["id"] == r.id)
    assert row["confirmed_at"] is not None and row["auto_post_at"] is not None and "15 hrs" in row["rule_text"]
    assert row["latest_post_time"] == r.start_date_time - timedelta(hours=2)
    p = row["post_preview"]
    assert (p["cost_per_km"], p["extra_cost_per_km"], p["driver_allowance"], p["extra_driver_allowance"]) == (15, 1, 300, 100)   # driver tariff split


def test_customize_posts_exactly_the_staff_numbers_and_keeps_the_customer_total(pg_session):
    r = _request(pg_session)
    admin = type("A", (), {"id": None, "username": "t", "role": "Owner"})()
    out = wbs.customize(r.id, wbs.CustomizeBody(cost_per_km=14, extra_cost_per_km=2, driver_allowance=350, extra_driver_allowance=50), pg_session, admin)
    assert out["customer_total"] == r.quoted_total_amount                                 # only moved money between driver and extra
    p = out["post_preview"]
    assert (p["cost_per_km"], p["extra_cost_per_km"], p["driver_allowance"], p["extra_driver_allowance"]) == (14, 2, 350, 50) and r.custom_driver_fare
    out = wbs.customize(r.id, wbs.CustomizeBody(reset=True), pg_session, admin)
    assert not r.custom_driver_fare and out["post_preview"]["cost_per_km"] == 15         # back to the driver tariff


def test_a_booking_quoted_from_the_backend_rate_card_is_repaired_with_the_fare_the_customer_confirmed(pg_session):
    from app.crud.website_quote import apply_quote_to_request
    from app.crud.customer_booking_request import posted_fare_split
    r = _request(pg_session, quoted_cost_per_km=14, quoted_driver_allowance=300, quoted_total_amount=2540, quoted_driver_amount=2540)
    assert posted_fare_split(pg_session, r)["cost_per_km"] == 14                                    # what Admin App showed: 14 | 0, 300 | 0
    assert apply_quote_to_request(r, {"per_km_rate": 15, "driver_bata": 400, "billable_km": 160, "total_fare": 2800})
    p = posted_fare_split(pg_session, r)
    assert (p["cost_per_km"], p["extra_cost_per_km"], p["driver_allowance"], p["extra_driver_allowance"]) == (15, 0, 300, 100)   # 15 | 0, 300 | 100
    assert r.quoted_total_amount == 2800


def test_the_repair_never_touches_an_edited_or_posted_booking(pg_session):
    from app.crud.website_quote import apply_quote_to_request
    q = {"per_km_rate": 15, "driver_bata": 400, "billable_km": 160, "total_fare": 2800}
    edited = _request(pg_session, quoted_cost_per_km=14, quoted_driver_allowance=300, quoted_total_amount=2540, admin_total_amount=2600)
    assert not apply_quote_to_request(edited, q) and edited.quoted_total_amount == 2540
    done = _request(pg_session, quoted_cost_per_km=14, quoted_driver_allowance=300, quoted_total_amount=2540, status="APPROVED")
    assert not apply_quote_to_request(done, q)
    crazy = _request(pg_session, quoted_cost_per_km=14, quoted_driver_allowance=300, quoted_total_amount=2540)
    assert not apply_quote_to_request(crazy, {**q, "total_fare": 90000})                             # nonsense numbers are ignored


def test_customize_full_edits_details_and_fare_but_not_the_booking_identity(pg_session):
    r = _request(pg_session)
    before = (r.id, r.status, r.source)
    body = wbs.CustomizeFullBody(customer_name="  Ravi Kumar ", customer_number="9876543210", pickup="Tambaram", drop="Madurai", trip_type="round trip", car_type="innova",
                                 trip_distance=420, cost_per_km=14, driver_allowance=300, hill_charges=300, toll_charges=250, advance_amount=800)
    out = wbs.customize_full(r.id, body, db=pg_session, current_admin=type("A", (), {"id": uuid.uuid4(), "username": "t", "role": "Owner"})())
    assert (r.id, r.status, r.source) == before
    assert r.customer_name == "Ravi Kumar" and r.customer_number == "9876543210" and r.trip_type == "Round Trip" and r.car_type == "INNOVA"
    assert r.pickup_drop_location == {"0": "Tambaram", "1": "Madurai"} and r.quoted_trip_distance == 420 and r.advance_amount == 800
    assert r.admin_hill_charges == 300 and r.admin_toll_charges == 250 and r.admin_cost_per_km == 14 and r.custom_driver_fare is True
    # fixing the customer total by hand wins over the computed one
    out = wbs.customize_full(r.id, wbs.CustomizeFullBody(customer_total=7777), db=pg_session, current_admin=type("A", (), {"id": uuid.uuid4(), "username": "t", "role": "Owner"})())
    assert out["customer_total"] == 7777
    with pytest.raises(HTTPException):
        wbs.customize_full(r.id, wbs.CustomizeFullBody(car_type="SPACESHIP"), db=pg_session, current_admin=type("A", (), {"id": uuid.uuid4(), "username": "t", "role": "Owner"})())
    with pytest.raises(HTTPException):
        wbs.customize_full(r.id, wbs.CustomizeFullBody(trip_type="teleport"), db=pg_session, current_admin=type("A", (), {"id": uuid.uuid4(), "username": "t", "role": "Owner"})())


def test_customize_full_time_change_alone_does_not_freeze_the_driver_tariff(pg_session):
    r = _request(pg_session)
    new_time = datetime.now(timezone.utc) + timedelta(hours=200)
    wbs.customize_full(r.id, wbs.CustomizeFullBody(start_date_time=new_time), db=pg_session, current_admin=type("A", (), {"id": uuid.uuid4(), "username": "t", "role": "Owner"})())
    assert r.start_date_time == new_time and r.custom_driver_fare is False and r.admin_cost_per_km is None
