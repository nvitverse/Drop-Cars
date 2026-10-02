from sqlalchemy.orm import Session
from uuid import UUID
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime, timedelta, timezone
import os
from app.models.new_orders import NewOrder, OrderTypeEnum, CarTypeEnum
from app.utils.maps import get_distance_km_between_locations
from app.utils.fare_rules import get_fare_rules
import math
from app.crud.orders import create_master_from_new_order

admin_commession_env = int(os.getenv("ADMIN_COMMESSION_ENV"))
vendor_commession_env = int(os.getenv("VENDOR_COMMESSION_ENV"))


def _trip_days(start_date_time, end_date_time) -> int:
    """Number of days a Round Trip / Multi City booking spans, minimum 1.
    Used to scale both the per-day minimum-km floor and the driver
    allowance (the vendor pays the driver per day away, not per trip)."""
    if not start_date_time or not end_date_time:
        return 1
    try:
        delta_days = (end_date_time.date() - start_date_time.date()).days
        return max(1, delta_days + 1) if delta_days >= 0 else 1
    except Exception:
        return 1


def is_urgent_pickup(start_date_time) -> bool:
    """Vendor-posted bookings (any trip type) whose pickup is within the
    next hour get flagged the same "urgent" way website advance-paid
    bookings already are - reveals the customer's number to the driver
    immediately instead of gating it, and shortens the reassignment window
    if the first driver doesn't accept (see order_assignments.py). Not
    tied to payment; purely a function of how soon the pickup is."""
    if not start_date_time:
        return False
    pickup_at = start_date_time
    now = datetime.now(timezone.utc)
    if pickup_at.tzinfo is None:
        pickup_at = pickup_at.replace(tzinfo=timezone.utc)
    return pickup_at <= now + timedelta(hours=1)


def apply_distance_override(
    fare: Dict[str, Any],
    override_km: float,
    override_trip_time: Optional[str],
    cost_per_km: int,
    extra_cost_per_km: int,
) -> Dict[str, Any]:
    """Quote review lets the vendor override the calculated km/time (e.g. the
    driver knows a shorter local route). This recomputes only the km-driven
    parts of the fare - driver allowance, permit/hill/toll/night charges are
    untouched. IMPORTANT: this never touches the route_distances cache -
    the override is booking-only. Adds "calculated_km" (the original,
    pre-override figure) so admin can see both."""
    old_km = fare["total_km"]
    old_base_km_amount = fare["base_km_amount"]
    old_extra_base_km_amount = int(round(old_km * extra_cost_per_km))

    new_base_km_amount = int(round(override_km * cost_per_km))
    new_extra_base_km_amount = int(round(override_km * extra_cost_per_km))
    km_delta = new_base_km_amount - old_base_km_amount
    extra_km_delta = new_extra_base_km_amount - old_extra_base_km_amount

    new_fare = dict(fare)
    new_fare["calculated_km"] = old_km
    new_fare["total_km"] = override_km
    if override_trip_time:
        new_fare["trip_time"] = override_trip_time
    new_fare["base_km_amount"] = new_base_km_amount
    new_fare["total_amount"] = int(fare["total_amount"] + km_delta + extra_km_delta)
    new_fare["customer_amount"] = new_fare["total_amount"]
    new_fare["driver_amount"] = int(fare["driver_amount"] + km_delta)
    new_fare["vendor_basic_commession_amount"] = math.ceil(new_base_km_amount * vendor_commession_env / 100)
    # An explicit override supersedes the "minimum km applied" note - the
    # vendor has already reviewed and chosen the billed distance.
    new_fare["remark_trip_min_km"] = 0
    return new_fare


def apply_min_km_override(
    fare: Dict[str, Any],
    min_km: Optional[float],
    cost_per_km: int,
    extra_cost_per_km: int,
) -> Dict[str, Any]:
    """Admin edited this booking's minimum billable km. Billed km becomes
    max(actual route km, min_km); only the km-driven amounts change (same
    arithmetic as apply_distance_override). remark_trip_min_km keeps meaning
    "actual km when a minimum was applied" (0 when billed on actual km)."""
    if min_km is None:
        return fare
    actual = float(fare.get("remark_trip_min_km") or fare["total_km"])
    billed = max(actual, float(min_km))
    if round(billed) == round(float(fare["total_km"])):
        return fare
    new_fare = apply_distance_override(fare, billed, None, cost_per_km, extra_cost_per_km)
    new_fare["calculated_km"] = actual
    new_fare["remark_trip_min_km"] = actual if billed > actual else 0
    return new_fare


