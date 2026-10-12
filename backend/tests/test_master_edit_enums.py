"""Admin App > Customize Booking (edit mode) sends 'oneway' / local times: the server must understand them (the save failed with an enum error)."""
from datetime import datetime, timedelta, timezone

import pytest

from app.crud.orders import admin_master_edit_order, _trip_type_enum, _car_type_enum


def _order(db):
    from app.models.orders import Order, OrderSourceEnum, Trip_status
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    o = Order(source=OrderSourceEnum.NEW_ORDERS, source_order_id=0, trip_type=OrderTypeEnum.ROUND_TRIP, car_type=CarTypeEnum.SUV, pickup_drop_location={"0": "A", "1": "B"},
              start_date_time=datetime.now(timezone.utc) + timedelta(days=1), customer_name="K", customer_number="9000000001", trip_status=Trip_status.PENDING,
              estimated_price=1000, vendor_price=1100)
    db.add(o)
    db.flush()
    return o


@pytest.mark.parametrize("raw,name", [("oneway", "ONEWAY"), ("Oneway", "ONEWAY"), ("ONE_WAY", "ONEWAY"), ("roundtrip", "ROUND_TRIP"), ("Round Trip", "ROUND_TRIP"),
                                       ("multicity", "MULTY_CITY"), ("Multy City", "MULTY_CITY"), ("hourly", "HOURLY_RENTAL"), ("local", "LOCAL")])
def test_trip_type_words_of_the_app_map_to_the_enum(raw, name):
    assert _trip_type_enum(raw).name == name


def test_car_type_and_bad_values():
    assert _car_type_enum("SEDAN_4_PLUS_1").name == "SEDAN_4_PLUS_1"
    with pytest.raises(ValueError):
        _trip_type_enum("spaceship")
    with pytest.raises(ValueError):
        _car_type_enum("tractor")


def test_master_edit_with_the_apps_words_and_a_local_time(pg_session):
    o = _order(pg_session)
    out = admin_master_edit_order(pg_session, o.id, {"trip_type": "oneway", "car_type": "SEDAN_4_PLUS_1", "start_date_time": datetime(2026, 10, 12, 10, 6)})
    assert out.trip_type.name == "ONEWAY" and out.car_type.name == "SEDAN_4_PLUS_1"
    assert out.start_date_time.astimezone(timezone.utc).hour == 4 and out.start_date_time.astimezone(timezone.utc).minute == 36      # 10:06 IST = 04:36 UTC
