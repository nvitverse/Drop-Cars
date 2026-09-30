from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List,Union,Optional
from datetime import datetime
from pydantic import BaseModel
from app.crud.notification import send_booking_accepted_to_telegram, send_booking_cancelled_to_telegram, send_push_notification_to_vendor, send_push_notification_to_vendor_driver
from app.database.session import get_db
from app.core.security import get_current_user, get_current_vehicleOwner_id, get_current_driver, get_current_vendor
from app.schemas.order_assignments import (
    OrderAssignmentCreate,
    OrderAssignmentResponse,
    OrderAssignmentStatusUpdate,
    OrderAssignmentWithOrderDetails,
    UpdateCarDriverRequest,
    StartTripRequest,
    StartTripResponse,
    EndTripRequest,
    EndTripResponse,
    DriverOrderListResponse,
    DriverOrderReport,
    vehicle_owner_pending_new_orders,
    vehicle_owner_pending_horuly_rental
)
import asyncio
from app.crud.order_assignments import (
    create_order_assignment,
    get_order_assignment_by_id,
    get_order_assignments_by_vehicle_owner_id,
    get_order_assignments_by_order_id,
    update_assignment_status,
    cancel_assignment,
    complete_assignment,
    get_vendor_orders_with_assignments,
    update_assignment_car_driver,
    get_driver_assigned_orders,
    check_vehicle_owner_balance,
    get_driver_assigned_orders_report,
    cancel_order_by_vendor,
    get_driver_assigned_orders_completed_trip
)
from app.models.order_assignments import AssignmentStatusEnum, OrderAssignment
from app.models.new_orders import NewOrder
from app.models.car_details import CarDetails
from app.models.car_driver import CarDriver

router = APIRouter()


