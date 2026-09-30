# app/models/customer_review_queue.py
"""
Mandatory Customer Review Queue & Staff Follow-up Tasks.
Every completed trip automatically enters this queue.
Staff MUST contact the customer for a Google Review and mark it approached.
Cannot be cleared without explicit staff action.
"""
from sqlalchemy import Column, String, Integer, Boolean, TIMESTAMP, Text, func, Index
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class CustomerReviewQueue(Base):
    __tablename__ = "customer_review_queue"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    order_id = Column(Integer, unique=True, nullable=False, index=True)
    customer_name = Column(String, nullable=False)
    customer_phone = Column(String(20), nullable=False, index=True)
    driver_name = Column(String, nullable=False)
    vehicle_number = Column(String(20), nullable=False)
    route = Column(String, nullable=True)  # e.g. "Chennai to Madurai"
    fare_collected = Column(Integer, nullable=True)

    trip_completed_at = Column(TIMESTAMP(timezone=True), nullable=False, default=func.now())

    # Status: 'PENDING', 'APPROACHED_VIA_WHATSAPP', 'APPROACHED_VIA_CALL', 'REVIEW_RECEIVED_5_STAR', 'FEEDBACK_LOGGED', 'REFUSED'
    status = Column(String(40), nullable=False, default="PENDING", server_default="PENDING", index=True)

    review_link_sent = Column(Boolean, nullable=False, default=False, server_default="false")
    google_review_url = Column(String, nullable=True)

    # Staff Attribution: who followed up
    approached_by_staff_id = Column(UUID(as_uuid=True), nullable=True)
    approached_by_staff_username = Column(String, nullable=True)
    approached_at = Column(TIMESTAMP(timezone=True), nullable=True)

    customer_rating_reported = Column(Integer, nullable=True)  # 1 to 5 stars
    customer_feedback_notes = Column(Text, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index('idx_review_queue_status', 'status'),
        Index('idx_review_queue_completed_at', 'trip_completed_at'),
    )
