from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.schemas.vendor import VendorSignupForm, VendorSignin, TokenResponse, VendorOut
from app.crud.vendor import create_vendor, authenticate_vendor, get_vendor_with_details, get_vendor_details_by_vendor_id
from app.core.security import create_access_token
from app.database.session import get_db
from typing import Optional
from app.schemas.vendor import VendorDetailsResponse, VendorBusinessNameUpdate
from app.core.security import get_current_vendor
from app.schemas.document_status import DocumentStatusListResponse, UpdateDocumentStatusRequest, UpdateDocumentRequest, DocumentUpdateResponse
from app.models.common_enums import DocumentStatusEnum
from app.utils.gcs import generate_signed_url_from_gcs

router = APIRouter()

@router.post("/vendor/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def vendor_signup(
    full_name: str = Form(..., description="Full name (3-100 characters)"),
    primary_number: str = Form(..., description="Primary mobile number"),
    secondary_number: Optional[str] = Form(None, description="Secondary mobile number (optional)"),
    password: str = Form(..., description="Password (min 6 characters)"),
    address: str = Form(..., description="Address (min 10 characters)"),
    city: str = Form(..., description="City"),
    pincode: str = Form(..., description="Pincode (6 digits)"),
    aadhar_number: str = Form(..., description="Aadhar number (12 digits)"),
    gpay_number: str = Form(..., description="GPay number"),
    aadhar_image: Optional[UploadFile] = File(None, description="Aadhar front image"),
    db: Session = Depends(get_db)
):
    """
    Vendor Signup API
    
    Creates a new vendor account with both credentials and details.
    Uploads aadhar image to GCS and stores the URL in database.
    Implements rollback mechanism - if database insertion fails, 
    the uploaded image is deleted from GCS.
    
    Returns:
        - Access token for authentication
        - Vendor details
    """
    try:
        # Validate form data
        vendor_data = VendorSignupForm(
            full_name=full_name,
            primary_number=primary_number,
            secondary_number=secondary_number,
            password=password,
            address=address,
            city=city,
            pincode=pincode,
            aadhar_number=aadhar_number,
            gpay_number=gpay_number
        )
        
        # Validate image file if provided
        if aadhar_image:
            if not aadhar_image.content_type.startswith('image/'):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="File must be an image"
                )
            
            # Check file size (max 5MB)
            if aadhar_image.size and aadhar_image.size > 5 * 1024 * 1024:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Image size must be less than 5MB"
                )
        
        # Create vendor
        vendor_credentials, vendor_details = create_vendor(db, vendor_data, aadhar_image)
        
        # Create access token - 6-month expiry, same fix as vehicle_owner.py's
        # signin; see app.core.security.VENDOR_ACCESS_TOKEN_EXPIRE_MINUTES.
        from datetime import timedelta as _timedelta
        from app.core.security import VENDOR_ACCESS_TOKEN_EXPIRE_MINUTES
        access_token = create_access_token(
            {"sub": str(vendor_credentials.id), "token_version": vendor_credentials.token_version, "user": "vendor"},
            expires_delta=_timedelta(minutes=VENDOR_ACCESS_TOKEN_EXPIRE_MINUTES),
        )

        # Prepare response
        vendor_response = VendorOut(
            id=vendor_details.id,
            full_name=vendor_details.full_name,
            primary_number=vendor_details.primary_number,
            secondary_number=vendor_details.secondary_number,
            gpay_number=vendor_details.gpay_number,
            wallet_balance=vendor_details.wallet_balance,
            bank_balance=vendor_details.bank_balance,
            aadhar_number=vendor_details.aadhar_number,
            aadhar_front_img=vendor_details.aadhar_front_img,
            address=vendor_details.address,
            city=vendor_details.city,
            pincode=vendor_details.pincode,
            account_status=vendor_credentials.account_status.value,
            created_at=vendor_details.created_at
        )
        
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            vendor=vendor_response
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.post("/vendor/signin", response_model=TokenResponse)
async def vendor_signin(
    vendor_data: VendorSignin,
    db: Session = Depends(get_db)
):
    """
    Vendor Signin API
    
    Authenticates vendor with primary number and password.
    Returns access token and vendor details upon successful authentication.
    
    Returns:
        - Access token for authentication
        - Vendor details
    """
    try:
        from app.crud.vendor import get_vendor_by_primary_number
        existing = get_vendor_by_primary_number(db, vendor_data.primary_number)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_REGISTERED")

        # Authenticate vendor
        vendor_credentials = authenticate_vendor(
            db,
            vendor_data.primary_number,
            vendor_data.password
        )

        if not vendor_credentials:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password. Please try again."
            )

        if getattr(vendor_credentials, "permanently_blocked", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been permanently blocked. Contact support if you believe this is a mistake.",
            )

        # Get vendor details
        vendor_details = get_vendor_with_details(db, str(vendor_credentials.id))[1]
        
        if not vendor_details:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vendor details not found"
            )
        
        # Create access token - 6-month expiry, same fix as vehicle_owner.py's
        # signin; see app.core.security.VENDOR_ACCESS_TOKEN_EXPIRE_MINUTES.
        from datetime import timedelta as _timedelta
        from app.core.security import VENDOR_ACCESS_TOKEN_EXPIRE_MINUTES
        access_token = create_access_token(
            {"sub": str(vendor_credentials.id), "token_version": vendor_credentials.token_version, "user": "vendor"},
            expires_delta=_timedelta(minutes=VENDOR_ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        
        # Prepare response
        vendor_response = VendorOut(
            id=vendor_details.id,
            full_name=vendor_details.full_name,
            primary_number=vendor_details.primary_number,
            secondary_number=vendor_details.secondary_number,
            gpay_number=vendor_details.gpay_number,
            wallet_balance=vendor_details.wallet_balance,
            bank_balance=vendor_details.bank_balance,
            aadhar_number=vendor_details.aadhar_number,
            aadhar_front_img=vendor_details.aadhar_front_img,
            address=vendor_details.address,
            city=vendor_details.city,
            pincode=vendor_details.pincode,
            account_status=vendor_credentials.account_status.value,
            created_at=vendor_details.created_at
        )
        
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            vendor=vendor_response
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.get("/vendor-details/me", response_model=VendorDetailsResponse)
def get_my_vendor_details(
    db: Session = Depends(get_db),
    vendor_id: str = Depends(get_current_vendor),
):
    # Unpack both credentials and details from the DB
    vendor_credentials, vendor_details = get_vendor_with_details(db, str(vendor_id.id))

    return VendorDetailsResponse(
        id=str(vendor_details.id),
        address=vendor_details.address,
        city=vendor_details.city,
        pincode=vendor_details.pincode,
        account_status=vendor_credentials.account_status.value,
        full_name=vendor_details.full_name,
        business_name=vendor_details.business_name,
        primary_number=vendor_details.primary_number,
        secondary_number=vendor_details.secondary_number,
        gpay_number=vendor_details.gpay_number,
        wallet_balance=vendor_details.wallet_balance,
        bank_balance=vendor_details.bank_balance,
        aadhar_number=vendor_details.aadhar_number,
        aadhar_front_img=generate_signed_url_from_gcs(vendor_details.aadhar_front_img) if vendor_details.aadhar_front_img else None,
        aadhar_status=vendor_details.aadhar_status.value if vendor_details.aadhar_status else None,
        created_at=vendor_details.created_at,
    )


@router.put("/vendor-details/business-name", response_model=VendorDetailsResponse)
def update_my_business_name(
    payload: VendorBusinessNameUpdate,
    db: Session = Depends(get_db),
    vendor_id: str = Depends(get_current_vendor),
):
    """Self-serve: let a vendor set/change their own business/travels name -
    shown to drivers instead of their personal name (see
    crud/order_details.py, crud/order_assignments.py)."""
    vendor_credentials, vendor_details = get_vendor_with_details(db, str(vendor_id.id))
    vendor_details.business_name = payload.business_name.strip()
    db.add(vendor_details)
    db.commit()
    db.refresh(vendor_details)

    return VendorDetailsResponse(
        id=str(vendor_details.id),
        address=vendor_details.address,
        city=vendor_details.city,
        pincode=vendor_details.pincode,
        account_status=vendor_credentials.account_status.value,
        full_name=vendor_details.full_name,
        business_name=vendor_details.business_name,
        primary_number=vendor_details.primary_number,
        secondary_number=vendor_details.secondary_number,
        gpay_number=vendor_details.gpay_number,
        wallet_balance=vendor_details.wallet_balance,
        bank_balance=vendor_details.bank_balance,
        aadhar_number=vendor_details.aadhar_number,
        aadhar_front_img=generate_signed_url_from_gcs(vendor_details.aadhar_front_img) if vendor_details.aadhar_front_img else None,
        aadhar_status=vendor_details.aadhar_status.value if vendor_details.aadhar_status else None,
        created_at=vendor_details.created_at,
    )


@router.get("/vendor/document-status", response_model=DocumentStatusListResponse)
def get_vendor_document_status(
    db: Session = Depends(get_db),
    vendor_id: str = Depends(get_current_vendor),
):
    """Get document status for vendor"""
    vendor_credentials, vendor_details = get_vendor_with_details(db, str(vendor_id.id))
    
    if not vendor_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor details not found"
        )
    
    documents = {}
    if vendor_details.aadhar_front_img:
        documents["aadhar"] = {
            "document_type": "aadhar",
            "status": vendor_details.aadhar_status.value if vendor_details.aadhar_status else "Pending",
            "image_url": vendor_details.aadhar_front_img,
            "updated_at": None
        }
    
    return DocumentStatusListResponse(
        entity_id=vendor_details.id,
        entity_type="vendor",
        documents=documents
    )


@router.patch("/vendor/document-status", response_model=DocumentUpdateResponse)
def update_vendor_document_status(
    status_update: UpdateDocumentStatusRequest,
    db: Session = Depends(get_db),
    vendor_id: str = Depends(get_current_vendor),
):
    """Update document status for vendor (admin only)"""
    vendor_credentials, vendor_details = get_vendor_with_details(db, str(vendor_id.id))
    
    if not vendor_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor details not found"
        )
    
    # Update aadhar status
    vendor_details.aadhar_status = status_update.status
    db.commit()
    db.refresh(vendor_details)
    
    return DocumentUpdateResponse(
        message="Document status updated successfully",
        document_type="aadhar",
        new_image_url=vendor_details.aadhar_front_img,
        new_status=status_update.status.value
    )


