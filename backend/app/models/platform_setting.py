# models/platform_setting.py
"""
Simple key/value store for platform-wide settings the admin can edit at runtime
(e.g. yearly fee, suspend threshold, billing master switch). Avoids hardcoding
amounts in code so the owner can change them from the admin panel.
"""
from sqlalchemy import Column, String, TIMESTAMP, func
from app.database.session import Base


class PlatformSetting(Base):
    __tablename__ = "platform_settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
