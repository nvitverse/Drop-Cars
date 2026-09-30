# api/routes/customer_bookings.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime
from typing import List

from app.database.session import get_db
from app.core.security import get_current_customer
from app.models.customer_booking_request import CustomerBookingRequest
from app.models.customer_details import CustomerDetails
from app.models.new_orders import OrderTypeEnum, CarTypeEnum
from app.models.orders import Order, Trip_status
from app.models.order_assignments import OrderAssignment
from app.models.car_driver import CarDriver
from app.models.car_details import CarDetails
from app.crud.new_orders import calculate_oneway_fare, calculate_multisegment_fare
from app.utils.rate_card import get_rate_card_for_car_type
from app.utils.razorpay_client import RazorpayClient
from app.crud.notification import send_push_notification_to_customer

from app.schemas.customer_booking import (
    CustomerQuoteRequest, CustomerQuoteResponse, FareBreakdownOut,
    CustomerBookingCreate, CustomerBookingOut,
    CustomerBookingPayResponse, CustomerBookingVerifyRequest,
    DriverShortOut, CarShortOut
)
from app.schemas.rating import RateableTripOut, RatingSubmitRequest, RatingOut
from app.crud.ratings import get_rateable_bookings, submit_rating

from app.core.security import get_current_admin, get_current_user_flexible, get_current_driver
router = APIRouter()


def _get_trip_type_enum(trip_type_str: str) -> OrderTypeEnum:
    if trip_type_str == "Oneway":
        return OrderTypeEnum.ONEWAY
    elif trip_type_str == "Round Trip":
        return OrderTypeEnum.ROUND_TRIP
    elif trip_type_str == "Hourly Rental":
        return OrderTypeEnum.HOURLY_RENTAL
    elif trip_type_str == "Multy City":
        return OrderTypeEnum.MULTY_CITY
    else:
        raise HTTPException(status_code=400, detail=f"Invalid trip type: {trip_type_str}")


def _calculate_fare_internal(db: Session, pickup_drop_location: dict, trip_type_str: str, car_type_str: str) -> dict:
    trip_type = _get_trip_type_enum(trip_type_str)
    # Get platform default rates
    rates = get_rate_card_for_car_type(db, car_type_str)
    
    if trip_type in (OrderTypeEnum.ONEWAY, OrderTypeEnum.MULTY_CITY):
        # Oneway calculation
        fare = calculate_oneway_fare(
            pickup_drop_location=pickup_drop_location,
            cost_per_km=rates["cost_per_km"],
            driver_allowance=rates["driver_allowance"],
            extra_driver_allowance=rates["extra_driver_allowance"],
            permit_charges=rates["permit_charges"],
            extra_permit_charges=rates["extra_permit_charges"],
            hill_charges=rates["hill_charges"],
            toll_charges=rates["toll_charges"],
            extra_cost_per_km=rates["extra_cost_per_km"],
            night_charges=rates["night_charges"],
            trip_type=trip_type
        )
    else:
        # Round trip calculation
        fare = calculate_multisegment_fare(
            pickup_drop_location=pickup_drop_location,
            cost_per_km=rates["cost_per_km"],
            driver_allowance=rates["driver_allowance"],
            extra_driver_allowance=rates["extra_driver_allowance"],
            permit_charges=rates["permit_charges"],
            extra_permit_charges=rates["extra_permit_charges"],
            hill_charges=rates["hill_charges"],
            toll_charges=rates["toll_charges"],
            extra_cost_per_km=rates["extra_cost_per_km"],
            night_charges=rates["night_charges"],
            trip_type=trip_type
        )
    return fare, rates


@router.post("/customer/bookings/quote", response_model=CustomerQuoteResponse, dependencies=[Depends(get_current_user_flexible)])
def customer_quote(payload: CustomerQuoteRequest, db: Session = Depends(get_db)):
    try:
        fare, _ = _calculate_fare_internal(
            db, payload.pickup_drop_location, payload.trip_type, payload.car_type
        )
        return CustomerQuoteResponse(
            fare=FareBreakdownOut(**fare),
            car_type=payload.car_type,
            trip_type=payload.trip_type
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to calculate fare quote: {str(e)}"
        )


