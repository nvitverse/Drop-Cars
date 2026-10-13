"""Read a UPI payment screenshot (GPay / PhonePe / Paytm / bank app) and pull out what staff need to check a manual payment:
the UTR / UPI transaction ID, the amount, whether the app says "completed", and whom it was paid to.

Phone-app screenshots are clean digital text, so ordinary OCR reads them far better than a photographed document. The result only SAVES
TYPING and flags mismatches - it never approves anything: staff still look for the UTR in the bank statement (a screenshot can be edited).
The text itself is not stored, only these few facts."""
import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_KEYS = re.compile(
    r"(UPI\s*(?:transaction|txn|ref(?:erence)?)\s*(?:id|no\.?|number)?|UTR(?:\s*(?:no\.?|number|id))?|"
    r"(?:transaction|txn)\s*(?:id|no\.?|number)|ref(?:erence)?\s*(?:no\.?|id|number))",
    re.I,
)
_TWELVE = re.compile(r"(?<!\d)(\d[\d ]{10,16}\d)(?!\d)")
_PAYMENT_OF = re.compile(r"(?:payment|paid|sent|amount|transferred)\s*(?:of|:)?\s*[^\d\n]{0,6}?([\d,]+(?:\.\d{1,2})?)", re.I)
_RUPEE = re.compile(r"[₹]\s?([\d,]+(?:\.\d{1,2})?)")
_UPI_ID = re.compile(r"[A-Za-z0-9.\-_•*·]{2,}@[A-Za-z][A-Za-z0-9]{1,}")
_OK = re.compile(r"\b(completed|successful|success|paid successfully|payment successful)\b", re.I)
_BAD = re.compile(r"\b(failed|declined|pending|processing|reversed|refund(?:ed)?|cancell?ed)\b", re.I)


def _twelve_digits(chunk: str) -> Optional[str]:
    for m in _TWELVE.finditer(chunk):
        d = re.sub(r"\s", "", m.group(1))
        if len(d) == 12:
            return d
    return None


def _num(s: str) -> Optional[float]:
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def _alnum(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def parse_payment_text(text: str, our_upi_id: Optional[str] = None) -> Dict[str, Any]:
    text = text or ""
    utr = None
    for m in _KEYS.finditer(text):                       # the number that follows "UPI transaction ID" / "UTR" / "Ref No"
        utr = _twelve_digits(text[m.end(): m.end() + 70])
        if utr:
            break
    if utr is None:
        found = {re.sub(r"\s", "", m.group(1)) for m in _TWELVE.finditer(text)}
        found = {f for f in found if len(f) == 12}
        utr = next(iter(found)) if len(found) == 1 else None      # a lone 12-digit number is almost surely it; several = do not guess

    amount: Optional[float] = None
    m = _PAYMENT_OF.search(text)
    if m:
        amount = _num(m.group(1))
    if amount is None:
        rs = [_num(x) for x in _RUPEE.findall(text)]
        rs = [x for x in rs if x]
        amount = rs[0] if rs else None

    bad = bool(_BAD.search(text))
    ok = bool(_OK.search(text))
    success: Optional[bool] = False if bad and not ok else True if ok and not bad else None

    ids: List[str] = []
    for m in _UPI_ID.finditer(text):
        if m.group(0) not in ids:
            ids.append(m.group(0))
    payee_matches: Optional[bool] = None
    if our_upi_id:
        ours = _alnum(our_upi_id)
        cands = [_alnum(i) for i in ids if len(_alnum(i)) >= 8]       # screenshots mask the start (••••86-1@okbizaxis): compare the visible tail
        if cands:
            payee_matches = any(ours.endswith(c) or c.endswith(ours) for c in cands)
    return {"utr": utr, "amount": amount, "success": success, "payee_ids": ids[:4], "payee_matches_ours": payee_matches}


def read_payment_screenshot(image_bytes: bytes, our_upi_id: Optional[str] = None) -> Dict[str, Any]:
    """OCR + parse. Never raises: an unreadable screenshot returns empty fields and the person simply types the UTR."""
    try:
        from app.utils.document_verifier import read_document_text
        out = parse_payment_text(read_document_text(image_bytes), our_upi_id)
        out["read"] = bool(out["utr"] or out["amount"])
        return out
    except Exception as e:  # noqa: BLE001
        logger.warning("payment screenshot could not be read: %s", e)
        return {"utr": None, "amount": None, "success": None, "payee_ids": [], "payee_matches_ours": None, "read": False}


def compare_with_claim(scan: Optional[Dict[str, Any]], utr: str, amount: int) -> Dict[str, Optional[bool]]:
    """What staff see as green / red ticks next to a claim."""
    scan = scan or {}
    return {
        "utr_matches": (scan.get("utr") == utr) if scan.get("utr") else None,
        "amount_matches": (abs(float(scan["amount"]) - float(amount)) < 1) if scan.get("amount") else None,
        "paid_to_our_upi": scan.get("payee_matches_ours"),
        "shows_completed": scan.get("success"),
    }
