"""A driver sends a screenshot to support: it is saved for the staff, read, answered in the chat only when the Help Center is sure, and
otherwise left for a person (never an invented answer)."""
import io
import uuid

from app.core.security import create_access_token


def _driver(db):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.car_driver import CarDriver
    phone = "9" + str(uuid.uuid4().int)[:9]
    o = VehicleOwnerCredentials(primary_number=phone, hashed_password="x")
    db.add(o)
    db.flush()
    db.add(VehicleOwnerDetails(vehicle_owner_id=o.id, full_name="Fleet", primary_number=phone, aadhar_number="A" + str(uuid.uuid4().int)[:11],
                               address="x", city="Chennai", pincode="600001", wallet_balance=0))
    d = CarDriver(vehicle_owner_id=o.id, full_name="Chella", primary_number="8" + str(uuid.uuid4().int)[:9], hashed_password="x",
                  licence_number="TN" + uuid.uuid4().hex[:12], address="a", city="Chennai", pincode="600001")
    db.add(d)
    db.flush()
    return d, {"Authorization": "Bearer " + create_access_token({"sub": str(d.id), "user": "driver", "token_version": d.token_version or 0})}


def _png():
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), "white").save(buf, format="PNG")
    return buf.getvalue()


def _patch_storage(monkeypatch):
    monkeypatch.setattr("app.utils.gcs.upload_image_to_gcs", lambda f, folder="x": f"https://storage.googleapis.com/b/{folder}/{uuid.uuid4().hex}.png")
    monkeypatch.setattr("app.api.routes.support._notify_admins_of_support_message", lambda *a, **k: None)


def test_a_screenshot_about_the_trip_code_is_answered_in_the_chat(pg_session, client_with_db, monkeypatch):
    from app.models.support_message import SupportMessage
    _patch_storage(monkeypatch)
    monkeypatch.setattr("app.utils.screenshot_help._gemini", lambda b: None)
    monkeypatch.setattr("app.utils.screenshot_help._ocr", lambda b: "Chella: otp not accepted\nIncorrect trip start code\nToo many tries")
    d, h = _driver(pg_session)
    r = client_with_db.post("/api/support/screenshot-help", headers=h, files={"file": ("shot.png", _png(), "image/png")}, data={"note": ""})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["answered"] is True and "code" in body["reply"].lower() and body["source"] == "ocr"
    rows = pg_session.query(SupportMessage).filter(SupportMessage.thread_key == str(d.id)).order_by(SupportMessage.id).all()
    assert [m.sender_side for m in rows] == ["DRIVER_OWNER", "ADMIN"]
    assert rows[0].image_url and "chat_media" in rows[0].image_url
    assert rows[1].sender_name == "Drop Cars Assistant (auto)"
    thread = client_with_db.get("/api/support/my-thread", headers=h).json()
    msgs = thread["messages"] if isinstance(thread, dict) else thread
    assert any(m.get("image_url") for m in msgs)


def test_the_customer_cancelled_screenshot_points_to_no_show_not_to_cancel(pg_session, client_with_db, monkeypatch):
    _patch_storage(monkeypatch)
    monkeypatch.setattr("app.utils.screenshot_help._gemini", lambda b: {"question": "Customer cancelled the trip on phone, what should I do", "language": "en"})
    d, h = _driver(pg_session)
    r = client_with_db.post("/api/support/screenshot-help", headers=h, files={"file": ("s.png", _png(), "image/png")}, data={})
    assert r.status_code == 201, r.text
    assert r.json()["answered"] is True and "no-show" in r.json()["reply"].lower() and r.json()["source"] == "ai"


def test_an_unreadable_screenshot_is_left_for_a_person_with_no_invented_answer(pg_session, client_with_db, monkeypatch):
    from app.models.support_message import SupportMessage
    _patch_storage(monkeypatch)
    monkeypatch.setattr("app.utils.screenshot_help._gemini", lambda b: None)
    monkeypatch.setattr("app.utils.screenshot_help._ocr", lambda b: "")
    d, h = _driver(pg_session)
    r = client_with_db.post("/api/support/screenshot-help", headers=h, files={"file": ("s.png", _png(), "image/png")}, data={"note": "see this"})
    assert r.status_code == 201 and r.json()["answered"] is False and r.json()["reply"] is None
    assert pg_session.query(SupportMessage).filter(SupportMessage.thread_key == str(d.id)).count() == 1       # only the driver's own message


def test_only_pictures_and_only_signed_in_people(pg_session, client_with_db, monkeypatch):
    _patch_storage(monkeypatch)
    d, h = _driver(pg_session)
    assert client_with_db.post("/api/support/screenshot-help", headers=h, files={"file": ("a.txt", b"hello", "text/plain")}).status_code == 400
    assert client_with_db.post("/api/support/screenshot-help", files={"file": ("s.png", _png(), "image/png")}).status_code in (401, 403)
