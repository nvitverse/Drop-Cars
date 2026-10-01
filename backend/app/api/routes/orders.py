from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, Form, Body, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

from app.database.session import get_db
from app.core.security import get_current_vendor, get_current_driver, get_current_admin, get_current_vehicleOwner_id
from app.schemas.new_orders import UnifiedOrder, CloseOrderResponse, Vendor_Pending_Order_Responce
from app.schemas.order_details import AdminOrderDetailResponse, VendorOrderDetailResponse, VehicleOwnerOrderDetailResponse
from app.crud.orders import get_all_orders, get_vendor_orders, close_order, get_vendor_pending_orders, set_vehicle_owner_visibility, get_max_time_to_assign_by_trip_type, edit_order, notify_order_manually
from app.crud.order_details import get_admin_order_details, get_vendor_order_details, get_vehicle_owner_pending_orders, get_vehicle_owner_non_pending_orders


from app.core.security import get_current_admin, get_current_user_flexible, get_current_driver
router = APIRouter()


@router.get("/all", response_model=List[UnifiedOrder], dependencies=[Depends(get_current_admin)])
def list_all_orders(db: Session = Depends(get_db)):
    return get_all_orders(db)


@router.get("/vendor", response_model=List[UnifiedOrder])
def list_vendor_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    # print(current_vendor.id)
    print("Function executing")
    return get_vendor_orders(db, current_vendor.id, skip, limit)

