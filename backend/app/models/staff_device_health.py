"""What the Admin App on a staff member's phone reports about its own alert readiness (notification permission, display-over-other-apps, battery
whitelist, app version). One row per staff member, replaced on every report. Used for the Owner's "who can I actually reach?" list."""
import uuid

from sqlalchemy import Boolean, Column, String, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID

from app.database.session import Base


class StaffDeviceHealth(Base):
    __tablename__ = "staff_device_health"

    admin_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    notifications_ok = Column(Boolean, nullable=True)       # notification permission granted
    overlay_ok = Column(Boolean, nullable=True)             # display over other apps (None = this app build cannot tell)
    battery_ok = Column(Boolean, nullable=True)             # battery optimisation off for the app (None = cannot tell)
    native_available = Column(Boolean, nullable=False, server_default="false")   # the build contains the overlay / battery native module
    app_version = Column(String, nullable=True)
    platform = Column(String, nullable=True)
    device_label = Column(String, nullable=True)
    reported_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
