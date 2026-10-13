import json
from typing import List, Dict

from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting

# Which cities Local Bookings (Phase 06) can be posted in - separate from the
# general "cities_list" used everywhere else (that one is the full pickup/
# drop autocomplete list for Outstation trips; this one gates a new trip
# type city-by-city, off by default outside Tamil Nadu until ops turns a
# city on). Same platform_settings JSON-blob pattern as cities_list /
# commission_rates so admin can retune without a deploy.
SERVICEABLE_CITIES_KEY = "local_serviceable_cities"

# {city, state, serviceable} - South India seed, Tamil Nadu on by default.
_DEFAULT_CITIES: List[Dict] = [
    {"city": "Chennai", "state": "Tamil Nadu", "serviceable": True},
    {"city": "Coimbatore", "state": "Tamil Nadu", "serviceable": True},
    {"city": "Madurai", "state": "Tamil Nadu", "serviceable": True},
    {"city": "Tiruchirappalli", "state": "Tamil Nadu", "serviceable": True},
    {"city": "Salem", "state": "Tamil Nadu", "serviceable": True},
    {"city": "Tirunelveli", "state": "Tamil Nadu", "serviceable": True},
    {"city": "Vellore", "state": "Tamil Nadu", "serviceable": True},
    {"city": "Erode", "state": "Tamil Nadu", "serviceable": True},
    {"city": "Thoothukudi", "state": "Tamil Nadu", "serviceable": True},
    {"city": "Bengaluru", "state": "Karnataka", "serviceable": False},
    {"city": "Mysuru", "state": "Karnataka", "serviceable": False},
    {"city": "Mangaluru", "state": "Karnataka", "serviceable": False},
    {"city": "Kochi", "state": "Kerala", "serviceable": False},
    {"city": "Thiruvananthapuram", "state": "Kerala", "serviceable": False},
    {"city": "Kozhikode", "state": "Kerala", "serviceable": False},
    {"city": "Hyderabad", "state": "Telangana", "serviceable": False},
    {"city": "Warangal", "state": "Telangana", "serviceable": False},
    {"city": "Visakhapatnam", "state": "Andhra Pradesh", "serviceable": False},
    {"city": "Vijayawada", "state": "Andhra Pradesh", "serviceable": False},
]


def _load(db: Session) -> List[Dict]:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == SERVICEABLE_CITIES_KEY).first()
    if row and row.value:
        try:
            loaded = json.loads(row.value)
            if isinstance(loaded, list) and loaded:
                return loaded
        except Exception:
            pass
    return _DEFAULT_CITIES


def get_serviceable_cities(db: Session) -> List[Dict]:
    """Full list with serviceable flags, for the admin settings screen."""
    return _load(db)


def get_serviceable_city_names(db: Session) -> List[str]:
    """Only the cities currently turned on, for the Vendor App Local picker."""
    return [c["city"] for c in _load(db) if c.get("serviceable")]


# Spellings people type, folded to the names in the list above
_ALIASES = {"bangalore": "bengaluru", "bangaluru": "bengaluru", "trichy": "tiruchirappalli", "tiruchi": "tiruchirappalli", "mysore": "mysuru",
            "mangalore": "mangaluru", "cochin": "kochi", "trivandrum": "thiruvananthapuram", "calicut": "kozhikode", "tuticorin": "thoothukudi",
            "vizag": "visakhapatnam", "madras": "chennai", "coimbatore": "coimbatore", "kovai": "coimbatore"}
_GEOCODE_CACHE: Dict[str, List[str]] = {}


def _fold(text: str) -> str:
    import re
    t = re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()
    for k, v in _ALIASES.items():
        t = re.sub(rf"\b{k}\b", v, t)
    return f" {t} "


def _match_city(cities: List[Dict], text: str):
    """The list entry whose name appears in `text` as a whole word (Vadapalani, Chennai, Tamil Nadu -> Chennai); None if none does."""
    folded = _fold(text)
    for c in cities:
        name = _fold(c.get("city", "")).strip()
        if name and f" {name} " in folded:
            return c
    return None


def _geocoded_localities(place: str) -> List[str]:
    """City / district names Google's geocoder gives for a neighbourhood or landmark (Vadapalani -> Chennai, Kasi Theatre -> Chennai).
    Cached per instance; [] when there is no key / the call fails (the caller then simply cannot confirm the city)."""
    key = _fold(place).strip()
    if key in _GEOCODE_CACHE:
        return _GEOCODE_CACHE[key]
    names: List[str] = []
    try:
        import requests
        from app.utils.maps_pool import get_active_google_api_key
        api_key = get_active_google_api_key()
        if api_key:
            r = requests.get("https://maps.googleapis.com/maps/api/geocode/json", params={"address": place, "region": "in", "components": "country:IN", "key": api_key}, timeout=6)
            res = (r.json().get("results") or [])[:1]
            for comp in (res[0].get("address_components") if res else []) or []:
                if set(comp.get("types", [])) & {"locality", "administrative_area_level_3", "administrative_area_level_2", "sublocality_level_1"}:
                    names.append(comp.get("long_name", ""))
    except Exception:  # noqa: BLE001
        return []
    _GEOCODE_CACHE[key] = names
    return names


def city_entry_for_place(db: Session, place: str):
    """Which city list entry a typed pickup belongs to: the city name inside the text, else the geocoder's city for the place."""
    cities = _load(db)
    hit = _match_city(cities, place)
    if hit:
        return hit
    for name in _geocoded_localities(place):
        hit = _match_city(cities, name)
        if hit:
            return hit
    return None


def is_city_serviceable(db: Session, city_name: str) -> bool:
    """True when the pickup is in a city that Local bookings are switched on for. `city_name` may be a plain city ("Chennai") or any
    place inside one ("Vadapalani", "West Jafferkhanpet, Chennai", "Kasi Theatre")."""
    if not (city_name or "").strip():
        return False
    hit = city_entry_for_place(db, city_name)
    return bool(hit and hit.get("serviceable"))


def save_serviceable_cities(db: Session, cities: List[Dict]) -> List[Dict]:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == SERVICEABLE_CITIES_KEY).first()
    value = json.dumps(cities)
    if row:
        row.value = value
    else:
        row = PlatformSetting(key=SERVICEABLE_CITIES_KEY, value=value)
    db.add(row)
    db.commit()
    return cities
