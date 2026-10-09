from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, DateTime, Index
import json

from app.database.session import Base, get_db

router = APIRouter(prefix="/api/help", tags=["Help Analytics & Telemetry"])


class HelpEventModel(Base):
    """Stores anonymous help and error interaction telemetry to identify confusing screens."""
    __tablename__ = "help_telemetry_events"

    id = Column(Integer, primary_key=True, index=True)
    app = Column(String(30), nullable=False, index=True)  # driver, customer, vendor, admin
    code = Column(String(60), nullable=False, index=True)  # DC_* code
    screen = Column(String(80), nullable=True)
    build = Column(String(30), nullable=True)
    action = Column(String(30), nullable=False)  # shown, opened_more, tapped_call, tapped_whatsapp, tapped_fix, dismissed
    lang = Column(String(10), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("idx_help_events_app_code", "app", "code"),
        Index("idx_help_events_created", "created_at"),
    )


class HelpEventCreate(BaseModel):
    app: str = Field(..., description="Application name: driver | customer | vendor | admin")
    code: str = Field(..., description="Help/Error code e.g. DC_INSUFFICIENT_WALLET")
    screen: Optional[str] = None
    build: Optional[str] = None
    action: str = Field(..., description="Interaction action: shown | opened_more | tapped_call | tapped_whatsapp | tapped_fix | dismissed")
    lang: Optional[str] = "en"


@router.post("/events", status_code=201)
def record_help_event(payload: HelpEventCreate, db: Session = Depends(get_db)):
    """
    Records an anonymous help interaction event without storing any personal or financial details.
    """
    try:
        # Create table if it does not exist yet (safe additive pattern)
        HelpEventModel.__table__.create(bind=db.get_bind(), checkfirst=True)
        
        event = HelpEventModel(
            app=payload.app.lower().strip()[:30],
            code=payload.code.strip()[:60],
            screen=(payload.screen or "")[:80],
            build=(payload.build or "")[:30],
            action=payload.action.strip()[:30],
            lang=(payload.lang or "en")[:10],
            created_at=datetime.utcnow(),
        )
        db.add(event)
        db.commit()
        return {"status": "recorded", "code": payload.code}
    except Exception as e:
        db.rollback()
        # Non-blocking telemetry failure
        return {"status": "ignored", "error": str(e)}


@router.get("/insights")
def get_help_insights(
    days: int = Query(7, ge=1, le=90),
    app: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Returns aggregated help insights for Admin Support Console:
    - Top 10 doubt/error codes
    - Call and WhatsApp click-through rates
    - Daily distribution
    """
    try:
        HelpEventModel.__table__.create(bind=db.get_bind(), checkfirst=True)
        since = datetime.utcnow() - timedelta(days=days)
        
        query = db.query(HelpEventModel).filter(HelpEventModel.created_at >= since)
        if app:
            query = query.filter(HelpEventModel.app == app.lower().strip())
        
        events = query.all()
        
        # Aggregate statistics
        code_counts: Dict[str, Dict[str, int]] = {}
        total_events = len(events)
        total_calls = 0
        total_whatsapps = 0
        total_opened_more = 0

        for ev in events:
            c = ev.code or "UNKNOWN"
            if c not in code_counts:
                code_counts[c] = {"total": 0, "shown": 0, "opened_more": 0, "tapped_call": 0, "tapped_whatsapp": 0, "tapped_fix": 0}
            
            code_counts[c]["total"] += 1
            if ev.action in code_counts[c]:
                code_counts[c][ev.action] += 1
            
            if ev.action == "tapped_call":
                total_calls += 1
            elif ev.action == "tapped_whatsapp":
                total_whatsapps += 1
            elif ev.action == "opened_more":
                total_opened_more += 1

        # Sort top codes by frequency
        top_codes = sorted(
            [
                {
                    "code": k,
                    "total": v["total"],
                    "shown": v["shown"],
                    "opened_more": v["opened_more"],
                    "tapped_call": v["tapped_call"],
                    "tapped_whatsapp": v["tapped_whatsapp"],
                    "tapped_fix": v["tapped_fix"],
                    "call_rate_pct": round((v["tapped_call"] / max(v["total"], 1)) * 100, 1),
                }
                for k, v in code_counts.items()
            ],
            key=lambda x: x["total"],
            reverse=True,
        )[:10]

        return {
            "period_days": days,
            "total_events": total_events,
            "total_calls": total_calls,
            "total_whatsapps": total_whatsapps,
            "total_opened_more": total_opened_more,
            "top_codes": top_codes,
        }
    except Exception as e:
        return {
            "period_days": days,
            "total_events": 0,
            "total_calls": 0,
            "total_whatsapps": 0,
            "total_opened_more": 0,
            "top_codes": [],
            "note": str(e),
        }
