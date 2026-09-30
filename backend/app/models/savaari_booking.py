# app/models/savaari_booking.py
"""
Tracks every Savaari vendor-panel booking the background monitor has seen.
New rows are inserted when the monitor detects a booking_id not yet in this
table.  is_notified flags which ones already triggered a push so we never
double-alert on the same booking.
"""
from sqlalchemy import Column, String, Float, Boolean, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database.session import Base


class SavaariBooking(Base):
    __tablename__ = "savaari_bookings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    # Savaari own booking reference ID (unique - deduplication key)
    booking_id = Column(String, nullable=False, unique=True, index=True)
    pickup_city = Column(String, nullable=True)
    drop_city = Column(String, nullable=True)
    # Car type string as returned by Savaari, e.g. "Etios", "Innova Crysta"
    car_type = Column(String, nullable=True)
    # Trip type: "Oneway", "Roundtrip", "Airport"
    trip_type = Column(String, nullable=True)
    # Total booking price in INR
    price = Column(Float, nullable=True)
    # Pickup date/time as a string (Savaari returns various formats)
    pickup_time_str = Column(String, nullable=True)
    # Direct deep-link URL to the booking in Savaari vendor panel
    savaari_url = Column(String, nullable=True)
    # Whether an admin push has already been fired for this booking
    is_notified = Column(Boolean, nullable=False, default=False)
    # Admin can mark a booking as accepted or missed
    acceptance_status = Column(String, nullable=True)  # "ACCEPTED", "MISSED", or NULL
    # Full raw payload from Savaari (stored for debugging)
    raw_data = Column(JSON, nullable=True)
    detected_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False, index=True)
