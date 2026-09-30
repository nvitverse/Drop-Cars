"""
Unified flat-rate commission model, replacing the old margin-based split for
per-KM trips (Oneway/Round Trip/Multi City). Confirmed to leave Preferred
partners' outcome effectively unchanged versus the old formula - Standard
partners pay a higher rate as the tradeoff for accepting after the priority
window instead of paying the yearly fee.

Rates are stored as one JSON blob in platform_settings (same pattern as
cities_list/car_models_list) so admin can retune them without a deploy.
"""
import json
from typing import Optional

from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting

COMMISSION_SETTING_KEY = "commission_rates"

# {trip_category: {tier: {"vendor": pct, "admin": pct}}}
# Standard's extra "admin" cut was removed so Standard and Preferred pay the
# same total commission (10% Outstation / 15% Local either way) - a higher
# rate for non-subscribed drivers was pushing them to avoid bookings, and
# Preferred's real incentive is priority job access, not a cheaper rate.
_DEFAULT_RATES = {
    "OUTSTATION": {
        "PREFERRED": {"vendor": 10, "admin": 0},
        "STANDARD": {"vendor": 10, "admin": 0},
    },
    "LOCAL": {
        "PREFERRED": {"vendor": 15, "admin": 0},
        "STANDARD": {"vendor": 15, "admin": 0},
    },
}


def _load_rates(db: Session) -> dict:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == COMMISSION_SETTING_KEY).first()
    if row and row.value:
        try:
            loaded = json.loads(row.value)
            if isinstance(loaded, dict) and loaded:
                return loaded
        except Exception:
            pass
    return _DEFAULT_RATES


def get_all_commission_rates(db: Session) -> dict:
    """Full rate table for the admin settings screen."""
    return _load_rates(db)


def get_commission_rates(db: Session, trip_category: str, tier: str) -> dict:
    """Returns {"vendor": pct, "admin": pct} for the given trip category
    ("OUTSTATION" or "LOCAL") and tier ("PREFERRED" or "STANDARD"). Falls
    back to Standard/Outstation defaults for anything unrecognized rather
    than raising - trip-close math must never hard-fail on a bad tier value."""
    rates = _load_rates(db)
    category_rates = rates.get(trip_category) or rates.get("OUTSTATION") or _DEFAULT_RATES["OUTSTATION"]
    tier_rates = category_rates.get(tier) or category_rates.get("STANDARD") or _DEFAULT_RATES["OUTSTATION"]["STANDARD"]
    return {"vendor": int(tier_rates.get("vendor", 0)), "admin": int(tier_rates.get("admin", 0))}


def get_trip_category(order) -> str:
    """LOCAL bookings (Phase 06) aren't built yet - every trip type today is
    Outstation. Written so Phase 06 only needs to add its enum value here,
    not touch the commission math again."""
    trip_type_value = getattr(getattr(order, "trip_type", None), "value", None)
    if trip_type_value == "Local":
        return "LOCAL"
    return "OUTSTATION"


def save_commission_rates(db: Session, rates: dict) -> dict:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == COMMISSION_SETTING_KEY).first()
    value = json.dumps(rates)
    if row:
        row.value = value
    else:
        row = PlatformSetting(key=COMMISSION_SETTING_KEY, value=value)
    db.add(row)
    db.commit()
    return rates


# ---------------------------------------------------------------------------
# Booking commission classes (owner-confirmed 2026-09-19)
#
#   STANDARD (itemized)      poster gets 10% of the base km fare (unless the "10% CC" toggle is off) + ALL extras
#                            (extra per-km price, extra driver allowance...); platform gets 2% of the driver fare.
#   POSTER_ALL_INCLUSIVE     vendor / driver / B2B posts "driver fare + markup": poster gets the markup, platform
#                            gets 2% of the driver fare.
#   PLATFORM_ALL_INCLUSIVE   website / admin all-inclusive: one amount, platform keeps 15% (85/15 split).
#
# "Poster" is the vendor / driver who posted the booking; for website and admin bookings the poster IS the platform.
# The platform fee is the app owner's income and always comes out of the driver's earnings.
# ---------------------------------------------------------------------------
PLATFORM_FEE_PERCENT = 2
PLATFORM_ALL_INCLUSIVE_PERCENT = 15

