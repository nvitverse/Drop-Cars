"""Invoices and estimates: brands, numbering, pre-fill from a booking id, payments (manual or by link), conversion, GST ledger sync."""
import logging
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.billing import BillingBrand, BillingDocument, BillingRateCard
from app.utils import billing_policies, billing_tariff
from app.models.tax_settings import InvoiceSequence
from app.utils import billing_calc

logger = logging.getLogger(__name__)

DEFAULT_TERMS_INVOICE = "\n".join([
    "Toll, parking and state permit charges are billed at actuals unless they are shown as included in this invoice.",
    "Charges listed under 'Not included' are payable directly on actuals and are not part of the total.",
    "Night driving allowance applies between 10:00 PM and 5:00 AM.",
    "Payments received are non-transferable. For any billing question contact us on the phone number above.",
])
DEFAULT_TERMS_ESTIMATE = "\n".join([
    "This estimate is based on the details given and is valid until the date shown. Final fare is as per the actual distance driven.",
    "Toll, parking and state permit charges listed under 'Not included' are payable on actuals.",
    "The booking is confirmed only after the advance is received.",
    "Rates can change with fuel price, route change or extra stops requested by the passenger.",
])
DEFAULT_RULES = "\n".join([
    "Minimum billable distance applies as per the trip type (one way / round trip / multi city).",
    "Waiting charges apply beyond the free waiting time agreed for the booking.",
    "Cancellation: free until the driver is assigned; after that the advance may be forfeited as per the booking policy.",
    "Passengers must carry a valid photo ID. Smoking and alcohol are not allowed in the vehicle.",
])

# (code, name, domain, tagline, color, invoice prefix)
DEFAULT_BRANDS = [
    ("dropcars", "Drop Cars", "dropcars.in", "Standard & Premium Taxis", "#0EA5E9", "DC", True),
    ("24droptaxi", "24 Drop Taxi", "24drop-taxi.in", "One Way & Outstation Cabs", "#3B82F6", "DT", False),
    ("tatataxi", "Tata Taxi", "tatataxi.in", "Reliable Outstation Fleet", "#F59E0B", "TT", False),
    ("tatacalltaxi", "Tata Call Taxi", "tatacalltaxi.in", "City & Outstation Cabs", "#10B981", "TC", False),
    ("mukiltravels", "Mukil Travels", "mukiltravels.in", "Versatile Tour & Travel Packages", "#EC4899", "MT", False),
    ("yellowboard", "Yellow Board", "yellowboard.in", "Commercial Fleet Cabs", "#EAB308", "YB", False),
    ("arunachala", "Arunachala Travels", "arunachalatravels.in", "Tempo Traveller & Force Urbania Specialist", "#8B5CF6", "AT", False),
]


def seed_default_brands(db: Session) -> int:
    """One brand per website / business name, with the phone and colours the quote screen already used. GSTIN, address and bank
    details are left empty on purpose: they are filled in once per brand in the Admin App (a made-up GSTIN must never print)."""
    have = {b.code: b for b in db.query(BillingBrand).all()}
    n = 0
    for code, name, domain, tagline, color, prefix, default in DEFAULT_BRANDS:
        pol = billing_policies.defaults_for(code)
        if code in have:
            b = have[code]                                   # a brand still holding the first short seeded text has never been edited: give it the full policy text
            for k, v in pol.items():
                if billing_policies.is_old_seed(getattr(b, k) or "") or not (getattr(b, k) or "").strip():
                    setattr(b, k, v)
                    n += 1
            continue
        db.add(BillingBrand(
            code=code, name=name, legal_name=name, tagline=tagline, domain=domain, phone="9043990439", whatsapp="919043990439",
            email=f"support@{domain}", primary_color=color, invoice_prefix=prefix, estimate_prefix=f"{prefix}-EST",
            footer_note="Thank you for travelling with us.", signatory="Authorised signatory", is_default=default, **pol,
        ))
        n += 1
    if n:
        db.commit()
    seed_rate_cards(db)
    from app.crud.billing_rules import seed_starter_rules
    seed_starter_rules(db)
    return n


def seed_rate_cards(db: Session) -> int:
    """Starter tariffs: Arunachala's website slab tariff + local packages + sample tour packages, and Drop Cars km / day-rent samples. Only when a brand has none."""
    made = 0
    for code, cards in (("arunachala", billing_policies.arunachala_rate_cards() + billing_policies.arunachala_packages()), ("dropcars", billing_policies.dropcars_rate_cards())):
        b = db.query(BillingBrand).filter(BillingBrand.code == code).first()
        if b is None or db.query(BillingRateCard.id).filter(BillingRateCard.brand_id == b.id).first() is not None:
            continue
        for c in cards:
            db.add(BillingRateCard(brand_id=b.id, **c))
            made += 1
    if made:
        db.commit()
    return made


