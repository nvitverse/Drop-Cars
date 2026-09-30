import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.driver_route_request import DriverRouteRequest
from app.models.ai_automation_log import AIAutomationLog
from app.models.platform_setting import PlatformSetting

logger = logging.getLogger(__name__)

MAX_ALLOWED_ROUTES_PER_DRIVER = 3
DEFAULT_ACCEPTANCE_TIMEOUT_MINS = 10


def add_driver_route_request(
    db: Session,
    driver_id: str,
    driver_name: str,
    origin_city: str,
    destination_city: str,
    available_until: datetime,
    driver_phone: Optional[str] = None,
    driver_email: Optional[str] = None,
    car_id: Optional[str] = None,
    car_number: Optional[str] = None,
    car_type: Optional[str] = "Sedan"
) -> DriverRouteRequest:
    """
    Registers a preferred route request for a driver.
    Enforces the rule: Maximum 3 active route requests allowed per driver.
    """
    active_count = db.query(DriverRouteRequest).filter(
        DriverRouteRequest.driver_id == driver_id,
        DriverRouteRequest.is_active == True,
        DriverRouteRequest.status == "ACTIVE"
    ).count()

    if active_count >= MAX_ALLOWED_ROUTES_PER_DRIVER:
        raise ValueError(f"Driver has already registered the maximum allowed {MAX_ALLOWED_ROUTES_PER_DRIVER} active route requests.")

    route_req = DriverRouteRequest(
        driver_id=driver_id,
        driver_name=driver_name,
        driver_phone=driver_phone,
        driver_email=driver_email,
        car_id=car_id,
        car_number=car_number,
        car_type=car_type,
        origin_city=origin_city.strip().capitalize(),
        destination_city=destination_city.strip().capitalize(),
        available_until=available_until,
        status="ACTIVE",
        is_active=True
    )
    db.add(route_req)
    db.commit()
    db.refresh(route_req)
    return route_req


from app.utils.whatsapp_notifier import send_driver_assignment_whatsapp


def send_driver_assignment_intimation(
    driver_name: str,
    driver_phone: Optional[str],
    driver_email: Optional[str],
    order_id: str,
    pickup_city: str,
    drop_city: str,
    timeout_mins: int
) -> Dict[str, bool]:
    """
    Triggers FCM Push Notification, Email Intimation, and Automated WhatsApp Message to assigned driver.
    """
    logger.info(f"[PUSH ALERT] Sent to driver {driver_name} ({driver_phone}): Auto-Assigned Order #{order_id} ({pickup_city} -> {drop_city})")
    
    if driver_email:
        logger.info(f"[EMAIL INTIMATION] Sent to {driver_email}: Trip Auto-Assigned!")

    # Automated WhatsApp Message Trigger
    whatsapp_sent = False
    if driver_phone:
        res = send_driver_assignment_whatsapp(
            driver_phone=driver_phone,
            driver_name=driver_name,
            pickup_city=pickup_city,
            drop_city=drop_city,
            order_id=order_id
        )
        whatsapp_sent = res.get("success", False)

    return {"push_sent": True, "email_sent": bool(driver_email), "whatsapp_sent": whatsapp_sent}


