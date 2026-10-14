"""Vendor App > Invoices & Estimates in the VENDOR'S OWN NAME.

A vendor posts bookings for their customers. This lets them give those customers an estimate or a GST / non-GST invoice that carries the
vendor's business name, address, GSTIN, UPI / bank and terms - not Drop Cars'. It reuses the staff billing engine (same totals, same PDF /
public link), with these differences:
  - one "business profile" per vendor (a BillingBrand with owner_vendor_id set; never shown to staff, never used for staff documents)
  - only the vendor's OWN bookings can be fetched by booking id
  - GST can only be charged when the vendor has saved a valid GSTIN; their GST is their own: it is NOT copied into Drop Cars' GST ledger
  - payment links are off (the money must go to the vendor, not to the platform's Razorpay account): the customer pays the vendor's UPI / bank
    and the vendor records the receipt by hand
  - numbering has the vendor's own prefix and its own sequence
  /api/users/vendor/billing/...   profile | prefill | options | calc | documents (list / create / edit / issue / cancel / convert / payments / share / pdf)"""
import re
import uuid
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.routes import billing_docs as staff_routes
from app.core.security import get_current_vendor
from app.crud import billing_docs as svc
from app.database.session import get_db
from app.models.billing import BillingBrand, BillingDocument
from app.models.orders import Order
from app.models.vendor_details import VendorDetails
from app.utils import billing_calc
from app.utils.billing_render import render_document_html, render_document_pdf

router = APIRouter(prefix="/users/vendor/billing", tags=["Vendor invoices"])

GSTIN_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$")
GST_STATES = {"01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
              "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "19": "West Bengal", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
              "24": "Gujarat", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
              "36": "Telangana", "37": "Andhra Pradesh"}
VENDOR_TERMS_INVOICE = "\n".join([
    "Toll, parking and state permit charges are billed at actuals unless they are shown as included in this invoice.",
    "Charges listed under 'Not included' are payable directly on actuals and are not part of the total.",
    "For any billing question please contact us on the phone number above.",
])
VENDOR_TERMS_ESTIMATE = "\n".join([
    "This estimate is based on the details given and is valid until the date shown. Final fare is as per the actual distance driven.",
    "Toll, parking and state permit charges listed under 'Not included' are payable on actuals.",
    "The booking is confirmed only after the advance is received.",
])


def _details(db: Session, vendor) -> Optional[VendorDetails]:
    return db.query(VendorDetails).filter(VendorDetails.vendor_id == vendor.id).first()


def _prefix_for(db: Session, name: str, vendor_id) -> str:
    """Short, unique document prefix from the business name (ACME TRAVELS -> AT, AT2 ... when taken)."""
    letters = "".join(w[0] for w in re.findall(r"[A-Za-z0-9]+", name or "")[:3]).upper() or "V"
    base, n = letters[:3], 0
    while True:
        cand = base if n == 0 else f"{base}{n + 1}"
        taken = db.query(BillingBrand).filter(BillingBrand.invoice_prefix == cand, BillingBrand.owner_vendor_id != vendor_id).first()
        if not taken:
            return cand
        n += 1


def vendor_brand(db: Session, vendor) -> BillingBrand:
    """The vendor's business profile; made from their account details the first time they open Invoices."""
    b = db.query(BillingBrand).filter(BillingBrand.owner_vendor_id == vendor.id).first()
    if b is not None:
        return b
    d = _details(db, vendor)
    name = (getattr(d, "business_name", None) or getattr(d, "full_name", None) or "My Business").strip()
    addr = ", ".join(x for x in [getattr(d, "address", None), getattr(d, "city", None), getattr(d, "pincode", None)] if x)
    prefix = _prefix_for(db, name, vendor.id)
    phone = getattr(d, "primary_number", None) or getattr(vendor, "primary_number", None)
    b = BillingBrand(
        code=f"vendor-{str(vendor.id)[:8]}", name=name, legal_name=None, phone=phone, whatsapp=phone, address=addr or None,
        state="Tamil Nadu", state_code="33", gstin=None, sac_code="9964", gst_rate=5, gst_applies_to="KM_FARE",
        invoice_prefix=prefix, estimate_prefix=f"{prefix}-EST", upi_id=getattr(d, "upi_id", None),
        bank_account_name=getattr(d, "bank_account_holder_name", None), bank_account_number=getattr(d, "bank_account_number", None),
        bank_ifsc=getattr(d, "bank_ifsc", None), terms_invoice=VENDOR_TERMS_INVOICE, terms_estimate=VENDOR_TERMS_ESTIMATE, rules_text=None,
        footer_note="Thank you for travelling with us", signatory=getattr(d, "full_name", None) or name, primary_color="#1D4ED8",
        estimate_valid_days=7, advance_percent=0, payment_links_enabled=False, is_default=False, is_active=True, owner_vendor_id=vendor.id,
    )
    db.add(b)
    try:
        db.commit()
    except IntegrityError:        # two screens asked for the profile at the same moment: the other request created it first
        db.rollback()
        existing = db.query(BillingBrand).filter(BillingBrand.owner_vendor_id == vendor.id).first()
        if existing is None:
            raise
        return existing
    db.refresh(b)
    return b


