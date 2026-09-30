# crud/quality.py
"""Automatic low-rating penalty + follow-up tracking.

Owner rule (2026-09-30): a low customer rating must penalise the fleet
driver automatically and tell them why, with no staff step needed - but
staff can always waive it (fake/unfair ratings) or apply one by hand, so
automation never removes the manual fallback. Settings live in the
platform_settings row "low_rating_penalty_config"."""
import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting
from app.models.quality_case import QualityCase

SETTINGS_KEY = "low_rating_penalty_config"
DEFAULT_SETTINGS = {"enabled": True, "threshold": 2, "amount": 100}


def get_penalty_settings(db: Session) -> dict:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == SETTINGS_KEY).first()
    try:
        saved = json.loads(row.value) if row and row.value else {}
    except Exception:
        saved = {}
    return {**DEFAULT_SETTINGS, **saved}


def save_penalty_settings(db: Session, enabled: bool, threshold: int, amount: int) -> dict:
    data = {"enabled": bool(enabled), "threshold": max(1, min(4, int(threshold))), "amount": max(0, int(amount))}
    row = db.query(PlatformSetting).filter(PlatformSetting.key == SETTINGS_KEY).first()
    if row:
        row.value = json.dumps(data)
    else:
        db.add(PlatformSetting(key=SETTINGS_KEY, value=json.dumps(data)))
    db.commit()
    return data


def _apply_penalty(db: Session, case: QualityCase, amount: int, applied_by: str) -> None:
    from app.crud.wallet import debit_wallet_allow_negative
    debit_wallet_allow_negative(
        db, vehicle_owner_id=str(case.vehicle_owner_id), amount=amount,
        reference_id=f"quality_case:{case.id}", reference_type="LOW_RATING_PENALTY",
        notes=f"Low customer rating ({case.rating}★) on booking #{case.order_id}",
    )
    case.penalty_amount = amount
    case.penalty_status = "APPLIED"
    case.penalty_applied_by = applied_by


def handle_new_rating(
    db: Session, source: str, source_id: str, order_id: Optional[int], rating: int,
    vehicle_owner_id=None, driver_id=None,
) -> Optional[dict]:
    """Call right after a rating is committed. Creates the quality case for a
    low rating and, if enabled, debits the penalty and writes the in-app
    notification. Returns the push payload the caller should send (push is
    async, callers differ in sync/async context), or None. Never raises -
    a penalty problem must never make the customer's rating fail."""
    try:
        settings = get_penalty_settings(db)
        if rating > settings["threshold"]:
            return None
        case = db.query(QualityCase).filter(QualityCase.source == source, QualityCase.source_id == str(source_id)).first()
        if case:
            return None
        case = QualityCase(
            source=source, source_id=str(source_id), order_id=order_id, rating=rating,
            vehicle_owner_id=vehicle_owner_id, driver_id=driver_id,
        )
        db.add(case)
        db.flush()
        penalised = False
        if settings["enabled"] and settings["amount"] > 0 and vehicle_owner_id:
            _apply_penalty(db, case, settings["amount"], "AUTO")
            penalised = True
        db.commit()
        if not vehicle_owner_id:
            return None
        title = "Low customer rating"
        body = (
            f"Booking #{order_id} got a {rating}★ rating. A ₹{settings['amount']} quality penalty was deducted from your wallet. Contact support if this is unfair."
            if penalised else
            f"Booking #{order_id} got a {rating}★ rating. Please keep service quality high - repeated low ratings lead to penalties."
        )
        try:
            from app.crud.notification_log import log_notification
            log_notification(db, "vehicle_owner", str(vehicle_owner_id), title, body, event_key="low_rating", related_order_id=order_id)
        except Exception:
            pass
        return {"vehicle_owner_id": str(vehicle_owner_id), "order_id": order_id, "title": title, "body": body}
    except Exception as e:
        db.rollback()
        print(f"[quality] low-rating handling failed for {source}:{source_id}: {e}")
        return None


async def send_low_rating_push(db: Session, info: Optional[dict]) -> None:
    if not info:
        return
    try:
        from app.crud.notification import notify_specific_vehicle_owner
        await notify_specific_vehicle_owner(db, info["vehicle_owner_id"], info["order_id"], info["title"], info["body"])
    except Exception as e:
        print(f"[quality] low-rating push failed: {e}")


def get_or_create_case(db: Session, source: str, source_id: str) -> QualityCase:
    """For staff actions on a low rating that pre-dates this feature (no case
    row yet) - builds the case from the underlying rating on demand."""
    case = db.query(QualityCase).filter(QualityCase.source == source, QualityCase.source_id == str(source_id)).first()
    if case:
        return case
    from fastapi import HTTPException
    if source == "APP_RATING":
        from app.models.rating import Rating
        from app.models.order_assignments import OrderAssignment
        r = db.query(Rating).filter(Rating.id == source_id).first()
        if not r:
            raise HTTPException(status_code=404, detail="Rating not found")
        a = db.query(OrderAssignment).filter(OrderAssignment.order_id == r.order_id).first()
        case = QualityCase(source=source, source_id=str(r.id), order_id=r.order_id,
                           rating=min(r.driver_rating, r.car_rating), driver_id=r.driver_id,
                           vehicle_owner_id=a.vehicle_owner_id if a else None)
    elif source == "TRIP_REVIEW":
        from app.models.trip_review import TripReview
        r = db.query(TripReview).filter(TripReview.id == int(source_id)).first()
        if not r:
            raise HTTPException(status_code=404, detail="Review not found")
        case = QualityCase(source=source, source_id=str(r.id), order_id=r.order_id, rating=r.rating,
                           driver_id=r.driver_id, vehicle_owner_id=r.vehicle_owner_id)
    else:
        raise HTTPException(status_code=400, detail="Unknown feedback source")
    db.add(case)
    db.flush()
    return case


def waive_penalty(db: Session, case: QualityCase, reason: str, by: str) -> None:
    from fastapi import HTTPException
    from app.crud.wallet import credit_wallet
    if case.penalty_status != "APPLIED":
        raise HTTPException(status_code=400, detail="No applied penalty to waive")
    credit_wallet(
        db, vehicle_owner_id=str(case.vehicle_owner_id), amount=case.penalty_amount,
        reference_id=f"quality_case:{case.id}", reference_type="LOW_RATING_PENALTY_WAIVED",
        notes=f"Penalty waived: {reason}",
    )
    case.penalty_status = "WAIVED"
    case.waive_reason = reason
    case.waived_by = by
    db.commit()


def manual_penalty(db: Session, case: QualityCase, amount: int, by: str) -> None:
    from fastapi import HTTPException
    if case.penalty_status == "APPLIED":
        raise HTTPException(status_code=400, detail="A penalty is already applied for this rating")
    if not case.vehicle_owner_id:
        raise HTTPException(status_code=400, detail="No fleet driver is linked to this trip")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    _apply_penalty(db, case, amount, by)
    db.commit()


def resolve_case(db: Session, case: QualityCase, note: str, by: str) -> None:
    case.resolution_note = note
    case.resolved_by = by
    case.resolved_at = datetime.now(timezone.utc)
    db.commit()