@router.post("/vendor/update-document", response_model=DocumentUpdateResponse)
async def update_vendor_document(
    document_type: str = Form(...),
    aadhar_image: UploadFile = File(...),
    db: Session = Depends(get_db),
    vendor_id: str = Depends(get_current_vendor),
):
    """Update vendor document (upload new image)"""
    if document_type != "aadhar":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid document type for vendor"
        )
    
    # Validate image file
    if not aadhar_image.content_type or not aadhar_image.content_type.startswith('image/'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Please upload an image file"
        )
    
    if aadhar_image.size and aadhar_image.size > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image file is too large. Please upload an image smaller than 5MB"
        )
    
    vendor_credentials, vendor_details = get_vendor_with_details(db, str(vendor_id.id))
    
    if not vendor_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor details not found"
        )
    
    # Upload new image to GCS
    from app.utils.gcs import upload_image_to_gcs, delete_gcs_file_by_url
    
    try:
        # Delete old image if exists
        if vendor_details.aadhar_front_img:
            delete_gcs_file_by_url(vendor_details.aadhar_front_img)

        image_bytes = await aadhar_image.read()
        await aadhar_image.seek(0)

        # Upload new image
        new_image_url = upload_image_to_gcs(aadhar_image, "vendor_details/aadhar")

        from app.utils.document_verifier import get_auto_verified_status
        prev_status = vendor_details.aadhar_status
        new_status = get_auto_verified_status(image_bytes, "aadhar", previous_status=prev_status)

        # Update database
        vendor_details.aadhar_front_img = new_image_url
        vendor_details.aadhar_status = new_status
        db.commit()
        db.refresh(vendor_details)

        return DocumentUpdateResponse(
            message="Document updated successfully",
            document_type="aadhar",
            new_image_url=new_image_url,
            new_status=new_status.value.capitalize()
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update document: {str(e)}"
        )

