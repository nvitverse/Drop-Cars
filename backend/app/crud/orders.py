from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy import func, extract
import os
from app.models.orders import Order, OrderSourceEnum
from app.models.end_records import EndRecord
from app.utils.gcs import upload_image_to_gcs
from app.models.new_orders import NewOrder, OrderTypeEnum
from app.models.hourly_rental import HourlyRental
from app.models.order_assignments import OrderAssignment,AssignmentStatusEnum
from sqlalchemy.sql import or_, and_
from app.crud.notification import send_push_notifications_vehicle_owner, send_custom_sound_notification_vehicle_owner, send_trip_to_telegram_hourly, send_trip_to_telegram, send_trip_to_telegram_sync, send_trip_to_telegram_hourly_sync
import asyncio
import math

from app.utils.timezone import format_pickup_time_ist

vendor_commession_env = os.getenv("VENDOR_COMMESSION_ENV")
admin_commession_env = int(os.getenv("ADMIN_COMMESSION_ENV"))


def _notification_route_summary(pickup_drop_location: dict) -> str:
    """"Pickup -> Drop" text for booking notifications. Round Trip/Multi
    City stops end back at the pickup point, so naively using the last
    stop shows "City -> City" - meaningless, since every driver already
    knows a round trip returns to the start. Show the actual farthest stop
    (the second-to-last one) instead when that's the case."""
    if not pickup_drop_location:
        return ""
    keys = sorted(pickup_drop_location.keys(), key=lambda k: int(k))
    if len(keys) < 2:
        return str(pickup_drop_location.get(keys[0], "")) if keys else ""
    pickup = pickup_drop_location[keys[0]]
    destination = pickup_drop_location[keys[-1]]
    if len(keys) > 2 and destination == pickup:
        destination = pickup_drop_location[keys[-2]]
    return f"{pickup} -> {destination}"


def _new_booking_push_text(trip_type_str: str, locations, formatted: str, car_type, price, fallback_city: str = ""):
    """Title/body for the new-booking push: trip type, pickup -> destination, date & time, car and fare.
    (Used to show only the pickup time, so drivers could not see the route or trip type at a glance.)"""
    route = _notification_route_summary(locations if isinstance(locations, dict) else {}).replace(" -> ", " → ") or fallback_city or "your area"
    car = str(getattr(car_type, "value", car_type) or "").replace("_", " ").title()
    title = f"🚖 {trip_type_str} • {route}"
    # Multi-line body: Android shows line 1 collapsed and the rest when the card is expanded
    line2 = " • ".join([p for p in (f"🚗 {car}" if car else "", f"₹{price}" if price else "") if p])
    return title, f"📅 {formatted}" + ("\n" + line2 if line2 else "")


def _stamp_commission_class(new_order):
    """Class stored on the booking at creation - one source of truth for the accept-time hold and the trip-close split."""
    from app.utils.commission import resolve_commission_class
    return resolve_commission_class(
        fare_type=getattr(new_order, 'fare_type', None),
        vendor_id=getattr(new_order, 'vendor_id', None),
        posted_by_vehicle_owner_id=getattr(new_order, 'posted_by_vehicle_owner_id', None),
    )


def create_master_from_new_order(db: Session, new_order: NewOrder, max_time_to_assign_order: int = 15, toll_charge_update: bool = False, *, night_charges: int | None = None, acceptance_deadline: datetime | None = None) -> Order:
    start_at = new_order.start_date_time
    if start_at is not None and start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=timezone.utc)
    default_acceptance_deadline = (start_at + timedelta(minutes=15)) if start_at is not None else None
    master = Order(
        source=OrderSourceEnum.NEW_ORDERS,
        source_order_id=new_order.order_id,
        vendor_id=new_order.vendor_id,
        trip_type=new_order.trip_type,
        car_type=new_order.car_type,
        pickup_drop_location=new_order.pickup_drop_location,
        start_date_time=new_order.start_date_time,
        end_date_time=getattr(new_order, 'end_date_time', None),
        customer_name=new_order.customer_name,
        customer_number=new_order.customer_number,
        trip_status=new_order.trip_status,
        pick_near_city=new_order.pick_near_city,
        trip_distance=new_order.trip_distance,
        trip_time=new_order.trip_time,
        distance_edited=getattr(new_order, 'distance_edited', False),
        calculated_trip_distance=getattr(new_order, 'calculated_trip_distance', None),
        location_links=getattr(new_order, 'location_links', None),
        car_make_year_requirement=getattr(new_order, 'car_make_year_requirement', None),
        carrier_required=getattr(new_order, 'carrier_required', False),
        priority_for_paid=getattr(new_order, 'priority_for_paid', True),
        priority_cutoff_at=getattr(new_order, 'priority_cutoff_at', None),
        fare_type=getattr(new_order, 'fare_type', None),
        charge_items=getattr(new_order, 'charge_items', None),
        advance_received=getattr(new_order, 'advance_received', None),
        total_booking_amount=getattr(new_order, 'total_booking_amount', None),
        extra_amount=getattr(new_order, 'extra_amount', None),
        waiting_hours_included=getattr(new_order, 'waiting_hours_included', None),
        estimated_price=new_order.estimated_price,
        vendor_price=new_order.vendor_price,
        platform_fees_percent=new_order.platform_fees_percent,
        commission_waived=getattr(new_order, 'commission_waived', False),
        # max_time_to_assign_order=(datetime.utcnow() + timedelta(minutes=max_time_to_assign_order)),
        max_time_to_assign_order=datetime.now(timezone.utc) + timedelta(minutes=max_time_to_assign_order),
        toll_charge_update=toll_charge_update,
        night_charges=night_charges,
        vendor_fees_percent = vendor_commession_env,
        acceptance_deadline=acceptance_deadline or default_acceptance_deadline,
        target_driver_id=getattr(new_order, 'target_driver_id', None),
        posted_by_vehicle_owner_id=getattr(new_order, 'posted_by_vehicle_owner_id', None),
        is_urgent=getattr(new_order, 'is_urgent', False),
        commission_class=_stamp_commission_class(new_order),
    )
    print(new_order.pickup_drop_location)
    db.add(master)
    db.commit()
    db.refresh(master)

    # Advance the vendor already collected from the customer at booking time
    # goes into the vendor's own wallet now - held there until trip close,
    # when it gets reconciled with the driver (see close_order).
    if master.advance_received and master.advance_received > 0:
        try:
            from app.crud.vendor_wallet import credit_vendor_wallet
            credit_vendor_wallet(
                db,
                vendor_id=str(master.vendor_id),
                amount=int(master.advance_received),
                order_id=master.id,
                notes=f"Advance received from customer for booking {master.id} (held pending trip settlement)",
            )
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"advance_received vendor wallet credit failed (booking still created): {e}")

    locations = new_order.pickup_drop_location
    values = list(locations.values())
    route = " -> ".join(values)
    # first_location = values[0]
    # last_location = values[-1]

    # print(first_location)
    # print(last_location)
    formatted = format_pickup_time_ist(new_order.start_date_time)
    # Sync, not asyncio.ensure_future() - this function is called from both
    # async def and plain def route handlers (see the async-def-to-def
    # blocking-call fix in new_orders.py/order_assignments.py/admin.py); a
    # plain def route runs in AnyIO's worker thread pool, which has no
    # event loop of its own, so ensure_future() crashed with "There is no
    # current event loop in thread 'AnyIO worker thread'".
    try:
        send_trip_to_telegram_sync(
            pickup_location=new_order.pickup_drop_location['0'],
            drop_location=new_order.pickup_drop_location[str(len(new_order.pickup_drop_location)-1)],
            trip_type=new_order.trip_type.value,
            vehicle_type=new_order.car_type.value,
            pickup_datetime=formatted,
            master_id = master.id,
            route = route
        )
    except Exception as e:
        print(f"send_trip_to_telegram_sync failed (order still created): {e}")
    # Sent synchronously (before the response) so the driver alert can never
    # be delayed by Cloud Run pausing the container after the reply.
    trip_type_str = new_order.trip_type.value if hasattr(new_order.trip_type, 'value') else str(new_order.trip_type)
    from_city = (new_order.pick_near_city[0] if (new_order.pick_near_city and isinstance(new_order.pick_near_city, list) and len(new_order.pick_near_city) > 0 and new_order.pick_near_city[0] != 'ALL') else (new_order.pickup_drop_location.get('0', '') if isinstance(new_order.pickup_drop_location, dict) else '')) or "your area"
    total_price = master.vendor_price or master.estimated_price or 0

    notify_title, notify_body = _new_booking_push_text(trip_type_str, new_order.pickup_drop_location, formatted, new_order.car_type, total_price, from_city)
    target_driver_id = getattr(new_order, 'target_driver_id', None)
    if target_driver_id:
        from app.crud.notification import send_new_booking_notification_to_driver_sync
        send_new_booking_notification_to_driver_sync(db, notify_title, notify_body, driver_id=str(target_driver_id), order_id=master.id)
    else:
        from app.crud.notification import send_new_booking_notification_sync
        send_new_booking_notification_sync(db, notify_title, notify_body, ordered_city=new_order.pick_near_city, order_id=master.id)
    return master


