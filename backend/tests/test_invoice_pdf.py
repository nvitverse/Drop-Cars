"""The invoice-email code calls build_pdf_bytes_for_invoice, which was never
written until 2026-10-01; reportlab was also missing from requirements."""
from datetime import datetime
from types import SimpleNamespace

from app.crud.tax_invoices import build_pdf_bytes_for_invoice


def test_invoice_pdf_renders():
    inv = SimpleNamespace(
        invoice_number="DC/26-27/INV-001", created_at=datetime(2026, 10, 1), source_id="332",
        customer_name_snapshot="Test Customer", customer_number_snapshot="9000000000",
        billed_party_gstin_snapshot=None, billed_party_name_snapshot=None, hsn_sac_code="9964",
        base_fare=2800, taxable_value=2800, cgst_amount=70, sgst_amount=70,
        line_items=[{"name": "Driver bata", "amount": 400}, {"name": "Toll", "amount": 150}],
    )
    pdf = build_pdf_bytes_for_invoice(inv)
    assert pdf[:5] == b"%PDF-" and len(pdf) > 1000
