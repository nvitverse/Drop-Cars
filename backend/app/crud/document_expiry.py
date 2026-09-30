# crud/document_expiry.py
"""Daily document-expiry reminder sweep (RC / Insurance / Driving Licence).

Owners enter expiry dates via the Admin App (car_details.rc_expiry_date /
insurance_expiry_date, car_driver.licence_expiry_date - all optional, so
existing records without a date are simply skipped). Called once a day from
app/main.py's sweep pattern, same shape as the billing sweep.
"""
from datetime import date, timedelta
from sqlalchemy.orm import Session

from app.models.car_details import CarDetails
from app.models.car_driver import CarDriver

REMINDER_WINDOW_DAYS = 15  # start warning this many days before expiry
REPEAT_EVERY_DAYS = 5      # re-send the reminder every N days while still due


def _should_remind(expiry: date, today: date) -> bool:
    days_left = (expiry - today).days
    if days_left < 0:
        return True  # already expired - keep reminding daily
    if days_left > REMINDER_WINDOW_DAYS:
        return False
    # Inside the window: only nag every REPEAT_EVERY_DAYS to avoid spamming
    # the owner with an identical email every single day.
    return days_left % REPEAT_EVERY_DAYS == 0


def send_expiry_reminders(db: Session) -> dict:
    from app.utils.trip_emails import send_document_expiry_email

    today = date.today()
    sent = {"rc": 0, "insurance": 0, "licence": 0}

    cars = db.query(CarDetails).filter(
        (CarDetails.rc_expiry_date.isnot(None)) | (CarDetails.insurance_expiry_date.isnot(None))
    ).all()
    for car in cars:
        if car.rc_expiry_date and _should_remind(car.rc_expiry_date, today):
            try:
                send_document_expiry_email(db, car.vehicle_owner_id, "RC", car.car_name, car.rc_expiry_date)
                sent["rc"] += 1
            except Exception as e:
                print(f"RC expiry reminder failed for car {car.id} (continuing): {e}")
        if car.insurance_expiry_date and _should_remind(car.insurance_expiry_date, today):
            try:
                send_document_expiry_email(db, car.vehicle_owner_id, "Insurance", car.car_name, car.insurance_expiry_date)
                sent["insurance"] += 1
            except Exception as e:
                print(f"Insurance expiry reminder failed for car {car.id} (continuing): {e}")

    drivers = db.query(CarDriver).filter(CarDriver.licence_expiry_date.isnot(None)).all()
    for driver in drivers:
        if driver.licence_expiry_date and _should_remind(driver.licence_expiry_date, today):
            try:
                send_document_expiry_email(db, driver.vehicle_owner_id, "Driving Licence", driver.full_name, driver.licence_expiry_date)
                sent["licence"] += 1
            except Exception as e:
                print(f"Licence expiry reminder failed for driver {driver.id} (continuing): {e}")

    return sent


def expiry_fields(expiry) -> dict:
    """{'expiry_date': 'YYYY-MM-DD', 'days_left': n} for the document-status responses (None when no date is known)."""
    if not expiry:
        return {"expiry_date": None, "days_left": None}
    try:
        return {"expiry_date": expiry.isoformat(), "days_left": (expiry - date.today()).days}
    except Exception:
        return {"expiry_date": None, "days_left": None}


def parse_expiry(value):
    """Form value 'YYYY-MM-DD' -> date (None when empty/invalid)."""
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None
