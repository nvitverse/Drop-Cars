import json
import time
from typing import List, Dict

_CAR_MODELS_CACHE: List[Dict[str, str]] | None = None
# Same per-instance staleness bug as app/utils/cities.py had (fixed there
# first): Cloud Run runs multiple instances, each with its own process
# memory, so a cache loaded once at cold-start and updated only in the
# instance that happened to handle an admin edit never reaches any other
# already-warm instance. A short TTL re-reads the DB periodically so every
# instance converges within a minute of any instance saving a change.
_CAR_MODELS_CACHE_LOADED_AT: float = 0.0
_CAR_MODELS_CACHE_TTL_SECONDS = 60

# platform_settings key holding the admin-editable car model list (JSON array
# of {"name": ..., "type": ...}). When present it overrides the bundled
# default below, so the owner can add/remove car models from the admin panel
# (Settings > Car Models) without a code change.
CAR_MODELS_SETTING_KEY = "car_models_list"

# Bundled default so the picker still works before any admin edit has ever
# been saved. Keys must match CarTypeEnum in app/models/car_details.py.
_DEFAULT_CAR_MODELS: List[Dict[str, str]] = [
    {"name": "Maruti Swift", "type": "HATCHBACK"},
    {"name": "Maruti WagonR", "type": "HATCHBACK"},
    {"name": "Maruti Alto", "type": "HATCHBACK"},
    {"name": "Maruti Alto K10", "type": "HATCHBACK"},
    {"name": "Maruti Baleno", "type": "HATCHBACK"},
    {"name": "Maruti Celerio", "type": "HATCHBACK"},
    {"name": "Maruti Ignis", "type": "HATCHBACK"},
    {"name": "Maruti S-Presso", "type": "HATCHBACK"},
    {"name": "Maruti Ritz", "type": "HATCHBACK"},
    {"name": "Toyota Glanza", "type": "HATCHBACK"},
    {"name": "Hyundai i10", "type": "HATCHBACK"},
    {"name": "Hyundai i20", "type": "HATCHBACK"},
    {"name": "Hyundai Grand i10", "type": "HATCHBACK"},
    {"name": "Hyundai Santro", "type": "HATCHBACK"},
    {"name": "Tata Tiago", "type": "HATCHBACK"},
    {"name": "Tata Punch", "type": "HATCHBACK"},
    {"name": "Tata Altroz", "type": "HATCHBACK"},
    {"name": "Renault Kwid", "type": "HATCHBACK"},
    {"name": "Volkswagen Polo", "type": "HATCHBACK"},
    {"name": "Ford Figo", "type": "HATCHBACK"},
    {"name": "Honda Jazz", "type": "HATCHBACK"},
    {"name": "Chevrolet Beat", "type": "HATCHBACK"},
    {"name": "Maruti Swift Dzire", "type": "SEDAN_4_PLUS_1"},
    {"name": "Hyundai Aura", "type": "SEDAN_4_PLUS_1"},
    {"name": "Tata Zest", "type": "SEDAN_4_PLUS_1"},
    {"name": "Tata Tigor", "type": "SEDAN_4_PLUS_1"},
    {"name": "Honda Amaze", "type": "SEDAN_4_PLUS_1"},
    {"name": "Honda City", "type": "SEDAN_4_PLUS_1"},
    {"name": "Hyundai Verna", "type": "SEDAN_4_PLUS_1"},
    {"name": "Hyundai Xcent", "type": "SEDAN_4_PLUS_1"},
    {"name": "Maruti Ciaz", "type": "SEDAN_4_PLUS_1"},
    {"name": "Volkswagen Vento", "type": "SEDAN_4_PLUS_1"},
    {"name": "Skoda Rapid", "type": "SEDAN_4_PLUS_1"},
    {"name": "Toyota Etios", "type": "ETIOS_4_PLUS_1"},
    {"name": "Toyota Etios Liva", "type": "ETIOS_4_PLUS_1"},
    {"name": "Toyota Camry", "type": "SEDAN_4_PLUS_1"},
    {"name": "Toyota Urban Cruiser", "type": "SUV"},
    {"name": "Hyundai Creta", "type": "SUV"},
    {"name": "Hyundai Venue", "type": "SUV"},
    {"name": "Maruti Brezza", "type": "SUV"},
    {"name": "Tata Nexon", "type": "SUV"},
    {"name": "Mahindra XUV300", "type": "SUV"},
    {"name": "Renault Duster", "type": "SUV"},
    {"name": "Ford EcoSport", "type": "SUV"},
    {"name": "Kia Sonet", "type": "SUV"},
    {"name": "Maruti S-Cross", "type": "SUV"},
    {"name": "Renault Triber", "type": "SUV_6_PLUS_1"},
    {"name": "Maruti Ertiga", "type": "SUV_6_PLUS_1"},
    {"name": "Toyota Rumion", "type": "SUV_6_PLUS_1"},
    {"name": "Mahindra Bolero", "type": "SUV_7_PLUS_1"},
    {"name": "Mahindra Scorpio", "type": "SUV_7_PLUS_1"},
    {"name": "Mahindra XUV500", "type": "SUV_7_PLUS_1"},
    {"name": "Mahindra XUV700", "type": "SUV_7_PLUS_1"},
    {"name": "Mahindra Xylo", "type": "SUV_7_PLUS_1"},
    {"name": "Mahindra Marazzo", "type": "SUV_7_PLUS_1"},
    {"name": "Chevrolet Tavera", "type": "SUV_7_PLUS_1"},
    {"name": "Chevrolet Enjoy", "type": "SUV_7_PLUS_1"},
    {"name": "Tata Safari", "type": "SUV_7_PLUS_1"},
    {"name": "Tata Hexa", "type": "SUV_7_PLUS_1"},
    {"name": "Toyota Fortuner", "type": "SUV_7_PLUS_1"},
    {"name": "Kia Carens", "type": "SUV_7_PLUS_1"},
    {"name": "Kia Carens Clavis", "type": "SUV_7_PLUS_1"},
    {"name": "Toyota Innova", "type": "INNOVA_7_PLUS_1"},
    {"name": "Toyota Innova Crysta", "type": "INNOVA_CRYSTA_7_PLUS_1"},
    {"name": "Toyota Innova Hycross", "type": "INNOVA_CRYSTA_7_PLUS_1"},
]


