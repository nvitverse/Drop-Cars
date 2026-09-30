# api/routes/driver_ops.py
"""Driver lookup for staff: search every driver server-side (the old screen
only searched the first 100 it had loaded, out of thousands) and one call
that answers "where is this driver, what are they doing, who do they drive
for" - live status, current trip with last GPS fix, fleet driver, cars,
recent trips."""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.database.session import get_db

router = APIRouter(prefix="/admin/driver-lookup", tags=["Driver Lookup"])


def _v(x):
    return x.value if hasattr(x, "value") else (str(x) if x is not None else None)


def _route(loc) -> str:
    if not isinstance(loc, dict) or not loc:
        return ""
    try:
        keys = sorted(loc.keys(), key=lambda k: int(k))
    except Exception:
        keys = list(loc.keys())
    return " → ".join(str(loc[k]) for k in keys if loc.get(k))


@router.get("/search")
def search_drivers(q: str = Query(..., min_length=2), current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    from app.models.car_driver import CarDriver
    from app.models.vehicle_owner_details import VehicleOwnerDetails

    term = q.strip()
    digits = "".join(ch for ch in term if ch.isdigit())
    conds = [CarDriver.full_name.ilike(f"%{term}%"), CarDriver.reg_id.ilike(f"%{term}%")]
    if len(digits) >= 3:
        conds.append(CarDriver.primary_number.ilike(f"%{digits}%"))
    drivers = db.query(CarDriver).filter(or_(*conds)).order_by(CarDriver.full_name.asc()).limit(25).all()
    owner_ids = {d.vehicle_owner_id for d in drivers}
    owners = {o.vehicle_owner_id: o for o in db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id.in_(owner_ids)).all()} if owner_ids else {}
    return [{
        "id": str(d.id), "name": d.full_name, "phone": d.primary_number, "reg_id": d.reg_id,
        "status": _v(d.driver_status), "city": d.city, "rating": round(float(d.rating_avg or 0), 1),
        "fleet_driver_name": owners[d.vehicle_owner_id].full_name if d.vehicle_owner_id in owners else None,
    } for d in drivers]


@router.get("/{driver_id}")
def driver_details(driver_id: UUID, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    from app.models.car_driver import CarDriver
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.car_details import CarDetails
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.models.orders import Order

    d = db.query(CarDriver).filter(CarDriver.id == driver_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    owner = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == d.vehicle_owner_id).first()
    cars = db.query(CarDetails).filter(CarDetails.vehicle_owner_id == d.vehicle_owner_id).all()
    cars_by_id = {c.id: c for c in cars}

    assignments = db.query(OrderAssignment).filter(OrderAssignment.driver_id == d.id).order_by(OrderAssignment.id.desc()).limit(40).all()
    order_ids = [a.order_id for a in assignments]
    orders = {o.id: o for o in db.query(Order).filter(Order.id.in_(order_ids)).all()} if order_ids else {}

    current = next((a for a in assignments if a.assignment_status in (AssignmentStatusEnum.DRIVING, AssignmentStatusEnum.ASSIGNED)), None)

    def trip_out(a):
        o = orders.get(a.order_id)
        car = cars_by_id.get(a.car_id) or (db.query(CarDetails).filter(CarDetails.id == a.car_id).first() if a.car_id else None)
        return {
            "order_id": a.order_id,
            "assignment_status": _v(a.assignment_status),
            "trip_status": _v(o.trip_status) if o else None,
            "route": _route(o.pickup_drop_location) if o else "",
            "start_date_time": o.start_date_time.isoformat() if o and o.start_date_time else None,
            "customer_name": o.customer_name if o else None,
            "customer_phone": o.customer_number if o else None,
            "car_number": car.car_number if car else None,
            "last_lat": a.last_lat, "last_lng": a.last_lng,
            "location_updated_at": a.last_location_at.isoformat() if a.last_location_at else None,
        }

    completed = db.query(func.count(OrderAssignment.id)).filter(
        OrderAssignment.driver_id == d.id, OrderAssignment.assignment_status == AssignmentStatusEnum.COMPLETED
    ).scalar() or 0
    cancelled = db.query(func.count(OrderAssignment.id)).filter(
        OrderAssignment.driver_id == d.id, OrderAssignment.assignment_status == AssignmentStatusEnum.CANCELLED
    ).scalar() or 0

    return {
        "driver": {
            "id": str(d.id), "name": d.full_name, "phone": d.primary_number, "secondary_phone": d.secondary_number,
            "reg_id": d.reg_id, "status": _v(d.driver_status), "city": d.city,
            "rating": round(float(d.rating_avg or 0), 1), "rating_count": d.rating_count or 0,
            "licence_number": d.licence_number, "licence_status": _v(d.licence_front_status),
            "licence_expiry": d.licence_expiry_date.isoformat() if d.licence_expiry_date else None,
            "is_owner_driver": bool(d.is_owner_driver), "permanently_blocked": bool(d.permanently_blocked),
            "joined_at": d.created_at.isoformat() if d.created_at else None,
        },
        "fleet_driver": {
            "id": str(d.vehicle_owner_id), "name": owner.full_name if owner else None,
            "phone": owner.primary_number if owner else None, "city": owner.city if owner else None,
            "wallet_balance": owner.wallet_balance if owner else None, "tier": owner.tier if owner else None,
        },
        "cars": [{
            "id": str(c.id), "car_number": c.car_number, "car_name": c.car_name,
            "car_type": _v(c.car_type), "status": _v(c.car_status), "year": c.year_of_the_car,
        } for c in cars],
        "current_trip": trip_out(current) if current else None,
        "recent_trips": [trip_out(a) for a in assignments[:8]],
        "stats": {"completed": completed, "cancelled": cancelled},
    }
