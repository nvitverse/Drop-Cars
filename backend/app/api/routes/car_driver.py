from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
import uuid
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import timedelta
from app.schemas.car_driver import CarDriverForm, CarDriverOut, CarDriverSignupResponse, CarDriverSigninResponse, CarDriverSigninRequest, DriverStatusUpdateResponse
from app.crud.car_driver import create_car_driver, update_driver_license_image, update_driver_license_back_image, update_driver_profile_image
from app.database.session import get_db
from app.utils.gcs import upload_image_to_gcs, delete_gcs_file_by_url
from app.core.security import get_current_user
from app.models.vehicle_owner import VehicleOwnerCredentials
from typing import List, Optional
from app.models.car_driver import CarDriver
from app.core.security import get_current_driver
from app.schemas.document_status import DocumentStatusListResponse, UpdateDocumentStatusRequest, UpdateDocumentRequest, DocumentUpdateResponse
from app.models.common_enums import DocumentStatusEnum

router = APIRouter()

@router.post("/cardriver/signup", response_model=CarDriverSignupResponse)
def signup_car_driver(
    driver_form: CarDriverForm = Depends(CarDriverForm.as_form),
    licence_front_img: UploadFile = File(..., description="License front image file"),
    licence_back_img: UploadFile = File(None, description="License back image file (optional)"),
    profile_img: UploadFile = File(..., description="Live profile photo (selfie, camera capture only) - required, compared against the licence photo (see face-match)"),
    aadhar_front_img: UploadFile = File(None, description="Aadhaar front image (collected for duty drivers)"),
    aadhar_back_img: UploadFile = File(None, description="Aadhaar back image (collected for duty drivers)"),
    aadhar_number: Optional[str] = Form(None),
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Register a new car driver with details and upload license + profile
    images to GCS. Images are only uploaded after successful database
    insertion. profile_img (added 2026-09-04) is mandatory - a live
    camera photo, not a gallery pick, enforced client-side (this route
    can't verify a photo was genuinely taken live vs picked, only that
    one was uploaded) - and gets compared against the licence photo via
    the zero-cost face-match check, surfaced in the response as a
    non-blocking flag (see utils/document_verifier.py's compare_faces).
    """

    # Own-cum-driver: no separate password - the owner only ever gets into
    # this driver session via /cardriver/signin-as-owner (owner-authenticated
    # already, see that route), never a direct driver-password login. A
    # random password is generated here just to satisfy hashed_password
    # NOT NULL - it's never returned or usable. A real duty driver
    # (is_owner_driver=false) must still supply their own password, since
    # they log in independently.
    if driver_form.is_owner_driver and not driver_form.password:
        import secrets
        driver_form.password = secrets.token_urlsafe(24)
    elif not driver_form.password:
        raise HTTPException(status_code=422, detail="Password is required.")

    # Step 1: Validate license + profile image files
    if not licence_front_img.content_type or not licence_front_img.content_type.startswith('image/'):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type for license image. Please upload an image file (JPEG, PNG, etc.)"
        )
    if not profile_img.content_type or not profile_img.content_type.startswith('image/'):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type for profile photo. Please upload an image file (JPEG, PNG, etc.)"
        )

    # Check file size (limit to 5MB)
    if licence_front_img.size and licence_front_img.size > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(
            status_code=400,
            detail="License image file is too large. Please upload an image smaller than 5MB"
        )
    if profile_img.size and profile_img.size > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Profile photo file is too large. Please upload an image smaller than 5MB"
        )

    # Read both into memory now (before either gets uploaded to GCS) so the
    # face-match check below has real bytes to compare - upload_image_to_gcs
    # reads from the UploadFile's underlying file object directly, so
    # .seek(0) after each .read() keeps that working unchanged.
    licence_bytes = licence_front_img.file.read()
    licence_front_img.file.seek(0)
    profile_bytes = profile_img.file.read()
    profile_img.file.seek(0)

    # Step 2: Create car driver in database first (without image)
    # Set vehicle_owner_id from authenticated user - same no-op bug as
    # car_details.py's signup route (found/fixed together 2026-09-04):
    # this used to just reassign the field to itself, so it only ever
    # worked because the real Driver-App client happens to also send
    # vehicle_owner_id explicitly in the form. Same `.vehicle_owner_id`
    # (not `.id`) caveat too - current_user here is a VehicleOwnerDetails
    # row despite the type annotation, see car_details.py's longer note.
    driver_form.vehicle_owner_id = current_user.vehicle_owner_id
    
    try:
        db_driver = create_car_driver(db, driver_form)
    except HTTPException:
        # Re-raise HTTP exceptions (like duplicate mobile/license numbers, etc.)
        raise
    except Exception as e:
        # Handle any other database errors
        raise HTTPException(
            status_code=500, 
            detail=f"Database error occurred while creating car driver: {str(e)}"
        )
    
    # Step 3: Only after successful DB commit, upload license image to GCS
    try:
        # Create folder structure: car_driver/{driver_id}/license
        folder_path = f"car_driver/{db_driver.id}/license"
        license_img_url = upload_image_to_gcs(licence_front_img, folder_path)
    except Exception as e:
        # If GCS upload fails, we still have the driver in DB but without image
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to upload license image to cloud storage: {str(e)}. Driver created but image upload failed."
        )
    
    # Step 4: Update the database record with the GCS image URL - auto-
    # verify the licence right here using the bytes already read above for
    # the face-match check, so a real, non-expired, colour licence photo
    # goes straight to VERIFIED without an admin having to click Verify.
    from app.utils.document_verifier import get_auto_verified_status
    licence_status = get_auto_verified_status(licence_bytes, "licence")
    try:
        update_driver_license_image(db, db_driver.id, license_img_url, status=licence_status)
    except Exception as e:
        # If update fails, clean up the uploaded image and raise error
        delete_gcs_file_by_url(license_img_url)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update driver record with image URL: {str(e)}. Image uploaded but not linked to driver."
        )

    # Step 5: Optional license back image. Best-effort - never fails the signup,
    # since the account already exists and the mandatory front image already succeeded.
    if licence_back_img and licence_back_img.filename:
        try:
            licence_back_bytes = licence_back_img.file.read()
            licence_back_img.file.seek(0)
            back_folder_path = f"car_driver/{db_driver.id}/license"
            license_back_url = upload_image_to_gcs(licence_back_img, back_folder_path)
            back_status = get_auto_verified_status(licence_back_bytes, "licence")
            update_driver_license_back_image(db, db_driver.id, license_back_url, status=back_status)
        except Exception as e:
            print(f"Optional license-back upload failed (signup still succeeds): {e}")

    # Step 6: Mandatory profile photo (added 2026-09-04). Best-effort like
    # the optional license-back above - the account and mandatory licence
    # photo already succeeded by this point, so a GCS hiccup here shouldn't
    # fail the whole signup; it just means profile_img_url comes back None
    # and the driver gets prompted again later (see the "add your profile
    # photo" reminder popup wired into the app's dashboard).
    profile_img_url = None
    face_match_result = None
    try:
        profile_folder_path = f"car_driver/{db_driver.id}/profile"
        profile_img_url = upload_image_to_gcs(profile_img, profile_folder_path)
        update_driver_profile_image(db, db_driver.id, profile_img_url)
    except Exception as e:
        print(f"Profile photo upload failed (signup still succeeds): {e}")

    # Step 6b: Aadhaar number + front/back (best-effort like the licence back:
    # the account already exists, a GCS hiccup must not fail the signup).
    try:
        digits = "".join(ch for ch in (aadhar_number or "") if ch.isdigit())
        if len(digits) == 12:
            db_driver.aadhar_number = digits
            db.commit()
        for up, side in ((aadhar_front_img, "front"), (aadhar_back_img, "back")):
            if up is None or not getattr(up, "filename", None):
                continue
            up_bytes = up.file.read()
            up.file.seek(0)
            url = upload_image_to_gcs(up, f"car_driver/{db_driver.id}/aadhar_{side}")
            st = get_auto_verified_status(up_bytes, "aadhar")
            setattr(db_driver, f"aadhar_{side}_img", url)
            setattr(db_driver, f"aadhar_{side}_status", st)
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"Aadhaar upload failed (signup still succeeds): {e}")

    # Zero-cost face-match against the licence photo - informational only,
    # never blocks signup (see compare_faces' own docstring for why).
    try:
        from app.utils.document_verifier import compare_faces
        face_match_result = compare_faces(licence_bytes, profile_bytes)
    except Exception as e:
        print(f"Face-match check failed (non-fatal): {e}")

    return {
        "message": "Car driver registered successfully",
        "driver_id": str(db_driver.id),
        "license_img_url": license_img_url,
        "profile_img_url": profile_img_url,
        "face_match": face_match_result,
        "status": "success"
    }

@router.post("/cardriver/signin", response_model=CarDriverSigninResponse)
def signin_car_driver(
    signin_data: CarDriverSigninRequest,
    db: Session = Depends(get_db),
):
    """
    Driver signin with primary number and password.
    Returns access token if credentials are correct.
    """
    from app.crud.car_driver import authenticate_driver, get_driver_by_mobile
    from app.core.security import create_access_token
    from app.models.car_driver import AccountStatusEnum

    existing = get_driver_by_mobile(db, signin_data.primary_number)
    if not existing:
        # Wrong-login hint (F3): only after the password matches a fleet
        # driver / vehicle owner account. Shipped apps key on
        # 404 + detail == "NOT_REGISTERED", so that contract is unchanged and
        # the hint travels in a header that newer app builds can read.
        from app.models.vehicle_owner import VehicleOwnerCredentials
        from app.core.security import verify_password
        owner = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.primary_number == signin_data.primary_number).first()
        if owner and verify_password(signin_data.password, owner.hashed_password):
            raise HTTPException(status_code=404, detail="NOT_REGISTERED", headers={"X-Account-Role-Hint": "VEHICLE_OWNER"})
        raise HTTPException(status_code=404, detail="NOT_REGISTERED")

    # Authenticate driver
    driver = authenticate_driver(db, signin_data.primary_number, signin_data.password)

    if not driver:
        raise HTTPException(
            status_code=401,
            detail="Incorrect password. Please try again."
        )
    
    # Permanent block is checked independently of driver_status - a routine
    # status change elsewhere should never accidentally let a confirmed
    # fraud case (e.g. fake documents) log back in.
    if getattr(driver, "permanently_blocked", False):
        raise HTTPException(
            status_code=403,
            detail="This account has been permanently blocked. Contact support if you believe this is a mistake."
        )

    # Check if driver is blocked
    if driver.driver_status == AccountStatusEnum.BLOCKED:
        raise HTTPException(
            status_code=403,
            detail="Account is blocked. Please contact your fleet owner."
        )

    # Create access token with driver ID as payload. Driver tokens get a
    # 6-month expiry (not the 24h default) so the Driver App stays logged
    # in for normal use until an explicit Log Out - see
    # app.core.security.DRIVER_ACCESS_TOKEN_EXPIRE_MINUTES for why.
    from datetime import timedelta
    from app.core.security import DRIVER_ACCESS_TOKEN_EXPIRE_MINUTES
    access_token = create_access_token(
        data={"sub": str(driver.id), "user": "driver", "token_version": driver.token_version},
        expires_delta=timedelta(minutes=DRIVER_ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "driver_id": str(driver.id),
        "full_name": driver.full_name,
        "primary_number": driver.primary_number,
        "driver_status": driver.driver_status
    }


class DriverFirebaseVerifyRequest(BaseModel):
    id_token: str


@router.post("/cardriver/firebase/verify", response_model=CarDriverSigninResponse)
def signin_car_driver_firebase(body: DriverFirebaseVerifyRequest, db: Session = Depends(get_db)):
    """Firebase Phone Auth sign-in for an EXISTING driver. Deliberately
    never creates a driver record - drivers are only ever created by their
    fleet owner via /cardriver/signup with real KYC documents (licence,
    address, etc), which Firebase phone verification alone can't supply.
    A phone number with no matching driver returns the same 404
    NOT_REGISTERED the password flow already returns, so the client can
    show the same "not registered, ask your fleet owner to add you" message
    either way."""
    from app.crud.car_driver import get_driver_by_mobile
    from app.core.security import create_access_token, DRIVER_ACCESS_TOKEN_EXPIRE_MINUTES
    from app.models.car_driver import AccountStatusEnum
    from app.utils.firebase_admin_auth import verify_firebase_id_token, FirebaseNotConfigured, InvalidFirebaseToken

    try:
        payload = verify_firebase_id_token(body.id_token)
    except FirebaseNotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except InvalidFirebaseToken as e:
        raise HTTPException(status_code=401, detail=f"Invalid sign-in: {e}")

    phone_number = payload.get("phone_number")
    if not phone_number:
        raise HTTPException(status_code=400, detail="This sign-in method did not verify a phone number.")
    if phone_number.startswith("+91"):
        phone_number = phone_number[3:]

    driver = get_driver_by_mobile(db, phone_number)
    if not driver:
        raise HTTPException(status_code=404, detail="NOT_REGISTERED")
    if getattr(driver, "permanently_blocked", False):
        raise HTTPException(status_code=403, detail="This account has been permanently blocked. Contact support if you believe this is a mistake.")
    if driver.driver_status == AccountStatusEnum.BLOCKED:
        raise HTTPException(status_code=403, detail="Account is blocked. Please contact your fleet owner.")

    driver.auth_provider = "firebase"
    driver.firebase_uid = payload["uid"]
    db.commit()
    db.refresh(driver)

    access_token = create_access_token(
        data={"sub": str(driver.id), "user": "driver", "token_version": driver.token_version},
        expires_delta=timedelta(minutes=DRIVER_ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "driver_id": str(driver.id),
        "full_name": driver.full_name,
        "primary_number": driver.primary_number,
        "driver_status": driver.driver_status,
    }


@router.post("/cardriver/signin-as-owner", response_model=CarDriverSigninResponse)
def signin_car_driver_as_owner(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """One-tap owner->driver switch: if the logged-in fleet owner's mobile
    number is ALSO registered as a duty driver, issue a driver session
    without asking for the driver password (the owner is already
    authenticated, so identity is proven)."""
    from app.core.security import create_access_token
    from app.models.car_driver import CarDriver, AccountStatusEnum

    # NOTE: every current_user.id below was current_user.id (wrong primary
    # key - current_user here is a VehicleOwnerDetails row per
    # get_current_user, whose own .id differs from .vehicle_owner_id, the
    # real FK CarDriver.vehicle_owner_id points to) until fixed 2026-09-04.
    # In practice this route mostly still worked for an EXISTING
    # owner-driver because the phone-number OR-clauses below found them
    # anyway - but a brand-new fleet owner's very first Duty-tab tap hit
    # the auto-registration branch, which tried to INSERT a CarDriver with
    # this wrong vehicle_owner_id, violated the FK constraint, and after
    # exhausting every fallback ended in "Unable to initialize driver
    # profile for fleet owner. Please contact support."
    raw_num = str(current_user.primary_number).strip()
    clean_num = raw_num.replace(" ", "").replace("+91", "")[-10:]
    with_prefix = f"+91{clean_num}"

    driver = db.query(CarDriver).filter(
        (CarDriver.vehicle_owner_id == current_user.vehicle_owner_id) |
        (CarDriver.primary_number == raw_num) |
        (CarDriver.primary_number == clean_num) |
        (CarDriver.primary_number == with_prefix)
    ).first()

    if not driver:
        # Auto-register the logged-in fleet owner as a CarDriver record
        licence_num = getattr(current_user, "licence_number", None)
        if not licence_num:
            licence_num = f"OWNER-{str(current_user.vehicle_owner_id)[:8]}"

        try:
            driver = CarDriver(
                vehicle_owner_id=current_user.vehicle_owner_id,
                full_name=current_user.full_name or "Fleet Owner",
                primary_number=clean_num,
                hashed_password=getattr(current_user, "hashed_password", "owner_pass"),
                licence_number=licence_num,
                address=getattr(current_user, "address", None) or "Fleet Owner Address",
                city=getattr(current_user, "city", None) or "Chennai",
                pincode=getattr(current_user, "pincode", None) or "600001",
                driver_status=AccountStatusEnum.ONLINE,
                is_owner_driver=True,
            )
            db.add(driver)
            db.commit()
            db.refresh(driver)
        except Exception:
            db.rollback()
            # Search by vehicle_owner_id or primary_number suffix
            driver = db.query(CarDriver).filter(
                (CarDriver.vehicle_owner_id == current_user.vehicle_owner_id) |
                (CarDriver.primary_number == clean_num) |
                (CarDriver.primary_number == with_prefix)
            ).first()

            if not driver:
                # Guaranteed unique fallback for owner-driver registration
                unique_licence = f"OWN-{uuid.uuid4().hex[:8].upper()}"
                unique_phone = f"{clean_num}" if len(clean_num) == 10 else f"OWN{str(current_user.vehicle_owner_id)[:6]}"
                try:
                    driver = CarDriver(
                        vehicle_owner_id=current_user.vehicle_owner_id,
                        full_name=current_user.full_name or "Fleet Owner",
                        primary_number=unique_phone,
                        hashed_password=getattr(current_user, "hashed_password", "owner_pass"),
                        licence_number=unique_licence,
                        address=getattr(current_user, "address", None) or "Fleet Owner Address",
                        city=getattr(current_user, "city", None) or "Chennai",
                        pincode=getattr(current_user, "pincode", None) or "600001",
                        driver_status=AccountStatusEnum.ONLINE,
                        is_owner_driver=True,
                    )
                    db.add(driver)
                    db.commit()
                    db.refresh(driver)
                except Exception:
                    db.rollback()
                    driver = db.query(CarDriver).filter(
                        CarDriver.vehicle_owner_id == current_user.vehicle_owner_id
                    ).first()
    else:
        # Ensure owner-driver link is accurate
        if driver.vehicle_owner_id != current_user.vehicle_owner_id or not driver.is_owner_driver:
            try:
                driver.vehicle_owner_id = current_user.vehicle_owner_id
                driver.is_owner_driver = True
                db.commit()
                db.refresh(driver)
            except Exception:
                db.rollback()

    if not driver:
        raise HTTPException(
            status_code=400,
            detail="Unable to initialize driver profile for fleet owner. Please contact support."
        )
    if getattr(driver, "permanently_blocked", False):
        raise HTTPException(
            status_code=403,
            detail="This account has been permanently blocked. Contact support if you believe this is a mistake."
        )
    if driver.driver_status == AccountStatusEnum.BLOCKED:
        raise HTTPException(status_code=403, detail="Driver account is blocked. Please contact the admin.")

    from datetime import timedelta
    from app.core.security import DRIVER_ACCESS_TOKEN_EXPIRE_MINUTES
    access_token = create_access_token(
        data={"sub": str(driver.id), "user": "driver", "token_version": driver.token_version},
        expires_delta=timedelta(minutes=DRIVER_ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "driver_id": str(driver.id),
        "full_name": driver.full_name,
        "primary_number": driver.primary_number,
        "driver_status": driver.driver_status
    }


@router.put("/cardriver/online", response_model=DriverStatusUpdateResponse)
def set_driver_online(
    current_driver: CarDriver = Depends(get_current_driver),
    db: Session = Depends(get_db),
):
    """
    Set driver status to ONLINE.
    Driver must be currently OFFLINE to go online.
    Requires valid bearer token authentication.
    """
    from app.crud.car_driver import update_driver_status
    from app.models.car_driver import AccountStatusEnum
    
    try:
        updated_driver = update_driver_status(db, current_driver.id, AccountStatusEnum.ONLINE)
        
        return {
            "message": "Driver status updated to ONLINE successfully",
            "driver_id": str(updated_driver.id),
            "new_status": updated_driver.driver_status
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update driver status: {str(e)}"
        )

@router.put("/cardriver/offline", response_model=DriverStatusUpdateResponse)
def set_driver_offline(
    current_driver: CarDriver = Depends(get_current_driver),
    db: Session = Depends(get_db),
):
    """
    Set driver status to OFFLINE.
    Driver must be currently ONLINE or DRIVING to go offline.
    Requires valid bearer token authentication.
    """
    from app.crud.car_driver import update_driver_status
    from app.models.car_driver import AccountStatusEnum
    
    try:
        updated_driver = update_driver_status(db, current_driver.id, AccountStatusEnum.OFFLINE)
        
        return {
            "message": "Driver status updated to OFFLINE successfully",
            "driver_id": str(updated_driver.id),
            "new_status": updated_driver.driver_status
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update driver status: {str(e)}"
        )

@router.get("/cardriver/me", response_model=CarDriverOut)
def get_my_driver_profile(
    current_driver: CarDriver = Depends(get_current_driver),
):
    """Driver-JWT-authenticated self-lookup - added 2026-09-04 so the app
    can check its own profile_img (and prompt a "add your profile photo"
    reminder for anyone who signed up before that field existed) without
    needing the fleet-owner-authenticated /cardriver/{driver_id} route."""
    return current_driver


class DriverNameUpdate(BaseModel):
    full_name: str


@router.put("/cardriver/me/name")
def update_my_driver_name(body: DriverNameUpdate, current_driver: CarDriver = Depends(get_current_driver), db: Session = Depends(get_db)):
    """Set the name shown as the DRIVER on trips, reviews and to the booking owner. A fleet owner who drives their own
    cars is registered as a driver under the fleet name (e.g. "Mukil Travels") - this lets them put their own name.
    A hired duty driver's name is a KYC detail, so that still goes through the fleet owner / admin edit request."""
    name = " ".join((body.full_name or "").split())
    if len(name) < 2 or len(name) > 60:
        raise HTTPException(status_code=400, detail="Enter a name between 2 and 60 characters.")
    if not current_driver.is_owner_driver:
        raise HTTPException(status_code=403, detail="Your name can be changed by your fleet owner or Drop Cars admin.")
    current_driver.full_name = name
    db.commit()
    return {"full_name": name}


@router.put("/cardriver/{driver_id}/name")
def update_fleet_driver_name(
    driver_id: str,
    body: DriverNameUpdate,
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Fleet owner updates the name of one of their drivers directly."""
    from uuid import UUID
    try:
        driver_uuid = UUID(driver_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid driver ID format")
    
    driver = db.query(CarDriver).filter(CarDriver.id == driver_uuid).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Car driver not found")
    if driver.vehicle_owner_id != current_user.vehicle_owner_id:
        raise HTTPException(status_code=403, detail="Access denied. You can only update your own drivers.")
    
    name = " ".join((body.full_name or "").split())
    if len(name) < 2 or len(name) > 60:
        raise HTTPException(status_code=400, detail="Enter a name between 2 and 60 characters.")
    
    driver.full_name = name
    db.commit()
    db.refresh(driver)
    return {"message": "Driver name updated successfully", "full_name": driver.full_name}


@router.get("/cardriver/me/summary")
def my_driver_summary(current_driver: CarDriver = Depends(get_current_driver), db: Session = Depends(get_db)):
    """Everything the duty driver's profile screen shows for real: fleet owner contact, licence + expiry, the car on
    duty, and trip / earnings / km / rating numbers (was hard-coded 0 / 0 / 5.0)."""
    from datetime import date, datetime, timezone
    from sqlalchemy import func
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.models.orders import Order
    from app.models.end_records import EndRecord
    from app.models.car_details import CarDetails
    from app.api.routes.trip_reviews import driver_rating_summary

    owner = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == current_driver.vehicle_owner_id).first()
    done = db.query(OrderAssignment).filter(
        OrderAssignment.driver_id == current_driver.id, OrderAssignment.assignment_status == AssignmentStatusEnum.COMPLETED
    ).all()
    today = date.today()
    today_done = [a for a in done if a.completed_at and a.completed_at.date() == today]
    order_ids = [a.order_id for a in done]
    earnings_total = 0
    earnings_today = 0
    if order_ids:
        profit = {o.id: int(o.driver_profit or 0) for o in db.query(Order).filter(Order.id.in_(order_ids)).all()}
        earnings_total = sum(profit.get(i, 0) for i in order_ids)
        earnings_today = sum(profit.get(a.order_id, 0) for a in today_done)
    km = db.query(func.coalesce(func.sum(EndRecord.end_km - EndRecord.start_km), 0)).filter(
        EndRecord.driver_id == current_driver.id, EndRecord.end_km > 0).scalar() or 0

    active = db.query(OrderAssignment).filter(
        OrderAssignment.driver_id == current_driver.id,
        OrderAssignment.assignment_status.in_([AssignmentStatusEnum.ASSIGNED, AssignmentStatusEnum.DRIVING]),
    ).order_by(OrderAssignment.created_at.desc()).first()
    car = db.query(CarDetails).filter(CarDetails.id == active.car_id).first() if active and active.car_id else None

    exp = current_driver.licence_expiry_date
    return {
        "full_name": current_driver.full_name,
        "is_owner_driver": bool(current_driver.is_owner_driver),
        "primary_number": current_driver.primary_number,
        "email": current_driver.email,
        "address": current_driver.address,
        "city": current_driver.city,
        "pincode": current_driver.pincode,
        "licence_number": current_driver.licence_number,
        "licence_expiry_date": exp.isoformat() if exp else None,
        "licence_days_left": (exp - today).days if exp else None,
        "reg_id": current_driver.reg_id,
        "fleet_owner": {
            "name": owner.full_name if owner else None,
            "phone": owner.primary_number if owner else None,
        },
        "current_car": ({"name": car.car_name, "number": car.car_number, "type": getattr(car.car_type, "value", car.car_type)} if car else None),
        "stats": {
            "total_trips": len(done),
            "today_trips": len(today_done),
            "earnings_total": earnings_total,
            "earnings_today": earnings_today,
            "total_km": int(km),
            **driver_rating_summary(db, current_driver.id),
        },
        "support_phone": "+917200217986",
    }


@router.post("/cardriver/update-profile-photo")
def update_my_profile_photo(
    profile_img: UploadFile = File(..., description="Live profile photo (selfie, camera capture only)"),
    current_driver: CarDriver = Depends(get_current_driver),
    db: Session = Depends(get_db),
):
    """Lets an EXISTING driver (who signed up before profile_img existed,
    or just wants to retake it) add/update their live profile photo -
    added 2026-09-04, the backend side of the "update your profile photo"
    reminder popup. Same content-type/size checks and face-match-against-
    licence check as signup."""
    if not profile_img.content_type or not profile_img.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload an image file (JPEG, PNG, etc.)")
    if profile_img.size and profile_img.size > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Profile photo file is too large. Please upload an image smaller than 5MB")

    profile_bytes = profile_img.file.read()
    profile_img.file.seek(0)

    try:
        folder_path = f"car_driver/{current_driver.id}/profile"
        profile_img_url = upload_image_to_gcs(profile_img, folder_path)
        update_driver_profile_image(db, current_driver.id, profile_img_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload profile photo: {str(e)}")

    face_match_result = None
    if current_driver.licence_front_img:
        try:
            import requests as _requests
            from app.utils.document_verifier import compare_faces
            from app.utils.gcs import generate_signed_url_from_gcs
            # licence_front_img is the bare bucket URL, not directly
            # fetchable (the bucket isn't public) - needs signing first,
            # same as everywhere else this codebase reads a stored image
            # back (e.g. drop_bid_routes.py's car_img_url).
            signed_licence_url = generate_signed_url_from_gcs(current_driver.licence_front_img)
            licence_resp = _requests.get(signed_licence_url, timeout=15)
            if licence_resp.status_code == 200:
                face_match_result = compare_faces(licence_resp.content, profile_bytes)
        except Exception as e:
            print(f"Face-match check on profile-photo update failed (non-fatal): {e}")

    return {"message": "Profile photo updated successfully", "profile_img_url": profile_img_url, "face_match": face_match_result}


@router.get("/cardriver/all", response_model=List[CarDriverOut])
def get_all_drivers(
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all drivers for the authenticated fleet owner. Moved above
    /cardriver/{driver_id} 2026-09-04 - same route-shadowing bug as
    car_details.py's /cardetails/all (see the long comment there): this
    literal path was declared after the parameterized {driver_id} route,
    which greedily matched "all" as a literal driver_id and 400'd on the
    UUID parse before this route was ever reached."""
    from app.crud.car_driver import get_drivers_by_vehicleOwner_id

    # Was str(current_user.id) - same wrong-primary-key bug fixed
    # elsewhere in this file 2026-09-04.
    drivers = get_drivers_by_vehicleOwner_id(db, str(current_user.vehicle_owner_id))
    return drivers


@router.get("/cardriver/{driver_id}", response_model=CarDriverOut)
def get_car_driver(
    driver_id: str,
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get car driver by ID (only for authenticated fleet owner)"""
    from app.crud.car_driver import get_driver_by_id
    from uuid import UUID
    
    try:
        driver_uuid = UUID(driver_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid driver ID format")
    
    driver = get_driver_by_id(db, driver_uuid)
    if not driver:
        raise HTTPException(status_code=404, detail="Car driver not found")
    
    # Verify that the driver belongs to the authenticated fleet owner (or has matching primary number).
    # Was comparing driver.vehicle_owner_id (a real FK to the vehicle_owner
    # credentials table) against current_user.id - but current_user here
    # is a VehicleOwnerDetails row (see get_current_user in core/security.py,
    # same mismatch found/fixed in car_details.py + car_driver.py's signup
    # routes earlier today), a DIFFERENT primary key. That made this
    # condition true for literally every driver (own or not), so this
    # route denied access to almost every real driver lookup unless the
    # driver's phone happened to equal the owner's own phone. Fixed
    # 2026-09-04 to compare against current_user.vehicle_owner_id.
    if driver.vehicle_owner_id != current_user.vehicle_owner_id and driver.primary_number != current_user.primary_number:
        raise HTTPException(status_code=403, detail="Access denied. You can only view your own drivers.")
    
    return driver

@router.get("/cardriver/mobile/{mobile_number}", response_model=CarDriverOut)
def get_driver_by_mobile(
    mobile_number: str, 
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get car driver by mobile number (only for authenticated fleet owner)"""
    from app.crud.car_driver import get_driver_by_mobile
    
    driver = get_driver_by_mobile(db, mobile_number)
    if not driver:
        raise HTTPException(status_code=404, detail="Car driver not found with this mobile number")
    
    # Verify that the driver belongs to the authenticated fleet owner (or has matching primary number).
    # Was comparing driver.vehicle_owner_id (a real FK to the vehicle_owner
    # credentials table) against current_user.id - but current_user here
    # is a VehicleOwnerDetails row (see get_current_user in core/security.py,
    # same mismatch found/fixed in car_details.py + car_driver.py's signup
    # routes earlier today), a DIFFERENT primary key. That made this
    # condition true for literally every driver (own or not), so this
    # route denied access to almost every real driver lookup unless the
    # driver's phone happened to equal the owner's own phone. Fixed
    # 2026-09-04 to compare against current_user.vehicle_owner_id.
    if driver.vehicle_owner_id != current_user.vehicle_owner_id and driver.primary_number != current_user.primary_number:
        raise HTTPException(status_code=403, detail="Access denied. You can only view your own drivers.")
    
    return driver


def _add_aadhar_docs(driver, documents: dict) -> None:
    """Aadhaar front/back entries for the driver document-status responses."""
    if driver.aadhar_front_img:
        documents["aadhar"] = {
            "document_type": "aadhar",
            "status": driver.aadhar_front_status.value if driver.aadhar_front_status else "Pending",
            "image_url": driver.aadhar_front_img,
            "updated_at": None,
        }
    if driver.aadhar_back_img:
        documents["aadhar_back"] = {
            "document_type": "aadhar_back",
            "status": driver.aadhar_back_status.value if driver.aadhar_back_status else "Pending",
            "image_url": driver.aadhar_back_img,
            "updated_at": None,
        }


@router.get("/cardriver/{driver_id}/document-status", response_model=DocumentStatusListResponse)
def get_driver_document_status(
    driver_id: str,
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get document status for specific driver (fleet owner only)"""
    from app.crud.car_driver import get_driver_by_id
    from uuid import UUID
    
    try:
        driver_uuid = UUID(driver_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid driver ID format")
    
    driver = get_driver_by_id(db, driver_uuid)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    # Verify that the driver belongs to the authenticated fleet owner
    if driver.vehicle_owner_id != current_user.vehicle_owner_id:
        raise HTTPException(status_code=403, detail="Access denied. You can only view your own drivers.")
    
    documents = {}
    if driver.licence_front_img:
        documents["licence"] = {
            "document_type": "licence",
            "status": driver.licence_front_status.value if driver.licence_front_status else "Pending",
            "image_url": driver.licence_front_img,
            "updated_at": None
        }
    if driver.licence_back_img:
        documents["licence_back"] = {
            "document_type": "licence_back",
            "status": driver.licence_back_status.value if driver.licence_back_status else "Pending",
            "image_url": driver.licence_back_img,
            "updated_at": None
        }
    
    _add_aadhar_docs(driver, documents)

    return DocumentStatusListResponse(
        entity_id=driver.id,
        entity_type="driver",
        documents=documents
    )


@router.patch("/cardriver/{driver_id}/document-status", response_model=DocumentUpdateResponse)
def update_driver_document_status(
    driver_id: str,
    status_update: UpdateDocumentStatusRequest,
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update document status for specific driver (fleet owner only)"""
    from app.crud.car_driver import get_driver_by_id
    from uuid import UUID
    
    try:
        driver_uuid = UUID(driver_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid driver ID format")
    
    driver = get_driver_by_id(db, driver_uuid)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    # Verify that the driver belongs to the authenticated fleet owner
    if driver.vehicle_owner_id != current_user.vehicle_owner_id:
        raise HTTPException(status_code=403, detail="Access denied. You can only update your own drivers.")
    
    # Update licence status
    driver.licence_front_status = status_update.status
    db.commit()
    db.refresh(driver)
    
    return DocumentUpdateResponse(
        message="Document status updated successfully",
        document_type="licence",
        new_image_url=driver.licence_front_img,
        new_status=status_update.status.value
    )


@router.post("/cardriver/{driver_id}/update-document", response_model=DocumentUpdateResponse)
def update_driver_document(
    driver_id: str,
    document_type: str = Form(...),
    licence_image: Optional[UploadFile] = File(None),
    licence_back_image: Optional[UploadFile] = File(None),
    aadhar_image: Optional[UploadFile] = File(None),
    aadhar_back_image: Optional[UploadFile] = File(None),
    aadhar_number: Optional[str] = Form(None),
    side: Optional[str] = Form(None),
    document_number: Optional[str] = Form(None),
    driver_name: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update driver document (upload front, back, or both images) - fleet owner only"""
    from app.crud.car_driver import get_driver_by_id
    from uuid import UUID
    
    try:
        driver_uuid = UUID(driver_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid driver ID format")
    
    driver = get_driver_by_id(db, driver_uuid)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    # Verify that the driver belongs to the authenticated fleet owner
    if driver.vehicle_owner_id != current_user.vehicle_owner_id:
        raise HTTPException(status_code=403, detail="Access denied. You can only update your own drivers.")
    
    if document_type not in ["licence", "licence_back", "aadhar", "aadhar_back"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid document type for driver"
        )
    
    if all(f is None for f in (licence_image, licence_back_image, aadhar_image, aadhar_back_image)):
        raise HTTPException(
            status_code=400,
            detail="Please upload at least one document image file"
        )
    
    # Update driver name if provided
    if driver_name:
        cleaned_name = " ".join(driver_name.split())
        if len(cleaned_name) >= 2:
            driver.full_name = cleaned_name
    
    # Update licence number if provided
    if document_number:
        cleaned_doc_num = document_number.strip().upper()
        if cleaned_doc_num:
            driver.licence_number = cleaned_doc_num

    try:
        from app.crud.stale_documents import register_stale_file
        from app.utils.document_verifier import get_auto_verified_status
        from app.crud.document_expiry import parse_expiry

        if expiry_date:
            _exp = parse_expiry(expiry_date)
            if _exp:
                driver.licence_expiry_date = _exp

        new_image_url = None
        new_status = None

        # Process Front Image
        if licence_image is not None:
            if not licence_image.content_type or not licence_image.content_type.startswith('image/'):
                raise HTTPException(status_code=400, detail="Invalid file type for front image. Please upload an image.")
            if licence_image.size and licence_image.size > 5 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Front image is too large (max 5MB).")

            register_stale_file(db, 'driver', driver.id, 'licence_front_status', driver.licence_front_img)
            licence_bytes = licence_image.file.read()
            licence_image.file.seek(0)

            folder_path = f"car_driver/{driver.id}/license"
            front_url = upload_image_to_gcs(licence_image, folder_path)
            prev_front_status = driver.licence_front_status
            front_status = get_auto_verified_status(
                licence_bytes,
                "licence",
                expected_document_number=driver.licence_number,
                expected_name=driver.full_name,
                previous_status=prev_front_status
            )
            driver.licence_front_img = front_url
            driver.licence_front_status = front_status
            new_image_url = front_url
            new_status = front_status

        # Process Back Image
        if licence_back_image is not None:
            if not licence_back_image.content_type or not licence_back_image.content_type.startswith('image/'):
                raise HTTPException(status_code=400, detail="Invalid file type for back image. Please upload an image.")
            if licence_back_image.size and licence_back_image.size > 5 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Back image is too large (max 5MB).")

            register_stale_file(db, 'driver', driver.id, 'licence_back_status', driver.licence_back_img)
            back_bytes = licence_back_image.file.read()
            licence_back_image.file.seek(0)

            back_folder_path = f"car_driver/{driver.id}/license_back"
            back_url = upload_image_to_gcs(licence_back_image, back_folder_path)
            prev_back_status = driver.licence_back_status
            back_status = get_auto_verified_status(
                back_bytes,
                "licence_back",
                expected_document_number=driver.licence_number,
                expected_name=driver.full_name,
                previous_status=prev_back_status
            )
            driver.licence_back_img = back_url
            driver.licence_back_status = back_status
            if not new_image_url:
                new_image_url = back_url
                new_status = back_status

        # Aadhaar front / back (auto-verified the same way as the licence)
        for up, side_name in ((aadhar_image, "front"), (aadhar_back_image, "back")):
            if up is None:
                continue
            if not up.content_type or not up.content_type.startswith('image/'):
                raise HTTPException(status_code=400, detail="Invalid file type for Aadhaar image. Please upload an image.")
            if up.size and up.size > 5 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Aadhaar image is too large (max 5MB).")
            up_bytes = up.file.read()
            up.file.seek(0)
            url = upload_image_to_gcs(up, f"car_driver/{driver.id}/aadhar_{side_name}")
            st = get_auto_verified_status(
                up_bytes, "aadhar",
                previous_status=getattr(driver, f"aadhar_{side_name}_status"),
            )
            setattr(driver, f"aadhar_{side_name}_img", url)
            setattr(driver, f"aadhar_{side_name}_status", st)
            if not new_image_url:
                new_image_url = url
                new_status = st
        if aadhar_number:
            digits = "".join(ch for ch in aadhar_number if ch.isdigit())
            if len(digits) == 12:
                driver.aadhar_number = digits

        db.commit()
        db.refresh(driver)

        return DocumentUpdateResponse(
            message="Document updated successfully",
            document_type="licence",
            new_image_url=new_image_url or "",
            new_status=new_status.value.capitalize() if new_status else "Pending"
        )

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update document: {str(e)}"
        )


@router.get("/cardriver/all-document-status/check", response_model=List[DocumentStatusListResponse])
def get_all_drivers_document_status(
    current_user: VehicleOwnerCredentials = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get document status for all drivers belonging to fleet owner"""
    from app.crud.car_driver import get_drivers_by_vehicleOwner_id
    drivers = get_drivers_by_vehicleOwner_id(db, str(current_user.vehicle_owner_id))
    driver_statuses = []
    for driver in drivers:
        documents = {}
        if driver.licence_front_img:
            documents["licence"] = {
                "document_type": "licence",
                "status": driver.licence_front_status.value if driver.licence_front_status else "Pending",
                "image_url": driver.licence_front_img,
                "updated_at": None,
                **__import__('app.crud.document_expiry', fromlist=['expiry_fields']).expiry_fields(driver.licence_expiry_date),
            }
        if driver.licence_back_img:
            documents["licence_back"] = {
                "document_type": "licence_back",
                "status": driver.licence_back_status.value if driver.licence_back_status else "Pending",
                "image_url": driver.licence_back_img,
                "updated_at": None,
            }
        
        _add_aadhar_docs(driver, documents)
        driver_statuses.append(DocumentStatusListResponse(
            entity_id=driver.id,
            entity_type="driver",
            documents=documents
        ))
    
    return driver_statuses
