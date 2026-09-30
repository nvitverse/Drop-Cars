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


def is_city_serviceable(db: Session, city_name: str) -> bool:
    target = (city_name or "").strip().lower()
    if not target:
        return False
    return any(
        c.get("city", "").strip().lower() == target and c.get("serviceable")
        for c in _load(db)
    )


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
