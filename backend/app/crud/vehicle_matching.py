"""Vehicle-type matching gate for booking acceptance, plus its escape
hatch (car substitution requests). See models/vehicle_matching.py for the
two tables this works with, and order_assignments.py's accept_order /
assign_car_driver for where the gate is actually enforced."""

from typing import Optional
from sqlalchemy.orm import Session
from app.models.car_details import CarDetails
from app.models.car_driver import CarDriver
from app.models.orders import Order
from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.models.vehicle_matching import (
    VehicleMismatchAttempt,
    CarSubstitutionRequest,
    SubstitutionRequestStatusEnum,
)
from app.crud.verification import is_car_verified


# Vehicle "ladder" (owner's rule, 2026-09-19): a vehicle may take any booking
# at its OWN level or BELOW, never above.
#     Hatchback < Sedan < Etios < SUV < Innova < Crysta
# e.g. a Crysta can take Hatchback/Sedan/Etios/SUV/Innova/Crysta bookings, a
# Sedan can take Hatchback and Sedan bookings but NOT an Etios booking (Etios
# ranks above Sedan), and a Crysta booking can only be taken by a Crysta.
#
# type -> (class, rank on the ladder or None, passenger seats).
# Seats are an extra safety check on top of the ladder: a 6-seater must not
# take a booking that asked for 7 passengers just because its class is
# higher. Plain INNOVA/INNOVA_CRYSTA are counted as 6 seats (they can serve up
# to 6-passenger bookings); register a 7-seater under the *_7_PLUS_1 type.
# Tempo Traveller / Urbania are minibuses: no ladder, same family only, and a
# bigger one may serve a smaller booking of its own family.
_TYPE_INFO = {
    "HATCHBACK": ("HATCHBACK", 1, 4),
    "SEDAN_4_PLUS_1": ("SEDAN", 2, 4),
    "NEW_SEDAN_2022_MODEL": ("SEDAN", 2, 4),  # same level as Sedan (owner: treat New Sedan as Sedan)
    "ETIOS_4_PLUS_1": ("ETIOS", 3, 4),
    "SUV": ("SUV", 4, 6),
    "SUV_6_PLUS_1": ("SUV", 4, 6),
    "SUV_7_PLUS_1": ("SUV", 4, 7),
    "INNOVA": ("INNOVA", 5, 6),
    "INNOVA_6_PLUS_1": ("INNOVA", 5, 6),
    "INNOVA_7_PLUS_1": ("INNOVA", 5, 7),
    "INNOVA_CRYSTA": ("CRYSTA", 6, 6),
    "INNOVA_CRYSTA_6_PLUS_1": ("CRYSTA", 6, 6),
    "INNOVA_CRYSTA_7_PLUS_1": ("CRYSTA", 6, 7),
    "TEMPO_TRAVELLER_12": ("TEMPO_TRAVELLER", None, 12),
    "TEMPO_TRAVELLER_14": ("TEMPO_TRAVELLER", None, 14),
    "TEMPO_TRAVELLER_18": ("TEMPO_TRAVELLER", None, 18),
    "URBANIA_12": ("URBANIA", None, 12),
    "URBANIA_14": ("URBANIA", None, 14),
    "URBANIA_16": ("URBANIA", None, 16),
}


def _type_value(t) -> str:
    return t.value if hasattr(t, "value") else str(t)


def car_type_satisfies(car_type, required_car_type) -> bool:
    """Can a car of `car_type` serve a booking that asked for
    `required_car_type`? Compares on .value strings - CarDetails.car_type
    (car_details.CarTypeEnum) and Order.car_type (new_orders.CarTypeEnum) are
    two different Python classes with identical members, so comparing the
    enum instances directly is always False."""
    car_v, req_v = _type_value(car_type), _type_value(required_car_type)
    car, req = _TYPE_INFO.get(car_v), _TYPE_INFO.get(req_v)
    if car is None or req is None:
        return car_v == req_v  # a type this table doesn't know: exact match only
    car_class, car_rank, car_seats = car
    req_class, req_rank, req_seats = req
    if car_rank is None or req_rank is None:
        return car_class == req_class and car_seats >= req_seats
    return car_rank >= req_rank and car_seats >= req_seats


def compatible_car_types(required_car_type) -> set:
    """Every car type that may serve this booking (used for the fleet query)."""
    return {t for t in _TYPE_INFO if car_type_satisfies(t, required_car_type)} or {_type_value(required_car_type)}


