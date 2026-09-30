# app/api/routes/crm_routes.py
"""
CRM & Marketing Routes:
1. Public Webhooks: /api/crm/lead (Website form & Call clicks)
2. Staff / Admin Lead Management: /api/crm/leads (View, Update, Convert to Booking)
3. Owner Only Financials & Settings: /api/crm/owner/financials, /api/crm/owner/settings
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from typing import Optional, List
from pydantic import BaseModel
from datetime import date, datetime
import uuid
import os
import hmac
import secrets

from app.database.session import get_db
from app.core.security import get_current_admin
from app.models.crm_models import CrmLead, GoogleAdsCallLog, CrmSettings
from app.models.customer_booking_request import CustomerBookingRequest

router = APIRouter(prefix="/crm", tags=["CRM & Marketing"])


# --- Pydantic Schemas ---
class LeadCreateSchema(BaseModel):
    name: Optional[str] = None
    phone: str
    pickup_location: Optional[str] = None
    drop_location: Optional[str] = None
    pickup_date: Optional[str] = None
    source: Optional[str] = "Website Form"  # Website Form, Website Call Click, Google Ads Call
    notes: Optional[str] = None
    secret_key: Optional[str] = None


class LeadUpdateSchema(BaseModel):
    status: Optional[str] = None  # New, Contacted, Converted, Closed, Lost
    notes: Optional[str] = None
    assigned_to: Optional[str] = None


class CrmSettingsUpdateSchema(BaseModel):
    webhook_secret_key: Optional[str] = None
    monthly_ad_budget: Optional[float] = None
    google_ads_customer_id: Optional[str] = None


# The old code shipped this value as a hard-coded default, so it is public.
# It is never accepted, even if it is still stored in CrmSettings.
_LEAKED_DEFAULT_KEY = "dropcars_crm_secret_2026"


# --- Helper: Verify Webhook Key ---
def verify_webhook_key(db: Session, key_provided: Optional[str]):
    settings = db.query(CrmSettings).first()
    valid_keys = [
        k for k in (
            settings.webhook_secret_key if settings else None,
            os.getenv("WEBSITE_INTEGRATION_KEY"),
        )
        if k and k != _LEAKED_DEFAULT_KEY
    ]
    if not valid_keys:
        raise HTTPException(status_code=503, detail="CRM webhook key is not configured")
    provided = key_provided or ""
    if not any(hmac.compare_digest(provided, k) for k in valid_keys):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid CRM Webhook Secret Key"
        )


def require_crm_owner(current_admin=Depends(get_current_admin)):
    """Owner-only CRM pages. The role comes from the admin's token/account;
    the old ?user_role=owner query param is accepted but ignored."""
    if (getattr(current_admin, "role", "") or "").lower() != "owner":
        raise HTTPException(status_code=403, detail="Owner Access Only")
    return current_admin


# --- 1. Public Webhook Endpoint (Website Lead Form & Call Clicks) ---
@router.post("/lead", status_code=status.HTTP_201_CREATED)
def submit_crm_lead(
    payload: LeadCreateSchema,
    db: Session = Depends(get_db),
    x_website_secret_key: Optional[str] = Header(None)
):
    key = payload.secret_key or x_website_secret_key
    verify_webhook_key(db, key)

    # Save Lead
    lead = CrmLead(
        name=payload.name,
        phone=payload.phone.strip(),
        pickup_location=payload.pickup_location,
        drop_location=payload.drop_location,
        pickup_date=payload.pickup_date,
        source=payload.source or "Website Form",
        notes=payload.notes,
        status="New"
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    # Update Daily Call Counts if source is call click
    today = date.today()
    log = db.query(GoogleAdsCallLog).filter(GoogleAdsCallLog.log_date == today).first()
    if not log:
        log = GoogleAdsCallLog(log_date=today, ad_call_count=0, website_call_clicks=0)
        db.add(log)
        db.commit()

    if payload.source == "Website Call Click":
        log.website_call_clicks += 1
        db.commit()
    elif payload.source == "Google Ads Call":
        log.ad_call_count += 1
        db.commit()

    return {
        "status": "success",
        "message": "Lead received successfully",
        "lead_id": str(lead.id)
    }


# --- 2. Staff & Admin: List Leads ---
@router.get("/leads", dependencies=[Depends(get_current_admin)])
def list_crm_leads(
    db: Session = Depends(get_db),
    lead_status: Optional[str] = Query(None, alias="status"),
    source: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    query = db.query(CrmLead)

    if lead_status:
        query = query.filter(CrmLead.status == lead_status)
    if source:
        query = query.filter(CrmLead.source == source)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                CrmLead.name.ilike(search_term),
                CrmLead.phone.ilike(search_term),
                CrmLead.pickup_location.ilike(search_term),
                CrmLead.drop_location.ilike(search_term)
            )
        )

    total = query.count()
    leads = query.order_by(desc(CrmLead.created_at)).offset(offset).limit(limit).all()

    # Call Stats Summary for Header Metrics
    today = date.today()
    today_log = db.query(GoogleAdsCallLog).filter(GoogleAdsCallLog.log_date == today).first()
    today_call_count = (today_log.ad_call_count + today_log.website_call_clicks) if today_log else 0

    total_leads_count = db.query(CrmLead).count()

    return {
        "total": total,
        "leads": leads,
        "metrics_summary": {
            "today_calls_count": today_call_count,
            "total_leads_count": total_leads_count,
            "new_leads_count": db.query(CrmLead).filter(CrmLead.status == "New").count(),
            "converted_leads_count": db.query(CrmLead).filter(CrmLead.status == "Converted").count()
        }
    }


# --- 3. Staff & Admin: Update Lead ---
@router.patch("/leads/{lead_id}", dependencies=[Depends(get_current_admin)])
def update_crm_lead(
    lead_id: str,
    payload: LeadUpdateSchema,
    db: Session = Depends(get_db)
):
    try:
        lead_uuid = uuid.UUID(lead_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Lead ID")

    lead = db.query(CrmLead).filter(CrmLead.id == lead_uuid).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if payload.status:
        lead.status = payload.status
    if payload.notes is not None:
        lead.notes = payload.notes
    if payload.assigned_to is not None:
        lead.assigned_to = payload.assigned_to

    db.commit()
    db.refresh(lead)
    return {"status": "success", "lead": lead}


# --- 4. Staff & Admin: 1-Click Convert Lead to Booking Request ---
@router.post("/leads/{lead_id}/convert", dependencies=[Depends(get_current_admin)])
def convert_lead_to_booking(
    lead_id: str,
    db: Session = Depends(get_db)
):
    try:
        lead_uuid = uuid.UUID(lead_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Lead ID")

    lead = db.query(CrmLead).filter(CrmLead.id == lead_uuid).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Create a CustomerBookingRequest
    booking_request = CustomerBookingRequest(
        customer_name=lead.name or "Website Lead Customer",
        customer_phone=lead.phone,
        pickup_address=lead.pickup_location or "To be specified",
        drop_address=lead.drop_location or "To be specified",
        pickup_date=lead.pickup_date or str(date.today()),
        notes=f"Converted from CRM Lead #{lead_id}. Notes: {lead.notes or 'None'}",
        status="pending"
    )
    db.add(booking_request)

    # Mark Lead as Converted
    lead.status = "Converted"
    db.commit()
    db.refresh(booking_request)

    return {
        "status": "success",
        "message": "Lead converted to Booking Request successfully",
        "booking_request_id": str(booking_request.id)
    }


# --- 5. Owner Only: Financials & ROI Analytics ---
@router.get("/owner/financials", dependencies=[Depends(require_crm_owner)])
def get_crm_owner_financials(
    user_role: str = Query("owner"),  # ignored - role comes from the token
    db: Session = Depends(get_db)
):

    settings = db.query(CrmSettings).first()
    monthly_budget = settings.monthly_ad_budget if settings else 0.0

    total_leads = db.query(CrmLead).count()
    converted_leads = db.query(CrmLead).filter(CrmLead.status == "Converted").count()

    total_ad_calls = db.query(func.sum(GoogleAdsCallLog.ad_call_count)).scalar() or 0
    total_web_calls = db.query(func.sum(GoogleAdsCallLog.website_call_clicks)).scalar() or 0
    total_calls = total_ad_calls + total_web_calls

    cpl = (monthly_budget / total_leads) if total_leads > 0 else 0.0
    cpc = (monthly_budget / converted_leads) if converted_leads > 0 else 0.0

    return {
        "monthly_ad_budget": monthly_budget,
        "total_leads": total_leads,
        "converted_leads": converted_leads,
        "total_calls": total_calls,
        "ad_calls": total_ad_calls,
        "web_calls": total_web_calls,
        "cost_per_lead": round(cpl, 2),
        "cost_per_conversion": round(cpc, 2)
    }


# --- 6. Owner Only: Settings Management ---
@router.get("/owner/settings", dependencies=[Depends(require_crm_owner)])
def get_crm_settings(
    user_role: str = Query("owner"),  # ignored - role comes from the token
    db: Session = Depends(get_db)
):
    settings = db.query(CrmSettings).first()
    if not settings:
        settings = CrmSettings(
            webhook_secret_key=secrets.token_urlsafe(24),
            monthly_ad_budget=0.0
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)

    return settings


@router.put("/owner/settings", dependencies=[Depends(require_crm_owner)])
def update_crm_settings(
    payload: CrmSettingsUpdateSchema,
    user_role: str = Query("owner"),  # ignored - role comes from the token
    db: Session = Depends(get_db)
):
    settings = db.query(CrmSettings).first()
    if not settings:
        settings = CrmSettings()
        db.add(settings)

    if payload.webhook_secret_key is not None:
        settings.webhook_secret_key = payload.webhook_secret_key.strip()
    if payload.monthly_ad_budget is not None:
        settings.monthly_ad_budget = payload.monthly_ad_budget
    if payload.google_ads_customer_id is not None:
        settings.google_ads_customer_id = payload.google_ads_customer_id.strip()

    db.commit()
    db.refresh(settings)
    return {"status": "success", "settings": settings}
