# schemas/admin.py
from pydantic import BaseModel, Field, validator
from typing import Optional
from uuid import UUID
from datetime import datetime

# --- Admin Base Schema ---
class AdminBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., description="Admin email address")
    phone: str = Field(..., min_length=10, max_length=10, description="10-digit Indian mobile number (starting with 6-9)")
    role: str = Field(..., description="Admin role: 'Owner' (full access) or 'Staff' (section-limited via permissions)")
    organization_id: Optional[str] = None

# --- Admin Signup Schema ---
class AdminSignup(AdminBase):
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    permissions: list[str] = Field(default_factory=list, description="Section keys a Staff admin can access - e.g. ['bookings', 'customers']. Ignored for role='Owner'.")

    @validator('phone')
    def validate_phone(cls, v):
        if not v.isdigit():
            raise ValueError('Phone number must contain only digits')
        if len(v) != 10:
            raise ValueError('Phone number must be exactly 10 digits')
        if not v.startswith(('6', '7', '8', '9')):
            raise ValueError('Phone number must start with 6, 7, 8, or 9 for Indian mobile numbers')
        return v

    @validator('email')
    def validate_email(cls, v):
        import re
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, v):
            raise ValueError('Invalid email format')
        return v

# --- Admin Signin Schema ---
class AdminSignin(BaseModel):
    username: str
    password: str

# --- Admin Response Schema ---
class AdminOut(BaseModel):
    id: UUID
    # username/email/role are nullable in the DB (models/admin.py has no
    # nullable=False on them) - Optional here so one incomplete admin row
    # doesn't 500 the whole /admin/list endpoint.
    username: Optional[str] = None
    email: Optional[str] = None
    phone: str
    role: Optional[str] = None
    permissions: list[str] = Field(default_factory=list)
    organization_id: UUID
    balance: Optional[int] = 0
    created_at: datetime

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
                "username": "admin_user",
                "email": "admin@dropcars.com",
                "phone": "9876543210",
                "role": "Manager",
                "organization_id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
                "created_at": "2025-08-13T12:00:00Z"
            }
        }

# --- Admin Token Response Schema ---

class AdminLedger(BaseModel):
    id: UUID
    # admin_id: UUID
    order_id: Optional[int]
    entry_type: str
    amount: int
    balance_before: int
    balance_after: int
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str
    admin: AdminOut

    class Config:
        json_schema_extra = {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "admin": {
                    "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
                    "username": "admin_user",
                    "email": "admin@dropcars.com",
                    "phone": "9876543210",
                    "role": "Manager",
                    "organization_id": "org_123",
                    "created_at": "2025-08-13T12:00:00Z"
                }
            }
        }

# --- Admin Update Schema ---
class AdminUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[str] = Field(None, description="Admin email address")
    phone: Optional[str] = Field(None, min_length=10, max_length=10, description="10-digit Indian mobile number (starting with 6-9)")
    role: Optional[str] = Field(None, description="Admin role")
    permissions: Optional[list[str]] = None
    organization_id: Optional[str] = None

    @validator('phone')
    def validate_phone(cls, v):
        if v is not None:
            if not v.isdigit():
                raise ValueError('Phone number must contain only digits')
            if len(v) != 10:
                raise ValueError('Phone number must be exactly 10 digits')
            if not v.startswith(('6', '7', '8', '9')):
                raise ValueError('Phone number must start with 6, 7, 8, or 9 for Indian mobile numbers')
        return v

    @validator('email')
    def validate_email(cls, v):
        if v is not None:
            import re
            email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if not re.match(email_pattern, v):
                raise ValueError('Invalid email format')
        return v

class SearchUserRequest(BaseModel):
    role: str = Field(..., description="Search query for user role")
    primary_number: str = Field(None, description="Search query for phone number")
    
class UserInfoResponse(BaseModel):
    id: UUID
    full_name: str
    role: str
    account_status: str
    primary_number: str
    created_at: datetime
    
    class Config:
        orm_mode = True   # Pydantic v1
        # model_config = ConfigDict(from_attributes=True)  # Pydantic v2
        
class UserPasswordUpdate(BaseModel):
    role: str = None
    id: str = None
    password: str
    
class UserPasswordUpdateResponse(BaseModel):
    role: str
    message : str
