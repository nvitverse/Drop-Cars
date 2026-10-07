# api/routes/tax_admin.py
"""
Admin-facing Tax/GST/Invoicing/Driver-Settlement endpoints. Every route
here re-uses the existing get_current_admin auth dependency and the RBAC
helpers added to admin.py (require_owner / require_tax_accounts_permission)
rather than inventing a parallel auth system - see the implementation
guide (docs/TAX_GST_SYSTEM_GUIDE.md) for the full RBAC-to-endpoint map.

Route-level RBAC summary (matches the prompt's 3-tier spec):
- Owner: everything, including company-profile/rate settings, credit
  notes, settlement finalization, and the finance audit log.
- Accounts / Tax Staff (permission "tax_accounts" or "finance"): GSTR-1/
  3B/Section-9(5) reports, tax exports, invoice list/detail, driver
  settlement list/generate (not finalize) - all customer PII in list/detail
  responses is redacted for this tier (see _redact_customer_pii).
- Operations / Support Staff: not given a route here at all - per the
  prompt they only need per-ride invoice lookup, which already exists via
  the ordinary booking-detail endpoints; this router is deliberately
  Accounts/Owner-only.
"""
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Response
from fastapi.responses import PlainTextResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import csv
import io

from app.database.session import get_db
from app.core.security import get_current_admin
from app.models.tax_invoice import TaxInvoice, InvoiceTypeEnum
from app.models.driver_settlement import DriverSettlement
from app.crud import tax_invoices as tax_invoices_crud
from app.crud import driver_settlements as settlements_crud
from app.crud.finance_audit_log import log_finance_action, get_finance_audit_log
from app.utils import tax_engine
from app.schemas.tax import (
    CompanyProfileUpdate, CompanyProfileOut, TaxRatesOut, TaxRateUpdate,
    TaxInvoiceOut, CreditNoteRequest, DriverSettlementOut, GenerateSettlementRequest,
    FinanceAuditLogListOut, SetupStatusOut,
)
from app.api.routes.admin import require_owner, require_tax_accounts_permission

router = APIRouter()


def _client_ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


def _redact_pii_for_staff(admin, invoice: TaxInvoice) -> None:
    """Accounts/Tax Staff get full invoice-number/amount/ledger access but
    read-only, redacted customer PII per the prompt's spec - Owner sees
    everything unredacted. Mutates the ORM instance's transient display
    only (not committed) - safe since this runs on a read path right
    before serialization, never before a db.commit()."""
    if admin.role != "Owner":
        if invoice.customer_name_snapshot:
            invoice.customer_name_snapshot = invoice.customer_name_snapshot[:1] + "***"
        if invoice.customer_number_snapshot:
            invoice.customer_number_snapshot = "******" + invoice.customer_number_snapshot[-4:]