@router.post("/customer/bookings", response_model=CustomerBookingOut, status_code=status.HTTP_201_CREATED)
def create_booking_request(
    payload: CustomerBookingCreate,
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer)
):
    try:
        # Pre-fill customer details
        details = db.query(CustomerDetails).filter(CustomerDetails.customer_id == current_customer.id).first()
        if not details:
            raise HTTPException(status_code=404, detail="Customer details not found")

        # Run quote calculation
        fare, rates = _calculate_fare_internal(
            db, payload.pickup_drop_location, payload.trip_type, payload.car_type
        )

        driver_referral_code = (payload.driver_referral_code or "").strip().upper() or None
        if driver_referral_code:
            from app.models.vehicle_owner_details import VehicleOwnerDetails
            referrer = db.query(VehicleOwnerDetails).filter(
                VehicleOwnerDetails.referral_code == driver_referral_code
            ).first()
            if not referrer:
                raise HTTPException(status_code=404, detail="Referral code not found")

        booking = CustomerBookingRequest(
            customer_id=current_customer.id,
            pickup_drop_location=payload.pickup_drop_location,
            trip_type=payload.trip_type,
            car_type=payload.car_type,
            start_date_time=payload.start_date_time,
            customer_name=details.full_name,
            customer_number=details.primary_number,
            driver_referral_code=driver_referral_code,

            # Quoted values
            quoted_cost_per_km=rates["cost_per_km"],
            quoted_driver_allowance=rates["driver_allowance"],
            quoted_extra_driver_allowance=rates["extra_driver_allowance"],
            quoted_permit_charges=rates["permit_charges"],
            quoted_extra_permit_charges=rates["extra_permit_charges"],
            quoted_hill_charges=rates["hill_charges"],
            quoted_toll_charges=rates["toll_charges"],
            quoted_extra_cost_per_km=rates["extra_cost_per_km"],
            quoted_night_charges=rates["night_charges"],
            quoted_total_amount=fare["total_amount"],
            quoted_driver_amount=fare["driver_amount"],
            quoted_trip_distance=fare["total_km"],
            quoted_trip_time=fare["trip_time"],
            
            status="PENDING",
            is_paid=False
        )

        db.add(booking)
        db.commit()
        db.refresh(booking)
        return booking

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to submit booking request: {str(e)}"
        )


def _enrich_booking_out(db: Session, request: CustomerBookingRequest) -> CustomerBookingOut:
    # Resolve driver and car details if assigned
    driver_out = None
    car_out = None
    trip_status_out = None
    assignment_status_out = None

    if request.linked_order_id:
        order = db.query(Order).filter(Order.id == request.linked_order_id).first()
        if order:
            trip_status_out = order.trip_status.value if hasattr(order.trip_status, "value") else order.trip_status

        assignment = db.query(OrderAssignment).filter(
            OrderAssignment.order_id == request.linked_order_id,
            OrderAssignment.assignment_status.in_(["ASSIGNED", "DRIVING", "COMPLETED"])
        ).first()

        if assignment:
            assignment_status_out = assignment.assignment_status.value if hasattr(assignment.assignment_status, "value") else assignment.assignment_status
            if assignment.driver_id:
                driver = db.query(CarDriver).filter(CarDriver.id == str(assignment.driver_id)).first()
                if driver:
                    driver_out = DriverShortOut(
                        full_name=driver.full_name,
                        primary_number=driver.primary_number,
                        licence_number=driver.licence_number
                    )
            if assignment.car_id:
                car = db.query(CarDetails).filter(CarDetails.id == str(assignment.car_id)).first()
                if car:
                    car_out = CarShortOut(
                        car_name=car.car_name,
                        car_type=car.car_type.value if hasattr(car.car_type, "value") else car.car_type,
                        car_number=car.car_number
                    )

    # Convert request row to CustomerBookingOut schema
    return CustomerBookingOut(
        id=request.id,
        customer_id=request.customer_id,
        pickup_drop_location=request.pickup_drop_location,
        trip_type=request.trip_type,
        car_type=request.car_type,
        start_date_time=request.start_date_time,
        customer_name=request.customer_name,
        customer_number=request.customer_number,
        quoted_cost_per_km=request.quoted_cost_per_km,
        quoted_driver_allowance=request.quoted_driver_allowance,
        quoted_extra_driver_allowance=request.quoted_extra_driver_allowance,
        quoted_permit_charges=request.quoted_permit_charges,
        quoted_extra_permit_charges=request.quoted_extra_permit_charges,
        quoted_hill_charges=request.quoted_hill_charges,
        quoted_toll_charges=request.quoted_toll_charges,
        quoted_extra_cost_per_km=request.quoted_extra_cost_per_km,
        quoted_night_charges=request.quoted_night_charges,
        quoted_total_amount=request.quoted_total_amount,
        quoted_driver_amount=request.quoted_driver_amount,
        quoted_trip_distance=request.quoted_trip_distance,
        quoted_trip_time=request.quoted_trip_time,
        admin_cost_per_km=request.admin_cost_per_km,
        admin_driver_allowance=request.admin_driver_allowance,
        admin_extra_driver_allowance=request.admin_extra_driver_allowance,
        admin_permit_charges=request.admin_permit_charges,
        admin_extra_permit_charges=request.admin_extra_permit_charges,
        admin_hill_charges=request.admin_hill_charges,
        admin_toll_charges=request.admin_toll_charges,
        admin_extra_cost_per_km=request.admin_extra_cost_per_km,
        admin_night_charges=request.admin_night_charges,
        admin_total_amount=request.admin_total_amount,
        admin_driver_amount=request.admin_driver_amount,
        status=request.status,
        rejection_reason=request.rejection_reason,
        linked_order_id=request.linked_order_id,
        is_paid=request.is_paid,
        rp_order_id=request.rp_order_id,
        created_at=request.created_at,
        decided_at=request.decided_at,
        driver_details=driver_out,
        car_details=car_out,
        trip_status=trip_status_out,
        assignment_status=assignment_status_out
    )