@router.get("/available-drivers")
async def get_available_drivers(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Get all available drivers with ONLINE status for the authenticated fleet owner"""
    # Get vehicle_owner_id from the authenticated user
    vehicle_owner_id = str(current_user.vehicle_owner_id)
    
    from app.crud.car_driver import get_available_drivers
    available_drivers = get_available_drivers(db, vehicle_owner_id)
    return available_drivers


@router.get("/available-cars")
async def get_available_cars(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Get all available cars with ONLINE status for the authenticated fleet owner"""
    # Get vehicle_owner_id from the authenticated user
    vehicle_owner_id = str(current_user.vehicle_owner_id)
    
    from app.crud.car_details import get_available_cars
    available_cars = get_available_cars(db, vehicle_owner_id)
    return available_cars


@router.get("/driver/available-cars")
async def get_available_cars_for_driver(
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Same as /available-cars above but driver-authenticated - for Drop Bid,
    where the driver themselves picks which of their fleet's cars to offer
    on a negotiation, not the fleet owner."""
    from app.crud.car_details import get_available_cars as _get_available_cars
    return _get_available_cars(db, str(current_driver.vehicle_owner_id))


@router.get("/driver/available-drivers")
async def get_available_drivers_for_driver(
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Same as /available-drivers above but driver-authenticated - returns drivers under this fleet owner."""
    from app.crud.car_driver import get_drivers_by_vehicleOwner_id
    return get_drivers_by_vehicleOwner_id(db, str(current_driver.vehicle_owner_id))



@router.get("/vehicle_owner/pending", response_model=List[Union[vehicle_owner_pending_new_orders,vehicle_owner_pending_horuly_rental]])
async def get_pending_orders_for_vehicle_owner(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Get pending orders for the authenticated fleet owner based on business rules"""
    try:
        # get_current_user() also accepts a vendor token - VendorCredentials
        # has no vehicle_owner_id at all (fleet-owner-only concept), which
        # used to raise a raw AttributeError -> 500 here instead of a clean
        # 403. Fixed 2026-09-04.
        raw_vehicle_owner_id = getattr(current_user, "vehicle_owner_id", None)
        if raw_vehicle_owner_id is None:
            raise HTTPException(status_code=403, detail="Only a fleet owner account can view pending orders here")
        vehicle_owner_id = str(raw_vehicle_owner_id)

        from app.crud.order_assignments import get_pending_orders_for_vehicle_owner
        pending_orders = get_pending_orders_for_vehicle_owner(db, vehicle_owner_id)
        
        # Log the number of orders found for debugging
        print(f"Found {len(pending_orders)} pending orders for fleet owner {vehicle_owner_id}")
        
        return pending_orders
    except HTTPException:
        # Let a deliberate raise (e.g. the 403 above) through as-is instead
        # of getting relabeled 500 by the catch-all below.
        raise
    except Exception as e:
        print(f"Error in get_pending_orders_for_vehicle_owner: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/acceptorder", response_model=OrderAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def accept_order(
    payload: OrderAssignmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Accept an order and create assignment with balance check"""
    try:
        # Get vehicle_owner_id from the authenticated user
        vehicle_owner_id = str(current_user.vehicle_owner_id)

        # Idempotent re-accept check: Check if order already has an active assignment
        existing_assignment = db.query(OrderAssignment).filter(
            OrderAssignment.order_id == payload.order_id,
            OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED
        ).first()
        if existing_assignment:
            if str(existing_assignment.vehicle_owner_id) == str(vehicle_owner_id):
                return existing_assignment
            else:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This booking has already been accepted by another driver"
                )

        # Verification gate: accepting only needs the owner's own KYC
        # verified (Aadhar + PAN) - a specific car/driver isn't picked yet
        # at this point, so those aren't checked here (see assign_car_driver
        # below for that gate).
        from app.crud.verification import is_owner_kyc_verified
        from app.models.vehicle_owner_details import VehicleOwnerDetails
        owner_details = db.query(VehicleOwnerDetails).filter(
            VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
        ).first()
        if not is_owner_kyc_verified(owner_details):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your KYC (Aadhar + PAN) must be verified before you can accept bookings. Check Settings > Profile."
            )

        # Get order details to check estimated price
        from app.models.orders import Order
        order = db.query(Order).filter(Order.id == payload.order_id).first()
        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Booking not found"
            )
        if order.cancelled_by == "CANCELLED_BY_VENDOR":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot accept an Booking that has been cancelled by vendor"
            )
        
        if order.cancelled_by == "AUTO_CANCELLED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot accept an Booking that has been already accepted by someone"
            )

        # Vehicle-type gate: only a fleet with a VERIFIED car of the exact
        # type this booking was posted for can accept it - a customer who
        # was quoted/expects an Innova Crysta shouldn't end up with
        # whatever car a driver happened to have. Structured detail (not
        # just a string) so the Driver App can show "Add {type} to accept"
        # + a "Request for My Car" escape hatch instead of a generic error.
        # A booking's poster can't accept their own booking (they posted it
        # for someone else to drive - see driver_create_booking_confirm).
        if getattr(order, "posted_by_vehicle_owner_id", None) is not None and str(order.posted_by_vehicle_owner_id) == str(vehicle_owner_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You posted this booking, so you can't accept it yourself. Another driver will accept it - you can cancel it from My Trips."
            )

        if order.car_type is not None:
            from app.crud.vehicle_matching import vehicle_match_status, log_mismatch_attempt
            match = vehicle_match_status(db, vehicle_owner_id, order.car_type)
            if match != "OK":
                type_label = order.car_type.value.replace('_', ' ').title()
                if match == "NO_CAR":
                    # Real unmet demand - worth an Admin-visible record.
                    log_mismatch_attempt(db, order.id, vehicle_owner_id, order.car_type)
                    message = f"This booking needs a verified {type_label}. Add one to your fleet to accept it, or request to fulfil it with a different car of yours."
                else:
                    message = f"You have a car that fits this {type_label} booking, but its documents aren't fully verified yet. Get it verified to accept this booking."
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "error": "VEHICLE_TYPE_MISMATCH",
                        "reason": match,
                        "required_car_type": order.car_type.value,
                        "message": message,
                    }
                )

        # Priority window: Local bookings (Phase 06) always skip this -
        # Outstation bookings default to Preferred-partners-only until the
        # vendor's chosen cutoff, unless the vendor turned the window off.
        from datetime import datetime, timezone
        accepting_tier = getattr(current_user, "tier", "STANDARD")
        if order.priority_for_paid and order.priority_cutoff_at and accepting_tier != "PREFERRED":
            cutoff = order.priority_cutoff_at
            if cutoff.tzinfo is None:
                cutoff = cutoff.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) < cutoff:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Accepting bookings is available to Preferred Partners at this time. "
                           "This booking opens to Standard Partners shortly - please check back."
                )

        # Per-day fleet capacity: a fleet owner may accept at most 2 bookings
        # per car they own, per pickup date (prevents over-committing more
        # trips than they can realistically staff on a given day).
        from sqlalchemy import func
        car_count = db.query(CarDetails).filter(CarDetails.vehicle_owner_id == vehicle_owner_id).count()
        if car_count > 0 and order.start_date_time is not None:
            same_day_accepted = (
                db.query(OrderAssignment)
                .join(Order, OrderAssignment.order_id == Order.id)
                .filter(
                    OrderAssignment.vehicle_owner_id == vehicle_owner_id,
                    OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED,
                    func.date(Order.start_date_time) == func.date(order.start_date_time),
                )
                .count()
            )
            daily_limit = car_count * 2
            if same_day_accepted >= daily_limit:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Daily booking limit reached for this date ({same_day_accepted}/{daily_limit} - up to 2 bookings per car you own). "
                           f"Complete or reassign an existing booking on this date before accepting more."
                )

        # Symmetrical Wallet Hold Guarantee System:
        # Commission rate: 2% for Vendor-posted bookings, 15% for Website/Direct/DropBid bookings.
        import math
        is_vendor_booking = bool(getattr(order, "vendor_id", None))
        comm_rate = 0.02 if is_vendor_booking else 0.15

        total_booking = getattr(order, "total_booking_amount", None) or getattr(order, "estimated_price", None) or 0
        extra_amt = getattr(order, "extra_amount", None) or 0
        advance_rec = getattr(order, "advance_received", None) or 0

        admin_comm = math.ceil(total_booking * comm_rate)
        driver_earnings = max(0, total_booking - admin_comm)
        cash_to_collect = max(0, (total_booking + extra_amt) - advance_rec)

        if cash_to_collect > driver_earnings:
            hold_amount = math.ceil((cash_to_collect - driver_earnings) + admin_comm)
            vendor_hold_amount = 0
        else:
            hold_amount = admin_comm
            vendor_hold_amount = math.ceil(driver_earnings - cash_to_collect)

        # Every booking (vendor, driver-posted, website, admin) uses the shared commission split
        # (utils/commission.py) - the same numbers trip close settles with, so the amount held here is
        # exactly what the driver hands over at the end. The old formula above kept counting the cash excess
        # on top of the commission, and used 15% for every booking without a vendor. Vendor bookings and
        # Hourly Rental keep the formula above.
        _src = getattr(getattr(order, "source", None), "value", getattr(order, "source", None))
        if _src != "HOURLY_RENTAL":
            from app.utils.commission import estimate_split_for_order, expected_hold
            _split = estimate_split_for_order(db, order)
            hold_amount = expected_hold(_split, advance_rec)
            # no separate vendor payout hold any more: the vendor's advance already sits in their wallet and the
            # trip-close settlement moves the exact difference (see end_records._settle_trip)
            vendor_hold_amount = 0

        # Check if fleet owner has sufficient balance for the hold
        if hold_amount > 0 and not check_vehicle_owner_balance(db, vehicle_owner_id, hold_amount):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient wallet balance. Required minimum: ₹{hold_amount}"
            )

        # Hold vendor payout guarantee if cash to collect is less than driver earnings
        if vendor_hold_amount > 0 and is_vendor_booking and order.vendor_id:
            from app.crud.vendor_wallet import debit_vendor_wallet
            try:
                debit_vendor_wallet(
                    db,
                    vendor_id=str(order.vendor_id),
                    amount=vendor_hold_amount,
                    order_id=order.id,
                    reference_id=str(order.id),
                    reference_type="DRIVER_PAYOUT_HOLD",
                    notes=f"Driver payout guarantee hold for Order #{order.id}",
                )
            except Exception as ve:
                print(f"Vendor payout guarantee hold warning: {ve}")

        # Create the order assignment
        assignment = create_order_assignment(
            db=db,
            order_id=payload.order_id,
            vehicle_owner_id=vehicle_owner_id,
            accepted_tier=accepting_tier,
            held_amount=hold_amount,
        )

        # HOLD the commission + excess cash from driver wallet
        if hold_amount > 0:
            from app.crud.wallet import debit_wallet
            debit_wallet(
                db,
                vehicle_owner_id=vehicle_owner_id,
                amount=hold_amount,
                reference_id=str(order.id),
                reference_type="TRIP_HOLD",
                notes=f"Held (not final) for Booking ID {order.id} - refunded if it is cancelled; any unused part is returned when the trip completes",
            )

        db.commit()
        print("Order is Accepted",assignment.order_id)

        from app.utils.trip_emails import send_trip_accepted_email
        send_trip_accepted_email(db, vehicle_owner_id, order)

        # Website-originated booking: live status + "someone accepted" email
        # to the customer, before a specific driver/car is assigned.
        from app.utils.website_status_webhook import notify_website_of_status, notify_customer_accepted_email
        notify_website_of_status(db, assignment.order_id, "ACCEPTED")
        notify_customer_accepted_email(db, assignment.order_id)

        await send_push_notification_to_vendor(db, assignment.order_id, "Order Accepted", f"ORDER ID : {assignment.order_id} is Accepted by",str(assignment.vehicle_owner_id))
        # Driver-posted booking (no vendor): tell the poster it was taken.
        from app.crud.notification import notify_booking_poster
        notify_booking_poster(db, order, "✅ Your booking was accepted", f"Booking #{assignment.order_id} has been accepted by a driver. You'll be told when a driver and car are assigned.")
        await send_booking_accepted_to_telegram(master_id = assignment.order_id)
        return assignment

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to accept order: {str(e)}"
        )


@router.get("/{assignment_id}", response_model=OrderAssignmentResponse)
async def get_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Get order assignment by ID"""
    assignment = get_order_assignment_by_id(db, assignment_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    # Check if the current user is the fleet owner of this assignment
    if str(assignment.vehicle_owner_id) != str(current_user.vehicle_owner_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this assignment"
        )
    
    return assignment


@router.get("/vehicle_owner/{vehicle_owner_id}", response_model=List[OrderAssignmentResponse])
async def get_assignments_by_vehicle_owner(
    vehicle_owner_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Get all assignments for a specific fleet owner"""
    print(f"Fleet owner ID: {vehicle_owner_id}")
    # Verify the authenticated user is requesting their own assignments
    if str(vehicle_owner_id) != str(current_user.vehicle_owner_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view these assignments"
        )
    print("Order assignment")
    assignments = get_order_assignments_by_vehicle_owner_id(db, vehicle_owner_id)
    return assignments


