from sqlalchemy.orm import Session
from uuid import UUID
from typing import Dict, Any

from app.models.hourly_rental import HourlyRental
from app.models.new_orders import OrderTypeEnum, CarTypeEnum
from app.crud.new_orders import is_urgent_pickup
import os


admin_commession_env = int(os.getenv("ADMIN_COMMESSION_ENV"))
vendor_commession_env = int(os.getenv("VENDOR_COMMESSION_ENV"))

def calculate_hourly_fare(
    package_hours: Dict[str, int],
    cost_per_hour: int,
    extra_cost_per_hour: int,
    cost_for_addon_km: int,
    extra_cost_for_addon_km: int,
) -> Dict[str, Any]:
    hours = int(package_hours.get("hours", 0))
    km_range = int(package_hours.get("km_range", 0))

    base_hours_amount = hours * int(cost_per_hour)
    vendor_hours_amount = hours * int(cost_per_hour + extra_cost_per_hour)

    # Base includes included km_range; addon_km priced separately if any. Quote phase assumes 0 addon_km.
    base_km_amount = 0
    vendor_km_amount = 0

    estimate_price = base_hours_amount + base_km_amount
    vendor_amount = vendor_hours_amount + vendor_km_amount

    return {
        "total_hours": float(hours),
        "vendor_amount": int(vendor_amount),
        "estimate_price": int(estimate_price),
    }


def create_hourly_order(
    db: Session,
    *,
    vendor_id: UUID,
    trip_type: OrderTypeEnum,
    car_type: CarTypeEnum,
    pickup_drop_location,
    start_date_time,
    customer_name: str,
    customer_number: str,
    package_hours: Dict[str, int],
    cost_per_hour: int,
    extra_cost_per_hour: int,
    cost_for_addon_km: int,
    extra_cost_for_addon_km: int,
    pickup_notes: str,
) -> HourlyRental:
    order = HourlyRental(
        vendor_id=vendor_id,
        trip_type=trip_type,
        car_type=car_type,
        pickup_drop_location=pickup_drop_location,
        start_date_time=start_date_time,
        customer_name=customer_name,
        customer_number=customer_number,
        package_hours=package_hours,
        cost_per_hour=cost_per_hour,
        extra_cost_per_hour=extra_cost_per_hour,
        cost_for_addon_km=cost_for_addon_km,
        extra_cost_for_addon_km=extra_cost_for_addon_km,
        pickup_notes=pickup_notes,
        is_urgent=is_urgent_pickup(start_date_time),
    )

    db.add(order)
    db.commit()
    db.refresh(order)
    return order


