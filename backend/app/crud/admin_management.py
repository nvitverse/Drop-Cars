# crud/admin_management.py
from sqlalchemy.orm import Session
from sqlalchemy import or_
from fastapi import HTTPException, status
from app.models.vendor import VendorCredentials, AccountStatusEnum as VendorAccountStatusEnum
from app.models.vendor_details import VendorDetails
from app.models.vehicle_owner import VehicleOwnerCredentials, AccountStatusEnum as VehicleOwnerAccountStatusEnum
from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.models.car_details import CarDetails, CarStatusEnum
from app.models.car_driver import CarDriver, AccountStatusEnum as DriverStatusEnum
from app.models.common_enums import DocumentStatusEnum
from typing import List, Optional, Tuple
from uuid import UUID

# ============ VENDOR MANAGEMENT ============

def get_all_vendors(db: Session, skip: int = 0, limit: int = 100) -> Tuple[List[VendorDetails], int]:
    """Get all vendors with pagination"""
    vendors = db.query(VendorDetails).offset(skip).limit(limit).all()
    total_count = db.query(VendorDetails).count()
    return vendors, total_count

def get_vendor_full_details(db: Session, vendor_id: str) -> Optional[Tuple[VendorCredentials, VendorDetails]]:
    """Get full vendor details including credentials and details"""
    vendor_credentials = db.query(VendorCredentials).filter(
        VendorCredentials.id == vendor_id
    ).first()
    
    if not vendor_credentials:
        return None
    
    vendor_details = db.query(VendorDetails).filter(
        VendorDetails.vendor_id == vendor_id
    ).first()
    
    return vendor_credentials, vendor_details

def update_vendor_account_status(db: Session, vendor_id: str, account_status: str) -> VendorCredentials:
    """Update vendor account status"""
    vendor = db.query(VendorCredentials).filter(
        VendorCredentials.id == vendor_id
    ).first()
    
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found"
        )
    
    # Try to match by enum name first (ACTIVE, INACTIVE, PENDING)
    account_status_upper = account_status.upper()
    try:
        vendor.account_status = VendorAccountStatusEnum[account_status_upper]
    except KeyError:
        # Try to match by value (Active, Inactive, Pending)
        for enum_item in VendorAccountStatusEnum:
            if enum_item.value.lower() == account_status.lower():
                vendor.account_status = enum_item
                break
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid account status. Must be one of: {[e.name for e in VendorAccountStatusEnum]} or {[e.value for e in VendorAccountStatusEnum]}"
            )

    # Track deliberate admin blocks separately from "just inactive" - see
    # blocked_reason's column comment on the model.
    if vendor.account_status == VendorAccountStatusEnum.INACTIVE:
        if not vendor.blocked_reason:
            vendor.blocked_reason = "Blocked by admin"
    else:
        vendor.blocked_reason = None

    try:
        db.commit()
        db.refresh(vendor)
        return vendor
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update vendor account status: {str(e)}"
        )

def update_vendor_document_status(db: Session, vendor_id: str, document_status: DocumentStatusEnum) -> VendorDetails:
    """Update vendor document status"""
    vendor_details = db.query(VendorDetails).filter(
        VendorDetails.vendor_id == vendor_id
    ).first()
    
    if not vendor_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor details not found"
        )
    
    try:
        vendor_details.aadhar_status = document_status
        db.commit()
        db.refresh(vendor_details)
        return vendor_details
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update vendor document status: {str(e)}"
        )

# ============ VEHICLE OWNER MANAGEMENT ============

def get_all_vehicle_owners(db: Session, skip: int = 0, limit: int = 100, search: Optional[str] = None, status_filter: Optional[str] = None) -> Tuple[List[dict], int]:
    """Get all fleet owners with pagination.

    Three fixes bundled in here together, all hit by the same admin screen:
    1. No ORDER BY meant Postgres didn't guarantee stable row order across
       separate paginated calls - accounts could silently be skipped or
       duplicated between pages (reported as "active accounts missing").
    2. car_count/driver_count are now computed here via aggregated
       subqueries instead of the caller firing one detail request PER OWNER
       just to get counts (was an N+1 - a page of 50 owners fired 50 extra
       API calls, the actual cause of the slow page load).
    3. account_status lives on VehicleOwnerCredentials, a different table
       from VehicleOwnerDetails that this query never joined - the field
       was always silently absent from the response despite the frontend
       already expecting and using it.
    """
    from sqlalchemy import func, or_ as _or

    car_counts = dict(
        db.query(CarDetails.vehicle_owner_id, func.count(CarDetails.id))
        .group_by(CarDetails.vehicle_owner_id).all()
    )
    driver_counts = dict(
        db.query(CarDriver.vehicle_owner_id, func.count(CarDriver.id))
        .group_by(CarDriver.vehicle_owner_id).all()
    )

    query = db.query(VehicleOwnerDetails, VehicleOwnerCredentials.account_status).join(
        VehicleOwnerCredentials, VehicleOwnerCredentials.id == VehicleOwnerDetails.vehicle_owner_id
    )

    if search and search.strip():
        # Server-side search so ANY fleet/driver is findable, not just
        # whatever happens to be on the currently-loaded page. Drivers
        # aren't separately browsable at the top level (you drill into
        # their fleet owner), so a driver's own phone/licence number also
        # matches - it just surfaces the OWNER that driver belongs to.
        term = search.strip()
        like = f"%{term}%"
        driver_owner_ids = db.query(CarDriver.vehicle_owner_id).filter(_or(
            CarDriver.primary_number.ilike(like),
            CarDriver.full_name.ilike(like),
            CarDriver.licence_number.ilike(like),
        )).subquery()
        query = query.filter(_or(
            VehicleOwnerDetails.full_name.ilike(like),
            VehicleOwnerDetails.primary_number.ilike(like),
            VehicleOwnerDetails.city.ilike(like),
            VehicleOwnerDetails.vehicle_owner_id.in_(driver_owner_ids),
        ))

    if status_filter and status_filter.strip():
        status_upper = status_filter.strip().upper()
        if status_upper in ("ACTIVE", "INACTIVE", "PENDING"):
            query = query.filter(VehicleOwnerCredentials.account_status == VehicleOwnerAccountStatusEnum[status_upper])

    total_count = query.count()
    rows = query.order_by(VehicleOwnerDetails.created_at.desc()).offset(skip).limit(limit).all()

    results = []
    for owner, account_status in rows:
        results.append({
            "id": owner.id,
            "vehicle_owner_id": owner.vehicle_owner_id,
            "full_name": owner.full_name,
            "primary_number": owner.primary_number,
            "secondary_number": owner.secondary_number,
            "wallet_balance": owner.wallet_balance,
            "aadhar_number": owner.aadhar_number,
            "aadhar_front_img": owner.aadhar_front_img,
            "address": owner.address,
            "city": owner.city,
            "pincode": owner.pincode,
            "created_at": owner.created_at,
            "tier": owner.tier,
            "account_status": account_status.value if account_status else None,
            "car_count": car_counts.get(owner.vehicle_owner_id, 0),
            "driver_count": driver_counts.get(owner.vehicle_owner_id, 0),
        })
    return results, total_count

def get_vehicle_owner_full_details(db: Session, vehicle_owner_id: str) -> Optional[Tuple[VehicleOwnerCredentials, VehicleOwnerDetails]]:
    """Get full fleet owner details including credentials and details"""
    vehicle_owner_credentials = db.query(VehicleOwnerCredentials).filter(
        VehicleOwnerCredentials.id == vehicle_owner_id
    ).first()
    
    if not vehicle_owner_credentials:
        return None
    
    vehicle_owner_details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).first()
    
    return vehicle_owner_credentials, vehicle_owner_details

