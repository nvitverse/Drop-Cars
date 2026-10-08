# api/routes/admin.py
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query, Body
from sqlalchemy.orm import Session
# Plain BaseModel, imported once at the top - several request schemas further
# down in this (very long) file use bare `BaseModel` directly, but the only
# imports of it used to be scoped/aliased ones done mid-file (as
# _StaffBaseModel, _AdminEditFareBaseModel, etc.) or a plain one placed too
# far down (line ~3486) to be defined yet when Python reaches an earlier
# `class Foo(BaseModel)` - NameError: name 'BaseModel' is not defined,
# crashing the whole app at import time. Found 2026-09-29 when this crashed
# a deploy. Importing it here once makes every later bare `BaseModel` usage
# safe regardless of where else it's re-imported.
from pydantic import BaseModel
from app.schemas.admin import AdminSignup,UserInfoResponse, SearchUserRequest,AdminSignin, AdminTokenResponse, AdminOut, AdminUpdate, AdminLedger, UserPasswordUpdate, UserPasswordUpdateResponse
from app.schemas.admin_add_money import VehicleOwnerInfoResponse, SearchVehicleOwnerRequest, AdminAddMoneyRequest, AdminAddMoneyResponse
from app.crud.admin import get_user_by_primary_number,create_admin, authenticate_admin, get_admin_by_id, update_admin, get_all_admins, reset_password_by_id, delete_admin
from app.crud.admin_add_money import get_vehicle_owner_by_primary_number, create_admin_add_money_transaction
from app.crud.admin_management import (
    get_all_vendors, get_vendor_full_details, update_vendor_account_status, update_vendor_document_status,
    get_all_vehicle_owners, get_vehicle_owner_full_details, update_vehicle_owner_account_status,
    update_vehicle_owner_document_status, get_vehicle_owner_cars, get_vehicle_owner_drivers,
    update_car_account_status, update_car_document_status, update_driver_account_status, update_driver_document_status,
    get_all_accounts_unified, get_account_details_by_id,
    get_all_account_documents, update_document_status_by_id, update_unified_account_status,
    get_all_cars_unified, get_all_customers,
    update_document_expiry_date, update_driver_licence_expiry_date,
    update_customer_segment
)
from app.schemas.admin_management import (
    VendorListOut, VendorFullDetailsResponse, VehicleOwnerListOut, VehicleOwnerFullDetailsResponse,
    UpdateAccountStatusRequest, UpdateDocumentStatusRequest, StatusUpdateResponse,
    CarListResponse, DriverListResponse, VehicleOwnerWithAssetsResponse,
    AccountListResponse, AccountListItem, AccountFullDetailsResponse,
    AccountDocumentsResponse, DocumentItem, DocumentStatusUpdateResponse,
    CarListItem, CustomerListOut, CustomerListItem,
    AdminCreateCarRequest, AdminCreateCarResponse, NewCarYearSetting
)
from app.crud.car_details import create_car_admin, get_new_car_min_year, set_new_car_min_year
from app.schemas.order_details import AdminOrdersListResponse, AdminOrderDetailResponse
from app.crud.order_details import get_all_admin_orders
from app.crud.admin_wallet import get_admin_account_ledger_data
from app.core.security import create_access_token, ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES, get_current_admin, get_current_user_flexible
from app.schemas.payout_request import PayoutRequestOut, ProcessPayoutRequest, AdminInitiatedPayoutRequest
from app.crud.payout_requests import get_payout_requests, mark_payout_paid, reject_payout_request
from app.database.session import get_db
from app.utils.gcs import upload_image_to_gcs, generate_signed_url_from_gcs
from app.models.common_enums import DocumentStatusEnum
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from uuid import UUID
import os

router = APIRouter()

# Section keys a Staff admin can be granted. "settings" is deliberately
# never included - only an Owner ever reaches Settings/staff-management,
# so a staff account can never create more staff or elevate itself no
# matter what's passed in `permissions`.
#
# The first four gate whole bottom-tab sections (frontend tab-hiding only,
# see the known gap noted on /admin/signup). The last four are finer-grained
# action permissions layered on top, anticipating a future "Accounts
# Manager" role that needs some-but-not-all of a section's actions -
# "payment_release" is the one of these four with REAL backend enforcement
# today (require_payment_release_permission, used by wallet-adjust and
# payout mark-paid/admin-initiated-payout); approvals/verifications/
# account_activations are grantable and shown in the staff UI but not yet
# wired into any endpoint - same unenforced-beyond-tab-hiding state the
# original four are already in.
ALLOWED_STAFF_PERMISSIONS = {
    "bookings", "customers", "fleet", "finance",
    "approvals", "verifications", "account_activations", "payment_release",
    # "Accounts / Tax Staff" tier (see app/api/routes/tax_admin.py): GSTR-1/
    # 3B, TDS, ITC tracking, tax exports, full invoice/ledger access,
    # read-only on customer PII. Deliberately separate from "finance" -
    # finance today gates payout/wallet actions, this gates tax/GST
    # reporting, and a staff account may need one without the other.
    "tax_accounts",
    # Manually marking a fleet owner's account "Trusted Partner"
    # (admin_trusted_override) - deliberately its own permission, not
    # folded into "fleet" or "verifications", since Trusted Partner unlocks
    # posting bookings to the whole driver network and holding customer
    # advances (2026-09-30, per owner: "only some selected staffs").
    "trusted_partner_management",
    # Sections the Admin App already hides/shows per staff member (canSee / permissions.includes) - these used to be missing
    # here, so ticking "Leads/CRM" when adding staff was rejected with 400 "Invalid permissions" and no staff could be added.
    "enquiries", "chats", "tasks", "support", "accounts",
}
STAFF_PERMISSION_EXTRA_KEY = "staff_permission_keys"


def allowed_staff_permissions(db) -> set:
    """Built-in keys plus any extra keys the owner adds in platform setting `staff_permission_keys` (comma separated),
    so a new section can be granted to staff without a backend deploy."""
    try:
        from app.crud.customer_booking_request import get_platform_setting_value
        raw = get_platform_setting_value(db, STAFF_PERMISSION_EXTRA_KEY, "")
    except Exception:
        raw = ""
    extra = {x.strip().lower() for x in str(raw or "").split(",") if x.strip()}
    return set(ALLOWED_STAFF_PERMISSIONS) | extra


def require_payment_release_permission(admin) -> None:
    """Owner always passes. A Staff account needs 'payment_release' (or the
    broader 'finance' section access) explicitly granted."""
    if admin.role == "Owner":
        return
    perms = set(admin.permissions or [])
    if "payment_release" not in perms and "finance" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to release payments. Ask the Owner to grant 'Payment Release' access.",
        )


def require_owner(admin) -> None:
    """Gross revenue, tax liabilities, bank payouts, tax-setting changes,
    manual refund approval, and annual ITR exports are Owner-only per the
    tax/accounting spec - Staff never sees these regardless of permissions
    granted, mirroring how 'settings' is already never grantable to Staff."""
    if admin.role != "Owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the Owner account can access this.",
        )


def require_trusted_partner_permission(admin) -> None:
    """Owner always passes. A Staff account needs 'trusted_partner_management'
    explicitly granted - deliberately NOT folded into 'fleet' or
    'verifications', so this stays limited to a hand-picked subset of staff."""
    if admin.role == "Owner":
        return
    perms = set(admin.permissions or [])
    if "trusted_partner_management" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to change Trusted Partner status. Ask the Owner to grant it.",
        )


def require_tax_accounts_permission(admin) -> None:
    """Owner always passes. A Staff account needs 'tax_accounts' (or the
    broader 'finance' section access) explicitly granted to reach GSTR/TDS
    reports, tax exports, and the invoice ledger."""
    if admin.role == "Owner":
        return
    perms = set(admin.permissions or [])
    if "tax_accounts" not in perms and "finance" not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view tax/accounts data. Ask the Owner to grant 'Accounts / Tax' access.",
        )


