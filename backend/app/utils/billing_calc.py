"""The money rules for invoices and estimates - pure functions, no database, so they are easy to test.

Lines
    {label, amount, kind: FARE|CHARGE, taxable: bool|None, included: bool}
    included=True   -> part of the total
    included=False  -> listed under "Not included - paid on actuals" and NOT added to the total (same idea as the booking's Excluded charges)
    taxable         -> None = decided by the brand rule: KM_FARE (only fare lines are taxed - bata, toll, permit, parking, hill are pass-through) or ALL

GST mode
    NONE      no GST on the document
    EXTRA     GST is added on top of the taxable amount
    INCLUDED  the taxable amounts already contain GST (it is shown, nothing is added)
GST collection (what the customer is actually asked to pay)
    COLLECT   the customer pays the whole total, GST included
    SHOW_ONLY the invoice shows the GST but the customer is NOT charged it (we bear it / it is settled elsewhere)
    PAY_LATER the invoice is payable without the GST now; the GST amount is paid later through a link - an unpaid GST never blocks the invoice

Payments reduce the balance. Nothing here ever stops an invoice from being issued because it is unpaid."""
from typing import Any, Dict, List, Optional

GST_MODES = ("NONE", "EXTRA", "INCLUDED")
GST_COLLECTIONS = ("COLLECT", "SHOW_ONLY", "PAY_LATER")


def _i(v: Any) -> int:
    try:
        return int(round(float(v or 0)))
    except (TypeError, ValueError):
        return 0


def normalize_lines(lines: Optional[List[dict]]) -> List[dict]:
    out = []
    for raw in lines or []:
        if not isinstance(raw, dict):
            continue
        label = str(raw.get("label") or "").strip()
        amount = _i(raw.get("amount"))
        included = raw.get("included", True) is not False
        # nothing: an included line of 0 is not a line (same rule as the booking's extra charges); an excluded line may have no amount
        if not label or (included and amount == 0):
            continue
        out.append({
            "label": label, "amount": max(0, amount), "kind": "FARE" if str(raw.get("kind") or "").upper() == "FARE" else "CHARGE",
            "taxable": raw.get("taxable") if isinstance(raw.get("taxable"), bool) else None, "included": included,
            "note": (str(raw.get("note")).strip() if raw.get("note") else None),
        })
    return out


def is_taxable(line: dict, applies_to: str) -> bool:
    if isinstance(line.get("taxable"), bool):
        return line["taxable"]
    return True if applies_to == "ALL" else line.get("kind") == "FARE"


