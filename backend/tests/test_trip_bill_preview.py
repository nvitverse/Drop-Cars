"""'Generate bill' on the End Trip screen: the customer-safe bill of a close that has NOT happened yet. It must show the booking's rate AND
the extra rate (and bata + extra bata) as one customer figure, ask for a reason when the km is far from the route, and change nothing."""
import uuid
from datetime import datetime, timedelta, timezone

from tests.test_trip_exceptions import _admin, _auth, _phone


def _booking_with_open_trip(db, c, monkeypatch, cost_per_km=14, bata=400):
    from app.models.end_records import EndRecord
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.vendor import VendorCredentials
    from app.models.car_driver import CarDriver

    digits = str(uuid.uuid4().int)
    vphone = "9" + digits[:9]
    r = c.post("/api/users/vendor/signup", data={"full_name": "Prev Vendor", "primary_number": vphone, "password": "Test@1234", "address": "12 Anna Salai Chennai",
                                                   "city": "Chennai", "pincode": "600002", "aadhar_number": (digits[9:21] + "000000000000")[:12], "gpay_number": vphone})
    assert r.status_code == 201, r.text
    vendor_id = str(db.query(VendorCredentials).filter(VendorCredentials.primary_number == vphone).first().id)
    admin = _admin(db)
    assert c.patch(f"/api/admin/vendors/{vendor_id}/account-status", headers=_auth("admin", admin), json={"account_status": "ACTIVE"}).status_code == 200
    vh = {"Authorization": f"Bearer {c.post('/api/users/vendor/signin', json={'primary_number': vphone, 'password': 'Test@1234'}).json()['access_token']}"}
    monkeypatch.setattr("app.crud.new_orders.get_distance_km_between_locations", lambda a, b: (320.0, "6 hours"))
    posted = c.post("/api/orders/oneway/confirm", headers=vh, json={
        "trip_type": "Oneway", "car_type": "SEDAN_4_PLUS_1", "pickup_drop_location": {"0": "Chennai", "1": "Madurai"},
        "start_date_time": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(), "customer_name": "Mr Ravi", "customer_number": "9000011111",
        "cost_per_km": cost_per_km, "driver_allowance": bata, "send_to": "ALL", "max_time_to_assign_order": 30, "toll_charge_update": False})
    assert posted.status_code == 201, posted.text
    order_id = posted.json().get("order_id") or posted.json().get("id")

    owner = VehicleOwnerCredentials(primary_number=_phone(), hashed_password="x")
    db.add(owner)
    db.flush()
    db.add(VehicleOwnerDetails(vehicle_owner_id=owner.id, full_name="Fleet", primary_number=owner.primary_number, aadhar_number="A" + str(uuid.uuid4().int)[:11],
                               address="x", city="Chennai", pincode="600001", wallet_balance=5000))
    drv = CarDriver(vehicle_owner_id=owner.id, full_name="Chella", primary_number=_phone(), hashed_password="x", licence_number="TN" + uuid.uuid4().hex[:12],
                    address="a", city="Chennai", pincode="600001")
    db.add(drv)
    db.flush()
    db.add(OrderAssignment(order_id=order_id, vehicle_owner_id=owner.id, driver_id=drv.id, assignment_status=AssignmentStatusEnum.DRIVING,
                           assigned_at=datetime.utcnow(), held_amount=0))
    db.add(EndRecord(order_id=order_id, driver_id=drv.id, start_km=1000, end_km=0, contact_number="x", img_url="x"))
    db.commit()
    return order_id, owner, drv


def test_preview_shows_the_customer_bill_and_changes_nothing(pg_session, client_with_db, monkeypatch):
    from app.crud.wallet import get_owner_balance
    from app.models.end_records import EndRecord
    from app.models.orders import Order
    db, c = pg_session, client_with_db
    order_id, owner, drv = _booking_with_open_trip(db, c, monkeypatch)
    wallet_before = get_owner_balance(db, str(owner.id))

    r = c.post(f"/api/assignments/driver/trip-bill-preview/{order_id}", headers=_auth("driver", drv), json={"end_km": 1330})
    assert r.status_code == 200, r.text
    bill = r.json()
    assert bill["distance_check"] is None
    assert bill["km_driven"] == 330
    labels = [l["label"] for l in bill["lines"]]
    assert any(l.startswith("Distance 330 km x Rs 14") for l in labels), labels
    assert any("bata" in l.lower() for l in labels)
    assert bill["total"] >= 330 * 14 + 400
    assert bill["cash_to_collect"] == max(0, bill["total"] - bill["advance_received"])
    # the customer may be looking at the driver's phone: no driver / commission / payout figure anywhere
    flat = str(bill).lower()
    for word in ("commission", "commision", "driver_profit", "driver_net", "platform_fee", "poster_share", "wallet"):
        assert word not in flat, word

    # nothing was saved or moved
    db.expire_all()
    order = db.query(Order).filter(Order.id == order_id).first()
    assert order.trip_status.value == "PENDING" and not order.closed_vendor_price
    assert db.query(EndRecord).filter(EndRecord.order_id == order_id).first().end_km == 0
    assert get_owner_balance(db, str(owner.id)) == wallet_before


