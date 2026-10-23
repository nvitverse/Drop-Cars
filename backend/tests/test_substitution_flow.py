"""'Request for my car': a fleet without the exact vehicle type asks to do a booking with another car. The poster (vendor / fleet owner) or any
admin approves; approval is a PASS - the normal wallet hold still applies (accept at once if the wallet covers it, else the driver is told
how much to recharge and accepts afterwards)."""
import asyncio
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException


def _owner(db, balance):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    phone = "9" + str(uuid.uuid4().int)[:9]
    cred = VehicleOwnerCredentials(primary_number=phone, hashed_password="x")
    db.add(cred)
    db.flush()
    d = VehicleOwnerDetails(vehicle_owner_id=cred.id, full_name="Fleet " + phone[-4:], primary_number=phone, aadhar_number=str(uuid.uuid4().int)[:12],
                            address="x", city="Chennai", pincode="600001", wallet_balance=balance)
    db.add(d)
    db.flush()
    return cred, d


def _car(db, owner_id, car_type="HATCHBACK"):
    from app.models.car_details import CarDetails, CarTypeEnum
    c = CarDetails(vehicle_owner_id=owner_id, car_name="Dzire", car_type=CarTypeEnum[car_type], car_number="TN" + str(uuid.uuid4().int)[:8])
    db.add(c)
    db.flush()
    return c


def _driver(db, owner_id):
    from app.models.car_driver import CarDriver
    d = CarDriver(vehicle_owner_id=owner_id, full_name="Ravi", primary_number="8" + str(uuid.uuid4().int)[:9], hashed_password="x",
                  licence_number="TN" + str(uuid.uuid4().int)[:12], address="a", city="c", pincode="600001")
    db.add(d)
    db.flush()
    return d


def _order(db, poster_owner_id=None, vendor_id=None, car_type="SEDAN_4_PLUS_1"):
    from app.models.orders import Order, Trip_status, OrderSourceEnum
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    o = Order(source=OrderSourceEnum.HOURLY_RENTAL, source_order_id=0, trip_type=OrderTypeEnum.ONEWAY, car_type=CarTypeEnum[car_type],
              pickup_drop_location={"0": "Chennai", "1": "Vellore"}, start_date_time=datetime.utcnow() + timedelta(hours=30),
              customer_name="T", customer_number="9000000000", trip_status=Trip_status.PENDING, estimated_price=2000, vendor_price=2300,
              posted_by_vehicle_owner_id=poster_owner_id, vendor_id=vendor_id)
    db.add(o)
    db.flush()
    return o


def _fleet(db, balance):
    cred, det = _owner(db, balance)
    return cred, det, _car(db, cred.id), _driver(db, cred.id)


def test_request_with_a_bad_driver_id_still_works_for_a_one_driver_fleet(pg_session):
    from app.crud.vehicle_matching import create_substitution_request
    cred, det, car, drv = _fleet(pg_session, 0)
    order = _order(pg_session)
    for bad in ("1", "", "not-a-uuid"):
        req = create_substitution_request(pg_session, order.id, str(cred.id), str(car.id), bad)
        assert str(req.driver_id) == str(drv.id)
        pg_session.query(type(req)).delete()


def test_two_drivers_and_no_choice_is_a_clear_error(pg_session):
    from app.crud.vehicle_matching import create_substitution_request
    cred, det, car, drv = _fleet(pg_session, 0)
    _driver(pg_session, cred.id)
    with pytest.raises(ValueError) as e:
        create_substitution_request(pg_session, _order(pg_session).id, str(cred.id), str(car.id), "1")
    assert "Choose which of your drivers" in str(e.value)


def test_approval_with_a_short_wallet_is_a_pass_that_says_how_much_to_recharge(pg_session):
    from app.crud.vehicle_matching import create_substitution_request, decide_substitution_request, substitution_pass
    from app.crud.accept_hold import compute_accept_hold
    from app.models.order_assignments import OrderAssignment

    cred, det, car, drv = _fleet(pg_session, 100)
    order = _order(pg_session)
    hold = compute_accept_hold(pg_session, order)[0]
    req = create_substitution_request(pg_session, order.id, str(cred.id), str(car.id), str(drv.id))
    assert substitution_pass(pg_session, order.id, str(cred.id)) is None                       # pending is not a pass
    req = decide_substitution_request(pg_session, req.id, True, None, None, decider_kind="POSTER", decider_name="Vendor X")
    assert req.status.value == "APPROVED" and req.required_hold == hold and req.funds_needed == hold - 100 and hold > 100
    assert req.decided_by_kind == "POSTER"
    assert pg_session.query(OrderAssignment).filter(OrderAssignment.order_id == order.id).count() == 0     # nothing assigned yet, no hold skipped
    assert substitution_pass(pg_session, order.id, str(cred.id)).id == req.id


