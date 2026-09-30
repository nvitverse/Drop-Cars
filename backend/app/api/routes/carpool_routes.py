from fastapi import APIRouter, Depends, HTTPException, Query, Body, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid

from app.database.session import get_db
from app.models.carpool import CarPoolJourneyModel, CarPoolRequestModel
from app.core.security import get_current_driver, get_current_user_flexible

router = APIRouter(prefix="/carpool", tags=["CarPool & Shared Trips"])


class CreateJourneySchema(BaseModel):
    # host_name/host_phone/driver_name are no longer taken from the caller
    # for a driver-published journey (see create_carpool_journey) - derived
    # server-side from the authenticated driver instead, so no one can post
    # a listing under someone else's name/number. Kept optional here only
    # for the not-yet-built customer-hosted flow.
    host_name: Optional[str] = None
    host_phone: Optional[str] = None
    host_rating: Optional[float] = 5.0
    pickup_city: str
    drop_city: str
    intermediate_stops: Optional[List[str]] = None
    start_date: str
    start_time: str
    car_name: str
    car_category: str
    total_seats: int = 4
    available_seats: int = 3
    seat_fare: int = 350
    private_fare_equivalent: int = 1400
    is_auto_accept: bool = False
    source_booking_id: Optional[str] = None
    is_customer_hosted: Optional[bool] = True


class SeatJoinRequestSchema(BaseModel):
    passenger_id: str
    passenger_name: str
    passenger_phone: str
    seats_requested: int = 1


