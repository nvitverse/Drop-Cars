from sqlalchemy.orm import Session
from sqlalchemy import desc, func, text
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
from app.models.orders import Order, Trip_status
from app.models.new_orders import NewOrder
from app.models.end_records import EndRecord
from app.models.hourly_rental import HourlyRental
from app.models.orders import OrderSourceEnum
from fastapi import HTTPException
from app.crud.vendor_wallet import credit_vendor_wallet
from app.crud.notification import notify_vendor_auto_cancelled_order
from app.models.vendor_details import VendorDetails
import math
from app.utils.timezone import format_pickup_time_ist


def collect_fields_for_order(db: Session, order: Order) -> dict:
    """What the driver has to collect from the customer once the booking is accepted. Shown ONLY after accept - before
    that an all-inclusive booking shows just the driver's own earning. Total is what the customer pays (fare +
    markup / extras); the advance is with the poster, so the rest is cash in the driver's hand."""
    try:
        _src = getattr(getattr(order, "source", None), "value", getattr(order, "source", None))
        if _src != "HOURLY_RENTAL":
            from app.utils.commission import estimate_split_for_order
            total = int(estimate_split_for_order(db, order)["customer_total"])
        else:
            total = int(getattr(order, "vendor_price", 0) or getattr(order, "estimated_price", 0) or 0)
    except Exception:
        total = int(getattr(order, "vendor_price", 0) or getattr(order, "estimated_price", 0) or 0)
    advance = int(getattr(order, "advance_received", 0) or 0)
    return {
        "customer_total": total,
        "advance_received": advance,
        "collect_from_customer": max(0, total - advance),
    }


def is_customer_number_revealed(db: Session, order: Order) -> bool:
    """Whether the assigned driver can currently see the real customer
    number (see get_masked_customer_number below for the reveal rule).
    Shared with the cancel/refund flow - once the driver has the customer's
    real number, they can coordinate the trip off-platform, so a refund
    past that point would reward exactly that bypass."""
    if getattr(order, "is_urgent", False):
        return True
    # Manual "Show customer number" switch (vendor / poster / admin) overrides the time window
    if getattr(order, "data_visibility_vehicle_owner", False):
        return True

    from app.crud.customer_booking_request import (
        get_platform_setting_value, PHONE_REVEAL_HOURS_BEFORE_KEY, DEFAULT_PHONE_REVEAL_HOURS_BEFORE,
    )
    pickup_at = order.start_date_time
    if pickup_at is None:
        return True  # no pickup time to gate against - fail open, matches get_masked_customer_number
    if pickup_at.tzinfo is not None:
        pickup_at = pickup_at.replace(tzinfo=None)

    try:
        hours_before = float(get_platform_setting_value(
            db, PHONE_REVEAL_HOURS_BEFORE_KEY, str(DEFAULT_PHONE_REVEAL_HOURS_BEFORE)
        ))
    except (TypeError, ValueError):
        hours_before = DEFAULT_PHONE_REVEAL_HOURS_BEFORE

    reveal_at = pickup_at - timedelta(hours=hours_before)
    return datetime.utcnow() >= reveal_at


def get_masked_customer_number(db: Session, order: Order) -> str:
    """Customer's phone number, hidden from the assigned driver until
    phone_reveal_hours_before_pickup hours before pickup (default 6, admin-
    editable) - previously shown the instant a driver/car was assigned, no
    matter how far in advance that was. Urgent bookings always reveal it
    immediately, since there's no meaningful advance window to protect."""
    if is_customer_number_revealed(db, order):
        return order.customer_number

    from app.crud.customer_booking_request import (
        get_platform_setting_value, PHONE_REVEAL_HOURS_BEFORE_KEY, DEFAULT_PHONE_REVEAL_HOURS_BEFORE,
    )
    try:
        hours_before = float(get_platform_setting_value(
            db, PHONE_REVEAL_HOURS_BEFORE_KEY, str(DEFAULT_PHONE_REVEAL_HOURS_BEFORE)
        ))
    except (TypeError, ValueError):
        hours_before = DEFAULT_PHONE_REVEAL_HOURS_BEFORE
    return f"Available {int(hours_before)}h before pickup"


from sqlalchemy.exc import IntegrityError

def create_order_assignment(
    db: Session,
    order_id: int,
    vehicle_owner_id: str,
    accepted_tier: str | None = None,
    held_amount: int | None = None,
) -> OrderAssignment:
    """Create a new order assignment"""
    # Check if order already has an active assignment (not cancelled)
    existing_assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED
    ).first()
    
    if existing_assignment:
        if str(existing_assignment.vehicle_owner_id) == str(vehicle_owner_id):
            return existing_assignment
        raise HTTPException(
            status_code=409,
            detail=f"Order {order_id} already has an active assignment with status {existing_assignment.assignment_status}"
        )
    
    # Calculate expiry time based on order's max_time_to_assign_order
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    now = datetime.utcnow()
    time_diff = order.max_time_to_assign_order - order.created_at if (order.max_time_to_assign_order and order.created_at) else timedelta(minutes=15)
    expires_at = now + time_diff
    
    db_assignment = OrderAssignment(
        order_id=order_id,
        vehicle_owner_id=vehicle_owner_id,
        assignment_status=AssignmentStatusEnum.PENDING,
        expires_at=expires_at,
        created_at=datetime.utcnow(),
        accepted_tier=accepted_tier,
        held_amount=held_amount,
    )
    
    try:
        db.add(db_assignment)
        db.commit()
        db.refresh(db_assignment)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Booking #{order_id} has already been accepted/assigned to another fleet owner."
        )
    return db_assignment


DEADLINE_WARNING_STAGES = ((1, 10), (2, 3))  # (stage, minutes left)


async def send_assignment_deadline_warnings(db: Session) -> int:
    """Alarm BEFORE auto-removal: a fleet driver accepted a booking but has
    not assigned a driver and car yet. cancel_timed_out_pending_assignments
    (below) removes it at expires_at with a penalty of at least ₹500, so warn
    them at 10 minutes and again at 3 minutes left. Each stage is sent once
    per assignment (deadline_warning_stage)."""
    from app.models.notification import Notification
    from app.crud.notification import _enqueue_expo_push, _is_muted
    from app.utils.notification_settings import apply_notification_extras

    now = datetime.utcnow()
    horizon = now + timedelta(minutes=DEADLINE_WARNING_STAGES[0][1])
    rows = (
        db.query(OrderAssignment)
        .filter(
            OrderAssignment.assignment_status == AssignmentStatusEnum.PENDING,
            OrderAssignment.driver_id.is_(None),
            OrderAssignment.car_id.is_(None),
            OrderAssignment.expires_at.isnot(None),
            OrderAssignment.expires_at > now,
            OrderAssignment.expires_at <= horizon,
            OrderAssignment.deadline_warning_stage < DEADLINE_WARNING_STAGES[-1][0],
        )
        .all()
    )
    sent = 0
    for a in rows:
        try:
            expires_at = a.expires_at.replace(tzinfo=None) if a.expires_at.tzinfo else a.expires_at
            minutes_left = (expires_at - now).total_seconds() / 60
            due = [stage for stage, mins in DEADLINE_WARNING_STAGES if minutes_left <= mins and stage > (a.deadline_warning_stage or 0)]
            if not due:
                continue
            stage = max(due)
            left = max(1, int(minutes_left))
            title = f"⏰ {left} min left • Assign driver & car"
            body = (
                f"Booking #{a.order_id}: assign a driver and car within {left} min, "
                f"otherwise it is removed from you and a penalty (min ₹500) applies."
            )
            tokens = [
                n.token for n in db.query(Notification).filter(
                    Notification.user == "vehicle_owner",
                    Notification.sub == str(a.vehicle_owner_id),
                ).all()
                if n.token and not _is_muted(n)
            ]
            if tokens:
                payloads = [
                    apply_notification_extras(
                        {"to": t, "title": title, "body": body, "priority": "high",
                         "android": {"priority": "max"},
                         "data": {"type": "ASSIGN_DEADLINE_WARNING", "order_id": a.order_id}},
                        db, "assignment_deadline_warning",
                    )
                    for t in tokens
                ]
                _enqueue_expo_push(db, payloads)
                sent += 1
            a.deadline_warning_stage = stage
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Deadline warning failed for assignment {a.id}: {e}")
    return sent


async def cancel_timed_out_pending_assignments(db: Session) -> int:
    """Cancel PENDING assignments that exceeded order's max_time_to_assign_order and have no driver/car assigned.
    Also debits penalty amount from fleet owner's wallet and updates order status.

    Returns number of assignments cancelled in this run.
    """
    from app.models.orders import CancelledByEnum
    from app.crud.wallet import debit_wallet, get_owner_balance
    from app.models.admin import Admin
    admin = db.query(Admin).first()
    admin_id = str(admin.id) if admin else None
    
    now = datetime.utcnow()
    # Find pending assignments whose order's max_time_to_assign_order has passed
    pending_assignments = (
        db.query(OrderAssignment)
        .join(Order, Order.id == OrderAssignment.order_id)
        .filter(
            OrderAssignment.assignment_status == AssignmentStatusEnum.PENDING,
            OrderAssignment.driver_id.is_(None),
            OrderAssignment.car_id.is_(None),
            OrderAssignment.expires_at <= now
            # (OrderAssignment.created_at + timedelta(minutes = (((Order.created_at - Order.max_time_to_assign_order).total_seconds() / 60))) <= now)
        )
        .all()
    )
