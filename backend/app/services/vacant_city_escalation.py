# app/services/vacant_city_escalation.py
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.orders import Order
from app.models.order_assignments import OrderAssignment
from app.crud.system_settings import get_system_setting
from app.crud.notification import send_push_notifications_vehicle_owner

logger = logging.getLogger("dropcars.vacant_escalation")


async def check_and_escalate_vacant_city_orders(db: Session) -> dict:
    """
    Checks all pending, unassigned orders. If an order's elapsed time exceeds
    the configurable escalation threshold percentage (default: 70%) of its
    max_time_to_assign_order, automatically sends a push notification to idle fleet
    owners in the pickup city.
    """
    # 1. Fetch threshold percentage from dynamic platform settings
    escalation_pct = get_system_setting(db, "vacant_city_escalation_pct", 70)

    # 2. Fetch pending orders with a deadline
    pending_orders = db.query(Order).filter(
        Order.trip_status == "PENDING"
    ).all()

    escalated_count = 0
    now = datetime.now(timezone.utc)

    for order in pending_orders:
        # Check if already accepted or active assignment exists. Real
        # AssignmentStatusEnum values are PENDING/ASSIGNED/CANCELLED/
        # COMPLETED/DRIVING (no ACCEPTED/DRIVER_CONFIRMED) - "has someone
        # already claimed this" means any non-cancelled row, matching the
        # same definition used by the order_assignments unique index.
        active_assignment = db.query(OrderAssignment).filter(
            OrderAssignment.order_id == order.id,
            OrderAssignment.assignment_status != "CANCELLED"
        ).first()

        if active_assignment:
            continue

        if not order.created_at or not order.max_time_to_assign_order:
            continue

        # Convert created_at to timezone-aware UTC if needed
        order_created = order.created_at
        if order_created.tzinfo is None:
            order_created = order_created.replace(tzinfo=timezone.utc)

        elapsed_minutes = (now - order_created).total_seconds() / 60.0
        max_minutes = float(order.max_time_to_assign_order)

        if max_minutes <= 0:
            continue

        elapsed_pct = (elapsed_minutes / max_minutes) * 100.0

        if elapsed_pct >= escalation_pct:
            pickup_city = "ALL"
            if isinstance(order.pickup_drop_location, dict):
                pickup_city = order.pickup_drop_location.get("0") or "ALL"

            logger.info(
                "Escalating order #%s in city %s (elapsed %.1f%% >= threshold %d%%)",
                order.id, pickup_city, elapsed_pct, escalation_pct
            )

            try:
                title = "🚨 Urgent Unassigned Trip Alert"
                message = f"Trip #{order.id} in {pickup_city} needs immediate vehicle assignment!"
                await send_push_notifications_vehicle_owner(db, title, message, [pickup_city])
                escalated_count += 1
            except Exception as e:
                logger.error("Failed to send vacant escalation push for order #%s: %s", order.id, e)

    return {
        "status": "SUCCESS",
        "pending_scanned": len(pending_orders),
        "escalated_count": escalated_count,
        "escalation_pct_threshold": escalation_pct,
    }
