"""Owner rules of 2026-10-14: a trip is never closed by a timer, a no-show is confirmed by a person, a penalised booking waits for approval,
a closed trip's km can be corrected with the commission difference posted to the wallets - and the rate limit counts per account, not per
Google front end."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.core.security import create_access_token
from app.models.admin import Admin


# ---------------------------------------------------------------- rate limit key
def test_rate_limit_counts_each_signed_in_driver_separately():
    from app.core.limiter import client_key

    def req(headers):
        return SimpleNamespace(headers=headers, client=SimpleNamespace(host="169.254.1.1"))

    a = create_access_token({"sub": "driver-a", "user": "driver"})
    b = create_access_token({"sub": "driver-b", "user": "driver"})
    assert client_key(req({"authorization": f"Bearer {a}"})) != client_key(req({"authorization": f"Bearer {b}"}))
    # not signed in: the real client address Google appends, never the shared front-end address
    assert client_key(req({"x-forwarded-for": "10.0.0.9, 49.37.1.2"})) == "49.37.1.2"
    assert client_key(req({"authorization": "Bearer not-a-token", "x-forwarded-for": "49.37.1.2"})) == "49.37.1.2"


# ---------------------------------------------------------------- fixtures
def _phone():
    return "9" + str(uuid.uuid4().int)[:9]


def _admin(db):
    a = Admin(username=f"owner-{uuid.uuid4().hex[:6]}", password="x", role="Owner", phone=_phone(), email="o@o.o")
    db.add(a)
    db.flush()
    return a


def _auth(kind, account):
    v = getattr(account, "token_version", None)
    v = v if v is not None else (1 if kind == "admin" else 0)
    return {"Authorization": "Bearer " + create_access_token({"sub": str(account.id), "user": kind, "token_version": v})}


def _assigned_order(db, pickup_hours_ago=30, held=500):
    """An order with a driver + car assigned, a held amount in the owner's wallet, and no start record."""
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.car_driver import CarDriver
    from app.models.orders import Order, OrderSourceEnum, Trip_status
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.crud.wallet import credit_wallet, debit_wallet

    from app.models.vehicle_owner_details import VehicleOwnerDetails
    owner = VehicleOwnerCredentials(primary_number=_phone(), hashed_password="x")
    db.add(owner)
    db.flush()
    db.add(VehicleOwnerDetails(vehicle_owner_id=owner.id, full_name="Fleet", primary_number=owner.primary_number, aadhar_number="A" + str(uuid.uuid4().int)[:11],
                               address="x", city="Chennai", pincode="600001", wallet_balance=0))
    db.flush()
    driver = CarDriver(vehicle_owner_id=owner.id, full_name="Chella", primary_number=_phone(), hashed_password="x",
                       licence_number="TN" + uuid.uuid4().hex[:12], address="a", city="Dharmapuri", pincode="636701")
    order = Order(source=OrderSourceEnum.NEW_ORDERS, source_order_id=0, trip_type=OrderTypeEnum.ONEWAY, car_type=CarTypeEnum.HATCHBACK,
                  pickup_drop_location={"0": "Dharmapuri", "1": "Bengaluru"}, start_date_time=datetime.now(timezone.utc) - timedelta(hours=pickup_hours_ago),
                  customer_name="Cust", customer_number="9000000000", trip_status=Trip_status.PENDING)
    db.add_all([driver, order])
    db.flush()
    credit_wallet(db, str(owner.id), 2000, str(order.id), "TEST_TOPUP", "test")
    debit_wallet(db, str(owner.id), held, str(order.id), "TRIP_HOLD", "held for the booking")
    a = OrderAssignment(order_id=order.id, vehicle_owner_id=owner.id, driver_id=driver.id, assignment_status=AssignmentStatusEnum.ASSIGNED,
                        assigned_at=datetime.utcnow(), held_amount=held)
    db.add(a)
    db.flush()
    return owner, driver, order, a


