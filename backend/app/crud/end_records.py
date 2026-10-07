from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timedelta
from app.models.end_records import EndRecord
from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
from app.models.orders import Order
from app.models.new_orders import NewOrder, OrderTypeEnum
from app.models.hourly_rental import HourlyRental
from app.models.car_driver import CarDriver, AccountStatusEnum
from app.models.vendor_details import VendorDetails
from app.models.orders import OrderTypeEnum
import math
from app.crud.notification import send_trip_status_notification_to_vendor_and_vehicle_owner

# Platform fee Drop Cars keeps out of a self-sourced booking's "vendor
# share" bonus (see the wallet-crediting block below) - previously 0%,
# meaning the platform earned nothing at all from a driver/owner posting
# and running their own trip, even with the usual commission not waived.
SELF_SOURCED_PLATFORM_FEE_PERCENT = 10


def multicity_waiting_charge(db, minutes, included_hours=None, days=1) -> int:
    """Rupees to bill for the waiting time a driver entered (in MINUTES) at the end of a multi-city trip.
    Before 2026-10-07 the minutes themselves were added to the fare as rupees (450 min = Rs 450), unchecked, even when waiting hours
    were already included in the booking. Now: waiting hours included in the booking are free, anything above the length of the trip
    is ignored, and the rate is a setting (multicity_waiting_rate_per_hour, default 60 = the old Rs 1 per minute;
    multicity_waiting_free_minutes, default 0)."""
    from app.crud.customer_booking_request import get_platform_setting_value as _gv

    def _num(key, default):
        try:
            return float(_gv(db, key, str(default)))
        except (TypeError, ValueError):
            return float(default)

    rate_per_hour = max(0.0, _num("multicity_waiting_rate_per_hour", 60))
    free_minutes = max(0, int(_num("multicity_waiting_free_minutes", 0))) + max(0, int(included_hours or 0)) * 60
    cap = max(1, int(days or 1)) * 24 * 60
    mins = max(0, min(int(minutes or 0), cap))
    billable = max(0, mins - free_minutes)
    return int(round(billable / 60.0 * rate_per_hour))


def _actual_trip_days(start_date_time, actual_end_time, cutoff_hour: int = 6) -> int:
    """Real days spanned by a Round Trip/Multi City, using a 6 AM cutoff
    instead of calendar midnight - a trip that starts at noon and wraps up
    at 2 AM is still "day 1" (nobody expects an extra day's charge for
    running a few hours late), but one that isn't closed out until past
    6 AM the next morning has genuinely eaten into a second day. Mirrors
    the quote-time day count (crud/new_orders.py:calculate_multisegment_fare)
    but against the ACTUAL close time instead of the originally quoted one."""
    if not start_date_time or not actual_end_time:
        return 1
    if start_date_time.tzinfo is not None:
        start_date_time = start_date_time.replace(tzinfo=None)
    if actual_end_time.tzinfo is not None:
        actual_end_time = actual_end_time.replace(tzinfo=None)
    if actual_end_time <= start_date_time:
        return 1
    anchor = start_date_time.replace(hour=cutoff_hour, minute=0, second=0, microsecond=0)
    if start_date_time.hour >= cutoff_hour:
        anchor += timedelta(days=1)
    days = 1
    boundary = anchor
    while actual_end_time > boundary:
        days += 1
        boundary += timedelta(days=1)
    return days


