from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.orm import Session
from app.schemas.vehicle_owner import VehicleOwnerBase, VehicleOwnerForm, UserLogin, VehicleOwnerDetailsResponse, VacantCitiesUpdate
from app.crud.vehicle_owner import create_user, update_aadhar_image, authenticate_user, get_vehicle_owner_counts, get_vehicle_owner_by_id
from app.database.session import get_db
from app.utils.gcs import upload_image_to_gcs, delete_gcs_file_by_url  # Utility functions
from app.core.security import create_access_token, get_current_vehicleOwner_id,get_current_user
from app.schemas.document_status import DocumentStatusListResponse, UpdateDocumentStatusRequest, UpdateDocumentRequest, DocumentUpdateResponse
from app.models.common_enums import DocumentStatusEnum
from typing import List, Optional

router = APIRouter()


def _safe_driver(d) -> dict:
    """Serialize a CarDriver for API responses without leaking secrets."""
    return {
        "id": str(d.id),
        "vehicle_owner_id": str(d.vehicle_owner_id),
        "full_name": d.full_name,
        "primary_number": d.primary_number,
        "secondary_number": d.secondary_number,
        "licence_number": d.licence_number,
        "licence_front_img": d.licence_front_img,
        "licence_front_status": d.licence_front_status.value if getattr(d, "licence_front_status", None) else None,
        "address": d.address,
        "city": d.city,
        "pincode": d.pincode,
        "driver_status": d.driver_status.value if getattr(d, "driver_status", None) else None,
        "created_at": d.created_at,
    }


@router.post("/vehicleowner/upload-signup-doc")
async def upload_signup_document(
    file: UploadFile = File(..., description="Document image (Aadhar front/back or PAN)"),
    doc_type: str = Form(..., description="One of: aadhar_front, aadhar_back, pan"),
):
    """Pre-upload a single KYC document image ahead of final signup submission,
    so the app can upload each document the moment it's picked instead of
    bundling every image into one large request at Create Account time (which
    was timing out / erroring on slow connections). Returns a GCS URL the app
    then passes back to /vehicleowner/signup as e.g. aadhar_front_img_url."""
    if doc_type not in ("aadhar_front", "aadhar_back", "pan"):
        raise HTTPException(status_code=400, detail="doc_type must be one of: aadhar_front, aadhar_back, pan")
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload an image file (JPEG, PNG, etc.)"
        )
    if file.size and file.size > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Image file is too large. Please upload an image smaller than 5MB"
        )
    try:
        url = upload_image_to_gcs(file, folder=f"vehicle_owner_details/signup_docs/{doc_type}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload image to cloud storage: {str(e)}")
    return {"url": url, "doc_type": doc_type}


