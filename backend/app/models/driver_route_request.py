from sqlalchemy import Column, String, Boolean, TIMESTAMP, Integer, func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class DriverRouteRequest(Base):
    """
    Model for Driver / Fleet Owner Requested Routes:
    Drivers register up to 3 preferred routes with an available time window limit.
    If a customer booking matches an active requested route within the driver's time window,
    the system auto-assigns the booking, triggers push + email intimation, and starts an acceptance countdown.
    Without an explicit route request, no auto-assignment occurs.
    """
    __tablename__ = "driver_route_request"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    driver_id = Column(String, nullable=False, index=True)
    driver_name = Column(String, nullable=False)
    driver_phone = Column(String, nullable=True)
    driver_email = Column(String, nullable=True)
    
    car_id = Column(String, nullable=True)
    car_number = Column(String, nullable=True)
    car_type = Column(String, nullable=True) # e.g. "Hatchback", "Sedan", "SUV"

    origin_city = Column(String, nullable=False, index=True)
    destination_city = Column(String, nullable=False, index=True)

    available_from = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    available_until = Column(TIMESTAMP(timezone=True), nullable=False, index=True)

    # Status: "ACTIVE", "FULFILLED", "EXPIRED", "CANCELLED"
    status = Column(String, nullable=False, default="ACTIVE", index=True)
    is_active = Column(Boolean, nullable=False, default=True)

    assigned_order_id = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
