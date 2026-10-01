from pydantic import BaseModel, Field,field_validator, validator
from typing import Any, List, Optional, Union, Literal, Dict, Annotated
from uuid import UUID
from datetime import datetime
from enum import Enum

# Regex pattern for Indian mobile numbers (10 digits only, starting with 6-9)
# - used for platform users (driver/vendor/owner), who are always Indian.
indian_phone_pattern = r'^[6-9]\d{9}$'
# Customers can be NRI/international, unlike platform users above - the
# Vendor/Driver App's editable country-code field sends "+<code><digits>"
# combined into this one field (e.g. "+919876543210" or "+14155552671").
# Exact per-country length (India: always 10 digits after +91) is enforced
# client-side; this just accepts the general international shape (+, then
# 8-15 digits total).
customer_phone_pattern = r'^\+[1-9]\d{7,14}$'


def normalize_customer_number(v):
    """Accept the number however staff typed it - "+91 88384 85050",
    "+91-8838485050", "8838485050" - and store it as +918838485050. The Admin
    "Post booking" form sends the country code and the number separated by a
    space, which the strict pattern used to reject."""
    import re
    if isinstance(v, str):
        v = re.sub(r"[\s\-()]", "", v)
        if len(v) == 10 and v.isdigit():
            v = f"+91{v}"
    if not isinstance(v, str) or not re.match(customer_phone_pattern, v):
        raise ValueError('Invalid mobile number format. Include the country code, e.g. +919876543210')
    return v


class ChargeItem(BaseModel):
    label: str
    included: bool = False


class OrderType(str,Enum):
    ONEWAY = "Oneway"
    ROUND_TRIP = "Round Trip"
    HOURLY_RENTAL = "Hourly Rental"
    MULTY_CITY = "Multy City"
    LOCAL = "Local"


class CarType(str,Enum):
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


class RentalOrderRequest(BaseModel):
    vendor_id: Optional[UUID] = None
    trip_type: OrderType = Field(default=OrderType.HOURLY_RENTAL)
    car_type: CarType
    pickup_drop_location: Dict[str, str] = Field(
        description="Object mapping indices to location names, e.g. {\"0\": \"Chennai\", \"1\": \"Bangalore\"}"
    )
    pick_near_city: List[str]
    start_date_time: datetime
    customer_name: str
    # Plain str: the format is checked (and spaces/dashes stripped) by
    # validate_customer_number below. A Field(pattern=...) here ran first and
    # rejected "+91 8838485050" before the validator could clean it.
    customer_number: str
    
    package_hours: Dict[str, int] = Field(
        description='{"hours": <int>, "km_range": <int>}'
    )
    
    cost_per_hour: int
    extra_cost_per_hour: int
    cost_for_addon_km: int
    extra_cost_for_addon_km: int

    pickup_notes: Optional[str] = None
    max_time_to_assign_order: Optional[int] = Field(
        default=15, 
        description="Maximum time in minutes to assign the order (default: 15 minutes)"
    )
    toll_charge_update: Optional[bool] = Field(
        default=False,
        description="Whether toll charges can be updated during the trip (default: false)"
    )
    target_driver_id: Optional[UUID] = Field(
        default=None,
        description="Post directly to one driver instead of broadcasting by city (resolve via /vendor/drivers/search first)"
    )
    fare_type: Optional[Literal["ALL_INCLUSIVE", "ITEMIZED"]] = Field(
        default="ITEMIZED",
        description="Whether this Local/Hourly booking was posted as one all-inclusive price (vendor toggle) or itemized"
    )

    @field_validator("pickup_drop_location")
    def validate_locations(cls, v: Dict[str, str]):
        if not isinstance(v, dict) or len(v.keys()) != 1:
            raise ValueError("pickup_drop_location must be an object with at one indices: source (0)")
        try:
            sorted([int(k) for k in v.keys()])
        except Exception:
            raise ValueError("pickup_drop_location keys must be numeric strings like '0', '1', ...")
        return v

    @validator('customer_number')
    def validate_customer_number(cls, v):
        return normalize_customer_number(v)


