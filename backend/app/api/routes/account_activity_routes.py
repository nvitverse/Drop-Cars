"""Active / Inactive + Verified for cars, drivers, partners and vendors, and the owner's "things to fix" list.

  Admin App   PATCH /api/admin/accounts/{kind}/{id}/active     switch an account off (with a reason) or back on
              GET   /api/admin/accounts/{kind}/{id}/activity   Active / Inactive + reasons + Verified
  Driver App  GET   /api/users/vehicle-owner/activity          every car and driver of this owner with the same tags
              GET   /api/users/vehicle-owner/document-todos    missing dates, rejected documents (with the reason) and expired
                                                               documents, so the app can ask for them in a popup
Rules live in crud/account_activity.py."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_admin, get_current_vehicleOwner_id
from app.crud import account_activity as act
from app.crud.admin_activity_log import log_admin_action
from app.crud.car_details import get_all_cars
from app.crud.car_driver import get_drivers_by_vehicleOwner_id
from app.crud.document_notes import get_notes
from app.crud.verification import fc_status_for_car
from app.database.session import get_db
from app.models.common_enums import DocumentStatusEnum

admin_router = APIRouter(prefix="/admin/accounts", tags=["Active / Inactive"])
owner_router = APIRouter(tags=["Active / Inactive"])


class ActiveBody(BaseModel):
    active: bool
    reason: Optional[str] = None


def _load(db, kind, entity_id):
    import uuid
    try:
        eid = uuid.UUID(str(entity_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    if kind == "car":
        from app.models.car_details import CarDetails as M
        return db.query(M).filter(M.id == eid).first()
    if kind == "driver":
        from app.models.car_driver import CarDriver as M
        return db.query(M).filter(M.id == eid).first()
    if kind == "partner":
        from app.models.vehicle_owner_details import VehicleOwnerDetails as M
        return db.query(M).filter(M.vehicle_owner_id == eid).first()
    if kind == "vendor":
        from app.models.vendor_details import VendorDetails as M
        return db.query(M).filter(M.vendor_id == eid).first()
    raise HTTPException(status_code=400, detail="kind must be car, driver, partner or vendor")


def _activity(kind, row) -> dict:
    if kind == "car":
        return act.car_activity(row)
    if kind == "driver":
        return act.driver_activity(row)
    return act.partner_activity(row)


@admin_router.get("/{kind}/{entity_id}/activity")
def get_activity(kind: str, entity_id: str, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    row = _load(db, kind, entity_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"{kind} not found")
    return {"kind": kind, "id": entity_id, **_activity(kind, row),
            "manual_inactive_reason": getattr(row, "manual_inactive_reason", None)}


@admin_router.patch("/{kind}/{entity_id}/active")
def set_active(kind: str, entity_id: str, body: ActiveBody, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    row = act.set_manual_active(db, kind, entity_id, body.active, body.reason)
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=getattr(current_admin, "username", "Admin"),
        admin_role=getattr(current_admin, "role", None), action="ACCOUNT_SET_ACTIVE" if body.active else "ACCOUNT_SET_INACTIVE",
        target_type=kind, target_id=str(entity_id), target_name=getattr(row, "car_name", None) or getattr(row, "full_name", None),
        details={"active": body.active, "reason": (body.reason or "").strip() or None},
    )
    db.commit()
    return {"kind": kind, "id": entity_id, **_activity(kind, row), "manual_inactive_reason": row.manual_inactive_reason}


@owner_router.get("/vehicle-owner/activity")
def my_activity(db: Session = Depends(get_db), vehicle_owner_id: str = Depends(get_current_vehicleOwner_id)):
    cars = [{"id": str(c.id), "name": c.car_name, "number": c.car_number, **act.car_activity(c)} for c in get_all_cars(db, str(vehicle_owner_id))]
    drivers = [{"id": str(d.id), "name": d.full_name, **act.driver_activity(d)} for d in get_drivers_by_vehicleOwner_id(db, str(vehicle_owner_id))]
    return {"cars": cars, "drivers": drivers}


def _item(kind, entity_id, entity_name, document, problem, action, severity="warn"):
    return {"kind": kind, "entity_id": str(entity_id), "entity_name": entity_name, "document": document,
            "problem": problem, "action": action, "severity": severity}


@owner_router.get("/vehicle-owner/document-todos")
def my_document_todos(db: Session = Depends(get_db), vehicle_owner_id: str = Depends(get_current_vehicleOwner_id)):
    """Everything the owner still has to do about documents, in plain words (the app shows it in a popup at start):
      - a date that was never entered           -> "enter the expiry / registration date"
      - a document marked INVALID               -> why, and "upload the ORIGINAL again"
      - an expired document                     -> "upload the renewed document and its new date"
      - a driver without the police verification certificate -> "upload it" (needed for the Verified badge)"""
    from datetime import date
    today = date.today()
    items = []
    for c in get_all_cars(db, str(vehicle_owner_id)):
        name = f"{c.car_name} ({c.car_number})"
        notes = get_notes(c)
        if c.rc_front_img_url and c.registration_date is None:
            items.append(_item("car", c.id, name, "RC", "Registration date is not entered", "Open the RC and enter the registration date printed on it"))
        fc_needed = fc_status_for_car(c, today)["required"]
        for label, img, exp, key in (("Insurance", c.insurance_img_url, c.insurance_expiry_date, "insurance"),
                                     ("Permit", c.permit_img_url, c.permit_expiry_date, "permit"),
                                     ("FC", c.fc_img_url if fc_needed else None, c.fc_expiry_date, "fc")):
            if img and exp is None:
                items.append(_item("car", c.id, name, label, "Expiry date is not entered", f"Enter the expiry date printed on the {label}"))
            elif img and exp < today:
                items.append(_item("car", c.id, name, label, f"Expired on {exp.strftime('%d %b %Y')}", f"Upload the renewed {label} and its new expiry date", "bad"))
        for label, key, st in (("RC front", "rc_front", c.rc_front_status), ("RC back", "rc_back", c.rc_back_status),
                               ("Insurance", "insurance", c.insurance_status), ("Permit", "permit", c.permit_status),
                               ("FC", "fc", c.fc_status if fc_needed else None)):
            if st == DocumentStatusEnum.INVALID:
                items.append(_item("car", c.id, name, label, notes.get(key) or "Not accepted", f"Upload the ORIGINAL {label} again", "bad"))
        if getattr(c, "manual_inactive_reason", None) or getattr(c, "auto_inactive_reason", None):
            items.append(_item("car", c.id, name, "Car", c.manual_inactive_reason or c.auto_inactive_reason, "Contact Drop Cars support", "bad"))
    for d in get_drivers_by_vehicleOwner_id(db, str(vehicle_owner_id)):
        notes = get_notes(d)
        if d.licence_front_img and d.licence_expiry_date is None:
            items.append(_item("driver", d.id, d.full_name, "Driving licence", "Expiry date is not entered", "Enter the validity date printed on the licence"))
        elif d.licence_front_img and d.licence_expiry_date < today:
            items.append(_item("driver", d.id, d.full_name, "Driving licence", f"Expired on {d.licence_expiry_date.strftime('%d %b %Y')}", "Upload the renewed licence and its new date", "bad"))
        for label, key, st in (("Licence front", "licence", d.licence_front_status), ("Licence back", "licence_back", d.licence_back_status)):
            if st == DocumentStatusEnum.INVALID:
                items.append(_item("driver", d.id, d.full_name, label, notes.get(key) or "Not accepted", f"Upload the ORIGINAL {label.lower()} again", "bad"))
        if not d.police_verification_img:
            items.append(_item("driver", d.id, d.full_name, "Police verification certificate", "Not uploaded", "Upload it to get the Verified badge"))
        elif d.police_verification_status == DocumentStatusEnum.INVALID:
            items.append(_item("driver", d.id, d.full_name, "Police verification certificate", notes.get("police") or "Not accepted", "Upload the ORIGINAL certificate again", "bad"))
        if getattr(d, "manual_inactive_reason", None) or getattr(d, "auto_inactive_reason", None):
            items.append(_item("driver", d.id, d.full_name, "Driver", d.manual_inactive_reason or d.auto_inactive_reason, "Contact Drop Cars support", "bad"))
    return {"count": len(items), "items": items}
