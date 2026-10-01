"""Admin "Allocate manually": a booking goes to a FLEET OWNER (they hold the
wallet). Low wallet -> admin may allocate on credit: nothing is taken now, the
commission is debited at trip completion. Every allocation names the staff
member in the Owner-visible activity log."""
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest


def _owner(db, balance):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails

    phone = "9" + str(uuid.uuid4().int)[:9]
    cred = VehicleOwnerCredentials(primary_number=phone, hashed_password="x")
    db.add(cred)
    db.flush()
    details = VehicleOwnerDetails(
        vehicle_owner_id=cred.id, full_name="Test Fleet", primary_number=phone,
        aadhar_number="A" + str(uuid.uuid4().int)[:11], address="x", city="Chennai", pincode="600001",
        wallet_balance=balance,
    )
    db.add(details)
    db.flush()
    return details


def _order(db, estimated=2000, vendor=2300):
    """Hold for this booking = vendor - estimated = 300 (no km row behind it)."""
    from app.models.orders import Order, OrderSourceEnum, Trip_status
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum

    order = Order(
        source=OrderSourceEnum.HOURLY_RENTAL, source_order_id=0,
        trip_type=OrderTypeEnum.ONEWAY, car_type=CarTypeEnum.HATCHBACK,
        pickup_drop_location={"0": "Chennai", "1": "Vellore"},
        start_date_time=datetime.utcnow() + timedelta(hours=5),
        customer_name="Test", customer_number="9000000000",
        trip_status=Trip_status.PENDING, estimated_price=estimated, vendor_price=vendor,
    )
    db.add(order)
    db.flush()
    return order


@pytest.fixture
def quiet(monkeypatch):
    """No real pushes; collect what would be sent."""
    import app.utils.notification_dispatch as nd
    sent = []
    monkeypatch.setattr(nd, "_send_expo", lambda tokens, title, body, *a, **k: sent.append((title, body)) or {"status": "sent"})
    return sent


def _staff():
    return SimpleNamespace(id=uuid.uuid4(), username="kumar", role="Staff")


def _ledger(db, owner, order):
    from app.models.wallet_ledger import WalletLedger
    return db.query(WalletLedger).filter(
        WalletLedger.vehicle_owner_id == owner.vehicle_owner_id, WalletLedger.reference_id == str(order.id)
    ).all()


def test_commission_hold_formula():
    from app.crud.manual_allocation import commission_hold
    assert commission_hold(2000, 2300) == 300
    assert commission_hold(2000, 2300, cost_per_km=15, trip_distance=200) == 300 + 300   # + 10% of 3000
    assert commission_hold(2500, 2000) == 0


def test_enough_wallet_holds_the_commission(pg_session, quiet):
    from app.crud.manual_allocation import allocate_to_fleet_owner
    from app.crud.wallet import get_owner_balance, get_trip_hold

    owner, order = _owner(pg_session, 1000), _order(pg_session)
    res = allocate_to_fleet_owner(pg_session, order, owner, staff=_staff())
    assert res["status"] == "SUCCESS" and res["on_credit"] is False and res["held_amount"] == 300
    assert get_owner_balance(pg_session, str(owner.vehicle_owner_id)) == 700
    assert get_trip_hold(pg_session, order.id, str(owner.vehicle_owner_id)) == 300


def test_low_wallet_is_refused_without_credit(pg_session, quiet):
    from app.crud.manual_allocation import allocate_to_fleet_owner
    from app.models.order_assignments import OrderAssignment

    owner, order = _owner(pg_session, 100), _order(pg_session)
    res = allocate_to_fleet_owner(pg_session, order, owner, staff=_staff())
    assert res["status"] == "INSUFFICIENT_BALANCE"
    assert res["wallet_balance"] == 100 and res["required_amount"] == 300
    assert res["requires_credit_approval"] is True
    assert pg_session.query(OrderAssignment).filter(OrderAssignment.order_id == order.id).count() == 0
    assert _ledger(pg_session, owner, order) == []