# ---------------------------------------------------------------- never closed by a timer
def test_a_trip_that_never_started_is_alerted_again_every_day_and_never_closed(pg_session, monkeypatch):
    from app.crud import trip_exceptions as tx
    from app.crud.wallet import get_owner_balance
    owner, driver, order, a = _assigned_order(pg_session, pickup_hours_ago=30)
    told = []
    async def fake_admins(db, title, body): told.append(("admin", title))
    async def fake_driver(db, order_id, title, body): told.append(("driver", title))
    monkeypatch.setattr(tx, "_tell_admins", fake_admins)
    monkeypatch.setattr(tx, "_tell_driver_and_owner", fake_driver)
    monkeypatch.setattr(tx, "_tell_poster", lambda db, order, title, body: told.append(("poster", title)))
    before = get_owner_balance(pg_session, str(owner.id))

    assert asyncio.run(tx.alert_no_start_assignments(pg_session)) >= 1
    pg_session.refresh(order); pg_session.refresh(a)
    assert str(order.trip_status.value if hasattr(order.trip_status, "value") else order.trip_status) == "PENDING"
    assert str(a.assignment_status.value if hasattr(a.assignment_status, "value") else a.assignment_status) == "ASSIGNED"
    assert a.no_start_alerted_at is not None
    assert get_owner_balance(pg_session, str(owner.id)) == before            # no money moved
    assert {w for w, _ in told} == {"admin", "poster", "driver"}
    assert asyncio.run(tx.alert_no_start_assignments(pg_session)) == 0       # not again the same day
    # ... but a day later, still unstarted: the office and the driver are told again (the poster only the first time)
    from datetime import datetime, timedelta
    a.no_start_alerted_at = datetime.utcnow() - timedelta(hours=25)
    pg_session.flush()
    told.clear()
    assert asyncio.run(tx.alert_no_start_assignments(pg_session)) >= 1
    assert {w for w, _ in told} == {"admin", "driver"}
    assert str(order.trip_status.value if hasattr(order.trip_status, "value") else order.trip_status) == "PENDING"   # still never closed by a timer
    listing = tx.attention_list(pg_session)
    assert order.id in [x["order_id"] for x in listing["not_started"]]


def test_the_old_auto_complete_is_gone():
    import app.crud.order_assignments as oa
    assert not hasattr(oa, "complete_no_start_assignments")


