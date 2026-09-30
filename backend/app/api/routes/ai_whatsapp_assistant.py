import os
import re
import logging
from fastapi import APIRouter, Depends, HTTPException, Body, Request
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional

from app.database.session import get_db
from app.models.ai_automation_log import AIAutomationLog

logger = logging.getLogger(__name__)
from app.core.security import get_current_admin, get_current_user_flexible, get_current_driver
router = APIRouter(tags=["AI WhatsApp & Voice Assistant"])

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Comprehensive Distance Matrix (in KM) for major Tamil Nadu & South India routes
DISTANCE_DB = {
    # Chennai routes
    ("chennai", "madurai"): 460,
    ("chennai", "coimbatore"): 505,
    ("chennai", "trichy"): 330,
    ("chennai", "salem"): 345,
    ("chennai", "pondicherry"): 150,
    ("chennai", "bangalore"): 345,
    ("chennai", "bengaluru"): 345,
    ("chennai", "vellore"): 140,
    ("chennai", "tirunelveli"): 625,
    ("chennai", "kanyakumari"): 705,
    ("chennai", "thanjavur"): 350,
    ("chennai", "dindigul"): 430,
    ("chennai", "erode"): 400,
    ("chennai", "hosur"): 305,
    ("chennai", "tiruppur"): 460,
    ("chennai", "kumbakonam"): 290,
    ("chennai", "ooty"): 555,
    ("chennai", "kodaikanal"): 525,
    ("chennai", "tirupati"): 135,
    ("chennai", "rameswaram"): 560,
    ("chennai", "cuddalore"): 185,
    ("chennai", "villupuram"): 160,
    ("chennai", "nagercoil"): 685,
    ("chennai", "tuticorin"): 600,
    ("chennai", "karur"): 390,
    ("chennai", "mysore"): 480,
    # Coimbatore routes
    ("coimbatore", "bangalore"): 365,
    ("coimbatore", "bengaluru"): 365,
    ("coimbatore", "madurai"): 215,
    ("coimbatore", "trichy"): 215,
    ("coimbatore", "salem"): 165,
    ("coimbatore", "ooty"): 85,
    ("coimbatore", "kodaikanal"): 175,
    ("coimbatore", "tirunelveli"): 360,
    ("coimbatore", "munnar"): 160,
    ("coimbatore", "pollachi"): 45,
    ("coimbatore", "palani"): 105,
    ("coimbatore", "mysore"): 195,
    ("coimbatore", "kochi"): 190,
    ("coimbatore", "tiruppur"): 55,
    ("coimbatore", "erode"): 100,
    # Madurai routes
    ("madurai", "bangalore"): 435,
    ("madurai", "bengaluru"): 435,
    ("madurai", "trichy"): 135,
    ("madurai", "tirunelveli"): 160,
    ("madurai", "kanyakumari"): 245,
    ("madurai", "kodaikanal"): 120,
    ("madurai", "rameswaram"): 170,
    ("madurai", "salem"): 235,
    ("madurai", "theni"): 75,
    ("madurai", "munnar"): 155,
    ("madurai", "tuticorin"): 150,
    ("madurai", "nagercoil"): 235,
    ("madurai", "thanjavur"): 190,
    # Trichy routes
    ("trichy", "bangalore"): 345,
    ("trichy", "bengaluru"): 345,
    ("trichy", "salem"): 140,
    ("trichy", "thanjavur"): 55,
    ("trichy", "kumbakonam"): 90,
    ("trichy", "tirunelveli"): 290,
    ("trichy", "pondicherry"): 200,
    ("trichy", "dindigul"): 100,
    ("trichy", "karur"): 80,
    # Salem routes
    ("salem", "bangalore"): 205,
    ("salem", "bengaluru"): 205,
    ("salem", "hosur"): 165,
    ("salem", "vellore"): 215,
    ("salem", "dharmapuri"): 65,
    ("salem", "krishnagiri"): 115,
    ("salem", "namakkal"): 55,
    ("salem", "erode"): 65,
    # Bangalore routes
    ("bangalore", "mysore"): 145,
    ("bangalore", "ooty"): 275,
    ("bangalore", "tirupati"): 250,
    ("bangalore", "pondicherry"): 310,
}

