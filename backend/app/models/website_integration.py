# models/website_integration.py
"""
Admin-managed list of websites allowed to post bookings via the
/api/website/* bridge (see app/api/routes/website_bookings.py). Replaces the
old single WEBSITE_INTEGRATION_KEY env var with a DB table so a new website
can be added/removed/rotated from the Admin app - no env var edit, no
redeploy, no code change.

The original env-var key keeps working too (checked as a fallback in
require_website_key) so the existing live website's integration is
unaffected by this addition.
"""
from sqlalchemy import Column, String, TIMESTAMP, Boolean, func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class WebsiteIntegration(Base):
    __tablename__ = "website_integrations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    name = Column(String, nullable=False)  # human label, e.g. "dropcars.in"
    api_key = Column(String, nullable=False, unique=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