@router.get("/customer/bookings", response_model=List[CustomerBookingOut])
async def get_my_bookings(
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer)
):
    requests = db.query(CustomerBookingRequest).filter(
        CustomerBookingRequest.customer_id == current_customer.id
    ).order_by(CustomerBookingRequest.created_at.desc()).all()
    
    return [_enrich_booking_out(db, r) for r in requests]


@router.get("/customer/bookings/{id}", response_model=CustomerBookingOut)
async def get_booking_details(
    id: UUID,
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer)
):
    request = db.query(CustomerBookingRequest).filter(
        CustomerBookingRequest.id == id,
        CustomerBookingRequest.customer_id == current_customer.id
    ).first()

    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")

    return _enrich_booking_out(db, request)


@router.get("/customer/bookings/{id}/live-location")
async def get_booking_live_location(
    id: UUID,
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer)
):
    """Reads the same last_lat/last_lng/last_location_at/tracking_left_at
    fields that already power the website's track-booking.php live map -
    see the driver trip-link endpoints in website_bookings.py and the
    Driver App's own POST /driver/orders/{order_id}/location (both write to
    the same OrderAssignment columns, whichever path the driver actually
    used). This is the customer-app-facing read side of that same data."""
    request = db.query(CustomerBookingRequest).filter(
        CustomerBookingRequest.id == id,
        CustomerBookingRequest.customer_id == current_customer.id
    ).first()
    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if not request.linked_order_id:
        return {"has_assignment": False, "last_lat": None, "last_lng": None, "last_location_at": None, "tracking_left": None}

    assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == request.linked_order_id,
        OrderAssignment.driver_id.isnot(None),
    ).order_by(OrderAssignment.created_at.desc()).first()
    if not assignment:
        return {"has_assignment": False, "last_lat": None, "last_lng": None, "last_location_at": None, "tracking_left": None}

    return {
        "has_assignment": True,
        "assignment_status": assignment.assignment_status,
        "last_lat": float(assignment.last_lat) if assignment.last_lat else None,
        "last_lng": float(assignment.last_lng) if assignment.last_lng else None,
        "last_location_at": assignment.last_location_at,
        "tracking_left": assignment.tracking_left_at is not None,
    }


