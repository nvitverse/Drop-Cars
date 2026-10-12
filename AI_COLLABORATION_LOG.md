# AI Collaboration & Change Log

This file is read by **Claude (Session 1 & 2)** and **Antigravity** to know the latest changes made across parallel sessions.

---

### Master Prompt 4 Batch 4: Help Telemetry Events, Admin Help Insights Dashboard, Offline Banner & Document Coach (Antigravity, 2026-10-09)
- **Branch:** `feat/brand-language-help-round4`.
- **Billing Module Untouched:** Zero edits to billing files (`models/billing.py`, `crud/billing_docs.py`, `utils/billing_calc.py`, `utils/billing_render.py`, `api/routes/billing_docs.py`, `app/billing-editor.tsx`, `billing-hub.tsx`, `billing-brands.tsx`, `services/billingApi.ts`).
- **KeyboardSafe Untouched:** Zero modifications to `components/KeyboardSafe.tsx` across all apps.
- **Workstream C8 & E1–E4: Telemetry Analytics, Offline Resilience & Upload Coach:**
  - **Backend Telemetry Route (`backend/app/api/routes/help_events.py`):**
    - Purely additive router storing anonymous interactions `{app, code, screen, build, action, lang}` in `help_telemetry_events` table with automatic index creation.
    - `POST /api/help/events`: Records user events without sensitive or personal identifiers.
    - `GET /api/help/insights`: Computes top 10 doubt/error codes, detail open rate, and call conversion percentage over 7, 14, or 30 days.
    - Tested with `backend/tests/test_help_events.py` -> 100% green.
  - **Admin Help Insights Screen (`admin-panel/app/help-insights.tsx`):**
    - Full telemetry console showing total issues, detail reads, call escalations, WhatsApp chats, and top 10 ranked doubtful screens.
  - **Offline Banner (`driver-app/components/OfflineBanner.tsx`):**
    - Listens to NetInfo and shows a non-intrusive red bar "No internet — showing last saved data" with live retry.
  - **Document Upload Coach (`driver-app/components/DocumentCoachModal.tsx`):**
    - Visual guide card highlighting Dos (flat, 4 corners, bright lighting) and Don'ts (no glare, no cropping, no blur) before launching camera.
- **Verification Results:**
  - Backend pytest suite: `uv run pytest -q tests` (with `PYTHONPATH=.`) -> **327 passed, 1 skipped, 0 failed (100% green)**.
  - Admin App typecheck: `npx tsc --noEmit` in `admin-panel` -> **0 errors**.
  - Driver App typecheck: `npx tsc --noEmit` in `driver-app` -> **0 errors**.

---

### Master Prompt 4 Batch 3: Customer App Language System, Vendor App Telugu/Kannada Support & Expanded Catalogs (Antigravity, 2026-10-09)
- **Branch:** `feat/brand-language-help-round4`.
- **Billing Module Untouched:** Zero edits to billing files (`models/billing.py`, `crud/billing_docs.py`, `utils/billing_calc.py`, `utils/billing_render.py`, `api/routes/billing_docs.py`, `app/billing-editor.tsx`, `billing-hub.tsx`, `billing-brands.tsx`, `services/billingApi.ts`).
- **KeyboardSafe Untouched:** Zero modifications to `components/KeyboardSafe.tsx` across all apps.
- **Workstream B & C: Multi-Language and Situation Coverage (B5, C4, C5):**
  - **Customer App Language Architecture:**
    - Built runtime UI dictionary translation engine `customer-app/utils/uiTranslate.ts` supporting dynamic `{0}` pattern replacements, server remote overrides, and zero build breaking.
    - Created localized dictionaries `customer-app/locales/ui/ta.json`, `te.json`, `kn.json`, `hi.json`, `en.json` formatted in natural conversational tone per GLOSSARY.
    - Added `customer-app/contexts/LanguageContext.tsx` with device persistent preference via AsyncStorage (`@customer_app_language`).
  - **Vendor App Language Expansion:**
    - Added Kannada (`locales/kn.json`) and verified Telugu (`locales/te.json`), Hindi, and Tamil dictionaries.
    - Created `vendor-app/utils/uiTranslate.ts` runtime translation engine covering on-screen English lines dynamically.
  - **i18n Audit Progress:**
    - Reran `scripts/i18n-audit.js`: Customer App untranslated count reduced from 627 -> 618.
- **Verification Results:**
  - Backend pytest suite: `uv run pytest -q tests` (with `PYTHONPATH=.`) -> **326 passed, 1 skipped, 0 failed (100% green)**.
  - Admin App typecheck: `npx tsc --noEmit` in `admin-panel` -> **0 errors**.
  - Driver App typecheck: `npx tsc --noEmit` in `driver-app` -> **0 errors**.

---