class RentalFareBreakdown(BaseModel):
    total_hours: float
    vendor_amount: int
    estimate_price: int


class HourlyQuoteResponse(BaseModel):
    fare: RentalFareBreakdown
    echo: RentalOrderRequest


class OrderSource(str, Enum):
    NEW_ORDERS = "NEW_ORDERS"
    HOURLY_RENTAL = "HOURLY_RENTAL"


class UnifiedOrder(BaseModel):
    id: int
    source: OrderSource
    source_order_id: int
    # Was `UUID` (required) - genuinely nullable (vendor-less orders: Drop
    # Bid, website-direct, driver-created bookings). Found 2026-09-04 in a
    # full schema-vs-model audit - get_all_orders() (this schema's only
    # response_model use, GET /orders/all) has ZERO vendor-less filtering
    # unlike its sibling get_all_admin_orders (fixed earlier this session),
    # so this was almost certainly already 500ing in production the
    # moment any such order existed.
    vendor_id: Optional[UUID] = None
    trip_type: OrderType
    car_type: CarType
    pickup_drop_location: Dict[str, str]
    start_date_time: datetime
    customer_name: str
    # Was Annotated[str, Field(pattern=customer_phone_pattern, ...)] - a
    # copy-paste from an INPUT-validation context (that pattern requires a
    # "+countrycode" prefix) onto this READ-ONLY response schema. Found
    # 2026-09-04 live-testing GET /orders/all: real stored customer_number
    # values are bare 10-digit numbers with no "+" prefix (matching this
    # field's own description text, which the pattern itself contradicted),
    # so EVERY row failed response validation - 269/269 orders, a raw 500
    # on the entire endpoint. A response model reading historical data
    # should never re-validate a format constraint meant for new input.
    customer_number: str
    trip_status: Optional[str] = None
    pick_near_city: Optional[List[str]] = None
    trip_distance: Optional[int] = None
    trip_time: Optional[str] = None
    estimated_price: Optional[int] = None
    vendor_price: Optional[int] = None
    platform_fees_percent: Optional[int] = None
    created_at: datetime
    max_time: Optional[int] = None
    # cost_per_km : Optional[int] = None
    # cancelled_by: Optional[str] = None
    vendor_profit : Optional[int] = None

    class Config:
        from_attributes = True
        
class Vendor_Pending_Order_Responce(BaseModel):
    id: int
    source: OrderSource
    source_order_id: int
    vendor_id: Optional[UUID] = None
    trip_type: OrderType
    car_type: CarType
    pickup_drop_location: Dict[str, str]
    start_date_time: datetime
    customer_name: str
    # Was Annotated[str, Field(pattern=customer_phone_pattern, ...)] - same
    # copy-paste-from-input-validation bug as UnifiedOrder/NewOrderResponse
    # above, fixed together 2026-09-04 (this is a response schema reading
    # real stored data, which is often a bare 10-digit number with no "+"
    # prefix - the strict input-only pattern crashed every such row).
    customer_number: str
    trip_status: Optional[str] = None
    cancelled_by: Optional[str] = None  # AUTO_CANCELLED | CANCELLED_BY_VENDOR (reason)
    pick_near_city: Optional[List[str]] = None
    trip_distance: Optional[int] = None
    trip_time: Optional[str] = None
    estimated_price: Optional[int] = None
    vendor_price: Optional[int] = None
    platform_fees_percent: Optional[int] = None
    created_at: datetime
    order_accept_status: bool
    Driver_assigned : bool
    Car_assigned : bool
    # cost_per_km : Optional[int] = None
    # vendor_profit : Optional[int] = None

    class Config:
        from_attributes = True