@router.get("/order/{order_id}", response_model=List[OrderAssignmentResponse])
async def get_assignments_by_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Get all assignments for a specific order"""
    assignments = get_order_assignments_by_order_id(db, order_id)
    return assignments


@router.patch("/{assignment_id}/status", response_model=OrderAssignmentResponse)
async def update_assignment_status_endpoint(
    assignment_id: int,
    payload: OrderAssignmentStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Update assignment status"""
    # Get the assignment first to check authorization
    assignment = get_order_assignment_by_id(db, assignment_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    # Check if the current user is the fleet owner of this assignment
    if str(assignment.vehicle_owner_id) != str(current_user.vehicle_owner_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this assignment"
        )
    
    # Update the status
    updated_assignment = update_assignment_status(db, assignment_id, payload.assignment_status)
    if not updated_assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update assignment status"
        )
    
    return updated_assignment


@router.patch("/{assignment_id}/cancel", response_model=OrderAssignmentResponse)
async def cancel_assignment_endpoint(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Cancel an assignment"""
    # Get the assignment first to check authorization
    assignment = get_order_assignment_by_id(db, assignment_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    # Check if the current user is the fleet owner of this assignment
    if str(assignment.vehicle_owner_id) != str(current_user.vehicle_owner_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to cancel this assignment"
        )

    # A DRIVING assignment carries a cancellation penalty instead of a plain
    # status flip - same rule as the vendor's cancel-order route (see
    # apply_driving_cancellation_penalty in app/crud/order_assignments.py).
    if assignment.assignment_status == AssignmentStatusEnum.DRIVING:
        from app.models.orders import Order
        from app.crud.order_assignments import apply_driving_cancellation_penalty
        order = db.query(Order).filter(Order.id == assignment.order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found for this assignment")
        apply_driving_cancellation_penalty(db, order, assignment)
        db.commit()
        db.refresh(assignment)
        return assignment

    # Cancel the assignment
    cancelled_assignment = cancel_assignment(db, assignment_id)
    if not cancelled_assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to cancel assignment"
        )
    return cancelled_assignment


@router.patch("/{assignment_id}/complete", response_model=OrderAssignmentResponse)
async def complete_assignment_endpoint(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Complete an assignment"""
    # Get the assignment first to check authorization
    assignment = get_order_assignment_by_id(db, assignment_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    # Check if the current user is the fleet owner of this assignment
    if str(assignment.vehicle_owner_id) != str(current_user.vehicle_owner_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to complete this assignment"
        )
    
    # Complete the assignment
    completed_assignment = complete_assignment(db, assignment_id)
    if not completed_assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to complete assignment"
        )
    
@router.patch("/{assignment_id}/assign-car-driver", response_model=OrderAssignmentResponse)
async def assign_car_driver(
    assignment_id: int,
    payload: UpdateCarDriverRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    try:
        """Assign car and driver to an accepted order"""
        # Get the assignment first to check authorization
        assignment = get_order_assignment_by_id(db, assignment_id)
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assignment not found"
            )

        # Check if the current user is the fleet owner of this assignment
        if str(assignment.vehicle_owner_id) != str(current_user.vehicle_owner_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to update this assignment"
            )

        # Verification gate: THIS specific car and THIS specific driver must
        # each be individually verified - an owner can have a mix of
        # verified/unverified cars and drivers, only the ones actually being
        # assigned here are checked.
        from app.crud.verification import is_car_verified, is_driver_verified
        car_to_assign = db.query(CarDetails).filter(CarDetails.id == str(payload.car_id)).first()
        if not is_car_verified(car_to_assign):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This car's documents (RC, Insurance, Permit) must be verified before it can be assigned to a trip."
            )
        driver_to_assign = db.query(CarDriver).filter(CarDriver.id == str(payload.driver_id)).first()
        if not is_driver_verified(driver_to_assign):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This driver's license must be verified before they can be assigned to a trip."
            )

        # Vehicle-type gate, defense in depth - accept_order already
        # blocks a fleet with NO matching car type at all, but a mixed
        # fleet (some Sedans, some Crystas) could still try to attach the
        # WRONG one here specifically. Admin-approved substitution
        # requests bypass this entirely by creating the assignment
        # directly (see crud/vehicle_matching.py), so this only ever
        # blocks a normal owner-driven assign.
        from app.models.orders import Order
        order_for_assignment = db.query(Order).filter(Order.id == assignment.order_id).first()
        # car_to_assign.car_type (car_details.CarTypeEnum) and
        # order_for_assignment.car_type (new_orders.CarTypeEnum) are
        # different Python classes despite identical members/values -
        # comparing the enum instances directly with != always evaluated
        # True (they can never be `is`-equal across classes), so this
        # falsely blocked every single matching assignment. Compare on
        # .value instead.
        from app.crud.vehicle_matching import car_type_satisfies
        if order_for_assignment and order_for_assignment.car_type is not None and not car_type_satisfies(car_to_assign.car_type, order_for_assignment.car_type):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "VEHICLE_TYPE_MISMATCH",
                    "required_car_type": order_for_assignment.car_type.value,
                    "message": f"This booking needs a {order_for_assignment.car_type.value.replace('_', ' ').title()}, not a {car_to_assign.car_type.value.replace('_', ' ').title()}. Pick a matching car, or request to fulfil it with this one instead.",
                }
            )

        # Car-make-year requirement gate - the field has existed on Order
        # since it was added for the poster's "Special Requirements" (see
        # create-booking's requireCarMakeYear/carMakeYear), and the Driver
        # App already shows it as info on the booking, but nothing actually
        # enforced it before this (found 2026-09-29) - any car could be
        # assigned regardless. car_to_assign.year_of_the_car is a free-text
        # string (as typed at registration), so this only blocks when it
        # parses as a clean integer < the requirement; a blank/unparseable
        # year is treated the same as "unknown" and is not blocked (matches
        # how every other optional requirement in this codebase behaves).
        if order_for_assignment and order_for_assignment.car_make_year_requirement:
            try:
                car_year_val = int(str(car_to_assign.year_of_the_car).strip()[:4])
            except (TypeError, ValueError):
                car_year_val = None
            if car_year_val is not None and car_year_val < order_for_assignment.car_make_year_requirement:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "error": "CAR_YEAR_MISMATCH",
                        "required_year": order_for_assignment.car_make_year_requirement,
                        "message": f"This booking needs a car made in {order_for_assignment.car_make_year_requirement} or newer - this car is from {car_year_val}. Pick a newer car, or request to fulfil it with this one instead.",
                    }
                )

        # Update the assignment with car and driver
        updated_assignment = update_assignment_car_driver(
            db,
            assignment_id,
            str(payload.driver_id),
            str(payload.car_id)
        )

        if not updated_assignment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to assign car and driver"
            )
            
        if updated_assignment.car_id or updated_assignment.driver_id:
            try:
                await send_push_notification_to_vendor_driver(
                    db,
                    order_id=str(updated_assignment.order_id),
                    vehicle_owner_id=str(updated_assignment.vehicle_owner_id),
                    driver_id = str(updated_assignment.driver_id),
                    car_id = str(updated_assignment.car_id)
                )
            except Exception as push_err:
                print(f"Push notification failed (assignment still saved): {push_err}")

        # Driver+car fully assigned - generate the trip-start/trip-close OTPs
        # now (see OrderAssignment model for why) so they're ready for the
        # assigned-email below, regardless of booking source (website or app).
        if updated_assignment.car_id and updated_assignment.driver_id:
            import secrets
            from app.crud.trip_otp import apply_order_otps_to_assignment
            # Same codes the vendor may already have given the customer at
            # posting time - reassigning a car must not invalidate them.
            apply_order_otps_to_assignment(db, updated_assignment)
            # Powers the driver-trip web link (no Driver App login needed) -
            # see /website/trip-link/{token}* in api/routes/website_bookings.py.
            updated_assignment.trip_link_token = secrets.token_urlsafe(24)
            db.add(updated_assignment)
            db.commit()
            db.refresh(updated_assignment)

        # Website-originated booking: driver/car fully assigned now - push
        # the live status + email the customer the actual contact details
        # (+ trip OTPs).
        if updated_assignment.car_id and updated_assignment.driver_id:
            try:
                driver_row = db.query(CarDriver).filter(CarDriver.id == updated_assignment.driver_id).first()
                car_row = db.query(CarDetails).filter(CarDetails.id == updated_assignment.car_id).first()
                driver_name = driver_row.full_name if driver_row else None
                driver_phone = driver_row.primary_number if driver_row else None
                vehicle_number = car_row.car_number if car_row else None

                from app.utils.website_status_webhook import notify_website_of_status, notify_customer_driver_assigned_email
                notify_website_of_status(
                    db, updated_assignment.order_id, "ASSIGNED",
                    driver_name=driver_name, driver_phone=driver_phone, vehicle_number=vehicle_number,
                )
                notify_customer_driver_assigned_email(
                    db, updated_assignment.order_id, driver_name, driver_phone, vehicle_number,
                    start_otp=updated_assignment.start_trip_otp, end_otp=updated_assignment.end_trip_otp,
                )
            except Exception as e:
                print(f"Website assigned-notification failed for order {updated_assignment.order_id} (assignment still saved): {e}")

        return updated_assignment
    
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to assign car and driver: {str(e)}")


