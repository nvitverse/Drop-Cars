"""A booking posted by a registered website (e.g. Southern Drop Taxi) carries the website's own booking reference, and the Admin App's pending
queue says which website it came from (owner, 2026-10-16: SDT enquiries are SDTE..., confirmed bookings SDTC...)."""
import uuid
from datetime import datetime, timedelta, timezone


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


def test_pending_queue_names_the_website_and_the_websites_booking_id(pg_session):
    from app.models.website_integration import WebsiteIntegration
    from app.crud.website_booking_approvals import list_pending_website_bookings

    site = WebsiteIntegration(name="Southern Drop Taxi", api_key=uuid.uuid4().hex, is_active=True)
    pg_session.add(site)
    pg_session.flush()
    mine = _request(pg_session, source_website_id=site.id, external_booking_id="SDTC26101601")
    legacy = _request(pg_session)                                                   # the original website (no integration row, no reference)

    rows = {str(r["id"]): r for r in list_pending_website_bookings(pg_session)}
    assert rows[str(mine.id)]["source_website_name"] == "Southern Drop Taxi"
    assert rows[str(mine.id)]["external_booking_id"] == "SDTC26101601"
    assert rows[str(legacy.id)]["source_website_name"] is None
    assert rows[str(legacy.id)]["external_booking_id"] is None


def test_the_booking_reference_is_cleaned_before_it_is_stored():
    from app.api.routes.website_bookings import WebsiteBookingCreate

    base = dict(customer_name="A", customer_number="9999900000", pickup_drop_location=["Chennai", "Madurai"], trip_type="Oneway",
                car_type="SEDAN_4_PLUS_1", start_date_time="2026-10-20T10:00:00+05:30")
    assert WebsiteBookingCreate(**base, external_booking_id="SDTC26101601").external_booking_id == "SDTC26101601"
    assert WebsiteBookingCreate(**base, external_booking_id="  sdtc 2610<b>1601 ").external_booking_id == "sdtc2610b1601"   # only letters, digits, - and _
    assert WebsiteBookingCreate(**base, external_booking_id="x" * 80).external_booking_id == "x" * 40
    assert WebsiteBookingCreate(**base, external_booking_id="").external_booking_id is None
    assert WebsiteBookingCreate(**base).external_booking_id is None
