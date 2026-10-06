import os
import re
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database.session import get_db
from app.models.platform_setting import PlatformSetting
from app.models.ai_automation_log import AIAutomationLog
from app.core.security import get_current_admin
from app.services.human_intelligence_engine import (
    get_all_training_rules,
    add_training_rule,
    update_training_rule,
    delete_training_rule,
    correct_query_and_train,
    seed_default_faq_rules,
    process_conversational_turn,
    reset_session,
    query_external_llm
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai-training", tags=["AI Training & Knowledge Hub"])

class TrainingRuleCreate(BaseModel):
    question: Optional[str] = None
    triggers: List[str]
    response_en: str
    response_ta: str
    category: Optional[str] = "CUSTOM_TRAINING"
    suggestions: Optional[List[str]] = None
    follow_up_prompt: Optional[str] = None

class TrainingRuleUpdate(BaseModel):
    question: Optional[str] = None
    triggers: Optional[List[str]] = None
    response_en: Optional[str] = None
    response_ta: Optional[str] = None
    category: Optional[str] = None
    suggestions: Optional[List[str]] = None
    follow_up_prompt: Optional[str] = None
    is_active: Optional[bool] = None

class CorrectionRequest(BaseModel):
    query: str
    correct_reply: str
    category: Optional[str] = "ADMIN_CORRECTION"
    language: Optional[str] = "ta"
    question: Optional[str] = None

class SettingsUpdateRequest(BaseModel):
    ai_mode: Optional[str] = "RULE_BASED" # "RULE_BASED" or "HYBRID_LLM"
    api_key: Optional[str] = None
    operator_name: Optional[str] = "Priya (Dispatch Lead)"
    is_enabled: Optional[bool] = True

class TestChatRequest(BaseModel):
    message: str
    language: Optional[str] = "ta"
    session_id: Optional[str] = "admin_simulator"
    reset: Optional[bool] = False

def _get_platform_val(db: Session, key: str, default: str = "") -> str:
    setting = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    return setting.value if setting else default

def _set_platform_val(db: Session, key: str, value: str):
    setting = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if setting:
        setting.value = value
    else:
        setting = PlatformSetting(key=key, value=value)
        db.add(setting)
    db.commit()

@router.get("/rules")
def list_rules(current_admin=Depends(get_current_admin)):
    """List all custom trained QA rules."""
    rules = get_all_training_rules()
    return {
        "success": True,
        "count": len(rules),
        "rules": rules
    }

@router.post("/rules")
def create_rule(payload: TrainingRuleCreate, current_admin=Depends(get_current_admin)):
    """Add a new custom training rule or Q&A pair."""
    if not payload.triggers or not (payload.response_en or payload.response_ta):
        raise HTTPException(status_code=400, detail="Triggers and at least one response (Tamil or English) are required.")
    rule = add_training_rule(
        triggers=payload.triggers,
        response_en=payload.response_en or payload.response_ta,
        response_ta=payload.response_ta or payload.response_en,
        category=payload.category or "CUSTOM_TRAINING",
        suggestions=payload.suggestions,
        question=payload.question,
        follow_up_prompt=payload.follow_up_prompt
    )
    return {"success": True, "message": "Training rule added successfully", "rule": rule}

@router.put("/rules/{rule_id}")
def edit_rule(rule_id: str, payload: TrainingRuleUpdate, current_admin=Depends(get_current_admin)):
    """Update an existing training rule."""
    updates = payload.dict(exclude_unset=True)
    updated = update_training_rule(rule_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Training rule not found")
    return {"success": True, "message": "Rule updated successfully", "rule": updated}

@router.delete("/rules/{rule_id}")
def remove_rule(rule_id: str, current_admin=Depends(get_current_admin)):
    """Delete a training rule."""
    ok = delete_training_rule(rule_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Training rule not found")
    return {"success": True, "message": "Training rule deleted"}

@router.post("/seed")
def seed_faqs(current_admin=Depends(get_current_admin)):
    """Seed comprehensive standard outstation taxi FAQs."""
    added = seed_default_faq_rules()
    return {"success": True, "message": f"Seeded standard FAQ rules successfully! ({added} new rules added)"}

@router.get("/logs")
def list_logs(limit: int = 50, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """Retrieve recent AI chat logs for inspection and one-click correction."""
    logs = (
        db.query(AIAutomationLog)
        .filter(AIAutomationLog.category.in_(["SMART_LLM_ASSISTANT", "DISPATCH_SUPPORT", "UNRECOGNIZED", "CUSTOM_TRAINED", "TARIFF"]))
        .order_by(desc(AIAutomationLog.created_at))
        .limit(limit)
        .all()
    )
    items = []
    for l in logs:
        details = l.details_json or {}
        items.append({
            "id": l.id,
            "created_at": l.created_at.isoformat() if l.created_at else None,
            "query": details.get("user_query") or l.summary,
            "response": details.get("ai_response_text") or "",
            "category": l.action_type or l.category,
            "confidence": l.confidence_score or 1.0,
            "language": details.get("detected_language") or "en"
        })
    return {"success": True, "count": len(items), "logs": items}

@router.post("/correct-log")
def correct_log(payload: CorrectionRequest, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """Admin teaches the bot the right response for a past query."""
    if not payload.query or not payload.correct_reply:
        raise HTTPException(status_code=400, detail="Query and corrected reply are required.")
    rule = correct_query_and_train(
        query=payload.query,
        correct_reply=payload.correct_reply,
        category=payload.category or "ADMIN_CORRECTION",
        language=payload.language or "ta",
        question=payload.question
    )
    return {
        "success": True,
        "message": f"Successfully trained! Future questions matching '{payload.query}' will receive this response.",
        "rule": rule
    }

@router.get("/settings")
def get_settings(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """Fetch AI assistant mode, API key status, operator persona."""
    api_key = _get_platform_val(db, "AI_ASSISTANT_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
    mode = _get_platform_val(db, "AI_ASSISTANT_MODE", "RULE_BASED")
    operator_name = _get_platform_val(db, "AI_OPERATOR_NAME", "Priya (Dispatch Lead)")
    is_enabled = _get_platform_val(db, "AI_ASSISTANT_ENABLED", "true").lower() == "true"

    masked_key = ""
    if api_key:
        masked_key = api_key[:4] + "..." + api_key[-4:] if len(api_key) > 8 else "***"

    return {
        "success": True,
        "ai_mode": mode,
        "has_api_key": bool(api_key),
        "masked_api_key": masked_key,
        "operator_name": operator_name,
        "is_enabled": is_enabled
    }

@router.post("/settings")
def update_settings(payload: SettingsUpdateRequest, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """Update AI assistant mode, API key, operator persona."""
    if payload.ai_mode is not None:
        _set_platform_val(db, "AI_ASSISTANT_MODE", payload.ai_mode.upper())
    if payload.operator_name is not None:
        _set_platform_val(db, "AI_OPERATOR_NAME", payload.operator_name.strip())
    if payload.is_enabled is not None:
        _set_platform_val(db, "AI_ASSISTANT_ENABLED", "true" if payload.is_enabled else "false")
    if payload.api_key is not None and payload.api_key.strip():
        _set_platform_val(db, "AI_ASSISTANT_API_KEY", payload.api_key.strip())
    return {"success": True, "message": "AI settings updated successfully"}

@router.post("/reset-session")
def reset_chat_session(payload: Dict[str, str] = Body(...), current_admin=Depends(get_current_admin)):
    """Resets conversational slots and doubt history for a session."""
    sid = payload.get("session_id", "admin_simulator")
    reset_session(sid)
    return {"success": True, "message": f"Session '{sid}' reset successfully"}

@router.post("/test-chat")
async def test_chat(payload: TestChatRequest, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """Live interactive multi-turn simulator for Admin to test questions, typo tolerance & slot-filling."""
    user_msg = payload.message.strip()
    sid = payload.session_id or "admin_simulator"

    if payload.reset:
        reset_session(sid)

    operator_name = _get_platform_val(db, "AI_OPERATOR_NAME", "Priya (Dispatch Lead)")
    mode = _get_platform_val(db, "AI_ASSISTANT_MODE", "RULE_BASED")
    api_key = _get_platform_val(db, "AI_ASSISTANT_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
    is_tamil = payload.language == "ta" or bool(re.search(r'[஀-௿]', user_msg))

    # 1. If external LLM mode is active with key, query LLM
    if mode == "HYBRID_LLM" and api_key:
        llm_reply = await query_external_llm(user_msg, api_key, operator_name, is_tamil)
        if llm_reply:
            return {
                "success": True,
                "engine": "HYBRID_LLM (Gemini / AI Bridge)",
                "reply": llm_reply,
                "category": "LLM_GENERATED",
                "suggestions": ["🚗 Book Route", "📞 Speak to Operator"],
                "session_id": sid
            }

    # 2. Main Human Conversational Multi-Turn Clarification Engine
    # Handles: Typo tolerance, phonetic normalization, custom Q&A matching,
    # progressive slot questions (locations -> trip type -> time -> car -> quote),
    # and clarification loops for ambiguous queries!
    turn_result = process_conversational_turn(
        message=user_msg,
        session_id=sid,
        language=payload.language or "ta",
        operator_name=operator_name
    )
    return turn_result

