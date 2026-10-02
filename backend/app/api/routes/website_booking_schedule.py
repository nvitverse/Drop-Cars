"""Admin App > Website Approvals: choose WHEN a pending website booking posts, hold several at once, and customize the driver fare.

  PUT  /admin/website-bookings/{id}/schedule     {post_at}  (null = back to the rule's own time)
  POST /admin/website-bookings/bulk-hold         {ids}      pause until pickup - 2 hrs; the normal rule posts it then and the alarm rings
  POST /admin/website-bookings/bulk-release      {ids}
  PUT  /admin/website-bookings/{id}/customize    the driver | extra numbers it will be posted with (or {reset: true})
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.database.session import get_db
from app.models.customer_booking_request import CustomerBookingRequest

router = APIRouter(prefix="/admin/website-bookings", tags=["Website Approvals"])


def _load(db: Session, id: UUID) -> CustomerBookingRequest:
    r = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Booking request not found")
    return r


def _log(db, admin, action: str, r, details: dict) -> None:
    try:
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(db, admin_id=admin.id, admin_username=admin.username, admin_role=getattr(admin, "role", None), action=action,
                         target_type="customer_booking_request", target_id=str(r.id), target_name=r.customer_name, details=details)
    except Exception:  # noqa: BLE001
        db.rollback()


class ScheduleBody(BaseModel):
    post_at: Optional[datetime] = None


@router.put("/{id}/schedule")
def set_schedule(id: UUID, body: ScheduleBody, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    from app.crud.website_post_rules import set_post_time
    r = _load(db, id)
    at = set_post_time(db, r, body.post_at)
    _log(db, current_admin, "WEBSITE_BOOKING_RESCHEDULED", r, {"post_at": at.isoformat() if at else None})
    return {"id": str(id), "post_at_override": at}


class IdsBody(BaseModel):
    ids: List[UUID] = Field(..., min_length=1, max_length=200)


@router.post("/bulk-hold")
def bulk_hold(body: IdsBody, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    from app.crud.website_post_rules import hold_to_last_window, get_rules
    rules = get_rules(db)
    held, failed = [], []
    for id in dict.fromkeys(body.ids):
        try:
            r = _load(db, id)
            until = hold_to_last_window(db, r, rules)
            held.append({"id": str(id), "hold_until": until})
            _log(db, current_admin, "WEBSITE_BOOKING_HELD", r, {"hold_until": until.isoformat()})
        except HTTPException as e:
            db.rollback()
            failed.append({"id": str(id), "reason": e.detail})
    return {"held": held, "failed": failed}


@router.post("/bulk-release")
def bulk_release(body: IdsBody, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    released = []
    for id in dict.fromkeys(body.ids):
        r = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == id, CustomerBookingRequest.status == "PENDING").first()
        if r is not None:
            r.hold_until = None
            released.append(str(id))
    db.commit()
    return {"released": released}


class CustomizeBody(BaseModel):
    reset: bool = False
    cost_per_km: Optional[int] = Field(None, ge=0, le=500)            # what the DRIVER gets per km
    extra_cost_per_km: Optional[int] = Field(None, ge=0, le=500)      # extra per km (vendor extra)
    driver_allowance: Optional[int] = Field(None, ge=0, le=20000)
    extra_driver_allowance: Optional[int] = Field(None, ge=0, le=20000)
    permit_charges: Optional[int] = Field(None, ge=0, le=50000)
    extra_permit_charges: Optional[int] = Field(None, ge=0, le=50000)
    toll_charges: Optional[int] = Field(None, ge=0, le=50000)
    hill_charges: Optional[int] = Field(None, ge=0, le=50000)
    night_charges: Optional[int] = Field(None, ge=0, le=50000)


_FIELDS = ("cost_per_km", "extra_cost_per_km", "driver_allowance", "extra_driver_allowance", "permit_charges", "extra_permit_charges",
           "toll_charges", "hill_charges", "night_charges")


@router.put("/{id}/customize")
def customize(id: UUID, body: CustomizeBody, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    from app.crud.customer_booking_request import complete_admin_fare, posted_fare_split
    r = _load(db, id)
    if r.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only a pending booking can be customized")
    # start from what would be posted now, so a field the staff did not touch keeps its current value
    current = posted_fare_split(db, r)
    r.admin_total_amount = None
    r.admin_driver_amount = None
    if body.reset:
        for f in _FIELDS:
            setattr(r, f"admin_{f}", None)
        r.custom_driver_fare = False
    else:
        values = {**{k: current.get(k) for k in ("cost_per_km", "extra_cost_per_km", "driver_allowance", "extra_driver_allowance",
                                                  "permit_charges", "extra_permit_charges")},
                  "toll_charges": r.admin_toll_charges if r.admin_toll_charges is not None else r.quoted_toll_charges,
                  "hill_charges": r.admin_hill_charges if r.admin_hill_charges is not None else r.quoted_hill_charges,
                  "night_charges": r.admin_night_charges if r.admin_night_charges is not None else r.quoted_night_charges}
        for f in _FIELDS:
            v = getattr(body, f)
            setattr(r, f"admin_{f}", int(v if v is not None else (values.get(f) or 0)))
        r.custom_driver_fare = True
    complete_admin_fare(r)            # moves the customer total / driver amount by exactly what changed
    db.commit()
    _log(db, current_admin, "WEBSITE_BOOKING_CUSTOMIZED", r, body.model_dump(exclude_none=True))
    return {"id": str(id), "custom_driver_fare": r.custom_driver_fare, "customer_total": r.admin_total_amount if r.admin_total_amount is not None else r.quoted_total_amount,
            "post_preview": posted_fare_split(db, r)}