def apply_exact_km_override(
    fare: Dict[str, Any],
    km: Optional[float],
    cost_per_km: int,
    extra_cost_per_km: int,
) -> Dict[str, Any]:
    """Admin typed the exact km to bill. Same arithmetic as
    apply_distance_override; calculated_km keeps the real route km."""
    if km is None or round(float(km)) == round(float(fare["total_km"])):
        return fare
    actual = float(fare.get("remark_trip_min_km") or fare["total_km"])
    new_fare = apply_distance_override(fare, float(km), None, cost_per_km, extra_cost_per_km)
    new_fare["calculated_km"] = actual
    new_fare["remark_trip_min_km"] = 0
    return new_fare


def apply_admin_km(fare: Dict[str, Any], payload) -> Dict[str, Any]:
    """Whatever km the admin set on the Post booking form: the exact km
    (km_override) wins over the older minimum-km rule (min_km_override)."""
    if getattr(payload, "km_override", None) is not None:
        return apply_exact_km_override(fare, payload.km_override, payload.cost_per_km, payload.extra_cost_per_km)
    return apply_min_km_override(fare, getattr(payload, "min_km_override", None), payload.cost_per_km, payload.extra_cost_per_km)


def _origin_and_destination_from_index_map(index_map: Dict[str, str]) -> (str, str):
    # keys are numeric-like strings: '0', '1', ...
    sorted_keys = sorted(index_map.keys(), key=lambda k: int(k))
    origin_key = sorted_keys[0]
    destination_key = sorted_keys[-1]
    return index_map[origin_key], index_map[destination_key]


def calculate_oneway_fare(pickup_drop_location: Dict[str, str], cost_per_km: int, driver_allowance: int, extra_driver_allowance: int, permit_charges: int,extra_permit_charges: int, hill_charges: int, toll_charges: int, extra_cost_per_km:int, night_charges : int, trip_type : str, known_km: Optional[float] = None, known_trip_time: Optional[str] = None) -> Dict[str, Any]:
    remark_trip_min_km = 0
    if known_km:
        # Editing the fare of a booking that already has its billed km: use it as it is. Recomputing the route here meant a Google Maps
        # call (15 s timeout) on EVERY fare edit, and silently replaced a km the admin had set by hand with the route km.
        total_km, duration_text = float(known_km), known_trip_time or ""
    else:
        origin, destination = _origin_and_destination_from_index_map(pickup_drop_location)
        total_km,duration_text = get_distance_km_between_locations(origin, destination)
        oneway_min_km = get_fare_rules()["oneway_min_km"]
        if trip_type.value == OrderTypeEnum.ONEWAY.value and total_km < oneway_min_km:
            remark_trip_min_km = total_km
            total_km = oneway_min_km
    base_km_amount = int(round(total_km * cost_per_km))
    extra_base_km_amount = int(round(total_km * extra_cost_per_km))

    
    
    print("night charges",night_charges)
    total_amount = base_km_amount + extra_base_km_amount \
        + int(driver_allowance) \
        + int(extra_driver_allowance) \
        + int(permit_charges) \
        + int(extra_permit_charges) \
        + int(hill_charges) \
        + int(toll_charges) \
        + int (night_charges)
    
    driver_amount = base_km_amount \
        + int(driver_allowance) \
        + int (permit_charges) \
        + int(hill_charges) \
        + int(toll_charges) \
        + int (night_charges)
    vendor_basic_commession_amount = math.ceil(((base_km_amount) * vendor_commession_env / 100))
    

    return {
        "total_km": total_km,
        "calculated_km": total_km,
        "trip_time": duration_text,
        "base_km_amount": base_km_amount,
        "driver_allowance": int(driver_allowance),
        "extra_driver_allowance": int(extra_driver_allowance),
        "permit_charges": int(permit_charges),
        "extra_permit_charges": int(extra_permit_charges),
        "hill_charges": int(hill_charges),
        "toll_charges": int(toll_charges),
        "night_charges": int(night_charges),
        "total_amount": int(total_amount),
        "Commission_percent": admin_commession_env,
        "vendor_commission_percent" : vendor_commession_env,
        "customer_amount" : total_amount,
        "driver_amount" : driver_amount,
        "vendor_basic_commession_amount" : vendor_basic_commession_amount,
        "remark_trip_min_km" : remark_trip_min_km,
        "days" : 1
    }


