# app/models/admin.py
from sqlalchemy import Column, Integer, String, TIMESTAMP, Boolean, func
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database.session import Base

class Admin(Base):
    __tablename__ = "admin"

    # id = Column(Integer, primary_key=True, index=True)
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    username = Column(String)
    password = Column(String)
    role = Column(String)  # "Owner" (full access, can manage staff) or "Staff"
    # Section keys this Staff admin can access - checked by the frontend to
    # show/hide bottom tabs. Ignored for Owner (always full access).
    # "settings" is deliberately never a valid value here - only an Owner
    # ever reaches Settings/staff-management, no matter what's granted.
    # See ALLOWED_STAFF_PERMISSIONS in api/routes/admin.py.
    permissions = Column(JSON, nullable=False, default=list, server_default="[]")
    email = Column(String)
    phone = Column(String(10), nullable=False)
    # organization_id = Column(String)
    organization_id = Column(UUID(as_uuid=True), default=uuid.uuid4, nullable=False)

    # Self-toggled in Admin App > Settings - "I'm on duty right now". Lets
    # driver-facing screens show a real, currently-reachable phone number
    # (GET /api/support/on-duty-contact) instead of a hardcoded placeholder.
    is_on_duty = Column(Boolean, nullable=False, default=False, server_default="false")
    on_duty_since = Column(TIMESTAMP(timezone=True), nullable=True)
    
    # Admin balance tracking
    balance = Column(Integer, nullable=False, default=0)

    # Bumped to invalidate all previously issued tokens (force logout)
    token_version = Column(Integer, nullable=False, default=1, server_default="1")

    # Timestamp In UTC Format
    created_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False
    )