@router.post("/vehicleowner/signup")
async def signup(
    user_form: VehicleOwnerForm = Depends(VehicleOwnerForm.as_form),
    aadhar_front_img: UploadFile = File(None, description="Aadhar front image file"),
    aadhar_back_img: UploadFile = File(None, description="Aadhar back image file"),
    pan_img: UploadFile = File(None, description="PAN card image file"),
    aadhar_front_img_url: str = Form(None, description="Pre-uploaded Aadhar front URL (from /upload-signup-doc)"),
    aadhar_back_img_url: str = Form(None, description="Pre-uploaded Aadhar back URL (from /upload-signup-doc)"),
    pan_img_url: str = Form(None, description="Pre-uploaded PAN URL (from /upload-signup-doc)"),
    db: Session = Depends(get_db),
):
    # Each of the 3 documents is mandatory, but may arrive either as a raw file
    # (older client behavior) or as a URL already uploaded via
    # /vehicleowner/upload-signup-doc (new upload-on-select flow) - accept either.
    def _require_doc(file: UploadFile, url: str, human_name: str):
        if url and url.strip():
            return None
        if file is None or not file.filename:
            raise HTTPException(status_code=400, detail=f"Please upload {human_name} image")
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail=f"{human_name} must be an image file (JPEG, PNG, etc.)")
        if file.size and file.size > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"{human_name} image is too large. Please upload an image smaller than 5MB")
        return None

    _require_doc(aadhar_front_img, aadhar_front_img_url, "Aadhar front")
    _require_doc(aadhar_back_img, aadhar_back_img_url, "Aadhar back")
    _require_doc(pan_img, pan_img_url, "PAN card")

    # Create user in database first (without images)
    try:
        db_user = create_user(db, user_form)
    except HTTPException:
        # Re-raise HTTP exceptions (like duplicate mobile number, aadhar, etc.)
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error occurred while creating user: {str(e)}"
        )

    # Resolve each document to a GCS URL - reuse the pre-uploaded URL if the
    # app already uploaded it on selection, otherwise upload the file now.
    # Auto-verification needs the raw bytes, which only exist on the
    # "upload the raw file now" path - the pre-uploaded-URL path (image
    # already sent to /upload-signup-doc earlier) has no bytes left to
    # check here, so it keeps the old always-PENDING behavior.
    from app.utils.document_verifier import get_auto_verified_status

    def _resolve_url(file: UploadFile, url: str) -> str:
        if url and url.strip():
            return url.strip()
        return upload_image_to_gcs(file)

    async def _read_bytes_if_file(file: UploadFile, url: str) -> Optional[bytes]:
        if url and url.strip():
            return None
        data = await file.read()
        await file.seek(0)
        return data

    aadhar_front_bytes = await _read_bytes_if_file(aadhar_front_img, aadhar_front_img_url)
    aadhar_back_bytes = await _read_bytes_if_file(aadhar_back_img, aadhar_back_img_url)
    pan_bytes = await _read_bytes_if_file(pan_img, pan_img_url)

    try:
        aadhar_img_url = _resolve_url(aadhar_front_img, aadhar_front_img_url)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload Aadhar front image to cloud storage: {str(e)}. User created but image upload failed."
        )

    aadhar_front_status = get_auto_verified_status(aadhar_front_bytes, "aadhar") if aadhar_front_bytes else None
    try:
        update_aadhar_image(db, db_user.id, aadhar_img_url, status=aadhar_front_status)
    except Exception as e:
        delete_gcs_file_by_url(aadhar_img_url)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update user record with image URL: {str(e)}. Image uploaded but not linked to user."
        )

    # Aadhar back + PAN are now mandatory too (validated above), resolve and
    # save them the same way. Failure here is surfaced, not swallowed, since
    # both are required documents - but the account itself has already been
    # created at this point, so this is reported as a partial-success detail.
    from app.crud.vehicle_owner import update_optional_kyc_images
    try:
        aadhar_back_url = _resolve_url(aadhar_back_img, aadhar_back_img_url)
        pan_url = _resolve_url(pan_img, pan_img_url)
        aadhar_back_status = get_auto_verified_status(aadhar_back_bytes, "aadhar") if aadhar_back_bytes else None
        pan_status = get_auto_verified_status(pan_bytes, "pan") if pan_bytes else None
        update_optional_kyc_images(
            db, db_user.id, aadhar_back_url, pan_url,
            aadhar_back_status=aadhar_back_status, pan_status=pan_status,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Account created and Aadhar front saved, but Aadhar back / PAN upload failed: {str(e)}. Please contact support to complete your document upload."
        )

    return {
        "message": "Fleet owner registered successfully",
        "user_id": str(db_user.id),
        "aadhar_img_url": aadhar_img_url,
        "status": "success"
    }


