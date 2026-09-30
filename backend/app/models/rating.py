# models/rating.py
"""
Customer-submitted trip ratings. Scoped ONLY to trips a customer booked
themselves through the Customer App's self-service flow (i.e. the order
came from an approved CustomerBookingRequest, so we know for certain who
the passenger was via customer_id). Vendor-created orders have no real
customer account attached and are not rateable through this table.

One rating per order (order_id is unique) - driver_rating/car_rating/
service_rating are each 1-5. Submitting a rating recomputes the running
rating_avg/rating_count on car_driver and car_details (see
crud/ratings.py) rather than averaging on every read.
"""
from sqlalchemy import Column, String, TIMESTAMP, Integer, Text, func, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class Rating(Base):
    __tablename__ = "ratings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, unique=True, index=True)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customer.id"), nullable=False, index=True)
    driver_id = Column(UUID(as_uuid=True), ForeignKey("car_driver.id"), nullable=True, index=True)
    car_id = Column(UUID(as_uuid=True), ForeignKey("car_details.id"), nullable=True, index=True)

    driver_rating = Column(Integer, nullable=False)
    car_rating = Column(Integer, nullable=False)
    service_rating = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("driver_rating BETWEEN 1 AND 5", name="ck_ratings_driver_rating_range"),
        CheckConstraint("car_rating BETWEEN 1 AND 5", name="ck_ratings_car_rating_range"),
        CheckConstraint("service_rating BETWEEN 1 AND 5", name="ck_ratings_service_rating_range"),
    )
