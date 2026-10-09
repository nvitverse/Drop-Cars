"""Automatic replies in the guest help chat (a driver / owner who cannot log in and wrote to Admin from the forgot-password screen).

Flow (owner, 2026-10-02):
  1. The request arrives -> the first automatic message asks for a language (reply 1-5).
  2. The language is remembered for the chat. The answer for the request's reason is sent in that language, with the masked
     e-mail the code goes to when that helps.
  3. After that: "MENU" lists topics (1-5); a number, or a word like otp / password / mobile, gets the matching answer; anything else
     gets a short "we have your message" (at most once every 10 minutes) and waits for a person.
  A real person's reply (sender other than the automatic one) switches the bot off for an hour so staff and bot never talk over each other.
No account details are sent except the masked e-mail address (a stranger can type any mobile number into the help form).
"""
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.support_message import SupportMessage

AUTO_SENDER = "Drop Cars Support (auto)"
LANGS = ("en", "ta", "te", "hi", "kn")
HUMAN_QUIET_MINUTES = 60
ACK_EVERY_MINUTES = 10

LANGUAGE_PROMPT = (
    "\U0001F310 Select your language / உங்கள் மொழியைத் தேர்ந்தெடுக்கவும் / మీ భాషను ఎంచుకోండి / अपनी भाषा चुनें / ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ\n\n"
    "Reply with a number:\n1 - English\n2 - தமிழ்\n3 - తెలుగు\n4 - हिन्दी\n5 - ಕನ್ನಡ"
)

_NAMES = {
    "en": ("english", "இங்கிலீஷ்"),
    "ta": ("tamil", "தமிழ்", "tamizh"),
    "te": ("telugu", "తెలుగు"),
    "hi": ("hindi", "हिन्दी", "हिंदी"),
    "kn": ("kannada", "ಕನ್ನಡ"),
}

