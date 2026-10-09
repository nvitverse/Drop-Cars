"""Admin App > Invoices & Estimates.

  brands        GET/POST/PUT /api/admin/billing/brands          (changing a brand is Owner-only; everyone can pick one)
  pre-fill      GET /api/admin/billing/prefill?ref=<booking id>  one id fills customer, trip, charges, advance and GST from the booking
  estimate calc POST /api/admin/billing/fare-lines               the same km / minimum-km / bata-per-day formulas the booking screens use
  live totals   POST /api/admin/billing/calc
  documents     list / create / edit / issue / cancel / convert estimate -> invoice
  payments      POST/DELETE .../payments (manual receipt) and POST .../links (+ /links/check) for Razorpay links: advance, GST, balance
  sharing       GET .../share (WhatsApp text + public link), .../html, .../pdf, and the public page /api/billing/public/{token}
An unpaid invoice is never blocked: issuing needs no payment, a payment can be recorded by hand at any time."""
import urllib.parse
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.crud import billing_docs as svc
from app.database.session import get_db
from app.models.billing import BillingBrand, BillingDocument, BillingRateCard
from app.utils import billing_calc
from app.utils.billing_render import render_document_html, render_document_pdf

router = APIRouter(prefix="/admin/billing", tags=["Invoices & Estimates"])
public_router = APIRouter(prefix="/billing/public", tags=["Invoices & Estimates (public link)"])


def _admin_name(admin) -> str:
    return getattr(admin, "username", None) or "Admin"


def _admin_phone(admin) -> Optional[str]:
    return getattr(admin, "phone", None) or None


def _doc(db: Session, doc_id: str) -> BillingDocument:
    import uuid
    try:
        d = db.query(BillingDocument).filter(BillingDocument.id == uuid.UUID(doc_id)).first()
    except ValueError:
        d = db.query(BillingDocument).filter(BillingDocument.number == doc_id).first()
    if d is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return d


# ------------------------------------------------------------------ brands
BRAND_FIELDS = ["name", "legal_name", "tagline", "domain", "phone", "whatsapp", "email", "address", "state", "state_code", "gstin", "pan", "sac_code",
                "gst_rate", "gst_applies_to", "invoice_prefix", "estimate_prefix", "bank_account_name", "bank_name", "bank_account_number", "bank_ifsc",
                "bank_branch", "upi_id", "terms_invoice", "terms_estimate", "rules_text", "footer_note", "highlights", "includes_text", "excludes_text", "signatory", "primary_color", "secondary_color", "font_style",
                "estimate_valid_days", "advance_percent", "payment_links_enabled", "is_default", "is_active"]


