# models/driver_settlement.py
"""
One row per driver per calendar month - the monthly balance-sheet summary
requested for driver earnings statements (loan/tax-filing use) and the
TDS ledger. Generated on demand (or by a monthly sweep) from the real
per-trip data already in EndRecord/Order (see app/crud/end_records.py) -
this table is a cached rollup, not a new source of truth, so it can always
be regenerated if the underlying trip data changes before period close.
"""
from sqlalchemy import Column, String, Integer, TIMESTAMP, ForeignKey, UniqueConstraint, func, Enum as SqlEnum
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
import enum
from app.database.session import Base


class SettlementStatusEnum(str, enum.Enum):
    DRAFT = "DRAFT"          # generated, not yet finalized/locked
    FINALIZED = "FINALIZED"  # locked for the period, statement can be issued
    REVISED = "REVISED"      # regenerated after a correction to underlying trips


class DriverSettlement(Base):
    __tablename__ = "driver_settlements"
    __table_args__ = (
        UniqueConstraint("driver_id", "period_year", "period_month", "revision", name="uq_driver_settlement_period_revision"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("car_driver.id"), nullable=False, index=True)

    period_year = Column(Integer, nullable=False, index=True)
    period_month = Column(Integer, nullable=False, index=True)  # 1-12
    revision = Column(Integer, nullable=False, server_default='1')  # bumped on REVISED

    trip_count = Column(Integer, nullable=False, server_default='0')

    # Balance-sheet formula (see app/crud/driver_settlements.py):
    # net_payable = total_fares_collected - company_commission - tds_amount
    #               + bonus_incentives - waiting_charge_adjustments
    total_fares_collected = Column(Integer, nullable=False, server_default='0')
    cash_collected = Column(Integer, nullable=False, server_default='0')
    online_collected = Column(Integer, nullable=False, server_default='0')
    company_commission = Column(Integer, nullable=False, server_default='0')
    tds_amount = Column(Integer, nullable=False, server_default='0')
    tds_section = Column(String, nullable=True)  # "194-O" or "194C" - see tax_engine.compute_tds
    bonus_incentives = Column(Integer, nullable=False, server_default='0')
    waiting_charge_adjustments = Column(Integer, nullable=False, server_default='0')
    net_payable = Column(Integer, nullable=False, server_default='0')

    status = Column(SqlEnum(SettlementStatusEnum, name="settlement_status_enum"), nullable=False, server_default='DRAFT')

    # Per-trip breakdown snapshot (order_id, fare, commission, tds per row) -
    # kept so the downloadable statement doesn't need to re-join EndRecord/
    # Order at PDF-render time and so a FINALIZED period's statement never
    # silently changes if trip data is edited later.
    trip_breakdown = Column(JSON, nullable=True)

    pdf_url = Column(String, nullable=True)

    generated_by_admin_id = Column(UUID(as_uuid=True), nullable=True)
    generated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    finalized_at = Column(TIMESTAMP(timezone=True), nullable=True)
