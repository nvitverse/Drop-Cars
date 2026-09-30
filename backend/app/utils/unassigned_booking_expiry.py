import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.orders import Order
from app.models.new_orders import NewOrder
from app.models.ai_automation_log import AIAutomationLog
from app.models.platform_setting import PlatformSetting
from app.utils.assignment_priority_config import get_assignment_priority_config

logger = logging.getLogger(__name__)

DEFAULT_UNASSIGNED_REMOVAL_TIMEOUT_MINS = 30


def get_unassigned_removal_timeout(db: Session) -> int:
    """Fetches Admin Configurable Unassigned Booking Removal Timeout (Default: 30 Mins)."""
    setting = db.query(PlatformSetting).filter(
        PlatformSetting.key == "ASSIGNMENT_PRIORITY_ASSIGNMENT_DEFAULT_MINS"
    ).first()
    if setting and setting.value and setting.value.isdigit():
        return int(setting.value)
    return DEFAULT_UNASSIGNED_REMOVAL_TIMEOUT_MINS


def auto_remove_unassigned_bookings(db: Session, custom_timeout_mins: int = None) -> Dict[str, Any]:
    """
    Driver Assignment Expiry & Penalty Feed Re-entry Engine:
    - Scans for accepted bookings where driver/car details were NOT assigned within allowed time.
    - Revokes allocation from driver and logs penalty.
    - Returns booking back to open feed with Grace Window (5 mins for <=1h pickup, 30 mins for >1h pickup).
    - Original driver can re-accept within grace window to avoid/waive penalty.
    """
    config = get_assignment_priority_config(db)
    timeout_mins = custom_timeout_mins or config.get("assignment_default_mins", 30)
    grace_under_1h = config.get("grace_under_1h_mins", 5)
    grace_over_1h = config.get("grace_over_1h_mins", 30)

    now = datetime.now(timezone.utc)
    expired_count = 0
    expired_order_ids: List[str] = []

    try:
        # Check NewOrders table for accepted orders without driver details assigned
        pending_orders = db.query(NewOrder).filter(
            or_(
                NewOrder.trip_status == "ACCEPTED",
                NewOrder.trip_status == "PENDING_ASSIGNMENT"
            ),
            or_(NewOrder.Driver_assigned == False, NewOrder.Car_assigned == False)
        ).all()

        for order in pending_orders:
            # Check if assignment deadline has passed
            acceptance_time = order.updated_at or order.created_at
            if acceptance_time:
                if acceptance_time.tzinfo is None:
                    acceptance_time = acceptance_time.replace(tzinfo=timezone.utc)
                elapsed_mins = (now - acceptance_time).total_seconds() / 60
            else:
                elapsed_mins = timeout_mins + 1

            if elapsed_mins >= timeout_mins:
                # Pickup proximity check for penalty grace period
                pickup_time = order.start_date_time
                if pickup_time:
                    if pickup_time.tzinfo is None:
                        pickup_time = pickup_time.replace(tzinfo=timezone.utc)
                    mins_to_pickup = (pickup_time - now).total_seconds() / 60
                else:
                    mins_to_pickup = 120

                grace_mins = grace_under_1h if mins_to_pickup <= 60 else grace_over_1h
                grace_expiry = now + timedelta(minutes=grace_mins)

                previous_driver_id = order.driver_id or getattr(order, 'allocated_driver_id', None)

                # Reset status to open feed with penalty logged & grace timer
                order.trip_status = "FEED_OPEN"
                order.Driver_assigned = False
                order.Car_assigned = False
                order.penalty_applied = True
                order.reaccept_grace_expiry = grace_expiry

                order_id_str = str(order.order_id)
                expired_order_ids.append(order_id_str)
                expired_count += 1

                # Log event in AI Automation Audit Trail
                log_entry = AIAutomationLog(
                    category="AUTO_DISPATCH",
                    action_type="ASSIGNMENT_TIMED_OUT_PENALTY",
                    entity_type="booking",
                    entity_id=order_id_str,
                    entity_name=f"Booking #{order_id_str}",
                    summary=f"Assignment deadline expired after {timeout_mins}m. Booking returned to feed with {grace_mins}m grace window.",
                    confidence_score=1.0,
                    details_json={
                        "order_id": order_id_str,
                        "previous_driver_id": str(previous_driver_id) if previous_driver_id else None,
                        "penalty_applied": True,
                        "grace_window_minutes": grace_mins,
                        "grace_expiry": grace_expiry.isoformat(),
                        "mins_to_pickup": mins_to_pickup
                    }
                )
                db.add(log_entry)

        db.commit()
    except Exception as e:
        logger.error(f"Error handling assignment timeout & penalties: {e}")
        db.rollback()

    return {
        "success": True,
        "timeout_minutes_used": timeout_mins,
        "processed_count": expired_count,
        "expired_order_ids": expired_order_ids
    }
