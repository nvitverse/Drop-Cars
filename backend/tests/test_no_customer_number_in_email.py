"""Owner rule 2026-10-24: a customer's phone number is NEVER put in an e-mail to anyone (a driver's accept e-mail used to carry it).
It is shown in the app only, at the reveal time."""
import pathlib
from types import SimpleNamespace

APP = pathlib.Path(__file__).resolve().parents[1] / "app"


def test_the_accept_email_has_the_customer_name_but_never_the_number(monkeypatch):
    from app.utils import trip_emails
    sent = []
    monkeypatch.setattr(trip_emails, "_safe_send", lambda db, owner_id, subject, body: sent.append(body))
    order = SimpleNamespace(id=77, trip_type=SimpleNamespace(value="Oneway"), customer_name="Ravi", customer_number="9876543210",
                            pickup_drop_location={"pickup": "Chennai", "drop": "Madurai"}, start_date_time=None, vendor_price=3000, advance_received=500)
    trip_emails.send_trip_accepted_email(None, "owner-1", order)
    assert sent and "Ravi" in sent[0]
    assert "9876543210" not in sent[0]


def test_the_e_mail_builders_never_read_the_customer_number():
    for rel in ("utils/trip_emails.py", "utils/customer_bill_email.py"):
        src = (APP / rel).read_text(encoding="utf-8")
        assert "customer_number" not in src.replace("# the customer's phone number", ""), rel + " touches customer_number"
        assert "customer_phone" not in src, rel + " touches customer_phone"


def test_the_emailed_invoice_pdf_does_not_print_the_phone():
    src = (APP / "utils/pdf_invoice.py").read_text(encoding="utf-8")
    assert "cust_phone = ''" in src


def test_the_auto_assignment_whatsapp_does_not_carry_the_customer_number():
    from app.utils import whatsapp_notifier
    sent = []
    orig = whatsapp_notifier.send_whatsapp_message
    whatsapp_notifier.send_whatsapp_message = lambda phone, body: sent.append(body) or {"success": True}
    try:
        whatsapp_notifier.send_driver_assignment_whatsapp("9000000001", "Driver", "Chennai", "Madurai", "55", customer_name="Ravi", customer_phone="9876543210", estimated_fare=2500)
    finally:
        whatsapp_notifier.send_whatsapp_message = orig
    assert sent and "Ravi" in sent[0] and "9876543210" not in sent[0]