def update_vehicle_owner_account_status(db: Session, vehicle_owner_id: str, account_status: str) -> VehicleOwnerCredentials:
    """Update fleet owner account status"""
    vehicle_owner = db.query(VehicleOwnerCredentials).filter(
        VehicleOwnerCredentials.id == vehicle_owner_id
    ).first()
    
    if not vehicle_owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fleet owner not found"
        )
    
    # Try to match by enum name first (ACTIVE, INACTIVE, PENDING)
    account_status_upper = account_status.upper()
    try:
        vehicle_owner.account_status = VehicleOwnerAccountStatusEnum[account_status_upper]
    except KeyError:
        # Try to match by value (Active, Inactive, Pending)
        for enum_item in VehicleOwnerAccountStatusEnum:
            if enum_item.value.lower() == account_status.lower():
                vehicle_owner.account_status = enum_item
                break
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid account status. Must be one of: {[e.name for e in VehicleOwnerAccountStatusEnum]} or {[e.value for e in VehicleOwnerAccountStatusEnum]}"
            )

    # Track deliberate admin blocks separately from "just inactive" - see
    # blocked_reason's column comment on the model.
    if vehicle_owner.account_status == VehicleOwnerAccountStatusEnum.INACTIVE:
        if not vehicle_owner.blocked_reason:
            vehicle_owner.blocked_reason = "Blocked by admin"
    else:
        vehicle_owner.blocked_reason = None

    try:
        db.commit()
        db.refresh(vehicle_owner)
        return vehicle_owner
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update fleet owner account status: {str(e)}"
        )

def update_vehicle_owner_document_status(db: Session, vehicle_owner_id: str, document_status: DocumentStatusEnum) -> VehicleOwnerDetails:
    """Update fleet owner document status"""
    vehicle_owner_details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).first()
    
    if not vehicle_owner_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fleet owner details not found"
        )
    
    try:
        vehicle_owner_details.aadhar_status = document_status
        db.commit()
        db.refresh(vehicle_owner_details)
        return vehicle_owner_details
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update fleet owner document status: {str(e)}"
        )

def get_vehicle_owner_cars(db: Session, vehicle_owner_id: str) -> List[CarDetails]:
    """Get all cars for a fleet owner"""
    return db.query(CarDetails).filter(
        CarDetails.vehicle_owner_id == vehicle_owner_id
    ).all()

def get_vehicle_owner_drivers(db: Session, vehicle_owner_id: str) -> List[CarDriver]:
    """Get all drivers for a fleet owner"""
    return db.query(CarDriver).filter(
        CarDriver.vehicle_owner_id == vehicle_owner_id
    ).all()

def get_all_cars_unified(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    vehicle_owner_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    car_type_filter: Optional[str] = None,
    search: Optional[str] = None
) -> Tuple[List[dict], int, int, int, int, int]:
    """
    Get all cars with filtering and pagination.
    
    Args:
        db: Database session
        skip: Number of records to skip
        limit: Maximum number of records to return
        vehicle_owner_id: Filter by fleet owner ID (optional)
        status_filter: Filter by car status (ONLINE, DRIVING, BLOCKED, PROCESSING)
        car_type_filter: Filter by car type
    
    Returns:
        Tuple of (cars list, total_count, online_count, blocked_count, processing_count, driving_count)
    """
    from app.utils.gcs import generate_signed_url_from_gcs
    
    # Build query
    query = db.query(CarDetails)
    
    # Apply filters
    if vehicle_owner_id:
        query = query.filter(CarDetails.vehicle_owner_id == str(vehicle_owner_id))
    
    if status_filter:
        status_filter_upper = status_filter.upper()
        if status_filter_upper in ["ONLINE", "DRIVING", "BLOCKED", "PROCESSING"]:
            query = query.filter(CarDetails.car_status == CarStatusEnum[status_filter_upper])
    
    if car_type_filter:
        from app.models.car_details import CarTypeEnum
        try:
            query = query.filter(CarDetails.car_type == CarTypeEnum[car_type_filter.upper()])
        except KeyError:
            pass  # Invalid car type, ignore filter

    if search and search.strip():
        # Server-side search so ANY car is findable, not just the first page.
        # Matches car name, car number, owner name; digit-only queries also
        # match the digits of the car number (e.g. "1234" -> "TN 09 AB 1234").
        import re as _re
        from sqlalchemy import func as _func
        term = search.strip()
        like = f"%{term}%"
        conds = [
            CarDetails.car_number.ilike(like),
            CarDetails.car_name.ilike(like),
        ]
        digits = _re.sub(r"\D", "", term)
        if digits:
            conds.append(
                _func.regexp_replace(CarDetails.car_number, r"\D", "", "g").like(f"%{digits}%")
            )
        owner_id_rows = db.query(VehicleOwnerDetails.vehicle_owner_id).filter(
            VehicleOwnerDetails.full_name.ilike(like)
        ).all()
        matching_owner_ids = [row[0] for row in owner_id_rows]
        if matching_owner_ids:
            conds.append(CarDetails.vehicle_owner_id.in_(matching_owner_ids))
        query = query.filter(or_(*conds))

    # Get total count before pagination
    total_count = query.count()

    # Apply pagination - ORDER BY is required for stable pagination; without
    # it Postgres doesn't guarantee the same row order across separate
    # paginated calls, so cars could be silently skipped or duplicated
    # between pages.
    cars = query.order_by(CarDetails.created_at.desc()).offset(skip).limit(limit).all()

    # Batch-resolve fleet owner names in ONE query instead of one query per
    # car (was N+1 - a page of 100 cars fired 100 extra owner lookups).
    owner_ids = {car.vehicle_owner_id for car in cars if car.vehicle_owner_id}
    owner_name_by_id = {}
    if owner_ids:
        owner_rows = db.query(
            VehicleOwnerDetails.vehicle_owner_id, VehicleOwnerDetails.full_name
        ).filter(VehicleOwnerDetails.vehicle_owner_id.in_(owner_ids)).all()
        owner_name_by_id = {row[0]: row[1] for row in owner_rows}
    # VehicleOwnerDetails has no reg_id column - this whole endpoint 500'd
    # on every request until this was removed. vehicle_owner_reg_id stays
    # in the response for frontend compatibility (it already falls back to
    # "N/A" when absent) but is never populated here.
    owner_reg_id_by_id = {}

    car_list = []
    for car in cars:
        car_list.append({
            "id": car.id,
            "vehicle_owner_id": car.vehicle_owner_id,
            "car_name": car.car_name,
            "car_type": car.car_type.value,
            "car_number": car.car_number,
            "year_of_the_car": car.year_of_the_car,
            "car_status": car.car_status.value,
            "vehicle_owner_name": owner_name_by_id.get(car.vehicle_owner_id),
            "vehicle_owner_reg_id": owner_reg_id_by_id.get(car.vehicle_owner_id),
            "rating_avg": car.rating_avg or 0.0,
            "rating_count": car.rating_count or 0,
            "created_at": car.created_at,
            "pending_documents_count": sum(
                1 for s in [car.rc_front_status, car.rc_back_status, car.insurance_status, car.permit_status]
                if s == DocumentStatusEnum.PENDING
            ),
        })
    
    # Calculate status counts
    all_cars_query = db.query(CarDetails)
    if vehicle_owner_id:
        all_cars_query = all_cars_query.filter(CarDetails.vehicle_owner_id == str(vehicle_owner_id))
    
    online_count = all_cars_query.filter(CarDetails.car_status == CarStatusEnum.ONLINE).count()
    blocked_count = all_cars_query.filter(CarDetails.car_status == CarStatusEnum.BLOCKED).count()
    processing_count = all_cars_query.filter(CarDetails.car_status == CarStatusEnum.PROCESSING).count()
    driving_count = all_cars_query.filter(CarDetails.car_status == CarStatusEnum.DRIVING).count()
    
    return car_list, total_count, online_count, blocked_count, processing_count, driving_count

# ============ CAR MANAGEMENT ============

def update_car_account_status(db: Session, car_id: str, car_status: str) -> CarDetails:
    """Update car account status"""
    car = db.query(CarDetails).filter(
        CarDetails.id == car_id
    ).first()
    
    if not car:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Car not found"
        )
    
    try:
        car.car_status = CarStatusEnum[car_status.upper()]
        db.commit()
        db.refresh(car)
        return car
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid car status. Must be one of: {[e.name for e in CarStatusEnum]}"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update car status: {str(e)}"
        )

def update_car_document_status(
    db: Session, 
    car_id: str, 
    document_type: str, 
    document_status: DocumentStatusEnum
) -> CarDetails:
    """Update car document status"""
    car = db.query(CarDetails).filter(
        CarDetails.id == car_id
    ).first()
    
    if not car:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Car not found"
        )
    
    document_mapping = {
        "rc_front": ("rc_front_status",),
        "rc_back": ("rc_back_status",),
        "insurance": ("insurance_status",),
        "fc": ("fc_status",),
        "car_img": ("car_img_status",),
    }
    
    if document_type not in document_mapping:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document type. Must be one of: {list(document_mapping.keys())}"
        )
    
    try:
        status_field = document_mapping[document_type][0]
        setattr(car, status_field, document_status)
        db.commit()
        db.refresh(car)
        return car
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update car document status: {str(e)}"
        )