#     pending_assignments = (
#     db.query(OrderAssignment)
#     .join(Order, Order.id == OrderAssignment.order_id)
#     .filter(
#         OrderAssignment.assignment_status == AssignmentStatusEnum.PENDING,
#         OrderAssignment.driver_id.is_(None),
#         OrderAssignment.car_id.is_(None),
#         (
#             # created_at + (created_at - max_time_to_assign_order) <= now
#             func.datetime(OrderAssignment.created_at, 
#                 func.printf('+%s seconds', 
#                     func.strftime('%s', Order.created_at) - func.strftime('%s', Order.max_time_to_assign_order)
#                 )
#             ) <= now
#         )
#     )
#     .all()
# )

    cancelled_count = 0
    for assignment in pending_assignments:
        try:
            # Get the order details
            order = db.query(Order).filter(Order.id == assignment.order_id).first()
            if not order:
                continue
            
            # Unified penalty rule (same one used for driving-cancellations,
            # see apply_driving_cancellation_penalty): whatever is currently
            # held for this booking, or 500 rupees, whichever is more. The
            # hold is forfeited (not refunded); if it's short of the 500
            # floor, the difference is debited on top (wallet may go
            # negative). Whole penalty goes to admin - the vendor gets
            # nothing here, extras only belong to the vendor on a
            # successful trip.
            vehicle_owner_id = str(assignment.vehicle_owner_id)
            try:
                from app.crud.wallet import debit_wallet_allow_negative, get_trip_hold
                hold = get_trip_hold(db, order.id, vehicle_owner_id)
                penalty_amount = max(hold, 500)
                shortfall = penalty_amount - hold

                if shortfall > 0:
                    new_balance, ledger_entry = debit_wallet_allow_negative(
                        db=db,
                        vehicle_owner_id=vehicle_owner_id,
                        amount=shortfall,
                        reference_id=str(assignment.id),
                        reference_type="AUTO_CANCELLATION_PENALTY",
                        notes=f"Penalty: driver/car not assigned in time for booking {order.id} (hold {hold} short of {penalty_amount})"
                    )
                    print(f"Debited {shortfall} penalty from fleet owner {vehicle_owner_id} (balance now {new_balance})")
                else:
                    # The accept-time hold alone already covers the full penalty,
                    # so no extra debit is needed - but leaving the original
                    # "Held for booking X (refunded if vendor cancels)" note
                    # untouched makes it look like a routine refundable hold
                    # even though the money was just forfeited. Correct that
                    # entry's own note in place instead of leaving it stale.
                    from app.models.wallet_ledger import WalletLedger
                    hold_entry = db.query(WalletLedger).filter(
                        WalletLedger.vehicle_owner_id == vehicle_owner_id,
                        WalletLedger.reference_id == str(order.id),
                        WalletLedger.reference_type == "TRIP_HOLD",
                    ).first()
                    if hold_entry:
                        hold_entry.notes = (
                            f"Booking {order.id} auto-cancelled - held amount of "
                            f"₹{hold} forfeited as penalty (driver/car not assigned in time)"
                        )
                        db.add(hold_entry)
                        db.commit()
                    print(f"Hold of {hold} forfeited as penalty for booking {order.id} (no extra debit)")

                if admin_id:
                    from app.crud.admin_wallet import credit_admin_wallet
                    credit_admin_wallet(
                        db=db,
                        admin_id=admin_id,
                        amount=penalty_amount,
                        order_id=assignment.order_id,
                        notes=f"Penalty: booking {order.id} auto-cancelled (no driver/car assigned)",
                    )

                # Inform the vendor their booking auto-cancelled (no money to them)
                await notify_vendor_auto_cancelled_order(
                    db=db,
                    vendor_id=order.vendor_id,
                    order_id=assignment.order_id,
                    penalty_amount=0
                )

            except Exception as e:
                print(f"Failed to process penalty for fleet owner {vehicle_owner_id}: {str(e)}")
                # Continue with cancellation even if the penalty fails

            # Update assignment status - this vendor's claim is revoked either way
            assignment.assignment_status = AssignmentStatusEnum.CANCELLED
            assignment.cancelled_at = now
            # Order.cancelled_by stays null in the repost branch below (the
            # order lives on for other owners) - record the real reason here
            # instead, on the assignment itself, so this owner's Executed
            # tab can still show "Unallocated" instead of a generic Cancelled.
            assignment.cancel_reason = "AUTO_CANCELLED"
            assignment.cancel_note = "No driver & car were assigned in time - penalty applied"
            release_vendor_payout_hold_for_order(db, order, f"Driver payout hold released - order {order.id} assignment auto-cancelled")

            # Repost instead of killing the booking outright, as long as
            # there's still real time before pickup for another vendor to
            # take it (a 5-minute floor - reposting a booking whose pickup
            # is already imminent/past would just create a booking nobody
            # can fulfil). trip_status is deliberately left as "PENDING" -
            # create_order_assignment already allows a fresh accept once the
            # old assignment is CANCELLED, it just needs a live deadline and
            # to be re-surfaced to other vendors.
            # `now` above is a naive datetime.utcnow() (matches the rest of
            # this function) - strip tzinfo from pickup_at too so the
            # comparison and the formula's internal math both stay naive.
            pickup_at = order.start_date_time
            if pickup_at is not None and pickup_at.tzinfo is not None:
                pickup_at = pickup_at.replace(tzinfo=None)
            can_repost = pickup_at is not None and pickup_at > now + timedelta(minutes=5)

            if can_repost:
                from app.crud.customer_booking_request import get_assignment_window_minutes
                fresh_minutes = get_assignment_window_minutes(
                    db, pickup_at, bool(getattr(order, "is_urgent", False)), accept_time=now
                )
                order.max_time_to_assign_order = order.created_at + timedelta(minutes=fresh_minutes)
                try:
                    from app.crud.notification import send_new_booking_notification_sync
                    from app.crud.orders import _new_booking_push_text
                    _dt = order.start_date_time
                    _fmt = format_pickup_time_ist(_dt)
                    _tt = order.trip_type.value if hasattr(order.trip_type, "value") else str(order.trip_type)
                    _t, _m = _new_booking_push_text(_tt, order.pickup_drop_location, _fmt, order.car_type, order.vendor_price or order.estimated_price or 0)
                    send_new_booking_notification_sync(
                        db,
                        f"🔁 Available again • {_t.replace('🚖 ', '')}",
                        _m,
                        ordered_city=order.pick_near_city,
                        order_id=order.id,
                    )
                except Exception as e:
                    print(f"Repost re-notify failed for order {order.id} (booking still reposted): {e}")
            else:
                order.trip_status = "CANCELLED"
                # Only set cancelled_by if the column exists (for backward compatibility)
                try:
                    order.cancelled_by = CancelledByEnum.AUTO_CANCELLED
                except AttributeError:
                    # Column doesn't exist yet, skip setting it
                    pass
                # Driver-posted booking that ran out of time with no
                # driver/car assigned - the poster needs to know it's dead.
                from app.crud.notification import notify_booking_poster
                notify_booking_poster(db, order, "Booking cancelled", f"Booking #{order.id} was auto-cancelled because no driver and car were assigned in time.")
                from app.crud.wallet import release_poster_advance_hold
                release_poster_advance_hold(db, order, "auto-cancelled - no driver and car assigned in time")

            cancelled_count += 1
            
        except Exception as e:
            print(f"Error processing auto-cancellation for assignment {assignment.id}: {str(e)}")
            # Continue with other assignments even if one fails
            continue

    if cancelled_count:
        db.commit()

    return cancelled_count


async def cancel_expired_unaccepted_orders(db: Session) -> int:
    """Bookings NOBODY accepted: cancel them once their acceptance deadline
    passes (default: pickup time + 15 minutes) and alert the vendor with a
    high-priority notification. No money moves (nothing was held)."""
    from datetime import timezone as _tz
    from app.crud.notification import notify_vendor_booking_expired

    now = datetime.now(_tz.utc)
    cancelled = 0

    candidates = db.query(Order).filter(
        Order.trip_status == "PENDING",
        Order.start_date_time.isnot(None),
    ).all()

    for order in candidates:
        try:
            # Skip anything that has EVER been accepted (assignment exists)
            has_assignment = db.query(OrderAssignment).filter(
                OrderAssignment.order_id == order.id
            ).first()
            if has_assignment:
                continue

            if order.acceptance_deadline is not None:
                deadline = order.acceptance_deadline
                if deadline.tzinfo is None:
                    deadline = deadline.replace(tzinfo=_tz.utc)
            else:
                # Old rows with no deadline set: fall back to the legacy rule.
                start_at = order.start_date_time
                if start_at.tzinfo is None:
                    start_at = start_at.replace(tzinfo=_tz.utc)
                deadline = start_at + timedelta(minutes=15)
            if now < deadline:
                continue

            order.trip_status = "CANCELLED"
            try:
                from app.models.orders import CancelledByEnum
                order.cancelled_by = CancelledByEnum.AUTO_CANCELLED
            except Exception:
                pass
            try:
                from app.crud.wallet import release_poster_advance_hold
                release_poster_advance_hold(db, order, "expired - nobody accepted it")
            except Exception as e:
                print(f"poster advance release failed for order {order.id}: {e}")
            cancelled += 1
            db.commit()

            try:
                from app.crud.notification import notify_unaccepted_expired_booking
                await notify_unaccepted_expired_booking(db, order)
            except Exception as e:
                print(f"Expired-booking alarm notification failed for order {order.id}: {e}")
        except Exception as e:
            db.rollback()
            print(f"Unaccepted-expiry failed for order {order.id}: {e}")
            continue

    return cancelled


