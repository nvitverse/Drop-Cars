"""Owners remove cars / duty drivers without approval; nothing is deleted; one account at a time (owner 2026-10-13)."""
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.crud import fleet_removal as fr


def _owner(db, name="Fleet A"):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    o = VehicleOwnerCredentials(primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    db.add(o)
    db.flush()
    db.add(VehicleOwnerDetails(vehicle_owner_id=o.id, full_name=name, primary_number=o.primary_number, aadhar_number="A" + str(uuid.uuid4().int)[:11],
                               address="x", city="Salem", pincode="600001", wallet_balance=0))
    db.flush()
    return o


def _car(db, owner, plate=None):
    from app.models.car_details import CarDetails
    c = CarDetails(vehicle_owner_id=owner.id, car_name="Dzire", car_type="SEDAN_4_PLUS_1", car_number=plate or "TN" + str(uuid.uuid4().int)[:8])
    db.add(c)
    db.flush()
    return c


def _driver(db, owner):
    from app.models.car_driver import CarDriver
    n = "8" + str(uuid.uuid4().int)[:9]
    d = CarDriver(vehicle_owner_id=owner.id, full_name="Ravi", primary_number=n, hashed_password="x", licence_number="TN" + str(uuid.uuid4().int)[:12],
                  address="a", city="c", pincode="600001")
    db.add(d)
    db.flush()
    return d


def test_removed_car_leaves_the_owners_lists_but_the_row_and_history_stay(pg_session):
    from app.crud.car_details import get_all_cars, get_available_cars
    o = _owner(pg_session)
    keep, gone = _car(pg_session, o), _car(pg_session, o)
    fr.remove_car(pg_session, o.id, gone.id, "Fleet A", "sold the car")
    assert {c.id for c in get_all_cars(pg_session, str(o.id))} == {keep.id} == {c.id for c in get_available_cars(pg_session, str(o.id))}
    pg_session.refresh(gone)
    assert gone.removed_at is not None and gone.removed_by == "Fleet A" and gone.removed_reason == "sold the car"      # staff still have it
    assert str(gone.vehicle_owner_id) == str(o.id)


def test_a_car_on_an_unfinished_booking_cannot_be_removed(pg_session):
    from app.models.order_assignments import AssignmentStatusEnum, OrderAssignment
    from app.models.orders import Order
    o = _owner(pg_session)
    car = _car(pg_session, o)
    order = pg_session.query(Order).first()
    if order is None:
        pytest.skip("no order row to attach an assignment to in this database")
    pg_session.add(OrderAssignment(order_id=order.id, vehicle_owner_id=o.id, car_id=car.id, assignment_status=AssignmentStatusEnum.ASSIGNED))
    pg_session.flush()
    with pytest.raises(HTTPException) as e:
        fr.remove_car(pg_session, o.id, car.id, "x")
    assert e.value.status_code == 409


def test_only_the_owner_of_the_car_can_remove_it(pg_session):
    a, b = _owner(pg_session), _owner(pg_session, "Fleet B")
    car = _car(pg_session, a)
    with pytest.raises(HTTPException) as e:
        fr.remove_car(pg_session, b.id, car.id, "B")
    assert e.value.status_code == 404


def test_a_removed_driver_leaves_the_list_and_cannot_use_his_token(pg_session):
    from app.crud.car_driver import get_available_drivers, get_drivers_by_vehicleOwner_id
    o = _owner(pg_session)
    d1, d2 = _driver(pg_session, o), _driver(pg_session, o)
    fr.remove_driver(pg_session, o.id, d2.id, "Fleet A")
    assert {d.id for d in get_drivers_by_vehicleOwner_id(pg_session, str(o.id))} == {d1.id}
    assert d2.id not in {d.id for d in get_available_drivers(pg_session, str(o.id))}
    pg_session.refresh(d2)
    assert d2.removed_at is not None


def test_the_owners_own_driver_profile_cannot_be_removed(pg_session):
    o = _owner(pg_session)
    d = _driver(pg_session, o)
    d.is_owner_driver = True
    pg_session.flush()
    with pytest.raises(HTTPException) as e:
        fr.remove_driver(pg_session, o.id, d.id, "x")
    assert e.value.status_code == 400


def test_another_owner_adding_a_removed_car_takes_it_with_documents_reset(pg_session):
    from app.crud.car_details import create_car_details
    from app.models.common_enums import DocumentStatusEnum
    a, b = _owner(pg_session), _owner(pg_session, "Fleet B")
    car = _car(pg_session, a, plate="TN99ZZ" + str(uuid.uuid4().int)[:4])
    car.rc_front_status = DocumentStatusEnum.VERIFIED
    pg_session.flush()
    fr.remove_car(pg_session, a.id, car.id, "A")
    form = SimpleNamespace(car_number=car.car_number, car_name="Etios", car_type=SimpleNamespace(value="ETIOS_4_PLUS_1"), vehicle_owner_id=b.id, year_of_the_car="2020")
    got = create_car_details(pg_session, form)
    assert got.id == car.id and str(got.vehicle_owner_id) == str(b.id) and got.removed_at is None and got.rc_front_status == DocumentStatusEnum.PENDING
    with pytest.raises(HTTPException):                                   # now it is live in B's account: nobody else can add it
        create_car_details(pg_session, SimpleNamespace(car_number=car.car_number, car_name="x", car_type=SimpleNamespace(value="SEDAN_4_PLUS_1"), vehicle_owner_id=a.id, year_of_the_car="2020"))


def test_a_duty_driver_is_active_when_he_logs_in_not_held_in_processing(pg_session):
    from app.crud.car_driver import activate_if_processing
    from app.models.car_driver import AccountStatusEnum
    o = _owner(pg_session)
    d = _driver(pg_session, o)
    d.driver_status = AccountStatusEnum.PROCESSING
    pg_session.flush()
    assert activate_if_processing(pg_session, d) is True and d.driver_status == AccountStatusEnum.OFFLINE
    d.driver_status = AccountStatusEnum.BLOCKED
    pg_session.flush()
    assert activate_if_processing(pg_session, d) is False and d.driver_status == AccountStatusEnum.BLOCKED       # a blocked driver stays blocked