@router.post("/customer/bookings/{id}/pay", response_model=CustomerBookingPayResponse)
def customer_pay_booking(
    id: UUID,
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer)
):
    request = db.query(CustomerBookingRequest).filter(
        CustomerBookingRequest.id == id,
        CustomerBookingRequest.customer_id == current_customer.id
    ).first()

    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")

    if request.is_paid:
        raise HTTPException(status_code=400, detail="This booking has already been paid")

    # The amount to pay is either the admin-approved amount or the quoted amount
    amount_rupees = request.admin_total_amount if request.admin_total_amount is not None else request.quoted_total_amount

    client = RazorpayClient()
    try:
        # Create Razorpay order (amount passed is in rupees; RazorpayClient multiplies it by 100 for paise)
        order = client.create_order(
            amount_paise=amount_rupees,
            currency="INR",
            notes={"booking_request_id": str(request.id)}
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Razorpay error: {str(e)}")

    request.rp_order_id = order.get("id")
    db.commit()

    return CustomerBookingPayResponse(
        rp_order_id=order.get("id"),
        amount=order.get("amount")
    )


@router.post("/customer/bookings/{id}/verify", response_model=CustomerBookingOut)
def customer_verify_payment(
    id: UUID,
    payload: CustomerBookingVerifyRequest,
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer)
):
    request = db.query(CustomerBookingRequest).filter(
        CustomerBookingRequest.id == id,
        CustomerBookingRequest.customer_id == current_customer.id
    ).first()

    if not request:
        raise HTTPException(status_code=404, detail="Booking request not found")

    if request.is_paid:
        return _enrich_booking_out(db, request)

    # This order_id must be the exact one /pay created for THIS booking -
    # verify_signature alone only proves the caller holds a genuine,
    # completed Razorpay payment for *some* order/payment id pair; without
    # this check, a valid signature from paying a different (even a much
    # cheaper) booking could be replayed here to mark an unrelated, more
    # expensive booking as paid for free.
    if not request.rp_order_id or payload.rp_order_id != request.rp_order_id:
        raise HTTPException(status_code=400, detail="This payment does not match this booking's payment order")

    if not RazorpayClient.verify_signature(payload.rp_order_id, payload.rp_payment_id, payload.rp_signature):
        raise HTTPException(status_code=400, detail="Invalid Razorpay signature")

    request.rp_payment_id = payload.rp_payment_id
    request.rp_signature = payload.rp_signature
    request.is_paid = True

    db.commit()
    db.refresh(request)
    return _enrich_booking_out(db, request)


# ============ TRIP RATINGS ============
# Scoped ONLY to trips the customer booked themselves through this app (see
# crud/ratings.py docstring) - vendor-created trips aren't rateable here.

@router.get("/customer/ratings/rateable", response_model=List[RateableTripOut])
async def list_rateable_trips(
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer),
):
    """Completed trips this customer booked themselves that haven't been rated yet."""
    pairs = get_rateable_bookings(db, current_customer.id)
    out = []
    for booking, order in pairs:
        driver_out = None
        car_out = None
        assignment = db.query(OrderAssignment).filter(OrderAssignment.order_id == order.id).first()
        if assignment:
            if assignment.driver_id:
                driver = db.query(CarDriver).filter(CarDriver.id == assignment.driver_id).first()
                if driver:
                    driver_out = DriverShortOut(
                        full_name=driver.full_name,
                        primary_number=driver.primary_number,
                        licence_number=driver.licence_number,
                    )
            if assignment.car_id:
                car = db.query(CarDetails).filter(CarDetails.id == assignment.car_id).first()
                if car:
                    car_out = CarShortOut(
                        car_name=car.car_name,
                        car_type=car.car_type.value if hasattr(car.car_type, "value") else car.car_type,
                        car_number=car.car_number,
                    )
        out.append(RateableTripOut(
            order_id=order.id,
            booking_id=booking.id,
            trip_type=booking.trip_type,
            car_type=booking.car_type,
            start_date_time=booking.start_date_time,
            driver=driver_out,
            car=car_out,
        ))
    return out


@router.post("/customer/ratings", response_model=RatingOut, status_code=status.HTTP_201_CREATED)
async def create_rating(
    payload: RatingSubmitRequest,
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer),
):
    """Submit a 1-5 star rating for driver, car, and overall service quality
    on one of the customer's own completed, self-booked trips. One rating
    per trip."""
    rating = submit_rating(
        db,
        customer_id=current_customer.id,
        order_id=payload.order_id,
        driver_rating=payload.driver_rating,
        car_rating=payload.car_rating,
        service_rating=payload.service_rating,
        comment=payload.comment,
    )
    # Automatic low-rating penalty + notification (crud/quality.py). The
    # driver/car scores are the fleet driver's responsibility; service_rating
    # can reflect the platform, so it isn't used for the penalty.
    try:
        from app.crud.quality import handle_new_rating, send_low_rating_push
        from app.models.order_assignments import OrderAssignment
        a = db.query(OrderAssignment).filter(OrderAssignment.order_id == rating.order_id).first()
        info = handle_new_rating(
            db, "APP_RATING", str(rating.id), rating.order_id,
            min(rating.driver_rating, rating.car_rating),
            vehicle_owner_id=a.vehicle_owner_id if a else None, driver_id=rating.driver_id,
        )
        await send_low_rating_push(db, info)
        db.refresh(rating)
    except Exception as e:
        print(f"[quality] post-rating hook failed: {e}")
    return rating