T = {
    "en": {
        "received": "✅ Your request reached Drop Cars Admin. Replies will appear in this chat.",
        "identity": "Please reply here with your full name, vehicle number and a clear photo (or voice note) of your DL / Aadhaar. Admin will verify and correct it.",
        "no_email": "Your account has no email, so the reset code cannot reach you. Reply here with your full name, vehicle number and the email you want linked. Admin will verify and link it.",
        "otp": "Please check Spam / Promotions, wait 2 minutes and request the code only once (many requests block it). {email_line}Still nothing? Reply here and Admin will help.",
        "mobile": "Reply here with your registered mobile number, the new number and your full name. Admin will verify and update it.",
        "password": "Tap Forgot password and enter the code sent to your email. {email_line}If the account is locked or you cannot get the code, reply here with your full name and vehicle number, and Admin will verify you.",
        "other": "Please write your problem here in one message (text or voice). Admin will reply in this chat.",
        "email_line": "The code goes to {email}. ",
        "menu": "What do you need help with? Reply with a number:\n1 - Forgot password\n2 - OTP / code not coming\n3 - Change mobile number\n4 - Documents / verification\n5 - Talk to Admin",
        "menu_hint": "Type MENU anytime to see the options.",
        "ack": "Thanks, we have your message. Admin will verify and reply here.",
    },
    "ta": {
        "received": "✅ உங்கள் கோரிக்கை Drop Cars Admin-க்கு சென்றது. பதில்கள் இந்த chat-லேயே வரும்.",
        "identity": "உங்கள் முழுப் பெயர், வாகன எண் மற்றும் DL / ஆதார் தெளிவான படத்தை (அல்லது voice) இங்கே அனுப்புங்கள். Admin சரிபார்த்து சரி செய்வார்.",
        "no_email": "உங்கள் கணக்கில் email இல்லை, அதனால் code வராது. உங்கள் முழுப் பெயர், வாகன எண் மற்றும் இணைக்க வேண்டிய email-ஐ இங்கே அனுப்புங்கள். Admin சரிபார்த்து இணைப்பார்.",
        "otp": "Spam / Promotions folder-ஐ பாருங்கள், 2 நிமிடம் காத்திருந்து code-ஐ ஒரு முறை மட்டும் கேளுங்கள் (அதிகமாகக் கேட்டால் தடை ஆகும்). {email_line}வரவில்லை என்றால் இங்கே பதில் அனுப்புங்கள், Admin உதவுவார்.",
        "mobile": "பதிவு செய்த எண், புதிய எண் மற்றும் உங்கள் முழுப் பெயரை இங்கே அனுப்புங்கள். Admin சரிபார்த்து மாற்றுவார்.",
        "password": "Forgot password-ஐ தொட்டு உங்கள் email-க்கு வந்த code-ஐ உள்ளிடுங்கள். {email_line}கணக்கு lock ஆகியிருந்தால் அல்லது code வரவில்லை என்றால், உங்கள் முழுப் பெயர் மற்றும் வாகன எண்ணை இங்கே அனுப்புங்கள், Admin சரிபார்ப்பார்.",
        "other": "உங்கள் பிரச்சனையை இங்கே ஒரே செய்தியாக எழுதுங்கள் (எழுத்து அல்லது voice). Admin இங்கேயே பதில் அளிப்பார்.",
        "email_line": "Code {email}-க்கு வரும். ",
        "menu": "எதில் உதவி வேண்டும்? எண்ணை அனுப்புங்கள்:\n1 - Password மறந்துவிட்டது\n2 - OTP / code வரவில்லை\n3 - மொபைல் எண் மாற்ற\n4 - ஆவணங்கள் / சரிபார்ப்பு\n5 - Admin-உடன் பேச",
        "menu_hint": "Options-ஐ பார்க்க எப்போது வேண்டுமானாலும் MENU என்று அனுப்புங்கள்.",
        "ack": "நன்றி, உங்கள் செய்தி கிடைத்தது. Admin சரிபார்த்து இங்கே பதில் அளிப்பார்.",
    },
    "te": {
        "received": "✅ మీ అభ్యర్థన Drop Cars Admin కు చేరింది. సమాధానాలు ఈ చాట్‌లోనే వస్తాయి.",
        "identity": "మీ పూర్తి పేరు, వాహన నంబర్ మరియు DL / ఆధార్ స్పష్టమైన ఫోటో (లేదా వాయిస్ నోట్) ఇక్కడ పంపండి. Admin ధృవీకరించి సరిచేస్తారు.",
        "no_email": "మీ ఖాతాలో ఈమెయిల్ లేదు, అందుకే కోడ్ రాదు. మీ పూర్తి పేరు, వాహన నంబర్ మరియు లింక్ చేయాల్సిన ఈమెయిల్ ఇక్కడ పంపండి. Admin ధృవీకరించి లింక్ చేస్తారు.",
        "otp": "Spam / Promotions ఫోల్డర్ చూడండి, 2 నిమిషాలు ఆగి కోడ్‌ను ఒక్కసారి మాత్రమే అడగండి (ఎక్కువసార్లు అడిగితే బ్లాక్ అవుతుంది). {email_line}రాకపోతే ఇక్కడ రిప్లై ఇవ్వండి, Admin సహాయం చేస్తారు.",
        "mobile": "మీ రిజిస్టర్డ్ మొబైల్ నంబర్, కొత్త నంబర్ మరియు పూర్తి పేరు ఇక్కడ పంపండి. Admin ధృవీకరించి మారుస్తారు.",
        "password": "Forgot password నొక్కి మీ ఈమెయిల్‌కు వచ్చిన కోడ్‌ను నమోదు చేయండి. {email_line}ఖాతా లాక్ అయితే లేదా కోడ్ రాకపోతే, మీ పూర్తి పేరు మరియు వాహన నంబర్ ఇక్కడ పంపండి, Admin ధృవీకరిస్తారు.",
        "other": "మీ సమస్యను ఇక్కడ ఒకే సందేశంగా రాయండి (టెక్స్ట్ లేదా వాయిస్). Admin ఇక్కడే సమాధానం ఇస్తారు.",
        "email_line": "కోడ్ {email} కు వస్తుంది. ",
        "menu": "మీకు ఏ విషయంలో సహాయం కావాలి? నంబర్ పంపండి:\n1 - పాస్‌వర్డ్ మర్చిపోయాను\n2 - OTP / కోడ్ రావడం లేదు\n3 - మొబైల్ నంబర్ మార్చడం\n4 - డాక్యుమెంట్లు / వెరిఫికేషన్\n5 - Adminతో మాట్లాడాలి",
        "menu_hint": "ఆప్షన్లు చూడటానికి ఎప్పుడైనా MENU అని పంపండి.",
        "ack": "ధన్యవాదాలు, మీ సందేశం అందింది. Admin ధృవీకరించి ఇక్కడే సమాధానం ఇస్తారు.",
    },
    "hi": {
        "received": "✅ आपका अनुरोध Drop Cars Admin तक पहुँच गया है। जवाब इसी चैट में आएँगे।",
        "identity": "कृपया अपना पूरा नाम, वाहन नंबर और DL / आधार की साफ़ फोटो (या वॉइस नोट) यहाँ भेजें। Admin जाँचकर सुधार देंगे।",
        "no_email": "आपके खाते में ईमेल नहीं है, इसलिए कोड नहीं पहुँच सकता। अपना पूरा नाम, वाहन नंबर और जोड़ने वाला ईमेल यहाँ भेजें। Admin जाँचकर जोड़ देंगे।",
        "otp": "Spam / Promotions फ़ोल्डर देखें, 2 मिनट रुकें और कोड सिर्फ़ एक बार माँगें (बार-बार माँगने पर रुक जाता है)। {email_line}फिर भी न आए तो यहाँ जवाब दें, Admin मदद करेंगे।",
        "mobile": "अपना रजिस्टर्ड मोबाइल नंबर, नया नंबर और पूरा नाम यहाँ भेजें। Admin जाँचकर बदल देंगे।",
        "password": "Forgot password दबाकर अपने ईमेल पर आया कोड डालें। {email_line}खाता लॉक हो या कोड न आए तो अपना पूरा नाम और वाहन नंबर यहाँ भेजें, Admin जाँच करेंगे।",
        "other": "अपनी समस्या यहाँ एक संदेश में लिखें (टेक्स्ट या वॉइस)। Admin यहीं जवाब देंगे।",
        "email_line": "कोड {email} पर जाता है। ",
        "menu": "किस बारे में मदद चाहिए? नंबर भेजें:\n1 - पासवर्ड भूल गया\n2 - OTP / कोड नहीं आ रहा\n3 - मोबाइल नंबर बदलना\n4 - दस्तावेज़ / वेरिफिकेशन\n5 - Admin से बात करनी है",
        "menu_hint": "विकल्प देखने के लिए कभी भी MENU भेजें।",
        "ack": "धन्यवाद, आपका संदेश मिल गया। Admin जाँचकर यहीं जवाब देंगे।",
    },
    "kn": {
        "received": "✅ ನಿಮ್ಮ ಮನವಿ Drop Cars Admin ಗೆ ತಲುಪಿದೆ. ಉತ್ತರಗಳು ಈ ಚಾಟ್‌ನಲ್ಲೇ ಬರುತ್ತವೆ.",
        "identity": "ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರು, ವಾಹನ ಸಂಖ್ಯೆ ಮತ್ತು DL / ಆಧಾರ್‌ನ ಸ್ಪಷ್ಟ ಫೋಟೋ (ಅಥವಾ ವಾಯ್ಸ್) ಇಲ್ಲಿ ಕಳುಹಿಸಿ. Admin ಪರಿಶೀಲಿಸಿ ಸರಿಪಡಿಸುತ್ತಾರೆ.",
        "no_email": "ನಿಮ್ಮ ಖಾತೆಯಲ್ಲಿ ಇಮೇಲ್ ಇಲ್ಲ, ಆದ್ದರಿಂದ ಕೋಡ್ ಬರುವುದಿಲ್ಲ. ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರು, ವಾಹನ ಸಂಖ್ಯೆ ಮತ್ತು ಜೋಡಿಸಬೇಕಾದ ಇಮೇಲ್ ಇಲ್ಲಿ ಕಳುಹಿಸಿ. Admin ಪರಿಶೀಲಿಸಿ ಜೋಡಿಸುತ್ತಾರೆ.",
        "otp": "Spam / Promotions ಫೋಲ್ಡರ್ ನೋಡಿ, 2 ನಿಮಿಷ ಕಾದು ಕೋಡ್ ಅನ್ನು ಒಮ್ಮೆ ಮಾತ್ರ ಕೇಳಿ (ಹೆಚ್ಚು ಬಾರಿ ಕೇಳಿದರೆ ನಿಲ್ಲುತ್ತದೆ). {email_line}ಬರದಿದ್ದರೆ ಇಲ್ಲಿ ಉತ್ತರಿಸಿ, Admin ಸಹಾಯ ಮಾಡುತ್ತಾರೆ.",
        "mobile": "ನಿಮ್ಮ ನೋಂದಾಯಿತ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ, ಹೊಸ ಸಂಖ್ಯೆ ಮತ್ತು ಪೂರ್ಣ ಹೆಸರು ಇಲ್ಲಿ ಕಳುಹಿಸಿ. Admin ಪರಿಶೀಲಿಸಿ ಬದಲಾಯಿಸುತ್ತಾರೆ.",
        "password": "Forgot password ಒತ್ತಿ ನಿಮ್ಮ ಇಮೇಲ್‌ಗೆ ಬಂದ ಕೋಡ್ ನಮೂದಿಸಿ. {email_line}ಖಾತೆ ಲಾಕ್ ಆಗಿದ್ದರೆ ಅಥವಾ ಕೋಡ್ ಬರದಿದ್ದರೆ, ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರು ಮತ್ತು ವಾಹನ ಸಂಖ್ಯೆ ಇಲ್ಲಿ ಕಳುಹಿಸಿ, Admin ಪರಿಶೀಲಿಸುತ್ತಾರೆ.",
        "other": "ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ಇಲ್ಲಿ ಒಂದೇ ಸಂದೇಶದಲ್ಲಿ ಬರೆಯಿರಿ (ಪಠ್ಯ ಅಥವಾ ವಾಯ್ಸ್). Admin ಇಲ್ಲೇ ಉತ್ತರಿಸುತ್ತಾರೆ.",
        "email_line": "ಕೋಡ್ {email} ಗೆ ಬರುತ್ತದೆ. ",
        "menu": "ಯಾವ ವಿಷಯದಲ್ಲಿ ಸಹಾಯ ಬೇಕು? ಸಂಖ್ಯೆ ಕಳುಹಿಸಿ:\n1 - ಪಾಸ್‌ವರ್ಡ್ ಮರೆತಿದ್ದೇನೆ\n2 - OTP / ಕೋಡ್ ಬರುತ್ತಿಲ್ಲ\n3 - ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಬದಲಾವಣೆ\n4 - ದಾಖಲೆಗಳು / ಪರಿಶೀಲನೆ\n5 - Admin ಜೊತೆ ಮಾತನಾಡಬೇಕು",
        "menu_hint": "ಆಯ್ಕೆಗಳನ್ನು ನೋಡಲು ಯಾವಾಗ ಬೇಕಾದರೂ MENU ಕಳುಹಿಸಿ.",
        "ack": "ಧನ್ಯವಾದಗಳು, ನಿಮ್ಮ ಸಂದೇಶ ತಲುಪಿದೆ. Admin ಪರಿಶೀಲಿಸಿ ಇಲ್ಲೇ ಉತ್ತರಿಸುತ್ತಾರೆ.",
    },
}

