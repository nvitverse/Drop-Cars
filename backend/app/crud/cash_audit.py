# crud/cash_audit.py
"""
Cash-collection self-report audit: a driver's reported cash_collection is
trusted for the wallet settlement math (crud/end_records.py), but a large
gap from driver_profit is flagged here for admin review as a safety net -
settlement itself is never blocked or delayed by this.
"""
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting
from app.models.end_records import EndRecord
from app.models.orders import Order

THRESHOLD_SETTING_KEY = "cash_mismatch_threshold"
THRESHOLD_DEFAULT = 500


def get_cash_mismatch_threshold(db: Session) -> int:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == THRESHOLD_SETTING_KEY).first()
    return int(row.value) if row and row.value else THRESHOLD_DEFAULT


def set_cash_mismatch_threshold(db: Session, amount: int) -> int:
    if amount < 0:
        raise HTTPException(status_code=400, detail="Threshold cannot be negative")
    row = db.query(PlatformSetting).filter(PlatformSetting.key == THRESHOLD_SETTING_KEY).first()
    if row:
        row.value = str(int(amount))
    else:
        row = PlatformSetting(key=THRESHOLD_SETTING_KEY, value=str(int(amount)))
    db.add(row)
    db.commit()
    return int(amount)


def flag_if_mismatch(db: Session, trip_record: EndRecord, driver_profit: int, cash_collection: int) -> None:
    threshold = get_cash_mismatch_threshold(db)
    mismatch = abs(int(driver_profit or 0) - int(cash_collection or 0))
    if mismatch > threshold:
        trip_record.cash_mismatch_flagged = True
        trip_record.cash_mismatch_amount = mismatch
        db.add(trip_record)
        db.commit()


def get_flagged_trips(db: Session, include_cleared: bool = False) -> List[dict]:
    query = db.query(EndRecord, Order).join(Order, Order.id == EndRecord.order_id).filter(
        EndRecord.cash_mismatch_flagged.is_(True)
    )
    if not include_cleared:
        query = query.filter(EndRecord.cash_mismatch_cleared.is_(False))
    rows = query.order_by(EndRecord.updated_at.desc()).all()
    result = []
    for record, order in rows:
        result.append({
            "end_record_id": record.id,
            "order_id": order.id,
            "driver_id": str(record.driver_id),
            "cash_collection": record.cash_collection,
            "driver_profit": order.driver_profit,
            "mismatch_amount": record.cash_mismatch_amount,
            "cleared": record.cash_mismatch_cleared,
            "updated_at": record.updated_at,
        })
    return result


def clear_flag(db: Session, end_record_id: int) -> EndRecord:
    record = db.query(EndRecord).filter(EndRecord.id == end_record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Trip record not found")
    record.cash_mismatch_cleared = True
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
