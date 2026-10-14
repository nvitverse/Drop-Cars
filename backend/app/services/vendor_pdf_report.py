"""Vendor statements, built from the vendor's wallet ledger - the one record every credit and debit goes through, so the statement can never
disagree with the wallet balance. (It used to re-derive a "2% commission" from the bookings, which stopped being true with the v2 commission
rules and showed numbers that matched nothing in the wallet.)"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.models.payout_request import PayoutRequest, PayoutRequestStatusEnum
from app.models.vendor import VendorCredentials as Vendor
from app.models.vendor_details import VendorDetails
from app.models.vendor_wallet_ledger import VendorLedgerEntryType, VendorWalletLedger

logger = logging.getLogger(__name__)


def _month_rows(db: Session, vendor_id: str, year: int, month: int):
    return (db.query(VendorWalletLedger)
            .filter(VendorWalletLedger.vendor_id == vendor_id, extract("year", VendorWalletLedger.created_at) == year,
                    extract("month", VendorWalletLedger.created_at) == month)
            .order_by(VendorWalletLedger.created_at.asc()).all())


def generate_vendor_monthly_statement(db: Session, vendor_id: str, year: int, month: int) -> Dict[str, Any]:
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    detail = db.query(VendorDetails).filter(VendorDetails.vendor_id == vendor_id).first()
    name = getattr(detail, "business_name", None) or getattr(detail, "full_name", None) or "Vendor"
    rows = _month_rows(db, vendor_id, year, month)
    credits = sum(int(r.amount) for r in rows if r.entry_type == VendorLedgerEntryType.CREDIT)
    debits = sum(int(r.amount) for r in rows if r.entry_type == VendorLedgerEntryType.DEBIT)
    trips = {r.order_id for r in rows if r.order_id is not None and r.entry_type == VendorLedgerEntryType.CREDIT}
    paid_out = (db.query(PayoutRequest)
                .filter(PayoutRequest.vendor_id == vendor_id, PayoutRequest.status == PayoutRequestStatusEnum.PAID,
                        extract("year", PayoutRequest.processed_at) == year, extract("month", PayoutRequest.processed_at) == month).all())
    return {
        "vendor_id": str(vendor_id), "business_name": name, "period": f"{year}-{month:02d}", "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "earned": credits, "deducted": debits, "net": credits - debits, "trips_with_earnings": len(trips),
            "paid_out_to_bank": sum(int(p.amount) for p in paid_out),
            "opening_balance": int(rows[0].balance_before) if rows else None, "closing_balance": int(rows[-1].balance_after) if rows else None,
        },
        "entries": [{"date": r.created_at.strftime("%Y-%m-%d") if r.created_at else "", "type": r.entry_type.value, "amount": int(r.amount),
                     "order_id": r.order_id, "notes": r.notes, "balance_after": int(r.balance_after)} for r in rows],
    }


def vendor_earnings_summary(db: Session, vendor_id: str) -> Dict[str, Any]:
    """Dashboard card: this month and last month, from the same ledger."""
    now = datetime.now(timezone.utc)
    ly, lm = (now.year, now.month - 1) if now.month > 1 else (now.year - 1, 12)
    this_m = generate_vendor_monthly_statement(db, vendor_id, now.year, now.month)["summary"]
    last_m = generate_vendor_monthly_statement(db, vendor_id, ly, lm)["summary"]
    detail = db.query(VendorDetails).filter(VendorDetails.vendor_id == vendor_id).first()
    open_orders = 0
    try:
        from app.models.orders import Order, Trip_status
        open_orders = db.query(Order).filter(Order.vendor_id == vendor_id, Order.trip_status.in_([Trip_status.PENDING, Trip_status.ASSIGNED, Trip_status.STARTED])).count()
    except Exception as e:  # noqa: BLE001
        logger.warning("open order count failed: %s", e)
    return {"this_month": this_m, "last_month": last_m, "wallet_balance": int(getattr(detail, "wallet_balance", 0) or 0), "open_bookings": open_orders,
            "this_period": f"{now.year}-{now.month:02d}", "last_period": f"{ly}-{lm:02d}"}