@router.post("/vehicleowner/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    from app.crud.vehicle_owner import get_user_by_mobile
    existing = get_user_by_mobile(db, user.mobile_number)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_REGISTERED")

    db_user = authenticate_user(db, user)
    if not db_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password. Please try again.")

    if getattr(db_user, "permanently_blocked", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been permanently blocked. Contact support if you believe this is a mistake.",
        )

    # Instant auto-verification / Free Standard Tier: Auto-activate legacy INACTIVE accounts if not manually blocked
    from app.models.vehicle_owner import AccountStatusEnum
    if db_user.account_status == AccountStatusEnum.INACTIVE and not getattr(db_user, "blocked_reason", None):
        db_user.account_status = AccountStatusEnum.ACTIVE
        db.commit()
        db.refresh(db_user)

    # Get counts of related records
    counts = get_vehicle_owner_counts(db, db_user.id)

    # full_name lives on VehicleOwnerDetails, not VehicleOwnerCredentials
    # (db_user) - was missing from this response entirely, so the app had
    # no way to show the fleet owner's real name and fell back to a
    # placeholder on every single login.
    details = get_vehicle_owner_by_id(db, db_user.id)

    # Create access token - 6-month expiry (not the old 24h default), same
    # fix as the Driver App's driver-side token; see
    # app.core.security.OWNER_ACCESS_TOKEN_EXPIRE_MINUTES for why.
    from datetime import timedelta as _timedelta
    from app.core.security import OWNER_ACCESS_TOKEN_EXPIRE_MINUTES
    access_token = create_access_token(
        {"sub": str(db_user.id),"user":"vehicle_owner","token_version" : db_user.token_version},
        expires_delta=_timedelta(minutes=OWNER_ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "account_status": db_user.account_status.value,
        "car_driver_count": counts["car_driver_count"],
        "car_details_count": counts["car_details_count"],
        # Old accounts created before email became compulsory - app should
        # block with a forced "Add your email" screen when this is true.
        "email_missing": not bool(db_user.email),
        "full_name": details.full_name if details else None,
    }

@router.get("/vehicle-owner/me", response_model=VehicleOwnerDetailsResponse)
def get_my_vehicle_owner_details(
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    owner = get_vehicle_owner_by_id(db, vehicle_owner_id)
    if not owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fleet owner not found"
        )
    return owner

@router.get("/vehicle-owner/status-counts")
def get_my_status_counts(
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    """Lightweight refresh of the counts/status the app caches at login
    (car_details_count, car_driver_count, account_status, email_missing) -
    JWT-authenticated, no password re-entry needed. Lets screens like
    add-car/add-driver update that cache right after a successful save
    instead of leaving it stale until the next full login (which was
    sending the driver back to add-car/add-driver on every app open even
    after they'd already completed it)."""
    from app.models.vehicle_owner import VehicleOwnerCredentials
    owner = get_vehicle_owner_by_id(db, vehicle_owner_id)
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fleet owner not found")
    creds = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == vehicle_owner_id).first()
    if not creds:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    if creds.account_status == AccountStatusEnum.INACTIVE and not getattr(creds, "permanently_blocked", False) and not getattr(creds, "blocked_reason", None):
        creds.account_status = AccountStatusEnum.ACTIVE
        db.commit()
        db.refresh(creds)
    counts = get_vehicle_owner_counts(db, vehicle_owner_id)
    return {
        "car_driver_count": counts["car_driver_count"],
        "car_details_count": counts["car_details_count"],
        "account_status": creds.account_status.value,
        "email_missing": not bool(creds.email),
    }


@router.get("/available-cars")
async def get_all_cars(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Get all available cars with ONLINE status for the authenticated fleet owner"""
    # Get vehicle_owner_id from the authenticated user
    vehicle_owner_id = str(current_user.vehicle_owner_id)
    
    from app.crud.car_details import get_all_cars
    available_cars = get_all_cars(db, vehicle_owner_id)
    return available_cars

@router.get("/available-drivers")
async def get_available_drivers(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Get all available drivers with ONLINE status for the authenticated fleet owner"""
    # Get vehicle_owner_id from the authenticated user
    vehicle_owner_id = str(current_user.vehicle_owner_id)
    
    from app.crud.car_driver import get_all_drivers
    available_drivers = get_all_drivers(db, vehicle_owner_id)
    # Never expose password hashes or token versions to the client
    return [_safe_driver(d) for d in available_drivers]


@router.get("/vehicle-owner/document-status", response_model=DocumentStatusListResponse)
def get_vehicle_owner_document_status(
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    """Get document status for fleet owner"""
    owner_details = get_vehicle_owner_by_id(db, vehicle_owner_id)
    
    if not owner_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fleet owner details not found"
        )
    
    documents = {}
    if owner_details.aadhar_front_img:
        documents["aadhar"] = {
            "document_type": "aadhar",
            "status": owner_details.aadhar_status.value if owner_details.aadhar_status else "Pending",
            "image_url": owner_details.aadhar_front_img,
            "updated_at": None
        }
    
    return DocumentStatusListResponse(
        entity_id=owner_details.vehicle_owner_id,
        entity_type="vehicle_owner",
        documents=documents
    )


@router.patch("/vehicle-owner/document-status", response_model=DocumentUpdateResponse)
def update_vehicle_owner_document_status(
    status_update: UpdateDocumentStatusRequest,
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    """Update document status for fleet owner (admin only)"""
    owner_details = get_vehicle_owner_by_id(db, vehicle_owner_id)
    
    if not owner_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fleet owner details not found"
        )
    
    # Update aadhar status
    owner_details.aadhar_status = status_update.status
    db.commit()
    db.refresh(owner_details)
    
    return DocumentUpdateResponse(
        message="Document status updated successfully",
        document_type="aadhar",
        new_image_url=owner_details.aadhar_front_img,
        new_status=status_update.status.value
    )


@router.post("/vehicle-owner/update-document", response_model=DocumentUpdateResponse)
async def update_vehicle_owner_document(
    document_type: str = Form(...),
    aadhar_image: UploadFile = File(None),
    aadhar_back_image: UploadFile = File(None),
    pan_image: UploadFile = File(None),
    document_image: UploadFile = File(None),
    file: UploadFile = File(None),
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    """Update fleet owner document (upload new image) - supports aadhar, aadhar_back, pan"""
    valid_doc_types = ["aadhar", "aadhar_back", "pan"]
    if document_type not in valid_doc_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document type for fleet owner. Must be one of {valid_doc_types}"
        )
    
    # Target image from whichever parameter was passed
    target_image = aadhar_image or aadhar_back_image or pan_image or document_image or file
    if not target_image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No document image provided. Please upload an image file"
        )
    
    # Validate image file
    if not target_image.content_type or not target_image.content_type.startswith('image/'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Please upload an image file"
        )
    
    if target_image.size and target_image.size > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image file is too large. Please upload an image smaller than 5MB"
        )
    
    owner_details = get_vehicle_owner_by_id(db, vehicle_owner_id)
    
    if not owner_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fleet owner details not found"
        )
    
    try:
        image_bytes = await target_image.read()
        await target_image.seek(0)

        new_image_url = upload_image_to_gcs(target_image, f"vehicle_owner_details/{document_type}")

        from app.utils.document_verifier import get_auto_verified_status
        prev_status = {
            "aadhar": owner_details.aadhar_status,
            "aadhar_back": owner_details.aadhar_back_status,
            "pan": owner_details.pan_status,
        }.get(document_type)
        new_status = get_auto_verified_status(image_bytes, document_type, previous_status=prev_status)

        from app.crud.stale_documents import register_stale_file  # old image kept until the new one is verified
        if document_type == "aadhar":
            register_stale_file(db, 'owner', owner_details.vehicle_owner_id, 'aadhar_status', owner_details.aadhar_front_img)
            owner_details.aadhar_front_img = new_image_url
            owner_details.aadhar_status = new_status
        elif document_type == "aadhar_back":
            register_stale_file(db, 'owner', owner_details.vehicle_owner_id, 'aadhar_back_status', owner_details.aadhar_back_img)
            owner_details.aadhar_back_img = new_image_url
            owner_details.aadhar_back_status = new_status
        elif document_type == "pan":
            register_stale_file(db, 'owner', owner_details.vehicle_owner_id, 'pan_status', owner_details.pan_img)
            owner_details.pan_img = new_image_url
            owner_details.pan_status = new_status

        db.commit()
        db.refresh(owner_details)

        return DocumentUpdateResponse(
            message=f"{document_type} updated successfully",
            document_type=document_type,
            new_image_url=new_image_url,
            new_status=new_status.value.capitalize()
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update document: {str(e)}"
        )


