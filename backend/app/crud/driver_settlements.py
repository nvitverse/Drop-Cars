# crud/driver_settlements.py
"""
Generates the monthly driver balance-sheet (DriverSettlement) from the
real trip-close data already in Order + EndRecord (see
app/crud/end_records.py's update_end_trip_record, which is what actually
populates driver_profit/cash_collection per trip). This module only reads
and rolls up - it never recomputes commission/profit itself, so a
settlement always matches what the driver was actually paid at trip close.

bonus_incentives and waiting_charge_adjustments are left at 0 with a clear
TODO below - this codebase's Order/EndRecord models don't currently carry
a separate "bonus" or "waiting-charge line item" column to roll up (waiting
charges today are folded into the itemized NewOrder.driver_allowance at
booking time, not tracked as a separate settled amount). Wire these once a
real bonus/incentive ledger exists; don't fabricate numbers here.
"""
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.models.orders import Order, Trip_status
from app.models.end_records import EndRecord
from app.models.driver_settlement import DriverSettlement, SettlementStatusEnum
from app.utils import tax_engine


def _month_bounds(year: int, month: int):
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end = datetime(year + 1, 1, 1, tzinfo=timezone.utc) if month == 12 else datetime(year, month + 1, 1, tzinfo=timezone.utc)
    return start, end


def _driver_ytd_gross_before(db: Session, driver_id: str, fy_start: datetime, period_start: datetime) -> int:
    """Sum of this driver's closed_driver_price for COMPLETED trips from
    financial-year start up to (not including) this settlement period -
    the running total compute_tds needs to know whether THIS period is
    what pushes the driver over the 194-O annual threshold."""
    rows = (
        db.query(Order.closed_driver_price)
        .join(EndRecord, EndRecord.order_id == Order.id)
        .filter(EndRecord.driver_id == driver_id)
        .filter(Order.trip_status == Trip_status.COMPLETED)
        .filter(EndRecord.created_at >= fy_start, EndRecord.created_at < period_start)
        .all()
    )
    return sum(r[0] or 0 for r in rows)


def generate_monthly_settlement(
    db: Session, *, driver_id: str, year: int, month: int, generated_by_admin_id: Optional[str] = None,
) -> DriverSettlement:
    period_start, period_end = _month_bounds(year, month)
    fy_label = tax_engine.financial_year_label(year, month)
    fy_start_year = year if month >= 4 else year - 1
    fy_start = datetime(fy_start_year, 4, 1, tzinfo=timezone.utc)

    trips = (
        db.query(Order, EndRecord)
        .join(EndRecord, EndRecord.order_id == Order.id)
        .filter(EndRecord.driver_id == driver_id)
        .filter(Order.trip_status == Trip_status.COMPLETED)
        .filter(EndRecord.created_at >= period_start, EndRecord.created_at < period_end)
        .order_by(EndRecord.created_at.asc())
        .all()
    )

    total_fares = 0
    cash_total = 0
    online_total = 0
    commission_total = 0
    tds_total = 0
    breakdown = []
    ytd_before = _driver_ytd_gross_before(db, driver_id, fy_start, period_start)

    for order, end_record in trips:
        driver_profit = order.driver_profit or 0
        vendor_profit = order.vendor_profit or 0
        admin_profit = order.admin_profit or 0
        commission = vendor_profit + admin_profit
        cash = end_record.cash_collection or 0
        online = max(0, driver_profit - cash)  # whatever wasn't collected as cash was settled online/advance

        tds = tax_engine.compute_tds(db, gross_payout_ytd_before_this=ytd_before, this_payout_amount=driver_profit)
        ytd_before += driver_profit

        total_fares += driver_profit
        cash_total += cash
        online_total += online
        commission_total += commission
        tds_total += tds["tds_amount"]

        breakdown.append({
            "order_id": order.id,
            "trip_date": end_record.created_at.isoformat() if end_record.created_at else None,
            "driver_profit": driver_profit,
            "commission": commission,
            "cash_collection": cash,
            "tds_amount": tds["tds_amount"],
        })

    net_payable = total_fares - commission_total - tds_total  # + 0 bonus - 0 waiting_adjustment, see module docstring

    existing = (
        db.query(DriverSettlement)
        .filter(DriverSettlement.driver_id == driver_id, DriverSettlement.period_year == year, DriverSettlement.period_month == month)
        .order_by(DriverSettlement.revision.desc())
        .first()
    )
    revision = 1
    if existing is not None:
        if existing.status == SettlementStatusEnum.FINALIZED:
            revision = existing.revision + 1  # regenerating a finalized period creates a new REVISED row, doesn't overwrite it
        else:
            db.delete(existing)  # DRAFT can just be replaced in place
            db.flush()

    settlement = DriverSettlement(
        driver_id=driver_id,
        period_year=year,
        period_month=month,
        revision=revision,
        trip_count=len(trips),
        total_fares_collected=total_fares,
        cash_collected=cash_total,
        online_collected=online_total,
        company_commission=commission_total,
        tds_amount=tds_total,
        tds_section="194-O" if tds_total > 0 else None,
        bonus_incentives=0,
        waiting_charge_adjustments=0,
        net_payable=net_payable,
        status=SettlementStatusEnum.REVISED if revision > 1 else SettlementStatusEnum.DRAFT,
        trip_breakdown=breakdown,
        generated_by_admin_id=generated_by_admin_id,
    )
    db.add(settlement)
    db.commit()
    db.refresh(settlement)
    return settlement


def finalize_settlement(db: Session, settlement_id: str) -> DriverSettlement:
    settlement = db.query(DriverSettlement).filter(DriverSettlement.id == settlement_id).first()
    if not settlement:
        raise ValueError("Settlement not found")
    settlement.status = SettlementStatusEnum.FINALIZED
    settlement.finalized_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(settlement)
    return settlement


def get_settlement(db: Session, *, driver_id: str, year: int, month: int) -> Optional[DriverSettlement]:
    return (
        db.query(DriverSettlement)
        .filter(DriverSettlement.driver_id == driver_id, DriverSettlement.period_year == year, DriverSettlement.period_month == month)
        .order_by(DriverSettlement.revision.desc())
        .first()
    )
