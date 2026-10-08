"""Admin App: "Use as a model" - staff approve a document by hand, then save it as the reference for that kind of document
(one per state / format: Karnataka RC, Kerala RC, Tamil Nadu Permit ...). Later uploads that look the same are verified automatically."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.crud.admin_activity_log import log_admin_action
from app.database.session import get_db
from app.models.document_model import DocumentModel
from app.utils import doc_model

router = APIRouter(prefix="/admin/document-models", tags=["Document Models"])

CAR_URL_FIELD = {"rc_front": "rc_front_img_url", "rc_back": "rc_back_img_url", "insurance": "insurance_img_url",
                 "fc": "fc_img_url", "permit": "permit_img_url"}
KIND_OF = {"rc_front": "rc", "rc_back": "rc", "insurance": "insurance", "fc": "fc", "permit": "permit",
           "licence": "licence", "licence_back": "licence", "police": "police", "aadhar": "aadhar", "aadhar_back": "aadhar", "pan": "pan"}


class FromDocumentIn(BaseModel):
    document_id: str = Field(..., description="'car_<car id>_<type>' or 'account_<type>'")
    account_id: Optional[str] = Field(None, description="Owner / driver id for 'account_...' documents")
    account_type: Optional[str] = None
    label: str = Field(..., min_length=3, max_length=80, description="e.g. Karnataka RC")


def _resolve_url(db: Session, body: FromDocumentIn):
    try:
        if body.document_id.startswith("car_"):
            from app.models.car_details import CarDetails
            parts = body.document_id.split("_")
            if len(parts) < 3:
                raise HTTPException(status_code=400, detail="Bad document id")
            slot = "_".join(parts[2:])
            field = CAR_URL_FIELD.get(slot)
            if not field:
                raise HTTPException(status_code=400, detail="This kind of document cannot be a model")
            car = db.query(CarDetails).filter(CarDetails.id == uuid.UUID(parts[1])).first()
            return slot, (getattr(car, field, None) if car else None)
        if body.document_id.startswith("account_") and body.account_id:
            slot = body.document_id.replace("account_", "", 1)
            aid = uuid.UUID(str(body.account_id))
            from app.models.car_driver import CarDriver
            from app.models.vehicle_owner_details import VehicleOwnerDetails
            driver = db.query(CarDriver).filter(CarDriver.id == aid).first()
            if driver is not None and slot in ("licence", "licence_back", "police", "aadhar", "aadhar_back"):
                url = {"licence": driver.licence_front_img, "licence_back": driver.licence_back_img, "police": driver.police_verification_img,
                       "aadhar": driver.aadhar_front_img, "aadhar_back": driver.aadhar_back_img}.get(slot)
                return slot, url
            owner = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == aid).first()
            if owner is not None and slot in ("aadhar", "aadhar_back", "pan"):
                return slot, {"aadhar": owner.aadhar_front_img, "aadhar_back": owner.aadhar_back_img, "pan": owner.pan_img}.get(slot)
    except ValueError:
        raise HTTPException(status_code=400, detail="Bad id")
    raise HTTPException(status_code=400, detail="This kind of document cannot be a model")


@router.post("/from-document")
def save_as_model(body: FromDocumentIn, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    from app.utils.gcs import download_gcs_bytes
    slot, url = _resolve_url(db, body)
    if not url:
        raise HTTPException(status_code=404, detail="That document has no image")
    kind = KIND_OF.get(slot)
    if not kind:
        raise HTTPException(status_code=400, detail="This kind of document cannot be a model")
    try:
        fp = doc_model.fingerprint(download_gcs_bytes(url))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not read that image: {e}")
    row = DocumentModel(doc_kind=kind, label=body.label.strip(), fingerprint=fp, source_url=url,
                        created_by=getattr(current_admin, "username", "Admin"))
    db.add(row)
    log_admin_action(db, admin_id=str(current_admin.id), admin_username=getattr(current_admin, "username", "Admin"),
                     admin_role=getattr(current_admin, "role", None), action="DOCUMENT_MODEL_SAVED", target_type="document_model",
                     target_id=str(row.id), target_name=row.label, details={"kind": kind, "from": body.document_id})
    db.commit()
    return {"id": str(row.id), "doc_kind": kind, "label": row.label,
            "message": f"Saved. The next {kind.upper()} that looks like this one is verified automatically."}


@router.get("")
def list_models(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    rows = db.query(DocumentModel).order_by(DocumentModel.doc_kind, DocumentModel.label).all()
    return [{"id": str(r.id), "doc_kind": r.doc_kind, "label": r.label, "is_active": r.is_active, "match_count": r.match_count or 0,
             "created_by": r.created_by, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]


@router.patch("/{model_id}")
def set_model_active(model_id: str, active: bool, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    row = db.query(DocumentModel).filter(DocumentModel.id == uuid.UUID(model_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Model not found")
    row.is_active = active
    db.commit()
    return {"id": model_id, "is_active": active}


@router.delete("/{model_id}")
def delete_model(model_id: str, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    row = db.query(DocumentModel).filter(DocumentModel.id == uuid.UUID(model_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Model not found")
    db.delete(row)
    db.commit()
    return {"deleted": model_id}
