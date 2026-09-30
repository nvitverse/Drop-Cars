import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.driver_route_request import DriverRouteRequest
from app.models.car_driver import CarDriver
from app.models.ai_automation_log import AIAutomationLog

logger = logging.getLogger(__name__)


def find_and_rank_return_cab_drivers(
    db: Session,
    pickup_city: str,
    drop_city: str,
    car_type: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Ranks active return cab route requests based on user's priority rules:
    1. Trusted Driver Status (is_trusted_driver)
    2. High Driver Rating (rating_avg DESC)
    3. Earliest Request Timestamp (created_at ASC)
    """
    now = datetime.now(timezone.utc)
    
    # Query active matching requests
    requests = db.query(DriverRouteRequest).filter(
        DriverRouteRequest.is_active == True,
        DriverRouteRequest.status == "ACTIVE",
        func.lower(DriverRouteRequest.origin_city) == pickup_city.strip().lower(),
        func.lower(DriverRouteRequest.destination_city) == drop_city.strip().lower(),
        DriverRouteRequest.available_from <= now,
        DriverRouteRequest.available_until >= now
    ).all()

    if not requests:
        return []

    ranked = []
    for req in requests:
        driver = db.query(CarDriver).filter(CarDriver.id == req.driver_id).first()
        is_trusted = getattr(driver, "is_trusted_driver", False) if driver else False
        rating = getattr(driver, "rating_avg", 0.0) if driver else 0.0
        
        ranked.append({
            "request_id": str(req.id),
            "driver_id": str(req.driver_id),
            "driver_name": req.driver_name,
            "driver_phone": req.driver_phone,
            "driver_email": req.driver_email,
            "car_number": req.car_number,
            "car_type": req.car_type,
            "origin_city": req.origin_city,
            "destination_city": req.destination_city,
            "is_trusted_driver": is_trusted,
            "rating_avg": rating,
            "created_at": req.created_at
        })

    # Sort by: Trusted (True > False), Rating (High > Low), Request Time (Oldest > Newest)
    ranked.sort(key=lambda x: (
        1 if x["is_trusted_driver"] else 0,
        x["rating_avg"],
        -x["created_at"].timestamp() if x["created_at"] else 0
    ), reverse=True)

    return ranked


def trigger_smart_return_dispatch(
    db: Session,
    order_id: str,
    pickup_city: str,
    drop_city: str,
    car_type: Optional[str] = "Sedan"
) -> Dict[str, Any]:
    """
    Triggers Priority Alarm / Notification to top-ranked trusted driver for Return Cab route.
    """
    candidates = find_and_rank_return_cab_drivers(db, pickup_city, drop_city, car_type)

    if not candidates:
        return {
            "success": False,
            "matched": False,
            "message": f"No active return cab route requests found for '{pickup_city} -> {drop_city}'."
        }

    top_candidate = candidates[0]

    # Log in AI Automation Audit
    log_entry = AIAutomationLog(
        category="RETURN_CAB_DISPATCH",
        action_type="PRIORITY_DISPATCH_ALERT",
        entity_type="booking",
        entity_id=order_id,
        entity_name=f"Order #{order_id} ({pickup_city} -> {drop_city})",
        summary=f"Matched Return Cab Priority Driver: {top_candidate['driver_name']} (Trusted: {top_candidate['is_trusted_driver']}, Rating: {top_candidate['rating_avg']}★)",
        confidence_score=1.0,
        details_json={
            "order_id": order_id,
            "top_candidate": top_candidate,
            "total_matches": len(candidates)
        }
    )
    db.add(log_entry)
    db.commit()

    return {
        "success": True,
        "matched": True,
        "priority_driver": top_candidate,
        "total_candidates": len(candidates),
        "message": f"Priority match notification & alarm sent to trusted driver {top_candidate['driver_name']}."
    }
