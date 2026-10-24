"""Trip-close wallet audit: did the driver get back more (or less) than the trip should have returned?

At close the driver's wallet moves by   (driver_net - cash collected) + the hold taken at accept     (crud/end_records._settle_trip)
so the Rs 500 hold on a commission-free booking comes back as Rs 500 (less the Rs 30 convenience fee) ONLY when the cash the driver
collected equals the bill less the advance. Anything else changes the credit rupee for rupee:
  - cash entered LOWER than (bill - advance)  -> the driver is credited the difference (the office "owes" him that cash)
  - an ADVANCE sits with the platform / poster -> the driver is credited it too, because he never held that money.
This read-only audit lists every closed booking whose credit is bigger than the hold plus the fees, and says which of the two it is.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.end_records import EndRecord
from app.models.order_assignments import OrderAssignment
from app.models.orders import Order
from app.models.wallet_ledger import WalletEntryTypeEnum, WalletLedger

TOLERANCE = 50          # rupees of rounding / convenience fee we do not report


def classify(*, customer_total: int, driver_net: int, advance: int, cash: Optional[int], hold: int, completion_net: int,
             manual: bool) -> Optional[dict]:
    """Pure maths for one closed booking. completion_net is the signed TRIP_COMPLETION ledger sum (credit +, debit -).
    Returns None when the driver got back only his hold (less what the bill carries for the platform), else the breakdown."""
    customer_total, driver_net, advance, hold = int(customer_total or 0), int(driver_net or 0), int(advance or 0), int(hold or 0)
    expected_cash = max(0, customer_total - advance)
    used_cash = expected_cash if cash is None else int(cash)
    # the driver collected the WHOLE bill himself: the wallet only gets the hold back, less the platform's part of the bill
    baseline = (driver_net - customer_total) + hold
    extra = int(completion_net) - baseline
    if abs(extra) <= TOLERANCE:
        return None
    shortfall = max(0, expected_cash - used_cash)       # cash the office said the driver did NOT collect
    over = max(0, used_cash - expected_cash)
    if shortfall > TOLERANCE and advance > TOLERANCE:
        reason = "ADVANCE_AND_LOW_CASH"
    elif shortfall > TOLERANCE:
        reason = "CASH_ENTERED_LOWER_THAN_BILL"
    elif over > TOLERANCE:
        reason = "CASH_ENTERED_HIGHER_THAN_BILL_MINUS_ADVANCE"
    elif advance > TOLERANCE:
        reason = "ADVANCE_PAID_OUT_TO_DRIVER"
    else:
        reason = "OTHER"
    return {
        "reason": reason, "manual_close": manual, "bill": customer_total, "advance": advance, "expected_cash": expected_cash,
        "cash_used": used_cash, "hold": hold, "driver_net": driver_net, "hold_only_credit": baseline,
        "actual_credit": int(completion_net), "extra_credited": extra,
    }


def audit(db: Session, days: int = 60, only_manual: bool = False, limit: int = 300) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (db.query(EndRecord, Order)
            .join(Order, Order.id == EndRecord.order_id)
            .filter(EndRecord.end_km > 0, Order.trip_status == "COMPLETED", EndRecord.updated_at >= since)
            .order_by(EndRecord.updated_at.desc()).limit(2000).all())
    from app.models.admin_activity_log import AdminActivityLog
    manual_ids = {str(t) for (t,) in db.query(AdminActivityLog.target_id).filter(AdminActivityLog.action == "TRIP_MANUAL_CLOSE").all()}
    flagged: List[dict] = []
    checked = 0
    for record, order in rows:
        manual = str(order.id) in manual_ids
        if only_manual and not manual:
            continue
        assignment = (db.query(OrderAssignment)
                      .filter(OrderAssignment.order_id == order.id, OrderAssignment.driver_id == record.driver_id).first())
        if not assignment or not assignment.vehicle_owner_id:
            continue
        ledger = (db.query(WalletLedger)
                  .filter(WalletLedger.vehicle_owner_id == assignment.vehicle_owner_id, WalletLedger.reference_id == str(order.id)).all())
        hold = sum(int(r.amount or 0) for r in ledger if r.reference_type in ("TRIP_HOLD", "TRIP_HOLD_MANUAL_CREDIT"))
        if any(r.reference_type == "TRIP_HOLD_REFUND" for r in ledger):
            hold = 0
        net = 0
        found = False
        for r in ledger:
            if r.reference_type == "TRIP_COMPLETION":
                found = True
                net += int(r.amount or 0) if r.entry_type == WalletEntryTypeEnum.CREDIT else -int(r.amount or 0)
        if not found:
            continue
        checked += 1
        res = classify(customer_total=order.closed_vendor_price, driver_net=order.driver_profit, advance=order.advance_received,
                       cash=record.cash_collection, hold=hold, completion_net=net, manual=manual)
        if res is None:
            continue
        res.update({
            "order_id": order.id, "vehicle_owner_id": str(assignment.vehicle_owner_id), "driver_id": str(record.driver_id),
            "trip_type": getattr(order.trip_type, "value", order.trip_type), "commission_waived": bool(getattr(order, "commission_waived", False)),
            "closed_at": record.updated_at, "cash_entered": record.cash_collection, "customer_total": order.closed_vendor_price,
        })
        flagged.append(res)
        if len(flagged) >= limit:
            break
    flagged.sort(key=lambda x: abs(x["extra_credited"]), reverse=True)
    return {"days": days, "checked": checked, "flagged": len(flagged), "items": flagged}
