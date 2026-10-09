"""Unaccepted Bookings Desk - one row per posted booking that nobody accepted.

It remembers WHERE that booking is in its rescue: how many alarms rang, when the next one is due (the staff alarm repeats at half of the time that
is left, so it keeps coming without being a nuisance), whether staff snoozed it, and what was finally done - shared to a group, handed to a vendor,
executed on another platform (who / where / driver / cab / commission) or cancelled (with the customer e-mailed)."""
import uuid

from sqlalchemy import Boolean, Column, Integer, JSON, String, Text, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID

from app.database.session import Base


class UnacceptedCase(Base):
    __tablename__ = "unaccepted_cases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    order_id = Column(Integer, nullable=False, unique=True, index=True)
    status = Column(String, nullable=False, server_default="OPEN", index=True)      # OPEN | SHARED | EXECUTED_ELSEWHERE | CANCELLED | RESOLVED

    alarms_fired = Column(Integer, nullable=False, server_default="0")
    last_alarm_at = Column(TIMESTAMP(timezone=True), nullable=True)
    next_alarm_at = Column(TIMESTAMP(timezone=True), nullable=True)
    snoozed_until = Column(TIMESTAMP(timezone=True), nullable=True)
    snooze_count = Column(Integer, nullable=False, server_default="0")
    notified_alarm_no = Column(Integer, nullable=False, server_default="0")        # the alarm number a push notification was already sent for

    shared_count = Column(Integer, nullable=False, server_default="0")
    last_shared_at = Column(TIMESTAMP(timezone=True), nullable=True)
    last_shared_by = Column(String, nullable=True)

    handled_by = Column(String, nullable=True)
    exec_platform = Column(String, nullable=True)           # where it is being executed: another fleet's app, a vendor, another platform ...
    exec_by = Column(String, nullable=True)                 # who put it there (name of the fleet / vendor / platform contact)
    exec_driver_name = Column(String, nullable=True)
    exec_driver_phone = Column(String, nullable=True)
    exec_vehicle_number = Column(String, nullable=True)
    exec_note = Column(Text, nullable=True)
    commission_due = Column(Integer, nullable=True)         # collected by hand for these hand-offs
    commission_received = Column(Boolean, nullable=False, server_default="false")
    follow_up_at = Column(TIMESTAMP(timezone=True), nullable=True)    # trip end + 2 hrs: someone must report how it went
    follow_up_done = Column(Boolean, nullable=False, server_default="false")

    cancel_reason = Column(String, nullable=True)
    customer_emailed = Column(Boolean, nullable=False, server_default="false")
    customer_email_to = Column(String, nullable=True)
    history = Column(JSON, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
