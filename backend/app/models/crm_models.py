# app/models/crm_models.py
"""
Models for the CRM & Marketing Module:
- CrmLead: Stores website form leads, call button triggers, and direct enquiries.
- GoogleAdsCallLog: Stores daily call counts from Google Ads Call Assets and website calls.
- CrmSettings: Owner-only settings for ad budgets, webhook secret keys, and integration credentials.
"""
from sqlalchemy import Column, String, Integer, Float, Text, Date, TIMESTAMP, Boolean, func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database.session import Base


class CrmLead(Base):
    __tablename__ = "crm_leads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    name = Column(String, nullable=True)
    phone = Column(String, nullable=False, index=True)
    pickup_location = Column(String, nullable=True)
    drop_location = Column(String, nullable=True)
    pickup_date = Column(String, nullable=True)
    source = Column(String, nullable=False, default="Website Form", index=True)  # Website Form, Google Ads Call, Website Call Click, etc.
    status = Column(String, nullable=False, default="New", index=True)  # New, Contacted, Converted, Closed, Lost
    notes = Column(Text, nullable=True)
    assigned_to = Column(String, nullable=True)  # Staff ID / Email if assigned
    followup_due_at = Column(TIMESTAMP(timezone=True), nullable=True, index=True)  # Follow-up timer
    is_snoozed = Column(Boolean, nullable=False, default=False)
    auto_nurture_step = Column(Integer, nullable=False, default=0)  # 0: None, 1: Estimate Sent, 2: Follow-up Check-in, 3: Discount Push
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class GoogleAdsCallLog(Base):
    __tablename__ = "google_ads_call_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    log_date = Column(Date, nullable=False, index=True)
    ad_call_count = Column(Integer, nullable=False, default=0)
    website_call_clicks = Column(Integer, nullable=False, default=0)
    campaign_name = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class CrmSettings(Base):
    __tablename__ = "crm_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    webhook_secret_key = Column(String, nullable=False, default="dropcars_crm_secret_2026")
    monthly_ad_budget = Column(Float, nullable=False, default=0.0)
    google_ads_customer_id = Column(String, nullable=True)
    auto_dispatch_enabled = Column(Boolean, nullable=False, default=True)  # Zero-touch smart driver auto-dispatch
    auto_whatsapp_response = Column(Boolean, nullable=False, default=True)  # Instant WhatsApp greeting bot
    nightly_founder_report = Column(Boolean, nullable=False, default=True)  # Automated 10 PM Founder summary
    founder_phone = Column(String, nullable=True, default="919876543210")
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