def test_approval_with_enough_wallet_accepts_and_assigns_at_once_and_takes_the_hold(pg_session):
    from app.crud.accept_hold import compute_accept_hold
    from app.crud.vehicle_matching import create_substitution_request
    from app.models.order_assignments import OrderAssignment
    from app.services.substitution_flow import approve_and_accept

    cred, det, car, drv = _fleet(pg_session, 5000)
    order = _order(pg_session)
    hold = compute_accept_hold(pg_session, order)[0]
    req = create_substitution_request(pg_session, order.id, str(cred.id), str(car.id), str(drv.id))
    pg_session.commit()
    req, auto, message = asyncio.run(approve_and_accept(pg_session, req.id, None, "ADMIN", "tester", None))
    assert auto is True and req.funds_needed == 0 and "assigned" in message.lower()
    a = pg_session.query(OrderAssignment).filter(OrderAssignment.order_id == order.id).one()
    assert str(a.car_id) == str(car.id) and str(a.driver_id) == str(drv.id) and a.held_amount == hold
    pg_session.refresh(det)
    assert det.wallet_balance == 5000 - hold                                                  # the normal hold was taken
    pg_session.refresh(req)
    assert req.assignment_id == a.id                                                          # the pass is used up


def test_after_recharging_the_driver_accepts_the_normal_way_through_the_pass(pg_session):
    from app.api.routes.order_assignments import accept_order
    from app.crud.accept_hold import compute_accept_hold
    from app.crud.vehicle_matching import create_substitution_request, decide_substitution_request
    from app.schemas.order_assignments import OrderAssignmentCreate

    cred, det, car, drv = _fleet(pg_session, 50)
    order = _order(pg_session)
    hold = compute_accept_hold(pg_session, order)[0]
    req = create_substitution_request(pg_session, order.id, str(cred.id), str(car.id), str(drv.id))
    decide_substitution_request(pg_session, req.id, True, None, None, decider_kind="ADMIN", decider_name="a")
    pg_session.commit()
    with pytest.raises(HTTPException) as e:                                                   # still short: the wallet rule is NOT skipped
        asyncio.run(accept_order(OrderAssignmentCreate(order_id=order.id), db=pg_session, current_user=det))
    assert "Insufficient wallet balance" in str(e.value.detail)
    det.wallet_balance = hold + 10
    pg_session.commit()
    a = asyncio.run(accept_order(OrderAssignmentCreate(order_id=order.id), db=pg_session, current_user=det))   # no VEHICLE_TYPE_MISMATCH any more
    assert a.order_id == order.id
    pg_session.refresh(det)
    assert det.wallet_balance == 10


def test_without_an_approval_the_vehicle_gate_still_stops_him(pg_session):
    from app.api.routes.order_assignments import accept_order
    from app.schemas.order_assignments import OrderAssignmentCreate

    cred, det, car, drv = _fleet(pg_session, 9999)
    order = _order(pg_session)
    pg_session.commit()
    with pytest.raises(HTTPException) as e:
        asyncio.run(accept_order(OrderAssignmentCreate(order_id=order.id), db=pg_session, current_user=det))
    assert isinstance(e.value.detail, dict) and e.value.detail["error"] == "VEHICLE_TYPE_MISMATCH"


def test_only_the_poster_can_decide_and_the_office_can_for_everything(pg_session):
    from app.api.routes.substitution_poster import approve_my_booking_request, Decision
    from app.crud.vehicle_matching import create_substitution_request

    poster_cred, poster_det = _owner(pg_session, 0)
    stranger_cred, stranger_det = _owner(pg_session, 0)
    cred, det, car, drv = _fleet(pg_session, 100)
    order = _order(pg_session, poster_owner_id=poster_cred.id)
    req = create_substitution_request(pg_session, order.id, str(cred.id), str(car.id), str(drv.id))
    pg_session.commit()
    with pytest.raises(HTTPException) as e:
        asyncio.run(approve_my_booking_request(req.id, Decision(), db=pg_session, current_user=stranger_det))
    assert e.value.status_code == 403
    out = asyncio.run(approve_my_booking_request(req.id, Decision(), db=pg_session, current_user=poster_det))
    assert out["status"] == "approved" and out["funds_needed"] > 0 and out["assigned"] is False