def rate_card_dict(c: BillingRateCard) -> Dict[str, Any]:
    return {"id": str(c.id), "brand_id": str(c.brand_id), "method": c.method, "method_label": billing_tariff.METHOD_LABELS.get(c.method, c.method),
            "vehicle_key": c.vehicle_key, "vehicle_name": c.vehicle_name, "name": c.name, "params": c.params or {}, "is_active": bool(c.is_active), "sort_order": c.sort_order}


def estimate_lines(db: Session, p: Dict[str, Any]) -> Dict[str, Any]:
    """Lines for an estimate from a rate card (or typed numbers): the one place all three tariff engines and the packages are reached."""
    from app.utils.fare_rules import get_fare_rules
    method = str(p.get("method") or "KM_BATA").upper()
    params = dict(p.get("params") or {})
    if p.get("rate_card_id"):
        try:
            card = db.query(BillingRateCard).filter(BillingRateCard.id == uuid.UUID(str(p["rate_card_id"]))).first()
        except ValueError:
            card = None
        if card is None:
            raise HTTPException(status_code=404, detail="Rate card not found")
        method, params = card.method, {**(card.params or {}), **params}
    try:
        res = billing_tariff.compute(method, params, km=float(p.get("km") or 0), days=int(p.get("days") or 1), hours=str(p.get("hours") or ""),
                                     trip_type=str(p.get("trip_type") or "oneway"), amount=p.get("amount"), name=p.get("name"), rules=get_fare_rules(),
                                     adjust=p.get("adjust") or None)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    res["lines"] = billing_calc.normalize_lines(res["lines"])
    res["method"] = method
    return res


def brand_dict(b: BillingBrand) -> Dict[str, Any]:
    cols = ["id", "code", "name", "legal_name", "tagline", "domain", "phone", "whatsapp", "email", "address", "state", "state_code", "gstin",
            "pan", "sac_code", "gst_rate", "gst_applies_to", "invoice_prefix", "estimate_prefix", "bank_account_name", "bank_name",
            "bank_account_number", "bank_ifsc", "bank_branch", "upi_id", "terms_invoice", "terms_estimate", "rules_text", "footer_note",
            "signatory", "primary_color", "estimate_valid_days", "advance_percent", "payment_links_enabled", "is_default", "is_active"]
    out = {c: getattr(b, c) for c in cols}
    out["id"] = str(b.id)
    return out


def _fy(d: Optional[date] = None) -> str:
    d = d or date.today()
    start = d.year if d.month >= 4 else d.year - 1
    return f"{str(start)[-2:]}-{str(start + 1)[-2:]}"


def next_number(db: Session, prefix: str, fy: str) -> str:
    """Sequential per brand prefix and financial year, row-locked so two people issuing at once never get the same number."""
    series = f"BILL-{prefix}"
    row = db.query(InvoiceSequence).filter(InvoiceSequence.series == series, InvoiceSequence.financial_year == fy).with_for_update().first()
    if row is None:
        db.add(InvoiceSequence(series=series, financial_year=fy, last_number=0))
        db.flush()
        row = db.query(InvoiceSequence).filter(InvoiceSequence.series == series, InvoiceSequence.financial_year == fy).with_for_update().first()
    row.last_number += 1
    db.flush()
    return f"{prefix}/{fy}/{row.last_number:04d}"


# ---------------------------------------------------------------- brands
def get_brand(db: Session, brand_id: Optional[str]) -> BillingBrand:
    b = None
    if brand_id:
        try:
            b = db.query(BillingBrand).filter(BillingBrand.id == uuid.UUID(str(brand_id))).first()
        except ValueError:
            b = db.query(BillingBrand).filter(BillingBrand.code == str(brand_id)).first()
    if b is None:
        b = db.query(BillingBrand).filter(BillingBrand.is_default.is_(True), BillingBrand.is_active.is_(True)).first() or db.query(BillingBrand).first()
    if b is None:
        raise HTTPException(status_code=404, detail="No brand is set up yet")
    return b


# ---------------------------------------------------------------- calculation + serialisation
def _payments_total(doc: BillingDocument) -> int:
    return sum(int(p.get("amount") or 0) for p in (doc.payments or []))


def recalc(doc: BillingDocument) -> Dict[str, int]:
    t = billing_calc.compute_totals(
        doc.lines or [], gst_mode=doc.gst_mode, gst_rate=doc.gst_rate, gst_collection=doc.gst_collection, applies_to=doc.gst_applies_to,
        interstate=bool(doc.interstate), discount=doc.discount or 0, gst_override=doc.gst_override, payments_total=_payments_total(doc),
        advance_requested=doc.advance_requested or 0,
    )
    doc.subtotal, doc.taxable_value, doc.gst_amount = t["subtotal"], t["taxable_value"], t["gst_amount"]
    doc.total_amount, doc.amount_due, doc.paid_amount, doc.balance_due = t["total_amount"], t["amount_due"], t["paid_amount"], t["balance_due"]
    doc.payment_status = t["payment_status"] if doc.doc_type == "INVOICE" else "UNPAID"
    return t