def _sorted_location_keys(index_map: Dict[str, str]) -> list:
    return sorted(index_map.keys(), key=lambda k: int(k))


def _sum_multisegment_distance_and_duration(index_map: Dict[str, str]) -> (float, str):
    keys = _sorted_location_keys(index_map)
    if len(keys) < 2:
        return 0.0, "0 min"
    total_km_sum = 0.0
    total_minutes = 0
    for i in range(len(keys) - 1):
        origin = index_map[keys[i]]
        destination = index_map[keys[i + 1]]
        segment_km, segment_duration = get_distance_km_between_locations(origin, destination)
        total_km_sum += float(segment_km)
        
        # Parse duration string to minutes and sum
        duration_minutes = _parse_duration_to_minutes(segment_duration)
        total_minutes += duration_minutes
    
    # Convert total minutes back to readable format
    total_duration = _format_minutes_to_duration(total_minutes)
    return round(total_km_sum), total_duration

def _parse_duration_to_minutes(duration_str: str) -> int:
    """Convert duration string like '1 hour 30 min' or '45 min' to total minutes"""
    try:
        if 'hour' in duration_str and 'min' in duration_str:
            # Format: "X hour Y min"
            parts = duration_str.split()
            hours = int(parts[0])
            minutes = int(parts[2])
            return hours * 60 + minutes
        elif 'hour' in duration_str:
            # Format: "X hour"
            hours = int(duration_str.split()[0])
            return hours * 60
        elif 'min' in duration_str:
            # Format: "X min"
            minutes = int(duration_str.split()[0])
            return minutes
        else:
            return 0
    except (ValueError, IndexError):
        return 0

def _format_minutes_to_duration(total_minutes: int) -> str:
    """Convert total minutes to readable format like '2 hours 15 min'"""
    if total_minutes == 0:
        return "0 min"
    
    hours = total_minutes // 60
    minutes = total_minutes % 60
    
    if hours > 0 and minutes > 0:
        return f"{hours} hour{'s' if hours > 1 else ''} {minutes} min"
    elif hours > 0:
        return f"{hours} hour{'s' if hours > 1 else ''}"
    else:
        return f"{minutes} min"