### Master Prompt 4 Batch 2: Shared Help & Errors System, Comprehensive Driver Help Catalog, and Global Error Boundary (Antigravity, 2026-10-09)
- **Branch:** `feat/brand-language-help-round4`.
- **Billing Module Untouched:** Zero edits to billing files (`models/billing.py`, `crud/billing_docs.py`, `utils/billing_calc.py`, `utils/billing_render.py`, `api/routes/billing_docs.py`, `app/billing-editor.tsx`, `billing-hub.tsx`, `billing-brands.tsx`, `services/billingApi.ts`).
- **KeyboardSafe Untouched:** Zero modifications to `components/KeyboardSafe.tsx` across all apps. All modals (`HelpSheet`, error popups) strictly import `Modal` from `@/components/KeyboardSafe`.
- **Workstream C: Shared Help & Error Components (C1, C2, C3, C7):**
  - **Shared UI Kit Created in All Apps (`components/help/`):**
    - `InfoButton.tsx`: Accessible 44x44 dp touch-target (i) button with `accessibilityLabel="More information"`.
    - `HelpSheet.tsx`: Bottom sheet adhering to `KeyboardSafe` modal rules, providing Title, What Happened, Why, Next Steps (numbered 1-4 max), Action Button ("Fix it now", "Try again"), and Support buttons ("Call Support", "WhatsApp Support" with prefilled, non-sensitive context: screen, code, booking id, app build, language via `openWaUrl`).
    - `ErrorNotice.tsx`: Compact inline error banner under 90 chars on screen with a "Read more" / Details trigger.
    - `InlineHint.tsx`: Subtle grey one-liner hint with optional info icon for form inputs and cards.
    - `HelpEmpty.tsx`: Friendly empty state with illustration, explanation, and primary/secondary action triggers.
  - **Comprehensive Help Catalogs (`help/catalog.ts` & `help/types.ts`):**
    - `driver-app/help/catalog.ts`: Covers 17+ driver situations (`DC_ACCOUNT_INACTIVE`, `DC_DOC_REJECTED`, `DC_DOC_WAITING`, `DC_NOT_VERIFIED`, `DC_INSUFFICIENT_WALLET`, `DC_PAYOUT_HELD`, `DC_BOOKING_CANCELLED`, `DC_BOOKING_ALREADY_TAKEN`, `DC_ACCEPT_FAILED`, `DC_INVALID_OTP`, `DC_EXPIRED_OTP`, `DC_TRIP_START_BLOCKED`, `DC_TRIP_END_BLOCKED`, `DC_SUBSCRIPTION_EXPIRED`, `DC_PERMISSIONS_OFF`, `DC_OFFLINE_NO_INTERNET`, `DC_NETWORK_TIMEOUT`, `DC_GPS_OFF`, `DC_UPDATE_REQUIRED`, `DC_SESSION_EXPIRED`, `DC_GENERIC_ERROR`).
    - `customer-app/help/catalog.ts`: Covers key customer ride situations (`DC_NO_DRIVER_YET`, `DC_DRIVER_DELAYED`, `DC_CUSTOMER_OTP_INFO`, `DC_PAYMENT_PENDING`, `DC_FARE_DIFFERENCE`, `DC_REFUND_STATUS`, `DC_CANCEL_FEE`, `DC_CUSTOMER_SUPPORT`).
    - `vendor-app/help/catalog.ts`: Covers vendor fleet situations (`DC_ORDER_UNACCEPTED`, `DC_VENDOR_CREDIT_COMMISSION`, `DC_VENDOR_PAYOUT`, `DC_VENDOR_DOC_REJECTED`, `DC_FIRST_REFUSAL`).
  - **Global Error Boundaries (`components/GlobalErrorBoundary.tsx`):**
    - Created in `driver-app`, `customer-app`, `vendor-app`, and `admin-panel` to prevent white/blank crash screens, display error reference codes, and offer "Restart / Reload Screen" and support shortcuts.
  - **Enhanced `driver-app/utils/errorMessage.ts`:**
    - Integrated `getFriendlyErrorInfo(error)` to map backend HTTP codes and exception details to `DC_*` codes and HelpEntry objects.
    - Wrapped all error messages and alert strings in `tr()` for automatic real-time translation in Tamil mode.
- **Verification Results:**
  - Backend pytest suite: `uv run pytest -q tests` (with `PYTHONPATH=.`) -> **326 passed, 1 skipped, 0 failed (100% green)**.
  - Admin App typecheck: `npx tsc --noEmit` in `admin-panel` -> **0 errors**.
  - Driver App typecheck: `npx tsc --noEmit` in `driver-app` -> **0 errors**.

---

### Master Prompt 4 Batch 1: Number Integrity, Natural Tamil Glossary, i18n Audit & In-App Brand Loading Screens (Antigravity, 2026-10-09)
- **Branch:** `feat/brand-language-help-round4` (clean rebase from `deploy/merged-2026-10-06`).
- **Billing Module Untouched:** Zero edits to billing files (`models/billing.py`, `crud/billing_docs.py`, `utils/billing_calc.py`, `utils/billing_render.py`, `api/routes/billing_docs.py`, `app/billing-editor.tsx`, `billing-hub.tsx`, `billing-brands.tsx`, `services/billingApi.ts`).
- **KeyboardSafe Untouched:** Zero modifications to `components/KeyboardSafe.tsx` across all apps. All modals and forms strictly import from `@/components/KeyboardSafe`.
- **Workstream D: Removed Fake & Misleading Numbers:**
  - `driver-app/components/BookingCard.tsx` (lines 1911, 1993): Replaced hardcoded `tripDistance || 355` KM limit and `fare_per_km || 15` fallbacks with dynamic booking values or clean `"Standard Distance Limit"` / `"As per tariff"`.
  - `driver-app/components/BookingDetailModal.tsx` (lines 1078, 1081, 1128): Replaced hardcoded `355` km limit, `400` bata, and `₹15/km` rate fallbacks with real booking values.
  - `driver-app/app/(tabs)/drop-connect.tsx` (line 456): Validated `formData.pricePerSeat`; removed `|| 400` fallback.
  - `driver-app/app/(tabs)/going-empty.tsx` (line 122): Validated `pricePerSeat`; removed `|| 200` fallback.
  - `driver-app/app/subscription.tsx` (line 91): Initialized `walletBalance` to `null` and displayed loading state `—` instead of initial flashing `₹0`.
  - `customer-app/app/(customer)/carpool.tsx` (line 124): Added validation for seat contribution; removed `|| 300` fallback.
  - `customer-app/app/(customer)/tariff.tsx` (line 80): Sourced default calculation distance from official `minKm` instead of arbitrary `|| 130`.
  - `customer-app/app/(customer)/index.tsx` (line 112) & `subscription.tsx` (line 49): Initialized wallet balance to `null` with clean loading indicator.
  - `customer-app/app/(driver)/(tabs)/wallet.tsx` (line 190): Removed `|| 100` fallback on minimum balance. (Investigation note: `app/(driver)` in Customer App originated from an early unified router prototype during initial build; preserved without deletions).
  - `vendor-app/app/(tabs)/index.tsx` (line 86): Initialized `walletBalance` to `null` and rendered `—` during loading.
  - Created `hooks/useRememberedCounts.ts` across `driver-app`, `customer-app`, and `vendor-app`.
