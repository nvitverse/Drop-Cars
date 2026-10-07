"""A customer cancelling their own booking from the app, and asking for the refund afterwards."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.api.routes import customer_bookings as cb
from app.models.customer import CustomerCredentials as Customer
from app.models.customer_booking_request import CustomerBookingRequest


def _booking(db, customer, status="PENDING", paid=True):
    r = CustomerBookingRequest(
        id=uuid.uuid4(), customer_id=customer.id, pickup_drop_location={"0": "Chennai", "1": "Madurai"}, trip_type="Oneway",
        car_type="SEDAN_4_PLUS_1", start_date_time=datetime.now(timezone.utc) + timedelta(days=2), customer_name="Test Cust",
        customer_number="9876500000", quoted_cost_per_km=15, quoted_driver_allowance=300, quoted_extra_driver_allowance=0,
        quoted_permit_charges=0, quoted_extra_permit_charges=0, quoted_hill_charges=0, quoted_toll_charges=0,
        quoted_extra_cost_per_km=0, quoted_night_charges=0, quoted_total_amount=9000, quoted_driver_amount=8000,
        quoted_trip_distance=450, quoted_trip_time="8h", status=status, is_paid=paid,
    )
    db.add(r)
    db.flush()
    return r


@pytest.fixture()
def customer(pg_session):
    c = Customer(id=uuid.uuid4(), primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    pg_session.add(c)
    pg_session.flush()
    return c


def test_cancel_pending_paid_booking_is_refundable_then_refund_requested(pg_session, customer):
    r = _booking(pg_session, customer)
    out = cb.cancel_my_booking(r.id, cb.CustomerCancelRequest(reason="plans changed"), db=pg_session, current_customer=customer)
    assert out == {"status": "CANCELLED", "refund_eligible": True}
    assert r.status == "REJECTED" and r.decided_by == "CUSTOMER"

    res = asyncio.run(cb.request_my_refund(r.id, db=pg_session, current_customer=customer))
    assert res["status"] == "REQUESTED" and r.refund_status == "REQUESTED"
    with pytest.raises(HTTPException) as e:
        asyncio.run(cb.request_my_refund(r.id, db=pg_session, current_customer=customer))
    assert e.value.status_code == 400


def test_unpaid_booking_cancels_without_refund(pg_session, customer):
    r = _booking(pg_session, customer, paid=False)
    out = cb.cancel_my_booking(r.id, cb.CustomerCancelRequest(), db=pg_session, current_customer=customer)
    assert out["refund_eligible"] is False
    with pytest.raises(HTTPException):
        asyncio.run(cb.request_my_refund(r.id, db=pg_session, current_customer=customer))


def test_cannot_cancel_someone_elses_booking(pg_session, customer):
    other = Customer(id=uuid.uuid4(), primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    pg_session.add(other)
    pg_session.flush()
    r = _booking(pg_session, other)
    with pytest.raises(HTTPException) as e:
        cb.cancel_my_booking(r.id, cb.CustomerCancelRequest(), db=pg_session, current_customer=customer)
    assert e.value.status_code == 404