def calculate_multisegment_fare(pickup_drop_location: Dict[str, str], cost_per_km: int, driver_allowance: int, extra_driver_allowance: int, permit_charges: int, extra_permit_charges: int, hill_charges: int, toll_charges: int, extra_cost_per_km:int, night_charges:int, trip_type:str, start_date_time: Optional[datetime] = None, end_date_time: Optional[datetime] = None) -> Dict[str, Any]:
    total_km, duration_text = _sum_multisegment_distance_and_duration(pickup_drop_location)
    fare_rules = get_fare_rules()
    days = _trip_days(start_date_time, end_date_time)
    remark_trip_min_km = 0

    # Fare = max(min_km_per_day * days, actual_km) * rate + driver_allowance * days.
    # Round Trip's return date/time and Multi City's drop date/time turn these
    # into potentially multi-day trips - both the minimum-km floor and the
    # driver allowance (paid per day away, not per trip) scale with `days`.
    if trip_type.value == OrderTypeEnum.ROUND_TRIP.value:
        min_km_total = fare_rules["round_trip_min_km_per_day"] * days
        if total_km < min_km_total:
            remark_trip_min_km = total_km
            total_km = min_km_total
    if trip_type.value == OrderTypeEnum.MULTY_CITY.value:
        min_km_total = fare_rules["multicity_min_km_per_day"] * days
        if total_km < min_km_total:
            remark_trip_min_km = total_km
            total_km = min_km_total

    base_km_amount = int(round(total_km * cost_per_km))
    extra_base_km_amount = int(round(total_km * extra_cost_per_km))
    driver_allowance_total = int(driver_allowance) * days
    extra_driver_allowance_total = int(extra_driver_allowance) * days

    total_amount = base_km_amount + extra_base_km_amount\
        + driver_allowance_total \
        + extra_driver_allowance_total \
        + int(permit_charges) \
        + int(extra_permit_charges) \
        + int(hill_charges) \
        + int(toll_charges) \
        + int(night_charges)

    driver_amount = base_km_amount \
        + driver_allowance_total \
        + int (permit_charges) \
        + int(hill_charges) \
        + int(toll_charges) \
        + int (night_charges)

    vendor_basic_commession_amount = math.ceil(((base_km_amount) * vendor_commession_env / 100))

    return {
        "total_km": total_km,
        "calculated_km": total_km,
        "trip_time": duration_text,
        "base_km_amount": base_km_amount,
        "driver_allowance": driver_allowance_total,
        "extra_driver_allowance": extra_driver_allowance_total,
        "permit_charges": int(permit_charges),
        "extra_permit_charges": int(extra_permit_charges),
        "hill_charges": int(hill_charges),
        "toll_charges": int(toll_charges),
        "night_charges": int(night_charges),
        "total_amount": int(total_amount),
        "Commission_percent": int(admin_commession_env) if admin_commession_env else 10,
        "vendor_commission_percent" : vendor_commession_env,
        "customer_amount" : total_amount,
        "driver_amount" : driver_amount,
        "vendor_basic_commession_amount" : vendor_basic_commession_amount,
        "remark_trip_min_km" : remark_trip_min_km,
        "days" : days
    }


def _saved_priority_rules(db) -> Optional[Tuple[int, int]]:
    """(hours, pct) the admin SAVED in Admin App > Assignment & Priority Rules, or None when nothing was ever saved (then the built-in
    rule below applies, exactly as before). Those two fields used to be stored and shown but never read, so editing them did nothing."""
    if db is None:
        return None
    try:
        from app.models.platform_setting import PlatformSetting
        from app.utils.assignment_priority_config import SETTING_KEY_PREFIX, get_assignment_priority_config
        keys = [f"{SETTING_KEY_PREFIX}PRIORITY_CUTOFF_HOURS", f"{SETTING_KEY_PREFIX}PRIORITY_CUTOFF_PCT"]
        if not db.query(PlatformSetting).filter(PlatformSetting.key.in_(keys)).count():
            return None
        cfg = get_assignment_priority_config(db)
        return int(cfg["priority_cutoff_hours"]), int(cfg["priority_cutoff_pct"])
    except Exception:  # noqa: BLE001
        db.rollback()
        return None