async def send_urgent_booking_reminders(db: Session) -> int:
    """Bookings nobody has accepted yet, closing in on their acceptance
    deadline: re-fire the new-booking push (capped at 3 times per booking)
    so drivers don't miss them right before they'd otherwise auto-cancel.
    Runs in the same sweep as cancel_expired_unaccepted_orders, one step
    earlier in the same deadline countdown."""
    from datetime import timezone as _tz
    from app.crud.notification import send_new_booking_notification_sync, send_new_booking_notification_to_driver_sync

    now = datetime.now(_tz.utc)
    window_end = now + timedelta(minutes=5)
    notified = 0

    candidates = db.query(Order).filter(
        Order.trip_status == "PENDING",
        Order.cancelled_by.is_(None),
        Order.acceptance_deadline.isnot(None),
        Order.urgent_notify_count < 3,
    ).all()

    for order in candidates:
        try:
            # Skip if cancelled or no longer pending
            if order.cancelled_by is not None or order.trip_status != "PENDING":
                continue

            has_assignment = db.query(OrderAssignment).filter(
                OrderAssignment.order_id == order.id,
                OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED
            ).first()
            if has_assignment:
                continue

            deadline = order.acceptance_deadline
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=_tz.utc)
            # Only the final approach to the deadline counts as "urgent" -
            # not the whole lifetime of the booking.
            if not (now < deadline <= window_end):
                continue

            trip_type_str = order.trip_type.value if hasattr(order.trip_type, 'value') else str(order.trip_type or 'Trip')
            from_city = (order.pick_near_city[0] if (order.pick_near_city and isinstance(order.pick_near_city, list) and len(order.pick_near_city) > 0 and order.pick_near_city[0] != 'ALL') else (order.pickup_drop_location.get('0', '') if isinstance(order.pickup_drop_location, dict) else '')) or "your area"
            formatted_time = format_pickup_time_ist(order.start_date_time)
            total_price = order.vendor_price or order.estimated_price or 0

            minutes_left = max(1, int((deadline - now).total_seconds() // 60))
            from app.crud.orders import _new_booking_push_text
            _t, _m = _new_booking_push_text(trip_type_str, order.pickup_drop_location, formatted_time, order.car_type, total_price, from_city)
            title = f"⏰ {minutes_left}m left • {_t.replace('🚖 ', '')}"
            message = _m + "\n⏳ Accept before it auto-cancels!"

            if order.target_driver_id:
                send_new_booking_notification_to_driver_sync(db, title, message, str(order.target_driver_id), order_id=order.id)
            else:
                send_new_booking_notification_sync(db, title, message, order.pick_near_city or ["ALL"], order_id=order.id)

            order.urgent_notify_count = (order.urgent_notify_count or 0) + 1
            notified += 1
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Urgent-reminder failed for order {order.id}: {e}")
            continue

    return notified


async def complete_no_start_assignments(db: Session) -> int:
    """Driver assigned but never started the trip: 24h after pickup time the
    booking is marked COMPLETED and the owner's held commission+extras are
    kept (split vendor/admin), per platform policy. Returns count processed."""
    from datetime import timezone as _tz
    from app.crud.wallet import get_trip_hold
    from app.crud.admin_wallet import credit_admin_wallet
    from app.models.admin import Admin

    admin = db.query(Admin).first()
    admin_id = str(admin.id) if admin else None

    now = datetime.now(_tz.utc)
    processed = 0

    stale = (
        db.query(OrderAssignment)
        .join(Order, Order.id == OrderAssignment.order_id)
        .filter(
            OrderAssignment.assignment_status == AssignmentStatusEnum.ASSIGNED,
            OrderAssignment.driver_id.isnot(None),
            Order.trip_status == "PENDING",
            Order.start_date_time.isnot(None),
        )
        .all()
    )

    for assignment in stale:
        try:
            order = db.query(Order).filter(Order.id == assignment.order_id).first()
            if not order or order.start_date_time is None:
                continue
            start_at = order.start_date_time
            if start_at.tzinfo is None:
                start_at = start_at.replace(tzinfo=_tz.utc)
            if now - start_at < timedelta(hours=24):
                continue
            # Trip actually started? Then leave it alone.
            if db.query(EndRecord).filter(EndRecord.order_id == order.id).first():
                continue

            order.trip_status = "COMPLETED"
            assignment.assignment_status = AssignmentStatusEnum.COMPLETED
            assignment.completed_at = now

            # Owner's hold is kept; split between vendor and admin
            owner_id = str(assignment.vehicle_owner_id)
            hold = get_trip_hold(db, order.id, owner_id)
            if hold > 0:
                if order.source == "NEW_ORDERS":
                    dnew = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
                    pct = (dnew.platform_fees_percent or 0) if dnew else (order.platform_fees_percent or 0)
                else:
                    pct = order.platform_fees_percent or 0
                admin_share = math.ceil(hold * pct / 100)
                vendor_share = hold - admin_share
                if vendor_share > 0:
                    credit_vendor_wallet(
                        db=db,
                        vendor_id=order.vendor_id,
                        amount=vendor_share,
                        order_id=order.id,
                        notes=f"Booking {order.id}: driver never started trip (owner charges kept)",
                    )
                if admin_share > 0 and admin_id:
                    credit_admin_wallet(
                        db=db,
                        admin_id=admin_id,
                        amount=admin_share,
                        order_id=order.id,
                        notes=f"Penalty: booking {order.id} not started within 24h of pickup",
                    )
            processed += 1
        except Exception as e:
            print(f"No-start completion failed for assignment {assignment.id}: {e}")
            continue

    if processed:
        db.commit()
    return processed


def get_order_assignment_by_id(db: Session, assignment_id: int) -> Optional[OrderAssignment]:
    """Get order assignment by ID or fallback to order_id lookup"""
    assignment = db.query(OrderAssignment).filter(OrderAssignment.id == assignment_id).first()
    if not assignment:
        assignment = db.query(OrderAssignment).filter(
            OrderAssignment.order_id == assignment_id
        ).order_by(desc(OrderAssignment.created_at)).first()
    return assignment


def get_order_assignments_by_vehicle_owner_id(db: Session, vehicle_owner_id: str):
    """Get ALL assignments for a fleet owner (any status) - matches the
    endpoint's name/docstring. Was silently filtered to ASSIGNED/PENDING
    only, hiding completed/cancelled assignments from an 'all' listing."""

    response = []

    order_assignments = db.query(OrderAssignment).filter(
        OrderAssignment.vehicle_owner_id == vehicle_owner_id
    ).order_by(desc(OrderAssignment.created_at)).all()

    for assignment in order_assignments:
        order = db.query(Order).filter(Order.id == assignment.order_id).first()

        charges_to_deduct = 0
        if order:
            if order.source == OrderSourceEnum.NEW_ORDERS:
                new_order = db.query(NewOrder).filter(
                    NewOrder.order_id == order.source_order_id
                ).first()

                charges_to_deduct = (
                    round(
                        (order.vendor_price - order.estimated_price)
                        + ((new_order.cost_per_km * new_order.trip_distance) * 10 / 100)
                    )
                    if new_order else 0
                )

            elif order.source == OrderSourceEnum.HOURLY_RENTAL:
                charges_to_deduct = int(order.vendor_price - order.estimated_price)

        response.append({
            "id" : assignment.id,
            "order_id": assignment.order_id,
            "vehicle_owner_id": assignment.vehicle_owner_id,
            "driver_id": assignment.driver_id,
            "car_id": assignment.car_id,
            "assignment_status": assignment.assignment_status,
            "assigned_at": assignment.assigned_at,
            "expires_at": assignment.expires_at,
            "cancelled_at": assignment.cancelled_at,
            "completed_at": assignment.completed_at,
            "created_at": assignment.created_at,
            "charges_to_deduct": charges_to_deduct
        })

    return response

    


def get_order_assignments_by_order_id(db: Session, order_id: int) -> List[OrderAssignment]:
    """Get all order assignments for a specific order"""
    return db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id
    ).order_by(desc(OrderAssignment.created_at)).all()


def update_assignment_status(
    db: Session, 
    assignment_id: int, 
    new_status: AssignmentStatusEnum
) -> Optional[OrderAssignment]:
    """Update assignment status and related timestamps"""
    assignment = get_order_assignment_by_id(db, assignment_id)
    if not assignment:
        return None
    
    assignment.assignment_status = new_status
    
    # Update timestamps based on status
    if new_status == AssignmentStatusEnum.ASSIGNED:
        assignment.assigned_at = datetime.utcnow()
    elif new_status == AssignmentStatusEnum.CANCELLED:
        assignment.cancelled_at = datetime.utcnow()
    elif new_status == AssignmentStatusEnum.COMPLETED:
        assignment.completed_at = datetime.utcnow()
    
    db.commit()
    db.refresh(assignment)
    return assignment


def cancel_assignment(db: Session, assignment_id: int) -> Optional[OrderAssignment]:
    """Cancel an assignment (fleet-owner-initiated, pre-trip - the caller
    (cancel_assignment_endpoint) already routes an in-progress/DRIVING
    assignment through apply_driving_cancellation_penalty instead, so by
    the time control reaches here the trip never started).

    This used to be a bare status flip with no wallet or order-status
    side effects at all - meaning a cancelled assignment left Order.trip_status
    stuck at PENDING (so the order looked live even though its assignment
    was CANCELLED), never refunded the owner's own TRIP_HOLD, and never
    released the vendor's DRIVER_PAYOUT_HOLD (real money stuck debited
    from the vendor's wallet forever, since it's otherwise only ever paid
    out at trip completion - see end_records.py). Mirrors the same refund/
    release logic cancel_order_by_vendor already does correctly.
    """
    assignment = update_assignment_status(db, assignment_id, AssignmentStatusEnum.CANCELLED)
    if not assignment:
        return None

    order = db.query(Order).filter(Order.id == assignment.order_id).first()
    if order and order.trip_status != "CANCELLED":
        order.trip_status = "CANCELLED"
        # No CancelledByEnum value fits "the fleet owner cancelled their own
        # accepted assignment" (VENDOR/CUSTOMER/ADMIN/AUTO don't apply) -
        # leave cancelled_by unset rather than mislabel who cancelled it.
        db.add(order)

    owner_id = str(assignment.vehicle_owner_id)
    order_id = assignment.order_id

    # Fleet owner initiated assignment cancellation:
    # Forfeit the held commission amount (minimum ₹500 floor) as penalty, never refund.
    try:
        from app.crud.wallet import get_trip_hold, debit_wallet_allow_negative
        from app.crud.admin_wallet import credit_admin_wallet
        from app.models.admin import Admin
        from app.models.wallet_ledger import WalletLedger

        hold = (assignment.held_amount or 0) if hasattr(assignment, 'held_amount') and assignment.held_amount else get_trip_hold(db, order_id, owner_id)
        penalty_amount = max(hold, 500)
        shortfall = penalty_amount - hold

        if shortfall > 0:
            debit_wallet_allow_negative(
                db,
                vehicle_owner_id=owner_id,
                amount=shortfall,
                reference_id=str(order_id),
                reference_type="ASSIGNMENT_CANCEL_PENALTY",
                notes=f"Penalty: assignment {assignment_id} cancelled by owner (hold {hold} short of {penalty_amount})",
            )

        hold_entry = db.query(WalletLedger).filter(
            WalletLedger.vehicle_owner_id == owner_id,
            WalletLedger.reference_id == str(order_id),
            WalletLedger.reference_type == "TRIP_HOLD",
        ).first()
        if hold_entry:
            hold_entry.notes = (
                f"Assignment {assignment_id} cancelled by owner - held commission amount of "
                f"₹{hold} forfeited as cancellation penalty"
            )
            db.add(hold_entry)

        admin = db.query(Admin).first()
        if admin:
            credit_admin_wallet(
                db=db,
                admin_id=str(admin.id),
                amount=penalty_amount,
                order_id=order_id,
                notes=f"Penalty: assignment {assignment_id} cancelled by fleet owner",
            )
    except Exception as e:
        print(f"Hold forfeiture failed for assignment {assignment_id}: {e}")

    if order and order.vendor_id:
        try:
            from app.crud.vendor_wallet import release_driver_payout_hold
            release_driver_payout_hold(
                db,
                vendor_id=str(order.vendor_id),
                order_id=order_id,
                notes=f"Driver payout hold released - assignment {assignment_id} cancelled",
            )
        except Exception as e:
            print(f"Driver payout hold release failed for assignment {assignment_id}: {e}")

    db.commit()
    db.refresh(assignment)
    return assignment


def complete_assignment(db: Session, assignment_id: int) -> Optional[OrderAssignment]:
    """Complete an assignment"""
    return update_assignment_status(db, assignment_id, AssignmentStatusEnum.COMPLETED)


def get_vendor_orders_with_assignments(db: Session, vendor_id: str) -> List[dict]:
    """Get all orders for a vendor with their latest assignment details"""
    # Get all orders for the vendor
    print("vendor_id......", vendor_id)
    orders = db.query(Order).filter(Order.vendor_id == vendor_id).all()
    
    result = []
    for order in orders:
        # Get the latest assignment for this order
        latest_assignment = db.query(OrderAssignment).filter(
            OrderAssignment.order_id == order.id
        ).order_by(desc(OrderAssignment.created_at)).first()
        
        if latest_assignment:
            # Combine order and assignment data
            order_data = {
                # Order assignment details
                "id": latest_assignment.id,
                "order_id": latest_assignment.order_id,
                "vehicle_owner_id": latest_assignment.vehicle_owner_id,
                "driver_id": latest_assignment.driver_id,
                "car_id": latest_assignment.car_id,
                "assignment_status": latest_assignment.assignment_status,
                "assigned_at": latest_assignment.assigned_at,
                "expires_at": latest_assignment.expires_at,
                "cancelled_at": latest_assignment.cancelled_at,
                "completed_at": latest_assignment.completed_at,
                "created_at": latest_assignment.created_at,
                
                # Order details
                "vendor_id": order.vendor_id,
                "trip_type": order.trip_type.value,
                "car_type": order.car_type.value,
                "pickup_drop_location": order.pickup_drop_location,
                "start_date_time": order.start_date_time,
                "customer_name": order.customer_name,
                "customer_number": order.customer_number,
                "cost_per_km": order.cost_per_km,
                "extra_cost_per_km": order.extra_cost_per_km,
                "driver_allowance": order.driver_allowance,
                "extra_driver_allowance": order.extra_driver_allowance,
                "permit_charges": order.permit_charges,
                "extra_permit_charges": order.extra_permit_charges,
                "hill_charges": order.hill_charges,
                "toll_charges": order.toll_charges,
                "pickup_notes": order.pickup_notes,
                "trip_status": order.trip_status,
                "pick_near_city": ",".join(order.pick_near_city) if isinstance(order.pick_near_city, list) else order.pick_near_city,
                "trip_distance": order.trip_distance,
                "trip_time": order.trip_time,
                "platform_fees_percent": order.platform_fees_percent,
                "estimated_price": order.estimated_price,
                "vendor_price": order.vendor_price,
                "order_created_at": order.created_at
            }
            result.append(order_data)
    
    return result


def get_pending_orders_for_vehicle_owner(db: Session, vehicle_owner_id: str) -> List[dict]:
    """
    Get pending orders for a fleet owner based on business rules:
    1. Orders that are not in assignment table (never assigned)
    2. Orders that are cancelled in assignment table (latest assignment status is CANCELLED)
    3. Orders with trip_status != "CANCELLED" (exclude cancelled orders)
    
    Business Logic:
    - Compare orders table with order_assignments table
    - For each order, get the latest assignment record (most recent created_at)
    - If no assignment exists, order is available
    - If latest assignment is CANCELLED, order is available for reassignment
    - If latest assignment is active (PENDING, ASSIGNED, COMPLETED, DRIVING), order is not available
    """
    from sqlalchemy import and_, or_, not_, desc
    from app.models.customer_details import CustomerDetails
    from datetime import datetime, timezone

    def _is_premium_subscriber(customer_number: Optional[str]) -> bool:
        """Active-subscription check for the priority-dispatch sort below.
        Computed here (with `order` still in scope) rather than from the
        response dict, since the dict never carries a raw customer_number -
        this endpoint lists still-unassigned orders, and unlike the
        already-established get_masked_customer_number() gating elsewhere
        in this file, exposing the customer's number before a vehicle
        owner even sees/accepts the order isn't something to introduce
        here just to power a sort."""
        c_num = str(customer_number or "").strip()
        if not c_num:
            return False
        # Was also OR'd against CustomerDetails.customer_id (a UUID column)
        # - c_num here is always a phone number (this function's only
        # caller passes order.customer_number), never a UUID, so that side
        # made Postgres try to cast a phone number string to uuid on EVERY
        # row and crash with psycopg2.errors.InvalidTextRepresentation,
        # 500ing the whole "pending orders for this fleet owner" list.
        # Found live 2026-09-05 - a copy-paste leftover with no correct use
        # here, not a real lookup path (nothing ever passes a customer_id
        # into this helper).
        c_det = db.query(CustomerDetails).filter(
            CustomerDetails.primary_number == c_num
        ).first()
        if not c_det or c_det.subscription_tier not in ("MONTHLY", "YEARLY"):
            return False
        return bool(c_det.subscription_expires_at and c_det.subscription_expires_at > datetime.now(timezone.utc))

    # Get all orders excluding cancelled ones
    all_orders = db.query(Order).filter(Order.trip_status == "PENDING").all()
    pending_orders = []

    for order in all_orders:
        # A booking you posted (Driver App "Create Booking") is for ANOTHER
        # driver - it lives in your My Trips, not in your own pool of
        # bookings to accept (accept_order also refuses it).
        if order.posted_by_vehicle_owner_id is not None and str(order.posted_by_vehicle_owner_id) == str(vehicle_owner_id):
            continue

        # Get the latest assignment for this order (most recent created_at)
        # This ensures we compare with the most recent assignment status
        latest_assignment = db.query(OrderAssignment).filter(
            OrderAssignment.order_id == order.id
        ).order_by(desc(OrderAssignment.created_at)).first()

        if not latest_assignment:
            if order.source == OrderSourceEnum.NEW_ORDERS:
                new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
                
                if not new_order:
                    continue  # Skip if new_order not found

                # Vendor-less bookings (driver-posted / website / admin): what the driver will actually earn and
                # the exact wallet amount that gets held, from the same maths trip close uses.
                _split = None
                if True:  # every non-hourly booking, vendor or not
                    try:
                        from app.utils.commission import estimate_split_for_order, expected_hold
                        _split = estimate_split_for_order(db, order)
                        _hold_required = expected_hold(_split, int(order.advance_received or 0))
                    except Exception as _e:
                        print(f"estimate_split_for_order failed for order {order.id}: {_e}")
                        _split = None

                pending_orders.append({
                    "order_id": order.id,
                    "trip_status": order.trip_status,
                    # Order details

                    "trip_type": order.trip_type if order.trip_type else "Unknown",
                    "car_type": order.car_type if order.car_type else "Unknown",
                    "pickup_drop_location": order.pickup_drop_location or {},
                    "start_date_time": order.start_date_time,
                    "pick_near_city": (",".join(order.pick_near_city) if isinstance(order.pick_near_city, list) else order.pick_near_city) or "Unknown",
                    "trip_distance": order.trip_distance,
                    "trip_time": order.trip_time or "Unknown",
                    "estimated_price": order.estimated_price,
                    "toll_charge_update":order.toll_charge_update,
                    "max_time_to_assign_order": order.max_time_to_assign_order,
                    "pickup_notes": new_order.pickup_notes if new_order else None,
                    "created_at": order.created_at,
                    "charges_to_deduct" : max(500, (_hold_required if _split else (round((order.vendor_price-order.estimated_price)+((new_order.cost_per_km*new_order.trip_distance)*10/100)) if new_order else 0))),
                    "commission_class": _split["commission_class"] if _split else None,
                    "driver_net": _split["driver_net"] if _split else None,
                    "platform_fee": _split["platform_fee"] if _split else None,
                    "poster_cc": _split["poster_cc"] if _split else None,
                    "platform_fee_pct": _split["fee_pct"] if _split else None,
                    "advance_received": order.advance_received,
                    # Driver-side fare breakdown (shown BEFORE accepting)
                    "cost_per_km": (new_order.cost_per_km or 0) if new_order else 0,
                    "driver_allowance": (new_order.driver_allowance or 0) if new_order else 0,
                    "permit_charges": (new_order.permit_charges or 0) if new_order else 0,
                    "hill_charges": (new_order.hill_charges or 0) if new_order else 0,
                    "toll_charges": (new_order.toll_charges or 0) if new_order else 0,
                    "location_links": (new_order.location_links or {}) if new_order else {},
                    "car_make_year_requirement": order.car_make_year_requirement,
                    "carrier_required": order.carrier_required or False,
                    "priority_for_paid": order.priority_for_paid if order.priority_for_paid is not None else True,
                    "priority_cutoff_at": order.priority_cutoff_at,
                    "fare_type": order.fare_type.value if order.fare_type else "ITEMIZED",
                    "charge_items": order.charge_items,
                    "is_premium_subscriber_order": _is_premium_subscriber(order.customer_number),
                })
            elif order.source == OrderSourceEnum.HOURLY_RENTAL:
                hourly_order = db.query(HourlyRental).filter(HourlyRental.id == order.source_order_id).first()
                
                if not hourly_order:
                    continue  # Skip if hourly_order not found
                
                pending_orders.append({
                    "order_id": order.id,
                    "trip_status": order.trip_status,
                    # Order details

                    "trip_type": order.trip_type if order.trip_type else "Unknown",
                    "car_type": order.car_type if order.car_type else "Unknown",
                    "pickup_drop_location": order.pickup_drop_location or {},
                    "start_date_time": order.start_date_time,
                    "pick_near_city": (",".join(order.pick_near_city) if isinstance(order.pick_near_city, list) else order.pick_near_city) or "Unknown",
                    "trip_distance": hourly_order.package_hours["km_range"],
                    "trip_time": str(hourly_order.package_hours["hours"])+" hours" or "Unknown",
                    "estimated_price": order.estimated_price,
                    "toll_charge_update":order.toll_charge_update,
                    "max_time_to_assign_order": order.max_time_to_assign_order,
                    "pickup_notes": hourly_order.pickup_notes,
                    "created_at": order.created_at,
                    "charges_to_deduct" : max(500, int(order.vendor_price - order.estimated_price)),
                    "package" : hourly_order.package_hours,
                    "cost_for_addon_km":hourly_order.cost_for_addon_km,
                    "location_links": order.location_links or {},
                    "car_make_year_requirement": order.car_make_year_requirement,
                    "carrier_required": order.carrier_required or False,
                    "priority_for_paid": order.priority_for_paid if order.priority_for_paid is not None else True,
                    "priority_cutoff_at": order.priority_cutoff_at,
                    "fare_type": order.fare_type.value if order.fare_type else "ITEMIZED",
                    "charge_items": order.charge_items,
                    "is_premium_subscriber_order": _is_premium_subscriber(order.customer_number),
                })

    def _is_driver_subscribed(v_owner_id: str) -> bool:
        from app.models.car_driver import CarDriver
        from app.models.vehicle_owner_details import VehicleOwnerDetails
        driver = db.query(CarDriver).filter(
            (CarDriver.id == v_owner_id) | (CarDriver.vehicle_owner_id == v_owner_id)
        ).first()
        if driver and driver.subscription_tier in ("MONTHLY", "YEARLY"):
            if not driver.subscription_expires_at or driver.subscription_expires_at > datetime.now(timezone.utc):
                return True
        # This feed is fetched with a fleet-owner id - also check the Fleet
        # Owner's own subscription (VehicleOwnerDetails.subscription_type,
        # the pre-existing Monthly/Yearly field - not the same column as
        # CarDriver.subscription_tier above, don't conflate the two).
        vo_details = db.query(VehicleOwnerDetails).filter(
            VehicleOwnerDetails.vehicle_owner_id == v_owner_id
        ).first()
        if vo_details and vo_details.subscription_type in ("MONTHLY", "YEARLY"):
            return True
        return False

    is_driver_sub = _is_driver_subscribed(vehicle_owner_id)

    # Priority dispatch sorting: Subscribed drivers get priority visibility on high-value trips & subscriber requests
    if is_driver_sub:
        pending_orders.sort(
            key=lambda o: (
                0 if (o.get("is_premium_subscriber_order") or o.get("estimated_price", 0) >= 1500) else 1,
                -o.get("estimated_price", 0)
            )
        )
    else:
        pending_orders.sort(key=lambda o: (0 if o.get("is_premium_subscriber_order") else 1))

    return pending_orders

def update_assignment_car_driver(
    db: Session, 
    assignment_id: int, 
    driver_id: str, 
    car_id: str
) -> Optional[OrderAssignment]:
    """Update assignment with driver and car"""
    assignment = get_order_assignment_by_id(db, assignment_id)
    if not assignment:
        return None
    if assignment.assignment_status == AssignmentStatusEnum.CANCELLED:
        raise ValueError("Sorry, You Can't make the Assignment The Order is Already Cancelled, Check the Trip History to know the reason")
    assignment.driver_id = driver_id
    assignment.car_id = car_id
    assignment.assignment_status = AssignmentStatusEnum.ASSIGNED
    assignment.assigned_at = datetime.utcnow()
    
    db.commit()
    db.refresh(assignment)
    return assignment

def get_driver_assigned_orders(db: Session, driver_id: str) -> List[dict]:
    """Get all ASSIGNED orders for a specific driver"""
    from sqlalchemy import or_, cast, String
    import uuid
    driver_uuid = None
    try:
        driver_uuid = uuid.UUID(str(driver_id))
    except Exception:
        pass

    driver_filter = (
        or_(
            OrderAssignment.driver_id == driver_uuid,
            cast(OrderAssignment.driver_id, String) == str(driver_id)
        )
        if driver_uuid is not None
        else cast(OrderAssignment.driver_id, String) == str(driver_id)
    )

    assignments = db.query(OrderAssignment).filter(
        driver_filter,
        OrderAssignment.assignment_status.in_([AssignmentStatusEnum.ASSIGNED, AssignmentStatusEnum.DRIVING])
    ).order_by(desc(OrderAssignment.assigned_at)).all()

    result = []
    for assignment in assignments:
        # Get order details
        order = db.query(Order).filter(Order.id == assignment.order_id).first()
        if not order:
            continue
        # Skip cancelled/expired orders: the parent order can be cancelled
        # (auto-cancel or vendor cancel) while the assignment row still says
        # ASSIGNED - those must not appear as startable trips for the driver.
        if order.trip_status in (Trip_status.CANCELLED, Trip_status.COMPLETED):
            continue
        # Also hide stale trips that never started: pickup time passed more
        # than 24h ago and the driver hasn't begun driving. Late starts within
        # a day stay visible.
        if (
            assignment.assignment_status == AssignmentStatusEnum.ASSIGNED
            and order.start_date_time is not None
        ):
            from datetime import datetime, timedelta, timezone
            start_at = order.start_date_time
            if start_at.tzinfo is None:
                start_at = start_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - start_at > timedelta(hours=24):
                continue
        # No vendor on a self-sourced/driver-created or admin-posted
        # vendor-less booking (order.vendor_id is None) - don't crash the
        # whole list over one such row, just show there's no vendor to reach.
        vendor_detail_show = db.query(VendorDetails).filter(VendorDetails.vendor_id == order.vendor_id).first() if order.vendor_id else None

        # Driver-side fare breakdown: the duty driver collects cash from the
        # customer directly, so they need their OWN itemized charges (not the
        # vendor's price). These live on the source order, not on Order itself.
        cost_per_km = driver_allowance = permit_charges = hill_charges = toll_charges = 0
        if order.source == OrderSourceEnum.NEW_ORDERS:
            new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
            if new_order:
                cost_per_km = new_order.cost_per_km or 0
                driver_allowance = new_order.driver_allowance or 0
                permit_charges = new_order.permit_charges or 0
                hill_charges = new_order.hill_charges or 0
                toll_charges = new_order.toll_charges or 0
        elif order.source == OrderSourceEnum.HOURLY_RENTAL:
            hourly_order = db.query(HourlyRental).filter(HourlyRental.id == order.source_order_id).first()
            if hourly_order:
                cost_per_km = hourly_order.cost_for_addon_km or 0

        if order:
            from app.models.car_driver import CarDriver
            from app.models.car_details import CarDetails
            assigned_driver = db.query(CarDriver).filter(CarDriver.id == assignment.driver_id).first() if assignment.driver_id else None
            assigned_car = db.query(CarDetails).filter(CarDetails.id == assignment.car_id).first() if assignment.car_id else None

            result.append({
                "id": assignment.id,
                "order_id": assignment.order_id,
                "assignment_status": assignment.assignment_status,
                "customer_name": order.customer_name,
                # Masked until phone_reveal_hours_before_pickup - see
                # get_masked_customer_number's docstring (urgent bookings
                # always reveal immediately). The driver can still reach the
                # customer via the vendor's number below in the meantime.
                "customer_number": get_masked_customer_number(db, order),
                "vendor_name" : (vendor_detail_show.business_name or vendor_detail_show.full_name) if vendor_detail_show else "Self-Sourced Booking (No Vendor)",
                "vendor_primary_number" : vendor_detail_show.primary_number if vendor_detail_show else None,
                "vendor_secondary_number" : vendor_detail_show.secondary_number if vendor_detail_show else None,
                "pickup_drop_location": order.pickup_drop_location,
                "start_date_time": order.start_date_time,
                "trip_type": order.trip_type.value if order.trip_type else "Unknown",
                "car_type": order.car_type.value if order.car_type else "Unknown",
                "trip_time": order.trip_time,
                "trip_distance": order.trip_distance,
                "estimated_price": order.estimated_price,
                "toll_charge_update": order.toll_charge_update,
                "data_visibility_vehicle_owner": order.data_visibility_vehicle_owner,
                **collect_fields_for_order(db, order),
                "closed_vendor_price": order.closed_vendor_price,
                "night_charges": order.night_charges,
                "waiting_time": order.waiting_time,
                "assigned_at": assignment.assigned_at,
                "created_at": assignment.created_at,
                "cost_per_km": cost_per_km,
                "driver_allowance": driver_allowance,
                "permit_charges": permit_charges,
                "hill_charges": hill_charges,
                "toll_charges": toll_charges,
                "location_links": order.location_links or {},
                "advance_received": order.advance_received,
                "fare_type": order.fare_type.value if order.fare_type else "ITEMIZED",
                "charge_items": order.charge_items,
                "otp_required": bool(assignment.start_trip_otp),
                "commission_waived": bool(getattr(order, "commission_waived", False)),
                "driver_name": assigned_driver.full_name if assigned_driver else None,
                "driver_phone": assigned_driver.primary_number if assigned_driver else None,
                "car_name": assigned_car.car_name if assigned_car else None,
                "car_number": assigned_car.car_number if assigned_car else None,
                "assigned_driver_name": assigned_driver.full_name if assigned_driver else None,
                "assigned_driver_phone": assigned_driver.primary_number if assigned_driver else None,
                "assigned_car_name": assigned_car.car_name if assigned_car else None,
                "assigned_car_number": assigned_car.car_number if assigned_car else None,
            })

    return result

def get_driver_assigned_orders_completed_trip(db: Session, driver_id: str) -> List[dict]:
    """Get all ASSIGNED orders for a specific driver"""
    assignments = db.query(OrderAssignment).filter(
        OrderAssignment.driver_id == driver_id,
        # OrderAssignment.assignment_status == AssignmentStatusEnum.ASSIGNED
        OrderAssignment.assignment_status.in_([AssignmentStatusEnum.COMPLETED])
    ).order_by(desc(OrderAssignment.assigned_at)).all()
    
    result = []
    for assignment in assignments:
        # Get order details
        order = db.query(Order).filter(Order.id == assignment.order_id).first()
        vendor_detail_show = db.query(VendorDetails).filter(VendorDetails.vendor_id == order.vendor_id).first() if order.vendor_id else None

        cost_per_km = driver_allowance = permit_charges = hill_charges = toll_charges = 0
        if order.source == OrderSourceEnum.NEW_ORDERS:
            new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
            if new_order:
                cost_per_km = new_order.cost_per_km or 0
                driver_allowance = new_order.driver_allowance or 0
                permit_charges = new_order.permit_charges or 0
                hill_charges = new_order.hill_charges or 0
                toll_charges = new_order.toll_charges or 0
        elif order.source == OrderSourceEnum.HOURLY_RENTAL:
            hourly_order = db.query(HourlyRental).filter(HourlyRental.id == order.source_order_id).first()
            if hourly_order:
                cost_per_km = hourly_order.cost_for_addon_km or 0

        if order:
            result.append({
                "id": assignment.id,
                "order_id": assignment.order_id,
                "assignment_status": assignment.assignment_status,
                "customer_name": order.customer_name,
                # Trip is already COMPLETED (see the query filter above) -
                # no reveal-timing concern here, unlike the active-bookings
                # listing above.
                "customer_number": order.customer_number,
                "vendor_name" : (vendor_detail_show.business_name or vendor_detail_show.full_name) if vendor_detail_show else "Self-Sourced Booking (No Vendor)",
                "vendor_primary_number" : vendor_detail_show.primary_number if vendor_detail_show else None,
                "vendor_secondary_number" : vendor_detail_show.secondary_number if vendor_detail_show else None,
                "pickup_drop_location": order.pickup_drop_location,
                "start_date_time": order.start_date_time,
                "trip_type": order.trip_type.value if order.trip_type else "Unknown",
                "car_type": order.car_type.value if order.car_type else "Unknown",
                "trip_time": order.trip_time,
                "trip_distance": order.trip_distance,
                "estimated_price": order.estimated_price,
                "toll_charge_update": order.toll_charge_update,
                "data_visibility_vehicle_owner": order.data_visibility_vehicle_owner,
                **collect_fields_for_order(db, order),
                "closed_vendor_price": order.vendor_price,
                "night_charges": order.night_charges,
                "waiting_time": order.waiting_time,
                "assigned_at": assignment.assigned_at,
                "created_at": assignment.created_at,
                "cost_per_km": cost_per_km,
                "driver_allowance": driver_allowance,
                "permit_charges": permit_charges,
                "hill_charges": hill_charges,
                "toll_charges": toll_charges,
                "commission_waived": bool(getattr(order, "commission_waived", False)),
            })

    return result

def get_driver_assigned_orders_report(db: Session, driver_id: str, order_id : int) -> List[dict]:
    """Get all ASSIGNED orders for a specific driver"""
    assignment = db.query(OrderAssignment).filter(
        OrderAssignment.driver_id == driver_id,
        # OrderAssignment.assignment_status == AssignmentStatusEnum.ASSIGNED
        OrderAssignment.order_id == order_id,
        OrderAssignment.assignment_status.in_([AssignmentStatusEnum.COMPLETED])
    ).order_by(desc(OrderAssignment.assigned_at)).first()
    
    result = []
    order = db.query(Order).filter(Order.id == order_id,).first()
    vendor_detail_show = db.query(VendorDetails).filter(VendorDetails.vendor_id == order.vendor_id).first() if order and order.vendor_id else None
    if order and assignment:
        if order and order.source == OrderSourceEnum.HOURLY_RENTAL:
            print(order.source)
            hourly_rental = db.query(HourlyRental).filter(HourlyRental.id == order.source_order_id).first()
            end_records = db.query(EndRecord).filter(EndRecord.order_id == order.id).first()
            total_km = end_records.end_km - end_records.start_km if end_records else 0
            if hourly_rental:
                print("working hourly")
                result.append({
                    # "id": assignment.id,
                    #Assignment details
                    "order_id": assignment.order_id,
                    "trip_status": assignment.assignment_status,
                    
                    #Order details
                    "customer_name": order.customer_name,
                    "customer_number": order.customer_number,
                    "pickup_drop_location": order.pickup_drop_location,
                    "start_date_time": order.start_date_time,
                    "trip_type": order.trip_type if order.trip_type else "Unknown",
                    "car_type": order.car_type if order.car_type else "Unknown",
                    "trip_time": order.trip_time,
                    "total_km": total_km if total_km > 0 else 0,
                    "toll_charges": order.updated_toll_charges if order.updated_toll_charges else new_order.toll_charges,

                    "updated_toll_charge": order.updated_toll_charges,
                    "customer_price": order.closed_vendor_price,
                    "vendor_name" : (vendor_detail_show.business_name or vendor_detail_show.full_name) if vendor_detail_show else "Self-Sourced Booking (No Vendor)",
                    "vendor_primary_number" : vendor_detail_show.primary_number if vendor_detail_show else None,
                    "vendor_secondary_number" : vendor_detail_show.secondary_number if vendor_detail_show else None,
                    
                    
                    #Hourly Rental details
                    "package_hours": hourly_rental.package_hours,
                    "cost_per_hour": hourly_rental.cost_per_hour + hourly_rental.extra_cost_per_hour,
                    "cost_per_km": hourly_rental.cost_for_addon_km + hourly_rental.extra_cost_for_addon_km,
        

                    "assigned_at": assignment.assigned_at,
                    "created_at": assignment.created_at,
                    "completed_at": assignment.completed_at
                })
        else:
            new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
            
            if not new_order:
                raise HTTPException(status_code=404, detail="NewOrder not found for this order")
            
            end_records = db.query(EndRecord).filter(EndRecord.order_id == order.id).first()
            total_km = end_records.end_km - end_records.start_km if end_records else 0
            result.append({
                # "id": assignment.id,
                #Assignment details
                "order_id": assignment.order_id,
                "trip_status": assignment.assignment_status,
                
                #Order details
                "customer_name": order.customer_name,
                "customer_number": order.customer_number,
                "pickup_drop_location": order.pickup_drop_location,
                "start_date_time": order.start_date_time,
                "trip_type": order.trip_type if order.trip_type else "Unknown",
                "car_type": order.car_type if order.car_type else "Unknown",
                "trip_time": order.trip_time,
                "trip_distance": order.trip_distance if order.trip_distance else 0,
                "toll_charges": order.updated_toll_charges if order.updated_toll_charges else (new_order.toll_charges if new_order else 0),
                "customer_price": order.closed_vendor_price,
                "vendor_name" : (vendor_detail_show.business_name or vendor_detail_show.full_name) if vendor_detail_show else "Self-Sourced Booking (No Vendor)",
                "vendor_primary_number" : vendor_detail_show.primary_number if vendor_detail_show else None,
                "vendor_secondary_number" : vendor_detail_show.secondary_number if vendor_detail_show else None,
                #New Order details
                "cost_per_km": new_order.cost_per_km + new_order.extra_cost_per_km,
                "driver_allowance": new_order.driver_allowance + new_order.extra_driver_allowance,
                "permit_charges": new_order.permit_charges + new_order.extra_permit_charges,
                "hill_charges": new_order.hill_charges,
                "pickup_notes": new_order.pickup_notes,
                "updated_toll_charge": order.updated_toll_charges,
                "night_charges": order.night_charges,
                "waiting_time": order.waiting_time,
                "total_km": total_km if total_km > 0 else 0,
                "assigned_at": assignment.assigned_at,
                "created_at": order.created_at,
                "completed_at": assignment.completed_at
            })
                

        return result
    else:
        raise HTTPException(status_code=404, detail="Order not Found")

def check_vehicle_owner_balance(db: Session, vehicle_owner_id: str, required_amount: int) -> bool:
    """Check if fleet owner has sufficient balance"""
    from app.crud.wallet import get_owner_balance
    try:
        balance = get_owner_balance(db, vehicle_owner_id)
        return balance >= required_amount
    except:
        return False


def apply_driving_cancellation_penalty(db: Session, order: Order, assignment: OrderAssignment) -> dict:
    """Cancel a DRIVING assignment with a penalty: whatever is currently held
    for this booking (app/crud/wallet.py:get_trip_hold), or 500 rupees,
    whichever is more. The hold itself is forfeited (not refunded); if it's
    short of the 500 floor, the fleet owner's wallet is additionally debited
    (allowed to go negative) to make up the difference. The full penalty
    always goes to admin. Shared by both cancel routes - see
    app/api/routes/order_assignments.py (the vendor cancel-order route and
    the fleet-owner's generic assignment-cancel route). Does not commit -
    caller commits alongside its own changes."""
    from app.crud.wallet import get_trip_hold, debit_wallet_allow_negative
    from app.crud.admin_wallet import credit_admin_wallet
    from app.models.admin import Admin
    from app.models.orders import CancelledByEnum

    vehicle_owner_id = str(assignment.vehicle_owner_id)
    hold = get_trip_hold(db, order.id, vehicle_owner_id)
    penalty = max(hold, 500)
    shortfall = penalty - hold

    if shortfall > 0:
        debit_wallet_allow_negative(
            db,
            vehicle_owner_id=vehicle_owner_id,
            amount=shortfall,
            reference_id=str(order.id),
            reference_type="DRIVING_CANCELLATION_PENALTY",
            notes=f"Penalty top-up: booking {order.id} cancelled while trip was in progress (hold {hold} short of {penalty})",
        )

    admin = db.query(Admin).first()
    if admin:
        credit_admin_wallet(
            db,
            admin_id=str(admin.id),
            amount=penalty,
            order_id=order.id,
            notes=f"Penalty: booking {order.id} cancelled while trip was in progress",
        )

    now = datetime.utcnow()
    order.trip_status = "CANCELLED"
    order.cancelled_by = CancelledByEnum.CANCELLED_WHILE_DRIVING
    assignment.assignment_status = AssignmentStatusEnum.CANCELLED
    assignment.cancelled_at = now

    return {"penalty_amount": penalty, "hold_forfeited": hold, "additional_debit": shortfall}


def release_vendor_payout_hold_for_order(db: Session, order, note: str) -> None:
    """Give the vendor back the DRIVER_PAYOUT_HOLD taken when a driver accepted their booking, once
    that assignment ends without the trip completing. Idempotent and best-effort (never blocks the
    cancel). Was only done by the vendor-cancel and fleet-owner-cancel routes, so auto-cancel,
    driver-cancel, customer-cancel and admin-cancel left the vendor's money stuck."""
    if not order or not getattr(order, "vendor_id", None):
        return
    try:
        from app.crud.vendor_wallet import release_driver_payout_hold
        release_driver_payout_hold(db, vendor_id=str(order.vendor_id), order_id=order.id, notes=note)
    except Exception as e:
        print(f"Driver payout hold release failed for order {getattr(order, 'id', '?')}: {e}")


def cancel_order_by_admin(db: Session, order_id: int, reason: Optional[str] = None) -> dict:
    """Admin/staff-initiated cancel - there was previously NO way for an
    admin to cancel a bad or duplicate booking at all (confirmed by search
    2026-09-04, after test bookings created during a live verification
    pass had nowhere to go). Deliberately no ownership filter (admin can
    cancel ANY order, unlike cancel_order_by_vendor/cancel_order_by_customer
    below, which are scoped to the caller's own bookings) - same
    trip-in-progress-penalty and hold-refund behavior as
    cancel_order_by_vendor otherwise, for consistency."""
    from app.models.orders import CancelledByEnum

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Order not found")
    if order.trip_status == "CANCELLED":
        raise ValueError("Order is already cancelled")

    latest_assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id
    ).order_by(desc(OrderAssignment.created_at)).first()

    end_records_check = db.query(EndRecord).filter(EndRecord.order_id == order_id).first()
    if end_records_check:
        if not latest_assignment:
            raise ValueError("Trip has started but no assignment was found - cannot process cancellation")
        result = apply_driving_cancellation_penalty(db, order, latest_assignment)
        from app.crud.wallet import release_poster_advance_hold
        release_poster_advance_hold(db, order, "booking cancelled by admin")
        db.commit()
        return {
            "message": f"Order cancelled by admin. A penalty of ₹{result['penalty_amount']} was applied for cancelling a trip already in progress.",
            "order_id": order_id,
            "cancelled_by": "CANCELLED_BY_ADMIN",
            "penalty_amount": result["penalty_amount"],
            "cancelled_at": latest_assignment.cancelled_at.isoformat(),
        }

    now = datetime.utcnow()
    order.trip_status = "CANCELLED"
    try:
        order.cancelled_by = CancelledByEnum.CANCELLED_BY_ADMIN
    except AttributeError:
        pass
    order.cancel_note = (reason or "").strip() or None

    if latest_assignment:
        latest_assignment.assignment_status = AssignmentStatusEnum.CANCELLED
        latest_assignment.cancelled_at = now
        latest_assignment.cancel_note = (reason or "").strip() or None
        try:
            from app.crud.wallet import get_trip_hold, credit_wallet
            owner_id = str(latest_assignment.vehicle_owner_id)
            hold = get_trip_hold(db, order_id, owner_id)
            if hold > 0:
                credit_wallet(
                    db,
                    vehicle_owner_id=owner_id,
                    amount=hold,
                    reference_id=str(order_id),
                    reference_type="TRIP_HOLD_REFUND",
                    notes=f"Refund: booking {order_id} cancelled by admin" + (f" ({reason})" if reason else ""),
                )
        except Exception as e:
            print(f"Hold refund failed for order {order_id}: {e}")

    from app.crud.wallet import release_poster_advance_hold
    release_poster_advance_hold(db, order, "booking cancelled by admin")
    release_vendor_payout_hold_for_order(db, order, f"Driver payout hold released - order {order_id} cancelled by admin")

    db.commit()

    return {
        "message": "Order cancelled successfully by admin",
        "order_id": order_id,
        "cancelled_by": "CANCELLED_BY_ADMIN",
        "cancelled_at": now.isoformat(),
    }


