from sqlalchemy import Column, String, TIMESTAMP, Integer, func, JSON, Enum as SqlEnum, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
import enum
from app.database.session import Base
from app.models.new_orders import OrderTypeEnum, CarTypeEnum


class HourlyRental(Base):
    __tablename__ = "hourly_rental"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendor.id"), nullable=True)
    trip_type = Column(
        SqlEnum(OrderTypeEnum, name="ORDER_TYPE_ENUM"),
        nullable=False,
        default=OrderTypeEnum.HOURLY_RENTAL,
    )
    car_type = Column(
        SqlEnum(CarTypeEnum, name="CAR_TYPE_ENUM"),
        nullable=False,
    )
    pickup_drop_location = Column(JSON, nullable=False)
    start_date_time = Column(TIMESTAMP(timezone=True), nullable=False)
    customer_name = Column(String, nullable=False)
    customer_number = Column(String, nullable=False)

    # package_hours now stores structured data like {"hours": 5, "km_range": 50}
    package_hours = Column(JSON, nullable=False)
    # pricing fields updated to hour-based and addon-km-based pricing
    cost_per_hour = Column(Integer, nullable=False)
    extra_cost_per_hour = Column(Integer, nullable=False)
    cost_for_addon_km = Column(Integer, nullable=False)
    extra_cost_for_addon_km = Column(Integer, nullable=False)

    pickup_notes = Column(String, nullable=True)
    # Pickup within the next hour - same "urgent" flag NewOrder already
    # has for Round Trip/Multi City/One Way (see is_urgent_pickup() in
    # crud/new_orders.py). Hourly Rental never got this column, so its
    # bookings could never be flagged urgent regardless of pickup time.
    is_urgent = Column(Boolean, nullable=False, default=False, server_default='false')
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


