from pydantic import BaseModel, Field, validator
from typing import Optional, Annotated
from uuid import UUID
from datetime import datetime
from fastapi import Form
from enum import Enum

class CarTypeEnum(str, Enum):
    HATCHBACK = "HATCHBACK"
    SEDAN_4_PLUS_1 = "SEDAN_4_PLUS_1"
    NEW_SEDAN_2022_MODEL = "NEW_SEDAN_2022_MODEL"
    ETIOS_4_PLUS_1 = "ETIOS_4_PLUS_1"
    SUV = "SUV"
    SUV_6_PLUS_1 = "SUV_6_PLUS_1"
    SUV_7_PLUS_1 = "SUV_7_PLUS_1"
    INNOVA = "INNOVA"
    INNOVA_6_PLUS_1 = "INNOVA_6_PLUS_1"
    INNOVA_7_PLUS_1 = "INNOVA_7_PLUS_1"
    INNOVA_CRYSTA = "INNOVA_CRYSTA"
    INNOVA_CRYSTA_6_PLUS_1 = "INNOVA_CRYSTA_6_PLUS_1"
    INNOVA_CRYSTA_7_PLUS_1 = "INNOVA_CRYSTA_7_PLUS_1"
    TEMPO_TRAVELLER_12 = "TEMPO_TRAVELLER_12"
    TEMPO_TRAVELLER_14 = "TEMPO_TRAVELLER_14"
    TEMPO_TRAVELLER_18 = "TEMPO_TRAVELLER_18"
    URBANIA_12 = "URBANIA_12"
    URBANIA_14 = "URBANIA_14"
    URBANIA_16 = "URBANIA_16"

class CarDetailsForm(BaseModel):
    vehicle_owner_id: Optional[UUID] = Field(None, description="Fleet owner ID (auto-set from token)")
    
    car_name: Annotated[str, Field(
        min_length=2,
        max_length=100,
        description="Car name must be between 2 and 100 characters"
    )]
    
    car_type: CarTypeEnum = Field(
        description="Car type: SEDAN, SUV, or INNOVA"
    )
    
    car_number: Annotated[str, Field(
        min_length=5,
        max_length=20,
        description="Car registration number (5-20 characters)"
    )]
    
    year_of_the_car: Optional[str] = Field(
        None,
        description="Year of the car"
    )

    # Expiry dates (YYYY-MM-DD strings) for the documents that have one -
    # all optional so an existing caller that doesn't send them still works.
    # OCR can suggest these (see /cardetails/extract-expiry) but the driver
    # can always type/change them before submitting.
    rc_expiry_date: Optional[str] = Field(None, description="Ignored: an RC has no expiry date (send registration_date)")
    registration_date: Optional[str] = Field(None, description="RC registration date (YYYY-MM-DD)")
    insurance_expiry_date: Optional[str] = Field(None, description="Insurance expiry date (YYYY-MM-DD)")
    fc_expiry_date: Optional[str] = Field(None, description="FC expiry date (YYYY-MM-DD)")
    permit_expiry_date: Optional[str] = Field(None, description="Permit expiry date (YYYY-MM-DD)")
    pollution_expiry_date: Optional[str] = Field(None, description="Pollution (PUC) certificate expiry date (YYYY-MM-DD)")

    @validator('car_number')
    def validate_car_number(cls, v):
        # Basic validation for car number format
        if not v.replace(' ', '').replace('-', '').isalnum():
            raise ValueError('Car number should contain only letters, numbers, spaces, and hyphens')
        return v.upper()

    @classmethod
    def as_form(
        cls,
        vehicle_owner_id: Optional[str] = Form(None, description="Fleet owner ID (auto-set from token)"),
        car_name: str = Form(..., description="Car name (2-100 characters)"),
        car_type: CarTypeEnum = Form(..., description="Car type: SEDAN, SUV, or INNOVA"),
        car_number: str = Form(..., description="Car registration number"),
        year_of_the_car: Optional[str] = Form(None, description="Year of the car"),
        rc_expiry_date: Optional[str] = Form(None, description="Ignored: an RC has no expiry date"),
        registration_date: Optional[str] = Form(None, description="RC registration date (YYYY-MM-DD)"),
        insurance_expiry_date: Optional[str] = Form(None, description="Insurance expiry date (YYYY-MM-DD)"),
        fc_expiry_date: Optional[str] = Form(None, description="FC expiry date (YYYY-MM-DD)"),
        permit_expiry_date: Optional[str] = Form(None, description="Permit expiry date (YYYY-MM-DD)"),
        pollution_expiry_date: Optional[str] = Form(None, description="Pollution (PUC) certificate expiry date (YYYY-MM-DD)"),
    ):
        return cls(
            vehicle_owner_id=UUID(vehicle_owner_id) if vehicle_owner_id else None,
            car_name=car_name,
            car_type=car_type,
            car_number=car_number,
            year_of_the_car=year_of_the_car,
            rc_expiry_date=None,
            registration_date=registration_date or None,
            insurance_expiry_date=insurance_expiry_date or None,
            fc_expiry_date=fc_expiry_date or None,
            permit_expiry_date=permit_expiry_date or None,
            pollution_expiry_date=pollution_expiry_date or None,
        )

class CarDetailsOut(BaseModel):
    id: UUID
    vehicle_owner_id: UUID
    car_name: str
    car_type: CarTypeEnum
    car_number: str
    year_of_the_car: Optional[str]
    rc_front_img_url: Optional[str]
    rc_back_img_url: Optional[str]
    insurance_img_url: Optional[str]
    fc_img_url: Optional[str]
    car_img_url: Optional[str]
    permit_img_url: Optional[str]
    pollution_img_url: Optional[str] = None
    rc_expiry_date: Optional[str] = None
    registration_date: Optional[str] = None
    insurance_expiry_date: Optional[str] = None
    fc_expiry_date: Optional[str] = None
    permit_expiry_date: Optional[str] = None
    pollution_expiry_date: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
                "organization_id": "org_123",
                "car_name": "Toyota Camry",
                "car_type": "SEDAN",
                "car_number": "MH-12-AB-1234",
                "rc_front_img_url": "https://example.com/rc_front.jpg",
                "rc_back_img_url": "https://example.com/rc_back.jpg",
                "insurance_img_url": "https://example.com/insurance.jpg",
                "fc_img_url": "https://example.com/fc.jpg",
                "car_img_url": "https://example.com/car.jpg",
                "permit_img_url": "https://example.com/permit.jpg",
                "created_at": "2025-08-13T12:00:00Z"
            }
        }


class CarDetailsSignupResponse(BaseModel):
    message: str
    car_id: str
    image_urls: dict
    status: str
