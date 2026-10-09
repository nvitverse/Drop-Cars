"""Admin App > Unaccepted Bookings Desk (see crud/unaccepted_desk.py for the rules).

  GET  /api/admin/unaccepted-desk                          open cases (+ executed-elsewhere ones still waiting for a follow-up / commission)
  POST /api/admin/unaccepted-desk/{order_id}/seen          an alarm was acknowledged -> the next one is scheduled at half of the time left
  POST /api/admin/unaccepted-desk/{order_id}/snooze        {minutes}
  POST /api/admin/unaccepted-desk/{order_id}/share         builds the group message (staff tap Send in WhatsApp)
  POST /api/admin/unaccepted-desk/{order_id}/executed-elsewhere   platform / who / driver / cab / commission - recorded by hand
  POST /api/admin/unaccepted-desk/{order_id}/commission    {received}
  POST /api/admin/unaccepted-desk/{order_id}/follow-up-done {outcome}
  POST /api/admin/unaccepted-desk/{order_id}/cancel        {reason, email_customer}  -> cancels and e-mails the customer in detail
  GET/PUT /api/admin/unaccepted-desk/config                the alarm numbers (Owner edits)"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.crud import unaccepted_desk as desk
from app.database.session import get_db

router = APIRouter(prefix="/admin/unaccepted-desk", tags=["Unaccepted Bookings Desk"])


def _who(admin) -> str:
    return getattr(admin, "username", None) or "Admin"


@router.get("")
def get_desk(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    return desk.desk(db)


class CfgIn(BaseModel):
    unaccepted_alarm_minutes_before: Optional[int] = Field(None, ge=15, le=1440)
    unaccepted_short_notice_hours: Optional[int] = Field(None, ge=1, le=24)
    unaccepted_short_notice_percent: Optional[int] = Field(None, ge=10, le=90)
    unaccepted_repeat_percent: Optional[int] = Field(None, ge=20, le=90)
    unaccepted_min_gap_minutes: Optional[int] = Field(None, ge=2, le=120)
    unaccepted_stop_minutes_before: Optional[int] = Field(None, ge=0, le=120)
    unaccepted_max_alarms: Optional[int] = Field(None, ge=1, le=30)
    unaccepted_snooze_options: Optional[str] = None
    unaccepted_follow_up_hours: Optional[int] = Field(None, ge=0, le=48)


@router.get("/config")
def get_config(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.crud.customer_booking_request import get_platform_setting_value as gv
    return {k: gv(db, k, d) for k, d in desk.DEFAULTS.items()}


@router.put("/config")
def put_config(body: CfgIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.api.routes.admin import require_owner
    from app.crud.customer_booking_request import set_platform_setting_value as sv
    require_owner(admin)
    for k, v in body.model_dump(exclude_none=True).items():
        if k == "unaccepted_snooze_options":
            opts = [x.strip() for x in str(v).split(",") if x.strip().isdigit() and 5 <= int(x.strip()) <= 240]
            if not opts:
                raise HTTPException(status_code=422, detail="Snooze times are minutes separated by commas, for example 15,30,60")
            v = ",".join(opts)
        sv(db, k, str(v))
    db.commit()
    return get_config(db, admin)


def _case(db: Session, order_id: int):
    from app.models.unaccepted_case import UnacceptedCase
    case = db.query(UnacceptedCase).filter(UnacceptedCase.order_id == order_id).first()
    if case is None:
        raise HTTPException(status_code=404, detail="No desk entry for this booking")
    return case


def _view(db: Session, order_id: int):
    from datetime import datetime, timezone
    o = desk._order(db, order_id)
    return desk.case_view(_case(db, order_id), o, datetime.now(timezone.utc), desk.get_cfg(db))


@router.post("/{order_id}/seen")
def seen(order_id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    desk.seen(db, order_id, _who(admin))
    return _view(db, order_id)


class SnoozeIn(BaseModel):
    minutes: int = Field(..., ge=5, le=240)


@router.post("/{order_id}/snooze")
def snooze(order_id: int, body: SnoozeIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    desk.snooze(db, order_id, body.minutes, _who(admin))
    return _view(db, order_id)


@router.post("/{order_id}/share")
def share(order_id: int, request: Request, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.api.routes.portal import _base
    out = desk.share(db, order_id, _who(admin), _base(request))
    return {**out, "case": _view(db, order_id)}


class ExecIn(BaseModel):
    platform: str = Field(..., min_length=1, max_length=120)      # where: another fleet's app, a vendor, another platform ...
    by: Optional[str] = Field(None, max_length=120)               # who: the fleet / vendor / platform contact
    driver_name: Optional[str] = Field(None, max_length=120)
    driver_phone: Optional[str] = Field(None, max_length=20)
    vehicle_number: Optional[str] = Field(None, max_length=20)
    note: Optional[str] = Field(None, max_length=600)
    commission_due: Optional[int] = Field(None, ge=0, le=500000)


@router.post("/{order_id}/executed-elsewhere")
def executed_elsewhere(order_id: int, body: ExecIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    desk.executed_elsewhere(db, order_id, _who(admin), body.platform, body.by or "", body.driver_name or "", body.driver_phone or "", body.vehicle_number or "",
                            body.note or "", body.commission_due)
    return _view(db, order_id)


class CommissionIn(BaseModel):
    received: bool


@router.post("/{order_id}/commission")
def commission(order_id: int, body: CommissionIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    desk.mark_commission(db, order_id, body.received, _who(admin))
    return _view(db, order_id)


class FollowIn(BaseModel):
    outcome: Optional[str] = Field("", max_length=300)


@router.post("/{order_id}/follow-up-done")
def follow_up_done(order_id: int, body: FollowIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    desk.close_follow_up(db, order_id, body.outcome or "", _who(admin))
    return _view(db, order_id)


class CancelIn(BaseModel):
    reason: str = Field("", max_length=300)
    email_customer: bool = True


@router.post("/{order_id}/cancel")
def cancel(order_id: int, body: CancelIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.api.routes.admin import require_payment_release_permission
    require_payment_release_permission(admin)          # cancelling can refund money, so the same permission as the Cancel button on a booking
    out = desk.cancel(db, order_id, body.reason, _who(admin), body.email_customer)
    return {"email": out["email"], "case": _view(db, order_id)}
