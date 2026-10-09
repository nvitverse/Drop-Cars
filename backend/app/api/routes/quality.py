# api/routes/quality.py
"""Ratings & quality for the Admin App - one feed over both rating sources
(Customer App ratings + post-trip review links), the automatic low-rating
penalty settings, and staff follow-up (resolve / waive / manual penalty).
Replaces a screen that showed hardcoded fake reviews and claimed penalties
were deducted when nothing was (found 2026-09-30)."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.database.session import get_db
from app.crud import quality as q
from app.models.quality_case import QualityCase

router = APIRouter(prefix="/admin/quality", tags=["Ratings & Quality"])


def _since(days: int):
    return datetime.now(timezone.utc) - timedelta(days=days)


def _collect(db: Session, days: int, limit: int = 300) -> list:
    from app.models.rating import Rating
    from app.models.trip_review import TripReview
    from app.models.orders import Order
    from app.models.order_assignments import OrderAssignment
    from app.models.car_driver import CarDriver
    from app.models.car_details import CarDetails

    since = _since(days)
    app_ratings = db.query(Rating).filter(Rating.created_at >= since).order_by(Rating.created_at.desc()).limit(limit).all()
    reviews = db.query(TripReview).filter(TripReview.created_at >= since).order_by(TripReview.created_at.desc()).limit(limit).all()

    order_ids = {r.order_id for r in app_ratings} | {r.order_id for r in reviews}
    orders = {o.id: o for o in db.query(Order).filter(Order.id.in_(order_ids)).all()} if order_ids else {}
    assignments = {}
    if order_ids:
        for a in db.query(OrderAssignment).filter(OrderAssignment.order_id.in_(order_ids)).all():
            assignments.setdefault(a.order_id, a)
    driver_ids = {r.driver_id for r in app_ratings if r.driver_id} | {r.driver_id for r in reviews if r.driver_id}
    drivers = {d.id: d for d in db.query(CarDriver).filter(CarDriver.id.in_(driver_ids)).all()} if driver_ids else {}
    car_ids = {a.car_id for a in assignments.values() if a.car_id}
    cars = {c.id: c for c in db.query(CarDetails).filter(CarDetails.id.in_(car_ids)).all()} if car_ids else {}
    cases = {(c.source, c.source_id): c for c in db.query(QualityCase).filter(QualityCase.created_at >= since - timedelta(days=1)).all()}
    # Cases can pre-date the window edge slightly; also pull any for these exact rows.
    keys = [("APP_RATING", str(r.id)) for r in app_ratings] + [("TRIP_REVIEW", str(r.id)) for r in reviews]
    missing = [k for k in keys if k not in cases]
    if missing:
        for c in db.query(QualityCase).filter(QualityCase.source_id.in_([k[1] for k in missing])).all():
            cases[(c.source, c.source_id)] = c

    def base(order_id, driver_id):
        o = orders.get(order_id)
        a = assignments.get(order_id)
        d = drivers.get(driver_id) if driver_id else None
        car = cars.get(a.car_id) if a and a.car_id else None
        return {
            "order_id": order_id,
            "customer_name": o.customer_name if o else None,
            "customer_phone": o.customer_number if o else None,
            "driver_name": d.full_name if d else None,
            "driver_phone": d.primary_number if d else None,
            "car_number": car.car_number if car else None,
        }

    def case_out(c: Optional[QualityCase]):
        if not c:
            return None
        return {
            "id": c.id, "penalty_status": c.penalty_status, "penalty_amount": c.penalty_amount,
            "penalty_applied_by": c.penalty_applied_by, "waive_reason": c.waive_reason,
            "resolution_note": c.resolution_note, "resolved_by": c.resolved_by,
        }

    items = []
    for r in app_ratings:
        items.append({
            "source": "APP_RATING", "source_id": str(r.id),
            "rating": min(r.driver_rating, r.car_rating),
            "driver_rating": r.driver_rating, "car_rating": r.car_rating, "service_rating": r.service_rating,
            "comment": r.comment, "reviewer_name": None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            **base(r.order_id, r.driver_id), "case": case_out(cases.get(("APP_RATING", str(r.id)))),
        })
    for r in reviews:
        items.append({
            "source": "TRIP_REVIEW", "source_id": str(r.id), "rating": r.rating,
            "driver_rating": None, "car_rating": None, "service_rating": None,
            "comment": r.feedback, "reviewer_name": r.reviewer_name,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            **base(r.order_id, r.driver_id), "case": case_out(cases.get(("TRIP_REVIEW", str(r.id)))),
        })
    items.sort(key=lambda x: x["created_at"] or "", reverse=True)
    return items


@router.get("/summary")
def quality_summary(days: int = Query(30, ge=1, le=365), current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    items = _collect(db, days, limit=2000)
    settings = q.get_penalty_settings(db)
    ratings = [i["rating"] for i in items]
    cases = db.query(QualityCase).filter(QualityCase.created_at >= _since(days)).all()
    return {
        "days": days,
        "count": len(ratings),
        "average": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "positive_pct": round(100 * sum(1 for x in ratings if x >= 4) / len(ratings), 1) if ratings else None,
        "low_count": sum(1 for x in ratings if x <= settings["threshold"]),
        "unresolved_low": sum(1 for i in items if i["rating"] <= settings["threshold"] and not (i["case"] and i["case"]["resolution_note"])),
        "penalties_applied_total": sum(c.penalty_amount for c in cases if c.penalty_status == "APPLIED"),
        "penalty_settings": settings,
    }


@router.get("/feedback")
def quality_feedback(
    filter: str = Query("all", pattern="^(all|low|top)$"),
    search: Optional[str] = None,
    days: int = Query(90, ge=1, le=365),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    items = _collect(db, days)
    threshold = q.get_penalty_settings(db)["threshold"]
    if filter == "low":
        items = [i for i in items if i["rating"] <= threshold]
    elif filter == "top":
        items = [i for i in items if i["rating"] >= 5]
    if search:
        s = search.strip().lower()
        items = [i for i in items if any(s in str(i.get(k) or "").lower() for k in ("customer_name", "customer_phone", "driver_name", "car_number", "order_id", "comment"))]
    return {"items": items[:200], "threshold": threshold}

@router.get("/themes")
def quality_feedback_themes(
    days: int = Query(90, ge=1, le=365),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """B5. Rating comments themes: groups recent customer comments into themes (cleanliness, behaviour, punctuality, etc.)
    with counts and representative quotes, using keyword grouping with optional LLM enhancement."""
    from app.utils.ai_llm import extract_feedback_themes
    items = _collect(db, days, limit=500)
    themes = extract_feedback_themes(db, items)
    return {
        "days": days,
        "themes": themes,
        "total_comments": sum(t["count"] for t in themes),
    }



class PenaltySettingsIn(BaseModel):
    enabled: bool
    threshold: int
    amount: int


@router.put("/penalty-settings")
def update_penalty_settings(body: PenaltySettingsIn, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    if current_admin.role != "Owner":
        raise HTTPException(status_code=403, detail="Only the Owner can change penalty rules")
    return q.save_penalty_settings(db, body.enabled, body.threshold, body.amount)


class NoteIn(BaseModel):
    note: str


class PenaltyIn(BaseModel):
    amount: int


def _log(db, admin, action, case: QualityCase, details: dict):
    try:
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(admin.id), admin_username=admin.username, admin_role=admin.role,
            action=action, target_type="order", target_id=str(case.order_id), details=details,
        )
    except Exception:
        pass


@router.post("/feedback/{source}/{source_id}/resolve")
def resolve_feedback(source: str, source_id: str, body: NoteIn, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    if len(body.note.strip()) < 3:
        raise HTTPException(status_code=400, detail="Write what was done (at least a few words)")
    case = q.get_or_create_case(db, source, source_id)
    q.resolve_case(db, case, body.note.strip(), current_admin.username)
    _log(db, current_admin, "QUALITY_CASE_RESOLVED", case, {"note": body.note.strip()})
    return {"ok": True}


@router.post("/feedback/{source}/{source_id}/waive")
def waive_feedback_penalty(source: str, source_id: str, body: NoteIn, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    from app.api.routes.admin import require_payment_release_permission
    require_payment_release_permission(current_admin)
    case = q.get_or_create_case(db, source, source_id)
    q.waive_penalty(db, case, body.note.strip() or "Waived by staff", current_admin.username)
    _log(db, current_admin, "QUALITY_PENALTY_WAIVED", case, {"amount": case.penalty_amount, "reason": body.note})
    return {"ok": True}


@router.post("/feedback/{source}/{source_id}/penalize")
def penalize_feedback(source: str, source_id: str, body: PenaltyIn, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    from app.api.routes.admin import require_payment_release_permission
    require_payment_release_permission(current_admin)
    case = q.get_or_create_case(db, source, source_id)
    q.manual_penalty(db, case, body.amount, current_admin.username)
    _log(db, current_admin, "QUALITY_PENALTY_APPLIED", case, {"amount": body.amount})
    return {"ok": True}
