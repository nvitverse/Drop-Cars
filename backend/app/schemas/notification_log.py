from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class NotificationLogOut(BaseModel):
    id: int
    title: str
    body: str
    event_key: Optional[str] = None
    action_required: bool
    is_read: bool
    related_order_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class BulkDeleteRequest(BaseModel):
    ids: list[int]
