import json
import time
from pathlib import Path
from typing import List

import re
import requests

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


# Landmarks people actually type into a pickup / drop box: airports, railway stations, bus terminals and a few big
# destinations. They are served with every location list (get_places) so a search for "kempegowda" or "central station"
# finds them instantly and for free, without an online lookup.
PRESEEDED_HUBS = [
    # Airports
    "Chennai International Airport (MAA), Chennai, Tamil Nadu",
    "Kempegowda International Airport (BLR), Bengaluru, Karnataka",
    "Coimbatore International Airport (CJB), Coimbatore, Tamil Nadu",
    "Madurai Airport (IXM), Madurai, Tamil Nadu",
    "Tiruchirappalli International Airport (TRZ), Trichy, Tamil Nadu",
    "Salem Airport (SXV), Salem, Tamil Nadu",
    "Tuticorin Airport (TCR), Thoothukudi, Tamil Nadu",
    "Puducherry Airport (PNY), Puducherry",
    "Vellore Airport (VLR), Vellore, Tamil Nadu",
    "Cochin International Airport (COK), Kochi, Kerala",
    "Trivandrum International Airport (TRV), Thiruvananthapuram, Kerala",
    "Calicut International Airport (CCJ), Kozhikode, Kerala",
    "Kannur International Airport (CNN), Kannur, Kerala",
    "Mysuru Airport (MYQ), Mysuru, Karnataka",
    "Mangaluru International Airport (IXE), Mangaluru, Karnataka",
    "Hubballi Airport (HBX), Hubballi, Karnataka",
    "Rajiv Gandhi International Airport (HYD), Hyderabad, Telangana",
    "Tirupati Airport (TIR), Tirupati, Andhra Pradesh",
    "Visakhapatnam Airport (VTZ), Visakhapatnam, Andhra Pradesh",
    "Vijayawada Airport (VGA), Vijayawada, Andhra Pradesh",
    "Chhatrapati Shivaji Maharaj International Airport (BOM), Mumbai, Maharashtra",
    "Pune Airport (PNQ), Pune, Maharashtra",
    "Goa International Airport (GOI), Dabolim, Goa",
    "Indira Gandhi International Airport (DEL), New Delhi",
    # Railway stations - Tamil Nadu
    "Chennai Central Railway Station (MAS), Chennai, Tamil Nadu",
    "Chennai Egmore Railway Station (MS), Chennai, Tamil Nadu",
    "Tambaram Railway Station (TBM), Chennai, Tamil Nadu",
    "Katpadi Junction Railway Station (KPD), Vellore, Tamil Nadu",
    "Villupuram Junction Railway Station (VM), Villupuram, Tamil Nadu",
    "Tiruchirappalli Junction Railway Station (TPJ), Trichy, Tamil Nadu",
    "Thanjavur Junction Railway Station (TJ), Thanjavur, Tamil Nadu",
    "Madurai Junction Railway Station (MDU), Madurai, Tamil Nadu",
    "Tirunelveli Junction Railway Station (TEN), Tirunelveli, Tamil Nadu",
    "Nagercoil Junction Railway Station (NCJ), Nagercoil, Tamil Nadu",
    "Kanyakumari Railway Station (CAPE), Kanyakumari, Tamil Nadu",
    "Coimbatore Junction Railway Station (CBE), Coimbatore, Tamil Nadu",
    "Erode Junction Railway Station (ED), Erode, Tamil Nadu",
    "Salem Junction Railway Station (SA), Salem, Tamil Nadu",
    "Tiruppur Railway Station (TUP), Tiruppur, Tamil Nadu",
    "Rameswaram Railway Station (RMM), Rameswaram, Tamil Nadu",
    "Karaikudi Junction Railway Station (KKDI), Karaikudi, Tamil Nadu",
    "Mayiladuthurai Junction Railway Station (MV), Mayiladuthurai, Tamil Nadu",
    "Kumbakonam Railway Station (KMU), Kumbakonam, Tamil Nadu",
    "Dindigul Junction Railway Station (DG), Dindigul, Tamil Nadu",
    # Railway stations - elsewhere
    "KSR Bengaluru City Junction Railway Station (SBC), Bengaluru, Karnataka",
    "Yesvantpur Junction Railway Station (YPR), Bengaluru, Karnataka",
    "Bengaluru Cantonment Railway Station (BNC), Bengaluru, Karnataka",
    "Krishnarajapuram Railway Station (KJM), Bengaluru, Karnataka",
    "Mysuru Junction Railway Station (MYS), Mysuru, Karnataka",
    "Ernakulam Junction Railway Station (ERS), Kochi, Kerala",
    "Thiruvananthapuram Central Railway Station (TVC), Thiruvananthapuram, Kerala",
    "Kozhikode Railway Station (CLT), Kozhikode, Kerala",
    "Palakkad Junction Railway Station (PGT), Palakkad, Kerala",
    "Secunderabad Junction Railway Station (SC), Hyderabad, Telangana",
    "Tirupati Railway Station (TPTY), Tirupati, Andhra Pradesh",
    "Renigunta Junction Railway Station (RU), Tirupati, Andhra Pradesh",
    "Vijayawada Junction Railway Station (BZA), Vijayawada, Andhra Pradesh",
    "Puducherry Railway Station (PDY), Puducherry",
    # Bus terminals
    "Chennai Mofussil Bus Terminus (CMBT), Koyambedu, Chennai, Tamil Nadu",
    "Kilambakkam Bus Terminus (KCBT), Chennai, Tamil Nadu",
    "Madhavaram Bus Terminus, Chennai, Tamil Nadu",
    "Majestic Kempegowda Bus Station, Bengaluru, Karnataka",
    "Satellite Bus Station, Bengaluru, Karnataka",
    "Mattuthavani Bus Stand, Madurai, Tamil Nadu",
    "Gandhipuram Bus Stand, Coimbatore, Tamil Nadu",
    "Central Bus Stand, Tiruchirappalli, Tamil Nadu",
    "Hosur Bus Stand, Hosur, Tamil Nadu",
    # Small towns the geocoder keeps mis-resolving
    "Nannilam, Tamil Nadu",
    "Neepathurai, Tamil Nadu",
    "Naidumangalam, Tamil Nadu",
    "Chengam, Tamil Nadu",
    "Sriperumbudur, Tamil Nadu",
    "Acharapakkam, Tamil Nadu",
    "Melmaruvathur, Tamil Nadu",
    "Kallakurichi, Tamil Nadu",
    "Tiruvannamalai, Tamil Nadu",
]


