from sqlalchemy import Column, String, Float, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database.session import Base


class AIAutomationLog(Base):
    """
    Audit trail for all AI & Automation tasks performed across Drop Cars.
    Stores categorized actions (DOCUMENT_VERIFICATION, AUTO_DISPATCH, TAMIL_VOICE_BOT, DYNAMIC_PRICING),
    action status (AUTO_APPROVED, AUTO_REJECTED, AUTO_DISPATCHED, TARIFF_QUOTED),
    entity metadata, timestamp, confidence scores, and raw JSON inspection details.
    """
    __tablename__ = "ai_automation_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)
    # Categories: "DOCUMENT_VERIFICATION", "AUTO_DISPATCH", "TAMIL_VOICE_BOT", "WHATSAPP_CHAT", "DYNAMIC_PRICING", "FRAUD_DETECTION"
    category = Column(String, nullable=False, index=True)
    # Action Type: "AUTO_APPROVED", "AUTO_REJECTED", "AUTO_DISPATCHED", "TARIFF_QUOTED", "SPOOF_ALERT"
    action_type = Column(String, nullable=False)
    # Entity Type: "driver", "vehicle_owner", "car", "booking", "customer"
    entity_type = Column(String, nullable=True)
    entity_id = Column(String, nullable=True)
    entity_name = Column(String, nullable=True)
    # Human-readable summary: e.g., "Driving License Auto-Rejected: Original document not uploaded (Xerox)"
    summary = Column(String, nullable=False)
    # AI confidence score e.g., 0.95
    confidence_score = Column(Float, nullable=True, default=1.0)
    # Complete JSON inspection details (OCR text, color saturation score, extracted dates, image_url, etc.)
    details_json = Column(JSON, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False, index=True)
