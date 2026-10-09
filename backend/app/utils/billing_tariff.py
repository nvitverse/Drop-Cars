"""Tariff engines for estimates - one function per way the brands price a trip. Pure functions (no database), each returns invoice lines.

KM_BATA     Drop Cars style: billed km x (rate + extra rate) + driver bata per day. Toll / parking / permit are separate "extra" charges.
SLAB_DROP   Arunachala Travels drop trip (same formula as its website's fareEngine.js):
                effective   = max(one-way km x 2, min chargeable km)      (the car has to come back, so a drop is priced on the round distance)
                billable    = max(0, effective - base coverage km)
                step        = floor(effective / increment-every km)  (capped at max_increments)   <- as coded in fareEngine.js
                rate        = start rate + step x increment by
                fare        = base fare + billable x rate
SLAB_ROUND  round trip: billable km = max(one-way km x 2, min km per day x days); rate = round rate + floor(billable / increment-every) x increment-by;
                fare = billable x rate + driver allowance x days
LOCAL       local rental: flat price for the chosen hour package
DAY_RENT    rent per day with a km limit per day; km beyond the limit at the extra-km rate; a fuel charge per km (all km, or only the extra km)
PACKAGE     one agreed all-inclusive amount, with what it covers

Every function returns {"lines": [...], "notes": [...], "meta": {...}} - lines are the same shape as the invoice lines."""
import math
from typing import Any, Dict, List, Optional

METHODS = ("KM_BATA", "SLAB_DROP", "SLAB_ROUND", "LOCAL", "DAY_RENT", "PACKAGE")

METHOD_LABELS = {
    "KM_BATA": "Km fare + driver bata", "SLAB_DROP": "Drop trip (base fare + stepped km rate)", "SLAB_ROUND": "Round trip (min km / day + allowance)",
    "LOCAL": "Local rental package (hours)", "DAY_RENT": "Day rent + km limit + fuel per km", "PACKAGE": "Fixed all-inclusive package",
}


