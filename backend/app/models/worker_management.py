# app/models/worker_management.py
from sqlalchemy import Column, String, Date, Float, Integer, Boolean, TIMESTAMP, func, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database.session import Base


class Worker(Base):
    """Staff and field workers catalog: Operations, Drivers, Telecallers,
    Accounts, Social Media, Own Fleet Managers, Mechanics, Yard Staff.
    Supports multi-role labeling, salary computation rates, and vehicle assignment."""
    __tablename__ = "workers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    name = Column(String, nullable=False, index=True)
    phone = Column(String(15), nullable=False, index=True)
    # List of assigned role slugs:
    # ["operations", "driver", "telecaller", "manager", "accounts_manager",
    #  "feedback_support", "social_media", "own_fleet_manager", "mechanic_yard"]
    roles = Column(JSON, nullable=False, default=list, server_default="[]")
    wage_type = Column(String, nullable=False, default="daily", server_default="daily")  # daily, monthly, hourly, per_trip
    base_wage = Column(Float, nullable=False, default=0.0, server_default="0.0")
    ot_rate_per_hour = Column(Float, nullable=False, default=0.0, server_default="0.0")
    
    # Own Fleet integration
    is_company_driver = Column(Boolean, nullable=False, default=False, server_default="false")
    assigned_vehicle_number = Column(String, nullable=True)  # e.g., "TN 01 AB 1234"
    
    # Optional link to portal Admin login account
    admin_account_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    
    is_active = Column(Boolean, nullable=False, default=True, server_default="true", index=True)
    joined_at = Column(Date, nullable=False, default=func.current_date())
    notes = Column(String, nullable=True)
    
    # Action Attribution
    created_by_admin_username = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class WorkerDailyAttendance(Base):
    """Daily Hajri/Attendance log per worker.
    Status values:
      'P'           : Full Day Present (1.0 day)
      'A'           : Absent (0.0 day)
      'HD'          : Half Day (0.5 day)
      'OT'          : Overtime extra hours
      'P_HALF'      : 1.5 Days shift
      'DOUBLE_DUTY' : 2.0 Days shift
      'PA'          : Paid Leave (1.0 day)
    worker_name is denormalized to avoid expensive JOINs during high-frequency reads (Cloud SQL cost saving).
    """
    __tablename__ = "worker_daily_attendance"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    worker_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    worker_name = Column(String, nullable=False)
    date = Column(Date, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="P")
    ot_minutes = Column(Integer, nullable=False, default=0, server_default="0")
    ot_amount = Column(Float, nullable=False, default=0.0, server_default="0.0")
    remarks = Column(String, nullable=True)
    
    # Audit Attribution: who marked this attendance
    marked_by_admin_id = Column(UUID(as_uuid=True), nullable=True)
    marked_by_admin_username = Column(String, nullable=True)
    
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint('worker_id', 'date', name='uq_worker_attendance_date'),
        Index('idx_worker_attendance_date_status', 'date', 'status'),
    )


class WorkerAdvance(Base):
    """Advance payments, petty loans, and salary disbursements given to workers.
    Tracked per worker with settlement flag for monthly/weekly payroll clearance."""
    __tablename__ = "worker_advances"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    worker_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    worker_name = Column(String, nullable=False)
    date = Column(Date, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    payment_mode = Column(String(20), nullable=False, default="cash")  # cash, upi, bank
    remarks = Column(String, nullable=True)
    
    is_settled = Column(Boolean, nullable=False, default=False, server_default="false", index=True)
    settled_at = Column(TIMESTAMP(timezone=True), nullable=True)
    
    # Audit Attribution: who approved/handed the cash
    approved_by_admin_id = Column(UUID(as_uuid=True), nullable=True)
    approved_by_admin_username = Column(String, nullable=True)
    
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index('idx_worker_advances_worker_settled', 'worker_id', 'is_settled'),
    )


class PettyCashBook(Base):
    """Site & Fleet petty cashbook (Cash In / Cash Out) for tracking daily diesel,
    tolls, refreshments, punctures, and emergency office expenses."""
    __tablename__ = "petty_cash_book"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    date = Column(Date, nullable=False, index=True)
    transaction_type = Column(String(10), nullable=False)  # "IN" or "OUT"
    amount = Column(Float, nullable=False)
    category = Column(String(50), nullable=False, default="other")  # diesel, toll, maintenance, tea_food, advance, office, other
    payment_mode = Column(String(20), nullable=False, default="cash")  # cash, upi, bank
    notes = Column(String, nullable=True)
    
    # Audit Attribution
    logged_by_admin_id = Column(UUID(as_uuid=True), nullable=True)
    logged_by_admin_username = Column(String, nullable=True)
    
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index('idx_petty_cash_date_type', 'date', 'transaction_type'),
    )
