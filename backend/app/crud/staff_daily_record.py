# app/crud/staff_daily_record.py
from datetime import date
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.staff_daily_record import StaffDailyRecord


def upsert_staff_daily_record(db: Session, *, admin_id, admin_username: str, record_date: date, note: str) -> StaffDailyRecord:
    row = db.query(StaffDailyRecord).filter(
        StaffDailyRecord.admin_id == admin_id,
        StaffDailyRecord.record_date == record_date,
    ).first()
    if row:
        row.note = note
    else:
        row = StaffDailyRecord(admin_id=admin_id, admin_username=admin_username, record_date=record_date, note=note)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_own_daily_record(db: Session, admin_id, record_date: date) -> Optional[StaffDailyRecord]:
    return db.query(StaffDailyRecord).filter(
        StaffDailyRecord.admin_id == admin_id,
        StaffDailyRecord.record_date == record_date,
    ).first()


def list_daily_records(db: Session, record_date: date, skip: int = 0, limit: int = 50) -> Tuple[List[StaffDailyRecord], int]:
    query = db.query(StaffDailyRecord).filter(StaffDailyRecord.record_date == record_date)
    total = query.count()
    rows = query.order_by(StaffDailyRecord.updated_at.desc()).offset(skip).limit(limit).all()
    return rows, total
