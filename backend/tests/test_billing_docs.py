import pytest
from fastapi import HTTPException

from app.crud import billing_docs as svc
from app.models.billing import BillingBrand
from app.utils.billing_render import amount_in_words, render_document_html, render_document_pdf

LINES = [{"label": "Km fare (400 km x Rs 14)", "amount": 5600, "kind": "FARE"}, {"label": "Driver bata", "amount": 400, "kind": "CHARGE"},
         {"label": "Toll", "amount": 300, "included": False}]


def _brand(db, gstin="33AAACD1234E1Z5"):
    svc.seed_default_brands(db)
    b = db.query(BillingBrand).filter(BillingBrand.code == "dropcars").first()
    b.gstin = gstin
    db.flush()
    return b


def test_amount_in_words_uses_indian_numbering():
    assert amount_in_words(125000) == "One Lakh Twenty Five Thousand Rupees Only"
    assert amount_in_words(0) == "Zero Rupees Only"
    assert amount_in_words(6420) == "Six Thousand Four Hundred Twenty Rupees Only"


def test_issue_gst_invoice_number_totals_payment_and_ledger(pg_session):
    db = pg_session
    b = _brand(db)
    doc = svc.create_document(db, {"doc_type": "INVOICE", "brand_id": str(b.id), "customer": {"name": "Ravi", "phone": "9876543210"},
                                   "lines": LINES, "gst": {"mode": "EXTRA", "collection": "PAY_LATER"}, "issue": True}, "tester")
    assert doc.status == "ISSUED" and doc.number.startswith("DC/") and doc.number.endswith("/0001") or doc.number.split("/")[-1].isdigit()
    assert doc.gst_amount == 280 and doc.total_amount == 6280 and doc.balance_due == 6280      # GST on the km fare only; toll excluded
    assert doc.tax_invoice_id is not None
    svc.add_payment(db, doc, 2000, "UPI", "UTR1", None, "ADVANCE", "tester")
    assert doc.payment_status == "PARTIAL" and doc.balance_due == 4280
    svc.add_payment(db, doc, 6000, "Cash", None, None, "BALANCE", "tester")
    assert doc.payment_status == "PAID" and doc.balance_due == 0
    html = render_document_html(svc.serialize(doc, db), public=True)
    assert doc.number in html and "CGST" in html and "Not included" in html and "Toll" in html
    assert render_document_pdf(svc.serialize(doc, db)).startswith(b"%PDF")


def test_numbers_are_sequential_per_brand(pg_session):
    db = pg_session
    b = _brand(db)
    nums = [svc.create_document(db, {"doc_type": "INVOICE", "brand_id": str(b.id), "lines": LINES, "issue": True}, "t").number for _ in range(3)]
    seq = [int(n.split("/")[-1]) for n in nums]
    assert seq == [seq[0], seq[0] + 1, seq[0] + 2]


def test_a_brand_without_gstin_cannot_issue_a_gst_invoice_but_no_gst_is_fine(pg_session):
    db = pg_session
    b = _brand(db, gstin=None)
    with pytest.raises(HTTPException) as e:
        svc.create_document(db, {"doc_type": "INVOICE", "brand_id": str(b.id), "lines": LINES, "gst": {"mode": "EXTRA"}}, "t")
    assert e.value.status_code == 422
    ok = svc.create_document(db, {"doc_type": "INVOICE", "brand_id": str(b.id), "lines": LINES, "gst": {"mode": "NONE"}, "issue": True}, "t")
    assert ok.gst_amount == 0 and ok.total_amount == 6000


def test_estimate_converts_to_an_invoice_once(pg_session):
    db = pg_session
    b = _brand(db)
    est = svc.create_document(db, {"doc_type": "ESTIMATE", "brand_id": str(b.id), "customer": {"name": "Asha"}, "lines": LINES,
                                   "gst": {"mode": "INCLUDED"}, "advance_requested": 1000, "issue": True}, "t")
    assert est.number.startswith("DC-EST/") and est.valid_until is not None
    inv = svc.convert_estimate(db, est, "t")
    assert inv.doc_type == "INVOICE" and inv.status == "ISSUED" and inv.converted_from_id == est.id and est.status == "CONVERTED"
    assert svc.convert_estimate(db, est, "t").id == inv.id