class CarSubstitutionRequestCreate(BaseModel):
    order_id: int
    car_id: str
    driver_id: str


@router.post("/car-substitution-request", status_code=status.HTTP_201_CREATED)
async def create_car_substitution_request_endpoint(
    payload: CarSubstitutionRequestCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """The "Request for My Car" escape hatch - a fleet owner without the
    exact car type a booking needs offers a different car of theirs
    instead. Goes to Admin for review (see admin.py's substitution-request
    endpoints), never auto-approved. See crud/vehicle_matching.py."""
    from app.crud.vehicle_matching import create_substitution_request
    vehicle_owner_id = str(current_user.vehicle_owner_id)
    try:
        req = create_substitution_request(db, payload.order_id, vehicle_owner_id, payload.car_id, payload.driver_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        from app.crud.notification import send_push_notification_to_admin
        await send_push_notification_to_admin(
            db,
            title="🚗 Car Substitution Request",
            message=f"A fleet wants to fulfil Booking #{payload.order_id} with a {req.offered_car_type.value.replace('_', ' ').title()} instead of the requested {req.required_car_type.value.replace('_', ' ').title()}.",
        )
    except Exception as e:
        print(f"Substitution-request admin notification failed (request still created): {e}")

    return {"id": req.id, "status": req.status.value if hasattr(req.status, "value") else str(req.status)}


@router.get("/driver/assigned-orders/{order_id}", response_model=List[DriverOrderReport])
async def get_driver_assigned_orders_report_endpoint(
    order_id: int,
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver)
):
    """Get all ASSIGNED orders for the authenticated driver"""
    driver_id = str(current_driver.id)
    assigned_orders = get_driver_assigned_orders_report(db, driver_id, order_id)
    # print("Testing Car")
    return assigned_orders

@router.get("/driver/assigned-orders", response_model=List[DriverOrderListResponse])
async def get_driver_assigned_orders_endpoint(
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver)
):
    """Get all ASSIGNED orders for the authenticated driver"""
    driver_id = str(current_driver.id)
    assigned_orders = get_driver_assigned_orders(db, driver_id)
    print("Testing Car")
    return assigned_orders

@router.get("/driver/assigned/completed-trips", response_model=List[DriverOrderListResponse])
async def get_driver_assigned_completed_trips_endpoint(
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver)
):
    """Get all ASSIGNED orders for the authenticated driver"""
    driver_id = str(current_driver.id)
    assigned_orders = get_driver_assigned_orders_completed_trip(db, driver_id)
    print("DRIVER Car TRIPS")
    return assigned_orders


from app.core.limiter import limiter

@router.post("/driver/start-trip/{order_id}", response_model=StartTripResponse)
@limiter.limit("5/10minute")
async def start_trip(
    request: Request,
    order_id: int,
    start_km: int = Form(...),
    otp: Optional[str] = Form(default=""),
    speedometer_img: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver)
):
    """Start trip by uploading start KM, the customer-shared start OTP, and
    a speedometer image. The OTP (emailed to the customer when they were
    assigned this driver - see notify_customer_driver_assigned_email)
    proves the driver actually reached the real customer."""
    try:
        assignment = db.query(OrderAssignment).filter(
            OrderAssignment.order_id == order_id,
            OrderAssignment.driver_id == current_driver.id,
            OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED,
        ).order_by(desc(OrderAssignment.assigned_at)).first()
        if not assignment:
            raise HTTPException(status_code=404, detail="No active assignment found for this order")
        if assignment.start_trip_otp and otp and otp.strip() and otp.strip() != assignment.start_trip_otp:
            raise HTTPException(status_code=400, detail="Incorrect trip start code - ask the customer for the code from their confirmation email")

        # Validate image file
        if not speedometer_img.content_type or not speedometer_img.content_type.startswith('image/'):
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Please upload an image file."
            )

        # Upload image to GCS
        from app.utils.gcs import upload_image_to_gcs
        folder_path = f"trip_records/{order_id}/start"
        speedometer_img_url = upload_image_to_gcs(speedometer_img, folder_path)
        
        # Create start trip record
        from app.crud.end_records import create_start_trip_record
        trip_record = await create_start_trip_record(
            db=db,
            order_id=order_id,
            driver_id=str(current_driver.id),
            start_km=start_km,
            speedometer_img_url=speedometer_img_url
        )
        
        return {
            "message": "Trip started successfully",
            "end_record_id": trip_record.id,
            "start_km": trip_record.start_km,
            "speedometer_img_url": speedometer_img_url
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start trip: {str(e)}")


class DriverLocationPing(BaseModel):
    lat: float
    lng: float


@router.post("/driver/orders/{order_id}/location")
async def update_driver_location(
    order_id: int,
    body: DriverLocationPing,
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Driver App's own native-GPS counterpart to the website's
    /website/trip-link/{token}/location endpoint - same OrderAssignment
    columns (last_lat/last_lng/last_location_at/tracking_left_at), so
    the Customer App's live-tracking screen and the website's
    track-booking.php both see a driver's location the same way
    regardless of whether they used the Driver App or the website's
    driver-trip.php link. JWT-authenticated instead of token-authenticated
    since the Driver App already has the driver logged in."""
    assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.driver_id == current_driver.id,
        OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED,
    ).order_by(desc(OrderAssignment.assigned_at)).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="No active assignment found for this order")

    now = datetime.utcnow()
    # GPS-spoof fraud detection check (> 140 km/h speed jump between pings)
    if assignment.last_lat and assignment.last_lng and assignment.last_location_at:
        try:
            prev_lat = float(assignment.last_lat)
            prev_lng = float(assignment.last_lng)
            curr_lat = float(body.lat)
            curr_lng = float(body.lng)
            time_diff_sec = (now - assignment.last_location_at).total_seconds()
            if time_diff_sec > 2:
                import math
                dlat = math.radians(curr_lat - prev_lat)
                dlng = math.radians(curr_lng - prev_lng)
                a = math.sin(dlat / 2)**2 + math.cos(math.radians(prev_lat)) * math.cos(math.radians(curr_lat)) * math.sin(dlng / 2)**2
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                dist_km = 6371.0 * c
                speed_kmh = (dist_km / time_diff_sec) * 3600.0
                if speed_kmh > 140.0:
                    assignment.is_location_flagged = True
                    assignment.location_flag_reason = f"Suspicious speed jump: {speed_kmh:.1f} km/h between location pings"
        except (ValueError, TypeError):
            pass

    assignment.last_lat = str(body.lat)
    assignment.last_lng = str(body.lng)
    assignment.last_location_at = now
    assignment.tracking_left_at = None
    db.commit()
    return {"status": "ok"}


@router.post("/driver/orders/{order_id}/location/left")
async def driver_location_sharing_paused(
    order_id: int,
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Mirrors /website/trip-link/{token}/left - called when the Driver
    App stops sharing location (trip ended, app backgrounded, permission
    revoked) so the Customer App can honestly show "driver paused
    sharing" instead of freezing on a stale pin."""
    assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.driver_id == current_driver.id,
        OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED,
    ).order_by(desc(OrderAssignment.assigned_at)).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="No active assignment found for this order")

    assignment.tracking_left_at = datetime.utcnow()
    db.commit()
    return {"status": "ok"}