@router.get("/journeys", dependencies=[Depends(get_current_user_flexible)])
def list_carpool_journeys(
    pickup_city: Optional[str] = Query(None),
    drop_city: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Fetch active carpool / shared trip listings with optional city filtering."""
    query = db.query(CarPoolJourneyModel).filter(CarPoolJourneyModel.status != "CANCELLED")

    if pickup_city and pickup_city.strip():
        query = query.filter(CarPoolJourneyModel.pickup_city.ilike(f"%{pickup_city.strip()}%"))
    if drop_city and drop_city.strip():
        query = query.filter(CarPoolJourneyModel.drop_city.ilike(f"%{drop_city.strip()}%"))

    journeys = query.order_by(CarPoolJourneyModel.created_at.desc()).all()

    result = []
    for j in journeys:
        reqs = db.query(CarPoolRequestModel).filter(CarPoolRequestModel.journey_id == j.id).all()
        result.append({
            "id": j.id,
            "hostName": j.host_name,
            "hostPhone": j.host_phone,
            "hostRating": j.host_rating,
            "pickupCity": j.pickup_city,
            "dropCity": j.drop_city,
            "startDate": j.start_date,
            "startTime": j.start_time,
            "carName": j.car_name,
            "carCategory": j.car_category,
            "driverName": j.driver_name,
            "driverRating": j.driver_rating,
            "totalSeats": j.total_seats,
            "availableSeats": j.available_seats,
            "seatFare": j.seat_fare,
            "privateFareEquivalent": j.private_fare_equivalent,
            "status": j.status,
            "sourceBookingId": j.source_booking_id,
            "isCustomerHosted": j.is_customer_hosted,
            "intermediateStops": j.intermediate_stops or [],
            "isAutoAccept": j.is_auto_accept,
            "driverId": str(j.driver_id) if j.driver_id else None,
            "passengers": [
                {
                    "passengerId": r.passenger_id,
                    "passengerName": r.passenger_name,
                    "passengerPhone": r.passenger_phone,
                    "seatsRequested": r.seats_requested,
                    "status": "ACCEPTED" if r.status == "APPROVED" else r.status,
                    "requestedAt": r.requested_at.isoformat() if r.requested_at else None,
                    "requestId": r.id,
                }
                for r in reqs
            ]
        })

    return {"journeys": result}


@router.post("/journeys", status_code=status.HTTP_201_CREATED)
def create_carpool_journey(
    payload: CreateJourneySchema,
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Create a new carpool / shared trip listing - Drop Connect (driver-
    published). host_name/host_phone/driver_name always come from the
    authenticated driver's own record, never the request body - a driver
    can only ever publish a listing under their own identity."""
    journey = CarPoolJourneyModel(
        host_name=current_driver.full_name,
        host_phone=current_driver.primary_number,
        host_rating=payload.host_rating or 5.0,
        pickup_city=payload.pickup_city,
        drop_city=payload.drop_city,
        intermediate_stops=payload.intermediate_stops,
        start_date=payload.start_date,
        start_time=payload.start_time,
        car_name=payload.car_name,
        car_category=payload.car_category,
        driver_name=current_driver.full_name,
        driver_rating=payload.host_rating or 5.0,
        total_seats=payload.total_seats,
        available_seats=payload.available_seats,
        seat_fare=payload.seat_fare,
        private_fare_equivalent=payload.private_fare_equivalent,
        is_auto_accept=payload.is_auto_accept,
        source_booking_id=payload.source_booking_id,
        is_customer_hosted=False,
        driver_id=current_driver.id,
        vehicle_owner_id=current_driver.vehicle_owner_id,
        status="ACTIVE",
    )
    db.add(journey)
    db.commit()
    db.refresh(journey)

    return {
        "success": True,
        "message": "Shared trip listing created successfully.",
        "journey": {
            "id": journey.id,
            "hostName": journey.host_name,
            "hostPhone": journey.host_phone,
            "hostRating": journey.host_rating,
            "pickupCity": journey.pickup_city,
            "dropCity": journey.drop_city,
            "intermediateStops": journey.intermediate_stops or [],
            "startDate": journey.start_date,
            "startTime": journey.start_time,
            "carName": journey.car_name,
            "carCategory": journey.car_category,
            "totalSeats": journey.total_seats,
            "availableSeats": journey.available_seats,
            "seatFare": journey.seat_fare,
            "privateFareEquivalent": journey.private_fare_equivalent,
            "isAutoAccept": journey.is_auto_accept,
            "status": journey.status,
            "passengers": [],
        }
    }


@router.get("/my-journeys")
def list_my_carpool_journeys(
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Drop Connect "My Offers" - journeys THIS driver published, each with
    its full request list (pending ones need Approve/Decline; see
    approve_seat_request/decline_seat_request)."""
    journeys = db.query(CarPoolJourneyModel).filter(
        CarPoolJourneyModel.driver_id == current_driver.id,
        CarPoolJourneyModel.status != "CANCELLED",
    ).order_by(CarPoolJourneyModel.created_at.desc()).all()

    result = []
    for j in journeys:
        reqs = db.query(CarPoolRequestModel).filter(CarPoolRequestModel.journey_id == j.id).all()
        result.append({
            "id": j.id,
            "pickupCity": j.pickup_city,
            "dropCity": j.drop_city,
            "intermediateStops": j.intermediate_stops or [],
            "startDate": j.start_date,
            "startTime": j.start_time,
            "carName": j.car_name,
            "carCategory": j.car_category,
            "totalSeats": j.total_seats,
            "availableSeats": j.available_seats,
            "seatFare": j.seat_fare,
            "isAutoAccept": j.is_auto_accept,
            "status": j.status,
            "requests": [
                {
                    "id": r.id,
                    "passengerId": r.passenger_id,
                    "passengerName": r.passenger_name,
                    "passengerPhone": r.passenger_phone,
                    "seatsRequested": r.seats_requested,
                    "status": "ACCEPTED" if r.status == "APPROVED" else r.status,
                    "requestedAt": r.requested_at.isoformat() if r.requested_at else None,
                }
                for r in reqs
            ],
        })

    return {"journeys": result}


@router.post("/journeys/{journey_id}/request", status_code=status.HTTP_201_CREATED, dependencies=[Depends(get_current_user_flexible)])
def request_seat_join(
    journey_id: str,
    payload: SeatJoinRequestSchema,
    db: Session = Depends(get_db)
):
    """Rider submits a seat-join request for a carpool listing."""
    journey = db.query(CarPoolJourneyModel).filter(CarPoolJourneyModel.id == journey_id).first()
    if not journey:
        raise HTTPException(status_code=404, detail="Shared trip listing not found.")

    if journey.available_seats < payload.seats_requested:
        raise HTTPException(
            status_code=400,
            detail=f"Only {journey.available_seats} seat(s) remaining on this trip."
        )

    # Auto-accept: skip the pending/host-review state entirely, same seat
    # locking as approve_seat_request below (both must stay in sync).
    auto_accepted = bool(journey.is_auto_accept)
    req = CarPoolRequestModel(
        journey_id=journey.id,
        passenger_id=payload.passenger_id,
        passenger_name=payload.passenger_name,
        passenger_phone=payload.passenger_phone,
        seats_requested=payload.seats_requested,
        status="APPROVED" if auto_accepted else "REQUESTED",
    )
    db.add(req)
    if auto_accepted:
        journey.available_seats = max(0, journey.available_seats - payload.seats_requested)
        if journey.available_seats == 0:
            journey.status = "FULL"
    db.commit()
    db.refresh(req)

    return {
        "success": True,
        "message": (
            f"Seat auto-confirmed for {payload.seats_requested} seat(s)."
            if auto_accepted else
            f"Seat join request submitted for {payload.seats_requested} seat(s). Waiting for host approval."
        ),
        "request": {
            "id": req.id,
            "journeyId": req.journey_id,
            "passengerId": req.passenger_id,
            "passengerName": req.passenger_name,
            "passengerPhone": req.passenger_phone,
            "seatsRequested": req.seats_requested,
            "status": "ACCEPTED" if req.status == "APPROVED" else req.status,
            "requestedAt": req.requested_at.isoformat(),
        }
    }


@router.get("/journeys/{journey_id}/requests", dependencies=[Depends(get_current_user_flexible)])
def list_journey_requests(
    journey_id: str,
    db: Session = Depends(get_db)
):
    """Host lists all seat join requests for a listing."""
    reqs = db.query(CarPoolRequestModel).filter(CarPoolRequestModel.journey_id == journey_id).all()
    return {
        "journey_id": journey_id,
        "requests": [
            {
                "id": r.id,
                "passengerId": r.passenger_id,
                "passengerName": r.passenger_name,
                "passengerPhone": r.passenger_phone,
                "seatsRequested": r.seats_requested,
                "status": "ACCEPTED" if r.status == "APPROVED" else r.status,
                "requestedAt": r.requested_at.isoformat() if r.requested_at else None,
            }
            for r in reqs
        ]
    }


@router.post("/requests/{request_id}/approve")
def approve_seat_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """
    Host approves a seat join request.
    Server-side: Decrements available_seats by seats_requested, locks seat,
    and sets request status to APPROVED.
    """
    # Accept either request ID or lookup by passenger/journey
    req = db.query(CarPoolRequestModel).filter(
        (CarPoolRequestModel.id == request_id) | (CarPoolRequestModel.passenger_id == request_id)
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Seat request not found.")

    journey = db.query(CarPoolJourneyModel).filter(CarPoolJourneyModel.id == req.journey_id).first()
    if not journey:
        raise HTTPException(status_code=404, detail="Associated shared trip listing not found.")
    # Only the driver who published this journey can approve requests on it -
    # journeys published before this auth existed (driver_id null) can't be
    # approved through this endpoint anymore; that's an acceptable trade-off
    # for closing what was previously a wide-open "approve by guessing any
    # request id" gap.
    if str(journey.driver_id) != str(current_driver.id):
        raise HTTPException(status_code=403, detail="You can only approve requests on your own listings.")

    if req.status == "APPROVED":
        return {"success": True, "message": "Request is already approved.", "status": "APPROVED"}

    if journey.available_seats < req.seats_requested:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve: requested {req.seats_requested} seats, but only {journey.available_seats} left."
        )

    # Apply seat locking & decrement server-side
    req.status = "APPROVED"
    journey.available_seats = max(0, journey.available_seats - req.seats_requested)
    if journey.available_seats == 0:
        journey.status = "FULL"

    db.commit()
    db.refresh(journey)
    db.refresh(req)

    return {
        "success": True,
        "message": f"Approved seat request for {req.passenger_name}. {journey.available_seats} seat(s) remaining.",
        "request_id": req.id,
        "journey_id": journey.id,
        "available_seats": journey.available_seats,
        "journey_status": journey.status,
        "request_status": "ACCEPTED",
    }


@router.post("/requests/{request_id}/decline")
def decline_seat_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """Host declines a seat join request without modifying seat availability."""
    req = db.query(CarPoolRequestModel).filter(
        (CarPoolRequestModel.id == request_id) | (CarPoolRequestModel.passenger_id == request_id)
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Seat request not found.")

    journey = db.query(CarPoolJourneyModel).filter(CarPoolJourneyModel.id == req.journey_id).first()
    if journey and str(journey.driver_id) != str(current_driver.id):
        raise HTTPException(status_code=403, detail="You can only decline requests on your own listings.")

    req.status = "DECLINED"
    db.commit()

    return {
        "success": True,
        "message": f"Declined seat request for {req.passenger_name}.",
        "request_id": req.id,
        "request_status": "DECLINED",
    }
