from sqlalchemy import Column, String, TIMESTAMP, Integer, Boolean, JSON, func, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database.session import Base


class EndRecord(Base):
    __tablename__ = "end_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("car_driver.id"), nullable=False)

    start_km = Column(Integer, nullable=False)
    end_km = Column(Integer, nullable=False)
    contact_number = Column(String, nullable=False)
    img_url = Column(String, nullable=False)
    close_speedometer_image = Column(String, nullable=True)
    # Cash settlement: what the driver actually collected from the customer
    # in cash at trip end (self-reported, entered alongside the odometer
    # photo). Compared against the order's driver_profit to compute the
    # wallet credit/debit - see crud/end_records.py.
    cash_collection = Column(Integer, nullable=True)
    # Audit flag: set when |driver_profit - cash_collection| exceeds the
    # admin-configurable threshold (platform_settings) - see
    # crud/referrals.py-sibling crud/cash_audit.py. Cleared by an admin after review.
    cash_mismatch_flagged = Column(Boolean, nullable=False, default=False)
    cash_mismatch_amount = Column(Integer, nullable=True)
    cash_mismatch_cleared = Column(Boolean, nullable=False, default=False)

    # Non-bundled charge_items (order.charge_items entries with included =
    # false, e.g. State Tax) are NOT part of the vendor/admin/driver profit
    # split - same treatment as toll - the driver collects them separately
    # from the customer and keeps them. This is just the audit record of
    # what was actually collected per item, entered at trip end, e.g.
    # [{"label": "State Tax", "amount": 150}]. Never netted against
    # cash_collection/driver_profit above.
    extra_charges_collected = Column(JSON, nullable=True)

    # Distance check at trip close: the driven km was outside +/-20% of the real road distance. Not blocked - the
    # driver gives a reason, it is stored here and vendor + admin are told.
    distance_flagged = Column(Boolean, nullable=False, default=False, server_default="false")
    distance_reason = Column(Text, nullable=True)

    # Completion page (after the trip report): what the driver rated the customer and what actually changed hands.
    customer_rating = Column(Integer, nullable=True)
    customer_feedback = Column(Text, nullable=True)
    amount_paid_total = Column(Integer, nullable=True)       # total the customer paid (cash + extras) as reported by the driver
    other_extras_collected = Column(Integer, nullable=True)  # anything else collected outside the bill
    completion_at = Column(TIMESTAMP(timezone=True), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


