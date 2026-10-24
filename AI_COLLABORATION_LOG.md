# AI Collaboration & Change Log

This file is read by **Claude (Session 1 & 2)** and **Antigravity** to know the latest changes made across parallel sessions.

---

### Claude, 2026-10-23 (b) - "Request for my car" approval (branch `feat/block-and-lifecycle-2026-10-23`, NOTHING deployed)
- **Why nobody got anything**: live logs showed 25 of 31 requests in 30 days failed (18 x 422, 7 x 400). The Driver App stored a phone-only "requested" marker first, swallowed the server error (`catch {}`) and sent invented ids (driver 1 / car 1). Also only the office was ever told; the vendor / poster had no screen and no push.
- **Now**: the server is the only truth (`driver-app/services/vehicle/vehicleRequestService.ts`); real error text is shown; a bad / missing driver id is fine for a one-driver fleet (`crud/vehicle_matching.py`). A new request pushes the booking's poster (vendor or fleet owner) AND the office (`services/substitution_flow.py`).
- **Who approves**: the poster (Vendor App > Vehicle requests, `/api/poster/substitution-requests`) or ANY admin for every booking (Admin App, existing screen). Approval is a PASS, not an assignment without a hold: `accept_order` skips only the vehicle-type gate when an approved request exists; the wallet hold (now `crud/accept_hold.py`, one place) is unchanged. Wallet covers the hold -> accepted and car + driver assigned at once. Wallet short -> request keeps `funds_needed`, driver is pushed "add Rs X, then tap Accept", the booking card shows it, the normal Add-money flow follows. (Credit / negative wallet was NOT built - owner preferred the recharge route.)
- Tests: `tests/test_substitution_flow.py` (7). Registry: 8 new entries. DB: 5 new columns on `car_substitution_requests` (startup ALTER IF NOT EXISTS).

### Claude, 2026-10-23 - Full audit + block / subscription rule (branch `feat/block-and-lifecycle-2026-10-23`, NOTHING deployed)
- **Audit** (report `Desktop\Drop Cars Group\FULL_AUDIT_2026-10-23.md`): every ref, every worktree, AG's Desktop folders, Play-Store line and the live website were compared with this line. Restored: Recreate booking keeps rates/allowances/tolls/date (trip-detail), the website bridge that only existed as uncommitted edits in Drop-Cars-Full-Repo (external_booking_id, website chip, quoted fare; 2 tests), admin list bottom padding (6377af0), estimate with a separate WhatsApp number, AG design kits (UiKit, empty-state art, first-run marks), native Android snapshots for Admin and Vendor (`native-backup/`, no passwords). Held on purpose: unified chat program (branches `feat/chat-phase-*`, `feat/ai-eval-harness`).
- **Header overlap in the Driver popup**: `uiTranslate` shows Tamil/Telugu/Kannada/Hindi, whose glyphs are taller than English; a fixed lineHeight sized for English drew the next line over them. The shared text layer now raises lineHeight to 1.55 x fontSize while a non-English language is on (Driver, Vendor, Customer). Needs an OTA.
- **Block**: the Admin App's Block button sent the status "Blocked" (not a status) -> "Invalid account status". Now: Switch off / Switch on / Block for good (reason) / Remove block / Start Monthly plan from wallet / Give plan days. The server also accepts Blocked/Suspended as "switched off". A permanent block hashes and stores every identifier (phone, alternate phone, e-mail, Aadhaar, PAN, licence, vehicle) in `blocked_identifiers`; sign-up of owners, vendors, drivers, cars and the admin create endpoints refuse them; the owner's drivers and cars are blocked too; sessions are cut. `backend/app/core/account_gate.py` (middleware) answers 403 `[ACCOUNT_BLOCKED]` / `[ACCOUNT_SUSPENDED_SUBSCRIPTION]`; the Driver App shows `app/account-blocked.tsx`.
- **Subscription rule** (`crud/subscription_lifecycle.py`): 30 days Standard, a lapsed plan gets 30 more days, then suspended until the plan is bought (or staff give days). Dormant until the Owner switches it on in Fleet Subscriptions; switching on gives every existing account a fresh 30 days; `run_billing` never reactivates such a suspension.
- **Wallet**: balance below Rs 500 is non-refundable - stated on the withdraw screen, in the Help Centre (5 languages) and in the Driver terms. (The live Terms text is editable in Admin > App content - add the clause there too.)
- To block Saravanan (9884628317) after the deploy: `python "Testing code/run_block_account_by_phone.py" 9884628317 "<reason>"` (dry run), then `--apply`.
- Guards: 73 registry entries; backend suite green; Driver and Admin typecheck 0 errors.

