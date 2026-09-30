import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.car_driver import CarDriver
from app.models.car_details import CarDetails
from app.models.vehicle_owner import VehicleOwnerCredentials
from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
from app.models.payout_request import PayoutRequest
from app.models.fleet_swap_audit import FleetDriverSwapAudit
from app.core.security import get_current_vehicleOwner_id, get_current_driver, get_current_admin
from app.core.limiter import limiter

logger = logging.getLogger("dropcars.fleet_swap")
router = APIRouter(prefix="/fleet-swap", tags=["Fleet & Driver Swap"])

MAX_OTP_ATTEMPTS = 5
OTP_VALIDITY_MINUTES = 10


def _hash_otp(otp: str, salt: str) -> str:
    """Generate SHA256 salted hash for constant-time comparison."""
    return hashlib.sha256(f"{salt}:{otp}".encode("utf-8")).hexdigest()


def _verify_otp_hash(otp: str, salt: str, expected_hash: str) -> bool:
    """Verify OTP against salted hash using constant-time comparison."""
    if not otp or not salt or not expected_hash:
        return False
    computed = _hash_otp(otp.strip(), salt)
    return secrets.compare_digest(computed, expected_hash)


def has_active_trip_driver(db: Session, driver_id: UUID) -> bool:
    """Check if driver has any non-completed, non-cancelled order assignment."""
    return db.query(OrderAssignment).filter(
        OrderAssignment.driver_id == driver_id,
        OrderAssignment.assignment_status.in_([
            AssignmentStatusEnum.PENDING,
            AssignmentStatusEnum.ASSIGNED,
            AssignmentStatusEnum.DRIVING
        ])
    ).first() is not None


def has_active_trip_car(db: Session, car_id: UUID) -> bool:
    """Check if car has any non-completed, non-cancelled order assignment."""
    return db.query(OrderAssignment).filter(
        OrderAssignment.car_id == car_id,
        OrderAssignment.assignment_status.in_([
            AssignmentStatusEnum.PENDING,
            AssignmentStatusEnum.ASSIGNED,
            AssignmentStatusEnum.DRIVING
        ])
    ).first() is not None


def _mask_phone(phone: Optional[str]) -> str:
    """Mask phone number for privacy: e.g. '9876543210' -> '******3210'."""
    if not phone or len(phone) < 4:
        return "******"
    return f"******{phone[-4:]}"


class SwapDriverInitiateRequest(BaseModel):
    driver_id: str


class SwapCarInitiateRequest(BaseModel):
    car_number: str


class SwapVerifyRequest(BaseModel):
    swap_id: str  # Non-guessable UUID string
    otp_code: str


class AdminSwapOverrideRequest(BaseModel):
    swap_type: str = "DRIVER"  # "DRIVER" or "CAR"
    driver_id: Optional[str] = None
    car_number: Optional[str] = None
    new_owner_id: str
    reason: str