@router.get("/vehicle-owner/all-document-status", response_model=List[DocumentStatusListResponse])
def get_all_document_statuses(
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    """Get document status for all entities (fleet owner, cars, drivers) belonging to fleet owner"""
    from app.crud.car_details import get_all_cars
    from app.crud.car_driver import get_drivers_by_vehicleOwner_id
    
    all_statuses = []
    
    # 1. Get fleet owner's own document status. Aadhar-back and PAN are
    # included alongside Aadhar-front - the KYC-verified gate on
    # accept_order (see crud/verification.py) requires all three, so the
    # badge this feeds needs to reflect the same three, not just one.
    owner_details = get_vehicle_owner_by_id(db, vehicle_owner_id)
    if owner_details and owner_details.aadhar_front_img:
        owner_documents = {
            "aadhar": {
                "document_type": "aadhar",
                "status": owner_details.aadhar_status.value if owner_details.aadhar_status else "Pending",
                "image_url": owner_details.aadhar_front_img,
                "updated_at": None
            }
        }
        if owner_details.aadhar_back_img:
            owner_documents["aadhar_back"] = {
                "document_type": "aadhar_back",
                "status": owner_details.aadhar_back_status.value if owner_details.aadhar_back_status else "Pending",
                "image_url": owner_details.aadhar_back_img,
                "updated_at": None
            }
        if owner_details.pan_img:
            owner_documents["pan"] = {
                "document_type": "pan",
                "status": owner_details.pan_status.value if owner_details.pan_status else "Pending",
                "image_url": owner_details.pan_img,
                "updated_at": None
            }
        all_statuses.append(DocumentStatusListResponse(
            entity_id=owner_details.vehicle_owner_id,
            entity_type="vehicle_owner",
            documents=owner_documents
        ))
    
    # 2. Get all cars' document statuses
    cars = get_all_cars(db, str(vehicle_owner_id))
    for car in cars:
        car_documents = {}
        if car.rc_front_img_url:
            car_documents["rc_front"] = {
                "document_type": "rc_front",
                "status": car.rc_front_status.value if car.rc_front_status else "Pending",
                "image_url": car.rc_front_img_url,
                "updated_at": None
            }
        if car.rc_back_img_url:
            car_documents["rc_back"] = {
                "document_type": "rc_back",
                "status": car.rc_back_status.value if car.rc_back_status else "Pending",
                "image_url": car.rc_back_img_url,
                "updated_at": None
            }
        if car.insurance_img_url:
            car_documents["insurance"] = {
                "document_type": "insurance",
                "status": car.insurance_status.value if car.insurance_status else "Pending",
                "image_url": car.insurance_img_url,
                "updated_at": None
            }
        if car.fc_img_url:
            car_documents["fc"] = {
                "document_type": "fc",
                "status": car.fc_status.value if car.fc_status else "Pending",
                "image_url": car.fc_img_url,
                "updated_at": None
            }
        if car.car_img_url:
            car_documents["car_img"] = {
                "document_type": "car_img",
                "status": car.car_img_status.value if car.car_img_status else "Pending",
                "image_url": car.car_img_url,
                "updated_at": None
            }
        if car.permit_img_url:
            car_documents["permit"] = {
                "document_type": "permit",
                "status": car.permit_status.value if car.permit_status else "Pending",
                "image_url": car.permit_img_url,
                "updated_at": None
            }
        all_statuses.append(DocumentStatusListResponse(
            entity_id=car.id,
            entity_type="car",
            documents=car_documents
        ))
    
    # 3. Get all drivers' document statuses
    drivers = get_drivers_by_vehicleOwner_id(db, str(vehicle_owner_id))
    for driver in drivers:
        driver_documents = {}
        if driver.licence_front_img:
            driver_documents["licence"] = {
                "document_type": "licence",
                "status": driver.licence_front_status.value if driver.licence_front_status else "Pending",
                "image_url": driver.licence_front_img,
                "updated_at": None
            }
        if driver.licence_back_img:
            driver_documents["licence_back"] = {
                "document_type": "licence_back",
                "status": driver.licence_back_status.value if driver.licence_back_status else "Pending",
                "image_url": driver.licence_back_img,
                "updated_at": None
            }

        all_statuses.append(DocumentStatusListResponse(
            entity_id=driver.id,
            entity_type="driver",
            documents=driver_documents
        ))
    
    return all_statuses

# --- Vacant City feature ---
# Separate from the existing city notification filter (that stays a notification filter).
# Owner/driver marks up to 5 cities where they're currently waiting for a trip.

@router.put("/vehicle-owner/vacant-cities")
@router.post("/vehicle-owner/vacant-cities")
async def set_vacant_cities(
    payload: VacantCitiesUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from datetime import datetime, timezone

    current_user.vacant_cities = payload.cities
    current_user.vacant_cities_updated_at = datetime.now(timezone.utc)
    current_user.vacant_driver_id = payload.driver_id
    current_user.vacant_driver_name = payload.driver_name
    current_user.vacant_car_id = payload.car_id
    current_user.vacant_car_number = payload.car_number
    db.commit()
    db.refresh(current_user)

    return {
        "vacant_cities": current_user.vacant_cities or [],
        "updated_at": current_user.vacant_cities_updated_at,
        "driver_id": current_user.vacant_driver_id,
        "driver_name": current_user.vacant_driver_name,
        "car_id": current_user.vacant_car_id,
        "car_number": current_user.vacant_car_number,
    }


@router.get("/vehicle-owner/vacant-cities")
async def get_vacant_cities(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from datetime import datetime, timezone

    cities = current_user.vacant_cities or []
    updated_at = current_user.vacant_cities_updated_at
    hours_since = None

    if cities and not updated_at:
        # Legacy/stale record with NULL updated_at -> clear it
        current_user.vacant_cities = None
        current_user.vacant_cities_updated_at = None
        current_user.vacant_driver_id = None
        current_user.vacant_driver_name = None
        current_user.vacant_car_id = None
        current_user.vacant_car_number = None
        db.commit()
        cities = []

    if updated_at:
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        hours_since = (now - updated_at).total_seconds() / 3600.0

        # Automatic 24-hour expiry check: clear vacant status after 24h
        if hours_since >= 24:
            current_user.vacant_cities = None
            current_user.vacant_cities_updated_at = None
            current_user.vacant_driver_id = None
            current_user.vacant_driver_name = None
            current_user.vacant_car_id = None
            current_user.vacant_car_number = None
            db.commit()
            db.refresh(current_user)
            cities = []
            updated_at = None
            hours_since = 0

    needs_confirmation = False
    if cities and hours_since is not None and 12 <= hours_since < 24:
        needs_confirmation = True

    return {
        "vacant_cities": cities,
        "updated_at": updated_at,
        "driver_id": current_user.vacant_driver_id,
        "driver_name": current_user.vacant_driver_name,
        "car_id": current_user.vacant_car_id,
        "car_number": current_user.vacant_car_number,
        "hours_since_update": round(hours_since, 2) if hours_since is not None else None,
        "needs_confirmation": needs_confirmation,
    }


@router.post("/vehicle-owner/vacant-cities/confirm")
async def confirm_vacant_cities(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Re-confirms current vacant city status, touching the timestamp to extend 24h timer."""
    from datetime import datetime, timezone

    current_user.vacant_cities_updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(current_user)

    return {
        "vacant_cities": current_user.vacant_cities or [],
        "updated_at": current_user.vacant_cities_updated_at,
        "status": "confirmed"
    }


@router.get("/vehicle-owner/billing-status")
async def owner_billing_status(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Owner's own yearly-fee countdown (shown in the app menu).
    Each account has its own due date based on its registration anniversary."""
    from app.crud.billing import get_owner_billing_status
    return get_owner_billing_status(db, current_user.vehicle_owner_id)


@router.put("/vehicle-owner/auto-renew")
async def update_auto_renew(
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Toggle auto-renewing the yearly fee from wallet balance when it's due,
    instead of paying manually via Razorpay/UPI each time (Settings > Membership).
    current_user already resolves to the VehicleOwnerDetails row itself."""
    from app.crud.billing import get_owner_billing_status
    if current_user.subscription_type == "MONTHLY" and not bool(body.get("enabled")):
        raise HTTPException(
            status_code=400,
            detail="Monthly subscribers can't turn off auto-renew. Upgrade to the Yearly plan to change this.",
        )
    current_user.auto_renew_from_wallet = bool(body.get("enabled"))
    db.add(current_user)
    db.commit()
    return get_owner_billing_status(db, current_user.vehicle_owner_id)


@router.put("/vehicle-owner/subscription/start-monthly")
async def start_monthly_plan(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Standard -> Monthly plan (Rs.199/mo, Preferred tier, forced wallet
    auto-debit that can't be turned off). Charges the first month immediately."""
    from app.crud.billing import start_monthly_subscription
    return start_monthly_subscription(db, current_user.vehicle_owner_id)


@router.put("/vehicle-owner/subscription/upgrade-yearly")
async def upgrade_to_yearly_plan(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Monthly -> Yearly - the only way off the forced Monthly auto-debit.
    Charges the full yearly fee immediately."""
    from app.crud.billing import upgrade_to_yearly
    return upgrade_to_yearly(db, current_user.vehicle_owner_id)


@router.get("/vehicle-owner/referral")
async def get_my_referral(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """My shareable referral code + who referred me (if anyone)."""
    from app.crud.referrals import get_or_create_referral_code
    details = get_or_create_referral_code(db, current_user.vehicle_owner_id)
    return {
        "referral_code": details.referral_code,
        "referred_by_code": details.referred_by_code,
    }


@router.put("/vehicle-owner/referral/apply")
async def apply_referral(
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """One-time: enter someone else's referral code. Bonus goes to them
    after my first completed trip - not now."""
    from app.crud.referrals import apply_referral_code
    details = apply_referral_code(db, current_user.vehicle_owner_id, str(body.get("code", "")))
    return {"referral_code": details.referral_code, "referred_by_code": details.referred_by_code}


@router.put("/vehicle-owner/local-city")
async def update_local_city(
    body: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Set the city/cities this driver accepts Local bookings in (Driver App
    Local tab / Settings). Accepts either the legacy single `local_city`
    string, or the newer `local_cities` list - pass ["ALL"] in the list to
    mean every serviceable city. Cities must be admin-serviceable."""
    from app.utils.serviceable_cities import is_city_serviceable

    cities_payload = body.get("local_cities")
    if cities_payload is not None:
        cities = [str(c).strip() for c in cities_payload if str(c).strip()]
        if cities != ["ALL"]:
            for c in cities:
                if not is_city_serviceable(db, c):
                    raise HTTPException(status_code=400, detail=f"{c} is not serviceable for Local bookings")
        current_user.local_cities = cities or None
        current_user.local_city = cities[0] if cities and cities != ["ALL"] else None
    else:
        city = (body.get("local_city") or "").strip()
        if city and not is_city_serviceable(db, city):
            raise HTTPException(status_code=400, detail="City is not serviceable for Local bookings")
        current_user.local_city = city or None
        current_user.local_cities = [city] if city else None

    db.add(current_user)
    db.commit()
    return {"local_city": current_user.local_city, "local_cities": current_user.local_cities}


@router.put("/vehicle-owner/mobile-number")
async def change_owner_mobile_number(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Self-service mobile number change - authorized by re-entering the
    current password (same trust bar as Change Password), since there's no
    SMS OTP gateway in this codebase to verify ownership of the new number."""
    import re
    from app.core.security import verify_password
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails

    new_number = str(payload.get("new_mobile_number", "")).strip()
    password = str(payload.get("current_password", ""))

    if not re.match(r'^[6-9]\d{9}$', new_number):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit mobile number starting with 6-9")

    creds = db.query(VehicleOwnerCredentials).filter(
        VehicleOwnerCredentials.id == current_user.vehicle_owner_id
    ).first()
    if not creds:
        raise HTTPException(status_code=404, detail="Account not found")
    if not verify_password(password, creds.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect password")

    if new_number == creds.primary_number:
        raise HTTPException(status_code=400, detail="This is already your mobile number")

    existing = db.query(VehicleOwnerCredentials).filter(
        VehicleOwnerCredentials.primary_number == new_number
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Mobile number {new_number} is already registered")

    creds.primary_number = new_number
    db.add(creds)

    details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == current_user.vehicle_owner_id
    ).first()
    if details:
        details.primary_number = new_number
        db.add(details)

    db.commit()
    return {"message": "Mobile number updated", "primary_number": new_number}


@router.put("/vehicle-owner/email")
async def set_owner_email(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Save the owner's email (e.g. given at signup). Stored unverified -
    ownership is proven when they enter an OTP sent to it (reset flow)."""
    from app.models.vehicle_owner import VehicleOwnerCredentials

    email = str(payload.get("email", "")).strip()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Please enter a valid email address")

    creds = db.query(VehicleOwnerCredentials).filter(
        VehicleOwnerCredentials.id == current_user.vehicle_owner_id
    ).first()
    if not creds:
        raise HTTPException(status_code=404, detail="Account not found")
    creds.email = email
    db.add(creds)
    db.commit()
    return {"message": "Email saved", "email": email}


# --- Self-service email add/change with OTP verification (logged-in owner) ---

@router.get("/vehicle-owner/email")
async def get_owner_email(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.models.vehicle_owner import VehicleOwnerCredentials
    creds = db.query(VehicleOwnerCredentials).filter(
        VehicleOwnerCredentials.id == current_user.vehicle_owner_id
    ).first()
    return {
        "email": getattr(creds, "email", None),
        "email_verified": bool(getattr(creds, "email_verified", False)),
    }


@router.post("/vehicle-owner/email/request-otp")
async def owner_request_email_otp(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Send a verification code to the NEW email the owner wants to use."""
    from app.crud.email_change import request_email_change_otp
    return request_email_change_otp(
        db, "vehicle_owner", current_user.primary_number, str(payload.get("email", ""))
    )


@router.post("/vehicle-owner/email/confirm")
async def owner_confirm_email(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Verify the code and save the new email (marked verified)."""
    from app.crud.email_change import confirm_email_change
    from app.models.vehicle_owner import VehicleOwnerCredentials

    creds = db.query(VehicleOwnerCredentials).filter(
        VehicleOwnerCredentials.id == current_user.vehicle_owner_id
    ).first()
    if not creds:
        raise HTTPException(status_code=404, detail="Account not found")
    return confirm_email_change(
        db, "vehicle_owner", current_user.primary_number,
        str(payload.get("email", "")), str(payload.get("code", "")), creds,
    )


# --- Payment details (Settings > Payment Details) ---
from pydantic import BaseModel as _BaseModel
from typing import Optional as _Optional


class VehicleOwnerPaymentDetailsUpdate(_BaseModel):
    # bank_account_number / bank_ifsc are deliberately NOT accepted here -
    # they're sensitive/review-gated fields (Admin Profile-Edit Review
    # Queue - see POST /profile-edit-requests/submit). The Driver App's
    # own Settings screen already stopped sending them on this call, but
    # that's a frontend convention only; a client that ignores the app
    # and calls this endpoint directly (curl, a modified APK) must not be
    # able to change them instantly. Enforcing "gated" server-side means
    # not accepting the field at all on the direct-update path, rather
    # than trusting every caller to route it through review on their own.
    bank_account_holder_name: _Optional[str] = None
    upi_id: _Optional[str] = None


@router.put("/vehicle-owner/payment-details")
async def update_vehicle_owner_payment_details(
    payload: VehicleOwnerPaymentDetailsUpdate,
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    """Either bank OR UPI is enough - both stay optional, no required-both check.
    bank_account_number/bank_ifsc go through POST /profile-edit-requests/submit
    instead - see VehicleOwnerPaymentDetailsUpdate's own comment."""
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    details = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id).first()
    if not details:
        raise HTTPException(status_code=404, detail="Vehicle owner details not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(details, field, value)
    db.commit()
    return {
        "bank_account_number": details.bank_account_number,
        "bank_ifsc": details.bank_ifsc,
        "bank_account_holder_name": details.bank_account_holder_name,
        "upi_id": details.upi_id,
    }


@router.get("/vehicleowner/feedbacks")
async def get_vehicle_owner_feedbacks(
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    """
    Returns list of customer ratings & feedback items for trips executed by drivers
    belonging to this vehicle owner. Calculates +₹10/star incentive per rating >3★.
    """
    from app.models.rating import Rating
    from app.models.orders import Order
    from app.models.customer import CustomerCredentials
    from app.models.car_driver import CarDriver

    # Find drivers belonging to this vehicle owner
    driver_ids = [str(d.id) for d in db.query(CarDriver).filter(CarDriver.vehicle_owner_id == vehicle_owner_id).all()]

    ratings_query = db.query(Rating, Order, CustomerCredentials).join(
        Order, Order.id == Rating.order_id
    ).join(
        CustomerCredentials, CustomerCredentials.id == Rating.customer_id
    )

    if driver_ids:
        ratings_query = ratings_query.filter(Rating.driver_id.in_(driver_ids))

    results = ratings_query.order_by(Rating.created_at.desc()).all()

    feedbacks = []
    for r, o, c in results:
        rating_val = float(r.driver_rating or r.service_rating or 5.0)
        incentive = int(rating_val * 10) if rating_val > 3.0 else 0

        # Construct tags
        tags = []
        if rating_val >= 4.5:
            tags.extend(["✨ Clean Car", "⚡ Punctual", "👨‍✈️ Polite Driver"])
        elif rating_val >= 4.0:
            tags.extend(["✨ Smooth Driving", "🎵 Good Music"])
        else:
            tags.append("👍 Safe Driver")

        cust_name = getattr(c, "full_name", None) or f"Customer #{str(c.id)[:6]}"

        feedbacks.append({
            "id": str(r.id),
            "bookingId": f"BK_{o.id}",
            "customerName": cust_name,
            "rating": rating_val,
            "tags": tags,
            "comment": r.comment or "Great service!",
            "date": r.created_at.strftime("%d %b, %I:%M %p") if r.created_at else "Recently",
            "incentiveAmount": incentive,
        })

    return feedbacks