def cancel_order_by_vendor(db: Session, order_id: int, vendor_id: str, reason: Optional[str] = None) -> dict:
    """Cancel an order by vendor. Refunds the fleet owner's hold if the trip
    hasn't started; applies the driving-cancellation penalty (see
    apply_driving_cancellation_penalty) if it has."""
    from app.models.orders import CancelledByEnum

    # Get the order and verify vendor ownership
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.vendor_id == vendor_id
    ).first()

    if not order:
        raise ValueError("Order not found or you don't have permission to cancel this order")

    # Check if order is already cancelled
    if order.trip_status == "CANCELLED":
        raise ValueError("Order is already cancelled")

    # Get the latest assignment for this order
    latest_assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id
    ).order_by(desc(OrderAssignment.created_at)).first()

    end_records_check = db.query(EndRecord).filter(EndRecord.order_id == order_id).first()
    if end_records_check:
        if not latest_assignment:
            raise ValueError("Trip has started but no assignment was found - cannot process cancellation")
        result = apply_driving_cancellation_penalty(db, order, latest_assignment)
        db.commit()
        return {
            "message": f"Order cancelled. A penalty of ₹{result['penalty_amount']} was applied for cancelling a trip already in progress.",
            "order_id": order_id,
            "cancelled_by": "CANCELLED_WHILE_DRIVING",
            "penalty_amount": result["penalty_amount"],
            "cancelled_at": latest_assignment.cancelled_at.isoformat(),
        }

    now = datetime.utcnow()
    
    # Update order status
    order.trip_status = "CANCELLED"
    # Only set cancelled_by if the column exists (for backward compatibility)
    try:
        order.cancelled_by = CancelledByEnum.CANCELLED_BY_VENDOR
    except AttributeError:
        # Column doesn't exist yet, skip setting it
        pass
    
    order.cancel_note = (reason or "").strip() or None

    # Update assignment status if exists
    if latest_assignment:
        latest_assignment.assignment_status = AssignmentStatusEnum.CANCELLED
        latest_assignment.cancelled_at = now
        latest_assignment.cancel_note = order.cancel_note

        # REFUND the owner's hold (commission + extras were held at accept):
        # vendor cancelled, so the owner gets the money back.
        try:
            from app.crud.wallet import get_trip_hold, credit_wallet
            owner_id = str(latest_assignment.vehicle_owner_id)
            hold = get_trip_hold(db, order_id, owner_id)
            if hold > 0:
                credit_wallet(
                    db,
                    vehicle_owner_id=owner_id,
                    amount=hold,
                    reference_id=str(order_id),
                    reference_type="TRIP_HOLD_REFUND",
                    notes=f"Refund: booking {order_id} cancelled by vendor",
                )
        except Exception as e:
            print(f"Hold refund failed for order {order_id}: {e}")

        # RELEASE the vendor's own DRIVER_PAYOUT_HOLD (if one was placed at
        # accept time) - the trip never happened, so no payout guarantee is
        # owed and this money must not stay stuck debited from the vendor.
        try:
            from app.crud.vendor_wallet import release_driver_payout_hold
            release_driver_payout_hold(
                db,
                vendor_id=vendor_id,
                order_id=order_id,
                notes=f"Driver payout hold released - order {order_id} cancelled by vendor",
            )
        except Exception as e:
            print(f"Driver payout hold release failed for order {order_id}: {e}")

    db.commit()

    return {
        "message": "Order cancelled successfully by vendor",
        "order_id": order_id,
        "cancelled_by": "CANCELLED_BY_VENDOR",
        "cancelled_at": now.isoformat()
    }


