"""Post-trip customer review (bridge for the website review section).

Flow: the driver finishes a trip -> the Driver App asks GET /trip-review/link/{order_id} and shows the URL as a QR ->
the customer scans it -> the WEBSITE review page loads GET /trip-review/{token} (trip + driver name, public) and posts
POST /trip-review/{token} with stars + feedback. The website part is wired later; these endpoints are the bridge.
The token is the assignment's trip_link_token (unguessable), so no login is needed for the customer."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.orders import Order
from app.models.order_assignments import OrderAssignment
from app.models.trip_review import TripReview
from app.models.platform_setting import PlatformSetting

from app.core.security import get_current_admin, get_current_user_flexible, get_current_driver
router = APIRouter(prefix="/trip-review", tags=["Trip Review"])

DEFAULT_REVIEW_BASE_URL = "https://dropcars.in/review"


def review_base_url(db: Session) -> str:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == "review_page_base_url").first()
    return (row.value if row and row.value else DEFAULT_REVIEW_BASE_URL).rstrip("/")


def _assignment_by_token(db: Session, token: str) -> OrderAssignment:
    a = db.query(OrderAssignment).filter(OrderAssignment.trip_link_token == token).first()
    if not a:
        raise HTTPException(status_code=404, detail="This review link is not valid.")
    return a


def _cities(order: Order):
    from app.crud.booking_chat import _cities
    return _cities(order)


@router.get("/link/{order_id}", dependencies=[Depends(get_current_user_flexible)])
def get_review_link(order_id: int, request: Request, db: Session = Depends(get_db)):
    """Link + token for the QR the Driver App shows after the trip (driver / fleet owner of that trip only)."""
    from app.api.routes.booking_chat import _resolve_caller
    role, caller = _resolve_caller(request, db)
    a = db.query(OrderAssignment).filter(OrderAssignment.order_id == order_id).order_by(OrderAssignment.created_at.desc()).first()
    if not a or not a.trip_link_token:
        raise HTTPException(status_code=404, detail="No trip found for this booking.")
    owner_id = str(getattr(caller, "vehicle_owner_id", None) or getattr(caller, "id", ""))
    if role not in ("ADMIN",) and str(a.vehicle_owner_id) != owner_id:
        raise HTTPException(status_code=403, detail="This isn't your trip.")
    return {"order_id": order_id, "token": a.trip_link_token, "url": f"{review_base_url(db)}/{a.trip_link_token}"}


@router.get("/{token}")
def review_page_data(token: str, db: Session = Depends(get_db)):
    """Public: what the review page shows (trip + driver name) and whether it can still be reviewed."""
    a = _assignment_by_token(db, token)
    order = db.query(Order).filter(Order.id == a.order_id).first()
    from app.models.car_driver import CarDriver
    from app.models.car_details import CarDetails
    driver = db.query(CarDriver).filter(CarDriver.id == a.driver_id).first() if a.driver_id else None
    car = db.query(CarDetails).filter(CarDetails.id == a.car_id).first() if a.car_id else None
    existing = db.query(TripReview).filter(TripReview.order_id == a.order_id).first()
    pickup, drop = _cities(order)
    status = str(getattr(a.assignment_status, "value", a.assignment_status))
    return {
        "order_id": a.order_id,
        "trip_type": getattr(order.trip_type, "value", order.trip_type),
        "pickup": pickup,
        "drop": drop,
        "date": order.start_date_time.isoformat() if order.start_date_time else None,
        "driver_name": driver.full_name if driver else None,
        "driver_photo": getattr(driver, "profile_img", None) if driver else None,
        "car": (car.car_name if car else None),
        "completed": status == "COMPLETED",
        "already_reviewed": existing is not None,
        "existing_rating": existing.rating if existing else None,
    }


class ReviewIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    feedback: Optional[str] = Field(None, max_length=1000)
    reviewer_name: Optional[str] = Field(None, max_length=80)


@router.post("/{token}", status_code=201)
def submit_review(token: str, body: ReviewIn, db: Session = Depends(get_db)):
    a = _assignment_by_token(db, token)
    if str(getattr(a.assignment_status, "value", a.assignment_status)) != "COMPLETED":
        raise HTTPException(status_code=400, detail="You can review a trip once it is completed.")
    if db.query(TripReview).filter(TripReview.order_id == a.order_id).first():
        raise HTTPException(status_code=400, detail="This trip has already been reviewed. Thank you!")
    r = TripReview(order_id=a.order_id, driver_id=a.driver_id, vehicle_owner_id=a.vehicle_owner_id,
                   rating=body.rating, feedback=(body.feedback or "").strip() or None,
                   reviewer_name=(body.reviewer_name or "").strip() or None)
    db.add(r)
    db.commit()
    # Automatic low-rating penalty + notification (crud/quality.py). This is
    # a sync route running in a worker thread, so there's no event loop here
    # for the async push - asyncio.run is safe in that context.
    try:
        from app.crud.quality import handle_new_rating, send_low_rating_push
        info = handle_new_rating(db, "TRIP_REVIEW", str(r.id), r.order_id, r.rating,
                                 vehicle_owner_id=r.vehicle_owner_id, driver_id=r.driver_id)
        if info:
            import asyncio
            asyncio.run(send_low_rating_push(db, info))
    except Exception as e:
        print(f"[quality] post-review hook failed: {e}")
    return {"status": "thanks", "rating": body.rating}


def driver_rating_summary(db: Session, driver_id) -> dict:
    """Average over BOTH the QR reviews here and the ratings customers give in the Customer App (car_driver.rating_avg /
    rating_count, kept up to date by crud/ratings.py)."""
    avg, cnt = db.query(func.avg(TripReview.rating), func.count(TripReview.id)).filter(TripReview.driver_id == driver_id).one()
    total = float(avg or 0) * int(cnt or 0)
    count = int(cnt or 0)
    try:
        from app.models.car_driver import CarDriver
        d = db.query(CarDriver).filter(CarDriver.id == driver_id).first()
        c_avg, c_cnt = getattr(d, "rating_avg", None), getattr(d, "rating_count", None)
        if d is not None and c_avg is not None and c_cnt:
            total += float(c_avg) * int(c_cnt)
            count += int(c_cnt)
    except Exception:
        pass
    return {"avg_rating": round(total / count, 1) if count else None, "rating_count": count}
