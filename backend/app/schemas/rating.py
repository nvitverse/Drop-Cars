# schemas/rating.py
from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.schemas.customer_booking import DriverShortOut, CarShortOut


class RateableTripOut(BaseModel):
    """One completed, self-booked trip that hasn't been rated yet."""
    order_id: int
    booking_id: UUID
    trip_type: str
    car_type: str
    start_date_time: datetime
    driver: Optional[DriverShortOut] = None
    car: Optional[CarShortOut] = None


class RatingSubmitRequest(BaseModel):
    order_id: int
    driver_rating: int = Field(ge=1, le=5)
    car_rating: int = Field(ge=1, le=5)
    service_rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None


class RatingOut(BaseModel):
    id: UUID
    order_id: int
    driver_rating: int
    car_rating: int
    service_rating: int
    comment: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
