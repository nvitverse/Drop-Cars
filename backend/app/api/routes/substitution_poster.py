"""The booking's POSTER (a vendor, or a fleet owner who posted it) approves or declines a "Request for my car".
The office (any admin) can do the same for every booking - see admin.py. Approval is a pass; see services/substitution_flow.py."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.core.security import get_current_user

router = APIRouter(tags=["Vehicle requests (poster)"])


class Decision(BaseModel):
    notes: Optional[str] = None


def _poster(user):
    """('owner', fleet-owner id) or ('vendor', vendor id)."""
    if getattr(user, "vehicle_owner_id", None) is not None:
        return "owner", user.vehicle_owner_id
    return "vendor", user.id


def _name(user) -> str:
    return getattr(user, "full_name", None) or getattr(user, "business_name", None) or "Poster"


def _request_of_poster(db: Session, request_id: int, user):
    from app.models.vehicle_matching import CarSubstitutionRequest
    from app.models.orders import Order
    from app.crud.vehicle_matching import poster_owns_order

    req = db.query(CarSubstitutionRequest).filter(CarSubstitutionRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    order = db.query(Order).filter(Order.id == req.order_id).first()
    kind, pid = _poster(user)
    if not order or not poster_owns_order(order, "vendor" if kind == "vendor" else "owner", pid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the person who posted this booking can decide this request")
    return req


@router.get("/poster/substitution-requests")
def list_my_booking_requests(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    from app.crud.vehicle_matching import list_for_poster
    kind, pid = _poster(current_user)
    items = list_for_poster(db, "vendor" if kind == "vendor" else "owner", pid)
    return {"items": items, "pending": sum(1 for i in items if i["status"] == "PENDING")}


@router.post("/poster/substitution-requests/{request_id}/approve")
async def approve_my_booking_request(request_id: int, body: Decision, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    from app.services.substitution_flow import approve_and_accept
    req = _request_of_poster(db, request_id, current_user)
    try:
        req, auto, message = await approve_and_accept(db, req.id, None, "POSTER", _name(current_user), body.notes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "approved", "assigned": auto, "funds_needed": req.funds_needed or 0, "required_hold": req.required_hold, "message": message}


@router.post("/poster/substitution-requests/{request_id}/reject")
def reject_my_booking_request(request_id: int, body: Decision, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    from app.crud.vehicle_matching import decide_substitution_request
    from app.services.substitution_flow import notify_driver_decision
    req = _request_of_poster(db, request_id, current_user)
    try:
        req = decide_substitution_request(db, req.id, approve=False, decider_id=None, notes=body.notes, decider_kind="POSTER", decider_name=_name(current_user))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    notify_driver_decision(db, req, False, False)
    return {"status": "rejected"}
