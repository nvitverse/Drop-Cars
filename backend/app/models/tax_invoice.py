# models/tax_invoice.py
"""
Unified tax-invoice ledger for every billable event that needs a GST-
compliant (or explicitly non-taxable) record: customer ride fares, driver
commission bills, carpool cost-share receipts, Premium/subscription
convenience fees, and B2B ad invoices. One table, one `invoice_type`
discriminator - keeps GSTR-1/3B aggregation (app/crud/tax_invoices.py) a
single query instead of a UNION across five tables, and keeps invoice
numbering (InvoiceSequence) uniform.

Every row is immutable once ISSUED - a correction is a new CREDIT_NOTE row
referencing the original via `reversal_of_invoice_id`, never an UPDATE to
taxable_value/gst on an issued invoice. This is what GST law actually
requires (a tax invoice cannot be silently edited after issue) and what
makes the audit trail in finance_audit_log.py meaningful.
"""
import enum
from sqlalchemy import Column, String, Integer, Numeric, Boolean, TIMESTAMP, ForeignKey, func, Enum as SqlEnum
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database.session import Base


class InvoiceTypeEnum(str, enum.Enum):
    # Customer-facing GST tax invoice for a commercial ride (Drop Solo /
    # Drop Saver), Section 9(5) CGST Act - Drop Cars (the e-commerce
    # operator) is liable for the 5% GST, not the driver/vendor.
    RIDE_GST_9_5 = "RIDE_GST_9_5"
    # Platform commission/convenience-fee bill charged TO a driver/vendor,
    # SAC 9983, 18% GST, ITC-eligible on the driver's side.
    DRIVER_COMMISSION = "DRIVER_COMMISSION"
    # Non-taxable cost-sharing acknowledgment for a Drop Buddy carpool
    # (fuel/toll share paid to the host) - not a GST invoice at all, just a
    # receipt, kept in the same table for a single unified transaction log.
    CARPOOL_RECEIPT = "CARPOOL_RECEIPT"
    # Platform convenience fee / Premium subscription billed to a user,
    # SAC 9983, 18% GST.
    SUBSCRIPTION_FEE = "SUBSCRIPTION_FEE"
    # B2B invoice to a corporate advertiser (AdMob direct / highway
    # sponsor), SAC 9983, 18% GST, forward or reverse charge.
    ADS_B2B = "ADS_B2B"


class InvoiceStatusEnum(str, enum.Enum):
    ISSUED = "ISSUED"
    CREDIT_NOTE = "CREDIT_NOTE"     # corrects/reverses an earlier ISSUED invoice
    CANCELLED = "CANCELLED"          # voided before any payment settled


class TaxInvoice(Base):
    __tablename__ = "tax_invoices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False)

    # e.g. "DC/26-27/RIDE-000481" - human-readable, sequential, unique.
    # Built from InvoiceSequence in app/crud/tax_invoices.py.
    invoice_number = Column(String, unique=True, nullable=False, index=True)
    financial_year = Column(String, nullable=False, index=True)  # "26-27"
    invoice_type = Column(SqlEnum(InvoiceTypeEnum, name="invoice_type_enum"), nullable=False, index=True)
    status = Column(SqlEnum(InvoiceStatusEnum, name="invoice_status_enum"), nullable=False, server_default='ISSUED')

    # Loose link back to the source record - deliberately a plain Integer/
    # UUID-as-string rather than an FK, since the source can be an Order
    # (int PK), a subscription charge, or an ad-booking row (not modelled
    # yet). `source_type` disambiguates. Keeps this table decoupled from
    # every other table's PK type.
    source_type = Column(String, nullable=True)   # "order", "subscription", "ad_booking", "carpool_journey"
    source_id = Column(String, nullable=True, index=True)

    # Party this invoice is billed to/for. Only one of these is set per row
    # depending on invoice_type. Nullable + no FK constraint on purpose -
    # a customer/driver/vendor account being deleted later must never block
    # a 7-year-retained tax record from existing.
    customer_id = Column(UUID(as_uuid=True), nullable=True)
    customer_name_snapshot = Column(String, nullable=True)      # denormalized at issue time
    customer_number_snapshot = Column(String, nullable=True)
    driver_id = Column(UUID(as_uuid=True), nullable=True)
    vendor_id = Column(UUID(as_uuid=True), nullable=True)
    billed_party_name_snapshot = Column(String, nullable=True)  # for ADS_B2B: the advertiser's name
    billed_party_gstin_snapshot = Column(String, nullable=True)

    # Fare/amount breakdown - see app/utils/tax_engine.py for how these are
    # derived. Stored in whole rupees (Integer) matching every other money
    # column in this codebase (orders.py, new_orders.py etc all use
    # Integer, not Numeric) - kept consistent rather than switching to
    # paise/decimal here alone.
    base_fare = Column(Integer, nullable=False, server_default='0')
    detour_fee = Column(Integer, nullable=False, server_default='0')
    waiting_charges = Column(Integer, nullable=False, server_default='0')
    taxable_value = Column(Integer, nullable=False)   # sum of the above (or commission/fee amount for non-ride types)

    is_interstate = Column(Boolean, nullable=False, server_default='false')
    gst_rate_percent = Column(Integer, nullable=False, server_default='0')  # 0, 5, or 18
    cgst_amount = Column(Integer, nullable=False, server_default='0')
    sgst_amount = Column(Integer, nullable=False, server_default='0')
    igst_amount = Column(Integer, nullable=False, server_default='0')
    total_gst_amount = Column(Integer, nullable=False, server_default='0')
    total_amount = Column(Integer, nullable=False)   # taxable_value + total_gst_amount

    hsn_sac_code = Column(String, nullable=True)   # "9964" (ride) or "9983" (commission/subscription/ads)
    reverse_charge = Column(Boolean, nullable=False, server_default='false')  # ADS_B2B only

    # Self-reference for corrections - a CREDIT_NOTE row points back at the
    # ISSUED invoice it reverses. Plain UUID column (not an FK) so an old
    # invoice is never blocked from archival/export by a constraint.
    reversal_of_invoice_id = Column(UUID(as_uuid=True), nullable=True)

    # Free-form structured breakdown for the PDF renderer / CA export -
    # keeps this table from needing new columns every time a new line-item
    # label is needed (matches the existing charge_items JSON pattern on
    # NewOrder/Order).
    line_items = Column(JSON, nullable=True)

    pdf_url = Column(String, nullable=True)  # GCS-signed URL once rendered, see tax_engine docstring on PDF rendering

    # True when the company GSTIN/legal-name/address wasn't fully set at
    # the moment this invoice was issued. Invoice creation never blocks on
    # this (a booking/trip-close must never fail just because tax setup is
    # incomplete) - instead this flag lets GET /admin/tax/setup-status
    # surface "N invoices need the company profile filled in and may need
    # re-issue" as something an Owner is asked to complete, not a silent gap.
    needs_company_profile_review = Column(Boolean, nullable=False, server_default='false')

    created_by_admin_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