def _mask_phone_last4(number: str) -> str:
    number = (number or "").strip()
    if len(number) <= 4:
        return "****"
    return "*" * (len(number) - 4) + number[-4:]


@router.get("/vacant-cities")
async def get_vacant_city_updates(
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    """
    Vendor view of Vacant City updates: shows which owners are waiting and in
    which cities. Owner ID + a last-4-digits-masked phone number are included
    (owner decision) so a vendor can pick one specific idle owner and send
    them a targeted "Notify" for a pending booking (see
    POST /orders/{order_id}/notify's target_vehicle_owner_id) - the full
    phone number stays hidden and this is notify-only, not a way to bypass
    the platform and contact someone directly.
    """
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.car_driver import CarDriver

    now_utc = datetime.now(timezone.utc)
    now_naive = datetime.utcnow()
    cutoff_24h = now_utc - timedelta(hours=24)
    cutoff_24h_naive = now_naive - timedelta(hours=24)

    # Automatically clean up any expired, stale (>24h), or NULL updated_at vacant city records in DB
    try:
        all_vacant_owners = db.query(VehicleOwnerDetails).filter(
            VehicleOwnerDetails.vacant_cities.isnot(None)
        ).all()
        for vo in all_vacant_owners:
            updated_at = vo.vacant_cities_updated_at
            is_stale = False
            if not updated_at:
                is_stale = True
            else:
                if isinstance(updated_at, str):
                    try:
                        updated_at = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
                    except Exception:
                        is_stale = True

                if isinstance(updated_at, datetime):
                    if updated_at.tzinfo is None:
                        if updated_at < cutoff_24h_naive:
                            is_stale = True
                    else:
                        if updated_at < cutoff_24h:
                            is_stale = True

            if is_stale:
                vo.vacant_cities = None
                vo.vacant_cities_updated_at = None
                vo.vacant_driver_id = None
                vo.vacant_driver_name = None
                vo.vacant_car_id = None
                vo.vacant_car_number = None

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error purging vacant cities: {e}")

    owners = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vacant_cities.isnot(None),
        VehicleOwnerDetails.vacant_cities_updated_at.isnot(None),
    ).all()

    results = []
    for o in owners:
        if not o.vacant_cities or len(o.vacant_cities) == 0:
            continue

        updated_at = o.vacant_cities_updated_at
        if not updated_at:
            continue

        if isinstance(updated_at, str):
            try:
                updated_at = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
            except Exception:
                continue

        if isinstance(updated_at, datetime):
            if updated_at.tzinfo is None and updated_at < cutoff_24h_naive:
                continue
            elif updated_at.tzinfo is not None and updated_at < cutoff_24h:
                continue

        # No rating of their own - fleet owners aren't rated, their
        # drivers are (see models/rating.py). Show the average across
        # their drivers who've actually been rated at least once, so
        # brand-new/unrated drivers don't drag a real average to 0.
        rated_drivers = db.query(CarDriver.rating_avg, CarDriver.rating_count).filter(
            CarDriver.vehicle_owner_id == o.vehicle_owner_id,
            CarDriver.rating_count > 0,
        ).all()
        avg_driver_rating = None
        if rated_drivers:
            total_weight = sum(rc for _, rc in rated_drivers)
            if total_weight > 0:
                avg_driver_rating = round(
                    sum(ra * rc for ra, rc in rated_drivers) / total_weight, 1
                )

        iso_time = updated_at.isoformat() if isinstance(updated_at, datetime) else str(updated_at)

        results.append({
            "vehicle_owner_id": str(o.vehicle_owner_id),
            "masked_phone": _mask_phone_last4(o.primary_number),
            "cities": o.vacant_cities,
            "updated_at": iso_time,
            "driver_name": getattr(o, "vacant_driver_name", None),
            "car_number": getattr(o, "vacant_car_number", None),
            "avg_driver_rating": avg_driver_rating,
        })
    return results