CLASS_STANDARD = "STANDARD"
CLASS_POSTER_ALL_INCLUSIVE = "POSTER_ALL_INCLUSIVE"
CLASS_PLATFORM_ALL_INCLUSIVE = "PLATFORM_ALL_INCLUSIVE"


def get_fee_settings(db: Session) -> dict:
    """Owner-editable fee numbers from platform_settings (Admin App > System Config); defaults are the confirmed values."""
    defaults = {"platform_fee_pct": PLATFORM_FEE_PERCENT, "platform_all_inclusive_pct": PLATFORM_ALL_INCLUSIVE_PERCENT,
                "min_driver_hold": MIN_DRIVER_HOLD, "drop_bid_fee_pct": 5}
    try:
        rows = db.query(PlatformSetting).filter(PlatformSetting.key.in_(list(defaults))).all()
        for r in rows:
            try:
                v = float(r.value)
                defaults[r.key] = int(v) if float(v).is_integer() else v
            except (TypeError, ValueError):
                pass
    except Exception:
        pass
    return defaults


def is_drop_bid_order(db: Session, order_id) -> bool:
    """Bookings born from a confirmed Drop Bid negotiation keep their own (lower) platform cut - not the 15% website cut."""
    try:
        from app.models.drop_bid import DropBidRequest
        return db.query(DropBidRequest.id).filter(DropBidRequest.order_id == order_id).first() is not None
    except Exception:
        return False


def fees_for_order(db: Session, order_id, commission_class: str, fees: dict) -> dict:
    if commission_class == CLASS_PLATFORM_ALL_INCLUSIVE and is_drop_bid_order(db, order_id):
        return {**fees, "platform_all_inclusive_pct": fees.get("drop_bid_fee_pct", 5)}
    return fees


def _pct_ceil(amount, pct) -> int:
    """ceil(amount * pct / 100) with no float drift (percent may have decimals, e.g. 2.5)."""
    from decimal import Decimal, ROUND_CEILING
    amount = int(amount or 0)
    if amount <= 0 or not pct or float(pct) <= 0:
        return 0
    return int((Decimal(amount) * Decimal(str(pct)) / Decimal(100)).to_integral_value(rounding=ROUND_CEILING))


def enum_value(x):
    """`.value` of an Enum, else the value itself. Two different Python enum classes share names in this
    codebase, so comparisons must always go through the plain string (see crud/vehicle_matching.py)."""
    return getattr(x, "value", x)


def resolve_commission_class(*, fare_type, vendor_id=None, posted_by_vehicle_owner_id=None, stored=None) -> str:
    """The class stored on the booking wins; older bookings without one are inferred."""
    if stored:
        return str(enum_value(stored))
    if str(enum_value(fare_type) or "").upper() != "ALL_INCLUSIVE":
        return CLASS_STANDARD
    if vendor_id or posted_by_vehicle_owner_id:
        return CLASS_POSTER_ALL_INCLUSIVE
    return CLASS_PLATFORM_ALL_INCLUSIVE