def _profile(b: BillingBrand) -> Dict[str, Any]:
    d = svc.brand_dict(b)
    for k in ("rules_text", "includes_text", "excludes_text", "highlights", "domain", "font_style", "secondary_color", "is_default", "payment_links_enabled", "code"):
        d.pop(k, None)
    d["gst_registered"] = bool((b.gstin or "").strip())
    return d


class ProfileIn(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    legal_name: Optional[str] = Field(None, max_length=160)
    tagline: Optional[str] = Field(None, max_length=120)
    phone: Optional[str] = Field(None, max_length=20)
    whatsapp: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=400)
    state: Optional[str] = Field(None, max_length=60)
    gstin: Optional[str] = None
    pan: Optional[str] = Field(None, max_length=12)
    gst_rate: Optional[int] = Field(None, ge=0, le=28)
    gst_applies_to: Optional[str] = None
    invoice_prefix: Optional[str] = Field(None, max_length=6)
    bank_account_name: Optional[str] = Field(None, max_length=120)
    bank_name: Optional[str] = Field(None, max_length=80)
    bank_account_number: Optional[str] = Field(None, max_length=24)
    bank_ifsc: Optional[str] = Field(None, max_length=15)
    upi_id: Optional[str] = Field(None, max_length=80)
    terms_invoice: Optional[str] = Field(None, max_length=2000)
    terms_estimate: Optional[str] = Field(None, max_length=2000)
    footer_note: Optional[str] = Field(None, max_length=160)
    signatory: Optional[str] = Field(None, max_length=80)
    primary_color: Optional[str] = Field(None, max_length=9)
    estimate_valid_days: Optional[int] = Field(None, ge=1, le=90)
    advance_percent: Optional[int] = Field(None, ge=0, le=100)