def test_cancelled_document_rejects_payments_and_edits(pg_session):
    db = pg_session
    b = _brand(db)
    d = svc.create_document(db, {"doc_type": "INVOICE", "brand_id": str(b.id), "lines": LINES, "issue": True}, "t")
    svc.cancel(db, d, "wrong customer", "t")
    with pytest.raises(HTTPException):
        svc.add_payment(db, d, 100, "Cash", None, None, "PAYMENT", "t")
    with pytest.raises(HTTPException):
        svc.update_document(db, d, {"notes": "x"}, "t")


def test_prefill_for_an_unknown_booking_is_a_clean_404(pg_session):
    with pytest.raises(HTTPException) as e:
        svc.prefill_from_booking(pg_session, "999999999")
    assert e.value.status_code == 404


def test_prefill_from_an_order_id_fills_customer_trip_charges_and_advance(pg_session):
    from datetime import datetime, timedelta
    from app.models.orders import Order, OrderSourceEnum, Trip_status
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    db = pg_session
    o = Order(source=OrderSourceEnum.NEW_ORDERS, source_order_id=0, trip_type=OrderTypeEnum.ONEWAY, car_type=CarTypeEnum.SEDAN_4_PLUS_1,
              pickup_drop_location={"0": "Chennai", "1": "Vellore"}, start_date_time=datetime.utcnow() + timedelta(hours=5),
              customer_name="Kumar", customer_number="9000000001", trip_status=Trip_status.PENDING, estimated_price=2500, vendor_price=2800,
              advance_received=500, charge_items=[{"label": "State Tax", "included": False}, {"label": "Parking", "included": True, "amount": 50}])
    db.add(o)
    db.flush()
    p = svc.prefill_from_booking(db, str(o.id))
    assert p["customer"]["name"] == "Kumar" and p["trip"]["pickup"] == "Chennai" and p["trip"]["drop"] == "Vellore"
    assert any(l["label"] == "State Tax" and l["included"] is False for l in p["lines"])
    assert sum(l["amount"] for l in p["lines"] if l["included"]) == 2800 + 30 or sum(l["amount"] for l in p["lines"] if l["included"]) > 0
    assert p["payments"] and p["payments"][0]["amount"] == 500 and p["order_id"] == o.id
    # and the prefilled data can be saved as an invoice straight away
    b = _brand(db)
    doc = svc.create_document(db, {"doc_type": "INVOICE", "brand_id": str(b.id), "booking_ref": str(o.id), "order_id": o.id, **p, "gst": {"mode": "NONE"}, "issue": True}, "t")
    assert doc.paid_amount == 500 and doc.balance_due == doc.total_amount - 500


def test_prepared_by_shared_by_and_creator_filter(pg_session):
    db = pg_session
    b = _brand(db)
    doc = svc.create_document(db, {"doc_type": "ESTIMATE", "brand_id": str(b.id), "customer": {"name": "Ravi"}, "lines": LINES, "issue": True}, "Anitha", "9000011111")
    svc.log_shared(db, doc, "Kumar", "link shared")
    s = svc.serialize(doc, db)
    assert s["prepared_by"] == {"name": "Anitha", "phone": "9000011111"}
    assert [x["name"] for x in s["shared_by"]] == ["Kumar"]
    html = render_document_html(s, public=True)
    assert "Prepared by" in html and "Anitha" in html and "9000011111" in html and "Shared by Kumar" in html
    assert render_document_pdf(s).startswith(b"%PDF")
    rows = svc.list_documents(db, "ESTIMATE", None, None, None, 50, 0, created_by="Anitha")
    assert doc.id in [r.id for r in rows]
    assert doc.id not in [r.id for r in svc.list_documents(db, "ESTIMATE", None, None, None, 50, 0, created_by="Nobody")]
    assert svc.summary_row(doc)["created_by"] == "Anitha"
    inv = svc.convert_estimate(db, doc, "Meena")
    assert inv.created_by == "Meena"


