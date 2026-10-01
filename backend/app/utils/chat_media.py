"""Chat voice notes and photos.

The storage bucket is private (no public access), so a raw storage.googleapis.com link gave every phone a 403 - the
voice notes already sent in booking / support chats could not be played by the other side. Media is therefore served
through the API: GET /api/conversations/media/<folder>/<file>. The file names are random UUIDs (an unguessable
capability link, like a signed URL), only the chat folders are readable and only audio / image file names.
"""
import os
import re

PUBLIC_API_BASE = os.getenv("PUBLIC_API_BASE", "https://drop-cars-api-207918408785.asia-south2.run.app").rstrip("/")
CHAT_FOLDERS = ("chat_media", "chat_voice_notes")
MEDIA_PREFIX = f"{PUBLIC_API_BASE}/api/conversations/media/"
_STORAGE_URL = re.compile(r"^https://storage\.googleapis\.com/[^/]+/(chat_media|chat_voice_notes)/([A-Za-z0-9._-]+)$")
FILE_NAME = re.compile(r"^[A-Za-z0-9._-]{8,90}\.(m4a|mp3|aac|wav|ogg|webm|mp4|3gp|jpg|jpeg|png|webp|heic)$", re.I)
AUDIO_EXT = {"m4a", "mp3", "aac", "wav", "ogg", "webm", "3gp", "mp4"}


def media_url(value):
    """Storage link -> API link (anything else is returned unchanged)."""
    m = _STORAGE_URL.match(value or "")
    return f"{MEDIA_PREFIX}{m.group(1)}/{m.group(2)}" if m else value


def is_chat_media_url(value: str) -> bool:
    """Only links we produced may be attached to a message (no arbitrary external URLs, no tracking pixels)."""
    value = value or ""
    return bool(_STORAGE_URL.match(value)) or (value.startswith(MEDIA_PREFIX) and bool(FILE_NAME.match(value.rsplit("/", 1)[-1])))