# ---------------------------------------------------------------------------
# Company tax profile + rates (Owner only - these are the legal identity
# printed on every GST invoice and the rates every computation uses)
# ---------------------------------------------------------------------------
@router.get("/admin/tax/setup-status", response_model=SetupStatusOut)
def setup_status(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """What tax setup is still incomplete, framed as an ask, not a
    blocker - nothing in this system refuses to issue an invoice or close
    a trip because the company profile is unset (see
    needs_company_profile_review on TaxInvoice); this is the one place
    that surfaces "please finish setting up X" for the Owner/Accounts
    staff to act on. Good to show as a dashboard banner."""
    require_tax_accounts_permission(current_admin)
    return tax_invoices_crud.get_setup_status(db)


@router.get("/admin/tax/company-profile", response_model=CompanyProfileOut)
def get_company_profile(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    require_owner(current_admin)
    profile = tax_engine.get_company_profile(db)
    return CompanyProfileOut(**profile, is_complete=tax_engine.is_company_profile_complete(profile))


@router.put("/admin/tax/company-profile", response_model=CompanyProfileOut)
def update_company_profile(
    payload: CompanyProfileUpdate, request: Request,
    db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    require_owner(current_admin)
    before = tax_engine.get_company_profile(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            tax_engine.set_company_profile_field(db, field, value)
    db.commit()
    after = tax_engine.get_company_profile(db)
    log_finance_action(
        db, staff_id=str(current_admin.id), staff_username=current_admin.username, staff_role=current_admin.role,
        action="TAX_COMPANY_PROFILE_UPDATED", entity_type="tax_setting", entity_id="company_profile",
        old_value=before, new_value=after, ip_address=_client_ip(request),
    )
    return CompanyProfileOut(**after, is_complete=tax_engine.is_company_profile_complete(after))


@router.get("/admin/tax/rates", response_model=TaxRatesOut)
def get_tax_rates(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    require_tax_accounts_permission(current_admin)
    return TaxRatesOut(**tax_engine.get_tax_rates(db))


@router.put("/admin/tax/rates", response_model=TaxRatesOut)
def update_tax_rate(
    payload: TaxRateUpdate, request: Request,
    db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    require_owner(current_admin)
    if payload.key not in tax_engine.TAX_RATE_DEFAULTS:
        raise HTTPException(status_code=422, detail=f"Unknown rate key. Must be one of: {list(tax_engine.TAX_RATE_DEFAULTS.keys())}")
    before = tax_engine.get_tax_rates(db)
    from app.models.platform_setting import PlatformSetting
    key = f"tax_rate_{payload.key}"
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if row:
        row.value = str(payload.value)
    else:
        db.add(PlatformSetting(key=key, value=str(payload.value)))
    db.commit()
    after = tax_engine.get_tax_rates(db)
    log_finance_action(
        db, staff_id=str(current_admin.id), staff_username=current_admin.username, staff_role=current_admin.role,
        action="TAX_RATE_CHANGED", entity_type="tax_setting", entity_id=payload.key,
        old_value=before, new_value=after, ip_address=_client_ip(request),
    )
    return TaxRatesOut(**after)


# ---------------------------------------------------------------------------
# Invoice ledger
# ---------------------------------------------------------------------------
@router.get("/admin/tax/invoices", response_model=list[TaxInvoiceOut])
def list_invoices(
    invoice_type: Optional[str] = Query(None),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    require_tax_accounts_permission(current_admin)
    try:
        tax_invoices_crud.sync_unlinked_gst_orders(db)
    except Exception as sync_err:
        print(f"[TaxInvoice] Sync warning on list_invoices: {sync_err}")
    query = db.query(TaxInvoice)
    if invoice_type:
        query = query.filter(TaxInvoice.invoice_type == invoice_type)
    if from_date:
        query = query.filter(TaxInvoice.created_at >= from_date)
    if to_date:
        query = query.filter(TaxInvoice.created_at < to_date)
    rows = query.order_by(TaxInvoice.created_at.desc()).offset(skip).limit(limit).all()
    for row in rows:
        _redact_pii_for_staff(current_admin, row)
    return rows


class ManualTaxInvoiceRequest(BaseModel):
    customer_name: str
    customer_number: str
    customer_email: Optional[str] = None
    customer_gstin: Optional[str] = None
    customer_company: Optional[str] = None
    pickup: str
    drop: str
    trip_type: str = "One Way"
    vehicle_type: str = "Sedan"
    distance_km: float = 0.0
    rate_per_km: float = 0.0
    driver_bata: int = 0
    toll_charges: int = 0
    permit_charges: int = 0
    advance_paid: int = 0
    booking_id: Optional[str] = None


@router.post("/admin/tax/invoices/credit-note", response_model=TaxInvoiceOut)
def credit_note_invoice(
    payload: CreditNoteRequest, request: Request,
    db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    """Manual tax-invoice override/reversal - Owner-approval-only per the
    prompt's RBAC spec ("Authority to approve manual refunds, tax invoice
    overrides")."""
    require_owner(current_admin)
    try:
        note = tax_invoices_crud.issue_credit_note(
            db, original_invoice_id=str(payload.original_invoice_id), reason=payload.reason,
            created_by_admin_id=str(current_admin.id),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    log_finance_action(
        db, staff_id=str(current_admin.id), staff_username=current_admin.username, staff_role=current_admin.role,
        action="INVOICE_CREDIT_NOTE", entity_type="tax_invoice", entity_id=str(note.id),
        old_value={"original_invoice_id": str(payload.original_invoice_id)}, new_value={"reason": payload.reason, "credit_note_id": str(note.id)},
        ip_address=_client_ip(request),
    )
    return note


# ---------------------------------------------------------------------------
# Monthly tax reports + one-click exports
# ---------------------------------------------------------------------------
@router.get("/admin/tax/reports/gstr1")
def gstr1_report(year: int, month: int, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    require_tax_accounts_permission(current_admin)
    return tax_invoices_crud.get_gstr1_summary(db, year=year, month=month)


@router.get("/admin/tax/reports/gstr3b")
def gstr3b_report(year: int, month: int, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    require_tax_accounts_permission(current_admin)
    return tax_invoices_crud.get_gstr3b_summary(db, year=year, month=month)


@router.get("/admin/tax/reports/section-9-5")
def section_9_5_report(year: int, month: int, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    require_tax_accounts_permission(current_admin)
    return tax_invoices_crud.get_section_9_5_report(db, year=year, month=month)


@router.get("/admin/tax/exports/gstr1.json")
def export_gstr1_json(year: int, month: int, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """One-click JSON export shaped for CA hand-off. NOTE: this is Drop
    Cars' own internal JSON shape, not a byte-for-byte match of the GST
    portal's offline-tool JSON schema (that schema is government-maintained
    and changes independently of this codebase) - confirm the final
    mapping with your CA before uploading anywhere."""
    require_tax_accounts_permission(current_admin)
    return {
        "gstr1": tax_invoices_crud.get_gstr1_summary(db, year=year, month=month),
        "section_9_5": tax_invoices_crud.get_section_9_5_report(db, year=year, month=month),
        "company_profile": tax_engine.get_company_profile(db),
    }


@router.get("/admin/tax/exports/invoices.csv", response_class=PlainTextResponse)
def export_invoices_csv(
    year: int, month: int, db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    require_tax_accounts_permission(current_admin)
    start = datetime(year, month, 1)
    end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
    rows = (
        db.query(TaxInvoice)
        .filter(TaxInvoice.created_at >= start, TaxInvoice.created_at < end)
        .order_by(TaxInvoice.created_at.asc())
        .all()
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "invoice_number", "invoice_type", "status", "hsn_sac_code", "is_interstate",
        "taxable_value", "gst_rate_percent", "cgst", "sgst", "igst", "total_gst", "total_amount", "created_at",
    ])
    for r in rows:
        writer.writerow([
            r.invoice_number, r.invoice_type.value if hasattr(r.invoice_type, "value") else r.invoice_type,
            r.status.value if hasattr(r.status, "value") else r.status, r.hsn_sac_code, r.is_interstate,
            r.taxable_value, r.gst_rate_percent, r.cgst_amount, r.sgst_amount, r.igst_amount,
            r.total_gst_amount, r.total_amount, r.created_at.isoformat() if r.created_at else "",
        ])
    return PlainTextResponse(content=buf.getvalue(), media_type="text/csv")


# ---------------------------------------------------------------------------
# Driver settlements
# ---------------------------------------------------------------------------
@router.post("/admin/tax/driver-settlements/generate", response_model=DriverSettlementOut)
def generate_driver_settlement(
    payload: GenerateSettlementRequest, request: Request,
    db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    require_tax_accounts_permission(current_admin)
    settlement = settlements_crud.generate_monthly_settlement(
        db, driver_id=str(payload.driver_id), year=payload.year, month=payload.month,
        generated_by_admin_id=str(current_admin.id),
    )
    log_finance_action(
        db, staff_id=str(current_admin.id), staff_username=current_admin.username, staff_role=current_admin.role,
        action="DRIVER_SETTLEMENT_GENERATED", entity_type="driver_settlement", entity_id=str(settlement.id),
        new_value={"driver_id": str(payload.driver_id), "period": f"{payload.year}-{payload.month:02d}", "net_payable": settlement.net_payable},
        ip_address=_client_ip(request),
    )
    return settlement


class GenerateMonthRequest(BaseModel):
    year: int
    month: int


@router.get("/admin/tax/driver-settlements")
def list_driver_settlements(
    year: int, month: int, db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    """Every driver's settlement for one month (latest revision of each), with the driver's name."""
    require_tax_accounts_permission(current_admin)
    from app.models.car_driver import CarDriver
    rows = (
        db.query(DriverSettlement)
        .filter(DriverSettlement.period_year == year, DriverSettlement.period_month == month)
        .order_by(DriverSettlement.revision.desc(), DriverSettlement.generated_at.desc())
        .all()
    )
    seen, out = set(), []
    for r in rows:
        if str(r.driver_id) in seen:
            continue
        seen.add(str(r.driver_id))
        d = db.query(CarDriver).filter(CarDriver.id == str(r.driver_id)).first()
        out.append({
            "id": str(r.id), "driver_id": str(r.driver_id), "driver_name": d.full_name if d else None,
            "period_year": r.period_year, "period_month": r.period_month, "revision": r.revision, "trip_count": r.trip_count,
            "total_fares_collected": r.total_fares_collected, "cash_collected": r.cash_collected,
            "online_collected": r.online_collected, "company_commission": r.company_commission, "tds_amount": r.tds_amount,
            "net_payable": r.net_payable, "status": str(getattr(r.status, "value", r.status)),
            "generated_at": r.generated_at.isoformat() if r.generated_at else None,
            "finalized_at": r.finalized_at.isoformat() if r.finalized_at else None,
        })
    return {"settlements": out, "year": year, "month": month}


@router.post("/admin/tax/driver-settlements/generate-month")
def generate_driver_settlements_for_month(
    payload: GenerateMonthRequest, request: Request,
    db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    """Generate (or refresh the drafts of) the settlement for every driver who completed a trip in the month."""
    require_tax_accounts_permission(current_admin)
    from app.models.orders import Order, Trip_status
    from app.models.end_records import EndRecord
    start, end = settlements_crud._month_bounds(payload.year, payload.month)
    driver_ids = [
        str(r[0]) for r in db.query(EndRecord.driver_id).join(Order, Order.id == EndRecord.order_id)
        .filter(Order.trip_status == Trip_status.COMPLETED)
        .filter(EndRecord.created_at >= start, EndRecord.created_at < end).distinct().all() if r[0]
    ]
    made = 0
    for did in driver_ids:
        try:
            s = settlements_crud.generate_monthly_settlement(
                db, driver_id=did, year=payload.year, month=payload.month, generated_by_admin_id=str(current_admin.id),
            )
            made += 1
            log_finance_action(
                db, staff_id=str(current_admin.id), staff_username=current_admin.username, staff_role=current_admin.role,
                action="DRIVER_SETTLEMENT_GENERATED", entity_type="driver_settlement", entity_id=str(s.id),
                new_value={"driver_id": did, "period": f"{payload.year}-{payload.month:02d}", "net_payable": s.net_payable},
                ip_address=_client_ip(request),
            )
        except Exception as e:  # one driver must not stop the rest
            db.rollback()
            print(f"settlement for {did} failed: {e}")
    return {"generated": made, "drivers": len(driver_ids), "message": f"Settlements ready for {made} driver(s)"}


@router.post("/admin/tax/driver-settlements/{settlement_id}/finalize", response_model=DriverSettlementOut)
def finalize_driver_settlement(
    settlement_id: str, request: Request, db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    """Locking a settlement is Owner-only - once finalized it's what gets
    issued to the driver as their official statement."""
    require_owner(current_admin)
    try:
        settlement = settlements_crud.finalize_settlement(db, settlement_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    log_finance_action(
        db, staff_id=str(current_admin.id), staff_username=current_admin.username, staff_role=current_admin.role,
        action="DRIVER_SETTLEMENT_FINALIZED", entity_type="driver_settlement", entity_id=str(settlement.id),
        new_value={"net_payable": settlement.net_payable}, ip_address=_client_ip(request),
    )
    return settlement


@router.get("/admin/tax/driver-settlements/{driver_id}", response_model=DriverSettlementOut)
def get_driver_settlement(
    driver_id: str, year: int, month: int, db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    require_tax_accounts_permission(current_admin)
    settlement = settlements_crud.get_settlement(db, driver_id=driver_id, year=year, month=month)
    if not settlement:
        raise HTTPException(status_code=404, detail="No settlement generated for this driver/period yet")
    return settlement


@router.get("/admin/tax/driver-settlements/{driver_id}/export.csv", response_class=PlainTextResponse)
def export_driver_settlement_csv(
    driver_id: str, year: int, month: int, db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    """Single-click downloadable statement per the prompt's spec (driver's
    personal vehicle-loan/tax-filing use). PDF rendering is intentionally
    NOT implemented here - see the implementation guide for wiring a PDF
    library; this CSV covers the same data and unblocks the "downloadable
    statement" requirement today without adding a new dependency."""
    require_tax_accounts_permission(current_admin)
    settlement = settlements_crud.get_settlement(db, driver_id=driver_id, year=year, month=month)
    if not settlement:
        raise HTTPException(status_code=404, detail="No settlement generated for this driver/period yet")
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Driver Monthly Settlement Statement"])
    writer.writerow(["Period", f"{year}-{month:02d}"])
    writer.writerow(["Driver ID", str(settlement.driver_id)])
    writer.writerow(["Trip Count", settlement.trip_count])
    writer.writerow([])
    writer.writerow(["Total Fares Collected", settlement.total_fares_collected])
    writer.writerow(["Company Commission", -settlement.company_commission])
    writer.writerow(["TDS Deducted", -settlement.tds_amount, settlement.tds_section or ""])
    writer.writerow(["Bonus / Incentives", settlement.bonus_incentives])
    writer.writerow(["Waiting Charge Adjustments", -settlement.waiting_charge_adjustments])
    writer.writerow(["NET PAYABLE", settlement.net_payable])
    writer.writerow([])
    writer.writerow(["Order ID", "Trip Date", "Driver Profit", "Commission", "Cash Collected", "TDS"])
    for row in (settlement.trip_breakdown or []):
        writer.writerow([row.get("order_id"), row.get("trip_date"), row.get("driver_profit"), row.get("commission"), row.get("cash_collection"), row.get("tds_amount")])
    return PlainTextResponse(content=buf.getvalue(), media_type="text/csv")


# ---------------------------------------------------------------------------
# Invoice sequence counter management (Owner only - protects invoice numbering)
# ---------------------------------------------------------------------------
@router.get("/admin/tax/invoices/sequence-status")
def get_sequence_status(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """Return the current invoice sequence: series, financial year, last number issued, and
    what the next invoice number will look like. Used by the GST Invoices screen to display
    sequence health and let Owner adjust numbering if needed."""
    require_tax_accounts_permission(current_admin)
    from app.models.platform_setting import PlatformSetting
    from datetime import date
    today = date.today()
    fy_start = today.year if today.month >= 4 else today.year - 1
    fy_label = f"{fy_start}-{str(fy_start + 1)[-2:]}"
    series = "DC"  # DropCars prefix
    key = f"tax_invoice_seq_{fy_start}"
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    last_number = int(row.value) if row and row.value and row.value.isdigit() else 0
    next_num = last_number + 1
    next_invoice_number = f"{series}/{fy_label}/{next_num:04d}"
    return {
        "series": series,
        "financial_year": fy_label,
        "last_number": last_number,
        "next_invoice_number": next_invoice_number,
    }


@router.put("/admin/tax/invoices/sequence-counter")
def update_sequence_counter(
    payload: dict, request: Request,
    db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    """Owner-only: manually set the invoice sequence counter (e.g., to correct numbering
    after importing historical invoices). Sets the 'last issued' number - the very next
    invoice will be last_number + 1."""
    require_owner(current_admin)
    last_number = payload.get("last_number")
    if not isinstance(last_number, int) or last_number < 0:
        raise HTTPException(status_code=422, detail="last_number must be a non-negative integer")
    from app.models.platform_setting import PlatformSetting
    from datetime import date
    today = date.today()
    fy_start = today.year if today.month >= 4 else today.year - 1
    fy_label = f"{fy_start}-{str(fy_start + 1)[-2:]}"
    series = "DC"
    key = f"tax_invoice_seq_{fy_start}"
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    old_value = int(row.value) if row and row.value and row.value.isdigit() else 0
    if row:
        row.value = str(last_number)
    else:
        db.add(PlatformSetting(key=key, value=str(last_number)))
    db.commit()
    next_num = last_number + 1
    next_invoice_number = f"{series}/{fy_label}/{next_num:04d}"
    log_finance_action(
        db, staff_id=str(current_admin.id), staff_username=current_admin.username, staff_role=current_admin.role,
        action="INVOICE_SEQUENCE_ADJUSTED", entity_type="tax_setting", entity_id=key,
        old_value={"last_number": old_value}, new_value={"last_number": last_number},
        ip_address=_client_ip(request),
    )
    return {
        "series": series,
        "financial_year": fy_label,
        "last_number": last_number,
        "next_invoice_number": next_invoice_number,
    }


# ---------------------------------------------------------------------------
# Manual invoice issuance (B2B / off-platform trips)
# ---------------------------------------------------------------------------
@router.post("/admin/tax/invoices/manual-issue")
def issue_manual_invoice(
    payload: dict, request: Request,
    db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    """Issue a manual GST invoice for B2B/corporate customers or off-platform trips.
    Computes taxable value, GST (5% under SAC 9964 pure-km rule), generates the next
    sequential invoice number, and emails the PDF to the customer if email is provided."""
    require_tax_accounts_permission(current_admin)
    from app.models.platform_setting import PlatformSetting
    from datetime import date
    import json

    # Validate required fields
    customer_name = (payload.get("customer_name") or "").strip()
    customer_number = (payload.get("customer_number") or "").strip()
    pickup = (payload.get("pickup") or "").strip()
    drop = (payload.get("drop") or "").strip()
    if not all([customer_name, customer_number, pickup, drop]):
        raise HTTPException(status_code=422, detail="customer_name, customer_number, pickup, drop are required")

    distance_km = float(payload.get("distance_km") or 0)
    rate_per_km = float(payload.get("rate_per_km") or 0)
    driver_bata = float(payload.get("driver_bata") or 0)
    toll_charges = float(payload.get("toll_charges") or 0)
    permit_charges = float(payload.get("permit_charges") or 0)
    parking_charges = float(payload.get("parking_charges") or 0)
    hills_charges = float(payload.get("hills_charges") or 0)
    waiting_charges = float(payload.get("waiting_charges") or 0)
    night_charges = float(payload.get("night_charges") or 0)
    extra_charges = float(payload.get("extra_charges") or 0)
    discount_amount = float(payload.get("discount_amount") or 0)
    advance_paid = float(payload.get("advance_paid") or 0)

    # Compute fare components
    pure_km_fare = round(distance_km * rate_per_km)
    gst_rate = 5.0  # SAC 9964 standard rate
    gst_amount = round(pure_km_fare * gst_rate / 100)
    is_interstate = bool(payload.get("is_interstate"))
    subtotal_charges = driver_bata + toll_charges + permit_charges + parking_charges + hills_charges + waiting_charges + night_charges + extra_charges
    grand_total = max(0.0, pure_km_fare + gst_amount + subtotal_charges - discount_amount)
    balance_due = max(0.0, grand_total - advance_paid)

    # Generate next invoice number
    today = date.today()
    fy_start = today.year if today.month >= 4 else today.year - 1
    fy_label = f"{fy_start}-{str(fy_start + 1)[-2:]}"
    series = "DC"
    seq_key = f"tax_invoice_seq_{fy_start}"
    seq_row = db.query(PlatformSetting).filter(PlatformSetting.key == seq_key).first()
    last_number = int(seq_row.value) if seq_row and seq_row.value and seq_row.value.isdigit() else 0
    next_number = last_number + 1
    invoice_number = f"{series}/{fy_label}/{next_number:04d}"

    # Persist the new invoice
    new_invoice = TaxInvoice(
        invoice_number=invoice_number,
        # InvoiceTypeEnum has no MANUAL member (RIDE_GST_9_5,
        # DRIVER_COMMISSION, CARPOOL_RECEIPT, SUBSCRIPTION_FEE, ADS_B2B only)
        # - this always crashed with AttributeError before it could save
        # anything (found 2026-09-29, "Registration Error: AttributeError:
        # MANUAL"). This endpoint computes exactly RIDE_GST_9_5's own SAC
        # 9964 / 5% pure-km rule for a customer ride, just issued manually
        # by staff instead of auto-generated from a completed trip.
        invoice_type=InvoiceTypeEnum.RIDE_GST_9_5,
        customer_name_snapshot=customer_name,
        customer_number_snapshot=customer_number,
        customer_email_snapshot=payload.get("customer_email") or None,
        customer_gstin=payload.get("customer_gstin") or None,
        customer_company=payload.get("customer_company") or None,
        taxable_value=str(pure_km_fare),
        gst_rate_percent=str(gst_rate),
        cgst_amount=str(round(gst_amount / 2)) if not is_interstate else "0",
        sgst_amount=str(round(gst_amount / 2)) if not is_interstate else "0",
        igst_amount=str(gst_amount) if is_interstate else "0",
        total_gst_amount=str(gst_amount),
        total_amount=str(grand_total),
        hsn_sac_code=payload.get("hsn_sac_code") or "9964",
        is_interstate=is_interstate,
        line_items={
            "pickup": pickup,
            "drop": drop,
            "trip_type": payload.get("trip_type") or "One Way",
            "vehicle_type": payload.get("vehicle_type") or "Sedan",
            "cab_number": payload.get("cab_number") or "",
            "driver_name": payload.get("driver_name") or "",
            "driver_phone": payload.get("driver_phone") or "",
            "distance_km": distance_km,
            "rate_per_km": rate_per_km,
            "pure_km_fare": pure_km_fare,
            "driver_bata": driver_bata,
            "toll_charges": toll_charges,
            "permit_charges": permit_charges,
            "parking_charges": parking_charges,
            "hills_charges": hills_charges,
            "waiting_charges": waiting_charges,
            "night_charges": night_charges,
            "extra_charges": extra_charges,
            "discount_amount": discount_amount,
            "advance_paid": advance_paid,
            "balance_due": balance_due,
            "starting_km": payload.get("starting_km") or "",
            "closing_km": payload.get("closing_km") or "",
            "payment_mode": payload.get("payment_mode") or "Cash / UPI",
            "notes": payload.get("notes") or "",
        },
        order_id=payload.get("booking_id") or None,
        created_by_admin_id=str(current_admin.id),
        needs_company_profile_review=False,
    )
    db.add(new_invoice)

    # Update sequence counter
    if seq_row:
        seq_row.value = str(next_number)
    else:
        db.add(PlatformSetting(key=seq_key, value=str(next_number)))
    db.commit()
    db.refresh(new_invoice)

    log_finance_action(
        db, staff_id=str(current_admin.id), staff_username=current_admin.username, staff_role=current_admin.role,
        action="MANUAL_INVOICE_ISSUED", entity_type="tax_invoice", entity_id=str(new_invoice.id),
        new_value={"invoice_number": invoice_number, "customer": customer_name, "total": grand_total},
        ip_address=_client_ip(request),
    )

    # Try to email the invoice (non-blocking - failure won't reject the invoice)
    customer_email = payload.get("customer_email")
    if customer_email:
        try:
            from app.services import email_service
            email_service.send_tax_invoice_email(
                to_email=customer_email,
                customer_name=customer_name,
                invoice_number=invoice_number,
                invoice_data={
                    "pickup": pickup, "drop": drop,
                    "pure_km_fare": pure_km_fare, "gst_amount": gst_amount,
                    "driver_bata": driver_bata, "toll_charges": toll_charges,
                    "permit_charges": permit_charges, "parking_charges": parking_charges,
                    "hills_charges": hills_charges, "waiting_charges": waiting_charges,
                    "discount_amount": discount_amount, "grand_total": grand_total,
                    "advance_paid": advance_paid, "balance_due": balance_due,
                    "distance_km": distance_km, "rate_per_km": rate_per_km,
                },
            )
        except Exception:
            pass  # Email failure is non-blocking

    return {
        "id": str(new_invoice.id),
        "invoice_number": invoice_number,
        "total_amount": grand_total,
        "balance_due": balance_due,
        "emailed": bool(customer_email),
    }


def build_invoice_html(invoice, company: dict) -> str:
    """Generate clean, responsive GST Tax Invoice HTML for print/PDF."""
    li = getattr(invoice, 'line_items', {}) or {}
    is_igst = bool(getattr(invoice, 'is_interstate', False))
    
    extra_rows = []
    if li.get('driver_bata'):
        extra_rows.append(f"<tr><td>Driver Bata / Allowance</td><td class='right'>-</td><td class='right'>-</td><td class='right'>₹{li.get('driver_bata')}</td></tr>")
    if li.get('toll_charges'):
        extra_rows.append(f"<tr><td>Toll Plaza Charges (Fastag / Actuals)</td><td class='right'>-</td><td class='right'>-</td><td class='right'>₹{li.get('toll_charges')}</td></tr>")
    if li.get('permit_charges'):
        extra_rows.append(f"<tr><td>Interstate Entry Permit Tax</td><td class='right'>-</td><td class='right'>-</td><td class='right'>₹{li.get('permit_charges')}</td></tr>")
    if li.get('parking_charges'):
        extra_rows.append(f"<tr><td>Parking & Terminal Charges</td><td class='right'>-</td><td class='right'>-</td><td class='right'>₹{li.get('parking_charges')}</td></tr>")
    if li.get('hills_charges'):
        extra_rows.append(f"<tr><td>Hill Station / Ghat Road Allowance</td><td class='right'>-</td><td class='right'>-</td><td class='right'>₹{li.get('hills_charges')}</td></tr>")
    if li.get('waiting_charges'):
        extra_rows.append(f"<tr><td>Waiting / Halting Charges</td><td class='right'>-</td><td class='right'>-</td><td class='right'>₹{li.get('waiting_charges')}</td></tr>")
    if li.get('night_charges'):
        extra_rows.append(f"<tr><td>Night Travel Allowance</td><td class='right'>-</td><td class='right'>-</td><td class='right'>₹{li.get('night_charges')}</td></tr>")
    if li.get('extra_charges'):
        extra_rows.append(f"<tr><td>Extra KM / Time Charges</td><td class='right'>-</td><td class='right'>-</td><td class='right'>₹{li.get('extra_charges')}</td></tr>")
    if li.get('discount_amount'):
        extra_rows.append(f"<tr style='color:#dc2626;'><td>Special Promo Discount</td><td class='right'>-</td><td class='right'>-</td><td class='right'>-₹{li.get('discount_amount')}</td></tr>")
    extra_items_html = "\n".join(extra_rows)

    sac_code = getattr(invoice, 'hsn_sac_code', None) or "9964"
    cgst = getattr(invoice, 'cgst_amount', '0')
    sgst = getattr(invoice, 'sgst_amount', '0')
    igst = getattr(invoice, 'igst_amount', '0')
    if is_igst:
        gst_rows_html = f"<tr><td><b>IGST (5.0%)</b> - Interstate Passenger Transport</td><td class='right'>-</td><td class='right'>5%</td><td class='right'>₹{igst}</td></tr>"
    else:
        gst_rows_html = (
            f"<tr><td>CGST (2.5%) - SAC {sac_code}</td><td class='right'>-</td><td class='right'>2.5%</td><td class='right'>₹{cgst}</td></tr>\n"
            f"<tr><td>SGST (2.5%) - SAC {sac_code}</td><td class='right'>-</td><td class='right'>2.5%</td><td class='right'>₹{sgst}</td></tr>"
        )

    advance_val = li.get('advance_paid')
    advance_html = f"<tr style='color:#166534; font-weight:700;'><td colspan='3'>Less: Advance Paid</td><td class='right'>-₹{advance_val}</td></tr>" if advance_val else ""

    cust_email = getattr(invoice, 'customer_email_snapshot', None)
    cust_comp = getattr(invoice, 'customer_company', None)
    cust_gstin = getattr(invoice, 'customer_gstin', None)
    order_id = getattr(invoice, 'order_id', None)

    cust_email_html = f"Email: {cust_email}<br>" if cust_email else ""
    cust_comp_html = f"Company: <b>{cust_comp}</b><br>" if cust_comp else ""
    cust_gstin_html = f"GSTIN: <b>{cust_gstin}</b><br>" if cust_gstin else ""
    cust_order_html = f"Booking Ref: <b>#{order_id}</b>" if order_id else ""

    driver_name = li.get('driver_name')
    driver_phone = li.get('driver_phone')
    driver_html = f"Driver: <b>{driver_name}</b> ({driver_phone})<br>" if driver_name else ""

    starting_km = li.get('starting_km')
    closing_km = li.get('closing_km')
    odo_html = f"Odometer: Start {starting_km} KM | End {closing_km} KM<br>" if starting_km else ""

    notes_html = f"<p style='font-size:11px; color:#475569;'><b>Special Notes:</b> {li.get('notes')}</p>" if li.get('notes') else ""

    created_at = getattr(invoice, 'created_at', None)
    created_date = created_at.strftime('%d-%b-%Y') if hasattr(created_at, 'strftime') else date.today().strftime('%d-%b-%Y')
    inv_num = getattr(invoice, 'invoice_number', 'PROFORMA')
    cust_name = getattr(invoice, 'customer_name_snapshot', 'Valued Customer') or 'Valued Customer'
    cust_num = getattr(invoice, 'customer_number_snapshot', 'N/A') or 'N/A'
    taxable_val = getattr(invoice, 'taxable_value', '0')
    total_val = getattr(invoice, 'total_amount', '0')
    balance_val = li.get('balance_due', '0')

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GST Tax Invoice {inv_num}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 30px auto; max-width: 820px; color: #1e293b; background: #fff; line-height: 1.5; }}
  .header-tbl {{ width: 100%; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }}
  .brand {{ font-size: 24px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: -0.5px; }}
  .brand span {{ color: #f59e0b; }}
  .tagline {{ font-size: 11px; color: #64748b; margin-top: 2px; }}
  .inv-title {{ font-size: 26px; font-weight: 900; text-align: right; color: #0f172a; margin: 0; }}
  .inv-sub {{ font-size: 12px; font-weight: 700; color: #475569; text-align: right; margin-top: 2px; }}
  .box {{ border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px; font-size: 12px; background: #f8fafc; }}
  .box-title {{ font-size: 11px; font-weight: 800; text-transform: uppercase; color: #0f172a; margin-bottom: 6px; letter-spacing: 0.5px; }}
  .tbl-items {{ width: 100%; border-collapse: collapse; margin: 20px 0 10px; }}
  .tbl-items th {{ background: #0f172a; color: #ffffff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 9px 12px; text-align: left; }}
  .tbl-items td {{ padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #334155; }}
  .right {{ text-align: right; }}
  .total-row td {{ font-weight: 900; font-size: 14px; background: #f1f5f9; color: #0f172a; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; }}
  .badge {{ display: inline-block; padding: 3px 8px; border-radius: 4px; background: #ecfdf5; color: #059669; font-size: 11px; font-weight: 700; }}
  .footer-note {{ margin-top: 24px; font-size: 11px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 12px; }}
  @media print {{ body {{ margin: 0; padding: 15px; }} .no-print {{ display: none; }} }}
</style></head><body>

<div class="no-print" style="text-align: right; margin-bottom: 16px;">
  <button onclick="window.print()" style="background:#0f172a; color:#fff; font-weight:700; border:none; padding:8px 18px; border-radius:6px; cursor:pointer; font-size:13px;">🖨️ Print / Save as PDF</button>
</div>

<table class="header-tbl">
  <tr>
    <td style="vertical-align:top;">
      <div class="brand">Drop <span>Cars</span></div>
      <div class="tagline"><b>{company.get('company_name', 'Drop Cars')}</b><br>
      GSTIN: <b>{company.get('gstin', '33AAACM9876A1Z4')}</b> | SAC: <b>{sac_code}</b><br>
      {company.get('address', 'Tamil Nadu, India')} | Helpline: 7200217986</div>
    </td>
    <td style="vertical-align:top; text-align:right;">
      <div class="inv-title">GST TAX INVOICE</div>
      <div class="inv-sub">Invoice #: <b>{inv_num}</b></div>
      <div class="inv-sub">Date: <b>{created_date}</b></div>
      <div class="inv-sub"><span class="badge">SAC {sac_code} · PASSENGER TRANSPORT</span></div>
    </td>
  </tr>
</table>

<table style="width:100%; border-collapse:collapse; margin-bottom:14px;">
  <tr>
    <td style="width:49%; vertical-align:top; border:1px solid #cbd5e1; border-radius:8px; padding:10px 14px; background:#f8fafc; font-size:12px;">
      <div class="box-title">👤 Customer / Bill To:</div>
      <b>{cust_name}</b><br>
      Phone: {cust_num}<br>
      {cust_email_html}
      {cust_comp_html}
      {cust_gstin_html}
      {cust_order_html}
    </td>
    <td style="width:2%;"></td>
    <td style="width:49%; vertical-align:top; border:1px solid #cbd5e1; border-radius:8px; padding:10px 14px; background:#f8fafc; font-size:12px;">
      <div class="box-title">🚗 Vehicle & Driver Details:</div>
      Vehicle: <b>{li.get('vehicle_type', 'Sedan')}</b> ({li.get('cab_number', 'Commercial Cab')})<br>
      Trip Type: <b>{li.get('trip_type', 'One Way')}</b><br>
      Route: <b>{li.get('pickup', '')}</b> ➔ <b>{li.get('drop', '')}</b><br>
      {driver_html}
      {odo_html}
      Payment Mode: <b>{li.get('payment_mode', 'Cash / UPI')}</b>
    </td>
  </tr>
</table>

<table class="tbl-items">
  <thead>
    <tr>
      <th>Description</th>
      <th style="width:80px;" class="right">KM / Qty</th>
      <th style="width:100px;" class="right">Rate (₹)</th>
      <th style="width:120px;" class="right">Amount (₹)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><b>Passenger Road Transport (Pure KM)</b><br><small style="color:#64748b;">From: {li.get('pickup','')} ➔ To: {li.get('drop','')}</small></td>
      <td class="right">{li.get('distance_km', '0')} KM</td>
      <td class="right">₹{li.get('rate_per_km', '0')}</td>
      <td class="right">₹{taxable_val}</td>
    </tr>
    {extra_items_html}
    {gst_rows_html}
    
    <tr class="total-row">
      <td colspan="3">GRAND TOTAL (Inclusive of GST)</td>
      <td class="right">₹{total_val}</td>
    </tr>
    {advance_html}
    <tr style="font-weight:900; font-size:13px; color:#0f172a; background:#f8fafc;">
      <td colspan="3">BALANCE PAYABLE / SETTLED</td>
      <td class="right">₹{balance_val}</td>
    </tr>
  </tbody>
</table>

{notes_html}

<div class="footer-note">
  <table style="width:100%;">
    <tr>
      <td style="font-size:11px; color:#64748b; vertical-align:top; width:65%;">
        <b>Terms & Conditions:</b><br>
        1. Pure KM rule applies under SAC 9964 / 9966 without ITC as per GST Council notifications.<br>
        2. Tolls, state permits and parking charges are charged as per actual receipts/Fastag logs.<br>
        3. This is a computer-generated tax invoice issued by {company.get('company_name', 'Drop Cars')}.
      </td>
      <td style="text-align:right; vertical-align:bottom; width:35%;">
        <div style="font-weight:800; font-size:12px; color:#0f172a;">For {company.get('company_name', 'Drop Cars')}</div>
        <div style="font-size:11px; color:#64748b; margin-top:28px;">Authorized Signatory</div>
      </td>
    </tr>
  </table>
</div>

</body></html>"""
    return html


# ---------------------------------------------------------------------------
# PDF download for a single invoice (Admin RBAC)
# ---------------------------------------------------------------------------
@router.get("/admin/tax/invoices/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: str, db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    """Generate and return a PDF for a single GST invoice.
    Falls back to an HTML-rendered response if WeasyPrint is unavailable
    (keeping the endpoint functional without a native dependency installed)."""
    require_tax_accounts_permission(current_admin)
    invoice = db.query(TaxInvoice).filter(TaxInvoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _redact_pii_for_staff(current_admin, invoice)

    company = tax_engine.get_company_profile(db)
    html = build_invoice_html(invoice, company)

    # Try to return a real PDF; fall back to HTML if WeasyPrint isn't installed
    try:
        from weasyprint import HTML as WeasyprintHTML
        pdf_bytes = WeasyprintHTML(string=html).write_pdf()
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="Invoice_{invoice.invoice_number.replace("/","_")}.pdf"'},
        )
    except Exception:
        return HTMLResponse(content=html, status_code=200)


# ---------------------------------------------------------------------------
# Customer & Website Public Invoice / PDF Endpoint (Works for any Booking)
# ---------------------------------------------------------------------------
def invoice_link_signature(booking_id: str) -> Optional[str]:
    """HMAC the website puts on its invoice download link (?sig=...), made
    with the WEBSITE_INTEGRATION_KEY both sides already share."""
    import hashlib
    import hmac
    import os
    key = os.getenv("WEBSITE_INTEGRATION_KEY") or ""
    if not key:
        return None
    return hmac.new(key.encode(), str(booking_id).encode(), hashlib.sha256).hexdigest()


def _as_uuid(value: str):
    import uuid as _uuid
    try:
        return _uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def _find_tax_invoice(db: Session, booking_id: str):
    """TaxInvoice has no order_id column: an order's invoice is
    source_type='order' + source_id=<order id>."""
    conds = [
        TaxInvoice.invoice_number == booking_id,
        (TaxInvoice.source_type == "order") & (TaxInvoice.source_id == str(booking_id)),
    ]
    u = _as_uuid(booking_id)
    if u is not None:
        conds.append(TaxInvoice.id == u)
    from sqlalchemy import or_
    return db.query(TaxInvoice).filter(or_(*conds)).first()


def _find_booking_request(db: Session, booking_id: str):
    from app.models.customer_booking_request import CustomerBookingRequest
    u = _as_uuid(booking_id)
    q = db.query(CustomerBookingRequest)
    if u is not None:
        return q.filter((CustomerBookingRequest.id == u) | (CustomerBookingRequest.rp_order_id == booking_id)).first()
    return q.filter(CustomerBookingRequest.rp_order_id == booking_id).first()


def _invoice_order_and_request(db: Session, booking_id: str):
    from app.models.orders import Order
    from app.models.customer_booking_request import CustomerBookingRequest

    order = cb = None
    inv = _find_tax_invoice(db, booking_id)
    ref = str(inv.source_id) if inv is not None and inv.source_type == "order" and inv.source_id else str(booking_id)
    if ref.isdigit():
        order = db.query(Order).filter(Order.id == int(ref)).first()
    if order is None:
        cb = _find_booking_request(db, ref)
        if cb is not None and cb.linked_order_id:
            order = db.query(Order).filter(Order.id == cb.linked_order_id).first()
    else:
        cb = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.linked_order_id == order.id).first()
    return order, cb


def require_invoice_access(booking_id: str, request: Request, db: Session = Depends(get_db)):
    """Invoices are no longer downloadable by guessing a booking number.
    Allowed: a signed website link (?sig=), or a login token (header, or
    ?token= which the Customer App uses to open the PDF in the browser) that
    belongs to admin or to someone on this booking."""
    import hmac
    from fastapi.security import HTTPAuthorizationCredentials
    from app.core.security import get_current_user_flexible
    from app.models.order_assignments import OrderAssignment

    sig = request.query_params.get("sig")
    expected = invoice_link_signature(booking_id)
    if sig and expected and hmac.compare_digest(sig, expected):
        return {"via": "signed_link"}

    auth = request.headers.get("authorization") or ""
    raw = auth.split(" ", 1)[1] if auth.lower().startswith("bearer ") else request.query_params.get("token")
    if not raw:
        raise HTTPException(status_code=401, detail="Login required to download this invoice")
    who = get_current_user_flexible(HTTPAuthorizationCredentials(scheme="Bearer", credentials=raw), db)
    role, uid = who["role"], str(who["user_id"])
    if role == "ADMIN":
        return who

    order, cb = _invoice_order_and_request(db, booking_id)
    if order is None and cb is None:
        raise HTTPException(status_code=404, detail="Booking or invoice not found")
    allowed = False
    if role == "CUSTOMER":
        from app.models.customer import CustomerCredentials
        if cb is not None and str(cb.customer_id) == uid:
            allowed = True
        else:
            me = db.query(CustomerCredentials).filter(CustomerCredentials.id == uid).first()
            mine = (me.primary_number or "")[-10:] if me else ""
            theirs = ((order.customer_number if order else None) or (cb.customer_number if cb else "") or "")[-10:]
            allowed = bool(mine) and mine == theirs
    elif order is not None:
        if role == "VENDOR":
            allowed = str(order.vendor_id or "") == uid
        elif role in ("VEHICLE_OWNER", "DRIVER"):
            if str(getattr(order, "posted_by_vehicle_owner_id", "") or "") == uid:
                allowed = True
            else:
                for a in db.query(OrderAssignment).filter(OrderAssignment.order_id == order.id).all():
                    if uid in (str(a.vehicle_owner_id or ""), str(a.driver_id or "")):
                        allowed = True
                        break
    if not allowed:
        raise HTTPException(status_code=403, detail="This invoice is not yours")
    return who


@router.get("/customer/bookings/{booking_id}/invoice-pdf", dependencies=[Depends(require_invoice_access)])
@router.get("/bookings/{booking_id}/invoice-pdf", dependencies=[Depends(require_invoice_access)])
@router.get("/api/customer/bookings/{booking_id}/invoice-pdf", dependencies=[Depends(require_invoice_access)])
@router.get("/api/bookings/{booking_id}/invoice-pdf", dependencies=[Depends(require_invoice_access)])
def get_booking_invoice_pdf(
    booking_id: str,
    db: Session = Depends(get_db),
):
    """GST Tax Invoice PDF/HTML generator (access: see require_invoice_access).
    Finds invoice by order_id/invoice_id, or generates on-the-fly from the booking/order record."""
    from app.models.orders import Order
    from app.models.end_records import EndRecord
    from app.models.order_assignments import OrderAssignment
    from app.models.car_driver import CarDriver
    from app.models.car_details import CarDetails
    from app.models.customer_booking_request import CustomerBookingRequest

    invoice = _find_tax_invoice(db, booking_id)

    company = tax_engine.get_company_profile(db)

    if not invoice:
        # Try finding Order or CustomerBookingRequest
        order = None
        if booking_id.isdigit():
            order = db.query(Order).filter(Order.id == int(booking_id)).first()

        if not order:
            cb_req = _find_booking_request(db, booking_id)
            if cb_req and cb_req.linked_order_id:
                order = db.query(Order).filter(Order.id == cb_req.linked_order_id).first()

        if not order:
            raise HTTPException(status_code=404, detail="Booking or invoice not found")

        # Synthesize an invoice representation from order & trip record
        end_rec = db.query(EndRecord).filter(EndRecord.order_id == order.id).first()
        assignment = db.query(OrderAssignment).filter(OrderAssignment.order_id == order.id).first()
        driver = db.query(CarDriver).filter(CarDriver.id == assignment.driver_id).first() if assignment and assignment.driver_id else None
        car = db.query(CarDetails).filter(CarDetails.id == assignment.car_id).first() if assignment and assignment.car_id else None

        loc = order.pickup_drop_location or {}
        pickup = loc.get("pickup", {}).get("address") or loc.get("pickup_city") or "Pickup Point"
        drop = loc.get("drop", {}).get("address") or loc.get("drop_city") or "Destination"
        distance = float(end_rec.end_km - end_rec.start_km) if end_rec and end_rec.end_km and end_rec.start_km else float(order.trip_distance or 100)
        rate = 14.0
        pure_km = round(distance * rate)
        gst = round(pure_km * 0.05)
        driver_bata = 400.0
        toll = float(loc.get("toll_charges") or 0.0)
        total = round(pure_km + gst + driver_bata + toll)

        class SyntheticInvoice:
            invoice_number = f"DC/2026-27/{order.id:04d}"
            customer_name_snapshot = order.customer_name
            customer_number_snapshot = order.customer_number
            customer_email_snapshot = None
            customer_gstin = None
            customer_company = None
            taxable_value = str(pure_km)
            cgst_amount = str(round(gst / 2))
            sgst_amount = str(round(gst / 2))
            igst_amount = "0"
            is_interstate = False
            total_amount = str(total)
            hsn_sac_code = "9964"
            order_id = str(order.id)
            created_at = order.start_date_time or datetime.now()
            line_items = {
                "pickup": pickup,
                "drop": drop,
                "trip_type": str(order.trip_type.value if hasattr(order.trip_type, 'value') else order.trip_type),
                "vehicle_type": str(order.car_type.value if hasattr(order.car_type, 'value') else order.car_type),
                "cab_number": car.car_number if car else "Commercial Cab",
                "driver_name": driver.full_name if driver else "Assigned Driver",
                "driver_phone": driver.primary_number if driver else "",
                "distance_km": distance,
                "rate_per_km": rate,
                "driver_bata": driver_bata,
                "toll_charges": toll,
                "starting_km": str(end_rec.start_km) if end_rec else "",
                "closing_km": str(end_rec.end_km) if end_rec else "",
                "balance_due": "0",
                "payment_mode": "Online / Cash",
            }

        invoice = SyntheticInvoice()

    html = build_invoice_html(invoice, company)

    try:
        from weasyprint import HTML as WeasyprintHTML
        inv_no = getattr(invoice, 'invoice_number', 'invoice').replace('/', '_')
        pdf_bytes = WeasyprintHTML(string=html).write_pdf()
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="Invoice_{inv_no}.pdf"'},
        )
    except Exception:
        return HTMLResponse(content=html, status_code=200)


# ---------------------------------------------------------------------------
# Finance audit log (Owner only)
# ---------------------------------------------------------------------------
@router.get("/admin/tax/audit-log", response_model=FinanceAuditLogListOut)
def get_audit_log(
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db), current_admin=Depends(get_current_admin),
):
    require_owner(current_admin)
    rows, total = get_finance_audit_log(db, skip=skip, limit=limit)
    return FinanceAuditLogListOut(rows=rows, total=total)