@router.get("/pending/vendor", response_model=List[Vendor_Pending_Order_Responce])
def list_pending_vendor_orders(
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    print("function check")
    return get_vendor_pending_orders(db, current_vendor.id)


@router.get("/admin/{order_id}", response_model=AdminOrderDetailResponse)
def get_admin_order_details_endpoint(
    order_id: int,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Get full order details for admin with all related data including:
    - Order information
    - Vendor details
    - Assignment history
    - End records
    - Driver and car information
    - Fleet owner information
    """
    order_details = get_admin_order_details(db, order_id)
    if not order_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    return order_details


@router.get("/vendor/{order_id}", response_model=VendorOrderDetailResponse)
def get_vendor_order_details_endpoint(
    order_id: int,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    """
    Get limited order details for vendor with order-related data but excluding sensitive user information:
    - Order information
    - Assignment history
    - End records
    - Basic driver and car info (names and phone numbers only)
    - No personal details like addresses, IDs, etc.
    """
    print("checksss 3")
    print(current_vendor.id)
    order_details = get_vendor_order_details(db, order_id, str(current_vendor.id))
    if not order_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found or you don't have permission to view this order"
        )
    
    return order_details


@router.post("/{order_id}/close", response_model=CloseOrderResponse)
def close_order_endpoint(
    order_id: int,
    closed_vendor_price: int = Form(...),
    closed_driver_price: int = Form(...),
    commision_amount: int = Form(...),
    start_km: int = Form(...),
    end_km: int = Form(...),
    contact_number: str = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    try:
        order, end_record, img_url = close_order(
            db,
            order_id=order_id,
            closed_vendor_price=closed_vendor_price,
            closed_driver_price=closed_driver_price,
            commision_amount=commision_amount,
            driver_id=current_driver.id,
            start_km=start_km,
            end_km=end_km,
            contact_number=contact_number,
            image_file=image,
        )
        return CloseOrderResponse(order_id=order.id, end_record_id=end_record.id, img_url=img_url)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/vehicle-owner/pending", response_model=List[VehicleOwnerOrderDetailResponse])
def get_vehicle_owner_pending_orders_endpoint(
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    """
    Get all pending orders for the authenticated fleet owner.
    
    This endpoint returns orders where the assignment_status is 'PENDING' for the fleet owner.
    The fleet owner ID is extracted from the JWT token.
    
    Returns:
    - List of orders with assignment_status = 'PENDING'
    - Order details including customer info, trip details, vendor info
    - Assignment information specific to this fleet owner
    - Driver and car information if assigned
    """
    try:
        orders = get_vehicle_owner_pending_orders(db, vehicle_owner_id)
        return orders
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving pending orders: {str(e)}"
        )


@router.get("/vehicle-owner/non-pending", response_model=List[VehicleOwnerOrderDetailResponse])
def get_vehicle_owner_non_pending_orders_endpoint(
    start_date: Optional[datetime] = Query(None, description="Inclusive lower bound on Order.created_at"),
    end_date: Optional[datetime] = Query(None, description="Inclusive upper bound on Order.created_at"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    """
    Get all non-pending orders for the authenticated fleet owner.

    This endpoint returns orders where the assignment_status is NOT 'PENDING' for the fleet owner.
    This includes orders with status: ASSIGNED, CANCELLED, COMPLETED, DRIVING.
    The fleet owner ID is extracted from the JWT token.

    Optional start_date/end_date query params (ISO 8601) restrict the range -
    the Executed tab defaults to the last 30 days client-side to avoid
    loading every historical trip for fleets with a long history. Also
    paginated via skip/limit for "all time"/wide ranges.

    Returns:
    - List of orders with assignment_status != 'PENDING'
    - Order details including customer info, trip details, vendor info
    - Assignment information specific to this fleet owner
    - Driver and car information if assigned
    """
    try:
        orders = get_vehicle_owner_non_pending_orders(db, vehicle_owner_id, start_date, end_date, skip, limit)
        return orders
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving non-pending orders: {str(e)}"
        )


@router.get("/vehicle-owner/substitution-requests")
def get_vehicle_owner_substitution_requests_endpoint(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    """Bookings this fleet owner asked to fulfil with a different car (car-substitution requests) that
    admin hasn't approved - PENDING or REJECTED. Approved ones become a normal assignment, so they are
    not listed here. The Driver App shows these under My Rides > Unallocated."""
    from app.models.vehicle_matching import CarSubstitutionRequest, SubstitutionRequestStatusEnum
    from app.models.orders import Order
    from app.models.car_details import CarDetails
    from app.models.car_driver import CarDriver

    rows = (
        db.query(CarSubstitutionRequest)
        .filter(
            CarSubstitutionRequest.vehicle_owner_id == vehicle_owner_id,
            CarSubstitutionRequest.status != SubstitutionRequestStatusEnum.APPROVED,
        )
        .order_by(CarSubstitutionRequest.created_at.desc())
        .limit(limit)
        .all()
    )
    out = []
    for r in rows:
        order = db.query(Order).filter(Order.id == r.order_id).first()
        if not order:
            continue
        car = db.query(CarDetails).filter(CarDetails.id == r.car_id).first()
        driver = db.query(CarDriver).filter(CarDriver.id == r.driver_id).first()
        _v = lambda x: getattr(x, "value", x)
        out.append({
            "id": order.id,
            "order_id": order.id,
            "request_id": r.id,
            "request_status": str(_v(r.status)),
            "admin_notes": r.admin_notes,
            "created_at": r.created_at,
            "decided_at": r.decided_at,
            "trip_type": str(_v(order.trip_type)),
            "car_type": str(_v(order.car_type)),
            "required_car_type": str(_v(r.required_car_type)),
            "offered_car_type": str(_v(r.offered_car_type)),
            "pickup_drop_location": order.pickup_drop_location,
            "start_date_time": order.start_date_time,
            "trip_distance": order.trip_distance,
            "trip_time": order.trip_time,
            "estimated_price": order.estimated_price,
            "vendor_price": order.vendor_price,
            "assigned_car_name": car.car_name if car else None,
            "assigned_car_number": car.car_number if car else None,
            "assigned_driver_name": driver.full_name if driver else None,
        })
    return out


@router.patch("/{order_id}/visibility/vehicle-owner/show")
def show_customer_to_vehicle_owner(
    order_id: int,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    """Vendor-only: allow fleet owners to see customer data for this order."""
    try:
        order = set_vehicle_owner_visibility(db, order_id, str(current_vendor.id), True)
        return {"order_id": order.id, "data_visibility_vehicle_owner": True}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.patch("/{order_id}/visibility/vehicle-owner/hide")
def hide_customer_from_vehicle_owner(
    order_id: int,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    """Vendor-only: hide customer data from fleet owners for this order."""
    try:
        order = set_vehicle_owner_visibility(db, order_id, str(current_vendor.id), False)
        return {"order_id": order.id, "data_visibility_vehicle_owner": False}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


class UpdateVisibilityRequest(BaseModel):
    data_visibility_vehicle_owner: bool


@router.patch("/{order_id}/visibility/vehicle-owner")
def update_data_visibility_vehicle_owner(
    order_id: int,
    request: UpdateVisibilityRequest,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    """
    Vendor-only: Update visibility of customer data for fleet owners.
    
    Args:
        order_id: The ID of the order
        request: Request body containing data_visibility_vehicle_owner boolean
    
    Returns:
        Updated order ID and visibility status
    """
    try:
        order = set_vehicle_owner_visibility(db, order_id, str(current_vendor.id), request.data_visibility_vehicle_owner)
        return {
            "order_id": order.id,
            "data_visibility_vehicle_owner": request.data_visibility_vehicle_owner
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


class EditOrderRequest(BaseModel):
    """All fields optional - only supplied ones change. Increase-only vs
    increase-or-decrease is enforced client-side (Edit vs Increase buttons in
    the Vendor App); the backend allows either direction."""
    cost_per_km: Optional[int] = None
    extra_cost_per_km: Optional[int] = None
    driver_allowance: Optional[int] = None
    extra_driver_allowance: Optional[int] = None
    permit_charges: Optional[int] = None
    extra_permit_charges: Optional[int] = None
    hill_charges: Optional[int] = None
    toll_charges: Optional[int] = None
    night_charges: Optional[int] = None
    pickup_notes: Optional[str] = None
    # Hourly Rental only
    cost_per_hour: Optional[int] = None
    extra_cost_per_hour: Optional[int] = None
    cost_for_addon_km: Optional[int] = None
    extra_cost_for_addon_km: Optional[int] = None


@router.patch("/{order_id}/edit")
async def edit_order_endpoint(
    order_id: int,
    request: EditOrderRequest,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    """
    Vendor-only: edit a booking's fare/rate fields after posting (e.g. raise
    the km price if distance/conditions were misjudged). Allowed at any point
    from posting until the order is completed or cancelled - including while
    a trip is already driving. Recomputes Order.estimated_price/vendor_price
    to match the new rate, and notifies the assigned fleet owner/driver (if
    any) that the price changed.
    """
    try:
        order = edit_order(db, order_id, str(current_vendor.id), request.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

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


class IncreaseFareRequest(BaseModel):
    new_total_amount: int


@router.patch("/{order_id}/increase-all-inclusive-fare")
def increase_all_inclusive_fare_endpoint(
    order_id: int,
    request: IncreaseFareRequest,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    """
    Vendor / Admin: Increase total flat price for ALL_INCLUSIVE bookings.
    Updates booking amounts in database and re-broadcasts an urgent push notification
    alert to all drivers in the pickup city.
    """
    try:
        from app.crud.orders import increase_all_inclusive_fare
        order, old_amount, new_amount = increase_all_inclusive_fare(db, order_id, str(current_vendor.id), request.new_total_amount)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    return {
        "status": "success",
        "order_id": order.id,
        "old_total_amount": old_amount,
        "new_total_amount": new_amount,
        "total_booking_amount": order.total_booking_amount,
        "message": f"Fare increased to ₹{new_amount:,} and driver alert re-broadcasted successfully."
    }


class NotifyOrderRequest(BaseModel):

    target_vehicle_owner_id: Optional[str] = None


@router.post("/{order_id}/notify")
async def notify_order_endpoint(
    order_id: int,
    body: NotifyOrderRequest = Body(default=NotifyOrderRequest()),
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    """
    Vendor-only: manually re-send the new-booking alert for this order (the
    "Notify" button in the Vendor App). If a fleet owner has already accepted
    it, this reminds that owner/driver specifically; otherwise it re-does the
    original broadcast (by city, or to the targeted driver if this was a
    send_to="DRIVER" booking).

    Optional target_vehicle_owner_id: send a targeted alert to one specific
    idle fleet owner (picked from the Vacant Drivers screen) about this
    still-pending booking, instead of the usual broadcast/reminder logic.
    """
    try:
        result = await notify_order_manually(db, order_id, str(current_vendor.id), body.target_vehicle_owner_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/max-assignment-times", dependencies=[Depends(get_current_user_flexible)])
def get_max_assignment_times(
    db: Session = Depends(get_db),
):
    """
    Get the maximum time to assign orders for each trip type based on historical data.
    Returns the maximum time in minutes for oneway, roundtrip, multicity, and hourly rental.
    """
    try:
        max_times = get_max_time_to_assign_by_trip_type(db)
        return {
            "max_assignment_times": max_times,
            "description": "Maximum time in minutes to assign orders for each trip type based on historical data"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving max assignment times: {str(e)}"
        )


class ManualAssignRequest(BaseModel):
    target_id: str
    force_credit: bool = False


@router.post("/{order_id}/manual-assign")
def manual_assign_order(
    order_id: int,
    payload: ManualAssignRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Admin manual assignment: directly assign an unassigned order to a specific fleet owner/driver ID.
    If the fleet owner's wallet balance is lower than the required commission hold amount, returns
    INSUFFICIENT_BALANCE status with low wallet details.
    If force_credit is True, proceeds with assignment and records a negative balance debit.
    """
    from app.models.orders import Order
    from app.crud.manual_allocation import find_fleet_owner, allocate_to_fleet_owner

    target = payload.target_id.strip()
    if not target:
        raise HTTPException(status_code=400, detail="Please provide a target Fleet Owner or Driver ID")

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Booking not found")

    vehicle_owner = find_fleet_owner(db, target)
    if not vehicle_owner:
        raise HTTPException(
            status_code=404,
            detail=f"Fleet Owner or Driver with ID/Phone '{target}' not found."
        )

    # Allocation (wallet hold, or "on credit" when the wallet is too low - the
    # commission is then debited at trip completion), the Owner-visible
    # activity log entry and the pushes all live in crud/manual_allocation.py.
    return allocate_to_fleet_owner(
        db, order, vehicle_owner, on_credit=payload.force_credit, assigned_by="ADMIN", staff=current_admin,
    )


@router.post("/{order_id}/vendor-assign")
def vendor_assign_order(
    order_id: int,
    payload: ManualAssignRequest,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    """
    Vendor-initiated direct assignment: the vendor searches a registered
    fleet owner/driver (see /vendor/drivers/search) and hands this specific
    booking straight to them, bypassing the normal race-to-accept flow.
    Mirrors manual_assign_order (the admin equivalent) - same wallet-hold
    and INSUFFICIENT_BALANCE/force_credit shape - but scoped to a vendor's
    own bookings only, and tags the resulting assignment `assigned_by`
    "VENDOR" so the UI can show "Allocated" instead of "Accepted".
    """
    from app.models.orders import Order
    from app.crud.manual_allocation import find_fleet_owner, allocate_to_fleet_owner

    target = payload.target_id.strip()
    if not target:
        raise HTTPException(status_code=400, detail="Please provide a target Fleet Owner or Driver ID")

    # Must belong to this vendor
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Booking not found")
    if str(order.vendor_id) != str(current_vendor.id):
        raise HTTPException(status_code=403, detail="This booking does not belong to you")

    vehicle_owner = find_fleet_owner(db, target)
    if not vehicle_owner:
        raise HTTPException(
            status_code=404,
            detail=f"Fleet Owner or Driver with ID/Phone '{target}' not found."
        )

    # Credit allocation is admin-only: a vendor's force_credit is ignored, so a
    # low wallet always comes back as INSUFFICIENT_BALANCE.
    result = allocate_to_fleet_owner(db, order, vehicle_owner, on_credit=False, assigned_by="VENDOR")
    if result.get("status") == "SUCCESS":
        result["target_name"] = vehicle_owner.full_name
    return result


class AdminCancelOrderRequest(BaseModel):
    reason: str


class RemoveWithPenaltyRequest(BaseModel):
    penalty_amount: int
    reason: str


def _check_cancellation_role_permission(admin) -> bool:
    """Helper to check if logged-in admin has high-level cancellation rights:
    role in ('manager', 'owner', 'founder') or permissions array containing them."""
    role = (getattr(admin, "role", "") or "").lower()
    if role in ("manager", "owner", "founder"):
        return True
    perms = [str(p).lower() for p in (getattr(admin, "permissions", []) or [])]
    if any(p in perms for p in ("manager", "owner", "founder", "cancel_booking", "booking_cancellation")):
        return True
    return False


@router.post("/{order_id}/cancel-by-admin")
def cancel_order_by_admin(
    order_id: int,
    payload: AdminCancelOrderRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Role-gated cancellation endpoint ("Cancelled by Customer").
    Restricted to high-level admin roles (manager, owner, founder).
    Lower-tier support/ops admins will receive a 403 Forbidden.
    
    Explicitly updates trip_status to CANCELLED_BY_CUSTOMER, releases active
    assignment safely, refunds any hold if appropriate, and logs an entry in
    AdminActivityLog (action='ORDER_CANCELLED_BY_ADMIN_AS_CUSTOMER').
    """
    if not _check_cancellation_role_permission(current_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Standard cancellation is restricted to Manager, Owner, or Founder roles."
        )

    from app.models.orders import Order, Trip_status, CancelledByEnum
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.crud.admin_activity_log import log_admin_action
    from app.crud.wallet import credit_wallet

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    reason = payload.reason.strip() if payload.reason else "Cancelled by Customer via Admin"

    # trip_status is a 3-value DB enum (PENDING/COMPLETED/CANCELLED) - the
    # granular "who/why" lives only in cancelled_by (its own 5-value enum).
    # Was assigning Trip_status.CANCELLED_BY_CUSTOMER, a Python enum member
    # with no matching Postgres value, which crashed this endpoint with a
    # 500 DataError every time it ran.
    order.trip_status = Trip_status.CANCELLED
    order.cancelled_by = CancelledByEnum.CANCELLED_BY_CUSTOMER
    order.cancel_note = reason

    # Safely release active assignment if one exists
    active_assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.assignment_status.notin_([AssignmentStatusEnum.CANCELLED, AssignmentStatusEnum.COMPLETED])
    ).first()

    if active_assignment:
        active_assignment.assignment_status = AssignmentStatusEnum.CANCELLED
        active_assignment.cancelled_at = datetime.utcnow()
        active_assignment.cancel_note = reason

        # Refund hold if applicable
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
                print(f"Hold refund warning on cancel_order_by_admin: {e}")

    from app.crud.wallet import release_poster_advance_hold
    release_poster_advance_hold(db, order, "booking cancelled by admin")

    db.commit()

    # Log in AdminActivityLog
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
        "message": f"Booking #{order_id} has been cancelled as CANCELLED_BY_CUSTOMER.",
        "order_id": order.id,
        "trip_status": order.trip_status,
        "cancelled_by": order.cancelled_by,
    }


@router.post("/{order_id}/cancel-by-vendor")
def cancel_order_by_vendor(
    order_id: int,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor),
):
    from app.models.orders import Order
    from app.models.common_enums import Trip_status, CancelledByEnum

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Booking not found")

    order.trip_status = Trip_status.CANCELLED
    order.cancelled_by = CancelledByEnum.CANCELLED_BY_VENDOR
    db.commit()
    db.refresh(order)

    return {
        "status": "SUCCESS",
        "message": f"Booking #{order_id} has been cancelled by vendor.",
        "order_id": order.id,
        "trip_status": order.trip_status,
        "cancelled_by": order.cancelled_by,
    }


@router.post("/{order_id}/unallocate-with-penalty")
def unallocate_driver_with_penalty(
    order_id: int,
    payload: RemoveWithPenaltyRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    "Remove with Penalty" (Driver Unallocation) endpoint.
    - Keeps the order alive (resets trip_status back to PENDING for dispatch feed).
    - Updates assignment status back to unallocated (cancels active assignment row & clears target driver).
    - Applies penalty deduction to assigned Fleet Owner / Driver wallet balance.
    - Records transaction in WalletLedger with reference_type="PENALTY_UNALLOCATION".
    - Logs event in AdminActivityLog (action="DRIVER_REMOVED_WITH_PENALTY").
    """
    from app.models.orders import Order, Trip_status
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.models.car_driver import CarDriver
    from app.crud.wallet import debit_wallet_allow_negative
    from app.crud.admin_activity_log import log_admin_action

    if payload.penalty_amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Penalty amount must be greater than zero")

    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A mandatory removal reason is required")

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    # Find active assignment
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
            detail="No active assignment or fleet owner found on this booking to penalize."
        )

    # Keep order alive & visible on dispatch feed
    order.trip_status = Trip_status.PENDING
    order.target_driver_id = None

    # Apply penalty deduction to assigned Fleet Owner's wallet balance
    new_balance, ledger_entry = debit_wallet_allow_negative(
        db,
        vehicle_owner_id=target_vo_id,
        amount=payload.penalty_amount,
        reference_id=str(order.id),
        reference_type="PENALTY_UNALLOCATION",
        notes=f"Driver removed with penalty for Booking #{order.id}: {reason}"
    )

    db.commit()

    # Log in AdminActivityLog
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
            "penalty_amount": payload.penalty_amount,
            "reason": reason,
            "vehicle_owner_id": target_vo_id,
            "new_wallet_balance": new_balance,
        }
    )

    return {
        "status": "SUCCESS",
        "message": f"Driver removed with ₹{payload.penalty_amount} penalty. Order #{order_id} is now unallocated.",
        "order_id": order.id,
        "trip_status": order.trip_status,
        "assignment_status": "UNALLOCATED",
        "penalty_amount": payload.penalty_amount,
        "wallet_balance_after": new_balance,
    }