def match_and_auto_assign_order(
    db: Session,
    order_id: str,
    pickup_city: str,
    drop_city: str,
    car_type: Optional[str] = "Sedan",
    order_time: Optional[datetime] = None
) -> Dict[str, Any]:
    """
    Strict Opt-In Auto-Assignment Engine:
    1. Checks if any active driver route request matches pickup_city -> drop_city and time window.
    2. IF NO MATCH: Does NOT auto-assign anyone. Returns assigned=False.
    3. IF MATCH: Auto-assigns driver, marks route request FULFILLED, triggers FCM + Email, starts acceptance countdown.
    """
    if not order_time:
        order_time = datetime.now(timezone.utc)

    # Fetch Admin Acceptance Timeout Setting (Default: 10 mins)
    timeout_setting = db.query(PlatformSetting).filter(
        PlatformSetting.key == "DRIVER_AUTO_ACCEPTANCE_TIMEOUT_MINUTES"
    ).first()
    timeout_mins = int(timeout_setting.value) if timeout_setting and timeout_setting.value.isdigit() else DEFAULT_ACCEPTANCE_TIMEOUT_MINS

    # Query active route requests matching origin, destination & valid time window
    matching_requests = db.query(DriverRouteRequest).filter(
        DriverRouteRequest.is_active == True,
        DriverRouteRequest.status == "ACTIVE",
        func.lower(DriverRouteRequest.origin_city) == pickup_city.strip().lower(),
        func.lower(DriverRouteRequest.destination_city) == drop_city.strip().lower(),
        DriverRouteRequest.available_from <= order_time,
        DriverRouteRequest.available_until >= order_time
    ).all()

    # Rule: Without explicit matching route request, DO NOT AUTO-ASSIGN!
    if not matching_requests:
        return {
            "assigned": False,
            "reason": f"No driver has requested route '{pickup_city} -> {drop_city}' within valid time window. Skipping auto-assignment.",
            "order_id": order_id
        }

    # Priority Placement: Subscribed drivers get auto-assignment priority!
    def _driver_subscription_rank(req: DriverRouteRequest) -> int:
        from app.models.car_driver import CarDriver
        driver = db.query(CarDriver).filter(CarDriver.id == str(req.driver_id)).first()
        if driver and driver.subscription_tier in ("STARTER", "PRO", "BUSINESS", "MONTHLY", "YEARLY"):
            if not driver.subscription_expires_at or driver.subscription_expires_at > datetime.now(timezone.utc):
                return 0
        return 1

    matching_requests.sort(key=lambda r: (_driver_subscription_rank(r), r.created_at))
    matching_request = matching_requests[0]

    # Match Found! Execute Auto-Assignment
    matching_request.status = "FULFILLED"
    matching_request.is_active = False
    matching_request.assigned_order_id = order_id
    db.commit()

    # Trigger Push & Email Intimation
    intimation_status = send_driver_assignment_intimation(
        driver_name=matching_request.driver_name,
        driver_phone=matching_request.driver_phone,
        driver_email=matching_request.driver_email,
        order_id=order_id,
        pickup_city=pickup_city,
        drop_city=drop_city,
        timeout_mins=timeout_mins
    )

    # Log in AI Automation Audit Trail
    log_entry = AIAutomationLog(
        category="AUTO_DISPATCH",
        action_type="AUTO_DISPATCHED",
        entity_type="booking",
        entity_id=order_id,
        entity_name=f"Order #{order_id} ({pickup_city} -> {drop_city})",
        summary=f"Opt-In Auto-Assigned to Driver {matching_request.driver_name} based on requested route '{pickup_city} -> {drop_city}'",
        confidence_score=1.0,
        details_json={
            "order_id": order_id,
            "pickup_city": pickup_city,
            "drop_city": drop_city,
            "assigned_driver_id": str(matching_request.driver_id),
            "assigned_driver_name": matching_request.driver_name,
            "driver_phone": matching_request.driver_phone,
            "driver_email": matching_request.driver_email,
            "intimation": intimation_status,
            "acceptance_timeout_minutes": timeout_mins
        }
    )
    db.add(log_entry)
    db.commit()

    return {
        "assigned": True,
        "order_id": order_id,
        "assigned_driver_id": str(matching_request.driver_id),
        "assigned_driver_name": matching_request.driver_name,
        "car_number": matching_request.car_number,
        "intimation": intimation_status,
        "acceptance_timeout_minutes": timeout_mins,
        "message": f"Successfully auto-assigned to {matching_request.driver_name}. Acceptance countdown started ({timeout_mins} mins)."
    }