def test_preview_asks_for_a_reason_when_the_km_is_far_from_the_route(pg_session, client_with_db, monkeypatch):
    db, c = pg_session, client_with_db
    order_id, owner, drv = _booking_with_open_trip(db, c, monkeypatch)
    far = c.post(f"/api/assignments/driver/trip-bill-preview/{order_id}", headers=_auth("driver", drv), json={"end_km": 1100})   # 100 km vs ~320
    assert far.status_code == 200, far.text
    check = far.json()["distance_check"]
    assert check and check["km_driven"] == 100 and check["route_km"] > 100
    ok = c.post(f"/api/assignments/driver/trip-bill-preview/{order_id}", headers=_auth("driver", drv),
                json={"end_km": 1100, "distance_reason": "Customer changed the route"})
    assert ok.status_code == 200 and ok.json()["distance_check"] is None and ok.json()["km_driven"] == 100


def test_preview_refuses_a_lower_end_km_and_a_stranger(pg_session, client_with_db, monkeypatch):
    db, c = pg_session, client_with_db
    order_id, owner, drv = _booking_with_open_trip(db, c, monkeypatch)
    low = c.post(f"/api/assignments/driver/trip-bill-preview/{order_id}", headers=_auth("driver", drv), json={"end_km": 900})
    assert low.status_code == 400 and "End KM" in low.text
    other_order, _, other_drv = _booking_with_open_trip(db, c, monkeypatch)
    assert c.post(f"/api/assignments/driver/trip-bill-preview/{order_id}", headers=_auth("driver", other_drv), json={"end_km": 1330}).status_code == 404


# ---------------------------------------------------------------- "Taxes & Other Charges" and the customer e-mail
def test_gst_toll_and_the_balance_are_one_line_for_the_customer():
    from app.crud.end_records import lump_taxes_and_extras
    lines = [{"key": "km", "label": "Distance 206 km x Rs 16", "amount": 3296}, {"key": "bata", "label": "Driver bata", "amount": 400},
             {"key": "toll", "label": "Toll (actual, entered by driver)", "amount": 215}, {"label": "Other charges", "amount": 185},
             {"key": "extra_gst", "label": "GST on extra km", "amount": 20}, {"key": "waiting", "label": "Waiting (30 min)", "amount": 60}]
    out = lump_taxes_and_extras(lines)
    labels = [l["label"] for l in out]
    assert labels == ["Distance 206 km x Rs 16", "Driver bata", "Waiting (30 min)", "Taxes & Other Charges"]
    assert out[-1]["amount"] == 215 + 185 + 20
    assert sum(l["amount"] for l in out) == sum(l["amount"] for l in lines)             # only merged, never changed
    # a negative adjustment is left alone, nothing to lump -> no empty line
    neg = lump_taxes_and_extras([{"label": "Distance", "amount": 1000}, {"label": "Adjustment", "amount": -50}])
    assert [l["label"] for l in neg] == ["Distance", "Adjustment"]


def test_the_bill_email_shows_customer_figures_only_and_the_review_link():
    from app.utils.customer_bill_email import render_bill
    bill = {"from": "Tiruvannamalai", "to": "Trichy", "km_driven": 206, "total": 3735, "advance_received": 500, "cash_to_collect": 3235,
            "lines": [{"label": "Distance 206 km x Rs 16", "amount": 3296}, {"label": "Taxes & Other Charges", "amount": 409}, {"label": "Convenience fee", "amount": 30}],
            "extra_charges_paid_directly": [{"label": "Parking", "amount": 40}]}
    text, html = render_bill(bill, 1042, "Ravi", "https://dropcars.in/review/abc")
    for part in ("Distance 206 km x Rs 16", "Taxes & Other Charges", "Total booking amount: Rs 3735", "Balance paid to the driver: Rs 3235", "Parking", "https://dropcars.in/review/abc"):
        assert part in text
    assert "Rate your trip" in html and "Taxes &amp; Other Charges" in html
    low = (text + html).lower()
    for word in ("commission", "driver_net", "payout", "wallet"):
        assert word not in low


def test_the_bill_email_is_sent_only_when_we_know_the_email_and_mail_is_set_up(pg_session, client_with_db, monkeypatch):
    import asyncio
    from app.utils import customer_bill_email as cbe
    db, c = pg_session, client_with_db
    order_id, owner, drv = _booking_with_open_trip(db, c, monkeypatch)
    sent = []
    monkeypatch.setattr(cbe, "_send_with_own_session", lambda to, subject, text, html: sent.append((to, subject)))
    monkeypatch.setattr("app.utils.emailer.smtp_configured", lambda db: True)

    monkeypatch.setattr(cbe, "customer_email_for", lambda db, order: None)
    assert asyncio.run(cbe.send_customer_trip_bill_email(db, order_id)) is False and sent == []          # no e-mail known -> nothing

    monkeypatch.setattr(cbe, "customer_email_for", lambda db, order: "ravi@example.com")
    monkeypatch.setattr("app.utils.emailer.smtp_configured", lambda db: False)
    assert asyncio.run(cbe.send_customer_trip_bill_email(db, order_id)) is False and sent == []          # mail not set up -> nothing

    monkeypatch.setattr("app.utils.emailer.smtp_configured", lambda db: True)
    assert asyncio.run(cbe.send_customer_trip_bill_email(db, order_id)) is True
    assert sent == [("ravi@example.com", f"Drop Cars - your trip bill (Booking #{order_id})")]
