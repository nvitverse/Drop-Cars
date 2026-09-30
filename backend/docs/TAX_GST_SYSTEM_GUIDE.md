# Drop Cars Tax, GST, Invoicing & Driver Settlement System

Implementation guide for the tax/accounting engine added to the backend.
Read this before wiring any live traffic to it.

## 0. Status: this is scaffolding, not a filed-and-verified system

Everything below is real, working, tested-to-import code that follows this
repo's existing conventions exactly (platform_settings key/value pattern,
inline-SQL-on-startup migrations, admin_activity_log-style audit trail,
Admin.role/permissions RBAC). It is **not** a substitute for a Chartered
Accountant's / GST practitioner's sign-off. Three things are true today and
must be resolved before any invoice generated here is issued for real:

1. **Drop Cars has no GSTIN/legal name/registered address anywhere in this
   codebase** (confirmed by repo-wide search). Invoice creation **never
   blocks** on this - a booking or trip-close must never fail just because
   tax setup is incomplete. Instead every invoice issued before the profile
   is complete gets `needs_company_profile_review = True`, and
   `GET /admin/tax/setup-status` surfaces this as something to *ask* the
   Owner to finish ("N invoices need the company GSTIN filled in, review
   and re-issue if needed"), not something that already refused an action.
   Set the real values via `PUT /api/admin/tax/company-profile` as soon as
   they're known, then use `setup-status`'s `invoices_needing_review` count
   to find and re-issue anything that went out before that.
2. **TDS math (`app/utils/tax_engine.py::compute_tds`) implements 194-O's
   commonly-cited flat rate/threshold for individual/HUF drivers only.**
   194C (company/firm payees) has different rules and is not implemented.
   Confirm both with a CA before relying on the numbers for real deductions.
3. **The GSTR-1 JSON export is Drop Cars' own internal shape**, built
   around the Table 4/7/14 concepts, not a byte-for-byte match of the GST
   portal's official offline-tool JSON schema (which is government-
   maintained and changes independently). Map it to the real upload format
   with your CA before filing.

## 1. What was built, file by file

**Models** (`app/models/`)
- `tax_settings.py` - `InvoiceSequence`: atomic per-series-per-FY invoice
  number counter (row-locked increment, not a JSON blob - GST requires
  truly sequential numbers, which a read-then-write on a string value can't
  guarantee under concurrency).
- `tax_invoice.py` - `TaxInvoice`: one unified table for all 5 invoice
  types (`InvoiceTypeEnum`: RIDE_GST_9_5, DRIVER_COMMISSION,
  CARPOOL_RECEIPT, SUBSCRIPTION_FEE, ADS_B2B), full GST breakdown columns,
  immutable-once-ISSUED (corrections are new CREDIT_NOTE rows via
  `reversal_of_invoice_id`, never an UPDATE).
- `driver_settlement.py` - `DriverSettlement`: one row per driver per
  month, DRAFT → FINALIZED (locked) → REVISED (regenerated after a
  correction, keeps the old FINALIZED row and bumps `revision`).
- `finance_audit_log.py` - `FinanceAuditLog`: sibling of the existing
  `admin_activity_log` table, scoped to tax/invoice/settlement actions,
  with explicit `old_value`/`new_value`/`ip_address` columns per the spec.

**Company GSTIN/legal-name/rates**: deliberately NOT a new table - stored
as `platform_settings` rows (see `app/utils/tax_engine.py`'s
`COMPANY_PROFILE_KEYS`/`TAX_RATE_DEFAULTS`), the exact same pattern
`commission.py` and `billing.py` already use for admin-tunable constants
that shouldn't need a deploy to change.

**Tax engine** (`app/utils/tax_engine.py`) - pure functions, no DB writes:
`compute_commercial_ride_gst` (5%, SAC 9964), `compute_driver_commission_gst`
(18%, SAC 9983), `compute_carpool_receipt` (0%, non-taxable),
`compute_subscription_fee_gst` (18%), `compute_ads_invoice_gst` (18%,
reverse-charge flag), `compute_tds` (194-O incremental threshold math).

