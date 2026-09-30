from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import uuid

from app.database.session import get_db
from app.models.driver_route_request import DriverRouteRequest
from app.utils.driver_route_matcher import (
    add_driver_route_request,
    match_and_auto_assign_order
)

router = APIRouter(tags=["Driver Route Requests & Auto-Assign"])


@router.post("/driver/route-requests")
def create_driver_route_request(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Registers a driver preferred route request (Max 3 active per driver).
    Must provide origin_city, destination_city, and available_until timestamp.
    """
    driver_id = payload.get("driver_id")
    driver_name = payload.get("driver_name")
    origin_city = payload.get("origin_city")
    destination_city = payload.get("destination_city")
    available_until_str = payload.get("available_until")

    if not all([driver_id, driver_name, origin_city, destination_city, available_until_str]):
        raise HTTPException(status_code=400, detail="driver_id, driver_name, origin_city, destination_city, and available_until are required.")

    try:
        available_until = datetime.fromisoformat(available_until_str.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ISO format for available_until date.")

    try:
        route_req = add_driver_route_request(
            db=db,
            driver_id=driver_id,
            driver_name=driver_name,
            origin_city=origin_city,
            destination_city=destination_city,
            available_until=available_until,
            driver_phone=payload.get("driver_phone"),
            driver_email=payload.get("driver_email"),
            car_id=payload.get("car_id"),
            car_number=payload.get("car_number"),
            car_type=payload.get("car_type", "Sedan")
        )

        return {
            "success": True,
            "message": f"Preferred route '{origin_city} -> {destination_city}' registered successfully.",
            "route_request_id": str(route_req.id),
            "available_until": route_req.available_until.isoformat()
        }
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Error registering route request: {str(err)}")


@router.get("/driver/route-requests/{driver_id}")
def get_driver_active_route_requests(
    driver_id: str,
    db: Session = Depends(get_db)
):
    """Fetch all active route requests registered for a driver."""
    requests = db.query(DriverRouteRequest).filter(
        DriverRouteRequest.driver_id == driver_id,
        DriverRouteRequest.is_active == True,
        DriverRouteRequest.status == "ACTIVE"
    ).all()

    return {
        "driver_id": driver_id,
        "active_count": len(requests),
        "max_allowed": 3,
        "requests": [
            {
                "id": str(req.id),
                "origin_city": req.origin_city,
                "destination_city": req.destination_city,
                "car_type": req.car_type,
                "available_from": req.available_from.isoformat(),
                "available_until": req.available_until.isoformat(),
                "status": req.status
            }
            for req in requests
        ]
    }


@router.delete("/driver/route-requests/{request_id}")
def cancel_driver_route_request(
    request_id: str,
    db: Session = Depends(get_db)
):
    """Deactivate / Cancel a registered driver route request."""
    try:
        req_uuid = uuid.UUID(request_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid request_id format")

    req = db.query(DriverRouteRequest).filter(DriverRouteRequest.id == req_uuid).first()
    if not req:
        raise HTTPException(status_code=404, detail="Route request not found")

    req.is_active = False
    req.status = "CANCELLED"
    db.commit()

    return {"success": True, "message": "Driver route request cancelled successfully."}


@router.post("/orders/{order_id}/trigger-route-assign")
def trigger_route_auto_assignment(
    order_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Evaluates new booking against active driver route requests.
    Auto-assigns ONLY if explicit match exists, sends Push+Email intimations.
    """
    pickup_city = payload.get("pickup_city")
    drop_city = payload.get("drop_city")
    car_type = payload.get("car_type", "Sedan")

    if not pickup_city or not drop_city:
        raise HTTPException(status_code=400, detail="pickup_city and drop_city are required")

    result = match_and_auto_assign_order(
        db=db,
        order_id=order_id,
        pickup_city=pickup_city,
        drop_city=drop_city,
        car_type=car_type
    )

    return result
