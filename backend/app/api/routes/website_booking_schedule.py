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


def _apply_fare(db: Session, r: CustomerBookingRequest, body) -> None:
    """The driver | extra numbers a pending website booking will be posted with (unchanged logic of PUT /customize)."""
    from app.crud.customer_booking_request import complete_admin_fare, posted_fare_split
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


@router.put("/{id}/customize")
def customize(id: UUID, body: CustomizeBody, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    from app.crud.customer_booking_request import posted_fare_split
    r = _load(db, id)
    if r.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only a pending booking can be customized")
    _apply_fare(db, r, body)
    db.commit()
    _log(db, current_admin, "WEBSITE_BOOKING_CUSTOMIZED", r, body.model_dump(exclude_none=True))
    return {"id": str(id), "custom_driver_fare": r.custom_driver_fare, "customer_total": r.admin_total_amount if r.admin_total_amount is not None else r.quoted_total_amount,
            "post_preview": posted_fare_split(db, r)}


_TRIP_TYPES = {"oneway": "Oneway", "one way": "Oneway", "round trip": "Round Trip", "roundtrip": "Round Trip", "multy city": "Multy City", "multi city": "Multy City",
               "multicity": "Multy City", "hourly rental": "Hourly Rental", "hourly": "Hourly Rental"}


class CustomizeFullBody(CustomizeBody):
    """Everything staff may change on a booking that has not been posted yet. A field left out keeps its value. The booking id, the status and the
    posting rules are untouched - this only edits the request's own details and the same fare fields as /customize."""
    customer_name: Optional[str] = Field(None, max_length=120)
    customer_number: Optional[str] = Field(None, max_length=20)
    pickup: Optional[str] = Field(None, max_length=300)
    drop: Optional[str] = Field(None, max_length=300)
    start_date_time: Optional[datetime] = None
    trip_type: Optional[str] = None
    car_type: Optional[str] = None
    trip_distance: Optional[int] = Field(None, ge=0, le=5000)
    customer_total: Optional[int] = Field(None, ge=0, le=500000)     # what the customer pays, when it must be fixed by hand
    advance_amount: Optional[int] = Field(None, ge=0, le=500000)


def _set_route(r: CustomerBookingRequest, pickup: Optional[str], drop: Optional[str]) -> None:
    loc = r.pickup_drop_location
    put = lambda cur, v: ({**cur, "address": v} if isinstance(cur, dict) else v)    # noqa: E731
    if isinstance(loc, dict) and ("pickup" in loc or "drop" in loc):
        new = dict(loc)
        if pickup:
            new["pickup"] = put(loc.get("pickup"), pickup)
        if drop:
            new["drop"] = put(loc.get("drop"), drop)
    else:
        loc = dict(loc) if isinstance(loc, dict) else {}
        keys = sorted(loc.keys(), key=lambda k: int(k) if str(k).isdigit() else 0)
        new = dict(loc)
        if not keys:
            new = {"0": pickup or "", "1": drop or ""}
        else:
            if pickup:
                new[keys[0]] = put(loc[keys[0]], pickup)
            if drop:
                last = keys[-1] if len(keys) > 1 else str(int(keys[0]) + 1 if str(keys[0]).isdigit() else 1)
                new[last] = put(loc.get(last), drop)
    r.pickup_drop_location = new


@router.put("/{id}/customize-full")
def customize_full(id: UUID, body: CustomizeFullBody, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    from app.crud.customer_booking_request import posted_fare_split
    from app.models.car_details import CarTypeEnum
    r = _load(db, id)
    if r.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only a pending booking can be customized")
    if body.customer_name is not None and body.customer_name.strip():
        r.customer_name = body.customer_name.strip()
    if body.customer_number is not None and body.customer_number.strip():
        r.customer_number = body.customer_number.strip()
    if body.pickup or body.drop:
        _set_route(r, (body.pickup or "").strip() or None, (body.drop or "").strip() or None)
    if body.start_date_time is not None:
        r.start_date_time = body.start_date_time
    if body.trip_type:
        tt = _TRIP_TYPES.get(body.trip_type.strip().lower())
        if tt is None:
            raise HTTPException(status_code=422, detail="Choose Oneway, Round Trip, Multy City or Hourly Rental")
        r.trip_type = tt
    if body.car_type:
        try:
            r.car_type = CarTypeEnum(body.car_type.strip().upper()).value
        except ValueError:
            raise HTTPException(status_code=422, detail="That vehicle type does not exist")
    if body.trip_distance is not None:
        r.quoted_trip_distance = int(body.trip_distance)
    if body.advance_amount is not None:
        r.advance_amount = int(body.advance_amount)
    if body.reset or any(getattr(body, f) is not None for f in _FIELDS):
        _apply_fare(db, r, body)                                  # only a real fare change freezes the driver numbers; a new time / address does not
    if body.customer_total is not None:
        r.admin_total_amount = int(body.customer_total)          # fixed by hand: complete_admin_fare leaves a set total alone
    db.commit()
    _log(db, current_admin, "WEBSITE_BOOKING_CUSTOMIZED_FULL", r, body.model_dump(exclude_none=True, mode="json"))
    return {"id": str(id), "custom_driver_fare": r.custom_driver_fare, "customer_total": r.admin_total_amount if r.admin_total_amount is not None else r.quoted_total_amount,
            "post_preview": posted_fare_split(db, r)}
