"""
backend/app/crud/drop_bid_engine.py

Real Drop Bid Driver-Response Pipeline with Alarm-Style Urgency,
Pickup-Time-Based Dynamic Response Windows, Timeout Penalty Escalation,
and Customer Price-Increase Protection.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from app.models.orders import Order
from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
from app.crud.notification import (
    send_custom_sound_notification_vehicle_owner,
    send_push_notification_to_customer,
    DRIVER_CHANNEL_URGENT
)
from app.crud.wallet import debit_wallet_allow_negative, get_trip_hold


def calculate_response_window_minutes(pickup_date_time_str: str) -> int:
    """
    Computes dynamic response window minutes based on booking pickup time vs now:
    - Immediate pickup (< 30 mins away): 2 mins per response window (total 6 mins across 3 attempts).
    - Standard pickup (30 mins to 3 hours away): 5 mins per response window (total 15 mins across 3 attempts).
    - Advance pickup (> 3 hours away): 10 mins per response window (total 30 mins across 3 attempts).
    """
    try:
        now = datetime.now(timezone.utc)
        if "T" in pickup_date_time_str or "-" in pickup_date_time_str:
            pickup_dt = datetime.fromisoformat(pickup_date_time_str.replace("Z", "+00:00"))
            if pickup_dt.tzinfo is None:
                pickup_dt = pickup_dt.replace(tzinfo=timezone.utc)
            delta_mins = (pickup_dt - now).total_seconds() / 60.0
            if delta_mins < 30:
                return 2
            elif delta_mins <= 180:
                return 5
            else:
                return 10
    except Exception:
        pass
    return 5


async def process_drop_bid_timeouts(db: Session) -> Dict[str, Any]:
    """
    Background worker/task checking active Drop Bid driver assignments:
    1. Tracks 3 response window attempts.
    2. Retries push alert on attempt 1 & 2 expirations.
    3. On 3rd attempt timeout: debits ₹500 floor penalty from non-responding driver/fleet owner wallet.
    4. Price-Increase Exception Check:
       - If next candidate offer <= timed-out offer: auto-reassigns to next candidate.
       - If ALL remaining candidate offers > timed-out offer: sets status to 'CUSTOMER_DECISION_REQUIRED' and notifies customer.
    """
    now = datetime.now(timezone.utc)
    pending_assignments = (
        db.query(OrderAssignment)
        .filter(
            OrderAssignment.assignment_status == AssignmentStatusEnum.PENDING,
            OrderAssignment.expires_at <= now
        )
        .all()
    )

    processed_count = 0
    reassigned_count = 0
    decision_required_count = 0

    for assignment in pending_assignments:
        order = db.query(Order).filter(Order.id == assignment.order_id).first()
        if not order:
            continue

        attempts = getattr(assignment, "response_attempts", 1) or 1

        if attempts < 3:
            # Increment attempt counter and extend timeout window
            setattr(assignment, "response_attempts", attempts + 1)
            window_mins = calculate_response_window_minutes(order.start_date_time or str(now))
            assignment.expires_at = now + timedelta(minutes=window_mins)
            db.commit()

            # Retry push notification to driver (urgent channel)
            await send_custom_sound_notification_vehicle_owner(
                db=db,
                title=f"🚨 URGENT: Drop Bid Trip Offer (Attempt {attempts + 1}/3)",
                message=f"Pickup: {order.pickup_location} → {order.drop_location}. Please accept or decline immediately!",
                ordered_city=[order.pickup_city or "ALL"],
                is_urgent=True,
                channel_id=DRIVER_CHANNEL_URGENT
            )
            processed_count += 1

        else:
            # 3rd Attempt Timed Out! Apply Penalty & Escalation
            assignment.assignment_status = AssignmentStatusEnum.REJECTED
            setattr(assignment, "rejection_reason", "TIMED_OUT_3_ATTEMPTS")
            
            # Debit ₹500 floor penalty from driver / vehicle owner wallet
            vo_id = str(assignment.vehicle_owner_id)
            hold = get_trip_hold(db, order.id, vo_id)
            penalty_amount = max(hold, 500)
            shortfall = penalty_amount - hold

            try:
                debit_wallet_allow_negative(
                    db=db,
                    user_id=vo_id,
                    user_type="vehicle_owner",
                    amount=shortfall,
                    transaction_type="PENALTY_DEBIT",
                    description=f"Penalty: Drop Bid assignment response timeout for Order #{order.id}"
                )
            except Exception as e:
                print(f"Error debiting wallet for timeout penalty: {e}")

            db.commit()

            # Check next available candidate offers
            candidate_offers: List[Dict[str, Any]] = getattr(order, "candidate_offers", []) or []
            timed_out_price = getattr(assignment, "offered_price", order.target_price or 0)

            remaining_candidates = [
                c for c in candidate_offers 
                if c.get("driver_id") != str(assignment.driver_id) and c.get("status") not in ("TIMED_OUT", "REJECTED")
            ]

            if not remaining_candidates:
                order.order_status = "CANCELLED"
                db.commit()
                await send_push_notification_to_customer(
                    db=db,
                    customer_id=str(order.customer_id),
                    title="Drop Market Update",
                    message="No drivers responded to your trip request. Your request has been closed.",
                    event_key="drop_bid_activity"
                )
            else:
                cheaper_or_equal = [c for c in remaining_candidates if c.get("offer_price", 999999) <= timed_out_price]

                if cheaper_or_equal:
                    # Auto-assign next candidate
                    next_cand = cheaper_or_equal[0]
                    new_assign = OrderAssignment(
                        order_id=order.id,
                        vehicle_owner_id=next_cand.get("vehicle_owner_id"),
                        driver_id=next_cand.get("driver_id"),
                        assignment_status=AssignmentStatusEnum.PENDING,
                        offered_price=next_cand.get("offer_price"),
                        expires_at=now + timedelta(minutes=calculate_response_window_minutes(order.start_date_time or str(now)))
                    )
                    setattr(new_assign, "response_attempts", 1)
                    db.add(new_assign)
                    db.commit()
                    reassigned_count += 1

                    await send_custom_sound_notification_vehicle_owner(
                        db=db,
                        title="🚨 URGENT: Drop Bid Trip Match!",
                        message=f"New Trip Request: {order.pickup_location} → {order.drop_location}. Fare: ₹{next_cand.get('offer_price')}",
                        ordered_city=[order.pickup_city or "ALL"],
                        is_urgent=True,
                        channel_id=DRIVER_CHANNEL_URGENT
                    )
                else:
                    # Price Increase Exception: notify customer, do NOT auto-assign
                    order.order_status = "CUSTOMER_DECISION_REQUIRED"
                    setattr(order, "pending_higher_offers", remaining_candidates)
                    db.commit()
                    decision_required_count += 1

                    min_higher_price = min(c.get("offer_price", 999999) for c in remaining_candidates)

                    await send_push_notification_to_customer(
                        db=db,
                        customer_id=str(order.customer_id),
                        title="Drop Market Action Required ⚠️",
                        message=f"Your matched driver did not respond. Remaining available offers start at ₹{min_higher_price}. Tap to review and confirm or cancel.",
                        event_key="drop_bid_activity"
                    )

    return {
        "processed_retries": processed_count,
        "reassigned": reassigned_count,
        "customer_decision_required": decision_required_count
    }