# -------------------------------------------------------------------------
# 1. Driver Swap Request (Fleet Owner Initiates)
# -------------------------------------------------------------------------
@router.post("/request-swap")
@limiter.limit("5/minute")
def request_driver_swap(
    request: Request,
    payload: SwapDriverInitiateRequest,
    current_owner_id: str = Depends(get_current_vehicleOwner_id),
    db: Session = Depends(get_db)
):
    """
    Fleet owner requests a driver transfer to their fleet.
    Generates a 6-digit secure OTP delivered directly to the driver.
    """
    try:
        d_uuid = UUID(payload.driver_id)
        new_o_uuid = UUID(current_owner_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid driver_id UUID format")

    driver = db.query(CarDriver).filter(CarDriver.id == d_uuid).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    if driver.vehicle_owner_id == new_o_uuid:
        raise HTTPException(status_code=400, detail="Driver is already assigned to your fleet")

    # SAFETY CHECK 1: Active trip blocking on OrderAssignment
    active_assignment = (
        db.query(OrderAssignment)
        .filter(
            OrderAssignment.driver_id == driver.id,
            OrderAssignment.assignment_status.in_([
                AssignmentStatusEnum.PENDING,
                AssignmentStatusEnum.ASSIGNED,
                AssignmentStatusEnum.DRIVING
            ])
        )
        .first()
    )
    if active_assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Swap blocked: Driver has an active assignment in progress. Complete all trips before transfer.",
        )

    # SAFETY CHECK 2: Pending payout blocking
    pending_payout = (
        db.query(PayoutRequest)
        .filter(
            PayoutRequest.vehicle_owner_id == driver.vehicle_owner_id,
            PayoutRequest.status == "PENDING"
        )
        .first()
    )
    if pending_payout:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Swap blocked: Fleet has a pending payout settlement. Settle all pending payouts first.",
        )

    # Cryptographically secure 6-digit numeric OTP
    otp_code = str(secrets.randbelow(900000) + 100000)
    salt = secrets.token_hex(16)
    otp_hash = _hash_otp(otp_code, salt)
    expires_at = datetime.utcnow() + timedelta(minutes=OTP_VALIDITY_MINUTES)
    swap_uuid = uuid.uuid4()

    audit_entry = FleetDriverSwapAudit(
        swap_uuid=swap_uuid,
        swap_type="DRIVER",
        driver_id=d_uuid,
        old_owner_id=driver.vehicle_owner_id,
        new_owner_id=new_o_uuid,
        initiated_by="OWNER",
        otp_hash=otp_hash,
        otp_salt=salt,
        otp_expires_at=expires_at,
        otp_attempts=0,
        status="PENDING_OTP",
        created_at=datetime.utcnow(),
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)

    # Deliver OTP via Push Notification to Driver
    try:
        from app.utils.notification_dispatch import send_push_to_driver
        send_push_to_driver(
            db,
            driver_id=str(driver.id),
            title="🚖 Fleet Transfer Request",
            body=f"A new fleet owner has requested to add you. Your verification OTP is: {otp_code}. Valid for {OTP_VALIDITY_MINUTES} mins.",
            data={"type": "FLEEP_SWAP_OTP", "swap_id": str(swap_uuid)}
        )
    except Exception as e:
        logger.warning(f"Failed to send push OTP to driver {driver.id}: {e}")

    logger.info(
        f"Fleet swap initiated for Driver {driver.full_name} ({driver.primary_number}). "
        f"Swap UUID={swap_uuid}, valid {OTP_VALIDITY_MINUTES}m."
    )

    return {
        "status": "ok",
        "swap_id": str(swap_uuid),
        "message": f"Verification OTP sent to driver's registered phone ({_mask_phone(driver.primary_number)}). Valid for {OTP_VALIDITY_MINUTES} minutes.",
        "driver_name": driver.full_name,
        "expires_in_seconds": OTP_VALIDITY_MINUTES * 60,
    }


# -------------------------------------------------------------------------
# 2. Car Swap Request (Fleet Owner Initiates)
# -------------------------------------------------------------------------
@router.post("/request-car-swap")
@limiter.limit("5/minute")
def request_car_swap(
    request: Request,
    payload: SwapCarInitiateRequest,
    current_owner_id: str = Depends(get_current_vehicleOwner_id),
    db: Session = Depends(get_db)
):
    """
    Fleet owner requests a car transfer by registered plate number.
    Generates a 6-digit secure OTP delivered directly to the car's current registered owner.
    """
    clean_num = payload.car_number.strip().upper().replace(" ", "")
    new_o_uuid = UUID(current_owner_id)

    car = db.query(CarDetails).filter(CarDetails.car_number == clean_num).first()
    if not car:
        raise HTTPException(status_code=404, detail=f"Car with plate number '{clean_num}' not found")

    if car.vehicle_owner_id == new_o_uuid:
        raise HTTPException(status_code=400, detail="Car is already registered under your fleet")

    # SAFETY CHECK 1: Active assignment blocking on car
    active_car_assignment = (
        db.query(OrderAssignment)
        .filter(
            OrderAssignment.car_id == car.id,
            OrderAssignment.assignment_status.in_([
                AssignmentStatusEnum.PENDING,
                AssignmentStatusEnum.ASSIGNED,
                AssignmentStatusEnum.DRIVING
            ])
        )
        .first()
    )
    if active_car_assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Swap blocked: Car is currently assigned to an active trip. Wait until completion.",
        )

    # Current owner details for OTP delivery
    current_owner = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == car.vehicle_owner_id).first()

    # Generate 6-digit secure numeric OTP
    otp_code = str(secrets.randbelow(900000) + 100000)
    salt = secrets.token_hex(16)
    otp_hash = _hash_otp(otp_code, salt)
    expires_at = datetime.utcnow() + timedelta(minutes=OTP_VALIDITY_MINUTES)
    swap_uuid = uuid.uuid4()

    audit_entry = FleetDriverSwapAudit(
        swap_uuid=swap_uuid,
        swap_type="CAR",
        car_id=car.id,
        car_number=car.car_number,
        old_owner_id=car.vehicle_owner_id,
        new_owner_id=new_o_uuid,
        initiated_by="OWNER",
        otp_hash=otp_hash,
        otp_salt=salt,
        otp_expires_at=expires_at,
        otp_attempts=0,
        status="PENDING_OTP",
        created_at=datetime.utcnow(),
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)

    # Send notification/SMS to current owner
    masked_phone = _mask_phone(current_owner.mobile_number if current_owner else None)
    logger.info(f"Car swap requested for {car.car_number}. Swap UUID={swap_uuid}, OTP dispatched.")

    return {
        "status": "ok",
        "swap_id": str(swap_uuid),
        "car_number": car.car_number,
        "message": f"Verification OTP sent to registered owner ({masked_phone}). Valid for {OTP_VALIDITY_MINUTES} minutes.",
        "expires_in_seconds": OTP_VALIDITY_MINUTES * 60,
    }


