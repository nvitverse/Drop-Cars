"""Invoices and estimates for every Drop Cars brand.

BillingBrand    - one row per brand (Drop Cars, 24 Drop Taxi, Tata Taxi ...): legal name, GSTIN, address, bank / UPI, GST rate, number
                  prefixes, terms, rules and regulations. Choosing a brand on a document applies ALL of it.
BillingDocument - an INVOICE or an ESTIMATE: customer, trip, line items (each included in the total or excluded and paid on actuals), GST
                  mode, payments (manual or through payment links), share link. The brand's details are copied onto the document when it
                  is issued, so changing the brand later never rewrites an old invoice."""
import uuid

from sqlalchemy import Boolean, Column, Date, Integer, JSON, String, Text, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID

from app.database.session import Base


class BillingBrand(Base):
    __tablename__ = "billing_brands"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    code = Column(String, unique=True, nullable=False, index=True)        # dropcars, 24droptaxi ...
    name = Column(String, nullable=False)                                   # the name printed big on the document
    legal_name = Column(String, nullable=True)                              # the registered business name that owns the GSTIN
    tagline = Column(String, nullable=True)
    domain = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    whatsapp = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    state = Column(String, nullable=True, server_default="Tamil Nadu")      # place of supply of the brand: decides CGST+SGST vs IGST
    state_code = Column(String, nullable=True, server_default="33")
    gstin = Column(String, nullable=True)                                   # empty = this brand is not GST registered
    pan = Column(String, nullable=True)
    sac_code = Column(String, nullable=True, server_default="9964")
    gst_rate = Column(Integer, nullable=False, server_default="5")
    gst_applies_to = Column(String, nullable=False, server_default="KM_FARE")   # KM_FARE (only the km fare is taxed) | ALL (every charge)
    invoice_prefix = Column(String, nullable=False, server_default="DC")
    estimate_prefix = Column(String, nullable=False, server_default="DC-EST")
    bank_account_name = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    bank_account_number = Column(String, nullable=True)
    bank_ifsc = Column(String, nullable=True)
    bank_branch = Column(String, nullable=True)
    upi_id = Column(String, nullable=True)
    terms_invoice = Column(Text, nullable=True)
    terms_estimate = Column(Text, nullable=True)
    rules_text = Column(Text, nullable=True)                                # rules and regulations: cancellation, waiting, night, hill ...
    footer_note = Column(String, nullable=True)
    signatory = Column(String, nullable=True)
    primary_color = Column(String, nullable=True, server_default="#0EA5E9")
    estimate_valid_days = Column(Integer, nullable=False, server_default="7")
    advance_percent = Column(Integer, nullable=False, server_default="0")   # default advance asked on an estimate (0 = none)
    payment_links_enabled = Column(Boolean, nullable=False, server_default="true")
    is_default = Column(Boolean, nullable=False, server_default="false")
    is_active = Column(Boolean, nullable=False, server_default="true")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class BillingDocument(Base):
    __tablename__ = "billing_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    doc_type = Column(String, nullable=False, index=True)                   # INVOICE | ESTIMATE
    number = Column(String, unique=True, nullable=False, index=True)
    financial_year = Column(String, nullable=False)
    brand_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    brand_snapshot = Column(JSON, nullable=True)
    status = Column(String, nullable=False, server_default="DRAFT", index=True)     # DRAFT | ISSUED | ACCEPTED | CONVERTED | CANCELLED
    payment_status = Column(String, nullable=False, server_default="UNPAID")        # UNPAID | PARTIAL | PAID (invoices)

    booking_ref = Column(String, nullable=True, index=True)                 # whatever id the staff typed: order id, website booking id ...
    order_id = Column(Integer, nullable=True, index=True)

    customer_name = Column(String, nullable=True)
    customer_phone = Column(String, nullable=True)
    customer_email = Column(String, nullable=True)
    customer_gstin = Column(String, nullable=True)
    customer_company = Column(String, nullable=True)
    customer_address = Column(Text, nullable=True)
    customer_state = Column(String, nullable=True)

    trip = Column(JSON, nullable=True)                                      # pickup, drop, trip type, vehicle, dates, km, driver, vehicle number
    lines = Column(JSON, nullable=False)                                    # [{label, amount, kind, taxable, included, note}]
    gst_mode = Column(String, nullable=False, server_default="NONE")        # NONE | EXTRA (added on top) | INCLUDED (already inside the amounts)
    gst_rate = Column(Integer, nullable=False, server_default="0")
    gst_collection = Column(String, nullable=False, server_default="COLLECT")   # COLLECT | SHOW_ONLY (shown, not charged) | PAY_LATER (customer pays it by link)
    gst_applies_to = Column(String, nullable=False, server_default="KM_FARE")
    interstate = Column(Boolean, nullable=False, server_default="false")
    gst_override = Column(Integer, nullable=True)                           # a GST amount fixed by hand (e.g. copied from the booking)
    discount = Column(Integer, nullable=False, server_default="0")
    discount_label = Column(String, nullable=True)
    advance_requested = Column(Integer, nullable=False, server_default="0")  # estimates: advance asked to confirm the booking

    subtotal = Column(Integer, nullable=False, server_default="0")          # included lines - discount
    taxable_value = Column(Integer, nullable=False, server_default="0")
    gst_amount = Column(Integer, nullable=False, server_default="0")
    total_amount = Column(Integer, nullable=False, server_default="0")      # what the document adds up to (with GST when GST is on)
    amount_due = Column(Integer, nullable=False, server_default="0")        # what the customer is asked to pay in all (GST left out when it is not collected)
    paid_amount = Column(Integer, nullable=False, server_default="0")
    balance_due = Column(Integer, nullable=False, server_default="0")

    payments = Column(JSON, nullable=True)                                  # [{id, amount, mode, ref, at, by, note, purpose, source}]
    payment_links = Column(JSON, nullable=True)                             # [{id, purpose, amount, url, rp_link_id, status, created_at}]
    valid_until = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    terms_override = Column(Text, nullable=True)
    share_token = Column(String, unique=True, nullable=True, index=True)
    converted_from_id = Column(UUID(as_uuid=True), nullable=True)
    converted_to_id = Column(UUID(as_uuid=True), nullable=True)
    tax_invoice_id = Column(UUID(as_uuid=True), nullable=True)
    history = Column(JSON, nullable=True)
    cancel_reason = Column(String, nullable=True)

    created_by = Column(String, nullable=True)                              # the staff member who made it (shown on the document and in the list)
    created_by_phone = Column(String, nullable=True)                        # so a follow-up question goes to the same person
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False, index=True)
    issued_at = Column(TIMESTAMP(timezone=True), nullable=True)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class BillingRateCard(Base):
    """A tariff for one brand / vehicle / method. The three ways the brands price a trip, plus a fixed package:
        KM_BATA    km x rate per km + driver bata per day (Drop Cars); toll, parking, permit are extra
        SLAB_DROP  drop trip: base fare for the first km, then a per-km rate that steps up after every N km (Arunachala Travels)
        SLAB_ROUND round trip: billable km (min per day) x round rate + driver allowance per day
        LOCAL      local rental: a flat price per hour package (5 hrs / 8 hrs / 12 hrs ...)
        DAY_RENT   rent per day with a km limit per day, extra km rate and a fuel charge per km
        PACKAGE    one agreed all-inclusive amount
    `params` holds the numbers for the method - see utils/billing_tariff.py."""
    __tablename__ = "billing_rate_cards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, index=True)
    brand_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    method = Column(String, nullable=False)
    vehicle_key = Column(String, nullable=True)
    vehicle_name = Column(String, nullable=True)
    name = Column(String, nullable=True)
    params = Column(JSON, nullable=False)
    is_active = Column(Boolean, nullable=False, server_default="true")
    sort_order = Column(Integer, nullable=False, server_default="0")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
