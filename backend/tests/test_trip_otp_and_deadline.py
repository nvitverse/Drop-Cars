"""
Trip OTPs die with the trip, and fleet drivers are warned before the
assign-by deadline removes a booking from them.
"""
import asyncio
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.crud.trip_otp import otps_visible


def _o(status):
    return SimpleNamespace(trip_status=status)


def _a(status):
    return SimpleNamespace(assignment_status=status)


def test_otps_visible_only_while_trip_is_open():
    assert otps_visible(_o("PENDING")) is True
    assert otps_visible(_o("ASSIGNED"), _a("ASSIGNED")) is True
    assert otps_visible(_o("DRIVING"), _a("DRIVING")) is True
    assert otps_visible(_o("COMPLETED")) is False
    assert otps_visible(_o("CANCELLED")) is False
    assert otps_visible(_o("VENDOR_CANCELLED")) is False
    assert otps_visible(_o("DRIVING"), _a("COMPLETED")) is False
    assert otps_visible(_o("PENDING"), _a("CANCELLED")) is False
    # Enum-like values
    assert otps_visible(SimpleNamespace(trip_status=SimpleNamespace(value="COMPLETED"))) is False


def _make_pending_assignment(db, minutes_left):
    """A fleet driver who accepted a booking and has not assigned driver/car."""
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.orders import Order, OrderSourceEnum, Trip_status
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum

    owner = VehicleOwnerCredentials(primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    order = Order(
        source=OrderSourceEnum.NEW_ORDERS, source_order_id=0,
        trip_type=OrderTypeEnum.ONEWAY, car_type=CarTypeEnum.HATCHBACK,
        pickup_drop_location={"0": "Chennai", "1": "Vellore"},
        start_date_time=datetime.utcnow() + timedelta(hours=5),
        customer_name="Test", customer_number="9000000000",
        trip_status=Trip_status.PENDING,
    )
    db.add_all([owner, order])
    db.flush()
    a = OrderAssignment(
        order_id=order.id,
        vehicle_owner_id=owner.id,
        assignment_status=AssignmentStatusEnum.PENDING,
        expires_at=datetime.utcnow() + timedelta(minutes=minutes_left),
    )
    db.add(a)
    db.flush()
    return owner, a


def test_deadline_warning_stages(pg_session, monkeypatch):
    from app.crud import order_assignments as oa
    import app.crud.notification as notif
    from app.models.notification import Notification

    owner, a = _make_pending_assignment(pg_session, minutes_left=8)
    pg_session.add(Notification(user="vehicle_owner", sub=str(owner.id), token="ExponentPushToken[test-deadline]"))
    pg_session.flush()

    sent = []
    monkeypatch.setattr(notif, "_enqueue_expo_push", lambda db, payloads: sent.extend(payloads))

    assert asyncio.run(oa.send_assignment_deadline_warnings(pg_session)) == 1
    pg_session.refresh(a)
    assert a.deadline_warning_stage == 1
    assert sent and sent[0]["to"] == "ExponentPushToken[test-deadline]"
    assert sent[0]["data"]["event_key"] == "assignment_deadline_warning"
    assert "₹500" in sent[0]["body"]

    # Same stage is not repeated
    sent.clear()
    assert asyncio.run(oa.send_assignment_deadline_warnings(pg_session)) == 0

    # Final warning at <= 3 minutes
    a.expires_at = datetime.utcnow() + timedelta(minutes=2)
    pg_session.flush()
    assert asyncio.run(oa.send_assignment_deadline_warnings(pg_session)) == 1
    pg_session.refresh(a)
    assert a.deadline_warning_stage == 2