**CRUD** (`app/crud/`)
- `tax_invoices.py` - `next_invoice_number` (row-locked), one
  `create_*_invoice` function per type, `issue_credit_note`, and the
  monthly aggregation queries: `get_gstr1_summary`, `get_gstr3b_summary`,
  `get_section_9_5_report`, `get_pl_statement`. Aggregation is computed
  live from `tax_invoices` rows on every call - deliberately not cached
  into a second synced table, since a materialized ledger that can drift
  from its source is a worse audit risk than a slightly slower query.
- `driver_settlements.py` - `generate_monthly_settlement` (reads real
  closed-trip data from `Order`/`EndRecord`, never recomputes commission
  itself), `finalize_settlement`, `get_settlement`.
- `finance_audit_log.py` - `log_finance_action` (fail-open, same contract
  as the existing `log_admin_action`), `get_finance_audit_log`.

**API** (`app/api/routes/tax_admin.py`) - all routes under `/api/admin/tax/*`,
gated by two new RBAC helpers added to `admin.py`:
- `require_owner(admin)` - hard-blocks Staff regardless of permissions
  granted (mirrors how `"settings"` is already never grantable).
- `require_tax_accounts_permission(admin)` - Owner passes; Staff needs the
  new `"tax_accounts"` permission (added to `ALLOWED_STAFF_PERMISSIONS`) or
  the existing broader `"finance"` permission.

| Endpoint | Method | RBAC |
|---|---|---|
| `/admin/tax/setup-status` | GET | Accounts/Owner |
| `/admin/tax/company-profile` | GET/PUT | Owner |
| `/admin/tax/rates` | GET | Accounts/Owner |
| `/admin/tax/rates` | PUT | Owner |
| `/admin/tax/invoices` | GET | Accounts/Owner (PII redacted for Accounts) |
| `/admin/tax/invoices/credit-note` | POST | Owner |
| `/admin/tax/reports/gstr1` \| `gstr3b` \| `section-9-5` | GET | Accounts/Owner |
| `/admin/tax/exports/gstr1.json` | GET | Accounts/Owner |
| `/admin/tax/exports/invoices.csv` | GET | Accounts/Owner |
| `/admin/tax/driver-settlements/generate` | POST | Accounts/Owner |
| `/admin/tax/driver-settlements/{id}/finalize` | POST | Owner |
| `/admin/tax/driver-settlements/{driver_id}` | GET | Accounts/Owner |
| `/admin/tax/driver-settlements/{driver_id}/export.csv` | GET | Accounts/Owner |
| `/admin/tax/audit-log` | GET | Owner |

Operations/Support Staff deliberately gets **no route in this router** -
per the spec they only need per-ride invoice lookup and dispute handling,
which the existing booking-detail endpoints already cover; giving them
`tax_admin.py` access would leak gross-profit-adjacent data.

## 2. RBAC mapping to the prompt's 3 tiers

The prompt asked for Owner / Accounts-Tax-Staff / Operations-Support-Staff.
This codebase already has exactly two DB-level roles (`Admin.role`:
`"Owner"` / `"Staff"`) plus a JSON permissions array for finer-grained
Staff access (`ALLOWED_STAFF_PERMISSIONS`). Rather than adding a third
DB-level role (which would mean two parallel role systems), the mapping is:

- **Owner** → `Admin.role == "Owner"`.
- **Accounts / Tax Staff** → `Admin.role == "Staff"` with `"tax_accounts"`
  (or `"finance"`) in `permissions`.
- **Operations / Support Staff** → `Admin.role == "Staff"` with `"bookings"`
  and/or `"customers"` in `permissions`, and explicitly **without**
  `"tax_accounts"`/`"finance"` - this is what already restricts them from
  gross profit/payouts/filings, since they simply can't pass
  `require_tax_accounts_permission`/`require_owner`.

No new `StaffRoles` table was created - it would duplicate `Admin.permissions`
and risk drifting out of sync with it. If a future need arises for staff
roles independent of the existing Admin/Staff account model (e.g. a
separate finance-only login), that's a bigger change than this scope and
should be its own task.

## 3. Database migration

