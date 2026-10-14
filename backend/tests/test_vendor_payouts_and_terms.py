"""Vendor App launch pieces: payout info / saved payment details, the public support contact, and the editable vendor terms."""
import uuid

from app.core.security import create_access_token
from app.models.vendor import VendorCredentials
from app.models.vendor_details import VendorDetails


def _vendor(db, phone=None):
    from app.crud.vendor import create_vendor  # noqa: F401  (import check only)
    from app.schemas.vendor import VendorSignupForm
    digits = str(uuid.uuid4().int)
    phone = phone or "9" + digits[:9]
    aadhar = (digits[9:21] + "000000000000")[:12]
    form = VendorSignupForm(full_name="Test Vendor", primary_number=phone, password="Test@1234", address="12 Anna Salai Chennai",
                            city="Chennai", pincode="600002", aadhar_number=aadhar, gpay_number=phone)
    creds, details = create_vendor(db, form, None)
    creds.account_status = type(creds.account_status).ACTIVE        # approved by the owner (a Pending vendor can do nothing but wait)
    db.flush()
    return creds, details


def _auth(creds):
    return {"Authorization": "Bearer " + create_access_token({"sub": str(creds.id), "token_version": creds.token_version, "user": "vendor"})}


def test_payout_info_and_payment_details_round_trip(pg_session, client_with_db):
    creds, details = _vendor(pg_session)
    h = _auth(creds)

    info = client_with_db.get("/api/users/vendor/payout-info", headers=h)
    assert info.status_code == 200, info.text
    body = info.json()
    assert body["balance"] == 0 and body["max_redeemable"] == 0
    assert body["pending_request"] is None and body["payment_details_saved"] is False

    saved = client_with_db.put("/api/users/vendor/payment-details", headers=h, json={"upi_id": "vendor@okaxis"})
    assert saved.status_code == 200
    got = client_with_db.get("/api/users/vendor/payment-details", headers=h).json()
    assert got["upi_id"] == "vendor@okaxis"
    assert client_with_db.get("/api/users/vendor/payout-info", headers=h).json()["payment_details_saved"] is True


def test_payout_request_respects_retained_balance(pg_session, client_with_db):
    creds, details = _vendor(pg_session)
    h = _auth(creds)
    details.wallet_balance = 1500
    pg_session.flush()
    info = client_with_db.get("/api/users/vendor/payout-info", headers=h).json()
    assert info["balance"] == 1500
    assert info["max_redeemable"] == 1500 - info["keep_in_wallet"]

    too_much = client_with_db.post("/api/users/vendor/payout-request", headers=h, json={"amount": 1500})
    assert too_much.status_code == 400
    ok = client_with_db.post("/api/users/vendor/payout-request", headers=h, json={"amount": info["max_redeemable"]})
    assert ok.status_code == 201, ok.text
    assert client_with_db.get("/api/users/vendor/payout-info", headers=h).json()["pending_request"]["amount"] == info["max_redeemable"]


def test_public_support_contact_has_no_made_up_number(client_with_db):
    r = client_with_db.get("/api/public/support-contact")
    assert r.status_code == 200
    d = r.json()
    assert d["phone"] and d["email"]
    assert "98765" not in d["phone"] and d["phone_dial"].startswith("+")


def test_vendor_terms_default_is_real_text_with_placeholders_filled(client_with_db):
    r = client_with_db.get("/api/public/app-content/vendor_terms?lang=en")
    assert r.status_code == 200
    d = r.json()
    assert "VENDOR PARTNER TERMS" in d["body"].upper()
    assert "{support_phone}" not in d["body"] and "{commission_min}" not in d["body"]
    ta = client_with_db.get("/api/public/app-content/vendor_terms?lang=ta").json()
    assert "வெண்டர்" in ta["body"]


def test_statement_comes_from_the_ledger_and_customer_message_is_own_booking_only(pg_session, client_with_db):
    from app.models.vendor_wallet_ledger import VendorWalletLedger, VendorLedgerEntryType
    creds, details = _vendor(pg_session)
    other, _ = _vendor(pg_session)
    h = _auth(creds)
    pg_session.add(VendorWalletLedger(vendor_id=creds.id, entry_type=VendorLedgerEntryType.CREDIT, amount=420, balance_before=0, balance_after=420, notes="Trip 1 vendor profit"))
    pg_session.add(VendorWalletLedger(vendor_id=creds.id, entry_type=VendorLedgerEntryType.DEBIT, amount=100, balance_before=420, balance_after=320, notes="adjust"))
    pg_session.flush()
    from datetime import datetime
    now = datetime.utcnow()
    st = client_with_db.get(f"/api/users/vendor/reports/monthly-statement?year={now.year}&month={now.month}", headers=h)
    assert st.status_code == 200, st.text
    s = st.json()["summary"]
    assert s["earned"] == 420 and s["deducted"] == 100 and s["net"] == 320 and s["closing_balance"] == 320
    e = client_with_db.get("/api/users/vendor/reports/earnings-summary", headers=h).json()
    assert e["this_month"]["earned"] == 420 and e["open_bookings"] == 0

    from tests.test_vendor_billing import _order
    mine = _order(pg_session, creds.id, "Customer A")
    theirs = _order(pg_session, other.id, "Customer B")
    m = client_with_db.get(f"/api/users/vendor/orders/{mine.id}/customer-message", headers=h)
    assert m.status_code == 200, m.text
    assert "Customer A" in m.json()["message"] and "Chennai" in m.json()["message"] and "track" not in m.json()["message"].lower()
    assert client_with_db.get(f"/api/users/vendor/orders/{theirs.id}/customer-message", headers=h).status_code == 404


def test_a_vendor_cannot_approve_their_own_aadhaar(pg_session, client_with_db):
    creds, _ = _vendor(pg_session)
    r = client_with_db.patch("/api/users/vendor/document-status", headers=_auth(creds), json={"status": "VERIFIED"})
    assert r.status_code == 403