def get_places() -> List[str]:
    """The master city list PLUS the landmark hubs - what every location search box searches. (get_cities() stays
    cities-only because vendors' / drivers' notification-city selection is built on it.)"""
    cities = get_cities() or []
    seen = {c.strip().lower() for c in cities}
    return list(cities) + [h for h in PRESEEDED_HUBS if h.strip().lower() not in seen]


# Spelling variants people type, folded to the spelling used in PRESEEDED_HUBS / the geocoder
_QUERY_ALIASES = [
    (r"\b(bangalore|bangaluru|bengalore|banglore)\b", "bengaluru"),
    (r"\b(kempagowda|kempegouda|kempagouda|kempe\s?gowda|kempa\s?gowda)\b", "kempegowda"),
    (r"\b(trichy|tiruchi|tiruchirapalli)\b", "tiruchirappalli"),
    (r"\b(tuticorin)\b", "thoothukudi"),
    (r"\b(trivandrum)\b", "thiruvananthapuram"),
    (r"\b(cochin)\b", "kochi"),
    (r"\b(calicut)\b", "kozhikode"),
    (r"\b(pondicherry)\b", "puducherry"),
    (r"\b(mysore)\b", "mysuru"),
    (r"\b(mangalore)\b", "mangaluru"),
    (r"\b(vizag)\b", "visakhapatnam"),
]