_MENU_TOPIC = {"1": "password", "2": "otp", "3": "mobile", "4": "identity", "5": "other"}


def topic_for_reason(reason: str) -> str:
    r = (reason or "").lower()
    if "identity" in r or "aadhaar" in r:
        return "identity"
    if "no email" in r:
        return "no_email"
    if "otp" in r or "inbox" in r or "spam" in r:
        return "otp"
    if "mobile" in r or "number" in r:
        return "mobile"
    if "password" in r or "locked" in r or "forgot" in r:
        return "password"
    return "other"


def detect_language(text: str) -> Optional[str]:
    t = (text or "").strip().lower()
    if t in ("1", "2", "3", "4", "5"):
        return LANGS[int(t) - 1]
    for code, names in _NAMES.items():
        if any(n in t for n in names):
            return code
    return None


def _masked_email(db: Session, role: str, thread_key: str) -> Optional[str]:
    try:
        if role == "OWNER":
            from app.models.vehicle_owner import VehicleOwnerCredentials as M
        else:
            from app.models.car_driver import CarDriver as M
        row = db.query(M).filter(M.id == thread_key).first()
        email = getattr(row, "email", None)
        if not email or "@" not in email:
            return None
        name, domain = email.split("@", 1)
        return f"{name[:1]}***@{domain}"
    except Exception:  # noqa: BLE001
        db.rollback()
        return None


def _topic_text(db: Session, token, lang: str, topic: str) -> str:
    t = T[lang]
    body = t[topic]
    if "{email_line}" in body:
        email = _masked_email(db, token.role, token.thread_key)
        body = body.replace("{email_line}", t["email_line"].replace("{email}", email) if email else "")
    return body


def _post(db: Session, token, text: str) -> None:
    prior = db.query(SupportMessage).filter(SupportMessage.thread_key == token.thread_key).order_by(SupportMessage.id.asc()).first()
    db.add(SupportMessage(
        thread_key=token.thread_key, thread_role=token.role, thread_name=prior.thread_name if prior else None,
        sender_side="ADMIN", sender_name=AUTO_SENDER, text=text,
    ))
    db.commit()

