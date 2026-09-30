from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.car_driver import CarDriver, AccountStatusEnum
from app.schemas.car_driver import CarDriverForm
from app.core.security import get_password_hash
from typing import Optional, List
from uuid import UUID

def create_car_driver(db: Session, driver_data: CarDriverForm) -> CarDriver:
    """Create a new car driver record in the database"""
    
    # Check for duplicate primary number
    existing_primary = db.query(CarDriver).filter(
        CarDriver.primary_number == driver_data.primary_number
    ).first()

    if existing_primary:
        raise HTTPException(
            status_code=400, 
            detail=f"Driver with primary number {driver_data.primary_number} is already registered. Please use a different number."
        )

    # Check for duplicate secondary number
    existing_secondary = db.query(CarDriver).filter(
        CarDriver.secondary_number == driver_data.secondary_number
    ).first()


    # Check for duplicate license number
    existing_license = db.query(CarDriver).filter(
        CarDriver.licence_number == driver_data.licence_number
    ).first()

    if existing_license:
        raise HTTPException(
            status_code=400, 
            detail=f"Driver with license number {driver_data.licence_number} is already registered. Please use a different license number."
        )

    # Hash password
    hashed_password = get_password_hash(driver_data.password)

    from app.crud.document_expiry import parse_expiry
    licence_expiry = parse_expiry(getattr(driver_data, "licence_expiry_date", None))

    # Create car driver object
    car_driver = CarDriver(
        vehicle_owner_id=driver_data.vehicle_owner_id,
        full_name=driver_data.full_name,
        primary_number=driver_data.primary_number,
        secondary_number=driver_data.secondary_number,
        hashed_password=hashed_password,
        licence_number=driver_data.licence_number,
        licence_expiry_date=licence_expiry,
        licence_front_img=None,  # Will be updated after GCS upload
        address=driver_data.address,
        city=driver_data.city,
        pincode=driver_data.pincode,
        driver_status=AccountStatusEnum.PROCESSING,  # Explicitly set the enum value
        is_owner_driver=getattr(driver_data, "is_owner_driver", False),
    )

    db.add(car_driver)

    # Human-friendly registration number (never blocks signup on failure)
    from app.utils.reg_id import assign_reg_id
    assign_reg_id(db, car_driver)

    db.commit()
    db.refresh(car_driver)

    return car_driver

def update_driver_license_image(db: Session, driver_id: UUID, license_img_url: str, status=None) -> CarDriver:
    """Update the license front image URL for an existing car driver record.
    `status` lets the caller pass the OCR auto-verification result
    (get_auto_verified_status) instead of always defaulting to PENDING -
    optional so every other existing caller keeps working unchanged."""
    from app.models.common_enums import DocumentStatusEnum

    driver = db.query(CarDriver).filter(
        CarDriver.id == driver_id
    ).first()

    if not driver:
        raise HTTPException(
            status_code=404,
            detail=f"Car driver not found for ID: {driver_id}"
        )

    driver.licence_front_img = license_img_url
    driver.licence_front_status = status or DocumentStatusEnum.PENDING
    db.commit()
    db.refresh(driver)

    return driver


def update_driver_license_back_image(db: Session, driver_id: UUID, license_back_img_url: str, status=None) -> CarDriver:
    """Update the optional license back image URL for an existing car driver
    record. See update_driver_license_image's `status` param docstring."""
    from app.models.common_enums import DocumentStatusEnum

    driver = db.query(CarDriver).filter(
        CarDriver.id == driver_id
    ).first()

    if not driver:
        raise HTTPException(
            status_code=404,
            detail=f"Car driver not found for ID: {driver_id}"
        )

    driver.licence_back_img = license_back_img_url
    driver.licence_back_status = status or DocumentStatusEnum.PENDING
    db.commit()
    db.refresh(driver)

    return driver


def update_driver_profile_image(db: Session, driver_id: UUID, profile_img_url: str) -> CarDriver:
    """Update the live profile photo (selfie) URL for an existing car
    driver record - added 2026-09-04 for the Aadhaar/licence photo vs
    profile-pic face-match feature (see utils/document_verifier.py's
    compare_faces). No status column - this isn't a KYC document reviewed
    for VERIFIED/INVALID, just a photo used for the face-match check."""
    driver = db.query(CarDriver).filter(
        CarDriver.id == driver_id
    ).first()

    if not driver:
        raise HTTPException(
            status_code=404,
            detail=f"Car driver not found for ID: {driver_id}"
        )

    driver.profile_img = profile_img_url
    db.commit()
    db.refresh(driver)

    return driver


def get_driver_by_id(db: Session, driver_id: UUID) -> Optional[CarDriver]:
    """Get car driver by ID"""
    return db.query(CarDriver).filter(CarDriver.id == driver_id).first()


def get_driver_by_mobile(db: Session, mobile_number: str) -> Optional[CarDriver]:
    """Get car driver by mobile number"""
    return db.query(CarDriver).filter(
        (CarDriver.primary_number == mobile_number) | 
        (CarDriver.secondary_number == mobile_number)
    ).first()

def search_driver_for_vendor(db: Session, query: str) -> Optional[dict]:
    results = search_drivers_and_owners_for_vendor(db, query)
    return results[0] if results else None