PER_KM_RATES = {
    "hatchback": 13,
    "sedan": 14,
    "suv": 19,
    "innova": 21,
    "crysta": 23,
    "tempo": 28,
}

DRIVER_BETA_MAP = {
    "hatchback": 400,
    "sedan": 400,
    "suv": 500,
    "innova": 600,
    "crysta": 600,
    "tempo": 800,
}

def get_distance(city1: str, city2: str) -> int:
    c1, c2 = city1.lower().strip(), city2.lower().strip()
    if (c1, c2) in DISTANCE_DB:
        return DISTANCE_DB[(c1, c2)]
    if (c2, c1) in DISTANCE_DB:
        return DISTANCE_DB[(c2, c1)]
    return 320  # Average outstation default fallback

@router.post("/ai/chat-assistant", dependencies=[Depends(get_current_user_flexible)])
async def chat_assistant_query(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    State-of-the-Art Drop Cars AI Assistant (Tamil & English) with Deep Knowledge:
    - Route Tariff & Distance Calculations
    - Start Trip OTP / End OTP Rules
    - Toll, Fastag & Parking Policies
    - Delay & Waiting Time Calculation
    - Cancellation & ₹500 Penalty Guidelines
    - Wallet Security Hold & Instant Release Rules
    - Direct Smart Suggestions
    """
    user_message = payload.get("message", "").strip()
    language = payload.get("language", "ta").lower()
    is_tamil = "ta" in language or any(w in user_message.lower() for w in ["vanakkam", "evlo", "enna", "rate", "panrathu", "kaasu", "chennai", "madurai", "kattanam"])

    if not user_message:
        raise HTTPException(status_code=400, detail="Message string is required")

    lower_msg = user_message.lower()

    # Category 1: START / END OTP
    if any(k in lower_msg for k in ["otp", "start code", "end code", "start trip", "end trip", "start otp"]):
        if is_tamil:
            reply = (
                "🔑 **Start Trip OTP & End Trip OTP வழிகாட்டுதல்**:\n\n"
                "1. **Start Trip OTP**: வாடிக்கையாளர் ஆப்பில் மற்றும் SMS-ல் 4-இலக்க OTP காட்டப்படும். "
                "பிக்கப் லொகேஷனில் வாடிக்கையாளரை சந்தித்ததும் இந்த OTP-ஐ பெற்று ஆப்பில் பதிவு செய்த பிறகே சவாரியை துவங்க வேண்டும்.\n"
                "2. **End Trip OTP**: சவாரி முடிவில் இறுதிக் கட்டணம் மற்றும் சுங்கக் கட்டணம் (Toll) சரிபார்த்து "
                "End Trip OTP பெற்று சவாரியை முடிக்க வேண்டும்.\n"
                "3. **OTP வரவில்லை என்றால்**: வாடிக்கையாளர் பதிவு செய்த மொபைல் எண்ணை சரிபார்க்க சொல்லவும், அல்லது 'Resend OTP' கொடுக்கலாம்."
            )
        else:
            reply = (
                "🔑 **Start Trip & End Trip OTP Guidelines**:\n\n"
                "1. **Start Trip OTP**: The passenger will receive a 4-digit OTP on their app and SMS. "
                "Collect this code upon meeting the customer at pickup before tapping 'Start Ride'.\n"
                "2. **End Trip OTP**: At the destination, verify toll receipts & extra km, then verify the End OTP to close the ride.\n"
                "3. **If OTP not received**: Ask passenger to check SMS or tap 'Resend OTP'."
            )
        category = "OTP"
        suggestions = ["📍 Reached pickup point", "💰 View Tariff breakdown", "🎧 Connect to Dispatch"]

    # Category 2: TOLL, FASTAG & PARKING
    elif any(k in lower_msg for k in ["toll", "fastag", "parking", "permit", "sunga", "sungam"]):
        if is_tamil:
            reply = (
                "🅿️ **Fastag சுங்கக் கட்டணம் & பார்க்கிங் விதிமுறைகள்**:\n\n"
                "• **Fastag Toll**: சுங்கச் சாவடி கட்டணங்கள் அனைத்தும் அசல் ரசீது/Fastag கணக்குப்படி வாடிக்கையாளரே செலுத்த வேண்டும்.\n"
                "• **Parking**: ஏர்போர்ட் அல்லது ரயில்வே ஸ்டேஷன் பார்க்கிங் கட்டணம் வாடிக்கையாளர் பொறுப்பு.\n"
                "• **Inter-State Permit**: பிற மாநிலங்களுக்கு செல்லும் போது (எ.கா: தமிழ்நாடு ➔ கர்நாடகா/கேரளா) அனுமதிச் சீட்டு கட்டணம் வாடிக்கையாளரிடம் பில்லில் வசூலிக்கப்படும்.\n"
                "• **குறிப்பு**: சவாரி முடிவில் அசல் கட்டணத்தை ஆப்பில் உள்ளீடு செய்தால் வாடிக்கையாளர் இன்வாய்ஸில் தானாகவே சேர்க்கப்படும்."
            )
        else:
            reply = (
                "🅿️ **Fastag Toll & Parking Collection Rules**:\n\n"
                "• **Tolls**: All Fastag toll charges are payable by the customer as per actual receipts.\n"
                "• **Parking**: Airport and railway station parking charges are payable by the customer.\n"
                "• **Inter-State Permit**: Road taxes / state permits (e.g. TN ➔ KA/KL) are added directly to the passenger's invoice.\n"
                "• Enter actual toll amount during trip close to include it on the final bill."
            )
        category = "TOLL_PARKING"
        suggestions = ["💰 View Tariff Rates", "🔑 How to get Start OTP?", "🎧 Contact Dispatch Desk"]

    # Category 3: WAITING TIME & PASSENGER DELAY
    elif any(k in lower_msg for k in ["wait", "waiting", "delay", "not picking", "late", "reach", "unreachable", "thamadham"]):
        if is_tamil:
            reply = (
                "⏳ **வாடிக்கையாளர் தாமதம் & காத்திருப்பு கட்டணக் கொள்கை**:\n\n"
                "• **இலவச காத்திருப்பு நேரம்**: திட்டமிட்ட நேரத்திலிருந்து முதல் 15 நிமிடங்கள் முற்றிலும் இலவசம்.\n"
                "• **காத்திருப்பு கட்டணம்**: 15 நிமிடங்களுக்குப் பிறகு:\n"
                "  - Sedan: நிமிடத்திற்கு ₹2 (மணிக்கு ₹120)\n"
                "  - SUV / Innova: நிமிடத்திற்கு ₹2.5 (மணிக்கு ₹150)\n"
                "• **போன் எடுக்கவில்லை என்றால்**: In-App Chat-ல் 'பிக்கப் வந்துவிட்டேன்' என்று மெசேஜ் அனுப்பவும். "
                "15 நிமிடங்களுக்குப் பிறகும் வரவில்லை என்றால் 'Report Delay' பதிவு செய்யவும்."
            )
        else:
            reply = (
                "⏳ **Passenger Delay & Waiting Time Policy**:\n\n"
                "• **Free Waiting Window**: The first 15 minutes from scheduled pickup time is completely free.\n"
                "• **Waiting Charges** (after 15 mins):\n"
                "  - Sedan: ₹2/min (₹120/hr)\n"
                "  - SUV / Innova: ₹2.5/min (₹150/hr)\n"
                "• **If Unreachable**: Send a message via In-App Chat ('Reached pickup'). "
                "If no response after 15 mins, log via Report Issue to document waiting charges."
            )
        category = "WAITING_TIME"
        suggestions = ["📍 Reached pickup point", "⚠️ Report Delay to Dispatch", "📞 Call Masked Proxy"]

    # Category 4: CANCELLATION & ₹500 PENALTY
    elif any(k in lower_msg for k in ["cancel", "penalty", "500", "fine", "charge", "decline", "abaraatham"]):
        if is_tamil:
            reply = (
                "⚠️ **ரத்து விதிமுறைகள் & ₹500 அபராதம் பற்றிய விளக்கம்**:\n\n"
                "1. **10-வினாடி கவுண்டவுன் (Decline)**: புதிய சவாரி அல்லது Route Request-ல் சவாரி கிடைக்கும் போது, "
                "10 வினாடிக்குள் Decline செய்தால் **₹0 அபராதம்** (முற்றிலும் இலவசம்).\n"
                "2. **சவாரி உறுதியான பின் ரத்து (Post-Assignment)**: சவாரி உறுதியாகி டிரைவர்/கார் Assign ஆன பிறகு "
                "பார்ட்னர் தரப்பில் ரத்து செய்தால் **₹500 அபராதம்** வாலட்டில் பிடித்தம் செய்யப்படும்.\n"
                "3. **வாடிக்கையாளர் ரத்து செய்தால்**: பிக்கப் பாயிண்டிற்கு வண்டி சென்ற பிறகு வாடிக்கையாளர் ரத்து செய்தால், "
                "வாடிக்கையாளரிடமிருந்து வசூலிக்கப்படும் கட்டணம் உங்கள் வாலட்டில் வரவு வைக்கப்படும்."
            )
        else:
            reply = (
                "⚠️ **Cancellation Rules & ₹500 Penalty Policy**:\n\n"
                "1. **10-Second HUD Countdown**: Declining an incoming ride during the 10-second alert window is **100% FREE (₹0 penalty)**.\n"
                "2. **Cancellation After Assignment**: Once a ride is accepted and locked/assigned to a driver and car, partner cancellation incurs a **₹500 operational penalty** deducted from wallet.\n"
                "3. **Customer Cancellation**: If the passenger cancels after you arrive at the pickup spot, the customer cancellation fee is credited directly to your wallet."
            )
        category = "CANCELLATION_PENALTY"
        suggestions = ["💳 Check Wallet Balance", "⚡ Route Request Rules", "🎧 Contact Dispatch Desk"]

    # Category 5: WALLET, SECURITY HOLD & PAYOUT
    elif any(k in lower_msg for k in ["wallet", "hold", "security", "balance", "payout", "vaalat", "panam"]):
        if is_tamil:
            reply = (
                "💳 **வாலட் செக்யூரிட்டி ஹோல்டு & கட்டணப் பட்டுவாடா**:\n\n"
                "• **செக்யூரிட்டி ஹோல்டு (₹500)**: ஒவ்வொரு சவாரியை ஏற்கும் போதும் வாலட்டில் குறைந்தபட்சம் ₹500 பாதுகாப்பு வைப்புத்தொகையாக "
                "தற்காலிகமாக ஹோல்டு செய்யப்படும்.\n"
                "• **உடனடி விடுவிப்பு (Instant Release)**: சவாரி வெற்றிகரமாக முடிந்து OTP வெரிஃபை ஆன அடுத்த நொடியே ₹500 உங்கள் Available Balance-க்கு திரும்ப வந்துவிடும்.\n"
                "• **வாராந்திர வரவு (Weekly Payout)**: உங்கள் நிகர வருமானம் மற்றும் கமிஷன் தொகை பதிவு செய்த வங்கி கணக்கிற்கு நேரடியாக அனுப்பப்படும்.\n"
                "• குறைந்தபட்சம் ₹1,000 வாலட் பேலன்ஸ் வைத்திருப்பது தொடர்ச்சியாக புதிய சவாரிகளை ஏற்க உதவும்."
            )
        else:
            reply = (
                "💳 **Wallet Security Hold & Payout Overview**:\n\n"
                "• **Security Hold (₹500)**: A refundable ₹500 security hold is temporarily reserved per active booking to guarantee dispatch reliability.\n"
                "• **Instant Release**: The ₹500 hold is instantly released back to your available balance the moment the ride is completed via OTP.\n"
                "• **Bank Settlement**: Earnings and partner payouts are automatically disbursed directly to your verified bank account.\n"
                "• Maintaining at least ₹1,000 wallet balance ensures uninterrupted booking acceptance."
            )
        category = "WALLET_HOLD"
        suggestions = ["➕ Recharge Wallet Now", "🔒 View Active Holds", "🎧 Dispatch Support"]

    # Category 6: ROUND TRIP & OUTSTATION RULES
    elif any(k in lower_msg for k in ["round trip", "roundtrip", "twoway", "two way", "return", "night halt", "thirumba"]):
        if is_tamil:
            reply = (
                "🔄 **ரவுண்ட் ட்ரிப் & இரவு நேர தங்குதல் விதிமுறைகள்**:\n\n"
                "• **குறைந்தபட்ச தூரம்**: ரவுண்ட் ட்ரிப் சவாரிகளுக்கு ஒரு நாளைக்கு குறைந்தபட்சம் 250 கி.மீ கணக்கிடப்படும்.\n"
                "• **டிரைவர் பேட்டா (Driver Bata)**: ஒரு நாளைக்கு ₹400 முதல் ₹600 வரை வாகன வகையை பொறுத்து வழங்கப்படும்.\n"
                "• **இரவு நேர தங்குதல் கட்டணம் (Night Halt)**: இரவு 10:00 மணி முதல் காலை 6:00 மணி வரை வாடிக்கையாளர் காரணமாக வாகனம் தங்கும் போது ₹300 - ₹500 கூடுதலாக வழங்கப்படும்.\n"
                "• திரும்பும் போதும் சுங்கக் கட்டணம் (Return Toll) அசல் ரசீதுப்படி வாடிக்கையாளரால் செலுத்தப்பட வேண்டும்."
            )
        else:
            reply = (
                "🔄 **Round Trip & Outstation Guidelines**:\n\n"
                "• **Minimum Kilometers**: Round trips are subject to a standard minimum of 250 KM per calendar day.\n"
                "• **Driver Beta Allowance**: ₹400 to ₹600 per day depending on vehicle segment.\n"
                "• **Night Halt Charges**: Between 10:00 PM and 6:00 AM, if an overnight stay is required, a night halt charge of ₹300 to ₹500 applies.\n"
                "• **Tolls**: Return tolls and state entrance taxes are payable by customer on actuals."
            )
        category = "ROUND_TRIP"
        suggestions = ["💰 Estimate Round Trip Fare", "🅿️ Toll Collection Rules", "🎧 Contact Dispatch Desk"]

    # Category 7: LUGGAGE & BOOT SPACE POLICY
    elif any(k in lower_msg for k in ["luggage", "baggage", "boot", "bags", "suitcases", "load", "samangal"]):
        if is_tamil:
            reply = (
                "🧳 **லக்கேஜ் & பூட் ஸ்பேஸ் வழிகாட்டுதல்**:\n\n"
                "• **Hatchback**: 2 நடுத்தர சூட்கேஸ்கள் + 1 கைப்பை (Boot: ~200L).\n"
                "• **Sedan (Etios / Dzire)**: 3 பெரிய சூட்கேஸ்கள் + 2 கைபைகள் (Boot: ~400L+).\n"
                "• **SUV / Innova**: 4-5 பெரிய சூட்கேஸ்கள்; 3வது வரிசை இருக்கை மடித்தால் அதிக இடம் கிடைக்கும்.\n"
                "• **ரூஃப் கேரியர் (Roof Carrier)**: வணிக ரீதியான கேரியர் பொருத்தப்பட்ட வண்டிகளில் கூடுதல் பைகள் பாதுகாப்பாக கட்டப்படும்.\n"
                "• அளவுக்கு அதிகமான லக்கேஜ் இருப்பின் SUV அல்லது Innova வாகனத்தை தேர்ந்தெடுக்க அறிவுறுத்தப்படுகிறது."
            )
        else:
            reply = (
                "🧳 **Luggage & Boot Capacity Guidelines**:\n\n"
                "• **Hatchback (Swift/WagonR)**: 2 medium suitcases + 1 handbag (~200L boot).\n"
                "• **Sedan (Dzire/Etios)**: 3 large suitcases + 2 duffel bags (~400L+ boot).\n"
                "• **SUV / Innova**: 4-5 large suitcases (fold 3rd row for extra cargo).\n"
                "• **Roof Carriers**: If commercially fitted, extra bags can be securely strapped on top.\n"
                "• Excess luggage exceeding car capacity requires upgrading to an SUV or Innova."
            )
        category = "LUGGAGE"
        suggestions = ["🚗 Check Sedan Rates", "🚙 Check SUV Rates", "🎧 Talk to Dispatch Desk"]

    # Category 8: PET TRAVEL POLICY
    elif any(k in lower_msg for k in ["pet", "dog", "cat", "animal", "naai", "poonai"]):
        if is_tamil:
            reply = (
                "🐾 **செல்லப்பிராணிகள் பயண வழிகாட்டுதல் (Pet Policy)**:\n\n"
                "• செல்லப்பிராணிகள் முன்னறிவிப்புடன் மட்டுமே பயணிக்க அனுமதிக்கப்படும்.\n"
                "• வாடிக்கையாளர் பிரத்யேக துணி அல்லது பெட் சீட் கவரிங் (Pet Bedding Sheet) கொண்டு வர வேண்டும்.\n"
                "• காரின் இருக்கைகள் மற்றும் உட்புற சுகாதாரம் பாதிக்கப்படாமல் பார்த்துக் கொள்ள வேண்டும்.\n"
                "• வாடிக்கையாளரிடம் செல்லப்பிராணி தூய்மைப் பராமரிப்புக்காக (Pet Hygiene Fee) ₹300 வரை கட்டணம் பெறப்படலாம்."
            )
        else:
            reply = (
                "🐾 **Pet Travel Policy**:\n\n"
                "• Pets are permitted strictly with prior notification during booking.\n"
                "• Passengers must provide a pet bed or sheet to protect vehicle seats and upholstery.\n"
                "• A nominal ₹300 pet hygiene / interior sanitization charge applies.\n"
                "• Drivers may request pet safety cages for aggressive or untamed pets."
            )
        category = "PET_POLICY"
        suggestions = ["🚗 Outstation Guidelines", "💬 Message in App", "🎧 Help Desk"]

    # Category 9: HILL STATION & GHAT ROAD AC RULES
    elif any(k in lower_msg for k in ["hill", "ghat", "ooty", "kodaikanal", "munnar", "yercaud", "hairpin", "malai"]):
        if is_tamil:
            reply = (
                "⛰️ **மலைப்பாதை & ஹில் ஸ்டேஷன் AC விதிமுறைகள்**:\n\n"
                "• **AC பயன்பாடு**: ஊட்டி, கொடைக்கானல், மூணார், ஏற்காடு போன்ற மலைப்பாதைகளில் (Ghat Roads & Hairpin Bends) "
                "எஞ்சின் பாதுகாப்பு மற்றும் போதுமான இழுப்புத்திறன் (Pickup/Torque) கருதி AC தற்காலிகமாக அணைக்கப்படும்.\n"
                "• சமவெளிப் பகுதிகளில் (Plains) AC முழுமையாக இயங்கும்.\n"
                "• **மலைப்பாதை கட்டணம்**: ஹில் டிரைவிங் மற்றும் ஃபாரஸ்ட்/டோல் அனுமதிக் கட்டணங்கள் வாடிக்கையாளர் ரசீதுப்படி செலுத்த வேண்டும்."
            )
        else:
            reply = (
                "⛰️ **Hill Station & Ghat Road AC Guidelines**:\n\n"
                "• **AC on Ghat Roads**: On steep climbs, ghat roads, and hairpin bends (Ooty, Kodaikanal, Munnar, Yercaud), "
                "AC is temporarily turned off to ensure engine pulling power and mountain road safety.\n"
                "• AC will function normally on plains and flat stretches.\n"
                "• Any hill entry toll or eco-tourism permits are payable directly by passenger."
            )
        category = "HILL_STATION"
        suggestions = ["💰 Ooty / Kodaikanal Tariff", "🅿️ Hill Permit Rules", "🎧 Contact Dispatch Desk"]

    # Category 10: EMERGENCY, ACCIDENT & SOS
    elif any(k in lower_msg for k in ["sos", "emergency", "accident", "breakdown", "police", "ambulance", "puncture"]):
        if is_tamil:
            reply = (
                "🚨 **அவசர உதவி & பிரேக்டவுன் (SOS Support)**:\n\n"
                "1. **வாகன பிரேக்டவுன்**: கார் பழுதானால் உடனடியாக ஆப்பில் உள்ள 'SOS / Emergency' பட்டனை அழுத்தவும். "
                "எங்கள் கண்ட்ரோல் ரூம் அடுத்த 30-45 நிமிடங்களில் மாற்று வண்டியை (Replacement Cab) ஏற்பாடு செய்யும்.\n"
                "2. **விபத்து / மருத்துவ உதவி**: காவல்துறை (100 / 112) மற்றும் ஆம்புலன்ஸ் (108) உதவிக்கு உடனடியாக அழைக்கவும்.\n"
                "3. எங்கள் 24x7 அவசர உதவி எண்: **+91 98765 43210**."
            )
        else:
            reply = (
                "🚨 **Emergency, Breakdown & SOS Assistance**:\n\n"
                "1. **Vehicle Breakdown**: Tap the SOS / Emergency button on your screen immediately. "
                "Drop Cars Dispatch will arrange a replacement cab within 30-45 minutes.\n"
                "2. **Accident / Medical Help**: Call 112 (Emergency Police) or 108 (Ambulance) if anyone requires medical care.\n"
                "3. Our 24/7 Priority Helpline: **+91 98765 43210**."
            )
        category = "EMERGENCY_SOS"
        suggestions = ["🚨 Trigger Emergency Dispatch Alert", "📞 Call Operations Desk", "📍 Share GPS Coordinates"]

    # Category 11: LOST & FOUND
    elif any(k in lower_msg for k in ["lost", "found", "forgot", "left item", "phone left", "bag left", "thavara"]):
        if is_tamil:
            reply = (
                "🎒 **காரில் தவறவிட்ட பொருட்கள் (Lost & Found)**:\n\n"
                "• வாடிக்கையாளர் ஏதேனும் பொருளை காரில் தவறவிட்டால் உடனடியாக ஆப் அல்லது கண்ட்ரோல் ரூமில் தெரிவிக்கவும்.\n"
                "• ஓட்டுநர் பொருளை பாதுகாப்பாக அருகிலுள்ள Drop Cars கிளை அலுவலகம் அல்லது காவல் நிலையத்தில் ஒப்படைக்க வேண்டும்.\n"
                "• பொருளை வாடிக்கையாளரிடம் நேரடியாக கொண்டு சேர்க்கும் போது நியாயமான பயணக் கட்டணம் வாடிக்கையாளரிடமிருந்து பெற்றுக்கொள்ளலாம்."
            )
        else:
            reply = (
                "🎒 **Lost & Found Recovery Policy**:\n\n"
                "• If a passenger leaves belongings inside the cab, report via the Chat or Help Desk immediately.\n"
                "• Drivers are required to safeguard all items and drop them off at the nearest Drop Cars office or verified partner hub.\n"
                "• Reasonable transit charges will be paid by the customer if the driver returns the item to their doorstep."
            )
        category = "LOST_FOUND"
        suggestions = ["🎧 Report Lost Item to Dispatch", "📞 Contact Passenger via Masked Line", "💬 Send Message"]

    # Category 12: HUMAN AGENT & DISPATCH ESCALATION
    elif any(k in lower_msg for k in ["agent", "human", "support", "dispatch", "call me", "helpline", "pesanum"]):
        if is_tamil:
            reply = (
                "🎧 **நேரடி கட்டுப்பாட்டு அறை (Operations Dispatch Desk)**:\n\n"
                "உங்களை எங்கள் மூத்த கட்டுப்பாட்டு அறை அதிகாரியுடன் இணைக்கிறோம். "
                "சவாரி மேலாண்மை, கட்டண முரண்பாடுகள், அல்லது உடனடி உதவிக்கு நீங்கள் நேரடியாக பேசலாம்.\n\n"
                "• **ஹெல்ப்லைன்**: +91 98765 43210\n"
                "• **செயல்பாடு நேரம்**: 24 மணி நேரமும், வாரத்தின் 7 நாட்களும் இயங்கும்."
            )
        else:
            reply = (
                "🎧 **Central Operations & Dispatch Desk**:\n\n"
                "Connecting you directly with a senior dispatch officer. "
                "For booking reassignment, fare dispute, or urgent intervention:\n\n"
                "• **Helpline**: +91 98765 43210\n"
                "• **Availability**: 24 Hours / 7 Days a week"
            )
        category = "DISPATCH_SUPPORT"
        suggestions = ["📞 Call 24/7 Helpline", "📝 Leave a Callback Request", "🔄 Recheck Tariff"]

    # Category 13: TARIFF & DISTANCE ESTIMATION
    else:
        cities_found = re.findall(
            r'\b(chennai|madurai|coimbatore|trichy|salem|tirunelveli|vellore|erode|thanjavur|pondicherry|bangalore|bengaluru|kanyakumari|dindigul|hosur|ooty|kodaikanal|tiruppur|kumbakonam|tirupati|rameswaram|cuddalore|villupuram|nagercoil|tuticorin|karur|mysore|munnar|pollachi|palani|kochi|theni|dharmapuri|krishnagiri|namakkal)\b',
            lower_msg
        )

        pickup_city = cities_found[0].capitalize() if len(cities_found) > 0 else "Chennai"
        drop_city = cities_found[1].capitalize() if len(cities_found) > 1 else ("Madurai" if pickup_city != "Madurai" else "Trichy")

        car_type_key = "sedan"
        car_type_display = "Sedan (Etios / Dzire)"
        if any(w in lower_msg for w in ["suv", "ertiga", "xylo"]):
            car_type_key = "suv"
            car_type_display = "SUV (Ertiga / Lodgy)"
        elif any(w in lower_msg for w in ["innova", "crysta"]):
            car_type_key = "innova"
            car_type_display = "Innova / Crysta"
        elif any(w in lower_msg for w in ["hatchback", "swift", "mini", "wagonr"]):
            car_type_key = "hatchback"
            car_type_display = "Hatchback (Swift / WagonR)"

        estimated_km = get_distance(pickup_city, drop_city)
        rate_per_km = PER_KM_RATES.get(car_type_key, 14)
        estimated_fare = estimated_km * rate_per_km
        driver_beta = DRIVER_BETA_MAP.get(car_type_key, 400)
        total_quote = estimated_fare + driver_beta

        if is_tamil:
            reply = (
                f"🚗 **கட்டணக் கணக்கீடு: {pickup_city} ➔ {drop_city}**\n\n"
                f"• வாகனம்: **{car_type_display}**\n"
                f"• உத்தேச தூரம்: **{estimated_km} km**\n"
                f"• கிலோமீட்டர் கட்டணம்: **₹{rate_per_km}/km**\n"
                f"• சவாரி கட்டணம்: **₹{estimated_fare:,}**\n"
                f"• ஓட்டுநர் படி (Driver Beta): **₹{driver_beta}**\n"
                f"💰 **மொத்த உத்தேச கட்டணம்: சுமார் ₹{total_quote:,}**\n"
                f"✨ (சுங்கக் கட்டணம் அசல் ரசீதுப்படி வாடிக்கையாளரால் செலுத்தப்படும்)\n\n"
                f"மேலும் விவரங்கள் அறிய கீழே உள்ள ஆப்ஷன்களை தட்டவும்."
            )
        else:
            reply = (
                f"🚗 **Tariff Estimate: {pickup_city} to {drop_city}**\n\n"
                f"• Vehicle: **{car_type_display}**\n"
                f"• Estimated Distance: **{estimated_km} km**\n"
                f"• Per KM Tariff: **₹{rate_per_km}/km**\n"
                f"• Base Fare: **₹{estimated_fare:,}**\n"
                f"• Driver Beta: **₹{driver_beta}**\n"
                f"💰 **Total Estimated Fare: ~₹{total_quote:,}**\n"
                f"✨ (Fastag tolls payable as per actual receipts)\n\n"
                f"Tap below for quick options or to chat with Dispatch."
            )
        category = "TARIFF"
        suggestions = [
            f"💰 Check SUV Fare ({pickup_city} ➔ {drop_city})",
            "🅿️ Toll & Fastag collection rule",
            "🔑 How to get Start OTP?",
            "⏳ Waiting charges policy"
        ]

    # Audit logging
    try:
        log_entry = AIAutomationLog(
            category="SMART_LLM_ASSISTANT",
            action_type=category,
            entity_type="partner",
            entity_id="PARTNER-CHAT-USER",
            entity_name="Driver / Partner",
            summary=f"AI Chat: {category} ({user_message[:60]})",
            confidence_score=0.99,
            details_json={
                "user_query": user_message,
                "detected_language": language,
                "category": category,
                "ai_response_text": reply
            }
        )
        db.add(log_entry)
        db.commit()
    except Exception as log_err:
        logger.warning(f"Could not write AI automation log: {log_err}")

    return {
        "success": True,
        "query": user_message,
        "reply": reply,
        "category": category,
        "suggestions": suggestions
    }

@router.post("/ai/webhook/whatsapp")
async def whatsapp_webhook(request: Request, db: Session = Depends(get_db)):
    """Standard Webhook handler for Meta WhatsApp Cloud API."""
    # Acknowledge only - nothing is processed yet. Don't log the body: it
    # carries customers' phone numbers and message text.
    body = await request.body()
    logger.info(f"Incoming WhatsApp webhook ({len(body)} bytes) - not processed")
    return {"status": "received"}
