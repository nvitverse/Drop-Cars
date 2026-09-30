# crud/ratings.py
"""
Rating submission is intentionally restricted to trips a customer booked
themselves through the Customer App's self-service flow (an approved
CustomerBookingRequest with linked_order_id set), because that's the only
place we can prove who the passenger actually was. Vendor-created orders
have no customer account attached and can't be rated this way.
"""
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from typing import Optional, List, Tuple

from app.models.rating import Rating
from app.models.customer_booking_request import CustomerBookingRequest
from app.models.orders import Order, Trip_status
from app.models.order_assignments import OrderAssignment
from app.models.car_driver import CarDriver
from app.models.car_details import CarDetails


def get_rateable_bookings(db: Session, customer_id) -> List[Tuple[CustomerBookingRequest, Order]]:
    """Completed, self-booked trips for this customer that haven't been rated yet."""
    requests = (
        db.query(CustomerBookingRequest)
        .filter(
            CustomerBookingRequest.customer_id == customer_id,
            CustomerBookingRequest.linked_order_id.isnot(None),
        )
        .order_by(CustomerBookingRequest.created_at.desc())
        .all()
    )
    result = []
    for r in requests:
        order = db.query(Order).filter(Order.id == r.linked_order_id).first()
        if not order or order.trip_status != Trip_status.COMPLETED:
            continue
        already_rated = db.query(Rating).filter(Rating.order_id == order.id).first()
        if already_rated:
            continue
        result.append((r, order))
    return result


def _validate_star(value: int, label: str) -> None:
    if not isinstance(value, int) or value < 1 or value > 5:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} must be an integer from 1 to 5")


def submit_rating(
    db: Session,
    customer_id,
    order_id: int,
    driver_rating: int,
    car_rating: int,
    service_rating: int,
    comment: Optional[str] = None,
) -> Rating:
    _validate_star(driver_rating, "driver_rating")
    _validate_star(car_rating, "car_rating")
    _validate_star(service_rating, "service_rating")

    booking = db.query(CustomerBookingRequest).filter(
        CustomerBookingRequest.linked_order_id == order_id,
        CustomerBookingRequest.customer_id == customer_id,
    ).first()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found, or it wasn't booked by you through the app",
        )

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order or order.trip_status != Trip_status.COMPLETED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only completed trips can be rated")

    existing = db.query(Rating).filter(Rating.order_id == order_id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This trip has already been rated")

    assignment = db.query(OrderAssignment).filter(OrderAssignment.order_id == order_id).first()
    driver_id = assignment.driver_id if assignment else None
    car_id = assignment.car_id if assignment else None

    rating = Rating(
        order_id=order_id,
        customer_id=customer_id,
        driver_id=driver_id,
        car_id=car_id,
        driver_rating=driver_rating,
        car_rating=car_rating,
        service_rating=service_rating,
        comment=comment,
    )
    db.add(rating)

    if driver_id:
        driver = db.query(CarDriver).filter(CarDriver.id == driver_id).with_for_update().first()
        if driver:
            new_count = (driver.rating_count or 0) + 1
            new_avg = (((driver.rating_avg or 0) * (driver.rating_count or 0)) + driver_rating) / new_count
            driver.rating_avg = round(new_avg, 2)
            driver.rating_count = new_count
            db.add(driver)

    if car_id:
        car = db.query(CarDetails).filter(CarDetails.id == car_id).with_for_update().first()
        if car:
            new_count = (car.rating_count or 0) + 1
            new_avg = (((car.rating_avg or 0) * (car.rating_count or 0)) + car_rating) / new_count
            car.rating_avg = round(new_avg, 2)
            car.rating_count = new_count
            db.add(car)

    db.commit()
    db.refresh(rating)
    return rating