def cancel_order_by_poster(db: Session, order_id: int, poster_owner_id: str, reason: Optional[str] = None) -> dict:
    """A fleet owner/driver cancelling a booking THEY posted for someone else
    to drive (Driver App "Create Booking" - see driver_create_booking_confirm).
    These have no vendor (vendor_id is None), so cancel_order_by_vendor can't
    be used, and before this there was no way for the poster to cancel at all
    (they had to ask Admin). Same money handling as a vendor cancel: if some
    other driver already accepted it, that driver's accept-time hold is
    refunded. Refuses once the trip has started - a poster shouldn't be able
    to pull a booking out from under a driver who is already on the road
    (that goes through support/admin, which can apply the penalty rules)."""
    from app.models.orders import CancelledByEnum

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order or order.posted_by_vehicle_owner_id is None or str(order.posted_by_vehicle_owner_id) != str(poster_owner_id):
        raise ValueError("Booking not found or you didn't post it")
    if order.trip_status == "CANCELLED":
        raise ValueError("This booking is already cancelled")
    if not (reason or "").strip():
        raise ValueError("Please give a reason for cancelling this booking.")
    if order.trip_status == "COMPLETED":
        raise ValueError("This booking is already completed")
    if db.query(EndRecord).filter(EndRecord.order_id == order_id).first():
        raise ValueError("This trip has already started and can't be cancelled here - please contact support")

    now = datetime.utcnow()
    order.trip_status = "CANCELLED"
    order.cancelled_by = CancelledByEnum.CANCELLED_BY_VENDOR
    order.cancel_note = (reason or "").strip() or None

    active_assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.assignment_status.notin_([AssignmentStatusEnum.CANCELLED, AssignmentStatusEnum.COMPLETED]),
    ).order_by(desc(OrderAssignment.created_at)).first()

    if active_assignment:
        active_assignment.assignment_status = AssignmentStatusEnum.CANCELLED
        active_assignment.cancelled_at = now
        active_assignment.cancel_reason = "CANCELLED_BY_VENDOR"
        active_assignment.cancel_note = order.cancel_note
        try:
            from app.crud.wallet import get_trip_hold, credit_wallet
            owner_id = str(active_assignment.vehicle_owner_id)
            hold = get_trip_hold(db, order_id, owner_id)
            if hold > 0:
                credit_wallet(
                    db,
                    vehicle_owner_id=owner_id,
                    amount=hold,
                    reference_id=str(order_id),
                    reference_type="TRIP_HOLD_REFUND",
                    notes=f"Refund: booking {order_id} cancelled by the driver who posted it",
                )
        except Exception as e:
            print(f"Hold refund failed for order {order_id}: {e}")

    # The poster's own advance hold (if they marked an advance received).
    from app.crud.wallet import release_poster_advance_hold
    release_poster_advance_hold(db, order, "booking cancelled")

    db.commit()
    return {
        "message": "Booking cancelled",
        "order_id": order_id,
        "cancelled_by": "CANCELLED_BY_VENDOR",
        "cancelled_at": now.isoformat(),
        "had_accepted_driver": active_assignment is not None,
    }


