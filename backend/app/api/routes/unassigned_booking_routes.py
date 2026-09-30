from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional

from app.database.session import get_db
from app.core.security import get_current_admin
from app.models.platform_setting import PlatformSetting
from app.utils.unassigned_booking_expiry import (
    auto_remove_unassigned_bookings,
    get_unassigned_removal_timeout
)

router = APIRouter(tags=["Unassigned Booking Auto-Removal"])


@router.post("/admin/auto-remove-unassigned")
def trigger_unassigned_auto_removal(
    timeout_minutes: Optional[int] = Query(None, description="Optional override timeout in minutes"),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Triggers 30-Minute Unassigned Booking Auto-Removal Engine."""
    result = auto_remove_unassigned_bookings(db, custom_timeout_mins=timeout_minutes)
    return result


@router.get("/admin/settings/unassigned-timeout")
def get_unassigned_timeout_setting(current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """Fetch current Admin Unassigned Booking Removal Timeout (Default: 30 Mins)."""
    timeout_mins = get_unassigned_removal_timeout(db)
    return {"unassigned_removal_timeout_minutes": timeout_mins}


@router.post("/admin/settings/unassigned-timeout")
def update_unassigned_timeout_setting(
    payload: Dict[str, Any] = Body(...),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Update Admin Unassigned Booking Removal Timeout (e.g., 30, 45, 60 mins)."""
    timeout_mins = payload.get("unassigned_removal_timeout_minutes")
    if not timeout_mins or not isinstance(timeout_mins, int) or timeout_mins < 5:
        raise HTTPException(status_code=400, detail="unassigned_removal_timeout_minutes must be an integer >= 5")

    setting = db.query(PlatformSetting).filter(
        PlatformSetting.key == "UNASSIGNED_BOOKING_REMOVAL_TIMEOUT_MINUTES"
    ).first()

    if not setting:
        setting = PlatformSetting(
            key="UNASSIGNED_BOOKING_REMOVAL_TIMEOUT_MINUTES",
            value=str(timeout_mins),
            description="Timeout in minutes after which unassigned bookings are auto-removed"
        )
        db.add(setting)
    else:
        setting.value = str(timeout_mins)

    db.commit()
    return {
        "success": True,
        "message": f"Unassigned booking removal timeout set to {timeout_mins} minutes.",
        "unassigned_removal_timeout_minutes": timeout_mins
    }


@router.put("/orders/{order_id}/bump-fare")
def bump_order_driver_fare(
    order_id: str,
    payload: Dict[str, Any] = Body(...),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Manual Peak / Festival Demand Fare Adjustment:
    Allows Vendor or Admin to increase/adjust driver_fare for pending unassigned bookings.
    """
    from app.models.orders import Order, Trip_status

    new_driver_fare = payload.get("new_driver_fare")
    reason = payload.get("reason", "Peak / Festival demand fare bump")

    if new_driver_fare is None or not isinstance(new_driver_fare, (int, float)) or new_driver_fare <= 0:
        raise HTTPException(status_code=400, detail="new_driver_fare must be a positive number")

    order = None
    try:
        order_int_id = int(order_id)
        order = db.query(Order).filter(Order.id == order_int_id).first()
    except ValueError:
        pass

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.trip_status not in (Trip_status.PENDING,):
        raise HTTPException(status_code=400, detail=f"Fare can only be adjusted on pending orders. Current status: {order.trip_status}")

    # Order has no driver_fare column and crud.orders.edit_order recomputes
    # the fare from the per-km / allowance fields, so a single "new fare"
    # number cannot be applied honestly. This used to set a non-existent
    # attribute and report success while nothing was saved. No app calls
    # this route; fare changes go through PATCH /admin/orders/{id}/edit-fare.
    raise HTTPException(
        status_code=410,
        detail="Fare bump is not supported here. Use PATCH /api/admin/orders/{order_id}/edit-fare to change the booking's rate fields.",
    )
