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
    residual = quote.total_fare - km_charge - quote.driver_bata
    gst = toll = 0
    if residual > 0:
        if quote.include_taxes:
            gst = min(residual, int(round((km_charge + quote.driver_bata) * GST_RATE)))
        toll = residual - gst
    cost_per_km = int(round(quote.per_km_rate))
    return {
        "cost_per_km": cost_per_km,
        "driver_allowance": quote.driver_bata,
        "toll_charges": toll,
        "gst_amount": gst or None,
        "total_amount": quote.total_fare,
        "driver_amount": int(round(quote.per_km_rate * quote.billable_km)) + quote.driver_bata + toll,
        "total_km": quote.billable_km,
    }