def _norm_place(s: str) -> str:
    t = re.sub(r"[().,/\\-]+", " ", (s or "").lower())
    for pat, to in _QUERY_ALIASES:
        t = re.sub(pat, to, t)
    t = re.sub(r"\b(railway station|rly station|junction|jn)\b", "station", t)
    t = re.sub(r"\b(intl)\b", "international", t)
    return re.sub(r"\s+", " ", t).strip()


def find_preseeded_hub(query: str):
    """A hub whose words cover every word of the query (spelling variants folded), e.g. 'kempagowda' or
    'bangalore airport' -> Kempegowda International Airport."""
    nq = _norm_place(query)
    if not nq:
        return None
    toks = nq.split(" ")
    # the list is ordered airports -> stations -> bus terminals, so the first hit is the most likely intent
    for hub in PRESEEDED_HUBS:
        if nq in _norm_place(hub):
            return hub
    for hub in PRESEEDED_HUBS:
        words = _norm_place(hub).split(" ")
        if all(any(w.startswith(t) for w in words) for t in toks):
            return hub
    return None


# query -> resolved place, per instance: the same typed text (or the same typo) is never sent to Google twice
_LOOKUP_CACHE: dict = {}


def _similar_place(a: str, b: str) -> bool:
    """True when two place names are the same place spelt slightly differently (Vedaranyam / Vedaranyam Taluk)."""
    from difflib import SequenceMatcher
    x, y = _norm_place(a), _norm_place(b)
    if not x or not y:
        return False
    return x == y or (len(x) >= 4 and (x in y or y in x)) or SequenceMatcher(None, x, y).ratio() >= 0.75


