"""Document "models": staff approve a real document once and tick "use as a model"; the next uploads that look the same
(same kind of document, same colours, same layout - e.g. a Karnataka RC) are verified without a person looking again.

The look of a document is a small fingerprint: a 4x4x4 colour histogram, a 16x16 difference hash of the layout and the
aspect ratio. Matching is deliberately strict (setting doc_model_match_threshold) and is only ever used to PROMOTE a document the
normal check could not judge - a document the check is SURE is expired / mismatched / another document is never promoted."""
import io
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image

DEFAULT_THRESHOLD = 0.85
HIST_WEIGHT, LAYOUT_WEIGHT = 0.5, 0.5


def _open(image_bytes: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(image_bytes))
    img.load()
    return img.convert("RGB")


def fingerprint(image_bytes: bytes) -> Dict[str, Any]:
    img = _open(image_bytes)
    w, h = img.size
    small = img.resize((64, 64))
    bins = [0] * 64
    for r, g, b in small.getdata():
        bins[(r // 64) * 16 + (g // 64) * 4 + (b // 64)] += 1
    total = float(sum(bins)) or 1.0
    hist = [round(c / total, 5) for c in bins]
    gray = img.convert("L").resize((17, 16))
    px = list(gray.getdata())
    bits = []
    for y in range(16):
        row = px[y * 17:(y + 1) * 17]
        bits.extend("1" if row[x] > row[x + 1] else "0" for x in range(16))
    return {"hist": hist, "dhash": "".join(bits), "aspect": round(w / float(h or 1), 3)}


def similarity(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    """0..1, 1 = looks the same. Colours and layout each count half; a very different shape (aspect) cannot match."""
    try:
        hist = sum(min(x, y) for x, y in zip(a["hist"], b["hist"]))
        ham = sum(1 for x, y in zip(a["dhash"], b["dhash"]) if x != y)
        layout = 1.0 - ham / float(len(a["dhash"]) or 1)
        if abs(float(a["aspect"]) - float(b["aspect"])) > 0.45 * max(float(a["aspect"]), float(b["aspect"])):
            return 0.0
        return HIST_WEIGHT * hist + LAYOUT_WEIGHT * layout
    except Exception:
        return 0.0


def best_match(image_bytes: bytes, models: List[Tuple[Any, Dict[str, Any]]], threshold: float) -> Optional[Tuple[Any, float]]:
    """models = [(model_row, fingerprint)]. Returns (row, score) of the closest one at or above the threshold, else None."""
    fp = fingerprint(image_bytes)
    best = None
    for row, mfp in models:
        s = similarity(fp, mfp)
        if s >= threshold and (best is None or s > best[1]):
            best = (row, s)
    return best


def match_saved_model(image_bytes: bytes, doc_kind: str) -> Optional[Tuple[str, float]]:
    """(label, score) of a saved, active model this photo matches, or None. Opens its own DB session (the checker has none)."""
    from app.database.session import SessionLocal
    from app.models.document_model import DocumentModel
    from app.crud.customer_booking_request import get_platform_setting_value
    db = SessionLocal()
    try:
        rows = db.query(DocumentModel).filter(DocumentModel.doc_kind == doc_kind, DocumentModel.is_active.is_(True)).all()
        if not rows:
            return None
        try:
            threshold = float(get_platform_setting_value(db, "doc_model_match_threshold", str(DEFAULT_THRESHOLD)) or DEFAULT_THRESHOLD)
        except ValueError:
            threshold = DEFAULT_THRESHOLD
        hit = best_match(image_bytes, [(r, r.fingerprint) for r in rows], threshold)
        if not hit:
            return None
        row, score = hit
        row.match_count = (row.match_count or 0) + 1
        db.commit()
        return row.label, round(score, 3)
    except Exception:
        db.rollback()
        return None
    finally:
        db.close()
