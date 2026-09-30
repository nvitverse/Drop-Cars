from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from app.schemas.car_details import CarDetailsForm, CarDetailsOut, CarDetailsSignupResponse
from app.crud.car_details import create_car_details, update_car_images
from app.database.session import get_db
from app.utils.gcs import upload_image_to_gcs, delete_gcs_file_by_url
from app.core.security import get_current_user
from app.models.vehicle_owner import VehicleOwnerCredentials
from typing import List, Optional
from app.schemas.document_status import DocumentStatusListResponse, UpdateDocumentStatusRequest, UpdateDocumentRequest, DocumentUpdateResponse
from app.models.common_enums import DocumentStatusEnum

router = APIRouter()


@router.get("/cardetails/car-models/public")
async def list_car_models_public():
    """Car name -> car_type catalog for the 'Car Name' picker (auto-fills Car
    Type on selection). Read-only, not sensitive, same list in every app.
    Editable from the admin panel (Settings > Car Models)."""
    from app.utils.car_models import get_car_models
    return {"car_models": get_car_models()}


@router.post("/cardetails/signup", response_model=CarDetailsSignupResponse)
async def signup_car_details(
    car_form: CarDetailsForm = Depends(CarDetailsForm.as_form),
    rc_front_img: UploadFile = File(..., description="RC Front image file"),
    rc_back_img: UploadFile = File(..., description="RC Back image file"),
    insurance_img: UploadFile = File(..., description="Insurance image file"),
    fc_img: UploadFile = File(..., description="FC image file"),
    car_img: UploadFile = File(..., description="Car image file"),
    permit_img: UploadFile = File(..., description="Permit image file"),
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Register a new car with details and upload all required images to GCS.
    Images are only uploaded after successful database insertion.
    """
    
    # Step 1: Validate all image files
    image_files = {
        'rc_front_img': rc_front_img,
        'rc_back_img': rc_back_img,
        'insurance_img': insurance_img,
        'fc_img': fc_img,
        'car_img': car_img,
        'permit_img': permit_img
    }
    print("Car is going to checck")
    
    for field_name, image_file in image_files.items():
        if not image_file.content_type or not image_file.content_type.startswith('image/'):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type for {field_name}. Please upload an image file (JPEG, PNG, etc.)"
            )
        
        # Check file size (limit to 5MB)
        if image_file.size and image_file.size > 5 * 1024 * 1024:  # 5MB
            raise HTTPException(
                status_code=400,
                detail=f"{field_name} file is too large. Please upload an image smaller than 5MB"
            )
    
    # Step 2: Create car details in database first (without images)
    # Set vehicle_owner_id from authenticated user - this used to be a
    # no-op (`car_form.vehicle_owner_id = car_form.vehicle_owner_id`,
    # found 2026-09-04 while live-testing Drop Bid), silently relying on
    # every caller to also pass vehicle_owner_id explicitly in the form
    # even though the field is documented "auto-set from token". The real
    # Driver-App client always does send it, so this was masked in
    # practice, but any caller that trusted the documented behavior (like
    # this session's own test script) got a raw 500 NotNullViolation.
    # IMPORTANT: despite the `VehicleOwnerCredentials` type annotation on
    # `current_user` above, get_current_user() actually returns a
    # VehicleOwnerDetails row (see get_vehicle_owner_by_id in
    # crud/vehicle_owner.py) - its OWN `.id` is a different primary key
    # from `.vehicle_owner_id` (the FK car_details.vehicle_owner_id
    # actually references). A same-session first pass used `.id` here and
    # broke this route with a ForeignKeyViolation - caught immediately by
    # the same live test before it could reach production traffic.
    car_form.vehicle_owner_id = current_user.vehicle_owner_id
    print(car_form.car_type)
    try:
        print("Working 1")
        db_car = create_car_details(db, car_form)
        print("Working 2")
        
    except HTTPException:
        # Re-raise HTTP exceptions (like duplicate car number, etc.)
        raise
    except Exception as e:
        # Handle any other database errors
        raise HTTPException(
            status_code=500, 
            detail=f"Database error occurred while creating car details: {str(e)}"
        )
    
    # Step 3: Only after successful DB commit, upload images to GCS - also
    # run each real document (not car_img, which is just a photo of the
    # car, nothing to OCR) through auto-verification so a clean, non-
    # expired, colour document goes straight to VERIFIED.
    from app.utils.document_verifier import get_auto_verified_status
    DOC_TYPE_FOR_FIELD = {
        'rc_front_img': 'rc', 'rc_back_img': 'rc',
        'insurance_img': 'insurance', 'fc_img': 'fc', 'permit_img': 'permit',
    }
    uploaded_urls = {}
    uploaded_statuses = {}
    uploaded_files = []  # Track successfully uploaded files for cleanup if needed

    try:
        # Upload each image to GCS with car-specific folder structure
        for field_name, image_file in image_files.items():
            doc_type = DOC_TYPE_FOR_FIELD.get(field_name)
            if doc_type:
                image_bytes = await image_file.read()
                await image_file.seek(0)
                uploaded_statuses[f"{field_name}_url"] = get_auto_verified_status(image_bytes, doc_type)
            # Create folder structure: car_details/{car_id}/{image_type}
            folder_path = f"car_details/{db_car.id}/{field_name}"
            image_url = upload_image_to_gcs(image_file, folder_path)
            uploaded_urls[f"{field_name}_url"] = image_url
            uploaded_files.append(image_url)

    except Exception as e:
        # If GCS upload fails, clean up any uploaded files and raise error
        for uploaded_url in uploaded_files:
            try:
                delete_gcs_file_by_url(uploaded_url)
            except:
                pass  # Ignore cleanup errors
        
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to upload images to cloud storage: {str(e)}. Car details created but image upload failed."
        )
    
    # Step 4: Update the database record with the GCS image URLs
    try:
        update_car_images(db, db_car.id, uploaded_urls, statuses=uploaded_statuses)
    except Exception as e:
        # If update fails, clean up uploaded images and raise error
        for uploaded_url in uploaded_files:
            try:
                delete_gcs_file_by_url(uploaded_url)
            except:
                pass  # Ignore cleanup errors
        
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to update car record with image URLs: {str(e)}. Images uploaded but not linked to car."
        )

    return {
        "message": "Car details registered successfully", 
        "car_id": str(db_car.id), 
        "image_urls": uploaded_urls,
        "status": "success"
    }

@router.get("/cardetails/all", response_model=List[CarDetailsOut])
def get_all_cars(
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all cars for the authenticated fleet owner"""
    from app.crud.car_details import get_all_cars
    from app.crud.document_expiry import expiry_fields as _expiry_fields

    # Was str(current_user.id) - same wrong-primary-key bug as the
    # ownership checks below, fixed 2026-09-04. ALSO moved above
    # /cardetails/{car_id} - same day, found live-testing the above fix -
    # FastAPI matches routes in declaration order, and {car_id} (a single
    # path segment) was declared first, so it greedily matched "all" as a
    # literal car_id and 400'd trying to parse it as a UUID before this
    # route was ever reached. This "all" route (and the shape-identical
    # /cardetails/all-document-status further below, same fix) had never
    # actually been reachable.
    cars = get_all_cars(db, str(current_user.vehicle_owner_id))
    return cars


@router.get("/cardetails/all-document-status", response_model=List[DocumentStatusListResponse])
def get_all_cars_document_status(
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get document status for all cars belonging to fleet owner. Moved
    above /cardetails/{car_id} 2026-09-04 - same route-shadowing bug as
    /cardetails/all (see the long comment there): this literal 2-segment
    path was declared after the parameterized {car_id} route, which
    greedily matched "all-document-status" as a literal car_id and 400'd
    on the UUID parse before this route was ever reached."""
    from app.crud.car_details import get_all_cars

    # Was str(current_user.id) - same wrong-primary-key bug as the
    # ownership checks below, fixed 2026-09-04.
    cars = get_all_cars(db, str(current_user.vehicle_owner_id))

    car_statuses = []
    for car in cars:
        documents = {}
        if car.rc_front_img_url:
            documents["rc_front"] = {
                "document_type": "rc_front",
                "status": car.rc_front_status.value if car.rc_front_status else "Pending",
                "image_url": car.rc_front_img_url,
                "updated_at": None,
                **_expiry_fields(car.rc_expiry_date),
            }
        if car.rc_back_img_url:
            documents["rc_back"] = {
                "document_type": "rc_back",
                "status": car.rc_back_status.value if car.rc_back_status else "Pending",
                "image_url": car.rc_back_img_url,
                "updated_at": None,
                **_expiry_fields(car.rc_expiry_date),
            }
        if car.insurance_img_url:
            documents["insurance"] = {
                "document_type": "insurance",
                "status": car.insurance_status.value if car.insurance_status else "Pending",
                "image_url": car.insurance_img_url,
                "updated_at": None,
                **_expiry_fields(car.insurance_expiry_date),
            }
        if car.fc_img_url:
            documents["fc"] = {
                "document_type": "fc",
                "status": car.fc_status.value if car.fc_status else "Pending",
                "image_url": car.fc_img_url,
                "updated_at": None
            }
        if car.car_img_url:
            documents["car_img"] = {
                "document_type": "car_img",
                "status": car.car_img_status.value if car.car_img_status else "Pending",
                "image_url": car.car_img_url,
                "updated_at": None
            }
        if car.permit_img_url:
            documents["permit"] = {
                "document_type": "permit",
                "status": car.permit_status.value if car.permit_status else "Pending",
                "image_url": car.permit_img_url,
                "updated_at": None
            }

        car_statuses.append(DocumentStatusListResponse(
            entity_id=car.id,
            entity_type="car",
            documents=documents
        ))

    return car_statuses


@router.get("/cardetails/{car_id}", response_model=CarDetailsOut)
def get_car_details(
    car_id: str, 
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get car details by ID (only for authenticated fleet owner)"""
    from app.crud.car_details import get_car_by_id
    from uuid import UUID
    
    try:
        car_uuid = UUID(car_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid car ID format")
    
    car = get_car_by_id(db, car_uuid)
    if not car:
        raise HTTPException(status_code=404, detail="Car details not found")
    
    # Verify that the car belongs to the authenticated fleet owner. Was
    # current_user.id - wrong primary key, current_user here is actually
    # a VehicleOwnerDetails row (see get_current_user in core/security.py)
    # whose OWN id differs from .vehicle_owner_id (the real FK
    # car.vehicle_owner_id points to) - so this always mismatched and
    # 403'd every real owner viewing their own car. Fixed 2026-09-04
    # (same bug already correctly avoided a few functions below, in
    # update_car_document, which is how it was first noticed).
    if car.vehicle_owner_id != current_user.vehicle_owner_id:
        raise HTTPException(status_code=403, detail="Access denied. You can only view your own cars.")
    
    return car


@router.get("/cardetails/{car_id}/document-status", response_model=DocumentStatusListResponse)
def get_car_document_status(
    car_id: str,
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get document status for car"""
    from app.crud.car_details import get_car_by_id
    from uuid import UUID
    
    try:
        car_uuid = UUID(car_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid car ID format")
    
    car = get_car_by_id(db, car_uuid)
    if not car:
        raise HTTPException(status_code=404, detail="Car details not found")
    
    # Verify that the car belongs to the authenticated fleet owner. Was
    # current_user.id - wrong primary key, current_user here is actually
    # a VehicleOwnerDetails row (see get_current_user in core/security.py)
    # whose OWN id differs from .vehicle_owner_id (the real FK
    # car.vehicle_owner_id points to) - so this always mismatched and
    # 403'd every real owner viewing their own car. Fixed 2026-09-04
    # (same bug already correctly avoided a few functions below, in
    # update_car_document, which is how it was first noticed).
    if car.vehicle_owner_id != current_user.vehicle_owner_id:
        raise HTTPException(status_code=403, detail="Access denied. You can only view your own cars.")
    
    documents = {}
    if car.rc_front_img_url:
        documents["rc_front"] = {
            "document_type": "rc_front",
            "status": car.rc_front_status.value if car.rc_front_status else "Pending",
            "image_url": car.rc_front_img_url,
            "updated_at": None
        }
    if car.rc_back_img_url:
        documents["rc_back"] = {
            "document_type": "rc_back",
            "status": car.rc_back_status.value if car.rc_back_status else "Pending",
            "image_url": car.rc_back_img_url,
            "updated_at": None
        }
    if car.insurance_img_url:
        documents["insurance"] = {
            "document_type": "insurance",
            "status": car.insurance_status.value if car.insurance_status else "Pending",
            "image_url": car.insurance_img_url,
            "updated_at": None
        }
    if car.fc_img_url:
        documents["fc"] = {
            "document_type": "fc",
            "status": car.fc_status.value if car.fc_status else "Pending",
            "image_url": car.fc_img_url,
            "updated_at": None
        }
    if car.car_img_url:
        documents["car_img"] = {
            "document_type": "car_img",
            "status": car.car_img_status.value if car.car_img_status else "Pending",
            "image_url": car.car_img_url,
            "updated_at": None
        }
    if car.permit_img_url:
        documents["permit"] = {
            "document_type": "permit",
            "status": car.permit_status.value if car.permit_status else "Pending",
            "image_url": car.permit_img_url,
            "updated_at": None
        }
    
    return DocumentStatusListResponse(
        entity_id=car.id,
        entity_type="car",
        documents=documents
    )


@router.patch("/cardetails/{car_id}/document-status", response_model=DocumentUpdateResponse)
def update_car_document_status(
    car_id: str,
    document_type: str,
    status_update: UpdateDocumentStatusRequest,
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update document status for car (admin only)"""
    from app.crud.car_details import get_car_by_id
    from uuid import UUID
    
    try:
        car_uuid = UUID(car_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid car ID format")
    
    car = get_car_by_id(db, car_uuid)
    if not car:
        raise HTTPException(status_code=404, detail="Car details not found")
    
    # Verify that the car belongs to the authenticated fleet owner. Was
    # current_user.id - wrong primary key, current_user here is actually
    # a VehicleOwnerDetails row (see get_current_user in core/security.py)
    # whose OWN id differs from .vehicle_owner_id (the real FK
    # car.vehicle_owner_id points to) - so this always mismatched and
    # 403'd every real owner viewing their own car. Fixed 2026-09-04
    # (same bug already correctly avoided a few functions below, in
    # update_car_document, which is how it was first noticed).
    if car.vehicle_owner_id != current_user.vehicle_owner_id:
        raise HTTPException(status_code=403, detail="Access denied. You can only view your own cars.")
    
    # Update specific document status
    if document_type == "rc_front":
        car.rc_front_status = status_update.status
    elif document_type == "rc_back":
        car.rc_back_status = status_update.status
    elif document_type == "insurance":
        car.insurance_status = status_update.status
    elif document_type == "fc":
        car.fc_status = status_update.status
    elif document_type == "car_img":
        car.car_img_status = status_update.status
    elif document_type == "permit":
        car.permit_status = status_update.status
    else:
        raise HTTPException(status_code=400, detail="Invalid document type")
    
    db.commit()
    db.refresh(car)
    
    return DocumentUpdateResponse(
        message="Document status updated successfully",
        document_type=document_type,
        new_image_url=getattr(car, f"{document_type}_img_url"),
        new_status=status_update.status.value
    )


@router.post("/cardetails/{car_id}/update-document", response_model=DocumentUpdateResponse)
async def update_car_document(
    car_id: str,
    document_type: str = Form(...),
    image: UploadFile = File(...),
    expiry_date: Optional[str] = Form(None),
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update car document (upload new image)"""
    from app.crud.car_details import get_car_by_id
    from uuid import UUID
    
    try:
        car_uuid = UUID(car_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid car ID format")
    
    car = get_car_by_id(db, car_uuid)
    if not car:
        raise HTTPException(status_code=404, detail="Car details not found")
    
    # Verify that the car belongs to the authenticated fleet owner
    if car.vehicle_owner_id != current_user.vehicle_owner_id:
        raise HTTPException(status_code=403, detail="Access denied. You can only view your own cars.")
    
    valid_document_types = ["rc_front", "rc_back", "insurance", "fc", "car", "permit"]
    if document_type not in valid_document_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid document type. Must be one of: {', '.join(valid_document_types)}"
        )
    
    # Validate image file
    if not image.content_type or not image.content_type.startswith('image/'):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload an image file"
        )
    
    if image.size and image.size > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(
            status_code=400,
            detail="Image file is too large. Please upload an image smaller than 5MB"
        )
    
    try:
        # Keep the old image until the new one is verified (then it is removed automatically)
        old_image_url = getattr(car, f"{document_type}_img_url")
        from app.crud.stale_documents import register_stale_file
        register_stale_file(db, 'car', car.id, ('car_img_status' if document_type == 'car' else f'{document_type}_status'), old_image_url)

        # Auto-verify (skip for "car" - that's just a photo of the vehicle,
        # nothing to OCR) before uploading, using the same UploadFile's
        # bytes (seek back to 0 so the actual GCS upload still works).
        from app.utils.document_verifier import get_auto_verified_status
        OCR_DOC_TYPE = {"rc_front": "rc", "rc_back": "rc", "insurance": "insurance", "fc": "fc", "permit": "permit"}
        new_status = DocumentStatusEnum.PENDING
        if document_type in OCR_DOC_TYPE:
            image_bytes = await image.read()
            await image.seek(0)
            prev_status = getattr(car, f"{document_type}_status", None)
            new_status = get_auto_verified_status(image_bytes, OCR_DOC_TYPE[document_type], previous_status=prev_status)

        # Upload new image
        folder_path = f"car_details/{car.id}/{document_type}"
        new_image_url = upload_image_to_gcs(image, folder_path)

        # Update database
        setattr(car, f"{document_type}_img_url", new_image_url)
        from app.crud.document_expiry import parse_expiry
        _exp = parse_expiry(expiry_date)
        if _exp and document_type in ("rc_front", "rc_back"):
            car.rc_expiry_date = _exp
        elif _exp and document_type == "insurance":
            car.insurance_expiry_date = _exp
        setattr(car, f"{document_type}_status", new_status) if document_type != "car" else setattr(car, f"{document_type}_img_status", new_status)
        db.commit()
        db.refresh(car)

        return DocumentUpdateResponse(
            message="Document updated successfully",
            document_type=document_type,
            new_image_url=new_image_url,
            new_status=new_status.value.capitalize()
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update document: {str(e)}"
        )


