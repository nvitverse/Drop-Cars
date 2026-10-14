"""Routes for crud/trip_exceptions.py: what needs a person (Admin App), no-show requests (driver) and confirmations (admin, vendor)."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_admin, get_current_driver, get_current_vendor
from app.crud import trip_exceptions as tx
from app.crud.admin_activity_log import log_admin_action
from app.database.session import get_db

router = APIRouter()


class NoShowRequestIn(BaseModel):
    reason: str = Field(..., min_length=3, max_length=400)


class NoShowConfirmIn(BaseModel):
    note: Optional[str] = Field(None, max_length=400)


def _log(db, admin, action: str, order_id: int, details: dict) -> None:
    try:
        log_admin_action(db, admin_id=str(admin.id), admin_username=admin.username, admin_role=admin.role, action=action,
                         target_type="order", target_id=str(order_id), target_name=f"Booking #{order_id}", details=details)
    except Exception:       # noqa: BLE001 - the audit log never blocks the action
        pass


# ---- Admin App ---------------------------------------------------------------------------------------------------
@router.get("/admin/attention/trips")
def trips_needing_a_decision(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """Trips not started after pickup, drivers' no-show requests, and reposted bookings waiting for approval."""
    return tx.attention_list(db)


@router.post("/admin/orders/{order_id}/no-show")
async def admin_confirm_no_show(order_id: int, body: NoShowConfirmIn = NoShowConfirmIn(), db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.api.routes.admin import require_payment_release_permission      # money moves back to the driver: same permission as a refund
    require_payment_release_permission(admin)
    try:
        out = await tx.mark_no_show(db, order_id, by=f"Admin {admin.username}", note=body.note)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _log(db, admin, "ORDER_NO_SHOW", order_id, {"note": body.note, "refunded": out.get("refunded")})
    return out


@router.post("/admin/orders/{order_id}/repost-approve")
def admin_approve_repost(order_id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    try:
        out = tx.approve_repost(db, order_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _log(db, admin, "ORDER_REPOST_APPROVED", order_id, {})
    return out


@router.post("/admin/orders/{order_id}/repost-cancel")
def admin_cancel_repost(order_id: int, body: NoShowConfirmIn = NoShowConfirmIn(), db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """The office decides this booking is not worth sending out again: cancel it (nobody holds money on it any more)."""
    from app.api.routes.admin import require_payment_release_permission
    from app.crud.order_assignments import cancel_order_by_admin
    require_payment_release_permission(admin)
    try:
        out = cancel_order_by_admin(db, order_id, (body.note or "Not reposted after the driver was penalised").strip())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _log(db, admin, "ORDER_REPOST_CANCELLED", order_id, {"note": body.note})
    return out


# ---- Driver App --------------------------------------------------------------------------------------------------
@router.post("/orders/driver/{order_id}/no-show-request")
async def driver_request_no_show(order_id: int, body: NoShowRequestIn, db: Session = Depends(get_db), driver=Depends(get_current_driver)):
    """"The customer cancelled / is not there." Recorded and sent to the office and the poster - they confirm, the driver cannot."""
    try:
        return await tx.request_no_show(db, order_id, str(driver.id), body.reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---- Vendor App --------------------------------------------------------------------------------------------------
@router.post("/orders/vendor/{order_id}/no-show")
async def vendor_confirm_no_show(order_id: int, body: NoShowConfirmIn = NoShowConfirmIn(), db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    """The vendor who posted the booking confirms the customer did not show up (only their own bookings)."""
    from app.models.vendor_details import VendorDetails
    vd = db.query(VendorDetails).filter(VendorDetails.vendor_id == vendor.id).first()
    label = (vd.business_name or vd.full_name) if vd else "the vendor"
    try:
        return await tx.mark_no_show(db, order_id, by=f"vendor {label}", vendor_id=str(vendor.id), note=body.note)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---- Admin App: correct the km of a completed trip --------------------------------------------------------------
class CorrectKmIn(BaseModel):
    end_km: int = Field(..., ge=0, description="The right odometer reading at the end of the trip")
    reason: str = Field(..., min_length=3, max_length=400)
    adjust_wallet: bool = Field(True, description="True = post the commission difference to the wallets; False = correct the record only")
    preview: bool = Field(False, description="True = only show what would change")


@router.post("/admin/orders/{order_id}/correct-km")
async def admin_correct_trip_km(order_id: int, body: CorrectKmIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.api.routes.admin import require_payment_release_permission
    from app.crud.km_correction import correct_trip_km
    require_payment_release_permission(admin)
    try:
        out = await correct_trip_km(db, order_id, body.end_km, body.reason, adjust_wallet=body.adjust_wallet, by=f"Admin {admin.username}", apply=not body.preview)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if out.get("applied"):
        _log(db, admin, "TRIP_KM_CORRECTED", order_id, {"end_km": body.end_km, "reason": body.reason, "wallet_adjusted": out.get("wallet_adjusted"),
                                                         "driver_wallet_change": out.get("driver_wallet_change")})
    return out


@router.post("/admin/orders/{order_id}/no-show-dismiss")
async def admin_dismiss_no_show(order_id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    try:
        out = await tx.dismiss_no_show(db, order_id, by=f"Admin {admin.username}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _log(db, admin, "ORDER_NO_SHOW_DISMISSED", order_id, {})
    return out