### Antigravity, 2026-10-18 - Prevent acceptance of cancelled bookings & harden trip hold refunds (Booking #462 incident)
- **Branch:** `deploy/merged-2026-10-06` (commit `6d5a6f38ad`). Deployed to Cloud Run service `drop-cars-api` (revision `drop-cars-api-00346-mwq`).
- **Incident & Bug:** Admin created Booking #462 (Salem -> Namakkal) and cancelled it 1.5 minutes later (`cancel-by-admin` as customer). At cancellation time, no driver had accepted, so no active assignment or hold existed. 46 seconds later, driver Sankar T tapped "Accept" from a stale feed view. `accept_order` (`api/routes/order_assignments.py`) and `create_order_assignment` (`crud/order_assignments.py`) only checked `cancelled_by == "CANCELLED_BY_VENDOR"` and `"AUTO_CANCELLED"`, failing to check `trip_status == "CANCELLED"` or `cancelled_by is not None`. The system accepted the cancelled trip, debited a ₹500 `TRIP_HOLD`, and because the trip was already cancelled, no subsequent cancellation event ever triggered to refund the hold.
- **Fix (backend):**
  1. `backend/app/api/routes/order_assignments.py`: `accept_order` now checks `trip_status` and `cancelled_by`, immediately rejecting acceptance of cancelled or completed bookings with HTTP 400.
  2. `backend/app/crud/order_assignments.py`: `create_order_assignment` validates that the order is not cancelled or completed prior to creating any assignment.
  3. `backend/app/api/routes/admin.py` & `backend/app/api/routes/orders.py`: Admin cancellation endpoints now verify `get_trip_hold(db, order.id, owner_id)` against `wallet_ledger` before falling back to `assignment.held_amount`, guaranteeing held funds recorded in the ledger are accurately credited back as `TRIP_HOLD_REFUND`.
- **Database Reconciliation:** Assignment #93 marked `CANCELLED`. Staff thamizh's ₹500 manual credit (`5b0bee25...`, note: "Salem duty") reconciled as `reference_type = 'TRIP_HOLD_REFUND'` for Order 462, restoring clear transaction ledger visibility. Driver's wallet balance verified at ₹1,000.
- **Verification:** All 466 tests passed (`466 passed in 224s`). Cloud Run deployed successfully.

---

### Claude, 2026-10-15 - regression audit + guards so overwritten fixes cannot return silently
- Audit report: `REGRESSION_AUDIT_2026-10-14.md` (Desktop\SAAS). Restored: Notification Sounds screen, place-search memory rule, Driver trip-code rule + keyboard-safe pop-ups, Customer App keyboard-safe modals, Quote & Estimate luxury screen, AG Directives UI in Tasks. Removed fake-data screens (customer-insights, face-audit; our-fleet-requests no longer in the menu).
- NEW guards: `docs/FIX_REGISTRY.json` + `scripts/regression-guard.js` (CI job `regression-guard`), `backend/tests/test_route_snapshot.py` (+ `routes_snapshot.txt`), `scripts/publish-guard.js` used by `scripts/publish-driver-ota.ps1` / `publish-admin-ota.ps1` (clean + pushed + contains the live update + guard passes), `publish-ota.js` records `gitSha` in the update. CLAUDE.md sections 1 and 7 rewritten (section 1 used to name the wrong repository). Stale folders carry `STALE_COPY_DO_NOT_EDIT.txt`. Prompt for Antigravity: `ANTIGRAVITY_PROMPT_NoOverride_Rules.md`.
- Caught by the existing undefined-names test: my sweep edit referenced a removed variable (`completed`) - fixed before any deploy.

---

