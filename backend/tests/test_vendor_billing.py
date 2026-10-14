"""Vendors can give their customers estimates / invoices in their OWN name: own profile, own bookings only, own numbering, GST only with a GSTIN,
nothing copied into Drop Cars' GST ledger, and never visible to staff lists."""
import uuid
from datetime import datetime, timedelta

from app.core.security import create_access_token
from app.crud import billing_docs as staff_svc
from app.models.billing import BillingBrand, BillingDocument


def _vendor(db, name="Test Vendor"):
    from app.crud.vendor import create_vendor
    from app.schemas.vendor import VendorSignupForm
    digits = str(uuid.uuid4().int)
    phone = "9" + digits[:9]
    form = VendorSignupForm(full_name=name, primary_number=phone, password="Test@1234", address="12 Anna Salai Chennai", city="Chennai", pincode="600002",
                            aadhar_number=(digits[9:21] + "000000000000")[:12], gpay_number=phone)
    creds, details = create_vendor(db, form, None)
    db.flush()
    return creds, details


def _h(creds):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(creds.id), "token_version": creds.token_version, "user": "vendor"})}


def _order(db, vendor_id, customer="Kumar"):
    from app.models.orders import Order, OrderSourceEnum, Trip_status
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    o = Order(source=OrderSourceEnum.NEW_ORDERS, source_order_id=0, trip_type=OrderTypeEnum.ONEWAY, car_type=CarTypeEnum.SEDAN_4_PLUS_1,
              pickup_drop_location={"0": "Chennai", "1": "Vellore"}, start_date_time=datetime.utcnow() + timedelta(hours=5), customer_name=customer,
              customer_number="9000000001", trip_status=Trip_status.PENDING, estimated_price=2500, vendor_price=2800, advance_received=500,
              charge_items=[{"label": "State Tax", "included": False}], vendor_id=vendor_id)
    db.add(o)
    db.flush()
    return o


LINES = [{"label": "Km fare (300 km x Rs 14)", "amount": 4200, "kind": "FARE"}, {"label": "Driver bata", "amount": 400, "kind": "CHARGE"}]


def test_profile_is_created_from_the_account_and_is_the_vendors_own(pg_session, client_with_db):
    creds, details = _vendor(pg_session, "Sri Murugan Travels")
    r = client_with_db.get("/api/users/vendor/billing/profile", headers=_h(creds))
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["name"] == "Sri Murugan Travels" and p["gst_registered"] is False and p["invoice_prefix"].startswith("SMT")
    # a second vendor gets a different prefix and profile
    creds2, _ = _vendor(pg_session, "Sri Murugan Tours")
    p2 = client_with_db.get("/api/users/vendor/billing/profile", headers=_h(creds2)).json()
    assert p2["id"] != p["id"] and p2["invoice_prefix"] != p["invoice_prefix"]
    # staff never see vendor brands
    assert not any(b["id"] in (p["id"], p2["id"]) for b in [staff_svc.brand_dict(x) for x in pg_session.query(BillingBrand).filter(BillingBrand.owner_vendor_id.is_(None)).all()])


