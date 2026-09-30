import os
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
import requests

CONFIG_FILE_PATH = Path(__file__).resolve().parent.parent.parent / "load_data" / "maps_api_keys.json"

# In-memory rate limiting and throttle for OSM fallback
_last_osm_request_at = 0.0
MIN_OSM_GAP_SECONDS = 1.0


def _load_keys_config() -> List[Dict[str, Any]]:
    CONFIG_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not CONFIG_FILE_PATH.is_file():
        default_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
        default_config = [
            {
                "id": "key_primary",
                "key": default_key,
                "label": "Primary Google Maps Key",
                "monthly_limit": 5000,
                "used_this_month": 0,
                "month_year": datetime.now().strftime("%Y-%m"),
                "status": "ACTIVE",
            }
        ]
        try:
            with open(CONFIG_FILE_PATH, "w", encoding="utf-8") as f:
                json.dump(default_config, f, indent=2)
        except Exception:
            pass
        return default_config

    try:
        with open(CONFIG_FILE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            data = []

        # Reset month counter if new month
        current_month = datetime.now().strftime("%Y-%m")
        dirty = False
        for k in data:
            if k.get("month_year") != current_month:
                k["month_year"] = current_month
                k["used_this_month"] = 0
                if k.get("status") == "LIMIT_REACHED":
                    k["status"] = "ACTIVE"
                dirty = True

        if dirty:
            with open(CONFIG_FILE_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        return data
    except Exception:
        return []


def _save_keys_config(config: List[Dict[str, Any]]) -> None:
    try:
        with open(CONFIG_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
    except Exception:
        pass


def mask_api_key(key: str) -> str:
    if not key or len(key) < 10:
        return "****"
    return f"{key[:8]}...{key[-4:]}"


def get_all_keys_info() -> List[Dict[str, Any]]:
    config = _load_keys_config()
    out = []
    for k in config:
        out.append({
            "id": k.get("id"),
            "masked_key": mask_api_key(k.get("key", "")),
            "label": k.get("label", "Google Maps Key"),
            "monthly_limit": k.get("monthly_limit", 5000),
            "used_this_month": k.get("used_this_month", 0),
            "month_year": k.get("month_year", datetime.now().strftime("%Y-%m")),
            "status": k.get("status", "ACTIVE")
        })
    return out


def upsert_api_key(key: str, label: str = "Google Maps API Key", monthly_limit: int = 5000, key_id: Optional[str] = None) -> Dict[str, Any]:
    config = _load_keys_config()
    key_clean = key.strip()

    found = False
    target_id = key_id or f"key_{int(time.time())}"
    for k in config:
        if (key_id and k.get("id") == key_id) or (not key_id and k.get("key") == key_clean):
            k["key"] = key_clean
            k["label"] = label or k.get("label", "Google Maps API Key")
            k["monthly_limit"] = monthly_limit
            k["status"] = "ACTIVE"
            found = True
            target_id = k.get("id")
            break

    if not found:
        config.append({
            "id": target_id,
            "key": key_clean,
            "label": label or "Google Maps API Key",
            "monthly_limit": monthly_limit,
            "used_this_month": 0,
            "month_year": datetime.now().strftime("%Y-%m"),
            "status": "ACTIVE"
        })

    _save_keys_config(config)
    os.environ["GOOGLE_MAPS_API_KEY"] = key_clean
    return {"id": target_id, "masked_key": mask_api_key(key_clean), "label": label, "monthly_limit": monthly_limit, "status": "ACTIVE"}


def delete_api_key(key_id: str) -> bool:
    config = _load_keys_config()
    new_config = [k for k in config if k.get("id") != key_id]
    if len(new_config) != len(config):
        _save_keys_config(new_config)
        return True
    return False


def get_active_google_api_key() -> Optional[str]:
    """The server key. GOOGLE_MAPS_API_KEY (set on the server, no HTTP-referer restriction) always wins - a stale key saved in
    load_data/maps_api_keys.json (e.g. a browser/referer-restricted one) used to shadow it and every Distance Matrix call failed with
    REQUEST_DENIED. Extra admin-added pool keys are only used when the env key is not set.
    """
    env_key = (os.getenv("GOOGLE_MAPS_API_KEY") or "").strip()
    if env_key:
        return env_key
    config = _load_keys_config()
    for k in config:
        if k.get("status", "ACTIVE") == "ACTIVE" and k.get("key"):
            limit = int(k.get("monthly_limit", 5000))
            used = int(k.get("used_this_month", 0))
            if limit == 0 or used < limit:
                return k["key"]
    return None


def record_key_usage(used_key: str, status_ok: bool = True) -> None:
    """Updates request counter and flags LIMIT_REACHED if query limit exceeded."""
    if not used_key:
        return
    config = _load_keys_config()
    dirty = False
    for k in config:
        if k.get("key") == used_key:
            k["used_this_month"] = int(k.get("used_this_month", 0)) + 1
            limit = int(k.get("monthly_limit", 5000))
            if not status_ok:
                k["status"] = "LIMIT_REACHED"
            elif limit > 0 and k["used_this_month"] >= limit:
                k["status"] = "LIMIT_REACHED"
            dirty = True
            break
    if dirty:
        _save_keys_config(config)


def fetch_nominatim_search(query: str) -> List[Dict[str, Any]]:
    """OSM Nominatim search fallback with rate-limiting."""
    global _last_osm_request_at
    elapsed = time.monotonic() - _last_osm_request_at
    if elapsed < MIN_OSM_GAP_SECONDS:
        time.sleep(MIN_OSM_GAP_SECONDS - elapsed)
    _last_osm_request_at = time.monotonic()

    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": query,
            "format": "jsonv2",
            "countrycodes": "in",
            "addressdetails": 1,
            "limit": 5,
        }
        headers = {
            "User-Agent": "DropCarsPlatform/1.0 (support@dropcars.in)"
        }
        resp = requests.get(url, params=params, headers=headers, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                return data
    except Exception:
        pass
    return []
