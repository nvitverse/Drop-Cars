from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict

from app.database.session import get_db
from app.core.security import get_current_vendor, get_current_vehicleOwner_id, get_current_driver, get_current_admin
from app.utils.cities import get_cities, get_places, lookup_and_add_city
from app.models.notification import Notification

router = APIRouter(prefix="/cities")


@router.get("/vendor", response_model=List[str])
def list_cities_for_vendor(
    _: str = Depends(get_current_vendor),
):
    return get_places()


@router.get("/public", response_model=List[str])
def list_cities_public():
    """Public city list for the customer website's location suggestions.
    Read-only and not sensitive - it's the same list shown in every app."""
    return get_places()


@router.get("/local-serviceable", response_model=List[str])
def list_local_serviceable_cities(db: Session = Depends(get_db)):
    """Which cities Local Bookings (Phase 06) can be posted in - Vendor App's
    Outstation/Local picker and the Driver App's home-city picker both read
    this. Read-only and not sensitive, same as /public above."""
    from app.utils.serviceable_cities import get_serviceable_city_names
    return get_serviceable_city_names(db)


# --- Online fallback: "Search Online" button when local (fuzzy) search
# comes up empty. One Geocoding call per tap, never per-keystroke, and the
# resolved city is saved to the shared list so nobody has to look it up again.

@router.post("/lookup-online")
def lookup_city_online_vendor(
    payload: dict,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_vendor),
):
    try:
        return lookup_and_add_city(db, payload.get("query", ""))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/lookup-online/driver")
def lookup_city_online_driver(
    payload: dict,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_driver),
):
    try:
        return lookup_and_add_city(db, payload.get("query", ""))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/lookup-online/vehicle-owner")
def lookup_city_online_vehicle_owner(
    payload: dict,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_vehicleOwner_id),
):
    """Same as /lookup-online/driver, but for a fleet-owner session token -
    the Driver App's Vacant City picker runs as the owner (vehicle_owner
    role), not a car_driver, so it needs its own auth-scoped route."""
    try:
        return lookup_and_add_city(db, payload.get("query", ""))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/lookup-online/admin")
def lookup_city_online_admin(
    payload: dict,
    db: Session = Depends(get_db),
    _=Depends(get_current_admin),
):
    """Same as /lookup-online/vendor, but for an admin session token - the
    Admin App's create-booking location fields have no autocomplete at all
    yet and need their own auth-scoped route."""
    try:
        return lookup_and_add_city(db, payload.get("query", ""))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/vehicle-owner/selected", response_model=Dict[str, bool])
def get_selected_cities_vehicle_owner(
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    cities = get_cities()
    notif = db.query(Notification).filter(
        Notification.user == "vehicle_owner",
        Notification.sub == vehicle_owner_id
    ).first()
    selected = set((notif.selected_city or [])) if notif else set()
    return {city: (city in selected) for city in cities}


class SelectedCitiesPayload(Dict[str, List[str]]):
    # Placeholder typing for FastAPI docs; we will validate at runtime
    pass


@router.post("/vehicle-owner/selected", response_model=Dict[str, List[str]])
def update_selected_cities_vehicle_owner(
    payload: List[str],
    db: Session = Depends(get_db),
    vehicle_owner_id: str = Depends(get_current_vehicleOwner_id),
):
    # Basic validation: ensure all entries are strings and exist in the master list
    cities = set(get_cities())
    invalid = [c for c in payload if not isinstance(c, str) or c not in cities]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid city names: {invalid}")

    notif = db.query(Notification).filter(
        Notification.user == "vehicle_owner",
        Notification.sub == vehicle_owner_id
    ).first()

    if not notif:
        notif = Notification(
            user="vehicle_owner",
            sub=vehicle_owner_id,
            permission1=False,
            permission2=False,
            token=None,
            selected_city=list(dict.fromkeys(payload))
        )
        db.add(notif)
    else:
        notif.selected_city = list(dict.fromkeys(payload))

    db.commit()
    db.refresh(notif)
    return {"selected_city": notif.selected_city or []}