def search_drivers_and_owners_for_vendor(db: Session, query: str) -> List[dict]:
    """Search registered drivers and vehicle owners by name, phone number, or registration ID."""
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from sqlalchemy import or_

    query = (query or "").strip()
    if not query:
        return []

    clean_digits = "".join([c for c in query if c.isdigit()])
    pattern = f"%{query}%"

    results = []
    seen_ids = set()

    # 1. Search VehicleOwnerDetails (Owners / Owner-Drivers)
    vo_filters = [VehicleOwnerDetails.full_name.ilike(pattern)]
    if clean_digits:
        digit_pattern = f"%{clean_digits}%"
        vo_filters.append(VehicleOwnerDetails.primary_number.ilike(digit_pattern))

    owners = db.query(VehicleOwnerDetails).filter(or_(*vo_filters)).limit(20).all()
    for o in owners:
        oid = str(o.vehicle_owner_id or o.id)
        if oid not in seen_ids:
            seen_ids.add(oid)
            results.append({
                "id": oid,
                "full_name": o.full_name,
                "primary_number": o.primary_number,
                "reg_id": oid[:8],
                "wallet_balance": getattr(o, "wallet_balance", 0) or 0,
                "type": "VEHICLE_OWNER",
                "status": "AVAILABLE",
            })

    # 2. Search CarDriver
    cd_filters = [
        CarDriver.full_name.ilike(pattern),
    ]
    if hasattr(CarDriver, "reg_id"):
        cd_filters.append(CarDriver.reg_id.ilike(pattern))
    if clean_digits:
        digit_pattern = f"%{clean_digits}%"
        cd_filters.append(CarDriver.primary_number.ilike(digit_pattern))
        if hasattr(CarDriver, "secondary_number"):
            cd_filters.append(CarDriver.secondary_number.ilike(digit_pattern))

    drivers = db.query(CarDriver).filter(or_(*cd_filters)).limit(20).all()
    for d in drivers:
        did = str(d.id)
        if did not in seen_ids:
            seen_ids.add(did)
            vo = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == d.vehicle_owner_id).first()
            status_str = d.driver_status.value if hasattr(d.driver_status, "value") else str(d.driver_status or "AVAILABLE")
            results.append({
                "id": did,
                "full_name": d.full_name,
                "primary_number": d.primary_number,
                "reg_id": getattr(d, "reg_id", None) or did[:8],
                "wallet_balance": getattr(vo, "wallet_balance", 0) if vo else 0,
                "type": "DRIVER",
                "status": status_str,
            })

    return results


def get_drivers_by_vehicleOwner_id(db: Session, vehicle_owner_id: str) -> List[CarDriver]:
    import uuid
    try:
        vo_uuid = uuid.UUID(str(vehicle_owner_id))
        return db.query(CarDriver).filter(
            (CarDriver.vehicle_owner_id == vo_uuid) | (CarDriver.vehicle_owner_id == str(vehicle_owner_id))
        ).all()
    except Exception:
        return db.query(CarDriver).filter(CarDriver.vehicle_owner_id == vehicle_owner_id).all()


def get_available_drivers(db: Session, vehicle_owner_id: str) -> List[CarDriver]:
    """Get all available drivers with ONLINE status for a fleet owner.
    The owner's own self-driver record (is_owner_driver=True - see the
    "Duty" self-assignment feature) is sorted first, so when a fleet
    owner is assigning themselves to a booking, their own name is the
    first option rather than buried among their duty drivers."""
    from app.models.car_driver import AccountStatusEnum
    # Every driver the owner can actually assign - NOT just the ones currently ONLINE. A driver is normally off duty
    # until the trip day, so requiring ONLINE left the "Select Driver" list empty until someone switched Duty on.
    # Blocked drivers stay out (the assign endpoint still enforces document verification).
    rows = db.query(CarDriver).filter(
        CarDriver.vehicle_owner_id == vehicle_owner_id,
        CarDriver.driver_status != AccountStatusEnum.BLOCKED,
        CarDriver.permanently_blocked.isnot(True),
    ).all()
    _rank = {AccountStatusEnum.ONLINE: 0, AccountStatusEnum.DRIVING: 1}
    rows.sort(key=lambda d: (0 if d.is_owner_driver else 1, _rank.get(d.driver_status, 2)))
    return rows

def authenticate_driver(db: Session, primary_number: str, password: str) -> Optional[CarDriver]:
    """Authenticate driver by primary number and password"""
    from app.core.security import verify_password
    
    driver = db.query(CarDriver).filter(CarDriver.primary_number == primary_number).first()
    
    if not driver:
        return None
    
    if not verify_password(password, driver.hashed_password):
        return None
    
    return driver

def update_driver_status(db: Session, driver_id: UUID, new_status: AccountStatusEnum) -> CarDriver:
    """Update driver's online/offline status with validation"""
    driver = db.query(CarDriver).filter(CarDriver.id == driver_id).first()
    
    if not driver:
        raise HTTPException(
            status_code=404, 
            detail=f"Driver not found for ID: {driver_id}"
        )
    
    current_status = driver.driver_status
    
    if current_status == AccountStatusEnum.BLOCKED:
        raise HTTPException(
            status_code=403,
            detail="Driver account is blocked. Cannot change status."
        )

    # If driver is already in the target status, return driver without error (idempotent)
    if current_status == new_status:
        return driver
    
    driver.driver_status = new_status
    db.commit()
    db.refresh(driver)
    
    return driver

def get_all_drivers(db: Session, vehicle_owner_id: str) -> List[CarDriver]:
    """Get all available drivers with ONLINE status for a fleet owner"""
    from app.models.car_driver import AccountStatusEnum
    return db.query(CarDriver).filter(
        CarDriver.vehicle_owner_id == vehicle_owner_id
    ).all()