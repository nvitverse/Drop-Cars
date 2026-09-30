# app/models/savaari_alert_filter.py
"""
Per-admin notification filter rules for the Savaari booking monitor.
When the monitor detects a new booking, it checks these filters.
A booking triggers a push notification if it matches ANY active filter
(OR logic), or unconditionally if no filters exist (send all).
"""
from sqlalchemy import Column, String, Float, Boolean, TIMESTAMP, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class SavaariAlertFilter(Base):
    __tablename__ = "savaari_alert_filters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    # Which admin created this filter (any admin can have multiple filters)
    admin_id = Column(UUID(as_uuid=True), ForeignKey("admin.id", ondelete="CASCADE"), nullable=False, index=True)
    # Human-readable name, e.g. "Chennai High Price", "Innova Crysta"
    filter_name = Column(String, nullable=False)
    # Match criteria (all nullable = wildcard for that field)
    pickup_city = Column(String, nullable=True)   # e.g. "Chennai"
    drop_city = Column(String, nullable=True)     # e.g. "Tiruvannamalai"
    car_type = Column(String, nullable=True)      # e.g. "Etios", "Innova Crysta"
    trip_type = Column(String, nullable=True)     # e.g. "Oneway"
    min_price = Column(Float, nullable=True)      # e.g. 2800.0 - alert only if price >= this
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
