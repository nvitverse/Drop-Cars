"""The whole vendor journey, the way the owner will see it: sign up, wait for approval, get approved by the owner, post a booking, the owner sees that
booking with the vendor's details and the trip codes, the vendor invoices their customer in their own name, the owner sees and can control that invoice,
the vendor asks for a payout and the owner sees the request."""
import uuid
from datetime import datetime, timedelta, timezone

from app.core.security import create_access_token
from app.models.admin import Admin


def _admin(db):
    a = Admin(username=f"owner-{uuid.uuid4().hex[:6]}", password="x", role="Owner", phone="9000000000", email="o@o.o")
    db.add(a)
    db.flush()
    return a


def _auth(kind, account):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(account.id), "user": kind, "token_version": getattr(account, "token_version", 1) or 1})}


def test_vendor_journey_with_the_owner_seeing_and_controlling_everything(pg_session, client_with_db, monkeypatch):
    db, c = pg_session, client_with_db
    digits = str(uuid.uuid4().int)
    phone = "9" + digits[:9]

    # 1. sign-up: the account starts as Pending and cannot post
    r = c.post("/api/users/vendor/signup", data={"full_name": "Journey Vendor", "primary_number": phone, "password": "Test@1234", "address": "12 Anna Salai Chennai",
                                                   "city": "Chennai", "pincode": "600002", "aadhar_number": (digits[9:21] + "000000000000")[:12], "gpay_number": phone})
    assert r.status_code == 201, r.text
    body = r.json()
    token = body["access_token"]
    from app.models.vendor import VendorCredentials
    vendor_id = str(db.query(VendorCredentials).filter(VendorCredentials.primary_number == phone).first().id)     # the account id (the signup reply carries the details-row id)
    assert body["vendor"]["account_status"] == "Pending"
    vh = {"Authorization": f"Bearer {token}"}
    monkeypatch.setattr("app.crud.new_orders.get_distance_km_between_locations", lambda a, b: (320.0, "6 hours"))
    payload = {"trip_type": "Oneway", "car_type": "SEDAN_4_PLUS_1", "pickup_drop_location": {"0": "Chennai", "1": "Madurai"},
               "start_date_time": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(), "customer_name": "Mr Ravi", "customer_number": "9000011111",
               "cost_per_km": 14, "driver_allowance": 400, "send_to": "ALL", "max_time_to_assign_order": 30, "toll_charge_update": False}
    pending = c.post("/api/orders/oneway/confirm", headers=vh, json=payload)
    assert pending.status_code in (401, 403), f"a Pending vendor must not post bookings, got {pending.status_code} {pending.text[:200]}"

    # 2. the owner approves
    owner = _admin(db)
    oh = _auth("admin", owner)
    ok = c.patch(f"/api/admin/vendors/{vendor_id}/account-status", headers=oh, json={"account_status": "ACTIVE"})
    assert ok.status_code == 200, ok.text
    signin = c.post("/api/users/vendor/signin", json={"primary_number": phone, "password": "Test@1234"})
    assert signin.status_code == 200 and signin.json()["vendor"]["account_status"] == "Active"
    vh = {"Authorization": f"Bearer {signin.json()['access_token']}"}

    # 3. the vendor posts a booking
    posted = c.post("/api/orders/oneway/confirm", headers=vh, json=payload)
    assert posted.status_code == 201, posted.text
    order_id = posted.json().get("order_id") or posted.json().get("id")
    assert order_id, posted.json()

    # 4. the owner sees that booking WITH the vendor's details, and the trip codes once they exist
    from app.models.orders import Order
    order = db.query(Order).filter(Order.id == order_id).first()
    order.start_trip_otp, order.end_trip_otp = "4821", "9035"
    db.flush()
    detail = c.get(f"/api/orders/admin/{order_id}", headers=oh)
    assert detail.status_code == 200, detail.text
    d = detail.json()
    assert d["vendor"]["full_name"] == "Journey Vendor" and d["vendor"]["primary_number"] == phone
    assert d["customer_name"] == "Mr Ravi" and d["start_otp"] == "4821" and d["end_otp"] == "9035"
    mine = c.get(f"/api/orders/vendor/{order_id}", headers=vh)
    assert mine.status_code == 200 and mine.json()["start_trip_otp"] == "4821"          # the poster reads the code to the customer
    assert c.get(f"/api/orders/admin/{order_id}", headers=vh).status_code in (401, 403)  # but a vendor can never use the admin view

    # 5. the vendor invoices their customer in their own name
    vb = "/api/users/vendor/billing"
    c.put(f"{vb}/profile", headers=vh, json={"name": "Journey Cabs", "upi_id": "journey@okaxis"})
    pre = c.get(f"{vb}/prefill?ref={order_id}", headers=vh)
    assert pre.status_code == 200 and pre.json()["customer"]["name"] == "Mr Ravi"
    doc = c.post(f"{vb}/documents", headers=vh, json={"doc_type": "INVOICE", "booking_ref": str(order_id), "customer": {"name": "Mr Ravi", "phone": "9000011111"},
                                                      "lines": [{"label": "Km fare (320 km x Rs 14)", "amount": 4480, "kind": "FARE"}, {"label": "Driver bata", "amount": 400, "kind": "CHARGE"}]}).json()
    issued = c.post(f"{vb}/documents/{doc['id']}/issue", headers=vh).json()
    assert issued["status"] == "ISSUED" and issued["totals"]["total_amount"] == 4880 and issued["brand"]["name"] == "Journey Cabs"
    c.post(f"{vb}/documents/{doc['id']}/payments", headers=vh, json={"amount": 2000, "mode": "UPI", "ref": "UTR9"})

    # 6. the owner sees it in the vendors' documents, can open it, and cannot mistake it for a staff document
    allv = c.get("/api/admin/billing/documents?scope=vendor", headers=oh).json()
    row = next(x for x in allv if x["id"] == doc["id"])
    assert row["created_by"] == "Journey Cabs" and row["balance_due"] == 2880 and row["vendor_id"] == vendor_id
    assert doc["id"] not in [x["id"] for x in c.get("/api/admin/billing/documents", headers=oh).json()]
    opened = c.get(f"/api/admin/billing/documents/{doc['id']}", headers=oh).json()
    assert opened["vendor_id"] == vendor_id and opened["customer"]["name"] == "Mr Ravi"
    assert c.get(f"/api/admin/billing/documents/{doc['id']}/pdf", headers=oh).content.startswith(b"%PDF")
    link = c.post(f"/api/admin/billing/documents/{doc['id']}/links", headers=oh, json={"purpose": "BALANCE"})
    assert link.status_code == 409                                                     # no platform payment link on a vendor's invoice
    profiles = c.get("/api/admin/billing/vendor-profiles", headers=oh).json()
    mine_p = next(p for p in profiles if p["vendor_id"] == vendor_id)
    assert mine_p["business_name"] == "Journey Cabs" and mine_p["invoices"] == 1 and mine_p["billed"] == 4880 and mine_p["to_collect"] == 2880

    # 7. the owner switches this vendor's invoicing off: they cannot make or issue new documents, but can still read what exists
    off = c.put(f"/api/admin/billing/vendor-profiles/{mine_p['brand_id']}/active", headers=oh, json={"active": False})
    assert off.status_code == 200 and off.json()["is_active"] is False
    blocked = c.post(f"{vb}/documents", headers=vh, json={"doc_type": "INVOICE", "lines": [{"label": "Fare", "amount": 100, "kind": "FARE"}]})
    assert blocked.status_code == 403 and "switched off" in blocked.text
    assert c.get(f"{vb}/options", headers=vh).json()["enabled"] is False
    assert c.get(f"{vb}/documents/{doc['id']}", headers=vh).status_code == 200
    c.put(f"/api/admin/billing/vendor-profiles/{mine_p['brand_id']}/active", headers=oh, json={"active": True})

    # 8. payout: the vendor asks, the owner sees the request with the vendor's details
    from app.models.vendor_details import VendorDetails
    vd = db.query(VendorDetails).filter(VendorDetails.primary_number == phone).first()
    vd.wallet_balance = 3000
    db.flush()
    c.put("/api/users/vendor/payment-details", headers=vh, json={"upi_id": "journey@okaxis"})
    pr = c.post("/api/users/vendor/payout-request", headers=vh, json={"amount": 2000})
    assert pr.status_code == 201, pr.text
    queue = c.get("/api/admin/payout-requests", headers=oh)
    assert queue.status_code == 200
    mine_req = [x for x in queue.json() if str(x.get("vendor_id")) == vendor_id]
    assert mine_req and mine_req[0]["amount"] == 2000 and mine_req[0].get("upi_id") == "journey@okaxis"
