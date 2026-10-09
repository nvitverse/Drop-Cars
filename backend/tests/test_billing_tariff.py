"""Tariff engines must give the same money as the Arunachala website's fareEngine.js, and the estimate-lines / rate-card plumbing must work."""
import math

import pytest

from app.utils import billing_policies, billing_tariff as T


def js_drop(v, one_way):
    """fareEngine.js computeDropFare, written out literally."""
    eff = max(one_way * 2, v["min_chargeable_km"])
    billable = max(0, eff - v["base_coverage_km"])
    slab = math.floor(eff / v["increment_every_km"])
    rate = v["start_rate"] + slab * v["increment_by"]
    return round(v["base_fare"] + billable * rate)


def js_round(v, one_way, days):
    actual = one_way * 2
    billable = max(actual, v["min_km_per_day"] * days)
    slab = math.floor(billable / v["increment_every_km"])
    rate = v["round_rate"] + slab * v["increment_by"]
    return round(billable * rate + v["driver_allowance"] * days)


def total(res):
    return sum(l["amount"] for l in res["lines"])


CARDS = billing_policies.arunachala_rate_cards()


@pytest.mark.parametrize("km", [10, 25, 90, 150, 220, 330, 480])
def test_drop_matches_website(km):
    for c in CARDS:
        if c["method"] == "SLAB_DROP":
            assert total(T.slab_drop(c["params"], km)) == js_drop(c["params"], km), (c["vehicle_key"], km)


@pytest.mark.parametrize("km,days", [(40, 1), (120, 2), (300, 3), (500, 4)])
def test_round_matches_website(km, days):
    for c in CARDS:
        if c["method"] == "SLAB_ROUND":
            assert total(T.slab_round(c["params"], km, days)) == js_round(c["params"], km, days), (c["vehicle_key"], km, days)


def test_sedan_drop_example():
    sedan = next(c for c in CARDS if c["method"] == "SLAB_DROP" and c["vehicle_key"] == "sedan")["params"]
    # 100 km one way -> 200 km effective, 150 billable, slab 1 -> Rs 12.5/km: 1500 + 150 * 12.5 = 3375
    assert total(T.slab_drop(sedan, 100)) == 3375


def test_local_package_and_error():
    p = next(c for c in CARDS if c["method"] == "LOCAL" and c["vehicle_key"] == "suv")["params"]
    assert total(T.local_package(p, "8hrs")) == 2800
    assert total(T.local_package(p, "12")) == 3800
    with pytest.raises(ValueError):
        T.local_package(p, "3hrs")


def test_day_rent_extra_km_and_fuel():
    p = {"rent_per_day": 2200, "km_limit_per_day": 250, "extra_km_rate": 12, "fuel_per_km": 3, "fuel_applies": "EXTRA"}
    r = T.day_rent(p, km=700, days=2)          # allowed 500 -> 200 extra km
    assert total(r) == 4400 + 200 * 12 + 200 * 3
    p["fuel_applies"] = "ALL"
    assert total(T.day_rent(p, km=700, days=2)) == 4400 + 200 * 12 + 700 * 3
    assert total(T.day_rent(p, km=400, days=2)) == 4400 + 400 * 3      # inside the limit: no extra km


def test_package_and_km_bata():
    assert total(T.package({"includes": ["toll", "fuel"]}, amount=9500, name="Ooty 3 days")) == 9500
    r = T.compute("KM_BATA", {"rate_per_km": 12, "bata_per_day": 300}, km=200, days=1, trip_type="oneway", rules={"oneway_min_km": 130})
    assert total(r) == 200 * 12 + 300


def test_unknown_method():
    with pytest.raises(ValueError):
        T.compute("NOPE", {})


def test_policies_by_family():
    assert "VEHICLE CHANGE" in billing_policies.defaults_for("dropcars")["rules_text"]
    assert "ITINERARY" in billing_policies.defaults_for("arunachala")["rules_text"]
    assert "Rs 16 or Rs 17" in billing_policies.defaults_for("dropcars")["rules_text"]
    assert billing_policies.is_old_seed("Minimum billable distance applies as per the trip type (one way / round trip / multi city).\nWaiting...")
