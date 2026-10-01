import os
import re
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, Body, Request
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional

from app.database.session import get_db
from app.models.ai_automation_log import AIAutomationLog
from app.core.security import get_current_driver

logger = logging.getLogger(__name__)
from app.core.security import get_current_admin, get_current_user_flexible, get_current_driver
router = APIRouter(tags=["AI WhatsApp & Voice Assistant"])

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# ---------------------------------------------------------------------------
# Fuzzy matching helpers - the bot used to require an exact keyword substring,
# so a driver typing "otp" as "otpp", "wallet" as "walet", or "cancel" as
# "cancle" fell straight through to the generic fallback. These helpers let a
# 1-2 letter typo still match the right topic, while staying a plain
# rule-based matcher (no external AI service / API key needed).
# ---------------------------------------------------------------------------

def _edit_distance(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
        prev = cur
    return prev[-1]


def _typo_tolerance(word_len: int) -> int:
    if word_len <= 5:
        return 1
    if word_len <= 8:
        return 2
    return 3


def _keyword_hit(tokens: List[str], raw_message: str, keyword: str) -> bool:
    """True if `keyword` (a word or short phrase) is present in the message,
    exactly or with a small typo. Multi-word phrases (e.g. "rate card") are
    checked as a substring only - fuzzy-matching a whole phrase is overkill.
    The fuzzy pass requires the same first letter (real typos almost never
    change the first letter) so unrelated same-length words - "weather" vs
    "return", "mudiyala" vs "balance" - don't coincidentally match just
    because their edit distance happens to be small."""
    if " " in keyword:
        return keyword in raw_message
    for tok in tokens:
        if len(tok) < 3:
            continue
        if keyword in tok or tok in keyword:
            return True
        if tok[0] == keyword[0] and abs(len(tok) - len(keyword)) <= 2 and _edit_distance(tok, keyword) <= _typo_tolerance(len(keyword)):
            return True
    return False


def any_kw(tokens: List[str], raw_message: str, keywords: List[str]) -> bool:
    return any(_keyword_hit(tokens, raw_message, k) for k in keywords)


_TAMIL_ROMAN_WORDS = {
    "vanakkam", "evlo", "enna", "panrathu", "kaasu", "kattanam", "pannunga", "irukku",
    "venum", "vendam", "illa", "aagum", "epadi", "yenga", "nalla", "seekiram", "romba",
    "nanba", "sir", "anna", "akka", "amma", "appa", "theriyala", "mudiyala", "panna",
    "vandhu", "poyiduchu", "aaguthu", "nu",
}


def _detect_tamil(text: str) -> bool:
    """True if the message is actually written in Tamil - either the Tamil
    Unicode script itself, or common romanized ('Tanglish') Tamil words. This
    looks at what the driver actually typed, instead of trusting a client-
    sent language flag that may not match (the Driver App used to always
    send language='ta' no matter what the driver typed)."""
    if re.search(r'[஀-௿]', text):
        return True
    words = set(re.findall(r"[a-zA-Z]+", text.lower()))
    return bool(words & _TAMIL_ROMAN_WORDS)


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

KNOWN_CITIES = sorted({c for pair in DISTANCE_DB for c in pair})

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


def _helpline_number(db: Session) -> str:
    """The real, currently-reachable support number - whichever staff/owner
    admin has toggled "on duty" (Admin App > Settings), falling back to any
    Owner-role admin. Never a hardcoded placeholder."""
    try:
        from app.models.admin import Admin
        admin = (
            db.query(Admin).filter(Admin.is_on_duty.is_(True))
            .order_by(Admin.on_duty_since.desc()).first()
        )
        if not admin:
            admin = db.query(Admin).filter(Admin.role == "Owner").order_by(Admin.created_at.asc()).first()
        if admin and admin.phone:
            return f"+91 {admin.phone}"
    except Exception:
        logger.exception("Could not look up on-duty helpline number")
    return "your fleet owner"


def get_distance(city1: str, city2: str) -> int:
    c1, c2 = city1.lower().strip(), city2.lower().strip()
    if (c1, c2) in DISTANCE_DB:
        return DISTANCE_DB[(c1, c2)]
    if (c2, c1) in DISTANCE_DB:
        return DISTANCE_DB[(c2, c1)]
    return 320  # Average outstation default fallback


def _find_cities(tokens: List[str], raw_message: str) -> List[str]:
    """Exact word match first, then a typo-tolerant pass (e.g. "banglore",
    "chenai", "madurei") against the known city list, in the order they
    appear in the message."""
    exact = re.findall(
        r'\b(' + '|'.join(KNOWN_CITIES) + r')\b',
        raw_message,
    )
    if exact:
        # de-duplicate while keeping order
        seen, out = set(), []
        for c in exact:
            if c not in seen:
                seen.add(c)
                out.append(c)
        return out

    found, seen = [], set()
    for tok in tokens:
        if len(tok) < 4:
            continue
        for city in KNOWN_CITIES:
            if city in seen or city[0] != tok[0]:
                continue
            if abs(len(tok) - len(city)) <= 2 and _edit_distance(tok, city) <= _typo_tolerance(len(city)):
                found.append(city)
                seen.add(city)
                break
    return found


@router.post("/ai/chat-assistant", dependencies=[Depends(get_current_user_flexible)])
async def chat_assistant_route(
    request: Request,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Help Bot / Support chat. Asks the LLM first (it knows the caller's own wallet and trips, remembers the last few
    turns and answers in the caller's language); when no LLM key is configured, the daily cap is reached or the call
    fails, the rule-based assistant below answers exactly as before. A reply the LLM marks `needs_human` comes back with
    category UNRECOGNIZED, which the apps already turn into "connect to Drop Cars support"."""
    message = str(payload.get("message", "")).strip()
    if message:
        from app.utils import ai_llm
        # bare menu shortcuts ("1".."9") are the rule bot's - answer those there
        if not re.fullmatch(r"[0-9.# ]{1,3}|(option|opt)\s*[0-9]", message.lower()):
            llm = await asyncio.to_thread(ai_llm.answer, db, request, message, payload.get("history"))
            if llm:
                try:
                    db.add(AIAutomationLog(
                        category="SMART_LLM_ASSISTANT", action_type="LLM_REPLY", entity_type="partner",
                        entity_id="PARTNER-CHAT-USER", entity_name="Driver / Partner",
                        summary=f"AI Chat (LLM): {message[:60]}", confidence_score=0.9,
                        details_json={"user_query": message, "ai_response_text": llm["reply"], "needs_human": llm["needs_human"]},
                    ))
                    db.commit()
                except Exception:  # noqa: BLE001
                    db.rollback()
                return {
                    "success": True, "query": message, "reply": llm["reply"],
                    "category": "UNRECOGNIZED" if llm["needs_human"] else "AI_ASSISTANT",
                    "suggestions": llm["suggestions"],
                }
    return await _rule_based_assistant(payload, db)


async def _rule_based_assistant(
    payload: Dict[str, Any],
    db: Session
) -> Dict[str, Any]:
    """
    Drop Cars driver-support chat assistant (Tamil & English), rule-based
    with typo-tolerant keyword matching. Covers:
    - Route Tariff & Distance Calculations
    - Start Trip OTP / End OTP Rules
    - Toll, Fastag & Parking Policies
    - Delay & Waiting Time Calculation
    - Cancellation & Rs.500 Penalty Guidelines
    - Wallet Security Hold & Instant Release Rules
    - Round Trip / Bata, Luggage, Pet, Hill Station rules
    - Documents & licence renewal, App login trouble, Advance & GST, Fuel/AC,
      Insurance during duty
    - Emergency SOS / Lost & Found / Human dispatch escalation
    Any message that matches nothing sensible gets a professional "here is
    what I can help with" reply instead of a guessed answer - it never
    silently assumes a route or a topic the driver didn't ask about.
    """
    user_message = payload.get("message", "").strip()
    language = payload.get("language", "").lower()

    if not user_message:
        raise HTTPException(status_code=400, detail="Message string is required")

    # Reply in whatever language the driver actually typed in, not a fixed
    # client flag - detect straight from the message text (Tamil script or
    # common Tanglish words). A short/ambiguous message (e.g. just "2") falls
    # back to the client's language hint, and finally to Tamil, since most
    # drivers on this platform read Tamil.
    is_tamil = _detect_tamil(user_message) or (not user_message.strip("0123456789. #") and "en" not in language) or (not language and not re.search(r'[a-zA-Z]', user_message))

    lower_msg = user_message.lower()
    trimmed = lower_msg.strip().replace(".", "").replace("#", "")
    tokens = re.findall(r"[a-z]+", lower_msg)

    is_opt_1 = trimmed in ["1", "option 1", "opt 1", "one"]
    is_opt_2 = trimmed in ["2", "option 2", "opt 2", "two"]
    is_opt_3 = trimmed in ["3", "option 3", "opt 3", "three"]
    is_opt_4 = trimmed in ["4", "option 4", "opt 4", "four"]
    is_opt_5 = trimmed in ["5", "option 5", "opt 5", "five"]
    is_opt_6 = trimmed in ["6", "option 6", "opt 6", "six"]
    is_opt_7 = trimmed in ["7", "option 7", "opt 7", "seven"]
    is_opt_8 = trimmed in ["8", "option 8", "opt 8", "eight"]
    is_opt_9 = trimmed in ["9", "option 9", "opt 9", "nine"]

    # Category 1: TARIFF & DISTANCE ESTIMATION (Direct 1 shortcut or keywords)
    if is_opt_1 or (any_kw(tokens, lower_msg, ["tariff", "fare", "rate", "rates", "charges", "pricing", "kattanam"]) and not any_kw(tokens, lower_msg, ["cancel", "penalty", "wait", "otp"])):
        if is_tamil:
            reply = (
                "💰 **Drop Cars நிலையான கட்டண விகிதங்கள் (Standard Tariffs)**:\n\n"
                "• **Sedan (Dzire / Etios)**: ₹14/km (குறைந்தபட்சம் 250 கி.மீ/நாள்)\n"
                "• **SUV (Ertiga / Marazzo)**: ₹19/km\n"
                "• **Prime SUV (Innova / Crysta)**: ₹21/km\n"
                "• **Hatchback (Swift / WagonR)**: ₹13/km\n\n"
                "• **Driver Beta**: பகல் ₹300 (06:00 AM - 10:00 PM) | இரவு ₹400 (10:00 PM - 06:00 AM)\n"
                "• **Tolls & Parking**: அசல் ரசீதுப்படி வாடிக்கையாளர் செலுத்துவார்.\n\n"
                "💡 *குறிப்பிட்ட ஊர்களுக்கு இடையே தூரம் அறிய (எ.கா: 'Chennai to Madurai') என டைப் செய்யவும்.*"
            )
        else:
            reply = (
                "💰 **Drop Cars Standard Partner Tariffs**:\n\n"
                "• **Sedan (Dzire / Etios)**: ₹14/km (Outstation min 250 km/day)\n"
                "• **SUV (Ertiga / Marazzo)**: ₹19/km\n"
                "• **Prime SUV (Innova Crysta)**: ₹21/km\n"
                "• **Hatchback (Swift / WagonR)**: ₹13/km\n\n"
                "• **Driver Allowance**: Day ₹300 (6 AM–10 PM) | Night ₹400 (10 PM–6 AM)\n"
                "• **Tolls & Fastag**: Reimbursed on actual receipts by customer.\n\n"
                "💡 *Type any two cities (e.g. 'Chennai to Madurai') for instant distance and fare calculation.*"
            )
        category = "TARIFF"
        suggestions = ["🚗 Chennai ➔ Madurai", "🚗 Chennai ➔ Bangalore", "🔑 Start Trip OTP", "🅿️ Toll Rules"]

    # Category 2: START / END OTP
    elif is_opt_2 or any_kw(tokens, lower_msg, ["otp", "code", "verification", "start"]) and any_kw(tokens, lower_msg, ["otp", "code", "trip", "ride"]):
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

    # Category 3: TOLL, FASTAG & PARKING
    elif is_opt_3 or any_kw(tokens, lower_msg, ["toll", "fastag", "parking", "permit", "sunga", "sungam"]):
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

    # Category 4: WAITING TIME & PASSENGER DELAY
    elif is_opt_4 or any_kw(tokens, lower_msg, ["wait", "waiting", "delay", "late", "reach", "unreachable", "thamadham"]):
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

    # Category 5: CANCELLATION & ₹500 PENALTY
    elif is_opt_6 or any_kw(tokens, lower_msg, ["cancel", "penalty", "fine", "decline", "abaraatham"]) or "500" in lower_msg:
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

    # Category 6: WALLET, SECURITY HOLD & PAYOUT
    elif is_opt_5 or any_kw(tokens, lower_msg, ["wallet", "hold", "security", "balance", "payout", "vaalat", "panam", "settlement"]):
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

    # Category 7: ROUND TRIP, BATA & OUTSTATION RULES
    elif is_opt_7 or any_kw(tokens, lower_msg, ["round", "roundtrip", "bata", "return", "halt", "thirumba"]) or "two way" in lower_msg:
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

    # Category 8: LUGGAGE & BOOT SPACE POLICY
    elif is_opt_8 or any_kw(tokens, lower_msg, ["luggage", "baggage", "boot", "bags", "suitcase", "samangal"]):
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

    # Category 9: PET TRAVEL POLICY
    elif any_kw(tokens, lower_msg, ["pet", "dog", "cat", "animal", "naai", "poonai"]):
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

    # Category 10: HILL STATION & GHAT ROAD AC RULES
    elif any_kw(tokens, lower_msg, ["hill", "ghat", "ooty", "kodaikanal", "munnar", "yercaud", "hairpin", "malai"]):
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

    # Category 11: DOCUMENTS & LICENCE RENEWAL
    elif any_kw(tokens, lower_msg, ["licence", "license", "document", "expiry", "renew", "rc", "insurance", "permit", "pollution", "aadhar", "aadhaar"]):
        if is_tamil:
            reply = (
                "📄 **டாக்குமெண்ட் & லைசென்ஸ் புதுப்பித்தல்**:\n\n"
                "• **லைசென்ஸ் / RC / இன்சூரன்ஸ் / பொலூஷன் காலாவதி**: Profile ➔ Documents பக்கத்தில் காலாவதி தேதி தெரியும். "
                "காலாவதிக்கு 15 நாட்கள் முன்பே 'Renew' பட்டன் காண்பிக்கும் - புதிய டாக்குமெண்ட் போட்டோ அப்லோட் செய்யவும்.\n"
                "• **சரிபார்ப்பு**: புதிய டாக்குமெண்ட் அப்லோட் செய்த பிறகு Admin சரிபார்க்கும் வரை (சாதாரணமாக சில மணி நேரம்) பழைய டாக்குமெண்ட் வேலை செய்யும்.\n"
                "• **இன்சூரன்ஸ் (Insurance) கவரேஜ்**: வாகன இன்சூரன்ஸ் உரிமையாளர் பொறுப்பு; சவாரியின் போது விபத்து ஏற்பட்டால் உடனே Dispatch Desk-ஐ தொடர்பு கொள்ளவும்."
            )
        else:
            reply = (
                "📄 **Document & Licence Renewal**:\n\n"
                "• **Licence / RC / Insurance / Pollution expiry**: Check the expiry date under Profile ➔ Documents. "
                "A 'Renew' option appears 15 days before expiry - upload the new document photo there.\n"
                "• **Verification**: Your old document keeps working until Admin verifies the new upload (usually a few hours).\n"
                "• **Insurance Coverage**: Vehicle insurance is the owner's responsibility; if there's an accident during a trip, contact Dispatch Desk immediately."
            )
        category = "DOCUMENTS"
        suggestions = ["📤 Upload Renewed Document", "🎧 Ask Dispatch About Verification", "🚨 Report an Accident"]

    # Category 12: APP / LOGIN TROUBLE
    elif any_kw(tokens, lower_msg, ["login", "logout", "password", "app not working", "crash", "hang", "notification", "signin", "session"]):
        if is_tamil:
            reply = (
                "📱 **ஆப் / லாகின் பிரச்சனை**:\n\n"
                "• **Password மறந்துவிட்டீர்களா?**: Sign-in பக்கத்தில் 'Forgot Password' ➔ உங்கள் மொபைல் நம்பர் கொடுத்து புதிய Password அமைக்கலாம். "
                "Email இணைக்கப்படாத கணக்குகளுக்கு உங்கள் Fleet Owner அல்லது Admin-ஐ தொடர்பு கொள்ளவும்.\n"
                "• **ஆப் Hang / Crash ஆகுதா?**: ஆப்-ஐ முழுவதுமாக மூடிவிட்டு மீண்டும் திறக்கவும்; இன்டர்நெட் connection சரிபார்க்கவும்.\n"
                "• **Notification வரவில்லையா?**: Phone Settings ➔ Apps ➔ Drop Cars ➔ Notifications 'Allow' ஆக இருக்கிறதா பார்க்கவும்."
            )
        else:
            reply = (
                "📱 **App / Login Trouble**:\n\n"
                "• **Forgot Password?**: Tap 'Forgot Password' on the sign-in screen and reset it with your mobile number. "
                "If your account has no email on file, ask your Fleet Owner or Admin to help.\n"
                "• **App hanging or crashing?**: Fully close and reopen the app; check your internet connection.\n"
                "• **Not getting notifications?**: Check Phone Settings ➔ Apps ➔ Drop Cars ➔ Notifications is set to Allow."
            )
        category = "APP_LOGIN"
        suggestions = ["🔑 Reset Password", "🎧 Contact Dispatch Desk", "💰 View Tariff Rates"]

    # Category 13: ADVANCE PAYMENT, GST & INVOICE
    elif any_kw(tokens, lower_msg, ["advance", "gst", "invoice", "bill", "commission", "deduction", "muthal"]):
        if is_tamil:
            reply = (
                "🧾 **அட்வான்ஸ் பேமெண்ட், GST & இன்வாய்ஸ்**:\n\n"
                "• **அட்வான்ஸ்**: வாடிக்கையாளர் முன்கூட்டியே செலுத்தும் அட்வான்ஸ் தொகை, சவாரி Accept ஆன பிறகு App-ல் காண்பிக்கும்.\n"
                "• **கமிஷன் / பிளாட்ஃபார்ம் கட்டணம்**: நிலையான Standard கமிஷன் (10%) மற்றும் சிறிய பிளாட்ஃபார்ம் கட்டணம் (2%) சவாரி "
                "தொகையிலிருந்து கழிக்கப்படும் - சவாரி முடிந்ததும் Wallet-ல் விவரம் தெளிவாக இருக்கும்.\n"
                "• **GST இன்வாய்ஸ்**: நிறுவன வாடிக்கையாளர்களுக்கு GST இன்வாய்ஸ் தேவைப்பட்டால் அது வாடிக்கையாளர் தரப்பில் Website/Admin மூலம் வழங்கப்படும்."
            )
        else:
            reply = (
                "🧾 **Advance Payment, GST & Invoice**:\n\n"
                "• **Advance**: Any advance the passenger paid up front is shown in the app once you accept the ride.\n"
                "• **Commission / Platform Fee**: The standard commission (10%) and a small platform fee (2%) are deducted from the trip amount - "
                "the exact split is shown in your Wallet once the trip is completed.\n"
                "• **GST Invoice**: For business customers who need a GST invoice, that is issued on the customer side via the Website/Admin, not from the Driver App."
            )
        category = "ADVANCE_GST"
        suggestions = ["💳 View Wallet Breakdown", "💰 View Tariff Rates", "🎧 Contact Dispatch Desk"]

    # Category 14: FUEL / AC POLICY
    elif any_kw(tokens, lower_msg, ["fuel", "petrol", "diesel", "mileage", "ac ", "aircondition"]):
        if is_tamil:
            reply = (
                "⛽ **எரிபொருள் & AC கொள்கை**:\n\n"
                "• எரிபொருள் (Fuel) செலவு எப்போதும் ஓட்டுநர் / வாகன உரிமையாளர் பொறுப்பு - இது கிலோமீட்டர் கட்டணத்தில் "
                "ஏற்கனவே சேர்க்கப்பட்டுள்ளது.\n"
                "• AC சாதாரண பாதைகளில் எப்போதும் இயங்கும்; மலைப்பாதைகளில் மட்டும் பாதுகாப்பிற்காக தற்காலிகமாக அணைக்கப்படலாம் "
                "(Hill Station விதிமுறையை பார்க்கவும்)."
            )
        else:
            reply = (
                "⛽ **Fuel & AC Policy**:\n\n"
                "• Fuel cost is always the driver's / vehicle owner's responsibility - it is already built into the per-km tariff.\n"
                "• AC runs normally on regular roads; it may be temporarily switched off only on hill/ghat roads for safety "
                "(see Hill Station rules)."
            )
        category = "FUEL_AC"
        suggestions = ["💰 View Tariff Rates", "⛰️ Hill Station AC Rules", "🎧 Contact Dispatch Desk"]

    # Category 15: EMERGENCY, ACCIDENT & SOS
    elif is_opt_9 or any_kw(tokens, lower_msg, ["sos", "emergency", "accident", "breakdown", "police", "ambulance", "puncture"]):
        helpline = _helpline_number(db)
        if is_tamil:
            reply = (
                "🚨 **அவசர உதவி & பிரேக்டவுன் (SOS Support)**:\n\n"
                "1. **வாகன பிரேக்டவுன்**: கார் பழுதானால் உடனடியாக ஆப்பில் உள்ள 'SOS / Emergency' பட்டனை அழுத்தவும். "
                "எங்கள் கண்ட்ரோல் ரூம் அடுத்த 30-45 நிமிடங்களில் மாற்று வண்டியை (Replacement Cab) ஏற்பாடு செய்யும்.\n"
                "2. **விபத்து / மருத்துவ உதவி**: காவல்துறை (100 / 112) மற்றும் ஆம்புலன்ஸ் (108) உதவிக்கு உடனடியாக அழைக்கவும்.\n"
                f"3. எங்கள் அவசர உதவி எண் (இப்போது duty-ல் உள்ளவர்): **{helpline}**."
            )
        else:
            reply = (
                "🚨 **Emergency, Breakdown & SOS Assistance**:\n\n"
                "1. **Vehicle Breakdown**: Tap the SOS / Emergency button on your screen immediately. "
                "Drop Cars Dispatch will arrange a replacement cab within 30-45 minutes.\n"
                "2. **Accident / Medical Help**: Call 112 (Emergency Police) or 108 (Ambulance) if anyone requires medical care.\n"
                f"3. Priority Helpline (whoever's on duty right now): **{helpline}**."
            )
        category = "EMERGENCY_SOS"
        suggestions = ["🚨 Trigger Emergency Dispatch Alert", "📞 Call Operations Desk", "📍 Share GPS Coordinates"]

    # Category 16: LOST & FOUND
    elif any_kw(tokens, lower_msg, ["lost", "found", "forgot", "thavara"]) and any_kw(tokens, lower_msg, ["item", "bag", "phone", "left", "thavara"]):
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

    # Category 17: HUMAN AGENT & DISPATCH ESCALATION
    elif any_kw(tokens, lower_msg, ["agent", "human", "support", "dispatch", "helpline", "pesanum", "operator", "manager"]):
        helpline = _helpline_number(db)
        if is_tamil:
            reply = (
                "🎧 **நேரடி கட்டுப்பாட்டு அறை (Operations Dispatch Desk)**:\n\n"
                "உங்களை இப்போது duty-ல் உள்ள எங்கள் அதிகாரியுடன் இணைக்கிறோம். "
                "சவாரி மேலாண்மை, கட்டண முரண்பாடுகள், அல்லது உடனடி உதவிக்கு நீங்கள் நேரடியாக பேசலாம்.\n\n"
                f"• **ஹெல்ப்லைன்**: {helpline}\n"
                "• இது தவிர இந்த Chat-லேயே 'Talk to a person now' மூலமும் Support-ஐ தொடர்பு கொள்ளலாம்."
            )
        else:
            reply = (
                "🎧 **Central Operations & Dispatch Desk**:\n\n"
                "Connecting you with whoever's on duty right now. "
                "For booking reassignment, fare dispute, or urgent intervention:\n\n"
                f"• **Helpline**: {helpline}\n"
                "• You can also use 'Talk to a person now' right in this chat to reach Support."
            )
        category = "DISPATCH_SUPPORT"
        suggestions = ["📞 Call 24/7 Helpline", "📝 Leave a Callback Request", "🔄 Recheck Tariff"]

    # Category 18: TARIFF & DISTANCE ESTIMATION FOR A NAMED ROUTE
    else:
        cities_found = _find_cities(tokens, lower_msg)

        if not cities_found:
            # Nothing matched, and no city was named either - be a
            # professional human-support fallback instead of guessing a
            # route the driver never asked about. Restate what the bot can
            # help with and offer a live-agent escalation.
            if is_tamil:
                reply = (
                    "🙏 மன்னிக்கவும், உங்கள் கேள்வியை சரியாக புரிந்துகொள்ள முடியவில்லை.\n\n"
                    "நான் இவற்றில் உதவ முடியும்: கட்டண விகிதங்கள், Start/End OTP, Toll & Fastag, காத்திருப்பு கட்டணம், "
                    "ரத்து விதிமுறை, Wallet Hold, Round Trip/Bata, லக்கேஜ், டாக்குமெண்ட் புதுப்பித்தல், ஆப் லாகின் பிரச்சனை, "
                    "அட்வான்ஸ்/GST, அவசர உதவி.\n\n"
                    "கீழே உள்ள ஆப்ஷன் ஒன்றை தட்டவும், அல்லது இன்னும் தெளிவாக கேளுங்கள் (எ.கா: 'Chennai to Madurai fare', "
                    "'OTP வரலை'). நேரடியாக பேச Dispatch Desk-ஐ தொடர்பு கொள்ளலாம்."
                )
            else:
                reply = (
                    "🙏 Sorry, I couldn't match that to something I know.\n\n"
                    "I can help with: Tariff rates, Start/End OTP, Toll & Fastag, waiting charges, cancellation rules, "
                    "Wallet Hold, Round Trip/Bata, luggage, document renewal, app/login trouble, advance & GST, "
                    "and emergencies.\n\n"
                    "Tap an option below, or ask more specifically (e.g. 'Chennai to Madurai fare', 'OTP not received'). "
                    "For anything else, please reach the Dispatch Desk directly."
                )
            category = "UNRECOGNIZED"
            suggestions = [
                "💰 Tariff & Rates",
                "🔑 Start Trip OTP",
                "🅿️ Toll & Fastag rules",
                "🎧 Contact Dispatch Desk",
            ]
        else:
            pickup_city = cities_found[0].capitalize()
            drop_city = cities_found[1].capitalize() if len(cities_found) > 1 else ("Madurai" if pickup_city != "Madurai" else "Trichy")

            car_type_key = "sedan"
            car_type_display = "Sedan (Etios / Dzire)"
            if any_kw(tokens, lower_msg, ["suv", "ertiga", "xylo"]):
                car_type_key = "suv"
                car_type_display = "SUV (Ertiga / Lodgy)"
            elif any_kw(tokens, lower_msg, ["innova", "crysta"]):
                car_type_key = "innova"
                car_type_display = "Innova / Crysta"
            elif any_kw(tokens, lower_msg, ["hatchback", "swift", "mini", "wagonr"]):
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


@router.get("/ai/trip-detail/{order_id}")
def trip_detail_for_chat(
    order_id: int,
    language: str = "",
    db: Session = Depends(get_db),
    current_driver=Depends(get_current_driver),
):
    """The Help Bot's answer when a driver asks about the tariff/fare/details
    of a SPECIFIC trip they picked from the "which trip?" chips - the real
    accepted numbers for that booking (not the generic rate card)."""
    from app.models.orders import Order
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.crud.booking_chat import _cities, _v
    from app.utils.commission import estimate_split_for_order, enum_value

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Booking not found")

    assignment = (
        db.query(OrderAssignment)
        .filter(
            OrderAssignment.order_id == order_id,
            OrderAssignment.driver_id == current_driver.id,
            OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED,
        )
        .order_by(OrderAssignment.created_at.desc())
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=403, detail="This trip isn't assigned to you.")

    is_tamil = _detect_tamil(language) or language.lower().startswith("ta") or (not language)
    pickup, drop = _cities(order)
    route = f"{pickup} → {drop}" if drop else pickup
    status_label = str(enum_value(assignment.assignment_status))
    car_type = _v(order.car_type)
    trip_type = _v(order.trip_type)
    fare_type = _v(getattr(order, "fare_type", None)) or "ITEMIZED"
    distance = getattr(order, "trip_distance", None)
    advance = int(getattr(order, "advance_received", 0) or 0)

    try:
        split = estimate_split_for_order(db, order)
    except Exception:
        logger.exception(f"trip_detail_for_chat: split calc failed for order {order_id}")
        split = None

    status_ta = {"ASSIGNED": "ஒதுக்கப்பட்டது", "DRIVING": "சவாரி நடக்கிறது", "PENDING": "நிலுவையில்", "COMPLETED": "முடிந்தது"}.get(status_label, status_label)
    status_en = {"ASSIGNED": "Assigned - not started", "DRIVING": "Trip in progress", "PENDING": "Pending", "COMPLETED": "Completed"}.get(status_label, status_label)

    if is_tamil:
        lines = [
            f"\U0001F4CB **Trip #{order_id} விவரம்**",
            f"• **பாதை**: {route}",
            f"• **வாகனம்**: {car_type} ({trip_type})",
            f"• **நிலை**: {status_ta}",
        ]
        if distance:
            lines.append(f"• **திட்டமிட்ட தூரம்**: {distance} km")
        lines.append(f"• **கட்டண வகை**: {'All-Inclusive' if fare_type == 'ALL_INCLUSIVE' else 'Itemized (பிரேக்டவுன் வாரியாக)'}")
        if advance:
            lines.append(f"• **அட்வான்ஸ் (வாடிக்கையாளர் ஏற்கனவே செலுத்தியது)**: ₹{advance:,}")
        if split:
            lines.append(f"• **உங்கள் நிகர வருமானம் (Driver Net)**: ₹{split['driver_net']:,}")
            lines.append(f"• **பிளாட்ஃபார்ம் கட்டணம்**: ₹{split['platform_fee']:,} ({split['fee_pct']}%)")
            if split['poster_share']:
                lines.append(f"• **போஸ்டர் பங்கு**: ₹{split['poster_share']:,}")
        lines.append("\n✨ இது இந்த குறிப்பிட்ட சவாரியின் நிஜமான கணக்கு - மேலே உள்ள 1-9 ஆப்ஷன் பொதுவான விதிமுறைகளுக்கு மட்டும்.")
        reply = "\n".join(lines)
    else:
        lines = [
            f"\U0001F4CB **Trip #{order_id} Details**",
            f"• **Route**: {route}",
            f"• **Vehicle**: {car_type} ({trip_type})",
            f"• **Status**: {status_en}",
        ]
        if distance:
            lines.append(f"• **Planned Distance**: {distance} km")
        lines.append(f"• **Fare Type**: {'All-Inclusive' if fare_type == 'ALL_INCLUSIVE' else 'Itemized (with breakdown)'}")
        if advance:
            lines.append(f"• **Advance already paid by customer**: ₹{advance:,}")
        if split:
            lines.append(f"• **Your net earnings**: ₹{split['driver_net']:,}")
            lines.append(f"• **Platform fee**: ₹{split['platform_fee']:,} ({split['fee_pct']}%)")
            if split['poster_share']:
                lines.append(f"• **Poster's share**: ₹{split['poster_share']:,}")
        lines.append("\n✨ This is the real breakdown for this specific trip - the 1-9 menu above is only the general rate card.")
        reply = "\n".join(lines)

    return {
        "success": True,
        "order_id": order_id,
        "reply": reply,
        "category": "TRIP_DETAIL",
        "suggestions": ["\U0001F4CC Open This Booking", "\U0001F4AC Message About This Trip", "\U0001F3A7 Contact Dispatch Desk"],
    }


    # The "/support/dispatch-message" endpoint that used to live here has
    # moved to app/api/routes/support.py, which turns it into a real
    # two-way thread Admin App can see and reply to (see support.py).