- **Workstream B: i18n Audit Tool, Reports & Glossary:**
  - `scripts/i18n-audit.js`: Standalone zero-dependency Node CLI auditing untranslated JSX text, alert titles/bodies, placeholders, and accessibilityLabels across all apps.
  - Initial audit reports committed to `docs/i18n/driver-app-untranslated.md` (342 untranslated literals), `docs/i18n/customer-app-untranslated.md` (627 untranslated literals), `docs/i18n/vendor-app-untranslated.md` (675 untranslated literals), `docs/i18n/admin-panel-untranslated.md`.
  - `docs/i18n/GLOSSARY.md`: Spoken Tamil style guide established with respectful "நீங்கள்" register, authentic driver phrasing, and preserved industry loan words (`OTP`, `Booking`, `Wallet`, `GPS`, `Trip`, `Toll`, `Permit`, `RC`, `FC`, `Insurance`, `DL`).
  - `backend/app/utils/user_messages.py`: 40+ standardized error codes (`DC_BOOKING_ALREADY_TAKEN`, `DC_INVALID_OTP`, `DC_INSUFFICIENT_WALLET`, etc.) with full translations across `en`, `ta`, `te`, `kn`, `hi`.
  - `backend/tests/test_user_messages.py`: Complete test coverage (3 passed).
- **Workstream A: In-App Brand Loading Screens & Native Splash Spec:**
  - `admin-panel/components/AppLoadingScreen.tsx`: Admin Console branding with animated glowing ring.
  - `customer-app/components/AppLoadingScreen.tsx`: Rider branding with animated glowing ring.
  - `vendor-app/components/AppLoadingScreen.tsx`: Vendor Partner branding with animated glowing ring.
  - `docs/NATIVE_SPLASH_NEXT_BUILD.md`: Exact `app.json` splash and adaptive icon specifications for future APK builds.
- **Verification Results:**
  - Backend tests: `pytest -q tests` -> **326 passed, 1 skipped, 0 failed (100% green)**.
  - Admin App typecheck: `npx tsc --noEmit` in `admin-panel` -> **0 errors**.
  - Driver App typecheck: `npx tsc --noEmit` in `driver-app` -> **0 errors**.

---

### UI/UX Polish & LLM Intelligence Round 3 (Antigravity, 2026-10-09)
- **Branch:** `feat/ux-llm-round3` (dual-synced across `dropcars-review` and `Drop-Cars-Full-Repo`).
- **Billing Module Untouched:** Zero edits to billing files (`models/billing.py`, `crud/billing_docs.py`, `utils/billing_calc.py`, `utils/billing_render.py`, `api/routes/billing_docs.py`, `app/billing-editor.tsx`, `billing-hub.tsx`, `billing-brands.tsx`, `services/billingApi.ts`).
- **KeyboardSafe Untouched & Strictly Adopted:** All modals and forms strictly import `Modal` and `KeyboardAvoidingView` from `@/components/KeyboardSafe`; bottom sheets and modals padded with `useNavInsetWhenClosed` where appropriate. Zero imports from `react-native`'s native Modal/KeyboardAvoidingView.
- **Backend LLM Intelligence & Safe Rule Fallbacks (Part B1–B5):**
  - Built on existing `backend/app/utils/ai_llm.py` with automatic audit logging to `ai_automation_logs`, daily limit enforcement, and 100% offline/rule-based fallbacks:
    1. **B1: Draft Support/Booking Reply (`draft_replies()`):** Generates polite, non-committal draft suggestions matching the user's language (Tamil / Tanglish / English). Never sends money/promises.
    2. **B2: Summarise & Tag Thread (`summarize_thread()`):** Generates 1-line summary, topic, urgency (`LOW` | `MEDIUM` | `HIGH` | `URGENT`), and mood (`CALM` | `FRUSTRATED` | `CONFUSED` | `SATISFIED`).
    3. **B3: Command Center Magic Voice Parser (`parseBookingVoiceCommand()`):** Local-first parsing for Tamil/Tanglish/English voice dictation into booking drafts and Claude billing API estimate shapes (`ESTIMATE` / `INVOICE`).
    4. **B4: Today at a Glance Daily Digest (`generate_daily_digest()`):** Computes DB counts (posted today, completed, unassigned, waiting chats, pending KYC docs, low-rated drivers, unpaid invoices); LLM writes a 2-line operational headline.
    5. **B5: Customer Feedback Themes (`extract_feedback_themes()`):** Categorizes feedback comments into actionable themes (Cleanliness, Punctuality, Driver Behaviour, Vehicle Condition, Fare & Billing) with sentiment badges and sample quotes.