def get_posted_bookings_for_owner(db: Session, poster_owner_id: str, limit: int = 100) -> list:
    """Bookings this fleet owner POSTED (Driver App "My Trips"), newest
    first, with the accepting driver/car when someone has taken it. Keyed off
    Order.posted_by_vehicle_owner_id directly - a posted booking has no
    OrderAssignment until another driver accepts it, so every existing
    assignment-based list missed it entirely."""
    if not poster_owner_id or str(poster_owner_id).strip().lower() in ('none', '', 'null'):
        return []

    from app.models.car_driver import CarDriver
    from app.models.car_details import CarDetails

    orders = (
        db.query(Order)
        .filter(Order.posted_by_vehicle_owner_id == poster_owner_id)
        .order_by(Order.created_at.desc())
        .limit(limit)
        .all()
    )
    if not orders:
        return []

    order_ids = [o.id for o in orders]
    assignments = (
        db.query(OrderAssignment)
        .filter(
            OrderAssignment.order_id.in_(order_ids),
            OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED,
        )
        .all()
    )
    assignment_by_order = {a.order_id: a for a in assignments}

    driver_ids = {a.driver_id for a in assignments if a.driver_id}
    car_ids = {a.car_id for a in assignments if a.car_id}
    drivers = {d.id: d for d in (db.query(CarDriver).filter(CarDriver.id.in_(driver_ids)).all() if driver_ids else [])}
    cars = {c.id: c for c in (db.query(CarDetails).filter(CarDetails.id.in_(car_ids)).all() if car_ids else [])}

    def _v(x):
        return x.value if hasattr(x, "value") else x

    end_records = {
        er.order_id: er
        for er in db.query(EndRecord).filter(EndRecord.order_id.in_(order_ids)).all()
    }

    def _iso(dt):
        return dt.isoformat() if dt else None

    results = []
    for o in orders:
        a = assignment_by_order.get(o.id)
        driver = drivers.get(a.driver_id) if a and a.driver_id else None
        car = cars.get(a.car_id) if a and a.car_id else None
        er = end_records.get(o.id)
        completed = str(_v(o.trip_status)).upper() == "COMPLETED"
        # Same trip-integrity codes a vendor sees for their own bookings: a
        # poster has no customer-app account for them to be emailed to, so
        # THEY read the codes out to the customer and the driver asks the
        # customer for them at start/end. Only meaningful once a driver+car
        # is assigned and while the trip is still open.
        from app.crud.trip_otp import otps_visible
        show_otps = bool(a and a.driver_id and a.car_id and not completed and otps_visible(o, a))
        results.append({
            "order_id": o.id,
            "trip_type": _v(o.trip_type),
            "car_type": _v(o.car_type),
            "pickup_drop_location": o.pickup_drop_location,
            "start_date_time": o.start_date_time.isoformat() if o.start_date_time else None,
            "customer_name": o.customer_name,
            "customer_number": o.customer_number,
            "customer_number_visible": bool(o.data_visibility_vehicle_owner),
            "advance_received": o.advance_received,
            "fare_type": _v(o.fare_type) or "ITEMIZED",
            "planned_km": o.trip_distance,
            "poster_share": o.vendor_profit if completed else None,
            "platform_fee": o.admin_profit if completed else None,
            "charge_items": o.charge_items,
            "total_booking_amount": o.total_booking_amount,
            "extra_amount": o.extra_amount,
            "trip_distance": o.trip_distance,
            "estimated_price": o.estimated_price,
            "trip_status": _v(o.trip_status),
            "cancelled_by": _v(o.cancelled_by),
            "cancel_note": getattr(o, "cancel_note", None) or (
                __import__("app.crud.order_details", fromlist=["default_cancel_reason"]).default_cancel_reason(o, a)
                if str(_v(o.trip_status)).upper() == "CANCELLED" else None
            ),
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "accepted": a is not None,
            "assignment_status": _v(a.assignment_status) if a else None,
            "assigned_driver_name": driver.full_name if driver else None,
            "assigned_driver_phone": driver.primary_number if driver else None,
            "assigned_car_name": car.car_name if car else None,
            "assigned_car_number": car.car_number if car else None,
            "assigned_at": _iso(a.assigned_at) if a else None,
            "completed_at": _iso(a.completed_at) if a else None,
            "start_trip_otp": a.start_trip_otp if show_otps else None,
            "end_trip_otp": a.end_trip_otp if show_otps else None,
            # Live location, as last pushed from the driver's trip page.
            "last_lat": a.last_lat if a else None,
            "last_lng": a.last_lng if a else None,
            "last_location_at": _iso(a.last_location_at) if a else None,
            "tracking_left_at": _iso(a.tracking_left_at) if a else None,
            # Trip record + the customer-facing final amount only (never the
            # driver payout / commission split - that stays vendor/admin-side).
            "start_km": er.start_km if er else None,
            "end_km": er.end_km if er else None,
            "total_km": (er.end_km - er.start_km) if er and er.end_km is not None and er.start_km is not None else None,
            "final_amount": o.closed_vendor_price if completed else None,
            "start_odometer_photo": er.img_url if er else None,
            "end_odometer_photo": er.close_speedometer_image if er else None,
            "cash_collection": er.cash_collection if er else None,
            "extra_charges_collected": er.extra_charges_collected if er else None,
        })
    return results