@router.get("/profile")
def get_profile(db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    return _profile(vendor_brand(db, vendor))


@router.put("/profile")
def save_profile(body: ProfileIn, db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    b = vendor_brand(db, vendor)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and not (data["name"] or "").strip():
        raise HTTPException(status_code=422, detail="The business name printed on your invoices cannot be empty")
    if "gstin" in data:
        g = (data["gstin"] or "").strip().upper()
        if g and not GSTIN_RE.match(g):
            raise HTTPException(status_code=422, detail="That does not look like a valid 15-character GSTIN. Leave it empty if you are not GST registered.")
        data["gstin"] = g or None
        if g:
            code = g[:2]
            b.state_code = code
            if code in GST_STATES and "state" not in data:
                b.state = GST_STATES[code]
    if "gst_applies_to" in data and data["gst_applies_to"] not in (None, "KM_FARE", "ALL"):
        raise HTTPException(status_code=422, detail="gst_applies_to must be KM_FARE or ALL")
    if data.get("invoice_prefix"):
        p = re.sub(r"[^A-Za-z0-9]", "", data["invoice_prefix"]).upper()
        if len(p) < 2:
            raise HTTPException(status_code=422, detail="The invoice prefix needs 2 to 6 letters or numbers")
        if db.query(BillingBrand).filter(BillingBrand.invoice_prefix == p, BillingBrand.id != b.id).first():
            raise HTTPException(status_code=409, detail="Another business already uses this prefix. Please choose a different one.")
        data["invoice_prefix"] = p
        b.estimate_prefix = f"{p}-EST"
    for k, v in data.items():
        setattr(b, k, (v.strip() if isinstance(v, str) else v) if not (isinstance(v, str) and not v.strip() and k in ("pan", "legal_name")) else None)
    db.commit()
    db.refresh(b)
    return _profile(b)


@router.get("/options")
def options(db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    b = vendor_brand(db, vendor)
    modes = [{"key": "NONE", "label": "No GST"}]
    if (b.gstin or "").strip():
        modes += [{"key": "EXTRA", "label": "GST extra (added on top)"}, {"key": "INCLUDED", "label": "GST included in the amounts"}]
    return {"standard_charges": [c for c in billing_calc.STANDARD_CHARGES if c["label"] != "Convenience fee"], "gst_modes": modes,
            "gst_registered": bool((b.gstin or "").strip()), "gst_rate": b.gst_rate,
            "gst_collections": [{"key": "COLLECT", "label": "Add GST to the bill"}, {"key": "SHOW_ONLY", "label": "Show GST, do not charge it"}],
            "payment_modes": ["Cash", "UPI", "Bank transfer", "Card", "Cheque", "Other"]}


def _own_order(db: Session, vendor, ref: str):
    from app.api.routes.tax_admin import _invoice_order_and_request
    order, cb = _invoice_order_and_request(db, ref)
    if order is None or str(order.vendor_id) != str(vendor.id):
        raise HTTPException(status_code=404, detail=f"No booking of yours found for '{ref}'")
    return order


@router.get("/prefill")
def prefill(ref: str = Query(..., min_length=1), db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    """Type the booking id of one of YOUR bookings: customer, trip, charges and advance fill in. Other people's bookings are never found."""
    b = vendor_brand(db, vendor)
    _own_order(db, vendor, ref)
    data = svc.prefill_from_booking(db, ref, b)
    data["lines"] = [l for l in (data.get("lines") or []) if str(l.get("label")) != "Convenience fee"]     # the platform's fee is not the vendor's income
    data["brand_id"] = str(b.id)
    data.pop("from_document", None)
    return data


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
def calc(body: CalcIn, vendor=Depends(get_current_vendor)):
    return billing_calc.compute_totals(
        body.lines, gst_mode=body.gst_mode, gst_rate=body.gst_rate, gst_collection=body.gst_collection, applies_to=body.applies_to,
        interstate=body.interstate, discount=body.discount, gst_override=body.gst_override, payments_total=body.payments_total,
        advance_requested=body.advance_requested)


# ------------------------------------------------------------------ documents
def _own_doc(db: Session, vendor, doc_id: str) -> BillingDocument:
    try:
        d = db.query(BillingDocument).filter(BillingDocument.id == uuid.UUID(doc_id)).first()
    except ValueError:
        d = db.query(BillingDocument).filter(BillingDocument.number == doc_id).first()
    if d is None or str(d.vendor_id) != str(vendor.id):
        raise HTTPException(status_code=404, detail="Document not found")
    return d


def _who(db: Session, vendor) -> str:
    return vendor_brand(db, vendor).name


def _clean_body(body: Dict[str, Any], brand: BillingBrand) -> Dict[str, Any]:
    p = dict(body or {})
    p["brand_id"] = str(brand.id)          # a vendor can only ever use their own profile
    p.pop("issue", None)
    p.pop("order_id", None)
    return p


@router.get("/documents")
def list_documents(doc_type: Optional[str] = None, status: Optional[str] = None, search: Optional[str] = None, limit: int = 60, skip: int = 0,
                   db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    q = db.query(BillingDocument).filter(BillingDocument.vendor_id == vendor.id)
    if doc_type:
        q = q.filter(BillingDocument.doc_type == doc_type.upper())
    if status:
        s = status.upper()
        if s in ("PAID", "PARTIAL", "UNPAID"):
            q = q.filter(BillingDocument.payment_status == s, BillingDocument.status != "CANCELLED", BillingDocument.doc_type == "INVOICE")
        else:
            q = q.filter(BillingDocument.status == s)
    if search and search.strip():
        like = f"%{search.strip()}%"
        from sqlalchemy import or_
        q = q.filter(or_(BillingDocument.number.ilike(like), BillingDocument.customer_name.ilike(like), BillingDocument.customer_phone.ilike(like),
                         BillingDocument.booking_ref.ilike(like)))
    rows = q.order_by(BillingDocument.created_at.desc()).offset(skip).limit(min(limit, 200)).all()
    return [svc.summary_row(d) for d in rows]


@router.get("/summary")
def summary(db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    """Numbers for the hub header: how much is still to be collected, what was issued."""
    rows = db.query(BillingDocument).filter(BillingDocument.vendor_id == vendor.id, BillingDocument.status != "CANCELLED").all()
    inv = [d for d in rows if d.doc_type == "INVOICE" and d.status != "DRAFT"]
    return {"invoices": len(inv), "estimates": len([d for d in rows if d.doc_type == "ESTIMATE" and d.status != "DRAFT"]),
            "drafts": len([d for d in rows if d.status == "DRAFT"]),
            "billed": sum(int(d.total_amount or 0) for d in inv), "to_collect": sum(int(d.balance_due or 0) for d in inv),
            "collected": sum(int(d.paid_amount or 0) for d in inv)}


@router.post("/documents")
def create_document(body: Dict[str, Any], db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    b = vendor_brand(db, vendor)
    p = _clean_body(body, b)
    if p.get("booking_ref"):
        _own_order(db, vendor, str(p["booking_ref"]))
    doc = svc.create_document(db, p, b.name, b.phone)
    doc.vendor_id = vendor.id
    db.commit()
    db.refresh(doc)
    return svc.serialize(doc, db)


@router.get("/documents/{doc_id}")
def get_document(doc_id: str, db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    return svc.serialize(_own_doc(db, vendor, doc_id), db)


@router.put("/documents/{doc_id}")
def update_document(doc_id: str, body: Dict[str, Any], db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    d = _own_doc(db, vendor, doc_id)
    b = vendor_brand(db, vendor)
    return svc.serialize(svc.update_document(db, d, _clean_body(body, b), b.name), db)


@router.post("/documents/{doc_id}/issue")
def issue_document(doc_id: str, db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    d = _own_doc(db, vendor, doc_id)
    svc.issue(db, d, _who(db, vendor))
    db.commit()
    db.refresh(d)
    return svc.serialize(d, db)


class CancelIn(BaseModel):
    reason: str = Field("", max_length=300)


@router.post("/documents/{doc_id}/cancel")
def cancel_document(doc_id: str, body: CancelIn, db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    return svc.serialize(svc.cancel(db, _own_doc(db, vendor, doc_id), body.reason, _who(db, vendor)), db)


@router.post("/documents/{doc_id}/convert")
def convert_document(doc_id: str, db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    est = _own_doc(db, vendor, doc_id)
    inv = svc.convert_estimate(db, est, _who(db, vendor), issue_now=False)
    inv.vendor_id = vendor.id
    db.commit()
    svc.issue(db, inv, _who(db, vendor))
    db.commit()
    db.refresh(inv)
    return svc.serialize(inv, db)


class PaymentIn(BaseModel):
    amount: int = Field(..., gt=0)
    mode: str = "Cash"
    ref: Optional[str] = None
    note: Optional[str] = None
    purpose: str = "PAYMENT"


@router.post("/documents/{doc_id}/payments")
def add_payment(doc_id: str, body: PaymentIn, db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    return svc.serialize(svc.add_payment(db, _own_doc(db, vendor, doc_id), body.amount, body.mode, body.ref, body.note, body.purpose, _who(db, vendor)), db)


@router.delete("/documents/{doc_id}/payments/{payment_id}")
def remove_payment(doc_id: str, payment_id: str, db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    return svc.serialize(svc.remove_payment(db, _own_doc(db, vendor, doc_id), payment_id, _who(db, vendor)), db)


@router.get("/documents/{doc_id}/share")
def share_info(doc_id: str, request: Request, db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    d = _own_doc(db, vendor, doc_id)
    if d.status == "DRAFT":
        raise HTTPException(status_code=409, detail="Issue the document first, then share it")
    b = vendor_brand(db, vendor)
    who = SimpleNamespace(username=b.name, phone=b.phone)
    return staff_routes.share_info(str(d.id), request, db, who)


@router.get("/documents/{doc_id}/html", response_class=HTMLResponse)
def document_html(doc_id: str, db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    return HTMLResponse(render_document_html(svc.serialize(_own_doc(db, vendor, doc_id), db)))


@router.get("/documents/{doc_id}/pdf")
def document_pdf(doc_id: str, db: Session = Depends(get_db), vendor=Depends(get_current_vendor)):
    d = _own_doc(db, vendor, doc_id)
    return Response(render_document_pdf(svc.serialize(d, db)), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{d.number.replace("/", "_")}.pdf"'})
