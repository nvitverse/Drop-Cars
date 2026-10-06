import os
import json
import re
import uuid
import time
import logging
import difflib
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import httpx

logger = logging.getLogger(__name__)

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "ai_training_rules.json")

# In-memory cache for fast response times
_RULES_CACHE: Optional[List[Dict[str, Any]]] = None

# Conversational state store for multi-turn clarification (session_id -> state)
_CONVERSATION_SESSIONS: Dict[str, Dict[str, Any]] = {}
SESSION_TTL_SECONDS = 1800  # 30 minutes

# ---------------------------------------------------------------------------
# City & Taxi Terminology Normalization & Typo Dictionaries
# ---------------------------------------------------------------------------
CITY_ALIASES = {
    # Chennai
    "chenai": "chennai", "chinai": "chennai", "chenna": "chennai", "mas": "chennai", "maa": "chennai", "madras": "chennai", "cheni": "chennai", "chn": "chennai",
    # Coimbatore
    "cbe": "coimbatore", "coimbtore": "coimbatore", "coimbature": "coimbatore", "kovai": "coimbatore", "coimbathore": "coimbatore", "covai": "coimbatore", "coavai": "coimbatore", "cova": "coimbatore",
    # Madurai
    "mdu": "madurai", "madhurai": "madurai", "maddurai": "madurai", "madra": "madurai",
    # Bangalore / Bengaluru
    "blr": "bangalore", "bengaluru": "bangalore", "banglore": "bangalore", "bangalor": "bangalore", "benglur": "bangalore",
    # Trichy / Tiruchirappalli
    "trichi": "trichy", "trchy": "trichy", "thiruchi": "trichy", "tiruchi": "trichy", "tiruchirappalli": "trichy", "tpj": "trichy", "trich": "trichy",
    # Pondicherry / Puducherry
    "pondy": "pondicherry", "puducherry": "pondicherry", "puducheri": "pondicherry", "pondi": "pondicherry",
    # Salem
    "slm": "salem", "selam": "salem", "saalem": "salem", "selm": "salem",
    # Ooty
    "ooti": "ooty", "udhagamandalam": "ooty", "ootty": "ooty", "uoty": "ooty", "oty": "ooty",
    # Kodaikanal
    "kodai": "kodaikanal", "kodaikkanal": "kodaikanal", "kodaiknal": "kodaikanal",
    # Tirupati
    "thirupathi": "tirupati", "tirupathi": "tirupati", "tirupathy": "tirupati", "thirupati": "tirupati",
    # Vellore
    "veloor": "vellore", "vellor": "vellore", "velur": "vellore",
    # Thanjavur / Tanjore
    "tanjore": "thanjavur", "thanjavoor": "thanjavur", "tanjoor": "thanjavur", "tanjavur": "thanjavur",
    # Tirunelveli
    "nellai": "tirunelveli", "thirunelveli": "tirunelveli", "tinnevelly": "tirunelveli", "nelai": "tirunelveli",
    # Kanyakumari
    "kanyakumari": "kanyakumari", "cape": "kanyakumari", "comorin": "kanyakumari", "kumari": "kanyakumari",
    # Others
    "hosoor": "hosur", "dindugul": "dindigul", "erodu": "erode", "polachi": "pollachi",
    "namakal": "namakkal", "karoor": "karur", "nagai": "nagapattinam", "kudanthai": "kumbakonam",
    "rameswaram": "rameswaram", "ramnad": "ramanathapuram", "tiruppur": "tiruppur", "tirupur": "tiruppur",
    "thiruvannamalai": "tiruvannamalai", "tvm": "tiruvannamalai", "chidambaram": "chidambaram",
    # Tamil Unicode Script City Names
    "சென்னை": "chennai", "சேலம்": "salem", "கோவை": "coimbatore", "கோயம்புத்தூர்": "coimbatore",
    "மதுரை": "madurai", "திருச்சி": "trichy", "பெங்களூரு": "bangalore", "பெங்களூர்": "bangalore",
    "பாண்டிச்சேரி": "pondicherry", "புதுச்சேரி": "pondicherry", "ஊட்டி": "ooty", "கொடைக்கானல்": "kodaikanal",
    "திருப்பதி": "tirupati", "வேலூர்": "vellore", "தஞ்சாவூர்": "thanjavur", "திருநெல்வேலி": "tirunelveli",
    "கன்னியாகுமரி": "kanyakumari", "திண்டுக்கல்": "dindigul", "ஈரோடு": "erode", "ஓசூர்": "hosur",
    "திருப்பூர்": "tiruppur", "கரூர்": "karur", "நாகப்பட்டினம்": "nagapattinam", "கும்பகோணம்": "kumbakonam",
    "ராமேஸ்வரம்": "rameswaram", "ராமநாதபுரம்": "ramanathapuram", "திருவண்ணாமலை": "tiruvannamalai", "சிதம்பரம்": "chidambaram"
}

# Ensure canonical cities map to themselves
for _canonical in set(CITY_ALIASES.values()):
    CITY_ALIASES[_canonical] = _canonical

TAXI_ALIASES = {
    "texi": "taxi", "dorp taxi": "drop taxi", "droptaxi": "drop taxi", "drob taxi": "drop taxi",
    "fair": "fare", "kast": "cost", "kattanam": "fare", "katnam": "fare", "vilai": "fare", "charge": "fare",
    "onway": "one-way", "1way": "one-way", "oneway": "one-way", "single trip": "one-way", "single way": "one-way",
    "updown": "round-trip", "up and down": "round-trip", "roundtrip": "round-trip", "retun": "round-trip",
    "return trip": "round-trip", "round trip": "round-trip",
    "inova": "innova", "ertika": "ertiga", "ertigaa": "ertiga",
    "lugage": "luggage", "lagage": "luggage", "saman": "luggage", "bagage": "luggage",
    "tol": "toll", "tollgate": "toll", "fastag": "toll", "batta": "bata", "beta": "bata"
}

# ---------------------------------------------------------------------------
# NLP Normalization & Typo Tolerance Functions
# ---------------------------------------------------------------------------
def normalize_text(text: str) -> str:
    """Cleans text, collapses character runs, normalizes Tamil-English phonetics,
    and replaces known typos/aliases with canonical forms."""
    if not text:
        return ""
    cleaned = text.lower()
    cleaned = re.sub(r'[^a-zA-Z0-9\u0B80-\u0BFF\s]', ' ', cleaned)
    tokens = cleaned.split()
    normalized = []
    for tok in tokens:
        if tok in CITY_ALIASES:
            tok = CITY_ALIASES[tok]
        elif tok in TAXI_ALIASES:
            tok = TAXI_ALIASES[tok]
        else:
            sim = tok
            sim = re.sub(r'([a-z])\1+', r'\1', sim)
            sim = sim.replace('dh', 'd').replace('th', 't').replace('oo', 'u').replace('ee', 'i').replace('w', 'v')
            if sim in CITY_ALIASES:
                tok = CITY_ALIASES[sim]
            elif sim in TAXI_ALIASES:
                tok = TAXI_ALIASES[sim]
            else:
                for alias, canonical in CITY_ALIASES.items():
                    if len(alias) >= 4 and abs(len(tok) - len(alias)) <= 2:
                        ratio = difflib.SequenceMatcher(None, tok, alias).ratio()
                        if ratio >= 0.82:
                            tok = canonical
                            break
        normalized.append(tok)
    return " ".join(normalized)

def fuzzy_similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()

TAMIL_STRIP_SUFFIXES = [
    "யிலிருந்து", "லிருந்து", "இருந்து", "க்கு", "ுக்கு", "ிற்கு", "ில்", "ல்", "வரை", "டூ"
]
TANGLISH_STRIP_SUFFIXES = [
    "lerundhu", "lirundhu", "lendhu", "lendu", "irundhu",
    "kku", "ukku", "ku", "la", "ley", "le"
]

def resolve_single_city(word: str) -> Optional[str]:
    """Resolves a word or token to a canonical city name, stripping common Tamil and Tanglish case suffixes."""
    if not word:
        return None
    w = word.lower().strip()
    if w in CITY_ALIASES:
        return CITY_ALIASES[w]

    # Handle Tamil neuter noun morphology ending in 'ம்' (e.g., சேலத்துக்கு -> சேலம், சேலத்திலிருந்து -> சேலம்)
    for m_suf in ["த்திலிருந்து", "த்திற்கு", "த்துக்கு", "த்தில்"]:
        if w.endswith(m_suf) and len(w) > len(m_suf):
            m_stem = w[:-len(m_suf)] + "ம்"
            if m_stem in CITY_ALIASES:
                return CITY_ALIASES[m_stem]

    # Try stripping Tamil postpositional suffixes
    for suf in TAMIL_STRIP_SUFFIXES:
        if w.endswith(suf) and len(w) > len(suf) + 2:
            base = w[:-len(suf)]
            if base in CITY_ALIASES:
                return CITY_ALIASES[base]
            # Handle euphonic junction letters (e.g., சென்னை + ய + இலிருந்து)
            if base.endswith("ய") or base.endswith("வ"):
                if base[:-1] in CITY_ALIASES:
                    return CITY_ALIASES[base[:-1]]

    # Try stripping Tanglish phonetic suffixes
    for suf in TANGLISH_STRIP_SUFFIXES:
        if w.endswith(suf) and len(w) > len(suf) + 2:
            base = w[:-len(suf)]
            if base in CITY_ALIASES:
                return CITY_ALIASES[base]

    return None

# ---------------------------------------------------------------------------
# Language Detection & Explicit Switch Handling
# ---------------------------------------------------------------------------
TANGLISH_VOCABULARY = {
    "venum", "poganum", "varanum", "evlo", "evalo", "aagum", "iruka", "irukku", "iruku",
    "irukkum", "kudukanum", "tharanum", "mudiyuma", "mudiyum", "theriyum", "theriyanum",
    "puriyala", "purinjidhu", "solunga", "sollu", "keten", "ketaen", "kekuren",
    "innaiku", "naalaiku", "nalaiku", "naalai", "kaalai", "kaalaila", "iravu", "nightla",
    "ippo", "ipove", "udane", "seekiram", "engendhu", "enga", "eppo", "enna", "yenna",
    "edhu", "yedhu", "yaaru", "ethana", "ethanaiku", "yenaku", "enaku", "ungaluku",
    "namakku", "avangaluku", "bro", "anna", "nanba", "kattanam", "kaasu", "dhaana", "thaan",
    "mattum", "kooda", "illa", "illai", "apdi", "ipdi", "seri", "nalladhu", "kelambi",
    "poitu", "vara", "vachi", "podhum", "per", "aalu", "chinna", "periya", "adhigam", "kammi",
    "paravala", "romba", "konjam", "vaika", "vachikalam", "solriya", "solriyaa", "kudi"
}

