"""
Automated Document Expiry Sweeper & Reminder Service.
Checks driver licenses and vehicle RC/Insurance expiring within 15 days,
and triggers automatic app notifications and reminder records.
"""

from datetime import date, timedelta
from typing import List, Dict
from sqlalchemy.orm import Session
from app.models.driver import DriverDetails
from app.models.car import CarDetails

def check_expiring_documents(db: Session, days_ahead: int = 15) -> Dict[str, List[Dict]]:
    today = date.today()
    target_date = today + timedelta(days=days_ahead)
    
    expiring_drivers = []
    expiring_cars = []

    # Check driver licenses
    try:
        drivers = db.query(DriverDetails).filter(
            DriverDetails.licence_expiry_date >= today,
            DriverDetails.licence_expiry_date <= target_date
        ).all()
        for d in drivers:
            expiring_drivers.append({
                "driver_id": str(d.id),
                "full_name": d.full_name,
                "primary_number": d.primary_number,
                "licence_number": d.licence_number,
                "expiry_date": str(d.licence_expiry_date),
                "days_remaining": (d.licence_expiry_date - today).days if d.licence_expiry_date else 0
            })
    except Exception as e:
        print(f"Error querying driver licence expiries: {e}")

    # Check vehicle RC & Insurance
    try:
        cars = db.query(CarDetails).all()
        for c in cars:
            # Check insurance
            if c.insurance_expiry_date and today <= c.insurance_expiry_date <= target_date:
                expiring_cars.append({
                    "car_id": str(c.id),
                    "car_number": c.car_number,
                    "document_type": "Insurance",
                    "expiry_date": str(c.insurance_expiry_date),
                    "days_remaining": (c.insurance_expiry_date - today).days
                })
            # Permit (an RC has no expiry date; an FC only counts once the vehicle is old enough to need one)
            if c.permit_expiry_date and today <= c.permit_expiry_date <= target_date:
                expiring_cars.append({
                    "car_id": str(c.id),
                    "car_number": c.car_number,
                    "document_type": "Permit",
                    "expiry_date": str(c.permit_expiry_date),
                    "days_remaining": (c.permit_expiry_date - today).days
                })
            from app.crud.verification import fc_status_for_car
            if c.fc_expiry_date and today <= c.fc_expiry_date <= target_date and fc_status_for_car(c, today)["required"]:
                expiring_cars.append({
                    "car_id": str(c.id),
                    "car_number": c.car_number,
                    "document_type": "FC",
                    "expiry_date": str(c.fc_expiry_date),
                    "days_remaining": (c.fc_expiry_date - today).days
                })
    except Exception as e:
        print(f"Error querying car document expiries: {e}")

    return {
        "expiring_drivers": expiring_drivers,
        "expiring_cars": expiring_cars,
        "total_expiring": len(expiring_drivers) + len(expiring_cars)
    }
