"""The validity date printed on a document is READ and saved, and a typed date that is already past (a new vehicle's policy START date typed as
the expiry) no longer makes a valid document INVALID / the car INACTIVE (owner 2026-10-24)."""
from datetime import date, timedelta

from app.utils import document_verifier as dv


def _fake_reading(monkeypatch, text):
    monkeypatch.setattr(dv, "check_is_original_color", lambda b: (True, 1.0))
    monkeypatch.setattr(dv, "check_is_clear", lambda b: (True, 500.0))
    monkeypatch.setattr(dv, "_ai_facts", lambda b, k: None)
    monkeypatch.setattr(dv, "read_document_text", lambda b: text)


def _policy_text(start: date, end: date) -> str:
    f = lambda d: d.strftime("%d/%m/%Y")
    return (f"MOTOR INSURANCE POLICY CERTIFICATE Policy No P123456789 Vehicle Reg TN83MF4460 Insured Name RAMESH "
            f"Period of insurance from {f(start)} to {f(end)} valid upto {f(end)} Premium paid")


def test_typed_start_date_is_ignored_and_the_printed_end_date_is_read(monkeypatch):
    today = date.today()
    start, end = today - timedelta(days=5), today + timedelta(days=360)
    _fake_reading(monkeypatch, _policy_text(start, end))
    res = dv.verify_uploaded_document(b"x", "insurance", expected_expiry_date=start.isoformat())
    assert res["status"] == "VERIFIED" and not res.get("is_expired"), res
    assert res["expiry_trusted"] and res["extracted_expiry_date"] == end.isoformat()
    assert dv.get_auto_verification(b"x", "insurance", expected_expiry_date=start.isoformat())[0].value == "VERIFIED"
    assert dv.last_extracted_expiry() == end.isoformat()


def test_nothing_typed_still_reads_the_date(monkeypatch):
    today = date.today()
    end = today + timedelta(days=200)
    _fake_reading(monkeypatch, _policy_text(today - timedelta(days=100), end))
    res = dv.verify_uploaded_document(b"x", "insurance")
    assert res["status"] == "VERIFIED" and not res.get("is_expired")
    assert res["expiry_trusted"] and res["extracted_expiry_date"] == end.isoformat()


def test_a_really_expired_document_stays_expired(monkeypatch):
    today = date.today()
    _fake_reading(monkeypatch, _policy_text(today - timedelta(days=400), today - timedelta(days=30)))
    res = dv.verify_uploaded_document(b"x", "insurance", expected_expiry_date=(today + timedelta(days=100)).isoformat())
    assert res["status"] == "INVALID" and res.get("is_expired")
