"""Can the office actually REACH its staff?  (owner request 2026-10-25: enquiry / unaccepted-booking alerts were being missed because of
silent notifications, apps closed or put to sleep by the phone, and e-mail problems.)

  POST /api/admin/staff/alert-health    the Admin App on a staff phone reports its own readiness (notifications / overlay / battery / version)
  GET  /api/admin/staff/alert-health    Owner / manager: every staff member, on duty or not, with what is wrong in plain words

A staff member counts as REACHABLE when a push token is registered and not muted, the notification permission is on, and the phone has
reported in during the last 36 hours (an app that is never opened cannot report - that is itself the finding)."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.database.session import get_db
from app.models.admin import Admin
from app.models.notification import Notification
from app.models.staff_device_health import StaffDeviceHealth

router = APIRouter(prefix="/admin/staff", tags=["Staff alert health"])

STALE_AFTER = timedelta(hours=36)


class AlertHealthIn(BaseModel):
    notifications: Optional[bool] = None
    overlay: Optional[bool] = None
    battery: Optional[bool] = None
    native_available: bool = False
    app_version: Optional[str] = None
    platform: Optional[str] = None
    device_label: Optional[str] = None


@router.post("/alert-health")
def report_alert_health(body: AlertHealthIn, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    row = db.query(StaffDeviceHealth).filter(StaffDeviceHealth.admin_id == current_admin.id).first()
    if row is None:
        row = StaffDeviceHealth(admin_id=current_admin.id)
        db.add(row)
    row.notifications_ok, row.overlay_ok, row.battery_ok = body.notifications, body.overlay, body.battery
    row.native_available = bool(body.native_available)
    row.app_version = (body.app_version or "")[:40] or None
    row.platform = (body.platform or "")[:20] or None
    row.device_label = (body.device_label or "")[:80] or None
    row.reported_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


def problems_for(admin, health: Optional[StaffDeviceHealth], token_row: Optional[Notification], now: datetime) -> list:
    out = []
    if token_row is None or not token_row.token:
        out.append("No push token: alerts cannot reach this phone (the app has never registered, or notifications were refused).")
    elif token_row.muted_until is not None and (token_row.muted_until if token_row.muted_until.tzinfo else token_row.muted_until.replace(tzinfo=timezone.utc)) > now:
        out.append("Notifications are muted until " + token_row.muted_until.strftime("%d %b %H:%M") + ".")
    if health is None:
        out.append("The Admin App has never reported its settings (not opened since the update).")
        return out
    reported = health.reported_at if health.reported_at.tzinfo else health.reported_at.replace(tzinfo=timezone.utc)
    if now - reported > STALE_AFTER:
        out.append("Not opened for %d hours - an alert will not be seen." % int((now - reported).total_seconds() // 3600))
    if health.notifications_ok is False:
        out.append("Notification permission is OFF.")
    if health.overlay_ok is False:
        out.append("'Display over other apps' is OFF (no floating alert bubble).")
    if health.battery_ok is False:
        out.append("Battery saving may put the app to sleep ('Always allow in background' is OFF).")
    if not health.native_available:
        out.append("Old app version: needs the latest Admin app for the floating bubble and the battery shortcut.")
    return out


@router.get("/alert-health")
def staff_alert_health(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    role = (getattr(current_admin, "role", "") or "").lower()
    perms = [str(p).lower() for p in (getattr(current_admin, "permissions", []) or [])]
    if role not in ("owner", "manager", "founder") and not any(p in perms for p in ("manager", "owner", "founder")):
        raise HTTPException(status_code=403, detail="Only the Owner or a manager can see this.")
    now = datetime.now(timezone.utc)
    tokens = {str(n.sub): n for n in db.query(Notification).filter(Notification.user == "admin").all()}
    health = {str(h.admin_id): h for h in db.query(StaffDeviceHealth).all()}
    staff = []
    for a in db.query(Admin).all():
        h, t = health.get(str(a.id)), tokens.get(str(a.id))
        problems = problems_for(a, h, t, now)
        hard = [p for p in problems if p.startswith(("No push token", "Notifications are muted", "Notification permission", "Not opened", "The Admin App has never"))]
        staff.append({
            "admin_id": str(a.id), "name": a.username, "role": a.role, "phone": a.phone, "on_duty": bool(a.is_on_duty),
            "last_seen_at": a.last_seen_at.isoformat() if getattr(a, "last_seen_at", None) else None,
            "reported_at": h.reported_at.isoformat() if h else None, "device": h.device_label if h else None, "app_version": h.app_version if h else None,
            "reachable": not hard, "problems": problems,
        })
    staff.sort(key=lambda s: (s["reachable"], not s["on_duty"], s["name"] or ""))
    return {"staff": staff, "unreachable": sum(1 for s in staff if not s["reachable"]), "on_duty_unreachable": sum(1 for s in staff if s["on_duty"] and not s["reachable"])}
