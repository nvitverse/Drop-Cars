# schemas/announcement.py
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AnnouncementCreate(BaseModel):
    title: str
    body: str
    active: bool = True
    expires_at: Optional[datetime] = None


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    active: Optional[bool] = None
    expires_at: Optional[datetime] = None


class AnnouncementOut(BaseModel):
    id: int
    title: str
    body: str
    active: bool
    created_at: datetime
    expires_at: Optional[datetime] = None

    class Config:
        from_attributes = True