# ============ DRIVER MANAGEMENT ============

def update_driver_account_status(db: Session, driver_id: str, driver_status: str) -> CarDriver:
    """Update driver account status"""
    driver = db.query(CarDriver).filter(
        CarDriver.id == driver_id
    ).first()
    
    if not driver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found"
        )
    
    try:
        driver.driver_status = DriverStatusEnum[driver_status.upper()]
        db.commit()
        db.refresh(driver)
        return driver
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid driver status. Must be one of: {[e.name for e in DriverStatusEnum]}"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update driver status: {str(e)}"
        )

def update_driver_document_status(db: Session, driver_id: str, document_status: DocumentStatusEnum) -> CarDriver:
    """Update driver document status"""
    driver = db.query(CarDriver).filter(
        CarDriver.id == driver_id
    ).first()
    
    if not driver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found"
        )
    
    try:
        driver.licence_front_status = document_status
        db.commit()
        db.refresh(driver)
        return driver
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update driver document status: {str(e)}"
        )

# ============ UNIFIED ACCOUNT MANAGEMENT ============

def get_all_accounts_unified(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    account_type: Optional[str] = None,
    status_filter: Optional[str] = None,
    search: Optional[str] = None
) -> Tuple[List[dict], int, int, int]:
    """
    Get all accounts (vendors, fleet owners, drivers) in a unified format.

    Previously loaded EVERY vendor + EVERY fleet owner + EVERY driver into
    memory on every single call, then Python-sliced [skip:skip+limit] out
    of the combined list - even requesting just page 1 (50 rows) re-fetched
    the whole accounts table across three joins. Fine at dozens of
    accounts, would fall over as the platform grows into the thousands.

    Rewritten to paginate at the DB level instead: get real COUNTs per type
    first (cheap, indexed), then only query the ROWS that actually fall
    inside the requested [skip, skip+limit) window - never more than
    `limit` rows fetched from any one table, and a table entirely outside
    the window isn't queried for rows at all. Type order when mixed (no
    account_type filter) is fixed: vendors, then fleet owners, then
    drivers, each ordered by created_at desc internally.

    Args:
        db: Database session
        skip: Number of records to skip
        limit: Maximum number of records to return
        account_type: Filter by account type ("vendor", "vehicle_owner", "driver", "quickdriver")
        status_filter: Filter by status ("active", "inactive", "pending", etc.)

    Returns:
        Tuple of (accounts list, total_count, active_count, inactive_count)
    """
    search_like = f"%{search.strip()}%" if search and search.strip() else None

    def vendor_base_query():
        q = db.query(VendorDetails, VendorCredentials).join(VendorCredentials, VendorDetails.vendor_id == VendorCredentials.id)
        if status_filter:
            status_filter_upper = status_filter.upper()
            if status_filter_upper in ["ACTIVE", "INACTIVE", "PENDING"]:
                q = q.filter(VendorCredentials.account_status == VendorAccountStatusEnum[status_filter_upper])
            elif status_filter.lower() == "blocked":
                # "Blocked" is a separate admin action (permanently_blocked),
                # not a value of account_status - kept out of the
                # Active/Inactive vocabulary so the two never overlap.
                q = q.filter(VendorCredentials.permanently_blocked == True)
            elif status_filter.lower() == "inactive":
                q = q.filter(
                    VendorCredentials.account_status == VendorAccountStatusEnum.INACTIVE,
                    VendorCredentials.permanently_blocked.isnot(True),
                )
            elif status_filter.lower() == "active":
                q = q.filter(VendorCredentials.account_status == VendorAccountStatusEnum.ACTIVE)
        if search_like:
            q = q.filter(or_(
                VendorDetails.full_name.ilike(search_like),
                VendorDetails.primary_number.ilike(search_like),
                VendorCredentials.reg_id.ilike(search_like),
            ))
        return q

    def vendor_active_query():
        return db.query(VendorDetails, VendorCredentials).join(
            VendorCredentials, VendorDetails.vendor_id == VendorCredentials.id
        ).filter(VendorCredentials.account_status == VendorAccountStatusEnum.ACTIVE)

    def vendor_to_dict(row):
        vendor, vendor_cred = row
        return {
            "id": vendor.vendor_id,
            "name": vendor.full_name,
            "account_type": "vendor",
            "account_status": vendor_cred.account_status.value if vendor_cred else "Pending",
            "reg_id": vendor_cred.reg_id if vendor_cred else None,
            "primary_number": vendor.primary_number,
            "blocked_reason": vendor_cred.blocked_reason if vendor_cred else None,
            "permanently_blocked": bool(vendor_cred.permanently_blocked) if vendor_cred else False,
            "permanently_blocked_reason": vendor_cred.permanently_blocked_reason if vendor_cred else None,
            "pending_documents_count": sum(1 for s in [vendor.aadhar_status] if s == DocumentStatusEnum.PENDING),
        }

    def owner_base_query():
        q = db.query(VehicleOwnerDetails, VehicleOwnerCredentials).join(VehicleOwnerCredentials, VehicleOwnerDetails.vehicle_owner_id == VehicleOwnerCredentials.id)
        if status_filter:
            status_filter_upper = status_filter.upper()
            if status_filter_upper in ["ACTIVE", "INACTIVE", "PENDING"]:
                q = q.filter(VehicleOwnerCredentials.account_status == VehicleOwnerAccountStatusEnum[status_filter_upper])
            elif status_filter.lower() == "blocked":
                # Same split as vendors above - "Blocked" (permanently_blocked)
                # is a distinct admin action, not an account_status value.
                q = q.filter(VehicleOwnerCredentials.permanently_blocked == True)
            elif status_filter.lower() == "inactive":
                q = q.filter(
                    VehicleOwnerCredentials.account_status == VehicleOwnerAccountStatusEnum.INACTIVE,
                    VehicleOwnerCredentials.permanently_blocked.isnot(True),
                )
            elif status_filter.lower() == "active":
                q = q.filter(VehicleOwnerCredentials.account_status == VehicleOwnerAccountStatusEnum.ACTIVE)
        if search_like:
            q = q.filter(or_(
                VehicleOwnerDetails.full_name.ilike(search_like),
                VehicleOwnerDetails.primary_number.ilike(search_like),
                VehicleOwnerCredentials.reg_id.ilike(search_like),
            ))
        return q

    def owner_active_query():
        return db.query(VehicleOwnerDetails, VehicleOwnerCredentials).join(
            VehicleOwnerCredentials, VehicleOwnerDetails.vehicle_owner_id == VehicleOwnerCredentials.id
        ).filter(VehicleOwnerCredentials.account_status == VehicleOwnerAccountStatusEnum.ACTIVE)

    def owner_to_dict(row):
        owner, owner_cred = row
        own_docs_pending = sum(
            1 for s in [owner.aadhar_status, owner.aadhar_back_status, owner.pan_status]
            if s == DocumentStatusEnum.PENDING
        )
        cars_docs_pending = db.query(CarDetails).filter(
            CarDetails.vehicle_owner_id == owner.vehicle_owner_id,
            or_(
                CarDetails.rc_front_status == DocumentStatusEnum.PENDING,
                CarDetails.rc_back_status == DocumentStatusEnum.PENDING,
                CarDetails.insurance_status == DocumentStatusEnum.PENDING,
                CarDetails.permit_status == DocumentStatusEnum.PENDING,
            ),
        ).count()
        return {
            "id": owner.vehicle_owner_id,
            "name": owner.full_name,
            "account_type": "vehicle_owner",
            "account_status": owner_cred.account_status.value if owner_cred else "Inactive",
            "reg_id": owner_cred.reg_id if owner_cred else None,
            "primary_number": owner.primary_number,
            "blocked_reason": owner_cred.blocked_reason if owner_cred else None,
            "permanently_blocked": bool(owner_cred.permanently_blocked) if owner_cred else False,
            "permanently_blocked_reason": owner_cred.permanently_blocked_reason if owner_cred else None,
            "pending_documents_count": own_docs_pending + cars_docs_pending,
        }

    def driver_base_query():
        q = db.query(CarDriver)
        if status_filter:
            status_filter_upper = status_filter.upper()
            if status_filter_upper in ["ONLINE", "OFFLINE", "DRIVING", "BLOCKED", "PROCESSING"]:
                try:
                    q = q.filter(CarDriver.driver_status == DriverStatusEnum[status_filter_upper])
                except KeyError:
                    pass
            elif status_filter.lower() == "blocked":
                # "Blocked" is only the harder permanently_blocked flag
                # (Owner-only fraud action) now - driver_status == BLOCKED
                # is what the plain admin enable/disable toggle sets (a
                # routine, reversible action, not punitive), so it's
                # grouped under Inactive below instead.
                q = q.filter(CarDriver.permanently_blocked == True)
            elif status_filter.lower() == "inactive":
                # BLOCKED (admin's disable toggle) and PROCESSING (pending
                # fleet-owner verification, not yet approved) both mean
                # "account not usable right now" - the account-level
                # Active/Inactive admin controls. ONLINE/OFFLINE/DRIVING
                # are the driver's own live duty status, not admin's to
                # judge, so none of them count as Inactive - see "active"
                # below.
                q = q.filter(
                    CarDriver.driver_status.in_([DriverStatusEnum.BLOCKED, DriverStatusEnum.PROCESSING]),
                    CarDriver.permanently_blocked.isnot(True),
                )
            elif status_filter.lower() == "active":
                q = q.filter(CarDriver.driver_status.in_([DriverStatusEnum.ONLINE, DriverStatusEnum.DRIVING, DriverStatusEnum.OFFLINE]))
        if search_like:
            q = q.filter(or_(
                CarDriver.full_name.ilike(search_like),
                CarDriver.primary_number.ilike(search_like),
                CarDriver.reg_id.ilike(search_like),
            ))
        return q

    def driver_active_query():
        # Matches the "active" status_filter branch above - ONLINE/DRIVING/
        # OFFLINE are all "account usable" states, just different live duty
        # states the driver themselves controls.
        return db.query(CarDriver).filter(CarDriver.driver_status.in_([DriverStatusEnum.ONLINE, DriverStatusEnum.DRIVING, DriverStatusEnum.OFFLINE]))

    def driver_to_dict(driver):
        return {
            "id": driver.id,
            "name": driver.full_name,
            "account_type": "driver",  # Treat quickdriver same as driver
            "account_status": driver.driver_status.value,
            "reg_id": driver.reg_id,
            "primary_number": driver.primary_number,
            "permanently_blocked": bool(driver.permanently_blocked),
            "permanently_blocked_reason": driver.permanently_blocked_reason,
            "pending_documents_count": sum(
                1 for s in [driver.licence_front_status, driver.licence_back_status]
                if s == DocumentStatusEnum.PENDING
            ),
        }

    type_key = (account_type or "").lower()
    sources = []
    if not account_type or type_key in ["vendor", "vendors"]:
        sources.append((vendor_base_query, vendor_active_query, vendor_to_dict, VendorDetails.created_at))
    if not account_type or type_key in ["vehicle_owner", "vehicle_owners", "vehicleowner"]:
        sources.append((owner_base_query, owner_active_query, owner_to_dict, VehicleOwnerDetails.created_at))
    if not account_type or type_key in ["driver", "drivers", "quickdriver", "quickdrivers"]:
        sources.append((driver_base_query, driver_active_query, driver_to_dict, CarDriver.created_at))

    # Cheap COUNT queries only - no rows materialized here.
    per_type_counts = [base_fn().count() for base_fn, _, _, _ in sources]
    total_count = sum(per_type_counts)
    active_count = sum(active_fn().count() for _, active_fn, _, _ in sources)
    inactive_count = total_count - active_count

    # Walk the fixed type order, pulling only the rows that fall inside
    # [skip, skip+limit) - a type entirely before the window just has its
    # count subtracted from the running skip, never queried for rows.
    accounts: List[dict] = []
    remaining_to_skip = skip
    remaining_to_take = limit
    for (base_fn, _, to_dict, order_col), type_count in zip(sources, per_type_counts):
        if remaining_to_take <= 0:
            break
        if remaining_to_skip >= type_count:
            remaining_to_skip -= type_count
            continue
        rows = base_fn().order_by(order_col.desc()).offset(remaining_to_skip).limit(remaining_to_take).all()
        accounts.extend(to_dict(row) for row in rows)
        remaining_to_take -= len(rows)
        remaining_to_skip = 0

    return accounts, total_count, active_count, inactive_count