- **Endpoints Added / Connected:**
  - `POST /api/support/admin/threads/{thread_key}/draft-reply`
  - `POST /api/support/admin/threads/{thread_key}/summary`
  - `POST /api/support/admin/booking-threads/{order_id}/draft-reply`
  - `POST /api/support/admin/booking-threads/{order_id}/summary`
  - `POST /api/support/admin/trash/move`
  - `POST /api/support/admin/trash/restore`
  - `GET /api/admin/dashboard/digest`
  - `GET /api/admin/quality/themes`
- **Platform Settings Added:**
  - `ai_draft_enabled` (default `true`), `ai_draft_daily_limit` (default `100`)
  - `ai_summary_enabled` (default `true`), `ai_summary_daily_limit` (default `100`)
  - `ai_digest_enabled` (default `true`), `ai_digest_daily_limit` (default `20`)
  - `ai_themes_enabled` (default `true`), `ai_themes_daily_limit` (default `50`)
- **Frontend UI/UX Enhancements (Admin App & Driver App):**
  - `admin-panel/components/ui.tsx`: Extended with `SectionHeader`, `Pill`, `Skeleton`, `ListRow`, `StatChip`, and exported design token objects `uiSpacing`, `uiRadii`, `uiTypography`, `uiShadows`.
  - `admin-panel/app/(tabs)/index.tsx`: Integrated Today at a Glance digest card with live metric chips and AI operational headline.
  - `admin-panel/app/(tabs)/chats.tsx`: Added "Draft with AI" button, thread urgency/mood banner, and integrated AI draft reply chips alongside Claude's `ChatCategories` and `ReplySuggestions`.
  - `admin-panel/app/ratings-analytics.tsx`: Integrated Customer Feedback Themes card with sentiment badges, theme volume, and quotes.
  - `driver-app/utils/documentReasonLocalizer.ts`: Multi-language localization helper for document rejection reasons in `ta`, `te`, `kn`, `hi`, `en`.
  - `driver-app/components/DocumentUpdateModal.tsx` & `driver-app/app/my-cars.tsx`: Localized document reason banner and compact verification state display.
- **Verification Results:**
  - Backend tests: `pytest -q tests/test_ux_llm_round3.py` -> **7 passed (100% green)**.
  - Admin App typecheck: `npx tsc --noEmit` in `admin-panel` -> **0 errors**.
  - Driver App typecheck: `npx tsc --noEmit` in `driver-app` -> **0 errors**.

---

### Antigravity Pass: Missing Screens, 360dp Layout Overhaul, Backend All-Inclusive Extra KM + GST Billing (2026-10-07) - branch `feat/missing-screens`
- **Backend: All-Inclusive Extra KM + 5% GST Billing at Trip Close** (`backend/app/crud/end_records.py`):
  - When closing an All-Inclusive booking (`is_all_inclusive: True` & `customer_all_inclusive_includes_gst: True`), extra distance driven beyond the package limit is billed to customer as `extra_km_bill = extra_km * extra_km_rate` plus 5% GST on extra distance (`extra_km_gst = round(extra_km_bill * 0.05, 2)`).
  - Driver payout (`driver_net`, `driver_profit`) is strictly preserved as per the agreed package/standard tariff.
  - Added comprehensive test suite `backend/tests/test_all_inclusive_extra_km_gst.py`. Full pytest suite: **219 passed, 0 failed**.
- **Admin App: Built Missing Screens** (matched to Drop Cars Admin design system, theme tokens, cards, pull-to-refresh, empty & error states, dark mode, 360dp narrow width):
  1. `admin-panel/app/workers-payroll.tsx` (Settings > Team): 1-tap bulk daily attendance, worker management modal, advances tracker, petty cashbook ledger, and monthly worker payroll calculation.
  2. `admin-panel/app/tax-reports.tsx` (Settings > Accounts, permission `tax_accounts` or Owner): GSTR-1, GSTR-3B, Section 9(5) ECO tax reports, tax invoice lists, credit note modal, driver settlement generator & finalizer, company tax profile editor.
  3. `admin-panel/app/driver-tours.tsx` (Settings > Operations): Active tours live summary, tour ledger & settlement modal, expense verification, own-fleet return trip matches, autopilot config manager, customer review queue, and CRM broadcast sender.
  4. `admin-panel/app/website-settings.tsx` (Settings > Website): Optimization settings editor for advance payment (percent, minimum, UPI), pricing rules (night / holiday surcharge, toll estimate per km, minimum fare), extra surcharges (luggage, pet, peak), and referral rewards.
- **Admin App: 360dp Narrow Phone & Dark Mode Layout Overhaul** (eliminated button and field overlapping):
  - `admin-panel/app/create-booking.tsx`: Rebuilt All-Inclusive driver compensation toggle (Standard Tariff vs Package Amount) with responsive chip pills and clean tariff cards.
  - `admin-panel/app/fleet-subscriptions.tsx`: Replaced squished payment channel row with horizontal chip scroll, cleaned up WhatsApp sharing button action rows.
  - `admin-panel/app/fleet-owner-detail.tsx`: Fixed "Upgrade with payment" card layout in Change Partner Tier modal.
  - `admin-panel/app/system-config.tsx`: Fixed PARTNER UPGRADE multiline WhatsApp message input (`minHeight: 90`) and numeric input alignment in Operational Limits.
  - `admin-panel/app/(tabs)/settings.tsx`: Added entries for all new screens, cleaned up subtitle hints with proper line heights.
  - `admin-panel/app/system-health.tsx`: Added confirmation dialogs before running sweep and refreshing cities.