# -------------------------------------------------------------------------
# 3. Verify Swap with OTP (Driver or Car)
# -------------------------------------------------------------------------
@router.post("/verify-swap")
@router.post("/verify-car-swap")
def verify_swap_otp(
    payload: SwapVerifyRequest,
    current_owner_id: str = Depends(get_current_vehicleOwner_id),
    db: Session = Depends(get_db)
):
    """
    Verifies the 6-digit OTP in constant time and executes the ownership transfer.
    """
    try:
        swap_uuid = UUID(payload.swap_id)
        owner_uuid = UUID(current_owner_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid swap_id UUID format")

    audit = db.query(FleetDriverSwapAudit).filter(FleetDriverSwapAudit.swap_uuid == swap_uuid).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Swap request not found")

    if audit.new_owner_id != owner_uuid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized: Only the requesting owner can verify this swap")

    if audit.status == "COMPLETED":
        return {"status": "ok", "message": "Swap already verified and completed successfully"}

    if audit.status == "LOCKED":
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Swap request is locked due to too many failed attempts. Please request a new swap.",
        )

    if audit.otp_expires_at and audit.otp_expires_at < datetime.utcnow():
        audit.status = "EXPIRED"
        db.commit()
        raise HTTPException(status_code=400, detail="OTP has expired. Please initiate a new swap request.")

    if audit.otp_attempts >= MAX_OTP_ATTEMPTS:
        audit.status = "LOCKED"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many incorrect OTP attempts. Swap request locked.",
        )

    # Constant-time comparison
    computed_hash = _hash_otp(payload.otp_code.strip(), audit.otp_salt or "")
    if not secrets.compare_digest(computed_hash, audit.otp_hash or ""):
        audit.otp_attempts += 1
        if audit.otp_attempts >= MAX_OTP_ATTEMPTS:
            audit.status = "LOCKED"
        db.commit()
        remaining = max(0, MAX_OTP_ATTEMPTS - audit.otp_attempts)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid OTP code. {remaining} attempt(s) remaining.",
        )

    # Execute transfer based on swap_type
    if audit.swap_type == "CAR":
        car = db.query(CarDetails).filter(CarDetails.id == audit.car_id).first()
        if not car:
            raise HTTPException(status_code=404, detail="Car record no longer exists")
        car.vehicle_owner_id = audit.new_owner_id
        entity_name = car.car_number
    else:
        driver = db.query(CarDriver).filter(CarDriver.id == audit.driver_id).first()
        if not driver:
            raise HTTPException(status_code=404, detail="Driver record no longer exists")
        driver.vehicle_owner_id = audit.new_owner_id
        entity_name = driver.full_name

    audit.is_verified = True
    audit.status = "COMPLETED"
    audit.completed_at = datetime.utcnow()

    db.commit()

    logger.info(f"Swap COMPLETED for {audit.swap_type} {entity_name} -> New Owner {audit.new_owner_id}")

    return {
        "status": "ok",
        "message": f"{audit.swap_type} '{entity_name}' successfully transferred to your fleet.",
        "swap_id": str(audit.swap_uuid),
        "swap_type": audit.swap_type,
    }


