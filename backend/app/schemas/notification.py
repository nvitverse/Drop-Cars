from datetime import datetime
from pydantic import BaseModel
from typing import Optional, List

class NotificationBase(BaseModel):
    permission1: Optional[bool] = False
    permission2: Optional[bool] = False
    token: Optional[str] = None
    selected_city: Optional[List[str]] = None

class NotificationCreate(NotificationBase):
    pass

class NotificationUpdate(NotificationBase):
    pass

class NotificationResponse(NotificationBase):
    sub: str
    muted_until: Optional[datetime] = None

    class Config:
        orm_mode = True

class NotificationPermissionUpdate(BaseModel):
    permission1: Optional[bool] = None
    permission2: Optional[bool] = None
    
class BulkNotificationRequest(BaseModel):
    title: str
    message: str