def compute_totals(lines: List[dict], *, gst_mode: str = "NONE", gst_rate: float = 0, gst_collection: str = "COLLECT",
                   applies_to: str = "KM_FARE", interstate: bool = False, discount: int = 0, gst_override: Optional[int] = None,
                   payments_total: int = 0, advance_requested: int = 0) -> Dict[str, int]:
    """Everything printed in the totals block, in whole rupees."""
    mode = gst_mode if gst_mode in GST_MODES else "NONE"
    collection = gst_collection if gst_collection in GST_COLLECTIONS else "COLLECT"
    rate = float(gst_rate or 0) if mode != "NONE" else 0.0
    inc = [l for l in normalize_lines(lines) if l["included"]]
    gross = sum(l["amount"] for l in inc)
    gross_taxable = sum(l["amount"] for l in inc if is_taxable(l, applies_to))
    discount = max(0, min(_i(discount), gross))
    # the discount comes off every line in proportion, so the taxable part is discounted by its own share
    taxable_after = gross_taxable - (round(discount * gross_taxable / gross) if gross else 0)
    subtotal = gross - discount

    gst = 0
    taxable_value = taxable_after
    if mode == "EXTRA":
        gst = _i(gst_override) if gst_override is not None else round(taxable_after * rate / 100.0)
        total = subtotal + gst
    elif mode == "INCLUDED":
        base = round(taxable_after / (1 + rate / 100.0)) if rate else taxable_after
        gst = _i(gst_override) if gst_override is not None else taxable_after - base
        taxable_value = taxable_after - gst
        total = subtotal
    else:
        total = subtotal
    gst = max(0, gst)

    if interstate:
        cgst = sgst = 0
        igst = gst
    else:
        cgst = gst // 2
        sgst = gst - cgst
        igst = 0

    # what the customer is asked to pay in all: GST is left out unless it is collected on the invoice itself or later through a link
    amount_due = total if collection in ("COLLECT", "PAY_LATER") else max(0, total - gst)
    paid = max(0, _i(payments_total))
    balance = max(0, amount_due - paid)
    gst_pending = min(gst, balance) if collection == "PAY_LATER" else 0       # the GST is the LAST part that is owed
    payable_now = max(0, balance - gst_pending)
    status = "PAID" if amount_due > 0 and paid >= amount_due else ("PARTIAL" if paid > 0 else "UNPAID")
    if amount_due == 0:
        status = "PAID"
    return {
        "gross": gross, "discount": discount, "subtotal": subtotal, "taxable_value": taxable_value, "gst_amount": gst,
        "cgst": cgst, "sgst": sgst, "igst": igst, "total_amount": total, "amount_due": amount_due, "paid_amount": paid,
        "balance_due": balance, "gst_pending": gst_pending, "payable_now": payable_now,
        "advance_requested": max(0, min(_i(advance_requested), amount_due)),
        "payment_status": status,
    }


def fare_lines(*, trip_type: str, km: float, rate_per_km: float, bata_per_day: float = 0, days: int = 1,
               min_km_oneway: int = 130, min_km_per_day_round: int = 250, min_km_per_day_multicity: int = 250,
               extra_rate_per_km: float = 0) -> List[dict]:
    """The same fare formulas the booking screens use: the km fare is never below the minimum coverage (oneway: min km; round / multi-city:
    min km x days) and bata is per day. `extra_rate_per_km` is the vendor extra / markup rate added to the km rate."""
    t = (trip_type or "").lower().replace(" ", "").replace("_", "")
    days = max(1, int(days or 1))
    billed = float(km or 0)
    if t in ("oneway",):
        billed = max(billed, float(min_km_oneway))
    elif t in ("roundtrip",):
        billed = max(billed, float(min_km_per_day_round) * days)
    elif t in ("multicity", "multycity"):
        billed = max(billed, float(min_km_per_day_multicity) * days)
    rate = float(rate_per_km or 0) + float(extra_rate_per_km or 0)
    out = []
    if rate > 0 and billed > 0:
        out.append({"label": f"Km fare ({round(billed)} km x Rs {round(rate, 2):g})", "amount": round(billed * rate), "kind": "FARE", "included": True})
    if bata_per_day:
        out.append({"label": f"Driver bata ({days} day{'s' if days > 1 else ''} x Rs {round(float(bata_per_day)):g})",
                    "amount": round(float(bata_per_day) * days), "kind": "CHARGE", "included": True})
    return out


# Charges staff add most often - the editor offers them as one-tap chips, each ticked (included) or unticked (excluded, paid on actuals)
STANDARD_CHARGES = [
    {"label": "Toll", "kind": "CHARGE"}, {"label": "State permit", "kind": "CHARGE"}, {"label": "Parking", "kind": "CHARGE"},
    {"label": "Hill / ghat charges", "kind": "CHARGE"}, {"label": "Night allowance", "kind": "CHARGE"}, {"label": "Waiting charges", "kind": "CHARGE"},
    {"label": "Extra km", "kind": "FARE"}, {"label": "Carrier", "kind": "CHARGE"}, {"label": "Pet friendly", "kind": "CHARGE"},
    {"label": "Non-CNG vehicle", "kind": "CHARGE"}, {"label": "Convenience fee", "kind": "CHARGE"},
]