# ---------------------------------------------------------------------------------------------------------------------------------------------------
# v2 (2026-10-10): more solved in the chat itself - trip OTP, customer number, payment answers; and a step-by-step "collect the details" flow, so that
# when the e-mail is not registered (or the number must change) the person gives everything Admin needs in the chat and Admin only has to verify it.
# The trip OTP is NEVER shared: the customer tells it to the driver.
# ---------------------------------------------------------------------------------------------------------------------------------------------------
_EXTRA = {
    "en": {
        "trip_otp": "\U0001F510 About the trip OTP: the start / end OTP of a booking is told by the CUSTOMER at pickup / drop. Drop Cars staff never share it - it protects you and the customer. Ask the customer to read it out and type it in your app. If the customer does not answer, tap Call customer in the booking, wait a few minutes and write the booking number here - we will help without sharing the OTP.",
        "customer_number": "\U0001F4DE Customer number: it appears in your app after you accept, when the reveal time set for that booking arrives (usually closer to pickup). It is hidden before that on purpose. If the time has passed and it still does not show, send the booking number here.",
        "payment": "\U0001F4B0 Wallet / payment: trip money and commission are in Wallet > History. A top-up or payout can take a few minutes to show. Send the booking number or the payment reference (UTR) here and Admin will check it.",
        "menu": "What do you need help with? Reply with a number:\n1 - Forgot password\n2 - Login OTP / code not coming\n3 - Change mobile number\n4 - Documents / verification\n5 - Talk to Admin\n6 - Trip (booking) OTP\n7 - Customer number not showing\n8 - Wallet / payment",
        "collect_head": "To fix this quickly I need these from you (you can send them in one message or one by one):",
        "got": "✅ {label}: {value}", "need": "❓ {label}",
        "privacy": "Never send your full Aadhaar number, OTP or password here - the last 4 digits are enough.",
        "complete": "✅ Thank you - I have everything I need. Admin will verify these details and update your account within a few hours (working hours). The answer comes in this chat; you do not need to do anything else.",
        "f_name": "Full name", "f_vehicle": "Vehicle number (like TN 01 AB 1234)", "f_newmobile": "New mobile number", "f_email": "E-mail to link", "f_id4": "Aadhaar last 4 digits (or DL number)",
        "lang_hint": "Reply 1 English, 2 தமிழ், 3 తెలుగు, 4 हिन्दी, 5 ಕನ್ನಡ to continue in your language.",
    },
    "ta": {
        "trip_otp": "\U0001F510 Trip OTP பற்றி: booking-ன் start / end OTP-ஐ pickup / drop-ல் CUSTOMER தான் சொல்வார். Drop Cars staff அதை ஒருபோதும் பகிர மாட்டார்கள் - அது உங்களையும் customer-ஐயும் பாதுகாக்கிறது. Customer-இடம் கேட்டு உங்கள் app-ல் உள்ளிடுங்கள். Customer பதில் சொல்லவில்லை என்றால் booking-ல் Call customer தொட்டு சில நிமிடம் காத்திருந்து, booking எண்ணை இங்கே அனுப்புங்கள் - OTP-ஐ பகிராமலே உதவுவோம்.",
        "customer_number": "\U0001F4DE Customer எண்: நீங்கள் accept செய்த பின், அந்த booking-க்கு வைத்த நேரம் வந்ததும் (பொதுவாக pickup-க்கு அருகில்) உங்கள் app-ல் தெரியும். அதற்கு முன் வேண்டுமென்றே மறைக்கப்படும். நேரம் கடந்தும் தெரியவில்லை என்றால் booking எண்ணை இங்கே அனுப்புங்கள்.",
        "payment": "\U0001F4B0 Wallet / payment: trip பணமும் commission-ம் Wallet > History-ல் இருக்கும். Top-up அல்லது payout தெரிய சில நிமிடம் ஆகலாம். Booking எண் அல்லது payment reference (UTR)-ஐ இங்கே அனுப்புங்கள், Admin சரிபார்ப்பார்.",
        "menu": "எதில் உதவி வேண்டும்? எண்ணை அனுப்புங்கள்:\n1 - Password மறந்துவிட்டது\n2 - Login OTP / code வரவில்லை\n3 - மொபைல் எண் மாற்ற\n4 - ஆவணங்கள் / சரிபார்ப்பு\n5 - Admin-உடன் பேச\n6 - Trip (booking) OTP\n7 - Customer எண் தெரியவில்லை\n8 - Wallet / payment",
        "collect_head": "இதை விரைவாக சரி செய்ய உங்களிடம் இவை தேவை (ஒரே செய்தியாகவோ ஒவ்வொன்றாகவோ அனுப்பலாம்):",
        "got": "✅ {label}: {value}", "need": "❓ {label}",
        "privacy": "முழு ஆதார் எண், OTP, password-ஐ இங்கே அனுப்ப வேண்டாம் - கடைசி 4 இலக்கம் போதும்.",
        "complete": "✅ நன்றி - தேவையான எல்லாம் கிடைத்துவிட்டது. Admin இவற்றை சரிபார்த்து சில மணி நேரத்தில் (வேலை நேரத்தில்) உங்கள் கணக்கை புதுப்பிப்பார். பதில் இந்த chat-லேயே வரும்; வேறு எதுவும் செய்ய வேண்டாம்.",
        "f_name": "முழுப் பெயர்", "f_vehicle": "வாகன எண் (TN 01 AB 1234 போல)", "f_newmobile": "புதிய மொபைல் எண்", "f_email": "இணைக்க வேண்டிய email", "f_id4": "ஆதார் கடைசி 4 இலக்கம் (அல்லது DL எண்)",
        "lang_hint": "1 English, 2 தமிழ், 3 తెలుగు, 4 हिन्दी, 5 ಕನ್ನಡ - உங்கள் மொழியில் தொடர எண்ணை அனுப்புங்கள்.",
    },
    "te": {
        "trip_otp": "\U0001F510 Trip OTP గురించి: booking యొక్క start / end OTP ని pickup / drop వద్ద CUSTOMER చెబుతారు. Drop Cars సిబ్బంది దీన్ని ఎప్పుడూ పంచుకోరు - ఇది మిమ్మల్ని, కస్టమర్‌ని రక్షిస్తుంది. కస్టమర్‌ను అడిగి మీ app లో నమోదు చేయండి. కస్టమర్ స్పందించకపోతే booking లో Call customer నొక్కి కొన్ని నిమిషాలు ఆగి, booking నంబర్‌ను ఇక్కడ పంపండి - OTP పంచుకోకుండానే సహాయం చేస్తాం.",
        "customer_number": "\U0001F4DE Customer నంబర్: మీరు accept చేసిన తర్వాత, ఆ booking కు పెట్టిన సమయం వచ్చినప్పుడు (సాధారణంగా pickup దగ్గర) మీ app లో కనిపిస్తుంది. అప్పటి వరకు కావాలనే దాచబడుతుంది. సమయం దాటినా కనిపించకపోతే booking నంబర్ ఇక్కడ పంపండి.",
        "payment": "\U0001F4B0 Wallet / payment: trip డబ్బు, commission Wallet > History లో ఉంటాయి. Top-up లేదా payout కనిపించడానికి కొన్ని నిమిషాలు పట్టవచ్చు. Booking నంబర్ లేదా payment reference (UTR) ఇక్కడ పంపండి, Admin చూస్తారు.",
        "menu": "మీకు ఏ విషయంలో సహాయం కావాలి? నంబర్ పంపండి:\n1 - పాస్‌వర్డ్ మర్చిపోయాను\n2 - Login OTP / కోడ్ రావడం లేదు\n3 - మొబైల్ నంబర్ మార్చడం\n4 - డాక్యుమెంట్లు / వెరిఫికేషన్\n5 - Adminతో మాట్లాడాలి\n6 - Trip (booking) OTP\n7 - Customer నంబర్ కనిపించడం లేదు\n8 - Wallet / payment",
        "collect_head": "దీన్ని త్వరగా సరిచేయడానికి నాకు ఇవి కావాలి (ఒకే సందేశంలో లేదా ఒక్కొక్కటిగా పంపవచ్చు):",
        "got": "✅ {label}: {value}", "need": "❓ {label}",
        "privacy": "పూర్తి ఆధార్ నంబర్, OTP, పాస్‌వర్డ్ ఇక్కడ పంపవద్దు - చివరి 4 అంకెలు చాలు.",
        "complete": "✅ ధన్యవాదాలు - కావలసినవన్నీ అందాయి. Admin వీటిని ధృవీకరించి కొన్ని గంటల్లో (పని వేళల్లో) మీ ఖాతాను అప్‌డేట్ చేస్తారు. సమాధానం ఈ చాట్‌లోనే వస్తుంది; మీరు ఇంకేమీ చేయనవసరం లేదు.",
        "f_name": "పూర్తి పేరు", "f_vehicle": "వాహన నంబర్ (TN 01 AB 1234 లా)", "f_newmobile": "కొత్త మొబైల్ నంబర్", "f_email": "లింక్ చేయాల్సిన ఈమెయిల్", "f_id4": "ఆధార్ చివరి 4 అంకెలు (లేదా DL నంబర్)",
        "lang_hint": "1 English, 2 தமிழ், 3 తెలుగు, 4 हिन्दी, 5 ಕನ್ನಡ - మీ భాషలో కొనసాగడానికి నంబర్ పంపండి.",
    },
    "hi": {
        "trip_otp": "\U0001F510 Trip OTP के बारे में: booking का start / end OTP pickup / drop पर CUSTOMER बताता है। Drop Cars का स्टाफ इसे कभी साझा नहीं करता - यह आपको और कस्टमर को सुरक्षित रखता है। कस्टमर से पूछकर अपने app में डालें। कस्टमर जवाब न दे तो booking में Call customer दबाएँ, कुछ मिनट रुकें और booking नंबर यहाँ भेजें - OTP साझा किए बिना हम मदद करेंगे।",
        "customer_number": "\U0001F4DE Customer नंबर: accept करने के बाद, उस booking के लिए तय समय आने पर (आमतौर पर pickup के पास) आपके app में दिखता है। उससे पहले जानबूझकर छिपा रहता है। समय बीतने पर भी न दिखे तो booking नंबर यहाँ भेजें।",
        "payment": "\U0001F4B0 Wallet / payment: trip का पैसा और commission Wallet > History में हैं। Top-up या payout दिखने में कुछ मिनट लग सकते हैं। Booking नंबर या payment reference (UTR) यहाँ भेजें, Admin जाँच करेंगे।",
        "menu": "किस बारे में मदद चाहिए? नंबर भेजें:\n1 - पासवर्ड भूल गया\n2 - Login OTP / कोड नहीं आ रहा\n3 - मोबाइल नंबर बदलना\n4 - दस्तावेज़ / वेरिफिकेशन\n5 - Admin से बात करनी है\n6 - Trip (booking) OTP\n7 - Customer नंबर नहीं दिख रहा\n8 - Wallet / payment",
        "collect_head": "इसे जल्दी ठीक करने के लिए मुझे ये चाहिए (एक संदेश में या एक-एक करके भेज सकते हैं):",
        "got": "✅ {label}: {value}", "need": "❓ {label}",
        "privacy": "पूरा आधार नंबर, OTP या पासवर्ड यहाँ न भेजें - आखिरी 4 अंक काफ़ी हैं।",
        "complete": "✅ धन्यवाद - ज़रूरी सब कुछ मिल गया। Admin इन्हें जाँचकर कुछ घंटों में (कार्य समय में) आपका खाता अपडेट करेंगे। जवाब इसी चैट में आएगा; आपको और कुछ करने की ज़रूरत नहीं।",
        "f_name": "पूरा नाम", "f_vehicle": "वाहन नंबर (जैसे TN 01 AB 1234)", "f_newmobile": "नया मोबाइल नंबर", "f_email": "जोड़ने वाला ईमेल", "f_id4": "आधार के आखिरी 4 अंक (या DL नंबर)",
        "lang_hint": "1 English, 2 தமிழ், 3 తెలుగు, 4 हिन्दी, 5 ಕನ್ನಡ - अपनी भाषा में जारी रखने के लिए नंबर भेजें।",
    },
    "kn": {
        "trip_otp": "\U0001F510 Trip OTP ಬಗ್ಗೆ: booking ನ start / end OTP ಅನ್ನು pickup / drop ನಲ್ಲಿ CUSTOMER ಹೇಳುತ್ತಾರೆ. Drop Cars ಸಿಬ್ಬಂದಿ ಅದನ್ನು ಎಂದಿಗೂ ಹಂಚಿಕೊಳ್ಳುವುದಿಲ್ಲ - ಇದು ನಿಮ್ಮನ್ನು ಮತ್ತು ಗ್ರಾಹಕರನ್ನು ರಕ್ಷಿಸುತ್ತದೆ. ಗ್ರಾಹಕರನ್ನು ಕೇಳಿ ನಿಮ್ಮ app ನಲ್ಲಿ ನಮೂದಿಸಿ. ಗ್ರಾಹಕರು ಉತ್ತರಿಸದಿದ್ದರೆ booking ನಲ್ಲಿ Call customer ಒತ್ತಿ ಕೆಲವು ನಿಮಿಷ ಕಾದು, booking ಸಂಖ್ಯೆಯನ್ನು ಇಲ್ಲಿ ಕಳುಹಿಸಿ - OTP ಹಂಚಿಕೊಳ್ಳದೆ ಸಹಾಯ ಮಾಡುತ್ತೇವೆ.",
        "customer_number": "\U0001F4DE Customer ಸಂಖ್ಯೆ: ನೀವು accept ಮಾಡಿದ ನಂತರ, ಆ booking ಗೆ ನಿಗದಿಯಾದ ಸಮಯ ಬಂದಾಗ (ಸಾಮಾನ್ಯವಾಗಿ pickup ಹತ್ತಿರ) ನಿಮ್ಮ app ನಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ. ಅದಕ್ಕೂ ಮೊದಲು ಉದ್ದೇಶಪೂರ್ವಕವಾಗಿ ಮರೆಮಾಡಲಾಗುತ್ತದೆ. ಸಮಯ ಕಳೆದರೂ ಕಾಣದಿದ್ದರೆ booking ಸಂಖ್ಯೆಯನ್ನು ಇಲ್ಲಿ ಕಳುಹಿಸಿ.",
        "payment": "\U0001F4B0 Wallet / payment: trip ಹಣ ಮತ್ತು commission Wallet > History ನಲ್ಲಿವೆ. Top-up ಅಥವಾ payout ಕಾಣಲು ಕೆಲವು ನಿಮಿಷ ಬೇಕಾಗಬಹುದು. Booking ಸಂಖ್ಯೆ ಅಥವಾ payment reference (UTR) ಇಲ್ಲಿ ಕಳುಹಿಸಿ, Admin ಪರಿಶೀಲಿಸುತ್ತಾರೆ.",
        "menu": "ಯಾವ ವಿಷಯದಲ್ಲಿ ಸಹಾಯ ಬೇಕು? ಸಂಖ್ಯೆ ಕಳುಹಿಸಿ:\n1 - ಪಾಸ್‌ವರ್ಡ್ ಮರೆತಿದ್ದೇನೆ\n2 - Login OTP / ಕೋಡ್ ಬರುತ್ತಿಲ್ಲ\n3 - ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಬದಲಾವಣೆ\n4 - ದಾಖಲೆಗಳು / ಪರಿಶೀಲನೆ\n5 - Admin ಜೊತೆ ಮಾತನಾಡಬೇಕು\n6 - Trip (booking) OTP\n7 - Customer ಸಂಖ್ಯೆ ಕಾಣುತ್ತಿಲ್ಲ\n8 - Wallet / payment",
        "collect_head": "ಇದನ್ನು ಬೇಗ ಸರಿಪಡಿಸಲು ನನಗೆ ಇವು ಬೇಕು (ಒಂದೇ ಸಂದೇಶದಲ್ಲಿ ಅಥವಾ ಒಂದೊಂದಾಗಿ ಕಳುಹಿಸಬಹುದು):",
        "got": "✅ {label}: {value}", "need": "❓ {label}",
        "privacy": "ಪೂರ್ಣ ಆಧಾರ್ ಸಂಖ್ಯೆ, OTP ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್ ಇಲ್ಲಿ ಕಳುಹಿಸಬೇಡಿ - ಕೊನೆಯ 4 ಅಂಕೆಗಳು ಸಾಕು.",
        "complete": "✅ ಧನ್ಯವಾದಗಳು - ಬೇಕಾದದ್ದೆಲ್ಲ ಸಿಕ್ಕಿದೆ. Admin ಇವನ್ನು ಪರಿಶೀಲಿಸಿ ಕೆಲವು ಗಂಟೆಗಳಲ್ಲಿ (ಕೆಲಸದ ಸಮಯದಲ್ಲಿ) ನಿಮ್ಮ ಖಾತೆಯನ್ನು ನವೀಕರಿಸುತ್ತಾರೆ. ಉತ್ತರ ಈ ಚಾಟ್‌ನಲ್ಲೇ ಬರುತ್ತದೆ; ನೀವು ಬೇರೇನೂ ಮಾಡಬೇಕಿಲ್ಲ.",
        "f_name": "ಪೂರ್ಣ ಹೆಸರು", "f_vehicle": "ವಾಹನ ಸಂಖ್ಯೆ (TN 01 AB 1234 ಹಾಗೆ)", "f_newmobile": "ಹೊಸ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ", "f_email": "ಜೋಡಿಸಬೇಕಾದ ಇಮೇಲ್", "f_id4": "ಆಧಾರ್ ಕೊನೆಯ 4 ಅಂಕೆಗಳು (ಅಥವಾ DL ಸಂಖ್ಯೆ)",
        "lang_hint": "1 English, 2 தமிழ், 3 తెలుగు, 4 हिन्दी, 5 ಕನ್ನಡ - ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ಮುಂದುವರಿಯಲು ಸಂಖ್ಯೆ ಕಳುಹಿಸಿ.",
    },
}
for _lg, _d in _EXTRA.items():
    T[_lg].update(_d)
