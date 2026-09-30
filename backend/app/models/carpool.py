from sqlalchemy import Column, String, Boolean, TIMESTAMP, Integer, Float, JSON, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class CarPoolJourneyModel(Base):
    """
    Model for Car-Pool / Drop Connect Shared Trip Listings
    """
    __tablename__ = "carpool_journeys"

    id = Column(String, primary_key=True, default=lambda: f"cpool_{uuid.uuid4().hex[:12]}", nullable=False)
    host_name = Column(String, nullable=False)
    host_phone = Column(String, nullable=False)
    host_rating = Column(Float, default=5.0)

    pickup_city = Column(String, nullable=False, index=True)
    drop_city = Column(String, nullable=False, index=True)
    # Optional via-cities on the route, e.g. ["Villupuram", "Trichy"] -
    # display-only (doesn't affect fare/seat calc), shown to passengers
    # deciding whether the route passes near them.
    intermediate_stops = Column(JSON, nullable=True)
    start_date = Column(String, nullable=False)
    start_time = Column(String, nullable=False)

    car_name = Column(String, nullable=False)
    car_category = Column(String, nullable=False)
    driver_name = Column(String, nullable=False)
    driver_rating = Column(Float, default=5.0)

    total_seats = Column(Integer, nullable=False, default=4)
    available_seats = Column(Integer, nullable=False, default=3)
    seat_fare = Column(Integer, nullable=False, default=350)
    private_fare_equivalent = Column(Integer, nullable=False, default=1400)
    # When true, a seat-join request is approved immediately (see
    # request_seat_join) instead of waiting for the host to review it.
    is_auto_accept = Column(Boolean, nullable=False, default=False)

    # Status: "ACTIVE", "FULL", "COMPLETED", "CANCELLED"
    status = Column(String, nullable=False, default="ACTIVE", index=True)
    source_booking_id = Column(String, nullable=True)
    is_customer_hosted = Column(Boolean, default=True)
    # Set when a real logged-in driver (Drop Connect) published this - null
    # for the (not yet built) customer-hosted flow, which has no CarDriver
    # session to attach. Ownership checks (approve/decline/my-journeys) key
    # off this, not off the self-reported host_name/host_phone above.
    driver_id = Column(UUID(as_uuid=True), ForeignKey("car_driver.id"), nullable=True, index=True)
    vehicle_owner_id = Column(UUID(as_uuid=True), ForeignKey("vehicle_owner.id"), nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class CarPoolRequestModel(Base):
    """
    Model for Car-Pool / Drop Connect Seat Join Requests
    """
    __tablename__ = "carpool_requests"

    id = Column(String, primary_key=True, default=lambda: f"req_{uuid.uuid4().hex[:12]}", nullable=False)
    journey_id = Column(String, ForeignKey("carpool_journeys.id"), nullable=False, index=True)

    passenger_id = Column(String, nullable=False)
    passenger_name = Column(String, nullable=False)
    passenger_phone = Column(String, nullable=False)
    seats_requested = Column(Integer, nullable=False, default=1)

    # Status: "PENDING", "APPROVED", "DECLINED"
    status = Column(String, nullable=False, default="PENDING", index=True)
    requested_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