def create_master_from_hourly(db: Session, hourly: HourlyRental, *, pick_near_city: list, trip_time : int, estimated_price: int, vendor_price:int, max_time_to_assign_order: int = 15, toll_charge_update: bool = False, target_driver_id=None, fare_type: str = "ITEMIZED") -> Order:
    master = Order(
        source=OrderSourceEnum.HOURLY_RENTAL,
        source_order_id=hourly.id,
        vendor_id=hourly.vendor_id,
        trip_type=hourly.trip_type,
        car_type=hourly.car_type,
        pickup_drop_location=hourly.pickup_drop_location,
        start_date_time=hourly.start_date_time,
        customer_name=hourly.customer_name,
        customer_number=hourly.customer_number,
        trip_status="PENDING",
        pick_near_city=pick_near_city,
        trip_time = trip_time,
        estimated_price = int(estimated_price),
        vendor_price = int(vendor_price),
        platform_fees_percent = admin_commession_env,
        trip_distance = hourly.package_hours['km_range'],
        max_time_to_assign_order=datetime.now(timezone.utc) + timedelta(minutes=max_time_to_assign_order),
        toll_charge_update=toll_charge_update,
        vendor_fees_percent = vendor_commession_env,
        target_driver_id=target_driver_id,
        is_urgent=getattr(hourly, 'is_urgent', False),
        fare_type=fare_type or "ITEMIZED",
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    formatted = format_pickup_time_ist(hourly.start_date_time)
    try:
        send_trip_to_telegram_hourly_sync(
            pickup_location=hourly.pickup_drop_location['0'],
            trip_type=hourly.trip_type.value,
            vehicle_type=hourly.car_type.value,
            pickup_datetime=formatted,
            master_id = master.id
        )
    except Exception as e:
        print(f"send_trip_to_telegram_hourly_sync failed (order still created): {e}")
    # Sent synchronously (before the response) - see note in create_master_from_new_order
    from_city = (pick_near_city[0] if (pick_near_city and isinstance(pick_near_city, list) and len(pick_near_city) > 0 and pick_near_city[0] != 'ALL') else (hourly.pickup_drop_location.get('0', '') if isinstance(hourly.pickup_drop_location, dict) else '')) or "your area"
    total_price = master.vendor_price or master.estimated_price or 0

    notify_title, notify_body = _new_booking_push_text("Hourly Rental", hourly.pickup_drop_location, formatted, getattr(hourly, "car_type", None), total_price, from_city)
    if target_driver_id:
        from app.crud.notification import send_new_booking_notification_to_driver_sync
        send_new_booking_notification_to_driver_sync(db, notify_title, notify_body, driver_id=str(target_driver_id), order_id=master.id)
    else:
        from app.crud.notification import send_new_booking_notification_sync
        send_new_booking_notification_sync(db, notify_title, notify_body, ordered_city=pick_near_city, order_id=master.id)
    return master


def get_all_orders(db: Session) -> List[Order]:
    return db.query(Order).order_by(Order.created_at.desc()).all()


def set_vehicle_owner_visibility(db: Session, order_id: int, vendor_id: str, visible: bool) -> Order:
    """Toggle fleet owner visibility for customer data, ensuring vendor ownership."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Order not found")
    if str(order.vendor_id) != str(vendor_id):
        raise ValueError("Not authorized to modify this order")
    # (used to flip the flag whenever it was already True, so "show" on an already-shown order hid it again)
    order.data_visibility_vehicle_owner = bool(visible)
    db.commit()
    db.refresh(order)
    return order


def set_customer_visibility_by_poster(db: Session, order_id: int, poster_owner_id: str, visible: bool) -> Order:
    """Same manual "show customer number to the driver" switch, for a booking a driver/fleet owner POSTED
    (no vendor)."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order or order.posted_by_vehicle_owner_id is None or str(order.posted_by_vehicle_owner_id) != str(poster_owner_id):
        raise ValueError("Booking not found or you didn't post it")
    order.data_visibility_vehicle_owner = bool(visible)
    db.commit()
    db.refresh(order)
    return order


# Fare/rate fields a vendor may edit after posting (not car_type/trip_type/
# pickup_drop_location/customer info - those are what a fleet owner/driver
# already committed to). NEW_ORDERS fields write through to NewOrder;
# night_charges lives on Order itself (NewOrder has no such column).
_EDITABLE_NEW_ORDER_FIELDS = (
    "cost_per_km", "extra_cost_per_km", "driver_allowance", "extra_driver_allowance",
    "permit_charges", "extra_permit_charges", "hill_charges", "toll_charges", "pickup_notes",
)
_EDITABLE_HOURLY_FIELDS = (
    "cost_per_hour", "extra_cost_per_hour", "cost_for_addon_km", "extra_cost_for_addon_km", "pickup_notes",
)


def edit_order(db: Session, order_id: int, vendor_id: Optional[str], updates: Dict) -> Order:
    """Edit a booking's rate/fare fields after posting and recompute the
    frozen Order.estimated_price/vendor_price snapshot to match - see
    app/api/routes/orders.py:edit_order_endpoint for why the recompute step
    is required (accept-time holds and list previews read the frozen
    snapshot, trip-close settlement re-reads the live NewOrder/HourlyRental
    fields; skipping either would make them disagree).

    vendor_id=None is the admin path (api/routes/admin.py's
    admin_edit_order_fare) - skips the ownership check since an admin can
    edit any order, not just one they posted."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Order not found")
    if vendor_id is not None:
        if str(order.vendor_id) != str(vendor_id):
            raise ValueError("Not authorized to modify this order")
        from app.models.order_assignments import OrderAssignment
        accepted = db.query(OrderAssignment).filter(
            OrderAssignment.order_id == order_id,
            OrderAssignment.assignment_status.in_(["ASSIGNED", "DRIVING", "COMPLETED"])
        ).first()
        if accepted:
            raise ValueError("Cannot edit booking after a driver has accepted. Please contact Admin.")
        if order.trip_status in ("COMPLETED", "CANCELLED"):
            status_value = getattr(order.trip_status, "value", order.trip_status)
            raise ValueError(f"Cannot edit an order that is already {status_value.lower()}")

    if "night_charges" in updates and updates["night_charges"] is not None:
        order.night_charges = updates["night_charges"]

    if order.source == OrderSourceEnum.HOURLY_RENTAL:
        from app.crud.hourly_rental import calculate_hourly_fare
        hourly = db.query(HourlyRental).filter(HourlyRental.id == order.source_order_id).first()
        if not hourly:
            raise ValueError("Underlying hourly rental record not found")
        for field in _EDITABLE_HOURLY_FIELDS:
            if field in updates and updates[field] is not None:
                setattr(hourly, field, updates[field])

        fare = calculate_hourly_fare(
            package_hours=hourly.package_hours,
            cost_per_hour=hourly.cost_per_hour,
            extra_cost_per_hour=hourly.extra_cost_per_hour,
            cost_for_addon_km=hourly.cost_for_addon_km,
            extra_cost_for_addon_km=hourly.extra_cost_for_addon_km,
        )
        order.estimated_price = fare["estimate_price"]
        order.vendor_price = fare["vendor_amount"]
    else:
        from app.crud.new_orders import calculate_oneway_fare, calculate_multisegment_fare
        new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
        if not new_order:
            raise ValueError("Underlying order record not found")
        for field in _EDITABLE_NEW_ORDER_FIELDS:
            if field in updates and updates[field] is not None:
                setattr(new_order, field, updates[field])

        fare_args = dict(
            pickup_drop_location=new_order.pickup_drop_location,
            cost_per_km=new_order.cost_per_km,
            driver_allowance=new_order.driver_allowance,
            extra_driver_allowance=new_order.extra_driver_allowance,
            permit_charges=new_order.permit_charges,
            extra_permit_charges=new_order.extra_permit_charges,
            hill_charges=new_order.hill_charges,
            toll_charges=new_order.toll_charges,
            extra_cost_per_km=new_order.extra_cost_per_km,
            night_charges=order.night_charges,
            trip_type=new_order.trip_type,
        )
        if new_order.trip_type in (OrderTypeEnum.ONEWAY, OrderTypeEnum.MULTY_CITY):
            fare = calculate_oneway_fare(**fare_args)
        else:
            fare = calculate_multisegment_fare(
                **fare_args,
                start_date_time=new_order.start_date_time,
                end_date_time=getattr(new_order, "end_date_time", None),
            )
        order.estimated_price = fare["driver_amount"]
        order.vendor_price = fare["total_amount"]

    db.commit()
    db.refresh(order)
    return order


def increase_all_inclusive_fare(db: Session, order_id: int, vendor_id: Optional[str], new_total_amount: int) -> Order:
    """Increase total flat fare. Vendors can only increase BEFORE driver acceptance.
    Admin can increase at ANY TIME for any booking type."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Order not found")
    if vendor_id is not None:
        if str(order.vendor_id) != str(vendor_id):
            raise ValueError("Not authorized to modify this order")
        from app.models.order_assignments import OrderAssignment
        accepted = db.query(OrderAssignment).filter(
            OrderAssignment.order_id == order_id,
            OrderAssignment.assignment_status.in_(["ASSIGNED", "DRIVING", "COMPLETED"])
        ).first()
        if accepted:
            raise ValueError("Cannot increase fare after a driver has accepted. Please contact Admin.")
        if order.trip_status in ("COMPLETED", "CANCELLED"):
            status_value = getattr(order.trip_status, "value", order.trip_status)
            raise ValueError(f"Cannot edit an order that is already {status_value.lower()}")

        fare_type_str = str(getattr(order.fare_type, "value", order.fare_type) or "ITEMIZED").upper()
        if fare_type_str != "ALL_INCLUSIVE":
            raise ValueError("Direct price increase is for ALL_INCLUSIVE bookings. Use Edit Tariff for standard bookings.")

    current_amount = getattr(order, "total_booking_amount", None) or getattr(order, "vendor_price", None) or getattr(order, "estimated_price", 0) or 0
    if new_total_amount <= current_amount:
        raise ValueError(f"New fare (₹{new_total_amount}) must be greater than current fare (₹{current_amount})")

    extra = getattr(order, "extra_amount", 0) or 0
    order.total_booking_amount = int(new_total_amount)
    order.vendor_price = int(new_total_amount) + int(extra)
    if not order.estimated_price or order.estimated_price == current_amount:
        order.estimated_price = int(new_total_amount)
    else:
        # Scale driver amount upward
        increase_diff = int(new_total_amount) - int(current_amount)
        order.estimated_price = order.estimated_price + increase_diff

    from app.models.new_orders import NewOrder
    new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
    if new_order:
        new_order.total_booking_amount = int(new_total_amount)
        new_order.vendor_cal_price = int(new_total_amount) + int(extra)
        new_order.estimated_cal_price = order.estimated_price

    db.commit()
    db.refresh(order)

    # Re-broadcast push notification to drivers
    try:
        from app.crud.notification import send_new_booking_notification_sync
        pick_city = getattr(order, "pick_near_city", None) or (getattr(new_order, "pick_near_city", None) if new_order else None) or ["ALL"]
        if isinstance(pick_city, str):
            pick_city = [pick_city]
        notify_title = f"⚡ Booking Price Increased: ₹{order.total_booking_amount:,}"
        _stops = order.pickup_drop_location if isinstance(order.pickup_drop_location, dict) else {}
        _cities = [str(v) for v in _stops.values() if v] if _stops else []
        p_loc = _cities[0] if _cities else "Pickup"
        d_loc = _cities[-1] if len(_cities) > 1 else "Drop"
        notify_body = f"[{p_loc} ➔ {d_loc}] Fare increased to ₹{order.total_booking_amount:,}! Tap to review and accept now."
        send_new_booking_notification_sync(db, notify_title, notify_body, ordered_city=pick_city, is_urgent=True, order_id=order.id)
    except Exception as notify_err:
        print(f"Failed to re-broadcast price increase push notification: {notify_err}")

    return order, current_amount, order.total_booking_amount


