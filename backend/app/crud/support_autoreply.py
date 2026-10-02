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


def _keyword_topic(text: str) -> Optional[str]:
    t = (text or "").lower()
    if re.search(r"otp|code|கோడ్|கோட|कोड|ಕೋಡ್|கோட்|code வ", t):
        return "otp"
    if re.search(r"password|pass word|பாஸ்வேர்ட்|పాస్‌వర్డ్|पासवर्ड|ಪಾಸ್‌ವರ್ಡ್|மறந்த", t):
        return "password"
    if re.search(r"mobile|number|நம்பர்|எண்|నంబర్|नंबर|ಸಂಖ್ಯೆ|ನಂಬರ್", t):
        return "mobile"
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


def first_reply(db: Session, token) -> None:
    """A new help request: ask for the language."""
    _post(db, token, LANGUAGE_PROMPT)


def on_guest_message(db: Session, token, text: str) -> None:
    """The guest wrote in the help chat: answer automatically unless a person is already handling it."""
    now = datetime.now(timezone.utc)
    recent = db.query(SupportMessage).filter(
        SupportMessage.thread_key == token.thread_key, SupportMessage.sender_side == "ADMIN",
        SupportMessage.sender_name != AUTO_SENDER, SupportMessage.created_at >= now - timedelta(minutes=HUMAN_QUIET_MINUTES),
    ).first()
    if recent is not None:
        return

    text = (text or "").strip()
    if not token.language:
        lang = detect_language(text)
        if lang is None:
            _post(db, token, LANGUAGE_PROMPT)
            return
        token.language = lang
        db.commit()
        t = T[lang]
        _post(db, token, f"{t['received']}\n\n{_topic_text(db, token, lang, topic_for_reason(token.reason or ''))}\n\n{t['menu_hint']}")
        return

    lang = token.language if token.language in T else "en"
    t = T[lang]
    low = text.lower()
    if low in ("menu", "help", "0", "மெனு", "మెను", "मेन्यू", "ಮೆನು"):
        _post(db, token, t["menu"])
        return
    # a short question may name a topic; a long message or one with a phone number is someone giving details - leave it to a person
    topic = _MENU_TOPIC.get(low) or (_keyword_topic(text) if len(text) <= 40 and not re.search(r"\d{6,}", text) else None)
    if topic:
        _post(db, token, f"{_topic_text(db, token, lang, topic)}\n\n{t['menu_hint']}")
        return
    last_auto = db.query(SupportMessage).filter(
        SupportMessage.thread_key == token.thread_key, SupportMessage.sender_name == AUTO_SENDER,
    ).order_by(SupportMessage.id.desc()).first()
    just_acked = (last_auto is not None and any(x["ack"] in (last_auto.text or "") for x in T.values())
                  and last_auto.created_at is not None and last_auto.created_at >= now - timedelta(minutes=ACK_EVERY_MINUTES))
    if not just_acked:                                   # the same "we have your message" is not repeated for every line they send
        _post(db, token, f"{t['ack']}\n\n{t['menu_hint']}")