def check_explicit_language_switch(user_msg: str) -> Optional[str]:
    """Checks if the user explicitly requested to switch language or translate:
    e.g. 'idhaye english la sollu', 'say in english', 'tanglish la sollu', 'thamizh la solunga'
    Returns 'ta', 'tanglish', 'en' or None.
    """
    lower = user_msg.lower().strip()

    # Check Tanglish first so 'english letters la' is caught as Tanglish!
    if (re.search(r'\b(tanglish|thanglish|tanglis|tamil\s*english)\s*(la|please|la\s*sollu|la\s*pesu|la\s*type)?\b', lower) or
        "english letters la" in lower or "eng letters la" in lower or "english la type pannu" in lower or
        lower in ["tanglish", "tanglish la", "tanglish please"]):
        return "tanglish"

    # Check English switch
    if ((re.search(r'\b(english|inglish)\s*(la|please|la\s*sollu|la\s*pesu|in\s*english|say\s*in\s*english|explain\s*in\s*english|translate\s*to\s*english)?\b', lower) and
         any(k in lower for k in ["sollu", "solunga", "pesu", "type", "say", "explain", "translate", "please", "la", "in", "idhaye"])) or
        lower in ["english", "in english", "english please"]):
        return "en"

    # Check Tamil switch
    if ((re.search(r'\b(tamil|thamizh|tamizh)\s*(la|il|script|la\s*sollu|la\s*pesu|la\s*solunga|please|translate\s*to\s*tamil)?\b', lower) and
         any(k in lower for k in ["sollu", "solunga", "pesu", "type", "say", "explain", "translate", "please", "la", "il", "script", "idhaye"])) or
        any(k in lower for k in ["தமிழில் சொல்", "தமிழில் சொல்லு", "தமிழ்ல", "தமிழில் விவரி"])):
        return "ta"

    return None

def detect_language_mode(text: str, session: Dict[str, Any], forced_language: Optional[str] = None) -> str:
    """Detects whether user query is in:
    - 'ta': Pure Tamil (Tamil script)
    - 'tanglish': Conversational Tamil in Latin alphabet
    - 'en': English
    """
    if forced_language in ["ta", "tanglish", "en"]:
        session["language_mode"] = forced_language
        return forced_language

    clean = text.strip()
    if not clean:
        return session.get("language_mode", "tanglish")

    # 1. Pure Tamil script Unicode detection (0x0B80 - 0x0BFF)
    if bool(re.search(r'[\u0B80-\u0BFF]', clean)):
        session["language_mode"] = "ta"
        session["explicit_language_lock"] = False
        return "ta"

    lower = clean.lower()

    # 2. Check if user asked to switch language
    switched = check_explicit_language_switch(clean)
    if switched:
        session["language_mode"] = switched
        session["explicit_language_lock"] = True
        return switched

    # 3. If explicit lock exists from previous turn, maintain it
    if session.get("explicit_language_lock"):
        return session.get("language_mode", "tanglish")

    # 4. Tanglish Vocabulary & Phonetic Suffix detection
    words = re.findall(r'\b[a-z]+\b', lower)
    has_tanglish_word = any(w in TANGLISH_VOCABULARY for w in words)
    has_tanglish_suffix = any(
        len(w) > 4 and (
            w.endswith("la") or w.endswith("ku") or w.endswith("num") or
            w.endswith("aachu") or w.endswith("unga") or w.endswith("aama")
        ) for w in words
    )

    if has_tanglish_word or has_tanglish_suffix:
        session["language_mode"] = "tanglish"
        return "tanglish"

    # 5. English detection
    english_starters = {"what", "when", "where", "which", "how", "could", "would", "can", "please", "hello", "hi", "good", "thank", "thanks", "fare", "price", "cost", "booking", "cab", "rate"}
    english_hit = sum(1 for w in words if w in english_starters)
    if english_hit >= 2:
        session["language_mode"] = "en"
        return "en"

    # Fallback to session or tanglish
    return session.get("language_mode", "tanglish")

def handle_language_switch_request(user_msg: str, session: Dict[str, Any], operator_name: str) -> Optional[Dict[str, Any]]:
    """If user explicitly requested to switch language or translate previous reply."""
    target_lang = check_explicit_language_switch(user_msg)
    if not target_lang:
        return None

    session["language_mode"] = target_lang
    session["explicit_language_lock"] = True

    last_replies = session.get("last_replies", {})
    last_sugs = session.get("last_suggestions", {})

    if target_lang in last_replies and last_replies[target_lang]:
        if target_lang == "en":
            prefix = "Certainly sir! Here are the same details in English:\n\n"
        elif target_lang == "tanglish":
            prefix = "Kandippa bro! Idho adhey details Tanglish-la:\n\n"
        else:
            prefix = "நிச்சயமாக sir! அதே விவரங்கள் தமிழில் இதோ:\n\n"

        reply_text = prefix + last_replies[target_lang]
        sugs = last_sugs.get(target_lang, [])
        return {
            "success": True,
            "engine": "LANGUAGE_SWITCH_DISPATCHER",
            "reply": reply_text,
            "category": "LANGUAGE_SWITCH",
            "suggestions": sugs,
            "session_id": session["session_id"],
            "language_mode": target_lang
        }

    # If no prior reply in session
    if target_lang == "en":
        ack = f"🙏 **Hello! This is {operator_name} from Drop Cars Central Desk.**\n\nI have switched to English as requested. How may I assist with your travel today?"
        sugs = ["Chennai to Bangalore fare", "Ooty Tour Package", "Airport Pickup Rates", "Luggage fit in Sedan"]
    elif target_lang == "tanglish":
        ack = f"🙏 **Vanakkam! Naan Drop Cars desk operator {operator_name}.**\n\nUnga preference padi Tanglish-ku maathiyachu bro. Ungalukku outstation taxi-la enna help venum nu sollunga!"
        sugs = ["Chennai to Salem fare", "Ooty package rate", "Luggage evlo vaika mudiyum", "Advance pay pannanuma"]
    else:
        ack = f"🙏 **வணக்கம்! நான் Drop Cars டெஸ்க் ஆபரேட்டர் {operator_name}.**\n\nஉங்கள் விருப்பப்படி தமிழில் உரையாடலை மாற்றியுள்ளேன். உங்கள் பயணத்திற்கு எவ்வகையில் உதவ வேண்டும் sir?"
        sugs = ["டாக்ஸி கட்டணம் அறிய", "ஊட்டி டூர் பேக்கேஜ்", "லக்கேஜ் இடவசதி", "செல்லப்பிராணிகள் விதிமுறை"]

    return {
        "success": True,
        "engine": "LANGUAGE_SWITCH_DISPATCHER",
        "reply": ack,
        "category": "LANGUAGE_SWITCH",
        "suggestions": sugs,
        "session_id": session["session_id"],
        "language_mode": target_lang
    }

# ---------------------------------------------------------------------------
# Rule Loading, Saving & Seeding
# ---------------------------------------------------------------------------
def _load_rules() -> List[Dict[str, Any]]:
    global _RULES_CACHE
    if _RULES_CACHE is not None:
        return _RULES_CACHE
    if os.path.exists(DATA_PATH):
        try:
            with open(DATA_PATH, "r", encoding="utf-8") as f:
                _RULES_CACHE = json.load(f)
                return _RULES_CACHE
        except Exception as e:
            logger.error(f"Error loading AI training rules: {e}")
            _RULES_CACHE = []
            return []
    _RULES_CACHE = []
    seed_default_faq_rules()
    return _RULES_CACHE

