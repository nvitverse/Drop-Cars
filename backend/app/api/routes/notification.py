from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.schemas.notification import NotificationResponse, NotificationCreate, NotificationPermissionUpdate
from app.schemas.notification_log import NotificationLogOut, BulkDeleteRequest
from app.database.session import get_db
from app.core.security import get_current_user_sub
from app.crud.notification import get_notification,update_notification, create_notification, update_permissions_only, mute_notifications, unmute_notifications
from app.crud.notification_log import (
    list_notifications, mark_read, mark_all_read, delete_notification, bulk_delete_notifications,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("/", response_model=NotificationResponse)
def get_user_notification(
    sub: str = Depends(get_current_user_sub),
    db: Session = Depends(get_db)
):
    notif = get_notification(db, sub)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notif

@router.post("/", response_model=NotificationResponse)
def toggle_or_create_notification(
    data: NotificationCreate,
    sub: str = Depends(get_current_user_sub),
    db: Session = Depends(get_db)
):
    existing = get_notification(db, sub)
    if existing:
        updated = update_notification(db, sub, data)
        return updated
    else:
        created = create_notification(db, sub, data)
        return created
    
@router.patch("/permissions", response_model=NotificationResponse)
def update_permissions(
    data: NotificationPermissionUpdate,
    sub: str = Depends(get_current_user_sub),
    db: Session = Depends(get_db)
):
    notif = get_notification(db, sub)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification record not found")

    updated = update_permissions_only(db, sub, data)
    return updated


# --- Mute / snooze (Settings > Mute Notifications) ---
# Server-side so it works even while the app is fully closed - the push-send
# functions all check muted_until before including a token.

ALLOWED_MUTE_MINUTES = {15, 60, 300, 480, 1440}  # 15m, 1h, 5h, 8h, 24h


@router.post("/mute", response_model=NotificationResponse)
def mute(
    minutes: int = Query(..., description="One of 15, 60, 300, 480, 1440"),
    sub: str = Depends(get_current_user_sub),
    db: Session = Depends(get_db),
):
    if minutes not in ALLOWED_MUTE_MINUTES:
        raise HTTPException(status_code=400, detail=f"minutes must be one of {sorted(ALLOWED_MUTE_MINUTES)}")
    notif = mute_notifications(db, sub, minutes)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification record not found")
    return notif


@router.post("/unmute", response_model=NotificationResponse)
def unmute(
    sub: str = Depends(get_current_user_sub),
    db: Session = Depends(get_db),
):
    notif = unmute_notifications(db, sub)
    if not notif:
        raise HTTPException(status_code=404, detail="Notification record not found")
    return notif


# --- Notification inbox (Phase 06 / UX Area 03) ---
# Separate from the settings endpoints above: this is the in-app history of
# what's actually been sent, not the on/off push preference.

@router.get("/log", response_model=List[NotificationLogOut])
def get_notification_log(
    filter: str = Query("all", pattern="^(all|unread|action_required)$"),
    sub: tuple = Depends(get_current_user_sub),
    db: Session = Depends(get_db),
):
    user_id, user_type = sub
    return list_notifications(db, user_type, user_id, filter)


@router.patch("/log/{notification_id}/read", response_model=NotificationLogOut)
def mark_notification_read(
    notification_id: int,
    sub: tuple = Depends(get_current_user_sub),
    db: Session = Depends(get_db),
):
    user_id, user_type = sub
    row = mark_read(db, user_type, user_id, notification_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    return row


@router.patch("/log/mark-all-read")
def mark_all_notifications_read(
    sub: tuple = Depends(get_current_user_sub),
    db: Session = Depends(get_db),
):
    user_id, user_type = sub
    count = mark_all_read(db, user_type, user_id)
    return {"message": f"{count} notification(s) marked read"}


@router.delete("/log/{notification_id}")
def delete_notification_log_entry(
    notification_id: int,
    sub: tuple = Depends(get_current_user_sub),
    db: Session = Depends(get_db),
):
    user_id, user_type = sub
    if not delete_notification(db, user_type, user_id, notification_id):
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification deleted"}


@router.post("/log/bulk-delete")
def bulk_delete_notification_log_entries(
    payload: BulkDeleteRequest,
    sub: tuple = Depends(get_current_user_sub),
    db: Session = Depends(get_db),
):
    user_id, user_type = sub
    count = bulk_delete_notifications(db, user_type, user_id, payload.ids)
    return {"message": f"{count} notification(s) deleted"}