def get_account_details_by_id(db: Session, account_id: str, account_type: str) -> Optional[dict]:
    """
    Get full account details by ID and type.
    
    Args:
        db: Database session
        account_id: Account ID (UUID string)
        account_type: Account type ("vendor", "vehicle_owner", "driver", "quickdriver")
    
    Returns:
        Dictionary with full account details or None if not found
    """
    account_type_lower = account_type.lower()
    
    if account_type_lower in ["vendor", "vendors"]:
        vendor_cred = db.query(VendorCredentials).filter(VendorCredentials.id == account_id).first()
        if not vendor_cred:
            return None
        
        vendor_details = db.query(VendorDetails).filter(VendorDetails.vendor_id == account_id).first()
        if not vendor_details:
            return None
        
        return {
            "id": vendor_cred.id,
            "reg_id": vendor_cred.reg_id,
            "account_type": "vendor",
            "account_status": vendor_cred.account_status.value,
            "vendor_id": vendor_details.vendor_id,
            "full_name": vendor_details.full_name,
            "primary_number": vendor_details.primary_number,
            "secondary_number": vendor_details.secondary_number,
            "gpay_number": vendor_details.gpay_number,
            "wallet_balance": vendor_details.wallet_balance,
            "bank_balance": vendor_details.bank_balance,
            "aadhar_number": vendor_details.aadhar_number,
            "aadhar_front_img": vendor_details.aadhar_front_img,
            "aadhar_status": vendor_details.aadhar_status.value if vendor_details.aadhar_status else None,
            "address": vendor_details.address,
            "city": vendor_details.city,
            "pincode": vendor_details.pincode,
            "created_at": vendor_details.created_at,
            "blocked_reason": vendor_cred.blocked_reason,
            "permanently_blocked": bool(vendor_cred.permanently_blocked),
            "permanently_blocked_reason": vendor_cred.permanently_blocked_reason,
        }
    
    elif account_type_lower in ["vehicle_owner", "vehicle_owners", "vehicleowner"]:
        owner_cred = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == account_id).first()
        if not owner_cred:
            return None
        
        owner_details = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == account_id).first()
        if not owner_details:
            return None

        cars = get_vehicle_owner_cars(db, account_id)
        drivers = get_vehicle_owner_drivers(db, account_id)

        return {
            "id": owner_cred.id,
            "reg_id": owner_cred.reg_id,
            "account_type": "vehicle_owner",
            "account_status": owner_cred.account_status.value,
            "vehicle_owner_id": owner_details.vehicle_owner_id,
            "full_name": owner_details.full_name,
            "primary_number": owner_details.primary_number,
            "secondary_number": owner_details.secondary_number,
            "wallet_balance": owner_details.wallet_balance,
            "aadhar_number": owner_details.aadhar_number,
            "aadhar_front_img": owner_details.aadhar_front_img,
            "aadhar_status": owner_details.aadhar_status.value if owner_details.aadhar_status else None,
            "address": owner_details.address,
            "city": owner_details.city,
            "pincode": owner_details.pincode,
            "created_at": owner_details.created_at,
            "blocked_reason": owner_cred.blocked_reason,
            "permanently_blocked": bool(owner_cred.permanently_blocked),
            "permanently_blocked_reason": owner_cred.permanently_blocked_reason,
            "cars": [
                {
                    "id": str(c.id),
                    "car_name": c.car_name,
                    "car_type": c.car_type,
                    "car_number": c.car_number,
                    "year_of_the_car": c.year_of_the_car,
                    "car_status": c.car_status.value if hasattr(c.car_status, "value") else c.car_status,
                }
                for c in cars
            ],
            "drivers": [
                {
                    "id": str(d.id),
                    "full_name": d.full_name,
                    "primary_number": d.primary_number,
                    "licence_number": d.licence_number,
                    "driver_status": d.driver_status.value if hasattr(d.driver_status, "value") else d.driver_status,
                }
                for d in drivers
            ],
            "tier": owner_details.tier,
            "admin_trusted_override": bool(owner_details.admin_trusted_override),
        }
    
    elif account_type_lower in ["driver", "drivers", "quickdriver", "quickdrivers"]:
        driver = db.query(CarDriver).filter(CarDriver.id == account_id).first()
        if not driver:
            return None
        
        return {
            "id": driver.id,
            "reg_id": driver.reg_id,
            "account_type": "driver",
            "account_status": driver.driver_status.value,
            "vehicle_owner_id": driver.vehicle_owner_id,
            "full_name": driver.full_name,
            "primary_number": driver.primary_number,
            "secondary_number": driver.secondary_number,
            "licence_number": driver.licence_number,
            "licence_front_img": driver.licence_front_img,
            "licence_front_status": driver.licence_front_status.value if driver.licence_front_status else None,
            "address": driver.address,
            "city": driver.city,
            "pincode": driver.pincode,
            "created_at": driver.created_at,
            "permanently_blocked": bool(driver.permanently_blocked),
            "permanently_blocked_reason": driver.permanently_blocked_reason,
        }
    
    return None