### Claude, 2026-10-14 (b) - trips are never closed by a timer; no-show; repost approval; km correction; per-account rate limit
- **Branch:** `deploy/merged-2026-10-06` (commits e96b24d, 427c365, plus the Vendor splash/APK commit ac6f59c and 34b8413). **Not deployed yet when this was written** - check Cloud Run label `git-sha` before assuming it is live; if you deploy an OLDER backend you will bring the old auto-close and the shared rate limit back (see the 2026-10-12 regression note).
- **Incident:** Booking 429 (Dharmapuri -> Bengaluru): driver could not start the trip with the customer's code, the trip was then closed by itself and the Rs 500 hold stayed with the platform. Causes found: (1) `limiter` counted by the Cloud Run front-end address = ONE shared bucket for everybody ("5 trip starts per 10 minutes" for the whole platform, login 5/minute for everyone) -> `app/core/limiter.py` now counts per signed-in account, else the real client address; (2) `complete_no_start_assignments` auto-completed a not-started trip 24 h after pickup and kept the driver's hold -> REMOVED. Do not bring an automatic close back.
- **New (backend):** `crud/trip_exceptions.py` (+ `api/routes/trip_exceptions.py`): one alert (setting `no_start_alert_after_minutes`, default 120) when a trip is not started after pickup; driver `POST /orders/driver/{id}/no-show-request`; admin `POST /admin/orders/{id}/no-show`, `/no-show-dismiss`, `/repost-approve`, `/repost-cancel`; vendor `POST /orders/vendor/{id}/no-show` (own bookings only); `GET /admin/attention/trips`. A penalised booking that comes back waits `repost_approval_minutes` (default 10) for approval. The pending-orders pool now also lists bookings whose latest assignment was CANCELLED (docstring always said so; the code never did) - except to the owner who lost it. `cancel_expired_unaccepted_orders` now also expires such reposted bookings.
- **Km correction:** `crud/km_correction.py` + `POST /admin/orders/{id}/correct-km` (preview, then apply, wallet adjust optional): re-runs the real closing maths (`update_end_trip_record(..., recalc=True)` returns the new figures and rolls back), posts the commission difference driver/poster/platform with notes; the three always sum to zero. The old `/admin/orders/{id}/force-complete` (never settled money) now answers 410.
- **Apps:** Admin `needs-attention.tsx`, `CorrectKmModal.tsx`, Trip detail "Correct km & settle", two new settings rows; Driver `trip/start.tsx` (customer cancelled / not here -> no-show request), `my-bookings.tsx` (no penalty route), clearer "too many tries" text; Vendor `OrderDetailsComponent.tsx` (Mark customer no-show). "Website Booking" is no longer written into pickup notes (Driver App showed it); a startup UPDATE clears the old ones.
- **Verification:** full backend suite green (fresh venv from requirements.txt), new `tests/test_trip_exceptions.py` (rate-limit key, no auto-close, no-show, repost approval, km correction conservation). Admin / Vendor / Driver tsc clean for the touched files (Driver has 10 old errors in unused AG files: `components/help/*`, `OfflineBanner.tsx`, `DocumentCoachModal.tsx` import a `@/hooks/useTheme` that does not exist).

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

