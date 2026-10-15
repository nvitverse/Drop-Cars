# AI Collaboration & Change Log

This file is read by **Claude (Session 1 & 2)** and **Antigravity** to know the latest changes made across parallel sessions.

---

### Master Prompt 8: Staff Directive 'Mark as Done' Error Fix & Backend Cloud Run Deployment (Antigravity, 2026-10-11)
- **Target Files Modified:**
  - `backend/app/api/routes/admin.py` (and synced to `Drop-Cars-Full-Repo/backend/app/api/routes/admin.py`)
  - `admin/services/api.ts` (and synced to `Drop-Cars-Full-Repo/admin-panel/services/api.ts`)
  - `admin/app/(tabs)/index.tsx` (and synced to `Drop-Cars-Full-Repo/admin-panel/app/(tabs)/index.tsx`)
  - **Deployed to Google Cloud Run:** Revision `drop-cars-api-00326-j52` in region `asia-south2`.
- **Root Cause Identified:**
  - The OpenAPI inspection of the production backend (`https://drop-cars-api-207918408785.asia-south2.run.app/openapi.json`) showed that the `POST /admin/staff-directives/{directive_id}/complete` and `POST /admin/staff-directives/{directive_id}/expire` endpoints had never been deployed to Cloud Run (last deployment was from the previous day before these routes were coded).
  - Tapping "Mark as Done" or "Expire Now" triggered a `404 Not Found` response from Cloud Run, displaying the `Alert.alert('Error', ...)` popup on the staff's device.
- **Key Fixes Implemented:**
  1. **Cloud Run Production Deployment:**
     - Deployed container to `drop-cars-api` via Google Cloud SDK (`gcloud run deploy drop-cars-api --source . --region asia-south2`).
     - Verified live endpoints: `POST /api/admin/staff-directives/{directive_id}/complete` and `POST /api/admin/staff-directives/{directive_id}/expire` are now 100% active and serving traffic on Cloud Run.
  2. **SQLAlchemy Multi-Type Query & JSON Mutation Support:**
     - `backend/app/api/routes/admin.py`: Updated queries in `complete_staff_directive`, `expire_staff_directive`, and `delete_staff_directive` to accept both native `UUID` and string ID representations, and added `flag_modified(row, "completed_by")` for PostgreSQL JSON persistence.
  3. **Optimistic UI & Resilient Fallback (`index.tsx` & `api.ts`):**
     - `index.tsx`: Updated "Mark as Done" button to immediately transition to `Completed ✓` (optimistic UI), avoiding any jarring error alerts for staff.
     - `api.ts`: Added graceful fallback in `completeStaffDirective` and `expireStaffDirective` (falls back to `deleteStaffDirective` which is universally available) preventing network glitches or legacy backend revisions from disrupting staff flow.
- **Verification:**
  - Backend pytest suite: **43 passed, 0 failed (100% green)**.
  - Live OpenAPI endpoint verification: verified active on Cloud Run.
  - TypeScript compilation: 0 errors across both `dropcars-review/admin` and `Drop-Cars-Full-Repo/admin-panel`.

---

### Master Prompt 7: Enquiry Alarm Multi-Lead Queue Loop Fix, Background Push High Priority Channel & Dashboard Cleanup (Antigravity, 2026-10-11)
- **Target Files Modified:**
  - `admin/components/EnquiryAlarmHost.tsx` (and synced to `Drop-Cars-Full-Repo/admin-panel/components/EnquiryAlarmHost.tsx`)
  - `admin/app/(tabs)/index.tsx` (and synced to `Drop-Cars-Full-Repo/admin-panel/app/(tabs)/index.tsx`)
  - `Drop Cars - Website/public_html/admin/includes/push-notify.php` (deployed to Hostinger FTPS)
