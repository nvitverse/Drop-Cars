# crud/customer_booking_request.py
"""
Shared logic for turning a PENDING CustomerBookingRequest into a real,
marketplace-visible Order. Used by:
- the admin-approve endpoint (app/api/routes/admin.py)
- the website shared-secret endpoints (app/api/routes/website_bookings.py)
- the auto-approve timeout sweep (auto_approve_expired_booking_requests below,
  called from app/main.py's existing assignment sweep)
"""
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from app.models.customer_booking_request import CustomerBookingRequest
from app.models.new_orders import NewOrder, CarTypeEnum
from app.models.orders import Order
from app.models.platform_setting import PlatformSetting
from app.crud.orders import create_master_from_new_order

WEBSITE_AUTO_APPROVE_SECONDS_KEY = "website_booking_auto_approve_seconds"
DEFAULT_AUTO_APPROVE_SECONDS = 900  # 15 minutes - normal-track admin review window

WEBSITE_URGENT_APPROVE_SECONDS_KEY = "website_booking_urgent_approve_seconds"
DEFAULT_URGENT_APPROVE_SECONDS = 120  # 2 minutes - urgent-track admin review window

# How long a vendor gets, after ACCEPTING a booking, to actually assign a
# driver+car before it's auto-repost-with-penalty (see
# crud/order_assignments.py:cancel_timed_out_pending_assignments). Normal:
# a percentage of the remaining time to pickup, clamped to [min, max] so a
# same-day booking isn't rushed and a booking days out isn't given all week.
# Urgent: a fixed short window instead of the percentage formula.
ASSIGNMENT_WINDOW_PERCENT_KEY = "assignment_window_percent"
DEFAULT_ASSIGNMENT_WINDOW_PERCENT = 30
ASSIGNMENT_WINDOW_MIN_MINUTES_KEY = "assignment_window_min_minutes"
DEFAULT_ASSIGNMENT_WINDOW_MIN_MINUTES = 5
ASSIGNMENT_WINDOW_MAX_MINUTES_KEY = "assignment_window_max_minutes"
DEFAULT_ASSIGNMENT_WINDOW_MAX_MINUTES = 30
URGENT_ASSIGNMENT_WINDOW_MINUTES_KEY = "urgent_assignment_window_minutes"
DEFAULT_URGENT_ASSIGNMENT_WINDOW_MINUTES = 2


# How long before pickup the customer's phone number becomes visible to the
# assigned driver (previously shown the moment a driver/car was assigned,
# regardless of how far in advance that was - see
# crud/order_assignments.py:get_masked_customer_number). Urgent bookings
# always reveal it immediately, since there's no meaningful advance window.
PHONE_REVEAL_HOURS_BEFORE_KEY = "phone_reveal_hours_before_pickup"
DEFAULT_PHONE_REVEAL_HOURS_BEFORE = 6


def _pick(admin_value, quoted_value):
    """Admin override wins even when it is 0 (a waived charge) - a plain `or` would fall back to the quoted amount."""
    return admin_value if admin_value is not None else quoted_value


def get_platform_setting_value(db: Session, key: str, default: str) -> str:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    return row.value if row else default


def set_platform_setting_value(db: Session, key: str, value: str) -> None:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if row:
        row.value = value
    else:
        row = PlatformSetting(key=key, value=value)
    db.add(row)
    db.commit()


def get_assignment_window_minutes(db: Session, pickup_time, is_urgent: bool, accept_time: datetime | None = None) -> int:
    """See ASSIGNMENT_WINDOW_* constants above for the reasoning."""
    if is_urgent:
        raw = get_platform_setting_value(
            db, URGENT_ASSIGNMENT_WINDOW_MINUTES_KEY, str(DEFAULT_URGENT_ASSIGNMENT_WINDOW_MINUTES)
        )
        try:
            return max(1, int(raw))
        except (TypeError, ValueError):
            return DEFAULT_URGENT_ASSIGNMENT_WINDOW_MINUTES

    # Normalize both to naive UTC regardless of what the caller passed in -
    # callers in this codebase mix naive datetime.utcnow() and aware
    # datetime.now(timezone.utc), and subtracting mismatched aware/naive
    # datetimes raises TypeError.
    accept_time = accept_time or datetime.utcnow()
    if accept_time.tzinfo is not None:
        accept_time = accept_time.replace(tzinfo=None)
    if pickup_time is not None and pickup_time.tzinfo is not None:
        pickup_time = pickup_time.replace(tzinfo=None)
    minutes_to_pickup = max(0.0, (pickup_time - accept_time).total_seconds() / 60) if pickup_time else 0.0

    def _num(key: str, default: float) -> float:
        try:
            return float(get_platform_setting_value(db, key, str(default)) or default)
        except (TypeError, ValueError):
            return default

    percent = _num(ASSIGNMENT_WINDOW_PERCENT_KEY, DEFAULT_ASSIGNMENT_WINDOW_PERCENT)
    min_minutes = _num(ASSIGNMENT_WINDOW_MIN_MINUTES_KEY, DEFAULT_ASSIGNMENT_WINDOW_MIN_MINUTES)
    max_minutes = _num(ASSIGNMENT_WINDOW_MAX_MINUTES_KEY, DEFAULT_ASSIGNMENT_WINDOW_MAX_MINUTES)

    window = minutes_to_pickup * (percent / 100.0)
    window = max(min_minutes, min(max_minutes, window))
    return max(1, int(round(window)))


