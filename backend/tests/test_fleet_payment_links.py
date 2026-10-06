"""Standard -> Trusted payment link: creating the link, WhatsApp text, and exactly-once activation when it is paid."""
import uuid
from datetime import date

import pytest

from app.crud import fleet_payment_links as fpl
from app.database.session import SessionLocal
from app.models.fleet_subscription import FleetSubscriptionHistory
from app.models.vehicle_owner import VehicleOwnerCredentials
from app.models.vehicle_owner_details import VehicleOwnerDetails


class _FakeRazorpay:
    status = "created"

    def create_payment_link(self, **kw):
        return {"id": "plink_test_" + uuid.uuid4().hex[:8], "short_url": "https://rzp.io/i/abc123"}

    def get_payment_link(self, link_id):
        return {"id": link_id, "status": _FakeRazorpay.status,
                "payments": [{"payment_id": "pay_test_1", "status": "captured"}] if _FakeRazorpay.status == "paid" else []}


@pytest.fixture()
def owner():
    db = SessionLocal()
    oid = uuid.uuid4()
    phone = "9" + str(uuid.uuid4().int)[:9]
    creds = VehicleOwnerCredentials(id=oid, primary_number=phone, hashed_password="x", reg_id=f"T{uuid.uuid4().hex[:6]}")
    details = VehicleOwnerDetails(vehicle_owner_id=oid, full_name="Test Partner", primary_number=phone,
                                 aadhar_number=str(uuid.uuid4().int)[:12], address="x", city="Chennai", pincode="600001")
    db.add(creds)
    db.flush()
    db.add(details)
    db.commit()
    yield db, oid, phone
    db.query(FleetSubscriptionHistory).filter(FleetSubscriptionHistory.vehicle_owner_id == oid).delete()
    db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == oid).delete()
    db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == oid).delete()
    db.commit()
    db.close()


class _Admin:
    id = None
    username = "tester"
    role = "Owner"


def test_link_then_paid_activates_once(owner, monkeypatch):
    db, oid, phone = owner
    monkeypatch.setenv("RAZORPAY_KEY_ID", "x")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "y")
    monkeypatch.setattr("app.utils.razorpay_client.RazorpayClient", lambda *a, **k: _FakeRazorpay())

    out = fpl.create_payment_link(db, oid, "MONTHLY", 199, _Admin())
    assert out["short_url"] == "https://rzp.io/i/abc123"
    assert out["whatsapp_url"].startswith(f"https://wa.me/91{phone}?text=")
    assert "199" in out["message"] and "Test Partner" in out["message"]

    row = fpl.latest_link_for_owner(db, oid)
    _FakeRazorpay.status = "created"
    assert fpl.check_link(db, row)["status"] == "PENDING"

    _FakeRazorpay.status = "paid"
    first = fpl.check_link(db, row)
    assert first["status"] == "PAID" and first.get("activated")
    second = fpl.check_link(db, row)
    assert second["status"] == "PAID" and not second.get("activated")

    db.expire_all()
    d = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == oid).one()
    assert d.admin_trusted_override is True and d.subscription_type == "MONTHLY"
    assert d.billing_next_date > date.today()
    paid_rows = db.query(FleetSubscriptionHistory).filter(
        FleetSubscriptionHistory.vehicle_owner_id == oid, FleetSubscriptionHistory.event_type == "MANUAL_PAYMENT").count()
    assert paid_rows == 1
    _FakeRazorpay.status = "created"


def test_options_come_from_settings(owner):
    db, _, _ = owner
    opts = fpl.get_options(db)
    assert {p["key"] for p in opts["plans"]} == {"MONTHLY", "YEARLY"}
    assert "Wallet" in opts["channels"]
    assert "{link}" in opts["message_template"]
