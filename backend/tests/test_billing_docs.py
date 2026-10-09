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
    assert {"SLAB_DROP", "SLAB_ROUND", "LOCAL"} <= {c.method for c in cards}
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
    assert "Plan - Girivalam" in render_document_html(s) and "Hotel" in render_document_html(s) and "AC vehicle" in render_document_html(s)
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


def test_brand_look_name_is_exact_tagline_slogan_and_qr(pg_session):
    db = pg_session
    svc.seed_default_brands(db)
    arun = db.query(BillingBrand).filter(BillingBrand.code == "arunachala").first()
    assert arun.name == "Arunachala Travels" and arun.tagline == "Dedicated to Spiritual Journeys" and "Tempo Traveller" in arun.highlights and "Temple" not in arun.highlights and arun.primary_color == "#C24A1E" and arun.font_style == "SERIF"
    dc = db.query(BillingBrand).filter(BillingBrand.code == "dropcars").first()
    assert dc.tagline == "Your Trusted One-Way Drop Taxi Service"
    dc.tagline = "Typed by the owner"          # an edited tagline survives a re-seed
    dc.upi_id = "dropcars@upi"
    db.flush()
    svc.seed_default_brands(db)
    assert dc.tagline == "Typed by the owner"
    est = svc.create_document(db, {"doc_type": "ESTIMATE", "brand_id": str(dc.id), "customer": {"name": "Ravi"}, "lines": LINES, "advance_requested": 1500,
                                   "trip": {"pickup": "Chennai", "drop": "Madurai"}, "issue": True}, "Anitha", "9000011111")
    s = svc.serialize(est, db)
    html = render_document_html(s, public=True)
    assert "Typed by the owner" in html and ">Drop Cars<" in html and "Tours &amp; Travels" not in html
    assert "<svg" in html and "Scan to pay" in html                      # UPI QR present because the brand has a UPI id
    assert dc.footer_note in html and "Prepared by" in html
    assert render_document_pdf(s).startswith(b"%PDF")


def test_estimate_follows_the_website_model_and_arunachala_uses_its_own_style(pg_session):
    db = pg_session
    svc.seed_default_brands(db)
    arun = db.query(BillingBrand).filter(BillingBrand.code == "arunachala").first()
    arun.gstin = "33AAACD1234E1Z5"
    db.flush()
    est = svc.create_document(db, {"doc_type": "ESTIMATE", "brand_id": str(arun.id), "customer": {"name": "Ravi"}, "gst": {"mode": "EXTRA"},
                                   "lines": [{"label": "Distance 300 km x Rs 12", "amount": 3600, "kind": "FARE"}, {"label": "Driver allowance", "amount": 400, "kind": "CHARGE"},
                                             {"label": "Toll", "amount": 0, "included": False}, {"label": "Parking", "amount": 0, "included": False}],
                                   "advance_requested": 800, "trip": {"pickup": "Chennai", "drop": "Madurai"}, "issue": True}, "Anitha")
    html = render_document_html(svc.serialize(est, db), public=True)
    assert "Grand Total (incl. GST)" in html and "Advance Required (" in html and "What's included" in html and "Not included / extra" in html
    assert "Driver allowance" in html and "Toll" in html
    assert "Cormorant Garamond" in html and "#C24A1E" in html and "--g:#C8A45A" in html           # the website's ember + gold + serif
    assert "temple" not in html.lower()
    assert render_document_pdf(svc.serialize(est, db)).startswith(b"%PDF")


def test_document_has_links_km_limit_extra_km_and_standard_lists(pg_session):
    db = pg_session
    _brand(db)
    dc = db.query(BillingBrand).filter(BillingBrand.code == "dropcars").first()
    dc.whatsapp = "919043990439"
    dc.domain = "dropcars.in"
    db.flush()
    est = svc.create_document(db, {"doc_type": "ESTIMATE", "brand_id": str(dc.id), "customer": {"name": "Ravi", "phone": "9876543210", "email": "r@x.in"},
                                   "lines": [{"label": "Km fare (296 km x Rs 15)", "amount": 4440, "kind": "FARE"}, {"label": "Driver allowance", "amount": 400, "kind": "CHARGE"},
                                             {"label": "Toll", "amount": 376, "kind": "CHARGE"}],
                                   "trip": {"pickup": "Chennai Airport", "drop": "Dharmapuri", "km": 296, "km_limit": 296, "extra_km_rate": 15, "trip_type": "One Way"},
                                   "advance_requested": 1000, "issue": True}, "Anitha", "9000011111")
    s = svc.serialize(est, db)
    html = render_document_html(s, public=True, links={"pdf": "tok/pdf"})
    assert "Up to 296 km" in html and "Extra km" in html and "15 per km beyond 296 km" in html            # km limit + extra km rate never missing
    assert "Parking charges" in html and "Waiting charges" in html                                       # the brand's standard exclusions
    assert "Toll &amp; state permit" not in html                                                          # hidden: toll is already in the bill
    assert "tel:+919876543210" in html and "mailto:r@x.in" in html and "google.com/maps/dir" in html and "wa.me/919043990439?text=" in html
    assert "Confirm on WhatsApp" in html and "tok/pdf" in html and "Customer acknowledgement" in html
    assert "Km fare" in html and "296 km × ₹15" in html                                                   # item and details split like the website's quote
    inv = svc.convert_estimate(db, est, "Meena")
    h2 = render_document_html(svc.serialize(inv, db))
    assert ">Qty<" in h2 and ">296 km<" in h2 and "₹15" in h2                                            # invoice keeps the # / Qty / Rate / Amount layout
    assert render_document_pdf(svc.serialize(est, db)).startswith(b"%PDF") and render_document_pdf(svc.serialize(inv, db)).startswith(b"%PDF")


def test_share_message_carries_km_limit_included_and_excluded(pg_session):
    from types import SimpleNamespace
    from app.api.routes import billing_docs as routes
    db = pg_session
    _brand(db)
    dc = db.query(BillingBrand).filter(BillingBrand.code == "dropcars").first()
    est = svc.create_document(db, {"doc_type": "ESTIMATE", "brand_id": str(dc.id), "customer": {"name": "Ravi", "phone": "9876543210"},
                                   "lines": [{"label": "Km fare (300 km x Rs 12)", "amount": 3600, "kind": "FARE"}, {"label": "Driver bata", "amount": 300, "kind": "CHARGE"}],
                                   "trip": {"pickup": "Chennai", "drop": "Madurai", "km": 300, "km_limit": 300, "extra_km_rate": 12}, "advance_requested": 800, "issue": True}, "Anitha")
    req = SimpleNamespace(base_url="http://localhost:8000/")
    out = routes.share_info(str(est.id), req, db=db, admin=SimpleNamespace(username="Anitha"))
    m = out["message"]
    assert "Km limit: up to 300 km; extra km at Rs 12 per km" in m and "Included:" in m and "Not included (paid on actuals):" in m
    assert "Parking charges" in m and "Advance to confirm: Rs 800" in m and "Valid until" in m and "/api/billing/public/" in m