def _n(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _line(label: str, amount: float, kind: str = "FARE", note: Optional[str] = None) -> dict:
    return {"label": label, "amount": int(round(amount)), "kind": kind, "included": True, "note": note}


def _rate(v: float) -> str:
    return f"{v:g}"


def km_bata(*, km: float, rate_per_km: float, extra_rate_per_km: float = 0, bata_per_day: float = 0, days: int = 1, trip_type: str = "oneway",
            min_km_oneway: int = 130, min_km_per_day_round: int = 250, min_km_per_day_multicity: int = 250) -> Dict[str, Any]:
    from app.utils.billing_calc import fare_lines
    lines = fare_lines(trip_type=trip_type, km=km, rate_per_km=rate_per_km, bata_per_day=bata_per_day, days=days, min_km_oneway=min_km_oneway,
                       min_km_per_day_round=min_km_per_day_round, min_km_per_day_multicity=min_km_per_day_multicity, extra_rate_per_km=extra_rate_per_km)
    return {"lines": lines, "notes": ["Toll, parking and state permit are charged extra (add them below as included or not included)."], "meta": {}}


def slab_drop(p: Dict[str, Any], one_way_km: float, double: bool = True) -> Dict[str, Any]:
    base_fare = _n(p.get("base_fare"))
    coverage = _n(p.get("base_coverage_km"), 0)
    min_km = _n(p.get("min_chargeable_km"), coverage)
    start = _n(p.get("start_rate"))
    inc_by = _n(p.get("increment_by"), 0)
    inc_every = max(1.0, _n(p.get("increment_every_km"), 200))
    max_inc = p.get("max_increments")
    internal = float(one_way_km) * (2 if double else 1)
    effective = max(internal, min_km)
    billable = max(0.0, effective - coverage)
    step = math.floor(effective / inc_every)
    if max_inc not in (None, ""):
        step = min(step, int(max_inc))
    rate = start + step * inc_by
    lines = []
    if base_fare:
        lines.append(_line(f"Base fare (first {int(coverage)} km)" if coverage else "Base fare", base_fare))
    if billable > 0 and rate > 0:
        lines.append(_line(f"Distance {int(round(billable))} km x Rs {_rate(rate)}", billable * rate))
    notes = [f"Priced on {int(round(effective))} km ({'to and fro' if double else 'one way'}); the per-km rate rises by Rs {_rate(inc_by)} for every {int(inc_every)} km of distance."]
    return {"lines": lines, "notes": notes, "meta": {"effective_km": effective, "billable_km": billable, "per_km_rate": rate}}


def slab_round(p: Dict[str, Any], one_way_km: float, days: int) -> Dict[str, Any]:
    days = max(1, int(days or 1))
    min_per_day = _n(p.get("min_km_per_day"), 250)
    billable = max(float(one_way_km) * 2, min_per_day * days)
    inc_by = _n(p.get("increment_by"), 0)
    inc_every = max(1.0, _n(p.get("increment_every_km"), 200))
    max_inc = p.get("max_increments")
    step = math.floor(billable / inc_every)
    if max_inc not in (None, ""):
        step = min(step, int(max_inc))
    rate = _n(p.get("round_rate")) + step * inc_by
    allow = _n(p.get("driver_allowance"))
    lines = []
    if rate > 0:
        lines.append(_line(f"Distance {int(round(billable))} km x Rs {_rate(rate)}", billable * rate))
    if allow > 0:
        lines.append(_line(f"Driver allowance ({days} day{'s' if days > 1 else ''} x Rs {_rate(allow)})", allow * days, "CHARGE"))
    return {"lines": lines, "notes": [f"Minimum {int(min_per_day)} km per day is billed."], "meta": {"billable_km": billable}}


def local_package(p: Dict[str, Any], hours: str) -> Dict[str, Any]:
    packages = p.get("packages") or {}
    key = str(hours or "").strip().lower().replace(" ", "")
    if key and not key.endswith("hrs"):
        key = f"{key}hrs"
    if key not in packages:
        raise ValueError(f"No {hours} package. Available: {', '.join(packages) or 'none'}")
    km_limit = p.get("km_limit_by_package", {}).get(key)
    return {"lines": [_line(f"Local rental package - {key.replace('hrs', ' hours')}", _n(packages[key]))],
            "notes": ([f"Includes up to {int(km_limit)} km."] if km_limit else []), "meta": {"package": key}}


def day_rent(p: Dict[str, Any], km: float, days: int) -> Dict[str, Any]:
    days = max(1, int(days or 1))
    rent = _n(p.get("rent_per_day"))
    limit = _n(p.get("km_limit_per_day"))
    extra_rate = _n(p.get("extra_km_rate"))
    fuel = _n(p.get("fuel_per_km"))
    fuel_on = str(p.get("fuel_applies") or "ALL").upper()
    allowed = limit * days
    extra_km = max(0.0, float(km) - allowed) if limit else 0.0
    lines = [_line(f"Day rent ({days} day{'s' if days > 1 else ''} x Rs {_rate(rent)}, {int(limit)} km / day included)" if limit else f"Day rent ({days} x Rs {_rate(rent)})", rent * days)]
    if extra_km > 0 and extra_rate > 0:
        lines.append(_line(f"Extra distance {int(round(extra_km))} km x Rs {_rate(extra_rate)}", extra_km * extra_rate))
    fuel_km = float(km) if fuel_on == "ALL" else extra_km
    if fuel > 0 and fuel_km > 0:
        lines.append(_line(f"Fuel charge {int(round(fuel_km))} km x Rs {_rate(fuel)}", fuel_km * fuel, "CHARGE"))
    return {"lines": lines, "notes": [f"{int(limit)} km per day is included in the rent." if limit else "Rent is per day."], "meta": {"extra_km": extra_km}}


def package(p: Dict[str, Any], amount: Optional[float] = None, name: Optional[str] = None) -> Dict[str, Any]:
    amt = _n(amount if amount is not None else p.get("amount"))
    label = (name or p.get("name") or "All-inclusive package").strip()
    includes = [str(x) for x in (p.get("includes") or []) if str(x).strip()]
    return {"lines": [_line(label + " (all inclusive)", amt, "FARE", note=("Includes: " + ", ".join(includes)) if includes else None)],
            "notes": (["Includes: " + ", ".join(includes)] if includes else []) + ["Toll, parking and permit are included only if listed above."],
            "meta": {"package": {"name": label, "days": p.get("days"), "itinerary": [str(x) for x in (p.get("itinerary") or []) if str(x).strip()],
                                 "includes": includes, "excludes": [str(x) for x in (p.get("excludes") or []) if str(x).strip()]}}}


def compute(method: str, params: Dict[str, Any], *, km: float = 0, days: int = 1, hours: str = "", trip_type: str = "oneway",
            amount: Optional[float] = None, name: Optional[str] = None, rules: Optional[Dict[str, Any]] = None,
            adjust: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """`adjust` comes from the pricing rules the staff applied: min_km_per_day, min_km_oneway (replace the minimums), rate_delta, bata_delta (added)."""
    method = (method or "").upper()
    if method not in METHODS:
        raise ValueError(f"Unknown method {method}")
    rules = dict(rules or {})
    adj = adjust or {}
    rd, bd = _n(adj.get("rate_delta")), _n(adj.get("bata_delta"))
    if adj.get("min_km_per_day"):
        rules["round_trip_min_km_per_day"] = rules["multicity_min_km_per_day"] = adj["min_km_per_day"]
    if adj.get("min_km_oneway"):
        rules["oneway_min_km"] = adj["min_km_oneway"]
    params = dict(params)
    if method == "KM_BATA":
        res = km_bata(km=km, rate_per_km=_n(params.get("rate_per_km")) + rd, extra_rate_per_km=_n(params.get("extra_rate_per_km")),
                      bata_per_day=_n(params.get("bata_per_day")) + bd, days=days, trip_type=trip_type,
                      min_km_oneway=int(rules.get("oneway_min_km", 130)), min_km_per_day_round=int(rules.get("round_trip_min_km_per_day", 250)),
                      min_km_per_day_multicity=int(rules.get("multicity_min_km_per_day", 250)))
    elif method == "SLAB_DROP":
        params["start_rate"] = _n(params.get("start_rate")) + rd
        if adj.get("min_km_oneway"):
            params["min_chargeable_km"] = max(_n(params.get("min_chargeable_km")), float(adj["min_km_oneway"]))
        res = slab_drop(params, km, double=params.get("double_for_drop", True) is not False)
    elif method == "SLAB_ROUND":
        params["round_rate"] = _n(params.get("round_rate")) + rd
        params["driver_allowance"] = _n(params.get("driver_allowance")) + bd
        if adj.get("min_km_per_day"):
            params["min_km_per_day"] = float(adj["min_km_per_day"])
        res = slab_round(params, km, days)
    elif method == "LOCAL":
        res = local_package(params, hours)
    elif method == "DAY_RENT":
        params["extra_km_rate"] = _n(params.get("extra_km_rate")) + rd
        res = day_rent(params, km, days)
    else:
        res = package(params, amount, name)
    shown = ", ".join(f"{k.replace('_', ' ')} {v:g}" for k, v in adj.items() if v)
    if shown:
        res.setdefault("notes", []).append("Pricing rules applied: " + shown)
    return res