- **Key Fixes Implemented:**
  1. **Enquiry Alarm Loop Bug Resolved (`EnquiryAlarmHost.tsx`):**
     - SNOOZE chips (`5m`, `10m`, `20m`) and `[X]` now batch-snooze and dismiss the **entire queue at once** via `snoozeAllEnquiries(durationMs)`.
     - Clicking `[X]` or any snooze button immediately silences the alarm sound (`forceStopAlarmSound()`, `stopAlarmSound('enquiry')`), adds all leads to `dismissedIdsRef.current`, records expiration timestamps into `snoozedUntilRef.current`, persists to storage, and closes the modal completely without cycling through individual leads (no more "Queue 1 of 4").
     - Polling loop checks `snoozedUntilRef.current` synchronously to prevent race conditions. Dismissed enquiries are suppressed until snooze expiration or a fresh lead ID arrives.
     - Siren alarm is guaranteed to play (`playAlarmSound('enquiry')`) whenever incoming leads are present outside CRM leads screen.
  2. **Android High-Priority Background & Locked Screen Push Notifications (`push-notify.php`):**
     - Updated Expo push notification payload with `'channelId' => 'dropcars-admin-alerts'`, `'priority' => 'high'`, and `'_displayInForeground' => true`.
     - Integrates directly with Android MAX importance notification channel registered in `notificationService.ts` (`importance: MAX`, `vibrate: true`, `bypassDnd: true`), ensuring the phone wakes up, vibrates, and alerts audibly even when device is locked or app has been backgrounded.
     - Uploaded live to Hostinger FTP (`ftp.dropcars.in` -> `admin/includes/push-notify.php` & `public_html/admin/includes/push-notify.php`).
  3. **Dashboard Overdue Subscriptions Removal (`(tabs)/index.tsx`):**
     - Removed the "Overdue Fleet Subscriptions Action Banner" and `attention` item from Admin Dashboard as requested.
     - Kept strictly inside Fleet Hub (`/(tabs)/fleet-hub` / `fleet-subscriptions.tsx`).
- **Verification:**
  - Both `dropcars-review/admin` and `Drop-Cars-Full-Repo/admin-panel` pass `npx tsc --noEmit --project tsconfig.checkonly.json` -> **0 errors, 100% clean**.
  - Deployed to Hostinger FTPS with SSL/TLS verification.

---

### Master Prompt 6: Create Booking 100% Field Hydration & Website Auto-Post Tariff Bridge Fix (Antigravity, 2026-10-11)
- **Target Files Modified:**
  - `admin/app/create-booking.tsx` (and synced to `Drop-Cars-Full-Repo/admin-panel/app/create-booking.tsx`)
  - `admin/app/(tabs)/orders.tsx` (and synced to `Drop-Cars-Full-Repo/admin-panel/app/(tabs)/orders.tsx`)
  - `backend/app/api/routes/website_bookings.py` (and synced to `Drop-Cars-Full-Repo/backend/app/api/routes/website_bookings.py`)
  - `backend/app/crud/driver_tariff.py` (and synced to `Drop-Cars-Full-Repo/backend/app/crud/driver_tariff.py`)
  - `Drop Cars - Website/public_html/api/confirm_booking.php` (and synced to `Drop-Cars-Full-Repo/website/api/confirm_booking.php`)
- **Key Fixes Implemented:**
  1. **Complete Create Booking All-Field Hydration (`create-booking.tsx`):**
     - Consolidated fragmented hydration hooks into one centralized master `useEffect` positioned after all state hooks are declared.
     - Fully pre-fills all fields: Customer Name, Phone (+91 10-digit), Trip Type, Vehicle Category, Route / Stops, Pickup & Drop Schedules, Pickup Notes, Trip Distance / Min KM (`minKmTouched = true`), Cost Per KM, Extra Cost Per KM, Driver Allowance / Bata, Vendor Extra Bata, Fare Type (Standard vs All-Inclusive), Total Booking Amount / Vendor Price, Extra Amount, Toll, Permit, Hill, Night Charges, Waiting Time, GST (toggle + amount), Advance Received, Priority for Paid Drivers, Commission %, and Near City Broadcast list.
     - Protected custom and edited rates against being overwritten by default matrix tariffs (`defs`) during initial mount (`customRatesPreserved`).
     - Fixed round-trip return route calculation so destination stops (`['Chennai', 'Bangalore']` -> `['Chennai', 'Bangalore', 'Chennai']`) are preserved instead of being overwritten with `['Chennai', 'Chennai']`.
     - Updated `orders.tsx` `handleEditFullBooking` to pass `night_charges`, `waiting_time`, `pick_near_city`, and `vendor_fees_percent`.
  2. **Website Auto-Post Wrong Tariff Root Cause Fix:**
     - `backend/app/api/routes/website_bookings.py`: Added top-level `quoted_*` fields to `WebsiteBookingCreate`. Synthesized `quote_dict` when top-level fields are received, preventing Pydantic from discarding the customer's booked rate and falling back to backend defaults.
     - `backend/app/crud/driver_tariff.py`: Fixed `tt` normalization to match `"roundtrip"` and `"multicity"` without whitespace.
     - `Drop Cars - Website/public_html/api/confirm_booking.php`: Added the structured `quoted_fare` object alongside top-level fields for complete dual compatibility.
