"""Local Drop minimum coverage (owner 2026-10-14): like the 130 km one-way minimum, a short in-city Local Drop is billed for at least 20 km by
default (Admin App > Fare Rules), and the figure can be changed for one booking."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.core.security import create_access_token
from app.crud.local_drop import local_min_item, local_min_km
from app.models.admin import Admin
from app.utils.fare_rules import DEFAULT_FARE_RULES


def test_default_is_twenty_and_a_booking_remembers_its_own():
    assert DEFAULT_FARE_RULES["local_drop_min_km"] == 20
    assert local_min_km(None, 20) == 20 and local_min_km([{"label": "x"}], 20) == 20
    assert local_min_km([local_min_item(12)], 20) == 12                    # the booking's own figure wins over the setting
    assert "12 km" in local_min_item(12)["label"]


def test_quote_raises_a_short_local_trip_to_the_minimum_but_leaves_longer_ones(monkeypatch):
    from app.crud import new_orders
    local = SimpleNamespace(value="Local")
    oneway = SimpleNamespace(value="Oneway")
    monkeypatch.setattr(new_orders, "get_distance_km_between_locations", lambda a, b: (12.0, "25 min"))
    short = new_orders.calculate_oneway_fare({"0": "A", "1": "B"}, 25, 0, 0, 0, 0, 0, 0, 0, 0, local)
    assert short["total_km"] == 20 and short["remark_trip_min_km"] == 12 and short["base_km_amount"] == 20 * 25
    monkeypatch.setattr(new_orders, "get_distance_km_between_locations", lambda a, b: (35.0, "50 min"))
    long = new_orders.calculate_oneway_fare({"0": "A", "1": "B"}, 25, 0, 0, 0, 0, 0, 0, 0, 0, local)
    assert long["total_km"] == 35 and long["remark_trip_min_km"] == 0
    monkeypatch.setattr(new_orders, "get_distance_km_between_locations", lambda a, b: (12.0, "25 min"))
    assert new_orders.calculate_oneway_fare({"0": "A", "1": "B"}, 14, 0, 0, 0, 0, 0, 0, 0, 0, oneway)["total_km"] == 130     # one-way rule untouched


def _auth(kind, account):
    v = getattr(account, "token_version", None)
    v = v if v is not None else (1 if kind == "admin" else 0)
    return {"Authorization": "Bearer " + create_access_token({"sub": str(account.id), "user": kind, "token_version": v})}


def test_a_short_local_trip_is_billed_for_the_minimum_at_close(pg_session, client_with_db, monkeypatch):
    from app.crud.end_records import update_end_trip_record
    from app.models.end_records import EndRecord
    from app.models.orders import Order
    from app.models.new_orders import NewOrder
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.car_driver import CarDriver
    db, c = pg_session, client_with_db
    phone = lambda: "9" + str(uuid.uuid4().int)[:9]
    admin = Admin(username=f"owner-{uuid.uuid4().hex[:6]}", password="x", role="Owner", phone=phone(), email="o@o.o")
    db.add(admin)
    db.flush()
    monkeypatch.setattr("app.crud.new_orders.get_distance_km_between_locations", lambda a, b: (8.0, "20 min"))
    monkeypatch.setattr("app.utils.serviceable_cities.is_city_serviceable", lambda db, city: True)
    base = {"trip_type": "Local", "car_type": "SEDAN_4_PLUS_1", "pickup_drop_location": {"0": "Jafferkhanpet", "1": "Chennai Airport"},
            "start_date_time": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(), "customer_name": "Mr Ravi", "customer_number": "9000011111",
            "cost_per_km": 25, "driver_allowance": 0, "send_to": "ALL", "max_time_to_assign_order": 30, "toll_charge_update": False,
            "local_km_limit": 50}

    def post(extra=None):
        r = c.post("/api/admin/orders/oneway/confirm", headers=_auth("admin", admin), json={**base, **(extra or {})})
        assert r.status_code == 201, r.text
        return r.json()["order_id"]

    def close(order_id, km):
        owner = VehicleOwnerCredentials(primary_number=phone(), hashed_password="x")
        db.add(owner)
        db.flush()
        db.add(VehicleOwnerDetails(vehicle_owner_id=owner.id, full_name="Fleet", primary_number=owner.primary_number, aadhar_number="A" + str(uuid.uuid4().int)[:11],
                                   address="x", city="Chennai", pincode="600001", wallet_balance=5000))
        drv = CarDriver(vehicle_owner_id=owner.id, full_name="D", primary_number=phone(), hashed_password="x", licence_number="TN" + uuid.uuid4().hex[:12],
                        address="a", city="Chennai", pincode="600001")
        db.add(drv)
        db.flush()
        db.add(OrderAssignment(order_id=order_id, vehicle_owner_id=owner.id, driver_id=drv.id, assignment_status=AssignmentStatusEnum.ASSIGNED,
                               assigned_at=datetime.utcnow(), held_amount=0))
        db.add(EndRecord(order_id=order_id, driver_id=drv.id, start_km=500, end_km=0, contact_number="x", img_url="x"))
        db.flush()
        asyncio.run(update_end_trip_record(db, order_id, str(drv.id), 500 + km, distance_reason="short local trip"))
        return db.query(Order).filter(Order.id == order_id).first()

    # default: 8 km driven, 20 km billed
    first = post()
    new = db.query(NewOrder).filter(NewOrder.order_id == db.query(Order).filter(Order.id == first).first().source_order_id).first()
    assert any(i.get("key") == "local_min_km" and i["min_km"] == 20 for i in new.charge_items)
    assert new.trip_distance == 20
    done = close(first, 8)
    assert done.closing_breakdown["itemised_total"] == 20 * 25        # the customer's total also carries the Rs 30 convenience fee
    assert done.closing_breakdown["km_billed"] == 20 and done.closing_breakdown["min_km_floor"] == 20
    # longer than the minimum: billed on the real km
    second = post()
    assert close(second, 33).closing_breakdown["itemised_total"] == 33 * 25
    # edited for one booking: the km typed on the form is that booking's minimum
    third = post({"km_override": 10})
    new3 = db.query(NewOrder).filter(NewOrder.order_id == db.query(Order).filter(Order.id == third).first().source_order_id).first()
    assert any(i.get("key") == "local_min_km" and i["min_km"] == 10 for i in new3.charge_items)
    assert close(third, 6).closing_breakdown["itemised_total"] == 10 * 25