class CloseOrderRequest(BaseModel):
    closed_vendor_price: int
    closed_driver_price: int
    commision_amount: int
    start_km: int
    end_km: int
    contact_number: Annotated[str, Field(
        pattern=indian_phone_pattern,
        description="Contact mobile number must be a valid 10-digit Indian mobile number (starting with 6-9)"
    )]
    
    @validator('contact_number')
    def validate_contact_number(cls, v):
        import re
        if not re.match(indian_phone_pattern, v):
            raise ValueError('Invalid Indian mobile number format. Use 10-digit number starting with 6-9 (e.g., 9876543210)')
        return v

class CloseOrderResponse(BaseModel):
    order_id: int
    end_record_id: int
    img_url: str


class RecreateOrderRequest(BaseModel):
    order_id: int = Field(description="The ID of the order to recreate")
    max_time_to_assign_order: Optional[int] = Field(
        default=15, 
        description="Maximum time in minutes to assign the order (default: 15 minutes)"
    )


class OnewayQuoteRequest(BaseModel):
    vendor_id: Optional[UUID] = None
    trip_type: OrderType = Field(default=OrderType.ONEWAY)
    car_type: CarType
    pickup_drop_location: Dict[str, str] = Field(
        description="Object mapping indices to location names, e.g. {\"0\": \"Chennai\", \"1\": \"Bangalore\"}"
    )
    start_date_time: datetime
    # Round Trip "return" date+time / Multi City "drop" date+time. Not used
    # by Oneway/Hourly. Defaults client-side to the start date at 9:30 PM.
    end_date_time: Optional[datetime] = None
    # Admin "Post booking": the minimum billable km for THIS booking (default
    # comes from Fare Rules: 130 oneway, 250/day round trip). Billed km =
    # max(actual route km, this). Only honoured for admin callers.
    min_km_override: Optional[float] = Field(default=None, ge=0, le=10000)
    # Admin "Km limit" field: the exact km to bill for THIS booking (the route
    # km by default, edited by the admin). Admin callers only.
    km_override: Optional[float] = Field(default=None, ge=0, le=10000)
    # GST amount the admin saw on the form (auto 5% of the km fare, or typed).
    # Saved with the booking when its GST charge item is ticked.
    gst_amount: Optional[int] = Field(default=None, ge=0)
    customer_name: str
    customer_number: str
    cost_per_km: Optional[int] = 0
    extra_cost_per_km: Optional[int] = 0
    driver_allowance: Optional[int] = 0
    extra_driver_allowance: Optional[int] = 0
    permit_charges: Optional[int] = 0
    extra_permit_charges: Optional[int] = 0
    hill_charges: Optional[int] = 0
    toll_charges: Optional[int] = 0
    night_charges: Optional[int] = 0
    pickup_notes: Optional[str] = None

    @validator('customer_number')
    def validate_customer_number(cls, v):
        return normalize_customer_number(v)
    max_time_to_assign_order: Optional[int] = Field(
        default=15,
        description="Maximum time in minutes to assign the order (default: 15 minutes)"
    )
    toll_charge_update: Optional[bool] = Field(
        default=False,
        description="Whether toll charges can be updated during the trip (default: false)"
    )
    # Per-stop address/maps link, keyed the same as pickup_drop_location
    # (e.g. {"0": "https://maps.google.com/...", "1": "Door No 4, Main St"}).
    # Shown to drivers before they accept. Booking-only.
    location_links: Optional[Dict[str, str]] = None
    # Special requirements (both opt-in, off by default = no special
    # requirement). When set, the driver app must warn the driver in red
    # before they accept the booking.
    car_make_year_requirement: Optional[int] = Field(
        default=None,
        description="Minimum car make year required for this trip (e.g. 2023). Null/omitted means no requirement.",
    )
    carrier_required: Optional[bool] = Field(
        default=False,
        description="Whether a roof carrier is required for this trip (default: false)",
    )
    # Priority window: on by default. When on, only Preferred-tier drivers
    # can accept until priority_cutoff_at. Omit the cutoff to let the
    # backend compute a sensible default (midpoint to pickup, or a 5-minute
    # floor for immediate bookings).
    priority_for_paid: Optional[bool] = Field(
        default=True,
        description="Whether this booking is Preferred-partners-only until priority_cutoff_at (default: true)",
    )
    priority_cutoff_at: Optional[datetime] = Field(
        default=None,
        description="When the priority window ends and Standard partners can also accept. Omit to use the server-computed default.",
    )
    # Fare transparency: all-inclusive total vs the existing itemized/additive
    # charge fields (default - unchanged from today's behavior). charge_items
    # is display-only for the driver app; it doesn't change how any charge is
    # actually calculated or collected.
    fare_type: Optional[Literal["ALL_INCLUSIVE", "ITEMIZED"]] = Field(
        default="ITEMIZED",
        description="Whether the posted total is all-inclusive or the standard itemized charges (default: ITEMIZED)",
    )
    charge_items: Optional[List[ChargeItem]] = Field(
        default=None,
        description='Which named charges are bundled vs extra, e.g. [{"label": "Toll", "included": false}]. Presets: Toll, State Tax, Parking, Waiting - plus any vendor-added custom entries.',
    )
    # Cash settlement: what's already been collected upfront (e.g. online
    # prepayment). Whatever's left is what the driver collects in cash.
    advance_received: Optional[int] = Field(
        default=None,
        description="Amount already collected upfront before the trip, if any (default: none)",
    )
    # All-Inclusive pricing - required (in effect) when fare_type is
    # ALL_INCLUSIVE: total_booking_amount is the flat amount for the driver,
    # extra_amount is the poster's own markup on top. See
    # crud/end_records.py's All-Inclusive commission rule. Unused for
    # ITEMIZED bookings (the itemized fields above apply instead).
    total_booking_amount: Optional[int] = Field(
        default=None,
        description="ALL_INCLUSIVE only: flat total amount for the driver (excludes the poster's extra_amount markup)",
    )
    extra_amount: Optional[int] = Field(
        default=0,
        description="ALL_INCLUSIVE only: the poster's own markup on top of total_booking_amount (0 = no markup, no profit for the poster)",
    )
    waiting_hours_included: Optional[int] = Field(
        default=None,
        description="ALL_INCLUSIVE only: how many hours of waiting time are bundled into total_booking_amount (display-only)",
    )
    # "10% CC" toggle (added 2026-09-04) - whether the platform's usual
    # commission is deducted from the Base KM fare for this specific
    # booking. On (default) = normal behavior, unchanged. Off = the
    # poster keeps the full base fare, no platform cut - see
    # driver_create_booking_confirm's use of this (currently the only
    # caller that actually varies platform_fees_percent by it; Vendor/
    # Admin App confirm routes accept the field but don't act on it yet).
    apply_commission: Optional[bool] = Field(
        default=True,
        description="Whether the platform's commission is deducted from the Base KM fare for this booking (default: true). Off = poster keeps the full base fare - shown as 'Without CC' in the Driver App.",
    )

    @field_validator("pickup_drop_location")
    def validate_locations(cls, v: Dict[str, str]):
        if not isinstance(v, dict) or len(v.keys()) < 2:
            raise ValueError("pickup_drop_location must be an object with at least two indices: source (0) and destination (last)")
        # Ensure keys are numeric-like
        try:
            sorted([int(k) for k in v.keys()])
        except Exception:
            raise ValueError("pickup_drop_location keys must be numeric strings like '0', '1', ...")
        return v


