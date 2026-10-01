"""Unified chat: who can see what, phone-number privacy, read receipts, the bridge to the older chat tables, retention."""
import re
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.core.security import create_access_token
from app.crud import conversations as C


# ------------------------------------------------------------------ builders
def _phone():
    return "9" + str(uuid.uuid4().int)[:9]


def _customer(db):
    from app.models.customer import CustomerCredentials
    c = CustomerCredentials(primary_number=_phone(), hashed_password="x")
    db.add(c)
    db.flush()
    return c


def _owner(db):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    o = VehicleOwnerCredentials(primary_number=_phone(), hashed_password="x")
    db.add(o)
    db.flush()
    # the shipped (older) routes look the owner up through the details row
    db.add(VehicleOwnerDetails(vehicle_owner_id=o.id, full_name="Fleet Test", primary_number=o.primary_number,
                               aadhar_number="A" + str(uuid.uuid4().int)[:11], address="x", city="Chennai", pincode="600001"))
    db.flush()
    return o


def _vendor(db):
    from app.models.vendor import VendorCredentials
    v = VendorCredentials(primary_number=_phone(), hashed_password="x")
    db.add(v)
    db.flush()
    return v


def _admin(db, role="Staff"):
    from app.models.admin import Admin
    a = Admin(username=f"{role.lower()}-{uuid.uuid4().hex[:6]}", password="x", role=role, phone="9000000000", email="a@a.a")
    db.add(a)
    db.flush()
    return a


def _order(db, vendor=None, posted_by_owner=None, hours_ahead=30, revealed=False):
    from app.models.new_orders import CarTypeEnum, OrderTypeEnum
    from app.models.orders import Order, OrderSourceEnum, Trip_status
    o = Order(
        source=OrderSourceEnum.NEW_ORDERS, source_order_id=0, trip_type=OrderTypeEnum.ONEWAY, car_type=CarTypeEnum.HATCHBACK,
        pickup_drop_location={"0": "Chennai", "1": "Vellore"}, start_date_time=datetime.now(timezone.utc) + timedelta(hours=hours_ahead),
        customer_name="Test", customer_number=_phone(), trip_status=Trip_status.PENDING,
        vendor_id=vendor.id if vendor else None, posted_by_vehicle_owner_id=posted_by_owner.id if posted_by_owner else None,
        data_visibility_vehicle_owner=revealed,
    )
    db.add(o)
    db.flush()
    return o


def _accept(db, order, owner):
    from app.models.order_assignments import AssignmentStatusEnum, OrderAssignment
    a = OrderAssignment(order_id=order.id, vehicle_owner_id=owner.id, assignment_status=AssignmentStatusEnum.PENDING)
    db.add(a)
    db.flush()
    return a


def _link_customer(db, order, customer):
    from app.models.customer_booking_request import CustomerBookingRequest
    r = CustomerBookingRequest(
        customer_id=customer.id, pickup_drop_location={"0": "Chennai", "1": "Vellore"}, trip_type="Oneway", car_type="SEDAN_4_PLUS_1",
        start_date_time=order.start_date_time, customer_name="Cust", customer_number=customer.primary_number,
        quoted_cost_per_km=15, quoted_driver_allowance=300, quoted_extra_driver_allowance=0, quoted_permit_charges=0,
        quoted_extra_permit_charges=0, quoted_hill_charges=0, quoted_toll_charges=0, quoted_extra_cost_per_km=0, quoted_night_charges=0,
        quoted_total_amount=3000, quoted_driver_amount=2800, quoted_trip_distance=200, quoted_trip_time="4 h", status="APPROVED",
        linked_order_id=order.id,
    )
    db.add(r)
    db.flush()
    return r


def _auth(kind, account):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(account.id), "user": kind, "token_version": getattr(account, "token_version", 0) or (1 if kind in ("customer", "admin") else 0)})}


@pytest.fixture
def booking(pg_session):
    """A booking posted by a vendor, accepted by a fleet owner, booked by a customer."""
    db = pg_session
    vendor, owner, customer = _vendor(db), _owner(db), _customer(db)
    order = _order(db, vendor=vendor)
    _accept(db, order, owner)
    _link_customer(db, order, customer)
    return type("B", (), dict(db=db, vendor=vendor, owner=owner, customer=customer, order=order))


# ------------------------------------------------------------------ phone masking
@pytest.mark.parametrize("text", [
    "call me 9876543210", "+91 98765 43210", "98765-43210 please", "9 8 7 6 5 4 3 2 1 0", "+919876543210",
    "nine eight seven six five four three two one zero",
])
def test_phone_numbers_are_hidden(text):
    out, hit = C.mask_phone_numbers(text)
    assert hit and not re.search(r"\d{4}", out) and "nine eight" not in out.lower()