@router.post("/driver/end-trip/{order_id}", response_model=EndTripResponse)
@limiter.limit("5/10minute")
async def end_trip(
    request: Request,
    order_id: int,
    end_km: int = Form(...),
    toll_charge_update: bool = Form(False),
    updated_toll_charges: int | None = Form(None),
    waiting_time: int | None = Form(None),
    cash_collection: int | None = Form(None),
    # Audit record only, e.g. '[{"label":"State Tax","amount":150}]' - what
    # the driver actually collected for each of the order's charge_items
    # that were NOT bundled into the total (included=false). These stay
    # entirely with the driver, same as toll - never netted against
    # cash_collection/driver_profit. See models/end_records.py.
    extra_charges_collected: str | None = Form(None),
    otp: Optional[str] = Form(default=""),
    close_speedometer_img: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver)
):
    """End trip by uploading end KM, optional toll updates, cash collected,
    the customer-shared end OTP, and close speedometer image. The OTP
    proves the CUSTOMER (not just the driver) is confirming the trip is
    actually over."""
    try:
        parsed_extra_charges = None
        if extra_charges_collected:
            try:
                import json as _json
                parsed_extra_charges = _json.loads(extra_charges_collected)
            except Exception:
                raise HTTPException(status_code=422, detail="extra_charges_collected must be valid JSON")

        assignment = db.query(OrderAssignment).filter(
            OrderAssignment.order_id == order_id,
            OrderAssignment.driver_id == current_driver.id,
            OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED,
        ).order_by(desc(OrderAssignment.assigned_at)).first()
        if not assignment:
            raise HTTPException(status_code=404, detail="No active assignment found for this order")
        if assignment.end_trip_otp and otp and otp.strip() and otp.strip() != assignment.end_trip_otp:
            raise HTTPException(status_code=400, detail="Incorrect trip end code - ask the customer for the code from their confirmation email")

        # Validate close speedometer image file
        if not close_speedometer_img.content_type or not close_speedometer_img.content_type.startswith('image/'):
            raise HTTPException(
                status_code=400,
                detail="Invalid close speedometer file type. Please upload an image file."
            )
        
        # Upload close speedometer image to GCS
        from app.utils.gcs import upload_image_to_gcs
        folder_path = f"trip_records/{order_id}/end"
        close_speedometer_img_url = upload_image_to_gcs(close_speedometer_img, folder_path)
        
        # Update end trip record
        from app.crud.end_records import update_end_trip_record
        result = await update_end_trip_record(
            db=db,
            order_id=order_id,
            driver_id=str(current_driver.id),
            end_km=end_km,
            # toll_charge_update=toll_charge_update,
            updated_toll_charges=updated_toll_charges,
            close_speedometer_image_url=close_speedometer_img_url,
            waiting_time=waiting_time,
            cash_collection=cash_collection,
            extra_charges_collected=parsed_extra_charges,
        )

        return {
            "message": "Trip ended successfully",
            "end_record_id": result["trip_record"].id,
            "end_km": result["trip_record"].end_km,
            "close_speedometer_img_url": close_speedometer_img_url,
            "total_km": result["total_km"],
            # "calculated_fare": result["calculated_fare"],
            # "driver_amount": result["driver_amount"],
            # "vehicle_owner_amount": result["vehicle_owner_amount"]
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to end trip: {str(e)}")


@router.get("/driver/trip-history", response_model=List[dict])
async def get_driver_trip_history(
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver)
):
    """Get driver's trip history"""
    from app.crud.end_records import get_driver_trip_history
    driver_id = str(current_driver.id)
    trip_history = get_driver_trip_history(db, driver_id)
    return trip_history


@router.get("/driver/posted-bookings")
async def get_driver_posted_bookings_endpoint(
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Driver App "My Trips": bookings this owner posted (Create Booking)."""
    from app.crud.order_assignments import get_posted_bookings_for_owner
    return get_posted_bookings_for_owner(db, str(current_driver.vehicle_owner_id))


class CancelReasonPayload(BaseModel):
    reason: Optional[str] = None


class CustomerNumberSwitchPayload(BaseModel):
    show: bool


@router.post("/driver/posted-bookings/{order_id}/customer-number")
async def set_posted_booking_customer_number_visibility(
    order_id: int,
    payload: CustomerNumberSwitchPayload,
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Manual "Show customer number to the driver" switch for a booking this owner posted
    (same switch a vendor has on their own bookings)."""
    from app.crud.orders import set_customer_visibility_by_poster
    try:
        order = set_customer_visibility_by_poster(db, order_id, str(current_driver.vehicle_owner_id), payload.show)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"order_id": order.id, "customer_number_visible": bool(order.data_visibility_vehicle_owner)}


