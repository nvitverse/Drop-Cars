"""Admin can set a commission % on one booking (orders.commission_percent).
It replaces the percentage that applies to the booking's class; None keeps the platform rate."""
from app.utils.commission import compute_split, CLASS_STANDARD, CLASS_POSTER_ALL_INCLUSIVE, CLASS_PLATFORM_ALL_INCLUSIVE

FEES = {"platform_share_pct": 1, "platform_share_min": 30, "platform_all_inclusive_pct": 15, "convenience_fee": 0}


def _standard(**kw):
    return compute_split(CLASS_STANDARD, driver_fare=5000, base_fare=4000, extras=0, cc_total_pct=10, cc_on=True, fees=FEES, **kw)


def test_standard_uses_the_platform_rate_by_default():
    assert _standard()["poster_cc"] == 400


def test_standard_commission_percent_override():
    assert _standard(pct_override=5)["poster_cc"] == 200
    assert _standard(pct_override=12.5)["poster_cc"] == 500


def test_zero_percent_means_no_commission():
    s = _standard(pct_override=0)
    assert s["poster_cc"] == 0 and s["platform_fee"] == 0 and s["driver_net"] == 5000


def test_split_always_adds_up():
    for pct in (None, 0, 5, 10, 25):
        s = _standard(pct_override=pct)
        assert s["driver_net"] + s["poster_share"] + s["platform_fee"] == s["customer_total"]


def test_platform_all_inclusive_override():
    base = compute_split(CLASS_PLATFORM_ALL_INCLUSIVE, total_booking=1000, fees=FEES)
    assert base["platform_fee"] == 150
    assert compute_split(CLASS_PLATFORM_ALL_INCLUSIVE, total_booking=1000, fees=FEES, pct_override=8)["platform_fee"] == 80


def test_poster_all_inclusive_override_applies_to_the_markup_share():
    # markup 500, platform share of 1000 = 1% -> 30 (min 30) by default; override 5% of 1000 = 50
    base = compute_split(CLASS_POSTER_ALL_INCLUSIVE, total_booking=1000, markup=500, cc_on=True, fees=FEES)
    assert base["platform_fee"] == 30
    assert compute_split(CLASS_POSTER_ALL_INCLUSIVE, total_booking=1000, markup=500, cc_on=True, fees=FEES, pct_override=5)["platform_fee"] == 50
