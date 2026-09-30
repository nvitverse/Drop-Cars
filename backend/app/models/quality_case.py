# models/quality_case.py
"""One row per low-rated trip feedback (from either the Customer App's
Rating table or the post-trip review link's TripReview table): tracks the
automatic low-rating penalty and the staff follow-up on it."""
from sqlalchemy import Column, String, TIMESTAMP, Integer, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.database.session import Base


class QualityCase(Base):
    __tablename__ = "quality_case"
    __table_args__ = (UniqueConstraint("source", "source_id", name="uq_quality_case_source"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String, nullable=False)       # APP_RATING | TRIP_REVIEW
    source_id = Column(String, nullable=False)    # Rating.id / TripReview.id
    order_id = Column(Integer, nullable=True, index=True)
    vehicle_owner_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    driver_id = Column(UUID(as_uuid=True), nullable=True)
    rating = Column(Integer, nullable=False)
    penalty_amount = Column(Integer, nullable=False, default=0, server_default="0")
    penalty_status = Column(String, nullable=False, default="NONE", server_default="NONE")  # NONE | APPLIED | WAIVED
    penalty_applied_by = Column(String, nullable=True)  # "AUTO" or staff username
    waive_reason = Column(String, nullable=True)
    waived_by = Column(String, nullable=True)
    resolution_note = Column(String, nullable=True)
    resolved_by = Column(String, nullable=True)
    resolved_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
