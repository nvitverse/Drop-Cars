from pydantic import BaseModel, Field, validator, model_validator
from typing import Optional, List, Annotated
from uuid import UUID
from datetime import datetime
from app.models.order_assignments import AssignmentStatusEnum

# Regex pattern for Indian mobile numbers (10 digits only, starting with 6-9)
indian_phone_pattern = r'^[6-9]\d{9}$'

class OrderAssignmentCreate(BaseModel):
    order_id: int

    @model_validator(mode='before')
    def check_order_id(cls, values):
        if isinstance(values, dict) and 'order_id' not in values:
            for alt_key in ('orderId', 'id', 'source_order_id', 'booking_id'):
                if alt_key in values:
                    values['order_id'] = values[alt_key]
                    break
        return values

class OrderAssignmentResponse(BaseModel):
    id: int
    order_id: int
    vehicle_owner_id: UUID
    driver_id: Optional[UUID] = None
    car_id: Optional[UUID] = None
    assignment_status: AssignmentStatusEnum
    assigned_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    charges_to_deduct: Optional[int] = None

    class Config:
        from_attributes = True

class OrderAssignmentStatusUpdate(BaseModel):
    assignment_status: AssignmentStatusEnum

class OrderAssignmentWithOrderDetails(BaseModel):
    # Order assignment details
    # id: Optional[int] = None
    order_id: int
    vehicle_owner_id: UUID
    # driver_id: Optional[UUID] = None
    # car_id: Optional[UUID] = None
    assignment_status: AssignmentStatusEnum
    # assigned_at: Optional[datetime] = None
    # expires_at: Optional[datetime] = None
    # cancelled_at: Optional[datetime] = None
    # completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    # Order details
    vendor_id: Optional[UUID] = None
    trip_type: str
    car_type: str
    pickup_drop_location: dict
    start_date_time: datetime
    customer_name: str
    customer_number: Annotated[str, Field(
        pattern=indian_phone_pattern,
        description="Customer mobile number must be a valid 10-digit Indian mobile number (starting with 6-9)"
    )]
    # cost_per_km: int
    # extra_cost_per_km: int
    # driver_allowance: int
    # extra_driver_allowance: int
    # permit_charges: int
    # extra_permit_charges: int
    # hill_charges: int
    # toll_charges: int
    pickup_notes: Optional[str] = None
    trip_status: str
    pick_near_city: str
    trip_distance: int
    trip_time: str
    platform_fees_percent: int
    estimated_price: Optional[int] = None
    vendor_price: Optional[int] = None
    order_created_at: datetime

    class Config:
        from_attributes = True
        
class BaseResponce_pending_orders(BaseModel):
    customer_number_notice: Optional[str] = None
    order_id: int
    trip_status: str
    trip_type: str
    car_type: str
    pickup_drop_location: dict
    start_date_time: datetime
    pick_near_city:str
    trip_distance: int
    trip_time: str
    estimated_price: Optional[int] = None
    toll_charge_update:bool
    max_time_to_assign_order : Optional[datetime]
    pickup_notes: Optional[str] = None
    created_at: datetime
    charges_to_deduct : int
    # Driver-side fare breakdown (shown before accepting; 0 when not applicable)
    cost_per_km: Optional[int] = 0
    driver_allowance: Optional[int] = 0
    permit_charges: Optional[int] = 0
    hill_charges: Optional[int] = 0
    toll_charges: Optional[int] = 0
    # Per-stop address/maps link, keyed like pickup_drop_location. Shown to
    # the driver in a dropdown BEFORE they accept.
    location_links: Optional[dict] = None
    # Special requirements the vendor opted into (both off/null by default).
    # The driver app must warn in red before the driver accepts.
    car_make_year_requirement: Optional[int] = None
    carrier_required: Optional[bool] = False
    # Priority window: while true and before priority_cutoff_at, only
    # Preferred-tier drivers can accept. Local bookings (Phase 06) never set
    # this. Null cutoff with priority_for_paid=false means always open.
    priority_for_paid: Optional[bool] = True
    priority_cutoff_at: Optional[datetime] = None
    # Fare transparency: display-only, doesn't change any charge calculation.
    fare_type: Optional[str] = "ITEMIZED"
    charge_items: Optional[list] = None


class vehicle_owner_pending_new_orders(BaseResponce_pending_orders):
    class Config:
        from_attributes = True

class vehicle_owner_pending_horuly_rental(BaseResponce_pending_orders):
    package:dict
    cost_for_addon_km:int
    class Config:
        from_attributes = True

class UpdateCarDriverRequest(BaseModel):
    driver_id: UUID
    car_id: UUID

    @model_validator(mode='before')
    def check_ids(cls, values):
        if isinstance(values, dict):
            if 'driver_id' not in values and 'driverId' in values:
                values['driver_id'] = values['driverId']
            if 'car_id' not in values and 'carId' in values:
                values['car_id'] = values['carId']
        return values

class StartTripRequest(BaseModel):
    start_km: int = Field(..., gt=0, description="Starting kilometer reading")
    
    @validator('start_km')
    def validate_start_km(cls, v):
        if v <= 0:
            raise ValueError('Start KM must be greater than 0')
        return v

class StartTripResponse(BaseModel):
    message: str
    end_record_id: int
    start_km: int
    speedometer_img_url: str