def vehicle_match_status(db: Session, vehicle_owner_id: str, required_car_type) -> str:
    """"OK"        - owns at least one VERIFIED car that can serve the booking
       "UNVERIFIED" - owns a suitable car but none of them are verified yet
       "NO_CAR"     - owns no suitable car at all
    Unverified cars can't be assigned anyway (assign_car_driver's
    is_car_verified gate), so they don't count as a match - but the driver
    needs to be told THAT is the problem, not "you don't have one"."""
    values = list(compatible_car_types(required_car_type))
    cars = db.query(CarDetails).filter(
        CarDetails.vehicle_owner_id == vehicle_owner_id,
        CarDetails.car_type.in_(values),
    ).all()
    if not cars:
        return "NO_CAR"
    return "OK" if any(is_car_verified(c) for c in cars) else "UNVERIFIED"


def has_matching_verified_car(db: Session, vehicle_owner_id: str, required_car_type) -> bool:
    return vehicle_match_status(db, vehicle_owner_id, required_car_type) == "OK"


def log_mismatch_attempt(db: Session, order_id: int, vehicle_owner_id: str, required_car_type) -> None:
    """Records a blocked accept attempt for Admin App visibility - shows
    real unmet demand for a car type (e.g. "5 drivers tried to accept this
    Crysta booking but only have Sedans"). Best-effort: never blocks the
    actual accept-rejection flow if logging itself fails."""
    try:
        db.add(VehicleMismatchAttempt(
            order_id=order_id,
            vehicle_owner_id=vehicle_owner_id,
            required_car_type=required_car_type,
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"log_mismatch_attempt failed (accept still blocked correctly): {e}")


def get_mismatch_attempts_for_order(db: Session, order_id: int) -> list:
    rows = db.query(VehicleMismatchAttempt).filter(VehicleMismatchAttempt.order_id == order_id).order_by(VehicleMismatchAttempt.attempted_at.desc()).all()
    owner_ids = {str(r.vehicle_owner_id) for r in rows}
    owners_by_id = {}
    if owner_ids:
        for o in db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id.in_(owner_ids)).all():
            owners_by_id[str(o.vehicle_owner_id)] = o
    items = []
    for r in rows:
        owner = owners_by_id.get(str(r.vehicle_owner_id))
        items.append({
            "id": r.id,
            "order_id": r.order_id,
            "vehicle_owner_id": str(r.vehicle_owner_id),
            "owner_name": owner.full_name if owner else None,
            "owner_phone": owner.primary_number if owner else None,
            "required_car_type": r.required_car_type.value if hasattr(r.required_car_type, "value") else str(r.required_car_type),
            "attempted_at": r.attempted_at.isoformat() if r.attempted_at else None,
        })
    return items


