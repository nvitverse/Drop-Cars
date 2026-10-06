# schemas/admin_management.py
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime, date
from app.models.common_enums import DocumentStatusEnum

# ============ VENDOR SCHEMAS ============

class VendorListResponse(BaseModel):
    """Response schema for vendor list item.
    Fields that can be missing on partial/legacy signups are Optional so ONE
    incomplete row never 500s the whole list (was the 'vendors not loading' bug)."""
    id: UUID
    vendor_id: UUID
    full_name: Optional[str] = None
    primary_number: Optional[str] = None
    secondary_number: Optional[str] = None
    gpay_number: Optional[str] = None
    wallet_balance: Optional[int] = 0
    bank_balance: Optional[int] = 0
    aadhar_number: Optional[str] = None
    aadhar_front_img: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class VendorListOut(BaseModel):
    """Response schema for vendor list with pagination"""
    vendors: List[VendorListResponse]
    total_count: int

class VendorDocumentInfo(BaseModel):
    """Vendor document information"""
    document_type: str
    status: Optional[str]
    image_url: Optional[str]

class VendorFullDetailsResponse(BaseModel):
    """Response schema for vendor full details"""
    id: UUID
    vendor_id: UUID
    full_name: str
    primary_number: str
    secondary_number: Optional[str]
    gpay_number: str
    wallet_balance: int
    bank_balance: int
    aadhar_number: str
    aadhar_front_img: Optional[str]
    aadhar_status: Optional[str]
    address: str
    city: str
    pincode: str
    account_status: str
    documents: Dict[str, VendorDocumentInfo]
    created_at: datetime
    current_password: Optional[str] = None

    class Config:
        from_attributes = True

class UpdateAccountStatusRequest(BaseModel):
    """Request schema for updating account status"""
    account_status: str

class UpdateDocumentStatusRequest(BaseModel):
    """Request schema for updating document status"""
    document_status: str

class StatusUpdateResponse(BaseModel):
    """Response schema for status update"""
    message: str
    id: UUID
    new_status: str

# ============ VEHICLE OWNER SCHEMAS ============

class VehicleOwnerListResponse(BaseModel):
    """Response schema for fleet owner list item.
    Optional fields so one incomplete/legacy row never 500s the whole list
    (was the 'fleet owners not loading' bug)."""
    id: UUID
    vehicle_owner_id: UUID
    full_name: Optional[str] = None
    primary_number: Optional[str] = None
    secondary_number: Optional[str] = None
    wallet_balance: Optional[int] = 0
    aadhar_number: Optional[str] = None
    aadhar_front_img: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None
    created_at: Optional[datetime] = None
    tier: Optional[str] = None
    subscription_type: Optional[str] = None
    admin_trusted_override: Optional[bool] = False
    account_status: Optional[str] = None
    car_count: int = 0
    driver_count: int = 0

    class Config:
        from_attributes = True

class VehicleOwnerListOut(BaseModel):
    """Response schema for fleet owner list with pagination"""
    vehicle_owners: List[VehicleOwnerListResponse]
    total_count: int

class VehicleOwnerDocumentInfo(BaseModel):
    """Fleet owner document information"""
    document_type: str
    status: Optional[str]
    image_url: Optional[str]

class VehicleOwnerFullDetailsResponse(BaseModel):
    """Response schema for fleet owner full details"""
    id: UUID
    vehicle_owner_id: UUID
    full_name: str
    primary_number: str
    secondary_number: Optional[str]
    wallet_balance: int
    aadhar_number: str
    aadhar_front_img: Optional[str]
    aadhar_status: Optional[str]
    address: str
    city: str
    pincode: str
    account_status: str
    documents: Dict[str, VehicleOwnerDocumentInfo]
    created_at: datetime
    # Yearly maintenance fee billing (Settings > Billing Automation). All
    # platform fees, including this one, are non-refundable once charged.
    billing_next_date: Optional[date] = None
    billing_last_charged_at: Optional[datetime] = None
    billing_suspended: bool = False
    yearly_fee: Optional[int] = None
    tier: Optional[str] = None
    # Real Monthly/Yearly subscription (VehicleOwnerDetails.subscription_type)
    # - a separate concept from `tier` above, which is the Preferred-Partner
    # booking-priority-window tier, not a subscription. Both happen to use
    # similar-sounding words; don't conflate them in any UI reading this.
    subscription_type: Optional[str] = None
    admin_trusted_override: Optional[bool] = False
    trusted_override_by: Optional[str] = None
    trusted_override_reason: Optional[str] = None
    trusted_override_at: Optional[datetime] = None
    current_password: Optional[str] = None

    class Config:
        from_attributes = True

# ============ CAR SCHEMAS ============