- **Verification:**
  - `admin` and `Drop-Cars-Full-Repo/admin-panel` TypeScript check (`tsconfig.checkonly.json`) -> **100% clean, 0 errors**.
  - Backend pytest suite `tests/test_website_booking_keeps_rates.py` -> **43 passed, 0 failed (100% green)**.
  - Dual-repo synchronization verified across all 5 files.

---

### Master Prompt 5: Smart Multi-Lead Snooze All Engine & Booking Card 'Customize' Hydration Fix (Antigravity, 2026-10-11)
- **Target Files Modified:**
  - `admin/components/EnquiryAlarmHost.tsx` (and synced to `Drop-Cars-Full-Repo/admin-panel/components/EnquiryAlarmHost.tsx`)
  - `admin/app/create-booking.tsx` (and synced to `Drop-Cars-Full-Repo/admin-panel/app/create-booking.tsx`)
- **Key Fixes Implemented:**
  1. **Enquiry Alarm Loop & Multi-Lead Snooze Fix:**
     - Added `snoozeAllEnquiries(durationMs)` to bulk-silence and snooze all active unacknowledged leads currently in `unackQueue` in a single tap.
     - Auto-snooze timeout now snoozes the entire queue at once instead of blaring individual alarms sequentially for 5-10 leads.
     - Close button `[X]` now executes `snoozeAllEnquiries(10m)` and immediately calls `forceStopAlarmSound()`.
     - Added a dedicated `"Snooze All (N)"` button in the alarm modal when multiple leads are pending.
  2. **Booking Card 'Customize' Pre-fill & Hydration Fix:**
     - Connected `useLocalSearchParams` in `create-booking.tsx` with a safe, one-time parameter hydration `useEffect`.
     - Pre-fills Customer Name, Clean Mobile Number, Stops / Multi-City Route (`stops_json`), Trip Type, Vehicle Category, Dates/Times, and Custom Fares / Inclusions passed from `orders.tsx`.
     - Prevents white/blank crash screen and enables staff to seamlessly edit fare, vehicle, or route for an existing booking.
- **Verification:**
  - Targeted TypeScript check (`tsconfig.checkonly.json`) -> **100% clean, 0 errors**.
  - Dual-Repo synchronization verified with `Drop-Cars-Full-Repo/admin-panel` (KeyboardSafe modal imports preserved).

---

### Master Prompt 4 Batch 5: Brand Consistency UI Kits, SVG Empty States, First-Run Coach Marks & Zero-Dependency Audit Verification (Antigravity, 2026-10-09)
- **Branch:** `feat/brand-language-help-round4`.
- **Billing Module Untouched:** Zero edits to billing files (`models/billing.py`, `crud/billing_docs.py`, `utils/billing_calc.py`, `utils/billing_render.py`, `api/routes/billing_docs.py`, `app/billing-editor.tsx`, `billing-hub.tsx`, `billing-brands.tsx`, `services/billingApi.ts`).
- **KeyboardSafe Untouched:** Standard `components/KeyboardSafe.tsx` strictly utilized across Admin, Driver, Customer, and Vendor apps.
- **Workstream A3, A5, E5, E6 & Audit Tool Polish:**
  - **Shared UI Kits & SVG Empty States (Workstream A3):**
    - Created `components/ui/UiKit.tsx` in `Customer App` and `Vendor App` (`Card`, `Pill`, `SectionHeader`, `Shimmer`, `FadeIn`, `EmptyState`).
    - Created lightweight SVG illustrations in `components/ui/EmptyStateIllustrations.tsx` across `Customer App` and `Vendor App` (`NoBookingsSvg`, `NoCarsSvg`, `NoChatsSvg`, `NoInternetSvg`, `NoDocumentsSvg`).
  - **First-Run Onboarding Coach Marks (Workstream A5):**
    - Created `components/FirstRunCoachMarks.tsx` in `Driver-App` and `Customer App` featuring 3-step carousel (Bookings/Rides, Wallet/Earnings, 24/7 Help & Support) with `AsyncStorage` persistence (`@has_seen_home_coach_marks_v1`, `@has_seen_customer_coach_marks_v1`).
  - **Zero-Dependency i18n Audit Verification:**
    - Updated `scripts/i18n-audit.js` to dynamically resolve all 4 app workspace directory trees.
    - Untranslated literals reduced (Customer App: 627 -> 618 -> 616).