@router.post("/driver/posted-bookings/{order_id}/cancel")
async def cancel_driver_posted_booking_endpoint(
    order_id: int,
    payload: Optional[CancelReasonPayload] = None,
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Cancel a booking this owner posted. See cancel_order_by_poster."""
    from app.crud.order_assignments import cancel_order_by_poster
    try:
        result = cancel_order_by_poster(db, order_id, str(current_driver.vehicle_owner_id), payload.reason if payload else None)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Same courtesy pushes the vendor-cancel route sends: the acceptor (if any)
    # is told, and the Telegram ops channel sees it. Best-effort only.
    try:
        await send_booking_cancelled_to_telegram(master_id=order_id)
    except Exception as e:
        print(f"posted-booking cancel telegram alert failed (cancel still succeeded): {e}")
    if result.get("had_accepted_driver"):
        try:
            from app.models.order_assignments import OrderAssignment as _OA
            from sqlalchemy import desc as _desc
            notified_assignment = db.query(_OA).filter(
                _OA.order_id == order_id,
                _OA.assignment_status == "CANCELLED",
            ).order_by(_desc(_OA.cancelled_at)).first()
            if notified_assignment:
                from app.crud.notification import notify_order_cancelled_by_vendor
                await notify_order_cancelled_by_vendor(db, order_id, notified_assignment)
        except Exception as e:
            print(f"posted-booking cancel push failed (cancel still succeeded): {e}")
    return result


@router.patch("/vendor/cancel-order/{order_id}")
async def cancel_order_by_vendor_endpoint(
    order_id: int,
    payload: Optional[CancelReasonPayload] = None,
    db: Session = Depends(get_db),
    current_vendor=Depends(get_current_vendor)
):
    """Cancel an order by vendor (no money debited from fleet owner)"""
    try:
        vendor_id = str(current_vendor.id)
        result = cancel_order_by_vendor(db, order_id, vendor_id, payload.reason if payload else None)
        await send_booking_cancelled_to_telegram(master_id = order_id)
        try:
            from app.models.order_assignments import OrderAssignment as _OA
            from sqlalchemy import desc as _desc
            notified_assignment = db.query(_OA).filter(
                _OA.order_id == order_id,
                _OA.assignment_status == "CANCELLED",
            ).order_by(_desc(_OA.cancelled_at)).first()
            if notified_assignment:
                from app.crud.notification import notify_order_cancelled_by_vendor
                await notify_order_cancelled_by_vendor(db, order_id, notified_assignment)
        except Exception as e:
            print(f"cancel-by-vendor push notification failed (cancel still succeeded): {e}")
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel order: {str(e)}"
        )


class FleetOwnerRebidSchema(BaseModel):
    revised_offer_price: int
    note: Optional[str] = None


@router.post("/order-assignments/{assignment_id}/re-bid")
async def fleet_owner_rebid(
    assignment_id: int,
    payload: FleetOwnerRebidSchema,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Subscriber-gated Fleet Owner Re-Bid / Revised Offer.
    Enables a subscribed fleet owner to revise their offer price on an assigned booking before it's finalized.
    """
    vehicle_owner_id = str(current_user.vehicle_owner_id)

    # 1. Server-side subscriber check - this endpoint is fleet-owner-only
    # (keyed by current_user.vehicle_owner_id, same as accept_order above),
    # so the real Fleet Owner subscription field is
    # VehicleOwnerDetails.subscription_type ("MONTHLY"/"YEARLY") - the same
    # field the existing Fleet Owner billing/Settings screen already reads.
    # This is a different field/model than CarDriver.subscription_tier
    # (the individual-driver subscription added later) - don't conflate them.
    from app.models.vehicle_owner_details import VehicleOwnerDetails
    vo_details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).first()
    is_subscribed = bool(vo_details and vo_details.subscription_type in ("MONTHLY", "YEARLY"))

    if not is_subscribed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Re-bidding on assigned bookings is exclusive to subscribed fleet owners. Upgrade to Pro/Business to unlock offer revisions."
        )

    # 2. Verify OrderAssignment exists and belongs to current fleet owner
    assignment = db.query(OrderAssignment).filter(
        OrderAssignment.id == assignment_id,
        OrderAssignment.vehicle_owner_id == vehicle_owner_id
    ).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Order assignment not found or access denied.")

    if assignment.assignment_status in (AssignmentStatusEnum.COMPLETED, AssignmentStatusEnum.CANCELLED):
        raise HTTPException(status_code=400, detail="Cannot revise bid on a completed or cancelled assignment.")

    # 3. Apply revised offer
    assignment.revised_offer_price = payload.revised_offer_price
    assignment.rebid_status = "REVISED"

    # Also update Order vendor_price if order exists
    from app.models.orders import Order
    order = db.query(Order).filter(Order.id == assignment.order_id).first()
    if order:
        order.vendor_price = payload.revised_offer_price

    db.commit()
    db.refresh(assignment)

    return {
        "success": True,
        "message": f"Successfully revised offer to ₹{payload.revised_offer_price}.",
        "assignment_id": assignment.id,
        "revised_offer_price": payload.revised_offer_price,
        "rebid_status": assignment.rebid_status
    }


class DriverCancelOrderSchema(BaseModel):
    reason: str

@router.post("/driver/cancel-order/{order_id}")
async def driver_cancel_order_endpoint(
    order_id: int,
    payload: DriverCancelOrderSchema,
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Driver-initiated order cancellation for assigned / drop bid orders.
    Enforces a fixed ₹500 cancellation penalty debited from the fleet owner's wallet,
    refunds any held commission, updates order status to CANCELLED, and notifies customer."""
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.models.orders import Order
    from app.crud.wallet import debit_wallet_allow_negative, credit_wallet
    from app.crud.notification import send_push_notification_to_customer

    vehicle_owner_id = str(current_driver.vehicle_owner_id)

    assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.vehicle_owner_id == vehicle_owner_id
    ).order_by(OrderAssignment.created_at.desc()).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assigned booking not found for this driver.")

    if assignment.assignment_status in (AssignmentStatusEnum.CANCELLED, AssignmentStatusEnum.COMPLETED):
        raise HTTPException(status_code=400, detail="This booking is already completed or cancelled.")

    # Forfeit the entire held commission amount (minimum ₹500 floor).
    # Owner rule: If driver cancels, the entire commission amount (even ₹5,000)
    # is forfeited as cancellation penalty, never refunded.
    from app.crud.wallet import get_trip_hold
    from app.models.wallet_ledger import WalletLedger
    from app.models.admin import Admin
    from app.crud.admin_wallet import credit_admin_wallet

    hold = (assignment.held_amount or 0) if hasattr(assignment, 'held_amount') and assignment.held_amount else get_trip_hold(db, order_id, vehicle_owner_id)
    penalty_fee = max(hold, 500)
    shortfall = penalty_fee - hold

    if shortfall > 0:
        debit_wallet_allow_negative(
            db,
            vehicle_owner_id=vehicle_owner_id,
            amount=shortfall,
            reference_id=str(order_id),
            reference_type="TRIP_CANCEL_PENALTY",
            notes=f"Driver Cancellation Penalty top-up of ₹{shortfall} for Order #{order_id} (Reason: {payload.reason})",
        )

    # Convert the TRIP_HOLD ledger entry to FORFEITED rather than refunding it
    hold_entry = db.query(WalletLedger).filter(
        WalletLedger.vehicle_owner_id == vehicle_owner_id,
        WalletLedger.reference_id == str(order_id),
        WalletLedger.reference_type == "TRIP_HOLD",
    ).first()
    if hold_entry:
        hold_entry.notes = (
            f"Order #{order_id} cancelled by driver - held commission amount of ₹{hold} "
            f"forfeited as cancellation penalty (Reason: {payload.reason})"
        )
        db.add(hold_entry)

    # Credit full penalty to admin wallet
    admin = db.query(Admin).first()
    if admin:
        credit_admin_wallet(
            db=db,
            admin_id=str(admin.id),
            amount=penalty_fee,
            order_id=order_id,
            notes=f"Driver cancellation penalty for Order #{order_id} (Reason: {payload.reason})",
        )

    # 3. Update assignment status
    assignment.assignment_status = AssignmentStatusEnum.CANCELLED
    assignment.cancelled_at = datetime.utcnow()
    # Recorded on the assignment (not Order.cancelled_by - "CANCELLED_BY_DRIVER" is not a value of
    # that DB enum, so setting it crashed this endpoint on commit) so My Rides > Unallocated shows it.
    assignment.cancel_reason = "DITCHED"
    assignment.cancel_note = (payload.reason or "").strip() or None
    try:
        from app.crud.order_assignments import release_vendor_payout_hold_for_order
        release_vendor_payout_hold_for_order(db, db.query(Order).filter(Order.id == order_id).first(), f"Driver payout hold released - driver cancelled order {order_id}")
    except Exception as e:
        print(f"payout hold release (driver cancel) failed: {e}")

    # 4. Update order status
    order = db.query(Order).filter(Order.id == order_id).first()
    if order:
        order.trip_status = "CANCELLED"
        if hasattr(order, "notes"):
            order.notes = (order.notes or "") + f" | Driver Cancelled: {payload.reason} (₹500 penalty debited)"

        # Notify customer
        if order.customer_id:
            try:
                import asyncio
                asyncio.create_task(send_push_notification_to_customer(
                    db, customer_id=str(order.customer_id),
                    title="⚠️ Trip Cancelled by Driver",
                    message=f"Your trip #{order_id} was cancelled by driver. Our team is re-assigning another driver.",
                    event_key="driver_trip_cancelled"
                ))
            except Exception as e:
                print(f"Customer cancel notification error: {e}")

    db.commit()

    return {
        "success": True,
        "message": f"Booking #{order_id} cancelled. ₹{PENALTY_FEE} penalty debited from wallet.",
        "order_id": order_id,
        "penalty_amount": PENALTY_FEE,
        "reason": payload.reason,
    }


class UpdateAdvanceReceivedPayload(BaseModel):
    advance_received: int


@router.put("/orders/{order_id}/advance-received")
async def update_order_advance_received(
    order_id: str,
    payload: UpdateAdvanceReceivedPayload,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Part 3: Make advance_received editable after booking creation (including
    after trip start). Whoever posted/owns the booking can call this -
    Vendor, Fleet Owner, Driver, or Admin - and each of those has its own
    token verifier with its own exception behavior, so FastAPI's normal
    Depends() (which 401s immediately on the first failed dependency, never
    trying the next) can't express "any of these 4 roles". Auth is resolved
    manually instead: decode the bearer token against each role in turn and
    stop at the first one that validates, then check that this specific
    booking actually belongs to that caller before allowing the edit.
    """
    from app.models.orders import Order
    from app.models.new_orders import NewOrder
    from app.core.security import get_current_admin
    from fastapi.security import HTTPAuthorizationCredentials

    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth_header.split(" ", 1)[1])

    caller_role = None
    caller = None
    for role, getter in (
        ("VENDOR", get_current_vendor),
        ("FLEET_OWNER", get_current_user),
        ("DRIVER", get_current_driver),
        ("ADMIN", get_current_admin),
    ):
        try:
            caller = getter(creds, db)
            caller_role = role
            break
        except HTTPException:
            continue

    if caller is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

    order = db.query(Order).filter(Order.id == order_id).first()
    new_order = db.query(NewOrder).filter(NewOrder.order_id == order_id).first()

    if not order and not new_order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Who may change the advance:
    #  - Drop Cars admin: any time, even after a driver has accepted.
    #  - The one who posted it (vendor / driver poster): only until a driver accepts it. After that the numbers the
    #    accepting driver agreed to are fixed and only admin can correct them.
    accepted = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED,
    ).first() is not None
    if caller_role == "ADMIN":
        allowed = True
    elif caller_role == "VENDOR":
        allowed = bool(order and str(order.vendor_id) == str(caller.id))
    elif caller_role in ("FLEET_OWNER", "DRIVER"):
        caller_owner_id = str(getattr(caller, "vehicle_owner_id", "") or "")
        allowed = bool(order and order.posted_by_vehicle_owner_id is not None
                       and str(order.posted_by_vehicle_owner_id) == caller_owner_id)
    else:
        allowed = False
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to update this booking.")
    if accepted and caller_role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A driver has already accepted this booking - only Drop Cars admin can change the advance now.",
        )
    if order and str(order.trip_status).upper() in ("COMPLETED", "CANCELLED"):
        raise HTTPException(status_code=400, detail="This booking is already closed - the advance can't be changed.")

    new_adv = int(payload.advance_received or 0)
    if new_adv < 0:
        raise HTTPException(status_code=400, detail="Advance can't be negative.")
    old_adv = int((order.advance_received if order else (new_order.advance_received if new_order else 0)) or 0)

    if order and new_adv != old_adv:
        # keep the money side consistent with the number
        try:
            if order.vendor_id:
                from app.crud.vendor_wallet import credit_vendor_wallet, debit_vendor_wallet, get_vendor_wallet_balance
                diff = new_adv - old_adv
                if diff > 0:
                    credit_vendor_wallet(db, vendor_id=str(order.vendor_id), amount=diff, order_id=order.id,
                                         notes=f"Advance on booking {order.id} increased by admin/you (held pending trip settlement)")
                else:
                    take = min(-diff, max(0, int(get_vendor_wallet_balance(db, str(order.vendor_id)) or 0)))
                    if take > 0:
                        debit_vendor_wallet(db, vendor_id=str(order.vendor_id), amount=take, order_id=order.id,
                                            notes=f"Advance on booking {order.id} reduced", reference_id=str(order.id), reference_type="ADVANCE_EDIT")
            elif order.posted_by_vehicle_owner_id:
                from app.crud.wallet import adjust_poster_advance_hold
                adjust_poster_advance_hold(db, order, new_adv)
        except ValueError as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Wallet can't cover this advance: {e}. Add money to the wallet first.")

    if order:
        order.advance_received = new_adv
    if new_order:
        new_order.advance_received = new_adv

    db.commit()
    return {
        "status": "success",
        "order_id": order_id,
        "advance_received": payload.advance_received
    }


