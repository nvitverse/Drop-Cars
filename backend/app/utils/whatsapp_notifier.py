import os
import requests
import logging
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Meta WhatsApp Cloud API credentials. No placeholder defaults: when either
# is missing nothing is sent and the result says so (success=False). On
# Cloud Run (K_SERVICE is set) a missing config is logged as an ERROR at
# import so it shows up in the service logs instead of failing silently.
WHATSAPP_PHONE_NUMBER_ID = (os.getenv("WHATSAPP_PHONE_NUMBER_ID") or "").strip()
WHATSAPP_ACCESS_TOKEN = (os.getenv("WHATSAPP_ACCESS_TOKEN") or "").strip()
WHATSAPP_API_URL = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"


def whatsapp_configured() -> bool:
    return bool(WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN) and not (
        WHATSAPP_PHONE_NUMBER_ID.startswith("DEMO_") or WHATSAPP_ACCESS_TOKEN.startswith("DEMO_")
    )


def _mask(phone: str) -> str:
    return f"******{phone[-4:]}" if len(phone) >= 4 else "******"


if os.getenv("K_SERVICE") and not whatsapp_configured():
    logger.error(
        "WhatsApp is NOT configured in production: set WHATSAPP_PHONE_NUMBER_ID and "
        "WHATSAPP_ACCESS_TOKEN. Automated WhatsApp messages will not be sent."
    )


def send_whatsapp_message(
    recipient_phone: str,
    message_text: str,
    template_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Automated WhatsApp Messaging Engine (Meta Cloud API / Baileys Open Gateway):
    Sends automated WhatsApp notifications for:
    - Direct Trip Auto-Assignment Alerts to Drivers
    - Document Rejection / Expiry Alerts to Drivers
    - Tariff Quotes & Booking Confirmations to Customers
    """
    # Clean phone number e.g. +91 9876543210 -> 919876543210
    clean_phone = "".join(filter(str.isdigit, recipient_phone))
    if len(clean_phone) == 10:
        clean_phone = "91" + clean_phone # Add India country code by default

    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "text",
        "text": {"body": message_text}
    }

    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }

    if not whatsapp_configured():
        logger.warning(f"[WHATSAPP NOT CONFIGURED] Not sent to {_mask(clean_phone)}")
        return {
            "success": False,
            "simulated": True,
            "phone": clean_phone,
            "error": "WhatsApp is not configured (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN).",
        }

    try:
        response = requests.post(WHATSAPP_API_URL, json=payload, headers=headers, timeout=5)
        res_data = response.json()
        ok = 200 <= response.status_code < 300
        logger.info(f"[WHATSAPP SENT API] To: {_mask(clean_phone)} - Status: {response.status_code}")
        return {"success": ok, "phone": clean_phone, "api_response": res_data}
    except Exception as e:
        logger.error(f"[WHATSAPP ERROR] Failed to send to {_mask(clean_phone)}: {str(e)}")
        return {"success": False, "phone": clean_phone, "error": str(e)}


def send_driver_assignment_whatsapp(
    driver_phone: str,
    driver_name: str,
    pickup_city: str,
    drop_city: str,
    order_id: str,
    customer_name: Optional[str] = "Customer",
    customer_phone: Optional[str] = "N/A",
    estimated_fare: Optional[int] = 0
) -> Dict[str, Any]:
    """Automated WhatsApp message sent immediately upon direct auto-assignment."""
    text_body = (
        f"🚗 *DROP CARS: NEW TRIP AUTO-ASSIGNED!*\n\n"
        f"வணக்கம் {driver_name},\n"
        f"நீங்கள் பதிவு செய்த விருப்ப பாதையின் படி புதிய பயணம் நேரடியாக ஒதுக்கப்பட்டுள்ளது!\n\n"
        f"📌 *Order ID:* #{order_id}\n"
        f"📍 *Route:* {pickup_city} ➔ {drop_city}\n"
        f"👤 *Passenger:* {customer_name} ({customer_phone})\n"
        f"💰 *Estimated Fare:* ₹{estimated_fare:,}\n\n"
        f"பயண விவரங்களை பார்க்க உங்கள் Drop Cars Driver App-ஐ திறக்கவும்!"
    )
    return send_whatsapp_message(driver_phone, text_body)


def send_document_rejection_whatsapp(
    driver_phone: str,
    driver_name: str,
    document_name: str,
    reason: str
) -> Dict[str, Any]:
    """Automated WhatsApp message sent when a document is rejected or Xerox detected."""
    text_body = (
        f"⚠️ *DROP CARS: DOCUMENT NOTICE*\n\n"
        f"வணக்கம் {driver_name},\n"
        f"நீங்கள் பதிவேற்றிய *{document_name}* சரிபார்க்கப்பட்டு நிராகரிக்கப்பட்டது.\n\n"
        f"❌ *காரணம்:* {reason}\n\n"
        f"தயவுசெய்து தெளிவான அசல் வண்ண சான்றிதழை (Clear Original Color Photo) மீண்டும் பதிவேற்றவும்."
    )
    return send_whatsapp_message(driver_phone, text_body)