# ============ DOCUMENT VERIFICATION MANAGEMENT ============

def get_all_account_documents(db: Session, account_id: str, account_type: str) -> Optional[dict]:
    """
    Get all documents for an account (account documents + car documents if fleet owner).
    
    Args:
        db: Database session
        account_id: Account ID (UUID string)
        account_type: Account type ("vendor", "vehicle_owner", "driver", "quickdriver")
    
    Returns:
        Dictionary with all documents organized by type
    """
    from app.utils.gcs import generate_signed_url_from_gcs
    
    # Ensure account_id is a string
    account_id = str(account_id)
    account_type_lower = str(account_type).lower()
    account_documents = []
    car_documents = []
    
    if account_type_lower in ["vendor", "vendors"]:
        vendor_details = db.query(VendorDetails).filter(VendorDetails.vendor_id == account_id).first()
        if vendor_details and vendor_details.aadhar_front_img:
            account_documents.append({
                "document_id": "account_aadhar",
                "document_type": "aadhar",
                "document_name": "Aadhar Card",
                "image_url": generate_signed_url_from_gcs(vendor_details.aadhar_front_img) if vendor_details.aadhar_front_img else None,
                "status": vendor_details.aadhar_status.value if vendor_details.aadhar_status else "PENDING",
                "uploaded_at": vendor_details.created_at,
                "car_id": None,
                "car_name": None,
                "car_number": None
            })
    
    elif account_type_lower in ["vehicle_owner", "vehicle_owners", "vehicleowner"]:
        owner_details = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == account_id).first()
        if owner_details:
            # Account document (Aadhar)
            if owner_details.aadhar_front_img:
                account_documents.append({
                    "document_id": "account_aadhar",
                    "document_type": "aadhar",
                    "document_name": "Aadhar Card",
                    "image_url": generate_signed_url_from_gcs(owner_details.aadhar_front_img) if owner_details.aadhar_front_img else None,
                    "status": owner_details.aadhar_status.value if owner_details.aadhar_status else "PENDING",
                    "uploaded_at": owner_details.created_at,
                    "car_id": None,
                    "car_name": None,
                    "car_number": None
                })
            
            # Get all cars and their documents
            cars = db.query(CarDetails).filter(CarDetails.vehicle_owner_id == account_id).all()
            for car in cars:
                car_doc_types = [
                    ("rc_front", "RC Front", car.rc_front_img_url, car.rc_front_status),
                    ("rc_back", "RC Back", car.rc_back_img_url, car.rc_back_status),
                    ("insurance", "Insurance", car.insurance_img_url, car.insurance_status),
                    ("fc", "Fitness Certificate", car.fc_img_url, car.fc_status),
                    ("car_img", "Car Image", car.car_img_url, car.car_img_status),
                    ("permit", "Permit", car.permit_img_url, car.permit_status),
                ]
                
                for doc_type, doc_name, img_url, doc_status in car_doc_types:
                    if img_url:
                        expiry = None
                        if doc_type == "rc_front":
                            expiry = car.rc_expiry_date
                        elif doc_type == "insurance":
                            expiry = car.insurance_expiry_date
                        car_documents.append({
                            "document_id": f"car_{car.id}_{doc_type}",
                            "document_type": doc_type,
                            "document_name": f"{doc_name} - {car.car_name}",
                            "image_url": generate_signed_url_from_gcs(img_url) if img_url else None,
                            "status": doc_status.value if doc_status else "PENDING",
                            "uploaded_at": car.created_at,
                            "car_id": car.id,
                            "car_name": car.car_name,
                            "car_number": car.car_number,
                            "expiry_date": expiry.isoformat() if expiry else None
                        })
    
    elif account_type_lower in ["driver", "drivers", "quickdriver", "quickdrivers"]:
        driver = db.query(CarDriver).filter(CarDriver.id == account_id).first()
        if driver and driver.licence_front_img:
            account_documents.append({
                "document_id": "account_licence",
                "document_type": "licence",
                "document_name": "Driving License",
                "image_url": generate_signed_url_from_gcs(driver.licence_front_img) if driver.licence_front_img else None,
                "status": driver.licence_front_status.value if driver.licence_front_status else "PENDING",
                "uploaded_at": driver.created_at,
                "car_id": None,
                "car_name": None,
                "car_number": None,
                "expiry_date": driver.licence_expiry_date.isoformat() if driver.licence_expiry_date else None
            })
    
    # Calculate counts
    all_docs = account_documents + car_documents
    pending_count = sum(1 for doc in all_docs if doc["status"] == "PENDING")
    verified_count = sum(1 for doc in all_docs if doc["status"] == "VERIFIED")
    invalid_count = sum(1 for doc in all_docs if doc["status"] == "INVALID")
    
    # Get account name
    account_name = ""
    if account_type_lower in ["vendor", "vendors"]:
        vendor_details = db.query(VendorDetails).filter(VendorDetails.vendor_id == account_id).first()
        account_name = vendor_details.full_name if vendor_details else ""
    elif account_type_lower in ["vehicle_owner", "vehicle_owners", "vehicleowner"]:
        owner_details = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == account_id).first()
        account_name = owner_details.full_name if owner_details else ""
    elif account_type_lower in ["driver", "drivers", "quickdriver", "quickdrivers"]:
        driver = db.query(CarDriver).filter(CarDriver.id == account_id).first()
        account_name = driver.full_name if driver else ""
    
    # Normalize account type
    normalized_account_type = str(account_type_lower).replace("s", "").replace("owner", "_owner")
    
    return {
        "account_id": str(account_id),
        "account_type": normalized_account_type,
        "account_name": account_name,
        "account_documents": account_documents,
        "car_documents": car_documents,
        "total_documents": len(all_docs),
        "pending_count": pending_count,
        "verified_count": verified_count,
        "invalid_count": invalid_count
    }

CAR_DOC_LABELS = {
    "rc_front": "RC Front",
    "rc_back": "RC Back",
    "insurance": "Insurance",
    "fc": "Fitness Certificate",
    "car_img": "Car Image",
    "permit": "Permit",
}