_MENU_TOPIC.update({"6": "trip_otp", "7": "customer_number", "8": "payment"})

# what each topic needs before Admin can act (the number being changed is the one on the help request itself)
REQUIRED = {
    "password": ["name", "vehicle"],
    "no_email": ["name", "vehicle", "email", "id4"],
    "mobile": ["name", "vehicle", "newmobile"],
    "identity": ["name", "vehicle", "id4"],
}
_FIELD_LABEL = {"name": "f_name", "vehicle": "f_vehicle", "newmobile": "f_newmobile", "email": "f_email", "id4": "f_id4"}
_NOT_NAMES = {"ok", "okay", "hello", "hi", "hai", "yes", "no", "thanks", "thank you", "menu", "help", "sir", "madam", "please", "pls", "admin", "otp", "password",
              "நன்றி", "சரி", "ஓகே", "ధన్యవాదాలు", "धन्यवाद", "ಧನ್ಯವಾದ"}


_FILLER = {
    "my", "name", "is", "vehicle", "number", "no", "mobile", "email", "mail", "new", "aadhaar", "aadhar", "adhar", "last", "digits", "digit", "dl", "id", "and", "the", "a", "to", "i", "am",
    "hi", "hello", "hai", "ok", "okay", "yes", "sir", "madam", "please", "pls", "plz", "admin", "otp", "password", "my", "car", "bike", "reg", "registration", "phone", "contact", "details",
    "reset", "change", "problem", "issue", "not", "working", "cannot", "cant", "can't", "unable", "forgot", "forget", "login", "tell", "need", "want", "reply", "help",
    "pannunga", "pannu", "venum", "varala", "vara", "illa", "illai", "enna", "ennaku", "thanks", "thank", "you", "for", "this", "that", "with", "have", "account", "driver", "owner",
}
_REQUEST_WORD = re.compile(r"\b(pannunga|pannu|venum|varala|reset|forgot|forget|problem|issue|help|not working|cannot|can't|unable|please|pls)\b", re.I)