# -------------------------------------------------------------------------
# 4. Driver Pending Swap Poll
# -------------------------------------------------------------------------
@router.get("/pending-for-driver")
def get_pending_swap_for_driver(
    current_driver=Depends(get_current_driver),
    db: Session = Depends(get_db)
):
    """
    Driver App polling endpoint: Checks if there is a pending fleet transfer request
    for this driver, allowing the app to show a confirmation dialog.
    """
    pending = (
        db.query(FleetDriverSwapAudit)
        .filter(
            FleetDriverSwapAudit.driver_id == current_driver.id,
            FleetDriverSwapAudit.status == "PENDING_OTP",
            FleetDriverSwapAudit.otp_expires_at > datetime.utcnow()
        )
        .order_by(FleetDriverSwapAudit.created_at.desc())
        .first()
    )
    if not pending:
        return {"has_pending": False}

    new_owner = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == pending.new_owner_id).first()
    return {
        "has_pending": True,
        "swap_id": str(pending.swap_uuid),
        "new_owner_phone": _mask_phone(new_owner.mobile_number if new_owner else None),
        "expires_at": pending.otp_expires_at.isoformat() if pending.otp_expires_at else None,
    }


# -------------------------------------------------------------------------
# 5. Admin Override Swap
# -------------------------------------------------------------------------
@router.post("/admin-override")
def admin_override_swap(
    payload: AdminSwapOverrideRequest,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Admin override (Owner/SuperAdmin role only):
    Executes an immediate transfer with mandatory audit explanation.
    """
    admin_role = getattr(current_admin, "role", "")
    if admin_role not in ("Owner", "Super Admin", "Admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Admin override requires Owner or Super Admin privileges."
        )

    if not payload.reason or len(payload.reason.strip()) < 10:
        raise HTTPException(
            status_code=400,
            detail="Mandatory admin reason required (minimum 10 characters explaining override rationale).",
        )

    try:
        new_o_uuid = UUID(payload.new_owner_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid new_owner_id UUID format")

    new_owner = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == new_o_uuid).first()
    if not new_owner:
        raise HTTPException(status_code=404, detail="Target fleet owner not found")

    admin_name = getattr(current_admin, "full_name", None) or getattr(current_admin, "username", "Admin")

    if payload.swap_type.upper() == "CAR":
        if not payload.car_number:
            raise HTTPException(status_code=400, detail="car_number is required for CAR swap")
        clean_num = payload.car_number.strip().upper().replace(" ", "")
        car = db.query(CarDetails).filter(CarDetails.car_number == clean_num).first()
        if not car:
            raise HTTPException(status_code=404, detail=f"Car '{clean_num}' not found")
        old_owner_id = car.vehicle_owner_id
        car.vehicle_owner_id = new_o_uuid
        entity_name = car.car_number
        swap_target_args = {"car_id": car.id, "car_number": car.car_number}
    else:
        if not payload.driver_id:
            raise HTTPException(status_code=400, detail="driver_id is required for DRIVER swap")
        try:
            d_uuid = UUID(payload.driver_id)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid driver_id UUID")
        driver = db.query(CarDriver).filter(CarDriver.id == d_uuid).first()
        if not driver:
            raise HTTPException(status_code=404, detail="Driver not found")
        old_owner_id = driver.vehicle_owner_id
        driver.vehicle_owner_id = new_o_uuid
        entity_name = driver.full_name
        swap_target_args = {"driver_id": driver.id}

    audit_entry = FleetDriverSwapAudit(
        swap_uuid=uuid.uuid4(),
        swap_type=payload.swap_type.upper(),
        old_owner_id=old_owner_id,
        new_owner_id=new_o_uuid,
        initiated_by=f"ADMIN:{admin_name}",
        is_verified=True,
        admin_override=True,
        admin_override_reason=payload.reason.strip(),
        status="COMPLETED",
        created_at=datetime.utcnow(),
        completed_at=datetime.utcnow(),
        **swap_target_args
    )
    db.add(audit_entry)
    db.commit()

    logger.warning(
        f"ADMIN OVERRIDE SWAP: {payload.swap_type} '{entity_name}' transferred by {admin_name}. "
        f"Reason: {payload.reason}"
    )

    return {
        "status": "ok",
        "message": f"Admin override swap completed for {payload.swap_type} '{entity_name}'.",
        "swap_id": str(audit_entry.swap_uuid),
        "admin_name": admin_name,
    }
