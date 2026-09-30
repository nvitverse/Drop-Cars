"""The reply menu lives on each incoming message and answers THAT message."""
from datetime import datetime, timedelta

from app.crud import booking_chat as chat
from app.models.booking_chat import BookingChatMessage


def _order(db):
    from app.models.orders import Order, OrderSourceEnum, Trip_status
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    o = Order(
        source=OrderSourceEnum.NEW_ORDERS, source_order_id=0,
        trip_type=OrderTypeEnum.ONEWAY, car_type=CarTypeEnum.HATCHBACK,
        pickup_drop_location={"0": "Chennai", "1": "Vellore"},
        start_date_time=datetime.utcnow() + timedelta(hours=5),
        customer_name="Kumar", customer_number="9000000001", trip_status=Trip_status.PENDING,
        estimated_price=2500,
    )
    db.add(o)
    db.flush()
    return o


def test_poster_sees_the_exact_answer_first(pg_session):
    o = _order(pg_session)
    q = BookingChatMessage(order_id=o.id, sender_side="DRIVER", kind="QUICK", quick_key="CUSTOMER_NUMBER",
                           text=chat.DRIVER_QUESTIONS["CUSTOMER_NUMBER"])
    opts = chat.reply_options(pg_session, o, q, "POSTER", "ASSIGNED", {})
    assert opts[0]["key"] == "CUSTOMER_NUMBER"
    assert "9000000001" in opts[0]["text"]
    assert any(x["key"] == "GENERIC_CALL" for x in opts)


def test_driver_options_follow_trip_stage_and_own_messages_have_none(pg_session):
    o = _order(pg_session)
    m = BookingChatMessage(order_id=o.id, sender_side="POSTER", kind="TEXT", text="Pickup at 6 am sharp")
    before = [x["key"] for x in chat.reply_options(pg_session, o, m, "DRIVER", "ASSIGNED", {})]
    during = [x["key"] for x in chat.reply_options(pg_session, o, m, "DRIVER", "DRIVING", {})]
    assert "ON_TIME" in before and "ON_THE_WAY" in during
    assert chat.reply_options(pg_session, o, m, "POSTER", "ASSIGNED", {}) == []
    assert chat.reply_options(pg_session, o, m, "DRIVER", "COMPLETED", {}) == []
