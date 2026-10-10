"""Web execution portal: a booking handed to someone outside the apps, from the link to the customer's rating."""
import json
from datetime import datetime, timedelta, timezone

import pytest

from app.crud import portal_trips as P


@pytest.fixture(autouse=True)
def _quiet(pg_session, monkeypatch):
    from app.models.portal_trip import PortalTrip
    from app.models.unaccepted_case import UnacceptedCase
    PortalTrip.__table__.create(bind=pg_session.get_bind(), checkfirst=True)
    UnacceptedCase.__table__.create(bind=pg_session.get_bind(), checkfirst=True)
    monkeypatch.setattr(P, "notify_admins", lambda *a, **k: None)
    monkeypatch.delenv("RAZORPAY_KEY_ID", raising=False)               # no real Razorpay call from a test
    monkeypatch.delenv("RAZORPAY_KEY_SECRET", raising=False)
    import app.utils.website_status_webhook as w
    monkeypatch.setattr(w, "notify_website_of_status", lambda *a, **k: None, raising=False)


def _order(db, hours_ahead):
    from app.models.orders import Order, OrderSourceEnum, Trip_status
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    o = Order(source=OrderSourceEnum.NEW_ORDERS, source_order_id=0, trip_type=OrderTypeEnum.ONEWAY, car_type=CarTypeEnum.SEDAN_4_PLUS_1,
              pickup_drop_location={"0": "Chennai", "1": "Vellore"}, start_date_time=datetime.now(timezone.utc) + timedelta(hours=hours_ahead),
              customer_name="Kumar", customer_number="9000000001", trip_status=Trip_status.PENDING, estimated_price=2500, vendor_price=2800)
    db.add(o)
    db.flush()
    return o


def _api(client, token, path="", method="get", **kw):
    return getattr(client, method)(f"/api/portal/{token}{path}", **kw)


GOOD = {"name": "Murugan S", "phone": "9876543210", "vehicle_number": "tn 01 ab 1234", "vehicle_model": "Dzire"}


def test_the_whole_trip_through_the_link(pg_session, client_with_db):
    c = client_with_db
    o = _order(pg_session, hours_ahead=1)                       # pickup is close, so the customer's number is already open
    pt = P.create_link(pg_session, o.id, "tester")
    assert P.create_link(pg_session, o.id, "tester").token == pt.token            # asking again gives the same link
    tok = pt.token

    v = _api(c, tok).json()
    assert v["status"] == "OPEN" and v["route"] and v["commission_due"] == 280 and v["customer"] is None
    assert not [k for k in v if "otp" in k.lower()] and "otp" not in json.dumps(v).lower().replace("customer_notice", "")      # the OTPs never go to the executor

    assert _api(c, tok, "/take", "post", json={**GOOD, "phone": "12345"}).status_code == 422
    assert _api(c, tok, "/take", "post", json={**GOOD, "vehicle_number": "BAD"}).status_code == 422
    assert _api(c, tok, "/take", "post", json=GOOD).status_code == 200
    assert _api(c, tok, "/take", "post", json={**GOOD, "name": "Someone Else"}).status_code == 409        # the first person wins

    v = _api(c, tok).json()
    assert v["status"] == "TAKEN" and v["executor"]["vehicle_number"] == "TN01AB1234" and v["customer"] is None and v["pay"] is not None
    assert "Pay the commission" in v["customer_notice"]
    assert _api(c, tok, "/start", "post", data={"otp": pt.start_otp, "km": "100"}).status_code == 402          # not before the commission is paid

    assert _api(c, tok, "/pay", "post", json={"utr": "12"}).status_code == 422
    assert _api(c, tok, "/pay", "post", json={"utr": "UTR1234567890"}).status_code == 200
    assert _api(c, tok).json()["commission_status"] == "REPORTED"
    assert _api(c, tok, "/start", "post", data={"otp": pt.start_otp, "km": "100"}).status_code == 402          # a reported UTR is not enough: staff confirm

    P.confirm_payment(pg_session, o.id, "tester", True)
    v = _api(c, tok).json()
    assert v["commission_status"] == "CONFIRMED" and v["customer"] == {"name": "Kumar", "phone": "9000000001"}

    wrong = "0000" if pt.start_otp != "0000" else "1111"
    assert _api(c, tok, "/start", "post", data={"otp": wrong, "km": "100"}).status_code == 400
    assert _api(c, tok, "/location", "post", json={"lat": 12.9, "lng": 80.2}).status_code == 200
    assert _api(c, tok, "/start", "post", data={"otp": pt.start_otp, "km": "1000"}).status_code == 200
    assert _api(c, tok, "/start", "post", data={"otp": pt.start_otp, "km": "1000"}).status_code == 409
    assert _api(c, tok, "/end", "post", data={"otp": pt.end_otp, "km": "900"}).status_code == 422             # below the start reading
    assert _api(c, tok, "/end", "post", data={"otp": wrong, "km": "1300"}).status_code == 400
    assert _api(c, tok, "/end", "post", data={"otp": pt.end_otp, "km": "1300"}).status_code == 200
    v = _api(c, tok).json()
    assert v["status"] == "ENDED" and v["end_km"] - v["start_km"] == 300 and "<svg" in v["feedback_qr_svg"] and v["feedback_url"].endswith(f"/p/{tok}/feedback")

    assert _api(c, tok, "/feedback", "post", json={"rating": 6}).status_code == 422
    assert _api(c, tok, "/feedback", "post", json={"rating": 5, "text": "Good trip"}).status_code == 200
    assert _api(c, tok).json()["rating"] == 5


