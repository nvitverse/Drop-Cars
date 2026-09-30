import urllib.parse
from typing import Dict, Any, Optional


def build_whatsapp_business_slip_url(
    phone_number: str,
    booking_id: str,
    pickup_city: str,
    drop_city: str,
    pickup_date_time: str,
    otp_code: str,
    driver_name: str,
    driver_phone: str,
    vehicle_number: str,
    car_type: str,
    total_amount: float,
    advance_received: float,
    cash_to_collect: float,
    tracking_link: Optional[str] = None
) -> Dict[str, str]:
    """
    Constructs a pre-formatted WhatsApp Business deep link string containing trip details, OTP, and tracking URL.
    Uses native intent scheme `whatsapp://send?phone=...` and fallback `https://wa.me/...`.
    """
    clean_phone = phone_number.strip().replace("+", "").replace("-", "").replace(" ", "")
    if len(clean_phone) == 10:
        clean_phone = f"91{clean_phone}"

    message = (
        f"🚖 *DROP1 TAXI TRIP CONFIRMATION SLIP*\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"📌 *Booking ID:* #{booking_id}\n"
        f"📍 *Route:* {pickup_city} ➔ {drop_city}\n"
        f"📅 *Pickup Date/Time:* {pickup_date_time}\n"
        f"🔐 *START TRIP OTP:* *{otp_code}*\n\n"
        f"👨‍✈️ *DRIVER & VEHICLE DETAILS*\n"
        f"• *Driver:* {driver_name} ({driver_phone})\n"
        f"• *Vehicle:* {vehicle_number} ({car_type})\n\n"
        f"💰 *FARE BREAKDOWN*\n"
        f"• *Total Booking Amount:* ₹{total_amount:.2f}\n"
        f"• *Advance Received:* ₹{advance_received:.2f}\n"
        f"• *💵 CASH TO COLLECT FROM CUSTOMER:* *₹{cash_to_collect:.2f}*\n"
    )

    if tracking_link:
        message += f"\n🌐 *Live Trip Tracking Link:* {tracking_link}\n"

    message += f"\nThank you for choosing Drop1Taxi! Have a safe journey."

    encoded_text = urllib.parse.quote(message)

    native_url = f"whatsapp://send?phone={clean_phone}&text={encoded_text}"
    web_url = f"https://wa.me/{clean_phone}?text={encoded_text}"

    return {
        "phone": clean_phone,
        "raw_message": message,
        "native_whatsapp_url": native_url,
        "web_whatsapp_url": web_url
    }
