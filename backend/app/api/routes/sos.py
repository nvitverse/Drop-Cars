from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database.session import get_db
from app.models.sos_alert import SosAlert

router = APIRouter()

class SosAlertCreate(BaseModel):
    customer_id: Optional[str] = None
    order_id: Optional[str] = None
    emergency_contact: Optional[str] = None
    latitude: Optional[str] = None
    longitude: Optional[str] = None
    tracking_link: Optional[str] = None

@router.post("/alert")
def create_sos_alert(payload: SosAlertCreate, db: Session = Depends(get_db)):
    alert = SosAlert(
        customer_id=payload.customer_id,
        order_id=payload.order_id,
        emergency_contact=payload.emergency_contact,
        latitude=payload.latitude,
        longitude=payload.longitude,
        tracking_link=payload.tracking_link,
        status="ACTIVE",
        created_at=datetime.utcnow()
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return {"status": "ok", "alert_id": alert.id, "message": "SOS Emergency Alert logged successfully."}

@router.get("/alerts")
def list_sos_alerts(db: Session = Depends(get_db)):
    alerts = db.query(SosAlert).order_by(SosAlert.created_at.desc()).limit(100).all()
    return alerts
