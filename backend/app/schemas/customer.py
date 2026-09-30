from pydantic import BaseModel, Field
from typing import Optional, Annotated, List
from uuid import UUID
from datetime import datetime

indian_phone_pattern = r'^[6-9]\d{9}$'


class CustomerSignup(BaseModel):
    full_name: Annotated[str, Field(min_length=3, max_length=100)]
    primary_number: Annotated[str, Field(pattern=indian_phone_pattern)]
    password: Annotated[str, Field(min_length=6, max_length=64)]


class CustomerSignin(BaseModel):
    primary_number: Annotated[str, Field(pattern=indian_phone_pattern)]
    password: str


class CustomerOut(BaseModel):
    id: UUID
    full_name: str
    primary_number: str
    email: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CustomerTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    customer: CustomerOut


class SavedAddress(BaseModel):
    label: str
    address: str


class SavedAddressesUpdate(BaseModel):
    saved_addresses: List[SavedAddress]
