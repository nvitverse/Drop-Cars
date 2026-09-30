from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.database.session import Base


class TripReview(Base):
    """A customer's star rating + feedback for the driver of a completed trip. Reached by scanning the QR shown in the
    Driver App after the trip (the website review page calls /api/trip-review/{token}). One review per trip."""
    __tablename__ = "trip_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, unique=True, index=True)
    driver_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    vehicle_owner_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    rating = Column(Integer, nullable=False)           # 1..5
    feedback = Column(Text, nullable=True)
    reviewer_name = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