def compute_split(commission_class: str, *, driver_fare: int = 0, base_fare: int = 0, extras: int = 0,
                  total_booking: int = 0, markup: int = 0, cc_total_pct: int = 10, cc_on: bool = True,
                  fees: dict | None = None, gst_amount: int = 0) -> dict:
    """Who gets what for one booking. Returns customer_total, driver_net, poster_share (poster_cc + extras / markup),
    platform_fee. driver_net + poster_share + platform_fee == customer_total, always."""
    fees = fees or {}
    fee_pct = fees.get("platform_fee_pct", PLATFORM_FEE_PERCENT)
    ai_pct = fees.get("platform_all_inclusive_pct", PLATFORM_ALL_INCLUSIVE_PERCENT)
    if commission_class == CLASS_STANDARD:
        poster_cc = _pct_ceil(base_fare, cc_total_pct) if cc_on else 0
        fee = _pct_ceil(driver_fare, fee_pct)
        poster = poster_cc + int(extras or 0)
        driver_net = int(driver_fare) - poster_cc - fee
        customer_total = int(driver_fare) + int(extras or 0)
    elif commission_class == CLASS_POSTER_ALL_INCLUSIVE:
        poster_cc = 0
        fee = _pct_ceil(total_booking, fee_pct)
        poster = int(markup or 0)
        driver_net = int(total_booking) - fee
        customer_total = int(total_booking) + poster
    else:  # PLATFORM_ALL_INCLUSIVE
        poster_cc = 0
        fee = _pct_ceil(total_booking, ai_pct)
        poster = 0
        driver_net = int(total_booking) - fee
        customer_total = int(total_booking)
    gst_amount = max(0, int(gst_amount or 0))
    customer_total += gst_amount
    poster += gst_amount
    return {
        "commission_class": commission_class,
        "customer_total": customer_total,
        "driver_net": driver_net,
        "poster_share": poster,
        "gst_amount": gst_amount,
        "poster_cc": poster_cc,
        "platform_fee": fee,
        "fee_pct": fee_pct if commission_class != CLASS_PLATFORM_ALL_INCLUSIVE else ai_pct,
        "min_hold": int(fees.get("min_driver_hold", MIN_DRIVER_HOLD)),
    }


# Minimum wallet amount held from the accepting driver. It is a no-show guarantee: if the driver does not
# execute the trip the hold is forfeited as the penalty, otherwise it is returned in full when the trip completes.
MIN_DRIVER_HOLD = 500


def expected_hold(split: dict, advance_with_poster: int = 0) -> int:
    """What is held from the accepting driver at accept time.

    - what he will actually have to hand over at trip close (the poster's share plus the platform fee, less whatever
      the poster already holds from the customer as advance), and
    - never below MIN_DRIVER_HOLD (Rs 500), the guarantee against not executing the trip.
    Whatever is not needed at close is returned when the trip completes."""
    owed = int(split["poster_share"]) + int(split["platform_fee"]) - int(advance_with_poster or 0)
    return max(int(split.get("min_hold", MIN_DRIVER_HOLD)), owed)


def estimate_split_for_order(db: Session, order) -> dict:
    """Split for an order that has not been driven yet (used for the accept-time hold and to show the driver what
    they will earn), from the planned distance. Same maths as trip close, so the numbers line up."""
    from app.models.new_orders import NewOrder

    fare_type = enum_value(getattr(order, "fare_type", None))
    cls = resolve_commission_class(
        fare_type=fare_type,
        vendor_id=getattr(order, "vendor_id", None),
        posted_by_vehicle_owner_id=getattr(order, "posted_by_vehicle_owner_id", None),
        stored=getattr(order, "commission_class", None),
    )
    cc_on = not bool(getattr(order, "commission_waived", False))
    fees = get_fee_settings(db)
    est = int(getattr(order, "estimated_price", 0) or 0)
    cust = int(getattr(order, "vendor_price", 0) or 0)

    if cls == CLASS_STANDARD:
        base_fare = 0
        src = enum_value(getattr(order, "source", None))
        if src == "NEW_ORDERS":
            n = db.query(NewOrder).filter(NewOrder.order_id == order.source_order_id).first()
            if n and n.cost_per_km and order.trip_distance:
                base_fare = int(n.cost_per_km) * int(order.trip_distance)
        driver_fare = est
        extras = max(0, cust - est)
        rates = get_commission_rates(db, get_trip_category(order), "STANDARD")
        return compute_split(cls, driver_fare=driver_fare, base_fare=min(base_fare, driver_fare) if base_fare else driver_fare,
                             extras=extras, cc_total_pct=rates["vendor"] + rates["admin"], cc_on=cc_on, fees=fees)

    total_booking = int(getattr(order, "total_booking_amount", 0) or 0) or est or cust
    markup = int(getattr(order, "extra_amount", 0) or 0)
    return compute_split(cls, total_booking=total_booking, markup=markup, fees=fees_for_order(db, order.id, cls, fees))