class DriverSearchRequest(BaseModel):
    query: str


@router.post("/vendor/drivers/search")
async def search_driver(
    body: DriverSearchRequest,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    from app.crud.car_driver import search_drivers_and_owners_for_vendor
    results = search_drivers_and_owners_for_vendor(db, body.query)
    return results


@router.get("/vendor/drivers/search")
async def search_driver_get(
    query: str,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    from app.crud.car_driver import search_drivers_and_owners_for_vendor
    results = search_drivers_and_owners_for_vendor(db, query)
    return results


# --- Self-service email add/change with OTP verification (logged-in vendor) ---

@router.get("/vendor/email")
async def get_vendor_email(
    db: Session = Depends(get_db),
    vendor_id: str = Depends(get_current_vendor),
):
    from app.models.vendor import VendorCredentials
    creds = db.query(VendorCredentials).filter(VendorCredentials.id == vendor_id).first()
    return {
        "email": getattr(creds, "email", None),
        "email_verified": bool(getattr(creds, "email_verified", False)),
    }


@router.post("/vendor/email/request-otp")
async def vendor_request_email_otp(
    payload: dict,
    db: Session = Depends(get_db),
    vendor_id: str = Depends(get_current_vendor),
):
    """Send a verification code to the NEW email the vendor wants to use."""
    from app.crud.email_change import request_email_change_otp
    from app.models.vendor import VendorCredentials
    creds = db.query(VendorCredentials).filter(VendorCredentials.id == vendor_id).first()
    if not creds:
        raise HTTPException(status_code=404, detail="Account not found")
    return request_email_change_otp(db, "vendor", creds.primary_number, str(payload.get("email", "")))


@router.post("/vendor/email/confirm")
async def vendor_confirm_email(
    payload: dict,
    db: Session = Depends(get_db),
    vendor_id: str = Depends(get_current_vendor),
):
    """Verify the code and save the new email (marked verified)."""
    from app.crud.email_change import confirm_email_change
    from app.models.vendor import VendorCredentials
    creds = db.query(VendorCredentials).filter(VendorCredentials.id == vendor_id).first()
    if not creds:
        raise HTTPException(status_code=404, detail="Account not found")
    return confirm_email_change(
        db, "vendor", creds.primary_number,
        str(payload.get("email", "")), str(payload.get("code", "")), creds,
    )


# --- Payment details (Settings > Payment Details) ---
class PaymentDetailsUpdate(BaseModel):
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_account_holder_name: Optional[str] = None
    upi_id: Optional[str] = None


@router.put("/vendor/payment-details")
async def update_vendor_payment_details(
    payload: PaymentDetailsUpdate,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    """Either bank OR UPI is enough - both stay optional, no required-both check."""
    from app.models.vendor_details import VendorDetails
    details = db.query(VendorDetails).filter(VendorDetails.vendor_id == current_vendor.id).first()
    if not details:
        raise HTTPException(status_code=404, detail="Vendor details not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(details, field, value)
    db.commit()
    return {
        "bank_account_number": details.bank_account_number,
        "bank_ifsc": details.bank_ifsc,
        "bank_account_holder_name": details.bank_account_holder_name,
        "upi_id": details.upi_id,
    }


# --- Payout requests (Wallet > Request Payout) - vendor side, mirrors the
# fleet-owner flow in app/api/routes/wallet.py ---
from app.schemas.payout_request import CreatePayoutRequest, PayoutRequestOut
from app.crud.payout_requests import create_payout_request, get_payout_requests_for_owner
from typing import List as _List


@router.post("/vendor/payout-request", response_model=PayoutRequestOut, status_code=status.HTTP_201_CREATED)
def vendor_request_payout(
    payload: CreatePayoutRequest,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    result = create_payout_request(db, payload.amount, vendor_id=str(current_vendor.id))
    try:
        import asyncio
        from app.crud.notification import send_push_notification_to_admin
        asyncio.ensure_future(send_push_notification_to_admin(
            db, title="New payout request",
            message=f"Vendor requested a payout of ₹{payload.amount}.",
        ))
    except Exception as e:
        print(f"payout-request admin push failed (request still created): {e}")
    return result


@router.get("/vendor/payout-requests", response_model=_List[PayoutRequestOut])
def vendor_list_my_payout_requests(
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    return get_payout_requests_for_owner(db, vendor_id=str(current_vendor.id))


@router.get("/vendor/reports/monthly-statement")
def get_vendor_monthly_report_api(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    """Generates monthly trip settlement summary & breakdown for Vendor App direct PDF download."""
    from app.services.vendor_pdf_report import generate_vendor_monthly_statement
    return generate_vendor_monthly_statement(db, str(current_vendor.id), year, month)


@router.post("/vendor/whatsapp-slip")
def generate_whatsapp_business_slip_api(
    payload: dict,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    """Generates pre-formatted WhatsApp Business deep link & text payload containing Trip Details, OTP, and tracking link."""
    from app.utils.whatsapp_intent import build_whatsapp_business_slip_url
    
    phone = payload.get("phone_number")
    booking_id = payload.get("booking_id", "N/A")
    pickup_city = payload.get("pickup_city", "N/A")
    drop_city = payload.get("drop_city", "N/A")
    pickup_date_time = payload.get("pickup_date_time", "N/A")
    otp_code = payload.get("otp_code", "1234")
    driver_name = payload.get("driver_name", "Assigned Driver")
    driver_phone = payload.get("driver_phone", "N/A")
    vehicle_number = payload.get("vehicle_number", "N/A")
    car_type = payload.get("car_type", "Sedan")
    total_amount = float(payload.get("total_amount", 0.0))
    advance_received = float(payload.get("advance_received", 0.0))
    cash_to_collect = float(payload.get("cash_to_collect", 0.0))
    tracking_link = payload.get("tracking_link")

    if not phone:
        raise HTTPException(status_code=400, detail="phone_number is required")

    return build_whatsapp_business_slip_url(
        phone_number=phone,
        booking_id=booking_id,
        pickup_city=pickup_city,
        drop_city=drop_city,
        pickup_date_time=pickup_date_time,
        otp_code=otp_code,
        driver_name=driver_name,
        driver_phone=driver_phone,
        vehicle_number=vehicle_number,
        car_type=car_type,
        total_amount=total_amount,
        advance_received=advance_received,
        cash_to_collect=cash_to_collect,
        tracking_link=tracking_link
    )