def serialize(doc: BillingDocument, db: Optional[Session] = None, include_brand_live: bool = False) -> Dict[str, Any]:
    t = billing_calc.compute_totals(
        doc.lines or [], gst_mode=doc.gst_mode, gst_rate=doc.gst_rate, gst_collection=doc.gst_collection, applies_to=doc.gst_applies_to,
        interstate=bool(doc.interstate), discount=doc.discount or 0, gst_override=doc.gst_override, payments_total=_payments_total(doc),
        advance_requested=doc.advance_requested or 0,
    )
    brand = dict(doc.brand_snapshot or {})
    if (include_brand_live or not brand) and db is not None and doc.brand_id:
        b = db.query(BillingBrand).filter(BillingBrand.id == doc.brand_id).first()
        if b is not None:
            brand = brand_dict(b)
    terms = doc.terms_override or (brand.get("terms_estimate") if doc.doc_type == "ESTIMATE" else brand.get("terms_invoice")) or ""
    date_src = doc.issued_at or doc.created_at
    return {
        "id": str(doc.id), "doc_type": doc.doc_type, "number": doc.number, "status": doc.status, "payment_status": doc.payment_status,
        "date": date_src.astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%d %b %Y") if date_src else None,
        "brand": brand, "brand_id": str(doc.brand_id) if doc.brand_id else None,
        "booking_ref": doc.booking_ref, "order_id": doc.order_id,
        "customer": {"name": doc.customer_name, "phone": doc.customer_phone, "email": doc.customer_email, "gstin": doc.customer_gstin,
                     "company": doc.customer_company, "address": doc.customer_address, "state": doc.customer_state},
        "trip": doc.trip or {}, "lines": billing_calc.normalize_lines(doc.lines),
        "gst": {"mode": doc.gst_mode, "rate": doc.gst_rate, "collection": doc.gst_collection, "applies_to": doc.gst_applies_to, "interstate": bool(doc.interstate),
                "override": doc.gst_override},
        "discount": doc.discount or 0, "discount_label": doc.discount_label, "advance_requested": doc.advance_requested or 0,
        "totals": t, "payments": doc.payments or [], "payment_links": doc.payment_links or [],
        "valid_until": doc.valid_until.isoformat() if doc.valid_until else None, "notes": doc.notes, "terms": terms, "terms_override": doc.terms_override,
        "share_token": doc.share_token, "converted_from_id": str(doc.converted_from_id) if doc.converted_from_id else None,
        "converted_to_id": str(doc.converted_to_id) if doc.converted_to_id else None, "cancel_reason": doc.cancel_reason,
        "history": doc.history or [], "created_by": doc.created_by,
        "prepared_by": {"name": doc.created_by, "phone": doc.created_by_phone},
        "shared_by": _shared_by(doc),
        "created_at": doc.created_at.isoformat() if doc.created_at else None, "issued_at": doc.issued_at.isoformat() if doc.issued_at else None,
    }


def _shared_by(doc: BillingDocument) -> List[Dict[str, Any]]:
    """Everyone who sent this document to the customer (newest last) - so a follow-up goes to the right person."""
    return [{"name": h.get("by"), "at": h.get("at"), "detail": h.get("detail")} for h in (doc.history or []) if h.get("action") == "SHARED"]


def log_shared(db: Session, doc: BillingDocument, who: str, via: str = "") -> None:
    _log(doc, who, "SHARED", via)
    db.commit()


def _log(doc: BillingDocument, who: str, action: str, detail: str = "") -> None:
    h = list(doc.history or [])
    h.append({"at": datetime.now(timezone.utc).isoformat(), "by": who, "action": action, "detail": detail})
    doc.history = h[-60:]


# ---------------------------------------------------------------- pre-fill from a booking id
def _fare_kind(label: str) -> str:
    l = (label or "").lower()
    return "FARE" if any(k in l for k in ("distance", "km fare", "all-inclusive", "extra km", "package", "trip fare", "extra distance")) else "CHARGE"