def test_estimate_to_invoice_flow_with_own_number_payment_share_pdf(pg_session, client_with_db):
    creds, _ = _vendor(pg_session)
    h = _h(creds)
    client_with_db.put("/api/users/vendor/billing/profile", headers=h, json={"name": "Raja Cabs", "upi_id": "raja@okaxis", "phone": "9876500000"})
    e = client_with_db.post("/api/users/vendor/billing/documents", headers=h, json={"doc_type": "ESTIMATE", "customer": {"name": "Mr Ravi", "phone": "9000011111"},
                                                                                     "lines": LINES, "advance_requested": 1000})
    assert e.status_code == 200, e.text
    est = e.json()
    assert est["status"] == "DRAFT" and est["brand"]["name"] == "Raja Cabs"
    iss = client_with_db.post(f"/api/users/vendor/billing/documents/{est['id']}/issue", headers=h).json()
    assert iss["status"] == "ISSUED" and "-EST/" in iss["number"] and iss["totals"]["total_amount"] == 4600
    inv = client_with_db.post(f"/api/users/vendor/billing/documents/{est['id']}/convert", headers=h).json()
    assert inv["doc_type"] == "INVOICE" and inv["status"] == "ISSUED" and "-EST/" not in inv["number"]
    pay = client_with_db.post(f"/api/users/vendor/billing/documents/{inv['id']}/payments", headers=h, json={"amount": 1000, "mode": "UPI", "ref": "UTR123"}).json()
    assert pay["payment_status"] == "PARTIAL" and pay["totals"]["balance_due"] == 3600
    sh = client_with_db.get(f"/api/users/vendor/billing/documents/{inv['id']}/share", headers=h)
    assert sh.status_code == 200 and "Raja Cabs" in sh.json()["message"] and "/api/billing/public/" in sh.json()["public_url"]
    pdf = client_with_db.get(f"/api/users/vendor/billing/documents/{inv['id']}/pdf", headers=h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    pub = client_with_db.get("/api/billing/public/" + sh.json()["public_url"].rsplit("/", 1)[1])
    assert pub.status_code == 200 and "Raja Cabs" in pub.text and "raja@okaxis" in pub.text


def test_gst_needs_a_gstin_and_never_reaches_the_platform_ledger(pg_session, client_with_db):
    from app.models.tax_invoice import TaxInvoice
    creds, _ = _vendor(pg_session)
    h = _h(creds)
    no = client_with_db.post("/api/users/vendor/billing/documents", headers=h, json={"doc_type": "INVOICE", "lines": LINES, "gst": {"mode": "EXTRA"}})
    assert no.status_code == 422 and "GSTIN" in no.text
    bad = client_with_db.put("/api/users/vendor/billing/profile", headers=h, json={"gstin": "12345"})
    assert bad.status_code == 422
    ok = client_with_db.put("/api/users/vendor/billing/profile", headers=h, json={"gstin": "33AAACD1234E1Z5"})
    assert ok.status_code == 200 and ok.json()["gst_registered"] is True and ok.json()["state_code"] == "33"
    opts = client_with_db.get("/api/users/vendor/billing/options", headers=h).json()
    assert [m["key"] for m in opts["gst_modes"]] == ["NONE", "EXTRA", "INCLUDED"]
    before = pg_session.query(TaxInvoice).count()
    d = client_with_db.post("/api/users/vendor/billing/documents", headers=h, json={"doc_type": "INVOICE", "lines": LINES, "gst": {"mode": "EXTRA"}}).json()
    issued = client_with_db.post(f"/api/users/vendor/billing/documents/{d['id']}/issue", headers=h).json()
    assert issued["totals"]["gst_amount"] == 210 and issued["totals"]["total_amount"] == 4810        # 5% of the km fare only
    assert pg_session.query(TaxInvoice).count() == before                                            # the vendor's GST is the vendor's own


def test_prefill_only_finds_the_vendors_own_bookings(pg_session, client_with_db):
    creds, details = _vendor(pg_session)
    other, _ = _vendor(pg_session)
    mine = _order(pg_session, creds.id, "My Customer")
    theirs = _order(pg_session, other.id, "Their Customer")
    h = _h(creds)
    ok = client_with_db.get(f"/api/users/vendor/billing/prefill?ref={mine.id}", headers=h)
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["customer"]["name"] == "My Customer" and body["trip"]["pickup"] == "Chennai"
    assert not any(l["label"] == "Convenience fee" for l in body["lines"])
    assert any(l["label"] == "State Tax" and l["included"] is False for l in body["lines"])
    assert client_with_db.get(f"/api/users/vendor/billing/prefill?ref={theirs.id}", headers=h).status_code == 404


def test_documents_are_private_and_invisible_to_staff(pg_session, client_with_db):
    creds, _ = _vendor(pg_session)
    other, _ = _vendor(pg_session)
    d = client_with_db.post("/api/users/vendor/billing/documents", headers=_h(creds), json={"doc_type": "INVOICE", "lines": LINES}).json()
    assert client_with_db.get(f"/api/users/vendor/billing/documents/{d['id']}", headers=_h(other)).status_code == 404
    assert client_with_db.get("/api/users/vendor/billing/documents", headers=_h(other)).json() == []
    assert len(client_with_db.get("/api/users/vendor/billing/documents", headers=_h(creds)).json()) == 1
    assert pg_session.query(BillingDocument).filter(BillingDocument.id == uuid.UUID(d["id"])).first().vendor_id == creds.id
    staff_rows = staff_svc.list_documents(pg_session, None, None, None, None, 500, 0)
    assert str(d["id"]) not in [str(r.id) for r in staff_rows]
    s = client_with_db.get("/api/users/vendor/billing/summary", headers=_h(creds)).json()
    assert s["drafts"] == 1 and s["invoices"] == 0


def test_asking_for_the_profile_twice_gives_the_same_one(pg_session, client_with_db):
    from app.api.routes import vendor_billing as vb
    creds, _ = _vendor(pg_session)
    assert vb.vendor_brand(pg_session, creds).id == vb.vendor_brand(pg_session, creds).id
    # and over HTTP, the way the editor asks (profile then options)
    h = _h(creds)
    assert client_with_db.get("/api/users/vendor/billing/profile", headers=h).status_code == 200
    assert client_with_db.get("/api/users/vendor/billing/options", headers=h).status_code == 200
