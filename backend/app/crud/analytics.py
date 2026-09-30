# crud/analytics.py
"""
Admin dashboard aggregates (Settings > Analytics). Read-only, computed on
demand - no caching, this codebase's data volume doesn't need it yet.
"""
from datetime import datetime, date
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.vehicle_owner_details import VehicleOwnerDetails
from app.models.orders import Order, Trip_status


def get_tier_distribution(db: Session) -> dict:
    """Computed in Python since `tier` is a derived property, not a column -
    fine at this data volume, and keeps the single source of truth in
    VehicleOwnerDetails.tier instead of duplicating the logic in SQL."""
    counts = {"PREFERRED_YEARLY": 0, "PREFERRED_MONTHLY": 0, "STANDARD": 0}
    for details in db.query(VehicleOwnerDetails).all():
        if details.tier == "PREFERRED":
            if details.subscription_type == "MONTHLY":
                counts["PREFERRED_MONTHLY"] += 1
            else:
                counts["PREFERRED_YEARLY"] += 1
        else:
            counts["STANDARD"] += 1
    counts["total"] = sum(v for k, v in counts.items() if k != "total")
    return counts


def _date_range_filter(query, column, date_from: Optional[str], date_to: Optional[str]):
    if date_from:
        query = query.filter(column >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.filter(column <= datetime.fromisoformat(date_to))
    return query


def get_commission_totals(db: Session, date_from: Optional[str] = None, date_to: Optional[str] = None) -> dict:
    query = db.query(
        func.coalesce(func.sum(Order.admin_profit), 0),
        func.coalesce(func.sum(Order.vendor_profit), 0),
        func.count(Order.id),
    ).filter(Order.trip_status == Trip_status.COMPLETED)
    query = _date_range_filter(query, Order.created_at, date_from, date_to)
    admin_total, vendor_total, trip_count = query.first()
    return {
        "admin_commission_total": int(admin_total or 0),
        "vendor_commission_total": int(vendor_total or 0),
        "completed_trip_count": int(trip_count or 0),
    }


def get_trip_type_split(db: Session, date_from: Optional[str] = None, date_to: Optional[str] = None) -> dict:
    query = db.query(Order.trip_type, func.count(Order.id)).filter(
        Order.trip_status == Trip_status.COMPLETED
    )
    query = _date_range_filter(query, Order.created_at, date_from, date_to)
    rows = query.group_by(Order.trip_type).all()

    local_count = 0
    outstation_count = 0
    by_type = {}
    for trip_type, count in rows:
        label = trip_type.value if trip_type else "UNKNOWN"
        by_type[label] = int(count)
        if label == "Local":
            local_count += int(count)
        else:
            outstation_count += int(count)

    return {
        "local_count": local_count,
        "outstation_count": outstation_count,
        "by_trip_type": by_type,
    }


def get_dashboard_summary(db: Session, date_from: Optional[str] = None, date_to: Optional[str] = None) -> dict:
    return {
        "tier_distribution": get_tier_distribution(db),
        "commission": get_commission_totals(db, date_from, date_to),
        "trip_split": get_trip_type_split(db, date_from, date_to),
    }