def get_documents_needing_review(db: Session) -> List[dict]:
    """Cross-account queue of every document currently sitting at
    NEEDS_REVIEW (a re-upload that auto-verify still couldn't confirm -
    see utils/document_verifier.py's get_auto_verified_status) across all
    four entity types. Before this, the only way to review a document was
    to already know which specific vendor/owner/car/driver to open
    (get_all_account_documents above) - there was no single "what needs my
    attention right now" list for staff, so a re-upload that failed a
    second time had nowhere to surface."""
    from app.utils.gcs import generate_signed_url_from_gcs

    items: List[dict] = []

    owners = db.query(VehicleOwnerDetails).filter(
        or_(
            VehicleOwnerDetails.aadhar_status == DocumentStatusEnum.NEEDS_REVIEW,
            VehicleOwnerDetails.aadhar_back_status == DocumentStatusEnum.NEEDS_REVIEW,
            VehicleOwnerDetails.pan_status == DocumentStatusEnum.NEEDS_REVIEW,
        )
    ).all()
    for o in owners:
        for doc_type, label, img, doc_status in [
            ("aadhar", "Aadhar Card (Front)", o.aadhar_front_img, o.aadhar_status),
            ("aadhar_back", "Aadhar Card (Back)", o.aadhar_back_img, o.aadhar_back_status),
            ("pan", "PAN Card", o.pan_img, o.pan_status),
        ]:
            if doc_status == DocumentStatusEnum.NEEDS_REVIEW:
                items.append({
                    "entity_type": "vehicle_owner",
                    "entity_id": str(o.vehicle_owner_id),
                    "entity_name": o.full_name,
                    "document_type": doc_type,
                    "document_name": label,
                    "image_url": generate_signed_url_from_gcs(img) if img else None,
                    "uploaded_at": o.created_at.isoformat() if o.created_at else None,
                })

    cars = db.query(CarDetails).filter(
        or_(
            CarDetails.rc_front_status == DocumentStatusEnum.NEEDS_REVIEW,
            CarDetails.rc_back_status == DocumentStatusEnum.NEEDS_REVIEW,
            CarDetails.insurance_status == DocumentStatusEnum.NEEDS_REVIEW,
            CarDetails.fc_status == DocumentStatusEnum.NEEDS_REVIEW,
            CarDetails.permit_status == DocumentStatusEnum.NEEDS_REVIEW,
        )
    ).all()
    owner_ids = {c.vehicle_owner_id for c in cars if c.vehicle_owner_id}
    owner_names_by_id = {}
    if owner_ids:
        for oid, name in db.query(VehicleOwnerDetails.vehicle_owner_id, VehicleOwnerDetails.full_name).filter(
            VehicleOwnerDetails.vehicle_owner_id.in_(owner_ids)
        ).all():
            owner_names_by_id[str(oid)] = name
    for c in cars:
        for doc_type, label, img, doc_status in [
            ("rc_front", "RC Front", c.rc_front_img_url, c.rc_front_status),
            ("rc_back", "RC Back", c.rc_back_img_url, c.rc_back_status),
            ("insurance", "Insurance", c.insurance_img_url, c.insurance_status),
            ("fc", "Fitness Certificate", c.fc_img_url, c.fc_status),
            ("permit", "Permit", c.permit_img_url, c.permit_status),
        ]:
            if doc_status == DocumentStatusEnum.NEEDS_REVIEW:
                items.append({
                    "entity_type": "car",
                    "entity_id": str(c.id),
                    # The owning fleet owner's account_id - account-documents.tsx
                    # (the existing per-account review screen this queue links
                    # into) is keyed by vehicle_owner account_id/account_type,
                    # with cars shown as a sub-section within it; a car has no
                    # standalone document-review screen of its own.
                    "owner_account_id": str(c.vehicle_owner_id) if c.vehicle_owner_id else None,
                    "owner_name": owner_names_by_id.get(str(c.vehicle_owner_id)) if c.vehicle_owner_id else None,
                    "entity_name": f"{c.car_name} ({c.car_number})" if c.car_name else str(c.car_number),
                    "document_type": doc_type,
                    "document_name": label,
                    "image_url": generate_signed_url_from_gcs(img) if img else None,
                    "uploaded_at": c.created_at.isoformat() if c.created_at else None,
                })

    drivers = db.query(CarDriver).filter(
        or_(
            CarDriver.licence_front_status == DocumentStatusEnum.NEEDS_REVIEW,
            CarDriver.licence_back_status == DocumentStatusEnum.NEEDS_REVIEW,
        )
    ).all()
    for d in drivers:
        for doc_type, label, img, doc_status in [
            ("licence", "Driving Licence (Front)", d.licence_front_img, d.licence_front_status),
            ("licence_back", "Driving Licence (Back)", d.licence_back_img, d.licence_back_status),
        ]:
            if doc_status == DocumentStatusEnum.NEEDS_REVIEW:
                items.append({
                    "entity_type": "driver",
                    "entity_id": str(d.id),
                    "entity_name": d.full_name,
                    "document_type": doc_type,
                    "document_name": label,
                    "image_url": generate_signed_url_from_gcs(img) if img else None,
                    "uploaded_at": d.created_at.isoformat() if d.created_at else None,
                })

    vendors = db.query(VendorDetails).filter(
        or_(
            VendorDetails.aadhar_status == DocumentStatusEnum.NEEDS_REVIEW,
        )
    ).all()
    for v in vendors:
        if v.aadhar_status == DocumentStatusEnum.NEEDS_REVIEW:
            items.append({
                "entity_type": "vendor",
                "entity_id": str(v.vendor_id),
                "entity_name": v.full_name,
                "document_type": "aadhar",
                "document_name": "Aadhar Card",
                "image_url": generate_signed_url_from_gcs(v.aadhar_front_img) if v.aadhar_front_img else None,
                "uploaded_at": v.created_at.isoformat() if v.created_at else None,
            })

    items.sort(key=lambda i: i["uploaded_at"] or "", reverse=True)
    return items


def reverify_pending_documents(db: Session, limit: int = 20) -> dict:
    """Re-runs the auto-verify engine (utils/document_verifier.py's
    get_auto_verified_status) on up to `limit` documents currently sitting
    at PENDING or NEEDS_REVIEW, across all four entity types. On-demand,
    triggered from Admin App Settings - not a scheduled job.

    Why this exists: a document only ever gets auto-checked at the moment
    it's uploaded. Two real situations leave a document stuck non-VERIFIED
    with no way to clear it except a manual admin click:
    (a) the auto-verify engine itself gets fixed/improved (a bug in it, or
        a new check like the blur/clarity one added alongside this), and
        every document that failed because of that old bug is still
        sitting there with the stale result;
    (b) a user re-uploads a corrected document through a path that doesn't
        re-trigger verification (or staff just hasn't gotten to reviewing
        their PENDING re-upload yet).
    This re-checks the SAME stored image bytes against the CURRENT engine
    and upgrades anything that now comes back VERIFIED. Never touches
    anything already VERIFIED or INVALID - those are final until the user
    re-uploads, which already re-triggers verification on its own.

    Capped at `limit` per call (default 20), NOT unbounded - each recheck
    downloads the image from GCS and runs OCR (EasyOCR is genuinely
    memory-hungry), all synchronously in one HTTP request/response, on a
    512Mi Cloud Run container that also serves live production traffic.
    Processing every pending document platform-wide in one call was tried
    first and 503'd after ~80s (almost certainly an OOM under real
    document volume) - the caller now gets `has_more` back and can tap the
    button again to keep going in safe batches instead."""
    from app.utils.gcs import download_gcs_bytes
    from app.utils.document_verifier import get_auto_verified_status

    RECHECKABLE = (DocumentStatusEnum.PENDING, DocumentStatusEnum.NEEDS_REVIEW)
    summary = {"checked": 0, "auto_verified": 0, "unchanged": 0, "errors": 0, "has_more": False}

    def _recheck(img_url: Optional[str], doc_type: str, current_status) -> "DocumentStatusEnum":
        if not img_url or current_status not in RECHECKABLE:
            return current_status
        if summary["checked"] >= limit:
            summary["has_more"] = True
            return current_status
        summary["checked"] += 1
        try:
            image_bytes = download_gcs_bytes(img_url)
            new_status = get_auto_verified_status(image_bytes, doc_type, previous_status=current_status)
        except Exception as e:
            print(f"reverify_pending_documents: failed to recheck {doc_type} at {img_url}: {e}")
            summary["errors"] += 1
            return current_status
        if new_status == DocumentStatusEnum.VERIFIED and current_status != DocumentStatusEnum.VERIFIED:
            summary["auto_verified"] += 1
        else:
            summary["unchanged"] += 1
        return new_status

    owners = db.query(VehicleOwnerDetails).filter(
        or_(
            VehicleOwnerDetails.aadhar_status.in_(RECHECKABLE),
            VehicleOwnerDetails.aadhar_back_status.in_(RECHECKABLE),
            VehicleOwnerDetails.pan_status.in_(RECHECKABLE),
        )
    ).all()
    for o in owners:
        o.aadhar_status = _recheck(o.aadhar_front_img, "aadhar", o.aadhar_status)
        o.aadhar_back_status = _recheck(o.aadhar_back_img, "aadhar", o.aadhar_back_status)
        o.pan_status = _recheck(o.pan_img, "pan", o.pan_status)

    cars = db.query(CarDetails).filter(
        or_(
            CarDetails.rc_front_status.in_(RECHECKABLE),
            CarDetails.rc_back_status.in_(RECHECKABLE),
            CarDetails.insurance_status.in_(RECHECKABLE),
            CarDetails.permit_status.in_(RECHECKABLE),
        )
    ).all()
    for c in cars:
        c.rc_front_status = _recheck(c.rc_front_img_url, "rc", c.rc_front_status)
        c.rc_back_status = _recheck(c.rc_back_img_url, "rc", c.rc_back_status)
        c.insurance_status = _recheck(c.insurance_img_url, "insurance", c.insurance_status)
        c.permit_status = _recheck(c.permit_img_url, "permit", c.permit_status)

    drivers = db.query(CarDriver).filter(
        or_(
            CarDriver.licence_front_status.in_(RECHECKABLE),
            CarDriver.licence_back_status.in_(RECHECKABLE),
        )
    ).all()
    for d in drivers:
        d.licence_front_status = _recheck(d.licence_front_img, "licence", d.licence_front_status)
        d.licence_back_status = _recheck(d.licence_back_img, "licence", d.licence_back_status)

    vendors = db.query(VendorDetails).filter(
        VendorDetails.aadhar_status.in_(RECHECKABLE)
    ).all()
    for v in vendors:
        v.aadhar_status = _recheck(v.aadhar_front_img, "aadhar", v.aadhar_status)

    db.commit()
    return summary