def _load_from_db() -> List[Dict[str, str]] | None:
    try:
        from app.database.session import SessionLocal
        from app.models.platform_setting import PlatformSetting

        db = SessionLocal()
        try:
            row = db.query(PlatformSetting).filter(
                PlatformSetting.key == CAR_MODELS_SETTING_KEY
            ).first()
            if row and row.value:
                models = json.loads(row.value)
                if isinstance(models, list) and models:
                    return [{"name": str(m["name"]), "type": str(m["type"])} for m in models]
            return None
        finally:
            db.close()
    except Exception:
        # DB not ready / table missing - fall back to the bundled default
        return None


def load_car_models_once() -> List[Dict[str, str]]:
    global _CAR_MODELS_CACHE, _CAR_MODELS_CACHE_LOADED_AT
    if _CAR_MODELS_CACHE is not None:
        return _CAR_MODELS_CACHE

    from_db = _load_from_db()
    _CAR_MODELS_CACHE = from_db if from_db is not None else list(_DEFAULT_CAR_MODELS)
    _CAR_MODELS_CACHE_LOADED_AT = time.monotonic()
    return _CAR_MODELS_CACHE


def get_car_models() -> List[Dict[str, str]]:
    global _CAR_MODELS_CACHE, _CAR_MODELS_CACHE_LOADED_AT
    now = time.monotonic()
    if _CAR_MODELS_CACHE is not None and (now - _CAR_MODELS_CACHE_LOADED_AT) < _CAR_MODELS_CACHE_TTL_SECONDS:
        return _CAR_MODELS_CACHE

    from_db = _load_from_db()
    if from_db is not None:
        _CAR_MODELS_CACHE = from_db
    elif _CAR_MODELS_CACHE is None:
        _CAR_MODELS_CACHE = list(_DEFAULT_CAR_MODELS)
    _CAR_MODELS_CACHE_LOADED_AT = now
    return _CAR_MODELS_CACHE


def save_car_models(db, models: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """Persist the admin-edited car model list and refresh the in-memory cache."""
    global _CAR_MODELS_CACHE
    from app.models.platform_setting import PlatformSetting

    row = db.query(PlatformSetting).filter(
        PlatformSetting.key == CAR_MODELS_SETTING_KEY
    ).first()
    value = json.dumps(models)
    if row:
        row.value = value
    else:
        row = PlatformSetting(key=CAR_MODELS_SETTING_KEY, value=value)
    db.add(row)
    db.commit()
    _CAR_MODELS_CACHE = list(models)
    return _CAR_MODELS_CACHE
