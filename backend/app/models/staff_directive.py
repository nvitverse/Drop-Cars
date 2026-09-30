# models/staff_directive.py
from sqlalchemy import Column, String, TIMESTAMP, Integer, func, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database.session import Base


class StaffDailyTarget(Base):
    """Per-staff standing numeric targets, set by the Owner. One row per
    staff admin (not date-partitioned) - the target stays in effect until
    the Owner changes it, same "standing value until changed" model as the
    existing platform-wide STAFF_DAILY_TARGET_SETTING_KEY setting, just
    broken out per-person and per-category instead of one shared number.
    "Achieved" counts are computed at read time from whatever real signals
    actually exist (see get_staff_today_target in api/routes/admin.py) -
    this table only stores the goal, never a fabricated progress number."""
    __tablename__ = "staff_daily_target"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id = Column(UUID(as_uuid=True), ForeignKey("admin.id"), nullable=False, unique=True)
    calls_target = Column(Integer, nullable=False, default=0, server_default="0")
    approvals_target = Column(Integer, nullable=False, default=0, server_default="0")
    checkins_target = Column(Integer, nullable=False, default=0, server_default="0")
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    updated_by = Column(String, nullable=True)  # Owner's username, for the audit trail


class StaffDirective(Base):
    """An Owner-published instruction for staff - text and/or a recorded
    voice note (GCS URL, uploaded via the same upload_image_to_gcs helper
    the notification-sound upload already uses). target_admin_ids is a
    JSON array of admin.id strings; null/empty means broadcast to every
    Staff account. No read-receipt tracking in this first version - the
    feed just shows the most recent N directives targeted at whoever is
    looking."""
    __tablename__ = "staff_directive"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message = Column(Text, nullable=True)
    voice_note_url = Column(String, nullable=True)
    target_admin_ids = Column(JSON, nullable=True)  # null/[] = all staff
    created_by_admin_id = Column(UUID(as_uuid=True), nullable=True)
    created_by_username = Column(String, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
