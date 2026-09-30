from typing import Optional, Union, List
from pydantic import BaseModel, UUID4
from datetime import datetime
from enum import Enum


# --------------------
# ENUMS (match SQLAlchemy)
# --------------------
class OrderSourceEnum(str, Enum):
    NEW_ORDERS = "NEW_ORDERS"
    HOURLY_RENTAL = "HOURLY_RENTAL"

class OrderTypeEnum(str, Enum):
    ONEWAY = "Oneway"
    ROUND_TRIP = "Round Trip"
    HOURLY_RENTAL = "Hourly Rental"
    MULTY_CITY = "Multy City"
    LOCAL = "Local"

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


# --------------------
# Source Tables: NewOrder & HourlyRental
# --------------------
class NewOrderDetailsSchema(BaseModel):
    order_id: int
    cost_per_km: int
    extra_cost_per_km: int
    driver_allowance: int
    extra_driver_allowance: int
    permit_charges: int
    extra_permit_charges: int
    hill_charges: int
    toll_charges: int
    pickup_notes: Optional[str]

    class Config:
        orm_mode = True


class HourlyRentalDetailsSchema(BaseModel):
    id: int
    package_hours: int
    cost_per_pack: int
    extra_cost_per_pack: int
    additional_cost_per_hour: int
    extra_additional_cost_per_hour: int
    pickup_notes: Optional[str]

    class Config:
        orm_mode = True


# --------------------
# Base Order Schema
# --------------------
class BaseOrderSchema(BaseModel):
    id: int
    # source: OrderSourceEnum
    # source_order_id: int
    # vendor_id: UUID4
    trip_type: OrderTypeEnum
    car_type: CarTypeEnum
    pickup_drop_location: dict
    start_date_time: datetime
    customer_name: str
    customer_number: str
    trip_status: Optional[str]
    pick_near_city: Optional[List[str]]
    trip_distance: Optional[int]
    trip_time: Optional[str]
    estimated_price: Optional[int]
    vendor_price: Optional[int]
    max_time : Optional[int]
    platform_fees_percent: Optional[int]
    closed_vendor_price: Optional[int]
    closed_driver_price: Optional[int]
    commision_amount: Optional[int]
    created_at: datetime
    cancelled_by : Optional[str] = None
    cost_per_km: Optional[int]
    h_cost_for_addon_km : Optional[int] = None
    h_extra_cost_for_addon_km : Optional[int] = None
    venodr_profit: Optional[int]
    admin_profit: Optional[int]
    night_charges: Optional[int]
    vendor_earns_estimation: Optional[int]

    class Config:
        orm_mode = True


# --------------------
# Combined Response Schema
# --------------------
class CombinedOrderSchema(BaseOrderSchema):
    source_data: Optional[Union[NewOrderDetailsSchema, HourlyRentalDetailsSchema]]