def test_the_customers_number_waits_for_its_reveal_time_even_after_payment(pg_session, client_with_db):
    c = client_with_db
    o = _order(pg_session, hours_ahead=48)
    tok = P.create_link(pg_session, o.id, "tester").token
    assert _api(c, tok, "/take", "post", json=GOOD).status_code == 200
    P.confirm_payment(pg_session, o.id, "tester", True)
    v = _api(c, tok).json()
    assert v["customer"] is None and "opens" in v["customer_notice"].lower() or "shown" in (v["customer_notice"] or "").lower()


def test_pages_and_bad_tokens(pg_session, client_with_db):
    c = client_with_db
    o = _order(pg_session, hours_ahead=5)
    tok = P.create_link(pg_session, o.id, "tester").token
    html = c.get(f"/p/{tok}")
    assert html.status_code == 200 and "Drop Cars" in html.text and tok in html.text and 'MODE="trip"' in html.text
    assert 'MODE="feedback"' in c.get(f"/p/{tok}/feedback").text
    assert _api(c, "nope-nope-nope").status_code == 404
    assert c.get('/p/"><script>alert(1)</script>').status_code in (200, 404)
    assert "<script>alert" not in c.get('/p/x"><script>alert(1)</script>').text.replace('<script>\nvar MODE', "")


def test_the_customer_message_has_both_otps_and_the_group_message_gets_the_link(pg_session, client_with_db):
    from app.crud import unaccepted_desk as D
    o = _order(pg_session, hours_ahead=5)
    out = D.share(pg_session, o.id, "tester", "https://api.example.com")
    assert out["web_link"].startswith("https://api.example.com/p/") and out["web_link"] in out["message"]
    pt = P.by_token(pg_session, out["web_link"].rsplit("/", 1)[1])
    pt.exec_name, pt.exec_phone, pt.exec_vehicle_number = "Murugan", "9876543210", "TN01AB1234"
    m = P.customer_message(pg_session, pt, "https://api.example.com")
    assert pt.start_otp in m["message"] and pt.end_otp in m["message"] and "/feedback" in m["message"] and m["whatsapp_url"].startswith("https://wa.me/919000000001")
    assert pt.start_otp not in out["message"]                                    # the group never sees the OTPs


def test_guessing_the_otp_is_stopped_after_five_wrong_tries(pg_session, client_with_db):
    c = client_with_db
    o = _order(pg_session, hours_ahead=1)
    pt = P.create_link(pg_session, o.id, "tester")
    assert _api(c, pt.token, "/take", "post", json=GOOD).status_code == 200
    P.confirm_payment(pg_session, o.id, "tester", True)
    wrong = "0000" if pt.start_otp != "0000" else "1111"
    codes = [_api(c, pt.token, "/start", "post", data={"otp": wrong, "km": "10"}).status_code for _ in range(6)]
    assert codes == [400] * 5 + [429]
    assert _api(c, pt.token, "/start", "post", data={"otp": pt.start_otp, "km": "10"}).status_code == 429       # even the right code waits


def test_commission_can_be_paid_online_through_razorpay_and_confirms_itself(pg_session, client_with_db, monkeypatch):
    from app.utils import razorpay_client as rc
    monkeypatch.setenv("RAZORPAY_KEY_ID", "k")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "s")
    made, state = [], {"status": "created"}
    monkeypatch.setattr(rc.RazorpayClient, "create_payment_link", lambda self, **kw: made.append(kw) or {"id": "plink_1", "short_url": "https://rzp.io/i/abc"})
    monkeypatch.setattr(rc.RazorpayClient, "get_payment_link", lambda self, link_id: {"status": state["status"], "payments": [{"payment_id": "pay_9", "status": "captured"}]})
    c = client_with_db
    o = _order(pg_session, hours_ahead=1)
    tok = P.create_link(pg_session, o.id, "tester").token
    assert _api(c, tok, "/take", "post", json=GOOD).status_code == 200
    v = _api(c, tok).json()
    assert v["pay"]["online_link"] == "https://rzp.io/i/abc" and made[0]["amount_rupees"] == 280 and v["commission_status"] == "PENDING" and v["customer"] is None
    state["status"] = "paid"                                                   # the executor paid in Razorpay: no staff tap needed
    v = _api(c, tok).json()
    assert v["commission_status"] == "CONFIRMED" and v["customer"]["phone"] == "9000000001"
    assert len(made) == 1                                                       # one link per booking, not one per refresh