@pytest.mark.parametrize("text", ["pickup at 10:30", "fare 4500 rupees", "booking #1234", "date 01/10/2026", "OTP 482913", "3 passengers, 2 bags"])
def test_normal_numbers_are_kept(text):
    out, hit = C.mask_phone_numbers(text)
    assert out == text and not hit


# ------------------------------------------------------------------ access
def test_parties_can_open_the_booking_chat_outsiders_cannot(booking, client_with_db):
    b = booking
    for kind, acct in (("customer", b.customer), ("vendor", b.vendor), ("vehicle_owner", b.owner)):
        r = client_with_db.post(f"/api/conversations/booking/{b.order.id}", headers=_auth(kind, acct))
        assert r.status_code == 200, (kind, r.text)
        assert r.json()["type"] == "BOOKING" and r.json()["can_post"] is True
    stranger = _customer(b.db)
    assert client_with_db.post(f"/api/conversations/booking/{b.order.id}", headers=_auth("customer", stranger)).status_code == 403


def test_a_conversation_you_are_not_in_does_not_exist_for_you(booking, client_with_db):
    b = booking
    cid = client_with_db.post(f"/api/conversations/booking/{b.order.id}", headers=_auth("customer", b.customer)).json()["id"]
    stranger = _customer(b.db)
    other_vendor = _vendor(b.db)
    for kind, acct in (("customer", stranger), ("vendor", other_vendor)):
        assert client_with_db.get(f"/api/conversations/{cid}", headers=_auth(kind, acct)).status_code == 404
        assert client_with_db.get(f"/api/conversations/{cid}/messages", headers=_auth(kind, acct)).status_code == 404
        assert client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "hi"}, headers=_auth(kind, acct)).status_code == 404


def test_customer_support_chat_and_admin_oversight(pg_session, client_with_db):
    customer, admin = _customer(pg_session), _admin(pg_session)
    r = client_with_db.post("/api/conversations/support", headers=_auth("customer", customer))
    assert r.status_code == 200
    cid = r.json()["id"]
    assert client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "my driver is late"}, headers=_auth("customer", customer)).status_code == 201
    # any admin sees it in oversight and can answer; the customer sees "Drop Cars" + the staff name
    listing = client_with_db.get("/api/conversations?scope=all&type=SUPPORT", headers=_auth("admin", admin)).json()
    assert cid in [c["id"] for c in listing]
    sent = client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "sorry, checking now"}, headers=_auth("admin", admin))
    assert sent.status_code == 201 and sent.json()["sender_name"].startswith("Drop Cars · ")
    msgs = client_with_db.get(f"/api/conversations/{cid}/messages", headers=_auth("customer", customer)).json()["messages"]
    assert [m["text"] for m in msgs] == ["my driver is late", "sorry, checking now"]


def test_staff_chats_are_private_to_members_and_the_director(pg_session, client_with_db):
    a, b, c, director = _admin(pg_session), _admin(pg_session), _admin(pg_session), _admin(pg_session, "Owner")
    r = client_with_db.post("/api/conversations/staff", json={"with_admin_id": str(b.id)}, headers=_auth("admin", a))
    assert r.status_code == 200
    cid = r.json()["id"]
    assert client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "salary question"}, headers=_auth("admin", a)).status_code == 201
    assert client_with_db.get(f"/api/conversations/{cid}/messages", headers=_auth("admin", b)).status_code == 200
    assert client_with_db.get(f"/api/conversations/{cid}/messages", headers=_auth("admin", c)).status_code == 404       # another staff member
    assert client_with_db.get(f"/api/conversations/{cid}/messages", headers=_auth("admin", director)).status_code == 200  # the director oversees
    assert client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "hi"}, headers=_auth("admin", director)).status_code == 403   # ... but is not a member
    # the oversight list: staff never see internal chats they are not in
    listing = client_with_db.get("/api/conversations?scope=all", headers=_auth("admin", c)).json()
    assert cid not in [x["id"] for x in listing]
    assert cid in [x["id"] for x in client_with_db.get("/api/conversations?scope=all", headers=_auth("admin", director)).json()]
    # customers / drivers cannot start team chats
    assert client_with_db.post("/api/conversations/staff", json={"with_admin_id": str(a.id)}, headers=_auth("customer", _customer(pg_session))).status_code == 403


