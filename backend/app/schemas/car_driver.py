from pydantic import BaseModel, Field, validator
from typing import Optional, Annotated
from uuid import UUID
from datetime import datetime
from fastapi import Form
from enum import Enum

# Regex pattern for Indian mobile numbers (10 digits only, starting with 6-9)
indian_phone_pattern = r'^[6-9]\d{9}$'

class AccountStatusEnum(str, Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    DRIVING = "DRIVING"
    BLOCKED = "BLOCKED"
    PROCESSING = "PROCESSING"

class CarDriverForm(BaseModel):
    vehicle_owner_id: Optional[UUID] = Field(None, description="Fleet owner ID (auto-set from token)")
    organization_id: Optional[str] = None
    
    full_name: Annotated[str, Field(
        min_length=3,
        max_length=100,
        description="Full name must be between 3 and 100 characters"
    )]
    
    primary_number: Annotated[str, Field(
        pattern=indian_phone_pattern,
        description="Primary mobile number must be a valid 10-digit Indian mobile number (starting with 6-9)"
    )]
    
    secondary_number: Optional[Annotated[str, Field(
        pattern=indian_phone_pattern,
        description="Secondary mobile number must be a valid 10-digit Indian mobile number (starting with 6-9)"
    )]]=None
    
    # Optional for is_owner_driver=True: the fleet owner never logs in with
    # a separate driver password - they switch into their driver session via
    # POST /cardriver/signin-as-owner, already authenticated as the owner
    # (see that route). A random one is generated server-side in the signup
    # route below so the row still satisfies hashed_password NOT NULL, but
    # it's never surfaced or usable by anyone. Still required for a real
    # duty driver (is_owner_driver=False), who DOES need their own login.
    password: Optional[Annotated[str, Field(
        min_length=6,
        description="Password must be at least 6 characters long"
    )]] = None

    licence_number: Annotated[str, Field(
        min_length=5,
        max_length=20,
        description="License number (5-20 characters)"
    )]
    
    address: Annotated[str, Field(
        min_length=2,
        description="Address must be at least 2 characters long"
    )]
    city: Annotated[str, Field(
        min_length=2,
        max_length=100,
        description="City must be between 2 and 100 characters"
    )]
    pincode: Annotated[str, Field(
        min_length=6,
        max_length=6,
        description="Pincode must be exactly 6 digits"
    )]

    # True when this driver record is the fleet owner driving their own car
    is_owner_driver: bool = False

    @validator('primary_number', 'secondary_number')
    def validate_phone_numbers(cls, v):
        if v is None:  # Allow None for secondary_number
            return v
        import re
        if not re.match(indian_phone_pattern, v):
            raise ValueError('Invalid Indian mobile number format. Use 10-digit number starting with 6-9 (e.g., 9876543210)')
        return v

    @validator('licence_number')
    def validate_licence_number(cls, v):
        if not v.replace(' ', '').replace('-', '').isalnum():
            raise ValueError('License number should contain only letters, numbers, spaces, and hyphens')
        return v.upper()

    @classmethod
    def as_form(
        cls,
        vehicle_owner_id: Optional[str] = Form(None, description="Fleet owner ID (auto-set from token)"),
        full_name: str = Form(..., description="Full name (3-100 characters)"),
        primary_number: str = Form(..., description="Primary mobile number"),
        secondary_number: Optional[str] = Form(None, description="Secondary mobile number"),
        password: Optional[str] = Form(None, description="Password (min 6 characters) - omit when is_owner_driver=true, a random one is generated server-side"),
        licence_number: str = Form(..., description="License number"),
        address: str = Form(..., description="Address (min 10 characters)"),
        city: str = Form(..., description="City"),
        pincode: str = Form(..., description="Pincode (6 digits)"),
        organization_id: Optional[str] = Form(None, description="Organization ID (optional)"),
        is_owner_driver: bool = Form(False, description="True if the fleet owner is registering themself as the driver"),
    ):
        return cls(
            vehicle_owner_id=UUID(vehicle_owner_id) if vehicle_owner_id else None,
            full_name=full_name,
            primary_number=primary_number,
            secondary_number=secondary_number,
            password=password,
            licence_number=licence_number,
            address=address,
            city=city,
            pincode=pincode,
            organization_id=organization_id,
            is_owner_driver=is_owner_driver,
        )

class CarDriverOut(BaseModel):
    id: UUID
    full_name: str
    primary_number: str
    # Was `str` (required) - genuinely nullable in the DB
    # (models/car_driver.py), so any driver without one (the common case -
    # this is an optional field at signup) 500'd this response. Never
    # caught before because /cardriver/all (the only endpoint returning a
    # LIST of these, so the one most likely to hit a driver with no
    # secondary_number) was itself unreachable until the route-shadowing
    # fix above, same day.
    secondary_number: Optional[str] = None
    licence_number: str
    licence_front_img: Optional[str]
    # Added 2026-09-04 - the live profile photo/selfie, so the app can
    # detect an existing driver who signed up before this field existed
    # and prompt them to add one (see the reminder popup).
    profile_img: Optional[str] = None
    address: str
    city: str
    pincode: str
    driver_status: AccountStatusEnum
    rating_avg: Optional[float] = 0.0
    rating_count: Optional[int] = 0
    created_at: datetime

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
                "organization_id": "org_123",
                "full_name": "John Doe",
                "primary_number": "9876543210",
                "secondary_number": "9876543211",
                "licence_number": "DL-0123456789",
                "licence_front_img": "https://example.com/licence_front.jpg",
                "adress": "123 Main Street, Mumbai",
                "driver_status": "OFFLINE",
                "created_at": "2025-08-13T12:00:00Z"
            }
        }


class CarDriverSignupResponse(BaseModel):
    message: str
    driver_id: str
    license_img_url: str
    status: str
    # Added 2026-09-04 for the mandatory live profile photo + zero-cost
    # face-match against the licence photo (see compare_faces).
    profile_img_url: Optional[str] = None
    face_match: Optional[dict] = None

class CarDriverSigninRequest(BaseModel):
    primary_number: str = Field(..., description="Primary mobile number")
    password: str = Field(..., description="Password")

class CarDriverSigninResponse(BaseModel):
    access_token: Optional[str] = None
    token_type: Optional[str] = "bearer"
    driver_id: Optional[str] = None
    full_name: Optional[str] = None
    primary_number: Optional[str] = None
    driver_status: Optional[AccountStatusEnum] = None
    status: Optional[str] = None
    redirect_hint: Optional[dict] = None

class DriverStatusUpdateResponse(BaseModel):
    message: str
    driver_id: str
    new_status: AccountStatusEnum
