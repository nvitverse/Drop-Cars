"""Why a document is INVALID / waiting for a person: stored per document so the app can tell the owner exactly what to fix
(wrong document, not an original, date does not match, expired ...) instead of just showing "INVALID" and leaving them to phone support.

Kept in one JSON text column (`document_notes`) on car_details / car_driver: {"insurance": "The date on the photo is ...", ...}.
A note exists only while the document is INVALID or NEEDS_REVIEW; a document that passes clears it."""
import json
from typing import Optional

from app.models.common_enums import DocumentStatusEnum


def get_notes(entity) -> dict:
    raw = getattr(entity, "document_notes", None)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (ValueError, TypeError):
        return {}


def set_note(entity, key: str, status, reason: Optional[str]) -> None:
    """Remember the reason for `key` when the document is INVALID / NEEDS_REVIEW; clear it otherwise."""
    notes = get_notes(entity)
    if status in (DocumentStatusEnum.INVALID, DocumentStatusEnum.NEEDS_REVIEW) and reason:
        notes[key] = reason
    else:
        notes.pop(key, None)
    entity.document_notes = json.dumps(notes) if notes else None


LABELS = {"rc_front": "RC (front)", "rc_back": "RC (back)", "insurance": "Insurance", "fc": "FC", "permit": "Permit", "car_img": "car photo",
          "licence": "driving licence (front)", "licence_back": "driving licence (back)", "aadhar": "Aadhaar", "aadhar_back": "Aadhaar (back)",
          "police": "police verification certificate"}


def reason_for(entity, key: str, status) -> Optional[str]:
    """The note to show with a document - only while it is still INVALID / NEEDS_REVIEW. A document rejected BEFORE reasons were
    stored has no note: it still gets a plain instruction instead of a bare "INVALID" (owners were phoning to ask why)."""
    st = getattr(status, "value", status)
    if st not in ("INVALID", "NEEDS_REVIEW", "Invalid", "Needs_review", "NEEDS REVIEW"):
        return None
    note = get_notes(entity).get(key)
    if note:
        return note
    label = LABELS.get(key, "document")
    if str(st).upper() == "INVALID":
        return (f"The {label} was not accepted. Upload a clear COLOUR photo of the ORIGINAL {label} "
                f"(not a photocopy, and the right document for this slot) and enter the date printed on it.")
    return f"The {label} is waiting for a person at Drop Cars to check it. Nothing else is needed from you."