class OnewayConfirmRequest(OnewayQuoteRequest):
    send_to: Optional[Literal["ALL", "NEAR_CITY", "DRIVER"]] = Field(
        default="ALL",
        description="Whether to send to all fleet owners, only near-city ones, or post directly to one driver"
    )
    near_city: Optional[List[str]] = Field(
        default=None, description="City name when send_to is NEAR_CITY"
    )
    target_driver_id: Optional[UUID] = Field(
        default=None, description="Driver id when send_to is DRIVER (resolve via /vendor/drivers/search first)"
    )
    night_charges: Optional[int] = Field(default=0, description="Optional night charges applied at creation")
    acceptance_deadline: Optional[datetime] = Field(
        default=None,
        description="When the booking auto-cancels if no driver accepts it. Defaults to pickup time + 15 minutes."
    )
    # Quote review lets the vendor override the calculated km/time (e.g. a
    # known shortcut not reflected by Maps). Booking-only - never written
    # back to the route_distances cache.
    override_km: Optional[float] = Field(default=None, description="Vendor-edited distance in km, overriding the calculated value")
    override_trip_time: Optional[str] = Field(default=None, description="Vendor-edited trip duration text, overriding the calculated value")


class RoundTripQuoteRequest(OnewayQuoteRequest):
    trip_type: OrderType = Field(default=OrderType.ROUND_TRIP)