def admin_master_edit_order(db: Session, order_id: int, updates: Dict) -> Order:
    """Master edit of any booking by Admin at ANY TIME.
    Can edit: customer_name, customer_number, customer_email,
    pickup address, drop address, trip_distance, start_date_time,
    car_type, trip_type, estimated_price, vendor_price, total_booking_amount,
    advance_received, pickup_notes, etc.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Order not found")

    from app.models.new_orders import NewOrder
    from app.models.hourly_rental import HourlyRental

    # Update Order level fields
    if "customer_name" in updates and updates["customer_name"] is not None:
        order.customer_name = str(updates["customer_name"]).strip()
    if "customer_number" in updates and updates["customer_number"] is not None:
        order.customer_number = str(updates["customer_number"]).strip()
    if "start_date_time" in updates and updates["start_date_time"] is not None:
        order.start_date_time = updates["start_date_time"]
    if "trip_distance" in updates and updates["trip_distance"] is not None:
        order.trip_distance = int(updates["trip_distance"])
        order.calculated_trip_distance = int(updates["trip_distance"])
        order.distance_edited = True
    if "car_type" in updates and updates["car_type"] is not None:
        order.car_type = updates["car_type"]
    if "trip_type" in updates and updates["trip_type"] is not None:
        order.trip_type = updates["trip_type"]
    if "estimated_price" in updates and updates["estimated_price"] is not None:
        order.estimated_price = int(updates["estimated_price"])
    if "vendor_price" in updates and updates["vendor_price"] is not None:
        order.vendor_price = int(updates["vendor_price"])
    if "total_booking_amount" in updates and updates["total_booking_amount"] is not None:
        order.total_booking_amount = int(updates["total_booking_amount"])
    if "advance_received" in updates and updates["advance_received"] is not None:
        order.advance_received = int(updates["advance_received"])
    if "pickup_drop_location" in updates and updates["pickup_drop_location"] is not None:
        order.pickup_drop_location = updates["pickup_drop_location"]

    # Also update underlying NewOrder / HourlyRental
    if order.source == OrderSourceEnum.NEW_ORDERS:
        new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
        if new_order:
            if "customer_name" in updates and updates["customer_name"] is not None:
                new_order.customer_name = str(updates["customer_name"]).strip()
            if "customer_number" in updates and updates["customer_number"] is not None:
                new_order.customer_number = str(updates["customer_number"]).strip()
            if "start_date_time" in updates and updates["start_date_time"] is not None:
                new_order.start_date_time = updates["start_date_time"]
            if "trip_distance" in updates and updates["trip_distance"] is not None:
                new_order.trip_distance = int(updates["trip_distance"])
            if "car_type" in updates and updates["car_type"] is not None:
                new_order.car_type = updates["car_type"]
            if "trip_type" in updates and updates["trip_type"] is not None:
                new_order.trip_type = updates["trip_type"]
            if "estimated_price" in updates and updates["estimated_price"] is not None:
                new_order.estimated_cal_price = int(updates["estimated_price"])
            if "vendor_price" in updates and updates["vendor_price"] is not None:
                new_order.vendor_cal_price = int(updates["vendor_price"])
            if "total_booking_amount" in updates and updates["total_booking_amount"] is not None:
                new_order.total_booking_amount = int(updates["total_booking_amount"])
            if "pickup_drop_location" in updates and updates["pickup_drop_location"] is not None:
                new_order.pickup_drop_location = updates["pickup_drop_location"]

    db.commit()
    db.refresh(order)
    return order


def admin_force_complete_order(db: Session, order_id: int, end_km: Optional[int] = None, final_fare: Optional[int] = None, note: Optional[str] = None) -> Order:
    """Admin manually completes / closes a trip at ANY TIME (e.g. if driver was unable to end trip)."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Order not found")

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    order.trip_status = "COMPLETED"
    if final_fare is not None:
        order.closed_vendor_price = int(final_fare)
    elif order.closed_vendor_price is None:
        order.closed_vendor_price = order.vendor_price or order.estimated_price

    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.assignment_status.in_(["ASSIGNED", "DRIVING", "PENDING"])
    ).order_by(OrderAssignment.created_at.desc()).first()

    if assignment:
        assignment.assignment_status = AssignmentStatusEnum.COMPLETED
        assignment.completed_at = now

    from app.models.end_records import EndRecord
    record = db.query(EndRecord).filter(EndRecord.order_id == order_id).first()
    if not record and assignment and assignment.driver_id:
        record = EndRecord(
            order_id=order_id,
            driver_id=assignment.driver_id,
            start_km=0,
            end_km=end_km or (order.trip_distance or 0),
            contact_number=order.customer_number or "",
            created_at=now,
            updated_at=now,
        )
        db.add(record)
    elif record and end_km is not None:
        record.end_km = end_km
        record.updated_at = now

    db.commit()
    db.refresh(order)

    try:
        from app.utils.website_status_webhook import notify_website_of_status
        notify_website_of_status(
            db=db,
            order_id=order_id,
            status="COMPLETED",
            actual_distance=end_km or order.trip_distance or 0,
            closing_km=end_km,
            final_fare=order.closed_vendor_price,
        )
    except Exception as _e:
        print(f"notify_website_of_status force complete error: {_e}")

    return order



