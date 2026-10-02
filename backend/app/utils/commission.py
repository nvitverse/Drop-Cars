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
#   STANDARD (itemized)      the driver pays 10% of the base km fare (unless the "10% CC" toggle is off) and NOTHING
#                            else. Out of that 10% the platform keeps 1% of the km fare (at least Rs 30, never more
#                            than the whole commission) and the poster (vendor / driver) gets the rest + ALL extras
#                            (extra per-km price, extra driver allowance...). Updated 2026-09-24 (owner): the old
#                            extra 2% taken from the driver's fare is gone.
#   POSTER_ALL_INCLUSIVE     vendor / driver / B2B posts "driver fare + markup": the driver keeps the whole driver
#                            fare; the platform's 1% (at least Rs 30, capped at the markup) comes out of the poster's
#                            markup.
#   PLATFORM_ALL_INCLUSIVE   website / admin all-inclusive: one amount, platform keeps 15% (85/15 split).
#
# "Poster" is the vendor / driver who posted the booking; for website and admin bookings the poster IS the platform.
# The platform fee is the app owner's income and always comes out of the driver's earnings.
# ---------------------------------------------------------------------------
PLATFORM_FEE_PERCENT = 1          # platform's share of the km fare, taken out of the 10% commission
CONVENIENCE_FEE = 30               # EVERY booking: flat fee added to the customer's bill, collected in cash by the driver, settled to the platform
COMMISSION_MIN = 200               # Standard (Outstation) bookings: the driver pays at least this much commission
PLATFORM_FEE_MIN = 30              # ... but at least this many rupees (never above the commission itself)
PLATFORM_ALL_INCLUSIVE_PERCENT = 15

CLASS_STANDARD = "STANDARD"
CLASS_POSTER_ALL_INCLUSIVE = "POSTER_ALL_INCLUSIVE"
CLASS_PLATFORM_ALL_INCLUSIVE = "PLATFORM_ALL_INCLUSIVE"


def get_fee_settings(db: Session) -> dict:
    """Owner-editable fee numbers from platform_settings (Admin App > System Config); defaults are the confirmed values."""
    # NB: platform_share_pct / platform_share_min are new keys on purpose - the old `platform_fee_pct` may still hold
    # the retired 2% in platform_settings and must not leak into the new model.
    defaults = {"platform_share_pct": PLATFORM_FEE_PERCENT, "platform_share_min": PLATFORM_FEE_MIN, "commission_min": COMMISSION_MIN, "convenience_fee": CONVENIENCE_FEE,
                "platform_all_inclusive_pct": PLATFORM_ALL_INCLUSIVE_PERCENT,
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


def convenience_fee_amount(db: Session) -> int:
    """Flat convenience fee (Admin > System Config `convenience_fee`, default Rs 30) added to every customer bill.
    Hourly Rental has no compute_split path, so it reads the same setting through this."""
    return max(0, int(get_fee_settings(db).get("convenience_fee", CONVENIENCE_FEE)))


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
                  fees: dict | None = None, gst_amount: int = 0, cc_min: int = 0, pct_override=None) -> dict:
    """Who gets what for one booking. Returns customer_total, driver_net, poster_share (poster_cc + extras / markup),
    platform_fee. driver_net + poster_share + platform_fee == customer_total, always."""
    fees = fees or {}
    fee_pct = fees.get("platform_share_pct", PLATFORM_FEE_PERCENT)
    fee_min = int(fees.get("platform_share_min", PLATFORM_FEE_MIN))
    ai_pct = fees.get("platform_all_inclusive_pct", PLATFORM_ALL_INCLUSIVE_PERCENT)
    # Admin chose a commission % for THIS booking (orders.commission_percent): it replaces the
    # percentage that applies to the booking's class - the commission on the km fare (Standard),
    # the platform's share of the poster's markup (poster all-inclusive) or the platform's cut of
    # the whole fare (platform all-inclusive).
    if pct_override is not None:
        if commission_class == CLASS_STANDARD:
            cc_total_pct = pct_override
        elif commission_class == CLASS_POSTER_ALL_INCLUSIVE:
            fee_pct = pct_override
        else:
            ai_pct = pct_override
    if commission_class == CLASS_STANDARD:
        poster_cc = _pct_ceil(base_fare, cc_total_pct) if cc_on else 0
        # minimum commission (Outstation): the driver pays at least cc_min however short the fare (never more than
        # the driver fare itself)
        if cc_on and base_fare and cc_min:
            poster_cc = min(max(poster_cc, int(cc_min)), int(driver_fare))
        # platform's cut is carved out of the 10% commission itself: 1% of the km fare, at least Rs 30, but never
        # more than the commission. The driver pays the commission and nothing else.
        fee = min(poster_cc, max(_pct_ceil(base_fare, fee_pct), fee_min)) if poster_cc > 0 else 0
        poster = (poster_cc - fee) + int(extras or 0)
        driver_net = int(driver_fare) - poster_cc
        customer_total = int(driver_fare) + int(extras or 0)

    elif commission_class == CLASS_POSTER_ALL_INCLUSIVE:
        poster_cc = 0
        markup = int(markup or 0)
        # the driver keeps the whole driver fare; the platform's share comes out of the poster's markup
        fee = min(markup, max(_pct_ceil(total_booking, fee_pct), fee_min)) if (markup > 0 and cc_on) else 0
        poster = markup - fee
        driver_net = int(total_booking)
        customer_total = int(total_booking) + markup

    else:  # PLATFORM_ALL_INCLUSIVE
        poster_cc = 0
        fee = _pct_ceil(total_booking, ai_pct)
        poster = 0
        driver_net = int(total_booking) - fee
        customer_total = int(total_booking)
    # Convenience fee: on top of everything, for every booking. The customer pays it inside the trip total, the driver
    # collects it with the rest of the cash and it is settled to the platform out of his wallet (it is part of what he
    # owes at close, so the accept-time hold covers it). Added on top of the platform's own share of the commission.
    conv = max(0, int(fees.get("convenience_fee", CONVENIENCE_FEE)))
    customer_total += conv
    fee += conv
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
        "convenience_fee": conv,
        "fee_pct": fee_pct if commission_class != CLASS_PLATFORM_ALL_INCLUSIVE else ai_pct,
        "min_hold": int(fees.get("min_driver_hold", MIN_DRIVER_HOLD)),
    }


