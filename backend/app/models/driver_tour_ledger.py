# app/models/driver_tour_ledger.py
"""
Driver Tour Ledger & Expense Models for Outstation Fleet Operations.
Supports extended multi-day and 1-month tours without locking driver booking assignments.
Tracks real-time running cash collection, live diesel bills with odometer photos,
automated mileage computation (km/L), and role-based settlement.
"""
from sqlalchemy import Column, String, Date, Float, Integer, Boolean, TIMESTAMP, func, Index, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database.session import Base


class DriverTour(Base):
    """Tracks an ongoing or completed multi-day / 1-month continuous road tour
    for company drivers. Maintains the live virtual cash bag."""
    __tablename__ = "driver_tours"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    tour_code = Column(String(50), nullable=False, unique=True, index=True)
    driver_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    driver_name = Column(String, nullable=False)
    driver_phone = Column(String(15), nullable=False, index=True)
    vehicle_number = Column(String(20), nullable=False, index=True)

    start_date = Column(Date, nullable=False, default=func.current_date(), index=True)
    end_date = Column(Date, nullable=True)

    start_odometer = Column(Integer, nullable=False, default=0)
    current_odometer = Column(Integer, nullable=False, default=0)
    closing_odometer = Column(Integer, nullable=True)

    # Status: 'ACTIVE' (on tour, receiving bookings), 'COMPLETED' (returned to HQ), 'SETTLED' (cash verified & closed)
    status = Column(String(20), nullable=False, default="ACTIVE", server_default="ACTIVE", index=True)

    # Running Financial Aggregates
    total_trips_completed = Column(Integer, nullable=False, default=0, server_default="0")
    total_customer_cash_collected = Column(Float, nullable=False, default=0.0, server_default="0.0")
    total_diesel_spent = Column(Float, nullable=False, default=0.0, server_default="0.0")
    total_toll_spent = Column(Float, nullable=False, default=0.0, server_default="0.0")
    total_other_expenses = Column(Float, nullable=False, default=0.0, server_default="0.0")
    total_driver_bata = Column(Float, nullable=False, default=0.0, server_default="0.0")
    total_bank_deposits = Column(Float, nullable=False, default=0.0, server_default="0.0")

    # Net Cash in Driver's Virtual Hand = (Cash Collected - Fuel - Toll - Other - Bata - Bank Deposits)
    net_cash_in_hand = Column(Float, nullable=False, default=0.0, server_default="0.0")

    # Settlement details
    settled_at = Column(TIMESTAMP(timezone=True), nullable=True)
    settled_by_admin_id = Column(UUID(as_uuid=True), nullable=True)
    settled_by_admin_username = Column(String, nullable=True)
    settlement_notes = Column(Text, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index('idx_driver_tour_status_driver', 'driver_id', 'status'),
        Index('idx_driver_tour_status_vehicle', 'vehicle_number', 'status'),
    )


class DriverTourExpense(Base):
    """Detailed log of road expenses incurred by the driver during the tour.
    Specifically captures diesel bill live photo + odometer live photo,
    with automated mileage (km/L) verification and anti-theft alerting."""
    __tablename__ = "driver_tour_expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    tour_id = Column(UUID(as_uuid=True), ForeignKey("driver_tours.id"), nullable=False, index=True)
    driver_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    driver_name = Column(String, nullable=False)
    vehicle_number = Column(String(20), nullable=False, index=True)

    # Optional link to specific trip / booking if filled during an active booking
    order_id = Column(Integer, nullable=True, index=True)

    # Expense Category: 'DIESEL', 'TOLL', 'FASTAG', 'REPAIR', 'DRIVER_BATA', 'BANK_DEPOSIT', 'OTHER'
    expense_type = Column(String(30), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    payment_mode = Column(String(20), nullable=False, default="cash")  # 'cash', 'fastag', 'upi', 'company_card'

    # Diesel specific tracking
    litres = Column(Float, nullable=True)
    odometer_reading = Column(Integer, nullable=True)
    odometer_photo_url = Column(String, nullable=True)
    bill_photo_url = Column(String, nullable=True)
    bunk_name_location = Column(String, nullable=True)

    # Automated Anti-Theft & Mileage calculation
    calculated_mileage = Column(Float, nullable=True)  # km/L
    mileage_flagged = Column(Boolean, nullable=False, default=False, server_default="false")
    mileage_flag_reason = Column(String, nullable=True)

    # Verification status: 'SUBMITTED', 'APPROVED', 'REJECTED'
    status = Column(String(20), nullable=False, default="SUBMITTED", server_default="SUBMITTED", index=True)
    approved_by_admin_id = Column(UUID(as_uuid=True), nullable=True)
    approved_by_admin_username = Column(String, nullable=True)
    verified_at = Column(TIMESTAMP(timezone=True), nullable=True)

    notes = Column(Text, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index('idx_tour_expense_tour_type', 'tour_id', 'expense_type'),
        Index('idx_tour_expense_status', 'status'),
    )