def prefill_from_booking(db: Session, ref: str, brand: Optional[BillingBrand] = None) -> Dict[str, Any]:
    """Type a booking id (order id, website booking id / reference, or an old invoice number) and get everything filled in."""
    from app.crud.end_records import build_customer_bill
    from app.models.order_assignments import OrderAssignment, AssignmentStatusEnum
    from app.models.car_driver import CarDriver
    from app.models.car_details import CarDetails
    from app.api.routes.tax_admin import _invoice_order_and_request

    ref = str(ref or "").strip()
    if not ref:
        raise HTTPException(status_code=400, detail="Enter a booking id")
    order, cb = _invoice_order_and_request(db, ref)
    if order is None and cb is None:
        old = db.query(BillingDocument).filter(BillingDocument.number == ref).first()
        if old is not None:
            return {**serialize(old), "from_document": True}
        raise HTTPException(status_code=404, detail=f"No booking found for '{ref}'")

    out: Dict[str, Any] = {"booking_ref": ref, "order_id": order.id if order else None, "lines": [], "payments": [], "trip": {}, "customer": {}, "gst": {}}
    if order is not None:
        bill = build_customer_bill(db, order)
        for l in bill["lines"]:
            if l["label"] == "Convenience fee":
                out["lines"].append({"label": l["label"], "amount": l["amount"], "kind": "CHARGE", "included": True})
            else:
                out["lines"].append({"label": l["label"], "amount": l["amount"], "kind": _fare_kind(l["label"]), "included": True})
        collected = {str(e.get("label")): e.get("amount") for e in (bill.get("extra_charges_paid_directly") or [])}
        for item in (getattr(order, "charge_items", None) or []):
            if isinstance(item, dict) and item.get("included") is False and item.get("label"):
                out["lines"].append({"label": str(item["label"]), "amount": int(collected.get(str(item["label"])) or 0), "kind": "CHARGE", "included": False})
        if int(bill.get("advance_received") or 0) > 0:
            out["payments"].append({"id": uuid.uuid4().hex, "amount": int(bill["advance_received"]), "mode": "Advance (taken at booking)", "purpose": "ADVANCE",
                                    "source": "BOOKING", "at": datetime.now(timezone.utc).isoformat(), "by": "booking"})
        out["trip"] = {"pickup": bill.get("from"), "drop": bill.get("to"), "trip_type": bill.get("trip_type"),
                       "vehicle": str(getattr(order.car_type, "value", order.car_type) or "").replace("_", " ").title(),
                       "start_at": (order.start_date_time.astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%d %b %Y, %I:%M %p") if order.start_date_time else None),
                       "end_at": (order.end_date_time.astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%d %b %Y, %I:%M %p") if order.end_date_time else None),
                       "km": bill.get("km_billed") or bill.get("km_driven")}
        out["customer"] = {"name": order.customer_name, "phone": order.customer_number}
        if cb is not None and getattr(cb, "customer_email", None):
            out["customer"]["email"] = cb.customer_email
        a = (db.query(OrderAssignment).filter(OrderAssignment.order_id == order.id, OrderAssignment.assignment_status != AssignmentStatusEnum.CANCELLED)
             .order_by(OrderAssignment.created_at.desc()).first())
        if a is not None:
            d = db.query(CarDriver).filter(CarDriver.id == a.driver_id).first() if a.driver_id else None
            c = db.query(CarDetails).filter(CarDetails.id == a.car_id).first() if a.car_id else None
            out["trip"]["driver_name"] = d.full_name if d else None
            out["trip"]["vehicle_number"] = c.car_number if c else None
        if getattr(order, "gst_included", False) and int(order.gst_amount or 0) > 0:
            out["gst"] = {"mode": "INCLUDED", "override": int(order.gst_amount)}      # the booking's price already contains this GST
        out["status_hint"] = str(getattr(order.trip_status, "value", order.trip_status) or "")
    else:
        from app.models.customer_booking_request import CustomerBookingRequest as R
        pick = lambda f: (getattr(cb, "admin_" + f, None) if getattr(cb, "admin_" + f, None) is not None else getattr(cb, "quoted_" + f, 0)) or 0
        km = int(cb.quoted_trip_distance or 0)
        rate = int(pick("cost_per_km")) + int(pick("extra_cost_per_km"))
        out["lines"] = [{"label": f"Km fare ({km} km x Rs {rate})", "amount": km * rate, "kind": "FARE", "included": True},
                        {"label": "Driver bata", "amount": int(pick("driver_allowance")) + int(pick("extra_driver_allowance")), "kind": "CHARGE", "included": True},
                        {"label": "State permit", "amount": int(pick("permit_charges")) + int(pick("extra_permit_charges")), "kind": "CHARGE", "included": True},
                        {"label": "Hill / ghat charges", "amount": int(pick("hill_charges")), "kind": "CHARGE", "included": True},
                        {"label": "Toll", "amount": int(pick("toll_charges")), "kind": "CHARGE", "included": True},
                        {"label": "Night allowance", "amount": int(pick("night_charges")), "kind": "CHARGE", "included": True}]
        loc = cb.pickup_drop_location or {}
        keys = sorted(loc.keys(), key=lambda k: int(k) if str(k).isdigit() else 0) if isinstance(loc, dict) else []
        out["trip"] = {"pickup": loc.get(keys[0]) if keys else None, "drop": loc.get(keys[-1]) if len(keys) > 1 else None, "trip_type": cb.trip_type,
                       "vehicle": str(cb.car_type or "").replace("_", " ").title(), "km": km,
                       "start_at": cb.start_date_time.astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%d %b %Y, %I:%M %p") if cb.start_date_time else None}
        out["customer"] = {"name": cb.customer_name, "phone": cb.customer_number, "email": getattr(cb, "customer_email", None)}
        adv = int(getattr(cb, "advance_paid", 0) or getattr(cb, "advance_amount", 0) or 0)
        if adv > 0:
            out["payments"].append({"id": uuid.uuid4().hex, "amount": adv, "mode": "Advance (website)", "purpose": "ADVANCE", "source": "BOOKING",
                                    "at": datetime.now(timezone.utc).isoformat(), "by": "website"})
    out["lines"] = billing_calc.normalize_lines(out["lines"])
    return out


# ---------------------------------------------------------------- create / update
def _apply(doc: BillingDocument, p: Dict[str, Any], brand: BillingBrand) -> None:
    c = p.get("customer") or {}
    doc.customer_name, doc.customer_phone, doc.customer_email = c.get("name"), c.get("phone"), c.get("email")
    doc.customer_gstin = (c.get("gstin") or "").strip().upper() or None
    doc.customer_company, doc.customer_address, doc.customer_state = c.get("company"), c.get("address"), c.get("state")
    if "trip" in p:
        doc.trip = p.get("trip") or {}
    if "lines" in p:
        doc.lines = billing_calc.normalize_lines(p.get("lines"))
    g = p.get("gst") or {}
    mode = str(g.get("mode") or doc.gst_mode or "NONE").upper()
    if mode in ("EXTRA", "INCLUDED") and not (brand.gstin or "").strip():
        raise HTTPException(status_code=422, detail=f"{brand.name} has no GSTIN yet. Add it in Brands, or choose 'No GST'.")
    doc.gst_mode = mode if mode in billing_calc.GST_MODES else "NONE"
    doc.gst_rate = int(g.get("rate") if g.get("rate") is not None else (brand.gst_rate if doc.gst_mode != "NONE" else 0)) if doc.gst_mode != "NONE" else 0
    coll = str(g.get("collection") or doc.gst_collection or "COLLECT").upper()
    doc.gst_collection = coll if coll in billing_calc.GST_COLLECTIONS else "COLLECT"
    doc.gst_applies_to = str(g.get("applies_to") or brand.gst_applies_to or "KM_FARE").upper()
    doc.interstate = bool(g.get("interstate")) if "interstate" in g else _interstate(brand, doc.customer_state)
    doc.gst_override = int(g["override"]) if g.get("override") not in (None, "") else None
    if "discount" in p:
        doc.discount = max(0, int(p.get("discount") or 0))
        doc.discount_label = p.get("discount_label")
    if "advance_requested" in p:
        doc.advance_requested = max(0, int(p.get("advance_requested") or 0))
    if "notes" in p:
        doc.notes = p.get("notes")
    if "terms_override" in p:
        doc.terms_override = (p.get("terms_override") or "").strip() or None
    if p.get("valid_until"):
        try:
            doc.valid_until = date.fromisoformat(str(p["valid_until"])[:10])
        except ValueError:
            pass
    if "booking_ref" in p:
        doc.booking_ref = (str(p.get("booking_ref") or "").strip() or None)
    if p.get("order_id"):
        doc.order_id = int(p["order_id"])
    if "payments" in p and isinstance(p["payments"], list):
        doc.payments = [x for x in p["payments"] if isinstance(x, dict) and int(x.get("amount") or 0) > 0]


def _interstate(brand: BillingBrand, customer_state: Optional[str]) -> bool:
    cs, bs = (customer_state or "").strip().lower(), (brand.state or "").strip().lower()
    return bool(cs and bs and cs != bs)


def create_document(db: Session, p: Dict[str, Any], admin_name: str, admin_phone: Optional[str] = None) -> BillingDocument:
    doc_type = str(p.get("doc_type") or "INVOICE").upper()
    if doc_type not in ("INVOICE", "ESTIMATE"):
        raise HTTPException(status_code=400, detail="doc_type must be INVOICE or ESTIMATE")
    brand = get_brand(db, p.get("brand_id"))
    fy = _fy()
    doc = BillingDocument(
        doc_type=doc_type, number=f"DRAFT-{uuid.uuid4().hex[:10].upper()}", financial_year=fy, brand_id=brand.id, brand_snapshot=brand_dict(brand),
        status="DRAFT", lines=[], gst_applies_to=brand.gst_applies_to, created_by=admin_name, created_by_phone=admin_phone, share_token=secrets.token_urlsafe(18), payments=[], payment_links=[],
    )
    _apply(doc, p, brand)
    if doc_type == "ESTIMATE":
        doc.valid_until = doc.valid_until or (date.today() + timedelta(days=int(brand.estimate_valid_days or 7)))
    doc.gst_applies_to = doc.gst_applies_to or brand.gst_applies_to
    recalc(doc)
    _log(doc, admin_name, "CREATED")
    db.add(doc)
    db.flush()
    if p.get("issue"):
        issue(db, doc, admin_name)
    db.commit()
    db.refresh(doc)
    return doc


def update_document(db: Session, doc: BillingDocument, p: Dict[str, Any], admin_name: str) -> BillingDocument:
    if doc.status == "CANCELLED":
        raise HTTPException(status_code=409, detail="A cancelled document cannot be edited")
    brand = get_brand(db, str(doc.brand_id)) if doc.brand_id else get_brand(db, None)
    if p.get("brand_id") and str(p["brand_id"]) != str(doc.brand_id):
        if doc.status != "DRAFT":
            raise HTTPException(status_code=409, detail="The brand of an issued document cannot change. Cancel it and make a new one.")
        brand = get_brand(db, p["brand_id"])
        doc.brand_id, doc.brand_snapshot = brand.id, brand_dict(brand)
    _apply(doc, p, brand)
    recalc(doc)
    _log(doc, admin_name, "EDITED")
    db.commit()
    db.refresh(doc)
    return doc


def issue(db: Session, doc: BillingDocument, admin_name: str) -> BillingDocument:
    """Gives the document its real number and fixes the brand details on it. NEVER needs a payment first."""
    if doc.status != "DRAFT":
        return doc
    brand = get_brand(db, str(doc.brand_id)) if doc.brand_id else get_brand(db, None)
    doc.brand_snapshot = brand_dict(brand)
    prefix = brand.estimate_prefix if doc.doc_type == "ESTIMATE" else brand.invoice_prefix
    doc.number = next_number(db, prefix, doc.financial_year)
    doc.status = "ISSUED"
    doc.issued_at = datetime.now(timezone.utc)
    recalc(doc)
    _log(doc, admin_name, "ISSUED", doc.number)
    if doc.doc_type == "INVOICE" and doc.gst_mode != "NONE":
        _sync_tax_ledger(db, doc, admin_name)
    return doc


def _sync_tax_ledger(db: Session, doc: BillingDocument, admin_name: str) -> None:
    """A GST invoice also goes into the GST ledger (the GSTR reports read it). Never blocks issuing the invoice."""
    try:
        from app.models.tax_invoice import TaxInvoice, InvoiceTypeEnum, InvoiceStatusEnum
        t = recalc(doc)
        row = TaxInvoice(
            invoice_number=doc.number, financial_year=doc.financial_year, invoice_type=InvoiceTypeEnum.RIDE_GST_9_5, status=InvoiceStatusEnum.ISSUED,
            source_type="billing_doc", source_id=str(doc.id), customer_name_snapshot=doc.customer_name, customer_number_snapshot=doc.customer_phone,
            billed_party_name_snapshot=doc.customer_company or doc.customer_name, billed_party_gstin_snapshot=doc.customer_gstin,
            base_fare=t["taxable_value"], taxable_value=t["taxable_value"], is_interstate=bool(doc.interstate), gst_rate_percent=int(doc.gst_rate or 0),
            cgst_amount=t["cgst"], sgst_amount=t["sgst"], igst_amount=t["igst"], total_gst_amount=t["gst_amount"], total_amount=t["total_amount"],
            hsn_sac_code=(doc.brand_snapshot or {}).get("sac_code") or "9964", line_items={"lines": doc.lines, "trip": doc.trip, "brand": (doc.brand_snapshot or {}).get("name")},
        )
        db.add(row)
        db.flush()
        doc.tax_invoice_id = row.id
    except Exception as e:                                           # the ledger is a copy; the invoice itself must always be issued
        logger.warning("GST ledger copy failed for %s: %s", doc.number, e)


def cancel(db: Session, doc: BillingDocument, reason: str, admin_name: str) -> BillingDocument:
    if doc.status == "CANCELLED":
        return doc
    doc.status = "CANCELLED"
    doc.cancel_reason = (reason or "").strip()[:300] or "Cancelled"
    if doc.tax_invoice_id:
        try:
            from app.models.tax_invoice import TaxInvoice, InvoiceStatusEnum
            row = db.query(TaxInvoice).filter(TaxInvoice.id == doc.tax_invoice_id).first()
            if row is not None:
                row.status = InvoiceStatusEnum.CANCELLED
        except Exception as e:
            logger.warning("ledger cancel failed for %s: %s", doc.number, e)
    _log(doc, admin_name, "CANCELLED", doc.cancel_reason)
    db.commit()
    return doc


def convert_estimate(db: Session, est: BillingDocument, admin_name: str, issue_now: bool = True) -> BillingDocument:
    if est.doc_type != "ESTIMATE":
        raise HTTPException(status_code=400, detail="Only an estimate can be converted")
    if est.converted_to_id:
        existing = db.query(BillingDocument).filter(BillingDocument.id == est.converted_to_id).first()
        if existing is not None:
            return existing
    payload = serialize(est, db)
    inv = create_document(db, {
        "doc_type": "INVOICE", "brand_id": est.brand_id, "booking_ref": est.booking_ref, "order_id": est.order_id, "customer": payload["customer"],
        "trip": payload["trip"], "lines": payload["lines"], "gst": payload["gst"], "discount": est.discount, "discount_label": est.discount_label,
        "notes": est.notes, "payments": [], "issue": False,
    }, admin_name, est.created_by_phone)
    inv.created_by = admin_name or est.created_by
    inv.converted_from_id = est.id
    est.converted_to_id = inv.id
    est.status = "CONVERTED"
    _log(est, admin_name, "CONVERTED", "to invoice")
    if issue_now:
        issue(db, inv, admin_name)
    db.commit()
    db.refresh(inv)
    return inv


# ---------------------------------------------------------------- payments + links
def add_payment(db: Session, doc: BillingDocument, amount: int, mode: str, ref: Optional[str], note: Optional[str], purpose: str, admin_name: str,
                source: str = "MANUAL", at: Optional[str] = None) -> BillingDocument:
    amount = int(amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be more than 0")
    if doc.status == "CANCELLED":
        raise HTTPException(status_code=409, detail="This document is cancelled")
    pays = list(doc.payments or [])
    pays.append({"id": uuid.uuid4().hex, "amount": amount, "mode": (mode or "Cash").strip(), "ref": (ref or "").strip() or None, "note": note,
                 "purpose": (purpose or "PAYMENT").upper(), "source": source, "at": at or datetime.now(timezone.utc).isoformat(), "by": admin_name})
    doc.payments = pays
    recalc(doc)
    _log(doc, admin_name, "PAYMENT", f"{amount} via {mode}")
    db.commit()
    db.refresh(doc)
    return doc


def remove_payment(db: Session, doc: BillingDocument, payment_id: str, admin_name: str) -> BillingDocument:
    before = list(doc.payments or [])
    doc.payments = [p for p in before if p.get("id") != payment_id]
    if len(doc.payments) == len(before):
        raise HTTPException(status_code=404, detail="Payment not found")
    recalc(doc)
    _log(doc, admin_name, "PAYMENT_REMOVED", payment_id)
    db.commit()
    db.refresh(doc)
    return doc


def _razorpay_ready() -> bool:
    import os
    return bool(os.getenv("RAZORPAY_KEY_ID") and os.getenv("RAZORPAY_KEY_SECRET"))


def create_link(db: Session, doc: BillingDocument, purpose: str, amount: Optional[int], admin_name: str) -> Dict[str, Any]:
    """A payment link for the ADVANCE, the GST, the BALANCE or any amount. Several links can exist; each one is recorded as a payment
    only when it is paid (checked by check_links / the hourly sweep)."""
    purpose = (purpose or "BALANCE").upper()
    t = serialize(doc)["totals"]
    default = {"ADVANCE": doc.advance_requested or t["payable_now"], "GST": t["gst_pending"] or t["gst_amount"], "BALANCE": t["payable_now"] or t["balance_due"]}.get(purpose, 0)
    amt = int(amount or default or 0)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Nothing to collect for this link - enter an amount")
    if not _razorpay_ready():
        raise HTTPException(status_code=503, detail="Online payment links are not set up yet (Razorpay keys missing). Record the payment manually instead.")
    from app.utils.razorpay_client import RazorpayClient
    contact = "".join(ch for ch in str(doc.customer_phone or "") if ch.isdigit())[-10:]
    try:
        link = RazorpayClient().create_payment_link(
            amount_rupees=amt, description=f"{(doc.brand_snapshot or {}).get('name', 'Drop Cars')} - {doc.number} ({purpose.title()})",
            reference_id=f"bd-{doc.id.hex[:12]}-{secrets.token_hex(4)}", customer_name=doc.customer_name,
            customer_contact=f"+91{contact}" if len(contact) == 10 else None,
            notes={"purpose": "billing_document", "document_id": str(doc.id), "number": doc.number, "link_purpose": purpose}, expire_in_hours=72)
    except Exception as e:
        logger.warning("billing link failed: %s", e)
        raise HTTPException(status_code=502, detail="Razorpay could not create the link right now. Try again in a minute, or record the payment manually.")
    links = list(doc.payment_links or [])
    entry = {"id": uuid.uuid4().hex, "purpose": purpose, "amount": amt, "url": link["short_url"], "rp_link_id": link["id"], "status": "PENDING",
             "created_at": datetime.now(timezone.utc).isoformat()}
    links.append(entry)
    doc.payment_links = links
    _log(doc, admin_name, "LINK", f"{purpose} {amt}")
    db.commit()
    return entry


def check_links(db: Session, doc: BillingDocument, admin_name: str = "system") -> int:
    """Ask Razorpay about every open link of this document and record the ones that were paid (once). Returns how many were newly paid."""
    if not _razorpay_ready():
        return 0
    from app.utils.razorpay_client import RazorpayClient
    rz = RazorpayClient()
    links = [dict(l) for l in (doc.payment_links or [])]
    new_paid = 0
    for l in links:
        if l.get("status") not in ("PENDING", None):
            continue
        try:
            info = rz.get_payment_link(l["rp_link_id"])
        except Exception as e:
            logger.warning("billing link check failed %s: %s", l.get("rp_link_id"), e)
            continue
        st = (info.get("status") or "").lower()
        if st == "paid":
            pays = [p for p in (info.get("payments") or []) if (p.get("status") or "").lower() in ("captured", "paid")]
            pid = (pays[0].get("payment_id") if pays else None) or l["rp_link_id"]
            l["status"] = "PAID"
            if not any(p.get("link_id") == l["rp_link_id"] for p in (doc.payments or [])):
                doc.payments = list(doc.payments or []) + [{"id": uuid.uuid4().hex, "amount": int(l["amount"]), "mode": "Online (payment link)", "ref": pid, "purpose": l["purpose"],
                                                            "source": "LINK", "link_id": l["rp_link_id"], "at": datetime.now(timezone.utc).isoformat(), "by": "payment link"}]
                new_paid += 1
        elif st in ("expired", "cancelled"):
            l["status"] = st.upper()
    doc.payment_links = links
    if new_paid:
        recalc(doc)
        _log(doc, admin_name, "LINK_PAID", f"{new_paid} link(s)")
    db.commit()
    return new_paid


def reconcile_pending_links(db: Session, max_docs: int = 40) -> dict:
    """Sweep step: record link payments that happened while nobody had the document open."""
    if not _razorpay_ready():
        return {"checked": 0, "paid": 0}
    since = datetime.now(timezone.utc) - timedelta(days=14)
    docs = (db.query(BillingDocument).filter(BillingDocument.updated_at >= since, BillingDocument.status != "CANCELLED")
            .order_by(BillingDocument.updated_at.desc()).limit(300).all())
    checked = paid = 0
    for d in docs:
        if checked >= max_docs:
            break
        if not any(l.get("status") in ("PENDING", None) for l in (d.payment_links or [])):
            continue
        checked += 1
        try:
            paid += check_links(db, d)
        except Exception as e:
            db.rollback()
            logger.warning("billing reconcile failed for %s: %s", d.number, e)
    return {"checked": checked, "paid": paid}


# ---------------------------------------------------------------- listing
def list_documents(db: Session, doc_type: Optional[str], status: Optional[str], brand_id: Optional[str], search: Optional[str], limit: int, skip: int,
                   created_by: Optional[str] = None) -> List[BillingDocument]:
    q = db.query(BillingDocument)
    if created_by:
        q = q.filter(BillingDocument.created_by == created_by)
    if doc_type:
        q = q.filter(BillingDocument.doc_type == doc_type.upper())
    if status:
        s = status.upper()
        if s in ("PAID", "PARTIAL", "UNPAID"):
            q = q.filter(BillingDocument.payment_status == s, BillingDocument.status != "CANCELLED", BillingDocument.doc_type == "INVOICE")
        else:
            q = q.filter(BillingDocument.status == s)
    if brand_id:
        try:
            q = q.filter(BillingDocument.brand_id == uuid.UUID(brand_id))
        except ValueError:
            pass
    if search and search.strip():
        like = f"%{search.strip()}%"
        q = q.filter(or_(BillingDocument.number.ilike(like), BillingDocument.customer_name.ilike(like), BillingDocument.customer_phone.ilike(like),
                         BillingDocument.booking_ref.ilike(like), BillingDocument.customer_company.ilike(like)))
    return q.order_by(BillingDocument.created_at.desc()).offset(skip).limit(min(limit, 200)).all()


def summary_row(d: BillingDocument) -> Dict[str, Any]:
    return {"id": str(d.id), "doc_type": d.doc_type, "number": d.number, "status": d.status, "payment_status": d.payment_status,
            "customer_name": d.customer_name, "customer_phone": d.customer_phone, "booking_ref": d.booking_ref,
            "brand": (d.brand_snapshot or {}).get("name"), "brand_color": (d.brand_snapshot or {}).get("primary_color"),
            "gst_mode": d.gst_mode, "total_amount": d.total_amount, "balance_due": d.balance_due, "paid_amount": d.paid_amount,
            "valid_until": d.valid_until.isoformat() if d.valid_until else None, "created_by": d.created_by, "created_by_phone": d.created_by_phone,
            "created_at": d.created_at.isoformat() if d.created_at else None}