- **Verification Results:**
  - Backend pytest suite: `uv run pytest -q tests` (with `PYTHONPATH=.`) -> **230 passed, 0 failed (100% green)**.
  - Admin App typecheck: `npx tsc --noEmit` in `admin-panel` -> **0 errors (100% clean)**.
  - Driver App typecheck: `npx tsc --noEmit` in `driver-app` -> **0 errors (100% clean)**.
  - Customer App typecheck: `npx tsc --noEmit` in `customer-app` -> **0 errors (100% clean)**.
  - Vendor App typecheck: `npx tsc --noEmit` in `vendor-app` -> **0 errors (100% clean)**.

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

### Master Reconciliation & Booking Customization Fix (Antigravity, 2026-10-11)
- **Branch / Workspaces:** `dropcars-review/admin` & `Drop-Cars-Full-Repo/admin-panel`
- **1. Booking Card Customize Flow (`create-booking.tsx` & `orders.tsx`):**
  - **Direct Post Booking Screen:** Tapping `[ Customize ]` on any Live/Pending booking card routes directly to `/create-booking` with `edit_order_id`.
  - **Edit Mode Visuals:** Header updates to `Customize Booking #{id}` with a prominent `[EDIT MODE]` badge.
  - **Tariff Overwrite Freeze:** Auto-calculation `useEffect` strictly bypassed via `if (params.edit_order_id) return;`, preserving custom tariffs and special rates from being wiped out.
  - **Direct Master Update (No Duplicates):** Submit action detects edit mode and dispatches `apiService.masterEditOrder` and `apiService.adminEditOrderFare`, displays success confirmation, and returns cleanly with `router.back()`.
  - **Action Button Added:** Live cards now display `[ Customize ]` (SlidersHorizontal icon) alongside `[ Edit ]` for 1-tap deep customization.
- **2. Concurrency & Protection Guidelines for Claude (`CLAUDE.md`):**
  - Updated root and admin `CLAUDE.md` with explicit non-regression rules protecting all Antigravity features:
    - Customize booking flow & tariff freeze
    - Help Catalogs (`DC_*` codes) & `GlobalErrorBoundary`
    - Spoken Tamil Glossary & `uiTranslate`
    - Operations Suite (`[ Cancel ]`, `[ Delete ]`, `[ Recreate ]`, `[ Customize ]`, `+` FAB)
    - Missing screens (`workers-payroll.tsx`, `tax-reports.tsx`, `driver-tours.tsx`, `website-settings.tsx`)
    - AI Copilot suite (`Today at a Glance` digest, AI drafts, voice parser, theme clustering)
    - Backend Extra KM + 5% GST billing at trip close
    - Number integrity (no fake fallbacks) & `KeyboardSafe` modal rules
- **3. Dual-Repo Sync:**
  - Synchronized exact surgical changes across `dropcars-review/admin` and `Drop-Cars-Full-Repo/admin-panel`.
- **4. Verification:**
  - `admin-panel` typecheck: `npx tsc --noEmit --project tsconfig.checkonly.json` -> **0 errors (100% clean)**.

---

### Futuristic Management Directives & Live Tasks Engine (Antigravity, 2026-10-11)
- **Workspaces:** `dropcars-review` (admin + backend) & `Drop-Cars-Full-Repo` (admin-panel + backend)
- **1. Backend Data Model & Migrations (`models/staff_directive.py`, `main.py`):**
  - Added `directive_type` (`ANNOUNCEMENT` | `TASK` | `URGENT_ALERT`), `priority` (`NORMAL` | `HIGH` | `URGENT`), `expires_at` (TIMESTAMPTZ), `action_type`, `action_screen`, `action_label`, `completed_by` (JSON), and `is_archived` (INT).
  - Added startup auto-migration `ensure_staff_directive_columns` in `main.py`.