def _default_priority_cutoff(start_date_time, db=None, now=None) -> datetime:
    """Until when a new booking is reserved for Trusted Partners.

    If the admin saved the rule (Assignment & Priority Rules): pickup more than 6 h away = `hours` before pickup; closer = `pct`% of the
    time left from now to pickup. Night protection (10 PM - 7 AM IST pushed to 7 AM) and the 5-minute floor still apply; never later
    than pickup. Otherwise the built-in rule: Scheduled bookings: midpoint between now and pickup. Immediate
    bookings: a 5-minute floor, but never later than pickup itself.
    Night Sleep Protection (10:00 PM - 7:00 AM IST): If priority lock cutoff
    would expire overnight while trusted drivers are asleep, extend the lock
    to 7:00 AM IST so trusted drivers can view & accept when waking up.
    Safety Buffer: Priority lock ALWAYS expires at least 2 hours before pickup time
    so standard drivers get ample lead time to accept early morning pickups."""
    now = now or datetime.now(timezone.utc)
    start_at = start_date_time
    if start_at is not None and start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=timezone.utc)
    if start_at is None or start_at <= now:
        return now + timedelta(minutes=5)

    saved = _saved_priority_rules(db)
    if saved is not None:
        hours, pct = saved
        left = start_at - now
        raw = (start_at - timedelta(hours=hours)) if left > timedelta(hours=6) else (now + left * (pct / 100.0))
        floor = now + timedelta(minutes=5)
        candidate = min(max(raw, floor), start_at)
        ist = timedelta(hours=5, minutes=30)
        cand_ist = candidate + ist
        if cand_ist.hour >= 22 or cand_ist.hour < 7:                      # night protection, same as the built-in rule
            morning = ((cand_ist + timedelta(days=1)) if cand_ist.hour >= 22 else cand_ist).replace(hour=7, minute=0, second=0, microsecond=0)
            candidate = morning - ist
        return min(max(candidate, floor), start_at)

    midpoint = now + (start_at - now) / 2
    floor = now + timedelta(minutes=5)
    candidate = min(max(midpoint, floor), start_at)

    # Convert candidate to IST (UTC+5:30) to check local night hours (22:00 - 07:00)
    ist_offset = timedelta(hours=5, minutes=30)
    candidate_ist = candidate + ist_offset

    # Check if candidate hour is in night window (10:00 PM to 7:00 AM IST)
    is_night_time = candidate_ist.hour >= 22 or candidate_ist.hour < 7

    if is_night_time:
        if candidate_ist.hour >= 22:
            # Shift to 7:00 AM IST next morning
            next_morning_ist = (candidate_ist + timedelta(days=1)).replace(hour=7, minute=0, second=0, microsecond=0)
        else:
            # Shift to 7:00 AM IST same morning
            next_morning_ist = candidate_ist.replace(hour=7, minute=0, second=0, microsecond=0)

        candidate = next_morning_ist - ist_offset

    # Safety Buffer: Lock MUST expire at least 2 hours before pickup time so standard drivers have lead time
    two_hours_before_pickup = start_at - timedelta(hours=2)
    safe_cutoff = min(candidate, two_hours_before_pickup)

    # Final bounds: at least 5 minutes from now, never later than pickup time
    return min(max(safe_cutoff, floor), start_at)


