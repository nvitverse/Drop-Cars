# crud/tax_invoices.py
"""
Invoice numbering + creation for every TaxInvoice type, plus the monthly
aggregation queries GSTR-1/GSTR-3B/Section 9(5) reporting reads from.

All aggregation here is computed on the fly from `tax_invoices` rows rather
than kept in a separate synced "TaxLedger" table - a materialized ledger
that can drift out of sync with its source rows is a worse audit risk than
a query that's always correct by construction. If monthly aggregation ever
gets slow enough to matter, add an index-backed summary table THEN, backed
by these same queries, not before.
"""
from datetime import datetime, timezone
from typing import Optional, Any, Dict, List
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.tax_settings import InvoiceSequence
from app.models.tax_invoice import TaxInvoice, InvoiceTypeEnum, InvoiceStatusEnum
from app.utils import tax_engine


def build_pdf_bytes_for_invoice(invoice: TaxInvoice) -> bytes:
    """Render a stored TaxInvoice row with utils/pdf_invoice. Referenced by the
    invoice-email code since 2026-09-24 but never written, so every email
    attempt failed inside its try/except."""
    from app.utils.pdf_invoice import generate_tax_invoice_pdf
    items = {}
    for li in (invoice.line_items or []):
        if isinstance(li, dict):
            key = str(li.get("key") or li.get("name") or li.get("description") or "").lower()
            items[key] = li.get("amount") or li.get("value") or 0
    def pick(*names):
        for n in names:
            for k, v in items.items():
                if n in k:
                    return v
        return 0
    created = getattr(invoice, "created_at", None)
    return generate_tax_invoice_pdf({
        "invoice_number": invoice.invoice_number,
        "date": created.strftime("%d-%b-%Y") if created else None,
        "booking_id": invoice.source_id or "N/A",
        "customer_name": invoice.customer_name_snapshot or "Valued Customer",
        "customer_phone": invoice.customer_number_snapshot or "",
        "customer_gstin": invoice.billed_party_gstin_snapshot or "",
        "customer_company": invoice.billed_party_name_snapshot or "",
        "sac_code": invoice.hsn_sac_code or "9964",
        "pure_km_fare": invoice.base_fare or invoice.taxable_value or 0,
        "cgst_amount": invoice.cgst_amount or 0,
        "sgst_amount": invoice.sgst_amount or 0,
        "driver_bata": pick("bata", "allowance"),
        "toll_charges": pick("toll"),
        "permit_charges": pick("permit"),
        "extra_charges": pick("extra", "waiting"),
    })

_SERIES_BY_TYPE = {
    InvoiceTypeEnum.RIDE_GST_9_5: "RIDE",
    InvoiceTypeEnum.DRIVER_COMMISSION: "DRVCOMM",
    InvoiceTypeEnum.CARPOOL_RECEIPT: "CPOOL",
    InvoiceTypeEnum.SUBSCRIPTION_FEE: "SUB",
    InvoiceTypeEnum.ADS_B2B: "ADS",
}


def next_invoice_number(db: Session, invoice_type: InvoiceTypeEnum, financial_year: str) -> str:
    """Atomically reserves the next sequential number for (series, FY).
    Row-locked via SELECT ... FOR UPDATE (with_for_update) so two concurrent
    invoice-creation requests can never both get the same number - required
    for GST's sequential-invoice-numbering rule, not just cosmetic."""
    series = _SERIES_BY_TYPE[invoice_type]
    row = (
        db.query(InvoiceSequence)
        .filter(InvoiceSequence.series == series, InvoiceSequence.financial_year == financial_year)
        .with_for_update()
        .first()
    )
    if row is None:
        initial_count = 30 if (series == "RIDE" and financial_year == "26-27") else 0
        row = InvoiceSequence(series=series, financial_year=financial_year, last_number=initial_count)
        db.add(row)
        db.flush()
        row = (
            db.query(InvoiceSequence)
            .filter(InvoiceSequence.series == series, InvoiceSequence.financial_year == financial_year)
            .with_for_update()
            .first()
        )
    row.last_number += 1
    number = row.last_number
    db.flush()
    if series == "RIDE":
        return f"DC/{financial_year}/INV-{number:03d}"
    return f"DC/{financial_year}/{series}-{number:03d}"