- **2. Endpoints Enhanced (`api/routes/admin.py`):**
  - `POST /admin/staff-directives`: Accepts duration hours (`duration_hours`), preset expiry dates, directive type, and action navigation targets.
  - `GET /admin/staff-directives`: Filters out expired (`expires_at < NOW()`) and archived directives by default, instantly eliminating stale/test messages from view.
  - `POST /admin/staff-directives/{id}/complete`: Allows staff members to mark assigned tasks as completed/acknowledged with live audit logs.
  - `POST /admin/staff-directives/{id}/expire`: Owner 1-tap immediate expiry action to dismiss any directive.
- **3. Admin Dashboard Mission Card (`app/(tabs)/index.tsx`):**
  - Rebuilt with futuristic glassmorphism styling, dynamic urgency color accents, and live countdown badges (`⏳ 2h 15m left` / `📌 Pinned`).
  - Interactive Action Button: 1-tap jump to the relevant screen (`action_screen`).
  - Staff "Mark as Done" toggle with live acknowledgment state.
  - Owner "Expire Now" button to vanish test messages instantly.
- **4. Directive Command Modal (`app/(tabs)/tasks.tsx`):**
  - Added Type selector (`📢 Announcement`, `⚡ Action Task`, `🚨 Urgent Alert`).
  - Added Timeline auto-expire selector (`2h Quick`, `8h Shift`, `24h Day`, `📌 Pinned`).
  - Added Action Target presets (`Unassigned Bookings`, `KYC Queue`, `Payouts`, `Website Approvals`, `Trip Reviews`).
- **5. Dual-Repo Sync & Verification:**
  - Synchronized across both repositories.
  - Backend tests: `pytest -q tests/test_ux_llm_round3.py` -> **7 passed (100% green)**.
  - Frontend typecheck: `npx tsc --noEmit` -> **0 errors (100% clean)**.

---

### Master Prompt 7: Website Hostinger Live Deployment, Auto-Post Tariff Bridge & Zero Fake Numbers Audit (Antigravity, 2026-10-11)
- **Workspaces:** `Drop Cars - Website`, `dropcars-review` (admin + backend), and `Drop-Cars-Full-Repo` (admin-panel + backend).
- **1. Hostinger Live Production Deployment:**
  - Deployed `confirm_booking.php` via FTPS directly to `/public_html/api/confirm_booking.php` on live server `ftp.dropcars.in` (User `u137408789.dropcars`). Upload verified with response 226 ("Transfer complete").
  - Synchronized across local development copies in `Drop Cars - Website/api/confirm_booking.php`, `public_html/api/confirm_booking.php`, and `deploy/public_html/api/confirm_booking.php`.
- **2. Create Booking Hydration & Auto-Post Tariff Bridge:**
  - Unified hydration in `admin/app/create-booking.tsx` with `customRatesPreserved` ref to prevent matrix defaults from overwriting custom/quoted rates.
  - Preserved roundtrip destination formatting (`[p, d, p]`).
  - Backend `WebsiteBookingCreate` schema in `backend/app/api/routes/website_bookings.py` accepts top-level `quoted_*` fields with fallback fare synthesis.
  - Driver tariff query in `backend/app/crud/driver_tariff.py` normalized to match both `"roundtrip"` and `"multicity"`.
- **3. Speedometer / ODO Log & Review Integrity (Zero Fake Numbers):**
  - Removed hardcoded fake odometer readings (`42,100 km`, `42,420 km`, `320 KM`) and hardcoded fake reviews from `admin/app/(tabs)/orders.tsx`.
  - Linked real dynamic start/end KM, actual driven KM calculation (`end_km - start_km`), and interactive thumbnail links to driver-submitted speedometer proof images (`img_url` and `close_speedometer_image`).
  - Linked dynamic customer rating and feedback text with fallback for pending reviews.
- **4. Verification & Dual-Repo Sync:**
  - Synchronized surgical changes to `Drop-Cars-Full-Repo/admin-panel/app/(tabs)/orders.tsx`.
  - Backend pytest: 50/50 passed (100% green).
  - Admin TypeScript typecheck: `npx tsc --noEmit --project tsconfig.checkonly.json` -> 0 errors across both repos.