class PriorityUpdateRequest(BaseModel):
    priority_cutoff_at: Optional[datetime] = None
    priority_for_paid: Optional[bool] = True


@router.post("/orders/{order_id}/release-priority")
@router.post("/api/v1/orders/{order_id}/release-priority")
def release_order_priority_endpoint(
    order_id: int,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Early release of a booking's Trusted-Partner priority lock.
    Dispatches instant push notification & in-app alerts to all drivers.
    """
    from app.models.orders import Order
    from app.models.new_orders import NewOrder
    from app.crud.notification import notify_priority_lock_changed

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.priority_for_paid = False
    order.priority_cutoff_at = None
    
    if order.source_order_id:
        new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
        if new_order:
            new_order.priority_for_paid = False
            new_order.priority_cutoff_at = None

    db.commit()

    start_city = ""
    if order.pickup_drop_location and isinstance(order.pickup_drop_location, dict):
        start_city = order.pickup_drop_location.get("0", "")

    notify_priority_lock_changed(db, order.id, start_city, action_type="RELEASED")

    return {
        "status": "SUCCESS",
        "message": f"Priority lock released early for Booking #{order_id}. Drivers notified!",
        "order_id": order.id,
        "priority_for_paid": False
    }


@router.post("/orders/{order_id}/update-priority")
@router.post("/api/v1/orders/{order_id}/update-priority")
def update_order_priority_endpoint(
    order_id: int,
    payload: PriorityUpdateRequest,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    """
    Extends or updates a booking's priority window timeline.
    Dispatches instant push notification & in-app alerts to all drivers.
    """
    from app.models.orders import Order
    from app.models.new_orders import NewOrder
    from app.crud.notification import notify_priority_lock_changed

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if payload.priority_for_paid is not None:
        order.priority_for_paid = bool(payload.priority_for_paid)
    if payload.priority_cutoff_at is not None:
        order.priority_cutoff_at = payload.priority_cutoff_at

    if order.source_order_id:
        new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
        if new_order:
            if payload.priority_for_paid is not None:
                new_order.priority_for_paid = bool(payload.priority_for_paid)
            if payload.priority_cutoff_at is not None:
                new_order.priority_cutoff_at = payload.priority_cutoff_at

    db.commit()

    start_city = ""
    if order.pickup_drop_location and isinstance(order.pickup_drop_location, dict):
        start_city = order.pickup_drop_location.get("0", "")

    cutoff_str = ""
    if order.priority_cutoff_at:
        try:
            cutoff_str = order.priority_cutoff_at.strftime("%d %b, %I:%M %p")
        except Exception:
            cutoff_str = str(order.priority_cutoff_at)

    action_type = "RELEASED" if not order.priority_for_paid else "EXTENDED"
    notify_priority_lock_changed(db, order.id, start_city, action_type=action_type, new_cutoff_str=cutoff_str)

    return {
        "status": "SUCCESS",
        "message": f"Priority lock timeline updated for Booking #{order_id}. Drivers notified!",
        "order_id": order.id,
        "priority_for_paid": order.priority_for_paid,
        "priority_cutoff_at": str(order.priority_cutoff_at) if order.priority_cutoff_at else None
    }