WEBSITE_DRIVER_BATA = 300


def split_website_bata(booked_bata, booked_extra_bata=0) -> tuple:
    """Website bookings: whatever bata the customer was charged (e.g. 500 for
    an SUV), the driver's bata is 300 and the rest goes to Vendor Extra Bata.
    500 -> (300, 200); 300 -> (300, 0); 400 + 100 extra -> (300, 200)."""
    booked = int(booked_bata or 0)
    extra = int(booked_extra_bata or 0)
    return WEBSITE_DRIVER_BATA, extra + max(0, booked - WEBSITE_DRIVER_BATA)


_TOTAL_PARTS = ("driver_allowance", "extra_driver_allowance", "permit_charges", "extra_permit_charges", "hill_charges", "toll_charges", "night_charges")
_DRIVER_PARTS = ("driver_allowance", "permit_charges", "hill_charges", "toll_charges", "night_charges")


def complete_admin_fare(request) -> None:
    """Fill the admin_* fare fields nobody set from the quote, keep the ones that were set, and move the customer total (and the
    driver amount) by what the changed fields add: total = km x (rate + extra rate) + allowances + charges, so a rate edited by
    +1/km on 135 km is +135 on the total. Does nothing when the total itself was already edited (Edit fare sets everything)."""
    if request.admin_total_amount is not None:
        return
    dist = request.quoted_trip_distance or 0
    total_move = driver_move = 0
    for name in ("cost_per_km", "extra_cost_per_km") + _TOTAL_PARTS:
        adm, q = f"admin_{name}", f"quoted_{name}"
        have, quoted = getattr(request, adm), getattr(request, q)
        if have is None:
            setattr(request, adm, quoted)
            continue
        diff = (have - (quoted or 0)) * (dist if name in ("cost_per_km", "extra_cost_per_km") else 1)
        total_move += diff
        if name == "cost_per_km" or name in _DRIVER_PARTS:
            driver_move += diff
    request.admin_total_amount = (request.quoted_total_amount or 0) + total_move
    if request.admin_driver_amount is None:
        request.admin_driver_amount = (request.quoted_driver_amount or 0) + driver_move


