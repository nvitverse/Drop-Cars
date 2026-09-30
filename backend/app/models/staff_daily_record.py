# app/models/staff_daily_record.py
from sqlalchemy import Column, String, Date, TIMESTAMP, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class StaffDailyRecord(Base):
    """One end-of-day note per staff member per calendar day (IST) - the
    "Records Submit" half of the Staff dashboard (Today's Target /
    Achievements / Records Submit), replacing profit visibility for
    non-Owner admins. A staff member can only ever have one row per day -
    resubmitting the same day updates it in place rather than stacking
    duplicates."""
    __tablename__ = "staff_daily_records"
    __table_args__ = (UniqueConstraint("admin_id", "record_date", name="uq_staff_daily_record_admin_date"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    admin_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    admin_username = Column(String, nullable=False)
    record_date = Column(Date, nullable=False, index=True)
    note = Column(String, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
