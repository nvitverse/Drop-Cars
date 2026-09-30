from fastapi import APIRouter, HTTPException, Query, Request
from app.core.limiter import limiter
import time
import requests

router = APIRouter(prefix="/geocode")

# Cost-conscious by design: OpenStreetMap Nominatim is free (no API key,
# no per-request billing) and is used here instead of Google Geocoding,
# specifically for Drop Bid's GPS pickup feature where request volume can be
# high (every Drop Bid booking, potentially every few seconds while the
# customer adjusts the pickup pin). Google Geocoding stays reserved for the
# existing low-volume admin/vendor "search online" city fallback in
# app/utils/cities.py.
#
# Nominatim's usage policy caps free public use at ~1 request/second and
# requires a descriptive User-Agent - both respected below. A short
# in-memory cache keyed by rounded coordinates avoids re-hitting Nominatim
# when the customer's pin settles near the same spot repeatedly.
NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
USER_AGENT = "DropCarsCustomerApp/1.0 (dropcars.co.in; support@dropcars.co.in)"

_reverse_cache: dict[str, tuple[float, dict]] = {}
_search_cache: dict[str, tuple[float, list]] = {}
CACHE_TTL_SECONDS = 300

_last_request_at = 0.0
MIN_REQUEST_GAP_SECONDS = 1.0


def _throttle():
    global _last_request_at
    elapsed = time.monotonic() - _last_request_at
    if elapsed < MIN_REQUEST_GAP_SECONDS:
        time.sleep(MIN_REQUEST_GAP_SECONDS - elapsed)
    _last_request_at = time.monotonic()


# Open without login: the Driver App signup address field uses it before an
# account exists. Rate limited per client so it can't be used as a free proxy.
@router.get("/reverse")
@limiter.limit("60/minute")
def reverse_geocode(request: Request, lat: float = Query(...), lng: float = Query(...)):
    """Free reverse geocode for Drop Bid's 'use current location' pickup.
    Rounds to ~11m precision for cache keying/deduping - plenty for a
    pickup pin, and keeps the cache useful instead of missing on every
    tiny GPS jitter."""
    cache_key = f"{round(lat, 4)},{round(lng, 4)}"
    cached = _reverse_cache.get(cache_key)
    if cached and (time.monotonic() - cached[0]) < CACHE_TTL_SECONDS:
        return cached[1]

    _throttle()
    try:
        resp = requests.get(
            f"{NOMINATIM_BASE}/reverse",
            params={"lat": lat, "lon": lng, "format": "jsonv2"},
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Location lookup failed - try again")

    if "error" in data:
        raise HTTPException(status_code=404, detail="No address found for this location")

    result = {
        "display_name": data.get("display_name", ""),
        "lat": lat,
        "lng": lng,
        "source": "osm",
    }
    _reverse_cache[cache_key] = (time.monotonic(), result)
    return result


@router.get("/search")
@limiter.limit("60/minute")
def search_location(request: Request, q: str = Query(..., min_length=2)):
    """Free forward geocode/search for Drop Bid's destination search box."""
    cache_key = q.strip().lower()
    cached = _search_cache.get(cache_key)
    if cached and (time.monotonic() - cached[0]) < CACHE_TTL_SECONDS:
        return cached[1]

    _throttle()
    try:
        resp = requests.get(
            f"{NOMINATIM_BASE}/search",
            params={"q": q, "format": "jsonv2", "countrycodes": "in", "limit": 6},
            headers={"User-Agent": USER_AGENT},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Location search failed - try again")

    results = [
        {
            "display_name": item.get("display_name", ""),
            "lat": float(item.get("lat")),
            "lng": float(item.get("lon")),
            "source": "osm",
        }
        for item in data
    ]
    _search_cache[cache_key] = (time.monotonic(), results)
    return results