- **Driver App: Linked Unreachable Screens** (`driver-app/app/(tabs)/profile.tsx`):
  - Added entry points in Driver Profile menu for `app/documents-review.tsx` (Document Verification Status) and `app/vo-pending-orders.tsx` (Vehicle Owner Pending Orders).
- **Website API: Site Settings Endpoint** (`website/api/admin-app-site-settings.php`):
  - Added secure PHP API with `X-Admin-App-Key` header authentication to safely read and update whitelisted platform settings through `dropcars_save_config_file_or_db` and `sync_settings_to_public_config()`.
- **Validation**:
  - `admin-panel`: `npx tsc --noEmit` -> **0 errors**.
  - `driver-app`: `npx tsc --noEmit` -> **0 errors**.
  - `backend`: `pytest -q tests` -> **219 passed, 0 failed**.

---

### Recent Changes (2026-10-01)

1. **Hourly Rentals Custom Duration & Presets** (`create-booking.tsx`):
   - Presets updated to `5h / 50km` and `8h / 80km`.
   - Added `Custom / Manual` duration option with real-time 10 km/hr auto calculation.
   - Default hourly tariffs aligned (Driver: ₹250, Vendor Extra: ₹50, Addon KM: ₹25, Vendor Extra Addon KM: ₹5).

2. **Booking Cards Direct Cancellation** (`(tabs)/orders.tsx`):
   - Added direct `[ Cancel ]` button on Live / Unassigned / Assigned / Running booking cards.
   - Connected to `CancelReasonModal` with wallet hold auto-refund.
   - Admin role authorization check relaxed to include all operational staff/admins.
   - Added `[ Delete ]` button on Cancelled/Expired cards for Owner.
   - Preserved floating round `+` FAB (`zIndex: 999, bottom: 24/32, right: 18`).

3. **Multi-Session Safety Rule**:
   - Strictly surgical line-by-line edits only. No file-level overwrites.


---

### Recent Changes (2026-10-09) - Invoices & Estimates module (Claude)

- **Backend**: `models/billing.py` (BillingBrand, BillingDocument, BillingRateCard), `utils/billing_calc.py` (GST NONE/EXTRA/INCLUDED, collect / show-only / pay-later, included vs not-included lines),
  `utils/billing_tariff.py` (KM_BATA, SLAB_DROP, SLAB_ROUND, LOCAL, DAY_RENT, PACKAGE - slab maths copied from Arunachala `fareEngine.js` and unit-tested against it),
  `utils/billing_policies.py` (taxi vs tours terms/rules, starter rate cards), `utils/billing_render.py` (HTML + PDF, "Prepared by <staff>" footer), `crud/billing_docs.py`, `api/routes/billing_docs.py`
  (`/api/admin/billing/*`, public customer page `/api/billing/public/{token}`).
- Every document stores its creator (name + phone), who shared it, full history; numbering `<prefix>/<FY>/<0001>` per brand; GST invoices are copied into the TaxInvoice ledger.
- `POST /admin/tax/invoices/manual-issue` (old GST screen) now issues through this engine (the old code could never save).
- **Admin App**: `app/invoices.tsx` (hub), `app/billing-editor.tsx`, `app/billing-brands.tsx` (brand + tariffs, Owner-only writes), `services/billingApi.ts`; menu links in Home quick actions, Settings, CRM, booking detail (Invoice / Estimate buttons pass the booking id).
- Brand GSTIN / address / bank details are intentionally empty - fill them in Invoices > Brands. GST modes refuse to issue until the brand has a GSTIN.
- Tests: `test_billing_calc.py`, `test_billing_docs.py`, `test_billing_tariff.py`; full backend suite 308 passed.

- **Pricing rules (2026-10-09)**: `models/billing.py` BillingRule + `crud/billing_rules.py` + `/api/admin/billing/rules*`. State / location / route / hill rules (min km per day, rate +/- per km, bata +/-, extra charge, hill charge per hill one-way / per day round trip, % surcharge, date windows, vehicle and trip-type filters). Suggest-only unless a rule is set to auto-apply. Starter rules: hill charges (300 one way per hill / 500 round trip per day), Karnataka round trip 300 km/day. Admin: Brands > Rules tab, editor "Pricing rules for this trip" card. Tests: `test_billing_rules.py`.

- **Document look (2026-10-09)**: `billing_render.py` redesigned (brand-colour header band with the exact brand NAME, editable tagline + highlights strip, route card, striped items, totals block, UPI QR, bottom slogan, "Prepared by"). New `billing_brands.highlights` column (startup ALTER). Taglines / slogans / highlights are starter text per brand (`billing_policies.LOOK`), replaced only while still the old seeded placeholder; all editable in Invoices > Brands > Details.

- **Arunachala document style (2026-10-09)**: documents take the brand's own look from its website design system (ember #C24A1E, gold #C8A45A, warm cream, Cormorant Garamond serif) via new brand fields `secondary_color` and `font_style` (both editable). Estimates follow the website's estimate model: Includes / Excludes lists, "Grand Total (incl. GST)", "Advance Required (N%)". Temple/tour wording and the two sample temple-package rate cards removed from the Arunachala defaults (untouched seeded samples are deleted on startup).

