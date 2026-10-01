"""Real speech-to-text for the admin assistant (Tamil + English), replacing the Command Center's fake voice button.

Uses the Gemini Interactions endpoint (the documented path for audio):
    POST https://generativelanguage.googleapis.com/v1beta/interactions       header x-goog-api-key
    {"model": ..., "input": [{"type": "text", ...}, {"type": "audio", "data": <base64>, "mime_type": "audio/m4a"}]}
Supported types include audio/m4a, audio/mp3, audio/wav, audio/aac, audio/ogg, audio/webm; the request may not exceed 20 MB.
Model: env GEMINI_STT_MODEL (default gemini-3.8-flash as in the current docs). Needs GEMINI_API_KEY (the same key the Help Bot uses).

It never invents text: when it is not configured or the call fails, the caller gets an error and the app says so.
The audio is sent to Google for transcription and not stored by us.
"""
import base64
import logging
import os
from typing import Any, Dict

import requests

from app.utils import ai_llm

logger = logging.getLogger(__name__)

MAX_BYTES = 8 * 1024 * 1024
TIMEOUT = 30
PROMPT = ("Transcribe this voice message exactly as spoken. It may be Tamil, English or a mix (Tanglish). Write Tamil words in Tamil script and "
          "English words in English letters. Keep numbers as digits. Return only the transcript, no commentary. If there is no speech, return nothing.")
_MIME = {"audio/mp4": "audio/m4a", "audio/x-m4a": "audio/m4a", "audio/m4a": "audio/m4a", "audio/mpeg": "audio/mpeg", "audio/mp3": "audio/mp3",
         "audio/wav": "audio/wav", "audio/x-wav": "audio/wav", "audio/aac": "audio/aac", "audio/ogg": "audio/ogg", "audio/webm": "audio/webm", "audio/opus": "audio/opus"}


class SpeechUnavailable(Exception):
    """Not set up (no key)."""


class SpeechError(Exception):
    """The service answered with an error or nothing usable."""


def available() -> bool:
    return ai_llm._real_key("GEMINI_API_KEY")


def _extract(data: Dict[str, Any]) -> str:
    if isinstance(data.get("output_text"), str):
        return data["output_text"].strip()
    parts = []
    for key in ("outputs", "steps"):
        for item in data.get(key) or []:
            if isinstance(item, dict):
                if isinstance(item.get("text"), str):
                    parts.append(item["text"])
                for c in item.get("content") or []:
                    if isinstance(c, dict) and isinstance(c.get("text"), str):
                        parts.append(c["text"])
    return " ".join(parts).strip()


def transcribe(audio: bytes, mime: str) -> str:
    if not available():
        raise SpeechUnavailable("Voice typing is not set up on the server (no Gemini key).")
    if not audio or len(audio) > MAX_BYTES:
        raise SpeechError("The recording is empty or too long.")
    m = _MIME.get((mime or "").lower().split(";")[0].strip())
    if m is None:
        raise SpeechError("That audio format is not supported.")
    body = {"model": os.getenv("GEMINI_STT_MODEL", "gemini-3.8-flash"),
            "input": [{"type": "text", "text": PROMPT}, {"type": "audio", "data": base64.b64encode(audio).decode(), "mime_type": m}]}
    try:
        r = requests.post("https://generativelanguage.googleapis.com/v1beta/interactions", json=body, timeout=TIMEOUT,
                          headers={"x-goog-api-key": os.getenv("GEMINI_API_KEY", ""), "content-type": "application/json"})
    except Exception as e:  # noqa: BLE001
        logger.warning("speech-to-text call failed: %s", type(e).__name__)
        raise SpeechError("Could not reach the speech service.")
    if r.status_code != 200:
        logger.warning("speech-to-text HTTP %s", r.status_code)
        raise SpeechError("The speech service could not read that recording.")
    text = _extract(r.json())
    if not text:
        raise SpeechError("No speech was heard. Please try again.")
    return text[:1500]