_RE_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
_RE_VEHICLE = re.compile(r"(?<![A-Za-z0-9])([A-Za-z]{2})[\s-]?(\d{1,2})[\s-]?([A-Za-z]{1,3})?[\s-]?(\d{4})(?![A-Za-z0-9])")
_RE_MOBILE = re.compile(r"(?<!\d)(?:\+?91[\s-]?)?([6-9]\d{4}[\s-]?\d{5})(?!\d)")
_RE_AADHAAR12 = re.compile(r"(?<!\d)(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})(?!\d)")
_RE_AADHAAR4 = re.compile(r"(?:aadhaar|aadhar|adhar|ஆதார்|ఆధార్|आधार|ಆಧಾರ್)[^\d]{0,25}(\d{4})(?!\d)", re.I)
_RE_DL = re.compile(r"(?<![A-Za-z0-9])([A-Z]{2}[\s-]?\d{2}[\s-]?(?:19|20)\d{2}[\s-]?\d{7})(?![A-Za-z0-9])", re.I)
_RE_BARE4 = re.compile(r"(?<![\d])(\d{4})(?![\d])")
_RE_WORD = re.compile(r"[A-Za-z஀-௿ఀ-౿ऀ-ॿಀ-೿.]+")


def mask_ids(text: str) -> str:
    """A full 12-digit Aadhaar number typed in the chat is cut to its last 4 digits (the chat is read by many staff; only the last 4 are needed)."""
    def repl(m):
        digits = m.group(1) + m.group(2) + m.group(3)
        if digits.startswith("91") and digits[2] in "6789":        # +91 and a mobile number, not an Aadhaar
            return m.group(0)
        return "XXXX XXXX " + m.group(3)
    return _RE_AADHAAR12.sub(repl, text or "")


