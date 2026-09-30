import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.sos_alert import SosAlert
from app.models.orders import Orders

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sos", tags=["SOS Emergency"])


class SosAlertCreate(BaseModel):
    customer_id: Optional[str] = None
    driver_id: Optional[str] = None
    order_id: Optional[str] = None
    triggered_by_role: Optional[str] = "CUSTOMER"  # CUSTOMER, DRIVER, OWNER
    customer_phone: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_name: Optional[str] = None
    car_number: Optional[str] = None
    emergency_contact: Optional[str] = None
    latitude: Optional[str] = None
    longitude: Optional[str] = None
    tracking_link: Optional[str] = None


class SosLocationStream(BaseModel):
    latitude: str
    longitude: str


class SosAcknowledgePayload(BaseModel):
    acknowledged_by: str = "Admin Staff"


class SosResolvePayload(BaseModel):
    resolved_by: str = "Admin Staff"
    status: str = "RESOLVED"  # RESOLVED or FALSE_ALARM
    resolution_notes: Optional[str] = None


@router.post("/alert")
@router.post("/trigger")
def create_sos_alert(payload: SosAlertCreate, db: Session = Depends(get_db)):
    """Trigger an emergency SOS alert from Rider, Driver or Fleet Owner."""
    # Attempt to enrich from active order if order_id is provided
    cust_phone = payload.customer_phone
    d_phone = payload.driver_phone
    d_name = payload.driver_name
    c_num = payload.car_number
    track_url = payload.tracking_link

    if payload.order_id:
        try:
            order = db.query(Orders).filter(Orders.order_id == payload.order_id).first()
            if order:
                if not cust_phone and getattr(order, "customer_number", None):
                    cust_phone = order.customer_number
                if not track_url:
                    track_url = f"https://dropcars.in/track/{order.order_id}"
        except Exception as e:
            logger.warning(f"Failed to enrich SOS from order {payload.order_id}: {e}")

    alert = SosAlert(
        customer_id=payload.customer_id,
        driver_id=payload.driver_id,
        order_id=payload.order_id,
        triggered_by_role=payload.triggered_by_role or "CUSTOMER",
        customer_phone=cust_phone,
        driver_phone=d_phone,
        driver_name=d_name,
        car_number=c_num,
        emergency_contact=payload.emergency_contact,
        latitude=payload.latitude,
        longitude=payload.longitude,
        tracking_link=track_url or (f"https://dropcars.in/track/{payload.order_id}" if payload.order_id else None),
        status="ACTIVE",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    logger.critical(
        f"🚨 SOS EMERGENCY TRIGGERED! Alert ID={alert.id}, Role={alert.triggered_by_role}, "
        f"Order={alert.order_id}, Lat={alert.latitude}, Lng={alert.longitude}"
    )

    return {
        "status": "ok",
        "alert_id": alert.id,
        "message": "SOS Emergency Alert logged successfully. Operations team alerted.",
        "tracking_link": alert.tracking_link,
    }


@router.post("/stream/{alert_id}")
def stream_sos_location(alert_id: int, payload: SosLocationStream, db: Session = Depends(get_db)):
    """Continuous 10-second location streaming while SOS is ACTIVE."""
    alert = db.query(SosAlert).filter(SosAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="SOS Alert not found")

    if alert.status in ("RESOLVED", "FALSE_ALARM"):
        return {"status": "inactive", "message": "SOS alert is already resolved"}

    alert.latitude = payload.latitude
    alert.longitude = payload.longitude
    alert.updated_at = datetime.utcnow()
    db.commit()

    return {"status": "ok", "updated_at": alert.updated_at.isoformat()}


@router.get("/active")
def get_active_sos_alerts(db: Session = Depends(get_db)):
    """Check active emergency alerts for siren audio / top banner host."""
    active_alerts = (
        db.query(SosAlert)
        .filter(SosAlert.status.in_(["ACTIVE", "ACKNOWLEDGED"]))
        .order_by(SosAlert.created_at.desc())
        .all()
    )
    return {
        "count": len(active_alerts),
        "has_active_emergency": any(a.status == "ACTIVE" for a in active_alerts),
        "alerts": [
            {
                "id": a.id,
                "order_id": a.order_id,
                "triggered_by_role": a.triggered_by_role,
                "customer_phone": a.customer_phone,
                "driver_phone": a.driver_phone,
                "driver_name": a.driver_name,
                "car_number": a.car_number,
                "latitude": a.latitude,
                "longitude": a.longitude,
                "tracking_link": a.tracking_link,
                "status": a.status,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "updated_at": a.updated_at.isoformat() if a.updated_at else None,
            }
            for a in active_alerts
        ],
    }


@router.get("/alerts")
def list_sos_alerts(
    status_filter: Optional[str] = Query(None, description="Filter by status: ACTIVE, ACKNOWLEDGED, RESOLVED, FALSE_ALARM"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """List SOS emergency alerts for admin emergency dashboard."""
    query = db.query(SosAlert)
    if status_filter:
        query = query.filter(SosAlert.status == status_filter.upper())
    alerts = query.order_by(SosAlert.created_at.desc()).limit(limit).all()
    return alerts


@router.post("/{alert_id}/acknowledge")
def acknowledge_sos_alert(
    alert_id: int, payload: SosAcknowledgePayload, db: Session = Depends(get_db)
):
    """Admin staff acknowledges an active emergency alert."""
    alert = db.query(SosAlert).filter(SosAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="SOS Alert not found")

    alert.status = "ACKNOWLEDGED"
    alert.acknowledged_by = payload.acknowledged_by
    alert.acknowledged_at = datetime.utcnow()
    alert.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(alert)
    return {"status": "ok", "message": "SOS Alert acknowledged", "alert": alert}


@router.post("/{alert_id}/resolve")
def resolve_sos_alert(
    alert_id: int, payload: SosResolvePayload, db: Session = Depends(get_db)
):
    """Admin staff resolves or marks false alarm on an emergency alert."""
    alert = db.query(SosAlert).filter(SosAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="SOS Alert not found")

    resolved_status = payload.status.upper()
    if resolved_status not in ("RESOLVED", "FALSE_ALARM"):
        resolved_status = "RESOLVED"

    alert.status = resolved_status
    alert.resolved_by = payload.resolved_by
    alert.resolved_at = datetime.utcnow()
    alert.resolution_notes = payload.resolution_notes
    alert.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(alert)
    return {"status": "ok", "message": f"SOS Alert marked as {resolved_status}", "alert": alert}
