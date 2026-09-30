# models/own_fleet.py
"""Drop Cars' own company fleet - cars the company owns and the drivers it
employs on salary. Deliberately separate from the partner-side
VehicleOwner/CarDetails/CarDriver tables: those are independent fleet
drivers paid per trip through the wallet, these are employees paid a monthly
salary with attendance, advances and payroll.

Replaces a screen that was 100% hardcoded demo data (found 2026-09-30:
(tabs)/our-fleet.tsx seeded fake cars/drivers into local state and saved
nothing anywhere)."""
from sqlalchemy import Column, String, TIMESTAMP, Integer, Date, Boolean, func, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class OwnFleetCar(Base):
    __tablename__ = "own_fleet_car"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)            # e.g. "Innova Crysta"
    car_number = Column(String, nullable=False, unique=True)
    car_type = Column(String, nullable=False)        # CarTypeEnum value, e.g. SEDAN_4_PLUS_1
    # AVAILABLE | ON_TRIP | MAINTENANCE
    status = Column(String, nullable=False, default="AVAILABLE", server_default="AVAILABLE")
    insurance_expiry = Column(Date, nullable=True)
    fc_expiry = Column(Date, nullable=True)
    permit_expiry = Column(Date, nullable=True)
    odometer_km = Column(Integer, nullable=True)
    next_service_km = Column(Integer, nullable=True)
    notes = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class OwnFleetDriver(Base):
    __tablename__ = "own_fleet_driver"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False, unique=True)
    # MONTHLY: base_salary prorated by paid days. DAILY: daily_wage x paid days.
    salary_type = Column(String, nullable=False, default="MONTHLY", server_default="MONTHLY")
    base_salary = Column(Integer, nullable=False, default=0, server_default="0")
    daily_wage = Column(Integer, nullable=False, default=0, server_default="0")
    per_trip_bata = Column(Integer, nullable=False, default=0, server_default="0")
    ot_rate_per_hour = Column(Integer, nullable=False, default=0, server_default="0")
    assigned_car_id = Column(UUID(as_uuid=True), ForeignKey("own_fleet_car.id"), nullable=True)
    licence_number = Column(String, nullable=True)
    licence_expiry = Column(Date, nullable=True)
    joined_on = Column(Date, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class OwnFleetAttendance(Base):
    """One row per driver per day. status: P (present), A (absent),
    HD (half day), L (paid leave), OT (present + overtime)."""
    __tablename__ = "own_fleet_attendance"
    __table_args__ = (UniqueConstraint("driver_id", "date", name="uq_own_fleet_attendance_driver_date"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("own_fleet_driver.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    status = Column(String, nullable=False)
    trips_count = Column(Integer, nullable=False, default=0, server_default="0")
    ot_hours = Column(Integer, nullable=False, default=0, server_default="0")
    notes = Column(String, nullable=True)
    marked_by = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class OwnFleetAdvance(Base):
    """Salary advance paid out to a driver. Deducted from that month's
    payroll when the payroll is marked paid (recovered_in_month set then)."""
    __tablename__ = "own_fleet_advance"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("own_fleet_driver.id"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)
    date = Column(Date, nullable=False)
    note = Column(String, nullable=True)
    recovered_in_month = Column(String, nullable=True)  # "YYYY-MM" once deducted
    recorded_by = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class OwnFleetExpense(Base):
    """Running cost of the company fleet - fuel, service, tolls, repairs."""
    __tablename__ = "own_fleet_expense"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    car_id = Column(UUID(as_uuid=True), ForeignKey("own_fleet_car.id"), nullable=True, index=True)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("own_fleet_driver.id"), nullable=True)
    category = Column(String, nullable=False)  # FUEL | SERVICE | REPAIR | TOLL | PARKING | INSURANCE | OTHER
    amount = Column(Integer, nullable=False)
    date = Column(Date, nullable=False, index=True)
    note = Column(String, nullable=True)
    recorded_by = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class OwnFleetPayroll(Base):
    """A month's salary, frozen at the moment it's marked paid - later
    attendance edits for a paid month don't silently change what was paid."""
    __tablename__ = "own_fleet_payroll"
    __table_args__ = (UniqueConstraint("driver_id", "month", name="uq_own_fleet_payroll_driver_month"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("own_fleet_driver.id"), nullable=False, index=True)
    month = Column(String, nullable=False)  # "YYYY-MM"
    paid_days = Column(String, nullable=False)  # decimal as string, e.g. "24.5"
    salary_amount = Column(Integer, nullable=False)
    bata_amount = Column(Integer, nullable=False)
    ot_amount = Column(Integer, nullable=False, default=0, server_default="0")
    advances_deducted = Column(Integer, nullable=False)
    net_paid = Column(Integer, nullable=False)
    paid_via = Column(String, nullable=True)  # CASH | UPI | BANK
    paid_by = Column(String, nullable=True)
    paid_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