# ------------------------------------------------------------------ privacy
def test_numbers_are_hidden_in_a_booking_chat_until_the_reveal_rule_opens(booking, client_with_db):
    b = booking
    cid = client_with_db.post(f"/api/conversations/booking/{b.order.id}", headers=_auth("customer", b.customer)).json()["id"]
    assert client_with_db.get(f"/api/conversations/{cid}", headers=_auth("customer", b.customer)).json()["number_revealed"] is False

    r = client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "call me on 9876543210"}, headers=_auth("customer", b.customer))
    assert r.status_code == 201
    assert r.json()["masked"] is True and "9876543210" not in r.json()["text"] and r.json().get("notice")
    seen_by_owner = client_with_db.get(f"/api/conversations/{cid}/messages", headers=_auth("vehicle_owner", b.owner)).json()["messages"]
    assert all("9876543210" not in m["text"] for m in seen_by_owner)

    # the booking's reveal switch opens ("On accept"): numbers may now pass
    b.order.data_visibility_vehicle_owner = True
    b.db.flush()
    r2 = client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "my number is 9876543210"}, headers=_auth("customer", b.customer))
    assert r2.json()["masked"] is False and "9876543210" in r2.json()["text"]


def test_admin_can_always_write_numbers_and_support_chats_are_not_masked(booking, client_with_db):
    b = booking
    admin = _admin(b.db)
    cid = client_with_db.post(f"/api/conversations/booking/{b.order.id}", headers=_auth("admin", admin)).json()["id"]
    r = client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "driver 9876543210 will call"}, headers=_auth("admin", admin))
    assert r.json()["masked"] is False
    sid = client_with_db.post("/api/conversations/support", headers=_auth("customer", b.customer)).json()["id"]
    r = client_with_db.post(f"/api/conversations/{sid}/messages", json={"text": "reach me 9876543210"}, headers=_auth("customer", b.customer))
    assert r.json()["masked"] is False


def test_api_output_never_contains_a_phone_number(booking, client_with_db):
    b = booking
    cid = client_with_db.post(f"/api/conversations/booking/{b.order.id}", headers=_auth("vehicle_owner", b.owner)).json()["id"]
    client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "on my way"}, headers=_auth("vehicle_owner", b.owner))
    blobs = [
        client_with_db.get("/api/conversations", headers=_auth("customer", b.customer)).text,
        client_with_db.get(f"/api/conversations/{cid}", headers=_auth("customer", b.customer)).text,
        client_with_db.get(f"/api/conversations/{cid}/messages", headers=_auth("customer", b.customer)).text,
    ]
    for blob in blobs:
        for number in (b.order.customer_number, b.customer.primary_number, b.owner.primary_number, b.vendor.primary_number):
            assert number not in blob


# ------------------------------------------------------------------ unread / receipts
def test_unread_counts_and_read_receipts(booking, client_with_db):
    b = booking
    cid = client_with_db.post(f"/api/conversations/booking/{b.order.id}", headers=_auth("customer", b.customer)).json()["id"]
    first = client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "where are you?"}, headers=_auth("customer", b.customer)).json()
    assert first["read"] is False

    owner_h = _auth("vehicle_owner", b.owner)
    assert client_with_db.get("/api/conversations/unread-count", headers=owner_h).json()["total"] == 1
    assert client_with_db.get("/api/conversations", headers=owner_h).json()[0]["unread"] == 1
    assert client_with_db.get("/api/conversations/unread-count", headers=_auth("customer", b.customer)).json()["total"] == 0   # own message

    client_with_db.post(f"/api/conversations/{cid}/read", json={}, headers=owner_h)
    assert client_with_db.get("/api/conversations/unread-count", headers=owner_h).json()["total"] == 0
    msgs = client_with_db.get(f"/api/conversations/{cid}/messages", headers=_auth("customer", b.customer)).json()["messages"]
    assert msgs[0]["read"] is True and msgs[0]["mine"] is True


def test_mute_and_block(booking, client_with_db):
    b = booking
    cid = client_with_db.post(f"/api/conversations/booking/{b.order.id}", headers=_auth("customer", b.customer)).json()["id"]
    h = _auth("customer", b.customer)
    assert client_with_db.patch(f"/api/conversations/{cid}/mute", json={"minutes": 60}, headers=h).json()["muted_until"]
    assert client_with_db.patch(f"/api/conversations/{cid}/mute", json={"minutes": 0}, headers=h).json()["muted_until"] is None
    assert client_with_db.patch(f"/api/conversations/{cid}/block", json={"blocked": True}, headers=h).json()["blocked"] is True
    assert client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "hello"}, headers=h).status_code == 403
    sid = client_with_db.post("/api/conversations/support", headers=h).json()["id"]
    assert client_with_db.patch(f"/api/conversations/{sid}/block", json={"blocked": True}, headers=h).status_code == 400


