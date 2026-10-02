"""Admin > Chats list: built from a few batched queries; unread/last message/other party must stay right."""
import uuid
from datetime import datetime, timedelta

from app.api.routes import booking_chat as bc
from app.models.booking_chat import BookingChatMessage
from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum


def _order(db):
    from app.models.orders import Order, OrderSourceEnum, Trip_status
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    o = Order(
        source=OrderSourceEnum.NEW_ORDERS, source_order_id=0, trip_type=OrderTypeEnum.ONEWAY, car_type=CarTypeEnum.HATCHBACK,
        pickup_drop_location={"0": "Chennai", "1": "Vellore"}, start_date_time=datetime.utcnow() + timedelta(hours=5),
        customer_name="Kumar", customer_number="9000000001", trip_status=Trip_status.PENDING, estimated_price=2500,
    )
    db.add(o)
    db.flush()
    return o


def test_admin_thread_list_unread_last_text_and_cancelled_assignments(pg_session, monkeypatch):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    owner = VehicleOwnerCredentials(primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    pg_session.add(owner)
    pg_session.flush()
    a, b, c = _order(pg_session), _order(pg_session), _order(pg_session)
    for o, st in ((a, AssignmentStatusEnum.ASSIGNED), (b, AssignmentStatusEnum.ASSIGNED), (c, AssignmentStatusEnum.CANCELLED)):
        pg_session.add(OrderAssignment(order_id=o.id, vehicle_owner_id=owner.id, assignment_status=st))
    pg_session.add_all([
        BookingChatMessage(order_id=a.id, sender_side="DRIVER", kind="TEXT", text="first"),
        BookingChatMessage(order_id=a.id, sender_side="DRIVER", kind="TEXT", text="second"),
        BookingChatMessage(order_id=a.id, sender_side="POSTER", kind="TEXT", text="admin reply"),   # own side: not unread
        BookingChatMessage(order_id=b.id, sender_side="DRIVER", kind="TEXT", text="only one", read_at=datetime.utcnow()),
    ])
    pg_session.flush()
    monkeypatch.setattr(bc, "_resolve_caller", lambda r, db: ("ADMIN", None))
    rows = {r["order_id"]: r for r in bc.list_threads(None, pg_session)}
    assert c.id not in rows                                   # cancelled assignment = nothing to chat about
    assert (rows[a.id]["unread"], rows[a.id]["last_text"]) == (2, "admin reply")
    assert (rows[b.id]["unread"], rows[b.id]["last_text"]) == (0, "only one")
    assert rows[a.id]["other_role"] == "DRIVER"
