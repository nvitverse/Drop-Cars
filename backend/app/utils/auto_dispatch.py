# app/utils/auto_dispatch.py
"""
Zero-Touch Smart Driver Matching & Auto-Dispatch Engine
Evaluates driver location, vehicle category, rating, and wallet balance to auto-match the Top 3 Drivers.
"""
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc
from typing import List, Dict, Any
from app.models.car_driver import CarDriver
from app.models.customer_booking_request import CustomerBookingRequest
from app.models.order_assignments import OrderAssignment


def find_top_drivers_for_trip(
    db: Session,
    pickup_address: str,
    vehicle_type: str = "Sedan",
    limit: int = 3
) -> List[Dict[str, Any]]:
    """
    Finds the top N matching drivers for a trip based on:
    1. Active driver status (approved/active)
    2. Vehicle category matching (Sedan/SUV/Innova)
    3. City / location keyword proximity
    4. Highest rating / wallet balance
    """
    query = db.query(CarDriver).filter(
        CarDriver.is_active == True,
        CarDriver.approval_status == "approved"
    )

    drivers = query.all()
    matched_drivers = []

    pickup_lower = (pickup_address or "").lower()

    for d in drivers:
        score = 10  # base score

        # Check vehicle category
        d_vtype = (d.vehicle_type or "").upper()
        target_vtype = (vehicle_type or "").upper()
        if target_vtype in d_vtype or d_vtype in target_vtype:
            score += 40

        # Check city location match
        d_city = (d.city or "").lower()
        if d_city and d_city in pickup_lower:
            score += 30

        # Wallet balance preference
        w_bal = float(d.wallet_balance or 0.0)
        if w_bal >= 200:
            score += 10

        matched_drivers.append({
            "driver_id": str(d.id),
            "driver_name": f"{d.first_name} {d.last_name}".strip() or "Driver",
            "phone": d.phone_number,
            "vehicle_number": d.vehicle_number or "N/A",
            "vehicle_type": d.vehicle_type or vehicle_type,
            "city": d.city or "Tamil Nadu",
            "wallet_balance": w_bal,
            "rating": float(d.rating or 4.8),
            "match_score": score
        })

    # Sort by match score descending
    matched_drivers.sort(key=lambda x: x["match_score"], reverse=True)
    return matched_drivers[:limit]