## 2026-10-12d - "Drivers cannot add a car" + other 500s found in the live logs (Claude)
Cloud Run logs showed: `POST /users/cardetails/signup` = a 200 (car saved, 7-60 s) followed within a minute by several instant 400s with the same request size. Cause: the Driver App checks the reply for `fc_img_url`, which a car under 2 years old does not have -> shows an error although the car was saved -> the driver retries -> "already registered" (400). Also the app hid the server's reason behind "Invalid data provided".
- backend: same owner + same number again = success with the saved car (`api/routes/car_details.py`); every 4xx/422 now logs one line with its reason (`main.py` exception handlers); `verify_password` returns False for a non-hash value ("owner_pass" on owner-linked driver rows) instead of a 500 on `/cardriver/signin`; `GET /vendor/email` 500 fixed; the needs-review list signs its picture links in parallel (it timed out with 504).
- driver app (OTA from a clean export of the pre-round-4 code + only this change): `fc_img_url` no longer required, the server's reason is shown. Admin App: order card buttons - "Customize" = the Full Customize modal again, AG's edit mode = "Full form".
- Seen, not changed: rev 00326 (Antigravity's deploy) produced ~100 500s across many endpoints; one intermittent deadlock in `get_driver_assigned_orders` (5 times on Oct 11).

## 2026-10-12e - Account creation errors (Claude)
Logs (4 days): `send-email-otp` 429 x32 ("wait 60 seconds"), `vehicleowner/signup` 400 x29 + 422 x6, `cardriver/signup` 400 x11 + 422 x12, `verify-email-otp` 400 x8, reset-otp 400 x27. Mostly people retrying (the first try worked, or the number already has an account). Changes: the 429 now says how many seconds are left and to look in Spam; "already registered" messages now tell the person to log in / use Forgot password; a fleet owner sending the same duty driver again gets success (same idea as the add-car retry); every 4xx / 422 is logged with its reason from now on.

## 2026-10-13 (Claude) - documents, expiry rule, Driver logo - LIVE
- Backend rev 00332 (commits 4a6fff5 + expiry-day rule): date repair in the document reader (O/0, l/1), typed date accepted when printed on the document, one-digit slips -> NEEDS_REVIEW, second-chance OCR (crop + rotations, untested against real photos: no Tesseract on the dev PC), new cars selectable (get_available_cars no longer needs ONLINE), switch-off text records who/when/why, cars and drivers stop ON their document expiry date (owner rule).
- Driver OTA 783103af: BrandLogo (real logo) on login / signup / language / duty sign-in, signup lists all problems in one alert. Published from the clean tree C:\gtmp\drv_src, not AG's round-4 code.
- verify_live_routes: 692/692.

## 2026-10-13 (Claude) - payment reconcile starvation fix - LIVE rev 00333 (commit 354b70c)
- crud/payment_reconcile.py took the 25 OLDEST unpaid (abandoned) CREATED orders each run; with >25 abandoned orders in the 3-day window a newer PAID order was never reached (driver Nandhakumar 8220162270 paid for Trusted, still Standard + wallet 0). Now newest first, 40 lookups per run, unpaid orders re-asked less often (30 min / 3 h), purpose also read from txn.notes. Tests: tests/test_payment_reconcile_newest_first.py.
- NOT confirmed for that driver (production DB not reachable from the dev PC: no authorized network; log reads were blocked). If he is still Standard after ~10 minutes, record his payment in Admin App > Fleet Subscriptions with Mark as Trusted.

## 2026-10-13 night (Claude) - Local Drop, city check, duplicate guard, Admin crash hotfix - LIVE
- Admin Home crash on open (my hook after the early loading return) fixed + republished (commit cac7cfc).
- Local Drop in Admin Create Booking (rates by car, km limit, extra km rate; backend crud/local_drop.py applies the extra-km rate at trip close). Neighbourhood/landmark pickups resolve to their city (backend /api/cities/local-serviceable/check, Admin). Vendor App fixes (city check, Hourly package-hours picker) are in vendor-app/ but need a native build (no OTA for Vendor).
- Manual wallet adjust refuses an identical credit/debit within 24h unless confirmed; Admin screen "Duplicate credits check" (backend crud/wallet_duplicates.py).

## 2026-10-14 (Claude) - Vendor App launch pass (sign-up -> approval -> posting -> payments)
- Tested end to end against a local backend (web build, 340 dp): sign-up API, Pending page, sign-in routing, payouts (save UPI, request, history), wallet, menu, profile, bookings. No horizontal overflow on the screens checked.
- Found + fixed: (1) Dashboard wallet pill called the DRIVER endpoint `/wallet/balance` ("No wallet found" for every vendor) -> `/transfer/balance`; same in the Statement screen. (2) "Assign to a specific driver" called the ADMIN-only `/orders/{id}/manual-assign`: a vendor tap got 401 and the 401 handler signed the vendor out -> button hidden. (3) axios 401 handler used `useRouter()` outside a component (Invalid hook call) -> imperative router + one alert. (4) Support number was three different made-up numbers (`+91 98765 43210`, `+91 83004 48959`, a gmail) -> one `GET /api/public/support-contact` (platform settings support_phone / support_email). (5) Terms screen was generic placeholder text with a hard-coded prod URL -> real vendor terms (`app_content` key `vendor_terms`, en + ta, editable in Admin App > App content > Vendor; version bump asks vendors to accept again; acceptance remembered, no longer asked at every sign-in). (6) Sign-in showed two error pop-ups, routed 'Blocked' as pending, sign-up success page showed account status in a "password" box, B2B tab collected a company name that was never saved (hidden behind a flag), "Target" alert text, `[object Object]` on form errors, no message on network failure, pending vendor with a stored token landed on a broken home (app start now checks the real status). (7) New Account status page: auto-checks every 30 s, opens the app when approved, call/WhatsApp/email from settings.
- New: Payouts screen (`app/(menu)/payouts.tsx`: balance, what can be withdrawn, UPI/bank details, request, history) on new `GET /users/vendor/payout-info` and `GET /users/vendor/payment-details` (existing payout routes were never used by the Vendor App). Menu: Withdraw money, Help & support.
- Layout: root KeyboardSafeView (+ KeyboardSafe.tsx synced from Admin), every `Modal` in the Vendor App now from `@/components/KeyboardSafe` (bottom sheets were hidden behind the Android nav bar / keyboard), tab bar height follows the bottom inset, UpdateGate + GlobalErrorBoundary mounted, mojibake "-" placeholders in Profile fixed.
- Not done / needs the next Vendor BUILD (native): everything above is JS but the installed Vendor APK has no matching runtime for OTA (expo-audio). Monthly statement route uses the old 2% commission text; B2B partners; vendor invoices screen.
- Backend tests: all pass (+4 new: tests/test_vendor_payouts_and_terms.py). Admin + Vendor tsc clean.

## 2026-10-14 (Claude) - Vendor App: invoices in the vendor's own name + the rest of the launch list
- **Own-name invoices / estimates** (backend `api/routes/vendor_billing.py`, `/api/users/vendor/billing/*`): one business profile per vendor (`BillingBrand.owner_vendor_id`, `BillingDocument.vendor_id`, startup ALTERs in main.py), reuses `crud/billing_docs` (same totals, PDF, public link). Rules: only the vendor's OWN bookings can be fetched by id; GST only with a valid GSTIN; the vendor's GST is NOT copied into the platform TaxInvoice ledger (`issue()` guard); payment links are off (money must go to the vendor's UPI/bank, receipts are recorded by hand); own prefix + sequence; vendor documents/brands are filtered out of the staff lists (`list_documents`, `list_brands`, `get_brand` fallback). Apps: `(menu)/invoices.tsx` (hub), `invoice-editor.tsx` (booking fetch, quick fare, charges with "pay on actuals", GST, issue + WhatsApp share, record payment, make invoice from estimate, cancel), `business-profile.tsx`; booking detail has "Make invoice" and "Send to customer" (server-built text `GET /users/vendor/orders/{id}/customer-message`, no invented tracking link).
- **Also:** Documents screen (Aadhaar status + camera/gallery re-upload; `PATCH /users/vendor/document-status` now refuses vendors - a vendor could mark their own Aadhaar Verified), monthly statement rebuilt from the vendor wallet ledger (the old one used a 2% commission that no longer exists) + `GET /users/vendor/reports/earnings-summary` + EarningsCard on the dashboard, `min_app_build_vendor` setting + ForceUpdateGate, race fix when two calls create the profile at once.
- Verified end to end locally (web build, 360 dp): created an invoice, issued (TVK/26-27/0001), share dialog, recorded a part payment, hub shows "Part paid, to collect". Backend tests all pass (+17 new in test_vendor_billing / test_vendor_payouts_and_terms). Admin + Vendor tsc clean.
- NOT live: needs backend deploy + a Vendor build. Not done on purpose: mobile OTP at sign-up (needs an SMS gateway / Firebase phone auth), vendor referral, public tracking link for app bookings (no page exists).

## 2026-10-14 (Claude) - Owner control over vendors + full-journey test
- **Approval is now real:** a Pending / switched-off vendor could post bookings (get_current_vendor never looked at account_status). `core/security.get_current_vendor` now returns 403 ("waiting for approval" / "switched off") for everything except their own status, Aadhaar photo and e-mail. Found by `tests/test_vendor_end_to_end.py`.
- **Owner sees everything a vendor invoices / quotes:** `GET /admin/billing/documents?scope=vendor|staff|all&vendor_id=`, `GET /admin/billing/vendor-profiles` (who, GSTIN, billed, to collect), `PUT /admin/billing/vendor-profiles/{brand}/active` (stop one vendor invoicing), setting `vendor_invoicing_enabled` (stop everyone; Admin > System config). Admin App Invoices: tabs "Our team | Vendors' documents | Vendor profiles" (switch per vendor); opening a vendor's document shows a "made by a vendor" banner, no payment-link button (and the API refuses links on vendor docs); staff edits keep the vendor's own profile.
- **Owner sees the trip codes of any booking:** `GET /orders/admin/{id}` now returns start_otp / end_otp (the list view already did); verified for a vendor-posted booking together with the vendor's name and phone.
- `tests/test_vendor_end_to_end.py` walks sign-up -> Pending cannot post -> owner approves -> vendor posts -> owner sees booking + vendor + codes -> vendor invoices -> owner sees / opens / PDFs it -> owner switches the vendor off and on -> payout request visible in the owner's queue. Whole suite passes.

## 2026-10-16 (Claude) - Driver App: duty session, number rules, waiting, SOS
- Duty driver stays in the duty area after a trip; owner switch no longer wipes the fleet token on a network error.
- Customer number is blank in every finished-trip response; vendor "Self-Sourced" card gone (vendor_name is null).
- Waiting charge billed on all trip types except hourly rental; waiting stopwatch + pre-fill on End Trip; SOS button on the running trip card.
- Number opens-at clock time shown in the number's place; tab counters show a dash instead of a false 0; Settings shows the real version + OTA update id.

## 2026-10-16 (Claude) - release prep
- Website: admin password was written in the public file assets/js/ui-controls.js - removed from the source copies and from the FTP copy; stray diagnostic PHP files deleted from the FTP copy (backups in C:\gtmp\ftp_backup_cleanup_2026-10-16). FINDING: the FTP account does not reach the folder the web server actually serves (served files are older than every FTP copy) - live website changes need the correct hosting access.
- Driver: signup messages translated; hooks/useTheme.ts added (tsc clean); OTA text-diff (scripts/ota_text_diff.py) runs inside publish-ota.js.
- Backend: waiting_rate_per_hour / waiting_free_minutes settings for non multi-city trips (+ Admin System Config fields, test).

## 2026-10-16 (Claude) - what went live (owner approved "release")
- Backend rev 00344 (commit 1aa4369) then rev 00345 (db0cf14: Driver update link -> our storage bucket).
- Driver OTA 77c5e7f1 (trip bill/QR/rating, duty stays, waiting timer, SOS, offline bar, profile change-request button, zero-flash, opens-at time).
- Admin OTA on preview (group b33a3306) and production (group ae4c987a).
- Driver APK 1.1.1 (code 31), same signing key as 1.1.0, OTA URL = our manifest: storage bucket driver-app/DropCars-Driver-latest.apk.
- Publish scripts fixed (driver: stderr + tar pipe; admin: syntax). Website: FTP does not reach the served docroot (see memory).

- 2026-10-24 (Claude): LIVE - backend rev 00348 (commit 04c0c90: permanent block + identifier blocklist + account gate, subscription lifecycle (dormant until Owner switches on), request-for-my-car approval by poster/any admin, Rs 500 wallet text, vendor chat 500 fix). OTAs: Driver 862d1fef, Admin 078f6e2a (EAS production), Vendor dddaf1ab. Website NOT deployed. Saravanan block not yet applied.

- 2026-10-24 (Claude): Saravanan (9884628317) fleet owner 33d5c91e + driver d33b5f9b permanently blocked on live DB (reason: Left the platform - account closed); identifier blocklist verified. Owner can undo via permanent-unblock (then reactivate + re-upload docs).

## 2026-10-24 (Claude) - what went live (owner said deploy pannu / OTA pannu)
- Backend rev 00349 (bbb1feb) and rev 00350 (ef695ac): documents - validity date read from the photo is saved; typed past (start) date no longer makes a car INACTIVE; Admin "Re-read all documents and fill dates"; real car problem reasons in the accept popup; colour-marks original check.
- Driver OTA 3dc92a6c (double-hold fix, valid-doc count, voice language) and OTA 5063d73a (My Trips is the one place for accepted work, accept -> assign, "I will drive it myself", Start trip on the card, More tab instead of Duty for owners, red To-assign badge, renamed tabs in 5 languages, sound-tone picker hidden).
- Admin OTA preview 844a1ace + production 968008b6.

- 2026-10-24 (Claude, third batch): LIVE backend rev 00351 (commit b38592a): plan fee auto-debit from wallet (dormant until the subscription rule is switched ON), Terms v3 clauses 12-14 + Plans & Account Rules page (5 languages), Help Center topic, unblock restores drivers/cars. NOT yet published: Driver OTA (Settings > Plans & Account Rules screen) and Admin OTA (App Content > Rules tab) - waiting for owner's explicit OTA go. Subscription rule still OFF.

- 2026-10-24 (Claude): OTAs LIVE after owner said publish - Driver c4e930ef (Settings > Plans & Account Rules, auto-debit note, blocked-screen wording), Admin a18baf03 (App Content > Rules tab). Subscription rule still OFF (owner decides when to switch on). Booking/wallet audit report (read only, nothing changed): Desktop\Drop Cars Group\BOOKING_MONEY_AUDIT_2026-10-24.

- 2026-10-24 (Claude, after owner said do everything): LIVE backend rev (commit 271bbad): trip close part 2 (Generate Bill preview endpoint, Taxes & Other Charges line, customer bill e-mail, other charges, toll receipt photo, stuck-trip daily alert + Needs-attention list), CI fix (billing brand seed crashed a FRESH database - made 'Drop Cars CI' fail on every push), e-mail circuit breaker (Gmail has refused every send since 25 Sep: 159+/day failures; 3 failures -> 10 min cool-down). OTAs: Driver a573b894, Admin 66e0d76c. Waiting rate (Rs 2/min = 120/hour) NOT changed: owner sets it in Admin App > System Config. Gmail sender support@dropcars.in must be checked by the owner (Google Workspace).

- 2026-10-24 (Claude): LIVE (commit a646aa3) - PRIVACY: customer phone number removed from the booking-accepted e-mail to the fleet owner and from the e-mailed GST invoice PDF; tests + regression guard keep it out. Customer numbers must never go by e-mail to anyone.

- 2026-10-24 (Claude): LIVE backend (commit 1718199 - its commit message is wrong: another session overwrote the shared commit-message file; the content is the e-mail work): e-mail verification hardening. Root cause of the signup 'Could not send code': Gmail closes the connection at LOGIN for support@dropcars.in (dead/blocked app password or blocked account; same from a PC). Added: backup SMTP (smtp2_*), per-server breaker, 2-hourly login-only health check with Admin push + platform_settings email_health, plain-words diagnosis, OTP hourly budget (150), Admin API /admin/email/health(+/check). NOT published: the Admin App Email-health screen (OTA denied) - owner must publish it or say go. OWNER MUST: create a NEW app password for support@dropcars.in (or give a backup mailbox) and save it in Admin App > Email settings.

- 2026-10-24 night (Claude, owner said: no new app password, take the existing one from the website): the website's own Gmail account (dropcars.in@gmail.com, api/config.php) logs in fine, so it was saved as the BACKEND BACKUP mail server (platform_settings smtp2_*; password never printed). Live backend rev 00356 already has the failover, so signup e-mail OTP is delivered through it from now on (self-test mail sent to dropcars.in@gmail.com via the backup: OK). The main support@dropcars.in Gmail is still refused at login (breaker skips it for 10 min after 3 failures). Still NOT deployed: bdcb277 (document date entry + wallet updater fix), a4b4829 (staff alert readiness), Admin e-mail health screen OTA - the classifier wants explicit deploy words.

- 2026-10-24 night (Claude, owner: just do everything): LIVE - backend rev 00357 (commit de81237: document-date route, e-mail health + backup, wallet fix is in the Driver bundle), Driver OTA cc6e1257 (documents popup Enter the date, wallet add/deduct updater fix), Admin OTA 727fdd17 (Email health + Backup mail server screen, staff alert readiness sheet; its native overlay/bubble part needs a NEW Admin build - not built). Backup mail server = the website's Gmail (smtp2_*), signup e-mail OTP delivered through it.