def test_credit_takes_nothing_now_and_names_the_staff(pg_session, quiet):
    from app.crud.manual_allocation import allocate_to_fleet_owner
    from app.crud.wallet import get_owner_balance, get_trip_hold
    from app.models.order_assignments import OrderAssignment
    from app.models.admin_activity_log import AdminActivityLog

    owner, order = _owner(pg_session, 100), _order(pg_session)
    res = allocate_to_fleet_owner(pg_session, order, owner, on_credit=True, staff=_staff())
    assert res["status"] == "SUCCESS" and res["on_credit"] is True and res["held_amount"] == 0
    assert res["commission_amount"] == 300

    # Wallet untouched now; the trip-completion settlement debits the full
    # commission (hold is 0), which is what takes the wallet below zero.
    assert get_owner_balance(pg_session, str(owner.vehicle_owner_id)) == 100
    assert get_trip_hold(pg_session, order.id, str(owner.vehicle_owner_id)) == 0
    assert _ledger(pg_session, owner, order) == []

    a = pg_session.query(OrderAssignment).filter(OrderAssignment.order_id == order.id).one()
    assert str(a.vehicle_owner_id) == str(owner.vehicle_owner_id)
    assert a.assigned_by == "ADMIN" and a.held_amount == 0

    log = pg_session.query(AdminActivityLog).filter(AdminActivityLog.target_id == str(order.id)).one()
    assert log.action == "BOOKING_ALLOCATED_ON_CREDIT"
    assert log.admin_username == "kumar"
    assert log.details["on_credit"] is True
    assert log.details["wallet_balance_at_allocation"] == 100
    assert log.details["commission_amount"] == 300

    # Fleet owner is told it is on credit; admin devices are alerted with who did it.
    assert any("on credit" in body for _, body in quiet)
    assert any(title == "Booking allocated on credit" and "kumar" in body for title, body in quiet)


def test_credit_is_not_used_when_the_wallet_can_pay(pg_session, quiet):
    from app.crud.manual_allocation import allocate_to_fleet_owner
    from app.crud.wallet import get_owner_balance

    owner, order = _owner(pg_session, 1000), _order(pg_session)
    res = allocate_to_fleet_owner(pg_session, order, owner, on_credit=True, staff=_staff())
    assert res["on_credit"] is False and res["held_amount"] == 300
    assert get_owner_balance(pg_session, str(owner.vehicle_owner_id)) == 700


def test_vendor_cannot_allocate_on_credit(pg_session, quiet):
    from app.crud.manual_allocation import allocate_to_fleet_owner

    owner, order = _owner(pg_session, 100), _order(pg_session)
    res = allocate_to_fleet_owner(pg_session, order, owner, on_credit=True, assigned_by="VENDOR")
    assert res["status"] == "INSUFFICIENT_BALANCE"
    assert res["requires_credit_approval"] is False


def test_find_fleet_owner_by_id_phone_or_duty_driver(pg_session):
    from app.crud.manual_allocation import find_fleet_owner

    owner = _owner(pg_session, 0)
    assert find_fleet_owner(pg_session, str(owner.vehicle_owner_id)).id == owner.id
    assert find_fleet_owner(pg_session, owner.primary_number).id == owner.id   # a phone must not break the UUID columns
    assert find_fleet_owner(pg_session, "0000000000") is None
    assert find_fleet_owner(pg_session, "") is None


def test_old_credit_hold_is_counted_so_it_is_not_charged_twice(pg_session):
    """Before this change a credit allocation debited the hold up front as
    TRIP_HOLD_MANUAL_CREDIT, which the completion settlement did not see."""
    from app.crud.wallet import debit_wallet_allow_negative, get_trip_hold

    owner, order = _owner(pg_session, 0), _order(pg_session)
    debit_wallet_allow_negative(pg_session, str(owner.vehicle_owner_id), 300, str(order.id), "TRIP_HOLD_MANUAL_CREDIT")
    pg_session.flush()
    assert get_trip_hold(pg_session, order.id, str(owner.vehicle_owner_id)) == 300
