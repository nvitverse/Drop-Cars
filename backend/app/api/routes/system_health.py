from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.database.session import get_db
from app.utils import system_health

router = APIRouter()


def _can_control(admin) -> bool:
    role = (getattr(admin, "role", "") or "").lower()
    if role in ("manager", "owner", "founder"):
        return True
    perms = [str(p).lower() for p in (getattr(admin, "permissions", []) or [])]
    return any(p in perms for p in ("manager", "owner", "founder"))


@router.get("/admin/system-health")
def get_system_health(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    """Live health of the platform: database speed / connections, recent API errors, last sweep, active alerts."""
    report = system_health.collect(db)
    report["can_control"] = _can_control(current_admin)
    return report


class HealthThresholdsIn(BaseModel):
    health_db_ms_warn: Optional[int] = None
    health_error_pct_warn: Optional[float] = None
    health_slow_ms_warn: Optional[int] = None
    health_conn_pct_warn: Optional[float] = None
    health_alerts_enabled: Optional[int] = None
    health_alert_gap_minutes: Optional[int] = None


@router.put("/admin/system-health/thresholds")
def update_health_thresholds(body: HealthThresholdsIn, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    if not _can_control(current_admin):
        raise HTTPException(status_code=403, detail="Only the owner or a manager can change alert limits.")
    updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    for k, v in updates.items():
        if v < 0:
            raise HTTPException(status_code=400, detail=f"{k} cannot be negative")
    return system_health.save_thresholds(db, updates)


@router.post("/admin/system-health/run-sweep")
async def run_sweep_now(current_admin=Depends(get_current_admin)):
    """Run the deadline sweep right now (auto-post website bookings, timed-out assignments, chat escalation, review bonuses)."""
    if not _can_control(current_admin):
        raise HTTPException(status_code=403, detail="Only the owner or a manager can run this.")
    from app.main import _run_assignment_sweep
    return {"ran": True, "result": await _run_assignment_sweep()}


@router.post("/admin/system-health/refresh-cities")
def refresh_cities_now(current_admin=Depends(get_current_admin)):
    """Make this server reload the shared city list from the database on the next request."""
    if not _can_control(current_admin):
        raise HTTPException(status_code=403, detail="Only the owner or a manager can run this.")
    from app.utils import cities
    cities._CITIES_CACHE_LOADED_AT = 0.0
    return {"refreshed": True, "cities": len(cities.get_places())}


@router.post("/admin/system-health/test-alert")
async def send_test_alert(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    if not _can_control(current_admin):
        raise HTTPException(status_code=403, detail="Only the owner or a manager can run this.")
    from app.crud.notification import send_push_notification_to_admin
    await send_push_notification_to_admin(db, "System alert test", "This is a test alert from System Health. Alerts are working.")
    return {"sent": True}
