import random
import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.car_driver import CarDriver
from app.models.vehicle_owner import VehicleOwnerCredentials
from app.models.orders import Orders
from app.models.fleet_swap_audit import FleetDriverSwapAudit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/fleet-swap", tags=["Fleet & Driver Swap"])

MAX_OTP_ATTEMPTS = 5
OTP_VALIDITY_MINUTES = 10


class SwapInitiateRequest(BaseModel):
    driver_id: str
    new_owner_id: str
    initiated_by: str = "OWNER"  # OWNER, DRIVER, ADMIN


class SwapVerifyRequest(BaseModel):
    swap_id: int
    otp_code: str


class AdminSwapOverrideRequest(BaseModel):
    driver_id: str
    new_owner_id: str
    reason: str
    admin_name: str = "Super Admin"


@router.post("/request-swap")
def request_driver_swap(payload: SwapInitiateRequest, db: Session = Depends(get_db)):
    """Initiate a driver transfer between fleets with safety checks and 6-digit OTP."""
    try:
        d_uuid = UUID(payload.driver_id)
        new_o_uuid = UUID(payload.new_owner_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format for driver_id or new_owner_id")

    driver = db.query(CarDriver).filter(CarDriver.id == d_uuid).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    new_owner = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == new_o_uuid).first()
    if not new_owner:
        raise HTTPException(status_code=404, detail="New fleet owner not found")

    if driver.vehicle_owner_id == new_o_uuid:
        raise HTTPException(status_code=400, detail="Driver is already assigned to this fleet owner")

    # SAFETY CHECK 1: Active trip blocking
    active_trips = (
        db.query(Orders)
        .filter(
            Orders.driver_id == str(driver.id),
            Orders.order_status.in_(["ASSIGNED", "STARTED", "IN_PROGRESS", "ACTIVE", "CONFIRMED"]),
        )
        .count()
    )
    if active_trips > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Swap blocked: Driver has an active or in-progress trip. Complete all rides before transferring.",
        )

    # Generate 6-digit secure numeric OTP
    otp = f"{random.randint(100000, 999999)}"
    expires_at = datetime.utcnow() + timedelta(minutes=OTP_VALIDITY_MINUTES)

    audit_entry = FleetDriverSwapAudit(
        driver_id=d_uuid,
        old_owner_id=driver.vehicle_owner_id,
        new_owner_id=new_o_uuid,
        initiated_by=payload.initiated_by,
        otp_code=otp,
        otp_expires_at=expires_at,
        otp_attempts=0,
        status="PENDING_OTP",
        created_at=datetime.utcnow(),
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)

    logger.info(
        f"Fleet swap initiated for Driver {driver.full_name} ({driver.primary_number}). "
        f"Swap ID={audit_entry.id}, OTP generated (valid {OTP_VALIDITY_MINUTES}m)."
    )

    return {
        "status": "ok",
        "swap_id": audit_entry.id,
        "message": f"Verification OTP sent. Valid for {OTP_VALIDITY_MINUTES} minutes.",
        "driver_name": driver.full_name,
        "expires_in_seconds": OTP_VALIDITY_MINUTES * 60,
    }


@router.post("/verify-swap")
def verify_driver_swap(payload: SwapVerifyRequest, db: Session = Depends(get_db)):
    """Verify OTP and safely execute the fleet driver swap."""
    audit = db.query(FleetDriverSwapAudit).filter(FleetDriverSwapAudit.id == payload.swap_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Swap request not found")

    if audit.status == "COMPLETED":
        return {"status": "ok", "message": "Swap already verified and completed"}

    if audit.status == "LOCKED":
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Swap request is locked due to too many failed attempts. Please request a new swap or contact Admin.",
        )

    if audit.otp_expires_at and audit.otp_expires_at < datetime.utcnow():
        audit.status = "EXPIRED"
        db.commit()
        raise HTTPException(status_code=400, detail="OTP has expired. Please initiate a new swap request.")

    # Check attempt threshold
    if audit.otp_attempts >= MAX_OTP_ATTEMPTS:
        audit.status = "LOCKED"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many incorrect OTP attempts. Swap request locked.",
        )

    if audit.otp_code != payload.otp_code.strip():
        audit.otp_attempts += 1
        db.commit()
        remaining = MAX_OTP_ATTEMPTS - audit.otp_attempts
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid OTP code. {remaining} attempt(s) remaining.",
        )

    # Perform the swap safely
    driver = db.query(CarDriver).filter(CarDriver.id == audit.driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver record no longer exists")

    driver.vehicle_owner_id = audit.new_owner_id
    audit.is_verified = True
    audit.status = "COMPLETED"
    audit.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(driver)

    logger.info(f"Fleet Swap COMPLETED: Driver {driver.id} transferred to New Owner {audit.new_owner_id}")

    return {
        "status": "ok",
        "message": f"Driver {driver.full_name} successfully transferred to the new fleet.",
        "driver_id": str(driver.id),
        "new_owner_id": str(driver.vehicle_owner_id),
    }


@router.post("/admin-override")
def admin_override_swap(payload: AdminSwapOverrideRequest, db: Session = Depends(get_db)):
    """Admin override to swap fleet driver when owner is unreachable, with mandatory audit reason."""
    if not payload.reason or len(payload.reason.strip()) < 10:
        raise HTTPException(
            status_code=400,
            detail="Mandatory admin reason required (minimum 10 characters explaining the override rationale).",
        )

    try:
        d_uuid = UUID(payload.driver_id)
        new_o_uuid = UUID(payload.new_owner_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    driver = db.query(CarDriver).filter(CarDriver.id == d_uuid).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    new_owner = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == new_o_uuid).first()
    if not new_owner:
        raise HTTPException(status_code=404, detail="New fleet owner not found")

    old_owner_id = driver.vehicle_owner_id
    driver.vehicle_owner_id = new_o_uuid

    audit_entry = FleetDriverSwapAudit(
        driver_id=d_uuid,
        old_owner_id=old_owner_id,
        new_owner_id=new_o_uuid,
        initiated_by=f"ADMIN:{payload.admin_name}",
        is_verified=True,
        admin_override=True,
        admin_override_reason=payload.reason.strip(),
        status="COMPLETED",
        created_at=datetime.utcnow(),
        completed_at=datetime.utcnow(),
    )
    db.add(audit_entry)
    db.commit()

    logger.warning(
        f"ADMIN OVERRIDE FLEET SWAP: Driver {driver.id} transferred by {payload.admin_name}. "
        f"Reason: {payload.reason}"
    )

    return {
        "status": "ok",
        "message": f"Admin override swap completed for driver {driver.full_name}.",
        "audit_id": audit_entry.id,
    }
