import os
from typing import Tuple
import requests
from  dotenv import load_dotenv

load_dotenv()
class MapsApiError(Exception):
    pass


def get_google_maps_api_key() -> str:
    from app.utils.maps_pool import get_active_google_api_key
    api_key = get_active_google_api_key()
    if not api_key:
        raise MapsApiError("GOOGLE_MAPS_API_KEY is not configured")
    return api_key


def _route_key(value: str) -> str:
    return " ".join(str(value).strip().lower().split())


def _cached_distance(origin: str, destination: str):
    """Look up a cached distance (exact pair, then reversed pair - driving
    distance between two cities is symmetric for fare purposes)."""
    from app.database.session import SessionLocal
    from app.models.route_distance import RouteDistance

    o_key, d_key = _route_key(origin), _route_key(destination)
    db = SessionLocal()
    try:
        row = db.query(RouteDistance).filter(
            RouteDistance.origin_key == o_key,
            RouteDistance.destination_key == d_key,
        ).first()
        if row is None:
            row = db.query(RouteDistance).filter(
                RouteDistance.origin_key == d_key,
                RouteDistance.destination_key == o_key,
            ).first()
        if row is not None:
            return round(row.distance_km), (row.duration_text or "")
        return None
    except Exception:
        # Cache must never break quoting - fall through to Google
        return None
    finally:
        db.close()


def _store_distance(origin: str, destination: str, distance_km: float, duration_text: str) -> None:
    from app.database.session import SessionLocal
    from app.models.route_distance import RouteDistance

    db = SessionLocal()
    try:
        db.add(RouteDistance(
            origin_key=_route_key(origin),
            destination_key=_route_key(destination),
            origin=str(origin).strip(),
            destination=str(destination).strip(),
            distance_km=float(distance_km),
            duration_text=duration_text,
            source="GOOGLE",
        ))
        db.commit()
    except Exception:
        db.rollback()  # e.g. concurrent insert of same pair - cache is best-effort
    finally:
        db.close()


def get_distance_km_between_locations(origin: str, destination: str) -> float:
    """
    Returns the driving distance in kilometers between origin and destination.
    Cache-first: repeated routes cost nothing; only NEW city pairs call the
    Google Distance Matrix API. Raises MapsApiError on failure.
    """
    cached = _cached_distance(origin, destination)
    if cached is not None:
        return cached

    api_key = get_google_maps_api_key()
    url = "https://maps.googleapis.com/maps/api/distancematrix/json"
    params = {
        "origins": origin,
        "destinations": destination,
        "units": "metric",
        "key": api_key,
    }

    response = requests.get(url, params=params, timeout=15)
    if response.status_code != 200:
        raise MapsApiError(f"Distance Matrix API failed with status {response.status_code}")

    data = response.json()
    if data.get("status") != "OK":
        raise MapsApiError(f"Distance Matrix API error: {data.get('status')}")

    rows = data.get("rows") or []
    if not rows or not rows[0].get("elements"):
        raise MapsApiError("Invalid Distance Matrix API response format")

    element = rows[0]["elements"][0]
    if element.get("status") != "OK":
        raise MapsApiError(f"Route not found: {element.get('status')}")

    distance_meters = element["distance"]["value"]
    duration_text = element["duration"]["text"]
    distance_km = float(distance_meters) / 1000.0

    _store_distance(origin, destination, round(distance_km), duration_text)
    return round(distance_km),duration_text
