"""Admin > Driver lookup: the city dropdown comes from the cities drivers / fleet owners marked vacant, and a city lists those vehicles."""
import uuid

import pytest
from fastapi import HTTPException

from app.api.routes import driver_ops as ops


def _owner(db, **vacant):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    phone = "9" + str(uuid.uuid4().int)[:9]
    cred = VehicleOwnerCredentials(primary_number=phone, hashed_password="x")
    db.add(cred)
    db.flush()
    d = VehicleOwnerDetails(vehicle_owner_id=cred.id, full_name="Fleet " + phone[-4:], primary_number=phone, aadhar_number="A" + str(uuid.uuid4().int)[:11],
                            address="x", city="Salem", pincode="600001", wallet_balance=0, **vacant)
    db.add(d)
    db.flush()
    return d


def test_cities_list_counts_every_vacant_vehicle(pg_session):
    _owner(pg_session, vacant_fleet_entries=[
        {"car_number": "TN01AB1111", "car_type": "SEDAN_4_PLUS_1", "driver_name": "Ravi", "cities": ["Zzcity", "Yycity"], "updated_at": "2026-10-05T10:00:00+00:00"},
        {"car_number": "TN01AB2222", "driver_name": "Kumar", "cities": ["Zzcity"]},
    ])
    _owner(pg_session, vacant_cities=["Zzcity"], vacant_driver_name="Old Style", vacant_car_number="TN09ZZ0001")
    got = {c["city"]: c["count"] for c in ops.vacant_cities(None, pg_session)}
    assert got["Zzcity"] == 3 and got["Yycity"] == 1


def test_city_search_lists_the_vacant_vehicles_there_even_for_part_of_the_name(pg_session):
    o = _owner(pg_session, vacant_fleet_entries=[{"car_number": "TN01AB1111", "driver_name": "Ravi", "cities": ["Zzcity"], "updated_at": "2026-10-05T10:00:00+00:00"}])
    rows = ops.search_drivers(q=None, city="zzci", type="all", driver_type=None, include_home=False, current_admin=None, db=pg_session)
    mine = [r for r in rows if r["fleet_driver_name"] == o.full_name]
    assert len(mine) == 1 and mine[0]["name"] == "Ravi" and mine[0]["car_number"] == "TN01AB1111" and mine[0]["matched_city"] == "Zzcity"
    assert [r for r in ops.search_drivers(q="ravi", city="zzcity", type="all", driver_type=None, include_home=False, current_admin=None, db=pg_session) if r["fleet_driver_name"] == o.full_name]
    assert not [r for r in ops.search_drivers(q="nobody", city="zzcity", type="all", driver_type=None, include_home=False, current_admin=None, db=pg_session) if r["fleet_driver_name"] == o.full_name]


def test_search_without_a_city_still_needs_two_letters(pg_session):
    with pytest.raises(HTTPException) as e:
        ops.search_drivers(q="a", city=None, type="all", driver_type=None, include_home=False, current_admin=None, db=pg_session)
    assert e.value.status_code == 422


def test_the_admin_app_filters_with_driver_type_and_typing_a_place_finds_vacant_vehicles(pg_session):
    o = _owner(pg_session, vacant_fleet_entries=[{"car_number": "TN01AB9999", "driver_name": "Muthu", "cities": ["Qqtown"], "updated_at": "2026-10-05T10:00:00+00:00"}])
    rows = ops.search_drivers(q=None, city="Qqtown", type="all", driver_type="FLEET", include_home=False, current_admin=None, db=pg_session)
    assert [r for r in rows if r["fleet_driver_name"] == o.full_name and r["is_owner_driver"] and r["city"] == "Qqtown"]
    rows = ops.search_drivers(q=None, city="Qqtown", type="all", driver_type="DUTY", include_home=False, current_admin=None, db=pg_session)
    assert not [r for r in rows if r["fleet_driver_name"] == o.full_name and r["kind"] == "FLEET" and not r.get("fleet_phone")]
    typed = ops.search_drivers(q="qqto", city=None, type="all", driver_type=None, include_home=False, current_admin=None, db=pg_session)
    assert [r for r in typed if r["fleet_driver_name"] == o.full_name]
