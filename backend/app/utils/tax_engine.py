# utils/tax_engine.py
"""
Pure GST computation functions for every billable event type Drop Cars
issues a tax record for. No DB access, no side effects - every function
here takes plain numbers/flags in and returns a plain breakdown dict out,
so it's trivially unit-testable and the numbers can be verified by hand
against the rates below before anything is wired to a live invoice.

Rates are pulled from platform_settings (see get_tax_rates/get_company_profile
below) with the values from this prompt as the fallback default - same
"admin-tunable, code-default fallback" pattern as app/utils/commission.py
and app/crud/billing.py, so a rate change (e.g. a future GST Council
revision) doesn't need a deploy.

IMPORTANT - this module computes tax the way this prompt specified. It is
NOT a substitute for sign-off from a Chartered Accountant / GST practitioner
before anything generated here is actually filed or issued to a real
customer/driver. In particular, before going live:
  - Confirm Drop Cars' actual GST registration status/GSTIN via
    set_company_profile() below - none exists in this codebase today.
  - Confirm the 194-O/194C TDS thresholds and applicability with a CA -
    compute_tds() below implements the commonly-cited flat rates/thresholds
    but real applicability depends on the driver's entity type (individual
    vs company), turnover, and current-year CBDT circulars.
  - Confirm whether Drop Cars is actually liable under Section 9(5) for
    every trip type billed here, or only some.
"""
import math
from typing import Optional, TypedDict
from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting

# ---------------------------------------------------------------------------
# Admin-tunable rates/company profile, via the existing platform_settings
# key/value pattern (see app/utils/commission.py, app/crud/billing.py).
# ---------------------------------------------------------------------------
TAX_RATE_DEFAULTS = {
    "ride_gst_percent": 5,          # SAC 9964, Section 9(5) - commercial ride fares
    "commission_gst_percent": 18,   # SAC 9983 - driver commission bills
    "subscription_gst_percent": 18, # SAC 9983 - Premium/convenience fee
    "ads_gst_percent": 18,          # SAC 9983 - B2B ad invoices
    "tds_194o_percent": 1,          # e-commerce operator TDS on gross driver payout (individual/HUF)
    "tds_194o_threshold_annual": 500000,  # PAN-linked annual threshold before 194-O TDS applies
}

COMPANY_PROFILE_KEYS = {
    "gstin": "tax_company_gstin",
    "legal_name": "tax_company_legal_name",
    "registered_address": "tax_company_registered_address",
    "home_state_code": "tax_company_home_state_code",  # 2-digit GST state code, e.g. "33" for Tamil Nadu
}


def _get_setting_int(db: Session, key: str, default: int) -> int:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if row and row.value:
        try:
            return int(row.value)
        except ValueError:
            pass
    return default


def get_tax_rates(db: Session) -> dict:
    """Full rate table, admin-editable defaults. Each key is its own
    platform_settings row (matches billing.py's flat-key convention, not
    commission.py's single-JSON-blob convention - these are independent
    scalars, not a nested structure)."""
    return {k: _get_setting_int(db, f"tax_rate_{k}", v) for k, v in TAX_RATE_DEFAULTS.items()}


def get_company_profile(db: Session) -> dict:
    """Drop Cars' own GST identity for printing on invoices. Returns None
    for any field not yet configured - the invoice-creation functions in
    app/crud/tax_invoices.py refuse to issue a RIDE_GST_9_5/DRIVER_COMMISSION/
    SUBSCRIPTION_FEE/ADS_B2B invoice (anything actually GST-taxable) until
    gstin + legal_name + registered_address + home_state_code are all set,
    since a GST invoice without a supplier GSTIN is not legally valid."""
    profile = {}
    for field, key in COMPANY_PROFILE_KEYS.items():
        row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        profile[field] = row.value if row and row.value else None
    return profile


def is_company_profile_complete(profile: dict) -> bool:
    return all(profile.get(f) for f in COMPANY_PROFILE_KEYS.keys())


def set_company_profile_field(db: Session, field: str, value: str) -> None:
    if field not in COMPANY_PROFILE_KEYS:
        raise ValueError(f"Unknown company profile field: {field}")
    key = COMPANY_PROFILE_KEYS[field]
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if row:
        row.value = value
    else:
        row = PlatformSetting(key=key, value=value)
    db.add(row)


# ---------------------------------------------------------------------------
# GST split helper - shared by every taxable invoice type.
# ---------------------------------------------------------------------------
class GstSplit(TypedDict):
    taxable_value: int
    gst_rate_percent: int
    is_interstate: bool
    cgst_amount: int
    sgst_amount: int
    igst_amount: int
    total_gst_amount: int
    total_amount: int


def _split_gst(taxable_value: int, gst_rate_percent: int, is_interstate: bool) -> GstSplit:
    """Rounds GST to the nearest rupee using round-half-up (ceil at .5),
    matching the rounding convention already used in app/crud/end_records.py
    for commission math (`ceil`), so tax and commission figures round the
    same way across the codebase rather than drifting apart on edge cases."""
    total_gst = math.ceil(taxable_value * gst_rate_percent / 100)
    if is_interstate:
        igst = total_gst
        cgst = sgst = 0
    else:
        # Split as evenly as possible; if total_gst is odd, CGST takes the
        # extra rupee (SGST = floor half) - an arbitrary but consistent
        # tie-break, since GST is legally required to be split exactly in
        # half between CGST/SGST and paise-level rounding differences are
        # immaterial at whole-rupee granularity.
        sgst = total_gst // 2
        cgst = total_gst - sgst
        igst = 0
    return {
        "taxable_value": taxable_value,
        "gst_rate_percent": gst_rate_percent,
        "is_interstate": is_interstate,
        "cgst_amount": cgst,
        "sgst_amount": sgst,
        "igst_amount": igst,
        "total_gst_amount": total_gst,
        "total_amount": taxable_value + total_gst,
    }