# ---------------------------------------------------------------- no-show
def test_no_show_is_requested_by_the_driver_and_confirmed_by_the_office(pg_session, client_with_db, monkeypatch):
    from app.crud import trip_exceptions as tx
    from app.crud.wallet import get_owner_balance
    c = client_with_db
    async def quiet(*args, **kw): return None
    monkeypatch.setattr(tx, "_tell_admins", quiet)
    monkeypatch.setattr(tx, "_tell_driver_and_owner", quiet)
    monkeypatch.setattr(tx, "_tell_driver_and_owner_after_close", quiet)
    monkeypatch.setattr(tx, "_tell_poster", lambda *a, **k: None)
    owner, driver, order, a = _assigned_order(pg_session, pickup_hours_ago=1, held=500)
    admin = _admin(pg_session)

    # the driver can ask, but the request alone changes nothing
    r = c.post(f"/api/orders/driver/{order.id}/no-show-request", headers=_auth("driver", driver), json={"reason": "customer cancelled on phone"})
    assert r.status_code == 200, r.text
    pg_session.refresh(order)
    assert str(getattr(order.trip_status, "value", order.trip_status)) == "PENDING"
    assert c.post(f"/api/orders/driver/{order.id}/no-show-request", headers=_auth("driver", driver), json={"reason": "x"}).status_code == 422
    waiting = c.get("/api/admin/attention/trips", headers=_auth("admin", admin)).json()
    assert order.id in [x["order_id"] for x in waiting["no_show_requests"]]

    # a driver can never confirm it; the admin can, and the held amount goes back in full
    assert c.post(f"/api/orders/driver/{order.id}/no-show-request", headers=_auth("driver", driver), json={"reason": "customer cancelled on phone"}).status_code == 200
    before = get_owner_balance(pg_session, str(owner.id))
    assert c.post(f"/api/admin/orders/{order.id}/no-show", headers=_auth("driver", driver), json={}).status_code in (401, 403)
    ok = c.post(f"/api/admin/orders/{order.id}/no-show", headers=_auth("admin", admin), json={"note": "customer phone off"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["refunded"] == 500
    assert get_owner_balance(pg_session, str(owner.id)) == before + 500
    pg_session.refresh(order); pg_session.refresh(a)
    assert str(getattr(order.trip_status, "value", order.trip_status)) == "CANCELLED"
    assert a.cancel_reason == "NO_SHOW"
    assert c.post(f"/api/admin/orders/{order.id}/no-show", headers=_auth("admin", admin), json={}).status_code == 400      # already closed


# ---------------------------------------------------------------- repost waits for approval, and is offered again to everyone else
def test_a_reposted_booking_waits_for_approval_then_returns_to_other_drivers(pg_session, client_with_db, monkeypatch):
    from app.crud import trip_exceptions as tx
    from app.crud.order_assignments import get_pending_orders_for_vehicle_owner
    from app.models.order_assignments import AssignmentStatusEnum
    from app.models.new_orders import NewOrder
    from app.models.vehicle_owner import VehicleOwnerCredentials
    c = client_with_db
    monkeypatch.setattr(tx, "announce_repost", lambda db, order: setattr(order, "repost_announced_at", datetime.now(timezone.utc)))
    owner, driver, order, a = _assigned_order(pg_session, pickup_hours_ago=-6)          # pickup in 6 h
    a.assignment_status = AssignmentStatusEnum.CANCELLED                                  # penalised and removed
    new = NewOrder(trip_type=order.trip_type, car_type=order.car_type, pickup_drop_location=order.pickup_drop_location, start_date_time=order.start_date_time,
                   customer_name="Cust", customer_number="9000000000", cost_per_km=12, extra_cost_per_km=0, driver_allowance=300, extra_driver_allowance=0,
                   permit_charges=0, extra_permit_charges=0, hill_charges=0, toll_charges=0, trip_distance=200, trip_status="PENDING",
                   pick_near_city=["Dharmapuri"], trip_time="5 hours", platform_fees_percent=10)
    pg_session.add(new)
    pg_session.flush()
    order.source_order_id = new.order_id
    other = VehicleOwnerCredentials(primary_number=_phone(), hashed_password="x")
    pg_session.add(other)
    pg_session.flush()
    assert tx.start_repost_hold(pg_session, order) is True                                 # default 10 minutes, well before pickup
    pg_session.flush()

    ids = lambda who: [o["order_id"] for o in get_pending_orders_for_vehicle_owner(pg_session, str(who.id))]
    assert order.id not in ids(other)                                                      # hidden while it waits
    admin = _admin(pg_session)
    waiting = c.get("/api/admin/attention/trips", headers=_auth("admin", admin)).json()
    assert order.id in [x["order_id"] for x in waiting["repost_waiting"]]
    assert c.post(f"/api/admin/orders/{order.id}/repost-approve", headers=_auth("admin", admin)).status_code == 200
    assert order.id in ids(other)                                                          # approved: everyone sees it...
    assert order.id not in ids(owner)                                                      # ...except the owner who lost it
    assert c.post(f"/api/admin/orders/{order.id}/repost-approve", headers=_auth("admin", admin)).status_code == 400   # nothing left to approve


# ---------------------------------------------------------------- km correction on a closed trip
def test_km_correction_posts_the_commission_difference_and_conserves_money(pg_session, client_with_db, monkeypatch):
    from app.crud.wallet import get_owner_balance
    from app.crud.vendor_wallet import get_vendor_wallet_balance
    from app.crud.admin_wallet import get_admin_balance
    from app.crud.end_records import update_end_trip_record
    from app.crud.km_correction import correct_trip_km
    from app.models.end_records import EndRecord
    from app.models.orders import Order
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.car_driver import CarDriver
    db, c = pg_session, client_with_db

    # a vendor posts a real booking (same steps as the full-journey test)
    digits = str(uuid.uuid4().int)
    vphone = "9" + digits[:9]
    r = c.post("/api/users/vendor/signup", data={"full_name": "Km Vendor", "primary_number": vphone, "password": "Test@1234", "address": "12 Anna Salai Chennai",
                                                   "city": "Chennai", "pincode": "600002", "aadhar_number": (digits[9:21] + "000000000000")[:12], "gpay_number": vphone})
    assert r.status_code == 201, r.text
    from app.models.vendor import VendorCredentials
    vendor_id = str(db.query(VendorCredentials).filter(VendorCredentials.primary_number == vphone).first().id)
    admin = _admin(db)
    assert c.patch(f"/api/admin/vendors/{vendor_id}/account-status", headers=_auth("admin", admin), json={"account_status": "ACTIVE"}).status_code == 200
    vh = {"Authorization": f"Bearer {c.post('/api/users/vendor/signin', json={'primary_number': vphone, 'password': 'Test@1234'}).json()['access_token']}"}
    monkeypatch.setattr("app.crud.new_orders.get_distance_km_between_locations", lambda a, b: (320.0, "6 hours"))
    posted = c.post("/api/orders/oneway/confirm", headers=vh, json={
        "trip_type": "Oneway", "car_type": "SEDAN_4_PLUS_1", "pickup_drop_location": {"0": "Chennai", "1": "Madurai"},
        "start_date_time": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(), "customer_name": "Mr Ravi", "customer_number": "9000011111",
        "cost_per_km": 14, "driver_allowance": 400, "send_to": "ALL", "max_time_to_assign_order": 30, "toll_charge_update": False})
    assert posted.status_code == 201, posted.text
    order_id = posted.json().get("order_id") or posted.json().get("id")

    # a fleet owner + driver take it and the driver closes it at 1330 (330 km driven)
    owner = VehicleOwnerCredentials(primary_number=_phone(), hashed_password="x")
    db.add(owner)
    db.flush()
    db.add(VehicleOwnerDetails(vehicle_owner_id=owner.id, full_name="Fleet", primary_number=owner.primary_number, aadhar_number="A" + str(uuid.uuid4().int)[:11],
                               address="x", city="Chennai", pincode="600001", wallet_balance=5000))
    drv = CarDriver(vehicle_owner_id=owner.id, full_name="Chella", primary_number=_phone(), hashed_password="x", licence_number="TN" + uuid.uuid4().hex[:12],
                    address="a", city="Chennai", pincode="600001")
    db.add(drv)
    db.flush()
    db.add(OrderAssignment(order_id=order_id, vehicle_owner_id=owner.id, driver_id=drv.id, assignment_status=AssignmentStatusEnum.ASSIGNED,
                           assigned_at=datetime.utcnow(), held_amount=0))
    db.add(EndRecord(order_id=order_id, driver_id=drv.id, start_km=1000, end_km=0, contact_number="x", img_url="x"))
    db.flush()
    asyncio.run(update_end_trip_record(db, order_id, str(drv.id), 1330, distance_reason="test close"))
    order = db.query(Order).filter(Order.id == order_id).first()
    admin_id = str(db.query(Admin).first().id)
    was = {"total": order.closed_vendor_price, "drv": get_owner_balance(db, str(owner.id)), "vendor": get_vendor_wallet_balance(db, vendor_id), "admin": get_admin_balance(db, admin_id)}

    # preview changes nothing
    plan = asyncio.run(correct_trip_km(db, order_id, 1360, "odometer misread", adjust_wallet=True, by="Admin t", apply=False))
    assert plan["applied"] is False and plan["km"]["old_driven"] == 330 and plan["km"]["new_driven"] == 360
    assert plan["customer_total"]["change"] == 30 * 14                       # 30 more km at the booking's rate
    assert plan["driver_wallet_change"] == -(plan["poster_share"]["change"] + plan["platform_fee"]["change"])
    db.refresh(order)
    assert order.closed_vendor_price == was["total"] and get_owner_balance(db, str(owner.id)) == was["drv"]

    # applying posts the difference and nothing is created or lost
    out = asyncio.run(correct_trip_km(db, order_id, 1360, "odometer misread", adjust_wallet=True, by="Admin t", apply=True))
    assert out["applied"] is True
    db.refresh(order)
    assert order.closed_vendor_price == was["total"] + 420
    assert db.query(EndRecord).filter(EndRecord.order_id == order_id).first().end_km == 1360
    d_drv = get_owner_balance(db, str(owner.id)) - was["drv"]
    d_vendor = get_vendor_wallet_balance(db, vendor_id) - was["vendor"]
    d_admin = get_admin_balance(db, admin_id) - was["admin"]
    assert d_drv == plan["driver_wallet_change"] and d_drv < 0               # the driver pays the extra commission
    assert d_drv + d_vendor + d_admin == 0

    # a second identical correction is a no-op
    again = asyncio.run(correct_trip_km(db, order_id, 1360, "same again", adjust_wallet=True, by="Admin t", apply=True))
    assert again["customer_total"]["change"] == 0 and again["driver_wallet_change"] == 0

    # "record only": the numbers change but no wallet moves
    drv_before = get_owner_balance(db, str(owner.id))
    asyncio.run(correct_trip_km(db, order_id, 1380, "record only", adjust_wallet=False, by="Admin t", apply=True))
    assert get_owner_balance(db, str(owner.id)) == drv_before
    db.refresh(order)
    assert order.closed_vendor_price == was["total"] + 20 * 14 + 420

    # only a completed trip can be corrected, and only by an admin who may move money
    assert c.post(f"/api/admin/orders/{order_id}/correct-km", headers=vh, json={"end_km": 1400, "reason": "x1x"}).status_code in (401, 403)
    r = c.post(f"/api/admin/orders/{order_id}/correct-km", headers=_auth("admin", admin), json={"end_km": 1400, "reason": "route check", "preview": True})
    assert r.status_code == 200 and r.json()["applied"] is False

    # the poster's own no-show endpoint exists, is theirs only, and refuses a booking that is already closed
    done = c.post(f"/api/orders/vendor/{order_id}/no-show", headers=vh, json={})
    assert done.status_code == 400 and "completed" in done.text.lower()
    other_vendor = c.post(f"/api/orders/vendor/{order_id + 99999}/no-show", headers=vh, json={})
    assert other_vendor.status_code == 400 and "not found" in other_vendor.text.lower()


def test_an_allocation_with_no_deadline_and_no_driver_shows_up_for_the_office(pg_session):
    """Admin / vendor allocation sets no deadline, so nothing cancels it by itself: it must be on the Needs-attention list (bookings 505, 516)."""
    from datetime import datetime, timedelta
    from app.crud import trip_exceptions as tx
    from app.models.order_assignments import AssignmentStatusEnum
    owner, driver, order, a = _assigned_order(pg_session, pickup_hours_ago=-5)       # pickup in 5 hours
    a.driver_id = None
    a.assignment_status = AssignmentStatusEnum.PENDING
    a.expires_at = None
    a.assigned_by = "ADMIN"
    a.created_at = datetime.utcnow() - timedelta(hours=2)
    pg_session.flush()
    listing = tx.attention_list(pg_session)
    mine = [x for x in listing["waiting_for_driver"] if x["order_id"] == order.id]
    assert len(mine) == 1 and mine[0]["held"] == 500 and mine[0]["allocated_by"] == "ADMIN"
    # a normal accept (it has a deadline) is the sweep's job, not listed
    a.expires_at = datetime.utcnow() + timedelta(minutes=10)
    pg_session.flush()
    assert order.id not in [x["order_id"] for x in tx.attention_list(pg_session)["waiting_for_driver"]]
