"""User-facing message and error code catalog across 5 languages (en, ta, te, kn, hi).

Additive helper ensuring all API responses can return a structured error code
alongside the legacy detail string, enabling clients to translate errors natively.
"""

from typing import Dict, Any, Optional
from fastapi import HTTPException

# 40+ Most Common API Error & Operational Codes
USER_MESSAGES_CATALOG: Dict[str, Dict[str, str]] = {
    # 1. Booking Acceptance & Assignment
    "DC_BOOKING_ALREADY_TAKEN": {
        "en": "This booking has already been accepted by another partner.",
        "ta": "இந்த Booking-ஐ வேறொரு டிரைவர் ஏற்றுக்கொண்டார்.",
        "te": "ఈ Booking ని మరొక భాగస్వామి ఇప్పటికే అంగీకరించారు.",
        "kn": "ಈ Booking ಅನ್ನು ಇನ್ನೊಬ್ಬ ಪಾಲುದಾರರು ಈಗಾಗಲೇ ಸ್ವೀಕರಿಸಿದ್ದಾರೆ.",
        "hi": "यह Booking किसी अन्य पार्टनर द्वारा पहले ही स्वीकार कर ली गई है।",
    },
    "DC_BOOKING_CANCELLED": {
        "en": "This booking was cancelled by customer or office.",
        "ta": "இந்த Booking வாடிக்கையாளர் அல்லது அலுவலகத்தால் ரத்து செய்யப்பட்டது.",
        "te": "ఈ Booking రద్దు చేయబడింది.",
        "kn": "ಈ Booking ರದ್ದುಗೊಂಡಿದೆ.",
        "hi": "यह Booking रद्द कर दी गई है।",
    },
    "DC_BOOKING_EXPIRED": {
        "en": "Booking broadcast window has expired.",
        "ta": "இந்த Booking ஏற்கும் நேரம் முடிந்துவிட்டது.",
        "te": "Booking సమయం ముగిసింది.",
        "kn": "Booking ಸಮಯ ಮುಗಿದಿದೆ.",
        "hi": "Booking का समय समाप्त हो गया है।",
    },
    "DC_CAR_NOT_VERIFIED": {
        "en": "This booking requires a fully verified car (Original RC, Insurance & Permit checked).",
        "ta": "இந்த Booking-க்கு சரிபார்க்கப்பட்ட கார் (Verified Car) தேவை.",
        "te": "ఈ Booking కి వెరిఫై అయిన కారు అవసరం.",
        "kn": "ಈ Booking ಗೆ ಪರಿಶೀಲಿಸಿದ ಕಾರು ಅಗತ್ಯವಿದೆ.",
        "hi": "इस Booking के लिए सत्यापित वाहन आवश्यक है।",
    },
    "DC_DRIVER_NOT_ACTIVE": {
        "en": "Your driver account is currently inactive. Please check documents or contact office.",
        "ta": "உங்க டிரைவர் கணக்கு தற்போது செயலில் இல்லை (Inactive). ஆவணங்களை சரிபார்க்கவும்.",
        "te": "మీ డ్రైవర్ ఖాతా యాక్టివ్‌గా లేదు. దయచేసి ఆఫీస్‌ని సంప్రదించండి.",
        "kn": "ನಿಮ್ಮ ಚಾಲಕ ಖಾತೆ ಸಕ್ರಿಯವಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಕಚೇರಿಯನ್ನು ಸಂಪರ್ಕಿಸಿ.",
        "hi": "आपका ड्राइवर खाता सक्रिय नहीं है। कृपया कार्यालय से संपर्क करें।",
    },

    # 2. Trip Start & OTP
    "DC_INVALID_OTP": {
        "en": "Invalid OTP entered. Please ask customer for the correct 4-digit code.",
        "ta": "தவறான OTP. வாடிக்கையாளரிடம் சரியான 4 இலக்க OTP-ஐ கேட்டு உள்ளிடவும்.",
        "te": "తప్పు OTP నమోదు చేయబడింది. సరైన OTP ని నమోదు చేయండి.",
        "kn": "ತಪ್ಪು OTP ನಮೂದಿಸಲಾಗಿದೆ. ಸರಿಯಾದ OTP ನಮೂದಿಸಿ.",
        "hi": "गलत OTP डाला गया है। कृपया सही 4-अंकों का OTP दर्ज करें।",
    },
    "DC_TRIP_ALREADY_STARTED": {
        "en": "This trip has already been started.",
        "ta": "இந்த சவாரி ஏற்கனவே தொடங்கப்பட்டுவிட்டது.",
        "te": "ఈ ట్రిప్ ఇప్పటికే ప్రారంభమైంది.",
        "kn": "ಈ ಟ್ರಿಪ್ ಈಗಾಗಲೇ ಪ್ರಾರಂಭವಾಗಿದೆ.",
        "hi": "यह यात्रा पहले ही शुरू हो चुकी है।",
    },
    "DC_TRIP_ALREADY_ENDED": {
        "en": "This trip has already been completed and closed.",
        "ta": "இந்த சவாரி ஏற்கனவே முடிக்கப்பட்டுவிட்டது.",
        "te": "ఈ ట్రిప్ ఇప్పటికే ముగిసింది.",
        "kn": "ಈ ಟ್ರಿಪ್ ಈಗಾಗಲೇ ಪೂರ್ಣಗೊಂಡಿದೆ.",
        "hi": "यह यात्रा पहले ही समाप्त हो चुकी है।",
    },
    "DC_ODOMETER_REQUIRED": {
        "en": "Starting odometer reading photo and reading are mandatory.",
        "ta": "தொடக்க ஓடோமீட்டர் (Odometer) படமும் அளவும் கட்டாயம்.",
        "te": "ప్రారంభ ఓడోమీటర్ ఫోటో మరియు రీడింగ్ తప్పనిసరి.",
        "kn": "ಪ್ರಾರಂಭಿಕ ಓಡೋಮೀಟರ್ ಫೋಟೋ ಮತ್ತು ರೀಡಿಂಗ್ ಕಡ್ಡಾಯವಾಗಿದೆ.",
        "hi": "शुरुआती ओडोमीटर फोटो और रीडिंग अनिवार्य है।",
    },

    # 3. Wallet & Payouts
    "DC_INSUFFICIENT_WALLET": {
        "en": "Insufficient wallet balance to accept this trip. Please recharge your wallet.",
        "ta": "இந்த Booking-ஐ ஏற்க உங்க Wallet-ல் போதிய பணம் இல்லை. Recharge செய்யவும்.",
        "te": "ఈ ట్రిప్ కోసం మీ Wallet లో తగినంత బ్యాలెన్స్ లేదు. రీఛార్జ్ చేయండి.",
        "kn": "ಈ ಟ್ರಿಪ್ ಸ್ವೀಕರಿಸಲು ನಿಮ್ಮ Wallet ನಲ್ಲಿ ಸಾಕಷ್ಟು ಬ್ಯಾಲೆನ್ಸ್ ಇಲ್ಲ. ರೀಚಾರ್ಜ್ ಮಾಡಿ.",
        "hi": "इस यात्रा के लिए आपके Wallet में पर्याप्त बैलेंस नहीं है। कृपया रिचार्ज करें।",
    },
    "DC_PAYOUT_BELOW_MINIMUM": {
        "en": "Payout amount must be at least ₹500.",
        "ta": "பணம் எடுக்க குறைந்தபட்சம் ₹500 இருக்க வேண்டும்.",
        "te": "విత్‌డ్రా మొత్తం కనీసం ₹500 ఉండాలి.",
        "kn": "ವಿತ್‌ಡ್ರಾ ಮೊತ್ತ ಕನಿಷ್ಠ ₹500 ಇರಬೇಕು.",
        "hi": "निकासी राशि कम से कम ₹500 होनी चाहिए।",
    },
    "DC_PAYOUT_RETAIN_FLOOR": {
        "en": "You must retain the minimum security balance in your wallet.",
        "ta": "Wallet-ல் குறைந்தபட்ச பாதுகாப்பு இருப்பை வைத்திருக்க வேண்டும்.",
        "te": "మీ Wallet లో కనీస బ్యాలెన్స్ ఉంచాలి.",
        "kn": "ನಿಮ್ಮ Wallet ನಲ್ಲಿ ಕನಿಷ್ಠ ಬ್ಯಾಲೆನ್ಸ್ ಉಳಿಸಬೇಕು.",
        "hi": "आपको अपने वॉलेट में न्यूनतम सुरक्षा राशि रखनी होगी।",
    },
    "DC_PAYOUT_PENDING_EXISTS": {
        "en": "You already have a pending payout request in review.",
        "ta": "உங்களுடைய முந்தைய பணம் எடுக்கும் கோரிக்கை இன்னும் பரிசீலனையில் உள்ளது.",
        "te": "మీ మునుపటి విత్‌డ్రా అభ్యర్థన ఇంకా పెండింగ్‌లో ఉంది.",
        "kn": "ನಿಮ್ಮ ಹಿಂದಿನ ವಿತ್‌ಡ್ರಾ ವಿನಂತಿ ಇನ್ನೂ ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ.",
        "hi": "आपका पिछला निकासी अनुरोध अभी भी समीक्षाधीन है।",
    },

    # 4. Documents & KYC
    "DC_DOC_EXPIRED": {
        "en": "Document has expired. Please upload the latest renewed document.",
        "ta": "ஆவணம் காலாவதியாகிவிட்டது (Expired). புதுப்பித்த ஆவணத்தை பதிவேற்றவும்.",
        "te": "డాక్యుమెంట్ Expire అయింది. కొత్తది అప్‌లోడ్ చేయండి.",
        "kn": "ದಾಖಲೆ Expire ಆಗಿದೆ. ಹೊಸದನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
        "hi": "दस्तावेज़ की अवधि समाप्त हो गई है। कृपया नवीनीकृत दस्तावेज़ अपलोड करें।",
    },
    "DC_DOC_INVALID_DATE": {
        "en": "The date you entered does not match the date printed on the document.",
        "ta": "நீங்கள் பதிவு செய்த தேதியும் ஆவணத்தில் உள்ள தேதியும் பொருந்தவில்லை.",
        "te": "మీరు నమోదు చేసిన తేదీ డాక్యుమెంట్‌లోని తేదీతో సరిపోలలేదు.",
        "kn": "ನೀವು ನಮೂದಿಸಿದ ದಿನಾಂಕ ದಾಖಲೆಯಲ್ಲಿರುವ ದಿನಾಂಕದೊಂದಿಗೆ ಹೊಂದಿಕೆಯಾಗುತ್ತಿಲ್ಲ.",
        "hi": "दर्ज की गई तारीख दस्तावेज़ पर छपी तारीख से मेल नहीं खाती।",
    },
    "DC_DOC_BLURRY": {
        "en": "Uploaded photo is blurry or unreadable. Please upload a clear original photo.",
        "ta": "பதிவேற்றிய படம் தெளிவாக இல்லை. அசல் ஆவணத்தை தெளிவாக படம் எடுத்து பதிவேற்றவும்.",
        "te": "ఫోటో స్పష్టంగా లేదు. దయచేసి స్పష్టమైన ఫోటోను అప్‌లోడ్ చేయండి.",
        "kn": "ಫೋಟೋ ಸ್ಪಷ್ಟವಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಸ್ಪಷ್ಟವಾದ ಮೂಲ ಫೋಟೋವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
        "hi": "अपलोड किया गया फोटो धुंधला है। कृपया स्पष्ट मूल फोटो अपलोड करें।",
    },

    # 5. Auth & General
    "DC_INVALID_LOGIN": {
        "en": "Invalid phone number or password.",
        "ta": "தவறான மொபைல் எண் அல்லது கடவுச்சொல்.",
        "te": "తప్పు ఫోన్ నంబర్ లేదా పాస్‌వర్డ్.",
        "kn": "ತಪ್ಪು ಫೋನ್ ಸಂಖ್ಯೆ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್.",
        "hi": "गलत फोन नंबर या पासवर्ड।",
    },
    "DC_SESSION_EXPIRED": {
        "en": "Your session has expired. Please login again.",
        "ta": "உங்கள் அமர்வு முடிந்துவிட்டது (Session Expired). மீண்டும் உள்நுழையவும்.",
        "te": "మీ సెషన్ ముగిసింది. దయచేసి మళ్లీ లాగిన్ అవ్వండి.",
        "kn": "ನಿಮ್ಮ ಸೆಷನ್ ಮುಗಿದಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಲಾಗಿನ್ ಮಾಡಿ.",
        "hi": "आपका सत्र समाप्त हो गया है। कृपया पुनः लॉगिन करें।",
    },
    "DC_RATE_LIMIT_EXCEEDED": {
        "en": "Too many requests. Please wait a moment and try again.",
        "ta": "அதிகப்படியான முயற்சிகள். சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
        "te": "చాలా ఎక్కువ అభ్యర్థనలు. కాసేపు ఆగి మళ్లీ ప్రయత్నించండి.",
        "kn": "ಹೆಚ್ಚಿನ ವಿನಂತಿಗಳು. ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
        "hi": "बहुत अधिक अनुरोध। कृपया कुछ समय बाद पुनः प्रयास करें।",
    },
    "DC_SERVER_ERROR": {
        "en": "Something went wrong on the server. Please try again later.",
        "ta": "சர்வரில் ஏதோ தவறு நடந்துவிட்டது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
        "te": "సర్వర్‌లో సమస్య ఏర్పడింది. దయచేసి కాసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.",
        "kn": "ಸರ್ವರ್‌ನಲ್ಲಿ ಸಮಸ್ಯೆ ಉಂಟಾಗಿದೆ. ದಯವಿಟ್ಟು ನಂತರ ಪ್ರಯತ್ನಿಸಿ.",
        "hi": "सर्वर पर कुछ गलत हो गया। कृपया बाद में पुनः प्रयास करें।",
    },
}


def get_user_message(code: str, lang: str = "en") -> str:
    """Retrieve localized user message by code, falling back to English."""
    entry = USER_MESSAGES_CATALOG.get(code)
    if not entry:
        return code
    return entry.get(lang) or entry.get("en") or code


def raise_user_error(
    status_code: int,
    code: str,
    detail_fallback: Optional[str] = None,
    headers: Optional[Dict[str, str]] = None,
):
    """Raise HTTPException with standard code and detail."""
    detail = detail_fallback or get_user_message(code, "en")
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": detail},
        headers=headers,
    )