# ---------------------------------------------------------------------------
# Per-invoice-type computation
# ---------------------------------------------------------------------------
def compute_commercial_ride_gst(
    db: Session,
    *,
    base_fare: int,
    detour_fee: int = 0,
    waiting_charges: int = 0,
    is_interstate: bool = False,
) -> GstSplit:
    """Drop Solo / Drop Saver commercial ride, SAC 9964, Section 9(5) -
    5% GST on the full customer-facing fare (Drop Cars is the liable
    e-commerce operator, not the driver)."""
    rates = get_tax_rates(db)
    taxable_value = max(0, int(base_fare) + int(detour_fee) + int(waiting_charges))
    return _split_gst(taxable_value, rates["ride_gst_percent"], is_interstate)


def compute_driver_commission_gst(db: Session, *, commission_amount: int, is_interstate: bool = False) -> GstSplit:
    """Platform commission/convenience-fee bill charged TO a driver, SAC
    9983, 18% GST - ITC-eligible on the driver's side if they're
    GST-registered."""
    rates = get_tax_rates(db)
    return _split_gst(max(0, int(commission_amount)), rates["commission_gst_percent"], is_interstate)


def compute_carpool_receipt(*, cost_share_amount: int) -> dict:
    """Drop Buddy P2P carpool - the fuel/toll cost share paid to the host
    is NOT a taxable supply by Drop Cars (Drop Cars isn't the one being
    paid), so this is a plain acknowledgment receipt, not a GST invoice.
    Returned shape intentionally mirrors GstSplit's keys (all GST fields
    zeroed) so callers can treat every invoice_type uniformly without a
    branch."""
    amount = max(0, int(cost_share_amount))
    return {
        "taxable_value": amount,
        "gst_rate_percent": 0,
        "is_interstate": False,
        "cgst_amount": 0,
        "sgst_amount": 0,
        "igst_amount": 0,
        "total_gst_amount": 0,
        "total_amount": amount,
    }


def compute_subscription_fee_gst(db: Session, *, fee_amount: int, is_interstate: bool = False) -> GstSplit:
    """Premium membership or Drop Buddy convenience fee billed to a
    user, SAC 9983, 18% GST."""
    rates = get_tax_rates(db)
    return _split_gst(max(0, int(fee_amount)), rates["subscription_gst_percent"], is_interstate)


def compute_ads_invoice_gst(db: Session, *, amount: int, reverse_charge: bool = False, is_interstate: bool = False) -> GstSplit:
    """B2B invoice to a corporate advertiser, SAC 9983, 18% GST. Forward
    charge by default; `reverse_charge=True` still computes the same GST
    breakdown (the amount and rate are unaffected by RCM) - the flag is
    stored on the invoice purely so the printed invoice carries the
    correct "Tax Payable on Reverse Charge: Yes/No" declaration, which the
    caller (app/crud/tax_invoices.py) sets on the TaxInvoice row."""
    rates = get_tax_rates(db)
    return _split_gst(max(0, int(amount)), rates["ads_gst_percent"], is_interstate)


def compute_tds(db: Session, *, gross_payout_ytd_before_this: int, this_payout_amount: int) -> dict:
    """Section 194-O TDS on a commercial driver's gross payout, once their
    financial-year-to-date gross crosses the PAN-linked threshold. Returns
    the TDS amount to withhold from THIS payout only (the portion of this
    payout that pushes/sits past the threshold), not the whole payout -
    so calling this incrementally per settlement period is safe and never
    double-deducts.

    NOTE: this implements 194-O's commonly-cited flat 1%-beyond-threshold
    rule for individual/HUF payees. Section 194C (contractor payments,
    applicable when the payee is a company/firm rather than an individual)
    has different flat per-transaction thresholds (no annual floor) and is
    NOT implemented here - confirm the driver's payee-entity type with a
    CA and extend this function before relying on it for a company-entity
    driver/fleet owner.
    """
    rates = get_tax_rates(db)
    threshold = rates["tds_194o_threshold_annual"]
    rate = rates["tds_194o_percent"]

    already_over = max(0, gross_payout_ytd_before_this - threshold)
    new_total_ytd = gross_payout_ytd_before_this + this_payout_amount
    total_over_after = max(0, new_total_ytd - threshold)
    # Only the incremental amount that's newly over the threshold (this
    # payout's contribution to crossing it) is taxable this period.
    taxable_this_period = max(0, total_over_after - already_over)

    tds_amount = math.ceil(taxable_this_period * rate / 100)
    return {
        "tds_section": "194-O",
        "tds_rate_percent": rate,
        "taxable_this_period": taxable_this_period,
        "tds_amount": tds_amount,
        "threshold_annual": threshold,
        "gross_payout_ytd_after": new_total_ytd,
    }


def financial_year_label(year: int, month: int) -> str:
    """Indian FY runs Apr-Mar. e.g. Aug 2026 (year=2026, month=8) -> "26-27"."""
    if month >= 4:
        start = year
    else:
        start = year - 1
    return f"{str(start)[-2:]}-{str(start + 1)[-2:]}"
