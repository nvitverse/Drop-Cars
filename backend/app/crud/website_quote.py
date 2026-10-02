"""The fare the CUSTOMER saw and confirmed on the website becomes the booking's quote.

Before: the website sent no fare at all; the backend recomputed one from its own rate card. When the two tariffs differ (the website
at 15/km + Rs 400 bata + toll + GST, the backend at 14/km + Rs 300 bata) the booking was posted at the backend's numbers, not the ones
the customer agreed to (booking #344).

Now the website sends `quoted_fare` {per_km_rate, driver_bata, billable_km, total_fare, include_taxes} (taken from the fare it already
validated server-side) and apply_website_quote() turns it into the quote fields. The backend's own quote is kept when the website sends
nothing, or when what it sends does not make sense (so a bug there can never post a crazy fare).

  total_fare is the customer's price and is authoritative.
  km charge = per_km_rate x billable_km; bata = driver_bata (posting later splits it: driver 300, the rest to the vendor extra bata).
  what is left of the total (toll, border fee, GST) is split the way the website adds it: GST = 5% of (km charge + bata) when the fare
  includes taxes, the rest is toll. A flat discount leaves nothing extra (the total is simply lower).
"""
import logging
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

GST_RATE = 0.05


class WebsiteQuotedFare(BaseModel):
    per_km_rate: float = Field(gt=0, le=200)
    driver_bata: int = Field(ge=0, le=5000)
    billable_km: float = Field(gt=0, le=10000)
    total_fare: int = Field(gt=0, le=2000000)
    include_taxes: bool = False
    include_tolls: bool = False
    # What the website itself added for tolls and the state entry tax (= the customer's PERMIT). Optional: older websites send only the total.
    toll_amount: Optional[int] = Field(default=None, ge=0, le=100000)
    permit_amount: Optional[int] = Field(default=None, ge=0, le=100000)


def apply_website_quote(backend_fare: Dict[str, Any], quote: Optional[WebsiteQuotedFare]) -> Optional[Dict[str, Any]]:
    """The quote fields built from the website's fare, or None (= keep the backend's own tariff)."""
    if quote is None:
        return None
    backend_km = float(backend_fare.get("total_km") or 0)
    backend_total = float(backend_fare.get("total_amount") or 0)
    if backend_km > 0 and not (0.5 * backend_km <= quote.billable_km <= 2.0 * backend_km):
        logger.warning("website quote ignored: km %.1f vs backend %.1f", quote.billable_km, backend_km)
        return None
    if backend_total > 0 and not (0.5 * backend_total <= quote.total_fare <= 3.0 * backend_total):
        logger.warning("website quote ignored: total %s vs backend %s", quote.total_fare, backend_total)
        return None

    km_charge = int(round(quote.per_km_rate * quote.billable_km))
    toll = quote.toll_amount or 0
    permit = quote.permit_amount or 0
    residual = quote.total_fare - km_charge - quote.driver_bata - toll - permit
    gst = 0
    if residual > 0:
        known_parts = quote.toll_amount is not None or quote.permit_amount is not None
        if quote.include_taxes or known_parts:
            gst = min(residual, int(round((km_charge + quote.driver_bata) * GST_RATE)))      # the website adds 5% of the base estimate
        toll += residual - gst                                                                  # anything else it added (parking ...) rides with toll
    cost_per_km = int(round(quote.per_km_rate))
    return {
        "cost_per_km": cost_per_km,
        "driver_allowance": quote.driver_bata,
        "toll_charges": toll,
        "permit_charges": permit,
        "gst_amount": gst or None,
        "total_amount": quote.total_fare,
        "driver_amount": km_charge + quote.driver_bata + toll + permit,
        "total_km": quote.billable_km,
    }


def apply_quote_to_request(request, quoted_fare: Dict[str, Any]) -> bool:
    """Replace the quote of a booking request that is still PENDING with the fare the customer really confirmed on the website.

    For bookings that reached the backend WITHOUT the website's fare (they were quoted from the backend's own rate card, e.g. 14/km
    + Rs 300 when the customer confirmed 15/km + Rs 400). Never touches a request staff already edited or customized. Returns True
    when the quote was replaced."""
    if getattr(request, "status", None) != "PENDING":
        return False
    if request.admin_total_amount is not None or getattr(request, "custom_driver_fare", False):
        return False
    try:
        quote = WebsiteQuotedFare(**quoted_fare)
    except Exception:  # noqa: BLE001
        return False
    q = apply_website_quote({"total_km": request.quoted_trip_distance, "total_amount": request.quoted_total_amount}, quote)
    if not q:
        return False
    request.quoted_cost_per_km = q["cost_per_km"]
    request.quoted_driver_allowance = q["driver_allowance"]
    request.quoted_extra_driver_allowance = 0
    request.quoted_permit_charges = q["permit_charges"]
    request.quoted_extra_permit_charges = 0
    request.quoted_hill_charges = 0
    request.quoted_toll_charges = q["toll_charges"]
    request.quoted_extra_cost_per_km = 0
    request.quoted_night_charges = 0
    request.quoted_total_amount = q["total_amount"]
    request.quoted_driver_amount = q["driver_amount"]
    request.quoted_trip_distance = q["total_km"]
    request.gst_included = bool(q["gst_amount"])
    request.gst_amount = q["gst_amount"]
    return True