def _save_rules(rules: List[Dict[str, Any]]) -> bool:
    global _RULES_CACHE
    try:
        os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
        with open(DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(rules, f, indent=2, ensure_ascii=False)
        _RULES_CACHE = rules
        return True
    except Exception as e:
        logger.error(f"Error saving AI training rules: {e}")
        return False

def get_all_training_rules() -> List[Dict[str, Any]]:
    return _load_rules()

def add_training_rule(
    triggers: List[str],
    response_en: str,
    response_ta: str,
    category: str = "CUSTOM_TRAINING",
    suggestions: Optional[List[str]] = None,
    question: Optional[str] = None,
    follow_up_prompt: Optional[str] = None,
    response_tanglish: Optional[str] = None,
    follow_up_prompt_tanglish: Optional[str] = None
) -> Dict[str, Any]:
    rules = _load_rules()
    cleaned_triggers = [t.strip().lower() for t in triggers if t.strip()]
    first_trigger = cleaned_triggers[0] if cleaned_triggers else "Custom Question"
    new_rule = {
        "id": f"rule_{uuid.uuid4().hex[:8]}",
        "question": (question or first_trigger).strip(),
        "triggers": cleaned_triggers,
        "category": category.strip().upper(),
        "response_en": response_en.strip(),
        "response_ta": response_ta.strip(),
        "response_tanglish": (response_tanglish.strip() if response_tanglish else response_ta.strip()),
        "suggestions": suggestions or ["🚗 Book Now", "📞 Call Support Desk"],
        "follow_up_prompt": (follow_up_prompt or "").strip(),
        "follow_up_prompt_tanglish": (follow_up_prompt_tanglish or "").strip(),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    rules.insert(0, new_rule)
    _save_rules(rules)
    return new_rule

def update_training_rule(rule_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    rules = _load_rules()
    for i, r in enumerate(rules):
        if r.get("id") == rule_id:
            rules[i].update(updates)
            rules[i]["updated_at"] = datetime.now(timezone.utc).isoformat()
            _save_rules(rules)
            return rules[i]
    return None

def delete_training_rule(rule_id: str) -> bool:
    rules = _load_rules()
    initial_len = len(rules)
    rules = [r for r in rules if r.get("id") != rule_id]
    if len(rules) < initial_len:
        _save_rules(rules)
        return True
    return False

def correct_query_and_train(
    query: str,
    correct_reply: str,
    category: str = "ADMIN_CORRECTION",
    language: str = "ta",
    question: Optional[str] = None
) -> Dict[str, Any]:
    """Admin teaches the bot the right response for a misunderstood query."""
    clean_query = query.strip().lower()
    resp_en = correct_reply if language == "en" else correct_reply
    resp_ta = correct_reply
    return add_training_rule(
        triggers=[clean_query],
        response_en=resp_en,
        response_ta=resp_ta,
        response_tanglish=correct_reply,
        category=category,
        suggestions=["✅ Verified Response", "🚗 Continue Booking"],
        question=question or query.strip()
    )

def seed_default_faq_rules(force_refresh: bool = False) -> int:
    """Pre-seeds 20+ comprehensive outstation taxi FAQs covering all common questions
    in Pure Tamil, Natural Tanglish, and Professional English."""
    rules = [] if force_refresh else _load_rules()
    existing_ids = {r.get("id") for r in rules}
    
    defaults = [
        {
            "id": "rule_faq_pet_policy",
            "question": "Can I travel with pets (dog/cat)? Are pets allowed?",
            "triggers": ["pet", "dog", "cat", "நாய்க்குட்டி", "travel with dog", "pet allowed", "pets allowed ah", "dog kootitu polama", "dog kutitu polama"],
            "category": "POLICY",
            "response_en": "🐾 **Pet-Friendly Travel Policy**:\n\nYes! We welcome your pets on outstation rides. Please bring a towel or sheet to cover the car seat, and carry pets in a crate/harness for safe travel. No extra surcharge on Sedans or SUVs.",
            "response_ta": "🐾 **செல்லப்பிராணிகள் (Pet) பயணம் குறித்த விதிமுறை**:\n\nஆம்! உங்கள் நாய் அல்லது பூனையை தாராளமாக அழைத்துச் செல்லலாம். காரின் இருக்கை அழுக்காகாமல் இருக்க ஒரு டவல் அல்லது விரிப்பு கொண்டுவருமாறு கேட்டுக்கொள்கிறோம். இதற்கு கூடுதல் கட்டணம் ஏதும் கிடையாது!",
            "response_tanglish": "🐾 **Pet-Friendly Travel Policy**:\n\nAama bro! Unga dog illa cat-ah tharalama kootitu polam. Car seat alukkagatha maadhiri oru bedsheet or towel konduvaravum. Idhukku extra charge edhuvum kedayadhu!",
            "suggestions": ["🚗 Book Pet-Friendly Cab", "📞 Special Request to Driver"],
            "follow_up_prompt": "எந்த ஊரிலிருந்து எங்கு செல்ல திட்டமிட்டுள்ளீர்கள் sir?",
            "follow_up_prompt_tanglish": "Engendhu enga travel panna plan pandreenga bro?"
        },
        {
            "id": "rule_faq_toll_fastag",
            "question": "Who pays toll charges? Is Fastag included in fare?",
            "triggers": ["toll", "tolls", "fastag", "சுங்கச்சாவடி", "toll charges", "toll gate charge", "who pays toll", "toll fees", "toll include ah", "toll extra va"],
            "category": "PRICING_TARIFF",
            "response_en": "💳 **Toll & Fastag Transparency**:\n\nToll charges are payable as actuals by the passenger as per National Highway Fastag plaza receipts. The driver will show you the exact toll deduction SMS/receipt. Zero hidden markup.",
            "response_ta": "💳 **சுங்கச்சாவடி (Toll) கட்டண விவரம்**:\n\nடோல்கேட் கட்டணங்கள் தேசிய நெடுஞ்சாலை Fastag அசல் ரசீதுப்படி பயணியால் செலுத்தப்பட வேண்டும். ஓட்டுநர் உங்களுக்கு துல்லியமான Fastag எஸ்எம்எஸ்/ரசீதை காட்டுவார். எவ்வித கூடுதல் கமிஷனும் கிடையாது.",
            "response_tanglish": "💳 **Toll & Fastag Details**:\n\nToll charges NH Fastag actual plaza receipts padi passenger dhaan pay pannanum. Driver ungalukku live Fastag SMS/receipt kaatuvar. Hidden commission edhuvum illa bro.",
            "suggestions": ["💰 View Per Km Rate", "🚗 Book Drop Taxi"],
            "follow_up_prompt": "உங்கள் பயணத்திற்கான உத்தேச டோல் தொகையை கணக்கிட ரூட் சொல்லுங்கள் sir.",
            "follow_up_prompt_tanglish": "Unga route toll amount calculate panna pickup & drop oor sollunga sir."
        },
        {
            "id": "rule_faq_ac_ghat_roads",
            "question": "Will AC work during hill climbing (Ooty / Kodaikanal)?",
            "triggers": ["ac in hills", "hill road ac", "மலைப்பாதை ac", "ac work in ooty", "ghat road ac", "ooty ac poduvangala"],
            "category": "POLICY",
            "response_en": "❄️ **AC on Hill / Ghat Roads**:\n\nAC operates fully across all highway and plain sections. During steep uphill ghat climbs (e.g. Kallar to Coonoor hairpin bends), drivers switch AC to blower mode to preserve optimal engine pulling power for passenger safety. AC resumes immediately once at the hilltop.",
            "response_ta": "❄️ **மலைப்பாதைகளில் ஏசி (AC) இயக்கம்**:\n\nசமவெளி நெடுஞ்சாலைகளில் ஏசி முழுமையாக இயங்கும். கொண்டை ஊசி வளைவுகள் கொண்ட செங்குத்தான மலைப்பாதைகளில் வாகனத்தின் என்ஜின் பவர் மற்றும் பாதுகாப்பு கருதி ஏசி அணைக்கப்பட்டு ப்ளோயர் இயக்கப்படும். மலை உச்சியை அடைந்ததும் மீண்டும் ஏசி செயல்படும்.",
            "response_tanglish": "❄️ **Hill & Ghat Roads AC Policy**:\n\nHighways-la AC full-ah run aagum bro. Hairpin bends and steep hill climb sections-la (e.g. Ooty/Kodai ghat road) engine pulling power & safety kaga blower mode poduvanga. Hill top vandhadhum thirumba AC potruvaanga.",
            "suggestions": ["🌸 Ooty Tour Rates", "🌲 Kodaikanal Rates"],
            "follow_up_prompt": "மலைப்பிரதேச பயணத்திற்கு Sedan போதுமா அல்லது SUV தேவையா sir?",
            "follow_up_prompt_tanglish": "Malai oor travel-ku Sedan podhuma illa SUV 7-seater thevaia bro?"
        },
        {
            "id": "rule_faq_cancellation_policy",
            "question": "What is the trip cancellation fee?",
            "triggers": ["cancellation fee", "cancel charges", "ரத்து கட்டணம்", "can i cancel", "how to cancel", "cancel panna kaasu pidipangala"],
            "category": "POLICY",
            "response_en": "🚫 **Zero-Stress Cancellation Policy**:\n\nYou can cancel your booking completely FREE of charge up to 2 hours before the scheduled pickup time. If cancelled after driver has departed for your pickup location, a nominal dispatch allowance of ₹300 applies.",
            "response_ta": "🚫 **பயணம் ரத்து செய்வதற்கான கட்டண விவரம்**:\n\nபுக்கிங் செய்த பயணத்தை புறப்படும் நேரத்திற்கு 2 மணி நேரத்திற்கு முன்புவரை எவ்வித கட்டணமும் இன்றி 100% இலவசமாக ரத்து செய்யலாம். ஓட்டுநர் உங்கள் பிக்கப் லொகேஷனுக்கு கிளம்பிய பிறகு ரத்து செய்தால் மட்டும் ₹300 அலோவன்ஸ் பொருந்தும்.",
            "response_tanglish": "🚫 **Free Cancellation Policy**:\n\nPickup time-ku 2 hours munnadi varaikkum 100% FREE-ah cancel pannikalam bro. Driver unga pickup location-ku kelambinadhukku aprom cancel panna mattum nominal ₹300 driver allowance apply aagum.",
            "suggestions": ["📞 Call Dispatch Team", "🚗 Book Confirmed Ride"],
            "follow_up_prompt": "புக்கிங் குறித்த ஏதேனும் மாற்றம் செய்ய வேண்டுமா sir?",
            "follow_up_prompt_tanglish": "Booking-la edhavadhu change pannanuma sir?"
        },
        {
            "id": "rule_faq_advance_payment",
            "question": "Do I need to pay any advance payment for booking?",
            "triggers": ["advance payment", "முன்பணம்", "advance thevaia", "advance kaasu", "pay later", "advance payment venuma"],
            "category": "BOOKING_HELP",
            "response_en": "💵 **No Advance Booking Required**:\n\nFor standard outstation one-way drop taxis, NO advance payment is required! You can pay comfortably at the end of the trip directly to the driver via GPay, PhonePe, UPI, or Cash.",
            "response_ta": "💵 **முன்பணம் (Advance) செலுத்த தேவையில்லை**:\n\nடிராப் கார்ஸ் ஒரு வழி (One-Way) டாக்ஸி புக்கிங்கிற்கு எவ்வித முன்பணமும் செலுத்த வேண்டிய அவசியமில்லை! உங்கள் பயணம் நிறைவடைந்ததும் GPay, PhonePe, UPI அல்லது ரொக்கமாக ஓட்டுநரிடம் நேரடியாக செலுத்தலாம்.",
            "response_tanglish": "💵 **Zero Advance Booking**:\n\nDrop Cars outstation drop taxi-ku advance edhuvum pay panna thevai illa bro! Trip mudinjadhum GPay, PhonePe, UPI or Cash moolama driver kitte direct-ah pay pannikalam.",
            "suggestions": ["🚗 Instant Booking Without Advance", "💰 Check Route Tariff"],
            "follow_up_prompt": "இன்றைக்கே உங்களுக்கு கார் உறுதி செய்யவா sir?",
            "follow_up_prompt_tanglish": "Innaike ungalukku car confirm pannidava sir?"
        },
        {
            "id": "rule_faq_waiting_charges",
            "question": "What are the waiting charges if flight/train is delayed?",
            "triggers": ["waiting charges", "delay charges", "தாமத கட்டணம்", "flight delay", "waiting time", "waiting fees"],
            "category": "POLICY",
            "response_en": "⏳ **Waiting Time Allowance**:\n\n• **First 45 Minutes**: Absolutely FREE waiting for airport pickups and train arrivals.\n• **Subsequent Waiting**: ₹150 per hour for Sedans, ₹200 per hour for SUVs.",
            "response_ta": "⏳ **காத்திருப்பு கட்டணம் (Waiting Charges)**:\n\n• **முதல் 45 நிமிடங்கள்**: விமான நிலையம் மற்றும் ரயில் நிலைய பிக்கப்புகளுக்கு முற்றிலும் இலவசம்.\n• **அதன் பிறகு**: Sedan காருக்கு ஒரு மணி நேரத்திற்கு ₹150, SUV காருக்கு ₹200 மட்டுமே.",
            "response_tanglish": "⏳ **Waiting Time Details**:\n\n• **First 45 Mins**: Airport pickup & Railway station-ku 100% FREE waiting allowance.\n• **Adhukku mela**: Sedan-ku 1 hour-ku ₹150, SUV-ku ₹200 mattum dhaan.",
            "suggestions": ["✈️ Airport Pickup Booking", "🚆 Railway Station Pickup"],
            "follow_up_prompt": "எந்த ஏர்போர்ட் அல்லது ரயில் நிலைய பிக்கப் தேவைப்படுகிறது sir?",
            "follow_up_prompt_tanglish": "Endha airport or railway station pickup thevaipadudhu sir?"
        },
        {
            "id": "rule_faq_kodai_package",
            "question": "What is Kodaikanal Tour Package Tariff?",
            "triggers": ["kodaikanal", "kodai package", "கொடைக்கானல்", "kodaikanal tour", "kodaikanal fare", "kodai tour"],
            "category": "TOUR_PACKAGE",
            "response_en": "🌲 **Drop Cars Kodaikanal Hill Station Package**:\n\n• **Sedan (Dzire/Etios)**: ₹14/km + Hill Bata ₹500/day\n• **SUV (Ertiga 7S)**: ₹19/km + Hill Bata ₹600/day\n• **Innova Crysta**: ₹24/km + Hill Bata ₹700/day\n\n✨ Experienced ghat drivers with sight-seeing coverage (Pillar Rocks, Coaker's Walk, Silver Cascade, Kodai Lake).",
            "response_ta": "🌲 **டிராப் கார்ஸ் கொடைக்கானல் ஸ்பெஷல் டூர் பேக்கேஜ்**:\n\n• **Sedan (Dzire/Etios)**: ₹14/கி.மீ + மலைப்பாதை படி ₹500/நாள்\n• **SUV (Ertiga 7S)**: ₹19/கி.மீ + மலைப்பாதை படி ₹600/நாள்\n• **Innova Crysta**: ₹24/கி.மீ + மலைப்பாதை படி ₹700/நாள்\n\n✨ கொடைக்கானல் அனுபவம் வாய்ந்த ஓட்டுநர் மற்றும் சைட்-சீயிங் கவரேஜ் அடங்கும்!",
            "response_tanglish": "🌲 **Kodaikanal Special Tour Package**:\n\n• **Sedan (Dzire/Etios)**: ₹14/km + Hill Bata ₹500/day\n• **SUV (Ertiga 7S)**: ₹19/km + Hill Bata ₹600/day\n• **Innova Crysta**: ₹24/km + Hill Bata ₹700/day\n\n✨ Ghat road experienced drivers with local sightseeing (Pillar Rocks, Coaker's Walk, Silver Cascade, Kodai Lake) cover aagum!",
            "suggestions": ["📅 Book Kodai Sedan", "🚙 Book Kodai 7S Ertiga"],
            "follow_up_prompt": "எத்தனை நாள் ட்ரிப் மற்றும் எத்தனை பேர் பயணிக்கிறீர்கள் sir?",
            "follow_up_prompt_tanglish": "Ethana naal trip & ethana per poreenga sir?"
        },
        {
            "id": "rule_faq_ooty_package",
            "question": "What is Ooty Tour Package Tariff?",
            "triggers": ["ooty package", "ooty tour", "ஊட்டி பேக்கேஜ்", "ooty fare", "ooty trip"],
            "category": "TOUR_PACKAGE",
            "response_en": "🌸 **Drop Cars Ooty Hill Station Package**:\n\n• **Sedan (Dzire/Etios)**: ₹14/km + Hill Bata ₹500/day\n• **SUV (Ertiga 7S)**: ₹19/km + Hill Bata ₹600/day\n• **Innova Crysta**: ₹24/km + Hill Bata ₹700/day\n\n✨ Experienced drivers for 36 hairpin bends with Botanical Garden, Rose Garden, Pykara & Doddabetta coverage.",
            "response_ta": "🌸 **டிராப் கார்ஸ் ஊட்டி ஸ்பெஷல் டூர் பேக்கேஜ்**:\n\n• **Sedan (Dzire/Etios)**: ₹14/கி.மீ + மலைப்பாதை படி ₹500/நாள்\n• **SUV (Ertiga 7S)**: ₹19/கி.மீ + மலைப்பாதை படி ₹600/நாள்\n• **Innova Crysta**: ₹24/கி.மீ + மலைப்பாதை படி ₹700/நாள்\n\n✨ 36 கொண்டை ஊசி வளைவு அனுபவம் வாய்ந்த ஓட்டுநர்கள் மற்றும் முழுமையான சைட்-சீயிங் அடங்கும்!",
            "response_tanglish": "🌸 **Ooty Hill Station Package**:\n\n• **Sedan (Dzire/Etios)**: ₹14/km + Hill Bata ₹500/day\n• **SUV (Ertiga 7S)**: ₹19/km + Hill Bata ₹600/day\n• **Innova Crysta**: ₹24/km + Hill Bata ₹700/day\n\n✨ 36 Hairpin bends experienced drivers with Botanical Garden, Rose Garden, Pykara & Doddabetta coverage!",
            "suggestions": ["📅 Book Ooty Sedan", "🚙 Book Ooty 7S Ertiga"],
            "follow_up_prompt": "ஊட்டி பயணத்திற்கு பிக்கப் ஊர் சொல்லுங்கள் sir.",
            "follow_up_prompt_tanglish": "Ooty tour-ku car book panna pickup city sollunga bro."
        },
        {
            "id": "rule_faq_tirupati_package",
            "question": "What is Tirupati Balaji Darshan Package?",
            "triggers": ["tirupati", "thirupathi", "திருப்பதி", "tirupati package", "tirupati car"],
            "category": "TOUR_PACKAGE",
            "response_en": "🙏 **Tirupati Balaji Darshan Package**:\n\n• One-Day Quick Drop & Return or Two-Day Leisure Package available.\n• AP State Border permit tax guidance included.\n• Alipiri checkpost direct drop and pickup coordination.",
            "response_ta": "🙏 **திருப்பதி பாலாஜி தரிசன ஸ்பெஷல் டூர்**:\n\n• ஒரே நாள் தரிசனம் அல்லது இரு நாள் தங்கும் பேக்கேஜ்கள் கிடைக்கும்.\n• ஆந்திர மாநில பார்டர் பர்மிட் வழிகாட்டுதல் அடங்கும்.\n• அலிபிரி செக்போஸ்ட் நேரடி டிராப் வசதி.",
            "response_tanglish": "🙏 **Tirupati Balaji Darshan Package**:\n\n• One-Day Quick Drop & Return or Two-Day Leisure Package available.\n• AP State Border permit tax guidance included.\n• Alipiri checkpost direct drop.",
            "suggestions": ["🚗 Book Tirupati Sedan", "🚙 Book Tirupati Ertiga"],
            "follow_up_prompt": "தரிசன டிக்கெட் புக் செய்துவிட்டீர்களா sir? எப்போது புறப்பட வேண்டும்?",
            "follow_up_prompt_tanglish": "Darshan slot book panniteengala bro? Eppo start pannanum?"
        },
        {
            "id": "rule_faq_gst_invoice",
            "question": "Can I get GST invoice for corporate travel expense reimbursement?",
            "triggers": ["gst invoice", "gst bill", "corporate invoice", "ஜிஎஸ்டி பில்", "company claim bill"],
            "category": "BOOKING_HELP",
            "response_en": "🧾 **Official GST Invoicing Available**:\n\nYes! We provide verified GST invoices with your company name, GSTIN, and trip breakdown via WhatsApp and Email immediately after trip completion. 100% compliant for corporate travel claims.",
            "response_ta": "🧾 **முறையான ஜிஎஸ்டி (GST) இன்வாய்ஸ் வசதி**:\n\nஆம்! உங்கள் நிறுவனத்தின் பெயர் மற்றும் GSTIN எண்ணுடன் கூடிய அதிகாரப்பூர்வ பில் பயணம் முடிந்ததும் வாட்ஸ்அப் மற்றும் மின்னஞ்சலில் உடனடியாக அனுப்பி வைக்கப்படும். கார்ப்பரேட் ரீஇம்பர்ஸ்மென்ட்டிற்கு 100% செல்லுபடியாகும்.",
            "response_tanglish": "🧾 **Official GST Invoice Facility**:\n\nAama bro! Unga company name & GSTIN number oda verified bill trip mudinjadhum WhatsApp & Email-la vandhudum. Corporate travel reimbursement-ku 100% valid.",
            "suggestions": ["🚗 Book Corporate Taxi", "📞 Contact Accounts Desk"],
            "follow_up_prompt": "ஜிஎஸ்டி பில்லுடன் கூடிய புக்கிங் செய்யவா sir?",
            "follow_up_prompt_tanglish": "GST bill oda car book panna details sollunga sir."
        },
        {
            "id": "rule_faq_luggage_capacity",
            "question": "How much luggage can fit in Sedan vs SUV?",
            "triggers": ["luggage", "boot space", "லக்கேஜ்", "luggage space", "ethana bag", "how many bags", "suitcases"],
            "category": "POLICY",
            "response_en": "🧳 **Luggage Space Allowance**:\n\n• **Sedan (Dzire/Etios)**: 2 Large Suitcases + 2 Medium/Small Handbags comfortably.\n• **SUV (Ertiga/Carens)**: 4 Large Suitcases + 3 Small Bags (Roof luggage carrier available on advance request).\n• **Innova Crysta**: Superior boot space accommodating family luggage.",
            "response_ta": "🧳 **லக்கேஜ் வைப்பதற்கான இடவசதி**:\n\n• **Sedan (Dzire/Etios)**: 2 பெரிய சூட்கேஸ் + 2 சிறிய ஹேண்ட்பேக்குகள்.\n• **SUV (Ertiga/Carens)**: 4 பெரிய சூட்கேஸ் + 3 சிறிய பைகள் (ரூஃப் கேரியர் கோரினால் வழங்கப்படும்).\n• **Innova Crysta**: மிகப்பெரிய டிக்கி இடவசதி கொண்டது.",
            "response_tanglish": "🧳 **Luggage Space Allowance**:\n\n• **Sedan (Dzire/Etios)**: 2 Periya Suitcase + 2 Small Bags.\n• **SUV (Ertiga/Carens)**: 4 Periya Suitcase + 3 Small Bags (Carrier available on request).\n• **Innova Crysta**: Huge boot space for family luggage.",
            "suggestions": ["🚗 Book Sedan", "🚙 Book 7S SUV with Carrier"],
            "follow_up_prompt": "உங்களிடம் எத்தனை லக்கேஜ் பைகள் உள்ளன sir?",
            "follow_up_prompt_tanglish": "Unga kitte luggage evlo irukku bro?"
        },
        {
            "id": "rule_faq_night_charges",
            "question": "What is Driver Night Bata and when does it apply?",
            "triggers": ["night charge", "night bata", "இரவு கட்டணம்", "night time travel", "night driving"],
            "category": "PRICING_TARIFF",
            "response_en": "🌙 **Driver Night Bata Policy**:\n\nDriver Night Bata of ₹300 applies ONLY if the vehicle travels continuously between 10:00 PM and 6:00 AM. Zero night charges for daytime travel!",
            "response_ta": "🌙 **இரவு நேர படி (Night Bata) விதிமுறை**:\n\nஇரவு 10:00 மணி முதல் காலை 6:00 மணி வரை பயணம் தொடர்ந்தால் மட்டுமே டிரைவர் நைட் பாட்டா ₹300 பொருந்தும். பகல் நேர பயணங்களுக்கு எவ்வித கூடுதல் கட்டணமும் இல்லை!",
            "response_tanglish": "🌙 **Night Bata Rule**:\n\nDriver Night Bata ₹300 trip 10:00 PM mudhal 6:00 AM varai continue aana mattum dhaan apply aagum. Day time trip-ku night bata kedayadhu!",
            "suggestions": ["💰 View Day Tariff", "🚗 Book Night Outstation"],
            "follow_up_prompt": "இரவு நேரத்தில் புறப்பட திட்டமிட்டுள்ளீர்களா sir?",
            "follow_up_prompt_tanglish": "Night time-la travel start panna plan irukka bro?"
        },
        {
            "id": "rule_faq_driver_assignment",
            "question": "When will I get driver and car details?",
            "triggers": ["driver details", "car number", "driver name", "எப்போது கார் விவரம் வரும்", "when will driver call"],
            "category": "BOOKING_HELP",
            "response_en": "👨‍✈️ **Driver Allocation Notification**:\n\nDriver contact name, mobile number, car model, vehicle registration number, and live tracking link are automatically sent via SMS and WhatsApp exactly 1 hour prior to your scheduled pickup time.",
            "response_ta": "👨‍✈️ **ஓட்டுநர் விவரம் அனுப்பும் நேரம்**:\n\nபயணம் புறப்படுவதற்கு 1 மணி நேரத்திற்கு முன்பு ஓட்டுநரின் பெயர், மொபைல் எண், கார் எண் மற்றும் லைவ் டிராக்கிங் இணைப்பு உங்கள் வாட்ஸ்அப் மற்றும் எஸ்எம்எஸ்-க்கு அனுப்பி வைக்கப்படும்.",
            "response_tanglish": "👨‍✈️ **Driver Allocation Time**:\n\nPickup time-ku 1 hour munnadi driver details (Name, Phone number, Car number & Live tracking link) SMS & WhatsApp-la vandhudum bro.",
            "suggestions": ["📋 Check Booking Status", "📞 Call Dispatch Desk"],
            "follow_up_prompt": "புக்கிங் ஐடி இருந்தால் கூறுங்கள் sir, நிலை பார்க்கிறேன்.",
            "follow_up_prompt_tanglish": "Booking status check panna Booking ID sollunga sir."
        },
        {
            "id": "rule_faq_minimum_km",
            "question": "Is there a minimum km charge for outstation drop taxi?",
            "triggers": ["minimum km", "min km", "குறைந்தபட்ச கிமீ", "minimum distance"],
            "category": "PRICING_TARIFF",
            "response_en": "📏 **Minimum Distance Slab**:\n\nFor outstation one-way drop taxis, a standard minimum distance slab of 130 km applies. If your destination is above 130 km, you only pay for the exact one-way distance!",
            "response_ta": "📏 **குறைந்தபட்ச தூர வரம்பு (Minimum Km)**:\n\nஒரு வழி (One-Way) அவுட்ஸ்டேஷன் டிராப் டாக்ஸிக்கு குறைந்தபட்ச தூரம் 130 கி.மீ ஆகும். உங்கள் ஊர் 130 கி.மீ-க்கு மேல் இருந்தால் துல்லியமான ஒரு வழி தூரத்திற்கு மட்டும் கட்டணம் செலுத்தினால் போதும்!",
            "response_tanglish": "📏 **Minimum Distance Slab**:\n\nOutstation one-way drop taxi-ku minimum 130 km slab apply aagum bro. Actual distance 130 km mela irundha actual km-ku mattum dhaan charge!",
            "suggestions": ["🚗 Check Exact Route Km", "💰 View Fare Chart"],
            "follow_up_prompt": "எந்த ஊருக்கு செல்ல வேண்டும் என்று கூறினால் தூரத்தை துல்லியமாக கணக்கிடுவேன் sir.",
            "follow_up_prompt_tanglish": "Engendhu enga poganum nu sollunga, exact distance calculate panren."
        },
        {
            "id": "rule_faq_roundtrip_stay",
            "question": "For round trips, does the driver stay with us?",
            "triggers": ["round trip driver", "driver stay", "round trip sightseeing", "உடன் இருப்பாரா", "roundtrip wait"],
            "category": "POLICY",
            "response_en": "🔄 **Round Trip Driver & Vehicle Availability**:\n\nYes! For round trips, the vehicle and driver stay dedicated to your group for local travel, temples, and sightseeing. You do NOT pay any empty return dead-mileage charges.",
            "response_ta": "🔄 **ரவுண்ட் ட்ரிப் ஓட்டுநர் வசதி**:\n\nஆம்! ரவுண்ட் ட்ரிப் பயணங்களில் கார் மற்றும் ஓட்டுநர் உங்கள் பயணக் குழுவுடனே இருப்பார்கள். உள்ளூர் சைட்-சீயிங் மற்றும் கோயில்களுக்கு பயன்படுத்தலாம். ரிட்டர்ன் காலி கி.மீ கட்டணம் எதுவும் கிடையாது.",
            "response_tanglish": "🔄 **Round Trip Driver Stay**:\n\nRound trip-la driver ungaloda car-la dhaan stay pannuvar. Local sightseeing-ku car-ah use pannikalam. Return empty dead-mileage charge edhuvum kedayadhu!",
            "suggestions": ["🔄 Book Round Trip", "💰 Calculate Round Trip Fare"],
            "follow_up_prompt": "எத்தனை நாள் ரவுண்ட் ட்ரிப் திட்டமிட்டுள்ளீர்கள் sir?",
            "follow_up_prompt_tanglish": "Ethana naal round trip plan pandreenga bro?"
        },
        {
            "id": "rule_faq_food_stops",
            "question": "Can we stop for food, tea, or restroom on the highway?",
            "triggers": ["food stop", "hotel stop", "tea break", "சாப்பிட நிறுத்தலாமா", "eating stop", "hotel la niruthalama"],
            "category": "POLICY",
            "response_en": "☕ **Highway Refreshment & Food Stops**:\n\nAbsolutely! You can take comfortable tea, coffee, breakfast, lunch, or restroom breaks anytime at good highway restaurants. No extra charges. Our drivers are courteous and family-friendly.",
            "response_ta": "☕ **உணவு மற்றும் ஓய்வறை இடைவேளைகள்**:\n\nதாராளமாக! நெடுஞ்சாலைகளில் சிறந்த உணவகங்களில் டீ, காபி, உணவு மற்றும் ஓய்வறை இடைவேளைகளுக்கு வசதியாக நிறுத்திக்கொள்ளலாம். கூடுதல் கட்டணம் ஏதும் கிடையாது. ஓட்டுநர்கள் முழு ஒத்துழைப்பு வழங்குவர்.",
            "response_tanglish": "☕ **Highway Breaks & Food Stops**:\n\nTea, coffee, breakfast, lunch or restroom breaks-ku highway nalla hotels-la tharalama stop pannikalam bro. Extra charge edhuvum kedayadhu. Drivers family-friendly ah behave pannuvanga.",
            "suggestions": ["🚗 Book Family Cab", "📞 Call Dispatch Desk"],
            "follow_up_prompt": "வேறு ஏதேனும் நிறுத்தங்கள் திட்டமிட்டுள்ளீர்களா sir?",
            "follow_up_prompt_tanglish": "Vera edhavadhu specific stop thevaipaduma sir?"
        }
    ]

    added = 0
    for d in defaults:
        if d["id"] not in existing_ids:
            rules.append(d)
            added += 1
        elif force_refresh:
            for idx, r in enumerate(rules):
                if r.get("id") == d["id"]:
                    rules[idx].update(d)
                    added += 1
                    break
    if added > 0:
        _save_rules(rules)
    return added

COMMON_STOP_WORDS = {
    "is", "in", "to", "the", "a", "an", "what", "who", "do", "does", "did", "can",
    "could", "would", "should", "for", "with", "are", "of", "and", "or", "it", "i",
    "you", "my", "your", "if", "be", "on", "at", "by", "from", "la", "nu", "ah",
    "dhaana", "iruka", "enna", "edhu", "yedhu", "how", "when", "where", "much"
}

# ---------------------------------------------------------------------------
# Fuzzy & Typo-Tolerant Rule Matcher (Multilingual)
# ---------------------------------------------------------------------------
def _match_custom_rule(message: str, lang_mode: str = "tanglish") -> Optional[Dict[str, Any]]:
    """Checks custom trained Q&A rules with spelling mistake tolerance,
    phonetic transliteration, and fuzzy similarity, returning responses in
    pure Tamil ('ta'), Tanglish ('tanglish'), or English ('en')."""
    raw_lower = message.lower().strip()
    norm_msg = normalize_text(raw_lower)
    rules = _load_rules()

    best_match = None
    highest_score = 0.0

    for rule in rules:
        if not rule.get("is_active", True):
            continue
        triggers = rule.get("triggers", [])
        question = rule.get("question", "")

        all_candidates = list(triggers)
        if question:
            all_candidates.append(question.lower())

        for t in all_candidates:
            if not t:
                continue
            clean_t = t.lower().strip()
            norm_t = normalize_text(clean_t)

            if clean_t in raw_lower or norm_t in norm_msg:
                score = 1.0
            elif re.search(r'\b' + re.escape(clean_t) + r'\b', raw_lower) or re.search(r'\b' + re.escape(norm_t) + r'\b', norm_msg):
                score = 0.95
            else:
                score = fuzzy_similarity(norm_t, norm_msg)
                if score < 0.80 and len(norm_t.split()) > 1:
                    t_words = [w for w in norm_t.split() if w not in COMMON_STOP_WORDS and len(w) > 2]
                    m_words = set(w for w in norm_msg.split() if w not in COMMON_STOP_WORDS and len(w) > 2)
                    if t_words:
                        inter = set(t_words) & m_words
                        if len(inter) == len(set(t_words)):
                            score = 0.90
                        elif len(inter) >= 2 and (len(inter) / len(set(t_words))) >= 0.65:
                            score = 0.85

            if score > highest_score and score >= 0.78:
                highest_score = score

                if lang_mode == "tanglish":
                    chosen_reply = rule.get("response_tanglish") or rule.get("response_ta") or rule.get("response_en", "")
                    follow_up = rule.get("follow_up_prompt_tanglish") or rule.get("follow_up_prompt_ta") or rule.get("follow_up_prompt", "")
                elif lang_mode == "ta":
                    chosen_reply = rule.get("response_ta") or rule.get("response_tanglish") or rule.get("response_en", "")
                    follow_up = rule.get("follow_up_prompt_ta") or rule.get("follow_up_prompt", "")
                else:  # 'en'
                    chosen_reply = rule.get("response_en") or rule.get("response_tanglish") or rule.get("response_ta", "")
                    follow_up = rule.get("follow_up_prompt_en") or rule.get("follow_up_prompt", "")

                if follow_up:
                    chosen_reply += f"\n\n👉 *{follow_up}*"

                best_match = {
                    "reply": chosen_reply,
                    "category": rule.get("category", "CUSTOM_TRAINED"),
                    "suggestions": rule.get("suggestions", []),
                    "matched_trigger": t,
                    "rule_id": rule.get("id"),
                    "question": rule.get("question", t),
                    "confidence": round(score, 2),
                    "rule_raw": rule
                }

    return best_match

# ---------------------------------------------------------------------------
# Multi-Turn Conversational Clarification & Slot-Filling Engine
# ---------------------------------------------------------------------------
def _get_or_create_session(session_id: str) -> Dict[str, Any]:
    now = time.time()
    expired = [k for k, v in _CONVERSATION_SESSIONS.items() if now - v.get("updated_at", 0) > SESSION_TTL_SECONDS]
    for k in expired:
        _CONVERSATION_SESSIONS.pop(k, None)

    if session_id not in _CONVERSATION_SESSIONS:
        _CONVERSATION_SESSIONS[session_id] = {
            "session_id": session_id,
            "pickup": None,
            "drop": None,
            "trip_type": None,
            "car_type": None,
            "travel_time": None,
            "passengers": None,
            "clarification_step": "START",
            "turn_count": 0,
            "doubt_history": [],
            "language_mode": "tanglish",
            "explicit_language_lock": False,
            "last_replies": {},
            "last_suggestions": {},
            "created_at": now,
            "updated_at": now,
        }
    _CONVERSATION_SESSIONS[session_id]["updated_at"] = now
    return _CONVERSATION_SESSIONS[session_id]

def reset_session(session_id: str) -> bool:
    if session_id in _CONVERSATION_SESSIONS:
        _CONVERSATION_SESSIONS.pop(session_id, None)
        return True
    return False

def _extract_slots(norm_msg: str, raw_msg: str, session: Dict[str, Any]):
    """Extracts cities, trip type, timing, car preferences from message and updates session."""
    all_known_cities = set(CITY_ALIASES.values())

    # 1. Regex route patterns with multilingual connector support
    # Supports 'X to Y', 'X டூ Y', 'X 2 Y', 'X -> Y', 'X முதல் Y வரை', 'X lerundhu Y', 'X லிருந்து Y'
    route_patterns = [
        r'(?:from\s+|irundhu\s+|lerundhu\s+|இருந்து\s+|லிருந்து\s+)?([a-zA-Z\u0B80-\u0BFF]+)\s*(?:to|டூ|2|\->|\-|வரை|நோக்கி)\s*([a-zA-Z\u0B80-\u0BFF]+)',
        r'([a-zA-Z\u0B80-\u0BFF]+)(?:lerundhu|lendhu|lirundhu|லிருந்து|யிலிருந்து)\s+([a-zA-Z\u0B80-\u0BFF]+)',
        r'([a-zA-Z\u0B80-\u0BFF]+)\s+(?:lerundhu|lendhu|lirundhu|லிருந்து|இருந்து|irundhu)\s+([a-zA-Z\u0B80-\u0BFF]+)'
    ]

    for p in route_patterns:
        m = re.search(p, raw_msg, re.IGNORECASE)
        if not m:
            m = re.search(p, norm_msg, re.IGNORECASE)
        if m:
            cand1 = resolve_single_city(m.group(1)) or CITY_ALIASES.get(m.group(1).lower())
            cand2 = resolve_single_city(m.group(2)) or CITY_ALIASES.get(m.group(2).lower())
            if cand1 and cand2 and cand1 != cand2:
                session["pickup"] = cand1.capitalize()
                session["drop"] = cand2.capitalize()
                break

    # 2. Extract any city names in tokens (with suffix stripping & alias normalization)
    if not session.get("pickup") or not session.get("drop"):
        tokens = re.findall(r'[a-zA-Z0-9\u0B80-\u0BFF]+', raw_msg) + norm_msg.split()
        found_cities = []
        for word in tokens:
            w_can = resolve_single_city(word) or CITY_ALIASES.get(word.lower())
            if w_can and w_can in all_known_cities and w_can.capitalize() not in found_cities:
                found_cities.append(w_can.capitalize())

        # Fallback assignment
        if len(found_cities) >= 2:
            if not session.get("pickup"):
                session["pickup"] = found_cities[0]
            if not session.get("drop"):
                session["drop"] = found_cities[1]
        elif len(found_cities) == 1:
            c = found_cities[0]
            step = session.get("clarification_step")
            if step == "AWAITING_SECOND_CITY":
                if not session.get("pickup"):
                    session["pickup"] = c
                elif not session.get("drop"):
                    session["drop"] = c
            elif any(w in norm_msg.lower() or w in raw_msg.lower() for w in ["drop", "poganum", "reach", "to", "poi", "போக", "போகணும்", "நோக்கி"]):
                session["drop"] = c
            elif any(w in norm_msg.lower() or w in raw_msg.lower() for w in ["pickup", "start", "from", "irundhu", "kelambi", "இருந்து", "புறப்பட"]):
                session["pickup"] = c
            elif not session.get("drop") and session.get("pickup") != c:
                session["drop"] = c

    # Safety check: Outstation drop taxi cannot have same pickup and drop city!
    if session.get("pickup") and session.get("pickup") == session.get("drop"):
        session["drop"] = None
        session["clarification_step"] = "AWAITING_SECOND_CITY"

    # Trip Type detection
    tt_msg = (norm_msg + " " + raw_msg).lower()
    if any(w in tt_msg for w in ["one-way", "oneway", "single trip", "drop mattum", "1way", "one way", "single", "drop taxi", "oru pakkam", "drop matum", "oru vazhi", "ஒரு வழி", "ஒருபக்கம்", "ஒரு வழி பயணம்", "ஒன் வே"]):
        session["trip_type"] = "One-Way Drop Taxi"
    elif any(w in tt_msg for w in ["round-trip", "roundtrip", "round trip", "up and down", "updown", "return trip", "return", "2 way", "twoway", "irandu pakkam", "poitu vara", "இரு வழி", "சென்று திரும்ப", "ரவுண்ட் ட்ரிப்", "அப் அண்ட் டவுன்"]):
        session["trip_type"] = "Round Trip (Up & Down)"

    # Travel Timing detection
    if any(w in tt_msg for w in ["today", "urgent", "now", "immediately", "innaiku", "udan", "ipove", "ippove", "seekiram", "instant", "இன்று", "உடனே"]):
        session["travel_time"] = "Today Urgent"
    elif any(w in tt_msg for w in ["tomorrow", "nalaiku", "naalai", "morning", "kaalai", "kaalaila", "night", "iravu", "evening", "maalai", "afternoon", "madhiyam", "நாளை", "காலை", "இரவு"]) or re.search(r'\b\d{1,2}(:\d{2})?\s*(am|pm|mani|மணி)\b', tt_msg):
        session["travel_time"] = "Scheduled Date & Time"
    elif re.search(r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}(st|nd|rd|th)?)\b', tt_msg):
        session["travel_time"] = "Specific Date Planned"

    # Car & Passenger count detection
    if any(w in tt_msg for w in ["suv", "ertiga", "7 seater", "7 pax", "5 people", "6 people", "7 people", "5 per", "6 per", "7 per", "5 aalu", "6 aalu", "7 aalu", "periya car", "big car", "எஸ்யூவி", "எர்டிகா", "7 சீட்டர்"]):
        session["car_type"] = "SUV (Ertiga 7 Seater)"
    elif any(w in tt_msg for w in ["innova", "crysta", "inova", "crista", "luxury", "இன்னோவா", "கிரிஸ்டா"]):
        session["car_type"] = "Innova Crysta"
    elif any(w in tt_msg for w in ["sedan", "dzire", "etios", "4 seater", "1 person", "2 person", "3 person", "4 person", "1 per", "2 per", "3 per", "4 per", "chinna car", "small car", "small", "4 aalu", "4 pax", "செடான்", "டிசையர்", "4 சீட்டர்"]):
        session["car_type"] = "Sedan (Etios / Dzire)"

def format_multilingual_reply(
    lang_mode: str,
    reply_ta: str,
    reply_tanglish: str,
    reply_en: str,
    session: Dict[str, Any],
    sugs_ta: Optional[List[str]] = None,
    sugs_tanglish: Optional[List[str]] = None,
    sugs_en: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Caches tri-lingual outputs in session and returns the active language's reply and suggestions."""
    session["last_replies"] = {
        "ta": reply_ta,
        "tanglish": reply_tanglish,
        "en": reply_en
    }
    session["last_suggestions"] = {
        "ta": sugs_ta or [],
        "tanglish": sugs_tanglish or [],
        "en": sugs_en or []
    }

    if lang_mode == "ta":
        return {"reply": reply_ta, "suggestions": sugs_ta or []}
    elif lang_mode == "tanglish":
        return {"reply": reply_tanglish, "suggestions": sugs_tanglish or []}
    else:
        return {"reply": reply_en, "suggestions": sugs_en or []}

def process_conversational_turn(
    message: str,
    session_id: str = "default",
    language: Optional[str] = None,
    operator_name: str = "Priya"
) -> Dict[str, Any]:
    """
    Main human-grade conversational intelligence handler:
    1. Language mirroring (Pure Tamil, Tanglish, or English)
    2. Dynamic language switch handling ('idhaye english la sollu', 'tamil la sollunga')
    3. Typo-tolerant normalization
    4. Check trained Q&A rules & FAQ database with local knowledge
    5. Multi-turn dialogue state machine: asks clarifying follow-up questions
       repeatedly (thirumba thirumba kelvi ketu purinjikitu badhil solladhal)
    6. Computes transparent human tariff quotes when all slots are filled.
    """
    user_msg = message.strip()
    session = _get_or_create_session(session_id)
    session["turn_count"] += 1

    # Detect language mode
    lang_mode = detect_language_mode(user_msg, session, forced_language=language)

    # Check for explicit language switch request
    switch_res = handle_language_switch_request(user_msg, session, operator_name)
    if switch_res:
        return switch_res

    norm_msg = normalize_text(user_msg)

    # 1. Extract Slots for Booking Flow (Cities, Trip Type, Timing, Car)
    _extract_slots(norm_msg, user_msg, session)

    pickup = session.get("pickup")
    drop = session.get("drop")
    trip_type = session.get("trip_type")
    travel_time = session.get("travel_time")
    car_type = session.get("car_type")

    # 2. Check Trained Q&A Rules First (with typo tolerance and tri-lingual answers!)
    rule_hit = _match_custom_rule(user_msg, lang_mode)
    if rule_hit and rule_hit.get("confidence", 0) >= 0.80:
        # If user explicitly specified both pickup & drop for this route (e.g. "Chennai to Salem fare"),
        # and rule_hit is a general question (not specifically mentioning these cities or packages for these cities),
        # prioritize the route flow rather than hijacking with a general FAQ.
        is_route_specific = True
        if pickup and drop:
            rule_q = (rule_hit.get("question") or "").lower()
            rule_trigs = " ".join(rule_hit.get("rule_raw", {}).get("triggers", [])).lower()
            combined_rule_text = rule_q + " " + rule_trigs
            if not any(c.lower() in combined_rule_text for c in [pickup, drop]) and any(w in norm_msg for w in ["fare", "rate", "cost", "taxi", "cab", "poganum"]):
                is_route_specific = False

        if is_route_specific:
            rule_raw = rule_hit.get("rule_raw", {})
            
            reply_ta = rule_raw.get("response_ta") or rule_raw.get("response_en", "")
            reply_tanglish = rule_raw.get("response_tanglish") or rule_raw.get("response_ta") or rule_raw.get("response_en", "")
            reply_en = rule_raw.get("response_en") or rule_raw.get("response_tanglish") or rule_raw.get("response_ta", "")

            fu_ta = rule_raw.get("follow_up_prompt_ta") or rule_raw.get("follow_up_prompt", "")
            fu_tanglish = rule_raw.get("follow_up_prompt_tanglish") or rule_raw.get("follow_up_prompt_ta") or rule_raw.get("follow_up_prompt", "")
            fu_en = rule_raw.get("follow_up_prompt_en") or rule_raw.get("follow_up_prompt", "")

            if fu_ta: reply_ta += f"\n\n👉 *{fu_ta}*"
            if fu_tanglish: reply_tanglish += f"\n\n👉 *{fu_tanglish}*"
            if fu_en: reply_en += f"\n\n👉 *{fu_en}*"

            # If user has an in-flight booking dialogue, seamlessly keep it moving!
            if pickup and drop:
                if not trip_type:
                    reply_ta += f"\n\n📌 **உங்கள் {pickup} ➔ {drop} பயணம்**: இது ஒரு வழி பயணமா (One-Way) அல்லது Round Trip (Up & Down) sir?"
                    reply_tanglish += f"\n\n📌 **Unga {pickup} ➔ {drop} trip**: Idhu One-Way Drop Taxi-ah illa Round Trip (Up & Down)-ah bro?"
                    reply_en += f"\n\n📌 **Regarding your {pickup} to {drop} trip**: Is this a One-Way Drop or Round Trip (Up & Down) sir?"
                elif not travel_time:
                    reply_ta += f"\n\n📌 **உங்கள் {pickup} ➔ {drop} பயணம்**: எப்போது புறப்பட திட்டமிட்டுள்ளீர்கள் sir? (இன்றைக்கா, நாளைக்கா அல்லது தேதி & நேரம்)"
                    reply_tanglish += f"\n\n📌 **Unga {pickup} ➔ {drop} trip**: Eppo travel panna plan pandreenga bro? (Innaika, nalaika, or date & time)"
                    reply_en += f"\n\n📌 **Regarding your {pickup} to {drop} trip**: When are you planning to travel sir? (Today, Tomorrow, or specific time)"
                elif not car_type:
                    reply_ta += f"\n\n📌 **உங்கள் {pickup} ➔ {drop} பயணம்**: எத்தனை நபர்கள் பயணிக்கிறீர்கள் sir? (Sedan 4-சீட்டர் or SUV 7-சீட்டர்?)"
                    reply_tanglish += f"\n\n📌 **Unga {pickup} ➔ {drop} trip**: Ethanai per travel pandreenga bro? (Sedan 4-seater or SUV 7-seater?)"
                    reply_en += f"\n\n📌 **Regarding your {pickup} to {drop} trip**: How many passengers are traveling sir? (Sedan 4S or SUV 7S?)"

            formatted = format_multilingual_reply(
                lang_mode, reply_ta, reply_tanglish, reply_en, session,
                sugs_ta=rule_hit["suggestions"],
                sugs_tanglish=rule_hit["suggestions"],
                sugs_en=rule_hit["suggestions"]
            )

            return {
                "success": True,
                "engine": "CUSTOM_TRAINED_FAQ_ENGINE",
                "reply": formatted["reply"],
                "category": rule_hit["category"],
                "suggestions": formatted["suggestions"],
                "matched_trigger": rule_hit.get("matched_trigger"),
                "confidence": rule_hit.get("confidence"),
                "session_id": session_id,
                "language_mode": lang_mode
            }

    # 3. Multi-Turn Clarification Dialogue Logic (Step by Step!)
    wants_taxi = any(w in norm_msg for w in ["taxi", "cab", "book", "fare", "rate", "cost", "travel", "poganum", "venum", "rent"])
    if wants_taxi and not pickup and not drop:
        session["clarification_step"] = "AWAITING_LOCATIONS"
        
        reply_ta = (
            f"🚗 **வணக்கம் sir! Drop Cars outstation சேவைக்கு வரவேற்கிறோம்.** நான் உங்கள் டெஸ்க் ஆபரேட்டர் **{operator_name}**.\n\n"
            f"நீங்கள் **எங்கிருந்து எங்கு செல்ல வேண்டும்?** (Pickup ஊர் மற்றும் Drop ஊர் சொல்லுங்கள் sir - எ.கா: *Chennai to Trichy*)"
        )
        reply_tanglish = (
            f"🚗 **Vanakkam sir! Drop Cars outstation service-ku welcome.** Naan unga dispatch desk operator **{operator_name}**.\n\n"
            f"Neenga **engirundhu enga poganum?** (Pickup oor & Drop oor sollunga bro - Example: *Chennai to Trichy*)"
        )
        reply_en = (
            f"🚗 **Hello! Welcome to Drop Cars Outstation Service.** This is **{operator_name}** from dispatch.\n\n"
            f"Could you please share your **Pickup & Drop cities**? (For example: *Chennai to Bangalore*)"
        )
        sugs = ["Chennai to Trichy", "Chennai to Salem", "Bangalore to Chennai", "Coimbatore to Ooty"]
        formatted = format_multilingual_reply(lang_mode, reply_ta, reply_tanglish, reply_en, session, sugs, sugs, sugs)
        return {
            "success": True,
            "engine": "CONVERSATIONAL_CLARIFICATION_ENGINE",
            "reply": formatted["reply"],
            "category": "NEED_LOCATIONS",
            "suggestions": formatted["suggestions"],
            "session_id": session_id,
            "language_mode": lang_mode
        }

    if (pickup and not drop) or (drop and not pickup):
        known_city = drop or pickup
        session["clarification_step"] = "AWAITING_SECOND_CITY"
        reply_ta = (
            f"📍 **{known_city} பயணம்!**\n\n"
            f"நீங்கள் **எங்கிருந்து புறப்படுகிறீர்கள்** அல்லது **எங்கு செல்ல வேண்டும்** என்று கூற முடியுமா sir? (எ.கா: *Chennai, Bangalore, Coimbatore*)"
        )
        reply_tanglish = (
            f"📍 **{known_city} trip!**\n\n"
            f"Neenga **engirundhu start pandreenga** or **enga drop aaganum** nu sollunga sir? (Example: *Chennai, Bangalore, Coimbatore*)"
        )
        reply_en = (
            f"📍 **Trip involving {known_city}!**\n\n"
            f"Where will you be starting from or heading to? Please share the connecting city (e.g. *Chennai, Bangalore, Coimbatore*)."
        )
        sugs = [f"Chennai to {known_city}", f"Bangalore to {known_city}", f"Coimbatore to {known_city}"]
        formatted = format_multilingual_reply(lang_mode, reply_ta, reply_tanglish, reply_en, session, sugs, sugs, sugs)
        return {
            "success": True,
            "engine": "CONVERSATIONAL_CLARIFICATION_ENGINE",
            "reply": formatted["reply"],
            "category": "NEED_PICKUP_OR_DROP",
            "suggestions": formatted["suggestions"],
            "session_id": session_id,
            "language_mode": lang_mode
        }

    if pickup and drop and not trip_type:
        session["clarification_step"] = "AWAITING_TRIP_TYPE"
        reply_ta = (
            f"✨ **{pickup} ➔ {drop} பயணம்!**\n\n"
            f"இது **ஒரு வழி பயணமா (One-Way Drop)** அல்லது **சென்று திரும்புதலா (Round Trip Up & Down)** sir?"
        )
        reply_tanglish = (
            f"✨ **{pickup} ➔ {drop} trip!**\n\n"
            f"Idhu **One-Way Drop Taxi-ah** illa **Round Trip (Up & Down)**-ah bro?"
        )
        reply_en = (
            f"✨ **{pickup} to {drop} Trip!**\n\n"
            f"Is this a **One-Way Drop Taxi** or a **Round Trip (Up & Down)** sir?"
        )
        sugs_ta = ["ஒரு வழி டாக்ஸி 🚗", "ரவுண்ட் ட்ரிப் (Up & Down) 🔄"]
        sugs_tanglish = ["One-Way Drop Taxi 🚗", "Round Trip (Up & Down) 🔄"]
        sugs_en = ["One-Way Drop Taxi 🚗", "Round Trip (Up & Down) 🔄"]
        formatted = format_multilingual_reply(lang_mode, reply_ta, reply_tanglish, reply_en, session, sugs_ta, sugs_tanglish, sugs_en)
        return {
            "success": True,
            "engine": "CONVERSATIONAL_CLARIFICATION_ENGINE",
            "reply": formatted["reply"],
            "category": "NEED_TRIP_TYPE",
            "suggestions": formatted["suggestions"],
            "session_id": session_id,
            "language_mode": lang_mode
        }

    if pickup and drop and trip_type and not travel_time:
        session["clarification_step"] = "AWAITING_TIME"
        reply_ta = (
            f"👍 புரிந்தது sir! **{pickup} ➔ {drop}** ({trip_type}).\n\n"
            f"எப்போது புறப்பட திட்டமிட்டுள்ளீர்கள்? (**இன்றைக்கா, நாளைக்கா அல்லது தேதி & நேரம்** சொல்லுங்கள் sir)"
        )
        reply_tanglish = (
            f"👍 Purinjidhu bro! **{pickup} ➔ {drop}** ({trip_type}).\n\n"
            f"Eppo travel panna plan pandreenga? (**Innaika, Nalaika, or date & time** sollunga sir)"
        )
        reply_en = (
            f"👍 Got it! **{pickup} to {drop}** ({trip_type}).\n\n"
            f"When are you planning to start? (**Today, Tomorrow or a specific date/time**?)"
        )
        sugs_ta = ["இன்றே உடனே (Urgent) ⚡", "நாளை காலை 🌅", "தேதி குறிப்பிடுகிறேன் 📅"]
        sugs_tanglish = ["Innaike Udaney ⚡", "Nalaiku Kaalai 🌅", "Date specify pandren 📅"]
        sugs_en = ["Today Urgent ⚡", "Tomorrow Morning 🌅", "Specific Date 📅"]
        formatted = format_multilingual_reply(lang_mode, reply_ta, reply_tanglish, reply_en, session, sugs_ta, sugs_tanglish, sugs_en)
        return {
            "success": True,
            "engine": "CONVERSATIONAL_CLARIFICATION_ENGINE",
            "reply": formatted["reply"],
            "category": "NEED_TIME",
            "suggestions": formatted["suggestions"],
            "session_id": session_id,
            "language_mode": lang_mode
        }

    if pickup and drop and trip_type and travel_time and not car_type:
        session["clarification_step"] = "AWAITING_CAR_TYPE"
        reply_ta = (
            f"👥 சிறப்பு sir! **{pickup} ➔ {drop}** - {travel_time}.\n\n"
            f"**எத்தனை நபர்கள் பயணிக்கிறீர்கள்?** லக்கேஜ் பெட்டிகள் ஏதும் உள்ளதா?\n"
            f"(Sedan 4-சீட்டர் போதுமா அல்லது SUV 7-சீட்டர் தேவைப்படுமா sir?)"
        )
        reply_tanglish = (
            f"👥 Super sir! **{pickup} ➔ {drop}** - {travel_time}.\n\n"
            f"**Ethanai per travel pandreenga?** Luggage bags irukka?\n"
            f"(Sedan 4-seater podhuma illa SUV 7-seater thevaipaduma bro?)"
        )
        reply_en = (
            f"👥 Great! **{pickup} to {drop}** - {travel_time}.\n\n"
            f"**How many passengers are traveling?** Any heavy luggage?\n"
            f"(Do you prefer a 4-Seater Sedan or 7-Seater SUV?)"
        )
        sugs_ta = ["1-4 நபர்கள் (Sedan Dzire)", "5-7 நபர்கள் (Ertiga / Innova)", "அதிக லக்கேஜ் உள்ளது"]
        sugs_tanglish = ["1-4 per (Sedan Dzire)", "5-7 per (Ertiga / Innova)", "Adhiga Luggage irukku"]
        sugs_en = ["1-4 Passengers (Sedan Dzire)", "5-7 Passengers (Ertiga/Innova)", "Extra Luggage Space"]
        formatted = format_multilingual_reply(lang_mode, reply_ta, reply_tanglish, reply_en, session, sugs_ta, sugs_tanglish, sugs_en)
        return {
            "success": True,
            "engine": "CONVERSATIONAL_CLARIFICATION_ENGINE",
            "reply": formatted["reply"],
            "category": "NEED_CAR_OR_PAX",
            "suggestions": formatted["suggestions"],
            "session_id": session_id,
            "language_mode": lang_mode
        }

    if pickup and drop:
        car = car_type or "Sedan (Etios / Dzire)"
        ttype = trip_type or "One-Way Drop Taxi"

        from app.api.routes.ai_whatsapp_assistant import get_distance
        km = get_distance(pickup, drop)

        if "Innova" in car:
            per_km = 24
            bata = 600
        elif "SUV" in car or "Ertiga" in car:
            per_km = 19
            bata = 500
        else:
            per_km = 14
            bata = 400

        base_fare = km * per_km
        total = base_fare + bata

        reply_ta = (
            f"🎉 **அருமை sir! உங்கள் பயண விவரம் கணக்கிடப்பட்டுவிட்டது.**\n\n"
            f"🚗 **பயணப் பாதை**: **{pickup} ➔ {drop}**\n"
            f"🛣️ **பயண வகை**: {ttype}\n"
            f"🚘 **வாகனம்**: {car}\n"
            f"📏 **உத்தேச தூரம்**: {km} km (₹{per_km}/km)\n"
            f"💵 **அடிப்படை கட்டணம்**: ₹{base_fare:,}\n"
            f"👨‍✈️ **டிரைவர் பாட்டா**: ₹{bata}\n"
            f"💰 **மொத்த உத்தேச கட்டணம்: ₹{total:,}** *(சுங்கச்சாவடி Fastag அசல் ரசீதுப்படி)*\n\n"
            f"✨ **முன்பதிவை உறுதி செய்ய உங்கள் மொபைல் எண் மற்றும் பிக்கப் முகவரியை பகிருங்கள் sir!** உடனடியாக கார் ஒதுக்கப்படும்."
        )
        reply_tanglish = (
            f"🎉 **Super sir! Unga trip details calculate panniyachu.**\n\n"
            f"🚗 **Route**: **{pickup} ➔ {drop}**\n"
            f"🛣️ **Trip Type**: {ttype}\n"
            f"🚘 **Vehicle**: {car}\n"
            f"📏 **Approx Distance**: ~{km} km (₹{per_km}/km)\n"
            f"💵 **Base Fare**: ₹{base_fare:,}\n"
            f"👨‍✈️ **Driver Bata**: ₹{bata}\n"
            f"💰 **Total Estimated: ₹{total:,}** *(Toll plaza Fastag actual receipt mattum extra)*\n\n"
            f"✨ **Booking confirm panna unga Mobile Number & Pickup Address share pannunga sir!** Driver-ah udaney assign panniduvom."
        )
        reply_en = (
            f"🎉 **Great! Your complete trip quote is ready.**\n\n"
            f"🚗 **Route**: **{pickup} to {drop}**\n"
            f"🛣️ **Trip Type**: {ttype}\n"
            f"🚘 **Vehicle**: {car}\n"
            f"📏 **Distance**: ~{km} km (₹{per_km}/km)\n"
            f"💵 **Base Fare**: ₹{base_fare:,}\n"
            f"👨‍✈️ **Driver Bata**: ₹{bata}\n"
            f"💰 **Total Estimated: ₹{total:,}** *(Tolls as per Fastag actual receipts)*\n\n"
            f"✨ **To confirm this booking, please share your Mobile Number and Pickup Address.** We will assign the driver immediately!"
        )
        sugs_ta = ["🚗 புக்கிங் உறுதி செய்க", "🚙 SUV 7S மாற்றுக", "📞 ஆபரேட்டருடன் பேச"]
        sugs_tanglish = ["🚗 Confirm Booking Now", "🚙 Switch to SUV 7S", "📞 Call Dispatch Desk"]
        sugs_en = ["🚗 Confirm Booking Now", "🚙 Switch to SUV 7S", "📞 Call Dispatch Desk"]
        formatted = format_multilingual_reply(lang_mode, reply_ta, reply_tanglish, reply_en, session, sugs_ta, sugs_tanglish, sugs_en)
        return {
            "success": True,
            "engine": "COMPLETE_DISPATCHER_QUOTE",
            "reply": formatted["reply"],
            "category": "FINAL_BOOKING_QUOTE",
            "suggestions": formatted["suggestions"],
            "session_id": session_id,
            "language_mode": lang_mode
        }

    # Case G: Ambiguous / Low-Confidence query -> Clarification Question Loop!
    if pickup and drop:
        reply_ta = (
            f"🙏 **மன்னிக்கவும் sir, உங்கள் கேள்வி சரியாக விளங்கவில்லை.**\n\n"
            f"உங்கள் **{pickup} ➔ {drop}** பயணத்திற்கான சரியான கட்டணத்தை கணக்கிட அல்லது ஏதேனும் சந்தேகம் இருந்தால் கீழ்கண்டவற்றை தேர்வு செய்யலாம்:\n\n"
            f"• ஒரு வழி பயணமா (One-Way) அல்லது ரவுண்ட் ட்ரிப்பா?\n"
            f"• நீங்கள் எப்போது பயணிக்க திட்டமிட்டுள்ளீர்கள்?\n"
            f"• எத்தனை பேர் பயணிக்கிறீர்கள்? (Sedan or SUV)\n\n"
            f"உங்களுக்கு எதில் சந்தேகம் உள்ளது sir? தயங்காமல் சொல்லுங்கள்!"
        )
        reply_tanglish = (
            f"🙏 **Mannikavum bro, unga kelvi sariya puriyala.**\n\n"
            f"Unga **{pickup} ➔ {drop}** trip-ku accurate fare calculate panna idhula clarify pannunga:\n\n"
            f"• One-Way-ah illa Round trip-ah?\n"
            f"• Eppo travel panna poringa?\n"
            f"• Ethanai per travel pandreenga? (Sedan or SUV)\n\n"
            f"Ungalukku enna doubt irukku bro? Kettuta udaney solren!"
        )
        reply_en = (
            f"🙏 **I apologize, I didn't quite catch that.**\n\n"
            f"To help calculate the exact quote for your **{pickup} to {drop}** trip, please let me know:\n\n"
            f"• One-Way Drop or Round Trip (Up & Down)?\n"
            f"• When are you planning to travel?\n"
            f"• How many passengers? (Sedan 4S or SUV 7S)\n\n"
            f"What would you like to clarify sir?"
        )
        sugs_ta = ["ஒரு வழி டாக்ஸி 🚗", "ரவுண்ட் ட்ரிப் 🔄", "நாளை காலை 🌅", "Sedan 4 Seater"]
        sugs_tanglish = ["One-Way Drop Taxi 🚗", "Round Trip (Up & Down) 🔄", "Nalaiku Kaalai 🌅", "Sedan 4 Seater"]
        sugs_en = ["One-Way Drop Taxi 🚗", "Round Trip (Up & Down) 🔄", "Tomorrow Morning 🌅", "Sedan 4 Seater"]
        formatted = format_multilingual_reply(lang_mode, reply_ta, reply_tanglish, reply_en, session, sugs_ta, sugs_tanglish, sugs_en)
        return {
            "success": True,
            "engine": "IN_TRIP_CLARIFICATION_LOOP",
            "reply": formatted["reply"],
            "category": "IN_TRIP_AMBIGUITY_RESOLVER",
            "suggestions": formatted["suggestions"],
            "session_id": session_id,
            "language_mode": lang_mode
        }

    reply_ta = (
        f"🙏 **வணக்கம்! நான் Drop Cars டெஸ்க் ஆபரேட்டர் {operator_name}.**\n\n"
        f"மன்னிக்கவும் sir, உங்கள் கேள்வி சரியாக விளங்கவில்லை. நான் உங்களுக்கு பின்வருவனவற்றில் உடனடியாக உதவ முடியும்:\n\n"
        f"• **ஊர்களுக்கு இடையேயான டாக்ஸி புக் செய்ய** (எ.கா: *Chennai to Salem fare*)\n"
        f"• **டூர் பேக்கேஜ் விவரங்கள்** (ஊட்டி, கொடைக்கானல், திருப்பதி)\n"
        f"• **லக்கேஜ் அளவு & கார் மாடல்கள்**\n\n"
        f"நீங்கள் எதைப்பற்றி தெரிந்துகொள்ள விரும்புகிறீர்கள் sir?"
    )
    reply_tanglish = (
        f"🙏 **Vanakkam! Naan Drop Cars desk operator {operator_name}.**\n\n"
        f"Mannikavum bro, unga kelvi sariya puriyala. Naan ungalukku udaney idhula help panna mudiyum:\n\n"
        f"• **Outstation taxi fare theriya** (Ex: *Chennai to Salem fare*)\n"
        f"• **Tour package details** (Ooty, Kodaikanal, Tirupati)\n"
        f"• **Luggage fit & car models**\n\n"
        f"Ungalukku idhula edha pathi theriya venum bro?"
    )
    reply_en = (
        f"🙏 **Hello! This is {operator_name} from Drop Cars Central Desk.**\n\n"
        f"I want to make sure I understand you completely. How may I best assist you today?\n\n"
        f"• **Outstation Taxi Booking & Fare** (e.g. *Chennai to Bangalore fare*)\n"
        f"• **Holiday Tour Packages** (Ooty, Kodai, Tirupati)\n"
        f"• **Luggage Fit & Vehicle Options**\n\n"
        f"Please tap an option below or type your destination!"
    )
    sugs_ta = ["🚗 டாக்ஸி கட்டணம் அறிய", "🌸 ஊட்டி டூர் பேக்கேஜ்", "🧳 லக்கேஜ் இடவசதி", "📞 ஆபரேட்டருடன் பேச"]
    sugs_tanglish = ["🚗 Taxi fare evlo", "🌸 Ooty Tour Package", "🧳 Luggage fit details", "📞 Operator kitta pesa"]
    sugs_en = ["🚗 Taxi Fare Calculator", "🌸 Ooty Tour Package", "🧳 Luggage Allowance", "📞 Speak to Operator"]
    formatted = format_multilingual_reply(lang_mode, reply_ta, reply_tanglish, reply_en, session, sugs_ta, sugs_tanglish, sugs_en)
    return {
        "success": True,
        "engine": "CLARIFICATION_QUESTION_LOOP",
        "reply": formatted["reply"],
        "category": "AMBIGUITY_RESOLVER",
        "suggestions": formatted["suggestions"],
        "session_id": session_id,
        "language_mode": lang_mode
    }

# ---------------------------------------------------------------------------
# External LLM Bridge (Optional Gemini fallback)
# ---------------------------------------------------------------------------
async def query_external_llm(
    prompt: str,
    api_key: str,
    operator_name: str = "Priya",
    is_tamil: bool = False
) -> Optional[str]:
    """Calls Gemini API if configured with human persona."""
    if not api_key:
        return None
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        system_instruction = (
            f"You are {operator_name}, a friendly, caring, highly professional senior customer dispatcher at 'Drop Cars' - South India's premier outstation taxi network. "
            "You speak naturally like a real human customer care officer on WhatsApp/Chat (not like a generic robot). "
            "Tone: Courteous, welcoming, warm, practical. "
            "Drop Cars policies: Sedan is ₹14/km, SUV (Ertiga) is ₹19/km, Innova Crysta is ₹24/km. Driver bata is ₹400/day. Tolls are Fastag actuals. Night bata is ₹300 (10 PM to 6 AM only). "
            + ("Reply warmly in polite Tamil/Tanglish as preferred by the customer." if is_tamil else "Reply warmly in clean, friendly English.")
        )
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "systemInstruction": {"parts": [{"text": system_instruction}]}
        }
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                return text
    except Exception as e:
        logger.warning(f"External LLM call skipped or failed: {e}")
    return None