def lookup_and_add_city(db, query: str) -> dict:
    """Online fallback for the city picker: resolves specific places, airports,
    railway stations, towns and taluks with smart caching. Uses Google Maps Key Pool
    with automatic quota rotation and OSM Nominatim fallback for guaranteed fail-safe.
    """
    from app.utils.maps_pool import get_active_google_api_key, record_key_usage, fetch_nominatim_search

    query = (query or "").strip()
    if not query:
        raise ValueError("Enter a city or place name to search")

    q_lower = query.lower()
    is_hub_query = any(k in q_lower for k in (
        "airport", "kempegowda", "kempagowda", "central", "station", "terminal", "railway", "junction", "bus stand",
        "bus stop", "busstand", "temple", "beach", "fort", "mall", "hospital", "college", "university", "hotel", "resort",
        "stadium", "museum", "park", "dam", "falls", "church", "mosque", "dargah", "it park", "tech park", "sez"))
    # Google place types that mean "a specific landmark" rather than a town - keep their full name
    landmark_types = {"airport", "train_station", "transit_station", "bus_station", "subway_station", "light_rail_station",
                      "tourist_attraction", "point_of_interest", "establishment", "premise", "place_of_worship",
                      "hospital", "university", "shopping_mall", "lodging", "stadium", "museum", "park", "natural_feature"}

    # Check preseeded hubs first (instant zero-cost hit), tolerant of spelling variants (kempagowda / bangalore airport).
    # A plain city that is already in the master list is never turned into a station/airport by this.
    nq = _norm_place(query)
    is_plain_city = any(_norm_place(c) == nq for c in get_cities())
    hub = None if is_plain_city else find_preseeded_hub(query)
    if hub and len(nq) >= 4:
        existing = get_cities()
        if not any(c.strip().lower() == hub.strip().lower() for c in existing):
            save_cities(db, sorted(set(existing) | {hub}))
        return {"city": hub, "already_existed": True}

    cache_key = _norm_place(query)
    if cache_key in _LOOKUP_CACHE:
        return {"city": _LOOKUP_CACHE[cache_key], "already_existed": True}

    resolved_place_name = None
    fallback_place = None
    api_key = get_active_google_api_key()

    # 1. Try Google Geocoding API if key is available
    if api_key:
        try:
            queries_to_try = [
                f"{query}, Tamil Nadu, India",
                f"{query}, India",
                query,
            ]
            for g_query in queries_to_try:
                resp = requests.get(
                    "https://maps.googleapis.com/maps/api/geocode/json",
                    params={"address": g_query, "region": "in", "key": api_key},
                    timeout=10,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    status = data.get("status")
                    if status == "OVER_QUERY_LIMIT":
                        record_key_usage(api_key, status_ok=False)
                        break
                    record_key_usage(api_key, status_ok=True)

                    results = data.get("results") or []
                    if status == "OK" and results:
                        first = results[0]
                        formatted = first.get("formatted_address", "")
                        clean_formatted = re.sub(r",\s*India$", "", formatted).strip()

                        first_types = set(first.get("types") or [])
                        if is_hub_query or (first_types & landmark_types and not first_types & {"locality", "sublocality", "administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3"}):
                            # Preserve the specific airport / station / terminal / landmark title (without the pin code)
                            resolved_place_name = re.sub(r"\s+\d{6}", "", clean_formatted).strip().rstrip(",")
                            break

                        # For regular towns / villages: use the address part that actually IS the searched place
                        # (village / taluk / town names), never a bigger district the geocoder fell back to.
                        components = first.get("address_components", [])
                        state_name = ""
                        district = ""
                        place_names = []
                        for comp in components:
                            types = comp.get("types", [])
                            nm = comp.get("long_name", "")
                            if "administrative_area_level_1" in types:
                                state_name = nm
                            elif "administrative_area_level_2" in types:
                                district = nm
                            if any(t in types for t in ("locality", "postal_town", "sublocality", "sublocality_level_1",
                                                        "neighborhood", "administrative_area_level_3", "administrative_area_level_2",
                                                        "natural_feature", "point_of_interest")):
                                place_names.append(nm)
                        place_names.append(clean_formatted.split(",")[0].strip())
                        candidate = next((n for n in place_names if n and _similar_place(query, n)), None)
                        if candidate:
                            resolved_place_name = f"{candidate}, {state_name}" if state_name and state_name.lower() not in candidate.lower() else candidate
                            break
                        # Geocoder answered with something else (a district, a look-alike): remember a safe fallback and
                        # try the next, wider query
                        if not fallback_place:
                            fallback_place = ", ".join(x for x in (query.strip().title(), district, state_name) if x)
        except Exception:
            pass

    # 2. Fallback to OpenStreetMap Nominatim if Google didn't return a match
    if not resolved_place_name and not fallback_place:
        osm_results = fetch_nominatim_search(query)
        if not osm_results:
            osm_results = fetch_nominatim_search(f"{query}, Tamil Nadu")

        if osm_results:
            first_osm = osm_results[0]
            display = first_osm.get("display_name", "")
            clean_display = re.sub(r",\s*India$", "", display).strip()
            addr = first_osm.get("address", {})
            # An airport / station / bus stand / landmark keeps its own name ("<name>, <city>, <state>") instead of being
            # collapsed to just the city
            osm_class = first_osm.get("category") or first_osm.get("class") or ""
            osm_name = first_osm.get("name") or ""
            if osm_name and osm_class in ("aeroway", "railway", "amenity", "tourism", "building", "shop", "leisure", "historic", "man_made", "office", "highway", "public_transport"):
                osm_city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("suburb") or addr.get("county") or ""
                osm_state = addr.get("state", "")
                resolved_place_name = ", ".join(dict.fromkeys(x for x in (osm_name, osm_city, osm_state) if x))
            specific = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("suburb") or addr.get("county") or first_osm.get("name")
            state = addr.get("state", "")
            if resolved_place_name:
                pass
            elif specific and state:
                resolved_place_name = f"{specific}, {state}"
            elif specific:
                resolved_place_name = specific
            else:
                resolved_place_name = clean_display

    if not resolved_place_name:
        # Final fallback: the geocoder's safe answer, else the cleaned user query itself
        resolved_place_name = fallback_place or query.title()

    existing = get_cities()
    already_existed = any(c.strip().lower() == resolved_place_name.strip().lower() for c in existing)
    if not already_existed:
        save_cities(db, sorted(set(existing) | {resolved_place_name}))

    if len(_LOOKUP_CACHE) < 2000:
        _LOOKUP_CACHE[cache_key] = resolved_place_name
    return {"city": resolved_place_name, "already_existed": already_existed}
