"""Tests for All-Inclusive extra km + GST calculation at trip close."""
import math
from app.utils.commission import (
    compute_split,
    CLASS_PLATFORM_ALL_INCLUSIVE,
    CLASS_POSTER_ALL_INCLUSIVE,
)


def calculate_all_inclusive_close_amounts(
    *,
    total_booking: int,
    markup: int = 0,
    km_limit: int,
    actual_km: int,
    rate_per_km: int,
    has_gst: bool,
    commission_class: str = CLASS_PLATFORM_ALL_INCLUSIVE,
    commission_waived: bool = False,
    fees: dict | None = None,
):
    """Helper mimicking end_records.py All-Inclusive extra km + GST logic."""
    fees = fees or {"convenience_fee": 30, "platform_all_inclusive_pct": 15, "platform_share_pct": 1, "platform_share_min": 30}
    split = compute_split(
        commission_class,
        total_booking=total_booking,
        markup=markup,
        cc_on=not commission_waived,
        fees=fees,
    )
    
    extra_km = max(0, actual_km - km_limit) if km_limit > 0 else 0
    extra_km_cost = extra_km * rate_per_km if extra_km > 0 and rate_per_km > 0 else 0
    extra_gst = math.ceil(extra_km_cost * 0.05) if (has_gst and extra_km_cost > 0) else 0
    total_extra = extra_km_cost + extra_gst

    closed_vendor_price = split["customer_total"] + total_extra
    driver_profit = split["driver_net"]  # Unchanged
    closed_driver_price = split["driver_net"]

    if commission_class == CLASS_POSTER_ALL_INCLUSIVE:
        vendor_profit = split["poster_share"] + total_extra
        admin_profit = split["platform_fee"]
    else:
        vendor_profit = split["poster_share"]
        admin_profit = split["platform_fee"] + total_extra

    return {
        "closed_vendor_price": closed_vendor_price,
        "closed_driver_price": closed_driver_price,
        "driver_profit": driver_profit,
        "vendor_profit": vendor_profit,
        "admin_profit": admin_profit,
        "extra_km": extra_km,
        "extra_km_cost": extra_km_cost,
        "extra_gst": extra_gst,
        "total_extra": total_extra,
    }


def test_all_inclusive_no_extra_km():
    res = calculate_all_inclusive_close_amounts(
        total_booking=5000,
        km_limit=250,
        actual_km=240,
        rate_per_km=15,
        has_gst=True,
    )
    assert res["extra_km"] == 0
    assert res["total_extra"] == 0
    # Driver payout unchanged
    assert res["driver_profit"] == 5000 - math.ceil(5000 * 0.15)


def test_all_inclusive_with_extra_km_and_gst():
    res = calculate_all_inclusive_close_amounts(
        total_booking=5000,
        km_limit=250,
        actual_km=300,  # 50 extra km
        rate_per_km=16,
        has_gst=True,
    )
    assert res["extra_km"] == 50
    assert res["extra_km_cost"] == 50 * 16  # 800
    assert res["extra_gst"] == math.ceil(800 * 0.05)  # 40
    assert res["total_extra"] == 840
    # Customer billed initial total + 840
    # Driver profit strictly unchanged
    assert res["driver_profit"] == 5000 - math.ceil(5000 * 0.15)


def test_all_inclusive_with_extra_km_no_gst():
    res = calculate_all_inclusive_close_amounts(
        total_booking=5000,
        km_limit=250,
        actual_km=300,
        rate_per_km=16,
        has_gst=False,
    )
    assert res["extra_km"] == 50
    assert res["extra_km_cost"] == 800
    assert res["extra_gst"] == 0
    assert res["total_extra"] == 800
    assert res["driver_profit"] == 5000 - math.ceil(5000 * 0.15)
