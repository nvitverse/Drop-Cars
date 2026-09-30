from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, List, Dict, Any
import uuid

from app.database.session import get_db
from app.models.ai_automation_log import AIAutomationLog

router = APIRouter(tags=["AI Automation Logs"])


@router.get("/admin/ai-automation-logs")
def get_ai_automation_logs(
    category: Optional[str] = Query(None, description="Filter by category e.g. DOCUMENT_VERIFICATION, AUTO_DISPATCH, TAMIL_VOICE_BOT"),
    action_type: Optional[str] = Query(None, description="Filter by action type e.g. AUTO_APPROVED, AUTO_REJECTED"),
    search: Optional[str] = Query(None, description="Search term for entity_name or summary"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Fetch paginated, categorized list of all AI and automation logs.
    Includes category statistics and total count.
    """
    query = db.query(AIAutomationLog)

    if category and category.upper() != "ALL":
        query = query.filter(AIAutomationLog.category == category.upper())

    if action_type:
        query = query.filter(AIAutomationLog.action_type == action_type.upper())

    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (AIAutomationLog.summary.ilike(search_pattern)) |
            (AIAutomationLog.entity_name.ilike(search_pattern)) |
            (AIAutomationLog.entity_id.ilike(search_pattern))
        )

    total_count = query.count()
    logs = query.order_by(desc(AIAutomationLog.created_at)).offset(offset).limit(limit).all()

    # Category counts summary
    categories_stats = {
        "ALL": total_count,
        "DOCUMENT_VERIFICATION": db.query(AIAutomationLog).filter(AIAutomationLog.category == "DOCUMENT_VERIFICATION").count(),
        "AUTO_DISPATCH": db.query(AIAutomationLog).filter(AIAutomationLog.category == "AUTO_DISPATCH").count(),
        "TAMIL_VOICE_BOT": db.query(AIAutomationLog).filter(AIAutomationLog.category == "TAMIL_VOICE_BOT").count(),
        "WHATSAPP_CHAT": db.query(AIAutomationLog).filter(AIAutomationLog.category == "WHATSAPP_CHAT").count(),
        "DYNAMIC_PRICING": db.query(AIAutomationLog).filter(AIAutomationLog.category == "DYNAMIC_PRICING").count(),
    }

    return {
        "total": total_count,
        "stats": categories_stats,
        "logs": [
            {
                "id": str(log.id),
                "category": log.category,
                "action_type": log.action_type,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "entity_name": log.entity_name,
                "summary": log.summary,
                "confidence_score": log.confidence_score,
                "details_json": log.details_json,
                "created_at": log.created_at.isoformat() if log.created_at else None
            }
            for log in logs
        ]
    }


@router.get("/admin/ai-automation-logs/{log_id}")
def get_ai_automation_log_detail(
    log_id: str,
    db: Session = Depends(get_db)
):
    """Fetch full details JSON for a single AI automation activity log."""
    try:
        log_uuid = uuid.UUID(log_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid log_id format")

    log = db.query(AIAutomationLog).filter(AIAutomationLog.id == log_uuid).first()
    if not log:
        raise HTTPException(status_code=404, detail="AI Automation log entry not found")

    return {
        "id": str(log.id),
        "category": log.category,
        "action_type": log.action_type,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "entity_name": log.entity_name,
        "summary": log.summary,
        "confidence_score": log.confidence_score,
        "details_json": log.details_json,
        "created_at": log.created_at.isoformat() if log.created_at else None
    }


@router.post("/admin/ai-automation-logs/seed-demo")
def seed_demo_ai_logs(db: Session = Depends(get_db)):
    """Seed demonstration AI logs to populate the Admin UI for testing."""
    demo_logs = [
        AIAutomationLog(
            category="DOCUMENT_VERIFICATION",
            action_type="AUTO_REJECTED",
            entity_type="driver",
            entity_id="DRV-9012",
            entity_name="Ramesh Kumar",
            summary="Driving License Auto-Rejected: Original document not uploaded (0% Color Xerox Detected)",
            confidence_score=0.96,
            details_json={
                "document_type": "licence",
                "color_saturation_score": 0.0,
                "is_color": False,
                "ocr_detected_text": "DRIVING LICENCE REPUBLIC OF INDIA",
                "rejection_reason": "Original document not uploaded",
                "recommendation": "Ask driver to upload clear original colored document photo"
            }
        ),
        AIAutomationLog(
            category="DOCUMENT_VERIFICATION",
            action_type="AUTO_APPROVED",
            entity_type="driver",
            entity_id="DRV-4410",
            entity_name="Suresh Nathan",
            summary="RC Book Auto-Verified: Original colored document with valid expiry (2029-10-15)",
            confidence_score=0.92,
            details_json={
                "document_type": "rc_front",
                "color_saturation_score": 78.4,
                "is_color": True,
                "extracted_expiry_date": "2029-10-15",
                "vehicle_number": "TN 09 CB 4410",
                "status": "VERIFIED"
            }
        ),
        AIAutomationLog(
            category="TAMIL_VOICE_BOT",
            action_type="TARIFF_QUOTED",
            entity_type="customer",
            entity_id="CUST-1049",
            entity_name="Karthik M (Voice Call)",
            summary="Tamil Voice AI: Calculated Chennai to Madurai Sedan Outstation Fare (395 km = ₹5,530)",
            confidence_score=0.98,
            details_json={
                "audio_input_lang": "ta",
                "speech_transcription": "Chennai la irundhu Madurai ku nalaiku kaalai 6 manikki Sedan car cost evlo aagum?",
                "pickup_city": "Chennai",
                "drop_city": "Madurai",
                "car_type": "Sedan",
                "calculated_km": 395,
                "estimated_fare": 5530,
                "voice_reply_generated": True
            }
        ),
        AIAutomationLog(
            category="AUTO_DISPATCH",
            action_type="AUTO_DISPATCHED",
            entity_type="booking",
            entity_id="BOOK-8821",
            entity_name="Coimbatore to Trichy One-Way",
            summary="Auto-Dispatched: Matched return driver Murugan S (TN 37 AX 8812) with 0 dry-run kms",
            confidence_score=0.94,
            details_json={
                "pickup": "Coimbatore",
                "drop": "Trichy",
                "assigned_driver_id": "DRV-1102",
                "assigned_driver_name": "Murugan S",
                "return_home_match": True,
                "driver_distance_to_pickup_km": 2.4,
                "dispatch_response_time_sec": 1.2
            }
        )
    ]

    for log in demo_logs:
        db.add(log)
    db.commit()

    return {"message": "Successfully seeded 4 demo AI automation logs", "count": len(demo_logs)}