def update_document_status_by_id(db: Session, account_id: str, account_type: str, document_id: str, new_status: str, reason: Optional[str] = None) -> dict:
    """
    Update document status by document_id.

    Document ID format:
    - Account documents: "account_aadhar", "account_licence"
    - Car documents: "car_{car_id}_{doc_type}" (e.g., "car_123_rc_front")

    Args:
        db: Database session
        account_id: Account ID (for account documents, can be UUID object or string)
        account_type: Account type (for account documents)
        document_id: Document identifier
        new_status: New status ("PENDING", "VERIFIED", "INVALID")
        reason: Optional admin-supplied explanation, sent to the account
            holder as a notification when new_status is INVALID (rejected).

    Returns:
        Dictionary with update result
    """
    # Ensure account_id is a string
    account_id = str(account_id)
    account_type = str(account_type)
    document_id = str(document_id)
    new_status = str(new_status)

    try:
        doc_status = DocumentStatusEnum[new_status.upper()]
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document status. Must be one of: PENDING, VERIFIED, INVALID"
        )

    # Parse document_id
    if document_id.startswith("account_"):
        # Account document - use account_id and account_type
        doc_type = document_id.replace("account_", "")
        return update_account_document_status(db, account_id, account_type, doc_type, new_status, reason=reason)

    elif document_id.startswith("car_"):
        # Car document: format is "car_{car_id}_{doc_type}"
        parts = document_id.split("_")
        if len(parts) < 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid car document ID format. Expected: car_{car_id}_{doc_type}"
            )

        car_id = parts[1]
        doc_type = "_".join(parts[2:])  # Handle doc types like "car_img"

        car = db.query(CarDetails).filter(CarDetails.id == car_id).first()
        if not car:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Car not found with ID {car_id}"
            )

        # Map document type to status field
        status_field_map = {
            "rc_front": "rc_front_status",
            "rc_back": "rc_back_status",
            "insurance": "insurance_status",
            "fc": "fc_status",
            "car_img": "car_img_status",
            "permit": "permit_status",
        }

        if doc_type not in status_field_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid document type. Must be one of: {list(status_field_map.keys())}"
            )

        setattr(car, status_field_map[doc_type], doc_status)
        db.commit()
        db.refresh(car)

        if doc_status == DocumentStatusEnum.INVALID and car.vehicle_owner_id:
            from app.crud.notification import notify_document_rejected
            notify_document_rejected(
                db, "vehicle_owner", str(car.vehicle_owner_id),
                CAR_DOC_LABELS.get(doc_type, doc_type), reason,
            )

        return {
            "message": f"Car {doc_type} document status updated successfully",
            "document_id": document_id,
            "document_type": doc_type,
            "new_status": new_status.upper()
        }

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid document ID format"
    )


def update_document_expiry_date(db: Session, document_id: str, expiry_date) -> dict:
    """Set the expiry date on an RC/Insurance/Licence document, feeding the
    daily reminder sweep (crud/document_expiry.py). Reuses the same
    document_id parsing as update_document_status_by_id above. `expiry_date`
    is a python date or None (to clear it)."""
    document_id = str(document_id)

    if document_id == "account_licence":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use a driver account_id, not 'account_licence', to set a licence expiry date")

    if document_id.startswith("car_"):
        parts = document_id.split("_")
        if len(parts) < 3:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid car document ID format. Expected: car_{car_id}_{doc_type}")
        car_id = parts[1]
        doc_type = "_".join(parts[2:])

        car = db.query(CarDetails).filter(CarDetails.id == car_id).first()
        if not car:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Car not found with ID {car_id}")

        if doc_type == "rc_front":
            car.rc_expiry_date = expiry_date
        elif doc_type == "insurance":
            car.insurance_expiry_date = expiry_date
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expiry date only applies to rc_front or insurance documents")

        db.commit()
        return {"document_id": document_id, "expiry_date": expiry_date.isoformat() if expiry_date else None}

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid document ID format")


def update_driver_licence_expiry_date(db: Session, driver_id: str, expiry_date) -> dict:
    """Set a driver's licence expiry date - separate from
    update_document_expiry_date above because a driver's document_id is
    always the fixed string "account_licence" (no driver id embedded in
    it, unlike car documents), so the driver id has to come from the route
    instead."""
    driver = db.query(CarDriver).filter(CarDriver.id == str(driver_id)).first()
    if not driver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Driver not found with ID {driver_id}")
    driver.licence_expiry_date = expiry_date
    db.commit()
    return {"driver_id": str(driver_id), "expiry_date": expiry_date.isoformat() if expiry_date else None}


