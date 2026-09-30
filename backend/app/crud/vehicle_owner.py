from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.vehicle_owner import VehicleOwnerCredentials
from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.schemas.vehicle_owner import VehicleOwnerBase, VehicleOwnerForm, UserLogin
from app.core.security import get_password_hash, verify_password
from typing import Optional
from uuid import UUID

def create_user(db: Session, user_in: VehicleOwnerForm) -> VehicleOwnerCredentials:
    # Check for duplicate primary number in main vehicle_owner table
    existing_user = db.query(VehicleOwnerCredentials).filter(
        VehicleOwnerCredentials.primary_number == user_in.primary_number
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400, 
            detail=f"Mobile number {user_in.primary_number} is already registered. Please use a different number."
        )

    # Check for duplicate secondary number (only if provided)
    if user_in.secondary_number:
        existing_secondary = db.query(VehicleOwnerDetails).filter(
            VehicleOwnerDetails.secondary_number == user_in.secondary_number
        ).first()
        if existing_secondary:
            raise HTTPException(
                status_code=400,
                detail=f"Secondary mobile number {user_in.secondary_number} is already registered. Please use a different number."
            )



    # Check for duplicate Aadhar number
    existing_aadhar = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.aadhar_number == user_in.aadhar_number
    ).first()
    if existing_aadhar:
        raise HTTPException(
            status_code=400,
            detail=f"Aadhar number {user_in.aadhar_number} is already registered. Please use a different number."
        )

    # Check for duplicate email (if provided)
    if user_in.email:
        clean_email = user_in.email.strip().lower()
        from sqlalchemy import func
        existing_email = db.query(VehicleOwnerCredentials).filter(
            func.lower(VehicleOwnerCredentials.email) == clean_email
        ).first()
        if existing_email:
            raise HTTPException(
                status_code=400,
                detail=f"Email address {clean_email} is already registered. Please use a different email or log in."
            )

    # Check for duplicate PAN number (if provided)
    if getattr(user_in, 'pan_number', None):
        clean_pan = user_in.pan_number.strip().upper()
        existing_pan = db.query(VehicleOwnerDetails).filter(
            VehicleOwnerDetails.pan_number == clean_pan
        ).first()
        if existing_pan:
            raise HTTPException(
                status_code=400,
                detail=f"PAN number {clean_pan} is already registered. Please use a different PAN number or log in."
            )

    # Step 1: Hash password
    hashed_password = get_password_hash(user_in.password)

    # Step 2: Create credentials object
    credentials = VehicleOwnerCredentials(
        primary_number=user_in.primary_number,
        hashed_password=hashed_password,
        account_status="ACTIVE",
        email=getattr(user_in, "email", None),
    )

    db.add(credentials)
    db.flush()  # Important: So we get credentials.id before commit

    # Human-friendly registration number (never blocks signup on failure)
    from app.utils.reg_id import assign_reg_id
    assign_reg_id(db, credentials)

    # Step 3: Create details object (without aadhar_front_img initially)
    details = VehicleOwnerDetails(
        vehicle_owner_id=credentials.id,
        full_name=user_in.full_name,
        primary_number=user_in.primary_number,
        secondary_number=user_in.secondary_number,
        wallet_balance=0,
        aadhar_number=user_in.aadhar_number,
        aadhar_front_img=None,  # Will be updated after GCS upload
        pan_number=getattr(user_in, "pan_number", None),
        address=(user_in.address.strip() if user_in.address and user_in.address.strip() else user_in.city),
        city=user_in.city,
        pincode=user_in.pincode
    )

    try:
        db.add(details)
        db.commit()
        db.refresh(credentials)
    except Exception as commit_err:
        db.rollback()
        # This used to swallow the real DB error and always show a generic
        # "already exists" message, even when the actual cause was unrelated
        # (a schema mismatch, a poisoned transaction from an earlier failed
        # statement, etc). Found 2026-09-23: every fresh signup - including
        # ones with guaranteed-unique phone/email/aadhar/pan - was failing
        # with this same misleading message, hiding the real root cause.
        import logging
        logging.getLogger(__name__).error("Signup commit failed: %s", commit_err, exc_info=True)
        raise HTTPException(
            status_code=400,
            detail="Registration failed: An account with this mobile number, email, Aadhaar, or PAN already exists."
        )

    return credentials


def update_aadhar_image(db: Session, vehicle_owner_id: UUID, aadhar_img_url: str, status=None) -> VehicleOwnerDetails:
    """Update the aadhar_front_img URL for an existing fleet owner.
    `status` lets the caller pass the OCR auto-verification result instead
    of always defaulting to PENDING - optional for backward compatibility."""
    from app.models.common_enums import DocumentStatusEnum

    details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).first()

    if not details:
        raise HTTPException(
            status_code=404,
            detail=f"Fleet owner details not found for ID: {vehicle_owner_id}"
        )

    details.aadhar_front_img = aadhar_img_url
    details.aadhar_status = status or DocumentStatusEnum.PENDING
    db.commit()
    db.refresh(details)

    return details


