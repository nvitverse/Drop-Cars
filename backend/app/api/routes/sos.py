import logging
import secrets
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.sos_alert import SosAlert
from app.models.orders import Order
from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
from app.models.car_driver import CarDriver
from app.models.vehicle_owner import VehicleOwnerCredentials
from app.core.security import get_current_admin, get_current_user_flexible
from app.core.limiter import limiter

logger = logging.getLogger("dropcars.sos")
router = APIRouter(prefix="/sos", tags=["SOS Emergency"])


class SosAlertCreateLegacy(BaseModel):
    customer_id: Optional[str] = None
    order_id: Optional[str] = None
    emergency_contact: Optional[str] = None
    latitude: Optional[str] = None
    longitude: Optional[str] = None
    tracking_link: Optional[str] = None


class SosTriggerRequest(BaseModel):
    order_id: Optional[str] = None
    emergency_contact: Optional[str] = None
    latitude: Optional[str] = None
    longitude: Optional[str] = None
    tracking_link: Optional[str] = None


class SosLocationStream(BaseModel):
    latitude: str
    longitude: str


class SosResolveRequest(BaseModel):
    status: str = "RESOLVED"  # RESOLVED or FALSE_ALARM
    resolution_notes: Optional[str] = None


# -------------------------------------------------------------------------
# Legacy Endpoint (Exact Contract Preserved)
# -------------------------------------------------------------------------
@router.post("/alert")
def create_sos_alert_legacy(payload: SosAlertCreateLegacy, db: Session = Depends(get_db)):
    """Legacy endpoint for backward compatibility with existing clients."""
    alert = SosAlert(
        customer_id=payload.customer_id,
        order_id=payload.order_id,
        triggered_by_role="CUSTOMER",
        emergency_contact=payload.emergency_contact,
        latitude=payload.latitude,
        longitude=payload.longitude,
        tracking_link=payload.tracking_link,
        status="ACTIVE",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return {
        "status": "ok",
        "alert_id": alert.id,
        "message": "SOS Emergency Alert logged successfully."
    }


# -------------------------------------------------------------------------
# Authenticated SOS Trigger
# -------------------------------------------------------------------------
@router.post("/trigger")
@limiter.limit("5/minute")
def trigger_sos_alert(
    request: Request,
    payload: SosTriggerRequest,
    current_auth: Dict[str, Any] = Depends(get_current_user_flexible),
    db: Session = Depends(get_db)
):
    """
    Trigger emergency SOS distress.
    Auth: Rider, Driver, or Fleet Owner token.
    Identity and role are strictly derived from the validated JWT token.
    """
    user_id = current_auth.get("user_id")
    role = current_auth.get("role", "CUSTOMER").upper()

    cust_phone = None
    d_phone = None
    d_name = None
    c_num = None
    track_url = payload.tracking_link
    driver_id_str = None
    customer_id_str = None

    if role == "DRIVER":
        driver_id_str = str(user_id)
        driver = db.query(CarDriver).filter(CarDriver.id == user_id).first()
        if driver:
            d_phone = driver.primary_number
            d_name = driver.full_name
    elif role == "VEHICLE_OWNER":
        owner = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == user_id).first()
        if owner:
            d_phone = owner.mobile_number
            d_name = "Fleet Owner"
    else:
        customer_id_str = str(user_id)

    # Enrich from active Order if order_id provided
    if payload.order_id:
        try:
            # Check integer or string lookup
            order = None
            try:
                order_int = int(payload.order_id)
                order = db.query(Order).filter(Order.id == order_int).first()
            except ValueError:
                pass

            if order:
                cust_phone = cust_phone or order.customer_number
                if not track_url:
                    track_url = f"https://dropcars.in/track/{order.id}"

                # Query active assignment for driver/car
                assignment = (
                    db.query(OrderAssignment)
                    .filter(
                        OrderAssignment.order_id == order.id,
                        OrderAssignment.assignment_status.in_([
                            AssignmentStatusEnum.ASSIGNED,
                            AssignmentStatusEnum.DRIVING,
                            AssignmentStatusEnum.PENDING
                        ])
                    )
                    .first()
                )
                if assignment and assignment.driver_id:
                    driver_id_str = str(assignment.driver_id)
                    assigned_driver = db.query(CarDriver).filter(CarDriver.id == assignment.driver_id).first()
                    if assigned_driver:
                        d_phone = d_phone or assigned_driver.primary_number
                        d_name = d_name or assigned_driver.full_name
        except Exception as e:
            logger.warning(f"Order enrichment error for SOS: {e}")

    alert = SosAlert(
        customer_id=customer_id_str,
        driver_id=driver_id_str,
        order_id=payload.order_id,
        triggered_by_role=role,
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

    # Real-time alert dispatch to on-duty staff
    try:
        from app.utils.notification_dispatch import broadcast_admin_emergency_push
        broadcast_admin_emergency_push(
            db,
            title="🚨 SOS EMERGENCY DISTRESS SIGNAL",
            body=f"SOS triggered by {role} for Trip #{payload.order_id or 'General'}. Immediate action required!",
            data={"type": "SOS_ALERT", "alert_id": str(alert.id), "role": role}
        )
    except Exception as e:
        logger.warning(f"Could not broadcast SOS push notification: {e}")

    logger.critical(
        f"🚨 SOS EMERGENCY TRIGGERED! Alert ID={alert.id}, Role={role}, User={user_id}, "
        f"Order={alert.order_id}, Lat={alert.latitude}, Lng={alert.longitude}"
    )

    return {
        "status": "ok",
        "alert_id": alert.id,
        "role": role,
        "message": "SOS Emergency Alert logged successfully. Operations team alerted.",
        "tracking_link": alert.tracking_link,
    }


# -------------------------------------------------------------------------
# Location Streaming during Active Emergency
# -------------------------------------------------------------------------
@router.post("/stream/{alert_id}")
def stream_sos_location(
    alert_id: int,
    payload: SosLocationStream,
    current_auth: Dict[str, Any] = Depends(get_current_user_flexible),
    db: Session = Depends(get_db)
):
    """Continuous 10-second location streaming. Only accepted from the alert creator."""
    alert = db.query(SosAlert).filter(SosAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="SOS Alert not found")

    # Authorize only the creator
    user_id = str(current_auth.get("user_id"))
    role = current_auth.get("role", "CUSTOMER").upper()

    is_creator = False
    if role == "CUSTOMER" and alert.customer_id == user_id:
        is_creator = True
    elif role in ("DRIVER", "VEHICLE_OWNER") and (alert.driver_id == user_id or str(alert.customer_id) == user_id):
        is_creator = True

    if not is_creator:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the alert creator can stream location.")

    if alert.status in ("RESOLVED", "FALSE_ALARM"):
        return {"status": "inactive", "message": "SOS alert is already resolved"}

    alert.latitude = payload.latitude
    alert.longitude = payload.longitude
    alert.updated_at = datetime.utcnow()
    db.commit()

    return {"status": "ok", "updated_at": alert.updated_at.isoformat()}


# -------------------------------------------------------------------------
# Admin Emergency Operations (Admin Token Required)
# -------------------------------------------------------------------------
@router.get("/active")
def get_active_sos_alerts(
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Admin-only: Check active emergency alerts for siren audio and top banner."""
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
    status_filter: Optional[str] = Query(None, description="Filter: ACTIVE, ACKNOWLEDGED, RESOLVED, FALSE_ALARM"),
    limit: int = Query(50, ge=1, le=200),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin-only: List SOS emergency alerts."""
    query = db.query(SosAlert)
    if status_filter:
        query = query.filter(SosAlert.status == status_filter.upper())
    alerts = query.order_by(SosAlert.created_at.desc()).limit(limit).all()
    return alerts


@router.post("/{alert_id}/acknowledge")
def acknowledge_sos_alert(
    alert_id: int,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Admin-only: Staff acknowledges an active emergency alert."""
    alert = db.query(SosAlert).filter(SosAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="SOS Alert not found")

    admin_name = getattr(current_admin, "full_name", None) or getattr(current_admin, "username", "Admin Staff")
    alert.status = "ACKNOWLEDGED"
    alert.acknowledged_by = admin_name
    alert.acknowledged_at = datetime.utcnow()
    alert.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(alert)
    return {"status": "ok", "message": "SOS Alert acknowledged", "acknowledged_by": admin_name}


@router.post("/{alert_id}/resolve")
def resolve_sos_alert(
    alert_id: int,
    payload: SosResolveRequest,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Admin-only: Staff resolves or marks false alarm on an emergency alert."""
    alert = db.query(SosAlert).filter(SosAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="SOS Alert not found")

    admin_name = getattr(current_admin, "full_name", None) or getattr(current_admin, "username", "Admin Staff")
    resolved_status = payload.status.upper()
    if resolved_status not in ("RESOLVED", "FALSE_ALARM"):
        resolved_status = "RESOLVED"

    alert.status = resolved_status
    alert.resolved_by = admin_name
    alert.resolved_at = datetime.utcnow()
    alert.resolution_notes = payload.resolution_notes
    alert.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(alert)
    return {
        "status": "ok",
        "message": f"SOS Alert marked as {resolved_status}",
        "resolved_by": admin_name,
        "status_code": resolved_status
    }
