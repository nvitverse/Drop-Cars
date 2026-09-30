# api/routes/announcements.py
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.core.security import get_current_admin, get_current_user
from app.schemas.announcement import AnnouncementCreate, AnnouncementUpdate, AnnouncementOut
from app.crud.announcements import (
    list_announcements, get_active_announcements, create_announcement,
    update_announcement, delete_announcement,
)

router = APIRouter()


# --- Driver-facing: shown on app entry ---

@router.get("/announcements/active", response_model=List[AnnouncementOut])
async def get_active(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_active_announcements(db)


# --- Admin CRUD ---

@router.get("/admin/announcements", response_model=List[AnnouncementOut])
async def admin_list_announcements(
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    return list_announcements(db)


@router.post("/admin/announcements", response_model=AnnouncementOut)
async def admin_create_announcement(
    body: AnnouncementCreate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    return create_announcement(db, body.title, body.body, body.active, body.expires_at)


@router.put("/admin/announcements/{announcement_id}", response_model=AnnouncementOut)
async def admin_update_announcement(
    announcement_id: int,
    body: AnnouncementUpdate,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    return update_announcement(
        db, announcement_id,
        title=body.title, body=body.body, active=body.active, expires_at=body.expires_at,
    )


@router.delete("/admin/announcements/{announcement_id}")
async def admin_delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    current_admin=Depends(get_current_admin),
):
    delete_announcement(db, announcement_id)
    return {"message": "Announcement deleted"}
