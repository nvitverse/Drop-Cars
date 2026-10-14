"""Read a screenshot a driver / owner / vendor sends to support and answer it the way the Help Center answers a typed question.

Owner idea 2026-10-14: drivers screenshot their chat or an error and send it - the system should read it, understand the problem and
reply. Two readers, best first, each optional:
  1. AI vision (Gemini) - understands a chat in any of our languages and returns the problem as one short sentence. It sends the photo to
     Google, so it follows the SAME switch as document reading (Admin App > System Config > AI document reading, `doc_ai_enabled`, paid
     tier only) and the same daily cap.
  2. OCR (Tesseract, always in the server image) - the text on the screen, mainly English / numbers (an error message, a wallet line).
The text found goes to utils/help_center.answer(), which already answers in the person's language from live settings and (for wallet
questions) their own ledger. If neither reader finds anything useful, or the Help Center is not confident, NO automatic answer is sent:
the screenshot simply reaches the staff with whatever was read, so a person replies. Nothing here ever invents an answer."""
import base64
import json
import logging
import os
import re
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

PROMPT = """This screenshot was sent to Drop Cars (an Indian taxi platform) support by a driver, fleet owner or vendor. It may be a chat
(WhatsApp, or the Drop Cars app) or an app screen showing an error, a wallet entry or a booking.
Return ONLY a JSON object:
{"question": string,        // the problem the person is facing, as ONE short sentence, in the language of the text (e.g. "OTP is not accepted when starting the trip")
 "error_text": string|null, // an error message shown on the screen, copied exactly
 "screen": "chat|wallet|trip_start|trip_end|login|documents|other",
 "booking_ids": [number],   // booking numbers visible (Booking ID 429 -> 429)
 "amounts": [number],       // rupee amounts visible
 "language": "en|ta|hi|te|kn"}
Never guess: use null / empty lists for anything you cannot read clearly. Do not add any other text."""

_ERROR_WORDS = re.compile(r"(otp|code|incorrect|invalid|failed|error|too many|not working|wallet|hold|penalt|deduct|cancel|refund|booking|trip|payment|₹|rs\.?\s?\d)", re.I)


def _key() -> Optional[str]:
    key = os.getenv("GEMINI_API_KEY") or ""
    return key if len(key.strip()) >= 20 and not any(c in key for c in "<> ") else None


def _gemini(image_bytes: bytes) -> Optional[Dict[str, Any]]:
    from app.utils import document_ai as dai
    key = _key()
    if not key:
        return None
    enabled, limit = dai._settings()
    if not enabled:
        return None
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if dai._usage[0] != today:
        dai._usage[0], dai._usage[1] = today, 0
    if dai._usage[1] >= limit:
        return None
    dai._usage[1] += 1
    body = {
        "contents": [{"role": "user", "parts": [
            {"text": PROMPT},
            {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(dai._shrink(image_bytes)).decode()}},
        ]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 400, "responseMimeType": "application/json"},
    }
    r = requests.post(f"https://generativelanguage.googleapis.com/v1beta/models/{dai.GEMINI_MODEL}:generateContent", params={"key": key}, json=body, timeout=25)
    if r.status_code != 200:
        logger.warning("gemini screenshot HTTP %s: %s", r.status_code, r.text[:200])
        return None
    parts = (((r.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", "".join(p.get("text", "") for p in parts).strip(), flags=re.I).strip()
    m = re.search(r"\{.*\}", raw, re.S)
    try:
        data = json.loads(m.group(0)) if m else None
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _ocr(image_bytes: bytes) -> str:
    try:
        from app.utils.document_verifier import read_document_text
        return read_document_text(image_bytes) or ""
    except Exception as e:      # noqa: BLE001
        logger.warning("screenshot OCR failed: %s", e)
        return ""


def _useful_lines(text: str, limit: int = 450) -> str:
    """OCR of a chat is mostly noise: keep the lines that look like a problem (an error, a code, money, a booking), newest last."""
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if len(ln) >= 4]
    picked = [ln for ln in lines if _ERROR_WORDS.search(ln)] or lines[-6:]
    return " ".join(picked[-8:])[:limit]


def analyse(db, role: Optional[str], caller, image_bytes: bytes, note: str = "", language_hint: Optional[str] = None) -> Dict[str, Any]:
    """{source, read, reply, suggestions, topic, confident, booking_ids}. Never raises."""
    out: Dict[str, Any] = {"source": "none", "read": "", "reply": None, "suggestions": [], "topic": None, "confident": False, "booking_ids": []}
    facts = None
    try:
        facts = _gemini(image_bytes)
    except Exception as e:      # noqa: BLE001
        logger.warning("screenshot AI failed: %s", e)
    if facts and (facts.get("question") or facts.get("error_text")):
        out["source"] = "ai"
        out["read"] = " ".join(str(x) for x in (facts.get("question"), facts.get("error_text")) if x)[:450]
        out["booking_ids"] = [int(b) for b in (facts.get("booking_ids") or []) if str(b).isdigit()][:5]
        language_hint = language_hint or (facts.get("language") if facts.get("language") in ("en", "ta", "hi", "te", "kn") else None)
    else:
        text = _ocr(image_bytes)
        if text.strip():
            out["source"] = "ocr"
            out["read"] = _useful_lines(text)
    question = " ".join(x for x in ((note or "").strip(), out["read"]) if x).strip()
    if not question:
        return out
    try:
        from app.utils import help_center
        hc = help_center.answer(db, role, caller, question, language_hint)
    except Exception as e:      # noqa: BLE001
        logger.warning("screenshot help answer failed: %s", e)
        hc = None
    if hc and hc.get("confident") and hc.get("topic") not in (None, "menu"):
        out.update({"reply": hc["reply"], "suggestions": hc.get("suggestions") or [], "topic": hc.get("topic"), "confident": True})
    return out