# ------------------------------------------------------------------ the bridge to the older chat tables
def test_support_chat_is_visible_to_the_old_admin_and_driver_apps(pg_session, client_with_db):
    from app.models.support_message import SupportMessage
    owner, admin = _owner(pg_session), _admin(pg_session)

    # new -> old: an owner writes in the unified chat, the shipped admin app reads support_messages
    cid = client_with_db.post("/api/conversations/support", headers=_auth("vehicle_owner", owner)).json()["id"]
    client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "wallet question"}, headers=_auth("vehicle_owner", owner))
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    legacy_key = str(pg_session.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == owner.id).first().id)   # the older chat keys owners by the details row
    legacy = pg_session.query(SupportMessage).filter(SupportMessage.thread_key == legacy_key).all()
    assert [(m.sender_side, m.text, m.thread_role) for m in legacy] == [("DRIVER_OWNER", "wallet question", "OWNER")]

    # old -> new: the shipped admin app replies, the unified chat shows it
    r = client_with_db.post(f"/api/support/admin/threads/{legacy_key}", json={"text": "checking"}, headers=_auth("admin", admin))
    assert r.status_code == 201, r.text
    msgs = client_with_db.get(f"/api/conversations/{cid}/messages", headers=_auth("vehicle_owner", owner)).json()["messages"]
    assert [m["text"] for m in msgs] == ["wallet question", "checking"]
    assert msgs[1]["sender_name"].startswith("Drop Cars")

    # unified admin reply -> old driver app (support/my-thread)
    client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "fixed"}, headers=_auth("admin", admin))
    old_r = client_with_db.get("/api/support/my-thread", headers=_auth("vehicle_owner", owner))
    assert old_r.status_code == 200, old_r.text
    old = old_r.json()
    assert [m["text"] for m in old["messages"]][-1] == "fixed"

    # nothing is ever copied twice
    again = pg_session.query(SupportMessage).filter(SupportMessage.thread_key == legacy_key).count()
    from app.models.conversation import ConversationMessage
    assert again == 3 and pg_session.query(ConversationMessage).filter(ConversationMessage.conversation_id == cid).count() == 3


def test_booking_chat_bridge_both_ways(booking, client_with_db):
    from app.models.booking_chat import BookingChatMessage
    from app.models.conversation import ConversationMessage
    b = booking
    cid = client_with_db.post(f"/api/conversations/booking/{b.order.id}", headers=_auth("vehicle_owner", b.owner)).json()["id"]

    # unified (driver side) -> the shipped vendor app's booking chat
    client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "reached pickup"}, headers=_auth("vehicle_owner", b.owner))
    legacy = b.db.query(BookingChatMessage).filter(BookingChatMessage.order_id == b.order.id).all()
    assert [(m.sender_side, m.text) for m in legacy] == [("DRIVER", "reached pickup")]

    # shipped vendor app -> unified (so the customer on the new app sees it)
    r = client_with_db.post(f"/api/booking-chat/orders/{b.order.id}", json={"text": "ok, wait there"}, headers=_auth("vendor", b.vendor))
    assert r.status_code == 201, r.text
    msgs = client_with_db.get(f"/api/conversations/{cid}/messages", headers=_auth("customer", b.customer)).json()["messages"]
    assert [m["text"] for m in msgs] == ["reached pickup", "ok, wait there"]
    assert b.db.query(ConversationMessage).filter(ConversationMessage.conversation_id == cid).count() == 2

    # a customer's message is NOT pushed into the older chat (it has no customer side)
    client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "thanks"}, headers=_auth("customer", b.customer))
    assert b.db.query(BookingChatMessage).filter(BookingChatMessage.order_id == b.order.id).count() == 2


def test_old_chat_hides_numbers_from_the_customer_in_the_new_chat(booking, client_with_db):
    b = booking
    cid = client_with_db.post(f"/api/conversations/booking/{b.order.id}", headers=_auth("customer", b.customer)).json()["id"]
    client_with_db.post(f"/api/booking-chat/orders/{b.order.id}", json={"text": "driver number 9876543210"}, headers=_auth("vendor", b.vendor))
    msgs = client_with_db.get(f"/api/conversations/{cid}/messages", headers=_auth("customer", b.customer)).json()["messages"]
    assert msgs and "9876543210" not in msgs[0]["text"] and msgs[0]["masked"] is True