@router.post("/admin/signup", response_model=AdminTokenResponse, status_code=status.HTTP_201_CREATED)
def admin_signup(
    admin_data: AdminSignup,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Admin Signup API - creates a new admin/staff account. LOCKED to Owner
    accounts only (2026-08-21: previously any logged-in admin, including a
    future Staff account, could create more admins and self-assign
    role="Owner" via the free-text role field - a real privilege-escalation
    hole once Staff accounts exist, even though the endpoint itself was
    already locked behind login on 2026-07-05).

    Returns:
        - Access token for authentication
        - Admin details
    """
    try:
        if current_admin.role != "Owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the Owner can create staff accounts",
            )
        if admin_data.role not in ("Owner", "Staff"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="role must be 'Owner' or 'Staff'",
            )
        _allowed = allowed_staff_permissions(db)
        invalid_perms = set(admin_data.permissions) - _allowed
        if invalid_perms:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid permissions: {sorted(invalid_perms)}. Allowed: {sorted(_allowed)}",
            )

        # Check if admin already exists with the same username
        from app.crud.admin import get_admin_by_username
        existing_admin = get_admin_by_username(db, admin_data.username)
        if existing_admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Admin with this username already registered"
            )
        
        # Check if admin already exists with the same email
        from app.crud.admin import get_admin_by_email
        existing_email = get_admin_by_email(db, admin_data.email)
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Admin with this email already registered"
            )
        
        # Check if admin already exists with the same phone
        from app.crud.admin import get_admin_by_phone
        existing_phone = get_admin_by_phone(db, admin_data.phone)
        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Admin with this phone number already registered"
            )
        
        # Hash password and create admin
        from app.core.security import get_password_hash
        hashed_password = get_password_hash(admin_data.password)
        
        admin = create_admin(
            db=db,
            username=admin_data.username,
            hashed_password=hashed_password,
            role=admin_data.role,
            email=admin_data.email,
            phone=admin_data.phone,
            permissions=admin_data.permissions if admin_data.role == "Staff" else [],
        )

        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="STAFF_CREATED", target_type="admin", target_id=str(admin.id), target_name=admin.username,
            details={"role": admin.role, "permissions": admin.permissions or []},
        )

        # Create access token (token_version enables force-logout)
        access_token = create_access_token({
            "sub": str(admin.id),
            "user": "admin",
            "token_version": getattr(admin, "token_version", 1) or 1,
        }, expires_delta=timedelta(minutes=ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES))

        # Prepare response
        admin_response = AdminOut(
            id=admin.id,
            username=admin.username,
            email=admin.email,
            phone=admin.phone,
            role=admin.role,
            permissions=admin.permissions or [],
            organization_id=admin.organization_id,
            created_at=admin.created_at
        )

        return AdminTokenResponse(
            access_token=access_token,
            token_type="bearer",
            admin=admin_response
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.post("/admin/signin", response_model=AdminTokenResponse)
def admin_signin(
    admin_data: AdminSignin,
    db: Session = Depends(get_db)
):
    """
    Admin Signin API
    
    Authenticates admin with username and password.
    Returns JWT access token upon successful authentication.
    
    Returns:
        - Access token for authentication
        - Admin details
    """
    try:
        # Authenticate admin
        admin = authenticate_admin(db, admin_data.username, admin_data.password)
        
        if not admin:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password"
            )
        
        # Create access token (token_version enables force-logout)
        access_token = create_access_token({
            "sub": str(admin.id),
            "user": "admin",
            "token_version": getattr(admin, "token_version", 1) or 1,
        }, expires_delta=timedelta(minutes=ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES))
        
        # Prepare response
        admin_response = AdminOut(
            id=admin.id,
            username=admin.username,
            email=admin.email,
            phone=admin.phone,
            role=admin.role,
            permissions=admin.permissions or [],
            organization_id=admin.organization_id,
            created_at=admin.created_at
        )

        return AdminTokenResponse(
            access_token=access_token,
            token_type="bearer",
            admin=admin_response
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.post("/admin/force-logout")
def admin_force_logout(
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Invalidate every previously issued token for this admin (logout on all devices)."""
    current_admin.token_version = (getattr(current_admin, "token_version", 1) or 1) + 1
    db.commit()
    return {"message": "All sessions for this admin have been logged out"}


@router.get("/admin/profile", response_model=AdminOut)
def get_admin_profile(
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get current admin profile
    
    Returns the profile of the currently authenticated admin.
    
    Returns:
        - Admin profile details
    """
    try:
        return current_admin
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.get("/admin/acccount-ledger", response_model=List[AdminLedger])
def get_admin_account_ledger(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get the current admin's ledger, optionally filtered to a date range
    (e.g. a single month) via start_date/end_date query params. Omitting
    both returns the full history, same as before this filter existed.
    Also paginated via skip/limit - the unfiltered ledger grows forever.
    """
    try:
        return get_admin_account_ledger_data(db, current_admin.id, start_date=start_date, end_date=end_date, skip=skip, limit=limit)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.put("/admin/profile", response_model=AdminOut)
def update_admin_profile(
    admin_update: AdminUpdate,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update admin profile
    
    Allows admin to update their profile information.
    
    Returns:
        - Updated admin profile details
    """
    try:
        # Update admin profile
        updated_admin = update_admin(db, str(current_admin.id), **admin_update.dict(exclude_unset=True))
        
        return updated_admin
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.get("/admin/list", response_model=List[AdminOut])
def list_admins(
    skip: int = 0,
    limit: int = 100,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    List all admins (Admin only)
    
    Returns a list of all admin accounts in the system.
    Requires admin authentication.
    
    Returns:
        - List of admin accounts
    """
    try:
        if current_admin.role != "Owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the Owner can view the staff list"
            )

        admins, total_count = get_all_admins(db, skip, limit)

        return admins
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


from pydantic import BaseModel as _StaffBaseModel, Field


class StaffPermissionsUpdate(_StaffBaseModel):
    permissions: List[str]


class StaffDetailsUpdate(_StaffBaseModel):
    """Owner-only: fix a staff member's own contact details after creation -
    there was previously no way to do this at all once a staff account was
    created (only permissions could be changed), so a wrong or outdated
    phone number just stayed wrong forever."""
    username: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = Field(None, min_length=10, max_length=10)


@router.patch("/admin/staff/{admin_id}", response_model=AdminOut)
def update_staff_details(
    admin_id: str,
    body: StaffDetailsUpdate,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: edit an existing staff member's username/email/phone."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can manage staff")

    target = get_admin_by_id(db, admin_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")
    if target.role == "Owner" and str(target.id) != str(current_admin.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot edit another Owner's details this way")

    if body.phone:
        if not body.phone.isdigit():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone must be a 10-digit number")
        from app.crud.admin import get_admin_by_phone
        existing_phone = get_admin_by_phone(db, body.phone)
        if existing_phone and str(existing_phone.id) != admin_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Another admin already uses this phone number")

    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    updated = update_admin(db, admin_id, **updates) if updates else target

    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="STAFF_DETAILS_UPDATED", target_type="admin", target_id=admin_id, target_name=target.username,
        details=updates,
    )
    return updated


@router.patch("/admin/staff/{admin_id}/permissions", response_model=AdminOut)
def update_staff_permissions(
    admin_id: str,
    body: StaffPermissionsUpdate,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: change which sections a Staff account can access."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can manage staff")

    target = get_admin_by_id(db, admin_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")
    if target.role == "Owner":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change an Owner's permissions this way")

    _allowed = allowed_staff_permissions(db)
    invalid_perms = set(body.permissions) - _allowed
    if invalid_perms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid permissions: {sorted(invalid_perms)}. Allowed: {sorted(_allowed)}",
        )

    updated = update_admin(db, admin_id, permissions=body.permissions)

    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="STAFF_PERMISSIONS_UPDATED", target_type="admin", target_id=admin_id, target_name=target.username,
        details={"permissions": body.permissions},
    )

    return updated


@router.delete("/admin/staff/{admin_id}")
def remove_staff(
    admin_id: str,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: remove a staff account. Refuses to delete an Owner
    account (including the caller's own) - the platform must always keep
    at least one Owner able to log in and manage staff."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can remove staff")

    target = get_admin_by_id(db, admin_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")
    if target.role == "Owner":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove an Owner account")

    result = delete_admin(db, admin_id)

    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="STAFF_REMOVED", target_type="admin", target_id=admin_id, target_name=target.username,
    )

    return result


class ActivityLogEntryOut(_StaffBaseModel):
    id: UUID
    admin_username: str
    admin_role: Optional[str] = None
    action: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    target_name: Optional[str] = None
    details: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


def _ist_midnight_utc(days_ago: int = 0):
    """Start of an IST calendar day, as a UTC instant - this platform's
    'today' is IST (Asia/Kolkata) everywhere else in the codebase, so
    'today'/'yesterday' filters need to agree with that, not UTC midnight
    (which would silently misclassify anything before 5:30am IST)."""
    from datetime import datetime, timezone, timedelta
    ist_offset = timedelta(hours=5, minutes=30)
    now_ist = datetime.now(timezone.utc) + ist_offset
    ist_midnight = now_ist.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_ago)
    return ist_midnight - ist_offset


def _ist_today_date():
    """Today's calendar date in IST - used for per-day rows (staff daily
    records) where the date itself (not a UTC instant) is the key."""
    from datetime import datetime, timezone, timedelta
    return (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()


def _ist_date_to_utc_midnight(d):
    """Midnight (00:00) of the given IST calendar date, as a UTC instant.
    Unlike computing this via `date.today() - d`, this never depends on the
    server process's own local timezone - only on the passed-in date and the
    fixed IST offset, so it's safe regardless of what timezone the server
    happens to run in."""
    from datetime import datetime, timezone, timedelta
    ist_offset = timedelta(hours=5, minutes=30)
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc) - ist_offset


def _activity_log_range(date_filter: Optional[str]):
    """Map a short filter keyword to a (since, until) UTC range - until is
    only set for 'yesterday' (a single bounded day); the rest are open-ended
    "from X onwards". Returns (None, None) for 'all'."""
    if not date_filter or date_filter == "all":
        return None, None
    if date_filter == "today":
        return _ist_midnight_utc(0), None
    if date_filter == "yesterday":
        return _ist_midnight_utc(1), _ist_midnight_utc(0)
    if date_filter == "week":
        return _ist_midnight_utc(7), None
    if date_filter == "month":
        return _ist_midnight_utc(30), None
    return None, None


def _ist_day_range_utc(date_str: str):
    """One IST calendar day (YYYY-MM-DD) as a UTC [start, end) instant pair,
    same IST convention as _ist_midnight_utc above."""
    from datetime import datetime, timedelta
    day = datetime.strptime(date_str, "%Y-%m-%d")
    ist_offset = timedelta(hours=5, minutes=30)
    start_utc = day - ist_offset
    end_utc = start_utc + timedelta(days=1)
    return start_utc, end_utc


@router.get("/admin/activity-log")
def get_activity_log(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    date_filter: Optional[str] = Query(None, description="all | today | yesterday | week | month"),
    from_date: Optional[str] = Query(None, description="Custom range start, YYYY-MM-DD (IST calendar day) - overrides date_filter when given"),
    to_date: Optional[str] = Query(None, description="Custom range end, YYYY-MM-DD (IST calendar day, inclusive) - defaults to from_date"),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: audit feed of sensitive admin actions (permanent block/
    unblock, account status changes, wallet adjustments, staff management) -
    shows which staff member did what, not just that it happened."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can view the activity log")

    from app.crud.admin_activity_log import get_admin_activity_log
    if from_date:
        try:
            since, _ = _ist_day_range_utc(from_date)
            _, until = _ist_day_range_utc(to_date or from_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="from_date/to_date must be YYYY-MM-DD")
    else:
        since, until = _activity_log_range(date_filter)
    rows, total_count = get_admin_activity_log(db, skip=skip, limit=limit, since=since, until=until)
    return {
        "entries": [ActivityLogEntryOut.model_validate(r) for r in rows],
        "total_count": total_count,
    }


from pydantic import BaseModel as _ActivityLogWebhookBaseModel


class ActivityLogWebhookUpdate(_ActivityLogWebhookBaseModel):
    url: Optional[str] = None


@router.get("/admin/settings/activity-log-webhook")
def get_activity_log_webhook(
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Get configured Google Sheets webhook URL for activity log backups."""
    from app.models.platform_setting import PlatformSetting
    row = db.query(PlatformSetting).filter(PlatformSetting.key == "activity_log_google_sheet_url").first()
    return {"url": row.value if row and row.value else ""}


@router.post("/admin/settings/activity-log-webhook")
def update_activity_log_webhook(
    payload: ActivityLogWebhookUpdate,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Save Google Sheets webhook URL for automatic activity log backups on clear."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can configure webhook settings")

    from app.models.platform_setting import PlatformSetting
    from app.crud.admin_activity_log import log_admin_action

    url_str = (payload.url or "").strip()
    row = db.query(PlatformSetting).filter(PlatformSetting.key == "activity_log_google_sheet_url").first()
    if row:
        row.value = url_str
    else:
        row = PlatformSetting(key="activity_log_google_sheet_url", value=url_str)
        db.add(row)
    db.commit()

    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="ACTIVITY_LOG_WEBHOOK_UPDATED", details={"url": url_str},
    )
    return {"message": "Google Sheets Webhook URL updated successfully.", "url": url_str}


def _send_activity_log_webhook(webhook_url: str, payload: dict) -> bool:
    import json
    data = json.dumps(payload).encode("utf-8")
    try:
        import httpx
        with httpx.Client(timeout=10.0, follow_redirects=True) as client:
            resp = client.post(webhook_url, content=data, headers={"Content-Type": "application/json"})
            return resp.status_code in (200, 201, 202, 302)
    except Exception:
        pass

    try:
        import urllib.request
        req = urllib.request.Request(
            webhook_url,
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "DropCars-Admin/1.0"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201, 202, 302)
    except Exception as e:
        print(f"Error sending activity log webhook to Google Sheets: {e}")
        return False


# ============ COMPLETED BOOKINGS ARCHIVE (Google Sheets export) ============
# Ported from the website admin panel's sync-and-reset.php - old COMPLETED/
# CANCELLED bookings piling up in `orders` is exactly the kind of table
# growth that slows down the whole app (see this session's earlier trigram-
# index work). This is the safe half of that feature: export-only, same
# webhook pattern as the activity log above. The website's version also
# deletes the local rows after a successful sync to keep the table small -
# deliberately NOT ported here, because Order rows are referenced by
# OrderAssignment, TaxInvoice, Rating and WalletLedger in ways the simpler
# website `bookings` table never was; a raw DELETE risks orphaning those
# without a full cascade review this pass didn't have room for. Export
# first; purge-after-sync is a real fast-follow, not abandoned.

class DataArchiveWebhookUpdate(_ActivityLogWebhookBaseModel):
    url: Optional[str] = None


@router.get("/admin/settings/data-archive-webhook")
def get_data_archive_webhook(
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    from app.models.platform_setting import PlatformSetting
    row = db.query(PlatformSetting).filter(PlatformSetting.key == "data_archive_google_sheet_url").first()
    return {"url": row.value if row and row.value else ""}


@router.post("/admin/settings/data-archive-webhook")
def update_data_archive_webhook(
    payload: DataArchiveWebhookUpdate,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can configure webhook settings")
    from app.models.platform_setting import PlatformSetting
    url_str = (payload.url or "").strip()
    row = db.query(PlatformSetting).filter(PlatformSetting.key == "data_archive_google_sheet_url").first()
    if row:
        row.value = url_str
    else:
        row = PlatformSetting(key="data_archive_google_sheet_url", value=url_str)
        db.add(row)
    db.commit()
    return {"message": "Google Sheets Webhook URL updated successfully.", "url": url_str}


def _archivable_orders_query(db: Session, older_than_days: int):
    from app.models.orders import Order, Trip_status
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
    return db.query(Order).filter(
        Order.trip_status.in_([
            Trip_status.COMPLETED, Trip_status.CANCELLED, Trip_status.AUTO_CANCELLED,
            Trip_status.CANCELLED_BY_VENDOR, Trip_status.CANCELLED_WHILE_DRIVING,
            Trip_status.CANCELLED_BY_CUSTOMER, Trip_status.CANCELLED_BY_ADMIN,
        ]),
        Order.created_at < cutoff,
    )


@router.get("/admin/orders/archive-preview")
def preview_archivable_orders(
    older_than_days: int = Query(180, ge=30, description="Archive completed/cancelled bookings older than this many days"),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Read-only: how many bookings WOULD be exported. Never touches data -
    safe to call as often as the settings screen wants for a live count."""
    count = _archivable_orders_query(db, older_than_days).count()
    return {"older_than_days": older_than_days, "archivable_count": count}


@router.post("/admin/orders/archive")
def archive_old_orders(
    older_than_days: int = Query(180, ge=30),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: export old COMPLETED/CANCELLED bookings to the configured
    Google Sheets webhook. Export-only - see module docstring above for why
    the website's delete-after-sync step isn't ported yet. Never touches
    PENDING/active bookings (the query filter above only matches terminal
    trip_status values)."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can run the data archive")

    from app.models.platform_setting import PlatformSetting
    webhook_row = db.query(PlatformSetting).filter(PlatformSetting.key == "data_archive_google_sheet_url").first()
    webhook_url = webhook_row.value.strip() if webhook_row and webhook_row.value else None
    if not webhook_url:
        raise HTTPException(status_code=400, detail="Configure a Google Sheets webhook URL first (Settings > Data Archive)")

    orders = _archivable_orders_query(db, older_than_days).limit(2000).all()
    synced, failed = 0, 0
    for o in orders:
        payload = {
            "event": "BOOKING_ARCHIVED",
            "order_id": o.id,
            "trip_status": o.trip_status.value if hasattr(o.trip_status, "value") else str(o.trip_status),
            "customer_name": o.customer_name,
            "customer_number": o.customer_number,
            "trip_type": o.trip_type.value if hasattr(o.trip_type, "value") else str(o.trip_type),
            "car_type": o.car_type.value if hasattr(o.car_type, "value") else str(o.car_type),
            "start_date_time": o.start_date_time.isoformat() if o.start_date_time else None,
            "estimated_price": o.estimated_price,
            "vendor_price": o.vendor_price,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        if _send_activity_log_webhook(webhook_url, payload):
            synced += 1
        else:
            failed += 1

    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="BOOKINGS_ARCHIVED_TO_SHEETS", details={"synced": synced, "failed": failed, "older_than_days": older_than_days},
    )
    return {"synced": synced, "failed": failed, "total_attempted": len(orders)}


@router.delete("/admin/activity-log")
def clear_activity_log(
    date_filter: Optional[str] = Query(None, description="all | today | yesterday | week | month - which entries to delete"),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: bulk-clear the activity log, automatically exporting to Google Sheets if a Webhook URL is configured."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can clear the activity log")

    from app.crud.admin_activity_log import get_admin_activity_log, clear_admin_activity_log, log_admin_action
    from app.models.platform_setting import PlatformSetting
    from datetime import datetime, timezone

    since, until = _activity_log_range(date_filter)

    # 1. Fetch entries about to be cleared
    logs_to_clear, _ = get_admin_activity_log(db, skip=0, limit=10000, since=since, until=until)

    # 2. Check for Google Sheets Webhook URL setting
    setting_row = db.query(PlatformSetting).filter(PlatformSetting.key == "activity_log_google_sheet_url").first()
    webhook_url = setting_row.value.strip() if setting_row and setting_row.value else None

    webhook_triggered = False
    webhook_success = False

    if webhook_url and logs_to_clear:
        webhook_triggered = True
        payload = {
            "event": "ACTIVITY_LOG_CLEARED",
            "cleared_at": datetime.now(timezone.utc).isoformat(),
            "cleared_by": current_admin.username,
            "cleared_by_role": current_admin.role,
            "date_filter": date_filter or "all",
            "total_records": len(logs_to_clear),
            "logs": [
                {
                    "id": str(log.id),
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                    "admin_username": log.admin_username,
                    "admin_role": log.admin_role,
                    "action": log.action,
                    "target_type": log.target_type,
                    "target_id": log.target_id,
                    "target_name": log.target_name,
                    "details": log.details,
                }
                for log in logs_to_clear
            ]
        }
        webhook_success = _send_activity_log_webhook(webhook_url, payload)

    # 3. Clear logs from DB
    deleted_count = clear_admin_activity_log(db, since=since, until=until)

    # 4. Audit trail entry
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="ACTIVITY_LOG_CLEARED", details={
            "date_filter": date_filter or "all",
            "deleted_count": deleted_count,
            "webhook_triggered": webhook_triggered,
            "webhook_success": webhook_success,
        },
    )
    return {
        "message": f"Cleared {deleted_count} activity log entries.",
        "deleted_count": deleted_count,
        "webhook_triggered": webhook_triggered,
        "webhook_success": webhook_success,
    }


# ============ STAFF TARGETS / ACHIEVEMENTS / RECORDS SUBMIT ============
# Replaces profit visibility on the Dashboard for non-Owner admins: staff see
# a daily action-count target (Owner-configurable), their own progress today
# (derived from the existing admin_activity_log audit trail - no separate
# metrics pipeline needed), and can submit one short end-of-day note per day.
STAFF_DAILY_TARGET_SETTING_KEY = "staff_daily_target"
STAFF_DAILY_TARGET_DEFAULT = "10"


@router.get("/admin/staff/today-target")
def get_staff_today_target(
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Any admin: today's action-count target vs. this admin's own actions
    so far today, broken down by action type. Owner's target is shared
    across all staff (one platform-wide number, not per-person)."""
    from app.crud.customer_booking_request import get_platform_setting_value
    from app.models.admin_activity_log import AdminActivityLog
    from sqlalchemy import func as _func

    target = int(get_platform_setting_value(db, STAFF_DAILY_TARGET_SETTING_KEY, STAFF_DAILY_TARGET_DEFAULT))
    today_start = _ist_midnight_utc(0)

    rows = (
        db.query(AdminActivityLog.action, _func.count(AdminActivityLog.id))
        .filter(AdminActivityLog.admin_id == str(current_admin.id), AdminActivityLog.created_at >= today_start)
        .group_by(AdminActivityLog.action)
        .all()
    )
    breakdown = {action: count for action, count in rows}
    achieved = sum(breakdown.values())
    return {"target": target, "achieved": achieved, "breakdown": breakdown}


@router.put("/admin/staff/target")
def set_staff_today_target(
    payload: dict,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: set the shared daily action-count target every staff
    member sees on their Dashboard."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can set the staff target")
    target = payload.get("target")
    if not isinstance(target, int) or target < 0:
        raise HTTPException(status_code=422, detail="target must be a non-negative integer")
    from app.crud.customer_booking_request import set_platform_setting_value
    set_platform_setting_value(db, STAFF_DAILY_TARGET_SETTING_KEY, str(target))
    return {"target": target}


@router.get("/admin/staff/daily-record")
def get_own_daily_record(
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Any admin: their own submitted note for today, if any."""
    from app.crud.staff_daily_record import get_own_daily_record as _get_record
    row = _get_record(db, current_admin.id, _ist_today_date())
    return {"note": row.note if row else None, "submitted_at": row.updated_at if row else None}


@router.post("/admin/staff/daily-record")
def submit_own_daily_record(
    payload: dict,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Any admin: submit (or update) today's end-of-day note. One row per
    admin per calendar day - resubmitting the same day overwrites it."""
    note = (payload.get("note") or "").strip()
    if not note:
        raise HTTPException(status_code=422, detail="note is required")
    from app.crud.staff_daily_record import upsert_staff_daily_record
    row = upsert_staff_daily_record(db, admin_id=current_admin.id, admin_username=current_admin.username, record_date=_ist_today_date(), note=note)
    return {"note": row.note, "submitted_at": row.updated_at}


@router.get("/admin/staff/daily-records")
def list_staff_daily_records(
    date_str: Optional[str] = Query(None, alias="date", description="YYYY-MM-DD, defaults to today (IST)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: every staff member's submitted note for a given day."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can view staff daily records")
    from datetime import date as _date_cls
    from app.crud.staff_daily_record import list_daily_records
    if date_str:
        try:
            target_date = _date_cls.fromisoformat(date_str)
        except ValueError:
            raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD")
    else:
        target_date = _ist_today_date()
    rows, total = list_daily_records(db, target_date, skip=skip, limit=limit)
    return {
        "date": target_date.isoformat(),
        "total_count": total,
        "records": [
            {"admin_id": str(r.admin_id), "admin_username": r.admin_username, "note": r.note, "submitted_at": r.updated_at}
            for r in rows
        ],
    }


# ============ PER-STAFF DAILY TARGETS ============
# Distinct from the shared STAFF_DAILY_TARGET_SETTING_KEY above (one
# platform-wide number every staff sees) - these are per-person, per-
# category goals the Owner sets individually (e.g. 50 calls/day for one
# telecaller, 20 approvals/day for another).

from app.models.staff_directive import StaffDailyTarget, StaffDirective
from app.models.admin import Admin


@router.get("/admin/staff/targets")
def list_staff_targets(
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: every staff member with their current per-category
    targets (0/0/0 for anyone the Owner hasn't set targets for yet)."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can view staff targets")
    staff = db.query(Admin).filter(Admin.role == "Staff").all()
    targets_by_admin = {t.admin_id: t for t in db.query(StaffDailyTarget).all()}
    out = []
    for s in staff:
        t = targets_by_admin.get(s.id)
        out.append({
            "admin_id": str(s.id),
            "username": s.username,
            "calls_target": t.calls_target if t else 0,
            "approvals_target": t.approvals_target if t else 0,
            "checkins_target": t.checkins_target if t else 0,
            "updated_at": t.updated_at if t else None,
        })
    return out


@router.put("/admin/staff/targets/{admin_id}")
def set_staff_targets(
    admin_id: UUID,
    payload: dict,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: set one staff member's per-category daily targets."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can set staff targets")
    staff = db.query(Admin).filter(Admin.id == str(admin_id), Admin.role == "Staff").first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff account not found")

    def _nonneg_int(key: str) -> int:
        val = payload.get(key, 0)
        if not isinstance(val, int) or val < 0:
            raise HTTPException(status_code=422, detail=f"{key} must be a non-negative integer")
        return val

    calls_target = _nonneg_int("calls_target")
    approvals_target = _nonneg_int("approvals_target")
    checkins_target = _nonneg_int("checkins_target")

    row = db.query(StaffDailyTarget).filter(StaffDailyTarget.admin_id == str(admin_id)).first()
    if not row:
        row = StaffDailyTarget(admin_id=admin_id)
        db.add(row)
    row.calls_target = calls_target
    row.approvals_target = approvals_target
    row.checkins_target = checkins_target
    row.updated_by = current_admin.username
    db.commit()
    db.refresh(row)
    return {
        "admin_id": str(staff.id),
        "username": staff.username,
        "calls_target": row.calls_target,
        "approvals_target": row.approvals_target,
        "checkins_target": row.checkins_target,
        "updated_at": row.updated_at,
    }


@router.get("/admin/staff/my-target")
def get_my_staff_target(
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Any admin: their own per-category targets plus whatever "achieved
    today" counts can honestly be computed. Only approvals has a real,
    reliable signal in this system today (AdminActivityLog's
    WEBSITE_BOOKING_APPROVED entries) - calls/check-ins have no backing
    data source yet (lead "Responded" state lives in the separate website
    MySQL database, not this one; there is no check-in concept at all
    today), so those come back as null rather than a fabricated 0/number.
    The frontend should render "Not tracked yet" for a null, not a bare 0."""
    from app.models.admin_activity_log import AdminActivityLog

    row = db.query(StaffDailyTarget).filter(StaffDailyTarget.admin_id == current_admin.id).first()
    today_start = _ist_midnight_utc(0)
    approvals_achieved = (
        db.query(AdminActivityLog)
        .filter(
            AdminActivityLog.admin_id == str(current_admin.id),
            AdminActivityLog.action == "WEBSITE_BOOKING_APPROVED",
            AdminActivityLog.created_at >= today_start,
        )
        .count()
    )
    return {
        "calls_target": row.calls_target if row else 0,
        "approvals_target": row.approvals_target if row else 0,
        "checkins_target": row.checkins_target if row else 0,
        "calls_achieved": None,
        "approvals_achieved": approvals_achieved,
        "checkins_achieved": None,
    }


# ============ STAFF TEXT/VOICE DIRECTIVES ============
# Owner -> staff broadcast instructions, distinct from the daily-record
# notes above (which flow the other way: staff -> Owner). Voice notes
# reuse the same GCS upload helper + audio-only validation already proven
# out by /admin/notification-settings/{event_key}/upload-sound.

@router.post("/admin/staff-directives/upload-voice")
def upload_staff_directive_voice(
    file: UploadFile = File(...),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: upload a voice note recording, returns its GCS URL to
    pass into POST /admin/staff-directives as voice_note_url."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can publish directives")
    if not (file.content_type or "").startswith("audio/"):
        raise HTTPException(status_code=400, detail="File must be an audio recording")
    url = upload_image_to_gcs(file, folder="staff_directives/voice_notes")
    return {"voice_note_url": url}


@router.post("/admin/staff-directives")
def create_staff_directive(
    payload: dict,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: publish a text and/or voice-note directive. target_admin_ids:
    a list of admin.id strings, or omitted/empty for "all staff"."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can publish directives")
    message = (payload.get("message") or "").strip() or None
    voice_note_url = (payload.get("voice_note_url") or "").strip() or None
    if not message and not voice_note_url:
        raise HTTPException(status_code=422, detail="A directive needs a text message, a voice note, or both")
    target_admin_ids = payload.get("target_admin_ids") or None
    if target_admin_ids is not None:
        if not isinstance(target_admin_ids, list) or not all(isinstance(x, str) for x in target_admin_ids):
            raise HTTPException(status_code=422, detail="target_admin_ids must be a list of admin id strings")

    directive = StaffDirective(
        message=message,
        voice_note_url=voice_note_url,
        target_admin_ids=target_admin_ids,
        created_by_admin_id=current_admin.id,
        created_by_username=current_admin.username,
    )
    db.add(directive)
    db.commit()
    db.refresh(directive)
    return {
        "id": str(directive.id),
        "message": directive.message,
        "voice_note_url": directive.voice_note_url,
        "target_admin_ids": directive.target_admin_ids,
        "created_by_username": directive.created_by_username,
        "created_at": directive.created_at,
    }


@router.get("/admin/staff-directives")
def list_staff_directives(
    limit: int = Query(20, ge=1, le=100),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Any admin: the most recent directives targeted at them (or "all
    staff" broadcasts). Owner sees everything they've published."""
    rows = db.query(StaffDirective).order_by(StaffDirective.created_at.desc()).limit(200).all()
    my_id = str(current_admin.id)
    visible = []
    for r in rows:
        targets = r.target_admin_ids or []
        if current_admin.role == "Owner" or not targets or my_id in targets:
            visible.append(r)
        if len(visible) >= limit:
            break
    return [
        {
            "id": str(r.id),
            "message": r.message,
            "voice_note_url": r.voice_note_url,
            "target_admin_ids": r.target_admin_ids,
            "created_by_username": r.created_by_username,
            "created_at": r.created_at,
        }
        for r in visible
    ]


@router.delete("/admin/staff-directives/{directive_id}")
def delete_staff_directive(
    directive_id: UUID,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: retract a published directive."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can remove directives")
    row = db.query(StaffDirective).filter(StaffDirective.id == str(directive_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Directive not found")
    db.delete(row)
    db.commit()
    return {"success": True}


# ============ OWNER PASSWORD CHANGE (EMAIL OTP) ============
# Logged-in self-service password change for the Owner, verified by a code
# emailed to the Owner's own registered address - the same email-OTP
# pattern already used for vendor/owner/driver password resets
# (api/routes/password_reset.py), reusing the shared EmailOtp table with
# role="admin" and primary_number=str(admin.id) as the lookup key (Admin
# accounts have no primary_number of their own).

ADMIN_OTP_ROLE = "admin"


def _mask_email_for_admin(email: str) -> str:
    try:
        name, domain = email.split("@", 1)
        visible = name[:2] if len(name) > 2 else name[:1]
        return f"{visible}***@{domain}"
    except Exception:
        return "***"


@router.post("/admin/settings/request-password-change-otp")
def request_owner_password_change_otp(
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: send a 6-digit code to the Owner's own registered email
    to confirm a password change."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can change the Owner password here")
    if not current_admin.email:
        raise HTTPException(status_code=400, detail="No email is registered on this account. Add one in Settings first.")

    from app.utils.emailer import send_email, smtp_configured
    if not smtp_configured(db):
        raise HTTPException(status_code=503, detail="Email is not configured yet. Please contact support.")

    import random
    from datetime import datetime, timedelta, timezone
    from app.models.email_otp import EmailOtp

    admin_key = str(current_admin.id)

    hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    recent = db.query(EmailOtp).filter(
        EmailOtp.role == ADMIN_OTP_ROLE,
        EmailOtp.primary_number == admin_key,
        EmailOtp.purpose == "admin_password_change",
        EmailOtp.created_at >= hour_ago,
    ).count()
    if recent >= 5:
        raise HTTPException(status_code=429, detail="Too many codes requested. Please wait an hour and try again.")

    code = f"{random.randint(0, 999999):06d}"
    db.query(EmailOtp).filter(
        EmailOtp.role == ADMIN_OTP_ROLE,
        EmailOtp.primary_number == admin_key,
        EmailOtp.purpose == "admin_password_change",
    ).delete()
    db.add(EmailOtp(
        role=ADMIN_OTP_ROLE,
        primary_number=admin_key,
        email=current_admin.email,
        code=code,
        purpose="admin_password_change",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    ))
    db.commit()

    try:
        send_email(
            db,
            current_admin.email,
            "Drop Cars Admin - Password Change Code",
            f"Your Drop Cars admin password change code is: {code}\n\n"
            "It is valid for 10 minutes. If you did not request this, ignore this email - "
            "your password stays unchanged.",
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Could not send the email. Please try again later.")

    return {"message": f"A 6-digit code was sent to {_mask_email_for_admin(current_admin.email)}. It is valid for 10 minutes."}


class OwnerPasswordChangeRequest(_StaffBaseModel):
    code: str
    new_password: str


@router.post("/admin/settings/change-password")
def change_owner_password(
    body: OwnerPasswordChangeRequest,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Owner-only: complete the password change after verifying the emailed code."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can change the Owner password here")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    from datetime import datetime, timezone
    from app.models.email_otp import EmailOtp
    from app.core.security import get_password_hash
    from app.crud.admin_activity_log import log_admin_action

    admin_key = str(current_admin.id)
    otp = db.query(EmailOtp).filter(
        EmailOtp.role == ADMIN_OTP_ROLE,
        EmailOtp.primary_number == admin_key,
        EmailOtp.purpose == "admin_password_change",
    ).with_for_update().first()

    now = datetime.now(timezone.utc)
    if otp is not None and otp.expires_at is not None and otp.expires_at.tzinfo is None:
        otp.expires_at = otp.expires_at.replace(tzinfo=timezone.utc)

    if not otp or otp.expires_at < now or otp.attempts >= 5:
        if otp:
            db.delete(otp)
            db.commit()
        raise HTTPException(status_code=400, detail="Code expired or invalid. Please request a new code.")

    if otp.code != body.code.strip():
        otp.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Wrong code. Please check your email and try again.")

    current_admin.password = get_password_hash(body.new_password)
    # Force-logout every other session signed in as this admin - a password
    # change should invalidate previously issued tokens.
    current_admin.token_version = (current_admin.token_version or 1) + 1
    db.add(current_admin)
    db.delete(otp)
    db.commit()

    log_admin_action(
        db, admin_id=admin_key, admin_username=current_admin.username, admin_role=current_admin.role,
        action="OWNER_PASSWORD_CHANGED", target_type="admin", target_id=admin_key, target_name=current_admin.username,
    )

    # New token so the Owner isn't logged out on the device that just did this.
    new_token = create_access_token({
        "sub": admin_key,
        "user": "admin",
        "token_version": current_admin.token_version,
    })

    return {"message": "Password changed successfully.", "access_token": new_token, "token_type": "bearer"}


# ============ UNIFIED ACCOUNT MANAGEMENT ENDPOINTS ============
# NOTE: These routes must come BEFORE /admin/{admin_id} to avoid route conflicts

@router.get("/admin/orders", response_model=AdminOrdersListResponse)
def list_all_orders(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    sort: str = Query("newest", description="newest (default) or oldest, by created_at"),
    vendor_id: Optional[str] = Query(None, description="Only bookings posted by this one vendor/fleet owner - used by their admin detail page's Bookings tab"),
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get All Orders (Admin Only)
    
    Returns a paginated list of all orders in the system with complete details including:
    - Order information (id, source, trip type, car type, customer details, pricing, etc.)
    - Vendor information (full vendor details)
    - Assignment history (all assignments for the order)
    - End records (trip completion records)
    - Driver information (if assigned)
    - Car information (if assigned)
    - Fleet owner information (if assigned)
    
    Requires admin authentication.
    
    Returns:
        - List of orders with full details
        - Total count of orders
        - Pagination info (skip, limit)
    """
    try:
        orders, total_count = get_all_admin_orders(db, skip=skip, limit=limit, sort=sort, vendor_id=vendor_id)

        return AdminOrdersListResponse(
            orders=orders,
            total_count=total_count,
            skip=skip,
            limit=limit
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


# ============ ADMIN-INITIATED BOOKING (STAFF POSTS DIRECTLY, NO VENDOR NEEDED) ============
# Same fare-calc + order-creation CRUD the vendor app's oneway/roundtrip/
# multicity/hourly confirm routes use (new_orders.py / hourly_rental.py) -
# just called from an admin-authenticated route instead of a vendor one,
# with vendor_id optional (None = "vendor-less platform booking", the same
# pattern admin_approve_customer_booking already uses elsewhere in this file).
# The /quote endpoints (fare calculation only, no order created) are
# unauthenticated and vendor-agnostic already - the Admin App calls those
# directly, no admin-specific quote endpoint needed.

from app.schemas.new_orders import OnewayConfirmRequest, RoundTripConfirmRequest, MulticityConfirmRequest, RentalOrderRequest, OrderType as _OrderType


class AdminOnewayConfirmRequest(OnewayConfirmRequest):
    vendor_id: Optional[UUID] = None
    # "Allocate manually" (admin only): give the booking straight to this fleet
    # owner instead of broadcasting it. allocate_on_credit lets a low wallet
    # through - the commission is then debited at trip completion.
    target_vehicle_owner_id: Optional[str] = None
    allocate_on_credit: bool = False


class AdminRoundTripConfirmRequest(RoundTripConfirmRequest):
    vendor_id: Optional[UUID] = None
    # "Allocate manually" (admin only): give the booking straight to this fleet
    # owner instead of broadcasting it. allocate_on_credit lets a low wallet
    # through - the commission is then debited at trip completion.
    target_vehicle_owner_id: Optional[str] = None
    allocate_on_credit: bool = False


class AdminMulticityConfirmRequest(MulticityConfirmRequest):
    vendor_id: Optional[UUID] = None
    # "Allocate manually" (admin only): give the booking straight to this fleet
    # owner instead of broadcasting it. allocate_on_credit lets a low wallet
    # through - the commission is then debited at trip completion.
    target_vehicle_owner_id: Optional[str] = None
    allocate_on_credit: bool = False


class AdminHourlyConfirmRequest(RentalOrderRequest):
    vendor_id: Optional[UUID] = None
    # "Allocate manually" (admin only): give the booking straight to this fleet
    # owner instead of broadcasting it. allocate_on_credit lets a low wallet
    # through - the commission is then debited at trip completion.
    target_vehicle_owner_id: Optional[str] = None
    allocate_on_credit: bool = False


def _admin_pick_near_city_and_driver(payload):
    if payload.send_to == "NEAR_CITY" and not payload.near_city:
        raise HTTPException(status_code=422, detail="near_city is required when send_to is NEAR_CITY")
    if payload.send_to == "DRIVER" and not payload.target_driver_id:
        raise HTTPException(status_code=422, detail="target_driver_id is required when send_to is DRIVER")
    if payload.send_to == "NEAR_CITY":
        pick_near_city = [str(c) for c in payload.near_city] if isinstance(payload.near_city, list) else [str(payload.near_city)]
    else:
        pick_near_city = ["ALL"]
    target_driver_id = payload.target_driver_id if payload.send_to == "DRIVER" else None
    return pick_near_city, target_driver_id


def _admin_fleet_target(db, payload):
    """Fleet owner the admin picked under "Allocate manually", or None."""
    target = (getattr(payload, "target_vehicle_owner_id", None) or "").strip()
    if not target:
        return None
    from app.crud.manual_allocation import find_fleet_owner
    owner = find_fleet_owner(db, target)
    if not owner:
        raise HTTPException(status_code=404, detail="Fleet owner not found - search and pick the fleet owner again")
    return owner


def _admin_km_prices(payload, fare):
    """(driver price, customer price) the booking will be created with - same
    All-Inclusive override as create_oneway_order."""
    if (payload.fare_type or "ITEMIZED") == "ALL_INCLUSIVE" and payload.total_booking_amount:
        est = int(payload.total_booking_amount)
        return est, est + int(payload.extra_amount or 0)
    return fare["driver_amount"], fare["customer_amount"]


def _admin_fleet_low_balance(db, fleet_owner, payload, estimated_price, vendor_price, cost_per_km=None, trip_distance=None):
    """Checked BEFORE the booking is created, so a low wallet never leaves a
    half-posted booking behind. Returns the INSUFFICIENT_BALANCE reply, or None
    when the wallet covers the commission or the admin chose credit."""
    if fleet_owner is None or payload.allocate_on_credit:
        return None
    from app.crud.manual_allocation import commission_hold, low_balance_response
    from app.crud.wallet import get_owner_balance
    required = commission_hold(estimated_price, vendor_price, cost_per_km, trip_distance)
    balance = get_owner_balance(db, str(fleet_owner.vehicle_owner_id))
    if balance < required:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=200, content=low_balance_response(fleet_owner, balance, required, True))
    return None


def _admin_apply_reveal(db, master_order_id, payload):
    """Store what the admin chose for THIS booking: the moment the driver sees the
    customer number ("6 hrs before" / picked date & time) and the commission %.
    Nothing chosen = the automatic rule / the platform's rate."""
    at = getattr(payload, "customer_phone_reveal_at", None)
    hours = getattr(payload, "customer_phone_reveal_hours", None)
    pct = getattr(payload, "commission_percent", None)
    if at is None and hours is None and pct is None:
        return
    from datetime import timedelta
    from app.models.orders import Order
    order = db.query(Order).filter(Order.id == master_order_id).first()
    if order is None:
        return
    if at is None and hours is not None:
        at = order.start_date_time - timedelta(hours=float(hours))
    if at is not None:
        order.customer_phone_reveal_at = at
    if pct is not None:
        order.commission_percent = float(pct)
    db.commit()


def _admin_allocate_new_booking(db, master_order_id, fleet_owner, payload, current_admin):
    if fleet_owner is None:
        return None
    from app.models.orders import Order
    from app.crud.manual_allocation import allocate_to_fleet_owner
    order = db.query(Order).filter(Order.id == master_order_id).first()
    return allocate_to_fleet_owner(
        db, order, fleet_owner, on_credit=payload.allocate_on_credit, assigned_by="ADMIN", staff=current_admin,
    )


class RouteKmRequest(BaseModel):
    pickup_drop_location: Dict[str, str]
    # Round trip / multi city add up every leg; oneway / local use pickup -> last stop
    trip_type: str = "oneway"


@router.post("/admin/orders/route-km")
def admin_route_km(payload: RouteKmRequest, current_admin=Depends(get_current_admin)):
    """Real driving distance for the stops on the Post booking form, so the Km
    limit field can show the actual route as soon as the locations are filled
    (before Get Quote). Same cached Distance Matrix lookups as the fare."""
    from app.crud.new_orders import _sum_multisegment_distance_and_duration, _origin_and_destination_from_index_map
    from app.utils.maps import get_distance_km_between_locations
    stops = {k: v for k, v in payload.pickup_drop_location.items() if str(v or "").strip()}
    if len(stops) < 2:
        raise HTTPException(status_code=422, detail="Pick the pickup and drop locations first")
    try:
        if payload.trip_type.lower().replace(" ", "") in ("roundtrip", "multicity", "multy city".replace(" ", "")):
            km, duration = _sum_multisegment_distance_and_duration(stops)
        else:
            origin, destination = _origin_and_destination_from_index_map(stops)
            km, duration = get_distance_km_between_locations(origin, destination)
        return {"route_km": float(km), "trip_time": duration}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not work out the distance: {str(e)}")


@router.post("/admin/orders/oneway/confirm", status_code=status.HTTP_201_CREATED)
def admin_oneway_confirm(
    payload: AdminOnewayConfirmRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Staff/Owner posts a Oneway or Local booking directly, without a
    vendor. `vendor_id` optional - omit for a vendor-less platform booking."""
    from app.crud.new_orders import calculate_oneway_fare, create_oneway_order, apply_distance_override, _origin_and_destination_from_index_map
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    try:
        if payload.trip_type == _OrderType.LOCAL:
            from app.utils.serviceable_cities import is_city_serviceable
            origin_city, _ = _origin_and_destination_from_index_map(payload.pickup_drop_location)
            if not is_city_serviceable(db, origin_city):
                raise HTTPException(status_code=422, detail=f"Local Bookings aren't enabled for {origin_city} yet")

        pick_near_city, target_driver_id = _admin_pick_near_city_and_driver(payload)

        fare = calculate_oneway_fare(
            payload.pickup_drop_location, payload.cost_per_km, payload.driver_allowance, payload.extra_driver_allowance,
            payload.permit_charges, payload.extra_permit_charges, payload.hill_charges, payload.toll_charges,
            payload.extra_cost_per_km, payload.night_charges, payload.trip_type,
        )
        distance_edited = False
        if payload.min_km_override is not None or payload.km_override is not None:
            from app.crud.new_orders import apply_admin_km
            _before_km = fare["total_km"]
            fare = apply_admin_km(fare, payload)
            distance_edited = round(fare["total_km"]) != round(_before_km)
        if payload.override_km is not None and round(payload.override_km) != round(fare["total_km"]):
            fare = apply_distance_override(fare, payload.override_km, payload.override_trip_time, payload.cost_per_km, payload.extra_cost_per_km)
            distance_edited = True

        fleet_owner = _admin_fleet_target(db, payload)
        _est, _vend = _admin_km_prices(payload, fare)
        low = _admin_fleet_low_balance(db, fleet_owner, payload, _est, _vend, payload.cost_per_km, fare["total_km"])
        if low is not None:
            return low
        new_order, master_order_id = create_oneway_order(
            db, skip_broadcast=fleet_owner is not None, vendor_id=payload.vendor_id, trip_type=OrderTypeEnum(payload.trip_type.value), car_type=CarTypeEnum(payload.car_type),
            location_links=payload.location_links, pickup_drop_location=payload.pickup_drop_location, start_date_time=payload.start_date_time,
            customer_name=payload.customer_name, customer_number=payload.customer_number, cost_per_km=payload.cost_per_km,
            extra_cost_per_km=payload.extra_cost_per_km, driver_allowance=payload.driver_allowance, extra_driver_allowance=payload.extra_driver_allowance,
            permit_charges=payload.permit_charges, extra_permit_charges=payload.extra_permit_charges, hill_charges=payload.hill_charges,
            toll_charges=payload.toll_charges, pickup_notes=payload.pickup_notes or "", trip_distance=fare["total_km"], trip_time=fare["trip_time"],
            platform_fees_percent=10, pick_near_city=pick_near_city, target_driver_id=target_driver_id,
            max_time_to_assign_order=payload.max_time_to_assign_order, toll_charge_update=payload.toll_charge_update,
            night_charges=payload.night_charges, acceptance_deadline=getattr(payload, "acceptance_deadline", None),
            estimated_cal_price=fare["driver_amount"], vendor_cal_price=fare["customer_amount"], distance_edited=distance_edited,
            calculated_trip_distance=fare.get("calculated_km"), car_make_year_requirement=payload.car_make_year_requirement,
            carrier_required=bool(payload.carrier_required), priority_for_paid=bool(payload.priority_for_paid) if payload.priority_for_paid is not None else True,
            priority_cutoff_at=payload.priority_cutoff_at, fare_type=payload.fare_type or "ITEMIZED",
            charge_items=[item.model_dump() for item in payload.charge_items] if payload.charge_items else None, advance_received=payload.advance_received,
            total_booking_amount=payload.total_booking_amount, extra_amount=payload.extra_amount, waiting_hours_included=payload.waiting_hours_included,
            # "10% CC" toggle (2026-09-04) - see crud/end_records.py's
            # update_end_trip_record for where this actually skips taking
            # admin_profit at trip close.
            commission_waived=not payload.apply_commission,
            gst_amount=payload.gst_amount,
        )
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="BOOKING_CREATED", target_type="order", target_id=str(master_order_id), target_name=f"Booking #{master_order_id}",
            details={"trip_type": payload.trip_type.value, "vendor_id": str(payload.vendor_id) if payload.vendor_id else "none"},
        )
        _admin_apply_reveal(db, master_order_id, payload)
        allocation = _admin_allocate_new_booking(db, master_order_id, fleet_owner, payload, current_admin)
        return {"order_id": master_order_id, "trip_status": new_order.trip_status, "trip_type": new_order.trip_type, "fare": fare, "allocation": allocation}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to confirm booking: {str(e)}")


@router.post("/admin/orders/roundtrip/confirm", status_code=status.HTTP_201_CREATED)
def admin_roundtrip_confirm(
    payload: AdminRoundTripConfirmRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Staff/Owner posts a Round Trip booking directly, without a vendor."""
    from app.crud.new_orders import calculate_multisegment_fare, create_oneway_order, apply_distance_override
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    try:
        pick_near_city, target_driver_id = _admin_pick_near_city_and_driver(payload)
        fare = calculate_multisegment_fare(
            payload.pickup_drop_location, payload.cost_per_km, payload.driver_allowance, payload.extra_driver_allowance,
            payload.permit_charges, payload.extra_permit_charges, payload.hill_charges, payload.toll_charges,
            payload.extra_cost_per_km, payload.night_charges, payload.trip_type,
            start_date_time=payload.start_date_time, end_date_time=payload.end_date_time,
        )
        distance_edited = False
        if payload.min_km_override is not None or payload.km_override is not None:
            from app.crud.new_orders import apply_admin_km
            _before_km = fare["total_km"]
            fare = apply_admin_km(fare, payload)
            distance_edited = round(fare["total_km"]) != round(_before_km)
        if payload.override_km is not None and round(payload.override_km) != round(fare["total_km"]):
            fare = apply_distance_override(fare, payload.override_km, payload.override_trip_time, payload.cost_per_km, payload.extra_cost_per_km)
            distance_edited = True

        fleet_owner = _admin_fleet_target(db, payload)
        _est, _vend = _admin_km_prices(payload, fare)
        low = _admin_fleet_low_balance(db, fleet_owner, payload, _est, _vend, payload.cost_per_km, fare["total_km"])
        if low is not None:
            return low
        new_order, master_order_id = create_oneway_order(
            db, skip_broadcast=fleet_owner is not None, vendor_id=payload.vendor_id, trip_type=OrderTypeEnum.ROUND_TRIP, car_type=CarTypeEnum(payload.car_type),
            location_links=payload.location_links, pickup_drop_location=payload.pickup_drop_location, start_date_time=payload.start_date_time,
            end_date_time=payload.end_date_time, customer_name=payload.customer_name, customer_number=payload.customer_number,
            cost_per_km=payload.cost_per_km, extra_cost_per_km=payload.extra_cost_per_km, driver_allowance=payload.driver_allowance,
            extra_driver_allowance=payload.extra_driver_allowance, permit_charges=payload.permit_charges, extra_permit_charges=payload.extra_permit_charges,
            hill_charges=payload.hill_charges, toll_charges=payload.toll_charges, pickup_notes=payload.pickup_notes or "",
            trip_distance=fare["total_km"], trip_time=fare["trip_time"], platform_fees_percent=10, pick_near_city=pick_near_city,
            target_driver_id=target_driver_id, max_time_to_assign_order=payload.max_time_to_assign_order, toll_charge_update=payload.toll_charge_update,
            night_charges=payload.night_charges, acceptance_deadline=getattr(payload, "acceptance_deadline", None),
            estimated_cal_price=fare["driver_amount"], vendor_cal_price=fare["customer_amount"], distance_edited=distance_edited,
            calculated_trip_distance=fare.get("calculated_km"), car_make_year_requirement=payload.car_make_year_requirement,
            carrier_required=bool(payload.carrier_required), priority_for_paid=bool(payload.priority_for_paid) if payload.priority_for_paid is not None else True,
            priority_cutoff_at=payload.priority_cutoff_at, fare_type=payload.fare_type or "ITEMIZED",
            charge_items=[item.model_dump() for item in payload.charge_items] if payload.charge_items else None, advance_received=payload.advance_received,
            total_booking_amount=payload.total_booking_amount, extra_amount=payload.extra_amount, waiting_hours_included=payload.waiting_hours_included,
            # "10% CC" toggle (2026-09-04) - see crud/end_records.py's
            # update_end_trip_record for where this actually skips taking
            # admin_profit at trip close.
            commission_waived=not payload.apply_commission,
            gst_amount=payload.gst_amount,
        )
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="BOOKING_CREATED", target_type="order", target_id=str(master_order_id), target_name=f"Booking #{master_order_id}",
            details={"trip_type": "Round Trip", "vendor_id": str(payload.vendor_id) if payload.vendor_id else "none"},
        )
        _admin_apply_reveal(db, master_order_id, payload)
        allocation = _admin_allocate_new_booking(db, master_order_id, fleet_owner, payload, current_admin)
        return {"order_id": master_order_id, "trip_status": new_order.trip_status, "trip_type": new_order.trip_type, "fare": fare, "allocation": allocation}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to confirm booking: {str(e)}")


@router.post("/admin/orders/multicity/confirm", status_code=status.HTTP_201_CREATED)
def admin_multicity_confirm(
    payload: AdminMulticityConfirmRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Staff/Owner posts a Multi City booking directly, without a vendor."""
    from app.crud.new_orders import calculate_multisegment_fare, create_oneway_order, apply_distance_override
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    try:
        pick_near_city, target_driver_id = _admin_pick_near_city_and_driver(payload)
        fare = calculate_multisegment_fare(
            payload.pickup_drop_location, payload.cost_per_km, payload.driver_allowance, payload.extra_driver_allowance,
            payload.permit_charges, payload.extra_permit_charges, payload.hill_charges, payload.toll_charges,
            payload.extra_cost_per_km, payload.night_charges, payload.trip_type,
            start_date_time=payload.start_date_time, end_date_time=payload.end_date_time,
        )
        distance_edited = False
        if payload.min_km_override is not None or payload.km_override is not None:
            from app.crud.new_orders import apply_admin_km
            _before_km = fare["total_km"]
            fare = apply_admin_km(fare, payload)
            distance_edited = round(fare["total_km"]) != round(_before_km)
        if payload.override_km is not None and round(payload.override_km) != round(fare["total_km"]):
            fare = apply_distance_override(fare, payload.override_km, payload.override_trip_time, payload.cost_per_km, payload.extra_cost_per_km)
            distance_edited = True

        fleet_owner = _admin_fleet_target(db, payload)
        _est, _vend = _admin_km_prices(payload, fare)
        low = _admin_fleet_low_balance(db, fleet_owner, payload, _est, _vend, payload.cost_per_km, fare["total_km"])
        if low is not None:
            return low
        new_order, master_order_id = create_oneway_order(
            db, skip_broadcast=fleet_owner is not None, vendor_id=payload.vendor_id, trip_type=OrderTypeEnum.MULTY_CITY, car_type=CarTypeEnum(payload.car_type),
            location_links=payload.location_links, pickup_drop_location=payload.pickup_drop_location, start_date_time=payload.start_date_time,
            end_date_time=payload.end_date_time, customer_name=payload.customer_name, customer_number=payload.customer_number,
            cost_per_km=payload.cost_per_km, extra_cost_per_km=payload.extra_cost_per_km, driver_allowance=payload.driver_allowance,
            extra_driver_allowance=payload.extra_driver_allowance, permit_charges=payload.permit_charges, extra_permit_charges=payload.extra_permit_charges,
            hill_charges=payload.hill_charges, toll_charges=payload.toll_charges, pickup_notes=payload.pickup_notes or "",
            trip_distance=fare["total_km"], trip_time=fare["trip_time"], platform_fees_percent=10, pick_near_city=pick_near_city,
            target_driver_id=target_driver_id, max_time_to_assign_order=payload.max_time_to_assign_order, toll_charge_update=payload.toll_charge_update,
            night_charges=payload.night_charges, acceptance_deadline=getattr(payload, "acceptance_deadline", None),
            estimated_cal_price=fare["driver_amount"], vendor_cal_price=fare["customer_amount"], distance_edited=distance_edited,
            calculated_trip_distance=fare.get("calculated_km"), car_make_year_requirement=payload.car_make_year_requirement,
            carrier_required=bool(payload.carrier_required), priority_for_paid=bool(payload.priority_for_paid) if payload.priority_for_paid is not None else True,
            priority_cutoff_at=payload.priority_cutoff_at, fare_type=payload.fare_type or "ITEMIZED",
            charge_items=[item.model_dump() for item in payload.charge_items] if payload.charge_items else None, advance_received=payload.advance_received,
            total_booking_amount=payload.total_booking_amount, extra_amount=payload.extra_amount, waiting_hours_included=payload.waiting_hours_included,
            # "10% CC" toggle (2026-09-04) - see crud/end_records.py's
            # update_end_trip_record for where this actually skips taking
            # admin_profit at trip close.
            commission_waived=not payload.apply_commission,
            gst_amount=payload.gst_amount,
        )
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="BOOKING_CREATED", target_type="order", target_id=str(master_order_id), target_name=f"Booking #{master_order_id}",
            details={"trip_type": "Multi City", "vendor_id": str(payload.vendor_id) if payload.vendor_id else "none"},
        )
        _admin_apply_reveal(db, master_order_id, payload)
        allocation = _admin_allocate_new_booking(db, master_order_id, fleet_owner, payload, current_admin)
        return {"order_id": master_order_id, "trip_status": new_order.trip_status, "trip_type": new_order.trip_type, "fare": fare, "allocation": allocation}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to confirm booking: {str(e)}")


@router.post("/admin/orders/hourly/confirm", status_code=status.HTTP_201_CREATED)
def admin_hourly_confirm(
    payload: AdminHourlyConfirmRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Staff/Owner posts an Hourly Rental booking directly, without a vendor."""
    from app.crud.hourly_rental import calculate_hourly_fare, create_hourly_order
    from app.crud.orders import create_master_from_hourly
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    try:
        fare = calculate_hourly_fare(
            payload.package_hours, payload.cost_per_hour, payload.extra_cost_per_hour,
            payload.cost_for_addon_km, payload.extra_cost_for_addon_km,
        )
        fleet_owner = _admin_fleet_target(db, payload)
        low = _admin_fleet_low_balance(db, fleet_owner, payload, int(fare["estimate_price"]), int(fare["vendor_amount"]))
        if low is not None:
            return low
        order = create_hourly_order(
            db, vendor_id=payload.vendor_id, trip_type=OrderTypeEnum.HOURLY_RENTAL, car_type=CarTypeEnum(payload.car_type),
            pickup_drop_location=payload.pickup_drop_location, start_date_time=payload.start_date_time,
            customer_name=payload.customer_name, customer_number=payload.customer_number, package_hours=payload.package_hours,
            cost_per_hour=payload.cost_per_hour, extra_cost_per_hour=payload.extra_cost_per_hour,
            cost_for_addon_km=payload.cost_for_addon_km, extra_cost_for_addon_km=payload.extra_cost_for_addon_km,
            pickup_notes=payload.pickup_notes or "",
        )
        master_order = create_master_from_hourly(
            db, order, pick_near_city=["ALL"] if str(payload.pick_near_city).upper() == "ALL" else payload.pick_near_city,
            trip_time=str(payload.package_hours.get("hours", 0)), estimated_price=int(fare["estimate_price"]),
            vendor_price=int(fare["vendor_amount"]), max_time_to_assign_order=payload.max_time_to_assign_order,
            toll_charge_update=payload.toll_charge_update, target_driver_id=payload.target_driver_id,
            fare_type=payload.fare_type or "ITEMIZED", skip_broadcast=fleet_owner is not None,
        )
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="BOOKING_CREATED", target_type="order", target_id=str(master_order.id), target_name=f"Booking #{master_order.id}",
            details={"trip_type": "Hourly Rental", "vendor_id": str(payload.vendor_id) if payload.vendor_id else "none"},
        )
        _admin_apply_reveal(db, master_order.id, payload)
        allocation = _admin_allocate_new_booking(db, master_order.id, fleet_owner, payload, current_admin)
        return {
            "allocation": allocation,
            "order_id": master_order.id, "trip_status": master_order.trip_status, "trip_type": master_order.trip_type,
            "vendor_price": master_order.vendor_price, "estimated_price": master_order.estimated_price, "trip_time": master_order.trip_time,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to confirm hourly booking: {str(e)}")


@router.get("/admin/orders/{order_id}", response_model=AdminOrderDetailResponse)
def get_single_order(
    order_id: int,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get One Order (Admin Only)

    Same fields as /admin/orders, for a single booking. Used by the admin
    "trip detail" page reached by tapping a ledger entry on the dashboard.
    """
    try:
        orders, _ = get_all_admin_orders(db, order_id=order_id)
        if not orders:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
        return orders[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


from pydantic import BaseModel as _AdminEditFareBaseModel


class AdminEditOrderFareRequest(_AdminEditFareBaseModel):
    """All fields optional - only supplied ones change. Mirrors
    api/routes/orders.py's vendor-facing EditOrderRequest exactly (same
    editable columns), just reachable by admin/staff instead of the
    booking's own vendor - see crud/orders.py::edit_order for the shared
    recompute logic (vendor_id=None skips the ownership check)."""
    cost_per_km: Optional[int] = None
    extra_cost_per_km: Optional[int] = None
    driver_allowance: Optional[int] = None
    extra_driver_allowance: Optional[int] = None
    permit_charges: Optional[int] = None
    extra_permit_charges: Optional[int] = None
    hill_charges: Optional[int] = None
    toll_charges: Optional[int] = None
    night_charges: Optional[int] = None
    # Hourly Rental only
    cost_per_hour: Optional[int] = None
    extra_cost_per_hour: Optional[int] = None
    cost_for_addon_km: Optional[int] = None
    extra_cost_for_addon_km: Optional[int] = None


@router.patch("/admin/orders/{order_id}/edit-fare")
async def admin_edit_order_fare(
    order_id: int,
    request: AdminEditOrderFareRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Admin/Owner edit of a booking's fare/rate fields after posting - the
    Admin-App equivalent of the vendor's own PATCH /{order_id}/edit, for
    bookings a vendor isn't available to fix themselves (or an admin needs
    to correct on their behalf). Gated the same way as every other
    money-moving admin action (wallet adjust, payout pay) - Owner always
    passes, Staff needs 'payment_release' or 'finance'. Blocked on
    COMPLETED/CANCELLED orders by crud/orders.py::edit_order itself."""
    require_payment_release_permission(current_admin)
    from app.models.orders import Order
    from app.crud.orders import edit_order

    before = db.query(Order).filter(Order.id == order_id).first()
    if not before:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    old_estimated_price = before.estimated_price
    old_vendor_price = before.vendor_price

    try:
        # off the event loop: it recalculates the fare and used to wait on Google Maps while every other request queued behind it
        from starlette.concurrency import run_in_threadpool
        order = await run_in_threadpool(edit_order, db, order_id, None, request.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="ORDER_FARE_EDITED", target_type="order", target_id=str(order_id), target_name=f"Booking #{order_id}",
            details={
                "old_estimated_price": old_estimated_price, "new_estimated_price": order.estimated_price,
                "old_vendor_price": old_vendor_price, "new_vendor_price": order.vendor_price,
                "updates": request.model_dump(exclude_unset=True),
            },
        )
    except Exception:
        pass  # audit-log failure must never block the actual edit

    try:
        from app.crud.notification import notify_order_price_edited
        await notify_order_price_edited(db, order_id, order.vendor_price)
    except Exception as e:
        print(f"Failed to notify of order edit: {e}")

    return {
        "order_id": order.id,
        "estimated_price": order.estimated_price,
        "vendor_price": order.vendor_price,
    }


from pydantic import BaseModel as _AdminIncreaseFareBaseModel


class AdminIncreaseFareRequest(_AdminIncreaseFareBaseModel):
    new_total_amount: int


@router.patch("/admin/orders/{order_id}/increase-all-inclusive-fare")
def admin_increase_all_inclusive_fare(
    order_id: int,
    request: AdminIncreaseFareRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Admin edit to increase flat total fare for ALL_INCLUSIVE bookings and re-broadcast driver alert."""
    require_payment_release_permission(current_admin)
    try:
        from app.crud.orders import increase_all_inclusive_fare
        order, old_amount, new_amount = increase_all_inclusive_fare(db, order_id, None, request.new_total_amount)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    try:
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="ALL_INCLUSIVE_FARE_INCREASED", target_type="order", target_id=str(order_id), target_name=f"Booking #{order_id}",
            details={"old_amount": old_amount, "new_amount": new_amount},
        )
    except Exception:
        pass

    return {
        "status": "success",
        "order_id": order.id,
        "old_total_amount": old_amount,
        "new_total_amount": new_amount,
        "total_booking_amount": order.total_booking_amount,
        "message": f"Fare increased to ₹{new_amount:,} and driver alert re-broadcasted successfully."
    }


class AdminMasterEditOrderRequest(BaseModel):
    customer_name: Optional[str] = None
    customer_number: Optional[str] = None
    customer_email: Optional[str] = None
    trip_distance: Optional[int] = None
    start_date_time: Optional[datetime] = None
    car_type: Optional[str] = None
    trip_type: Optional[str] = None
    estimated_price: Optional[int] = None
    vendor_price: Optional[int] = None
    total_booking_amount: Optional[int] = None
    advance_received: Optional[int] = None
    pickup_drop_location: Optional[Dict[str, Any]] = None


class AdminForceCompleteRequest(BaseModel):
    end_km: Optional[int] = None
    final_fare: Optional[int] = None
    note: Optional[str] = "Force completed by Admin"


@router.patch("/admin/orders/{order_id}/master-edit")
def admin_master_edit_order_route(
    order_id: int,
    request: AdminMasterEditOrderRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Admin Master Edit: Allows Admin to edit ANY booking at ANY TIME."""
    from app.crud.orders import admin_master_edit_order
    try:
        order = admin_master_edit_order(db, order_id, request.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    try:
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="ORDER_MASTER_EDITED", target_type="order", target_id=str(order_id), target_name=f"Booking #{order_id}",
            details=request.model_dump(exclude_unset=True),
        )
    except Exception:
        pass

    return {
        "status": "success",
        "order_id": order.id,
        "message": f"Booking #{order.id} updated successfully.",
        "customer_name": order.customer_name,
        "customer_number": order.customer_number,
        "estimated_price": order.estimated_price,
        "vendor_price": order.vendor_price,
        "trip_status": getattr(order.trip_status, "value", order.trip_status),
    }


@router.post("/admin/orders/{order_id}/force-complete")
def admin_force_complete_order_route(
    order_id: int,
    request: AdminForceCompleteRequest = AdminForceCompleteRequest(),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Admin Force Complete: Allows Admin to manually mark any booking as COMPLETED and settle."""
    from app.crud.orders import admin_force_complete_order
    try:
        order = admin_force_complete_order(db, order_id, end_km=request.end_km, final_fare=request.final_fare, note=request.note)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    try:
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="ORDER_FORCE_COMPLETED", target_type="order", target_id=str(order_id), target_name=f"Booking #{order_id}",
            details={"end_km": request.end_km, "final_fare": request.final_fare, "note": request.note},
        )
    except Exception:
        pass

    return {
        "status": "success",
        "order_id": order.id,
        "trip_status": "COMPLETED",
        "closed_vendor_price": order.closed_vendor_price,
        "message": f"Booking #{order.id} marked as COMPLETED successfully.",
    }



from pydantic import BaseModel as _AdminCancelOrderBaseModel


class AdminCancelOrderRequest(_AdminCancelOrderBaseModel):
    reason: Optional[str] = None


@router.patch("/admin/orders/{order_id}/cancel")
async def admin_cancel_order(
    order_id: int,
    request: AdminCancelOrderRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Admin/Owner cancel of a booking - there was previously no way to
    cancel a bad/duplicate/test booking from the Admin App at all (found
    2026-09-04 with nowhere to clean up test data created during a live
    verification pass). Gated the same as edit-fare (a money-moving admin
    action - refunds the fleet owner's wallet hold, same as a vendor/
    customer cancel)."""
    require_payment_release_permission(current_admin)
    from app.crud.order_assignments import cancel_order_by_admin

    try:
        result = cancel_order_by_admin(db, order_id, request.reason)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="ORDER_CANCELLED", target_type="order", target_id=str(order_id), target_name=f"Booking #{order_id}",
            details={"reason": request.reason},
        )
    except Exception:
        pass  # audit-log failure must never block the actual cancel

    try:
        from app.crud.notification import send_booking_cancelled_to_telegram
        await send_booking_cancelled_to_telegram(master_id=order_id)
    except Exception as e:
        print(f"cancel-by-admin Telegram notify failed (cancel still succeeded): {e}")

    return result


@router.get("/admin/cars", response_model=CarListResponse)
def list_all_cars(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    vehicle_owner_id: Optional[str] = Query(None, description="Filter by fleet owner ID"),
    status_filter: Optional[str] = Query(None, description="Filter by car status: ONLINE, DRIVING, BLOCKED, PROCESSING"),
    car_type_filter: Optional[str] = Query(None, description="Filter by car type"),
    search: Optional[str] = Query(None, description="Search by car name, car number (digits match too), or owner name"),
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get All Cars (Admin Only)
    
    Returns a list of all cars in the system with basic information:
    - ID
    - Car Name
    - Car Type
    - Car Number
    - Car Status (ONLINE, DRIVING, BLOCKED, PROCESSING)
    - Fleet Owner ID and Name
    - Year of the Car
    
    Supports filtering by:
    - vehicle_owner_id: Filter by specific fleet owner
    - status_filter: Filter by car status
    - car_type_filter: Filter by car type
    
    Requires admin authentication.
    
    Returns:
        - List of cars with basic info
        - Total count
        - Status counts (online, blocked, processing, driving)
    """
    try:
        cars, total_count, online_count, blocked_count, processing_count, driving_count = get_all_cars_unified(
            db=db,
            skip=skip,
            limit=limit,
            vehicle_owner_id=vehicle_owner_id,
            status_filter=status_filter,
            car_type_filter=car_type_filter,
            search=search
        )
        
        car_items = [
            CarListItem(
                id=car["id"],
                vehicle_owner_id=car["vehicle_owner_id"],
                car_name=car["car_name"],
                car_type=car["car_type"],
                car_number=car["car_number"],
                year_of_the_car=car["year_of_the_car"],
                car_status=car["car_status"],
                vehicle_owner_name=car["vehicle_owner_name"],
                vehicle_owner_reg_id=car.get("vehicle_owner_reg_id"),
                created_at=car["created_at"]
            )
            for car in cars
        ]
        
        return CarListResponse(
            cars=car_items,
            total_count=total_count,
            online_count=online_count,
            blocked_count=blocked_count,
            processing_count=processing_count,
            driving_count=driving_count
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/admin/cars", response_model=AdminCreateCarResponse, status_code=status.HTTP_201_CREATED)
def create_car_admin_route(
    request: AdminCreateCarRequest,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin assigns a car directly to a fleet owner (Assign Car screen).
    Skips document upload and is not subject to the NEW SEDAN minimum-year
    restriction that applies to driver self-registration."""
    car = create_car_admin(
        db,
        vehicle_owner_id=request.vehicle_owner_id,
        car_name=request.car_name,
        car_type=request.car_type,
        car_number=request.car_number,
        year_of_the_car=request.year_of_the_car,
    )
    return car


@router.get("/admin/settings/new-car-year", response_model=NewCarYearSetting)
def get_new_car_year_setting(
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return NewCarYearSetting(new_car_min_year=get_new_car_min_year(db))


@router.put("/admin/settings/new-car-year", response_model=NewCarYearSetting)
def update_new_car_year_setting(
    request: NewCarYearSetting,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if request.new_car_min_year < 1990 or request.new_car_min_year > 2100:
        raise HTTPException(status_code=400, detail="Enter a valid 4-digit year")
    set_new_car_min_year(db, request.new_car_min_year)
    return NewCarYearSetting(new_car_min_year=request.new_car_min_year)


@router.get("/admin/accounts", response_model=AccountListResponse)
def list_all_accounts(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(5000, ge=1, le=6000, description="Number of records to return"),
    account_type: Optional[str] = Query(None, description="Filter by account type: vendor, vehicle_owner, driver, quickdriver"),
    status_filter: Optional[str] = Query(None, description="Filter by status: active, inactive, pending, ONLINE, OFFLINE, etc."),
    search: Optional[str] = Query(None, description="Search by name, phone number, or reg_id across all account types"),
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get All Accounts (Admin Only)
    
    Returns a unified list of all accounts (vendors, fleet owners, drivers) with basic information:
    - ID
    - Name
    - Account Type (vendor, vehicle_owner, driver)
    - Account Status (Active, Inactive, Pending, ONLINE, OFFLINE, etc.)
    
    Supports filtering by:
    - account_type: Filter by specific account type
    - status_filter: Filter by status (active, inactive, pending, or specific statuses)
    
    Requires admin authentication.
    
    Returns:
        - List of accounts with basic info
        - Total count
        - Active count
        - Inactive count
    """
    try:
        accounts, total_count, active_count, inactive_count = get_all_accounts_unified(
            db=db,
            skip=skip,
            limit=limit,
            account_type=account_type,
            status_filter=status_filter,
            search=search
        )
        
        account_items = [
            AccountListItem(
                id=acc["id"],
                reg_id=acc.get("reg_id"),
                name=acc["name"],
                account_type=acc["account_type"],
                account_status=acc["account_status"],
                primary_number=acc.get("primary_number"),
                blocked_reason=acc.get("blocked_reason"),
                permanently_blocked=acc.get("permanently_blocked", False),
                permanently_blocked_reason=acc.get("permanently_blocked_reason"),
                pending_documents_count=acc.get("pending_documents_count", 0),
            )
            for acc in accounts
        ]
        
        return AccountListResponse(
            accounts=account_items,
            total_count=total_count,
            active_count=active_count,
            inactive_count=inactive_count
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/admin/customers", response_model=CustomerListOut)
def list_all_customers(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    search: Optional[str] = Query(None, description="Search by customer name, phone number, or company name"),
    segment: Optional[str] = Query(None, description="Filter by segment: INDIVIDUAL, B2B, or CORPORATE"),
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get All Customers (Admin Only)

    Real customer accounts (customer + customer_details tables) - NOT the
    old workaround of grouping self-service booking requests. Customers have
    no wallet/verification flow in this system, so this is intentionally a
    simple profile directory: name, phone, email, saved addresses, segment.

    Requires admin authentication.
    """
    try:
        customers, total_count = get_all_customers(db=db, skip=skip, limit=limit, search=search, segment=segment)
        return CustomerListOut(
            customers=[CustomerListItem(**c) for c in customers],
            total_count=total_count,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


class CustomerSegmentUpdate(_StaffBaseModel):
    segment: str  # INDIVIDUAL, B2B, or CORPORATE
    company_name: Optional[str] = None
    gst_number: Optional[str] = None


@router.patch("/admin/customers/{customer_details_id}/segment")
def update_customer_segment_route(
    customer_details_id: str,
    body: CustomerSegmentUpdate,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Tag a customer as Individual/B2B/Corporate. No self-serve B2B signup
    exists yet - this admin action is the only way a customer's segment
    changes."""
    return update_customer_segment(db, customer_details_id, body.segment, body.company_name, body.gst_number)


@router.get("/admin/accounts/{account_id}", response_model=AccountFullDetailsResponse)
def get_account_details(
    account_id: UUID,
    account_type: str = Query(..., description="Account type: vendor, vehicle_owner, driver, or quickdriver"),
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get Account Full Details by ID (Admin Only)
    
    Returns complete details of a specific account based on ID and account type.
    
    Account types supported:
    - vendor: Returns vendor full details
    - vehicle_owner: Returns fleet owner full details
    - driver or quickdriver: Returns driver full details
    
    Requires admin authentication.
    
    Returns:
        - Complete account details including all profile information
        - Document status
        - Account status
    """
    try:
        account_details = get_account_details_by_id(db, str(account_id), account_type)
        
        if not account_details:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Account not found with ID {account_id} and type {account_type}"
            )
        
        # Prepare documents if available
        documents = None
        if account_details.get("aadhar_front_img"):
            from app.schemas.admin_management import VendorDocumentInfo
            documents = {
                "aadhar": VendorDocumentInfo(
                    document_type="aadhar",
                    status=account_details.get("aadhar_status"),
                    image_url=generate_signed_url_from_gcs(account_details.get("aadhar_front_img")) if account_details.get("aadhar_front_img") else None
                )
            }
        elif account_details.get("licence_front_img"):
            from app.schemas.admin_management import VendorDocumentInfo
            documents = {
                "licence": VendorDocumentInfo(
                    document_type="licence",
                    status=account_details.get("licence_front_status"),
                    image_url=generate_signed_url_from_gcs(account_details.get("licence_front_img")) if account_details.get("licence_front_img") else None
                )
            }
        
        # Generate signed URLs for images if they exist
        aadhar_img_url = None
        if account_details.get("aadhar_front_img"):
            aadhar_img_url = generate_signed_url_from_gcs(account_details.get("aadhar_front_img"))
        
        licence_img_url = None
        if account_details.get("licence_front_img"):
            licence_img_url = generate_signed_url_from_gcs(account_details.get("licence_front_img"))
        
        return AccountFullDetailsResponse(
            id=account_details["id"],
            reg_id=account_details.get("reg_id"),
            account_type=account_details["account_type"],
            account_status=account_details["account_status"],
            vendor_id=account_details.get("vendor_id"),
            vehicle_owner_id=account_details.get("vehicle_owner_id"),
            full_name=account_details.get("full_name"),
            primary_number=account_details.get("primary_number"),
            secondary_number=account_details.get("secondary_number"),
            gpay_number=account_details.get("gpay_number"),
            wallet_balance=account_details.get("wallet_balance"),
            bank_balance=account_details.get("bank_balance"),
            aadhar_number=account_details.get("aadhar_number"),
            aadhar_front_img=aadhar_img_url,
            aadhar_status=account_details.get("aadhar_status"),
            address=account_details.get("address"),
            city=account_details.get("city"),
            pincode=account_details.get("pincode"),
            licence_number=account_details.get("licence_number"),
            licence_front_img=licence_img_url,
            licence_front_status=account_details.get("licence_front_status"),
            created_at=account_details.get("created_at"),
            documents=documents,
            blocked_reason=account_details.get("blocked_reason"),
            permanently_blocked=account_details.get("permanently_blocked", False),
            permanently_blocked_reason=account_details.get("permanently_blocked_reason"),
            cars=account_details.get("cars", []),
            drivers=account_details.get("drivers", []),
            tier=account_details.get("tier"),
            admin_trusted_override=account_details.get("admin_trusted_override"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.post("/admin/search-vehicle-owner", response_model=VehicleOwnerInfoResponse, status_code=status.HTTP_200_OK)
def search_vehicle_owner(
    search_request: SearchVehicleOwnerRequest,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Search Fleet Owner by Primary Number
    
    Searches for a fleet owner by their primary phone number.
    Returns fleet owner information including wallet balance and profile details.
    
    Requires admin authentication.
    
    Returns:
        - Fleet owner information
        - Wallet balance
        - Profile details
    """
    try:
        vehicle_owner_info = get_vehicle_owner_by_primary_number(db, search_request.primary_number)
        return VehicleOwnerInfoResponse(**vehicle_owner_info)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.post("/admin/search-user/details",response_model=UserInfoResponse, status_code=status.HTTP_200_OK)
def search_user(
    search_request: SearchUserRequest,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Search User by Primary Number
    
    Searches for a user by their primary phone number.
    Returns user information including profile details.
    
    Requires admin authentication.
    
    Returns:
        - User information
        - Profile details
    """
    try:
        print(search_request.role,search_request.primary_number)
        user_info = get_user_by_primary_number(db, search_request.role, search_request.primary_number)
        return UserInfoResponse(**user_info)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.post("/admin/add-money-to-vehicle-owner", response_model=AdminAddMoneyResponse, status_code=status.HTTP_201_CREATED)
def add_money_to_vehicle_owner(
    vehicle_owner_id: str = Form(..., description="ID of the fleet owner"),
    transaction_value: int = Form(..., description="Transaction amount in paise (mandatory)"),
    notes: Optional[str] = Form(None, description="Transaction notes"),
    reference_value: Optional[str] = Form(None, description="Optional reference string for the transaction"),
    transaction_img: UploadFile = File(None),
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Add Money to Fleet Owner
    
    Creates a payment transaction to add money to a fleet owner's wallet.
    
    Requires admin authentication.
    
    Steps:
    1. Validates fleet owner exists
    2. Uploads transaction image to GCS if provided (optional)
    3. Updates fleet owner's wallet balance
    4. Creates wallet ledger entry
    5. Records transaction in admin_add_money_to_vehicle_owner table
    
    Returns:
        - Transaction details
        - New wallet balance
        - Transaction ID
    """
    # This used to be reachable by ANY authenticated admin/staff account
    # regardless of granted permissions - creating real wallet balance with
    # no finance-permission gate, matching the same class of gap the
    # payout/wallet-adjust endpoints already correctly guard against.
    require_payment_release_permission(current_admin)
    from app.crud.admin_activity_log import log_admin_action
    try:
        transaction_img_url = None

        # Upload transaction image to GCS if provided
        if transaction_img:
            # Validate file type
            allowed_extensions = {'.jpg', '.jpeg', '.png', '.pdf'}
            file_ext = os.path.splitext(transaction_img.filename)[-1].lower()
            if file_ext not in allowed_extensions:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid file type. Allowed types: {', '.join(allowed_extensions)}"
                )

            # Upload to GCS
            transaction_img_url = upload_image_to_gcs(
                transaction_img,
                folder="admin_transactions"
            )

        # Create transaction
        result = create_admin_add_money_transaction(
            db=db,
            vehicle_owner_id=vehicle_owner_id,
            transaction_value=transaction_value,
            transaction_img=transaction_img_url,
            notes=notes,
            reference_value=reference_value,
            admin_id=current_admin.id
        )

        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="WALLET_ADJUST", target_type="vehicle_owner", target_id=vehicle_owner_id,
            details={"transaction_value": transaction_value, "reference_value": reference_value, "notes": notes},
        )

        return AdminAddMoneyResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


# ============ VENDOR MANAGEMENT ENDPOINTS ============

@router.get("/admin-vendor/vendors", response_model=VendorListOut)
def list_all_vendors(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    List All Vendors (Admin Only)
    
    Returns a paginated list of all vendors in the system with mandatory fields.
    
    Requires admin authentication.
    
    Returns:
        - List of vendors with mandatory fields
        - Total count of vendors
    """
    try:
        vendors, total_count = get_all_vendors(db, skip, limit)
        return VendorListOut(
            vendors=vendors,
            total_count=total_count
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/admin/vendors/{vendor_id}", response_model=VendorFullDetailsResponse)
def get_vendor_details(
    vendor_id: UUID,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get Vendor Full Details (Admin Only)
    
    Returns complete vendor information including:
    - All profile details
    - Document status (with signed URLs for document images)
    - Account status
    
    Requires admin authentication.
    
    Returns:
        - Complete vendor details
        - Document information with status
        - Account status
    """
    try:
        result = get_vendor_full_details(db, str(vendor_id))
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vendor not found"
            )
        
        vendor_credentials, vendor_details = result
        
        # Prepare documents
        documents = {}
        if vendor_details.aadhar_front_img:
            documents["aadhar"] = {
                "document_type": "aadhar",
                "status": vendor_details.aadhar_status.value if vendor_details.aadhar_status else None,
                "image_url": generate_signed_url_from_gcs(vendor_details.aadhar_front_img) if vendor_details.aadhar_front_img else None
            }
        
        vendor_phone = vendor_details.primary_number or getattr(vendor_credentials, 'primary_number', '')
        curr_pass = getattr(vendor_credentials, "plain_password", None) or (vendor_phone[-6:] if vendor_phone and len(vendor_phone) >= 6 else None)

        return VendorFullDetailsResponse(
            id=vendor_details.id,
            vendor_id=vendor_details.vendor_id,
            full_name=vendor_details.full_name,
            primary_number=vendor_details.primary_number,
            secondary_number=vendor_details.secondary_number,
            gpay_number=vendor_details.gpay_number,
            wallet_balance=vendor_details.wallet_balance,
            bank_balance=vendor_details.bank_balance,
            aadhar_number=vendor_details.aadhar_number,
            aadhar_front_img=generate_signed_url_from_gcs(vendor_details.aadhar_front_img) if vendor_details.aadhar_front_img else None,
            aadhar_status=vendor_details.aadhar_status.value if vendor_details.aadhar_status else None,
            address=vendor_details.address,
            city=vendor_details.city,
            pincode=vendor_details.pincode,
            account_status=vendor_credentials.account_status.value,
            documents=documents,
            created_at=vendor_details.created_at,
            current_password=curr_pass,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.patch("/admin/vendors/{vendor_id}/account-status", response_model=StatusUpdateResponse)
def update_vendor_account_status_route(
    vendor_id: UUID,
    status_update: UpdateAccountStatusRequest,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update Vendor Account Status (Admin Only)
    
    Allows admin to change the account status of a vendor.
    Valid statuses: ACTIVE, INACTIVE, PENDING
    
    Requires admin authentication.
    
    Returns:
        - Success message
        - Vendor ID
        - New account status
    """
    try:
        updated_vendor = update_vendor_account_status(db, str(vendor_id), status_update.account_status)
        return StatusUpdateResponse(
            message="Vendor account status updated successfully",
            id=updated_vendor.id,
            new_status=updated_vendor.account_status.value
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.patch("/admin/vendors/{vendor_id}/document-status", response_model=StatusUpdateResponse)
def update_vendor_document_status_route(
    vendor_id: UUID,
    status_update: UpdateDocumentStatusRequest,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update Vendor Document Status (Admin Only)
    
    Allows admin to change the document verification status of a vendor.
    Valid statuses: PENDING, VERIFIED, INVALID
    
    Requires admin authentication.
    
    Returns:
        - Success message
        - Vendor ID
        - New document status
    """
    try:
        doc_status = DocumentStatusEnum[status_update.document_status.upper()]
        updated_vendor = update_vendor_document_status(db, str(vendor_id), doc_status)
        return StatusUpdateResponse(
            message="Vendor document status updated successfully",
            id=updated_vendor.id,
            new_status=updated_vendor.aadhar_status.value
        )
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document status. Must be one of: PENDING, VERIFIED, INVALID"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


# ============ VEHICLE OWNER MANAGEMENT ENDPOINTS ============

@router.get("/admin-vehcile-owner/vehicle-owners", response_model=VehicleOwnerListOut)
@router.get("/admin-vehicle-owner/vehicle-owners", response_model=VehicleOwnerListOut)
@router.get("/admin/vehicle-owners", response_model=VehicleOwnerListOut)
def list_all_vehicle_owners(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    search: Optional[str] = Query(None, description="Match fleet name/phone/city, or a driver's name/phone/licence number"),
    status: Optional[str] = Query(None, description="Filter by account_status: ACTIVE, INACTIVE, or PENDING"),
    tier: Optional[str] = Query(None, description="Filter by tier/plan: STANDARD, TRUSTED, PREFERRED, MONTHLY, YEARLY"),
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    List All Fleet Owners (Admin Only)

    Returns a paginated list of all fleet owners in the system with mandatory fields.

    Requires admin authentication.

    Returns:
        - List of fleet owners with mandatory fields
        - Total count of fleet owners
    """
    try:
        vehicle_owners, total_count = get_all_vehicle_owners(db, skip, limit, search, status, tier)
        return VehicleOwnerListOut(
            vehicle_owners=vehicle_owners,
            total_count=total_count
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/admin/vehicle-owners/{vehicle_owner_id}", response_model=VehicleOwnerWithAssetsResponse)
def get_vehicle_owner_details(
    vehicle_owner_id: UUID,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get Fleet Owner Full Details with Cars and Drivers (Admin Only)
    
    Returns complete fleet owner information including:
    - All profile details
    - Document status (with signed URLs for document images)
    - Account status
    - List of all cars owned by the fleet owner
    - List of all drivers associated with the fleet owner
    
    Requires admin authentication.
    
    Returns:
        - Complete fleet owner details
        - Document information with status
        - Account status
        - List of cars with their details and statuses
        - List of drivers with their details and statuses
    """
    try:
        result = get_vehicle_owner_full_details(db, str(vehicle_owner_id))
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Fleet owner not found"
            )
        
        vehicle_owner_credentials, vehicle_owner_details = result
        
        # Prepare documents
        documents = {}
        if vehicle_owner_details.aadhar_front_img:
            documents["aadhar"] = {
                "document_type": "aadhar",
                "status": vehicle_owner_details.aadhar_status.value if vehicle_owner_details.aadhar_status else None,
                "image_url": generate_signed_url_from_gcs(vehicle_owner_details.aadhar_front_img) if vehicle_owner_details.aadhar_front_img else None
            }
        
        # Get fleet owner details
        from app.crud.billing import get_billing_settings
        billing_settings = get_billing_settings(db)
        owner_phone = vehicle_owner_details.primary_number or getattr(vehicle_owner_credentials, 'primary_number', '')
        curr_pass = getattr(vehicle_owner_credentials, "plain_password", None) or (owner_phone[-6:] if owner_phone and len(owner_phone) >= 6 else None)

        owner_details = VehicleOwnerFullDetailsResponse(
            id=vehicle_owner_details.id,
            vehicle_owner_id=vehicle_owner_details.vehicle_owner_id,
            full_name=vehicle_owner_details.full_name,
            primary_number=vehicle_owner_details.primary_number,
            secondary_number=vehicle_owner_details.secondary_number,
            wallet_balance=vehicle_owner_details.wallet_balance,
            aadhar_number=vehicle_owner_details.aadhar_number,
            aadhar_front_img=generate_signed_url_from_gcs(vehicle_owner_details.aadhar_front_img) if vehicle_owner_details.aadhar_front_img else None,
            aadhar_status=vehicle_owner_details.aadhar_status.value if vehicle_owner_details.aadhar_status else None,
            address=vehicle_owner_details.address,
            city=vehicle_owner_details.city,
            pincode=vehicle_owner_details.pincode,
            account_status=vehicle_owner_credentials.account_status.value,
            documents=documents,
            created_at=vehicle_owner_details.created_at,
            billing_next_date=vehicle_owner_details.billing_next_date,
            billing_last_charged_at=vehicle_owner_details.billing_last_charged_at,
            billing_suspended=bool(vehicle_owner_details.billing_suspended),
            yearly_fee=billing_settings["yearly_fee"],
            tier=vehicle_owner_details.tier,
            subscription_type=vehicle_owner_details.subscription_type,
            admin_trusted_override=bool(vehicle_owner_details.admin_trusted_override),
            trusted_override_by=vehicle_owner_details.trusted_override_by,
            trusted_override_reason=vehicle_owner_details.trusted_override_reason,
            trusted_override_at=vehicle_owner_details.trusted_override_at,
            current_password=curr_pass,
        )
        
        # Get cars
        cars = get_vehicle_owner_cars(db, str(vehicle_owner_id))
        cars_list = []
        for car in cars:
            cars_list.append({
                "id": car.id,
                "vehicle_owner_id": car.vehicle_owner_id,
                "car_name": car.car_name,
                "car_type": car.car_type.value,
                "car_number": car.car_number,
                "year_of_the_car": car.year_of_the_car,
                "rc_front_img_url": generate_signed_url_from_gcs(car.rc_front_img_url) if car.rc_front_img_url else None,
                "rc_front_status": car.rc_front_status.value if car.rc_front_status else None,
                "rc_back_img_url": generate_signed_url_from_gcs(car.rc_back_img_url) if car.rc_back_img_url else None,
                "rc_back_status": car.rc_back_status.value if car.rc_back_status else None,
                "insurance_img_url": generate_signed_url_from_gcs(car.insurance_img_url) if car.insurance_img_url else None,
                "insurance_status": car.insurance_status.value if car.insurance_status else None,
                "fc_img_url": generate_signed_url_from_gcs(car.fc_img_url) if car.fc_img_url else None,
                "fc_status": car.fc_status.value if car.fc_status else None,
                "car_img_url": generate_signed_url_from_gcs(car.car_img_url) if car.car_img_url else None,
                "car_img_status": car.car_img_status.value if car.car_img_status else None,
                "car_status": car.car_status.value,
                "rating_avg": car.rating_avg or 0.0,
                "rating_count": car.rating_count or 0,
                "created_at": car.created_at
            })

        # Get drivers
        drivers = get_vehicle_owner_drivers(db, str(vehicle_owner_id))
        drivers_list = []
        for driver in drivers:
            drivers_list.append({
                "id": driver.id,
                "vehicle_owner_id": driver.vehicle_owner_id,
                "full_name": driver.full_name,
                "primary_number": driver.primary_number,
                "secondary_number": driver.secondary_number,
                "licence_number": driver.licence_number,
                "licence_front_img": generate_signed_url_from_gcs(driver.licence_front_img) if driver.licence_front_img else None,
                "licence_front_status": driver.licence_front_status.value if driver.licence_front_status else None,
                "address": driver.address,
                "city": driver.city,
                "pincode": driver.pincode,
                "driver_status": driver.driver_status.value,
                "rating_avg": driver.rating_avg or 0.0,
                "rating_count": driver.rating_count or 0,
                "created_at": driver.created_at
            })
        
        return VehicleOwnerWithAssetsResponse(
            vehicle_owner=owner_details,
            cars=cars_list,
            drivers=drivers_list
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.patch("/admin/vehicle-owners/{vehicle_owner_id}/account-status", response_model=StatusUpdateResponse)
def update_vehicle_owner_account_status_route(
    vehicle_owner_id: UUID,
    status_update: UpdateAccountStatusRequest,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update Fleet Owner Account Status (Admin Only)
    
    Allows admin to change the account status of a fleet owner.
    Valid statuses: ACTIVE, INACTIVE, PENDING
    
    Requires admin authentication.
    
    Returns:
        - Success message
        - Fleet owner ID
        - New account status
    """
    try:
        updated_owner = update_vehicle_owner_account_status(db, str(vehicle_owner_id), status_update.account_status)
        return StatusUpdateResponse(
            message="Fleet owner account status updated successfully",
            id=updated_owner.id,
            new_status=updated_owner.account_status.value
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.patch("/admin/vehicle-owners/{vehicle_owner_id}/document-status", response_model=StatusUpdateResponse)
def update_vehicle_owner_document_status_route(
    vehicle_owner_id: UUID,
    status_update: UpdateDocumentStatusRequest,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update Fleet Owner Document Status (Admin Only)
    
    Allows admin to change the document verification status of a fleet owner.
    Valid statuses: PENDING, VERIFIED, INVALID
    
    Requires admin authentication.
    
    Returns:
        - Success message
        - Fleet owner ID
        - New document status
    """
    try:
        doc_status = DocumentStatusEnum[status_update.document_status.upper()]
        updated_owner = update_vehicle_owner_document_status(db, str(vehicle_owner_id), doc_status)
        return StatusUpdateResponse(
            message="Fleet owner document status updated successfully",
            id=updated_owner.id,
            new_status=updated_owner.aadhar_status.value
        )
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document status. Must be one of: PENDING, VERIFIED, INVALID"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


# ============ CAR MANAGEMENT ENDPOINTS ============

@router.patch("/admin/cars/{car_id}/account-status", response_model=StatusUpdateResponse)
def update_car_account_status_route(
    car_id: UUID,
    status_update: UpdateAccountStatusRequest,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update Car Account Status (Admin Only)
    
    Allows admin to change the status of a car.
    Valid statuses: ONLINE, DRIVING, BLOCKED, PROCESSING
    
    Requires admin authentication.
    
    Returns:
        - Success message
        - Car ID
        - New car status
    """
    try:
        updated_car = update_car_account_status(db, str(car_id), status_update.account_status)
        return StatusUpdateResponse(
            message="Car status updated successfully",
            id=updated_car.id,
            new_status=updated_car.car_status.value
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.patch("/admin/cars/{car_id}/document-status", response_model=StatusUpdateResponse)
def update_car_document_status_route(
    car_id: UUID,
    document_type: str = Query(..., description="Document type: rc_front, rc_back, insurance, fc, car_img"),
    status_update: UpdateDocumentStatusRequest = ...,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update Car Document Status (Admin Only)
    
    Allows admin to change the document verification status of a car document.
    Valid document types: rc_front, rc_back, insurance, fc, car_img
    Valid statuses: PENDING, VERIFIED, INVALID
    
    Requires admin authentication.
    
    Returns:
        - Success message
        - Car ID
        - New document status
    """
    try:
        doc_status = DocumentStatusEnum[status_update.document_status.upper()]
        updated_car = update_car_document_status(db, str(car_id), document_type, doc_status)
        
        # Get the status field value
        status_field_map = {
            "rc_front": updated_car.rc_front_status.value if updated_car.rc_front_status else None,
            "rc_back": updated_car.rc_back_status.value if updated_car.rc_back_status else None,
            "insurance": updated_car.insurance_status.value if updated_car.insurance_status else None,
            "fc": updated_car.fc_status.value if updated_car.fc_status else None,
            "car_img": updated_car.car_img_status.value if updated_car.car_img_status else None,
        }
        
        return StatusUpdateResponse(
            message=f"Car {document_type} document status updated successfully",
            id=updated_car.id,
            new_status=status_field_map.get(document_type, doc_status.value)
        )
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document status. Must be one of: PENDING, VERIFIED, INVALID"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


# ============ DRIVER MANAGEMENT ENDPOINTS ============

@router.patch("/admin/drivers/{driver_id}/account-status", response_model=StatusUpdateResponse)
def update_driver_account_status_route(
    driver_id: UUID,
    status_update: UpdateAccountStatusRequest,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update Driver Account Status (Admin Only)
    
    Allows admin to change the status of a driver.
    Valid statuses: ONLINE, OFFLINE, DRIVING, BLOCKED, PROCESSING
    
    Requires admin authentication.
    
    Returns:
        - Success message
        - Driver ID
        - New driver status
    """
    try:
        updated_driver = update_driver_account_status(db, str(driver_id), status_update.account_status)
        return StatusUpdateResponse(
            message="Driver status updated successfully",
            id=updated_driver.id,
            new_status=updated_driver.driver_status.value
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.patch("/admin/drivers/{driver_id}/document-status", response_model=StatusUpdateResponse)
def update_driver_document_status_route(
    driver_id: UUID,
    status_update: UpdateDocumentStatusRequest,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update Driver Document Status (Admin Only)
    
    Allows admin to change the document verification status of a driver's license.
    Valid statuses: PENDING, VERIFIED, INVALID
    
    Requires admin authentication.
    
    Returns:
        - Success message
        - Driver ID
        - New document status
    """
    try:
        doc_status = DocumentStatusEnum[status_update.document_status.upper()]
        updated_driver = update_driver_document_status(db, str(driver_id), doc_status)
        return StatusUpdateResponse(
            message="Driver document status updated successfully",
            id=updated_driver.id,
            new_status=updated_driver.licence_front_status.value
        )
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document status. Must be one of: PENDING, VERIFIED, INVALID"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

# ============ DOCUMENT VERIFICATION ENDPOINTS ============

@router.get("/admin/accounts/{account_id}/documents", response_model=AccountDocumentsResponse)
def get_account_documents(
    account_id: UUID,
    account_type: str = Query(..., description="Account type: vendor, vehicle_owner, driver, or quickdriver"),
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get All Documents for an Account (Admin Only)
    
    Returns all documents uploaded by an account:
    - Account documents (Aadhar for vendors/fleet owners, License for drivers)
    - Car documents (if fleet owner: RC front/back, Insurance, FC, Car Image, Permit)
    
    Each document includes:
    - Document ID (for updating status)
    - Document type and name
    - Image URL (signed URL)
    - Current status (PENDING, VERIFIED, INVALID)
    - Upload date
    - Car information (for car documents)
    
    Requires admin authentication.
    
    Returns:
        - All account documents
        - All car documents (if fleet owner)
        - Document counts (total, pending, verified, invalid)
    """
    try:
        documents_data = get_all_account_documents(db, str(account_id), account_type)
        
        if not documents_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Account not found with ID {account_id} and type {account_type}"
            )
        
        # Convert to DocumentItem objects
        account_docs = [
            DocumentItem(**doc) for doc in documents_data["account_documents"]
        ]
        car_docs = [
            DocumentItem(**doc) for doc in documents_data["car_documents"]
        ]
        
        return AccountDocumentsResponse(
            account_id=UUID(documents_data["account_id"]),
            account_type=documents_data["account_type"],
            account_name=documents_data["account_name"],
            account_documents=account_docs,
            car_documents=car_docs,
            total_documents=documents_data["total_documents"],
            pending_count=documents_data["pending_count"],
            verified_count=documents_data["verified_count"],
            invalid_count=documents_data["invalid_count"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.patch("/admin/accounts/{account_id}/documents/{document_id}/status", response_model=DocumentStatusUpdateResponse)
def update_document_status(
    account_id: UUID,
    document_id: str,
    account_type: str = Query(..., description="Account type: vendor, vehicle_owner, driver, or quickdriver"),
    status: str = Query(..., description="New status: PENDING, VERIFIED, or INVALID"),
    reason: Optional[str] = Query(None, description="Why the document was rejected (only meaningful when status=INVALID) - sent to the account holder as a notification"),
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update Document Status (Admin Only)

    Updates the verification status of a specific document.

    Document ID formats:
    - Account documents: "account_aadhar", "account_licence"
    - Car documents: "car_{car_id}_{doc_type}" (e.g., "car_123_rc_front")

    Valid statuses:
    - PENDING: Document is pending verification
    - VERIFIED: Document is verified and accepted
    - INVALID: Document is invalid/rejected (optionally pass `reason` to
      tell the account holder why, via an in-app + push notification)

    Requires admin authentication.

    Returns:
        - Success message
        - Document ID
        - Document type
        - New status
    """
    try:
        result = update_document_status_by_id(
            db=db,
            account_id=str(account_id),
            account_type=account_type,
            document_id=document_id,
            new_status=status,
            reason=reason,
        )
        
        return DocumentStatusUpdateResponse(
            message=result["message"],
            document_id=result["document_id"],
            document_type=result["document_type"],
            new_status=result["new_status"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.patch("/admin/accounts/{account_id}/documents/{document_id}/expiry")
def update_document_expiry(
    account_id: UUID,
    document_id: str,
    expiry_date: Optional[str] = Query(None, description="YYYY-MM-DD, or omit to clear"),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Set the expiry date on an RC or Insurance document (document_id
    "car_{car_id}_rc_front" or "car_{car_id}_insurance") - feeds the daily
    expiry-reminder sweep. For a driver's licence, use the
    /admin/drivers/{driver_id}/licence-expiry endpoint instead, since a
    driver's document_id has no id embedded in it.
    """
    from datetime import date as _date
    parsed = _date.fromisoformat(expiry_date) if expiry_date else None
    try:
        result = update_document_expiry_date(db=db, document_id=document_id, expiry_date=parsed)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {str(e)}")


from pydantic import BaseModel as _ExecutedPlatformBaseModel


class ExecutedPlatformUpdate(_ExecutedPlatformBaseModel):
    executed_platform: str


@router.patch("/admin/orders/{order_id}/executed-platform")
def update_order_executed_platform(
    order_id: int,
    body: ExecutedPlatformUpdate,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin override for which platform/app a booking was actually
    executed on - see orders.py's executed_platform column comment. Every
    order is auto-stamped "Drop Cars App" at creation; this lets staff
    correct it for a manually-logged booking that was actually fulfilled
    through a different channel."""
    from app.models.orders import Order

    value = body.executed_platform.strip()
    if not value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="executed_platform cannot be empty")

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order not found with ID {order_id}")

    order.executed_platform = value
    db.commit()
    return {"order_id": order_id, "executed_platform": value}


@router.patch("/admin/drivers/{driver_id}/licence-expiry")
def update_driver_licence_expiry(
    driver_id: UUID,
    expiry_date: Optional[str] = Query(None, description="YYYY-MM-DD, or omit to clear"),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Set a driver's licence expiry date - feeds the daily expiry-reminder sweep."""
    from datetime import date as _date
    parsed = _date.fromisoformat(expiry_date) if expiry_date else None
    try:
        result = update_driver_licence_expiry_date(db=db, driver_id=str(driver_id), expiry_date=parsed)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {str(e)}")


class PermanentBlockRequest(_StaffBaseModel):
    reason: str


@router.post("/admin/accounts/{account_id}/permanent-block")
def permanent_block_account(
    account_id: UUID,
    body: PermanentBlockRequest,
    account_type: str = Query(..., description="Account type: vendor, vehicle_owner, driver, or quickdriver"),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Permanent block for confirmed fraud (e.g. fake documents) - distinct
    from the everyday Active/Inactive toggle, which stays available and
    unaffected. Forces the account Inactive/BLOCKED at the same time."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can permanently block an account.")
    from app.crud.admin_management import set_permanent_block
    from app.crud.admin_activity_log import log_admin_action, resolve_account_display_name
    result = set_permanent_block(db, str(account_id), account_type, body.reason, blocked=True)
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="PERMANENT_BLOCK", target_type=account_type, target_id=str(account_id),
        target_name=resolve_account_display_name(db, account_type, str(account_id)),
        details={"reason": body.reason},
    )
    return result


@router.post("/admin/accounts/{account_id}/permanent-unblock")
def permanent_unblock_account(
    account_id: UUID,
    account_type: str = Query(..., description="Account type: vendor, vehicle_owner, driver, or quickdriver"),
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Reverses a permanent block (e.g. it was set in error). Does not
    automatically reactivate the account - the admin still does that
    separately via the normal status toggle."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can remove a permanent block.")
    from app.crud.admin_management import set_permanent_block
    from app.crud.admin_activity_log import log_admin_action, resolve_account_display_name
    result = set_permanent_block(db, str(account_id), account_type, "", blocked=False)
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="PERMANENT_UNBLOCK", target_type=account_type, target_id=str(account_id),
        target_name=resolve_account_display_name(db, account_type, str(account_id)),
    )
    return result


# ============ TRUSTED PARTNER MANUAL OVERRIDE ============

class TrustedPartnerOverrideRequest(BaseModel):
    trusted: bool
    reason: Optional[str] = None


@router.patch("/admin/vehicle-owners/{vehicle_owner_id}/trusted-override")
def set_trusted_partner_override(
    vehicle_owner_id: UUID,
    body: TrustedPartnerOverrideRequest,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Manually mark/unmark a fleet owner as a Trusted Partner
    (admin_trusted_override), independent of the yearly-billing evidence and
    the driver Pro-subscription path (see VehicleOwnerDetails.tier).
    Restricted to Owner + staff explicitly granted
    'trusted_partner_management' - Trusted Partner unlocks posting bookings
    to the whole driver network and holding customer advances."""
    require_trusted_partner_permission(current_admin)

    from datetime import datetime as _datetime, timezone as _timezone
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    owner_details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).first()
    if not owner_details:
        raise HTTPException(status_code=404, detail="Fleet owner not found")

    updater_name = getattr(current_admin, "username", None) or getattr(current_admin, "full_name", None) or f"Admin ({getattr(current_admin, 'role', 'Staff')})"
    clean_reason = (body.reason or "").strip() or ("Manual override to Trusted Partner" if body.trusted else "Manual override to Standard Partner")

    owner_details.admin_trusted_override = body.trusted
    owner_details.trusted_override_by = updater_name
    owner_details.trusted_override_reason = clean_reason
    owner_details.trusted_override_at = _datetime.now(_timezone.utc)
    db.commit()

    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="TRUSTED_PARTNER_OVERRIDE_SET", target_type="vehicle_owner", target_id=str(vehicle_owner_id),
        target_name=owner_details.full_name, details={
            "trusted": body.trusted,
            "reason": clean_reason,
            "updated_by": updater_name,
        },
    )

    return {
        "success": True,
        "vehicle_owner_id": str(vehicle_owner_id),
        "tier": owner_details.tier,
        "admin_trusted_override": owner_details.admin_trusted_override,
        "trusted_override_by": owner_details.trusted_override_by,
        "trusted_override_reason": owner_details.trusted_override_reason,
        "trusted_override_at": owner_details.trusted_override_at,
    }


# ============ UNIFIED ACCOUNT STATUS UPDATE ============

@router.patch("/admin/accounts/{account_id}/status", response_model=StatusUpdateResponse)
def update_account_status_unified(
    account_id: UUID,
    account_type: str = Query(..., description="Account type: vendor, vehicle_owner, driver, or quickdriver"),
    status_param: Optional[str] = Query(None, alias="status", description="New status (can also be sent in body)"),
    status_update: Optional[UpdateAccountStatusRequest] = None,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Update Account Status (Admin Only) - Unified Endpoint
    
    Updates the account status for any account type (vendor, fleet owner, or driver).
    
    You can send the status either as:
    - Query parameter: ?status=Active
    - Request body: { "account_status": "Active" }
    
    Valid statuses for Vendors & Fleet Owners:
    - Active: Account is active and can use the system
    - Inactive: Account is inactive and cannot use the system
    - Pending: Account is pending approval
    
    Valid statuses for Drivers:
    - ONLINE: Driver is online and available
    - OFFLINE: Driver is offline
    - DRIVING: Driver is currently on a trip
    - BLOCKED: Driver is blocked
    - PROCESSING: Driver account is being processed
    
    Requires admin authentication.
    
    Returns:
        - Success message
        - Account ID
        - New account status
    """
    try:
        # Get status from query parameter or request body
        if status_param:
            new_status = status_param
        elif status_update and status_update.account_status:
            new_status = status_update.account_status
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status is required. Provide it either as query parameter 'status' or in request body as 'account_status'"
            )
        
        result = update_unified_account_status(
            db=db,
            account_id=str(account_id),
            account_type=account_type,
            new_status=new_status
        )

        from app.crud.admin_activity_log import log_admin_action, resolve_account_display_name
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="ACCOUNT_STATUS_CHANGE", target_type=account_type, target_id=str(account_id),
            target_name=resolve_account_display_name(db, account_type, str(account_id)),
            details={"new_status": result.get("new_status")},
        )

        # Convert id to UUID if it's a string, otherwise use as-is (it might already be a UUID)
        result_id = result["id"]
        if isinstance(result_id, UUID):
            # Already a UUID, use it directly
            pass
        elif isinstance(result_id, str):
            result_id = UUID(result_id)
        else:
            result_id = UUID(str(result_id))
        
        return StatusUpdateResponse(
            message=result["message"],
            id=result_id,
            new_status=result["new_status"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


from pydantic import BaseModel as _BulkBaseModel


class BulkAccountStatusItem(_BulkBaseModel):
    account_id: UUID
    account_type: str  # vendor, vehicle_owner, driver, quickdriver
    # Per-item override - needed because "Active" means different things per
    # type (vendor/vehicle_owner: "Active", driver/quickdriver: "ONLINE").
    # Falls back to the request-level account_status if not given.
    account_status: Optional[str] = None


class BulkAccountStatusRequest(_BulkBaseModel):
    accounts: List[BulkAccountStatusItem]
    account_status: str


@router.post("/admin/accounts/bulk-status")
def update_account_status_bulk(
    body: BulkAccountStatusRequest,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Bulk Activate/Deactivate (Admin Only) - applies a status to many
    accounts of possibly-mixed types in a single call, reusing the same
    per-account logic as the single-account unified endpoint above. Each
    account is updated independently - one bad id/type doesn't abort the
    rest, it's just reported in `failed`.
    """
    updated: list[dict] = []
    failed: list[dict] = []
    for item in body.accounts:
        try:
            result = update_unified_account_status(
                db=db,
                account_id=str(item.account_id),
                account_type=item.account_type,
                new_status=item.account_status or body.account_status,
            )
            updated.append({"id": str(item.account_id), "account_type": result["account_type"], "new_status": result["new_status"]})
        except HTTPException as e:
            failed.append({"id": str(item.account_id), "error": e.detail})
        except Exception as e:
            failed.append({"id": str(item.account_id), "error": str(e)})

    return {"updated": updated, "failed": failed, "updated_count": len(updated), "failed_count": len(failed)}


@router.post("/admin/search-user/reset-password",response_model=UserPasswordUpdateResponse, status_code=status.HTTP_200_OK)
def search_user_reset_password(
    search_request: UserPasswordUpdate,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Search User by Primary Number
    
    Searches for a user by their primary phone number.
    Returns user information including profile details.
    
    Requires admin authentication.
    
    Returns:
        - User information
        - Profile details
    """
    try:
        print(search_request.role,search_request.id)
        user_info = reset_password_by_id(db, search_request.role, search_request.id, search_request.password)
        return UserPasswordUpdateResponse(**user_info)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/admin/vacant-cities")
def admin_get_vacant_city_updates(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Admin view of Vacant City updates: full details including who (name + phone)."""
    import traceback
    from app.models.vehicle_owner_details import VehicleOwnerDetails

    try:
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        cutoff_24h = now - timedelta(hours=24)

        # Auto cleanup stale vacant records in DB
        try:
            db.query(VehicleOwnerDetails).filter(
                VehicleOwnerDetails.vacant_cities.isnot(None),
                (
                    VehicleOwnerDetails.vacant_cities_updated_at.is_(None)
                    | (VehicleOwnerDetails.vacant_cities_updated_at < cutoff_24h)
                )
            ).update({
                VehicleOwnerDetails.vacant_cities: None,
                VehicleOwnerDetails.vacant_cities_updated_at: None,
                VehicleOwnerDetails.vacant_driver_id: None,
                VehicleOwnerDetails.vacant_driver_name: None,
                VehicleOwnerDetails.vacant_car_id: None,
                VehicleOwnerDetails.vacant_car_number: None,
            }, synchronize_session=False)
            db.commit()
        except Exception:
            db.rollback()

        owners = db.query(VehicleOwnerDetails).filter(
            VehicleOwnerDetails.vacant_cities.isnot(None),
            VehicleOwnerDetails.vacant_cities_updated_at.isnot(None),
            VehicleOwnerDetails.vacant_cities_updated_at >= cutoff_24h,
        ).all()

        results = []
        for o in owners:
            fleet_entries = list(getattr(o, "vacant_fleet_entries", None) or [])
            if fleet_entries:
                for fe in fleet_entries:
                    cities = fe.get("cities") or []
                    if not cities:
                        continue
                    up_str = fe.get("updated_at")
                    up_dt = None
                    if up_str:
                        try:
                            up_dt = datetime.fromisoformat(str(up_str).replace('Z', '+00:00'))
                            if up_dt.tzinfo is None:
                                up_dt = up_dt.replace(tzinfo=timezone.utc)
                            if up_dt < cutoff_24h:
                                continue
                        except Exception:
                            pass
                    results.append({
                        "vehicle_owner_id": str(o.vehicle_owner_id),
                        "full_name": o.full_name,
                        "primary_number": o.primary_number,
                        "cities": cities,
                        "driver_id": fe.get("driver_id"),
                        "driver_name": fe.get("driver_name") or "Owner / Self",
                        "car_id": fe.get("car_id"),
                        "car_number": fe.get("car_number") or getattr(o, "vacant_car_number", None),
                        "car_type": fe.get("car_type"),
                        "updated_at": (up_dt or o.vacant_cities_updated_at).isoformat() if (up_dt or o.vacant_cities_updated_at) else None,
                    })
            else:
                if not o.vacant_cities or len(o.vacant_cities) == 0:
                    continue
                updated_at = o.vacant_cities_updated_at
                if not updated_at:
                    continue
                if updated_at.tzinfo is None:
                    updated_at = updated_at.replace(tzinfo=timezone.utc)
                if updated_at < cutoff_24h:
                    continue

                results.append({
                    "vehicle_owner_id": str(o.vehicle_owner_id),
                    "full_name": o.full_name,
                    "primary_number": o.primary_number,
                    "cities": o.vacant_cities,
                    "driver_id": getattr(o, "vacant_driver_id", None),
                    "driver_name": getattr(o, "vacant_driver_name", None) or "Owner / Self",
                    "car_id": getattr(o, "vacant_car_id", None),
                    "car_number": getattr(o, "vacant_car_number", None),
                    "car_type": None,
                    "updated_at": updated_at.isoformat(),
                })
        return results
    except Exception:
        print(f"admin_get_vacant_city_updates failed:\n{traceback.format_exc()}")
        raise


# --- Admin: remove accounts (dedupe duplicates) ---

@router.delete("/admin/accounts/{account_id}")
def admin_remove_account(
    account_id: str,
    account_type: str = Query(..., description="vendor | vehicle_owner | driver | quickdriver | car"),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Permanently remove a vendor, fleet owner, driver, or car record. Used to clean up duplicates."""
    if current_admin.role != "Owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the Owner can permanently remove an account.")

    from uuid import UUID as _UUID

    model_map = {
        "vendor": ("app.models.vendor", "VendorCredentials"),
        "vehicle_owner": ("app.models.vehicle_owner", "VehicleOwnerCredentials"),
        "driver": ("app.models.car_driver", "CarDriver"),
        "quickdriver": ("app.models.car_driver", "CarDriver"),
        "car": ("app.models.car_details", "CarDetails"),
        "customer": ("app.models.customer", "CustomerCredentials"),
    }
    if account_type not in model_map:
        raise HTTPException(status_code=400, detail=f"Unknown account_type: {account_type}")

    module_path, class_name = model_map[account_type]
    import importlib
    module = importlib.import_module(module_path)
    model_cls = getattr(module, class_name)

    try:
        record_id = _UUID(account_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid account_id format")

    record = db.query(model_cls).filter(model_cls.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"{account_type} not found")

    try:
        primary_num = getattr(record, "primary_number", None)

        # 1. Clean up dependencies based on account type
        if account_type == "vendor":
            from app.models.vendor_details import VendorDetails
            from app.models.wallet_ledger import WalletLedger
            from app.models.vendor_wallet_ledger import VendorWalletLedger
            from app.models.payout_request import PayoutRequest
            from app.models.order_assignments import OrderAssignment
            from app.models.orders import Order
            from app.models.razorpay_transactions import RazorpayTransaction
            from app.models.notification_log import NotificationLog
            from app.models.phone_otp import PhoneOTP
            from app.models.email_otp import EmailOTP

            db.query(VendorDetails).filter(VendorDetails.vendor_id == record_id).delete(synchronize_session=False)
            try:
                db.query(VendorWalletLedger).filter(VendorWalletLedger.vendor_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(WalletLedger).filter(WalletLedger.vendor_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(PayoutRequest).filter(PayoutRequest.vendor_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(OrderAssignment).filter(OrderAssignment.vendor_id == record_id).update({OrderAssignment.vendor_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(Order).filter(Order.vendor_id == record_id).update({Order.vendor_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(RazorpayTransaction).filter(RazorpayTransaction.vendor_id == record_id).update({RazorpayTransaction.vendor_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(NotificationLog).filter(NotificationLog.user_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            if primary_num:
                try:
                    db.query(PhoneOTP).filter(PhoneOTP.phone_number == primary_num).delete(synchronize_session=False)
                    db.query(EmailOTP).filter(EmailOTP.phone_number == primary_num).delete(synchronize_session=False)
                except Exception:
                    pass

        elif account_type == "vehicle_owner":
            from app.models.vehicle_owner_details import VehicleOwnerDetails
            from app.models.wallet_ledger import WalletLedger
            from app.models.admin_add_money_to_vehicle_owner import AdminAddMoneyToVehicleOwner
            from app.models.payout_request import PayoutRequest
            from app.models.drop_bid import DropBid
            from app.models.carpool import Carpool
            from app.models.order_assignments import OrderAssignment
            from app.models.orders import Order
            from app.models.razorpay_transactions import RazorpayTransaction
            from app.models.trip_review import TripReview
            from app.models.car_driver import CarDriver
            from app.models.car_details import CarDetails
            from app.models.vehicle_matching import VehicleMatching
            from app.models.notification_log import NotificationLog
            from app.models.phone_otp import PhoneOTP
            from app.models.email_otp import EmailOTP

            db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == record_id).delete(synchronize_session=False)
            try:
                db.query(WalletLedger).filter(WalletLedger.vehicle_owner_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(AdminAddMoneyToVehicleOwner).filter(AdminAddMoneyToVehicleOwner.vehicle_owner_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(PayoutRequest).filter(PayoutRequest.vehicle_owner_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(DropBid).filter(DropBid.vehicle_owner_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(Carpool).filter(Carpool.vehicle_owner_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(OrderAssignment).filter(OrderAssignment.vehicle_owner_id == record_id).update({OrderAssignment.vehicle_owner_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(Order).filter(Order.vehicle_owner_id == record_id).update({Order.vehicle_owner_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(RazorpayTransaction).filter(RazorpayTransaction.vehicle_owner_id == record_id).update({RazorpayTransaction.vehicle_owner_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(TripReview).filter(TripReview.vehicle_owner_id == record_id).update({TripReview.vehicle_owner_id: None}, synchronize_session=False)
            except Exception:
                pass

            # Clean up cars associated with this vehicle owner
            try:
                car_ids = [c.id for c in db.query(CarDetails).filter(CarDetails.vehicle_owner_id == record_id).all()]
                if car_ids:
                    try:
                        db.query(VehicleMatching).filter(VehicleMatching.car_id.in_(car_ids)).delete(synchronize_session=False)
                    except Exception:
                        pass
                    try:
                        db.query(OrderAssignment).filter(OrderAssignment.car_id.in_(car_ids)).update({OrderAssignment.car_id: None}, synchronize_session=False)
                    except Exception:
                        pass
                    try:
                        db.query(Order).filter(Order.assigned_car_id.in_(car_ids)).update({Order.assigned_car_id: None}, synchronize_session=False)
                    except Exception:
                        pass
                    db.query(CarDetails).filter(CarDetails.vehicle_owner_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass

            # Clean up or unlink drivers under this vehicle owner
            try:
                driver_ids = [d.id for d in db.query(CarDriver).filter(CarDriver.vehicle_owner_id == record_id).all()]
                if driver_ids:
                    try:
                        db.query(OrderAssignment).filter(OrderAssignment.driver_id.in_(driver_ids)).update({OrderAssignment.driver_id: None}, synchronize_session=False)
                    except Exception:
                        pass
                    try:
                        db.query(Order).filter(Order.assigned_driver_id.in_(driver_ids)).update({Order.assigned_driver_id: None}, synchronize_session=False)
                    except Exception:
                        pass
                    try:
                        db.query(TripReview).filter(TripReview.driver_id.in_(driver_ids)).update({TripReview.driver_id: None}, synchronize_session=False)
                    except Exception:
                        pass
                    db.query(CarDriver).filter(CarDriver.vehicle_owner_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass

            try:
                db.query(NotificationLog).filter(NotificationLog.user_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            if primary_num:
                try:
                    db.query(PhoneOTP).filter(PhoneOTP.phone_number == primary_num).delete(synchronize_session=False)
                    db.query(EmailOTP).filter(EmailOTP.phone_number == primary_num).delete(synchronize_session=False)
                except Exception:
                    pass

        elif account_type == "customer":
            from app.models.customer_details import CustomerDetails
            from app.models.customer_booking_request import CustomerBookingRequest
            from app.models.customer_wallet_topup import CustomerWalletTopup
            from app.models.orders import Order
            from app.models.new_orders import NewOrder
            from app.models.razorpay_transactions import RazorpayTransaction
            from app.models.trip_review import TripReview
            from app.models.notification_log import NotificationLog
            from app.models.phone_otp import PhoneOTP
            from app.models.email_otp import EmailOTP

            db.query(CustomerDetails).filter(CustomerDetails.customer_id == record_id).delete(synchronize_session=False)
            try:
                db.query(CustomerBookingRequest).filter(CustomerBookingRequest.customer_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(CustomerWalletTopup).filter(CustomerWalletTopup.customer_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(Order).filter(Order.customer_id == record_id).update({Order.customer_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(NewOrder).filter(NewOrder.customer_id == record_id).update({NewOrder.customer_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(RazorpayTransaction).filter(RazorpayTransaction.customer_id == record_id).update({RazorpayTransaction.customer_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(TripReview).filter(TripReview.customer_id == record_id).update({TripReview.customer_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(NotificationLog).filter(NotificationLog.user_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            if primary_num:
                try:
                    db.query(PhoneOTP).filter(PhoneOTP.phone_number == primary_num).delete(synchronize_session=False)
                    db.query(EmailOTP).filter(EmailOTP.phone_number == primary_num).delete(synchronize_session=False)
                except Exception:
                    pass

        elif account_type in ("driver", "quickdriver"):
            from app.models.order_assignments import OrderAssignment
            from app.models.orders import Order
            from app.models.trip_review import TripReview
            from app.models.driver_route_request import DriverRouteRequest
            from app.models.notification_log import NotificationLog
            from app.models.phone_otp import PhoneOTP
            from app.models.email_otp import EmailOTP

            try:
                db.query(OrderAssignment).filter(OrderAssignment.driver_id == record_id).update({OrderAssignment.driver_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(Order).filter(Order.assigned_driver_id == record_id).update({Order.assigned_driver_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(TripReview).filter(TripReview.driver_id == record_id).update({TripReview.driver_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(DriverRouteRequest).filter(DriverRouteRequest.driver_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(NotificationLog).filter(NotificationLog.user_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            if primary_num:
                try:
                    db.query(PhoneOTP).filter(PhoneOTP.phone_number == primary_num).delete(synchronize_session=False)
                    db.query(EmailOTP).filter(EmailOTP.phone_number == primary_num).delete(synchronize_session=False)
                except Exception:
                    pass

        elif account_type == "car":
            from app.models.vehicle_matching import VehicleMatching
            from app.models.order_assignments import OrderAssignment
            from app.models.orders import Order

            try:
                db.query(VehicleMatching).filter(VehicleMatching.car_id == record_id).delete(synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(OrderAssignment).filter(OrderAssignment.car_id == record_id).update({OrderAssignment.car_id: None}, synchronize_session=False)
            except Exception:
                pass
            try:
                db.query(Order).filter(Order.assigned_car_id == record_id).update({Order.assigned_car_id: None}, synchronize_session=False)
            except Exception:
                pass

        record_name = getattr(record, "full_name", None) or getattr(record, "car_name", None)
        db.delete(record)
        db.commit()

        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="ACCOUNT_DELETED", target_type=account_type, target_id=account_id, target_name=record_name,
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        err_text = str(e)
        raise HTTPException(status_code=500, detail=f"Could not remove account: {err_text[:200]}")

    return {"message": f"{account_type} removed successfully", "id": account_id}


# --- Admin: manual wallet adjustment (owner + vendor, credit + debit) ---

from pydantic import BaseModel
from app.crud.admin_wallet_adjust import search_wallet_target, search_wallet_targets, adjust_wallet, get_vehicle_owner_ledger, get_vendor_ledger


class WalletSearchRequest(BaseModel):
    role: str  # 'vehicle_owner' | 'vendor'
    primary_number: str


class WalletAdjustRequest(BaseModel):
    role: str        # 'vehicle_owner' | 'vendor'
    target_id: str
    direction: str   # 'credit' | 'debit'
    amount: int      # whole rupees, positive
    notes: Optional[str] = None


@router.post("/admin/wallet/search")
def admin_wallet_search(
    body: WalletSearchRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Find a fleet owner or vendor by phone number for manual wallet editing."""
    return search_wallet_target(db, body.role, body.primary_number.strip())


@router.get("/admin/wallet/search-list")
def admin_wallet_search_list(
    role: str = Query(..., description="'vehicle_owner' or 'vendor'"),
    query: str = Query(..., min_length=2, description="Partial phone number or name - as few as 2-4 characters"),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Partial-match search for the wallet screen, returning a candidate
    list to pick from - see search_wallet_targets for why this replaces the
    old exact-10-digit-only lookup."""
    return {"results": search_wallet_targets(db, role, query)}


@router.post("/admin/wallet/adjust")
def admin_wallet_adjust(
    body: WalletAdjustRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Manually credit or debit a fleet owner or vendor wallet."""
    require_payment_release_permission(current_admin)
    try:
        result = adjust_wallet(
            db,
            role=body.role,
            target_id=body.target_id,
            direction=body.direction,
            amount=body.amount,
            notes=body.notes,
        )
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="WALLET_ADJUST", target_type=body.role, target_id=body.target_id, target_name=result.get("target_name"),
            details={"direction": body.direction, "amount": body.amount, "notes": body.notes},
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Wallet adjustment failed: {str(e)}")


def _serialize_ledger_row(row) -> dict:
    return {
        "id": str(row.id),
        "order_id": row.order_id if getattr(row, "order_id", None) else None,
        "entry_type": row.entry_type.value if hasattr(row.entry_type, "value") else row.entry_type,
        "amount": row.amount,
        "balance_before": row.balance_before,
        "balance_after": row.balance_after,
        "notes": row.notes,
        "reference_type": getattr(row, "reference_type", None),
        "created_at": row.created_at,
    }


@router.get("/admin/wallet/ledger/vehicle-owner/{vehicle_owner_id}")
def admin_vehicle_owner_ledger(
    vehicle_owner_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Full transaction history (every credit/debit/refund) for one fleet owner."""
    rows, total_count = get_vehicle_owner_ledger(db, vehicle_owner_id, skip=skip, limit=limit)
    return {
        "entries": [_serialize_ledger_row(r) for r in rows],
        "total_count": total_count,
    }


@router.get("/admin/wallet/ledger/vendor/{vendor_id}")
def admin_vendor_ledger(
    vendor_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Full transaction history (every credit/debit/refund) for one vendor."""
    rows, total_count = get_vendor_ledger(db, vendor_id, skip=skip, limit=limit)
    return {
        "entries": [_serialize_ledger_row(r) for r in rows],
        "total_count": total_count,
    }


# --- Admin: yearly-fee billing automation ---

from app.crud.billing import (
    get_billing_settings, update_billing_settings, run_billing, start_billing_cycle,
)


class BillingSettingsUpdate(BaseModel):
    billing_enabled: Optional[bool] = None
    yearly_fee: Optional[int] = None
    monthly_fee: Optional[int] = None
    suspend_threshold: Optional[int] = None
    monthly_min_wallet_floor: Optional[int] = None


class ResetYearlyCycleBody(BaseModel):
    start_date: Optional[str] = None      # YYYY-MM-DD, default = tomorrow
    dry_run: bool = True                  # True = only preview
    include_lapsed: bool = True           # also members whose year already ran out


@router.post("/admin/billing/reset-yearly-cycle")
def admin_reset_yearly_cycle(
    body: ResetYearlyCycleBody,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Owner only. Restart the yearly period of every member who has paid (preview first with dry_run=true)."""
    require_owner(current_admin)
    from datetime import date as _date
    from app.crud.billing import reset_yearly_cycle
    start = None
    if body.start_date:
        try:
            start = _date.fromisoformat(body.start_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="start_date must be YYYY-MM-DD")
    return reset_yearly_cycle(db, start_date=start, dry_run=body.dry_run, include_lapsed=body.include_lapsed)


@router.get("/admin/billing/settings")
def admin_get_billing_settings(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Current billing configuration (fee, suspend threshold, master switch)."""
    return get_billing_settings(db)


@router.put("/admin/billing/settings")
def admin_update_billing_settings(
    body: BillingSettingsUpdate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Update billing configuration. Turning billing_enabled on activates the daily sweep."""
    return update_billing_settings(
        db,
        billing_enabled=body.billing_enabled,
        yearly_fee=body.yearly_fee,
        monthly_fee=body.monthly_fee,
        suspend_threshold=body.suspend_threshold,
        monthly_min_wallet_floor=body.monthly_min_wallet_floor,
    )


# --- Admin: referral bonus amount ---

@router.get("/admin/referral-settings")
def admin_get_referral_settings(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.crud.referrals import get_referral_bonus_amount
    return {"referral_bonus_amount": get_referral_bonus_amount(db)}


@router.put("/admin/referral-settings")
def admin_update_referral_settings(
    body: dict,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.crud.referrals import set_referral_bonus_amount
    amount = set_referral_bonus_amount(db, int(body.get("referral_bonus_amount", 0)))
    return {"referral_bonus_amount": amount}


@router.get("/admin/referral-history")
def admin_get_referral_history(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Who referred whom and how much has been paid out - the referral bonus
    *amount* has been configurable for a while (see referral-settings above),
    but there was no way to see the actual payout history. Every referral
    payout is a wallet_ledger row tagged REFERRAL_BONUS (driver referred a
    driver) or CUSTOMER_REFERRAL_BONUS (driver referred a customer) - see
    crud/referrals.py's credit_*_if_eligible functions, which already bake a
    human-readable "who" into `notes`."""
    from app.models.wallet_ledger import WalletLedger
    from app.models.vehicle_owner import VehicleOwnerCredentials

    query = (
        db.query(WalletLedger, VehicleOwnerCredentials)
        .join(VehicleOwnerCredentials, WalletLedger.vehicle_owner_id == VehicleOwnerCredentials.id)
        .filter(WalletLedger.reference_type.in_(["REFERRAL_BONUS", "CUSTOMER_REFERRAL_BONUS"]))
        .order_by(WalletLedger.created_at.desc())
    )
    total = query.count()
    rows = query.offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [
            {
                "id": str(ledger.id),
                "type": ledger.reference_type,
                "referrer_reg_id": referrer.reg_id,
                "referrer_phone": referrer.primary_number,
                "amount": ledger.amount,
                "notes": ledger.notes,
                "created_at": ledger.created_at,
            }
            for ledger, referrer in rows
        ],
    }


# --- Admin: cash-mismatch audit ---

@router.get("/admin/cash-audit/settings")
def admin_get_cash_audit_settings(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.crud.cash_audit import get_cash_mismatch_threshold
    return {"cash_mismatch_threshold": get_cash_mismatch_threshold(db)}


@router.put("/admin/cash-audit/settings")
def admin_update_cash_audit_settings(
    body: dict,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.crud.cash_audit import set_cash_mismatch_threshold
    threshold = set_cash_mismatch_threshold(db, int(body.get("cash_mismatch_threshold", 0)))
    return {"cash_mismatch_threshold": threshold}


@router.get("/admin/cash-audit/flagged")
def admin_get_flagged_trips(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.crud.cash_audit import get_flagged_trips
    return get_flagged_trips(db)


@router.put("/admin/cash-audit/{end_record_id}/clear")
def admin_clear_cash_flag(
    end_record_id: int,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.crud.cash_audit import clear_flag
    clear_flag(db, end_record_id)
    return {"message": "Flag cleared"}


# --- Admin: analytics dashboard ---

@router.get("/admin/analytics/summary")
def admin_analytics_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.crud.analytics import get_dashboard_summary
    return get_dashboard_summary(db, date_from, date_to)


@router.get("/admin/dashboard/needs-attention")
def admin_needs_attention_summary(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Counts for the Dashboard "Needs Attention" widget - staff previously
    had to visit each tab separately to see whether anything was waiting on
    them. Now also covers new-account activation review and pending
    document review (new uploads AND re-uploads after a rejection both sit
    as PENDING, so one count covers both cases)."""
    from app.models.payout_request import PayoutRequest, PayoutRequestStatusEnum
    from app.models.customer_booking_request import CustomerBookingRequest
    from app.models.vendor import VendorCredentials, AccountStatusEnum as VendorAccountStatusEnum
    from app.models.vehicle_owner import VehicleOwnerCredentials, AccountStatusEnum as VehicleOwnerAccountStatusEnum
    from app.models.vendor_details import VendorDetails
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.car_details import CarDetails
    from app.models.car_driver import CarDriver

    pending_payout_requests = db.query(PayoutRequest).filter(
        PayoutRequest.status == PayoutRequestStatusEnum.PENDING
    ).count()
    pending_refund_requests = db.query(CustomerBookingRequest).filter(
        CustomerBookingRequest.refund_status == "REQUESTED"
    ).count()
    pending_website_bookings = db.query(CustomerBookingRequest).filter(
        CustomerBookingRequest.status == "PENDING"
    ).count()

    pending_account_activations = (
        db.query(VendorCredentials).filter(VendorCredentials.account_status == VendorAccountStatusEnum.PENDING).count()
        + db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.account_status == VehicleOwnerAccountStatusEnum.PENDING).count()
    )

    PENDING = DocumentStatusEnum.PENDING
    NEEDS_REVIEW = DocumentStatusEnum.NEEDS_REVIEW
    pending_document_reviews = (
        db.query(VendorDetails).filter(VendorDetails.aadhar_status.in_([PENDING, NEEDS_REVIEW])).count()
        + db.query(VehicleOwnerDetails).filter(
            (VehicleOwnerDetails.aadhar_status.in_([PENDING, NEEDS_REVIEW]))
            | (VehicleOwnerDetails.aadhar_back_status.in_([PENDING, NEEDS_REVIEW]))
            | (VehicleOwnerDetails.pan_status.in_([PENDING, NEEDS_REVIEW]))
        ).count()
        + db.query(CarDetails).filter(
            (CarDetails.rc_front_status.in_([PENDING, NEEDS_REVIEW]))
            | (CarDetails.rc_back_status.in_([PENDING, NEEDS_REVIEW]))
            | (CarDetails.insurance_status.in_([PENDING, NEEDS_REVIEW]))
            | (CarDetails.permit_status.in_([PENDING, NEEDS_REVIEW]))
        ).count()
        + db.query(CarDriver).filter(
            (CarDriver.licence_front_status.in_([PENDING, NEEDS_REVIEW])) | (CarDriver.licence_back_status.in_([PENDING, NEEDS_REVIEW]))
        ).count()
    )

    total = (
        pending_payout_requests + pending_refund_requests + pending_website_bookings
        + pending_account_activations + pending_document_reviews
    )

    return {
        "pending_payout_requests": pending_payout_requests,
        "pending_refund_requests": pending_refund_requests,
        "pending_website_bookings": pending_website_bookings,
        "pending_account_activations": pending_account_activations,
        "pending_document_reviews": pending_document_reviews,
        "total": total,
    }


@router.get("/admin/fleet-hub/counts")
def admin_fleet_hub_counts(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Fleet Hub category-card counts + a "Fleet Reports" block (live fleet
    status, wallet health, ratings, billing risk, 7-day revenue trend) -
    all real numbers now. Was a route the frontend called and silently
    fell back to hardcoded placeholder numbers (142/3157/892/64) for every
    single admin, on every load, since this endpoint never actually
    existed on the backend - found 2026-09-05 while building the
    Fleet-section reports the Owner asked for."""
    from datetime import date as date_cls, timedelta
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.vendor import VendorCredentials
    from app.models.vendor_details import VendorDetails
    from app.models.car_details import CarDetails
    from app.models.car_driver import CarDriver, AccountStatusEnum as DriverStatusEnum
    from app.models.orders import Order
    from app.models.end_records import EndRecord
    from sqlalchemy import func as sa_func

    fleet_owners_total = db.query(VehicleOwnerCredentials).count()
    drivers_total = db.query(CarDriver).count()
    cars_total = db.query(CarDetails).count()
    vendors_total = db.query(VendorCredentials).count()

    drivers_online = db.query(CarDriver).filter(
        CarDriver.driver_status.in_([DriverStatusEnum.ONLINE, DriverStatusEnum.DRIVING])
    ).count()
    drivers_driving = db.query(CarDriver).filter(CarDriver.driver_status == DriverStatusEnum.DRIVING).count()

    VERIFIED = DocumentStatusEnum.VERIFIED
    PENDING_DOC = DocumentStatusEnum.PENDING
    cars_verified = db.query(CarDetails).filter(
        CarDetails.rc_front_status == VERIFIED,
        CarDetails.insurance_status == VERIFIED,
        CarDetails.permit_status == VERIFIED,
    ).count()
    # Fleet-only slice of the Dashboard's wider pending-document-review
    # count (that one also covers vendor/owner KYC) - cars + drivers only,
    # since this lives on the Fleet screen specifically.
    pending_fleet_doc_reviews = (
        db.query(CarDetails).filter(
            (CarDetails.rc_front_status == PENDING_DOC)
            | (CarDetails.rc_back_status == PENDING_DOC)
            | (CarDetails.insurance_status == PENDING_DOC)
            | (CarDetails.permit_status == PENDING_DOC)
        ).count()
        + db.query(CarDriver).filter(
            (CarDriver.licence_front_status == PENDING_DOC) | (CarDriver.licence_back_status == PENDING_DOC)
        ).count()
    )

    owner_wallet_total = db.query(sa_func.coalesce(sa_func.sum(VehicleOwnerDetails.wallet_balance), 0)).scalar() or 0
    vendor_wallet_total = db.query(sa_func.coalesce(sa_func.sum(VendorDetails.wallet_balance), 0)).scalar() or 0
    # Strictly negative, not <= 0 - most owners simply haven't funded their
    # wallet yet (sits at the 0 default), which isn't "at risk", just
    # unfunded. Negative means real debt (e.g. a manual debit adjustment
    # exceeded their balance) - that's the actionable signal here.
    owners_wallet_at_risk = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.wallet_balance < 0).count()

    avg_driver_rating = db.query(sa_func.coalesce(sa_func.avg(CarDriver.rating_avg), 0)).filter(CarDriver.rating_count > 0).scalar() or 0
    avg_car_rating = db.query(sa_func.coalesce(sa_func.avg(CarDetails.rating_avg), 0)).filter(CarDetails.rating_avg > 0).scalar() or 0

    today = date_cls.today()
    billing_overdue_count = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.billing_suspended | (VehicleOwnerDetails.billing_next_date < today)
    ).count()

    # Last 7 IST calendar days' realized profit (EndRecord insert day, same
    # convention as business-snapshot's today_profit), oldest first.
    revenue_last_7_days = []
    for days_ago in range(6, -1, -1):
        day_start = _ist_midnight_utc(days_ago)
        day_end = _ist_midnight_utc(days_ago - 1) if days_ago > 0 else None
        q = (
            db.query(sa_func.coalesce(sa_func.sum(Order.admin_profit), 0))
            .join(EndRecord, EndRecord.order_id == Order.id)
            .filter(Order.trip_status == "COMPLETED")
        )
        q = q.filter(EndRecord.created_at.between(day_start, day_end)) if day_end else q.filter(EndRecord.created_at >= day_start)
        profit = q.scalar() or 0
        revenue_last_7_days.append({
            "date": (today - timedelta(days=days_ago)).isoformat(),
            "profit": int(profit),
        })

    return {
        "fleet_owners": fleet_owners_total,
        "drivers": drivers_total,
        "cars": cars_total,
        "vendors": vendors_total,
        "reports": {
            "drivers_online": drivers_online,
            "drivers_driving": drivers_driving,
            "drivers_total": drivers_total,
            "cars_verified": cars_verified,
            "cars_total": cars_total,
            "pending_fleet_doc_reviews": pending_fleet_doc_reviews,
            "owner_wallet_total": int(owner_wallet_total),
            "vendor_wallet_total": int(vendor_wallet_total),
            "owners_wallet_at_risk": owners_wallet_at_risk,
            "avg_driver_rating": round(float(avg_driver_rating), 2),
            "avg_car_rating": round(float(avg_car_rating), 2),
            "billing_overdue_count": billing_overdue_count,
            "revenue_last_7_days": revenue_last_7_days,
        },
    }


@router.get("/admin/dashboard/business-snapshot")
def admin_business_snapshot(
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD, IST. Defaults to today when omitted."),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD, IST, inclusive. Defaults to start_date (or today) when omitted."),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Owner-facing "how's the business doing" numbers for the Dashboard -
    distinct from Needs Attention (which is only actionable items). Gives
    the Owner totals + the selected period's activity (today by default) at
    a glance without digging into each tab separately."""
    from datetime import datetime, timezone, date as date_cls, timedelta
    from app.models.orders import Order, Trip_status
    from app.models.end_records import EndRecord
    from app.models.customer_details import CustomerDetails
    from sqlalchemy import func as sa_func

    # IST midnight, not UTC midnight - this platform's "today" is IST
    # everywhere else; UTC midnight would misclassify anything before
    # 5:30am IST as still "yesterday".
    if start_date:
        try:
            period_start = _ist_date_to_utc_midnight(date_cls.fromisoformat(start_date))
        except ValueError:
            raise HTTPException(status_code=422, detail="start_date must be YYYY-MM-DD")
    else:
        period_start = _ist_midnight_utc(0)

    if end_date:
        try:
            # end_date is inclusive - the range's upper bound is the START of
            # the NEXT day after end_date.
            period_end = _ist_date_to_utc_midnight(date_cls.fromisoformat(end_date)) + timedelta(days=1)
        except ValueError:
            raise HTTPException(status_code=422, detail="end_date must be YYYY-MM-DD")
    elif start_date:
        period_end = period_start + timedelta(days=1)
    else:
        period_end = None  # today, open-ended (matches the original behavior)

    def _in_period(column):
        if period_end is not None:
            return column.between(period_start, period_end)
        return column >= period_start

    total_bookings = db.query(Order).count()
    today_bookings = db.query(Order).filter(_in_period(Order.created_at)).count()
    future_bookings = db.query(Order).filter(
        Order.start_date_time >= datetime.now(timezone.utc),
        Order.trip_status == "PENDING",
    ).count()
    active_bookings = db.query(Order).filter(Order.trip_status == "PENDING").count()

    # "Today's profit" = admin_profit realized on trips actually closed out
    # in the period (EndRecord insert time), not just booked in the period -
    # a booking made today might not finish for days, and a trip finishing
    # today could have been booked earlier.
    today_profit = (
        db.query(sa_func.coalesce(sa_func.sum(Order.admin_profit), 0))
        .join(EndRecord, EndRecord.order_id == Order.id)
        .filter(_in_period(EndRecord.created_at), Order.trip_status == "COMPLETED")
        .scalar()
    ) or 0

    total_customers = db.query(CustomerDetails).count()
    new_customers_today = db.query(CustomerDetails).filter(_in_period(CustomerDetails.created_at)).count()
    new_customers_week = db.query(CustomerDetails).filter(CustomerDetails.created_at >= _ist_midnight_utc(6)).count()

    # Trip outcomes for the selected period, keyed off EndRecord/cancellation
    # time (not booking time) - same reasoning as today_profit above: a
    # trip completed/cancelled today may have been booked any time before.
    completed_bookings = (
        db.query(Order)
        .join(EndRecord, EndRecord.order_id == Order.id)
        .filter(_in_period(EndRecord.created_at), Order.trip_status == "COMPLETED")
        .count()
    )
    # Order has no updated_at/cancelled_at column to key a cancellation
    # moment off - created_at is the best available proxy (a cancelled
    # order's created_at still falls in the period it was placed in, which
    # is close enough for this at-a-glance count).
    # trip_status is a 3-value DB enum (PENDING/COMPLETED/CANCELLED) - a
    # cancelled order is always trip_status == "CANCELLED"; the granular
    # "who/why" lives separately in cancelled_by. This used to build its
    # filter list from every Trip_status Python enum member containing
    # "CANCELLED" (5 of those have no matching Postgres value at all - see
    # models/orders.py's Trip_status vs cancelled_by_enum), which crashed
    # this whole endpoint with a 500 DataError on every call.
    cancelled_bookings = db.query(Order).filter(
        _in_period(Order.created_at),
        Order.trip_status == "CANCELLED",
    ).count()
    avg_trip_value = (
        db.query(sa_func.coalesce(sa_func.avg(Order.vendor_price), 0))
        .join(EndRecord, EndRecord.order_id == Order.id)
        .filter(_in_period(EndRecord.created_at), Order.trip_status == "COMPLETED")
        .scalar()
    ) or 0

    return {
        "total_bookings": total_bookings,
        "today_bookings": today_bookings,
        "future_bookings": future_bookings,
        "active_bookings": active_bookings,
        "today_profit": int(today_profit),
        "total_customers": total_customers,
        "new_customers_today": new_customers_today,
        "new_customers_week": new_customers_week,
        "completed_bookings": completed_bookings,
        "cancelled_bookings": cancelled_bookings,
        "avg_trip_value": int(avg_trip_value),
    }


@router.get("/admin/commission-rates")
def admin_get_commission_rates(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Current Preferred/Standard partner commission split, by trip category
    (Settings > Fare Rules). Local rates are stored now even though Local
    bookings aren't buildable yet (Phase 06)."""
    from app.utils.commission import get_all_commission_rates
    return get_all_commission_rates(db)


@router.put("/admin/commission-rates")
def admin_update_commission_rates(
    body: dict,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Body shape: {"OUTSTATION": {"PREFERRED": {"vendor": 10, "admin": 0}, "STANDARD": {...}}, "LOCAL": {...}}"""
    from app.utils.commission import save_commission_rates
    for category, tiers in body.items():
        if category not in ("OUTSTATION", "LOCAL"):
            raise HTTPException(status_code=400, detail=f"Unknown trip category: {category}")
        for tier, rates in tiers.items():
            if tier not in ("PREFERRED", "STANDARD"):
                raise HTTPException(status_code=400, detail=f"Unknown tier: {tier}")
            if not isinstance(rates.get("vendor"), (int, float)) or not isinstance(rates.get("admin"), (int, float)):
                raise HTTPException(status_code=400, detail=f"{category}/{tier} needs numeric vendor/admin percentages")
    return save_commission_rates(db, body)


@router.post("/admin/billing/run")
def admin_run_billing(
    dry_run: bool = Query(True, description="Preview only (default). Set false to actually charge."),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Run the billing sweep now. Dry-run by default so admins can preview safely."""
    return run_billing(db, dry_run=dry_run)


@router.post("/admin/billing/start-cycle")
def admin_start_billing_cycle(
    dry_run: bool = Query(True, description="Preview only (default). Set false to seed due dates."),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Seed a first billing due date (today + 365) for active owners that don't have one."""
    return start_billing_cycle(db, dry_run=dry_run)


# --- Admin: email (SMTP) settings + user email management ---
# SMTP credentials live in platform_settings so the owner can rotate the app
# password from the admin app without touching code.

from app.utils.emailer import get_smtp_settings, update_smtp_settings, send_email


class SmtpSettingsUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[str] = None
    smtp_user: Optional[str] = None
    smtp_app_password: Optional[str] = None
    smtp_from: Optional[str] = None


class SetUserEmailRequest(BaseModel):
    role: str          # vehicle_owner | driver | vendor
    primary_number: str
    email: str


@router.get("/admin/email/settings")
def admin_get_email_settings(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    settings = get_smtp_settings(db)
    # Don't echo the app password back in full
    if settings.get("smtp_app_password"):
        settings["smtp_app_password"] = "********"
        settings["configured"] = True
    else:
        settings["configured"] = False
    return settings


@router.put("/admin/email/settings")
def admin_update_email_settings(
    body: SmtpSettingsUpdate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    updates = {k: v for k, v in body.dict().items() if v is not None and v != "********"}
    settings = update_smtp_settings(db, updates)
    if settings.get("smtp_app_password"):
        settings["smtp_app_password"] = "********"
    return settings


@router.post("/admin/email/test")
def admin_send_test_email(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Send a test email to the admin's own address to confirm SMTP works."""
    if not getattr(current_admin, "email", None):
        raise HTTPException(status_code=400, detail="Your admin profile has no email set.")
    try:
        send_email(db, current_admin.email, "Drop Cars - Test Email",
                   "Your email settings are working correctly.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Test email failed: {str(e)[:200]}")
    return {"message": f"Test email sent to {current_admin.email}"}


@router.put("/admin/users/email")
def admin_set_user_email(
    body: SetUserEmailRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Set/replace a user's email (counts as verified - the admin vouches for it).
    After this, the user can reset their own password via email OTP."""
    from app.api.routes.password_reset import _get_account

    role = body.role.strip().lower()
    email = body.email.strip()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Please enter a valid email address")

    account = _get_account(db, role, body.primary_number.strip())
    if not account:
        raise HTTPException(status_code=404, detail=f"No {role.replace('_', ' ')} found with that number")

    account.email = email
    account.email_verified = True
    db.add(account)
    db.commit()

    return {"message": f"Email saved. This user can now reset their password via email OTP.", "email": email}


# --- Admin: notification sound + spoken-message settings ---
# Per-event alert sound + spoken sentence (read aloud on-device via
# text-to-speech), stored in platform_settings so the owner can edit wording
# without an app rebuild. See app/utils/notification_settings.py.

from app.utils.notification_settings import (
    NOTIFICATION_EVENTS, AVAILABLE_SOUNDS,
    get_all_notification_settings, update_notification_settings,
)


class NotificationEventUpdate(BaseModel):
    sound: Optional[str] = None
    speak_text: Optional[str] = None


class NotificationSettingsUpdate(BaseModel):
    events: dict[str, NotificationEventUpdate]


@router.get("/admin/notification-settings")
def admin_get_notification_settings(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    return {
        "events": get_all_notification_settings(db),
        "labels": {key: val["label"] for key, val in NOTIFICATION_EVENTS.items()},
        # Which app receives each type: driver | vendor | customer | admin | all
        "apps": {key: val.get("app", "driver") for key, val in NOTIFICATION_EVENTS.items()},
        "available_sounds": AVAILABLE_SOUNDS,
    }


@router.put("/admin/notification-settings")
def admin_update_notification_settings(
    body: NotificationSettingsUpdate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    updates = {key: val.dict() for key, val in body.events.items()}
    return {"events": update_notification_settings(db, updates)}


@router.post("/admin/notification-settings/{event_key}/upload-sound")
def admin_upload_notification_sound(
    event_key: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Upload a custom MP3 for one notification type. Stored in GCS, no app
    rebuild needed: each phone downloads it, makes a notification channel
    with it (see api/routes/notification_sounds.py) and pushes are then sent
    on that channel, so it plays even when the app is closed. Phones that
    have not synced yet keep the bundled tone until they open the app."""
    if event_key not in NOTIFICATION_EVENTS:
        raise HTTPException(status_code=404, detail="Unknown notification event")
    if not (file.content_type or "").startswith("audio/"):
        raise HTTPException(status_code=400, detail="File must be an audio file (mp3/wav)")
    url = upload_image_to_gcs(file, folder="notification_sounds")
    updated = update_notification_settings(db, {event_key: {"sound": url}})
    return {"events": updated}


@router.post("/admin/notification-settings/{event_key}/reset-sound")
def admin_reset_notification_sound(
    event_key: str,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Back to the bundled Drop Cars tone for this notification type."""
    if event_key not in NOTIFICATION_EVENTS:
        raise HTTPException(status_code=404, detail="Unknown notification event")
    updated = update_notification_settings(db, {event_key: {"sound": NOTIFICATION_EVENTS[event_key]["sound"]}})
    return {"events": updated}


# --- Admin: Assignment & Priority Configuration ---
from app.utils.assignment_priority_config import (
    get_assignment_priority_config,
    update_assignment_priority_config,
)

class AssignmentPriorityConfigUpdate(BaseModel):
    priority_cutoff_hours: Optional[int] = None
    priority_cutoff_pct: Optional[int] = None
    assignment_default_mins: Optional[int] = None
    assignment_pct: Optional[int] = None
    assignment_min_mins: Optional[int] = None
    alarm_pct: Optional[int] = None
    alarm_duration_secs: Optional[int] = None
    grace_under_1h_mins: Optional[int] = None
    grace_over_1h_mins: Optional[int] = None


@router.get("/admin/assignment-priority-settings", dependencies=[Depends(get_current_admin)])
@router.get("/api/v1/assignment-priority-settings", dependencies=[Depends(get_current_admin)])
def get_assignment_priority_settings_route(
    db: Session = Depends(get_db),
):
    return get_assignment_priority_config(db)


@router.put("/admin/assignment-priority-settings")
def update_assignment_priority_settings_route(
    body: AssignmentPriorityConfigUpdate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    return update_assignment_priority_config(db, updates)



# --- Admin: customer booking requests & rate card management ---

from app.models.customer_booking_request import CustomerBookingRequest
from app.schemas.customer_booking import CustomerBookingOut, AdminBookingUpdate
from app.utils.rate_card import get_all_rate_cards, update_rate_cards
from app.models.new_orders import NewOrder, OrderTypeEnum, CarTypeEnum
from app.crud.orders import create_master_from_new_order
from app.crud.notification import send_push_notification_to_customer


class RejectionRequest(BaseModel):
    reason: str


@router.get("/admin/customer-bookings", response_model=List[CustomerBookingOut])
def admin_get_customer_bookings(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    query = db.query(CustomerBookingRequest)
    if status:
        query = query.filter(CustomerBookingRequest.status == status)
    bookings = query.order_by(CustomerBookingRequest.created_at.desc()).all()
    
    # We enrich driver/car details if assigned
    from app.api.routes.customer_bookings import _enrich_booking_out
    return [_enrich_booking_out(db, r) for r in bookings]


@router.put("/admin/customer-bookings/{id}", response_model=CustomerBookingOut)
def admin_update_customer_booking(
    id: UUID,
    body: AdminBookingUpdate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if request.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be modified")

    # Update admin fare inputs
    request.admin_cost_per_km = body.admin_cost_per_km
    request.admin_driver_allowance = body.admin_driver_allowance
    request.admin_extra_driver_allowance = body.admin_extra_driver_allowance
    request.admin_permit_charges = body.admin_permit_charges
    request.admin_extra_permit_charges = body.admin_extra_permit_charges
    request.admin_hill_charges = body.admin_hill_charges
    request.admin_toll_charges = body.admin_toll_charges
    request.admin_extra_cost_per_km = body.admin_extra_cost_per_km
    request.admin_night_charges = body.admin_night_charges

    # Recalculate total customer and driver amount based on these edits
    base_km_amount = int(round(request.quoted_trip_distance * body.admin_cost_per_km))
    extra_base_km_amount = int(round(request.quoted_trip_distance * body.admin_extra_cost_per_km))
    
    total_amount = (
        base_km_amount + extra_base_km_amount
        + body.admin_driver_allowance
        + body.admin_extra_driver_allowance
        + body.admin_permit_charges
        + body.admin_extra_permit_charges
        + body.admin_hill_charges
        + body.admin_toll_charges
        + body.admin_night_charges
    )
    
    driver_amount = (
        base_km_amount
        + body.admin_driver_allowance
        + body.admin_permit_charges
        + body.admin_hill_charges
        + body.admin_toll_charges
        + body.admin_night_charges
    )

    request.admin_total_amount = total_amount
    request.admin_driver_amount = driver_amount
    
    if body.start_date_time:
        request.start_date_time = body.start_date_time

    db.commit()
    db.refresh(request)
    
    from app.api.routes.customer_bookings import _enrich_booking_out
    return _enrich_booking_out(db, request)


@router.post("/admin/customer-bookings/{id}/approve", response_model=CustomerBookingOut)
async def admin_approve_customer_booking(
    id: UUID,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if request.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be approved")

    from app.crud.customer_booking_request import approve_customer_booking_request
    approve_customer_booking_request(db, request, decided_by="ADMIN")

    # Send customer push notification
    try:
        await send_push_notification_to_customer(
            db,
            customer_id=str(request.customer_id),
            title="Booking Approved!",
            message=f"Your booking request from {request.pickup_drop_location.get('0', '')} is approved. Finding driver...",
            event_key="customer_booking_approved"
        )
    except Exception as e:
        print(f"Failed to notify customer of approval: {e}")

    from app.api.routes.customer_bookings import _enrich_booking_out
    return _enrich_booking_out(db, request)


@router.post("/admin/customer-bookings/{id}/reject", response_model=CustomerBookingOut)
async def admin_reject_customer_booking(
    id: UUID,
    body: RejectionRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if request.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be rejected")

    request.status = "REJECTED"
    request.rejection_reason = body.reason
    request.decided_at = datetime.utcnow()
    request.decided_by = "ADMIN"
    db.commit()
    db.refresh(request)

    # Send customer push notification
    try:
        await send_push_notification_to_customer(
            db,
            customer_id=str(request.customer_id),
            title="Booking Request Declined",
            message=f"Reason: {body.reason}",
            event_key="customer_booking_rejected"
        )
    except Exception as e:
        print(f"Failed to notify customer of rejection: {e}")

    from app.api.routes.customer_bookings import _enrich_booking_out
    return _enrich_booking_out(db, request)


class AdminPushTokenRegister(BaseModel):
    token: str


@router.post("/admin/notifications/register-token")
def admin_register_push_token(
    body: AdminPushTokenRegister,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    """Registers the Admin app's Expo push token so admins can be alarmed
    (e.g. about a website booking awaiting approval). Keyed by admin id, one
    row per admin, mirroring the vehicle_owner/driver notification rows."""
    from app.models.notification import Notification
    row = db.query(Notification).filter(Notification.sub == str(current_admin.id)).first()
    if row:
        row.user = "admin"
        row.token = body.token
    else:
        row = Notification(user="admin", sub=str(current_admin.id), token=body.token)
        db.add(row)
    db.commit()
    return {"status": "registered"}


@router.get("/admin/website-booking-settings")
def admin_get_website_booking_settings(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    from app.crud.customer_booking_request import (
        get_auto_approve_seconds, get_platform_setting_value,
        ASSIGNMENT_WINDOW_PERCENT_KEY, DEFAULT_ASSIGNMENT_WINDOW_PERCENT,
        ASSIGNMENT_WINDOW_MIN_MINUTES_KEY, DEFAULT_ASSIGNMENT_WINDOW_MIN_MINUTES,
        ASSIGNMENT_WINDOW_MAX_MINUTES_KEY, DEFAULT_ASSIGNMENT_WINDOW_MAX_MINUTES,
        URGENT_ASSIGNMENT_WINDOW_MINUTES_KEY, DEFAULT_URGENT_ASSIGNMENT_WINDOW_MINUTES,
        PHONE_REVEAL_HOURS_BEFORE_KEY, DEFAULT_PHONE_REVEAL_HOURS_BEFORE,
    )
    return {
        **_post_rule_settings(db),
        "auto_approve_seconds": get_auto_approve_seconds(db, is_urgent=False),
        "urgent_approve_seconds": get_auto_approve_seconds(db, is_urgent=True),
        "assignment_window_percent": int(get_platform_setting_value(db, ASSIGNMENT_WINDOW_PERCENT_KEY, str(DEFAULT_ASSIGNMENT_WINDOW_PERCENT))),
        "assignment_window_min_minutes": int(get_platform_setting_value(db, ASSIGNMENT_WINDOW_MIN_MINUTES_KEY, str(DEFAULT_ASSIGNMENT_WINDOW_MIN_MINUTES))),
        "assignment_window_max_minutes": int(get_platform_setting_value(db, ASSIGNMENT_WINDOW_MAX_MINUTES_KEY, str(DEFAULT_ASSIGNMENT_WINDOW_MAX_MINUTES))),
        "urgent_assignment_window_minutes": int(get_platform_setting_value(db, URGENT_ASSIGNMENT_WINDOW_MINUTES_KEY, str(DEFAULT_URGENT_ASSIGNMENT_WINDOW_MINUTES))),
        "phone_reveal_hours_before_pickup": float(get_platform_setting_value(db, PHONE_REVEAL_HOURS_BEFORE_KEY, str(DEFAULT_PHONE_REVEAL_HOURS_BEFORE))),
    }


_POST_RULE_SETTINGS = {
    # api name -> platform_settings key (crud/website_post_rules.py explains each)
    "advance_post_hours": "website_advance_post_hours",
    "staff_wait_until_hours": "website_staff_wait_until_hours",
    "short_notice_hours": "website_short_notice_hours",
    "off_duty_delay_seconds": "website_off_duty_delay_seconds",
    "on_duty_short_delay_seconds": "website_on_duty_short_delay_seconds",
    "off_duty_short_delay_seconds": "website_off_duty_short_delay_seconds",
    "off_duty_urgent_delay_seconds": "website_off_duty_urgent_delay_seconds",
    "owner_escalate_minutes": "website_owner_escalate_minutes",
    "staff_presence_minutes": "staff_presence_minutes",
    "staff_duty_max_hours": "staff_duty_max_hours",
}


def _post_rule_settings(db) -> dict:
    from app.crud.website_post_rules import get_rules
    rules = get_rules(db)
    return {api: rules[key] for api, key in _POST_RULE_SETTINGS.items()}


class WebsiteBookingSettingsUpdate(BaseModel):
    advance_post_hours: Optional[float] = None
    staff_wait_until_hours: Optional[float] = None
    short_notice_hours: Optional[float] = None
    off_duty_delay_seconds: Optional[float] = None
    on_duty_short_delay_seconds: Optional[float] = None
    off_duty_short_delay_seconds: Optional[float] = None
    off_duty_urgent_delay_seconds: Optional[float] = None
    owner_escalate_minutes: Optional[float] = None
    staff_presence_minutes: Optional[float] = None
    staff_duty_max_hours: Optional[float] = None
    auto_approve_seconds: Optional[int] = None
    urgent_approve_seconds: Optional[int] = None
    # Assignment window: how long a vendor has, after ACCEPTING, to actually
    # assign a driver+car before the booking is auto-repost-with-penalty.
    assignment_window_percent: Optional[int] = None
    assignment_window_min_minutes: Optional[int] = None
    assignment_window_max_minutes: Optional[int] = None
    urgent_assignment_window_minutes: Optional[int] = None
    # Hours before pickup that the customer's number becomes visible to the
    # assigned driver (urgent bookings always reveal immediately).
    phone_reveal_hours_before_pickup: Optional[float] = None
    platform_fee_pct: Optional[float] = None
    platform_share_pct: Optional[float] = None
    platform_share_min: Optional[int] = None
    commission_min: Optional[int] = None
    convenience_fee: Optional[int] = None
    platform_all_inclusive_pct: Optional[float] = None
    min_driver_hold: Optional[int] = None
    drop_bid_fee_pct: Optional[float] = None


@router.put("/admin/website-booking-settings")
def admin_update_website_booking_settings(
    body: WebsiteBookingSettingsUpdate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    from app.crud.customer_booking_request import (
        set_platform_setting_value, get_platform_setting_value,
        WEBSITE_AUTO_APPROVE_SECONDS_KEY, WEBSITE_URGENT_APPROVE_SECONDS_KEY,
        ASSIGNMENT_WINDOW_PERCENT_KEY, DEFAULT_ASSIGNMENT_WINDOW_PERCENT,
        ASSIGNMENT_WINDOW_MIN_MINUTES_KEY, DEFAULT_ASSIGNMENT_WINDOW_MIN_MINUTES,
        ASSIGNMENT_WINDOW_MAX_MINUTES_KEY, DEFAULT_ASSIGNMENT_WINDOW_MAX_MINUTES,
        URGENT_ASSIGNMENT_WINDOW_MINUTES_KEY, DEFAULT_URGENT_ASSIGNMENT_WINDOW_MINUTES,
        PHONE_REVEAL_HOURS_BEFORE_KEY, DEFAULT_PHONE_REVEAL_HOURS_BEFORE,
        get_auto_approve_seconds,
    )
    for _api, _key in _POST_RULE_SETTINGS.items():
        _val = getattr(body, _api)
        if _val is None:
            continue
        if _val < 0 or _val > 24 * 30 * 60:
            raise HTTPException(status_code=400, detail=f"{_api} is out of range")
        set_platform_setting_value(db, _key, str(_val))
    if body.auto_approve_seconds is not None:
        if body.auto_approve_seconds < 30:
            raise HTTPException(status_code=400, detail="auto_approve_seconds must be at least 30")
        set_platform_setting_value(db, WEBSITE_AUTO_APPROVE_SECONDS_KEY, str(body.auto_approve_seconds))
    if body.urgent_approve_seconds is not None:
        if body.urgent_approve_seconds < 30:
            raise HTTPException(status_code=400, detail="urgent_approve_seconds must be at least 30")
        set_platform_setting_value(db, WEBSITE_URGENT_APPROVE_SECONDS_KEY, str(body.urgent_approve_seconds))
    if body.assignment_window_percent is not None:
        if not (0 < body.assignment_window_percent <= 100):
            raise HTTPException(status_code=400, detail="assignment_window_percent must be between 1 and 100")
        set_platform_setting_value(db, ASSIGNMENT_WINDOW_PERCENT_KEY, str(body.assignment_window_percent))
    if body.assignment_window_min_minutes is not None:
        if body.assignment_window_min_minutes < 1:
            raise HTTPException(status_code=400, detail="assignment_window_min_minutes must be at least 1")
        set_platform_setting_value(db, ASSIGNMENT_WINDOW_MIN_MINUTES_KEY, str(body.assignment_window_min_minutes))
    if body.assignment_window_max_minutes is not None:
        if body.assignment_window_max_minutes < 1:
            raise HTTPException(status_code=400, detail="assignment_window_max_minutes must be at least 1")
        set_platform_setting_value(db, ASSIGNMENT_WINDOW_MAX_MINUTES_KEY, str(body.assignment_window_max_minutes))
    if body.urgent_assignment_window_minutes is not None:
        if body.urgent_assignment_window_minutes < 1:
            raise HTTPException(status_code=400, detail="urgent_assignment_window_minutes must be at least 1")
        set_platform_setting_value(db, URGENT_ASSIGNMENT_WINDOW_MINUTES_KEY, str(body.urgent_assignment_window_minutes))
    if body.phone_reveal_hours_before_pickup is not None:
        if body.phone_reveal_hours_before_pickup < 0:
            raise HTTPException(status_code=400, detail="phone_reveal_hours_before_pickup cannot be negative")
        set_platform_setting_value(db, PHONE_REVEAL_HOURS_BEFORE_KEY, str(body.phone_reveal_hours_before_pickup))
    return {
        **_post_rule_settings(db),
        "auto_approve_seconds": get_auto_approve_seconds(db, is_urgent=False),
        "urgent_approve_seconds": get_auto_approve_seconds(db, is_urgent=True),
        "assignment_window_percent": int(get_platform_setting_value(db, ASSIGNMENT_WINDOW_PERCENT_KEY, str(DEFAULT_ASSIGNMENT_WINDOW_PERCENT))),
        "assignment_window_min_minutes": int(get_platform_setting_value(db, ASSIGNMENT_WINDOW_MIN_MINUTES_KEY, str(DEFAULT_ASSIGNMENT_WINDOW_MIN_MINUTES))),
        "assignment_window_max_minutes": int(get_platform_setting_value(db, ASSIGNMENT_WINDOW_MAX_MINUTES_KEY, str(DEFAULT_ASSIGNMENT_WINDOW_MAX_MINUTES))),
        "urgent_assignment_window_minutes": int(get_platform_setting_value(db, URGENT_ASSIGNMENT_WINDOW_MINUTES_KEY, str(DEFAULT_URGENT_ASSIGNMENT_WINDOW_MINUTES))),
        "phone_reveal_hours_before_pickup": float(get_platform_setting_value(db, PHONE_REVEAL_HOURS_BEFORE_KEY, str(DEFAULT_PHONE_REVEAL_HOURS_BEFORE))),
    }


@router.get("/admin/rate-card")
def admin_get_rate_card(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    return get_all_rate_cards(db)


@router.put("/admin/rate-card")
def admin_update_rate_card(
    body: dict,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin)
):
    return update_rate_cards(db, body)


# --- Route-distance cache management (Settings > Route Distances) ---
# Distances are cached so repeat quotes don't re-pay Google. Admin can view,
# correct, or delete any cached value here without code changes.

@router.get("/admin/route-distances")
def admin_list_route_distances(
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.models.route_distance import RouteDistance
    query = db.query(RouteDistance)
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(
            (RouteDistance.origin.ilike(like)) | (RouteDistance.destination.ilike(like))
        )
    total = query.count()
    rows = query.order_by(RouteDistance.updated_at.desc()).offset(skip).limit(limit).all()
    return {
        "total": total,
        "routes": [
            {
                "id": str(r.id),
                "origin": r.origin,
                "destination": r.destination,
                "distance_km": r.distance_km,
                "duration_text": r.duration_text,
                "source": r.source,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ],
    }


@router.post("/admin/route-distances")
def admin_add_route_distance(
    body: dict,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Manually add a route distance so the first quote for that route never
    needs Google at all (useful for rare routes you already know)."""
    from app.models.route_distance import RouteDistance
    from app.utils.maps import _route_key

    origin = str(body.get("origin", "")).strip()
    destination = str(body.get("destination", "")).strip()
    distance_km = body.get("distance_km")
    if not origin or not destination:
        raise HTTPException(status_code=400, detail="origin and destination are required")
    if distance_km is None or float(distance_km) <= 0:
        raise HTTPException(status_code=400, detail="distance_km must be a positive number")

    o_key, d_key = _route_key(origin), _route_key(destination)
    existing = db.query(RouteDistance).filter(
        ((RouteDistance.origin_key == o_key) & (RouteDistance.destination_key == d_key))
        | ((RouteDistance.origin_key == d_key) & (RouteDistance.destination_key == o_key))
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"This route already exists ({existing.origin} → {existing.destination}, {existing.distance_km} km). Edit it instead.",
        )

    row = RouteDistance(
        origin_key=o_key,
        destination_key=d_key,
        origin=origin,
        destination=destination,
        distance_km=float(distance_km),
        duration_text=str(body.get("duration_text") or "") or None,
        source="ADMIN",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "message": "Route added",
        "id": str(row.id),
        "origin": row.origin,
        "destination": row.destination,
        "distance_km": row.distance_km,
    }


@router.put("/admin/route-distances/{route_id}")
def admin_update_route_distance(
    route_id: UUID,
    body: dict,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.models.route_distance import RouteDistance
    row = db.query(RouteDistance).filter(RouteDistance.id == route_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Route not found")
    distance_km = body.get("distance_km")
    if distance_km is None or float(distance_km) <= 0:
        raise HTTPException(status_code=400, detail="distance_km must be a positive number")
    row.distance_km = float(distance_km)
    if body.get("duration_text") is not None:
        row.duration_text = str(body["duration_text"])
    row.source = "ADMIN"
    db.add(row)
    db.commit()
    return {"message": "Route distance updated", "id": str(row.id), "distance_km": row.distance_km}


@router.delete("/admin/route-distances/{route_id}")
def admin_delete_route_distance(
    route_id: UUID,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.models.route_distance import RouteDistance
    row = db.query(RouteDistance).filter(RouteDistance.id == route_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Route not found")
    db.delete(row)
    db.commit()
    return {"message": "Deleted - next quote for this route will fetch a fresh distance"}


# --- City list management (Settings > Cities) ---
# The city list drives location suggestions, near-city and vacant-city pickers.
# Stored in platform_settings so the admin can edit it without code changes.

@router.get("/admin/cities")
def admin_get_cities(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.utils.cities import get_cities
    return {"cities": get_cities()}


@router.put("/admin/cities")
def admin_update_cities(
    body: dict,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.utils.cities import save_cities
    cities = body.get("cities")
    if not isinstance(cities, list) or not cities:
        raise HTTPException(status_code=400, detail="cities must be a non-empty list of names")
    cleaned = sorted({str(c).strip() for c in cities if str(c).strip()})
    if not cleaned:
        raise HTTPException(status_code=400, detail="No valid city names given")
    save_cities(db, cleaned)
    return {"message": f"City list updated ({len(cleaned)} cities)", "cities": cleaned}


# --- Local Bookings serviceable-city toggle (Settings > Local Bookings) ---
# Separate from the general city list above: this gates which cities Local
# Bookings can be posted in, city by city (off by default outside Tamil Nadu).

@router.get("/admin/serviceable-cities")
def admin_get_serviceable_cities(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.utils.serviceable_cities import get_serviceable_cities
    return {"cities": get_serviceable_cities(db)}


@router.put("/admin/serviceable-cities")
def admin_update_serviceable_cities(
    body: dict,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.utils.serviceable_cities import save_serviceable_cities
    cities = body.get("cities")
    if not isinstance(cities, list) or not cities:
        raise HTTPException(status_code=400, detail="cities must be a non-empty list")
    cleaned = []
    seen = set()
    for c in cities:
        if not isinstance(c, dict):
            continue
        name = str(c.get("city", "")).strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        cleaned.append({
            "city": name,
            "state": str(c.get("state", "")).strip(),
            "serviceable": bool(c.get("serviceable", False)),
        })
    if not cleaned:
        raise HTTPException(status_code=400, detail="No valid city entries given")
    save_serviceable_cities(db, cleaned)
    return {"message": f"Serviceable cities updated ({len(cleaned)} cities)", "cities": cleaned}


# --- Car model catalog management (Settings > Car Models) ---
# Drives the "Car Name" picker in the driver app's add-car screens (auto-fills
# Car Type on selection). Stored in platform_settings so the admin can add or
# remove models - e.g. drop "Renault Kwid" - without a code change.

@router.get("/admin/car-models")
def admin_get_car_models(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.utils.car_models import get_car_models
    return {"car_models": get_car_models()}


@router.put("/admin/car-models")
def admin_update_car_models(
    body: dict,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.utils.car_models import save_car_models
    from app.models.car_details import CarTypeEnum

    car_models = body.get("car_models")
    if not isinstance(car_models, list) or not car_models:
        raise HTTPException(status_code=400, detail="car_models must be a non-empty list of {name, type}")

    valid_types = {t.value for t in CarTypeEnum}
    cleaned = []
    seen_names = set()
    for m in car_models:
        if not isinstance(m, dict):
            continue
        name = str(m.get("name", "")).strip()
        car_type = str(m.get("type", "")).strip()
        if not name or not car_type:
            continue
        if car_type not in valid_types:
            raise HTTPException(status_code=400, detail=f'Invalid car type "{car_type}" for "{name}"')
        key = name.lower()
        if key in seen_names:
            continue
        seen_names.add(key)
        cleaned.append({"name": name, "type": car_type})

    if not cleaned:
        raise HTTPException(status_code=400, detail="No valid car models given")

    cleaned.sort(key=lambda m: m["name"].lower())
    save_car_models(db, cleaned)
    return {"message": f"Car model list updated ({len(cleaned)} models)", "car_models": cleaned}


@router.get("/admin/car-types")
def admin_list_car_types(
    current_admin=Depends(get_current_admin),
):
    """Valid car_type values for the Car Models admin screen's type dropdown."""
    from app.models.car_details import CarTypeEnum
    return {"car_types": [t.value for t in CarTypeEnum]}


# --- Fare Rules (Settings > Fare Rules) ---
# Minimum-billable-km constants used by the Oneway / Round Trip / Multi City
# fare formulas. Previously hardcoded in crud/new_orders.py; now admin-editable.

@router.get("/admin/fare-rules")
def admin_get_fare_rules(
    current_admin=Depends(get_current_admin),
):
    from app.utils.fare_rules import get_fare_rules
    return get_fare_rules()


@router.put("/admin/fare-rules")
def admin_update_fare_rules(
    body: dict,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.utils.fare_rules import save_fare_rules, DEFAULT_FARE_RULES
    for key in DEFAULT_FARE_RULES:
        if key in body:
            try:
                if int(body[key]) <= 0:
                    raise HTTPException(status_code=400, detail=f"{key} must be a positive number")
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"{key} must be a positive number")
    updated = save_fare_rules(db, body)
    return {"message": "Fare rules updated", "fare_rules": updated}


# --- Payout requests (Settings > Payout Requests) ---
# Fleet owners request a cash-out; admin pays them outside the app and marks
# it here. Manual settlement only - no payment-API integration.
# Must stay before the /admin/{admin_id} catch-all below, same reason as
# notification-settings/vacant-cities - otherwise "payout-requests" parses
# as an admin_id and 500s on the UUID cast.

@router.get("/admin/payout-requests", response_model=List[PayoutRequestOut])
def admin_list_payout_requests(
    status_filter: str | None = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    return get_payout_requests(db, status_filter, skip, limit)


@router.patch("/admin/payout-requests/{request_id}/pay", response_model=PayoutRequestOut)
def admin_mark_payout_paid(
    request_id: int,
    payload: ProcessPayoutRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    require_payment_release_permission(current_admin)
    result = mark_payout_paid(db, request_id, str(current_admin.id), payload.notes, payload.paid_via)
    from app.crud.admin_activity_log import log_admin_action, resolve_account_display_name
    _payout_account_type = "vehicle_owner" if getattr(result, "vehicle_owner_id", None) else "vendor"
    _payout_account_id = str(result.vehicle_owner_id or result.vendor_id)
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="PAYOUT_MARKED_PAID", target_type="payout_request", target_id=str(request_id),
        target_name=resolve_account_display_name(db, _payout_account_type, _payout_account_id),
        details={"paid_via": payload.paid_via},
    )
    return result


@router.patch("/admin/payout-requests/{request_id}/reject", response_model=PayoutRequestOut)
def admin_reject_payout_request(
    request_id: int,
    payload: ProcessPayoutRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    return reject_payout_request(db, request_id, str(current_admin.id), payload.notes)


@router.post("/admin/payout-requests/admin-initiated", response_model=PayoutRequestOut, status_code=status.HTTP_201_CREATED)
def admin_create_initiated_payout(
    payload: AdminInitiatedPayoutRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Admin pays a fleet owner or vendor directly, without a prior request -
    debits their wallet immediately and logs it with the given remark."""
    require_payment_release_permission(current_admin)
    from app.crud.payout_requests import admin_initiated_payout
    result = admin_initiated_payout(
        db,
        str(current_admin.id),
        payload.amount,
        payload.remark,
        vehicle_owner_id=str(payload.vehicle_owner_id) if payload.vehicle_owner_id else None,
        vendor_id=str(payload.vendor_id) if payload.vendor_id else None,
        paid_via=payload.paid_via,
    )
    from app.crud.admin_activity_log import log_admin_action, resolve_account_display_name
    _payout_target_type = "vehicle_owner" if payload.vehicle_owner_id else "vendor"
    _payout_target_id = str(payload.vehicle_owner_id or payload.vendor_id)
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="DIRECT_PAYOUT", target_type=_payout_target_type,
        target_id=_payout_target_id,
        target_name=resolve_account_display_name(db, _payout_target_type, _payout_target_id),
        details={"amount": payload.amount, "remark": payload.remark, "paid_via": payload.paid_via},
    )
    return result


# These 3 GET routes were moved here from further down the file 2026-09-04 -
# same route-shadowing bug as car_details.py's/car_driver.py's "/all"
# routes found earlier this session: each is a literal 2-segment path
# ("/admin/refund-requests", "/admin/subscription-lookup",
# "/admin/profile-edit-reviews") that's the exact same shape as the
# catch-all "/admin/{admin_id}" below - declared AFTER it in the original
# file, so FastAPI's in-declaration-order matching always caught them with
# the catch-all first, 400ing on the UUID parse. All 3 are real,
# frontend-called features (the refund-requests one is even a "needs
# attention" widget on the Admin App's own home dashboard) that were
# therefore completely broken via their real endpoint this whole time.
# Their own POST sibling routes (.../{id}/process, .../{id}/approve, etc.)
# are a different (3-segment) shape and were never affected - left in
# their original place further down.
@router.get("/admin/refund-requests")
def admin_list_refund_requests(
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    from app.crud.refund_requests import list_pending_refund_requests
    return list_pending_refund_requests(db)


@router.get("/admin/subscription-lookup")
def admin_subscription_lookup(
    user_id: Optional[str] = Query(None),
    phone_number: Optional[str] = Query(None),
    user_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Subscription Status Visibility for Admin Support / Billing Lookups.
    Returns subscription tier, status, expiry date, auto-renew status, and history.
    """
    from datetime import timezone
    from app.models.customer_details import CustomerDetails
    from app.models.car_driver import CarDriver

    result = []
    if not user_type or user_type == "CUSTOMER":
        c_query = db.query(CustomerDetails)
        if user_id:
            c_query = c_query.filter(CustomerDetails.customer_id == user_id)
        if phone_number:
            c_query = c_query.filter(CustomerDetails.primary_number == phone_number)
        customers = c_query.all()
        for c in customers:
            is_act = bool(c.subscription_expires_at and c.subscription_expires_at > datetime.now(timezone.utc))
            result.append({
                "user_id": str(c.customer_id),
                "user_type": "CUSTOMER",
                "name": c.full_name,
                "phone": c.primary_number,
                "subscription_tier": c.subscription_tier or "FREE",
                "is_active": is_act,
                "expires_at": c.subscription_expires_at.isoformat() if c.subscription_expires_at else None,
                "auto_renew": bool(c.auto_renew_from_wallet),
            })

    if not user_type or user_type == "DRIVER":
        d_query = db.query(CarDriver)
        if user_id:
            d_query = d_query.filter(CarDriver.id == user_id)
        if phone_number:
            d_query = d_query.filter(CarDriver.primary_number == phone_number)
        drivers = d_query.all()
        for d in drivers:
            is_act = bool(d.subscription_expires_at and d.subscription_expires_at > datetime.now(timezone.utc))
            result.append({
                "user_id": str(d.id),
                "user_type": "DRIVER",
                "name": d.full_name,
                "phone": d.primary_number,
                "subscription_tier": d.subscription_tier or "FREE",
                "is_active": is_act,
                "expires_at": d.subscription_expires_at.isoformat() if d.subscription_expires_at else None,
                "auto_renew": bool(d.auto_renew_from_wallet),
            })

    # Fleet Owners are a separate model (VehicleOwnerDetails, keyed by
    # vehicle_owner_id) with a different field name (subscription_type, no
    # expiry column) than the individual-driver subscription above - this
    # branch was previously missing entirely (silently querying CarDriver
    # for FLEET_OWNER lookups too, which always returned empty).
    if not user_type or user_type == "FLEET_OWNER":
        from app.models.vehicle_owner_details import VehicleOwnerDetails
        vo_query = db.query(VehicleOwnerDetails)
        if user_id:
            vo_query = vo_query.filter(VehicleOwnerDetails.vehicle_owner_id == user_id)
        if phone_number:
            vo_query = vo_query.filter(VehicleOwnerDetails.primary_number == phone_number)
        owners = vo_query.all()
        for vo in owners:
            tier = vo.subscription_type or "FREE"
            result.append({
                "user_id": str(vo.vehicle_owner_id),
                "user_type": "FLEET_OWNER",
                "name": vo.full_name,
                "phone": vo.primary_number,
                "subscription_tier": tier,
                "is_active": tier in ("MONTHLY", "YEARLY"),
                "expires_at": None,
                "auto_renew": None,
            })

    return {"results": result}


@router.get("/admin/profile-edit-reviews")
def get_admin_profile_edit_reviews(
    status_filter: Optional[str] = Query("PENDING"),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """List pending/processed profile-edit review requests in Admin Queue."""
    from app.models.profile_edit_review import ProfileEditReview

    query = db.query(ProfileEditReview)
    if status_filter and status_filter != "ALL":
        query = query.filter(ProfileEditReview.status == status_filter)

    reviews = query.order_by(ProfileEditReview.created_at.desc()).all()
    return {"reviews": reviews}


@router.get("/admin/documents/needs-review")
def get_documents_needing_review_endpoint(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Cross-account queue of documents that auto-verify couldn't confirm
    on a re-upload (NEEDS_REVIEW - see get_documents_needing_review). This
    used to not exist at all: a document stuck non-VERIFIED had no
    "what needs my attention" list anywhere, only a per-account drill-down
    an admin had to already know to open."""
    from app.crud.admin_management import get_documents_needing_review
    items = get_documents_needing_review(db)
    return {"items": items, "count": len(items)}


@router.post("/admin/documents/reverify-pending")
def reverify_pending_documents_endpoint(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """On-demand re-check of up to `limit` PENDING/NEEDS_REVIEW documents
    against the current auto-verify engine - a Settings action for staff,
    not a scheduled job. Useful right after the engine itself changes (a
    bug fix, a new check), or when users have re-uploaded corrected
    documents that are just sitting there waiting on a manual look. Capped
    per call (not unbounded) - see crud/admin_management.py's
    reverify_pending_documents for why, and what it does/doesn't touch.
    Response includes has_more - call again to process the next batch."""
    from app.crud.admin_management import reverify_pending_documents
    summary = reverify_pending_documents(db, limit=max(1, min(limit, 50)))
    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="DOCUMENTS_REVERIFIED", target_type="system", target_id="reverify-pending", target_name="Re-verify Pending Documents",
        details=summary,
    )
    return summary


@router.get("/admin/car-substitution-requests")
def list_car_substitution_requests_endpoint(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Pending "Request for My Car" requests - a fleet offering a
    different car than the exact type a booking was posted for. See
    crud/vehicle_matching.py."""
    from app.crud.vehicle_matching import list_pending_substitution_requests
    items = list_pending_substitution_requests(db)
    return {"items": items, "count": len(items)}


@router.get("/admin/orders/{order_id}/vehicle-mismatch-attempts")
def get_order_vehicle_mismatch_attempts_endpoint(
    order_id: int,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Who tried to accept this booking but didn't have a verified car of
    the required type - real signal for unmet vehicle-type demand on a
    booking that's sitting unaccepted. See crud/vehicle_matching.py."""
    from app.crud.vehicle_matching import get_mismatch_attempts_for_order
    items = get_mismatch_attempts_for_order(db, order_id)
    return {"items": items, "count": len(items)}


class SubstitutionRequestDecision(BaseModel):
    notes: Optional[str] = None


@router.post("/admin/car-substitution-requests/{request_id}/approve")
def approve_car_substitution_request_endpoint(
    request_id: int,
    payload: SubstitutionRequestDecision,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.crud.vehicle_matching import decide_substitution_request
    try:
        req, assignment = decide_substitution_request(db, request_id, approve=True, admin_id=str(current_admin.id), notes=payload.notes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        from app.crud.notification import send_new_booking_notification_to_driver_sync
        send_new_booking_notification_to_driver_sync(
            db,
            title="✅ Substitution Request Approved",
            message=f"Your request to fulfil Booking #{req.order_id} with your {req.offered_car_type.value.replace('_', ' ').title()} was approved - it's now assigned to you.",
            driver_id=str(req.driver_id),
            order_id=req.order_id,
        )
    except Exception as e:
        print(f"Substitution-approved notification failed (assignment still created): {e}")

    return {"status": "approved", "assignment_id": assignment.id if assignment else None}


@router.post("/admin/car-substitution-requests/{request_id}/reject")
def reject_car_substitution_request_endpoint(
    request_id: int,
    payload: SubstitutionRequestDecision,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    from app.crud.vehicle_matching import decide_substitution_request
    try:
        req, _ = decide_substitution_request(db, request_id, approve=False, admin_id=str(current_admin.id), notes=payload.notes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        from app.crud.notification import send_new_booking_notification_to_driver_sync
        send_new_booking_notification_to_driver_sync(
            db,
            title="Substitution Request Declined",
            message=f"Your request to fulfil Booking #{req.order_id} with your {req.offered_car_type.value.replace('_', ' ').title()} wasn't approved." + (f" {payload.notes}" if payload.notes else ""),
            driver_id=str(req.driver_id),
        )
    except Exception as e:
        print(f"Substitution-rejected notification failed (status still updated): {e}")

    return {"status": "rejected"}


# NOTE: This catch-all route MUST stay at the end of the file.
# If declared earlier, it shadows literal routes like /admin/notification-settings
# and /admin/vacant-cities ("notification-settings" gets parsed as admin_id -> UUID error).
@router.get("/admin/{admin_id}", response_model=AdminOut)
def get_admin_by_id_route(
    admin_id: str,
    current_admin = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get admin by ID (Admin only)

    Returns details of a specific admin account.
    Requires admin authentication.

    Returns:
        - Admin account details
    """
    try:
        if current_admin.role != "Owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the Owner can view admin details"
            )

        # This catch-all (see the file-position note above) swallows any
        # unmatched /admin/{anything} GET, including one that's just a
        # typo'd or not-yet-implemented sub-path (e.g. /admin/drivers -
        # found 2026-09-04, there's no such list route, only
        # /admin/drivers/{id}/... sub-resources, so a caller expecting a
        # driver list hit this instead). Admin.id is a UUID column -
        # anything non-UUID-shaped used to reach the DB and raise a raw
        # psycopg2 InvalidTextRepresentation, caught by the generic
        # except below only as an opaque 500. Same defensive-shape-check
        # pattern as get_current_user's fix earlier this session - a
        # clean 404 here is honest (there genuinely is no such admin, or
        # no such route) where a 500 was actively misleading.
        try:
            UUID(str(admin_id))
        except (ValueError, TypeError, AttributeError):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")

        admin = get_admin_by_id(db, admin_id)
        if not admin:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin not found"
            )

        return admin

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


class VendorBusinessNameUpdate(BaseModel):
    business_name: Optional[str] = None


@router.put("/admin/vendors/{vendor_id}/business-name")
def update_vendor_business_name(
    vendor_id: str,
    body: VendorBusinessNameUpdate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Shown to drivers/duty-drivers as "Vendor: X" instead of the vendor's
    personal name, wherever set (see crud/order_details.py,
    crud/order_assignments.py). Empty/null clears it back to full_name."""
    from app.models.vendor_details import VendorDetails
    details = db.query(VendorDetails).filter(VendorDetails.vendor_id == vendor_id).first()
    if not details:
        raise HTTPException(status_code=404, detail="Vendor not found")
    details.business_name = (body.business_name or "").strip() or None
    db.commit()
    return {"vendor_id": vendor_id, "business_name": details.business_name}


# ============ REFUND REQUESTS (Admin App mirror) ============
# Same underlying queue as admin/pages/refund-requests.php on the website
# (which calls the shared-secret /website/bookings/refund-requests and
# /website/bookings/{id}/process-refund endpoints in website_bookings.py) -
# this is the JWT-authenticated equivalent for the Admin App, both calling
# the same crud/refund_requests.py functions so there's one source of truth.

class AdminProcessRefundRequest(BaseModel):
    approve: bool
    refund_amount: Optional[int] = None
    notes: Optional[str] = None
    via_razorpay: bool = True


@router.post("/admin/refund-requests/{id}/process")
def admin_process_refund_request(
    id: UUID,
    body: AdminProcessRefundRequest,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    from app.crud.refund_requests import process_refund_request
    result = process_refund_request(db, id, body.approve, body.refund_amount, body.notes, body.via_razorpay)
    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=current_admin.id, admin_username=current_admin.username, admin_role=getattr(current_admin, 'role', None),
        action="REFUND_PROCESSED", target_type="customer_booking_request", target_id=str(id),
        target_name=result.get("customer_name"),
        details={"approve": body.approve, "refund_amount": body.refund_amount},
    )
    return result


# ============ URGENT UNASSIGNED BOOKING ALARM ============
# BookingAlarmHost.tsx has been calling this exact path since it shipped,
# but the route never existed on the backend - every poll silently 404'd
# and was swallowed by the frontend's .catch(() => []), so the "booking
# about to hit pickup time with no driver" half of that alarm never once
# fired (confirmed 2026-09-30; the "pending website approval" half above
# was fine, it hits a real endpoint). Threshold is owner-configurable via
# /admin/settings/system's booking_alarm_config JSON blob, same pattern as
# enquiry_alarm_config - default 60 minutes matches the frontend's old
# hardcoded "<1h to pickup" comment.

@router.get("/admin/urgent-unassigned-alarm-bookings")
def get_urgent_unassigned_alarm_bookings(
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    from app.models.orders import Order, Trip_status
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.models.platform_setting import PlatformSetting
    from app.crud.new_orders import _origin_and_destination_from_index_map
    import json as _json

    cfg_row = db.query(PlatformSetting).filter(PlatformSetting.key == "booking_alarm_config").first()
    try:
        cfg = _json.loads(cfg_row.value) if cfg_row else {}
    except Exception:
        cfg = {}
    threshold_minutes = int(cfg.get("booking_alarm_unassigned_threshold_minutes") or 60)

    if cfg.get("booking_alarm_enabled") is False:
        return []

    # This staff member opted out entirely - return nothing rather than make
    # the frontend filter it (mirrors the enquiry alarm's staff gate).
    staff_cfg = cfg.get("booking_alarm_staff") or {}
    if current_admin.role != "Owner" and staff_cfg.get(str(current_admin.id), {}).get("enabled") is False:
        return []

    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(minutes=threshold_minutes)

    rows = (
        db.query(Order, OrderAssignment)
        .join(OrderAssignment, Order.id == OrderAssignment.order_id)
        .filter(
            OrderAssignment.assignment_status == AssignmentStatusEnum.PENDING,
            Order.trip_status == Trip_status.PENDING,
            Order.start_date_time <= cutoff,
            # Skip badly-overdue rows - the separate auto-cancel sweep
            # (utils/unassigned_booking_expiry.py) handles those; this
            # alarm is for "about to happen", not "already missed".
            Order.start_date_time >= now - timedelta(hours=2),
        )
        .order_by(Order.start_date_time.asc())
        .all()
    )

    items = []
    for order, assignment in rows:
        try:
            origin, destination = _origin_and_destination_from_index_map(order.pickup_drop_location or {})
            route_str = f"{origin} → {destination}"
        except Exception:
            route_str = None
        mins_to_pickup = int((order.start_date_time - now).total_seconds() // 60)
        items.append({
            "id": str(order.id),
            "order_id": order.id,
            "customer_name": order.customer_name,
            "customer_number": order.customer_number,
            "pickup_drop_location": order.pickup_drop_location,
            "route_str": route_str,
            "trip_type": order.trip_type.value if hasattr(order.trip_type, "value") else str(order.trip_type),
            "car_type": order.car_type.value if hasattr(order.car_type, "value") else str(order.car_type),
            "start_date_time": order.start_date_time.isoformat() if order.start_date_time else None,
            "quoted_total_amount": order.vendor_price,
            "total_booking_amount": order.vendor_price,
            "source": order.source.value if hasattr(order.source, "value") else str(order.source),
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "is_urgent": mins_to_pickup <= 30,
            "mins_to_pickup": mins_to_pickup,
        })

    # Posted bookings NOBODY has accepted. Owner rule 2026-10-07: alarm the staff 2 hours before pickup; a booking posted
    # inside the last 4 hours rings once half of the time between posting and pickup has gone (posted 7 am for a 10 am pickup
    # -> rings 8:30). All three numbers live in booking_alarm_config so they can be changed without a deploy.
    try:
        from sqlalchemy import exists as _exists
        from app.crud.customer_booking_request import get_platform_setting_value as _gv
        before_min = int(float(_gv(db, "unaccepted_alarm_minutes_before", "120")))
        short_hours = float(_gv(db, "unaccepted_short_notice_hours", "4"))
        short_pct = float(_gv(db, "unaccepted_short_notice_percent", "50"))
        has_taker = _exists().where(
            OrderAssignment.order_id == Order.id,
            OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED,
        )
        open_orders = (
            db.query(Order)
            .filter(
                Order.trip_status == Trip_status.PENDING,
                Order.cancelled_by.is_(None),
                Order.start_date_time > now,
                Order.start_date_time <= now + timedelta(days=3),
                ~has_taker,
            )
            .order_by(Order.start_date_time.asc())
            .limit(60)
            .all()
        )
        seen = {i["order_id"] for i in items}
        for order in open_orders:
            if order.id in seen or not order.created_at:
                continue
            pickup, posted = order.start_date_time, order.created_at
            from app.crud.order_assignments import unaccepted_alarm_fire_at
            fire_at = unaccepted_alarm_fire_at(posted, pickup, before_min, short_hours, short_pct)
            if now < fire_at:
                continue
            try:
                origin, destination = _origin_and_destination_from_index_map(order.pickup_drop_location or {})
                route_str = f"{origin} → {destination}"
            except Exception:
                route_str = None
            mins_to_pickup = int((pickup - now).total_seconds() // 60)
            items.append({
                "id": str(order.id),
                "order_id": order.id,
                "customer_name": order.customer_name,
                "customer_number": order.customer_number,
                "pickup_drop_location": order.pickup_drop_location,
                "route_str": route_str,
                "trip_type": order.trip_type.value if hasattr(order.trip_type, "value") else str(order.trip_type),
                "car_type": order.car_type.value if hasattr(order.car_type, "value") else str(order.car_type),
                "start_date_time": pickup.isoformat(),
                "quoted_total_amount": order.vendor_price,
                "total_booking_amount": order.vendor_price,
                "source": order.source.value if hasattr(order.source, "value") else str(order.source),
                "created_at": posted.isoformat(),
                "is_urgent": mins_to_pickup <= 30,
                "mins_to_pickup": mins_to_pickup,
                "alarm_reason": "NOBODY_ACCEPTED",
                "alarm_title": "NOBODY HAS ACCEPTED THIS BOOKING",
                "alarm_subtitle": f"Pickup in {mins_to_pickup} mins - posted but no driver has accepted yet",
            })
    except Exception as _e:
        print(f"unaccepted booking alarm check failed (continuing): {_e}")
    return items


# ============ WEBSITE BOOKING APPROVALS (Admin App mirror) ============
# Bookings confirmed on the website sit PENDING in the backend and
# auto-approve after a configurable delay if nobody acts first - this lets
# an admin approve early or reject something suspicious before it ever
# posts to drivers. Same underlying queue as admin/pages/website-booking-
# approvals.php (crud/website_booking_approvals.py, shared with the
# website's shared-secret endpoints in website_bookings.py). Deliberately
# excludes enquiries/soft-leads (requires_manual_confirm=True) - those have
# their own separate inbox, see enquiries.tsx.

@router.get("/admin/website-bookings/pending")
def admin_list_pending_website_bookings(
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    from app.crud.website_booking_approvals import list_pending_website_bookings
    return list_pending_website_bookings(db)


@router.post("/admin/website-bookings/{id}/approve")
def admin_approve_website_booking(
    id: UUID,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    from app.crud.website_booking_approvals import approve_website_booking
    master_order = approve_website_booking(db, id, decided_by=current_admin.username)
    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=current_admin.id, admin_username=current_admin.username, admin_role=getattr(current_admin, 'role', None),
        action="WEBSITE_BOOKING_APPROVED", target_type="customer_booking_request", target_id=str(id),
        target_name=master_order.customer_name,
        details={"order_id": master_order.id},
    )
    return {"status": "APPROVED", "order_id": master_order.id}


class WebsiteBookingBulkApprove(BaseModel):
    ids: List[UUID]


@router.post("/admin/website-bookings/bulk-approve")
def admin_bulk_approve_website_bookings(
    body: WebsiteBookingBulkApprove,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Post exactly the bookings the staff selected (the "select all" button just sends every id)."""
    from app.crud.website_booking_approvals import bulk_approve_website_bookings
    if not body.ids:
        raise HTTPException(status_code=400, detail="Select at least one booking")
    if len(body.ids) > 200:
        raise HTTPException(status_code=400, detail="Select at most 200 bookings at a time")
    result = bulk_approve_website_bookings(db, list(dict.fromkeys(body.ids)), decided_by=current_admin.username)
    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=current_admin.id, admin_username=current_admin.username, admin_role=getattr(current_admin, 'role', None),
        action="BULK_WEBSITE_BOOKINGS_APPROVED", target_type="customer_booking_request", target_id="BULK",
        details={"approved_count": len(result["approved"]), "failed_count": len(result["failed"]),
                 "order_ids": [a["order_id"] for a in result["approved"]]},
    )
    return {"status": "SUCCESS", "approved_count": len(result["approved"]), **result}


class WebsiteBookingHold(BaseModel):
    minutes: int = 30


@router.post("/admin/website-bookings/{id}/hold")
def admin_hold_website_booking(
    id: UUID,
    body: WebsiteBookingHold,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Pause the auto-post of one booking while staff talk to the customer (max 120 min, never past pickup - 2 hrs)."""
    from app.models.customer_booking_request import CustomerBookingRequest
    from app.crud.website_post_rules import set_hold
    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    until = set_hold(db, request, body.minutes)
    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=current_admin.id, admin_username=current_admin.username, admin_role=getattr(current_admin, 'role', None),
        action="WEBSITE_BOOKING_HELD", target_type="customer_booking_request", target_id=str(id),
        target_name=request.customer_name, details={"hold_until": until.isoformat()},
    )
    return {"id": str(id), "hold_until": until}


@router.post("/admin/website-bookings/{id}/release-hold")
def admin_release_website_booking_hold(
    id: UUID,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    from app.models.customer_booking_request import CustomerBookingRequest
    request = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    request.hold_until = None
    db.commit()
    return {"id": str(id), "hold_until": None}


@router.post("/admin/website-bookings/approve-all")
def admin_approve_all_website_bookings(
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    from app.models.customer_booking_request import CustomerBookingRequest
    from app.crud.website_booking_approvals import approve_website_booking
    
    pending_bookings = (
        db.query(CustomerBookingRequest)
        .filter(CustomerBookingRequest.status == "PENDING")
        .filter(CustomerBookingRequest.requires_manual_confirm == False)  # noqa: E712 - enquiries are confirmed on their own
        .all()
    )
    
    approved_count = 0
    order_ids = []
    
    for booking in pending_bookings:
        try:
            master_order = approve_website_booking(db, booking.id, decided_by=current_admin.username)
            approved_count += 1
            order_ids.append(master_order.id)
        except Exception as e:
            print(f"Failed to auto-approve booking {booking.id}: {e}")
            
    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=current_admin.id, admin_username=current_admin.username, admin_role=getattr(current_admin, 'role', None),
        action="BULK_WEBSITE_BOOKINGS_APPROVED", target_type="customer_booking_request", target_id="BULK",
        details={"approved_count": approved_count, "order_ids": order_ids},
    )
    
    return {
        "status": "SUCCESS",
        "approved_count": approved_count,
        "order_ids": order_ids,
        "message": f"Successfully approved and posted {approved_count} confirmed bookings to all apps."
    }



class AdminWebsiteBookingReject(BaseModel):
    reason: str


@router.post("/admin/website-bookings/{id}/reject")
def admin_reject_website_booking(
    id: UUID,
    body: AdminWebsiteBookingReject,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    from app.crud.website_booking_approvals import reject_website_booking
    result = reject_website_booking(db, id, body.reason)
    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=current_admin.id, admin_username=current_admin.username, admin_role=getattr(current_admin, 'role', None),
        action="WEBSITE_BOOKING_REJECTED", target_type="customer_booking_request", target_id=str(id),
        details={"reason": body.reason},
    )
    return result


# --- Section 5: Subscription Visibility & Profile Edit Review Queue ---

class SubmitProfileEditSchema(BaseModel):
    user_id: str
    user_type: str  # "FLEET_OWNER" | "DRIVER"
    user_name: Optional[str] = None
    user_phone: Optional[str] = None
    # Must exactly match a real column name on the target model - the
    # approve endpoint below does setattr(model, field_name, ...), a
    # mismatch silently no-ops instead of erroring. FLEET_OWNER
    # (VehicleOwnerDetails): "bank_account_number" | "bank_ifsc" |
    # "pan_number" | "aadhar_number". DRIVER (CarDriver): "licence_number"
    # (British spelling - not "license_number", that column doesn't exist).
    field_name: str
    old_value: Optional[str] = None
    proposed_value: str
    proof_document_url: Optional[str] = None


@router.post("/profile-edit-requests/submit", dependencies=[Depends(get_current_user_flexible)])
def submit_profile_edit_request(
    payload: SubmitProfileEditSchema,
    db: Session = Depends(get_db),
):
    """
    Submits a sensitive profile edit (bank account, IFSC, DL, Aadhaar, PAN, Name, Mobile, Email) to the Admin Review Queue.
    Live record is NOT updated until Admin approval.
    """
    from app.models.profile_edit_review import ProfileEditReview

    # Check if a PENDING request for this field already exists for this user
    existing = db.query(ProfileEditReview).filter(
        ProfileEditReview.user_id == payload.user_id,
        ProfileEditReview.field_name == payload.field_name,
        ProfileEditReview.status == "PENDING"
    ).first()

    if existing:
        existing.old_value = payload.old_value
        existing.proposed_value = payload.proposed_value
        existing.proof_document_url = payload.proof_document_url
        if payload.user_name:
            existing.user_name = payload.user_name
        if payload.user_phone:
            existing.user_phone = payload.user_phone
        db.commit()
        db.refresh(existing)
        return {
            "success": True,
            "message": f"Updated existing edit request for '{payload.field_name}'.",
            "request_id": existing.id,
            "status": existing.status,
        }

    review = ProfileEditReview(
        user_id=payload.user_id,
        user_type=payload.user_type,
        user_name=payload.user_name,
        user_phone=payload.user_phone,
        field_name=payload.field_name,
        old_value=payload.old_value,
        proposed_value=payload.proposed_value,
        proof_document_url=payload.proof_document_url,
        status="PENDING",
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    return {
        "success": True,
        "message": f"Profile edit request for '{payload.field_name}' submitted for Admin Review.",
        "request_id": review.id,
        "status": review.status,
    }


@router.get("/profile-edit-requests/my-requests/{user_id}")
def get_user_profile_edit_requests(
    user_id: str,
    db: Session = Depends(get_db),
    who=Depends(get_current_user_flexible),
):
    """Fetch all pending profile edit requests for a specific user ID (own only, or admin)."""
    if who["role"] != "ADMIN" and str(who["user_id"]) != str(user_id):
        raise HTTPException(status_code=403, detail="You can only view your own requests")
    from app.models.profile_edit_review import ProfileEditReview
    reviews = db.query(ProfileEditReview).filter(
        ProfileEditReview.user_id == user_id,
        ProfileEditReview.status == "PENDING"
    ).all()
    
    return {
        "pending_fields": [r.field_name for r in reviews],
        "requests": [
            {
                "id": r.id,
                "field_name": r.field_name,
                "old_value": r.old_value,
                "proposed_value": r.proposed_value,
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reviews
        ]
    }


class ProcessProfileEditSchema(BaseModel):
    admin_notes: Optional[str] = None


@router.post("/admin/profile-edit-reviews/{request_id}/approve")
def approve_profile_edit_request(
    request_id: int,
    payload: ProcessProfileEditSchema,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Approve a profile edit request and update live database record across models."""
    from datetime import timezone, datetime
    from app.models.profile_edit_review import ProfileEditReview
    from app.models.car_driver import CarDriver
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.models.vehicle_owner import VehicleOwnerCredentials

    review = db.query(ProfileEditReview).filter(ProfileEditReview.id == request_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review request not found.")

    if review.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Request is already {review.status}.")

    review.status = "APPROVED"
    review.admin_notes = payload.admin_notes
    review.processed_by = current_admin.username
    review.processed_at = datetime.now(timezone.utc)

    # Apply proposed change to live record
    applied = False
    field = review.field_name
    val = review.proposed_value

    if review.user_type == "FLEET_OWNER":
        vod = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == review.user_id).first()
        voc = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == review.user_id).first()

        if field == "full_name":
            if vod:
                vod.full_name = val
                applied = True
            if voc and hasattr(voc, "full_name"):
                voc.full_name = val
                applied = True
        elif field == "business_name":
            if vod and hasattr(vod, "business_name"):
                vod.business_name = val
                applied = True
        elif field in ("primary_number", "mobile_number", "phone_number"):
            if vod:
                vod.primary_number = val
                applied = True
            if voc:
                voc.primary_number = val
                applied = True
        elif field in ("secondary_number", "alternate_number"):
            if vod:
                vod.secondary_number = val
                applied = True
        elif field == "email":
            if voc:
                voc.email = val
                voc.email_verified = True
                applied = True
        else:
            if vod and hasattr(vod, field):
                setattr(vod, field, val)
                applied = True

    elif review.user_type == "DRIVER":
        cd = db.query(CarDriver).filter(CarDriver.id == review.user_id).first()
        if cd:
            if field == "full_name":
                cd.full_name = val
                applied = True
            elif field in ("primary_number", "mobile_number", "phone_number"):
                cd.phone_number = val
                applied = True
            elif hasattr(cd, field):
                setattr(cd, field, val)
                applied = True

    db.commit()

    if not applied:
        return {
            "success": False,
            "message": f"Marked APPROVED, but '{review.field_name}' could not be mapped to user record. Check field name.",
        }

    return {"success": True, "message": f"Approved profile edit for '{review.field_name}'. Live profile updated."}


@router.post("/admin/profile-edit-reviews/{request_id}/reject")
def reject_profile_edit_request(
    request_id: int,
    payload: ProcessProfileEditSchema,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Reject a profile edit request without changing live database record."""
    from datetime import timezone
    from app.models.profile_edit_review import ProfileEditReview

    review = db.query(ProfileEditReview).filter(ProfileEditReview.id == request_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review request not found.")

    review.status = "REJECTED"
    review.admin_notes = payload.admin_notes
    review.processed_by = current_admin.username
    review.processed_at = datetime.now(timezone.utc)

    db.commit()
    return {"success": True, "message": f"Rejected profile edit request for '{review.field_name}'."}


class AdminCancelOrderSchema(BaseModel):
    reason: Optional[str] = "Cancelled by Customer via Admin"


class RemoveDriverWithPenaltySchema(BaseModel):
    penalty_amount: float
    reason: str


def check_cancellation_role_permissions(admin) -> bool:
    role = (getattr(admin, "role", "") or "").lower()
    if role in ("manager", "owner", "founder"):
        return True
    perms = [str(p).lower() for p in (getattr(admin, "permissions", []) or [])]
    if any(p in perms for p in ("manager", "owner", "founder", "cancel_booking", "booking_cancellation")):
        return True
    return False


@router.post("/admin/orders/{order_id}/permanent-delete")
def admin_permanently_delete_booking(
    order_id: int,
    confirm_money: bool = Query(False, description="Also delete a booking whose wallet entries already exist"),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """OWNER ONLY. Removes a booking completely (for test bookings): its assignments, trip record, chat, reviews, and the
    booking rows themselves. Wallet history is NOT rewritten - if this booking already moved money the call is refused
    unless confirm_money=true, and those wallet entries then simply stay in the history without a booking."""
    require_owner(current_admin)
    from sqlalchemy import text as _t
    from app.models.orders import Order
    from app.models.order_assignments import OrderAssignment

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if db.query(OrderAssignment).filter(OrderAssignment.order_id == order_id, OrderAssignment.assignment_status == "DRIVING").first():
        raise HTTPException(status_code=400, detail="A trip is running on this booking - cancel it first.")

    def _count(sql):
        try:
            return int(db.execute(_t(sql), {"oid": order_id, "ostr": str(order_id)}).scalar() or 0)
        except Exception:
            db.rollback()
            return 0
    money = (
        _count("SELECT COUNT(*) FROM wallet_ledger WHERE reference_id = :ostr")
        + _count("SELECT COUNT(*) FROM vendor_wallet_ledger WHERE order_id = :oid")
        + _count("SELECT COUNT(*) FROM admin_wallet_ledger WHERE order_id = :oid")
    )
    if money and not confirm_money:
        raise HTTPException(
            status_code=409,
            detail={"error": "HAS_MONEY", "entries": money,
                    "message": f"This booking already moved money ({money} wallet entries). Deleting it keeps that wallet history but the booking disappears. Confirm to delete anyway."},
        )

    src = (order.source.value if hasattr(order.source, "value") else str(order.source), order.source_order_id)
    steps = [
        "DELETE FROM booking_chat_messages WHERE order_id = :oid",
        "DELETE FROM trip_reviews WHERE order_id = :oid",
        "DELETE FROM ratings WHERE order_id = :oid",
        "DELETE FROM end_records WHERE order_id = :oid",
        "DELETE FROM vehicle_mismatch_attempts WHERE order_id = :oid",
        "DELETE FROM car_substitution_requests WHERE order_id = :oid",
        "DELETE FROM order_assignments WHERE order_id = :oid",
        "UPDATE drop_bid_requests SET order_id = NULL WHERE order_id = :oid",
        "UPDATE admin_wallet_ledger SET order_id = NULL WHERE order_id = :oid",
        "UPDATE vendor_wallet_ledger SET order_id = NULL WHERE order_id = :oid",
        "UPDATE customer_booking_requests SET linked_order_id = NULL WHERE linked_order_id = :oid",
        "DELETE FROM notification_log WHERE related_order_id = :oid",
    ]
    for sql in steps:
        try:
            with db.begin_nested():
                db.execute(_t(sql), {"oid": order_id})
        except Exception as e:  # a table that does not exist in this environment is fine
            print(f"permanent-delete step skipped ({sql.split()[2]}): {str(e).splitlines()[0]}")
    db.execute(_t("DELETE FROM orders WHERE id = :oid"), {"oid": order_id})
    try:
        if src[0].endswith("NEW_ORDERS"):
            db.execute(_t("DELETE FROM new_orders WHERE order_id = :n"), {"n": src[1]})
        elif src[0].endswith("HOURLY_RENTAL"):
            db.execute(_t("DELETE FROM hourly_rental WHERE id = :n"), {"n": src[1]})
    except Exception as e:
        print(f"permanent-delete source row not removed: {e}")
    db.commit()

    try:
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="ORDER_PERMANENTLY_DELETED", target_type="order", target_id=str(order_id), target_name=f"Booking #{order_id}",
            details={"had_money_entries": money},
        )
    except Exception:
        pass
    return {"status": "DELETED", "order_id": order_id, "had_money_entries": money}


class CustomerNumberSwitchRequest(BaseModel):
    show: bool


@router.patch("/admin/orders/{order_id}/customer-visibility")
def admin_set_customer_number_visibility(
    order_id: int,
    payload: CustomerNumberSwitchRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Manual "Show customer number to the driver" switch for any booking (admin)."""
    from app.models.orders import Order
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")
    order.data_visibility_vehicle_owner = bool(payload.show)
    db.commit()
    return {"order_id": order.id, "customer_number_visible": bool(order.data_visibility_vehicle_owner)}


@router.post("/admin/orders/{order_id}/cancel-by-admin")
def admin_cancel_booking_by_customer(
    order_id: int,
    payload: AdminCancelOrderSchema = Body(...),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Restricted standard cancellation ("Cancelled by Customer").
    Restricted to Manager, Owner, or Founder roles.
    Returns HTTP 403 Forbidden if admin lacks authorized role.
    """
    if not check_cancellation_role_permissions(current_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Managers, Owners, or Founders can cancel bookings without penalty"
        )

    from app.models.orders import Order, Trip_status, CancelledByEnum
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.crud.admin_activity_log import log_admin_action
    from app.crud.wallet import credit_wallet

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

    reason = payload.reason.strip() if payload.reason else "Cancelled by Customer via Admin"

    # trip_status is a 3-value DB enum (PENDING/COMPLETED/CANCELLED) - the
    # granular "who/why" lives only in cancelled_by (its own 5-value enum).
    # Was assigning Trip_status.CANCELLED_BY_CUSTOMER, a Python enum member
    # with no matching Postgres value, which crashed this endpoint with a
    # 500 DataError every time it ran.
    order.trip_status = Trip_status.CANCELLED
    order.cancelled_by = CancelledByEnum.CANCELLED_BY_CUSTOMER
    order.cancel_note = reason

    active_assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.assignment_status.notin_([AssignmentStatusEnum.CANCELLED, AssignmentStatusEnum.COMPLETED])
    ).first()

    if active_assignment:
        active_assignment.assignment_status = AssignmentStatusEnum.CANCELLED
        active_assignment.cancelled_at = datetime.utcnow()
        active_assignment.cancel_note = reason

        if active_assignment.held_amount and active_assignment.held_amount > 0 and active_assignment.vehicle_owner_id:
            try:
                credit_wallet(
                    db,
                    vehicle_owner_id=str(active_assignment.vehicle_owner_id),
                    amount=active_assignment.held_amount,
                    reference_id=str(order.id),
                    reference_type="TRIP_HOLD_REFUND",
                    notes=f"Hold refunded due to customer cancellation via Admin on Booking #{order.id}"
                )
            except Exception as e:
                print(f"Hold refund notice: {e}")

    from app.crud.wallet import release_poster_advance_hold
    release_poster_advance_hold(db, order, "booking cancelled by admin")

    db.commit()

    log_admin_action(
        db,
        admin_id=str(current_admin.id),
        admin_username=current_admin.username,
        admin_role=current_admin.role,
        action="ORDER_CANCELLED_BY_ADMIN_AS_CUSTOMER",
        target_type="order",
        target_id=str(order.id),
        target_name=f"Booking #{order.id}",
        details={
            "reason": reason,
            "customer_name": order.customer_name,
            "customer_number": order.customer_number,
        }
    )

    return {
        "status": "SUCCESS",
        "message": f"Booking #{order_id} explicitly set to CANCELLED_BY_CUSTOMER.",
        "order_id": order.id,
        "trip_status": order.trip_status,
        "cancelled_by": order.cancelled_by,
    }


@router.post("/admin/orders/{order_id}/remove-driver-with-penalty")
def remove_driver_with_penalty_endpoint(
    order_id: int,
    payload: RemoveDriverWithPenaltySchema = Body(...),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    "Remove Driver with Penalty" endpoint.
    - Keeps Order alive (does NOT cancel order; trip_status stays PENDING for dispatch feed).
    - Updates active order_assignments record: status = CANCELLED_BY_ADMIN or CANCELLED.
    - Clears assigned driver/car pointers so order returns to pending dispatch pool.
    - Deducts penalty_amount from assigned Fleet Owner's / Driver's wallet.
    - Inserts WalletLedger / WalletTransaction record with type="PENALTY_UNALLOCATION".
    - Logs AdminActivityLog with action="DRIVER_REMOVED_WITH_PENALTY".
    """
    from app.models.orders import Order, Trip_status
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.models.car_driver import CarDriver
    from app.crud.wallet import debit_wallet_allow_negative
    from app.crud.admin_activity_log import log_admin_action

    penalty = int(payload.penalty_amount)
    if penalty <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Penalty amount must be greater than zero.")

    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mandatory removal reason is required.")

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

    active_assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.assignment_status.notin_([AssignmentStatusEnum.CANCELLED, AssignmentStatusEnum.COMPLETED])
    ).first()

    target_vo_id = None
    if active_assignment:
        target_vo_id = str(active_assignment.vehicle_owner_id)
        active_assignment.assignment_status = AssignmentStatusEnum.CANCELLED
        active_assignment.cancelled_at = datetime.utcnow()
        # Order stays PENDING for redispatch (see below) so Order.cancelled_by
        # never reflects this - record it on the assignment itself instead,
        # same as the auto-timeout path, so Executed shows "Unallocated".
        active_assignment.cancel_reason = "REMOVED_WITH_PENALTY"
        active_assignment.cancel_note = reason
    elif order.target_driver_id:
        driver = db.query(CarDriver).filter(CarDriver.id == order.target_driver_id).first()
        if driver and driver.vehicle_owner_id:
            target_vo_id = str(driver.vehicle_owner_id)

    if not target_vo_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active driver or fleet owner assignment found on this booking to penalize."
        )

    # Keep Order alive & unallocated
    order.trip_status = Trip_status.PENDING
    order.target_driver_id = None

    # Deduct penalty from wallet
    new_balance, ledger_entry = debit_wallet_allow_negative(
        db,
        vehicle_owner_id=target_vo_id,
        amount=penalty,
        reference_id=str(order.id),
        reference_type="PENALTY_UNALLOCATION",
        notes=f"Driver removed with penalty for Booking #{order.id}: {reason}"
    )

    db.commit()

    log_admin_action(
        db,
        admin_id=str(current_admin.id),
        admin_username=current_admin.username,
        admin_role=current_admin.role,
        action="DRIVER_REMOVED_WITH_PENALTY",
        target_type="order",
        target_id=str(order.id),
        target_name=f"Booking #{order.id}",
        details={
            "penalty_amount": penalty,
            "reason": reason,
            "vehicle_owner_id": target_vo_id,
            "new_wallet_balance": new_balance,
        }
    )

    return {
        "status": "SUCCESS",
        "message": f"Driver unallocated with ₹{penalty} penalty. Order #{order_id} returned to dispatch pool.",
        "order_id": order.id,
        "trip_status": "PENDING",
        "assignment_status": "UNALLOCATED",
        "penalty_amount": penalty,
        "wallet_balance_after": new_balance,
    }


# Dynamic Admin System Settings (Hardcode-free system configuration)
from pydantic import BaseModel
from app.crud.system_settings import get_all_system_settings, update_system_settings

class SystemSettingsUpdateSchema(BaseModel):
    registration_fee: Optional[int] = None
    platform_commission_pct: Optional[int] = None
    gps_spoof_speed_kmh: Optional[int] = None
    otp_rate_limit_max: Optional[int] = None
    driver_search_radius_km: Optional[int] = None
    yearly_fee: Optional[int] = None
    monthly_fee: Optional[int] = None
    suspend_threshold: Optional[int] = None
    driver_auto_acceptance_timeout_minutes: Optional[int] = None
    phone_reveal_hours_before_pickup: Optional[float] = None
    gst_number: Optional[str] = None
    gst_business_name: Optional[str] = None
    gst_business_address: Optional[str] = None
    platform_fee_pct: Optional[float] = None
    platform_share_pct: Optional[float] = None
    platform_share_min: Optional[int] = None
    commission_min: Optional[int] = None
    convenience_fee: Optional[int] = None
    platform_all_inclusive_pct: Optional[float] = None
    min_driver_hold: Optional[int] = None
    drop_bid_fee_pct: Optional[float] = None
    # How confirmed website bookings reach the driver apps: MANUAL | AUTO | AUTO_IF_NO_STAFF
    website_booking_post_mode: Optional[str] = None
    ai_bot_enabled: Optional[int] = None            # 1 = Help Bot answers with the AI model (needs GEMINI_API_KEY / ANTHROPIC_API_KEY on the server)
    ai_bot_daily_limit: Optional[int] = None         # AI answers per user per day (cost guard)
    ai_bot_global_daily_limit: Optional[int] = None  # AI answers for everyone per day (cost guard)
    doc_ai_enabled: Optional[int] = None             # 1 = AI (Gemini vision) reads uploaded document photos; sends the photo to Google - paid tier only
    doc_ai_daily_limit: Optional[int] = None
    unaccepted_alarm_minutes_before: Optional[int] = None
    unaccepted_short_notice_hours: Optional[float] = None
    unaccepted_short_notice_percent: Optional[float] = None
    urgent_reminder_max_count: Optional[int] = None
    trip_otp_enforced: Optional[int] = None
    multicity_waiting_rate_per_hour: Optional[float] = None
    multicity_waiting_free_minutes: Optional[int] = None
    fleet_payment_channels: Optional[str] = None
    fleet_payment_link_message: Optional[str] = None
    fleet_payment_link_expiry_hours: Optional[str] = None
    staff_permission_keys: Optional[str] = None


@router.get("/admin/settings/system")
@router.get("/admin/system-settings")
def get_system_settings_endpoint(
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Retrieve dynamic platform configuration settings."""
    from app.models.admin import Admin as _Admin
    result = get_all_system_settings(db)
    from app.crud.website_post_rules import staff_present_count
    result["staff_on_duty_count"] = staff_present_count(db)
    result["staff_switched_on_count"] = db.query(_Admin).filter(_Admin.is_on_duty.is_(True)).count()
    return result


@router.post("/admin/settings/system")
@router.put("/admin/settings/system")
@router.post("/admin/system-settings")
@router.put("/admin/system-settings")
def update_system_settings_endpoint(
    body: SystemSettingsUpdateSchema,
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Update dynamic platform configuration settings."""
    updates = body.dict(exclude_unset=True)
    # The money settings (commission / fees / hold), plus the GST/business
    # identity printed on every tax invoice, can only be changed by the
    # Owner account - same "Owner Change" pattern as the fee settings.
    _owner_only = {
        "platform_fee_pct", "platform_all_inclusive_pct", "min_driver_hold", "platform_commission_pct", "drop_bid_fee_pct",
        "platform_share_pct", "platform_share_min", "commission_min", "convenience_fee", "website_booking_post_mode",
        "ai_bot_enabled", "ai_bot_daily_limit", "ai_bot_global_daily_limit", "doc_ai_enabled", "doc_ai_daily_limit",
        "gst_number", "gst_business_name", "gst_business_address",
        "fleet_payment_channels", "fleet_payment_link_message", "fleet_payment_link_expiry_hours", "staff_permission_keys",
        "trip_otp_enforced", "multicity_waiting_rate_per_hour", "multicity_waiting_free_minutes",
    }
    if any(k in updates for k in _owner_only):
        require_owner(current_admin)
        for k in ("platform_fee_pct", "platform_share_pct", "platform_all_inclusive_pct", "drop_bid_fee_pct"):
            if k in updates and updates[k] is not None and not (0 <= float(updates[k]) <= 50):
                raise HTTPException(status_code=400, detail=f"{k} must be between 0 and 50")
        if updates.get("min_driver_hold") is not None and updates["min_driver_hold"] < 0:
            raise HTTPException(status_code=400, detail="min_driver_hold can't be negative")
        for k in ("platform_share_min", "commission_min", "convenience_fee"):
            if updates.get(k) is not None and not (0 <= int(updates[k]) <= 5000):
                raise HTTPException(status_code=400, detail=f"{k} must be between 0 and 5000")
        if updates.get("website_booking_post_mode") is not None:
            mode = str(updates["website_booking_post_mode"]).strip().upper()
            if mode not in ("MANUAL", "AUTO", "AUTO_IF_NO_STAFF"):
                raise HTTPException(status_code=400, detail="website_booking_post_mode must be MANUAL, AUTO or AUTO_IF_NO_STAFF")
            updates["website_booking_post_mode"] = mode
        if updates.get("fleet_payment_link_message") is not None and "{link}" not in str(updates["fleet_payment_link_message"]):
            raise HTTPException(status_code=400, detail="The WhatsApp message must contain {link} where the payment link goes")
        if updates.get("fleet_payment_link_expiry_hours") is not None:
            try:
                if not (1 <= int(str(updates["fleet_payment_link_expiry_hours"]).strip()) <= 720):
                    raise ValueError
            except ValueError:
                raise HTTPException(status_code=400, detail="Link expiry must be a whole number of hours between 1 and 720")
        if updates.get("gst_number"):
            gstin = str(updates["gst_number"]).strip().upper()
            import re as _re
            if not _re.match(r"^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$", gstin):
                raise HTTPException(status_code=400, detail="That doesn't look like a valid 15-character GSTIN")
            updates["gst_number"] = gstin
    updated = update_system_settings(db, updates)
    return {
        "status": "SUCCESS",
        "message": "Platform settings updated successfully",
        "settings": updated
    }


@router.get("/public/gst-business-info")
def get_public_gst_business_info(db: Session = Depends(get_db)):
    """No auth - the Website's invoice-gst.php (a separate PHP app with no
    admin login) calls this to print the real, Owner-set GSTIN/business
    name/address on every tax invoice instead of a hardcoded placeholder.
    Only ever returns these 3 already-public-on-every-invoice fields -
    nothing sensitive."""
    settings = get_all_system_settings(db)
    return {
        "gst_number": settings.get("gst_number", ""),
        "business_name": settings.get("gst_business_name", "Drop Cars"),
        "business_address": settings.get("gst_business_address", ""),
    }


# Granular Admin RBAC System
NAMED_ROLES = {
    "SUPER_ADMIN": {"label": "Super Admin (Owner)", "permissions": ["bookings", "customers", "fleet", "finance", "approvals", "verifications", "account_activations", "payment_release", "tax_accounts"]},
    "OPS_MANAGER": {"label": "Operations Manager", "permissions": ["bookings", "fleet", "approvals", "account_activations", "verifications"]},
    "FINANCE_ADMIN": {"label": "Finance Admin", "permissions": ["finance", "payment_release", "tax_accounts"]},
    "DISPATCHER": {"label": "Dispatcher", "permissions": ["bookings", "fleet", "account_activations"]},
    "SUPPORT_AGENT": {"label": "Support Agent", "permissions": ["bookings", "customers", "fleet", "verifications"]},
}


@router.get("/admin/rbac/roles")
def get_rbac_roles_endpoint(current_admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Retrieve all defined named roles and available permissions for RBAC management."""
    return {
        "roles": NAMED_ROLES,
        "available_permissions": sorted(allowed_staff_permissions(db))
    }


@router.put("/admin/staff/{admin_id}/role")
def update_staff_role_endpoint(
    admin_id: UUID,
    role_name: str = Body(..., embed=True),
    custom_permissions: Optional[List[str]] = Body(None, embed=True),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Update a staff member's named role and permission matrix."""
    if current_admin.role != "Owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the Owner can update staff roles and permissions"
        )
    target_admin = get_admin_by_id(db, admin_id)
    if not target_admin:
        raise HTTPException(status_code=404, detail="Admin user not found")

    if role_name in NAMED_ROLES:
        target_admin.role = "Owner" if role_name == "SUPER_ADMIN" else role_name
        target_admin.permissions = custom_permissions if custom_permissions is not None else NAMED_ROLES[role_name]["permissions"]
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role_name '{role_name}'. Must be one of: {list(NAMED_ROLES.keys())}"
        )

    db.commit()
    db.refresh(target_admin)
    return {
        "status": "SUCCESS",
        "id": str(target_admin.id),
        "username": target_admin.username,
        "role": target_admin.role,
        "permissions": target_admin.permissions
    }


@router.post("/admin/vacant-cities/escalate-check")
async def trigger_vacant_city_escalation_endpoint(
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Trigger automated check & push notifications for vacant/unassigned city orders approaching deadline."""
    from app.services.vacant_city_escalation import check_and_escalate_vacant_city_orders
    return await check_and_escalate_vacant_city_orders(db)


@router.get("/admin/live-fleet-map")
def get_live_fleet_map_data(
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """Drivers who are online or on a trip right now, with real status and -
    for drivers on a trip - their real last GPS fix from the trip-link
    (order_assignments.last_lat/last_lng). Rewritten 2026-09-30: the old
    version queried CarDriver/Order fields that don't exist (first_name,
    is_active, approval_status, latitude, Order.quick_driver_id, Order.status)
    so every call errored, and it filled in fake Chennai coordinates."""
    from app.models.car_driver import CarDriver, AccountStatusEnum as DriverStatus
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.models.car_details import CarDetails
    from sqlalchemy import or_, false as sa_false

    active = db.query(OrderAssignment).filter(
        OrderAssignment.assignment_status.in_([AssignmentStatusEnum.ASSIGNED, AssignmentStatusEnum.DRIVING]),
        OrderAssignment.driver_id.isnot(None),
    ).all()
    active_by_driver = {}
    for a in active:
        cur = active_by_driver.get(a.driver_id)
        # Prefer the trip actually in progress over one merely assigned.
        if not cur or (a.assignment_status == AssignmentStatusEnum.DRIVING and cur.assignment_status != AssignmentStatusEnum.DRIVING):
            active_by_driver[a.driver_id] = a

    drivers = db.query(CarDriver).filter(
        or_(
            CarDriver.driver_status.in_([DriverStatus.ONLINE, DriverStatus.DRIVING]),
            CarDriver.id.in_(list(active_by_driver.keys())) if active_by_driver else sa_false(),
        )
    ).all()
    car_ids = {a.car_id for a in active_by_driver.values() if a.car_id}
    cars = {c.id: c for c in db.query(CarDetails).filter(CarDetails.id.in_(car_ids)).all()} if car_ids else {}

    def _f(v):
        try:
            return float(v) if v not in (None, "") else None
        except (TypeError, ValueError):
            return None

    fleet = []
    for d in drivers:
        a = active_by_driver.get(d.id)
        car = cars.get(a.car_id) if a and a.car_id else None
        fleet.append({
            "id": str(d.id),
            "driver_name": d.full_name or "Driver",
            "phone": d.primary_number,
            "vehicle_number": car.car_number if car else "N/A",
            "vehicle_type": (car.car_type.value if car and hasattr(car.car_type, "value") else (str(car.car_type) if car else "")),
            "city": d.city or "",
            "status": "ON_TRIP" if a else "AVAILABLE",
            "wallet_balance": float(d.wallet_balance or 0),
            "rating": float(d.rating_avg or 0),
            "latitude": _f(a.last_lat) if a else None,
            "longitude": _f(a.last_lng) if a else None,
            "location_updated_at": a.last_location_at.isoformat() if a and a.last_location_at else None,
            "active_trip_id": str(a.order_id) if a else None,
        })
    fleet.sort(key=lambda x: (x["status"] != "ON_TRIP", x["driver_name"].lower()))
    return {"status": "SUCCESS", "total_active": len(fleet), "fleet": fleet}


@router.post("/admin/calculate-route")
def calculate_route_distance_and_toll(
    pickup_city: str = Body(..., embed=True),
    drop_city: str = Body(..., embed=True),
    vehicle_type: str = Body("SEDAN_4_PLUS_1", embed=True),
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Auto-calculates distance km, travel time, and toll fees between pickup and drop cities.
    Admin-only (was public with no auth). Note the fallback distance/tolls
    are rough estimates, not real routing - nothing in the apps calls this
    today; real quotes use the route_distances cache + Maps in create-booking."""
    # Basic distance estimation logic or DB route distance fallback
    from app.models.route_distance import RouteDistance

    p_clean = pickup_city.strip().lower()
    d_clean = drop_city.strip().lower()

    route = db.query(RouteDistance).filter(
        RouteDistance.origin_city.ilike(p_clean),
        RouteDistance.destination_city.ilike(d_clean)
    ).first()

    if route and route.distance_km:
        distance_km = float(route.distance_km)
    else:
        # Fallback estimation based on text length hashing or default 320 km
        distance_km = 320.0

    duration_hours = round(distance_km / 60.0, 1)
    estimated_tolls = 450.0 if distance_km > 100 else 120.0 if distance_km > 40 else 0.0

    return {
        "pickup_city": pickup_city,
        "drop_city": drop_city,
        "distance_km": distance_km,
        "duration_hours": duration_hours,
        "estimated_tolls": estimated_tolls,
        "suggested_cost_per_km": 14.0 if "SUV" in vehicle_type.upper() else 12.0
    }


@router.post("/admin/orders/{order_id}/notify")
async def admin_notify_order(
    order_id: int,
    current_admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Re-send the new-booking alert for any open booking (the one automatic
    push at posting time is easy to miss). Pings the accepted fleet driver
    if there is one, otherwise re-broadcasts on the urgent channel. No
    cooldown - see crud/orders.py's notify_order_manually."""
    from app.crud.orders import notify_order_manually
    try:
        result = await notify_order_manually(db, order_id, actor="admin")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    try:
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(
            db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
            action="BOOKING_DRIVERS_NOTIFIED", target_type="order", target_id=str(order_id),
        )
    except Exception:
        pass
    return result
from pydantic import BaseModel as _MapsKeyBaseModel


class SaveMapsKeyPayload(_MapsKeyBaseModel):
    id: Optional[str] = None
    key: str
    label: Optional[str] = "Google Maps API Key"
    monthly_limit: Optional[int] = 5000


@router.get("/admin/maps-keys")
def get_maps_api_keys(
    current_admin=Depends(get_current_admin),
):
    """Returns the pool of Google Maps API keys with usage statistics and monthly limits."""
    from app.utils.maps_pool import get_all_keys_info
    keys = get_all_keys_info()
    total_active = sum(1 for k in keys if k.get("status") == "ACTIVE")
    total_used = sum(k.get("used_this_month", 0) for k in keys)
    return {
        "status": "SUCCESS",
        "total_active": total_active,
        "total_used_this_month": total_used,
        "keys": keys,
        "cascade_strategy": [
            "1. Database & Cache ($0/month)",
            "2. OpenStreetMap Free Proxy ($0/month)",
            "3. Google Maps Key Rotation Pool (Free $200/month tier per key)"
        ]
    }


@router.post("/admin/maps-keys")
def save_maps_api_key(
    payload: SaveMapsKeyPayload,
    current_admin=Depends(get_current_admin),
):
    """Allows Owner/Admin to register or update Google Maps API keys with monthly usage limits."""
    from app.utils.maps_pool import upsert_api_key
    key_clean = payload.key.strip()
    if not key_clean:
        raise HTTPException(status_code=400, detail="Google Maps API Key cannot be empty.")

    result = upsert_api_key(
        key=key_clean,
        label=payload.label or "Google Maps API Key",
        monthly_limit=payload.monthly_limit if payload.monthly_limit is not None else 5000,
        key_id=payload.id
    )
    return {
        "status": "SUCCESS",
        "message": "Google Maps API key saved successfully.",
        "key": result
    }


@router.delete("/admin/maps-keys/{key_id}")
def delete_maps_api_key(
    key_id: str,
    current_admin=Depends(get_current_admin),
):
    """Removes a Google Maps API key from the rotation pool."""
    from app.utils.maps_pool import delete_api_key
    success = delete_api_key(key_id)
    if not success:
        raise HTTPException(status_code=404, detail="API key ID not found.")
    return {"status": "SUCCESS", "message": f"API key {key_id} removed."}


# ============================================================================
# ADMIN MANUAL ONBOARDING & ACCOUNT CREATION (FLEET, DRIVERS, VENDORS, B2B)
# ============================================================================

class AdminCreateFleetOwnerPayload(BaseModel):
    full_name: str
    primary_number: str
    secondary_number: Optional[str] = None
    city: str
    address: Optional[str] = ""
    pincode: Optional[str] = ""
    aadhar_number: Optional[str] = ""
    pan_number: Optional[str] = None
    password: Optional[str] = None
    initial_wallet_balance: Optional[float] = 0.0
    account_status: Optional[str] = "ACTIVE"
    tier: Optional[str] = "STANDARD"  # STANDARD, PREFERRED
    # Optional nested Car to attach immediately
    car_name: Optional[str] = None
    car_type: Optional[str] = None
    car_number: Optional[str] = None
    year_of_the_car: Optional[str] = None
    # Optional nested Driver to attach immediately
    driver_name: Optional[str] = None
    driver_primary_number: Optional[str] = None
    driver_licence_number: Optional[str] = None
    is_owner_driver: Optional[bool] = True


@router.post("/admin/accounts/create-fleet-owner")
def admin_create_fleet_owner(
    payload: AdminCreateFleetOwnerPayload,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Admin manually onboards a Fleet Owner (Vehicle Owner) and optionally attaches their first Car & Driver."""
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    from app.core.security import get_password_hash
    from app.utils.reg_id import assign_reg_id
    from app.models.car_details import CarDetails
    from app.models.car_driver import CarDriver, AccountStatusEnum as DriverAccountStatus

    p_num = payload.primary_number.strip().replace("+91", "").replace(" ", "").replace("-", "")
    if len(p_num) < 10:
        raise HTTPException(status_code=400, detail="Primary mobile number must be at least 10 digits")
    p_num = p_num[-10:]

    # Check duplicates
    existing = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.primary_number == p_num).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Mobile number {p_num} is already registered as a Fleet Owner.")

    raw_pw = payload.password.strip() if payload.password and payload.password.strip() else f"DropCars@{p_num[-4:]}"
    hashed_pw = get_password_hash(raw_pw)

    # 1. Create Credentials
    owner_cred = VehicleOwnerCredentials(
        primary_number=p_num,
        hashed_password=hashed_pw,
        account_status=payload.account_status or "ACTIVE",
    )
    db.add(owner_cred)
    db.flush()

    # 2. Create Details
    owner_details = VehicleOwnerDetails(
        vehicle_owner_id=owner_cred.id,
        full_name=payload.full_name.strip(),
        primary_number=p_num,
        secondary_number=payload.secondary_number.strip() if payload.secondary_number else None,
        address=payload.address or "",
        city=payload.city.strip(),
        pincode=payload.pincode or "",
        aadhar_number=payload.aadhar_number or "",
        pan_number=payload.pan_number or None,
        wallet_balance=float(payload.initial_wallet_balance or 0.0),
        tier=payload.tier or "STANDARD",
        aadhar_status=DocumentStatusEnum.VERIFIED if payload.account_status == "ACTIVE" else DocumentStatusEnum.PENDING,
    )
    assign_reg_id(db, owner_details)
    db.add(owner_details)
    db.flush()

    car_res = None
    driver_res = None

    # 3. Optional Car Creation
    if payload.car_number and payload.car_name and payload.car_type:
        clean_car_num = payload.car_number.strip().upper().replace(" ", "")
        exist_car = db.query(CarDetails).filter(CarDetails.car_number == clean_car_num).first()
        if exist_car:
            raise HTTPException(status_code=400, detail=f"Car number {clean_car_num} is already registered.")
        new_car = CarDetails(
            vehicle_owner_id=owner_cred.id,
            car_name=payload.car_name.strip(),
            car_type=payload.car_type.strip(),
            car_number=clean_car_num,
            year_of_the_car=payload.year_of_the_car or None,
            car_status=DocumentStatusEnum.VERIFIED if payload.account_status == "ACTIVE" else DocumentStatusEnum.PENDING,
        )
        db.add(new_car)
        db.flush()
        car_res = {
            "car_id": str(new_car.id),
            "car_name": new_car.car_name,
            "car_type": new_car.car_type,
            "car_number": new_car.car_number,
        }

    # 4. Optional Driver Creation
    if payload.driver_name and payload.driver_primary_number:
        d_num = payload.driver_primary_number.strip().replace("+91", "").replace(" ", "").replace("-", "")[-10:]
        exist_driver = db.query(CarDriver).filter(CarDriver.primary_number == d_num).first()
        if exist_driver:
            raise HTTPException(status_code=400, detail=f"Driver mobile {d_num} is already registered.")
        lic_num = payload.driver_licence_number.strip() if payload.driver_licence_number else f"DL-{d_num}"
        new_driver = CarDriver(
            vehicle_owner_id=owner_cred.id,
            full_name=payload.driver_name.strip(),
            primary_number=d_num,
            hashed_password=hashed_pw,
            licence_number=lic_num,
            address=payload.address or "",
            city=payload.city.strip(),
            pincode=payload.pincode or "",
            driver_status=DriverAccountStatus.ACTIVE if payload.account_status == "ACTIVE" else DriverAccountStatus.PROCESSING,
            is_owner_driver=payload.is_owner_driver if payload.is_owner_driver is not None else True,
        )
        db.add(new_driver)
        db.flush()
        driver_res = {
            "driver_id": str(new_driver.id),
            "full_name": new_driver.full_name,
            "primary_number": new_driver.primary_number,
            "licence_number": new_driver.licence_number,
        }

    db.commit()

    return {
        "status": "SUCCESS",
        "message": "Fleet owner account created successfully",
        "credentials": {
            "id": str(owner_cred.id),
            "primary_number": p_num,
            "temporary_password": raw_pw,
            "reg_id": getattr(owner_details, "reg_id", None),
            "full_name": owner_details.full_name,
            "city": owner_details.city,
            "wallet_balance": float(owner_details.wallet_balance or 0),
        },
        "car": car_res,
        "driver": driver_res,
    }


class AdminCreateVendorPayload(BaseModel):
    full_name: str
    primary_number: str
    secondary_number: Optional[str] = None
    city: str
    address: Optional[str] = ""
    pincode: Optional[str] = ""
    aadhar_number: Optional[str] = ""
    gpay_number: Optional[str] = None
    password: Optional[str] = None
    business_name: Optional[str] = None
    account_status: Optional[str] = "ACTIVE"


@router.post("/admin/accounts/create-vendor")
def admin_create_vendor(
    payload: AdminCreateVendorPayload,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Admin manually onboards a Vendor / Travel Desk Partner."""
    from app.models.vendor import VendorCredentials, VendorDetails
    from app.core.security import get_password_hash
    from app.utils.reg_id import assign_reg_id

    p_num = payload.primary_number.strip().replace("+91", "").replace(" ", "").replace("-", "")[-10:]
    existing = db.query(VendorCredentials).filter(VendorCredentials.primary_number == p_num).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Mobile number {p_num} is already registered as a Vendor.")

    raw_pw = payload.password.strip() if payload.password and payload.password.strip() else f"Vendor@{p_num[-4:]}"
    hashed_pw = get_password_hash(raw_pw)

    cred = VendorCredentials(
        primary_number=p_num,
        hashed_password=hashed_pw,
        account_status=payload.account_status or "ACTIVE",
    )
    db.add(cred)
    db.flush()

    details = VendorDetails(
        vendor_id=cred.id,
        full_name=payload.full_name.strip(),
        primary_number=p_num,
        secondary_number=payload.secondary_number.strip() if payload.secondary_number else None,
        address=payload.address or "",
        city=payload.city.strip(),
        pincode=payload.pincode or "",
        aadhar_number=payload.aadhar_number or "",
        gpay_number=payload.gpay_number or p_num,
        aadhar_status=DocumentStatusEnum.VERIFIED if payload.account_status == "ACTIVE" else DocumentStatusEnum.PENDING,
    )
    assign_reg_id(db, details)
    db.add(details)
    db.commit()

    return {
        "status": "SUCCESS",
        "message": "Vendor account created successfully",
        "credentials": {
            "id": str(cred.id),
            "primary_number": p_num,
            "temporary_password": raw_pw,
            "reg_id": getattr(details, "reg_id", None),
            "full_name": details.full_name,
            "city": details.city,
        }
    }


class AdminCreateB2BCustomerPayload(BaseModel):
    full_name: str
    primary_number: str
    email: Optional[str] = None
    city: Optional[str] = None
    password: Optional[str] = None
    company_name: Optional[str] = None
    gstin: Optional[str] = None
    customer_segment: Optional[str] = "B2B"  # B2B, CORPORATE, RETAIL


@router.post("/admin/accounts/create-customer")
def admin_create_customer(
    payload: AdminCreateB2BCustomerPayload,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Admin manually onboards a B2B / Corporate / Retail Customer."""
    from app.models.customer import CustomerCredentials, CustomerDetails
    from app.core.security import get_password_hash

    p_num = payload.primary_number.strip().replace("+91", "").replace(" ", "").replace("-", "")[-10:]
    existing = db.query(CustomerCredentials).filter(CustomerCredentials.primary_number == p_num).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Mobile number {p_num} is already registered as a Customer.")

    raw_pw = payload.password.strip() if payload.password and payload.password.strip() else f"DropCars@{p_num[-4:]}"
    hashed_pw = get_password_hash(raw_pw)

    cred = CustomerCredentials(
        primary_number=p_num,
        hashed_password=hashed_pw,
        email=payload.email.strip() if payload.email else None,
    )
    db.add(cred)
    db.flush()

    details = CustomerDetails(
        customer_id=cred.id,
        full_name=payload.full_name.strip(),
        primary_number=p_num,
        city=payload.city.strip() if payload.city else None,
        segment=payload.customer_segment or "B2B",
    )
    db.add(details)
    db.commit()

    return {
        "status": "SUCCESS",
        "message": "Customer/B2B account created successfully",
        "credentials": {
            "id": str(cred.id),
            "primary_number": p_num,
            "temporary_password": raw_pw,
            "full_name": details.full_name,
            "city": details.city,
            "segment": details.segment,
        }
    }


class AdminAddCarToFleetPayload(BaseModel):
    car_name: str
    car_type: str
    car_number: str
    year_of_the_car: Optional[str] = None
    rc_expiry_date: Optional[str] = None      # ignored: an RC has no expiry date
    registration_date: Optional[str] = None
    insurance_expiry_date: Optional[str] = None
    fc_expiry_date: Optional[str] = None
    permit_expiry_date: Optional[str] = None
    car_status: Optional[str] = "ACTIVE"
    rc_front_img_url: Optional[str] = None
    rc_back_img_url: Optional[str] = None
    insurance_img_url: Optional[str] = None
    fc_img_url: Optional[str] = None
    car_img_url: Optional[str] = None
    permit_img_url: Optional[str] = None


@router.post("/admin/accounts/fleet/{vehicle_owner_id}/add-car")
def admin_add_car_to_fleet(
    vehicle_owner_id: str,
    payload: AdminAddCarToFleetPayload,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Admin adds a Car with full document attachments to a specific Fleet Owner."""
    from app.models.car_details import CarDetails, CarStatusEnum, DocumentStatusEnum as CarDocStatus
    clean_car_num = payload.car_number.strip().upper().replace(" ", "")
    exist_car = db.query(CarDetails).filter(CarDetails.car_number == clean_car_num).first()
    if exist_car:
        raise HTTPException(status_code=400, detail=f"Car number {clean_car_num} is already registered.")

    car = CarDetails(
        vehicle_owner_id=UUID(vehicle_owner_id),
        car_name=payload.car_name.strip(),
        car_type=payload.car_type.strip(),
        car_number=clean_car_num,
        year_of_the_car=payload.year_of_the_car or None,
        registration_date=payload.registration_date or None,
        insurance_expiry_date=payload.insurance_expiry_date or None,
        fc_expiry_date=payload.fc_expiry_date or None,
        permit_expiry_date=payload.permit_expiry_date or None,
        rc_front_img_url=payload.rc_front_img_url or None,
        rc_front_status=CarDocStatus.VERIFIED if payload.rc_front_img_url else CarDocStatus.PENDING,
        rc_back_img_url=payload.rc_back_img_url or None,
        rc_back_status=CarDocStatus.VERIFIED if payload.rc_back_img_url else CarDocStatus.PENDING,
        insurance_img_url=payload.insurance_img_url or None,
        insurance_status=CarDocStatus.VERIFIED if payload.insurance_img_url else CarDocStatus.PENDING,
        fc_img_url=payload.fc_img_url or None,
        fc_status=CarDocStatus.VERIFIED if payload.fc_img_url else CarDocStatus.PENDING,
        car_img_url=payload.car_img_url or None,
        car_img_status=CarDocStatus.VERIFIED if payload.car_img_url else CarDocStatus.PENDING,
        permit_img_url=payload.permit_img_url or None,
        permit_status=CarDocStatus.VERIFIED if payload.permit_img_url else CarDocStatus.PENDING,
        car_status=CarStatusEnum.ONLINE if payload.car_status == "ACTIVE" else CarStatusEnum.PROCESSING,
    )
    db.add(car)
    db.commit()
    db.refresh(car)

    return {
        "status": "SUCCESS",
        "message": "Car added to fleet successfully",
        "car": {
            "id": str(car.id),
            "car_name": car.car_name,
            "car_type": car.car_type,
            "car_number": car.car_number,
            "car_status": str(car.car_status),
        }
    }


class AdminAddDriverToFleetPayload(BaseModel):
    full_name: str
    primary_number: str
    secondary_number: Optional[str] = None
    licence_number: str
    city: Optional[str] = None
    address: Optional[str] = None
    pincode: Optional[str] = None
    password: Optional[str] = None
    is_owner_driver: Optional[bool] = False
    driver_status: Optional[str] = "ACTIVE"
    licence_front_img: Optional[str] = None
    licence_back_img: Optional[str] = None
    profile_img: Optional[str] = None


@router.post("/admin/accounts/fleet/{vehicle_owner_id}/add-driver")
def admin_add_driver_to_fleet(
    vehicle_owner_id: str,
    payload: AdminAddDriverToFleetPayload,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """Admin adds a Driver with full document attachments to a specific Fleet Owner."""
    from app.models.car_driver import CarDriver, AccountStatusEnum as DriverAccountStatus, DocumentStatusEnum as DriverDocStatus
    from app.core.security import get_password_hash

    d_num = payload.primary_number.strip().replace("+91", "").replace(" ", "").replace("-", "")[-10:]
    exist_driver = db.query(CarDriver).filter(CarDriver.primary_number == d_num).first()
    if exist_driver:
        raise HTTPException(status_code=400, detail=f"Driver mobile {d_num} is already registered.")

    raw_pw = payload.password.strip() if payload.password and payload.password.strip() else f"Driver@{d_num[-4:]}"
    hashed_pw = get_password_hash(raw_pw)

    driver = CarDriver(
        vehicle_owner_id=UUID(vehicle_owner_id),
        full_name=payload.full_name.strip(),
        primary_number=d_num,
        secondary_number=payload.secondary_number.strip() if payload.secondary_number else None,
        hashed_password=hashed_pw,
        licence_number=payload.licence_number.strip(),
        address=payload.address or "",
        city=payload.city.strip() if payload.city else "",
        pincode=payload.pincode or "",
        driver_status=DriverAccountStatus.ACTIVE if payload.driver_status == "ACTIVE" else DriverAccountStatus.PROCESSING,
        is_owner_driver=payload.is_owner_driver or False,
        licence_front_img=payload.licence_front_img or None,
        licence_front_status=DriverDocStatus.VERIFIED if payload.licence_front_img else DriverDocStatus.PENDING,
        licence_back_img=payload.licence_back_img or None,
        licence_back_status=DriverDocStatus.VERIFIED if payload.licence_back_img else DriverDocStatus.PENDING,
        profile_img=payload.profile_img or None,
    )
    db.add(driver)
    db.commit()
    db.refresh(driver)

    return {
        "status": "SUCCESS",
        "message": "Driver added to fleet successfully",
        "driver": {
            "id": str(driver.id),
            "full_name": driver.full_name,
            "primary_number": driver.primary_number,
            "licence_number": driver.licence_number,
            "driver_status": str(driver.driver_status.value if hasattr(driver.driver_status, 'value') else driver.driver_status),
            "temporary_password": raw_pw,
        }
    }


@router.post("/admin/accounts/upload-doc")
def admin_upload_account_document(
    file: UploadFile = File(..., description="Document image"),
    doc_type: str = Form("general", description="Type of document (e.g., rc_front, rc_back, licence_front, licence_back, insurance, fc, profile)"),
    current_admin=Depends(get_current_admin),
):
    """Admin uploads a document/photo directly to cloud storage and returns the public URL."""
    from app.utils.gcs import upload_image_to_gcs
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload an image file (JPEG, PNG, etc.)"
        )
    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Image file is too large. Please upload an image smaller than 10MB"
        )
    try:
        url = upload_image_to_gcs(file, folder=f"admin_uploads/docs/{doc_type}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload image to cloud storage: {str(e)}")
    return {"status": "SUCCESS", "url": url, "doc_type": doc_type}