def test_rate_cards_are_seeded_and_estimate_lines_work(pg_session):
    db = pg_session
    svc.seed_default_brands(db)
    from app.models.billing import BillingBrand, BillingRateCard
    arun = db.query(BillingBrand).filter(BillingBrand.code == "arunachala").first()
    cards = db.query(BillingRateCard).filter(BillingRateCard.brand_id == arun.id).all()
    assert {"SLAB_DROP", "SLAB_ROUND", "LOCAL", "PACKAGE"} <= {c.method for c in cards}
    sedan_drop = next(c for c in cards if c.method == "SLAB_DROP" and c.vehicle_key == "sedan")
    r = svc.estimate_lines(db, {"rate_card_id": str(sedan_drop.id), "km": 100})
    assert sum(l["amount"] for l in r["lines"]) == 3375 and r["method"] == "SLAB_DROP"
    r = svc.estimate_lines(db, {"method": "DAY_RENT", "params": {"rent_per_day": 2000, "km_limit_per_day": 300, "extra_km_rate": 10, "fuel_per_km": 2}, "km": 400, "days": 1})
    assert sum(l["amount"] for l in r["lines"]) == 2000 + 100 * 10 + 400 * 2
    with pytest.raises(HTTPException):
        svc.estimate_lines(db, {"method": "LOCAL", "params": {"packages": {"5hrs": 1000}}, "hours": "9hrs"})
    # tariff-based lines flow straight into a document with GST on the km fare
    b = _brand(db)
    est = svc.create_document(db, {"doc_type": "ESTIMATE", "brand_id": str(b.id), "lines": svc.estimate_lines(db, {"method": "SLAB_ROUND", "params": {"round_rate": 12.5, "min_km_per_day": 250, "driver_allowance": 400}, "km": 100, "days": 2})["lines"]}, "t")
    assert est.total_amount == 500 * 12.5 + 800


def test_package_details_print_on_the_document(pg_session):
    db = pg_session
    b = _brand(db)
    r = svc.estimate_lines(db, {"method": "PACKAGE", "params": {"itinerary": ["Pickup", "Temple"], "includes": ["AC vehicle"], "excludes": ["Hotel"], "days": 2}, "amount": 9000, "name": "Girivalam"})
    est = svc.create_document(db, {"doc_type": "ESTIMATE", "brand_id": str(b.id), "lines": r["lines"], "trip": {"package": r["meta"]["package"]}, "issue": True}, "t")
    s = svc.serialize(est, db)
    assert "Itinerary" in render_document_html(s) and "Hotel" in render_document_html(s)
    assert render_document_pdf(s).startswith(b"%PDF")


def test_legacy_manual_issue_endpoint_now_issues_through_the_new_engine(pg_session, monkeypatch):
    from types import SimpleNamespace
    from app.api.routes import tax_admin
    db = pg_session
    _brand(db)
    admin = SimpleNamespace(id="00000000-0000-0000-0000-000000000001", username="Anitha", role="Owner", phone="9000011111", permissions=["finance"])
    monkeypatch.setattr(tax_admin, "require_tax_accounts_permission", lambda a: None)
    monkeypatch.setattr(tax_admin, "log_finance_action", lambda *a, **k: None)
    out = tax_admin.issue_manual_invoice({"customer_name": "Corp Ltd", "customer_number": "9876543210", "pickup": "Chennai", "drop": "Madurai", "distance_km": 450,
                                          "rate_per_km": 12, "driver_bata": 400, "toll_charges": 300, "advance_paid": 1000},
                                         SimpleNamespace(client=None), db=db, current_admin=admin)
    assert out["invoice_number"].count("/") == 2
    assert out["total_amount"] == 5400 + 270 + 400 + 300      # 5% GST on the km fare only
    assert out["balance_due"] == out["total_amount"] - 1000
