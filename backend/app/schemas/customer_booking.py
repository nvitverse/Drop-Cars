# schemas/customer_booking.py
from pydantic import BaseModel, Field, field_validator
from typing import Dict, Optional, List
from uuid import UUID
from datetime import datetime

class CustomerQuoteRequest(BaseModel):
    pickup_drop_location: Dict[str, str] = Field(
        description="Object mapping indices to location names, e.g. {\"0\": \"Chennai\", \"1\": \"Bangalore\"}"
    )
    trip_type: str = Field(description="Oneway | Round Trip | Multy City")
    car_type: str = Field(description="e.g. HATCHBACK, SEDAN_4_PLUS_1, etc.")

    @field_validator("pickup_drop_location")
    def validate_locations(cls, v: Dict[str, str]):
        if not isinstance(v, dict) or len(v.keys()) < 2:
            raise ValueError("pickup_drop_location must contain at least a source (0) and a destination (1)")
        try:
            sorted([int(k) for k in v.keys()])
        except Exception:
            raise ValueError("pickup_drop_location keys must be numeric strings like '0', '1', ...")
        return v


class FareBreakdownOut(BaseModel):
    total_km: int
    trip_time: str
    base_km_amount: int
    driver_allowance: int
    extra_driver_allowance: int
    permit_charges: int
    extra_permit_charges: int
    hill_charges: int
    toll_charges: int
    night_charges: int
    total_amount: int
    driver_amount: int
    customer_amount: int
    remark_trip_min_km: int


class CustomerQuoteResponse(BaseModel):
    fare: FareBreakdownOut
    car_type: str
    trip_type: str


class CustomerBookingCreate(BaseModel):
    pickup_drop_location: Dict[str, str]
    trip_type: str
    car_type: str
    start_date_time: datetime
    driver_referral_code: Optional[str] = None

    @field_validator("pickup_drop_location")
    def validate_locations(cls, v: Dict[str, str]):
        if not isinstance(v, dict) or len(v.keys()) < 2:
            raise ValueError("pickup_drop_location must contain at least a source (0) and a destination (1)")
        try:
            sorted([int(k) for k in v.keys()])
        except Exception:
            raise ValueError("pickup_drop_location keys must be numeric strings like '0', '1', ...")
        return v


class DriverShortOut(BaseModel):
    full_name: str
    primary_number: str
    licence_number: Optional[str] = None


class CarShortOut(BaseModel):
    car_name: str
    car_type: str
    car_number: str


class CustomerBookingOut(BaseModel):
    id: UUID
    customer_id: UUID
    pickup_drop_location: Dict[str, str]
    trip_type: str
    car_type: str
    start_date_time: datetime
    customer_name: str
    customer_number: str
    
    quoted_cost_per_km: int
    quoted_driver_allowance: int
    quoted_extra_driver_allowance: int
    quoted_permit_charges: int
    quoted_extra_permit_charges: int
    quoted_hill_charges: int
    quoted_toll_charges: int
    quoted_extra_cost_per_km: int
    quoted_night_charges: int
    quoted_total_amount: int
    quoted_driver_amount: int
    quoted_trip_distance: int
    quoted_trip_time: str

    admin_cost_per_km: Optional[int] = None
    admin_driver_allowance: Optional[int] = None
    admin_extra_driver_allowance: Optional[int] = None
    admin_permit_charges: Optional[int] = None
    admin_extra_permit_charges: Optional[int] = None
    admin_hill_charges: Optional[int] = None
    admin_toll_charges: Optional[int] = None
    admin_extra_cost_per_km: Optional[int] = None
    admin_night_charges: Optional[int] = None
    admin_total_amount: Optional[int] = None
    admin_driver_amount: Optional[int] = None

    status: str
    rejection_reason: Optional[str] = None
    linked_order_id: Optional[int] = None
    is_paid: bool
    rp_order_id: Optional[str] = None
    
    created_at: datetime
    decided_at: Optional[datetime] = None

    driver_details: Optional[DriverShortOut] = None
    car_details: Optional[CarShortOut] = None

    # Trip lifecycle (only set once linked_order_id exists) - lets the
    # customer app bucket bookings into Upcoming/Running/Completed instead
    # of just the admin-approval `status` above.
    trip_status: Optional[str] = None  # Order.trip_status: PENDING | COMPLETED | CANCELLED
    assignment_status: Optional[str] = None  # OrderAssignment.assignment_status: PENDING | ASSIGNED | DRIVING | COMPLETED | CANCELLED

    gst_included: Optional[bool] = False
    gst_amount: Optional[float] = 0.0

    class Config:
        from_attributes = True


class CustomerBookingPayResponse(BaseModel):
    rp_order_id: str
    amount: int
    currency: str = "INR"


class CustomerBookingVerifyRequest(BaseModel):
    rp_order_id: str
    rp_payment_id: str
    rp_signature: str


class AdminBookingUpdate(BaseModel):
    admin_cost_per_km: int
    admin_driver_allowance: int
    admin_extra_driver_allowance: int
    admin_permit_charges: int
    admin_extra_permit_charges: int
    admin_hill_charges: int
    admin_toll_charges: int
    admin_extra_cost_per_km: int
    admin_night_charges: int
    start_date_time: Optional[datetime] = None