class BrandIn(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    legal_name: Optional[str] = None
    tagline: Optional[str] = None
    domain: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    sac_code: Optional[str] = None
    gst_rate: Optional[int] = Field(None, ge=0, le=28)
    gst_applies_to: Optional[str] = None
    invoice_prefix: Optional[str] = None
    estimate_prefix: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_branch: Optional[str] = None
    upi_id: Optional[str] = None
    terms_invoice: Optional[str] = None
    terms_estimate: Optional[str] = None
    rules_text: Optional[str] = None
    footer_note: Optional[str] = None
    highlights: Optional[str] = None
    includes_text: Optional[str] = None
    excludes_text: Optional[str] = None
    signatory: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    font_style: Optional[str] = None
    estimate_valid_days: Optional[int] = Field(None, ge=1, le=90)
    advance_percent: Optional[int] = Field(None, ge=0, le=100)
    payment_links_enabled: Optional[bool] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


def _valid_gstin(g: str) -> bool:
    import re
    return bool(re.match(r"^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$", g))


def _apply_brand(b: BillingBrand, body: BrandIn, db: Session) -> None:
    data = body.model_dump(exclude_unset=True)
    if data.get("gstin"):
        g = data["gstin"].strip().upper()
        if not _valid_gstin(g):
            raise HTTPException(status_code=422, detail="That does not look like a valid 15-character GSTIN")
        data["gstin"] = g
    if "gst_applies_to" in data and data["gst_applies_to"] not in (None, "KM_FARE", "ALL"):
        raise HTTPException(status_code=422, detail="gst_applies_to must be KM_FARE or ALL")
    for k in BRAND_FIELDS:
        if k in data:
            v = data[k]
            setattr(b, k, (v.strip() if isinstance(v, str) else v) if not (isinstance(v, str) and v.strip() == "" and k in ("gstin", "pan")) else None)
    if data.get("is_default"):
        db.query(BillingBrand).filter(BillingBrand.id != b.id).update({"is_default": False})


@router.get("/brands")
def list_brands(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    svc.seed_default_brands(db)
    return [svc.brand_dict(b) for b in db.query(BillingBrand).order_by(BillingBrand.is_default.desc(), BillingBrand.name).all()]


@router.post("/brands")
def create_brand(body: BrandIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.api.routes.admin import require_owner
    require_owner(admin)
    if not (body.name or "").strip():
        raise HTTPException(status_code=422, detail="Brand name is required")
    code = (body.code or body.name).strip().lower().replace(" ", "")
    if db.query(BillingBrand).filter(BillingBrand.code == code).first():
        raise HTTPException(status_code=409, detail="A brand with this code already exists")
    b = BillingBrand(code=code, name=body.name.strip(), terms_invoice=svc.DEFAULT_TERMS_INVOICE, terms_estimate=svc.DEFAULT_TERMS_ESTIMATE, rules_text=svc.DEFAULT_RULES)
    db.add(b)
    _apply_brand(b, body, db)
    db.commit()
    db.refresh(b)
    return svc.brand_dict(b)


@router.put("/brands/{brand_id}")
def update_brand(brand_id: str, body: BrandIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.api.routes.admin import require_owner
    require_owner(admin)
    b = svc.get_brand(db, brand_id)
    _apply_brand(b, body, db)
    db.commit()
    db.refresh(b)
    return svc.brand_dict(b)


# ------------------------------------------------------------------ helpers for the editor
@router.get("/options")
def options(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    svc.seed_default_brands(db)
    return {
        "standard_charges": billing_calc.STANDARD_CHARGES, "razorpay_ready": svc._razorpay_ready(),
        "gst_modes": [{"key": "NONE", "label": "No GST"}, {"key": "EXTRA", "label": "GST extra (added on top)"}, {"key": "INCLUDED", "label": "GST included in the amounts"}],
        "gst_collections": [{"key": "COLLECT", "label": "Collect GST with the invoice"}, {"key": "SHOW_ONLY", "label": "Show GST, do not charge it"},
                            {"key": "PAY_LATER", "label": "Customer pays GST later by link"}],
        "tariff_methods": [{"key": k, "label": v} for k, v in __import__("app.utils.billing_tariff", fromlist=["x"]).METHOD_LABELS.items()],
        "payment_modes": ["Cash", "UPI", "Bank transfer", "Card", "Cheque", "Adjusted / waived", "Other"],
    }


@router.get("/prefill")
def prefill(ref: str = Query(..., min_length=1), brand_id: Optional[str] = None, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    brand = svc.get_brand(db, brand_id)
    data = svc.prefill_from_booking(db, ref, brand)
    data["brand_id"] = str(brand.id)
    return data


class FareLinesIn(BaseModel):
    trip_type: str
    km: float = 0
    rate_per_km: float = 0
    extra_rate_per_km: float = 0
    bata_per_day: float = 0
    days: int = 1
    adjust: Optional[Dict[str, Any]] = None        # from the pricing rules the staff applied


@router.post("/fare-lines")
def fare_lines(body: FareLinesIn, admin=Depends(get_current_admin)):
    from app.utils.fare_rules import get_fare_rules
    from app.utils import billing_tariff
    res = billing_tariff.compute("KM_BATA", {"rate_per_km": body.rate_per_km, "extra_rate_per_km": body.extra_rate_per_km, "bata_per_day": body.bata_per_day},
                                 km=body.km, days=body.days, trip_type=body.trip_type, rules=get_fare_rules(), adjust=body.adjust)
    return {"lines": res["lines"], "notes": res["notes"], "meta": res.get("meta", {})}


class CalcIn(BaseModel):
    lines: List[Dict[str, Any]] = []
    gst_mode: str = "NONE"
    gst_rate: float = 0
    gst_collection: str = "COLLECT"
    applies_to: str = "KM_FARE"
    interstate: bool = False
    discount: int = 0
    gst_override: Optional[int] = None
    payments_total: int = 0
    advance_requested: int = 0


@router.post("/calc")
def calc(body: CalcIn, admin=Depends(get_current_admin)):
    return billing_calc.compute_totals(
        body.lines, gst_mode=body.gst_mode, gst_rate=body.gst_rate, gst_collection=body.gst_collection, applies_to=body.applies_to,
        interstate=body.interstate, discount=body.discount, gst_override=body.gst_override, payments_total=body.payments_total,
        advance_requested=body.advance_requested)


# ------------------------------------------------------------------ rate cards (tariffs) + estimate lines
class RateCardIn(BaseModel):
    brand_id: Optional[str] = None
    method: Optional[str] = None
    vehicle_key: Optional[str] = None
    vehicle_name: Optional[str] = None
    name: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


@router.get("/rate-cards")
def list_rate_cards(brand_id: Optional[str] = None, method: Optional[str] = None, include_inactive: bool = False,
                    db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    svc.seed_default_brands(db)
    q = db.query(BillingRateCard)
    if brand_id:
        q = q.filter(BillingRateCard.brand_id == svc.get_brand(db, brand_id).id)
    if method:
        q = q.filter(BillingRateCard.method == method.upper())
    if not include_inactive:
        q = q.filter(BillingRateCard.is_active.is_(True))
    return [svc.rate_card_dict(c) for c in q.order_by(BillingRateCard.sort_order, BillingRateCard.name).all()]


@router.post("/rate-cards")
def create_rate_card(body: RateCardIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.api.routes.admin import require_owner
    from app.utils import billing_tariff
    require_owner(admin)
    method = (body.method or "").upper()
    if method not in billing_tariff.METHODS:
        raise HTTPException(status_code=422, detail="Choose a valid tariff method")
    brand = svc.get_brand(db, body.brand_id)
    c = BillingRateCard(brand_id=brand.id, method=method, vehicle_key=body.vehicle_key, vehicle_name=body.vehicle_name, name=body.name or body.vehicle_name,
                        params=body.params or {}, is_active=True if body.is_active is None else body.is_active, sort_order=body.sort_order or 500)
    db.add(c)
    db.commit()
    db.refresh(c)
    return svc.rate_card_dict(c)


def _card(db: Session, card_id: str) -> BillingRateCard:
    import uuid
    try:
        c = db.query(BillingRateCard).filter(BillingRateCard.id == uuid.UUID(card_id)).first()
    except ValueError:
        c = None
    if c is None:
        raise HTTPException(status_code=404, detail="Rate card not found")
    return c


@router.put("/rate-cards/{card_id}")
def update_rate_card(card_id: str, body: RateCardIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.api.routes.admin import require_owner
    require_owner(admin)
    c = _card(db, card_id)
    for k in ("vehicle_key", "vehicle_name", "name", "params", "is_active", "sort_order"):
        v = getattr(body, k)
        if v is not None:
            setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return svc.rate_card_dict(c)


@router.delete("/rate-cards/{card_id}")
def delete_rate_card(card_id: str, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.api.routes.admin import require_owner
    require_owner(admin)
    c = _card(db, card_id)
    db.delete(c)
    db.commit()
    return {"deleted": True}


class EstimateLinesIn(BaseModel):
    method: Optional[str] = None
    rate_card_id: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    km: float = 0
    days: int = 1
    hours: Optional[str] = None
    trip_type: Optional[str] = "oneway"
    amount: Optional[float] = None
    name: Optional[str] = None
    adjust: Optional[Dict[str, Any]] = None


@router.post("/estimate-lines")
def estimate_lines(body: EstimateLinesIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    return svc.estimate_lines(db, body.model_dump())


@router.get("/staff")
def staff_names(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """People who made documents - for the 'made by' filter in the list."""
    rows = db.query(BillingDocument.created_by).filter(BillingDocument.created_by.isnot(None)).distinct().all()
    return sorted({r[0] for r in rows if r[0]})


# ------------------------------------------------------------------ pricing rules (state / location / route / hill ...)
class RuleIn(BaseModel):
    name: Optional[str] = None
    brand_id: Optional[str] = None
    scope: Optional[str] = None
    keywords: Optional[Any] = None
    route_from: Optional[Any] = None
    route_to: Optional[Any] = None
    match_on: Optional[str] = None
    effect: Optional[str] = None
    value: Optional[float] = None
    label: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    trip_types: Optional[Any] = None
    vehicles: Optional[Any] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    auto_apply: Optional[bool] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None
    note: Optional[str] = None


def _rule(db: Session, rule_id: str):
    import uuid
    from app.models.billing import BillingRule
    try:
        r = db.query(BillingRule).filter(BillingRule.id == uuid.UUID(rule_id)).first()
    except ValueError:
        r = None
    if r is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return r


@router.get("/rules")
def list_rules(brand_id: Optional[str] = None, include_inactive: bool = True, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.crud import billing_rules as rules
    svc.seed_default_brands(db)
    return {"rules": [rules.rule_dict(r) for r in rules.list_rules(db, brand_id, include_inactive)],
            "effects": [{"key": k, "label": v} for k, v in rules.EFFECT_LABELS.items()], "scopes": list(rules.SCOPES)}


@router.post("/rules")
def create_rule(body: RuleIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.api.routes.admin import require_owner
    from app.crud import billing_rules as rules
    require_owner(admin)
    return rules.rule_dict(rules.save_rule(db, body.model_dump(exclude_unset=True), _admin_name(admin)))


@router.put("/rules/{rule_id}")
def update_rule(rule_id: str, body: RuleIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.api.routes.admin import require_owner
    from app.crud import billing_rules as rules
    require_owner(admin)
    return rules.rule_dict(rules.save_rule(db, body.model_dump(exclude_unset=True), _admin_name(admin), _rule(db, rule_id)))


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: str, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    from app.api.routes.admin import require_owner
    require_owner(admin)
    db.delete(_rule(db, rule_id))
    db.commit()
    return {"deleted": True}


class SuggestIn(BaseModel):
    brand_id: Optional[str] = None
    pickup: Optional[str] = None
    drop: Optional[str] = None
    via: Optional[Any] = None
    texts: Optional[Any] = None
    trip_type: Optional[str] = None
    days: int = 1
    km: float = 0
    vehicle: Optional[str] = None
    on_date: Optional[str] = None
    fare_total: float = 0


@router.post("/rules/suggest")
def suggest_rules(body: SuggestIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """Which pricing rules fit this trip. Nothing is applied here - the editor shows them and the staff taps Apply (rules marked auto-apply are pre-ticked)."""
    from app.crud import billing_rules as rules
    return {"suggestions": rules.suggest(db, body.model_dump())}


# ------------------------------------------------------------------ documents
@router.get("/documents")
def list_documents(doc_type: Optional[str] = None, status: Optional[str] = None, brand_id: Optional[str] = None, search: Optional[str] = None,
                   created_by: Optional[str] = None, limit: int = 60, skip: int = 0, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    rows = svc.list_documents(db, doc_type, status, brand_id, search, limit, skip, created_by)
    return [svc.summary_row(d) for d in rows]


@router.post("/documents")
def create_document(body: Dict[str, Any], db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    return svc.serialize(svc.create_document(db, body, _admin_name(admin), _admin_phone(admin)), db)


@router.get("/documents/{doc_id}")
def get_document(doc_id: str, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    return svc.serialize(_doc(db, doc_id), db)


@router.put("/documents/{doc_id}")
def update_document(doc_id: str, body: Dict[str, Any], db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    return svc.serialize(svc.update_document(db, _doc(db, doc_id), body, _admin_name(admin)), db)


@router.post("/documents/{doc_id}/issue")
def issue_document(doc_id: str, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    d = _doc(db, doc_id)
    svc.issue(db, d, _admin_name(admin))
    db.commit()
    db.refresh(d)
    return svc.serialize(d, db)


class CancelIn(BaseModel):
    reason: str = Field("", max_length=300)


@router.post("/documents/{doc_id}/cancel")
def cancel_document(doc_id: str, body: CancelIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    return svc.serialize(svc.cancel(db, _doc(db, doc_id), body.reason, _admin_name(admin)), db)


@router.post("/documents/{doc_id}/convert")
def convert_document(doc_id: str, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    return svc.serialize(svc.convert_estimate(db, _doc(db, doc_id), _admin_name(admin)), db)


class PaymentIn(BaseModel):
    amount: int = Field(..., gt=0)
    mode: str = "Cash"
    ref: Optional[str] = None
    note: Optional[str] = None
    purpose: str = "PAYMENT"      # PAYMENT | ADVANCE | BALANCE | GST


@router.post("/documents/{doc_id}/payments")
def add_payment(doc_id: str, body: PaymentIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    return svc.serialize(svc.add_payment(db, _doc(db, doc_id), body.amount, body.mode, body.ref, body.note, body.purpose, _admin_name(admin)), db)


@router.delete("/documents/{doc_id}/payments/{payment_id}")
def remove_payment(doc_id: str, payment_id: str, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    return svc.serialize(svc.remove_payment(db, _doc(db, doc_id), payment_id, _admin_name(admin)), db)


class LinkIn(BaseModel):
    purpose: str = "BALANCE"      # ADVANCE | GST | BALANCE | CUSTOM
    amount: Optional[int] = None


@router.post("/documents/{doc_id}/links")
def create_link(doc_id: str, body: LinkIn, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    d = _doc(db, doc_id)
    entry = svc.create_link(db, d, body.purpose, body.amount, _admin_name(admin))
    return {"link": entry, "document": svc.serialize(d, db)}


@router.post("/documents/{doc_id}/links/check")
def check_links(doc_id: str, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    d = _doc(db, doc_id)
    n = svc.check_links(db, d, _admin_name(admin))
    db.refresh(d)
    return {"newly_paid": n, "document": svc.serialize(d, db)}


def _public_url(request: Request, token: str) -> str:
    base = str(request.base_url).rstrip("/")
    if base.startswith("http://") and "localhost" not in base and "127.0.0.1" not in base:
        base = "https://" + base[len("http://"):]
    return f"{base}/api/billing/public/{token}"


@router.get("/documents/{doc_id}/share")
def share_info(doc_id: str, request: Request, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    d = _doc(db, doc_id)
    s = svc.serialize(d, db)
    url = _public_url(request, d.share_token)
    brand, t = s["brand"], s["totals"]
    kind = "estimate" if d.doc_type == "ESTIMATE" else "invoice"
    amount = t["total_amount"] if d.doc_type == "ESTIMATE" else (t["balance_due"] or t["total_amount"])
    from app.utils.billing_render import _inc_exc
    trip = s.get("trip") or {}
    parts = [f"Hello {d.customer_name or ''}, your {brand.get('name')} {kind} {d.number} is ready."]
    if trip.get("pickup") and trip.get("drop"):
        parts.append(f"Route: {trip['pickup']} to {trip['drop']}" + (f" (about {trip['km']} km)" if trip.get("km") else ""))
    parts.append(f"{'Estimate total' if d.doc_type == 'ESTIMATE' else 'Balance due'}: Rs {amount:,}" + (" (incl. GST)" if s["gst"]["mode"] != "NONE" and s["gst"]["collection"] == "COLLECT" and d.doc_type == "ESTIMATE" else ""))
    if trip.get("km_limit"):
        parts.append(f"Km limit: up to {int(float(trip['km_limit']))} km" + (f"; extra km at Rs {trip['extra_km_rate']} per km" if trip.get("extra_km_rate") else ""))
    inc_l, exc_l = _inc_exc(s)
    if inc_l:
        parts.append("Included: " + ", ".join(t for t, _ in inc_l))
    if exc_l:
        parts.append("Not included (paid on actuals): " + ", ".join(t for t, _ in exc_l))
    if d.doc_type == "ESTIMATE":
        if s.get("advance_requested"):
            parts.append(f"Advance to confirm: Rs {int(s['advance_requested']):,}")
        if s.get("valid_until"):
            parts.append(f"Valid until {s['valid_until']}")
    for l in (s.get("payment_links") or []):
        if l.get("status") in ("PENDING", None) and l.get("url"):
            parts.append(f"Pay {str(l.get('purpose') or 'payment').lower()} Rs {int(l.get('amount') or 0):,}: {l['url']}")
    parts.append(f"View / download: {url}")
    parts.append(f"- {_admin_name(admin)}, {brand.get('name')} {brand.get('phone') or ''}")
    msg = "\n".join(parts).strip()
    phone = "".join(ch for ch in str(d.customer_phone or "") if ch.isdigit())[-10:]
    svc.log_shared(db, d, _admin_name(admin), "link shared")
    return {"public_url": url, "pdf_url": url + "/pdf", "message": msg, "phone": f"91{phone}" if len(phone) == 10 else None,
            "whatsapp_url": f"https://wa.me/91{phone}?text={urllib.parse.quote(msg)}" if len(phone) == 10 else None,
            "email_subject": f"{brand.get('name')} {kind} {d.number}"}


@router.get("/documents/{doc_id}/html", response_class=HTMLResponse)
def document_html(doc_id: str, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    return HTMLResponse(render_document_html(svc.serialize(_doc(db, doc_id), db)))


@router.get("/documents/{doc_id}/pdf")
def document_pdf(doc_id: str, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    d = _doc(db, doc_id)
    return Response(render_document_pdf(svc.serialize(d, db)), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{d.number.replace("/", "_")}.pdf"'})


# ------------------------------------------------------------------ the customer's link (no login; the long random token is the key)
def _by_token(db: Session, token: str) -> BillingDocument:
    d = db.query(BillingDocument).filter(BillingDocument.share_token == token).first()
    if d is None or d.status == "DRAFT":
        raise HTTPException(status_code=404, detail="This link is not valid")
    return d


@public_router.get("/{token}", response_class=HTMLResponse)
def public_view(token: str, db: Session = Depends(get_db)):
    d = _by_token(db, token)
    if any(l.get("status") in ("PENDING", None) for l in (d.payment_links or [])):
        try:
            svc.check_links(db, d, "customer view")
            db.refresh(d)
        except Exception:
            db.rollback()
    return HTMLResponse(render_document_html(svc.serialize(d, db), public=True, links={"pdf": f"{token}/pdf"}))


@public_router.get("/{token}/pdf")
def public_pdf(token: str, db: Session = Depends(get_db)):
    d = _by_token(db, token)
    return Response(render_document_pdf(svc.serialize(d, db)), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{d.number.replace("/", "_")}.pdf"'})