class CarListItem(BaseModel):
    """Car list item schema"""
    id: UUID
    vehicle_owner_id: UUID
    car_name: str
    car_type: str
    car_number: str
    year_of_the_car: Optional[str]
    rc_front_img_url: Optional[str]
    rc_front_status: Optional[str]
    rc_back_img_url: Optional[str]
    rc_back_status: Optional[str]
    insurance_img_url: Optional[str]
    insurance_status: Optional[str]
    fc_img_url: Optional[str]
    fc_status: Optional[str]
    car_img_url: Optional[str]
    car_img_status: Optional[str]
    car_status: str
    rating_avg: Optional[float] = 0.0
    rating_count: Optional[int] = 0
    created_at: datetime

    class Config:
        from_attributes = True

class CarListResponse(BaseModel):
    """Response schema for car list"""
    cars: List[CarListItem]

# ============ DRIVER SCHEMAS ============

class DriverListItem(BaseModel):
    """Driver list item schema"""
    id: UUID
    vehicle_owner_id: UUID
    full_name: str
    primary_number: str
    secondary_number: Optional[str] = None
    licence_number: Optional[str] = None
    licence_front_img: Optional[str] = None
    licence_front_status: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None
    driver_status: Optional[str] = None
    rating_avg: Optional[float] = 0.0
    rating_count: Optional[int] = 0
    created_at: datetime

    class Config:
        from_attributes = True

class DriverListResponse(BaseModel):
    """Response schema for driver list"""
    drivers: List[DriverListItem]

# ============ VEHICLE OWNER WITH CARS AND DRIVERS ============

class VehicleOwnerWithAssetsResponse(BaseModel):
    """Response schema for fleet owner with cars and drivers"""
    vehicle_owner: VehicleOwnerFullDetailsResponse
    cars: List[CarListItem]
    drivers: List[DriverListItem]

# ============ UNIFIED ACCOUNT MANAGEMENT SCHEMAS ============

class AccountListItem(BaseModel):
    """Unified account list item with basic info"""
    id: UUID
    reg_id: Optional[str] = None  # Human-friendly registration number (YY#####)
    name: str
    account_type: str  # "vendor", "vehicle_owner", "driver", "quickdriver"
    account_status: Optional[str] = "Inactive"  # "Active", "Inactive", "Pending", "ONLINE", "OFFLINE", etc.
    primary_number: Optional[str] = None  # In the list directly - saves N extra detail calls
    # Set only when an admin deliberately blocked this account (vendor/
    # vehicle_owner only) - lets the UI show "Blocked" as a distinct
    # sub-state of Inactive instead of lumping in never-activated accounts.
    blocked_reason: Optional[str] = None
    # Fraud/confirmed-bad-actor block - separate from blocked_reason above,
    # which is easily reversed by a routine status toggle.
    permanently_blocked: bool = False
    permanently_blocked_reason: Optional[str] = None
    # How many of this account's own documents (KYC/RC/insurance/licence,
    # plus a fleet owner's cars) are still sitting in PENDING review.
    pending_documents_count: int = 0

    class Config:
        from_attributes = True

class AccountListResponse(BaseModel):
    """Response schema for unified account list"""
    accounts: List[AccountListItem]
    total_count: int
    active_count: int
    inactive_count: int

class AccountFullDetailsResponse(BaseModel):
    """Unified response for full account details"""
    id: UUID
    reg_id: Optional[str] = None  # Human-friendly registration number (YY#####)
    account_type: str
    account_status: str
    # Vendor specific fields
    vendor_id: Optional[UUID] = None
    full_name: Optional[str] = None
    primary_number: Optional[str] = None
    secondary_number: Optional[str] = None
    gpay_number: Optional[str] = None
    wallet_balance: Optional[int] = None
    bank_balance: Optional[int] = None
    aadhar_number: Optional[str] = None
    aadhar_front_img: Optional[str] = None
    aadhar_status: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None
    # Fleet Owner specific fields
    vehicle_owner_id: Optional[UUID] = None
    # Driver specific fields
    licence_number: Optional[str] = None
    licence_front_img: Optional[str] = None
    licence_front_status: Optional[str] = None
    # Common
    created_at: datetime
    documents: Optional[Dict[str, VendorDocumentInfo]] = None
    blocked_reason: Optional[str] = None
    permanently_blocked: bool = False
    permanently_blocked_reason: Optional[str] = None
    # Fleet owner's own cars/drivers - populated only for account_type ==
    # "vehicle_owner" (empty list otherwise). Plain dicts rather than
    # CarListItem/DriverListItem to sidestep those schemas' enum-typed
    # fields (car_status/driver_status aren't str-enums, so from_attributes
    # validation would reject them as-is) - the Info modal only reads a
    # handful of fields from each anyway (found 2026-09-30: this endpoint
    # never populated these at all, so a fleet owner's "Info" view always
    # looked empty regardless of how many cars/drivers they actually had).
    cars: List[Dict[str, Any]] = []
    drivers: List[Dict[str, Any]] = []
    # Trusted Partner status (vehicle_owner only) - see VehicleOwnerDetails.tier
    tier: Optional[str] = None
    admin_trusted_override: Optional[bool] = None

    class Config:
        from_attributes = True