def approve_customer_booking_request(db: Session, request: CustomerBookingRequest, decided_by: str) -> Order:
    """Turn a PENDING request into a real NewOrder + master Order (which itself
    fires the Telegram alert and vehicle-owner push fan-out - see
    create_master_from_new_order). Caller is responsible for checking
    request.status == "PENDING" first and committing/refreshing afterwards
    however it needs to (this function commits internally as it creates rows)."""
    from app.api.routes.customer_bookings import _get_trip_type_enum

    # Whatever the dispatcher / admin already set (per-km rate, GST ... through PATCH /website/bookings/{id}/rates or Edit fare) is KEPT;
    # only the fields nobody touched are filled from the quote. (It used to overwrite them all with the quote whenever the total
    # had not been edited, so a rate confirmed at 15/km was posted at the quoted 14/km.)
    complete_admin_fare(request)

    # Auto-posting: the booking is posted with the DRIVER fare; whatever is left of the customer's price goes to the "extra" fields
    # (crud/driver_tariff.py, edited in Admin App > Tariffs > Driver):
    #    per km  driver rate | extra = customer rate - driver rate        (default: driver = customer rate, extra 0)
    #    bata    driver bata (300) | extra = customer bata - driver bata
    #    permit  driver permit by vehicle + destination | extra = customer permit - driver permit
    # All-inclusive trips keep the 85 / 15 split below.
    orig_cost_per_km = request.admin_cost_per_km if request.admin_cost_per_km is not None else request.quoted_cost_per_km
    orig_driver_allowance = request.admin_driver_allowance if request.admin_driver_allowance is not None else request.quoted_driver_allowance
    orig_extra_driver_allowance = request.admin_extra_driver_allowance if request.admin_extra_driver_allowance is not None else request.quoted_extra_driver_allowance
    orig_total_amount = request.admin_total_amount if request.admin_total_amount is not None else request.quoted_total_amount

    if orig_cost_per_km and orig_cost_per_km > 0:
        from app.crud import driver_tariff
        customer_extra_km = _pick(request.admin_extra_cost_per_km, request.quoted_extra_cost_per_km) or 0
        customer_permit = (_pick(request.admin_permit_charges, request.quoted_permit_charges) or 0) + (_pick(request.admin_extra_permit_charges, request.quoted_extra_permit_charges) or 0)
        split = driver_tariff.split_fare(
            driver_tariff.load(db), car_type=request.car_type, pickup_drop_location=request.pickup_drop_location,
            customer_km_rate=int(orig_cost_per_km) + int(customer_extra_km), customer_bata=int(orig_driver_allowance or 0) + int(orig_extra_driver_allowance or 0),
            customer_permit=int(customer_permit),
        )
        posted_cost_per_km = split["cost_per_km"]
        posted_extra_cost_per_km = split["extra_cost_per_km"]
        posted_driver_allowance = split["driver_allowance"]
        posted_extra_driver_allowance = split["extra_driver_allowance"]
        posted_permit_charges = split["permit_charges"]
        posted_extra_permit_charges = split["extra_permit_charges"]
        fare_type_str = "ITEMIZED"

        dist = request.quoted_trip_distance or 0
        # The driver's estimate: his km fare + his own bata + his permit + charges. The extras (vendor extra km / bata / permit) are NOT his.
        estimated_price_val = (
            (posted_cost_per_km * dist) +
            posted_driver_allowance +
            posted_permit_charges +
            (_pick(request.admin_hill_charges, request.quoted_hill_charges) or 0) +
            (_pick(request.admin_toll_charges, request.quoted_toll_charges) or 0) +
            (_pick(request.admin_night_charges, request.quoted_night_charges) or 0)
        )
        vendor_price_val = orig_total_amount or (
            estimated_price_val + posted_extra_driver_allowance + posted_extra_permit_charges + posted_extra_cost_per_km * dist
        )
        platform_fee = 10
    else:
        posted_cost_per_km = 0
        posted_extra_cost_per_km = 0
        posted_driver_allowance = 300
        posted_extra_driver_allowance = 0
        posted_permit_charges = _pick(request.admin_permit_charges, request.quoted_permit_charges)
        posted_extra_permit_charges = _pick(request.admin_extra_permit_charges, request.quoted_extra_permit_charges)
        fare_type_str = "ALL_INCLUSIVE"
        vendor_price_val = orig_total_amount
        estimated_price_val = int(round((orig_total_amount or 0) * 0.85)) if orig_total_amount else (_pick(request.admin_driver_amount, request.quoted_driver_amount) or 0)
        platform_fee = 15

    trip_type_enum = _get_trip_type_enum(request.trip_type)
    car_type_enum = CarTypeEnum(request.car_type)

    new_order = NewOrder(
        vendor_id=None,  # Vendor-less platform booking
        trip_type=trip_type_enum,
        car_type=car_type_enum,
        pickup_drop_location=request.pickup_drop_location,
        start_date_time=request.start_date_time,
        customer_name=request.customer_name,
        customer_number=request.customer_number,
        cost_per_km=posted_cost_per_km,
        extra_cost_per_km=posted_extra_cost_per_km,
        driver_allowance=posted_driver_allowance,
        extra_driver_allowance=posted_extra_driver_allowance,
        permit_charges=posted_permit_charges,
        extra_permit_charges=posted_extra_permit_charges,
        hill_charges=_pick(request.admin_hill_charges, request.quoted_hill_charges),
        toll_charges=_pick(request.admin_toll_charges, request.quoted_toll_charges),
        pickup_notes="",
        trip_distance=request.quoted_trip_distance,
        trip_time=request.quoted_trip_time,
        platform_fees_percent=platform_fee,
        trip_status="PENDING",
        pick_near_city=["ALL"],
        estimated_price=estimated_price_val,
        vendor_price=vendor_price_val,
        is_urgent=request.is_urgent,
        advance_received=request.advance_amount,
        fare_type=fare_type_str,
        charge_items=([{"label": "GST Included", "included": True}] if getattr(request, 'gst_included', False) else None),
        gst_included=getattr(request, 'gst_included', False),
        gst_amount=getattr(request, 'gst_amount', None),
        # All-inclusive: the customer's single amount is what the 85/15 platform split is taken from
        total_booking_amount=(orig_total_amount if fare_type_str == "ALL_INCLUSIVE" else None),
    )
    db.add(new_order)
    db.commit()
    db.refresh(new_order)

    assign_minutes = get_assignment_window_minutes(db, request.start_date_time, request.is_urgent)
    master_order = create_master_from_new_order(
        db,
        new_order=new_order,
        max_time_to_assign_order=assign_minutes,
        toll_charge_update=False,
        night_charges=request.admin_night_charges,
    )

    request.status = "APPROVED"
    request.decided_at = datetime.utcnow()
    request.decided_by = decided_by
    request.linked_order_id = master_order.id
    db.commit()
    db.refresh(request)

    # Auto-generate & email GST Tax Invoice PDF if GST was included
    if getattr(request, 'gst_included', False):
        try:
            from app.crud.tax_invoices import issue_and_email_order_tax_invoice
            issue_and_email_order_tax_invoice(
                db,
                order=master_order,
                customer_email=request.customer_email,
            )
        except Exception as tax_ex:
            print(f"Failed to auto-issue/email GST invoice for approved request {request.id}: {tax_ex}")

    return master_order