# def get_vendor_orders(db: Session, vendor_id: str) -> List[Order]:
#     print("Vendor ID in CRUD:", vendor_id)
#     return db.query(Order).filter(Order.vendor_id == vendor_id).order_by(Order.created_at.desc()).all()


async def notify_order_manually(db: Session, order_id: int, vendor_id: str, target_vehicle_owner_id: str = None) -> dict:
    """Vendor-triggered "Notify" button - re-sends the new-booking alert for
    a booking that's already posted. If a fleet owner has already accepted it
    (active assignment exists), this pings that owner/driver directly instead
    of re-broadcasting to everyone.

    target_vehicle_owner_id (optional): the vendor picked a specific idle
    fleet owner from the Vacant Drivers screen and wants THEM specifically
    alerted about this still-pending booking. This is notification-only -
    it does not assign the booking, the owner still has to accept it."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Order not found")
    if str(order.vendor_id) != str(vendor_id):
        raise ValueError("Not authorized to notify for this order")
    if order.trip_status in ("COMPLETED", "CANCELLED"):
        status_value = getattr(order.trip_status, "value", order.trip_status)
        raise ValueError(f"Cannot notify - order is already {status_value.lower()}")

    route = _notification_route_summary(order.pickup_drop_location or {})
    title = f"Reminder: Booking ID {order.id}"
    body = route or f"Booking {order.id} needs attention"

    active_assignment = (
        db.query(OrderAssignment)
        .filter(
            OrderAssignment.order_id == order_id,
            OrderAssignment.assignment_status.in_(["PENDING", "ASSIGNED", "DRIVING"]),
        )
        .order_by(OrderAssignment.created_at.desc())
        .first()
    )

    if target_vehicle_owner_id:
        if active_assignment:
            raise ValueError("This booking has already been accepted by a fleet owner - can't redirect it to someone else")
        from app.crud.notification import notify_specific_vehicle_owner
        result = await notify_specific_vehicle_owner(db, target_vehicle_owner_id, order_id, title, f"New booking available: {body}")
    elif active_assignment:
        from app.crud.notification import notify_order_reminder
        result = await notify_order_reminder(db, order_id, title, body)
    elif order.target_driver_id:
        from app.crud.notification import send_new_booking_notification_to_driver_sync
        result = send_new_booking_notification_to_driver_sync(db, title, body, driver_id=str(order.target_driver_id), order_id=order.id)
    else:
        from app.crud.notification import send_new_booking_notification_sync
        result = send_new_booking_notification_sync(db, title, body, ordered_city=order.pick_near_city, order_id=order.id)

    return {"status": "notified", "detail": result}


def map_to_combined_schema(order, new_order=None, hourly_rental=None):
    # Calculate max_time in minutes
    max_time = None
    if order.max_time_to_assign_order and order.created_at:
        time_diff = (order.max_time_to_assign_order - order.created_at).total_seconds() / 60
        max_time = int(time_diff)
    
    # BaseOrderSchema fields
    # Normalize pick_near_city list to string for API compatibility
    def _pick_near_city_to_str(val):
        if isinstance(val, list):
            if not val:
                return None
            if "ALL" in val:
                return "ALL"
            return ",".join(val)
        return val

    base_data = {
        "id": order.id,
        "source": order.source.value,  # enum as string
        "source_order_id": order.source_order_id,
        "vendor_id": order.vendor_id,  # UUID, ensure correct type
        "trip_type": order.trip_type.value,
        "car_type": order.car_type.value,
        "pickup_drop_location": order.pickup_drop_location,
        "start_date_time": order.start_date_time,
        "customer_name": order.customer_name,
        "customer_number": order.customer_number,
        "trip_status": order.trip_status,
        # Cancellation reason so the vendor sees WHY a booking was cancelled
        "cancelled_by": (order.cancelled_by.value if getattr(order, "cancelled_by", None) else None),
        "pick_near_city": order.pick_near_city,
        "night_charges": int(order.night_charges) if order.night_charges and int(order.night_charges) > 0 else 0,
        "trip_distance": order.trip_distance,
        "trip_time": order.trip_time,
        "estimated_price": order.estimated_price,
        "vendor_price": order.vendor_price,
        "platform_fees_percent": order.platform_fees_percent,
        "closed_vendor_price": order.closed_vendor_price,
        "closed_driver_price": order.closed_driver_price,
        "commision_amount": order.commision_amount,
        "created_at": order.created_at,
        "max_time": max_time,
        "vendor_earns_estimation" : math.ceil(((new_order.extra_cost_per_km*order.trip_distance) + new_order.extra_driver_allowance + new_order.extra_permit_charges)+((new_order.cost_per_km*new_order.trip_distance)*order.vendor_fees_percent/100)) - math.ceil(math.ceil(((new_order.extra_cost_per_km*order.trip_distance) + new_order.extra_driver_allowance + new_order.extra_permit_charges)+((new_order.cost_per_km*new_order.trip_distance)*order.vendor_fees_percent/100))*order.platform_fees_percent/100) if order.source == "NEW_ORDERS" else 0,
        "cancelled_by" : order.cancelled_by,
        "h_cost_for_addon_km": hourly_rental.cost_for_addon_km if hourly_rental else None,
        "h_extra_cost_for_addon_km": hourly_rental.extra_cost_for_addon_km if hourly_rental else None,
        "cost_per_km" : new_order.cost_per_km if new_order else None,
        "venodr_profit" : order.vendor_profit if order else None,
        "admin_profit" : order.admin_profit if order else None,
    }
    print("Base Data:", base_data)

    # source_data based on source type
    if order.source == OrderSourceEnum.NEW_ORDERS and new_order:
        source_data = {
            "order_id": new_order.order_id,
            "cost_per_km": new_order.cost_per_km,
            "extra_cost_per_km": new_order.extra_cost_per_km,
            "driver_allowance": new_order.driver_allowance,
            "extra_driver_allowance": new_order.extra_driver_allowance,
            "permit_charges": new_order.permit_charges,
            "extra_permit_charges": new_order.extra_permit_charges,
            "hill_charges": new_order.hill_charges,
            "toll_charges": new_order.toll_charges,
            "pickup_notes": new_order.pickup_notes,
            # "cost_per_km" : order.cost_per_km if hasattr(order, 'cost_per_km') else None,
            # "venodr_profit" : order.vendor_profit if order else None,
            
        }
    elif order.source == OrderSourceEnum.HOURLY_RENTAL and hourly_rental:
        print("checking hours ..")
        source_data = {
            "id": hourly_rental.id,
            "package_hours": hourly_rental.package_hours,
            "cost_per_hour": hourly_rental.cost_per_hour,
            "extra_cost_per_hour": hourly_rental.extra_cost_per_hour,
            "cost_for_addon_km": hourly_rental.cost_for_addon_km,
            "extra_cost_for_addon_km": hourly_rental.extra_cost_for_addon_km,
            "pickup_notes": hourly_rental.pickup_notes,
        }
    else:
        source_data = None

    return {**base_data, "source_data": source_data}


def map_to_combined_schema_pending_orders(order, new_order=None, hourly_rental=None, db : Session = None):
    # BaseOrderSchema fields
    order_assignment = db.query(OrderAssignment).filter(OrderAssignment.order_id == order.id).first()
    order_accept_status= (
            order_assignment is not None and 
            order_assignment.assignment_status in (AssignmentStatusEnum.PENDING, AssignmentStatusEnum.ASSIGNED)
        )
    base_data = {
        "id": order.id,
        "source": order.source.value,  # enum as string
        "source_order_id": order.source_order_id,
        "vendor_id": order.vendor_id,  # UUID, ensure correct type
        "trip_type": order.trip_type.value,
        "car_type": order.car_type.value,
        "pickup_drop_location": order.pickup_drop_location,
        "start_date_time": order.start_date_time,
        "customer_name": order.customer_name,
        "customer_number": order.customer_number,
        "trip_status": order.trip_status,
        # Cancellation reason so the vendor sees WHY a booking was cancelled
        "cancelled_by": (order.cancelled_by.value if getattr(order, "cancelled_by", None) else None),
        "pick_near_city": order.pick_near_city,
        "trip_distance": order.trip_distance,
        "trip_time": order.trip_time,
        "estimated_price": order.estimated_price,
        "vendor_price": order.vendor_price,
        "night_charges" : int(order.night_charges) if order.night_charges and int(order.night_charges) > 0 else 0,
        "platform_fees_percent": order.platform_fees_percent,
        "closed_vendor_price": order.closed_vendor_price,
        "closed_driver_price": order.closed_driver_price,
        "commision_amount": order.commision_amount,
        "created_at": order.created_at,
        "cost_per_km" : new_order.cost_per_km if new_order else None,
        "venodr_profit" : order.vendor_profit if order else None,
        "admin_profit" : order.admin_profit if order else None,
        "order_accept_status": order_accept_status,
        "Driver_assigned": (order_accept_status and order_assignment.driver_id is not None),
        "Car_assigned": (order_accept_status and order_assignment.car_id is not None)
        

    }
    print("Base Data:", base_data)

    # source_data based on source type
    if order.source == OrderSourceEnum.NEW_ORDERS and new_order:
        source_data = {
            "order_id": new_order.order_id,
            "cost_per_km": new_order.cost_per_km,
            "extra_cost_per_km": new_order.extra_cost_per_km,
            "driver_allowance": new_order.driver_allowance,
            "extra_driver_allowance": new_order.extra_driver_allowance,
            "permit_charges": new_order.permit_charges,
            "extra_permit_charges": new_order.extra_permit_charges,
            "hill_charges": new_order.hill_charges,
            "toll_charges": new_order.toll_charges,
            "pickup_notes": new_order.pickup_notes,
            # "cost_per_km" : order.cost_per_km if hasattr(order, 'cost_per_km') else None,
            # "venodr_profit" : order.vendor_profit if order else None,
        }
    elif order.source == OrderSourceEnum.HOURLY_RENTAL and hourly_rental:
        source_data = {
            "id": hourly_rental.id,
            "package_hours": hourly_rental.package_hours,
            "cost_per_hour": hourly_rental.cost_per_hour,
            "extra_cost_per_hour": hourly_rental.extra_cost_per_hour,
            "cost_for_addon_km": hourly_rental.cost_for_addon_km,
            "extra_cost_for_addon_km": hourly_rental.extra_cost_for_addon_km,
            "pickup_notes": hourly_rental.pickup_notes,
        }
    else:
        source_data = None

    return {**base_data, "source_data": source_data}

def get_vendor_orders(db: Session, vendor_id: str, skip: int = 0, limit: int = 50):
    query = (
        db.query(Order, NewOrder, HourlyRental)
        .outerjoin(
            NewOrder,
            (Order.source == OrderSourceEnum.NEW_ORDERS) &
            (Order.source_order_id == NewOrder.order_id)
        )
        .outerjoin(
            HourlyRental,
            (Order.source == OrderSourceEnum.HOURLY_RENTAL) &
            (Order.source_order_id == HourlyRental.id)
        )
        .filter(Order.vendor_id == vendor_id)
        .order_by(Order.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    # print("Constructed Query:")

    results = query.all()

    # map each row to CombinedOrderSchema dict
    combined_orders = [
        map_to_combined_schema(order, new_order, hourly_rental)
        for order, new_order, hourly_rental in results
    ]

    return combined_orders

def get_vendor_pending_orders(db: Session, vendor_id: str):
    query = (
        db.query(Order, NewOrder, HourlyRental)
        .outerjoin(
            NewOrder,
            (Order.source == OrderSourceEnum.NEW_ORDERS) &
            (Order.source_order_id == NewOrder.order_id)
        )
        .outerjoin(
            HourlyRental,
            (Order.source == OrderSourceEnum.HOURLY_RENTAL) &
            (Order.source_order_id == HourlyRental.id)
        )
        .filter(Order.vendor_id == vendor_id)
        # Return ALL of the vendor's bookings (not just PENDING) so the
        # dashboard's Completed / Cancelled tiles actually have data and an
        # auto-cancelled booking is still visible with its reason.
        .order_by(Order.created_at.desc())
    )

    results = query.all()

    # map each row to CombinedOrderSchema dict
    combined_orders = [
        map_to_combined_schema_pending_orders(order, new_order, hourly_rental,db)
        for order, new_order, hourly_rental in results
    ]

    return combined_orders


def get_max_time_to_assign_by_trip_type(db: Session) -> Dict[str, int]:
    """
    Get the maximum time to assign orders from existing orders for each trip type.
    Returns the maximum time in minutes for oneway, roundtrip, multicity, and hourly rental.
    """
    trip_types = [OrderTypeEnum.ONEWAY, OrderTypeEnum.ROUND_TRIP, OrderTypeEnum.MULTY_CITY, OrderTypeEnum.HOURLY_RENTAL, OrderTypeEnum.LOCAL]
    max_times = {}
    
    for trip_type in trip_types:
        # Get orders for this trip type
        orders = db.query(Order).filter(Order.trip_type == trip_type).all()
        
        if not orders:
            # If no orders exist for this trip type, use default 15 minutes
            max_times[trip_type.value] = 15
            continue
            
        # Calculate the time difference between created_at and max_time_to_assign_order
        max_time_minutes = 0
        for order in orders:
            if order.max_time_to_assign_order and order.created_at:
                time_diff = (order.max_time_to_assign_order - order.created_at).total_seconds() / 60
                max_time_minutes = max(max_time_minutes, int(time_diff))
        
        # If no valid time differences found, use default 15 minutes
        if max_time_minutes == 0:
            max_time_minutes = 15
            
        max_times[trip_type.value] = max_time_minutes
    
    return max_times


def get_max_time_for_trip_type(db: Session, trip_type: OrderTypeEnum) -> int:
    """
    Get the maximum time to assign orders for a specific trip type.
    Returns the maximum time in minutes.
    """
    # Get orders for this trip type
    orders = db.query(Order).filter(Order.trip_type == trip_type).all()
    
    if not orders:
        # If no orders exist for this trip type, use default 15 minutes
        return 15
        
    # Calculate the time difference between created_at and max_time_to_assign_order
    max_time_minutes = 0
    for order in orders:
        if order.max_time_to_assign_order and order.created_at:
            time_diff = (order.max_time_to_assign_order - order.created_at).total_seconds() / 60
            max_time_minutes = max(max_time_minutes, int(time_diff))
    
    # If no valid time differences found, use default 15 minutes
    if max_time_minutes == 0:
        max_time_minutes = 15
        
    return max_time_minutes


def close_order(
    db: Session,
    *,
    order_id: int,
    closed_vendor_price: int,
    closed_driver_price: int,
    commision_amount: int,
    driver_id: str,
    start_km: int,
    end_km: int,
    contact_number: str,
    image_file,
    image_folder: str = "order_closures"
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Order not found")

    # Validate km for non-hourly orders when trip_distance present - actual
    # distance must be at least the booked distance (existing rule) and no
    # more than 10% over it (caps distance-padding before wasting an image
    # upload on a rejected close).
    if order.trip_distance is not None:
        distance_delta = int(end_km) - int(start_km)
        booked_distance = int(order.trip_distance)
        if distance_delta < booked_distance:
            raise ValueError("End KM minus Start KM must be greater than or equal to trip distance")
        max_allowed_distance = int(booked_distance * 1.10)
        if distance_delta > max_allowed_distance:
            raise ValueError(
                f"End KM minus Start KM ({distance_delta} km) is more than 10% over the booked trip distance "
                f"({booked_distance} km, max allowed {max_allowed_distance} km). Please re-check the odometer readings."
            )

    # Upload image only after km validation passes
    img_url = upload_image_to_gcs(image_file, folder=image_folder)

    # Update order closing fields
    order.closed_vendor_price = int(closed_vendor_price)
    order.closed_driver_price = int(closed_driver_price)
    order.commision_amount = int(commision_amount)

    # Create end record
    end_record = EndRecord(
        order_id=order_id,
        driver_id=driver_id,
        start_km=int(start_km),
        end_km=int(end_km),
        contact_number=str(contact_number),
        img_url=img_url,
    )
    db.add(end_record)
    db.commit()
    db.refresh(order)
    db.refresh(end_record)

    # Advance settlement: the vendor already collected advance_received from
    # the customer (credited to the vendor's wallet at booking time - see
    # create_master_from_new_order). Since the driver collects less cash at
    # trip end because of that advance, the driver is short by
    # (advance_received - held_amount) versus their true commission-adjusted
    # entitlement - top that shortfall up from the vendor's wallet into the
    # driver's now. Funded by the vendor, never admin (owner's explicit
    # choice) - if the vendor's wallet can't cover it, the shortfall is
    # logged and skipped rather than blocking trip closure.
    try:
        if order.advance_received and order.advance_received > 0:
            assignment = (
                db.query(OrderAssignment)
                .filter(OrderAssignment.order_id == order_id, OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED)
                .order_by(OrderAssignment.created_at.desc())
                .first()
            )
            held_amount = int(assignment.held_amount) if assignment and assignment.held_amount else 0
            settlement = int(order.advance_received) - held_amount
            if settlement > 0 and assignment:
                from app.crud.vendor_wallet import debit_vendor_wallet
                from app.crud.wallet import credit_wallet
                debit_vendor_wallet(
                    db,
                    vendor_id=str(order.vendor_id),
                    amount=settlement,
                    order_id=order.id,
                    notes=f"Advance settlement for booking {order.id} - paid to fleet owner",
                )
                credit_wallet(
                    db,
                    vehicle_owner_id=str(assignment.vehicle_owner_id),
                    amount=settlement,
                    reference_id=str(order.id),
                    reference_type="ADVANCE_SETTLEMENT",
                    notes=f"Advance settlement for booking {order.id} - collected in advance by vendor, reconciled here",
                )
                db.commit()
    except Exception as e:
        db.rollback()
        print(f"advance settlement failed for order {order_id} (trip still closed): {e}")

    return order, end_record, img_url


def get_order_by_id(db: Session, order_id: int) -> Order:
    """Get order by ID"""
    return db.query(Order).filter(Order.id == order_id).first()


def get_new_order_by_id(db: Session, order_id: int) -> NewOrder:
    """Get new order by ID"""
    return db.query(NewOrder).filter(NewOrder.order_id == order_id).first()


def get_hourly_rental_by_id(db: Session, rental_id: int) -> HourlyRental:
    """Get hourly rental by ID"""
    return db.query(HourlyRental).filter(HourlyRental.id == rental_id).first()


def recreate_order(db: Session, order_id: int, current_vendor_id: str, max_time_to_assign_order: int = 15) -> Dict[str, any]:
    """
    Recreate an order based on an existing order ID.
    Validates that the order belongs to the current vendor and is auto_cancelled.
    """
    # Get the master order
    master_order = get_order_by_id(db, order_id)
    if not master_order:
        raise ValueError("Order not found")
    
    # Validate vendor ownership
    if str(master_order.vendor_id) != str(current_vendor_id):
        raise ValueError("Order does not belong to the current vendor")
    
    # Validate that order is auto_cancelled
    if master_order.cancelled_by != "AUTO_CANCELLED":
        raise ValueError("Order can only be recreated if it was auto_cancelled")
    
    # Get source order data based on source type
    if master_order.source == OrderSourceEnum.NEW_ORDERS:
        source_order = get_new_order_by_id(db, master_order.source_order_id)
        if not source_order:
            raise ValueError("Source new order not found")
        
        # Create new order with same data
        new_order = NewOrder(
            vendor_id=source_order.vendor_id,
            trip_type=source_order.trip_type,
            car_type=source_order.car_type,
            pickup_drop_location=source_order.pickup_drop_location,
            start_date_time=source_order.start_date_time,
            end_date_time=getattr(source_order, 'end_date_time', None),
            customer_name=source_order.customer_name,
            customer_number=source_order.customer_number,
            cost_per_km=source_order.cost_per_km,
            extra_cost_per_km=source_order.extra_cost_per_km,
            driver_allowance=source_order.driver_allowance,
            extra_driver_allowance=source_order.extra_driver_allowance,
            permit_charges=source_order.permit_charges,
            extra_permit_charges=source_order.extra_permit_charges,
            hill_charges=source_order.hill_charges,
            toll_charges=source_order.toll_charges,
            pickup_notes=source_order.pickup_notes,
            trip_status="PENDING",
            pick_near_city=source_order.pick_near_city,
            trip_distance=source_order.trip_distance,
            trip_time=source_order.trip_time,
            platform_fees_percent=source_order.platform_fees_percent,
            estimated_price=source_order.estimated_price,
            vendor_price=source_order.vendor_price,
            location_links=getattr(source_order, 'location_links', None),
        )
        
        db.add(new_order)
        db.commit()
        db.refresh(new_order)
        
        # Create new master order
        new_master_order = create_master_from_new_order(
            db, 
            new_order, 
            max_time_to_assign_order=max_time_to_assign_order, 
            toll_charge_update=master_order.toll_charge_update
        )
        
        return {
            "order_id": new_master_order.id,
            "trip_status": new_master_order.trip_status,
            "pick_near_city": new_master_order.pick_near_city,
            "trip_type": new_master_order.trip_type.value,
            "vendor_price": new_master_order.vendor_price,
            "estimated_price": new_master_order.estimated_price,
            "trip_time": new_master_order.trip_time,
            "source": "NEW_ORDERS"
        }
        
    elif master_order.source == OrderSourceEnum.HOURLY_RENTAL:
        source_order = get_hourly_rental_by_id(db, master_order.source_order_id)
        if not source_order:
            raise ValueError("Source hourly rental not found")
        
        # Create new hourly rental with same data
        new_hourly_order = HourlyRental(
            vendor_id=source_order.vendor_id,
            trip_type=source_order.trip_type,
            car_type=source_order.car_type,
            pickup_drop_location=source_order.pickup_drop_location,
            start_date_time=source_order.start_date_time,
            customer_name=source_order.customer_name,
            customer_number=source_order.customer_number,
            package_hours=source_order.package_hours,
            cost_per_hour=source_order.cost_per_hour,
            extra_cost_per_hour=source_order.extra_cost_per_hour,
            cost_for_addon_km=source_order.cost_for_addon_km,
            extra_cost_for_addon_km=source_order.extra_cost_for_addon_km,
            pickup_notes=source_order.pickup_notes,
        )
        
        db.add(new_hourly_order)
        db.commit()
        db.refresh(new_hourly_order)
        
        # Create new master order
        new_master_order = create_master_from_hourly(
            db,
            new_hourly_order,
            pick_near_city=master_order.pick_near_city,
            trip_time=str(new_hourly_order.package_hours.get("hours", 0)),
            estimated_price=master_order.estimated_price,
            vendor_price=master_order.vendor_price,
            max_time_to_assign_order=max_time_to_assign_order,
            toll_charge_update=master_order.toll_charge_update,
            fare_type=master_order.fare_type.value if master_order.fare_type else "ITEMIZED",
        )

        return {
            "order_id": new_master_order.id,
            "order_status": new_master_order.trip_status,
            "picup_near_city": new_master_order.pick_near_city,
            "vendor_price": new_master_order.vendor_price,
            "estimated_price": new_master_order.estimated_price,
            "trip_type": new_master_order.trip_type.value,
            "trip_time": new_master_order.trip_time,
            "source": "HOURLY_RENTAL"
        }
    
    else:
        raise ValueError("Unknown order source type")


