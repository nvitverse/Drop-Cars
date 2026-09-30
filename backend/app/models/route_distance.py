# models/route_distance.py
"""
Cached driving distances between locations (city pairs).

Every fare quote used to call Google Distance Matrix - but Chennai->Bangalore
is the same distance every time. First quote for a pair calls Google ONCE and
stores it here; every quote after reads the cache for free. Admin can view and
override any cached value (Settings > Route Distances) without code changes.
"""
import uuid
from sqlalchemy import Column, String, Float, TIMESTAMP, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.database.session import Base


class RouteDistance(Base):
    __tablename__ = "route_distances"
    __table_args__ = (
        UniqueConstraint("origin_key", "destination_key", name="uq_route_pair"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    # Normalized (lowercased/trimmed) keys used for lookups
    origin_key = Column(String, nullable=False, index=True)
    destination_key = Column(String, nullable=False, index=True)
    # Original display strings
    origin = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    distance_km = Column(Float, nullable=False)
    duration_text = Column(String, nullable=True)
    # GOOGLE = fetched from Distance Matrix, ADMIN = manually overridden
    source = Column(String, nullable=False, default="GOOGLE")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
