"""Local Drop: a short in-city trip (e.g. Jafferkhanpet -> Chennai Airport, Chennai -> Mahabalipuram) priced per km with the driver's
allowance included, up to a km limit; every km beyond the limit has its own rate. Toll and parking are extra (paid on actuals).

The booking is an ordinary per-km booking (cost_per_km = the rate, driver_allowance = 0) so the whole fare / commission engine applies
unchanged - Local trips use the LOCAL commission category (15 %, no Rs 200 minimum) and have no minimum km. The only thing the engine did
not know is "different rate after the limit": it is stored on the booking as one `charge_items` entry (key `local_drop`) and applied here
when the trip is closed."""
from typing import Any, List, Optional

ITEM_KEY = "local_drop"


def local_drop_item(km_limit: int, extra_km_rate: Optional[int], rate_per_km: int) -> dict:
    """The charge_items entry that carries the Local Drop terms (shown to the driver as plain text, read back at trip close)."""
    limit = max(1, int(km_limit or 0))
    rate = max(0, int(rate_per_km or 0))
    extra = int(extra_km_rate) if extra_km_rate not in (None, "") and int(extra_km_rate) > 0 else rate
    return {
        "key": ITEM_KEY, "included": True, "km_limit": limit, "extra_km_rate": extra, "rate_per_km": rate,
        "label": f"Local Drop: up to {limit} km at Rs {rate}/km (driver allowance included). Extra km Rs {extra}/km. Toll and parking extra, on actuals. 5% GST is added.",
    }


GST_PERCENT = 5
GST_LABEL = "GST on KM Fare (5%)"


def with_compulsory_gst(charge_items: Optional[List[Any]]) -> List[Any]:
    """Local bookings always carry 5% GST on the km fare (owner rule 2026-10-14); toll and parking stay extra, on actuals. The GST charge item is what
    marks a booking as GST-included everywhere else (tax invoice, GST amount), so adding it here is the whole rule."""
    items = list(charge_items or [])
    if not any(isinstance(i, dict) and i.get("included") and "gst" in str(i.get("label", "")).lower() for i in items):
        items.append({"label": GST_LABEL, "included": True})
    return items


def gst_on_km_fare(km_fare: float) -> int:
    return int(round(float(km_fare or 0) * GST_PERCENT / 100.0))


MIN_KEY = "local_min_km"


def local_min_item(min_km: int) -> dict:
    """The booking's own minimum billed km, fixed when it is posted (so a later change of the setting does not change a booking already given to a driver)."""
    km = max(1, int(min_km or 0))
    return {"key": MIN_KEY, "included": True, "min_km": km, "label": f"Minimum billing: {km} km (billed even if the trip is shorter)."}


def local_min_km(charge_items: Optional[List[Any]], default: int) -> int:
    """Minimum billed km of a Local booking: the one stored on the booking, else the current setting."""
    for it in charge_items or []:
        if isinstance(it, dict) and it.get("key") == MIN_KEY and int(it.get("min_km") or 0) > 0:
            return int(it["min_km"])
    return max(0, int(default or 0))


def find_item(charge_items: Optional[List[Any]]) -> Optional[dict]:
    for it in charge_items or []:
        if isinstance(it, dict) and it.get("key") == ITEM_KEY:
            return it
    return None


def local_drop_extra_amount(charge_items: Optional[List[Any]], billed_km: float, rate_per_km: int) -> int:
    """Rupees to ADD to the bill because the km beyond the limit are charged at the extra-km rate instead of the normal rate
    ((extra_rate - rate) x km beyond the limit; negative when the extra rate is the cheaper one). 0 for any other booking."""
    it = find_item(charge_items)
    if not it:
        return 0
    limit, extra = int(it.get("km_limit") or 0), int(it.get("extra_km_rate") or 0)
    beyond = max(0, int(billed_km or 0) - limit)
    if limit <= 0 or extra <= 0 or beyond <= 0:
        return 0
    return beyond * (extra - int(rate_per_km or 0))