class EndTripRequest(BaseModel):
    end_km: int = Field(..., gt=0, description="Ending kilometer reading")
    
    @validator('end_km')
    def validate_end_km(cls, v):
        if v <= 0:
            raise ValueError('End KM must be greater than 0')
        return v

class EndTripResponse(BaseModel):
    message: str
    end_record_id: int
    end_km: int
    close_speedometer_img_url: Optional[str] = None
    total_km: int
    # calculated_fare: int
    # driver_amount: int
    # vehicle_owner_amount: int

class DriverOrderListResponse(BaseModel):
    # When the customer number opens (see crud/order_assignments.py)
    customer_number_revealed: Optional[bool] = None
    customer_number_reveal_at: Optional[str] = None
    customer_number_reveal_in_seconds: Optional[int] = None
    customer_number_notice: Optional[str] = None
    id: int
    order_id: int
    assignment_status: AssignmentStatusEnum
    customer_name: str
    customer_number: str
    vendor_name: Optional[str] = None
    vendor_primary_number: Optional[str] = None
    vendor_secondary_number: Optional[str] = None
    pickup_drop_location: dict
    start_date_time: datetime
    trip_type: str
    car_type: str
    # Nullable in the DB (orders.py: trip_distance/trip_time have
    # nullable=True) - Optional here so one order with a missing value
    # doesn't 500 the driver's whole assigned-orders/completed-trips list.
    trip_distance: Optional[int] = None
    trip_time: Optional[str] = None
    toll_charge_update: Optional[bool] = None
    data_visibility_vehicle_owner: Optional[bool] = None
    closed_vendor_price: Optional[int] = None
    estimated_price: Optional[int] = None
    night_charges: Optional[int] = None
    waiting_time: Optional[int] = None
    assigned_at: Optional[datetime] = None
    created_at: datetime
    # Driver-side fare breakdown - the duty driver collects cash from the
    # customer directly, so they need their OWN itemized charges.
    cost_per_km: Optional[int] = None
    driver_allowance: Optional[int] = None
    permit_charges: Optional[int] = None
    hill_charges: Optional[int] = None
    toll_charges: Optional[int] = None
    location_links: Optional[dict] = None
    # Cash settlement: what's already collected upfront, so the driver knows
    # what to expect collecting in cash at trip end.
    advance_received: Optional[int] = None
    fare_type: Optional[str] = "ITEMIZED"
    # Which named charges are bundled into the total vs. collected extra by
    # the driver directly from the customer - see EndRecord.extra_charges_collected.
    charge_items: Optional[list] = None
    # Ground truth for whether trip/start.tsx and trip/end.tsx must collect
    # an OTP - true whenever the assignment actually has one set. Self-
    # sourced (Create Booking) assignments never get one (see
    # driver_create_booking_confirm), since there's no customer email to
    # send it to and requiring it would lock the driver out of their own
    # trip. Driven off the real column, not inferred from vendor_name.
    otp_required: bool = True
    # "10% CC" toggle (added 2026-09-04) - True means this booking's poster
    # switched off the platform's usual commission (see
    # driver_create_booking_confirm / crud/end_records.py). Drives the
    # "Without CC" green badge on the Driver App's booking cards.
    commission_waived: Optional[bool] = False
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    car_name: Optional[str] = None
    car_number: Optional[str] = None
    assigned_driver_name: Optional[str] = None
    assigned_driver_phone: Optional[str] = None
    assigned_car_name: Optional[str] = None
    assigned_car_number: Optional[str] = None

    class Config:
        from_attributes = True

class DriverOrderReport(BaseModel):
    # # id: int
    # #Assignment details
    # order_id: int
    # trip_status: AssignmentStatusEnum
    
    # #Order details
    # customer_name: str
    # customer_number: str
    # pickup_drop_location: dict
    # start_date_time: datetime
    # trip_type: str
    # car_type: str
    # trip_distance: int
    # trip_time: str
    # # toll_charge_updated_toll_chargeupdate: Optional[bool] = None
    # # data_visibility_vehicle_owner: Optional[bool] = None
    # # closed_vendor_price: Optional[int] = None
    # customer_price: Optional[int] = None
    # assigned_at: Optional[datetime] = None
    # created_at: datetime
    # completed_at: datetime
    # class Config:
    #     from_attributes = True
        # Assignment details
        
    order_id: int  # depending on your DB, adjust as needed
    trip_status: str

    # Order details
    customer_name: str
    customer_number: str
    pickup_drop_location: dict
    start_date_time: datetime
    trip_type: str = "Unknown"
    car_type: str = "Unknown"
    trip_time: Optional[str]  # Could be timedelta or string depending on your model
    trip_distance: Optional[float] = None
    toll_charges: Optional[float]
    customer_price: Optional[float]
    vendor_name: Optional[str] = None
    vendor_primary_number: Optional[str] = None
    vendor_secondary_number: Optional[str] = None

    # Hourly Rental details (optional - only if hourly_rental is present)
    package_hours: Optional[dict] = None
    cost_per_hour: Optional[float] = None
    cost_per_km: Optional[float] = None

    # New Order details (optional - only if hourly_rental is not present)
    driver_allowance: Optional[float] = None
    permit_charges: Optional[float] = None
    hill_charges: Optional[float] = None
    pickup_notes: Optional[str] = None

    # Timestamps
    assigned_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_km : int

    # Additional toll field for clarity/debugging if needed
    updated_toll_charge: Optional[float] = None
    # Additional charges
    night_charges: Optional[int] = None
    waiting_time: Optional[int] = None