def set_permanent_block(db: Session, account_id: str, account_type: str, reason: str, blocked: bool = True) -> dict:
    """Permanent block/unblock (fraud/confirmed-bad-actor) - a separate,
    deliberate flag from the everyday Active/Inactive/BLOCKED toggle, so a
    genuinely fraudulent account (e.g. fake documents) can't be casually
    un-blocked by a routine status change. Also forces the normal status to
    Inactive/BLOCKED when setting the flag."""
    account_id = str(account_id)
    account_type_lower = str(account_type).lower()

    # A permanent block means this account is dead forever (see the login-
    # side check in vendor/vehicle_owner/car_driver signin routes) - their
    # uploaded ID/RC/licence images serve no further purpose, only ongoing
    # GCS storage cost. Deleted only when actually blocking, never on
    # unblock (there's nothing left to restore by then anyway).
    from app.utils.gcs import delete_gcs_file_by_url

    def _delete_doc_images(urls: list) -> None:
        for url in urls:
            if url:
                try:
                    delete_gcs_file_by_url(url)
                except Exception:
                    pass  # best-effort - never let storage cleanup block the block itself

    if account_type_lower in ["vendor", "vendors"]:
        row = db.query(VendorCredentials).filter(VendorCredentials.id == account_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
        row.permanently_blocked = blocked
        row.permanently_blocked_reason = reason if blocked else None
        if blocked:
            row.account_status = VendorAccountStatusEnum.INACTIVE
            details = db.query(VendorDetails).filter(VendorDetails.vendor_id == account_id).first()
            if details:
                _delete_doc_images([details.aadhar_front_img])
                details.aadhar_front_img = None
        db.commit()
        return {"id": row.id, "account_type": "vendor", "permanently_blocked": row.permanently_blocked}

    elif account_type_lower in ["vehicle_owner", "vehicle_owners", "vehicleowner"]:
        row = db.query(VehicleOwnerCredentials).filter(VehicleOwnerCredentials.id == account_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fleet owner not found")
        row.permanently_blocked = blocked
        row.permanently_blocked_reason = reason if blocked else None
        if blocked:
            row.account_status = VehicleOwnerAccountStatusEnum.INACTIVE
            details = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == account_id).first()
            if details:
                _delete_doc_images([details.aadhar_front_img, details.aadhar_back_img, details.pan_img])
                details.aadhar_front_img = None
                details.aadhar_back_img = None
                details.pan_img = None
        db.commit()
        return {"id": row.id, "account_type": "vehicle_owner", "permanently_blocked": row.permanently_blocked}

    elif account_type_lower in ["driver", "drivers", "quickdriver", "quickdrivers"]:
        row = db.query(CarDriver).filter(CarDriver.id == account_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")
        row.permanently_blocked = blocked
        row.permanently_blocked_reason = reason if blocked else None
        if blocked:
            row.driver_status = DriverStatusEnum.BLOCKED
            _delete_doc_images([row.licence_front_img, row.licence_back_img])
            row.licence_front_img = None
            row.licence_back_img = None
        db.commit()
        return {"id": row.id, "account_type": "driver", "permanently_blocked": row.permanently_blocked}

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid account type")


def update_unified_account_status(db: Session, account_id: str, account_type: str, new_status: str) -> dict:
    """
    Update account status for any account type (unified).
    
    Args:
        db: Database session
        account_id: Account ID (can be UUID object or string)
        account_type: Account type ("vendor", "vehicle_owner", "driver", "quickdriver")
        new_status: New status ("Active", "Inactive", "Pending" for vendors/owners, or driver statuses)
    
    Returns:
        Dictionary with update result
    """
    # Ensure account_id is a string
    account_id = str(account_id)
    account_type_lower = str(account_type).lower()
    
    if account_type_lower in ["vendor", "vendors"]:
        updated_vendor = update_vendor_account_status(db, account_id, new_status)
        return {
            "message": "Vendor account status updated successfully",
            "id": updated_vendor.id,
            "account_type": "vendor",
            "new_status": updated_vendor.account_status.value
        }
    
    elif account_type_lower in ["vehicle_owner", "vehicle_owners", "vehicleowner"]:
        updated_owner = update_vehicle_owner_account_status(db, account_id, new_status)
        return {
            "message": "Fleet owner account status updated successfully",
            "id": updated_owner.id,
            "account_type": "vehicle_owner",
            "new_status": updated_owner.account_status.value
        }
    
    elif account_type_lower in ["driver", "drivers", "quickdriver", "quickdrivers"]:
        updated_driver = update_driver_account_status(db, account_id, new_status)
        return {
            "message": "Driver account status updated successfully",
            "id": updated_driver.id,
            "account_type": "driver",
            "new_status": updated_driver.driver_status.value
        }
    
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid account type"
    )

def update_account_document_status(db: Session, account_id: str, account_type: str, document_type: str, new_status: str, reason: Optional[str] = None) -> dict:
    """
    Update account document status (aadhar or licence).

    Args:
        db: Database session
        account_id: Account ID (can be UUID object or string)
        account_type: Account type
        document_type: "aadhar" or "licence"
        new_status: New status
        reason: Optional admin-supplied explanation, sent to the account
            holder as a notification when new_status is INVALID (rejected).

    Returns:
        Dictionary with update result
    """
    # Ensure all parameters are strings
    account_id = str(account_id)
    account_type = str(account_type)
    document_type = str(document_type)
    new_status = str(new_status)
    
    try:
        doc_status = DocumentStatusEnum[new_status.upper()]
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid document status. Must be one of: PENDING, VERIFIED, INVALID"
        )
    
    account_type_lower = account_type.lower()

    if account_type_lower in ["vendor", "vendors"]:
        if document_type != "aadhar":
            # Vendors genuinely only have a single Aadhar document field
            # (no aadhar_back/pan columns on VendorDetails) - a real
            # restriction, not an oversight.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vendors only have Aadhar documents"
            )
        vendor_details = db.query(VendorDetails).filter(VendorDetails.vendor_id == account_id).first()
        if not vendor_details:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vendor not found"
            )
        vendor_details.aadhar_status = doc_status
        db.commit()
        db.refresh(vendor_details)
        if doc_status == DocumentStatusEnum.INVALID:
            from app.crud.notification import notify_document_rejected
            notify_document_rejected(db, "vendor", account_id, "Aadhar", reason)
        return {
            "message": "Vendor Aadhar document status updated successfully",
            "document_id": f"account_{document_type}",
            "document_type": document_type,
            "new_status": new_status.upper()
        }

    elif account_type_lower in ["vehicle_owner", "vehicle_owners", "vehicleowner"]:
        # Used to only accept "aadhar" - Aadhar Back and PAN (real,
        # separately-tracked document types with their own status columns
        # per app/models/vehicle_owner_details.py) had no way to be
        # approved/rejected by an admin at all; this 400'd every time.
        owner_field_map = {
            "aadhar": "aadhar_status",
            "aadhar_back": "aadhar_back_status",
            "pan": "pan_status",
        }
        if document_type not in owner_field_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid fleet owner document type. Must be one of: {list(owner_field_map.keys())}"
            )
        owner_details = db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == account_id).first()
        if not owner_details:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Fleet owner not found"
            )
        setattr(owner_details, owner_field_map[document_type], doc_status)
        db.commit()
        db.refresh(owner_details)
        if doc_status == DocumentStatusEnum.INVALID:
            from app.crud.notification import notify_document_rejected
            doc_label = {"aadhar": "Aadhar (Front)", "aadhar_back": "Aadhar (Back)", "pan": "PAN Card"}[document_type]
            notify_document_rejected(db, "vehicle_owner", account_id, doc_label, reason)
        return {
            "message": "Fleet Owner document status updated successfully",
            "document_id": f"account_{document_type}",
            "document_type": document_type,
            "new_status": new_status.upper()
        }

    elif account_type_lower in ["driver", "drivers", "quickdriver", "quickdrivers"]:
        # Used to only accept "licence" (front) - Driving Licence (Back)
        # had no way to be approved/rejected by an admin at all, matching
        # the same gap that left it silently un-uploadable from the
        # Driver App (see app/api/routes/car_driver.py's update-document
        # route, which used to have no licence_back_image param either).
        driver_field_map = {
            "licence": "licence_front_status",
            "licence_back": "licence_back_status",
        }
        if document_type not in driver_field_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid driver document type. Must be one of: {list(driver_field_map.keys())}"
            )
        driver = db.query(CarDriver).filter(CarDriver.id == account_id).first()
        if not driver:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Driver not found"
            )
        setattr(driver, driver_field_map[document_type], doc_status)
        db.commit()
        db.refresh(driver)
        if doc_status == DocumentStatusEnum.INVALID:
            from app.crud.notification import notify_document_rejected
            doc_label = "Driving Licence (Front)" if document_type == "licence" else "Driving Licence (Back)"
            notify_document_rejected(db, "driver", account_id, doc_label, reason)
        return {
            "message": "Driver License document status updated successfully",
            "document_id": f"account_{document_type}",
            "document_type": document_type,
            "new_status": new_status.upper()
        }

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid account type"
    )

# ============ CUSTOMER MANAGEMENT ============
# Real customer accounts (customer + customer_details tables), as opposed to
# the old admin UI workaround that inferred "customers" purely from grouping
# self-service booking requests. Customers have no wallet/account_status of
# their own in this schema - kept intentionally simple.

def get_all_customers(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    segment: Optional[str] = None,
) -> Tuple[List[dict], int]:
    """Get all customers (joined with their credentials row for email),
    with pagination and optional name/phone search and segment filter."""
    from app.models.customer import CustomerCredentials
    from app.models.customer_details import CustomerDetails, CustomerSegmentEnum

    query = db.query(CustomerDetails, CustomerCredentials.email).join(
        CustomerCredentials, CustomerDetails.customer_id == CustomerCredentials.id
    )

    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                CustomerDetails.full_name.ilike(like),
                CustomerDetails.primary_number.ilike(like),
                CustomerDetails.company_name.ilike(like),
            )
        )

    if segment:
        try:
            query = query.filter(CustomerDetails.segment == CustomerSegmentEnum[segment.upper()])
        except KeyError:
            pass  # unknown segment value - ignore rather than 500

    total_count = query.count()
    rows = query.order_by(CustomerDetails.created_at.desc()).offset(skip).limit(limit).all()

    customers = []
    for details, email in rows:
        customers.append({
            "id": details.id,
            "customer_id": details.customer_id,
            "full_name": details.full_name,
            "primary_number": details.primary_number,
            "email": email,
            "saved_addresses": details.saved_addresses,
            "segment": details.segment.value if details.segment else "INDIVIDUAL",
            "company_name": details.company_name,
            "gst_number": details.gst_number,
            "created_at": details.created_at,
        })

    return customers, total_count


def update_customer_segment(db: Session, customer_details_id: str, segment: str, company_name: Optional[str] = None, gst_number: Optional[str] = None) -> dict:
    """Owner/Staff-with-customers-permission action: tag a customer as
    Individual/B2B/Corporate. No self-serve B2B signup exists yet - this is
    the only way a customer's segment changes."""
    from app.models.customer_details import CustomerDetails, CustomerSegmentEnum

    details = db.query(CustomerDetails).filter(CustomerDetails.id == customer_details_id).first()
    if not details:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    try:
        details.segment = CustomerSegmentEnum[segment.upper()]
    except KeyError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="segment must be INDIVIDUAL, B2B, or CORPORATE")

    if company_name is not None:
        details.company_name = company_name or None
    if gst_number is not None:
        details.gst_number = gst_number or None

    db.commit()
    db.refresh(details)
    return {
        "id": details.id,
        "segment": details.segment.value,
        "company_name": details.company_name,
        "gst_number": details.gst_number,
    }