def create_oneway_order(
    db: Session,
    *,
    vendor_id: UUID,
    trip_type: OrderTypeEnum,
    car_type: CarTypeEnum,
    pickup_drop_location,
    start_date_time,
    customer_name: str,
    customer_number: str,
    cost_per_km: int,
    extra_cost_per_km: int,
    driver_allowance: int,
    extra_driver_allowance: int,
    permit_charges: int,
    extra_permit_charges: int,
    hill_charges: int,
    toll_charges: int,
    pickup_notes: str,
    trip_distance = int,
    trip_time = str,
    platform_fees_percent = int,
    pick_near_city: list,
    target_driver_id: UUID | None = None,
    max_time_to_assign_order: int = 15,
    toll_charge_update: bool = False,
    night_charges: int | None = None,
    estimated_cal_price: int,
    vendor_cal_price : int,
    acceptance_deadline = None,
    end_date_time = None,
    distance_edited: bool = False,
    calculated_trip_distance: int | None = None,
    location_links: dict | None = None,
    car_make_year_requirement: int | None = None,
    carrier_required: bool = False,
    priority_for_paid: bool = True,
    priority_cutoff_at=None,
    fare_type: str = "ITEMIZED",
    charge_items: list | None = None,
    advance_received: int | None = None,
    total_booking_amount: int | None = None,
    extra_amount: int | None = None,
    waiting_hours_included: int | None = None,
    commission_waived: bool = False,
    posted_by_vehicle_owner_id: str | None = None,
    gst_amount: int | None = None,
    skip_broadcast: bool = False,
) -> Tuple[NewOrder, int]:
    if priority_for_paid and priority_cutoff_at is None:
        priority_cutoff_at = _default_priority_cutoff(start_date_time, db)

    # All-Inclusive: the poster typed one flat driver amount + their own
    # markup instead of the itemized km/allowance fields - override the
    # itemized-calculated estimated/vendor price with that real total here,
    # once, so every caller (vendor, admin, driver) gets it right instead of
    # each having to remember to override fare["driver_amount"]/
    # fare["customer_amount"] itself. Same split crud/end_records.py's
    # commission rule uses at trip close: hold (vendor_price - estimated_price)
    # = extra_amount = the poster's commission, matching vendor_profit there.
    if fare_type == "ALL_INCLUSIVE" and total_booking_amount:
        extra_amount = extra_amount or 0
        estimated_cal_price = int(total_booking_amount)
        vendor_cal_price = int(total_booking_amount) + int(extra_amount)

    is_gst_included = False
    gst_amount_value = None
    if charge_items and any(c.get('included') and 'gst' in str(c.get('label', '')).lower() for c in charge_items if isinstance(c, dict)):
        is_gst_included = True
        gst_amount_value = int(gst_amount) if gst_amount else None
        if gst_amount_value is None:
            gst_amount_value = int(round(0.05 * float(trip_distance or 0) * (int(cost_per_km or 0) + int(extra_cost_per_km or 0))))

    new_order = NewOrder(
        vendor_id=vendor_id,
        trip_type=trip_type,
        car_type=car_type,
        pickup_drop_location=pickup_drop_location,
        start_date_time=start_date_time,
        end_date_time=end_date_time,
        is_urgent=is_urgent_pickup(start_date_time),
        customer_name=customer_name,
        customer_number=customer_number,
        cost_per_km=cost_per_km,
        extra_cost_per_km=extra_cost_per_km,
        driver_allowance=driver_allowance,
        extra_driver_allowance=extra_driver_allowance,
        permit_charges=permit_charges,
        extra_permit_charges=extra_permit_charges,
        hill_charges=hill_charges,
        toll_charges=toll_charges,
        pickup_notes=pickup_notes,
        trip_distance = trip_distance,
        trip_time = trip_time,
        platform_fees_percent = admin_commession_env,
        trip_status="PENDING",
        pick_near_city = pick_near_city,
        target_driver_id = target_driver_id,
        posted_by_vehicle_owner_id = posted_by_vehicle_owner_id,
        estimated_price = estimated_cal_price,
        vendor_price = vendor_cal_price,
        distance_edited = distance_edited,
        calculated_trip_distance = calculated_trip_distance,
        location_links = location_links,
        car_make_year_requirement = car_make_year_requirement,
        carrier_required = carrier_required,
        priority_for_paid = priority_for_paid,
        priority_cutoff_at = priority_cutoff_at,
        fare_type = fare_type,
        charge_items = charge_items,
        gst_included = is_gst_included,
        gst_amount = gst_amount_value,
        advance_received = advance_received,
        total_booking_amount = total_booking_amount,
        extra_amount = extra_amount,
        waiting_hours_included = waiting_hours_included,
        commission_waived = commission_waived,
    )
    # print(cost_per_km,trip_distance,driver_allowance,hill_charges,permit_charges,toll_charges)
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    # Also create/refresh master order row
    master_order = create_master_from_new_order(db, new_order, max_time_to_assign_order, toll_charge_update, night_charges=night_charges, acceptance_deadline=acceptance_deadline, skip_broadcast=skip_broadcast)

    if is_gst_included:
        try:
            from app.crud.tax_invoices import issue_and_email_order_tax_invoice
            issue_and_email_order_tax_invoice(db, order=master_order)
        except Exception as tax_err:
            print(f"Failed to auto-issue tax invoice on new order {master_order.id}: {tax_err}")

    return new_order, master_order.id


def get_pending_all_city_orders(db: Session) -> List[NewOrder]:
    # pick_near_city is a real Postgres ARRAY(String) column (e.g. ["ALL"]
    # or a list of specific cities) - comparing it directly to the bare
    # string "ALL" isn't a type match at all and made Postgres try to
    # parse "ALL" AS an array literal, raising a raw
    # DataError("malformed array literal") on every call. Found 2026-09-04
    # in a broader bug sweep (this endpoint, GET /orders/pending-all, was
    # 500ing on literally every request). Fixed to a real array-containment
    # check - "does this order's near-city list include ALL".
    return db.query(NewOrder).filter(
        NewOrder.trip_status == "PENDING",
        NewOrder.pick_near_city.contains(["ALL"])
    ).all()
    
def get_orders_by_vendor_id(db: Session, vendor_id: UUID) -> List[NewOrder]:
    return db.query(NewOrder).filter(NewOrder.vendor_id == vendor_id).order_by(NewOrder.created_at.desc()).all()