**Nothing extra needed.** All four new models are brand-new tables, and
this repo's existing pattern (`app/main.py:48`,
`Base.metadata.create_all(bind=engine)`) creates any model that doesn't
exist yet automatically on startup - confirmed by the research pass before
this was built. The explicit `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
startup-event pattern used elsewhere in `main.py` is only needed when
adding a column to an *already-existing* table, which nothing here does.

The four model imports were added to `app/main.py` right after the
existing `import app.models.website_integration` line, and the router was
registered via `app.include_router(tax_admin_router.router, prefix="/api",
tags=["TaxAdmin"])` next to the other routers.

## 4. Hooking into Razorpay / existing booking flows (not yet wired)

The invoice-creation functions (`create_ride_invoice` etc.) exist and are
tested-to-import, but **nothing calls them yet** - no existing endpoint
automatically issues a `TaxInvoice` when a booking is created or a trip
closes. This was left as a deliberate, explicit next step rather than
silently hooking into `create_master_from_new_order`/
`update_end_trip_record` without your review, since:

- Razorpay integration in this repo is **client-capture-and-verify, not a
  server-side webhook** (`POST /wallet/razorpay/verify` in
  `app/api/routes/wallet.py`) - there is no Razorpay webhook route at all
  today. "Hooking into Razorpay webhooks" as asked in the prompt would mean
  either (a) building a real webhook endpoint first (a separate, sizeable
  task - signature verification, idempotency, retry handling), or (b)
  calling `create_ride_invoice` from the existing verify-endpoint instead.
  (b) is the smaller, safer change and is the recommended path.
- Calling invoice creation from `update_end_trip_record` (trip close, in
  `app/crud/end_records.py`) is the natural point for
  `create_driver_commission_invoice` (commission is only known once the
  trip closes and profits are computed) - add one call right after the
  existing `credit_vendor_wallet`/`credit_admin_wallet` calls there, using
  `order.commision_amount`/`vendor_profit + admin_profit` as
  `commission_amount`.
- `create_ride_invoice` most naturally belongs in
  `create_master_from_new_order`/`create_master_from_hourly`
  (`app/crud/orders.py`) at booking time, using the order's fare fields.
- `create_carpool_receipt`/`create_subscription_invoice`/`create_ads_invoice`
  need their respective source features (Drop Buddy carpool, Premium
  subscription billing, ad bookings) to actually exist as real backend
  concepts first - per the earlier research this session, DropNow/carpool/
  ads currently have little-to-no backend representation, so these three
  are ready to call the moment those features are built, not before.

**Recommended rollout order** (each step independently testable, none
breaks existing staff flows since nothing existing calls into this code):
1. Owner sets the company tax profile (`PUT /admin/tax/company-profile`).
2. Add one `create_driver_commission_invoice` call in
   `update_end_trip_record` (trip close) - lowest-risk, since commission
   already has real numbers today.
3. Add one `create_ride_invoice` call in `create_master_from_new_order`.
4. Verify a full month's `GET /admin/tax/reports/gstr1` against a manual
   spot-check before trusting the export.
5. Wire `create_subscription_invoice`/`create_ads_invoice`/
   `create_carpool_receipt` once their source features exist.

## 5. PDF generation - not implemented, CSV covers the same data today

Both `TaxInvoice.pdf_url` and `DriverSettlement.pdf_url` columns exist and
are ready for a signed GCS URL (same pattern as
`app/utils/gcs.py::generate_signed_url_from_gcs`, already used elsewhere in
this repo for document uploads), but no PDF rendering library is wired up -
adding one (e.g. WeasyPrint, ReportLab) is a new dependency decision that
should be made deliberately, not as a side effect of this task. In the
meantime, `GET /admin/tax/driver-settlements/{driver_id}/export.csv`
delivers the identical data as a downloadable file, which satisfies the
"downloadable statement" requirement without adding a dependency. Swap it
for real PDF rendering whenever that decision is made - the settlement
data shape (`trip_breakdown` JSON) is already structured for it.

## 6. Testing this without a CA-reviewed live invoice

All computation is pure and unit-testable without touching the DB:

```python
from app.utils.tax_engine import compute_commercial_ride_gst
# db is any Session with no tax_rate_* platform_settings rows yet (falls
# back to TAX_RATE_DEFAULTS)
result = compute_commercial_ride_gst(db, base_fare=1000, detour_fee=50, waiting_charges=20, is_interstate=False)
assert result["total_gst_amount"] == 54  # 5% of 1070, rounded up
assert result["cgst_amount"] == 27 and result["sgst_amount"] == 27
```

To exercise the full flow end-to-end locally: set the company profile,
call one `create_*_invoice` function directly from a Python shell against
a real DB session, then hit `GET /admin/tax/reports/gstr1` for that month
and confirm the numbers match by hand.
