# app/api/routes/savaari_routes.py
"""
REST API endpoints for the Admin App's Savaari Booking Monitor screen.
Allows viewing live bookings, configuring price/city filters, testing simulated alerts,
and updating acceptance status.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import datetime

from app.database.session import get_db
from app.core.security import get_current_admin
from app.models.savaari_booking import SavaariBooking
from app.models.savaari_alert_filter import SavaariAlertFilter
from app.utils.savaari_monitor import notify_all_admins_savaari_booking

router = APIRouter(prefix="/admin/savaari", tags=["Savaari Monitoring"])


# --- Schemas ---

class FilterCreateRequest(BaseModel):
    filter_name: str = Field(..., description="E.g. Chennai High Price")
    pickup_city: Optional[str] = None
    drop_city: Optional[str] = None
    car_type: Optional[str] = None
    trip_type: Optional[str] = None
    min_price: Optional[float] = None
    is_active: bool = True


class StatusUpdateRequest(BaseModel):
    acceptance_status: str = Field(..., description="'ACCEPTED' or 'MISSED'")


class SimulateBookingRequest(BaseModel):
    booking_id: Optional[str] = None
    pickup_city: str = "Chennai"
    drop_city: str = "Tiruvannamalai"
    car_type: str = "Etios"
    trip_type: str = "Oneway"
    price: float = 3800.0
    pickup_time_str: str = "Today 06:30 PM"
    savaari_url: Optional[str] = None


# --- Endpoints ---

@router.get("/bookings")
def get_savaari_bookings(
    search: Optional[str] = None,
    acceptance_status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    """
    Returns list of detected Savaari vendor bookings.
    Ordered by detected_at DESC.
    """
    query = db.query(SavaariBooking)

    if acceptance_status:
        if acceptance_status.upper() == "UNACTIONED":
            query = query.filter(SavaariBooking.acceptance_status.is_(None))
        else:
            query = query.filter(SavaariBooking.acceptance_status == acceptance_status.upper())

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (SavaariBooking.booking_id.ilike(s)) |
            (SavaariBooking.pickup_city.ilike(s)) |
            (SavaariBooking.drop_city.ilike(s)) |
            (SavaariBooking.car_type.ilike(s))
        )

    bookings = query.order_by(SavaariBooking.detected_at.desc()).limit(limit).all()

    return [
        {
            "id": str(b.id),
            "booking_id": b.booking_id,
            "pickup_city": b.pickup_city,
            "drop_city": b.drop_city,
            "car_type": b.car_type,
            "trip_type": b.trip_type,
            "price": b.price,
            "pickup_time_str": b.pickup_time_str,
            "savaari_url": b.savaari_url or f"https://vendor.savaari.com/bookings/{b.booking_id}",
            "is_notified": b.is_notified,
            "acceptance_status": b.acceptance_status,
            "detected_at": b.detected_at.isoformat() if b.detected_at else None,
        }
        for b in bookings
    ]


@router.patch("/bookings/{booking_id}/status")
def update_savaari_booking_status(
    booking_id: str,
    payload: StatusUpdateRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    """
    Updates acceptance_status (ACCEPTED or MISSED) for a booking.
    """
    row = db.query(SavaariBooking).filter(
        (SavaariBooking.booking_id == booking_id) | (SavaariBooking.id == booking_id)
    ).first()

    if not row:
        raise HTTPException(status_code=404, detail="Savaari booking not found")

    status_val = payload.acceptance_status.upper()
    if status_val not in ("ACCEPTED", "MISSED", "CLEAR"):
        raise HTTPException(status_code=400, detail="Status must be ACCEPTED, MISSED, or CLEAR")

    row.acceptance_status = None if status_val == "CLEAR" else status_val
    db.commit()

    return {"message": "Status updated successfully", "booking_id": row.booking_id, "acceptance_status": row.acceptance_status}


@router.get("/filters")
def get_savaari_filters(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    """
    Returns list of alert filters configured for Savaari bookings.
    """
    filters = db.query(SavaariAlertFilter).order_by(SavaariAlertFilter.created_at.desc()).all()
    return [
        {
            "id": str(f.id),
            "admin_id": str(f.admin_id),
            "filter_name": f.filter_name,
            "pickup_city": f.pickup_city,
            "drop_city": f.drop_city,
            "car_type": f.car_type,
            "trip_type": f.trip_type,
            "min_price": f.min_price,
            "is_active": f.is_active,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in filters
    ]


@router.post("/filters")
def create_savaari_filter(
    payload: FilterCreateRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    """
    Creates a new Savaari alert filter.
    """
    new_filter = SavaariAlertFilter(
        admin_id=current_admin.id,
        filter_name=payload.filter_name.strip(),
        pickup_city=payload.pickup_city.strip() if payload.pickup_city else None,
        drop_city=payload.drop_city.strip() if payload.drop_city else None,
        car_type=payload.car_type.strip() if payload.car_type else None,
        trip_type=payload.trip_type.strip() if payload.trip_type else None,
        min_price=payload.min_price,
        is_active=payload.is_active
    )
    db.add(new_filter)
    db.commit()
    db.refresh(new_filter)

    return {
        "id": str(new_filter.id),
        "filter_name": new_filter.filter_name,
        "message": "Filter created successfully"
    }


@router.delete("/filters/{filter_id}")
def delete_savaari_filter(
    filter_id: str,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    """
    Deletes an existing alert filter.
    """
    row = db.query(SavaariAlertFilter).filter(SavaariAlertFilter.id == filter_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Filter not found")

    db.delete(row)
    db.commit()
    return {"message": "Filter deleted successfully"}


@router.post("/simulate")
def simulate_savaari_booking(
    payload: SimulateBookingRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    """
    Simulates receiving a new high-priority Savaari booking.
    Fires real push notification with sound to test admin alerts instantly!
    """
    import random
    b_id = payload.booking_id or f"SAV-{random.randint(100000, 999999)}"

    existing = db.query(SavaariBooking).filter(SavaariBooking.booking_id == b_id).first()
    if existing:
        b_id = f"SAV-{random.randint(100000, 999999)}"

    url = payload.savaari_url or f"https://vendor.savaari.com/bookings/{b_id}"

    booking = SavaariBooking(
        booking_id=b_id,
        pickup_city=payload.pickup_city,
        drop_city=payload.drop_city,
        car_type=payload.car_type,
        trip_type=payload.trip_type,
        price=payload.price,
        pickup_time_str=payload.pickup_time_str,
        savaari_url=url,
        is_notified=False,
        raw_data={"simulated": True, "by_admin": str(current_admin.id)}
    )
    db.add(booking)
    db.flush()

    # Send push notification to all admins
    notified = notify_all_admins_savaari_booking(db, booking, "Simulation Test")
    booking.is_notified = notified
    db.commit()

    return {
        "status": "Simulated booking created & alert triggered",
        "booking_id": b_id,
        "notification_sent": notified,
        "savaari_url": url
    }


@router.get("/status")
def get_savaari_monitor_status(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    """
    Returns summary stats of the Savaari monitor system.
    """
    total_detected = db.query(SavaariBooking).count()
    accepted_count = db.query(SavaariBooking).filter(SavaariBooking.acceptance_status == "ACCEPTED").count()
    missed_count = db.query(SavaariBooking).filter(SavaariBooking.acceptance_status == "MISSED").count()
    unactioned_count = db.query(SavaariBooking).filter(SavaariBooking.acceptance_status.is_(None)).count()
    active_filters_count = db.query(SavaariAlertFilter).filter(SavaariAlertFilter.is_active == True).count()

    return {
        "total_detected": total_detected,
        "accepted": accepted_count,
        "missed": missed_count,
        "unactioned": unactioned_count,
        "active_filters": active_filters_count,
        "status": "Active (60s cycle)",
    }