def cancel_order_by_customer(db: Session, order_id: int, reason: Optional[str] = None) -> dict:
    """Customer-initiated cancel (from the website - see
    api/routes/website_bookings.py's customer-cancel endpoint, which is the
    only caller and has already OTP-verified the customer before this runs).

    Refund-eligibility cutoff is DRIVER+CAR ASSIGNMENT, not trip-start
    (unlike cancel_order_by_vendor's cutoff) - a deliberate business choice:
    before a specific driver+car is assigned, the vendor hasn't committed
    real resources yet, so the customer gets a full refund and the vendor's
    accept-time wallet hold is refunded back to them immediately (not their
    fault). Once a driver+car is assigned, the vendor has committed - the
    customer gets no refund, and the vendor's hold is left untouched (they
    did nothing wrong, so it isn't forfeited either, just not returned
    early - it resolves normally when the trip is later closed or
    otherwise cancelled through the existing flows)."""
    from app.models.orders import CancelledByEnum

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Order not found")
    if order.trip_status == "CANCELLED":
        raise ValueError("This booking is already cancelled")

    end_records_check = db.query(EndRecord).filter(EndRecord.order_id == order_id).first()
    if end_records_check:
        raise ValueError("This trip has already started and can no longer be cancelled online - please call support")

    latest_assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED,
    ).order_by(desc(OrderAssignment.created_at)).first()

    is_fully_assigned = bool(latest_assignment and latest_assignment.driver_id and latest_assignment.car_id)
    # Refund eligibility is tied to whether the driver can actually see the
    # customer's real number yet, not just whether a driver is assigned -
    # a driver can be assigned well before the phone-reveal window opens.
    # Once the number is visible, driver and customer could coordinate the
    # trip off-platform and then "cancel" here to dodge platform fees while
    # still completing the ride - no refund past that point removes the
    # incentive to bypass.
    refund_eligible = not (is_fully_assigned and is_customer_number_revealed(db, order))

    now = datetime.utcnow()
    order.trip_status = "CANCELLED"
    try:
        order.cancelled_by = CancelledByEnum.CANCELLED_BY_CUSTOMER
    except AttributeError:
        pass
    order.cancel_note = (reason or "").strip() or None

    if latest_assignment:
        latest_assignment.assignment_status = AssignmentStatusEnum.CANCELLED
        latest_assignment.cancelled_at = now
        latest_assignment.cancel_note = order.cancel_note

        if refund_eligible:
            try:
                from app.crud.wallet import get_trip_hold, credit_wallet
                owner_id = str(latest_assignment.vehicle_owner_id)
                hold = get_trip_hold(db, order_id, owner_id)
                if hold > 0:
                    credit_wallet(
                        db,
                        vehicle_owner_id=owner_id,
                        amount=hold,
                        reference_id=str(order_id),
                        reference_type="TRIP_HOLD_REFUND",
                        notes=f"Refund: booking {order_id} cancelled by customer before driver was assigned",
                    )
            except Exception as e:
                print(f"Vendor hold refund failed for order {order_id}: {e}")
            release_vendor_payout_hold_for_order(db, order, f"Driver payout hold released - order {order_id} cancelled by customer")

    db.commit()

    return {
        "message": "Booking cancelled successfully",
        "order_id": order_id,
        "cancelled_by": "CANCELLED_BY_CUSTOMER",
        "refund_eligible": refund_eligible,
        "cancelled_at": now.isoformat(),
    }