from app.schemas.new_orders import OnewayQuoteRequest as _DriverBookingBase


class DriverBookingConfirmRequest(_DriverBookingBase):
    """Same fields the Vendor/Admin App confirm endpoints take (see
    OnewayQuoteRequest) - vendor_id is always ignored (ownership comes from
    the driver's own JWT). override_km is still accepted so the Quote-Review
    distance-override flow (shared with the Vendor App form) keeps working.
    This DOES go to the open market like a vendor/admin posting (see
    driver_create_booking_confirm's docstring) - target_driver_id/near_city
    aren't exposed here because the Driver App's Create Booking screen has
    no driver/city picker UI, so it always broadcasts to everyone (ALL)."""
    override_km: Optional[float] = None
    override_trip_time: Optional[str] = None
    # GST bridge: % GST included in the posted price (stored only for now; the GST part belongs to the poster)
    gst_percent: Optional[int] = None


@router.post("/driver/create-booking/confirm", status_code=status.HTTP_201_CREATED)
def driver_create_booking_confirm(
    payload: DriverBookingConfirmRequest,
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """
    Driver App "Create Booking" - reuses the exact same fare-calc/order-
    creation CRUD as the Admin App's vendor-less confirm routes (see
    admin_oneway_confirm and friends above), just driver-JWT authenticated
    and with no vendor.

    Broadcasts to the open pool of drivers (pick_near_city=["ALL"]), exactly
    like an Admin/Vendor platform booking - it does NOT self-assign to the
    posting driver. The driver who typed this trip in is sourcing the
    customer for the whole driver network, not necessarily driving it
    themselves; any driver can accept it via the normal accept-order flow.
    posted_by_vehicle_owner_id records who posted it so the posting bonus
    (vendor_profit share) still reaches them at trip close even when a
    DIFFERENT driver ends up accepting and driving it - see
    crud/end_records.py's update_end_trip_record.
    (Before 2026-09, this self-assigned immediately instead - changed after
    the user pointed out a driver posting a trip is sourcing it for the
    whole network, not just themselves, mirroring how vendor postings work.)
    vehicle_owner_id is taken from the authenticated driver's own record,
    never trusted from the request body.
    """
    from app.crud.new_orders import calculate_oneway_fare, calculate_multisegment_fare, create_oneway_order, apply_distance_override
    from app.models.new_orders import OrderTypeEnum, CarTypeEnum
    from app.schemas.new_orders import OrderType as _OrderType
    from app.crud.verification import is_owner_kyc_verified
    from app.models.vehicle_owner_details import VehicleOwnerDetails

    vehicle_owner_id = str(current_driver.vehicle_owner_id)

    # Same KYC gate accept_order uses (this bypasses that endpoint entirely,
    # so it must be re-checked here) - the fleet owner's own Aadhar+PAN.
    # (The driver-licence "self-drive" check that used to sit here was
    # removed along with self-assignment above - the poster isn't
    # guaranteed to be the one driving anymore, so there's nothing to
    # verify a licence for at posting time. Whoever accepts still goes
    # through the normal accept-order licence check.)
    owner_details = db.query(VehicleOwnerDetails).filter(
        VehicleOwnerDetails.vehicle_owner_id == vehicle_owner_id
    ).first()
    if not is_owner_kyc_verified(owner_details):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your fleet owner's KYC (Aadhar + PAN) must be verified before creating a booking. Check Settings > Profile.",
        )

    # Only Trusted Partners (the PREFERRED tier - the one shown as "Trusted
    # Partner" in the app) may post bookings: a posted booking goes out to the
    # whole driver network under this owner's name, and the poster holds the
    # customer's advance, so it's limited to partners the platform trusts.
    from app.crud.billing import get_partner_tier
    if get_partner_tier(owner_details) != "PREFERRED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "TRUSTED_PARTNER_REQUIRED",
                "message": "Only Trusted Partners can post bookings. Become a Trusted Partner from Settings > Subscription to start posting.",
            },
        )

    # The poster says they've already collected `advance` from the customer.
    # That money is theirs to hand over, so their wallet must be able to cover
    # it - it is HELD (not charged) until the trip completes or the booking is
    # cancelled, then returned in full.
    advance = int(payload.advance_received or 0)
    if advance > 0:
        from app.crud.wallet import get_owner_balance
        balance = get_owner_balance(db, vehicle_owner_id)
        if balance < advance:
            shortfall = advance - balance
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "INSUFFICIENT_BALANCE_FOR_ADVANCE",
                    "required": advance,
                    "balance": balance,
                    "shortfall": shortfall,
                    "message": (
                        f"You marked ₹{advance} as advance received, but your wallet has ₹{balance}. "
                        f"Add at least ₹{shortfall} to your wallet to post this booking. "
                        f"This amount is only HELD in your wallet - it is not charged, and it is returned "
                        f"when the trip completes or if the booking is cancelled."
                    ),
                },
            )

    try:
        if payload.trip_type == _OrderType.LOCAL:
            from app.utils.serviceable_cities import is_city_serviceable
            from app.crud.new_orders import _origin_and_destination_from_index_map
            origin_city, _ = _origin_and_destination_from_index_map(payload.pickup_drop_location)
            if not is_city_serviceable(db, origin_city):
                raise HTTPException(status_code=422, detail=f"Local Bookings aren't enabled for {origin_city} yet")

        if payload.trip_type in (_OrderType.ROUND_TRIP, _OrderType.MULTY_CITY):
            fare = calculate_multisegment_fare(
                payload.pickup_drop_location, payload.cost_per_km, payload.driver_allowance, payload.extra_driver_allowance,
                payload.permit_charges, payload.extra_permit_charges, payload.hill_charges, payload.toll_charges,
                payload.extra_cost_per_km, payload.night_charges, payload.trip_type,
                start_date_time=payload.start_date_time, end_date_time=payload.end_date_time,
            )
        elif payload.trip_type in (_OrderType.ONEWAY, _OrderType.LOCAL):
            fare = calculate_oneway_fare(
                payload.pickup_drop_location, payload.cost_per_km, payload.driver_allowance, payload.extra_driver_allowance,
                payload.permit_charges, payload.extra_permit_charges, payload.hill_charges, payload.toll_charges,
                payload.extra_cost_per_km, payload.night_charges, payload.trip_type,
            )
        else:
            raise HTTPException(status_code=400, detail="Hourly Rental isn't supported from Driver App Create Booking yet - use Oneway, Round Trip or Multi City.")

        distance_edited = False
        if payload.override_km is not None and round(payload.override_km) != round(fare["total_km"]):
            fare = apply_distance_override(fare, payload.override_km, payload.override_trip_time, payload.cost_per_km, payload.extra_cost_per_km)
            distance_edited = True

        new_order, master_order_id = create_oneway_order(
            db, vendor_id=None, trip_type=OrderTypeEnum(payload.trip_type.value), car_type=CarTypeEnum(payload.car_type.value),
            location_links=payload.location_links, pickup_drop_location=payload.pickup_drop_location, start_date_time=payload.start_date_time,
            end_date_time=payload.end_date_time, customer_name=payload.customer_name, customer_number=payload.customer_number,
            cost_per_km=payload.cost_per_km, extra_cost_per_km=payload.extra_cost_per_km, driver_allowance=payload.driver_allowance,
            extra_driver_allowance=payload.extra_driver_allowance, permit_charges=payload.permit_charges, extra_permit_charges=payload.extra_permit_charges,
            hill_charges=payload.hill_charges, toll_charges=payload.toll_charges, pickup_notes=payload.pickup_notes or "",
            trip_distance=fare["total_km"], trip_time=fare["trip_time"], platform_fees_percent=10,
            # Broadcast to the open pool, exactly like an Admin/Vendor
            # platform booking - see docstring above for why this no longer
            # self-assigns.
            pick_near_city=["ALL"], target_driver_id=None,
            posted_by_vehicle_owner_id=vehicle_owner_id,
            max_time_to_assign_order=payload.max_time_to_assign_order, toll_charge_update=payload.toll_charge_update,
            night_charges=payload.night_charges, acceptance_deadline=None,
            estimated_cal_price=fare["driver_amount"], vendor_cal_price=fare["customer_amount"], distance_edited=distance_edited,
            calculated_trip_distance=fare.get("calculated_km"), car_make_year_requirement=payload.car_make_year_requirement,
            carrier_required=bool(payload.carrier_required),
            # Real open-market posting now - Trusted Partners get first
            # crack at it, same default as Admin/Vendor postings.
            priority_for_paid=True, priority_cutoff_at=None,
            fare_type=payload.fare_type or "ITEMIZED",
            charge_items=[item.model_dump() for item in payload.charge_items] if payload.charge_items else None,
            advance_received=payload.advance_received,
            total_booking_amount=payload.total_booking_amount, extra_amount=payload.extra_amount, waiting_hours_included=payload.waiting_hours_included,
            # "10% CC" toggle (2026-09-04) - see crud/end_records.py's
            # update_end_trip_record for where this actually skips taking
            # admin_profit at trip close (platform_fees_percent above is
            # NOT the real commission lever for ITEMIZED/ALL_INCLUSIVE
            # bookings - only the separate HOURLY_RENTAL branch reads it).
            commission_waived=not payload.apply_commission,
        )

        if advance > 0:
            # Hold the advance now that the booking has a real id. The
            # balance was checked above, so failing here means the wallet
            # moved in the last few milliseconds - undo the booking instead
            # of leaving a live, unbacked one on the network.
            from app.crud.wallet import debit_wallet
            from app.models.orders import Order as _Order
            try:
                debit_wallet(
                    db, vehicle_owner_id, advance, str(master_order_id), "POSTER_ADVANCE_HOLD",
                    notes=f"Held (not charged): advance received on your posted Booking #{master_order_id} - returned when the trip completes or the booking is cancelled",
                )
                db.commit()
            except ValueError:
                db.rollback()
                stuck = db.query(_Order).filter(_Order.id == master_order_id).first()
                if stuck is not None:
                    stuck.trip_status = "CANCELLED"
                    db.commit()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": "INSUFFICIENT_BALANCE_FOR_ADVANCE",
                        "required": advance,
                        "message": f"Your wallet no longer has ₹{advance} to hold for the advance. Add money and post again. (Held, not charged - returned when the trip completes or the booking is cancelled.)",
                    },
                )

        if payload.gst_percent:
            from app.models.orders import Order as _GstOrder
            _o = db.query(_GstOrder).filter(_GstOrder.id == master_order_id).first()
            if _o:
                _o.gst_percent = int(payload.gst_percent)
                db.commit()

        return {
            "order_id": master_order_id,
            "trip_status": new_order.trip_status,
            "trip_type": new_order.trip_type,
            "fare": fare,
            "advance_held": advance,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to confirm booking: {str(e)}")


@router.post("/driver/posted-bookings/{order_id}/notify")
async def notify_driver_posted_booking_endpoint(
    order_id: int,
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Manual "Notify drivers" alarm for a booking this owner posted from the
    Driver App - same re-alert the vendor and admin Notify buttons send."""
    from app.crud.orders import notify_order_manually
    try:
        return await notify_order_manually(db, order_id, actor="poster", poster_owner_id=str(current_driver.vehicle_owner_id))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