def _company_profile_ready(db: Session) -> bool:
    """Never blocks invoice creation - a booking/trip-close must never fail
    just because tax setup is incomplete. Instead every invoice records
    whether the profile was complete at issue time (see
    `needs_company_profile_review` below), so nothing is silently missed:
    the admin dashboard (GET /admin/tax/setup-status) surfaces "N invoices
    need the company GSTIN filled in" as an ask, not a system refusal."""
    return tax_engine.is_company_profile_complete(tax_engine.get_company_profile(db))


def create_ride_invoice(
    db: Session, *, order_id: int, customer_id: Optional[str], customer_name: str, customer_number: str,
    base_fare: int, detour_fee: int = 0, waiting_charges: int = 0, is_interstate: bool = False,
    created_by_admin_id: Optional[str] = None, when: Optional[datetime] = None,
) -> TaxInvoice:
    profile_ready = _company_profile_ready(db)
    when = when or datetime.now(timezone.utc)
    fy = tax_engine.financial_year_label(when.year, when.month)
    split = tax_engine.compute_commercial_ride_gst(
        db, base_fare=base_fare, detour_fee=detour_fee, waiting_charges=waiting_charges, is_interstate=is_interstate,
    )
    invoice = TaxInvoice(
        invoice_number=next_invoice_number(db, InvoiceTypeEnum.RIDE_GST_9_5, fy),
        financial_year=fy,
        invoice_type=InvoiceTypeEnum.RIDE_GST_9_5,
        status=InvoiceStatusEnum.ISSUED,
        source_type="order",
        source_id=str(order_id),
        customer_id=customer_id,
        customer_name_snapshot=customer_name,
        customer_number_snapshot=customer_number,
        base_fare=base_fare,
        detour_fee=detour_fee,
        waiting_charges=waiting_charges,
        hsn_sac_code="9964",
        created_by_admin_id=created_by_admin_id,
        needs_company_profile_review=not profile_ready,
        **split,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def create_driver_commission_invoice(
    db: Session, *, order_id: int, driver_id: str, commission_amount: int, is_interstate: bool = False,
    created_by_admin_id: Optional[str] = None, when: Optional[datetime] = None,
) -> TaxInvoice:
    profile_ready = _company_profile_ready(db)
    when = when or datetime.now(timezone.utc)
    fy = tax_engine.financial_year_label(when.year, when.month)
    split = tax_engine.compute_driver_commission_gst(db, commission_amount=commission_amount, is_interstate=is_interstate)
    invoice = TaxInvoice(
        invoice_number=next_invoice_number(db, InvoiceTypeEnum.DRIVER_COMMISSION, fy),
        financial_year=fy,
        invoice_type=InvoiceTypeEnum.DRIVER_COMMISSION,
        status=InvoiceStatusEnum.ISSUED,
        source_type="order",
        source_id=str(order_id),
        driver_id=driver_id,
        hsn_sac_code="9983",
        created_by_admin_id=created_by_admin_id,
        needs_company_profile_review=not profile_ready,
        **split,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def create_carpool_receipt(
    db: Session, *, journey_id: str, customer_id: Optional[str], customer_name: str, customer_number: str,
    cost_share_amount: int, created_by_admin_id: Optional[str] = None, when: Optional[datetime] = None,
) -> TaxInvoice:
    """No GST, so this never needs the company profile - a non-taxable
    acknowledgment receipt doesn't need a supplier GSTIN."""
    when = when or datetime.now(timezone.utc)
    fy = tax_engine.financial_year_label(when.year, when.month)
    split = tax_engine.compute_carpool_receipt(cost_share_amount=cost_share_amount)
    invoice = TaxInvoice(
        invoice_number=next_invoice_number(db, InvoiceTypeEnum.CARPOOL_RECEIPT, fy),
        financial_year=fy,
        invoice_type=InvoiceTypeEnum.CARPOOL_RECEIPT,
        status=InvoiceStatusEnum.ISSUED,
        source_type="carpool_journey",
        source_id=str(journey_id),
        customer_id=customer_id,
        customer_name_snapshot=customer_name,
        customer_number_snapshot=customer_number,
        created_by_admin_id=created_by_admin_id,
        **split,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def create_subscription_invoice(
    db: Session, *, customer_id: str, customer_name: str, customer_number: str, fee_amount: int,
    is_interstate: bool = False, created_by_admin_id: Optional[str] = None, when: Optional[datetime] = None,
) -> TaxInvoice:
    profile_ready = _company_profile_ready(db)
    when = when or datetime.now(timezone.utc)
    fy = tax_engine.financial_year_label(when.year, when.month)
    split = tax_engine.compute_subscription_fee_gst(db, fee_amount=fee_amount, is_interstate=is_interstate)
    invoice = TaxInvoice(
        invoice_number=next_invoice_number(db, InvoiceTypeEnum.SUBSCRIPTION_FEE, fy),
        financial_year=fy,
        invoice_type=InvoiceTypeEnum.SUBSCRIPTION_FEE,
        status=InvoiceStatusEnum.ISSUED,
        source_type="subscription",
        customer_id=customer_id,
        customer_name_snapshot=customer_name,
        customer_number_snapshot=customer_number,
        hsn_sac_code="9983",
        created_by_admin_id=created_by_admin_id,
        needs_company_profile_review=not profile_ready,
        **split,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def create_ads_invoice(
    db: Session, *, ad_booking_id: str, advertiser_name: str, advertiser_gstin: Optional[str], amount: int,
    reverse_charge: bool = False, is_interstate: bool = False, created_by_admin_id: Optional[str] = None,
    when: Optional[datetime] = None,
) -> TaxInvoice:
    profile_ready = _company_profile_ready(db)
    when = when or datetime.now(timezone.utc)
    fy = tax_engine.financial_year_label(when.year, when.month)
    split = tax_engine.compute_ads_invoice_gst(db, amount=amount, reverse_charge=reverse_charge, is_interstate=is_interstate)
    invoice = TaxInvoice(
        invoice_number=next_invoice_number(db, InvoiceTypeEnum.ADS_B2B, fy),
        financial_year=fy,
        invoice_type=InvoiceTypeEnum.ADS_B2B,
        status=InvoiceStatusEnum.ISSUED,
        source_type="ad_booking",
        source_id=str(ad_booking_id),
        billed_party_name_snapshot=advertiser_name,
        billed_party_gstin_snapshot=advertiser_gstin,
        hsn_sac_code="9983",
        reverse_charge=reverse_charge,
        created_by_admin_id=created_by_admin_id,
        needs_company_profile_review=not profile_ready,
        **split,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def issue_credit_note(db: Session, *, original_invoice_id: str, reason: str, created_by_admin_id: Optional[str] = None) -> TaxInvoice:
    """Reverses an ISSUED invoice by creating a new negative-amount
    CREDIT_NOTE row pointing back at it, rather than mutating the original -
    see the model docstring on why issued invoices are immutable. The
    original's own `status` stays ISSUED (a credit note doesn't change what
    the original document was), so double-issuing is guarded separately
    below by checking no CREDIT_NOTE already references this original -
    a full-amount reversal only ever makes sense once per invoice."""
    original = db.query(TaxInvoice).filter(TaxInvoice.id == original_invoice_id).first()
    if not original:
        raise ValueError("Original invoice not found")
    if original.status != InvoiceStatusEnum.ISSUED:
        raise ValueError(f"Cannot credit-note an invoice with status {original.status}")
    already_credited = (
        db.query(TaxInvoice)
        .filter(TaxInvoice.reversal_of_invoice_id == original.id, TaxInvoice.status == InvoiceStatusEnum.CREDIT_NOTE)
        .first()
    )
    if already_credited:
        raise ValueError(f"Invoice {original.invoice_number} was already credit-noted ({already_credited.invoice_number})")

    when = datetime.now(timezone.utc)
    fy = tax_engine.financial_year_label(when.year, when.month)
    note = TaxInvoice(
        invoice_number=next_invoice_number(db, original.invoice_type, fy),
        financial_year=fy,
        invoice_type=original.invoice_type,
        status=InvoiceStatusEnum.CREDIT_NOTE,
        source_type=original.source_type,
        source_id=original.source_id,
        customer_id=original.customer_id,
        customer_name_snapshot=original.customer_name_snapshot,
        customer_number_snapshot=original.customer_number_snapshot,
        driver_id=original.driver_id,
        vendor_id=original.vendor_id,
        billed_party_name_snapshot=original.billed_party_name_snapshot,
        billed_party_gstin_snapshot=original.billed_party_gstin_snapshot,
        base_fare=-original.base_fare,
        detour_fee=-original.detour_fee,
        waiting_charges=-original.waiting_charges,
        taxable_value=-original.taxable_value,
        is_interstate=original.is_interstate,
        gst_rate_percent=original.gst_rate_percent,
        cgst_amount=-original.cgst_amount,
        sgst_amount=-original.sgst_amount,
        igst_amount=-original.igst_amount,
        total_gst_amount=-original.total_gst_amount,
        total_amount=-original.total_amount,
        hsn_sac_code=original.hsn_sac_code,
        reversal_of_invoice_id=original.id,
        line_items=[{"label": "Credit note reason", "value": reason}],
        created_by_admin_id=created_by_admin_id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def get_setup_status(db: Session) -> dict:
    """What the admin dashboard should be *asking* the Owner to complete -
    never something that already blocked an action. `pending_review_count`
    is how many already-issued invoices went out with
    needs_company_profile_review=True and may need a corrected re-issue
    once the profile is filled in."""
    profile = tax_engine.get_company_profile(db)
    is_complete = tax_engine.is_company_profile_complete(profile)
    pending_review_count = (
        db.query(TaxInvoice)
        .filter(TaxInvoice.needs_company_profile_review == True)  # noqa: E712
        .count()
    )
    return {
        "company_profile": profile,
        "company_profile_complete": is_complete,
        "invoices_needing_review": pending_review_count,
        "action_needed": (
            None if is_complete and pending_review_count == 0
            else f"Set the company GSTIN/legal name/address ({', '.join(f for f in profile if not profile[f])} still missing)."
            if not is_complete
            else f"{pending_review_count} invoice(s) were issued before the company profile was completed - review and re-issue if needed."
        ),
    }


# ---------------------------------------------------------------------------
# Monthly aggregation - GSTR-1 / GSTR-3B / Section 9(5) report / P&L
# ---------------------------------------------------------------------------
def _month_bounds(year: int, month: int):
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end = datetime(year + 1, 1, 1, tzinfo=timezone.utc) if month == 12 else datetime(year, month + 1, 1, tzinfo=timezone.utc)
    return start, end


def get_gstr1_summary(db: Session, *, year: int, month: int) -> dict:
    """GSTR-1 Table 4/7 shape: outward supplies split B2C vs B2B, and
    Intra-State (CGST+SGST) vs Inter-State (IGST). ADS_B2B rows count as
    B2B outward supply; everything else (rides, subscriptions) is B2C.
    Excludes CARPOOL_RECEIPT (non-taxable, not a GST outward supply)."""
    start, end = _month_bounds(year, month)
    rows = (
        db.query(TaxInvoice)
        .filter(TaxInvoice.created_at >= start, TaxInvoice.created_at < end)
        .filter(TaxInvoice.invoice_type != InvoiceTypeEnum.CARPOOL_RECEIPT)
        .filter(TaxInvoice.status.in_([InvoiceStatusEnum.ISSUED, InvoiceStatusEnum.CREDIT_NOTE]))
        .all()
    )

    def _bucket():
        return {"taxable_value": 0, "cgst": 0, "sgst": 0, "igst": 0, "total_gst": 0, "total": 0, "invoice_count": 0}

    b2c_intra, b2c_inter, b2b_intra, b2b_inter = _bucket(), _bucket(), _bucket(), _bucket()
    for inv in rows:
        is_b2b = inv.invoice_type == InvoiceTypeEnum.ADS_B2B
        bucket = (b2b_inter if inv.is_interstate else b2b_intra) if is_b2b else (b2c_inter if inv.is_interstate else b2c_intra)
        bucket["taxable_value"] += inv.taxable_value
        bucket["cgst"] += inv.cgst_amount
        bucket["sgst"] += inv.sgst_amount
        bucket["igst"] += inv.igst_amount
        bucket["total_gst"] += inv.total_gst_amount
        bucket["total"] += inv.total_amount
        bucket["invoice_count"] += 1

    return {
        "period": f"{year}-{month:02d}",
        "table_4_b2c_intra_state": b2c_intra,
        "table_4_b2c_inter_state": b2c_inter,
        "table_7_b2b_intra_state": b2b_intra,
        "table_7_b2b_inter_state": b2b_inter,
    }


def get_section_9_5_report(db: Session, *, year: int, month: int) -> dict:
    """GSTR-1 Table 14 equivalent: supplies made through Drop Cars as
    e-commerce operator where DROP CARS pays the tax (RIDE_GST_9_5 only -
    DRIVER_COMMISSION/SUBSCRIPTION_FEE/ADS_B2B are ordinary forward-charge
    supplies Drop Cars makes in its own right, not Section 9(5) supplies)."""
    start, end = _month_bounds(year, month)
    agg = (
        db.query(
            func.count(TaxInvoice.id),
            func.coalesce(func.sum(TaxInvoice.taxable_value), 0),
            func.coalesce(func.sum(TaxInvoice.cgst_amount), 0),
            func.coalesce(func.sum(TaxInvoice.sgst_amount), 0),
            func.coalesce(func.sum(TaxInvoice.igst_amount), 0),
            func.coalesce(func.sum(TaxInvoice.total_amount), 0),
        )
        .filter(TaxInvoice.invoice_type == InvoiceTypeEnum.RIDE_GST_9_5)
        .filter(TaxInvoice.created_at >= start, TaxInvoice.created_at < end)
        .filter(TaxInvoice.status.in_([InvoiceStatusEnum.ISSUED, InvoiceStatusEnum.CREDIT_NOTE]))
        .one()
    )
    count, taxable, cgst, sgst, igst, total = agg
    return {
        "period": f"{year}-{month:02d}",
        "invoice_count": count,
        "taxable_value": taxable,
        "cgst": cgst,
        "sgst": sgst,
        "igst": igst,
        "total_gst": cgst + sgst + igst,
        "total_value": total,
    }


def get_gstr3b_summary(db: Session, *, year: int, month: int) -> dict:
    """GSTR-3B 3.1 outward-supply summary - same underlying numbers as
    GSTR-1 but rolled up to a single net-tax-liability figure per rate
    bucket, which is what 3B actually reports (it doesn't itemize by
    B2B/B2C the way GSTR-1's Table 4/7 does)."""
    start, end = _month_bounds(year, month)
    rows = (
        db.query(
            TaxInvoice.gst_rate_percent,
            func.coalesce(func.sum(TaxInvoice.taxable_value), 0),
            func.coalesce(func.sum(TaxInvoice.cgst_amount), 0),
            func.coalesce(func.sum(TaxInvoice.sgst_amount), 0),
            func.coalesce(func.sum(TaxInvoice.igst_amount), 0),
        )
        .filter(TaxInvoice.invoice_type != InvoiceTypeEnum.CARPOOL_RECEIPT)
        .filter(TaxInvoice.created_at >= start, TaxInvoice.created_at < end)
        .filter(TaxInvoice.status.in_([InvoiceStatusEnum.ISSUED, InvoiceStatusEnum.CREDIT_NOTE]))
        .group_by(TaxInvoice.gst_rate_percent)
        .all()
    )
    by_rate = [
        {"gst_rate_percent": rate, "taxable_value": tv, "cgst": cgst, "sgst": sgst, "igst": igst}
        for rate, tv, cgst, sgst, igst in rows
    ]
    return {
        "period": f"{year}-{month:02d}",
        "by_rate": by_rate,
        "total_tax_liability": sum(r["cgst"] + r["sgst"] + r["igst"] for r in by_rate),
    }


def get_pl_statement(db: Session, *, year: int, month: int, gross_bookings: int, razorpay_pg_fees: int, marketing_promo_discounts: int) -> dict:
    """P&L compilation per the prompt's spec: Gross Bookings vs Platform
    Take-Rate vs Razorpay PG Fees vs Marketing/Promo Wallet Discounts.
    gross_bookings/razorpay_pg_fees/marketing_promo_discounts are passed in
    rather than computed here - they come from the existing Orders/
    RazorpayTransaction/wallet-ledger tables respectively, which this
    module deliberately doesn't re-derive (avoids two places computing
    "gross bookings" that can drift). See the implementation guide for the
    exact source query per figure."""
    start, end = _month_bounds(year, month)
    platform_take = (
        db.query(func.coalesce(func.sum(TaxInvoice.taxable_value), 0))
        .filter(TaxInvoice.invoice_type == InvoiceTypeEnum.DRIVER_COMMISSION)
        .filter(TaxInvoice.created_at >= start, TaxInvoice.created_at < end)
        .filter(TaxInvoice.status == InvoiceStatusEnum.ISSUED)
        .scalar() or 0
    )
    net_profit = platform_take - razorpay_pg_fees - marketing_promo_discounts
    return {
        "period": f"{year}-{month:02d}",
        "gross_bookings": gross_bookings,
        "platform_take_rate_revenue": platform_take,
        "razorpay_pg_fees": razorpay_pg_fees,
        "marketing_promo_wallet_discounts": marketing_promo_discounts,
        "net_profit": net_profit,
    }


def issue_and_email_order_tax_invoice(
    db: Session,
    *,
    order: Any,
    customer_email: Optional[str] = None,
    customer_gstin: Optional[str] = None,
    customer_company: Optional[str] = None,
    created_by_admin_id: Optional[str] = None,
) -> TaxInvoice:
    """
    Issues an official GST Tax Invoice row for an order (if not already issued),
    generates the professional branded PDF with pure KM fare GST math,
    and automatically emails it to dropcarsbookings@gmail.com and the customer.
    """
    from datetime import datetime, timezone
    from app.utils.pdf_invoice import generate_tax_invoice_pdf
    from app.utils.emailer import send_email_with_pdf, get_smtp_settings

    order_pk = str(getattr(order, "id", getattr(order, "order_id", None)))
    if not order_pk or order_pk == "None":
        order_pk = str(getattr(order, "booking_id", "UNKNOWN"))

    # Check if invoice already issued for this order
    existing = db.query(TaxInvoice).filter(
        TaxInvoice.source_type == "order",
        TaxInvoice.source_id == order_pk,
        TaxInvoice.status == InvoiceStatusEnum.ISSUED
    ).first()

    now = datetime.now(timezone.utc)
    fy = tax_engine.financial_year_label(now.year, now.month)

    # Pure KM Fare Rule: Distance * CostPerKm
    dist = getattr(order, "trip_distance", 0) or 0
    rate = getattr(order, "cost_per_km", 0) or 0
    pure_km_fare = int(round(dist * rate))
    if pure_km_fare <= 0:
        total = getattr(order, "total_booking_amount", 0) or getattr(order, "vendor_price", 0) or getattr(order, "estimated_price", 0) or 0
        pure_km_fare = int(round(total / 1.05)) if total > 0 else 0

    gst_amt = int(round(pure_km_fare * 0.05))
    cgst = round(gst_amt / 2, 2)
    sgst = round(gst_amt / 2, 2)
    bata = getattr(order, "driver_allowance", 0) or 0
    tolls = getattr(order, "toll_charges", 0) or 0
    permits = getattr(order, "permit_charges", 0) or 0
    advance = getattr(order, "advance_received", 0) or 0
    grand_total = pure_km_fare + gst_amt + bata + tolls + permits
    balance = max(0, grand_total - advance)

    # Route locations
    loc = getattr(order, "pickup_drop_location", {}) or {}
    pickup = "Pickup Point"
    drop = "Drop Point"
    if isinstance(loc, dict):
        keys = sorted(loc.keys(), key=lambda k: int(k) if str(k).isdigit() else 0)
        if keys:
            pickup = str(loc.get(keys[0], pickup))
            drop = str(loc.get(keys[-1], drop))

    cust_name = getattr(order, "customer_name", None) or "Valued Customer"
    cust_phone = getattr(order, "customer_number", None) or ""

    if existing:
        invoice = existing
    else:
        profile_ready = _company_profile_ready(db)
        inv_num = next_invoice_number(db, InvoiceTypeEnum.RIDE_GST_9_5, fy)
        invoice = TaxInvoice(
            invoice_number=inv_num,
            financial_year=fy,
            invoice_type=InvoiceTypeEnum.RIDE_GST_9_5,
            status=InvoiceStatusEnum.ISSUED,
            source_type="order",
            source_id=order_pk,
            customer_name_snapshot=cust_name,
            customer_number_snapshot=cust_phone,
            base_fare=pure_km_fare,
            taxable_value=pure_km_fare,
            gst_rate_percent=5,
            cgst_amount=int(cgst),
            sgst_amount=int(sgst),
            igst_amount=0,
            total_gst_amount=gst_amt,
            total_amount=grand_total,
            hsn_sac_code="9964",
            created_by_admin_id=created_by_admin_id,
            needs_company_profile_review=not profile_ready,
            line_items={
                "pickup": pickup,
                "drop": drop,
                "trip_type": str(getattr(order, "trip_type", "One Way")),
                "vehicle_type": str(getattr(order, "car_type", "Sedan")),
                "distance_km": dist,
                "rate_per_km": rate,
                "driver_bata": bata,
                "toll_charges": tolls,
                "permit_charges": permits,
                "advance_paid": advance,
                "balance_due": balance,
                "customer_email": customer_email or "",
                "customer_gstin": customer_gstin or "",
                "customer_company": customer_company or "",
            }
        )
        db.add(invoice)
        db.commit()
        db.refresh(invoice)


def sync_unlinked_gst_orders(db: Session) -> int:
    """
    Finds all bookings (NewOrder, Order, CustomerBookingRequest) marked with gst_included=True
    or gst_amount > 0 that do NOT yet have an issued TaxInvoice, and issues tax invoices for them.
    """
    from app.models.new_orders import NewOrder
    from app.models.orders import Order
    from app.models.customer_booking_request import CustomerBookingRequest

    synced_count = 0

    # 1. Check NewOrders
    try:
        new_orders = db.query(NewOrder).filter(
            (NewOrder.gst_included == True) | (NewOrder.gst_amount > 0)
        ).all()
        for o in new_orders:
            pk = str(getattr(o, "order_id", getattr(o, "id", None)))
            if not pk:
                continue
            existing = db.query(TaxInvoice).filter(
                TaxInvoice.source_type == "order",
                TaxInvoice.source_id == pk,
                TaxInvoice.status == InvoiceStatusEnum.ISSUED
            ).first()
            if not existing:
                try:
                    issue_and_email_order_tax_invoice(db, order=o)
                    synced_count += 1
                except Exception as e:
                    print(f"[TaxInvoice Sync] Failed for NewOrder {pk}: {e}")
    except Exception as err:
        print(f"[TaxInvoice Sync] NewOrder query error: {err}")

    # 2. Check Master Orders
    try:
        master_orders = db.query(Order).filter(
            (Order.gst_included == True) | (Order.gst_amount > 0)
        ).all()
        for o in master_orders:
            pk = str(getattr(o, "id", None))
            if not pk:
                continue
            existing = db.query(TaxInvoice).filter(
                TaxInvoice.source_type == "order",
                TaxInvoice.source_id == pk,
                TaxInvoice.status == InvoiceStatusEnum.ISSUED
            ).first()
            if not existing:
                try:
                    issue_and_email_order_tax_invoice(db, order=o)
                    synced_count += 1
                except Exception as e:
                    print(f"[TaxInvoice Sync] Failed for Order {pk}: {e}")
    except Exception as err:
        print(f"[TaxInvoice Sync] Order query error: {err}")

    # 3. Check CustomerBookingRequests
    try:
        reqs = db.query(CustomerBookingRequest).filter(
            (CustomerBookingRequest.gst_included == True) | (CustomerBookingRequest.gst_amount > 0)
        ).all()
        for r in reqs:
            pk = str(getattr(r, "id", None))
            if not pk:
                continue
            existing = db.query(TaxInvoice).filter(
                TaxInvoice.source_type == "order",
                TaxInvoice.source_id == pk,
                TaxInvoice.status == InvoiceStatusEnum.ISSUED
            ).first()
            if not existing:
                try:
                    issue_and_email_order_tax_invoice(db, order=r)
                    synced_count += 1
                except Exception as e:
                    print(f"[TaxInvoice Sync] Failed for CustomerBookingRequest {pk}: {e}")
    except Exception as err:
        print(f"[TaxInvoice Sync] CustomerBookingRequest query error: {err}")

    return synced_count


def create_manual_tax_invoice(
    db: Session,
    *,
    customer_name: str,
    customer_number: str,
    customer_email: Optional[str] = None,
    customer_gstin: Optional[str] = None,
    customer_company: Optional[str] = None,
    pickup: str,
    drop: str,
    trip_type: str = "One Way",
    vehicle_type: str = "Sedan",
    distance_km: float = 0.0,
    rate_per_km: float = 0.0,
    driver_bata: int = 0,
    toll_charges: int = 0,
    permit_charges: int = 0,
    advance_paid: int = 0,
    booking_id: Optional[str] = None,
    created_by_admin_id: Optional[str] = None,
) -> TaxInvoice:
    """Issues a sequential TaxInvoice manually created by Admin, generates PDF,
    and emails it. Follows the pure KM fare rule (5% GST only on distance*rate,
    driver bata and statutory charges non-taxable)."""
    now = datetime.now(timezone.utc)
    fy = tax_engine.financial_year_label(now.year, now.month)
    profile_ready = _company_profile_ready(db)

    pure_km_fare = round(distance_km * rate_per_km, 2)
    if pure_km_fare <= 0 and advance_paid > 0:
        pure_km_fare = float(advance_paid)

    cgst = round(pure_km_fare * 0.025, 2)
    sgst = round(pure_km_fare * 0.025, 2)
    gst_amt = round(cgst + sgst, 2)
    grand_total = round(pure_km_fare + gst_amt + driver_bata + toll_charges + permit_charges, 2)
    balance = max(0.0, round(grand_total - advance_paid, 2))

    inv_num = next_invoice_number(db, InvoiceTypeEnum.RIDE_GST_9_5, fy)

    line_items_data = {
        "booking_id": booking_id or "MANUAL",
        "pickup": pickup,
        "drop": drop,
        "trip_type": trip_type,
        "vehicle_type": vehicle_type,
        "distance_km": distance_km,
        "rate_per_km": rate_per_km,
        "pure_km_fare": pure_km_fare,
        "driver_bata": driver_bata,
        "toll_charges": toll_charges,
        "permit_charges": permit_charges,
        "advance_paid": advance_paid,
        "balance_due": balance,
        "customer_email": customer_email or "",
        "customer_gstin": customer_gstin or "",
        "customer_company": customer_company or "",
    }

    invoice = TaxInvoice(
        invoice_number=inv_num,
        financial_year=fy,
        invoice_type=InvoiceTypeEnum.RIDE_GST_9_5,
        status=InvoiceStatusEnum.ISSUED,
        source_type="manual",
        source_id=booking_id or "MANUAL",
        customer_id=None,
        customer_name_snapshot=customer_name,
        customer_number_snapshot=customer_number,
        base_fare=int(pure_km_fare),
        taxable_value=pure_km_fare,
        gst_rate_percent=5.0,
        cgst_amount=cgst,
        sgst_amount=sgst,
        igst_amount=0,
        total_gst_amount=gst_amt,
        total_amount=grand_total,
        hsn_sac_code="9964",
        created_by_admin_id=created_by_admin_id,
        needs_company_profile_review=not profile_ready,
        line_items=line_items_data,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    # Generate and email PDF
    try:
        from app.utils.emailer import send_email_with_pdf, get_smtp_settings
        pdf_bytes = build_pdf_bytes_for_invoice(invoice)
        smtp = get_smtp_settings(db)
        recipients = ["dropcarsbookings@gmail.com"]
        if smtp.get("smtp_to") and smtp["smtp_to"] not in recipients:
            recipients.append(smtp["smtp_to"])
        if customer_email and customer_email not in recipients:
            recipients.append(customer_email)

        subject = f"Drop Cars GST Tax Invoice - {invoice.invoice_number}"
        body_text = (
            f"Dear {invoice.customer_name_snapshot},\n\n"
            f"Please find attached the official GST Tax Invoice {invoice.invoice_number} from Drop Cars.\n\n"
            f"Route: {pickup} -> {drop}\n"
            f"Pure KM Fare (Taxable 5%): Rs. {pure_km_fare}\n"
            f"GST (5%): Rs. {gst_amt}\n"
            f"Driver Bata: Rs. {driver_bata}\n"
            f"Grand Total: Rs. {grand_total}\n\n"
            f"- Drop Cars Mobility"
        )
        send_email_with_pdf(
            db=db,
            to_emails=recipients,
            subject=subject,
            body_text=body_text,
            pdf_bytes=pdf_bytes,
            filename=f"DropCars_Invoice_{invoice.invoice_number.replace('/', '_')}.pdf"
        )
    except Exception as e:
        print(f"Error emailing manual invoice {invoice.invoice_number}: {e}")

    return invoice

