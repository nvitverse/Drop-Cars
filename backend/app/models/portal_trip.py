"""Web execution portal - one row per booking handed to someone outside the apps (a driver in a group, another fleet, a vendor).

They open one link in a mobile browser: see the booking and tariff > give driver + cab details > pay the commission (UPI) > the customer's number opens by
the same rule as in the Driver App > start with the customer's OTP, send location, end with the customer's OTP > the customer scans a QR to rate the trip."""
import uuid

from sqlalchemy import Column, Float, Integer, JSON, String, Text, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID

from app.database.session import Base


class PortalTrip(Base):
    __tablename__ = "portal_trips"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    order_id = Column(Integer, nullable=False, index=True)
    token = Column(String, nullable=False, unique=True, index=True)
    status = Column(String, nullable=False, server_default="OPEN", index=True)     # OPEN | TAKEN | STARTED | ENDED | CANCELLED
    created_by = Column(String, nullable=True)

    exec_name = Column(String, nullable=True)
    exec_phone = Column(String, nullable=True)
    exec_vehicle_number = Column(String, nullable=True)
    exec_vehicle_model = Column(String, nullable=True)
    taken_at = Column(TIMESTAMP(timezone=True), nullable=True)

    commission_due = Column(Integer, nullable=True)
    commission_status = Column(String, nullable=False, server_default="PENDING")    # PENDING | REPORTED (UTR sent) | CONFIRMED (staff saw the money)
    commission_utr = Column(String, nullable=True)

    start_otp = Column(String, nullable=True)           # told to the customer, never shown to the executor
    end_otp = Column(String, nullable=True)
    start_km = Column(Integer, nullable=True)
    end_km = Column(Integer, nullable=True)
    start_photo = Column(String, nullable=True)
    end_photo = Column(String, nullable=True)
    started_at = Column(TIMESTAMP(timezone=True), nullable=True)
    ended_at = Column(TIMESTAMP(timezone=True), nullable=True)
    last_lat = Column(Float, nullable=True)
    last_lng = Column(Float, nullable=True)
    last_loc_at = Column(TIMESTAMP(timezone=True), nullable=True)

    rating = Column(Integer, nullable=True)
    feedback = Column(Text, nullable=True)
    events = Column(JSON, nullable=True)

    expires_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