def create_substitution_request(db: Session, order_id: int, vehicle_owner_id: str, car_id: str, driver_id: str) -> CarSubstitutionRequest:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Booking not found")
    car = db.query(CarDetails).filter(CarDetails.id == car_id, CarDetails.vehicle_owner_id == vehicle_owner_id).first()
    if not car:
        raise ValueError("That car isn't in your fleet")
    driver = db.query(CarDriver).filter(CarDriver.id == driver_id, CarDriver.vehicle_owner_id == vehicle_owner_id).first()
    if not driver:
        raise ValueError("That driver isn't in your fleet")
    if not is_car_verified(car):
        raise ValueError("One of this car's documents (RC, Insurance or Permit) has expired. Renew it before offering this car")

    # Seating capacity validation: offered car must have at least as many passenger seats as required
    car_info = _TYPE_INFO.get(_type_value(car.car_type))
    req_info = _TYPE_INFO.get(_type_value(order.car_type))
    if car_info and req_info:
        car_seats = car_info[2]
        req_seats = req_info[2]
        if car_seats < req_seats:
            raise ValueError(f"Cannot offer {car.car_name} ({car_seats} seats): this booking requires at least {req_seats} passenger seats.")

    existing = db.query(CarSubstitutionRequest).filter(
        CarSubstitutionRequest.order_id == order_id,
        CarSubstitutionRequest.vehicle_owner_id == vehicle_owner_id,
        CarSubstitutionRequest.status == SubstitutionRequestStatusEnum.PENDING,
    ).first()
    if existing:
        return existing

    req = CarSubstitutionRequest(
        order_id=order_id,
        vehicle_owner_id=vehicle_owner_id,
        car_id=car_id,
        driver_id=driver_id,
        required_car_type=order.car_type,
        # car.car_type is a car_details.CarTypeEnum instance - a different
        # Python class from the new_orders.CarTypeEnum this column is bound
        # to (see has_matching_verified_car's comment above). .value avoids
        # the same cross-class validation crash.
        offered_car_type=car.car_type.value,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def list_pending_substitution_requests(db: Session) -> list:
    rows = db.query(CarSubstitutionRequest).filter(
        CarSubstitutionRequest.status == SubstitutionRequestStatusEnum.PENDING
    ).order_by(CarSubstitutionRequest.created_at.asc()).all()

    owner_ids = {str(r.vehicle_owner_id) for r in rows}
    owners_by_id = {}
    if owner_ids:
        for o in db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id.in_(owner_ids)).all():
            owners_by_id[str(o.vehicle_owner_id)] = o

    car_ids = {str(r.car_id) for r in rows}
    cars_by_id = {}
    if car_ids:
        for c in db.query(CarDetails).filter(CarDetails.id.in_(car_ids)).all():
            cars_by_id[str(c.id)] = c

    driver_ids = {str(r.driver_id) for r in rows}
    drivers_by_id = {}
    if driver_ids:
        for d in db.query(CarDriver).filter(CarDriver.id.in_(driver_ids)).all():
            drivers_by_id[str(d.id)] = d

    order_ids = {r.order_id for r in rows}
    orders_by_id = {}
    if order_ids:
        for od in db.query(Order).filter(Order.id.in_(order_ids)).all():
            orders_by_id[od.id] = od

    items = []
    for r in rows:
        owner = owners_by_id.get(str(r.vehicle_owner_id))
        car = cars_by_id.get(str(r.car_id))
        driver = drivers_by_id.get(str(r.driver_id))
        order = orders_by_id.get(r.order_id)
        items.append({
            "id": r.id,
            "order_id": r.order_id,
            "customer_name": order.customer_name if order else None,
            "pickup_drop_location": order.pickup_drop_location if order else None,
            "owner_name": owner.full_name if owner else None,
            "owner_phone": owner.primary_number if owner else None,
            "car_name": car.car_name if car else None,
            "car_number": car.car_number if car else None,
            "driver_name": driver.full_name if driver else None,
            "required_car_type": r.required_car_type.value if hasattr(r.required_car_type, "value") else str(r.required_car_type),
            "offered_car_type": r.offered_car_type.value if hasattr(r.offered_car_type, "value") else str(r.offered_car_type),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return items


def decide_substitution_request(db: Session, request_id: int, approve: bool, admin_id: str, notes: Optional[str] = None):
    """Approve: actually creates the OrderAssignment with the offered
    car+driver, exactly like a normal accept+assign would (bypassing the
    type gate this whole system exists to enforce - that's the point of
    an explicit admin-approved exception). Reject: just closes the
    request out; the requesting owner is notified either way."""
    from datetime import datetime
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum

    req = db.query(CarSubstitutionRequest).filter(CarSubstitutionRequest.id == request_id).first()
    if not req:
        raise ValueError("Request not found")
    if req.status != SubstitutionRequestStatusEnum.PENDING:
        raise ValueError(f"Request already {req.status.value.lower()}")

    req.status = SubstitutionRequestStatusEnum.APPROVED if approve else SubstitutionRequestStatusEnum.REJECTED
    req.admin_notes = notes
    req.decided_at = datetime.utcnow()
    req.decided_by_admin_id = admin_id

    assignment = None
    if approve:
        # NOTE: unlike a normal accept_order, this does NOT run the wallet-
        # hold check/debit (commission hold, driver-payout guarantee) -
        # admin is manually overriding the vehicle-type gate for what
        # should be a rare, individually-reviewed exception, not routing
        # around the whole financial safety system. If this path sees real
        # volume, move the hold logic from accept_order into a shared
        # helper both call instead of duplicating it here.
        existing_assignment = db.query(OrderAssignment).filter(
            OrderAssignment.order_id == req.order_id,
            OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED,
        ).first()
        if existing_assignment:
            raise ValueError("This booking already has an active assignment - can't approve a substitution for it anymore")

        import secrets
        assignment = OrderAssignment(
            order_id=req.order_id,
            vehicle_owner_id=req.vehicle_owner_id,
            driver_id=req.driver_id,
            car_id=req.car_id,
            assignment_status=AssignmentStatusEnum.ASSIGNED,
            assigned_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
            held_amount=0,
        )
        db.add(assignment)
        db.flush()
        from app.crud.trip_otp import apply_order_otps_to_assignment
        apply_order_otps_to_assignment(db, assignment)
        assignment.trip_link_token = secrets.token_urlsafe(24)

    db.commit()
    if assignment:
        db.refresh(assignment)
    return req, assignment