## 2026-10-09 (Claude) - No fake zeros, remembered numbers, page transitions (Admin App)
- Owner: pages showed 0 while loading and switched with no transition. Dashboard also had invented fallbacks (24 bookings / 48200) - removed.
- `components/ui.tsx`: new `Shimmer`, `LiveNumber`, `FadeIn` (Animated, no new packages).
- Dashboard (`(tabs)/index.tsx`) and Tasks (`(tabs)/tasks.tsx`): `dataReady` / `tasksReady`; counts show a shimmer / "..." until the first fetch ends. Last real counts are cached in AsyncStorage (`dash_counts_cache_v1`, `tasks_counts_cache_v1`) and shown immediately on open, replaced when fresh data arrives. "Clear / All Caught Up / All Trips Assigned" no longer shown before data exists.
- `app/_layout.tsx`: Stack `slide_from_right` 260ms, `(tabs)` and `login` fade; `(tabs)/_layout.tsx`: tab switch `animation: 'fade'`. JS-only, ships by OTA.
- Not yet done (same pattern, other screens): orders.tsx, cars.tsx, accounts.tsx counts. AG round 3 may reuse Shimmer/LiveNumber/FadeIn.

## 2026-10-09 (Claude) - Merged Antigravity round 3 (selectively) - branch feat/ux-llm-round3 commit 85e7f5e
- AG's branch was built on STALE copies of several files; a plain merge would have deleted: chat Trash endpoints + Restore button, trip-OTP/payout/min-build settings, registration-date/RC rules, account-activity chips and FC rule in the Driver app, GST report mapping, KeyboardSafe imports, billing menu routes, and our log entries. So only the genuine additions were taken.
- TAKEN: backend `utils/ai_llm.py` (draft_replies, summarize_thread, generate_daily_digest, themes + switches/limits/logging), `quality.py` themes endpoint, support.py draft-reply/summary endpoints (4), admin.py `/admin/dashboard/digest` (response reshaped to `{headline, source, numbers, metrics{...}, generated_at}` - AG's screen read `metrics` but their backend returned only `numbers`, which would have crashed the card; unpaid invoices now use the real billing statuses ISSUED + UNPAID/PARTIAL), tests, Admin `magicParser.ts`, `CommandCenterContext` (voice parser), ui.tsx components (SectionHeader/Pill/StatChip/ListRow/... appended), Dashboard digest card, Chats "Draft with AI"/summary banner, Ratings themes, api.ts/supportApi.ts methods, Driver `documentReasonLocalizer.ts` (file only).
- NOT TAKEN (stale): AG's `driver-app/app/my-cars.tsx`, `components/DocumentUpdateModal.tsx`, their Trash-less support.py/admin.py settings edits, their old dashboard billing routes, `AI_COLLABORATION_LOG.md`. The localizer is not wired into the Driver App yet - AG should wire it on top of the current files (rebase first).
- RULE for AG from now on: before editing, `git checkout deploy/merged-2026-10-06 && git pull`, branch from it, never copy files in from other folders.
- Backend tests: 324 passed. Admin tsc clean.

### LIVE 2026-10-09 (Claude): backend rev `drop-cars-api-00317-msn` (commit 99a8db3: Invoices & Estimates + AG round 3 selective merge + shimmer/transitions). Admin OTA: preview group `3ff6a617-56ef-4984-af6c-9e447a452c55`, production group `1245c95e-cdc0-4a02-bf0d-e993b1cd9abd` (runtime 1.0.0). Driver App OTA NOT published (localizer not wired).

## 2026-10-09 (Claude) - Zero-flash sweep, round 2 (Admin App)
- New `hooks/useRememberedCounts.ts` (last real numbers restored from the phone, `markFresh()` after a real response, filtered responses never overwrite the overall numbers). Wired into Orders, Cars, Accounts, Vendors, Vehicle owners, Customers (header badges use `LiveNumber`).
- Removed invented numbers: Orders CRM overview showed `3176` responded and `2` future when unknown; now real values (future from `enquiriesApi.getFutureLeadsCount()`), "missed" has no source so shows a dash. Failed requests no longer turn into 0 (bids / substitutions / website bookings). Trip detail fallback fare `4100` -> "Not set", odometer fallback `320 KM` -> "Not available", default drop "Bengaluru" -> "Not set".
- Team hub attendance + cashbook boxes and Review tasks counts show a dash until loaded.
- Rule for everyone: a number that is not loaded or not available is a dash / shimmer, never 0 and never a made-up figure.

- **Documents v3 + WhatsApp chooser (2026-10-09)**: `billing_render.py` rebuilt after the owner's two reference PDFs (paper invoice with #/Qty/Rate/Amount, website fare quotation): Bill-To + From cards, route strip with distance/duration and Google Maps link, passenger row, Item/Details/Amount, "What's included / Not included - extra" with notes (km limit + extra-km rate + brand standard lists `includes_text`/`excludes_text`), UPI QR, two-column terms, signature lines (prepared by / customer acknowledgement / date), dark footer; every phone / e-mail / website / route / WhatsApp is a real link; customer page has Confirm-on-WhatsApp, Call, Download PDF, Pay buttons. Trip now carries km_limit, extra_km_rate, passenger, driver phone, vehicle model (prefill + tariff engines fill them). Share text carries km limit + included + not-included + advance + validity.
- **WhatsApp / WhatsApp Business**: new shared helper `utils/whatsapp.ts` (`openWaUrl`) in admin-panel, driver-app, customer-app: opens `whatsapp://send` directly (no canOpenURL, which is false on Android 11+) so Android's chooser offers both apps; every wa.me / api.whatsapp.com call site now uses it. Website `assets/js/whatsapp.js` appends an Android `intent://send` handler (4 copies; upload to the host still pending). Vendor app untouched on purpose (still has the old behaviour).

- **Enquiry "Customize Fare & Package" estimates (2026-10-09)**: the WhatsApp and PDF Quote buttons on `enquiries.tsx` now save a real Estimate document (`ensureEstimate`) and share its public link / server PDF. Fixes: base fare already contains the bata but the old text added the bata again (+300 on WhatsApp only), "PDF Quote" opened a `data:` HTML link that Android cannot open (it only showed "Estimation Formatted"), the advance link pointed to a page that does not exist (`dropcars.in/book-confirm`) - the advance is now a Razorpay link (when keys are on) or the brand's UPI QR, and blank bata no longer becomes 300. Booking detail Estimate buttons open the new editor. 2-column tiles (`PriorityGrid`, chats, fleet-hub) were 48.8% wide + 8dp gap = wider than a 360dp phone row, so they collapsed to one narrow column; now 48.4%.

- **Full Customize (2026-10-10)**: `components/FullCustomizeModal.tsx` is now the one Customize / Edit screen. Website Approvals > Customize (new `PUT /admin/website-bookings/{id}/customize-full`: customer, route, date/time, trip type, vehicle, km, driver/extra rates, hill/toll/night, customer total, advance; the booking id, status and posting rules are untouched, and a time/address change alone no longer freezes the driver tariff) and Operations > Bookings > Edit / Customize Booking (posted orders via master-edit + edit-fare). The fare-only "Edit Fare" box was removed. Customer-facing links: `whatsappTemplates.ts`, `invoiceGenerator.ts`, `quote-estimate.tsx` no longer send links that do not exist (/track, /sos, /invoice, /pay-advance, /book-confirm, /confirm, driver.dropcars.in, g.page); real ones are /track-booking/<id>, /thank-you/<id>, /review/<token>.
- **Website (Hostinger) - IMPORTANT**: the FTP root `/` IS the served web root (`/home/.../domains/dropcars.in/public_html`); the `/public_html/` folder inside the FTP root is a stray nested copy that is NOT served. Probed 2026-10-10 with test files. Earlier uploads that used `/public_html/...` paths never went live. Uploaded to `/` today (verified byte-for-byte): `api/send-enquiry.php` (customer WhatsApp quote rewrite, no "?/KM", km limit + included/excluded, emoji as \u{...} escapes), `admin/pages/customize-booking.php` (limits + included/not-included in the quote and trip-summary messages), `assets/js/whatsapp.js` (Android WhatsApp / Business chooser). NOT deployed: Antigravity's newer local versions of send-enquiry.php / customize-booking.php (E-prefixed booking id display, border-tax calc, curated-distance guard, Puducherry fix) - the served root still holds the older ones; the owner said the live booking-id logic is perfect, so those were left alone. Backups of what was live: C:\gtmp\live-root-2026-10-10.

- **Unaccepted Bookings Desk (2026-10-10)**: new `models/unaccepted_case.py`, `crud/unaccepted_desk.py`, `api/routes/unaccepted_desk.py` (`/api/admin/unaccepted-desk/*`), Admin screen `app/unaccepted-desk.tsx`. Alarm cadence (all editable via platform settings `unaccepted_*`): 1st alarm 2 h before pickup (or half way from posting when posted inside 4 h), then again after HALF of the time left each time, min gap 10 min, quiet in the last 10 min, max 8, snooze 15/30/60. Actions: acknowledge, snooze, share to group (message built server-side, staff tap Send), assign vendor (opens the existing manual-allocation sheet via `/(tabs)/orders?allocate=<id>`), executed elsewhere (platform / who / driver / cab / commission due 10% min 200 / follow-up at trip end + 2 h), cancel (existing cancel engine + detailed customer e-mail with the refund position; website status updated). The auto-cancel of expired unaccepted bookings now also e-mails the customer. `get_urgent_unassigned_alarm_bookings` NOBODY_ACCEPTED branch follows the desk schedule; `BookingAlarmHost` posts seen / snooze to the server. A push is sent once per alarm from the minute sweep. NOT built yet: the web execution portal (see the plan in the final report).

## 2026-10-10 - Import fixes, guest-help bot v2, Chats drill-down (Claude)
- Backend (commit ad60f16, NOT yet deployed - deploy was blocked by the permission classifier, needs the owner's go): fixed 5 latent ImportErrors (AI draft reply in Chats, vendor cancel booking, admin add vendor/customer, remove account, vacant-city escalation helper `get_system_setting`); remove-account clean-up steps run in savepoints. tests/test_import_health.py guards this.
- Guest-help bot v2 (`crud/support_autoreply.py`): first reply answers the reason at once (English + Tamil until a language is chosen, chooser at the end); typing in Tamil/Telugu/Hindi/Kannada switches language; new topics trip_otp (never shared - customer tells it), customer_number, payment; detail collection (`GuestHelpToken.topic/collected`) for password/no_email/mobile/identity with a checklist, Aadhaar cut to last 4 digits (also masked in the stored chat message).
- Admin App (commit 45affb1): Chats = tiles > categories > chats pages (`components/ChatDrillDown.tsx`), no dropdown sections.

## 2026-10-10b - Web execution portal, nav-bar fix, bot details to Admin (Claude)
- Portal: `/p/{token}` mobile page (backend-served), `/api/portal/{token}/...` (take, pay UTR, start/end with the CUSTOMER's OTP, location, feedback) and `/api/admin/portal/{order_id}` (+confirm-payment). Group share message from the Unaccepted Desk now carries the link. OTPs are never returned to the executor; wrong-OTP guessing is locked after 5 tries / 15 min. Table `portal_trips`.
- Admin App: desk cards got a "Web link" panel (link, commission confirm, send driver + OTPs to customer, location, rating); Chats thread header shows what the help bot collected; `KeyboardSafe` Modal lifts transparent sheets above the Android navigation bar (Customize modal buttons were hidden behind it).
- Backend of 347c7d8 is NOT deployed (classifier denied the deploy).

## 2026-10-10c - LIVE: backend rev 00323 (commit 9898768) (Claude)
Went live on owner's explicit "deploy pannu": import-error fixes (AI draft etc.), guest-help bot v2, web execution portal (/p/{token}) with commission through the EXISTING Razorpay account (payment link, auto-confirms when paid; UPI QR + UTR fallback), bot-collected details in the Admin thread. Admin OTA (nav-bar overlap fix, Web link panel) published earlier the same day. Log check after deploy: no errors.

## 2026-10-10d - LIVE: backend rev 00324 (commit 7006331) - DropBot for vendors (Claude)
The Vendor App's DropBot shared the DRIVER bot: it showed the Rs 500 wallet hold, the cancellation penalty and a hard-coded per-km rate card. Backend now knows the caller's role: a vendor gets vendor rules (`ai_llm._vendor_rules_text`), vendor facts (own latest bookings) and vendor wording in the rule-based fallback (no hold/penalty/rates). vendor-app/app/chats.tsx texts (welcome, chips, offline fallback with no numbers, `audience: 'vendor'`) are committed but need the next Vendor build to reach phones.

## 2026-10-10e - LIVE: backend rev 00325 (commit 7013c9f) - bot reads the real tariff (Claude)
Help bot (rule-based + LLM rule sheet) no longer has a typed-in rate card: tariff, minimum km, hold, commission/fees, waiting, bata come from driver_tariff + fare_rules + fee settings (utils/bot_facts.py). Default driver tariff Sedan round trip changed 13 -> 14 on the owner's word (2026-10-10); a saved Admin > Tariffs > Driver config still wins. Named-route estimates now work (a 'fare' word used to hijack them), unknown distances are not guessed.

## 2026-10-12 - Reconciling Antigravity's Oct 9-11 work with ours (Claude) - READ THIS BEFORE EDITING / DEPLOYING
What went wrong (found by a deep check on Oct 11 night): Antigravity published Admin OTAs (preview channel, built from `dropcars-review/admin`, base commit eb0a0e5 of Sep 21) and deployed a backend (Cloud Run rev 00326, 18:28 IST) from a tree that did NOT contain our work since Oct 9 evening. Live therefore lost: Invoices & Estimates (billing API + public links), Unaccepted Bookings Desk, web portal, Full Customize, chat trash, account activity, document models, bot v2, vendor DropBot, tariff bot ... (73 routes) and the OTA lost the matching screens, real WhatsApp links, desk alarms, nav-bar fix, remembered counts.
What was merged (branch deploy/merged-2026-10-06): `feat/brand-language-help-round4` (git merge, clean) + Antigravity's uncommitted Oct 11 work, picked HUNK BY HUNK (their working copies were derived from older files and DELETE features we had): directives (backend model/migration/endpoints complete+expire, Admin mission card, Tasks command modal, api.ts), create-booking edit mode with tariff freeze, orders Notify button + Recreate keeps rates (+ a "Full form" button next to our Customize), alarm separation (EnquiryAlarmHost/alarmSound), staff-management call buttons, AppLoadingScreen, Help Insights screen + `/api/help/insights` (now admin-only) and `/api/help/events` (public telemetry), chat-trash routes `/admin/trash/move|restore` kept for their build.
NOT taken from their copies: dashboard cache/shimmer removal, tasks cache removal, `_layout` (UpdateGate, KeyboardSafeView), tax-report mapping removal, document-model API removal, fake links/OTP fallbacks, raw wa.me links.
RULE going forward: never deploy the backend or publish an Admin OTA from `dropcars-review/*` or from `Drop-Cars-Full-Repo` working trees; work on the shared repo branch, `git merge`, run `pytest` + `tsc`, then deploy from `C:\gtmp\wt-merged`.

## 2026-10-12b - Auto-post tariff check, de-hardcoded numbers, Antigravity prompt (Claude)
- `tests/test_autopost_matrix.py`: table of what an auto-posted website booking carries to drivers (Sedan one-way 15 / round trip 14, SUV 20, Innova bata 400, Pondicherry permit, all-inclusive). All rows behave as the driver tariff says.
- `crud/customer_booking_request.py`: the 85/15 all-inclusive split, the 10% platform percent and the 300 bata fallback were typed in; now read from System Config (`platform_all_inclusive_pct`), commission rates and the driver tariff.
- `scripts/verify_live_routes.py` compares live routes with this repo (0 / 0 now).
- `ANTIGRAVITY_PROMPT_Reconcile_and_Rules.md` (repo root + Desktop): the rules Antigravity must follow.

## 2026-10-12c - Customize Booking (edit mode) save error + duplicate Save bar (Claude)
- Save failed with `invalid input value for enum ORDER_TYPE_ENUM: "oneway"`: the screen sent its own word for the trip type and a pickup time without an offset (the server read it as UTC: 5 h 30 m shift). Backend `crud/orders.py admin_master_edit_order` now maps trip / vehicle words to the enums and treats an offset-less time as IST; the app sends `+05:30`. Tests: `tests/test_master_edit_enums.py`.
- `create-booking.tsx`: the sticky Save / Confirm bar now sits above the Android navigation bar (safe-area inset) and shows in edit mode even before a re-calculate; the second "Save Changes" button inside the form was removed (one Save only).
