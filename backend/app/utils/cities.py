import json
import time
from pathlib import Path
from typing import List

_CITIES_CACHE: List[str] | None = None
# Cloud Run runs multiple instances of this service, each with its own
# process memory. Without this, load_cities_once() below only ran once per
# instance at cold-start, so a city saved via lookup_and_add_city() on one
# instance (see save_cities()'s in-memory update) never reached any other
# already-warm instance - callers kept hitting instances that still thought
# the city didn't exist, forcing a fresh online Geocoding lookup every time
# instead of ever actually being served from the saved list. A short TTL
# re-reads the (cheap, single-row) DB value periodically so every instance
# converges on the latest list within a minute of any instance saving it.
_CITIES_CACHE_LOADED_AT: float = 0.0
_CITIES_CACHE_TTL_SECONDS = 60

# platform_settings key holding the admin-editable city list (JSON array).
# When present it overrides load_data/cities.json, so the owner can manage
# cities from the admin panel (Settings > Cities) without a code change.
CITIES_SETTING_KEY = "cities_list"


def _load_from_db() -> List[str] | None:
    try:
        from app.database.session import SessionLocal
        from app.models.platform_setting import PlatformSetting

        db = SessionLocal()
        try:
            row = db.query(PlatformSetting).filter(
                PlatformSetting.key == CITIES_SETTING_KEY
            ).first()
            if row and row.value:
                cities = json.loads(row.value)
                if isinstance(cities, list) and cities:
                    return [str(c) for c in cities]
            return None
        finally:
            db.close()
    except Exception:
        # DB not ready / table missing - fall back to the bundled file
        return None


def load_cities_once(base_path: str) -> List[str]:
    global _CITIES_CACHE, _CITIES_CACHE_LOADED_AT
    if _CITIES_CACHE is not None:
        return _CITIES_CACHE

    from_db = _load_from_db()
    if from_db is not None:
        _CITIES_CACHE = from_db
        _CITIES_CACHE_LOADED_AT = time.monotonic()
        return _CITIES_CACHE

    file_path = Path(base_path) / "load_data" / "cities.json"
    with open(file_path, "r", encoding="utf-8") as f:
        _CITIES_CACHE = json.load(f)
    _CITIES_CACHE_LOADED_AT = time.monotonic()
    return _CITIES_CACHE


def get_cities() -> List[str]:
    global _CITIES_CACHE, _CITIES_CACHE_LOADED_AT
    now = time.monotonic()
    if _CITIES_CACHE is not None and (now - _CITIES_CACHE_LOADED_AT) < _CITIES_CACHE_TTL_SECONDS:
        return _CITIES_CACHE

    from_db = _load_from_db()
    if from_db is not None:
        _CITIES_CACHE = from_db
    _CITIES_CACHE_LOADED_AT = now
    return _CITIES_CACHE or []


def save_cities(db, cities: List[str]) -> List[str]:
    """Persist the admin-edited city list and refresh the in-memory cache."""
    global _CITIES_CACHE
    from app.models.platform_setting import PlatformSetting

    row = db.query(PlatformSetting).filter(
        PlatformSetting.key == CITIES_SETTING_KEY
    ).first()
    value = json.dumps(list(cities))
    if row:
        row.value = value
    else:
        row = PlatformSetting(key=CITIES_SETTING_KEY, value=value)
    db.add(row)
    db.commit()
    _CITIES_CACHE = list(cities)
    return _CITIES_CACHE


def lookup_and_add_city(db, query: str) -> dict:
    """Online fallback for the city picker: fuzzy local search already covers
    typos against our own list, but when a vendor/driver types a city that
    genuinely isn't in the list yet, this does ONE Google Geocoding call
    (not per-keystroke - only when the fallback button is tapped) to resolve
    it, then adds it to the shared city list so it's searchable from then on.
    """
    import requests
    from app.utils.maps import get_google_maps_api_key, MapsApiError

    query = (query or "").strip()
    if not query:
        raise ValueError("Enter a city name to search")

    try:
        api_key = get_google_maps_api_key()
    except MapsApiError as e:
        raise ValueError(str(e))

    response = requests.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        params={"address": query, "region": "in", "key": api_key},
        timeout=15,
    )
    if response.status_code != 200:
        raise ValueError("Online lookup failed - try again")

    data = response.json()
    results = data.get("results") or []
    if data.get("status") != "OK" or not results:
        raise ValueError(f'No place found for "{query}". Check the spelling and try again.')

    result = results[0]
    components = result.get("address_components", [])
    city_name = None
    # Prefer the most specific "city-like" component available.
    for want in ("locality", "administrative_area_level_3", "administrative_area_level_2", "postal_town"):
        for comp in components:
            if want in comp.get("types", []):
                city_name = comp.get("long_name")
                break
        if city_name:
            break
    if not city_name:
        city_name = (result.get("formatted_address") or query).split(",")[0].strip()

    existing = get_cities()
    already_existed = any(c.strip().lower() == city_name.strip().lower() for c in existing)
    if not already_existed:
        save_cities(db, sorted(set(existing) | {city_name}))

    return {"city": city_name, "already_existed": already_existed}