def parse_details(text: str, own_number: str = "", bare4: bool = False) -> dict:
    """Pulls the details a person types in the help chat out of free text. Only what is recognised is returned; an Aadhaar number is cut to its last
    4 digits here and the full number is never kept."""
    t = text or ""
    out: dict = {}
    m = _RE_EMAIL.search(t)
    if m:
        out["email"] = m.group(0).lower()
    rest = _RE_EMAIL.sub(" ", t)
    mobiles = []
    for m in _RE_MOBILE.finditer(rest):
        mobiles.append(re.sub(r"[\s-]", "", m.group(1)))
    rest = _RE_MOBILE.sub(" ", rest)                       # first, so a "91 98765 43210" is never mistaken for an Aadhaar number
    new = [n for n in mobiles if n != own_number]
    if new:
        out["newmobile"] = new[0]
    m = _RE_DL.search(rest)
    if m:
        out["id4"] = "DL " + re.sub(r"[\s-]", "", m.group(1)).upper()
        rest = rest.replace(m.group(0), " ")
    m = _RE_AADHAAR12.search(rest)
    if m and "id4" not in out:
        out["id4"] = "XXXX XXXX " + m.group(3)
        rest = rest.replace(m.group(0), " ")
    else:
        m = _RE_AADHAAR4.search(rest)
        if m and "id4" not in out:
            out["id4"] = "XXXX XXXX " + m.group(1)
            rest = rest.replace(m.group(0), " ")
    m = _RE_VEHICLE.search(rest)
    if m:
        out["vehicle"] = (m.group(1) + m.group(2) + (m.group(3) or "") + m.group(4)).upper()
        rest = rest.replace(m.group(0), " ")
    if bare4 and "id4" not in out:
        nums = _RE_BARE4.findall(rest)
        if len(nums) == 1:
            out["id4"] = "XXXX XXXX " + nums[0]
            rest = _RE_BARE4.sub(" ", rest)
    words = [w.strip(".") for w in _RE_WORD.findall(rest) if w.strip(".")]
    kept = [w for w in words if w.lower() not in _FILLER and len(w) >= 2 or (len(w) == 1 and w.isupper() and not w.lower() in _FILLER)]
    only_name = not out
    if kept and len(kept) <= 4 and not (only_name and (_REQUEST_WORD.search(t) or _keyword_topic(t))):
        cand = " ".join(kept)
        if cand.lower() not in _NOT_NAMES:
            out["name"] = cand.title() if cand.isascii() else cand
    return out


def _collected(token) -> dict:
    import json
    try:
        return json.loads(token.collected) if token.collected else {}
    except Exception:       # noqa: BLE001
        return {}


def _save_collected(db: Session, token, data: dict) -> None:
    import json
    token.collected = json.dumps(data, ensure_ascii=False)
    db.commit()


def required_for(db: Session, token, topic: str) -> list:
    req = list(REQUIRED.get(topic, []))
    if topic == "password" and _masked_email(db, token.role, token.thread_key) is None:
        req = ["name", "vehicle", "email", "id4"]               # no e-mail on the account: the reset code cannot reach them, so identity is checked by hand
    return req


def _checklist(lang: str, have: dict, req: list, complete: bool) -> str:
    t = T[lang]
    lines = [t["got"].format(label=t[_FIELD_LABEL[k]].split(" (")[0], value=have[k]) for k in req if k in have]
    if complete:
        return "\n".join(lines) + "\n\n" + t["complete"]
    lines += [t["need"].format(label=t[_FIELD_LABEL[k]]) for k in req if k not in have]
    return f"{t['collect_head']}\n" + "\n".join(lines) + f"\n\n{t['privacy']}"


def _answer(db: Session, token, lang: str, topic: str) -> str:
    """The answer for one topic in one language; topics that need details end with the checklist of what is still missing."""
    body = _topic_text(db, token, lang, topic)
    if topic in REQUIRED:
        req = required_for(db, token, topic)
        have = _collected(token)
        body += "\n\n" + _checklist(lang, have, req, all(k in have for k in req))
    return body


def _reply_for(db: Session, token, lang, topic: str, head: str = "") -> str:
    """lang None = the person has not chosen a language yet: English + Tamil together, and the language chooser at the end (never a bare prompt)."""
    if lang in T:
        return (head and T[lang][head] + "\n\n") + _answer(db, token, lang, topic) + "\n\n" + T[lang]["menu_hint"]
    parts = []
    for lg in ("en", "ta"):
        parts.append((head and T[lg][head] + "\n\n") + _answer(db, token, lg, topic))
    return "\n\n- - -\n\n".join(parts) + "\n\n" + T["en"]["lang_hint"]


def _set_topic(db: Session, token, topic: str) -> None:
    token.topic = topic
    db.commit()


def first_reply(db: Session, token, reason: str = "") -> None:
    """A new help request: answer the reason straight away (English + Tamil until a language is chosen)."""
    topic = topic_for_reason(reason or token.reason or "")
    _set_topic(db, token, topic)
    lang = token.language if token.language in T else None
    _post(db, token, _reply_for(db, token, lang, topic, "received"))


def _script_language(text: str) -> Optional[str]:
    for lg, rng in (("ta", "஀-௿"), ("te", "ఀ-౿"), ("hi", "ऀ-ॿ"), ("kn", "ಀ-೿")):
        if re.search(f"[{rng}]", text or ""):
            return lg
    return None


