"""A fleet owner removes a car or a duty driver he added - no approval needed (owner rule 2026-10-13).

Nothing is deleted. The row stays with removed_at / removed_by / removed_reason, so:
  * Drop Cars staff still see the car / driver (flagged "Removed") with all documents and history,
  * every booking that used it still shows its details (the assignments point at the same row),
  * the owner no longer sees it, cannot assign it, and a removed duty driver cannot log in.
A car or a driver belongs to exactly ONE account at a time (the single vehicle_owner_id): removing frees it, a swap (OTP) moves it.
The same owner can add it back (it is restored with its old documents); another owner can add a removed CAR (it moves to him with its documents
reset to Pending). A removed DRIVER can only join another fleet through the OTP swap (his consent), never by someone typing his number."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.car_details import CarDetails
from app.models.car_driver import CarDriver
from app.models.common_enums import DocumentStatusEnum
from app.models.order_assignments import AssignmentStatusEnum, OrderAssignment

OPEN = (AssignmentStatusEnum.PENDING, AssignmentStatusEnum.ASSIGNED, AssignmentStatusEnum.DRIVING)


def _busy(db: Session, field, entity_id) -> bool:
    return db.query(OrderAssignment).filter(field == entity_id, OrderAssignment.assignment_status.in_(OPEN)).first() is not None


def remove_car(db: Session, owner_id, car_id, by: str, reason: Optional[str] = None) -> CarDetails:
    car = db.query(CarDetails).filter(CarDetails.id == car_id).with_for_update().first()
    if car is None or str(car.vehicle_owner_id) != str(owner_id):
        raise HTTPException(status_code=404, detail="That car is not in your fleet")
    if car.removed_at is not None:
        return car
    if _busy(db, OrderAssignment.car_id, car.id):
        raise HTTPException(status_code=409, detail="This car is on a booking that is not finished yet. Finish or re-assign that booking first, then remove the car.")
    car.removed_at = datetime.now(timezone.utc)
    car.removed_by = (by or "owner")[:120]
    car.removed_reason = (reason or "").strip()[:300] or None
    db.commit()
    return car


def remove_driver(db: Session, owner_id, driver_id, by: str, reason: Optional[str] = None) -> CarDriver:
    d = db.query(CarDriver).filter(CarDriver.id == driver_id).with_for_update().first()
    if d is None or str(d.vehicle_owner_id) != str(owner_id):
        raise HTTPException(status_code=404, detail="That driver is not in your fleet")
    if getattr(d, "is_owner_driver", False):
        raise HTTPException(status_code=400, detail="This is your own driver profile - it cannot be removed.")
    if d.removed_at is not None:
        return d
    if _busy(db, OrderAssignment.driver_id, d.id):
        raise HTTPException(status_code=409, detail="This driver is on a booking that is not finished yet. Finish or re-assign that booking first, then remove the driver.")
    d.removed_at = datetime.now(timezone.utc)
    d.removed_by = (by or "owner")[:120]
    d.removed_reason = (reason or "").strip()[:300] or None
    db.commit()
    return d


def restore(row) -> None:
    row.removed_at = None
    row.removed_by = None
    row.removed_reason = None


def take_over_removed_car(db: Session, car: CarDetails, new_owner_id, car_name: Optional[str] = None, car_type=None, year: Optional[str] = None) -> CarDetails:
    """Another owner adds a car number that its previous owner removed: the car moves to him. Documents were the previous owner's, so every
    status goes back to Pending (the images stay on file for Drop Cars staff until the new owner uploads his own)."""
    car.vehicle_owner_id = new_owner_id
    restore(car)
    if car_name:
        car.car_name = car_name
    if car_type is not None:
        car.car_type = car_type
    if year:
        car.year_of_the_car = year
    for f in ("rc_front_status", "rc_back_status", "insurance_status", "fc_status", "car_img_status", "permit_status", "pollution_status"):
        setattr(car, f, DocumentStatusEnum.PENDING)
    car.manual_inactive_reason = None
    car.auto_inactive_reason = None
    db.commit()
    db.refresh(car)
    return car