def get_auto_approve_seconds(db: Session, is_urgent: bool = False) -> int:
    """Normal-track and urgent-track bookings each get their own
    admin-review window before auto-posting - see WEBSITE_URGENT_APPROVE_SECONDS_KEY
    for the urgent (fast) one and WEBSITE_AUTO_APPROVE_SECONDS_KEY for the
    normal one. Both are separately admin-editable."""
    key = WEBSITE_URGENT_APPROVE_SECONDS_KEY if is_urgent else WEBSITE_AUTO_APPROVE_SECONDS_KEY
    default = DEFAULT_URGENT_APPROVE_SECONDS if is_urgent else DEFAULT_AUTO_APPROVE_SECONDS
    value = get_platform_setting_value(db, key, str(default))
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


WEBSITE_POST_MODE_KEY = "website_booking_post_mode"   # MANUAL | AUTO | AUTO_IF_NO_STAFF


def get_website_post_mode(db: Session) -> str:
    mode = str(get_platform_setting_value(db, WEBSITE_POST_MODE_KEY, "AUTO") or "AUTO").strip().upper()
    return mode if mode in ("MANUAL", "AUTO", "AUTO_IF_NO_STAFF") else "AUTO"


def any_staff_on_duty(db: Session) -> bool:
    """Someone is really on duty: switch ON and the Admin App used in the last few minutes (see website_post_rules)."""
    from app.crud.website_post_rules import any_staff_present
    return any_staff_present(db)


async def auto_approve_expired_booking_requests(db: Session) -> int:
    """Sweep (every minute, Cloud Scheduler): post every pending website booking whose own deadline has come.

    The deadline depends on how close the pickup is and whether staff is really on duty - see
    crud/website_post_rules.py for the rule. MANUAL mode never auto-posts."""
    from app.crud import website_post_rules as pr

    mode = get_website_post_mode(db)
    if mode == "MANUAL":
        return 0

    now = datetime.now(timezone.utc)
    rules = pr.get_rules(db)
    pr.expire_stale_duty(db, now, rules)
    staff_on = pr.any_staff_present(db, now, rules)
    normal_s = get_auto_approve_seconds(db, is_urgent=False)
    urgent_s = get_auto_approve_seconds(db, is_urgent=True)

    pending = (
        db.query(CustomerBookingRequest)
        .filter(CustomerBookingRequest.status == "PENDING")
        .filter(CustomerBookingRequest.requires_manual_confirm == False)  # noqa: E712 - soft leads never auto-post
        .all()
    )
    count = 0
    for request in pending:
        plan = pr.compute_post_plan(request, now=now, staff_on=staff_on, rules=rules, mode=mode,
                                    normal_seconds=normal_s, urgent_seconds=urgent_s)
        deadline = plan["deadline"]
        if deadline is not None and now >= deadline:
            try:
                approve_customer_booking_request(db, request, decided_by="AUTO_TIMEOUT")
                count += 1
            except Exception as e:
                db.rollback()
                print(f"Auto-approve failed for booking request {request.id} (continuing): {e}")
            continue
        try:
            pr.maybe_escalate(db, request, plan, now=now, rules=rules, staff_on=staff_on)
        except Exception as e:
            db.rollback()
            print(f"Owner escalation failed for booking request {request.id} (continuing): {e}")
    return count
