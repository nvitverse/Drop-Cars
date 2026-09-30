"""Optional AI reading of document photos (Gemini vision) for the auto-verifier.

OFF by default. It sends the document photo to Google, so the owner must switch it on deliberately:
  1. GEMINI_API_KEY must be set on the server, and the Google project behind that key should be on the PAID tier
     (the free tier may use submitted content to improve Google products - not acceptable for Aadhaar / licence photos)
  2. Admin App > System Config > "AI document reading" (platform setting `doc_ai_enabled` = 1)
Cost with Flash-Lite is a small fraction of a rupee per photo. `doc_ai_daily_limit` (default 2000) caps a runaway day.
When it is off, unavailable, over the cap or fails, the verifier silently uses its normal OCR path.
"""
import base64
import io
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

GEMINI_MODEL = os.getenv("GEMINI_DOC_MODEL", os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite"))
_cache: Dict[str, Any] = {"at": 0.0, "enabled": False, "limit": 2000}
_usage = ["", 0]

PROMPT = """You read photos of Indian vehicle / driver documents for a taxi platform. The user says this photo is: {kind}.
Look ONLY at the image. Return ONLY a JSON object with these keys:
{{"document_type": "licence|rc|insurance|fc|permit|pollution|aadhar|pan|other|not_a_document",
  "side": "front|back|unknown",
  "is_readable": true/false,          // false if too dark/blurry/cropped to read the key fields
  "holder_name": string|null,         // person name (owner name for RC/insurance)
  "document_number": string|null,     // DL number / RC number / policy number / Aadhaar 12 digits / PAN
  "vehicle_number": string|null,      // registration plate like TN01AB1234 when present
  "expiry_date": "YYYY-MM-DD"|null,   // the validity / expiry / valid-upto date (insurance: policy end date; licence: the NT validity)
  "issue_date": "YYYY-MM-DD"|null,
  "looks_tampered": true/false,       // visible edits, pasted fields, screen photo of a screen, obviously fake
  "notes": string}}
Never guess: use null for anything you cannot read clearly. Do not add any other text."""


def _settings():
    now = time.time()
    if now - _cache["at"] < 60:
        return _cache["enabled"], _cache["limit"]
    enabled, limit = False, 2000
    try:
        from app.database.session import SessionLocal
        from app.models.platform_setting import PlatformSetting
        db = SessionLocal()
        try:
            rows = db.query(PlatformSetting).filter(PlatformSetting.key.in_(["doc_ai_enabled", "doc_ai_daily_limit"])).all()
            for r in rows:
                if r.key == "doc_ai_enabled":
                    enabled = str(r.value).strip().lower() in ("1", "true", "yes")
                elif r.key == "doc_ai_daily_limit":
                    try:
                        limit = int(float(r.value))
                    except ValueError:
                        pass
        finally:
            db.close()
    except Exception as e:  # noqa: BLE001
        logger.warning("doc ai settings read failed: %s", e)
    _cache.update({"at": now, "enabled": enabled, "limit": limit})
    return enabled, limit


def _shrink(image_bytes: bytes) -> bytes:
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        im.thumbnail((1500, 1500))
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=82)
        return buf.getvalue()
    except Exception:  # noqa: BLE001
        return image_bytes


def extract_facts(image_bytes: bytes, doc_kind: str) -> Optional[Dict[str, Any]]:
    key = os.getenv("GEMINI_API_KEY")
    if not key or len(key.strip()) < 20 or any(c in key for c in "<> "):  # a placeholder, not a real key
        return None
    enabled, limit = _settings()
    if not enabled:
        return None
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if _usage[0] != today:
        _usage[0], _usage[1] = today, 0
    if _usage[1] >= limit:
        return None
    _usage[1] += 1

    body = {
        "contents": [{"role": "user", "parts": [
            {"text": PROMPT.format(kind=doc_kind)},
            {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(_shrink(image_bytes)).decode()}},
        ]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 500, "responseMimeType": "application/json"},
    }
    r = requests.post(f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
                      params={"key": key}, json=body, timeout=25)
    if r.status_code != 200:
        logger.warning("gemini doc HTTP %s: %s", r.status_code, r.text[:200])
        return None
    parts = (((r.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
    raw = "".join(p.get("text", "") for p in parts).strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.I).strip()
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except ValueError:
        return None
    return data if isinstance(data, dict) else None
