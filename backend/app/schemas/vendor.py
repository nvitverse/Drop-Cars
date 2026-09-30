from pydantic import BaseModel, Field, validator
from typing import Optional, Annotated
from uuid import UUID
from datetime import datetime
from fastapi import Form

# --- Regex pattern for Indian mobile numbers (10 digits only, starting with 6-9) ---
indian_phone_pattern = r'^[6-9]\d{9}$'

# --- Base Schema ---
class VendorBase(BaseModel):
    full_name: Annotated[str, Field(min_length=3, max_length=100)]
    primary_number: Annotated[str, Field(
        pattern=indian_phone_pattern,
        description="Primary mobile number must be a valid 10-digit Indian mobile number (starting with 6-9)"
    )]
    secondary_number: Optional[Annotated[str, Field(
        pattern=indian_phone_pattern,
        description="Secondary mobile number must be a valid 10-digit Indian mobile number (starting with 6-9)"
    )]] = None
    password: str
    address: str
    city: str
    pincode: str
    aadhar_number: str
    gpay_number: str
    wallet_balance: int = 0
    bank_balance: int = 0

# --- Form Schema for validation without image ---
class VendorSignupForm(BaseModel):
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
    )]] = None
    password: Annotated[str, Field(
        min_length=6,
        description="Password must be at least 6 characters long"
    )]
    address: Annotated[str, Field(
        min_length=10,
        description="Address must be at least 10 characters long"
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
    aadhar_number: Annotated[str, Field(
        min_length=12,
        max_length=12,
        description="Aadhar number must be exactly 12 digits"
    )]
    gpay_number: Annotated[str, Field(
        pattern=indian_phone_pattern,
        description="GPay number must be a valid 10-digit Indian mobile number (starting with 6-9)"
    )]

    @validator('aadhar_number')
    def validate_aadhar_number(cls, v):
        if not v.isdigit():
            raise ValueError('Aadhar number must contain only digits')
        if len(v) != 12:
            raise ValueError('Aadhar number must be exactly 12 digits')
        return v

    @validator('primary_number', 'secondary_number', 'gpay_number')
    def validate_phone_numbers(cls, v):
        if v is None:  # Allow None for secondary_number
            return v
        import re
        if not re.match(indian_phone_pattern, v):
            raise ValueError('Invalid Indian mobile number format. Use 10-digit number starting with 6-9 (e.g., 9876543210)')
        return v

    @classmethod
    def as_form(
        cls,
        full_name: str = Form(..., description="Full name (3-100 characters)"),
        primary_number: str = Form(..., description="Primary mobile number"),
        secondary_number: Optional[str] = Form(None, description="Secondary mobile number (optional)"),
        password: str = Form(..., description="Password (min 6 characters)"),
        address: str = Form(..., description="Address (min 10 characters)"),
        city: str = Form(..., description="City"),
        pincode: str = Form(..., description="Pincode (6 digits)"),
        aadhar_number: str = Form(..., description="Aadhar number (12 digits)"),
        gpay_number: str = Form(..., description="GPay number"),
    ):
        return cls(
            full_name=full_name,
            primary_number=primary_number,
            secondary_number=secondary_number,
            password=password,
            address=address,
            city=city,
            pincode=pincode,
            aadhar_number=aadhar_number,
            gpay_number=gpay_number,
        )

# --- Signin Schema ---
class VendorSignin(BaseModel):
    primary_number: str
    password: str

    @validator('primary_number')
    def validate_phone_number(cls, v):
        import re
        if not re.match(indian_phone_pattern, v):
            raise ValueError('Invalid Indian mobile number format. Use 10-digit number starting with 6-9 (e.g., 9876543210)')
        return v

# --- Output Schema ---
class VendorOut(BaseModel):
    id: UUID
    full_name: str
    primary_number: str
    secondary_number: Optional[str]
    gpay_number: str
    wallet_balance: int
    bank_balance: int
    aadhar_number: str
    aadhar_front_img: Optional[str]
    address: str
    city: str
    pincode: str
    account_status: str
    created_at: datetime

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
                "full_name": "John Doe",
                "primary_number": "9876543210",
                "secondary_number": "9876543211",
                "gpay_number": "9876543212",
                "wallet_balance": 0,
                "bank_balance": 0,
                "aadhar_number": "123456789012",
                "aadhar_front_img": "https://storage.googleapis.com/drop-cars-files/vendor_details/aadhar/uuid.jpg",
                "address": "123 Main Street",
                "city": "Mumbai",
                "pincode": "400001",
                "account_status": "Pending",
                "created_at": "2025-08-13T12:00:00Z"
            }
        }

# --- Token Response Schema ---
class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    vendor: VendorOut

    class Config:
        json_schema_extra = {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "vendor": {
                    "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
                    "full_name": "John Doe",
                    "primary_number": "9876543210",
                    "secondary_number": "9876543211",
                    "gpay_number": "9876543212",
                    "wallet_balance": 0,
                    "aadhar_number": "123456789012",
                    "aadhar_front_img": "https://storage.googleapis.com/drop-cars-files/vendor_details/aadhar/uuid.jpg",
                    "address": "123 Main Street, Mumbai",
                    "account_status": "Pending",
                    "created_at": "2025-08-13T12:00:00Z"
                }
            }
        }
class VendorDetailsResponse(BaseModel):
    id: UUID
    full_name: str
    business_name: Optional[str] = None
    primary_number: str
    secondary_number: Optional[str]
    gpay_number: str
    wallet_balance: float
    bank_balance: float
    aadhar_number: str
    aadhar_front_img: Optional[str]
    address: Optional[str]
    city: Optional[str]
    pincode: Optional[str]
    account_status: str
    aadhar_status: Optional[str]
    created_at: datetime

    class Config:
        orm_mode = True


class VendorBusinessNameUpdate(BaseModel):
    business_name: Annotated[str, Field(min_length=2, max_length=100)]