async def create_start_trip_record(
    db: Session,
    order_id: int,
    driver_id: str,
    start_km: int,
    speedometer_img_url: str
) -> EndRecord:
    """Create start trip record"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if order.trip_status == "CANCELLED":
        raise ValueError("The Trip is Already Cancelled and Cannot be able to Start It")
    # Check if driver is assigned to this order
    assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.driver_id == driver_id,
        OrderAssignment.assignment_status == AssignmentStatusEnum.ASSIGNED
    ).first()
    
    if not assignment:
        raise ValueError("Driver is not assigned to this order")
    
    # Check if trip already started
    existing_record = db.query(EndRecord).filter(
        EndRecord.order_id == order_id,
        EndRecord.driver_id == driver_id
    ).first()
    
    if existing_record:
        raise ValueError("Trip already started for this order")
    
    # Create start trip record
    trip_record = EndRecord(
        order_id=order_id,
        driver_id=driver_id,
        start_km=start_km,
        end_km=0,  # Will be updated when trip ends
        contact_number="",  # Will be updated when trip ends
        img_url=speedometer_img_url
    )
    
    db.add(trip_record)
    db.commit()
    db.refresh(trip_record)
    
    # Update assignment status to DRIVING
    assignment.assignment_status = AssignmentStatusEnum.DRIVING
    db.commit()
    
    # Update driver status to DRIVING
    driver = db.query(CarDriver).filter(CarDriver.id == driver_id).first()
    if driver:
        driver.driver_status = AccountStatusEnum.DRIVING
        db.commit()
    await send_trip_status_notification_to_vendor_and_vehicle_owner(db, order_id=order_id, status="started")
    return trip_record

class DistanceReasonRequired(ValueError):
    """Raised at trip close when the driven km is far from the real road distance and no reason was given yet."""

    def __init__(self, km_driven, route_km, allowed_min, allowed_max):
        self.km_driven, self.route_km, self.allowed_min, self.allowed_max = km_driven, route_km, allowed_min, allowed_max
        super().__init__(
            f"You drove {km_driven} km but this route is about {route_km} km. Please tell us why the distance is different."
        )


def build_customer_bill(db, order) -> dict:
    """The customer-facing bill for a finished trip: what the customer paid for and what is still to collect. Never
    contains the driver's fare, commission or any payout figure - the customer may be looking at the driver's phone."""
    from app.utils.commission import get_fee_settings
    from app.utils.fare_rules import get_fare_rules

    new_order = None
    if order.source and order.source.name == "NEW_ORDERS":
        new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
    er = db.query(EndRecord).filter(EndRecord.order_id == order.id).first()
    km_driven = (er.end_km - er.start_km) if (er and er.end_km and er.end_km > 0) else None

    billed_km = int(order.trip_distance or 0)
    if km_driven is not None:
        billed_km = km_driven
        if order.trip_type == OrderTypeEnum.ONEWAY:
            billed_km = max(km_driven, int(get_fare_rules()["oneway_min_km"]))
        elif order.trip_type in (OrderTypeEnum.ROUND_TRIP, OrderTypeEnum.MULTY_CITY):
            key = "round_trip_min_km_per_day" if order.trip_type == OrderTypeEnum.ROUND_TRIP else "multicity_min_km_per_day"
            billed_km = max(km_driven, int(get_fare_rules()[key]))

    conv = int(get_fee_settings(db).get("convenience_fee", 30))
    total = int(order.closed_vendor_price or order.vendor_price or 0)
    if not order.closed_vendor_price and order.source and order.source.name == "HOURLY_RENTAL":
        total += conv   # not closed yet: the quoted hourly price does not carry the convenience fee, the closed one does
    lines = []
    if new_order:
        rate = int(new_order.cost_per_km or 0) + int(new_order.extra_cost_per_km or 0)
        if rate and billed_km:
            lines.append({"label": f"Distance ({billed_km} km x Rs {rate})", "amount": rate * billed_km, "included": True})
        for label, amt in (
            ("Driver allowance", int(new_order.driver_allowance or 0) + int(new_order.extra_driver_allowance or 0)),
            ("Permit", int(new_order.permit_charges or 0) + int(new_order.extra_permit_charges or 0)),
            ("Hills charges", int(new_order.hill_charges or 0)),
            ("Toll", int(order.updated_toll_charges or 0) or int(new_order.toll_charges or 0)),
            ("Night charges", int(order.night_charges or 0)),
        ):
            if amt > 0:
                lines.append({"label": label, "amount": amt, "included": True})
    elif order.source and order.source.name == "HOURLY_RENTAL":
        hourly = db.query(HourlyRental).filter(HourlyRental.id == order.source_order_id).first()
        if hourly and hourly.package_hours:
            hours = int(hourly.package_hours.get("hours", 0))
            km_range = int(hourly.package_hours.get("km_range", 0))
            package_amt = (int(hourly.cost_per_hour or 0) + int(hourly.extra_cost_per_hour or 0)) * hours
            addon_rate = int(hourly.cost_for_addon_km or 0) + int(hourly.extra_cost_for_addon_km or 0)
            extra_km = max(0, (km_driven or 0) - km_range)
            if package_amt > 0:
                lines.append({"label": f"Package ({hours} hrs / {km_range} km)", "amount": package_amt, "included": True})
            if extra_km > 0 and addon_rate > 0:
                lines.append({"label": f"Extra distance ({extra_km} km x Rs {addon_rate})", "amount": extra_km * addon_rate, "included": True})
            if int(order.updated_toll_charges or 0) > 0:
                lines.append({"label": "Toll", "amount": int(order.updated_toll_charges), "included": True})
    lines_total = sum(l["amount"] for l in lines)
    residual = total - conv - lines_total
    if abs(residual) >= 1 and lines:
        lines.append({"label": "Other charges" if residual > 0 else "Adjustment", "amount": residual, "included": True})
    elif not lines:
        lines.append({"label": "Trip fare", "amount": max(0, total - conv), "included": True})
    lines.append({"label": "Convenience fee", "amount": conv, "included": True})

    excluded = [
        {"label": (i or {}).get("label"), "amount": None}
        for i in (getattr(order, "charge_items", None) or [])
        if isinstance(i, dict) and i.get("included") is False
    ]
    collected = {str((c or {}).get("label")): int((c or {}).get("amount") or 0) for c in (er.extra_charges_collected or [])} if er and er.extra_charges_collected else {}
    for e in excluded:
        if e["label"] in collected:
            e["amount"] = collected[e["label"]]
    advance = int(order.advance_received or 0)
    loc = order.pickup_drop_location or {}
    keys = sorted(loc.keys(), key=lambda k: int(k) if str(k).isdigit() else 0) if isinstance(loc, dict) else []
    return {
        "order_id": order.id,
        "trip_type": getattr(order.trip_type, "value", order.trip_type),
        "from": loc.get(keys[0]) if keys else None,
        "to": loc.get(keys[-1]) if len(keys) > 1 else None,
        "pickup_time": order.start_date_time.isoformat() if order.start_date_time else None,
        "km_driven": km_driven,
        "km_billed": billed_km,
        "lines": lines,
        "total": total,
        "advance_received": advance,
        "cash_to_collect": max(0, total - advance),
        "extra_charges_paid_directly": [e for e in excluded if e["amount"]],
        "extra_total": sum(e["amount"] or 0 for e in excluded),
    }


def _settle_trip(db, order, assignment, split, cash_collection, admin_id, total_km, trip_record) -> None:
    """Trip-close money movement for every non-hourly booking (vendor, driver-posted, website, admin).

    Everyone ends up with exactly their share of what the customer paid:
      driver   -> driver_net            (keeps his cash, wallet settles the difference)
      poster   -> poster_share          (the vendor / driver who posted it; the platform for website & admin)
      platform -> platform_fee          (app owner's income, out of the driver's earnings)
    The customer's advance is with the poster, the rest is cash in the driver's hand, so the wallet only moves the
    difference. The old flow debited the driver once at accept/close and AGAIN in the cash settlement (and never
    credited the second debit to anyone), and never credited the platform its cut on these bookings.
    """
    from app.crud.wallet import get_trip_hold, credit_wallet, debit_wallet_allow_negative, release_poster_advance_hold
    from app.crud.admin_wallet import credit_admin_wallet
    from app.models.wallet_ledger import WalletLedger

    order_id = order.id
    owner_id = str(assignment.vehicle_owner_id)
    advance = int(order.advance_received or 0)
    customer_total = int(split["customer_total"])
    driver_net = int(split["driver_net"])
    poster_share = int(split["poster_share"])
    platform_fee = int(split["platform_fee"])

    # Cash the driver collected from the customer; if not reported, assume the expected amount (total - advance)
    cash = int(cash_collection) if cash_collection is not None else max(0, customer_total - advance)

    # ---- driver: wallet difference between what he keeps and what his cash already covers
    hold = get_trip_hold(db, order_id, owner_id)
    if hold > 0:
        hold_entry = db.query(WalletLedger).filter(
            WalletLedger.vehicle_owner_id == assignment.vehicle_owner_id,
            WalletLedger.reference_id == str(order_id),
            WalletLedger.reference_type == "TRIP_HOLD",
        ).first()
        if hold_entry:
            hold_entry.notes = f"Settlement for Booking ID {order_id}"
    # net wallet movement owed for this trip = driver_net - cash (negative = driver hands money over)
    adjust = (driver_net - cash) + hold   # the hold is already debited, so add it back before applying the net
    if adjust > 0:
        credit_wallet(
            db, vehicle_owner_id=owner_id, amount=adjust, reference_id=str(order_id), reference_type="TRIP_COMPLETION",
            notes=f"Trip {order_id} settlement - you keep ₹{driver_net}, cash collected ₹{cash}" + (f" (₹{hold} held at accept returned)" if hold else ""),
        )
    elif adjust < 0:
        debit_wallet_allow_negative(
            db, vehicle_owner_id=owner_id, amount=-adjust, reference_id=str(order_id), reference_type="TRIP_COMPLETION",
            notes=f"Trip {order_id} settlement - you keep ₹{driver_net}, cash collected ₹{cash}" + (f" (₹{hold} already held)" if hold else ""),
        )

    # ---- vendor booking: the vendor's advance already sits in their wallet; move the difference to what they are owed
    vendor_id = str(order.vendor_id) if getattr(order, "vendor_id", None) else None
    poster_id = str(order.posted_by_vehicle_owner_id) if getattr(order, "posted_by_vehicle_owner_id", None) else None
    if vendor_id:
        from app.crud.vendor_wallet import (
            release_driver_payout_hold, credit_vendor_wallet, debit_vendor_wallet, get_vendor_wallet_balance,
        )
        # bookings accepted before this settlement existed may still carry the old payout-guarantee hold: give it back,
        # the driver is settled through his own wallet above
        try:
            release_driver_payout_hold(db, vendor_id=vendor_id, order_id=order_id,
                                       notes=f"Driver payout hold released - order {order_id} settled")
        except Exception as _e:
            print(f"payout hold release at settlement failed for order {order_id}: {_e}")
        vendor_delta = poster_share - advance
        if vendor_delta > 0:
            credit_vendor_wallet(db, vendor_id=vendor_id, amount=vendor_delta, order_id=order_id,
                                 notes=f"Trip {order_id} - your share ₹{poster_share}" + (f", ₹{advance} advance already in your wallet" if advance else ""))
        elif vendor_delta < 0:
            # the advance they hold is more than their share: the difference pays the driver. Capped at what the
            # wallet still has so a trip can never fail to close because the vendor already spent the advance.
            take = min(-vendor_delta, max(0, int(get_vendor_wallet_balance(db, vendor_id) or 0)))
            if take > 0:
                debit_vendor_wallet(db, vendor_id=vendor_id, amount=take, order_id=order_id,
                                    notes=f"Trip {order_id} - advance ₹{advance} is more than your share ₹{poster_share}; difference paid to the driver",
                                    reference_id=str(order_id), reference_type="TRIP_SETTLEMENT")
            if take < -vendor_delta:
                print(f"vendor {vendor_id} short by ₹{-vendor_delta - take} settling order {order_id}")
        if platform_fee > 0 and admin_id:
            credit_admin_wallet(db, admin_id=admin_id, amount=platform_fee, order_id=order_id,
                                notes=f"Platform fee on Booking {order_id}")
    # ---- poster: entitled to poster_share, already holds the advance in cash
    elif poster_id:
        # the advance hold was only an earmark on their wallet - give it back first, then settle the difference
        release_poster_advance_hold(db, order, "trip completed")
        poster_delta = poster_share - advance
        if poster_delta > 0:
            credit_wallet(
                db, vehicle_owner_id=poster_id, amount=poster_delta, reference_id=str(order_id), reference_type="POSTER_SHARE",
                notes=f"Your share of Booking {order_id} (₹{poster_share}" + (f", less ₹{advance} advance you already hold)" if advance else ")"),
            )
        elif poster_delta < 0:
            debit_wallet_allow_negative(
                db, vehicle_owner_id=poster_id, amount=-poster_delta, reference_id=str(order_id), reference_type="POSTER_SHARE",
                notes=f"Booking {order_id}: the ₹{advance} advance you hold is more than your ₹{poster_share} share - difference paid on to the driver",
            )
        if platform_fee > 0 and admin_id:
            credit_admin_wallet(db, admin_id=admin_id, amount=platform_fee, order_id=order_id,
                                notes=f"Platform fee on Booking {order_id}")
    else:
        # website / admin booking: the platform is the poster, so it gets both shares
        platform_total = platform_fee + poster_share
        if platform_total > 0 and admin_id:
            credit_admin_wallet(db, admin_id=admin_id, amount=platform_total, order_id=order_id,
                                notes=f"Platform income on Booking {order_id} (fee ₹{platform_fee} + share ₹{poster_share})")

    try:
        from app.crud.cash_audit import flag_if_mismatch
        flag_if_mismatch(db, trip_record, max(0, customer_total - advance), cash)
    except Exception:
        pass


async def update_end_trip_record(
    db: Session,
    order_id: int,
    driver_id: str,
    end_km: int,
    *,
    # toll_charge_update: bool = False,
    updated_toll_charges: int | None = None,
    close_speedometer_image_url: str = None,
    waiting_time: int | None = None,
    cash_collection: int | None = None,
    extra_charges_collected: list | None = None,
    distance_reason: str | None = None,
) -> dict:
    """Update end trip record and calculate fare"""
    # Get the trip record, locked for the rest of this transaction - two
    # concurrent end-trip calls for the same order (e.g. a client retry
    # after a slow response, while the first request is still in flight)
    # could otherwise both read end_km == 0 and both run the full profit
    # split + wallet crediting below, double-processing one real trip.
    trip_record = db.query(EndRecord).filter(
        EndRecord.order_id == order_id,
        EndRecord.driver_id == driver_id
    ).with_for_update().first()

    if not trip_record:
        raise ValueError("Trip record not found")

    if trip_record.end_km > 0:
        raise ValueError("Trip already ended")
    # print("Hello")
    # Update trip record
    trip_record.end_km = end_km
    trip_record.close_speedometer_image = close_speedometer_image_url  # Add close speedometer image
    trip_record.cash_collection = cash_collection
    trip_record.extra_charges_collected = extra_charges_collected

    # Calculate fare
    total_km = end_km - trip_record.start_km
    if total_km < 0:
        raise ValueError("End KM cannot be less than start KM")
    # Distance check against the REAL road distance (not the billed minimum coverage): +/-20% (at least 10 km) is
    # fine. Outside that the trip is NOT blocked any more - the driver must give a reason, which is stored and sent to
    # the vendor + admin. (Old rule blocked anything outside planned +/-50 km, where "planned" was the 130 km minimum
    # coverage, so a genuine 60 km trip could never be closed.)
    _distance_flag = False
    if order := db.query(Order).filter(Order.id == order_id).first():
        _real_km = None
        try:
            if order.source and order.source.name == "NEW_ORDERS":
                _no = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
                _real_km = int(getattr(_no, "calculated_trip_distance", 0) or 0) or None
        except Exception:
            _real_km = None
        if _real_km is None and order.trip_distance is not None:
            _real_km = int(order.trip_distance)
        if _real_km:
            _tol = max(10, int(round(_real_km * 0.2)))
            _lo, _hi = _real_km - _tol, _real_km + _tol
            if total_km < _lo or total_km > _hi:
                if not (distance_reason or "").strip():
                    raise DistanceReasonRequired(total_km, _real_km, _lo, _hi)
                _distance_flag = True
                trip_record.distance_flagged = True
                trip_record.distance_reason = distance_reason.strip()[:500]
    
    if order.trip_status == "CANCELLED":
        raise ValueError("The Trip is Already Cancelled and Cannot stop the Trip")
    # Get order details for fare calculation
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise ValueError("Order not found")
    
    if order.toll_charge_update == True:
        # print("Toll charge update already applied, cannot update again",order.toll_charge_update)
        if updated_toll_charges is  None or not(updated_toll_charges >= 0):
            raise ValueError("You Must Enter the Toll charges for this order")
    
    # Calculate fare based on order pricing
    calculated_fare = order.estimated_price or 0
    # admin_commission = 0
    if order.source and order.source.name == "HOURLY_RENTAL":
        # Fetch hourly rental pricing data
        hourly = db.query(HourlyRental).filter(HourlyRental.id == order.source_order_id).first()
        if not hourly:
            raise ValueError("Hourly rental source order not found")

        hours_selected = int(hourly.package_hours.get("hours", 0))
        included_km_range = int(hourly.package_hours.get("km_range", 0))
        balance_km = max(0, int(total_km) - included_km_range)

        vendor_total = (
            (int(hourly.cost_per_hour) + int(hourly.extra_cost_per_hour)) * hours_selected
        ) + (
            balance_km * (int(hourly.cost_for_addon_km) + int(hourly.extra_cost_for_addon_km))
        )

        estimated_total = (
            int(hourly.cost_per_hour) * hours_selected
        ) + (
            balance_km * int(hourly.cost_for_addon_km)
        )

        # Apply toll charge updates equally if provided
        if order.toll_charge_update and updated_toll_charges is not None:
            estimated_total += int(updated_toll_charges)
            vendor_total += int(updated_toll_charges)
        elif order.toll_charge_update and updated_toll_charges is None:
            # If update flag is true but value missing, block
            raise ValueError("Updated toll charges must be provided when toll_charge_update is true")

        # Admin profit: 10% of (vendor - estimate)
        diff = max(0, int(vendor_total) - int(estimated_total))
        admin_commission = int(round(diff * 0.10))

        calculated_fare = int(vendor_total)
    else:
        # Note: Orders table doesn't have detailed pricing, using estimated_price for non-hourly
        base_fare = order.estimated_price or 0
        calculated_fare = base_fare

    # Apply toll updates if provided
    if order.toll_charge_update == True:
        # order.toll_charge_update = True
        if updated_toll_charges is not None:
            order.updated_toll_charges = updated_toll_charges
            if not (order.source and order.source.name == "HOURLY_RENTAL"):
                calculated_fare = (order.estimated_price or 0) + updated_toll_charges
        else:
            # Missing toll charges when flag is true
            raise ValueError("Updated toll charges must be provided when toll_charge_update is true")
    else:
        # order.toll_charge_update = False
        order.updated_toll_charges = None
    
    # If waiting time provided and trip type is Multy City, store it
    if waiting_time is not None and order.trip_type == OrderTypeEnum.MULTY_CITY:
        try:
            order.waiting_minutes = int(waiting_time)   # the rupee charge is worked out (and stored in waiting_time) below
        except Exception:
            order.waiting_minutes = None

    # Vendor-less bookings (driver-posted / website / admin) settle with the shared commission split - see
    # utils/commission.py and _settle_trip below. Vendor bookings and Hourly Rental keep their own path.
    use_new_settlement = False
    _split = None
    # Hourly Rental convenience fee (same Rs 30 setting as every other booking): added to the customer's bill, collected
    # in cash by the driver, settled to the platform out of the driver's wallet. Vendor/admin commission is untouched.
    hourly_conv = 0

    # Update order with final amounts, profits, and status

    # order.closed_vendor_price = int(calculated_fare)
    if order.source and order.source.name == "HOURLY_RENTAL":
        # Reuse estimated_total/vendor_total from hourly branch
        # Vendor profit per spec: (vendor_total - estimated_total) + 10% of (cost_per_km * updated_km)
        hours_selected = int(hourly.package_hours.get("hours", 0))
        included_km_range = int(hourly.package_hours.get("km_range", 0))


        balance_km = max(0, int(total_km) - included_km_range)
        # extra_vendor_component = int(round((int(hourly.cost_for_addon_km) * int(total_km)) * 0.10))
        # vendor_profit = max(0, int(vendor_total) - int(estimated_total)) + extra_vendor_component

        # admin_profit = int(round(vendor_profit * 0.10))
        # # Driver profit is the remainder from estimated side as per spec
        # driver_profit = max(0, int(estimated_total) - admin_profit)

        # commission_waived (the "10% CC" poster toggle - see the ITEMIZED
        # branch's own comment below) was never checked here, so an hourly
        # booking posted with commission waived still had admin_profit
        # taken anyway - that share belongs to the driver instead when the
        # flag is set, same as every other fare type.
        commission_waived = bool(getattr(order, "commission_waived", False))
        commision_amount = 0 if commission_waived else order.platform_fees_percent
        cal_driver_price = (hourly.cost_per_hour * hours_selected) + (balance_km * hourly.cost_for_addon_km)
        cal_vendor_price = ((hourly.cost_per_hour + hourly.extra_cost_per_hour) * hours_selected) + (balance_km * (hourly.cost_for_addon_km + hourly.extra_cost_for_addon_km))

        cal_vendor_profit = (cal_vendor_price - cal_driver_price)
        cal_admin_profit = 0 if commission_waived else math.ceil(cal_vendor_profit * (commision_amount/100))


        # Python's `A if C else B` binds looser than `+`, so the previous
        # form `x + int(toll) if cond else 0` parsed as
        # `(x + int(toll)) if cond else 0` - on the common path (no toll
        # update, the normal case), that evaluated the WHOLE expression to
        # a bare 0, wiping out closed_vendor_price/closed_driver_price and
        # (critically) driver_profit on every hourly trip without a toll
        # update. driver_profit feeding into cash settlement as 0 then
        # over-debited the vehicle owner's wallet for the driver's entire
        # cash collection. Parenthesized correctly below.
        toll_addon = int(updated_toll_charges) if updated_toll_charges and int(updated_toll_charges) > 0 else 0
        from app.utils.commission import convenience_fee_amount
        hourly_conv = convenience_fee_amount(db)
        order.closed_vendor_price = cal_vendor_price + toll_addon + hourly_conv
        order.closed_driver_price = cal_driver_price + toll_addon
        vendor_profit = cal_vendor_profit - cal_admin_profit
        admin_profit = cal_admin_profit
        order.vendor_profit = vendor_profit
        order.admin_profit = cal_admin_profit
        order.driver_profit = cal_vendor_price - cal_vendor_profit + toll_addon
        order.commision_amount = commision_amount
    else:

        #New Custom Verification
        new_order = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
        if not new_order:
            raise ValueError("New order not found")
        cost_per_km = new_order.cost_per_km
        extra_cost_per_km = new_order.extra_cost_per_km
        driver_allowance = new_order.driver_allowance
        extra_driver_allowance = new_order.extra_driver_allowance
        permit_charges = new_order.permit_charges
        extra_permit_charges = new_order.extra_permit_charges
        hill_charges = new_order.hill_charges
        toll_charges = order.updated_toll_charges if order.updated_toll_charges else new_order.toll_charges
        updated_km = total_km
        night_charges = order.night_charges if order.night_charges > 0 else 0

        # MINIMUM COVERAGE: the booking was quoted on a minimum billable distance (Oneway: oneway_min_km, e.g. 130;
        # Round Trip / Multi City: min km per day, e.g. 250). The quote already assumes it, but the trip-close bill
        # used the raw odometer km - a short trip (80 km on a 130 km-minimum booking) was billed for 80 km and the
        # customer/driver/vendor all lost the difference. The bill is never below the minimum coverage.
        from app.utils.fare_rules import get_fare_rules as _get_fare_rules
        _min_rules = _get_fare_rules()
        if order.trip_type == OrderTypeEnum.ONEWAY:
            updated_km = max(updated_km, int(_min_rules["oneway_min_km"]))

        # Round Trip / Multi City that actually ran into a second day (past
        # the 6 AM cutoff) - the driver allowance and minimum-km floor were
        # only ever priced for the originally quoted single day at booking
        # time. Scale both to the ACTUAL day count so an overrun trip bills
        # correctly instead of quietly absorbing the extra day for free.
        if order.trip_type in (OrderTypeEnum.ROUND_TRIP, OrderTypeEnum.MULTY_CITY):
            actual_days = max(1, _actual_trip_days(order.start_date_time, datetime.utcnow()))
            min_km_key = "round_trip_min_km_per_day" if order.trip_type == OrderTypeEnum.ROUND_TRIP else "multicity_min_km_per_day"
            min_km_total = _min_rules[min_km_key] * actual_days   # floor applies from day 1, not only on overrun days
            if updated_km < min_km_total:
                updated_km = min_km_total
            if actual_days > 1:
                driver_allowance = driver_allowance * actual_days
                extra_driver_allowance = extra_driver_allowance * actual_days

        print("Total Km is ",total_km)
        waiting_charge = 0
        if waiting_time is not None and order.trip_type == OrderTypeEnum.MULTY_CITY:
            waiting_charge = multicity_waiting_charge(
                db, waiting_time,
                getattr(order, "waiting_hours_included", None) or getattr(new_order, "waiting_hours_included", None),
                actual_days if order.trip_type in (OrderTypeEnum.ROUND_TRIP, OrderTypeEnum.MULTY_CITY) else 1,
            )
            order.waiting_time = waiting_charge
        closed_vendor_price = ((cost_per_km+extra_cost_per_km)*updated_km) + (driver_allowance+extra_driver_allowance) + (permit_charges+extra_permit_charges) + (hill_charges) + (toll_charges) + (night_charges) + waiting_charge
        closed_driver_price = ((cost_per_km)*updated_km) + (driver_allowance) + (permit_charges) + (hill_charges) + (toll_charges) + (night_charges) + waiting_charge

        # All-Inclusive Commission Rule: vendor_profit = Extra Amount, admin_profit = 5% of Total Booking Amount
        from app.utils.commission import enum_value as _ev
        is_all_inclusive = _ev(getattr(order, "fare_type", None)) == "ALL_INCLUSIVE" or _ev(getattr(new_order, "fare_type", None)) == "ALL_INCLUSIVE"

        # "10% CC" toggle (added 2026-09-04) - the poster (currently only
        # Driver App's own-created bookings, see driver_create_booking_confirm)
        # switched OFF the platform's usual commission for this specific
        # booking. Skips taking admin_profit entirely below, in both branches
        # - that share goes to the driver instead, not withheld anywhere.
        commission_waived = bool(getattr(order, "commission_waived", False) or getattr(new_order, "commission_waived", False))

        _vendor_id = getattr(order, "vendor_id", None) or getattr(new_order, "vendor_id", None)
        # every non-hourly booking now settles with the shared commission split (vendor bookings included)
        if True:
            from app.utils.commission import (
                resolve_commission_class, compute_split, get_commission_rates, get_trip_category, get_fee_settings, fees_for_order,
                CLASS_STANDARD, CLASS_POSTER_ALL_INCLUSIVE,
            )
            _cls = resolve_commission_class(
                fare_type=getattr(order, "fare_type", None) or getattr(new_order, "fare_type", None),
                vendor_id=_vendor_id,
                posted_by_vehicle_owner_id=getattr(order, "posted_by_vehicle_owner_id", None),
                stored=getattr(order, "commission_class", None),
            )
            if _cls == CLASS_STANDARD:
                _tier = (
                    db.query(OrderAssignment.accepted_tier)
                    .filter(OrderAssignment.order_id == order_id, OrderAssignment.driver_id == driver_id)
                    .scalar()
                )
                _cat = get_trip_category(order)
                _rates = get_commission_rates(db, _cat, _tier)
                _driver_fare = closed_driver_price
                _fees = get_fee_settings(db)
                _split = compute_split(
                    _cls, driver_fare=_driver_fare, base_fare=cost_per_km * updated_km,
                    extras=max(0, closed_vendor_price - closed_driver_price),
                    cc_total_pct=_rates["vendor"] + _rates["admin"], cc_on=not commission_waived, fees=_fees,
                    cc_min=(0 if _cat == "LOCAL" else int(_fees.get("commission_min", 200))),
                    pct_override=getattr(order, "commission_percent", None),
                )
                commision_amount = 0 if commission_waived else (getattr(order, "commission_percent", None) if getattr(order, "commission_percent", None) is not None else (_rates["vendor"] + _rates["admin"]))
                closed_driver_price = _driver_fare
            else:
                _total_booking = (
                    getattr(order, "total_booking_amount", None) or getattr(new_order, "total_booking_amount", None)
                    or (closed_vendor_price if _cls == CLASS_POSTER_ALL_INCLUSIVE else (getattr(order, "vendor_price", None) or closed_vendor_price))
                    or 0
                )
                _markup = (getattr(order, "extra_amount", None) or getattr(new_order, "extra_amount", None) or 0) if _cls == CLASS_POSTER_ALL_INCLUSIVE else 0
                _split = compute_split(_cls, total_booking=_total_booking, markup=_markup, cc_on=not commission_waived, fees=fees_for_order(db, order_id, _cls, get_fee_settings(db)),
                                       pct_override=getattr(order, "commission_percent", None))
                commision_amount = _split["fee_pct"]
                closed_driver_price = _split["driver_net"]
            closed_vendor_price = _split["customer_total"]
            vendor_profit = _split["poster_share"]
            admin_profit = _split["platform_fee"]
            driver_profit = _split["driver_net"]
            use_new_settlement = True
        elif is_all_inclusive:
            total_booking = getattr(order, "total_booking_amount", None) or getattr(new_order, "total_booking_amount", None) or closed_vendor_price or 0
            extra_amt = getattr(order, "extra_amount", None) or getattr(new_order, "extra_amount", None) or 0

            # Commission Rule:
            # Vendor-posted booking: 2% platform fee
            # Website / Direct / Drop Bid booking: 15% platform fee (5% GST + 10% maintenance/profit)
            is_vendor_booking = bool(getattr(order, "vendor_id", None) or getattr(new_order, "vendor_id", None))
            comm_rate = 0.02 if is_vendor_booking else 0.15
            comm_pct = 2 if is_vendor_booking else 15

            vendor_profit = extra_amt
            admin_profit = 0 if commission_waived else math.ceil(total_booking * comm_rate)
            driver_profit = max(0, total_booking - admin_profit)
            closed_vendor_price = total_booking + extra_amt
            closed_driver_price = driver_profit
            commision_amount = 0 if commission_waived else comm_pct
        else:
            from app.utils.commission import get_commission_rates, get_trip_category
            # accepted_tier lives on OrderAssignment (set at accept time),
            # not anywhere in scope here - this was referencing a name that
            # was never defined, raising NameError on every single itemized
            # (non-hourly, non-ALL_INCLUSIVE) trip close, i.e. the majority
            # of real trips. `assignment` is re-queried again below for the
            # wallet operations; fetching accepted_tier this way avoids
            # duplicating that whole query just for one field.
            accepted_tier = (
                db.query(OrderAssignment.accepted_tier)
                .filter(OrderAssignment.order_id == order_id, OrderAssignment.driver_id == driver_id)
                .scalar()
            )
            rates = get_commission_rates(db, get_trip_category(order), accepted_tier)
            base_amount = cost_per_km * updated_km
            vendor_profit = math.ceil(base_amount * rates["vendor"] / 100)
            admin_profit = 0 if commission_waived else math.ceil(base_amount * rates["admin"] / 100)
            commision_amount = 0 if commission_waived else rates["admin"]
            driver_profit = closed_vendor_price - vendor_profit - admin_profit

        # Set final computed profits on order
        order.closed_vendor_price = closed_vendor_price
        order.vendor_profit = vendor_profit
        order.admin_profit = admin_profit
        order.driver_profit = driver_profit
        order.closed_driver_price = closed_driver_price
        order.commision_amount = commision_amount
        print("Admin profit", admin_profit)
        print("Driver profit", driver_profit)
        print("Vendor profit", vendor_profit)
    order.trip_status = "COMPLETED"  # Update order status to completed

    # Push completed status and odometer KM to website for live sync
    try:
        from app.utils.website_status_webhook import notify_website_of_status
        notify_website_of_status(
            db=db,
            order_id=order_id,
            status="COMPLETED",
            actual_distance=total_km,
            starting_km=getattr(trip_record, "start_km", None),
            closing_km=end_km,
            toll_charges=getattr(order, "updated_toll_charges", None) or getattr(order, "toll_charges", None),
            final_fare=getattr(order, "closed_vendor_price", None),
        )
    except Exception as _e:
        print(f"notify_website_of_status COMPLETED error: {_e}")
    
    # Get assignment to find fleet owner
    assignment = db.query(OrderAssignment).filter(
        OrderAssignment.order_id == order_id,
        OrderAssignment.driver_id == driver_id
    ).first()
    
    if assignment:
        # Debit amount from fleet owner
        from app.crud.wallet import debit_wallet
        from app.crud.vendor_wallet import credit_vendor_wallet
        from app.models.wallet_ledger import WalletEntryTypeEnum
        
        if not use_new_settlement:
            try:
                print("check vendor profit")
                # HOLD-aware settlement: commission+extras were already HELD at
                # accept. Only settle the DIFFERENCE between the final amount and
                # the hold (actual km can change the final figure). Orders
                # accepted before the hold system existed have hold=0 and are
                # debited in full as before.
                from app.crud.wallet import get_trip_hold, credit_wallet, debit_wallet_allow_negative
                final_amount = vendor_profit + admin_profit + hourly_conv   # hourly_conv is 0 except Hourly Rental
                hold = get_trip_hold(db, order_id, str(assignment.vehicle_owner_id))
                delta = final_amount - hold

                # The original accept-time hold entry still reads "Debited for
                # Booking X" (a pending, possibly-refundable state). Now that the
                # trip has actually completed, that amount is confirmed commission
                # - correct the entry in place so the wallet history reflects the
                # real outcome instead of staying stuck on the pending wording.
                if hold > 0:
                    from app.models.wallet_ledger import WalletLedger
                    hold_entry = db.query(WalletLedger).filter(
                        WalletLedger.vehicle_owner_id == assignment.vehicle_owner_id,
                        WalletLedger.reference_id == str(order_id),
                        WalletLedger.reference_type == "TRIP_HOLD",
                    ).first()
                    if hold_entry:
                        hold_entry.notes = f"Commission for Booking ID {order_id}"
                if delta > 0:
                    debit_wallet_allow_negative(
                        db,
                        vehicle_owner_id=str(assignment.vehicle_owner_id),
                        amount=delta,
                        reference_id=str(order_id),
                        reference_type="TRIP_COMPLETION",
                        notes=f"Trip completion - {total_km} km" + (f" (₹{hold} already held)" if hold else "")
                    )
                elif delta < 0:
                    credit_wallet(
                        db,
                        vehicle_owner_id=str(assignment.vehicle_owner_id),
                        amount=-delta,
                        reference_id=str(order_id),
                        reference_type="TRIP_COMPLETION",
                        notes=f"Trip completion adjustment - held ₹{hold}, final ₹{final_amount}"
                    )
            except ValueError as e:
                raise ValueError(f"Wallet debit failed: {str(e)}")
            
        # Get admin_id (use first admin)
        from app.models.admin import Admin
        admin = db.query(Admin).first()
        admin_id = str(admin.id) if admin else None

        if use_new_settlement:
            _settle_trip(db, order, assignment, _split, cash_collection, admin_id, total_km, trip_record)
        elif hourly_conv > 0 and admin_id:
            # the driver's wallet was debited for it above (final_amount); the platform receives it here
            from app.crud.admin_wallet import credit_admin_wallet
            credit_admin_wallet(db, admin_id=admin_id, amount=hourly_conv, order_id=order_id,
                                notes=f"Convenience fee on Hourly Rental Booking {order_id}")

        # Credit vendor wallet with vendor_profit, OR credit Fleet Owner wallet if driver-created/self-sourced.
        # This used to be a broad `except Exception: print(...)` that
        # swallowed any failure here - the vehicle owner's debit above had
        # already been applied to this same (uncommitted) session, so a
        # crash in THIS block used to still reach the final db.commit(),
        # persisting the owner's debit with no matching vendor/admin
        # credit: real money silently lost. Only genuinely skip this when
        # there's really nothing to credit (vendor_profit <= 0, e.g. fully
        # commission-waived) - any other failure must abort the whole
        # trip-close (uncommitted session, so it rolls back cleanly)
        # rather than complete with half the money moved.
        if not use_new_settlement:
            vendor_profit_amount = int(order.vendor_profit or 0)
            if vendor_profit_amount > 0:
                if getattr(order, "created_by_role", None) == "DRIVER" or not order.vendor_id:
                    # Self-sourced booking: this vendor_profit_amount is the
                    # commission share that would normally go to an external
                    # vendor for arranging the trip - since the driver/owner
                    # found this customer themselves, they earn that share as a
                    # posting bonus (on top of their normal driver_profit,
                    # already settled via cash collection above). This used to
                    # credit the FULL amount with zero platform cut, meaning
                    # Drop Cars earned nothing at all from a self-sourced trip
                    # even when its usual commission_waived=False. A small
                    # platform fee out of THIS bonus (not the driver's base
                    # earning) is deducted here instead, unless the poster's own
                    # "10% CC" toggle waived commission entirely for this
                    # booking, in which case they keep the bonus in full too.
                    # The poster and the driver who ends up accepting/driving
                    # can now be two different people (Driver App's Create
                    # Booking broadcasts to the open pool instead of self-
                    # assigning - see order_assignments.py's
                    # driver_create_booking_confirm) - the posting bonus goes to
                    # whoever ORIGINALLY POSTED it (order.posted_by_vehicle_owner_id),
                    # not assignment.vehicle_owner_id, which is just whoever
                    # accepted. Falls back to assignment.vehicle_owner_id for an
                    # Admin platform booking (no vendor, no original poster -
                    # posted_by_vehicle_owner_id is null there), where whoever
                    # drove it is the only sensible recipient, same as before.
                    bonus_recipient_owner_id = str(getattr(order, "posted_by_vehicle_owner_id", None) or assignment.vehicle_owner_id)
                    platform_fee = 0 if commission_waived else math.ceil(vendor_profit_amount * SELF_SOURCED_PLATFORM_FEE_PERCENT / 100)
                    bonus_after_fee = vendor_profit_amount - platform_fee
                    if bonus_after_fee > 0:
                        credit_wallet(
                            db,
                            vehicle_owner_id=bonus_recipient_owner_id,
                            amount=bonus_after_fee,
                            reference_id=str(order_id),
                            reference_type="VENDOR_SHARE_SELF_SOURCED",
                            notes=f"Vendor Share - Self-Sourced Booking for Trip {order_id}"
                            + (f" (after {SELF_SOURCED_PLATFORM_FEE_PERCENT}% platform fee)" if platform_fee > 0 else "")
                        )
                    if platform_fee > 0 and admin_id:
                        from app.crud.admin_wallet import credit_admin_wallet
                        credit_admin_wallet(
                            db,
                            admin_id=admin_id,
                            amount=platform_fee,
                            order_id=order_id,
                            notes=f"Platform fee on self-sourced booking bonus for Trip {order_id}",
                        )
                else:
                    credit_vendor_wallet(
                        db,
                        vendor_id=str(order.vendor_id),
                        amount=vendor_profit_amount,
                        order_id=order_id,
                        notes=f"Trip {order_id} vendor profit",
                        deduct_admin_profit=True,
                        admin_profit=int(order.admin_profit or 0) if order.admin_profit else None,
                        admin_id=admin_id
                    )

                    # Check if Vendor Wallet had a DRIVER_PAYOUT_HOLD for this trip
                    from app.models.vendor_wallet_ledger import VendorWalletLedger
                    vendor_hold = db.query(VendorWalletLedger).filter(
                        VendorWalletLedger.vendor_id == order.vendor_id,
                        VendorWalletLedger.reference_id == str(order_id),
                        VendorWalletLedger.reference_type == "DRIVER_PAYOUT_HOLD"
                    ).first()
                    if vendor_hold and abs(int(vendor_hold.amount or 0)) > 0:
                        held_payout = abs(int(vendor_hold.amount))
                        credit_wallet(
                            db,
                            vehicle_owner_id=str(assignment.vehicle_owner_id),
                            amount=held_payout,
                            reference_id=str(order_id),
                            reference_type="DRIVER_PAYOUT_GUARANTEE",
                        )

        if not use_new_settlement:
            # Cash settlement: the driver physically collects (closed_vendor_price
            # - advance_received) in cash, but is only entitled to driver_profit.
            # cash_collection is self-reported at trip end - whatever the gap is,
            # signed, becomes a wallet credit (under-collected, owed to the
            # driver) or debit (over-collected, owed back to the platform).
            if cash_collection is not None:
                settlement = int(order.driver_profit or 0) - int(cash_collection)
                try:
                    if settlement > 0:
                        credit_wallet(
                            db,
                            vehicle_owner_id=str(assignment.vehicle_owner_id),
                            amount=settlement,
                            reference_id=str(order_id),
                            reference_type="TRIP_SETTLEMENT_BALANCE",
                            notes=f"Trip {order_id} settlement - cash collected ₹{cash_collection}, owed ₹{order.driver_profit}",
                        )
                    elif settlement < 0:
                        debit_wallet_allow_negative(
                            db,
                            vehicle_owner_id=str(assignment.vehicle_owner_id),
                            amount=-settlement,
                            reference_id=str(order_id),
                            reference_type="TRIP_SETTLEMENT_BALANCE",
                            notes=f"Trip {order_id} settlement - cash collected ₹{cash_collection} exceeds ₹{order.driver_profit} owed",
                        )
                except ValueError as e:
                    raise ValueError(f"Cash settlement failed: {str(e)}")

                try:
                    from app.crud.cash_audit import flag_if_mismatch
                    flag_if_mismatch(db, trip_record, order.driver_profit or 0, cash_collection)
                except Exception:
                    pass

        # Update assignment status to COMPLETED
        assignment.assignment_status = AssignmentStatusEnum.COMPLETED
        assignment.completed_at = datetime.utcnow()

        # Driver-posted booking with an advance: the poster's hold has done
        # its job - return it (a no-op for every other booking).
        from app.crud.wallet import release_poster_advance_hold
        release_poster_advance_hold(db, order, "trip completed")

        # Referral bonus: pays the REFERRER, only on this owner's first
        # completed trip (see crud/referrals.py). Never blocks trip
        # completion if it fails for any reason.
        try:
            from app.crud.referrals import credit_referral_bonus_if_eligible
            credit_referral_bonus_if_eligible(db, assignment.vehicle_owner_id)
        except Exception:
            pass

        # Customer referral bonus: pays the DRIVER whose code the customer
        # entered at booking time, only on that customer's first completed
        # trip via that code (see crud/referrals.py). Never blocks trip
        # completion if it fails for any reason.
        try:
            from app.models.customer_booking_request import CustomerBookingRequest
            from app.crud.referrals import credit_customer_referral_bonus_if_eligible
            cbr = db.query(CustomerBookingRequest).filter(
                CustomerBookingRequest.linked_order_id == order_id
            ).first()
            if cbr and cbr.driver_referral_code:
                credit_customer_referral_bonus_if_eligible(db, cbr)
        except Exception:
            pass

        # Settlement email - never blocks trip completion if it fails.
        try:
            from app.utils.trip_emails import send_trip_completed_email
            settlement_amount = (
                int(order.driver_profit or 0) - int(cash_collection)
                if cash_collection is not None else None
            )
            send_trip_completed_email(
                db,
                assignment.vehicle_owner_id,
                order_id,
                int(order.driver_profit or 0),
                cash_collection,
                settlement_amount,
            )
        except Exception:
            pass

    # Update driver status back to ONLINE
    driver = db.query(CarDriver).filter(CarDriver.id == driver_id).first()
    if driver:
        driver.driver_status = AccountStatusEnum.ONLINE
        db.commit()
    
    db.commit()
    db.refresh(trip_record)
    await send_trip_status_notification_to_vendor_and_vehicle_owner(db, order_id=order_id, status="ended")
    if _distance_flag:
        # distance was outside +/-20% of the real route: tell the poster and the admin (the driver's reason is stored)
        try:
            from app.crud.notification import send_push_notification_to_admin, notify_booking_poster
            _msg = f"Booking {order_id}: driver drove {total_km} km on a route of about {getattr(trip_record, 'distance_reason', '') and ''}"
            _msg = f"Booking {order_id}: driver reported {total_km} km, different from the route distance. Reason: {trip_record.distance_reason}"
            await send_push_notification_to_admin(db, "Distance check", _msg)
            _o = db.query(Order).filter(Order.id == order_id).first()
            if _o:
                notify_booking_poster(db, _o, "Distance check", _msg)
        except Exception as _e:
            print(f"distance notification failed (trip already closed): {_e}")
    return {
        "trip_record": trip_record,
        "total_km": total_km,
        # "calculated_fare": calculated_fare,
        # "driver_amount": int(calculated_fare * 0.7),
        # "vehicle_owner_amount": int(calculated_fare * 0.3)
    }

def get_driver_trip_history(db: Session, driver_id: str) -> List[dict]:
    """Get driver's trip history"""
    trip_records = db.query(EndRecord).filter(
        EndRecord.driver_id == driver_id,
        EndRecord.end_km > 0  # Only completed trips
    ).order_by(EndRecord.created_at.desc()).all()
    
    result = []
    for record in trip_records:
        # Get order details
        order = db.query(Order).filter(Order.id == record.order_id).first()
        if order:
            total_km = record.end_km - record.start_km
            result.append({
                "id": record.id,
                "order_id": record.order_id,
                "customer_name": order.customer_name,
                "customer_number": order.customer_number,
                "start_km": record.start_km,
                "end_km": record.end_km,
                "total_km": total_km,
                "contact_number": record.contact_number,
                "img_url": record.img_url,
                "created_at": record.created_at,
                "trip_type": order.trip_type.value if order.trip_type else "Unknown",
                "estimated_price": order.estimated_price
            })
    
    return result


TRIP_PHOTO_RETENTION_DAYS = 90


def purge_old_trip_photos(db: Session, limit: int = 200) -> int:
    """3 months after a trip the odometer photos are deleted from storage and the database to save space. The trip
    RECORD stays (start km, end km, cash collected...) - only the pictures go. img_url is NOT NULL, so a purged photo
    is stored as an empty string."""
    from datetime import timezone
    from app.utils.gcs import delete_gcs_file_by_url

    cutoff = datetime.now(timezone.utc) - timedelta(days=TRIP_PHOTO_RETENTION_DAYS)
    rows = (
        db.query(EndRecord)
        .filter(EndRecord.created_at < cutoff, EndRecord.end_km > 0)
        .filter((EndRecord.img_url != "") | (EndRecord.close_speedometer_image.isnot(None)))
        .limit(limit)
        .all()
    )
    purged = 0
    for r in rows:
        for url in (r.img_url, r.close_speedometer_image):
            if url:
                try:
                    delete_gcs_file_by_url(url)
                except Exception as e:
                    print(f"trip photo delete failed for end record {r.id} (continuing): {e}")
        r.img_url = ""
        r.close_speedometer_image = None
        purged += 1
    db.commit()
    return purged
