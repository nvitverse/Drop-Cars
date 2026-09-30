# app/api/routes/notification_sounds.py
"""Uploaded notification MP3s for closed-app playback.

Each app, after login and on every start:
  1. GET  /api/notification-sounds?app=driver|vendor|customer|admin
     -> the types that have an uploaded MP3, with the channel id to create.
  2. downloads each MP3, creates that Android channel with the MP3 as its
     sound (channel sounds are fixed at creation, so a new MP3 = new id),
  3. POST /api/notification-sounds/device-channels with the ones it made.
Pushes to that phone are then sent on those channels (see
utils/notification_settings.apply_device_sound_channels), so the MP3 plays
even when the app is closed.
"""
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user_flexible
from app.database.session import get_db
from app.models.notification import Notification
from app.utils.notification_settings import NOTIFICATION_EVENTS, get_sound_manifest

router = APIRouter(prefix="/notification-sounds", tags=["Notification Sounds"])

_APPS = ("driver", "vendor", "customer", "admin")


@router.get("")
def sound_manifest(
    app: Optional[str] = Query(None, description="driver | vendor | customer | admin"),
    who=Depends(get_current_user_flexible),
    db: Session = Depends(get_db),
):
    if app and app not in _APPS:
        raise HTTPException(status_code=400, detail=f"app must be one of {', '.join(_APPS)}")
    return {"sounds": get_sound_manifest(db, app)}


class DeviceChannels(BaseModel):
    token: str
    channels: Dict[str, str]  # event_key -> channel id the device created


@router.post("/device-channels")
def report_device_channels(
    body: DeviceChannels,
    who=Depends(get_current_user_flexible),
    db: Session = Depends(get_db),
):
    rows = db.query(Notification).filter(Notification.token == body.token).all()
    if not rows:
        return {"updated": 0, "reason": "token not registered yet"}
    # Only the owner of this push token may describe its channels. The Driver
    # App registers one device token under the fleet driver AND the duty-
    # driver session, so every row of this token is updated once one is ours.
    if not any(str(r.sub) == str(who["user_id"]) for r in rows):
        raise HTTPException(status_code=403, detail="This push token belongs to another account")
    channels = {k: v for k, v in body.channels.items() if k in NOTIFICATION_EVENTS and isinstance(v, str) and v.startswith("dcs-")}
    for r in rows:
        r.sound_channels = channels
    db.commit()
    return {"updated": len(rows), "channels": channels}
