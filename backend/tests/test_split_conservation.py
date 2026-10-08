import random

from app.utils.commission import (
    compute_split, CLASS_STANDARD, CLASS_POSTER_ALL_INCLUSIVE, CLASS_PLATFORM_ALL_INCLUSIVE,
)


def test_every_rupee_the_customer_pays_goes_to_exactly_one_of_driver_poster_platform():
    """Whatever the booking type or the numbers after an update mid-way: driver + poster + platform == customer total, nobody negative."""
    rnd = random.Random(2026)
    for _ in range(3000):
        cls = rnd.choice([CLASS_STANDARD, CLASS_POSTER_ALL_INCLUSIVE, CLASS_PLATFORM_ALL_INCLUSIVE])
        base = rnd.randint(0, 40000)
        kw = dict(
            driver_fare=base + rnd.randint(0, 3000), base_fare=base, extras=rnd.randint(0, 2500),
            total_booking=rnd.randint(0, 40000), markup=rnd.randint(0, 6000),
            cc_total_pct=rnd.choice([0, 5, 10, 12, 15]), cc_on=rnd.choice([True, True, False]),
            fees={"platform_share_pct": rnd.choice([0, 1, 2]), "platform_share_min": rnd.choice([0, 30, 50]),
                  "platform_all_inclusive_pct": rnd.choice([5, 10, 15]), "convenience_fee": rnd.choice([0, 30])},
            gst_amount=rnd.choice([0, 0, rnd.randint(0, 2000)]), cc_min=rnd.choice([0, 200]),
        )
        s = compute_split(cls, **kw)
        assert s["driver_net"] + s["poster_share"] + s["platform_fee"] == s["customer_total"], (cls, kw, s)
        assert s["platform_fee"] >= 0 and s["poster_share"] >= 0, (cls, kw, s)
