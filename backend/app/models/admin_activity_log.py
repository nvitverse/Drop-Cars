# app/models/admin_activity_log.py
from sqlalchemy import Column, String, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database.session import Base


class AdminActivityLog(Base):
    """Audit trail of sensitive admin actions - who did what, to which
    account, and when. Built so an Owner can see "which staff did what"
    instead of every admin action being anonymous. admin_username is
    denormalized (copied at write time) so the log stays readable even if
    the acting admin account is later removed."""
    __tablename__ = "admin_activity_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    admin_id = Column(UUID(as_uuid=True), nullable=True)
    admin_username = Column(String, nullable=False)
    admin_role = Column(String, nullable=True)
    # e.g. "PERMANENT_BLOCK", "PERMANENT_UNBLOCK", "ACCOUNT_STATUS_CHANGE",
    # "WALLET_ADJUST", "STAFF_CREATED", "STAFF_PERMISSIONS_UPDATED", "STAFF_REMOVED"
    action = Column(String, nullable=False)
    # e.g. "vendor", "vehicle_owner", "driver", "admin"
    target_type = Column(String, nullable=True)
    target_id = Column(String, nullable=True)
    target_name = Column(String, nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
