# utils/website_status_webhook.py
"""
Pushes live booking-status updates back to the Drop Cars website (a separate
PHP/MySQL system) for bookings that originated there - see
app/api/routes/website_bookings.py for the other direction of this bridge.

The website only knows a booking by its own booking_id and stores the
backend's CustomerBookingRequest.id as `backend_request_id` on its local
`bookings` row (set in confirm_booking.php right after POSTing to
/api/website/bookings) - so that UUID is the join key we send back here,
not the website's own booking_id (the backend never sees that string).

Fire-and-forget by design: a website outage or slow response must never
block the accept/assign flow that triggered this. Every call site should
wrap this in try/except (or rely on the try/except already inside here).
"""
import os
from typing import Optional

import requests
from sqlalchemy.orm import Session

WEBSITE_STATUS_WEBHOOK_URL = os.getenv("WEBSITE_STATUS_WEBHOOK_URL", "https://dropcars.in/api/website-status-webhook.php")
WEBSITE_INTEGRATION_KEY = os.getenv("WEBSITE_INTEGRATION_KEY", "4d28b80aec79bd6902a904233059234ed22ac1d362d6cd5e7bdf43d00b8de85c")


def _find_website_booking_request(db: Session, order_id: int):
    from app.models.customer_booking_request import CustomerBookingRequest
    return (
        db.query(CustomerBookingRequest)
        .filter(
            CustomerBookingRequest.linked_order_id == order_id,
            CustomerBookingRequest.source == "WEBSITE",
        )
        .first()
    )


def notify_website_of_status(
    db: Session,
    order_id: int,
    status: str,
    driver_name: Optional[str] = None,
    driver_phone: Optional[str] = None,
    vehicle_number: Optional[str] = None,
    actual_distance: Optional[float] = None,
    starting_km: Optional[float] = None,
    closing_km: Optional[float] = None,
    toll_charges: Optional[float] = None,
    final_fare: Optional[float] = None,
) -> None:
    """status: "ACCEPTED" | "ASSIGNED" | "STARTED" | "COMPLETED" | "CANCELLED".
    No-ops silently if this order didn't originate from the website, or if
    the webhook isn't configured - never raises."""
    if not WEBSITE_STATUS_WEBHOOK_URL or not WEBSITE_INTEGRATION_KEY:
        return
    try:
        request = _find_website_booking_request(db, order_id)
        if not request:
            return  # not a website booking - nothing to notify

        payload = {
            "backend_request_id": str(request.id),
            "status": status,
            "driver_name": driver_name,
            "driver_phone": driver_phone,
            "vehicle_number": vehicle_number,
        }
        if actual_distance is not None:
            payload["actual_distance"] = float(actual_distance)
        if starting_km is not None:
            payload["starting_km"] = float(starting_km)
        if closing_km is not None:
            payload["closing_km"] = float(closing_km)
        if toll_charges is not None:
            payload["toll_charges"] = float(toll_charges)
        if final_fare is not None:
            payload["final_fare"] = float(final_fare)

        requests.post(
            WEBSITE_STATUS_WEBHOOK_URL,
            json=payload,
            headers={"X-DropCars-Website-Key": WEBSITE_INTEGRATION_KEY},
            timeout=8,
        )
    except Exception as e:
        print(f"notify_website_of_status failed for order {order_id} (booking flow continues): {e}")


def notify_customer_accepted_email(db: Session, order_id: int) -> None:
    """"Someone accepted your booking" - sent once, right when a vendor
    accepts (before a specific driver/car is assigned)."""
    try:
        request = _find_website_booking_request(db, order_id)
        if not request or not request.customer_email:
            return
        from app.utils.emailer import send_email, smtp_configured
        if not smtp_configured(db):
            return
        subject = f"Booking {request.id} - A driver partner has accepted your trip"
        body = (
            f"Hi {request.customer_name},\n\n"
            "Good news - a driver partner has accepted your Drop Cars booking and is now "
            "assigning a driver and vehicle for your trip. You'll get another email with "
            "the driver's name, phone number and vehicle details as soon as that's done.\n\n"
            "No action needed from you right now - just sit tight.\n\n"
            "Thanks for booking with Drop Cars."
        )
        send_email(db, request.customer_email, subject, body)
    except Exception as e:
        print(f"notify_customer_accepted_email failed for order {order_id} (booking flow continues): {e}")


def notify_customer_driver_assigned_email(
    db: Session, order_id: int, driver_name: str, driver_phone: str, vehicle_number: str,
    start_otp: Optional[str] = None, end_otp: Optional[str] = None,
) -> None:
    """Driver + car assigned - share the details the customer actually needs,
    plus the two trip-integrity OTPs the driver will need to start/close the
    trip (proves it's really this driver with this customer, both ways)."""
    try:
        request = _find_website_booking_request(db, order_id)
        if not request or not request.customer_email:
            return
        from app.utils.emailer import send_email, smtp_configured
        if not smtp_configured(db):
            return
        subject = f"Booking {request.id} - Your driver is confirmed"
        otp_lines = ""
        if start_otp or end_otp:
            otp_lines = (
                "\nTrip codes - share these with your driver ONLY when the trip actually starts/ends:\n"
                f"Trip Start Code: {start_otp or 'N/A'}\n"
                f"Trip End Code: {end_otp or 'N/A'}\n"
            )
        body = (
            f"Hi {request.customer_name},\n\n"
            "Your driver and vehicle are confirmed for your Drop Cars trip:\n\n"
            f"Driver Name: {driver_name or 'Assigned'}\n"
            f"Driver Phone: {driver_phone or 'Will be shared shortly'}\n"
            f"Vehicle Number: {vehicle_number or 'Will be shared shortly'}\n"
            f"{otp_lines}\n"
            "Have a safe trip!\n\n"
            "- Drop Cars Team"
        )
        send_email(db, request.customer_email, subject, body)
    except Exception as e:
        print(f"notify_customer_driver_assigned_email failed for order {order_id} (booking flow continues): {e}")