def _redact_last_guest_message(db: Session, token) -> None:
    last = db.query(SupportMessage).filter(SupportMessage.thread_key == token.thread_key, SupportMessage.sender_side == "DRIVER_OWNER").order_by(SupportMessage.id.desc()).first()
    if last is not None and last.text:
        masked = mask_ids(last.text)
        if masked != last.text:
            last.text = masked
            db.commit()


def handle_details(db: Session, token, text: str, lang: Optional[str]) -> bool:
    """A message that gives details for an open request: remember them, say what is still missing, and when everything is in say Admin will verify it.
    Returns True when it replied."""
    topic = token.topic or topic_for_reason(token.reason or "")
    if topic not in REQUIRED:
        return False
    req = required_for(db, token, topic)
    have = _collected(token)
    found = parse_details(text, token.primary_number or "", bare4=("id4" in req and "id4" not in have))
    found = {k: v for k, v in found.items() if k in req}
    changed = {k: v for k, v in found.items() if have.get(k) != v}
    if not changed:
        return False
    have.update(changed)
    _save_collected(db, token, have)
    complete = all(k in have for k in req)
    if lang in T:
        _post(db, token, _checklist(lang, have, req, complete))
    else:
        _post(db, token, "\n\n- - -\n\n".join(_checklist(lg, have, req, complete) for lg in ("en", "ta")) + "\n\n" + T["en"]["lang_hint"])
    return True


def _keyword_topic(text: str) -> Optional[str]:
    t = (text or "").lower()
    if re.search(r"\b(trip|booking|ride|duty|start|end|customer)\b.{0,25}(otp|code|ஓடிபி|கோட்)|(கஸ்டமர்|பயண).{0,25}(otp|ஓடிபி|கோட்)|(otp|ஓடிபி).{0,25}(customer|trip|booking|கஸ்டமர்)", t):
        return "trip_otp"
    if re.search(r"customer.{0,25}(number|no\b|mobile|phone|contact)|(number|mobile|phone).{0,20}(customer|hidden|not showing|theriyala|தெரியல)|கஸ்டமர்.{0,12}(நம்பர்|எண்)", t):
        return "customer_number"
    if re.search(r"payment|wallet|money|payout|commission|withdraw|refund|settlement|பணம்|வாலட்|కమిషన్|पेमेंट|ಹಣ", t):
        return "payment"
    if re.search(r"aadhaar|aadhar|ஆதார்|licen[cs]e|document|verif|rc book|insurance|ஆவண|పత్ర|दस्तावेज|ದಾಖಲೆ", t):
        return "identity"
    if re.search(r"(change|new|update|maatra|மாற்ற|மாத்த).{0,15}(mobile|number|நம்பர்|எண்)|(mobile|number|நம்பர்|எண்).{0,15}(change|update|மாற்ற|மாத்த)|నంబర్ మార్|नंबर बदल|ಸಂಖ್ಯೆ ಬದಲ", t):
        return "mobile"
    if re.search(r"otp|code|கோடு|கோட்|கோட|கோడ్|कोड|ಕೋಡ್|ஓடிபி|email.{0,15}(வரல|varala|not)", t):
        return "otp"
    if re.search(r"password|pass word|பாஸ்வேர்ட்|పాస్‌వర్డ్|पासवर्ड|ಪಾಸ್‌ವರ್ಡ್|மறந்த|\block(ed)?\b", t):
        return "password"
    if re.search(r"mobile|number|நம்பர்|எண்|నంబర్|नंबर|ಸಂಖ್ಯೆ|ನಂಬರ್", t):
        return "mobile"
    return None


def on_guest_message(db: Session, token, text: str) -> None:
    """The guest wrote in the help chat: answer automatically unless a person is already handling it.
    Every message gets a real answer or a step in collecting the details; the language question is never the whole reply."""
    now = datetime.now(timezone.utc)
    recent = db.query(SupportMessage).filter(
        SupportMessage.thread_key == token.thread_key, SupportMessage.sender_side == "ADMIN",
        SupportMessage.sender_name != AUTO_SENDER, SupportMessage.created_at >= now - timedelta(minutes=HUMAN_QUIET_MINUTES),
    ).first()
    if recent is not None:
        return

    text = (text or "").strip()
    _redact_last_guest_message(db, token)
    last_auto = db.query(SupportMessage).filter(
        SupportMessage.thread_key == token.thread_key, SupportMessage.sender_name == AUTO_SENDER,
    ).order_by(SupportMessage.id.desc()).first()
    last_text = (last_auto.text or "") if last_auto is not None else ""
    low = text.lower()
    menu_shown = T["en"]["menu"].split("\n")[0] in last_text or any(x["menu"].split("\n")[0] in last_text for x in T.values())
    topic_now = token.topic or topic_for_reason(token.reason or "")

    if not token.language:
        chosen = None if (menu_shown and low in _MENU_TOPIC) else detect_language(text)     # "1".."5" are language choices unless the menu was just shown
        new_lang = chosen or _script_language(text)                                           # typed in Tamil / Telugu / Hindi / Kannada: answer in it
        if new_lang:
            token.language = new_lang
            db.commit()
            if chosen and len(text) <= 12:                    # a pure language choice: repeat the current answer in that language
                _post(db, token, _reply_for(db, token, new_lang, topic_now))
                return
    lang = token.language if token.language in T else None
    t = T[lang or "en"]

    if low in ("menu", "help", "0", "மெனு", "మెను", "मेन्यू", "ಮೆನು"):
        if lang:
            _post(db, token, T[lang]["menu"])
        else:
            _post(db, token, T["en"]["menu"] + "\n\n- - -\n\n" + T["ta"]["menu"])
        return

    topic = _MENU_TOPIC.get(low) if (lang or menu_shown) else None
    if topic is None:
        # a person who has an open request giving details (name / vehicle / e-mail / ID digits) is answered with what is still missing
        if topic_now in REQUIRED and handle_details(db, token, text, lang):
            return
        topic = _keyword_topic(text)
    if topic:
        _set_topic(db, token, topic)
        _post(db, token, _reply_for(db, token, lang, topic))
        return

    just_acked = (last_auto is not None and any(x["ack"] in last_text for x in T.values())
                  and last_auto.created_at is not None and last_auto.created_at >= now - timedelta(minutes=ACK_EVERY_MINUTES))
    if not just_acked:                                   # the same "we have your message" is not repeated for every line they send
        if lang:
            _post(db, token, f"{t['ack']}\n\n{t['menu_hint']}")
        else:
            _post(db, token, f"{T['en']['ack']}\n{T['ta']['ack']}\n\n{T['en']['menu_hint']}\n\n{T['en']['lang_hint']}")
