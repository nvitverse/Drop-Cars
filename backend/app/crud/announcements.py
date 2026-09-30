# crud/announcements.py
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.announcement import Announcement


def list_announcements(db: Session) -> List[Announcement]:
    """Admin view - everything, newest first."""
    return db.query(Announcement).order_by(Announcement.created_at.desc()).all()


def get_active_announcements(db: Session) -> List[Announcement]:
    """Driver-facing - active and not expired, newest first."""
    now = datetime.now(timezone.utc)
    return (
        db.query(Announcement)
        .filter(Announcement.active.is_(True))
        .filter((Announcement.expires_at.is_(None)) | (Announcement.expires_at > now))
        .order_by(Announcement.created_at.desc())
        .all()
    )


def create_announcement(db: Session, title: str, body: str, active: bool, expires_at: Optional[datetime]) -> Announcement:
    ann = Announcement(title=title.strip(), body=body.strip(), active=active, expires_at=expires_at)
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return ann


def update_announcement(db: Session, announcement_id: int, **updates) -> Announcement:
    ann = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")
    for key, value in updates.items():
        if value is not None:
            setattr(ann, key, value)
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return ann


def delete_announcement(db: Session, announcement_id: int) -> None:
    ann = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")
    db.delete(ann)
    db.commit()