# ============ DOCUMENT VERIFICATION SCHEMAS ============

class DocumentItem(BaseModel):
    """Individual document item"""
    document_id: str  # Unique identifier: "account_aadhar", "car_1_rc_front", etc.
    document_type: str  # "aadhar", "licence", "rc_front", "rc_back", "insurance", "fc", "car_img", "permit"
    document_name: str  # Display name: "Aadhar Card", "RC Front", etc.
    image_url: Optional[str] = None
    status: str  # "PENDING", "VERIFIED", "INVALID"
    uploaded_at: Optional[datetime] = None
    # For car documents
    car_id: Optional[UUID] = None
    car_name: Optional[str] = None
    car_number: Optional[str] = None
    # RC/Insurance/Licence only - drives the daily expiry-reminder sweep
    # (crud/document_expiry.py). None for every other document type.
    expiry_date: Optional[str] = None

    class Config:
        from_attributes = True

class AccountDocumentsResponse(BaseModel):
    """Response with all documents for an account"""
    account_id: UUID
    account_type: str
    account_name: str
    account_documents: List[DocumentItem]  # Account-level documents (aadhar/license)
    car_documents: List[DocumentItem] = []  # Car documents (if fleet owner)
    total_documents: int
    pending_count: int
    verified_count: int
    invalid_count: int
    
    class Config:
        from_attributes = True

class DocumentStatusUpdateResponse(BaseModel):
    """Response after updating document status"""
    message: str
    document_id: str
    document_type: str
    new_status: str
    
    class Config:
        from_attributes = True

# ============ CAR LIST SCHEMAS ============

class CarListItem(BaseModel):
    """Car list item with basic info"""
    id: UUID
    vehicle_owner_id: UUID
    car_name: str
    car_type: str
    car_number: str
    year_of_the_car: Optional[str] = None
    car_status: str  # ONLINE, DRIVING, BLOCKED, PROCESSING
    vehicle_owner_name: Optional[str] = None
    # Human-friendly registration id (e.g. "2600042") - the owner's real
    # display identifier. Prefer this over vehicle_owner_id (an internal
    # UUID) anywhere this list is shown to a human.
    vehicle_owner_reg_id: Optional[str] = None
    rating_avg: Optional[float] = 0.0
    rating_count: Optional[int] = 0
    created_at: datetime

    class Config:
        from_attributes = True

class CarListResponse(BaseModel):
    """Response schema for car list"""
    cars: List[CarListItem]
    total_count: int
    online_count: int
    blocked_count: int
    processing_count: int
    driving_count: int

# ============ CUSTOMER SCHEMAS ============
# NOTE: customers have no wallet_balance / account_status of their own in the
# schema - they just pay per-trip via Razorpay, there's no fleet-style
# verification/activation flow for them. Keep this list intentionally simple.

class CustomerListItem(BaseModel):
    """Customer list item - real rows from customer + customer_details,
    not the booking-request grouping the old /admin/customer-bookings-based
    view used as a workaround."""
    id: UUID  # customer_details.id
    customer_id: UUID  # customer.id (credentials row)
    full_name: str
    primary_number: str
    email: Optional[str] = None
    saved_addresses: Optional[list] = None
    segment: str = "INDIVIDUAL"  # INDIVIDUAL, B2B, or CORPORATE - admin-set
    company_name: Optional[str] = None
    gst_number: Optional[str] = None
    created_at: datetime
    current_password: Optional[str] = None

    class Config:
        from_attributes = True

class CustomerListOut(BaseModel):
    """Response schema for customer list with pagination"""
    customers: List[CustomerListItem]
    total_count: int


class AdminCreateCarRequest(BaseModel):
    """Admin directly assigns a car to a fleet owner - not subject to the
    NEW SEDAN minimum-year restriction that applies to driver self-signup."""
    vehicle_owner_id: UUID
    car_name: str
    car_type: str
    car_number: str
    year_of_the_car: Optional[str] = None


class AdminCreateCarResponse(BaseModel):
    id: UUID
    vehicle_owner_id: UUID
    car_name: str
    car_type: str
    car_number: str
    year_of_the_car: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NewCarYearSetting(BaseModel):
    new_car_min_year: int