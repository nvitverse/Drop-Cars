import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import extract, func

from app.models.orders import Order, Trip_status
from app.models.vendor import VendorCredentials as Vendor
from app.models.vendor_details import VendorDetails

logger = logging.getLogger(__name__)


def generate_vendor_monthly_statement(
    db: Session,
    vendor_id: str,
    year: int,
    month: int
) -> Dict[str, Any]:
    """
    Calculates monthly statement metrics for a Vendor:
    - Total completed trips
    - Gross booking value
    - 2% Admin Platform Commission
    - Net Earnings & Wallet Holds
    """
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    vendor_detail = db.query(VendorDetails).filter(VendorDetails.vendor_id == vendor_id).first()
    
    business_name = getattr(vendor_detail, "company_name", None) or getattr(vendor, "full_name", "Vendor")

    # Fetch completed orders for the specified month/year
    completed_orders = db.query(Order).filter(
        Order.vendor_id == vendor_id,
        Order.trip_status == Trip_status.COMPLETED,
        extract('year', Order.start_date_time) == year,
        extract('month', Order.start_date_time) == month
    ).all()

    total_trips = len(completed_orders)
    total_gross = 0.0
    total_commission_2pct = 0.0
    total_advance_received = 0.0
    total_cash_collected_by_drivers = 0.0

    trip_list = []
    for order in completed_orders:
        fare = float(getattr(order, "total_booking_amount", 0) or getattr(order, "driver_fare", 0) or 0)
        commission = round(fare * 0.02, 2)
        advance = float(getattr(order, "advance_received", 0) or 0)
        cash_collect = float(getattr(order, "cash_to_collect", 0) or 0)

        total_gross += fare
        total_commission_2pct += commission
        total_advance_received += advance
        total_cash_collected_by_drivers += cash_collect

        trip_list.append({
            "order_id": str(order.id),
            "booking_id": getattr(order, "booking_id", str(order.id)[:8]),
            "date": order.created_at.strftime("%Y-%m-%d") if order.created_at else "",
            "pickup_city": getattr(order, "pickup_city", ""),
            "drop_city": getattr(order, "drop_city", ""),
            "gross_fare": fare,
            "platform_fee_2pct": commission,
            "advance_received": advance,
            "cash_collected": cash_collect
        })

    net_settlement = round(total_gross - total_commission_2pct, 2)

    statement_data = {
        "vendor_id": vendor_id,
        "business_name": business_name,
        "period": f"{year}-{month:02d}",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_completed_trips": total_trips,
            "gross_booking_amount": total_gross,
            "platform_commission_2pct": total_commission_2pct,
            "total_advance_received": total_advance_received,
            "total_cash_collected": total_cash_collected_by_drivers,
            "net_vendor_settlement": net_settlement
        },
        "trips": trip_list
    }

    return statement_data