# Minimum wallet amount held from the accepting driver, on EVERY booking (even when the commission is only Rs 301).
# It is a no-show guarantee: if the driver does not execute the trip the hold is forfeited as the penalty. When the trip
# completes the commission (plus any extras he owes) is taken out of the hold and the rest is returned to his wallet.
# When the commission with extras is more than the minimum, that bigger amount is what is held.
MIN_DRIVER_HOLD = 500


def min_hold_amount(db: Session) -> int:
    """The admin-editable minimum hold (platform setting min_driver_hold, default Rs 500)."""
    try:
        return max(0, int(get_fee_settings(db).get("min_driver_hold", MIN_DRIVER_HOLD)))
    except Exception:  # noqa: BLE001
        return MIN_DRIVER_HOLD


def expected_hold(split: dict, advance_with_poster: int = 0) -> int:
    """What is held from the accepting driver at accept time.

    - what he will actually have to hand over at trip close (the poster's share plus the platform fee, less whatever
      the poster already holds from the customer as advance), and
    - never below MIN_DRIVER_HOLD (Rs 500), the guarantee against not executing the trip.
    At close the commission (with extras) is deducted and whatever is left of the hold is refunded to the wallet."""
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
        _cat = get_trip_category(order)
        rates = get_commission_rates(db, _cat, "STANDARD")
        return compute_split(cls, driver_fare=driver_fare, base_fare=min(base_fare, driver_fare) if base_fare else driver_fare,
                             extras=extras, cc_total_pct=rates["vendor"] + rates["admin"], cc_on=cc_on, fees=fees,
                             cc_min=(0 if _cat == "LOCAL" else int(fees.get("commission_min", COMMISSION_MIN))),
                             pct_override=getattr(order, "commission_percent", None))

    total_booking = int(getattr(order, "total_booking_amount", 0) or 0) or est or cust
    markup = int(getattr(order, "extra_amount", 0) or 0)
    return compute_split(cls, total_booking=total_booking, markup=markup, cc_on=cc_on, fees=fees_for_order(db, order.id, cls, fees),
                         pct_override=getattr(order, "commission_percent", None))


def vendor_earns_estimate(order, new_order) -> int:
    """What the poster (vendor / driver) is expected to earn on a booking, from the same maths trip close uses (no DB
    needed - default fee settings). Shown in the Vendor App booking screens."""
    try:
        cls = resolve_commission_class(
            fare_type=getattr(new_order, "fare_type", None) or getattr(order, "fare_type", None),
            vendor_id=getattr(order, "vendor_id", None),
            posted_by_vehicle_owner_id=getattr(order, "posted_by_vehicle_owner_id", None),
            stored=getattr(order, "commission_class", None),
        )
        cc_on = not bool(getattr(order, "commission_waived", False))
        est = int(getattr(order, "estimated_price", 0) or 0)
        cust = int(getattr(order, "vendor_price", 0) or 0)
        if cls == CLASS_STANDARD:
            cat = get_trip_category(order) if "get_trip_category" in globals() else "OUTSTATION"
            base = int(getattr(new_order, "cost_per_km", 0) or 0) * int(getattr(order, "trip_distance", 0) or 0)
            s = compute_split(cls, driver_fare=est, base_fare=min(base, est) if base else est, extras=max(0, cust - est),
                              cc_total_pct=(15 if cat == "LOCAL" else 10), cc_on=cc_on, fees={},
                              cc_min=(0 if cat == "LOCAL" else COMMISSION_MIN))
        else:
            total = int(getattr(order, "total_booking_amount", 0) or 0) or est or cust
            s = compute_split(cls, total_booking=total, markup=int(getattr(order, "extra_amount", 0) or 0), cc_on=cc_on, fees={})
        return int(s["poster_share"])
    except Exception:
        return 0
