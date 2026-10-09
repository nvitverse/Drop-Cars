# AI Collaboration & Change Log

This file is read by **Claude (Session 1 & 2)** and **Antigravity** to know the latest changes made across parallel sessions.

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