def update_optional_kyc_images(
    db: Session,
    vehicle_owner_id: UUID,
    aadhar_back_img_url: str = None,
    pan_img_url: str = None,
    aadhar_back_status=None,
    pan_status=None,
) -> VehicleOwnerDetails:
    """Update the optional aadhar_back_img / pan_img URLs, if provided.
    aadhar_back_status/pan_status let the caller pass the OCR
    auto-verification result instead of always defaulting to PENDING."""
    from app.models.common_enums import DocumentStatusEnum

    details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).first()

    if not details:
        raise HTTPException(
            status_code=404,
            detail=f"Fleet owner details not found for ID: {vehicle_owner_id}"
        )

    if aadhar_back_img_url:
        details.aadhar_back_img = aadhar_back_img_url
        details.aadhar_back_status = aadhar_back_status or DocumentStatusEnum.PENDING
    if pan_img_url:
        details.pan_img = pan_img_url
        details.pan_status = pan_status or DocumentStatusEnum.PENDING

    db.commit()
    db.refresh(details)
    return details

# def create_user(db: Session, user_in: VehicleOwnerBase) -> VehicleOwner:
#     existing_user = db.query(VehicleOwner).filter(VehicleOwner.mobile_number == user_in.mobile_number).first()
#     if existing_user:
#         raise HTTPException(status_code=400, detail="User Number already registered")

#     hashed_password = get_password_hash(user_in.password)
#     db_user = VehicleOwner(
#         full_name=user_in.full_name,
#         mobile_number=user_in.mobile_number,
#         hashed_password=hashed_password,
#     )
#     db.add(db_user)
#     db.commit()
#     db.refresh(db_user)
#     return db_user

# def get_user(db: Session, user_id: int) -> Optional[User]:
#     return db.query(User).filter(User.id == user_id).first()


def get_user_by_mobile(db: Session, mobile_number: str) -> Optional[VehicleOwnerCredentials]:
    return db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.primary_number == mobile_number).first()


def authenticate_user(db: Session, login_data: UserLogin) -> Optional[VehicleOwnerCredentials]:
    user = get_user_by_mobile(db, login_data.mobile_number)
    if not user or not verify_password(login_data.password, user.hashed_password):
        return None
    return user


def get_vehicle_owner_counts(db: Session, vehicle_owner_id: UUID):
    """Get counts of car_driver and car_details records for a fleet owner"""
    from app.models.car_driver import CarDriver
    from app.models.car_details import CarDetails
    
    # Count car_driver records with matching vehicle_owner_id
    car_driver_count = db.query(CarDriver).filter(
        CarDriver.vehicle_owner_id == vehicle_owner_id
    ).count()
    
    # Count car_details records with matching vehicle_owner_id
    car_details_count = db.query(CarDetails).filter(
        CarDetails.vehicle_owner_id == vehicle_owner_id
    ).count()
    
    return {
        "car_driver_count": car_driver_count,
        "car_details_count": car_details_count
    }


# def update_user(db: Session, user_id: int, user_update: UserUpdate) -> User:
#     user = get_user(db, user_id)
#     if not user:
#         raise HTTPException(status_code=404, detail="User not found")

#     # Update fields except password by default
#     update_data = user_update.dict(exclude_unset=True)
#     if "password" in update_data:
#         update_data["hashed_password"] = get_password_hash(update_data.pop("password"))

#     for key, value in update_data.items():
#         setattr(user, key, value)

#     db.commit()
#     db.refresh(user)
#     return user

# def delete_user(db: Session, user_id: int):
#     user = get_user(db, user_id)
#     if not user:
#         raise HTTPException(status_code=404, detail="User not found")
#     db.delete(user)
#     db.commit()
# Note: this used to be shadowed by a second, dead `get_vehicle_owner_by_id`
# defined earlier in this file (returning VehicleOwnerCredentials instead) -
# Python silently let the later definition win, so every caller (including
# get_current_user in core/security.py) has always received a
# VehicleOwnerDetails row here, never the credentials row its own type hint
# claimed. The dead duplicate was removed; if you need the credentials row,
# use get_vehicle_owner_credentails_by_id below instead of adding a new
# same-named function here.
def get_vehicle_owner_by_id(db: Session, vehicle_owner_id: UUID):
    return db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).first()
    
def get_vehicle_owner_credentails_by_id(db: Session, vehicle_owner_id: UUID):
    return db.query(VehicleOwnerCredentials).filter(
        VehicleOwnerCredentials.id == vehicle_owner_id
    ).first()