def test_backfill_copies_existing_rows_once(pg_session):
    from app.crud import chat_bridge
    from app.models.conversation import ConversationMessage
    from app.models.support_message import SupportMessage
    key = str(uuid.uuid4())
    pg_session.add_all([
        SupportMessage(thread_key=key, thread_role="DRIVER", thread_name="Raj", sender_side="DRIVER_OWNER", sender_name="Raj", text="hello"),
        SupportMessage(thread_key=key, thread_role="DRIVER", thread_name="Raj", sender_side="ADMIN", sender_name="kumar", text="hi Raj"),
    ])
    pg_session.flush()
    chat_bridge.backfill_legacy(pg_session, limit=5000)
    chat_bridge.backfill_legacy(pg_session, limit=5000)
    conv_ids = [r[0] for r in pg_session.execute(__import__("sqlalchemy").text("select id from conversations where subject_key = :k"), {"k": f"SUPPORT:DRIVER:{key}"})]
    assert len(conv_ids) == 1
    assert pg_session.query(ConversationMessage).filter(ConversationMessage.conversation_id == conv_ids[0]).count() == 2


# ------------------------------------------------------------------ media + retention
def test_media_urls_go_through_the_api_and_arbitrary_urls_are_refused(booking, client_with_db):
    from app.utils import chat_media
    storage = "https://storage.googleapis.com/some-bucket/chat_voice_notes/5ae7723e-c3dc-4176-a06f-7a702fa17c2f.m4a"
    assert chat_media.media_url(storage) == f"{chat_media.MEDIA_PREFIX}chat_voice_notes/5ae7723e-c3dc-4176-a06f-7a702fa17c2f.m4a"
    assert chat_media.is_chat_media_url(storage)
    assert not chat_media.is_chat_media_url("https://evil.example.com/pixel.png")
    b = booking
    cid = client_with_db.post(f"/api/conversations/booking/{b.order.id}", headers=_auth("customer", b.customer)).json()["id"]
    bad = client_with_db.post(f"/api/conversations/{cid}/messages", json={"image_url": "https://evil.example.com/pixel.png"}, headers=_auth("customer", b.customer))
    assert bad.status_code == 400
    ok = client_with_db.post(f"/api/conversations/{cid}/messages", json={"voice_url": storage}, headers=_auth("customer", b.customer))
    assert ok.status_code == 201 and ok.json()["kind"] == "VOICE" and ok.json()["voice_url"].startswith(chat_media.MEDIA_PREFIX)


def test_media_route_refuses_odd_names(client_with_db):
    for path in ("chat_media/a.exe", "other_folder/5ae7723e-c3dc-4176-a06f-7a702fa17c2f.m4a", "chat_media/..%2Fsecret.m4a"):
        assert client_with_db.get(f"/api/conversations/media/{path}").status_code in (404, 422)


def test_upload_accepts_only_audio_and_images(booking, client_with_db):
    r = client_with_db.post("/api/conversations/upload", files={"file": ("x.txt", b"hello", "text/plain")}, headers=_auth("customer", booking.customer))
    assert r.status_code == 400


def test_retention_deletes_old_messages_by_type(pg_session):
    from app.models.conversation import Conversation, ConversationMessage
    conv = Conversation(type="BOOKING", subject_key=f"BOOKING:test-{uuid.uuid4()}")
    pg_session.add(conv)
    pg_session.flush()
    old = datetime.now(timezone.utc) - timedelta(days=40)
    pg_session.add_all([
        ConversationMessage(conversation_id=conv.id, sender_role="CUSTOMER", text="old", created_at=old),
        ConversationMessage(conversation_id=conv.id, sender_role="CUSTOMER", text="new"),
    ])
    pg_session.flush()
    C.purge_old_conversation_messages(pg_session)
    left = [m.text for m in pg_session.query(ConversationMessage).filter(ConversationMessage.conversation_id == conv.id).all()]
    assert left == ["new"]


def test_search_finds_words_in_my_chats_only(booking, client_with_db):
    b = booking
    cid = client_with_db.post(f"/api/conversations/booking/{b.order.id}", headers=_auth("customer", b.customer)).json()["id"]
    client_with_db.post(f"/api/conversations/{cid}/messages", json={"text": "luggage is heavy"}, headers=_auth("customer", b.customer))
    mine = client_with_db.get("/api/conversations/search?q=luggage", headers=_auth("customer", b.customer)).json()
    assert [r["text"] for r in mine] == ["luggage is heavy"]
    assert client_with_db.get("/api/conversations/search?q=luggage", headers=_auth("customer", _customer(b.db))).json() == []
