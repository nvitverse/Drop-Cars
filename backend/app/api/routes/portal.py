"""Web execution portal (see models/portal_trip.py and crud/portal_trips.py).

Public (the link's token is the credential):
  GET  /p/{token}                       the mobile page for the executor        GET /p/{token}/feedback   the customer's rating page (QR)
  GET  /api/portal/{token}              what the page may show (never the OTPs; the customer's number only once it is open)
  POST /api/portal/{token}/take | pay | start | end | location | feedback
Admin App:
  GET/POST /api/admin/portal/{order_id}                    make / read the link, the group message, the customer message, events
  POST     /api/admin/portal/{order_id}/confirm-payment    {received}   staff saw the commission money"""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.crud import portal_trips as pt_crud
from app.database.session import get_db
from app.utils import portal_page

router = APIRouter(tags=["Web execution portal"])


def _base(request: Request) -> str:
    base = str(request.base_url).rstrip("/")
    if base.startswith("http://") and "localhost" not in base and "127.0.0.1" not in base:
        base = "https://" + base[len("http://"):]
    return base


def _who(admin) -> str:
    return getattr(admin, "username", None) or "Admin"


@router.get("/p/{token}", response_class=HTMLResponse)
def page(token: str):
    return HTMLResponse(portal_page.render("trip", token), headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})


@router.get("/p/{token}/feedback", response_class=HTMLResponse)
def feedback_page(token: str):
    return HTMLResponse(portal_page.render("feedback", token), headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})


@router.get("/api/portal/{token}")
def get_trip(token: str, request: Request, db: Session = Depends(get_db)):
    return pt_crud.view(db, pt_crud.by_token(db, token), _base(request))


class TakeIn(BaseModel):
    name: str = Field(..., max_length=80)
    phone: str = Field(..., max_length=20)
    vehicle_number: str = Field(..., max_length=20)
    vehicle_model: Optional[str] = Field("", max_length=60)


@router.post("/api/portal/{token}/take")
def take(token: str, body: TakeIn, db: Session = Depends(get_db)):
    pt = pt_crud.take(db, pt_crud.by_token(db, token), body.name, body.phone, body.vehicle_number, body.vehicle_model or "")
    pt_crud.notify_admins(db, "\U0001F517 Web link: booking taken", f"#{pt.order_id} taken by {pt.exec_name} ({pt.exec_vehicle_number}). Commission Rs {pt.commission_due}.")
    return {"ok": True}


class PayIn(BaseModel):
    utr: str = Field(..., max_length=40)


@router.post("/api/portal/{token}/pay")
def pay(token: str, body: PayIn, db: Session = Depends(get_db)):
    pt = pt_crud.report_payment(db, pt_crud.by_token(db, token), body.utr)
    pt_crud.notify_admins(db, "\U0001F4B8 Web link: commission paid?", f"#{pt.order_id} {pt.exec_name} reports UTR {pt.commission_utr} for Rs {pt.commission_due}. Please confirm.")
    return {"ok": True}


def _save_photo(photo: Optional[UploadFile], order_id: int, step: str) -> Optional[str]:
    if photo is None or not getattr(photo, "filename", None):
        return None
    if not (photo.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a photo (image file)")
    try:
        from app.utils.gcs import upload_image_to_gcs
        return upload_image_to_gcs(photo, f"portal_trips/{order_id}/{step}")
    except Exception:        # noqa: BLE001  the trip must not be blocked by a storage hiccup; staff see "no photo"
        return None


@router.post("/api/portal/{token}/start")
def start(token: str, otp: str = Form(...), km: int = Form(...), photo: Optional[UploadFile] = File(None), db: Session = Depends(get_db)):
    pt = pt_crud.by_token(db, token)
    url = _save_photo(photo, pt.order_id, "start") if pt.status == "TAKEN" else None
    pt = pt_crud.start_trip(db, pt, otp, km, url)
    pt_crud.notify_admins(db, "▶️ Web link: trip started", f"#{pt.order_id} started at {pt.start_km} km by {pt.exec_name}")
    return {"ok": True, "photo_saved": bool(url)}


@router.post("/api/portal/{token}/end")
def end(token: str, otp: str = Form(...), km: int = Form(...), photo: Optional[UploadFile] = File(None), db: Session = Depends(get_db)):
    pt = pt_crud.by_token(db, token)
    url = _save_photo(photo, pt.order_id, "end") if pt.status == "STARTED" else None
    pt = pt_crud.end_trip(db, pt, otp, km, url)
    pt_crud.notify_admins(db, "✅ Web link: trip ended", f"#{pt.order_id} ended at {pt.end_km} km ({(pt.end_km or 0) - (pt.start_km or 0)} km) by {pt.exec_name}")
    return {"ok": True, "photo_saved": bool(url)}


class LocIn(BaseModel):
    lat: float
    lng: float


@router.post("/api/portal/{token}/location")
def location(token: str, body: LocIn, db: Session = Depends(get_db)):
    pt_crud.ping_location(db, pt_crud.by_token(db, token), body.lat, body.lng)
    return {"ok": True}


class FeedbackIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    text: Optional[str] = Field("", max_length=600)


@router.post("/api/portal/{token}/feedback")
def feedback(token: str, body: FeedbackIn, db: Session = Depends(get_db)):
    pt = pt_crud.give_feedback(db, pt_crud.by_token(db, token), body.rating, body.text or "")
    if pt.rating is not None and pt.rating <= 2:
        pt_crud.notify_admins(db, "⚠️ Low rating on a web-link trip", f"#{pt.order_id} got {pt.rating} star(s): {(pt.feedback or '')[:100]}")
    return {"ok": True}


# ---------------------------------------------------------------- Admin App
@router.get("/api/admin/portal/{order_id}")
def admin_get(order_id: int, request: Request, create: bool = False, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.models.portal_trip import PortalTrip
    pt = db.query(PortalTrip).filter(PortalTrip.order_id == order_id, PortalTrip.status != "CANCELLED").order_by(PortalTrip.created_at.desc()).first()
    if pt is None:
        if not create:
            return {"exists": False}
        pt = pt_crud.create_link(db, order_id, _who(admin))
    base = _base(request)
    out = {"exists": True, **pt_crud.admin_view(db, pt, base)}
    out["customer_message"] = pt_crud.customer_message(db, pt, base)
    return out


@router.post("/api/admin/portal/{order_id}")
def admin_create(order_id: int, request: Request, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    pt = pt_crud.create_link(db, order_id, _who(admin))
    base = _base(request)
    out = {"exists": True, **pt_crud.admin_view(db, pt, base)}
    out["customer_message"] = pt_crud.customer_message(db, pt, base)
    return out


class ConfirmIn(BaseModel):
    received: bool = True


@router.post("/api/admin/portal/{order_id}/confirm-payment")
def admin_confirm(order_id: int, body: ConfirmIn, request: Request, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    pt = pt_crud.confirm_payment(db, order_id, _who(admin), body.received)
    return {"exists": True, **pt_crud.admin_view(db, pt, _base(request))}