class RoundTripConfirmRequest(OnewayConfirmRequest):
    trip_type: OrderType = Field(default=OrderType.ROUND_TRIP)


class MulticityQuoteRequest(OnewayQuoteRequest):
    trip_type: OrderType = Field(default=OrderType.MULTY_CITY)


class MulticityConfirmRequest(OnewayConfirmRequest):
    trip_type: OrderType = Field(default=OrderType.MULTY_CITY)


class FareBreakdown(BaseModel):
    total_km: float
    # The originally calculated km (from Maps/cache), before any vendor
    # override. Equal to total_km when there is no override.
    calculated_km: float = 0
    trip_time: str
    base_km_amount: int
    driver_allowance: int
    extra_driver_allowance: int
    permit_charges: int
    hill_charges: int
    toll_charges: int
    total_amount: int
    # commission_amount: int
    Commission_percent: int
    vendor_commission_percent : int
    customer_amount : int
    driver_amount : int
    vendor_basic_commession_amount : int
    remark_trip_min_km : int
    days : int = 1



class OnewayQuoteResponse(BaseModel):
    fare: FareBreakdown
    echo: OnewayQuoteRequest


class OnewayConfirmResponse(BaseModel):
    order_id: int
    trip_status: str
    pick_near_city: List[str]
    trip_type : OrderType
    fare: FareBreakdown

class NewOrderResponse(BaseModel):
    order_id: int
    # Was `UUID` (required) - genuinely nullable in the DB (vendor-less
    # orders: Drop Bid, website-direct, driver-created bookings, all real
    # categories added/fixed this session). Found 2026-09-04 in a full
    # schema-vs-model audit, same bug class as CarDriverOut.secondary_number
    # earlier - every such order sits in NewOrder.trip_status=="PENDING"
    # right after creation (hardcoded in create_oneway_order) same as any
    # vendor-posted one, so GET /pending-all (this schema's only response_model
    # use) would 500 the WHOLE list the moment even one vendor-less order
    # is pending.
    vendor_id: Optional[UUID] = None
    trip_type: OrderType
    car_type: CarType
    pickup_drop_location: Dict[str, str]
    start_date_time: datetime
    customer_name: str
    # Was Annotated[str, Field(pattern=customer_phone_pattern, ...)] - same
    # copy-paste-from-input-validation bug as UnifiedOrder.customer_number
    # above, fixed together 2026-09-04 (real stored values are bare
    # 10-digit numbers, no "+" prefix, so this crashed every row).
    customer_number: str
    cost_per_km: int
    extra_cost_per_km: int
    driver_allowance: int
    extra_driver_allowance: int
    permit_charges: int
    extra_permit_charges: int
    hill_charges: int
    toll_charges: int
    pickup_notes: Optional[str]
    trip_status: str
    pick_near_city: List[str]
    trip_distance: int
    trip_time: str
    estimated_price: Optional[int] = None
    vendor_price: Optional[int] = None
    platform_fees_percent: int
    created_at: datetime

    class Config:
        from_attributes = True
