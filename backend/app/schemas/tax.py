# schemas/tax.py
from typing import Optional, List
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class CompanyProfileUpdate(BaseModel):
    gstin: Optional[str] = None
    legal_name: Optional[str] = None
    registered_address: Optional[str] = None
    home_state_code: Optional[str] = None


class CompanyProfileOut(BaseModel):
    gstin: Optional[str]
    legal_name: Optional[str]
    registered_address: Optional[str]
    home_state_code: Optional[str]
    is_complete: bool


class TaxRatesOut(BaseModel):
    ride_gst_percent: int
    commission_gst_percent: int
    subscription_gst_percent: int
    ads_gst_percent: int
    tds_194o_percent: int
    tds_194o_threshold_annual: int


class TaxRateUpdate(BaseModel):
    key: str  # one of TAX_RATE_DEFAULTS' keys, e.g. "ride_gst_percent"
    value: int


class TaxInvoiceOut(BaseModel):
    id: UUID
    invoice_number: str
    financial_year: str
    invoice_type: str
    status: str
    source_type: Optional[str]
    source_id: Optional[str]
    customer_name_snapshot: Optional[str] = None
    customer_number_snapshot: Optional[str] = None
    driver_id: Optional[UUID] = None
    vendor_id: Optional[UUID] = None
    billed_party_name_snapshot: Optional[str] = None
    base_fare: int
    detour_fee: int
    waiting_charges: int
    taxable_value: int
    is_interstate: bool
    gst_rate_percent: int
    cgst_amount: int
    sgst_amount: int
    igst_amount: int
    total_gst_amount: int
    total_amount: int
    hsn_sac_code: Optional[str]
    reverse_charge: bool
    needs_company_profile_review: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SetupStatusOut(BaseModel):
    company_profile: dict
    company_profile_complete: bool
    invoices_needing_review: int
    action_needed: Optional[str]


class CreditNoteRequest(BaseModel):
    original_invoice_id: UUID
    reason: str


class DriverSettlementOut(BaseModel):
    id: UUID
    driver_id: UUID
    period_year: int
    period_month: int
    revision: int
    trip_count: int
    total_fares_collected: int
    cash_collected: int
    online_collected: int
    company_commission: int
    tds_amount: int
    tds_section: Optional[str]
    bonus_incentives: int
    waiting_charge_adjustments: int
    net_payable: int
    status: str
    generated_at: datetime
    finalized_at: Optional[datetime]

    class Config:
        from_attributes = True


class GenerateSettlementRequest(BaseModel):
    driver_id: UUID
    year: int
    month: int


class FinanceAuditLogOut(BaseModel):
    id: UUID
    staff_username: str
    staff_role: Optional[str]
    action: str
    entity_type: Optional[str]
    entity_id: Optional[str]
    old_value: Optional[dict]
    new_value: Optional[dict]
    ip_address: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class FinanceAuditLogListOut(BaseModel):
    rows: List[FinanceAuditLogOut]
    total: int
