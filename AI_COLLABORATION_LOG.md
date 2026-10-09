# AI Collaboration & Change Log

This file is read by **Claude (Session 1 & 2)** and **Antigravity** to know the latest changes made across parallel sessions.

---

### Extra-charge rule: ticked + 0 = nothing (Claude, 2026-10-09)
- One rule in crud/new_orders.normalize_charge_items (applies to every booking creator): included with amount 0 -> dropped (not listed as included or excluded, driver asked for nothing); included with 1+ -> included with its amount; unticked -> excluded, driver fills what he collected at trip end. Admin create-booking: a ticked custom extra with 0 is no longer sent as an included line, Toll label shows (Included) only when an amount is typed; Driver trip-end screen hides included lines with amount 0. A zero Toll line stays only when 'toll update at close' is on. 	ests/test_charge_items_rule.py.

### Enquiry alarm calm again (Claude, 2026-10-09)
- On 2026-10-07 the phones got a real looping siren for EVERY alarm, including enquiries (new leads) - owner: it was calm and nice before, now disturbing. dmin-panel/utils/alarmSound.ts: enquiries now use a gentle chime (notify_chime.wav, volume 0.6, repeated every 8 s until looked at). The siren stays only for urgent alarms (booking nobody accepted near pickup). If both ring, the siren wins.

### Document models - 'Take this as a model' (Claude, 2026-10-09)
- Staff approve a document by hand, then tap 'Take this as a model' (Admin App, car + account documents) and name it (Karnataka RC, Kerala Permit...). utils/doc_model.py stores a fingerprint (colour histogram + layout hash + aspect) in document_models; many models per kind. In get_auto_verification, a photo the check could not judge (NEEDS_REVIEW / unsure INVALID) that looks like a saved model (similarity >= setting doc_model_match_threshold, default 0.85) is VERIFIED automatically; anything the check is SURE about (expired, date mismatch, another document) is never promoted. Endpoints: POST /api/admin/document-models/from-document, GET, PATCH ?active=, DELETE. Models can be removed in the same popup.
- Active vs Verified reminder: typed dates drive Active; only originals (checked by a person or matched to a model) drive Verified.

### False INVALID removed, compact photo rows (Claude, 2026-10-09)
- The automatic check now says INVALID only when SURE (expired, typed date does not match a readable date, readable photo clearly another document). A photo it merely could not read / judge (blurry, 'photocopy', unrecognised) goes to NEEDS_REVIEW ('Drop Cars will check this') - never a rejection of a correctly uploaded original. One-time startup repair (crud/one_time_fixes.py, flag fix_false_invalid_documents_2026_10_09) turns old reason-less INVALID rows into NEEDS_REVIEW.
- Driver App upload popup: one compact row per side (tap -> Take Photo / Choose from Gallery); a car document is a single photo (the RC back is its own tile) - the popup used to demand a back photo that was never sent.

### LIVE 2026-10-09: backend rev `drop-cars-api-00308` (commit `ad9272a`); Admin OTA preview `a6bc1a45`, production `daeadbca`; Driver OTA published from Drop-Cars-Full-Repo (runtime 1.0.0). Earlier today: rev 00306 (`7755ba8`), 00307 (`2147702`). Customer / Vendor APKs not built.

### Active/Inactive vs Verified, document to-do popup, manual trip close, police verification, verified-only bookings, payout floor setting (Claude, 2026-10-09)
- **Active vs Verified are different** (`crud/account_activity.py`): ACTIVE = may work (no expired / INVALID document, not switched off by staff, rating not below the limit); VERIFIED = originals really checked (car: RC, Insurance, Permit, FC when needed all VERIFIED; driver: licence AND police verification certificate). Not-verified-yet never switches anyone off. Tags exist for car, driver, partner, vendor. New columns: `manual_inactive_reason` (car_details, car_driver, vehicle_owner_details, vendor_details), `auto_inactive_reason` (car, driver; set by the daily sweep from `min_car_rating` / `min_driver_rating` / `min_rating_count`), `police_verification_img/status` (car_driver).
- Admin App: `AccountActivityBar` on the car documents screen and the account documents screen (Active/Inactive + Verified chips, reasons, Switch OFF with a reason / Switch ON) via `PATCH /api/admin/accounts/{kind}/{id}/active`, `GET .../activity`.
- Driver App: My Cars / My Drivers show ACTIVE-INACTIVE and VERIFIED chips with the reasons; **the screens read `/vehicle-owner/all-document-status` (NOT /cardetails/all-document-status) - that endpoint now uses the shared `crud/document_status_builder.py`, so status / dates / reasons / activity reach the app** (before, the reasons and expiry notes could never appear there). Police Verification tile + upload (`document_type=police`, `police_image`). `DocumentTodoPrompt` popup at app start (and when returning to the app, snooze 3 h): missing dates, rejected documents with the reason + "upload the ORIGINAL", expired documents, missing police certificate (`GET /api/users/vehicle-owner/document-todos`). Rejected documents that predate stored reasons get a plain instruction instead of a bare "INVALID".
- Booking gate: setting `verified_car_required_for` (comma list: ALL_INCLUSIVE, WEBSITE, VENDOR, PARTNER, fare_type names) makes those bookings assignable only to fully VERIFIED cars (`crud/verification.verified_car_block_reason`). Empty = off.
- Manual trip close: `POST /api/admin/orders/{id}/manual-close` (+ Admin App "Close Trip Manually" on the booking sheet) runs the same `update_end_trip_record` as the driver (same fare rules, split, wallet settlement; any advance is settled against the poster share; reason stored + audit log). Needs the payment-release permission. `tests/test_split_conservation.py`: driver + poster + platform == customer total for 3000 random bookings of every class.
- Settings (Admin App > Settings): `payout_min_retained_balance` (was a hardcoded 500 in payout_requests), `min_car_rating`, `min_driver_rating`, `min_rating_count`; `verified_car_required_for` is string-valued (set through the settings API, no screen row yet).

### Wallet mismatch on the Subscription screen + yearly subscribers missing from Trusted list (Claude, 2026-10-09)
- Owner driving his own car (`CarDriver.is_owner_driver`): `/subscriptions/driver/status` and `/driver/subscribe` read the separate, always-empty driver wallet, so the Subscription screen said Rs 0 / "Insufficient" while the Wallet tab showed Rs 890. They now read and charge the OWNER wallet (`_owner_of_driver`) and buy the plan with `crud/billing.activate_plan_from_payment`; fees come from billing settings, not constants. Employee drivers keep the old driver-wallet path.
- Admin App Fleet Accounts list: `is_trusted` was only staff override / driver Pro, so everyone who had paid the yearly fee earlier was not shown as Trusted. It now uses `VehicleOwnerDetails.tier == "PREFERRED"` (the one rule the posting gate and the tier filter use) and returns `trusted_via` (ADMIN / DRIVER_PRO / YEARLY / MONTHLY); badge shows it. `tests/test_trusted_list.py`.

### Document reasons, compulsory update popup, RC date in Admin documents (Claude, 2026-10-09) - backend LIVE rev 00306 (7755ba8), Driver + Admin OTA follow
- Every INVALID / waiting document now carries a plain-words reason + what to do (`crud/document_notes.py`, new `document_notes` TEXT column on car_details and car_driver, startup ALTER). `utils/document_verifier.get_auto_verification` returns (status, reason); the typed expiry date is now actually passed to the checker on add-car and on re-upload (it was never passed before, so "date does not match / expired" could not fire). Reasons are returned by `/cardetails/all-document-status`, the driver document-status routes and the update-document responses.
- Driver App: My Cars shows a red box per rejected document ("Insurance: The date you entered ... does not match the date on the insurance (..). Enter the date printed on the document ..."), the upload popup shows the last reason at the top, an RC front upload asks the registration date, the date field has a hint and the popup scroll area is taller; after an upload the answer (accepted / why not) is shown straight away. FC tile only exists when an FC was uploaded.
- Admin documents list: RC rows show/save the REGISTRATION date (label from `date_label`), no +1/+2 year chips for RC.
- Compulsory update: `GET /api/app-updates/{app}/version-check?build=N` + `ForceUpdateGate` (Driver, Customer): when the installed build number is below platform setting `min_app_build_driver/customer` (Admin App > Settings > Operational Limits) a blocking "Update required" popup opens the APK link (`app_download_url_<app>` or the website APK). `OtaUpdateGate` no longer offers "Later" - the downloaded update must be restarted. Default 0 = off.

### RC registration date, FC only for vehicles 2+ years old, INVALID vs not-verified (Claude, 2026-10-09) - commit `0c9cce5`, NOT yet deployed (live is `f103d1f`, rev 00305)
- The RC card has NO expiry date: `car_details.registration_date` (new column + startup ALTER) replaces `rc_expiry_date` everywhere (add-car in Driver + Admin, reminders, document list, expiry editor). `rc_expiry_date` stays in the table only so old rows load; nothing reads it.
- A new vehicle has no FC for its first 2 years: `crud/verification.fc_status_for_car` (registration date + 2 years; model-year fallback). `fc_img` is optional on `POST /cardetails`; Driver/Admin add-car hide FC until it applies; an FC date/INVALID FC never blocks a vehicle that does not need one.
- Status meaning (owner): VERIFIED = original, data matches, checked. INVALID = wrong/non-original/unreadable document, the typed date does not match the document, or it is expired. PENDING / NEEDS_REVIEW = "not verified yet". The gate blocks ONLY on expired or INVALID (never on not-verified): `is_car_verified`, `is_driver_verified`, messages name the exact problem (`car_document_problems`). The auto-verifier writes INVALID again (my 10-08 change that turned INVALID into NEEDS_REVIEW was wrong and is reverted) and a date mismatch is INVALID, not NEEDS_REVIEW.
- Deploy the backend BEFORE publishing the Driver/Admin OTA: the old backend still requires `fc_img` and would reject a new vehicle's add-car.
- Files: backend `models/car_details.py main.py schemas/car_details.py crud/{car_details,verification,document_expiry,admin_management}.py utils/{expiry_checker,document_verifier}.py api/routes/{car_details,admin,order_assignments}.py`, `tests/test_document_gate.py` (247 pass); driver-app `app/add-car.tsx services/auth/signupService.ts`; admin-panel `components/AdminAddCarModal.tsx services/api.ts`.

### Documents gate, IST times, duplicate pushes (Claude, 2026-10-08) - branch `deploy/merged-2026-10-06`, NOT yet deployed
- A car may take bookings unless a required document (RC / Insurance / Permit) has EXPIRED; a driver unless the licence expired (`crud/verification.py`). The automatic document check never blocks any more and never writes INVALID (it goes to NEEDS_REVIEW for a person): owners were locked out of bookings because it marked real documents INVALID ("Verify Your Car First").
- Driver App My Cars: the status word was drawn at size 20 and overflowed the tiles (`components/DocumentStatusIcon.tsx`); tiles now show a dot + a short plain label.
- Times printed without the IST conversion (5 h 30 min early): booking chat suggestions, the "booking accepted" e-mail, the priority-cutoff alert, Drop Bid pickup time, owner review dates. `utils/timezone.py to_ist`.
- Same phone, three notifications, one sound: the same device token registered on several accounts got one copy per account. `crud/notification.py dedupe_push_payloads` (same token + title + body = once).
- Website settings PHP (`website/api/admin-app-site-settings.php`) was uploaded for a test and REMOVED again: Hostinger answered 302 for it (and for any not-yet-known file in /api), so it is not live. The 3 files created were deleted; nothing pre-existing was touched. Live `api/config.php` was only read (local backup `C:\gtmptp_backup3`).

### Merged Antigravity `feat/missing-screens` (Claude, 2026-10-08) - commit `157180b`; backend LIVE as revision `drop-cars-api-00304` (label `e8d54f9`); Admin OTA published 2026-10-08 (preview `a93a1ed1`, production `e2ce35ef`); Driver OTA `00cc8f2f`. The website settings PHP is NOT uploaded
Merged with corrections: extra-km billing now pays the driver and updates the split (`all_inclusive_extra_km` + tests); the all-inclusive bill no longer double-counts the markup; the website settings PHP uses the real `api/config.php` keys and backs up / verifies before replacing (NOT uploaded to the live site - test on a copy first) and the Admin screen calls it through `services/siteSettingsApi.ts` (it used to report a fake success); GST reports, driver settlements (two new routes), credit note and tours endpoints aligned to the real backend. Details and the rules for next time: `ANTIGRAVITY_PROMPT_2_Round2_UIUX.md` section 1b. 237 backend tests pass; admin and driver apps type-check.

### Trip-code leak + multi-city billing fixes (Claude, 2026-10-07) - branch `deploy/merged-2026-10-06`, NOT yet deployed / OTA'd
- Start/end trip codes leaked to the person who must ask for them: the accepting fleet owner's lists (`crud/order_details.py`, two places) returned `assignment.start_trip_otp`; the Driver App showed it (`components/BookingDetailModal.tsx`). Now only posters (vendor / poster list / admin) and the customer get codes. The server also accepted a BLANK code (`order_assignments.py` start-trip / end-trip skipped the check when `otp` was empty): now `crud/trip_otp.py check_trip_otp` refuses blank or wrong codes; platform setting `trip_otp_enforced` (default 1) is the emergency switch.
- Customers now receive their codes: `CustomerBookingOut.start_trip_otp / end_trip_otp` (Customer App card), and `GET /api/website/bookings/{id}/trip-codes` for the website (PHP part is for Antigravity, see the prompt, item 10). The "driver assigned" e-mail keeps working.
- Multi-city waiting time: the driver enters MINUTES but the backend added them to the bill as RUPEES, unchecked, ignoring the waiting hours already included in the booking. `crud/end_records.py multicity_waiting_charge`: included hours free, capped at the trip length, rate from settings `multicity_waiting_rate_per_hour` (default 60 = same as the old Rs 1/min) and `multicity_waiting_free_minutes`; `orders.waiting_time` now holds the rupee charge, `orders.waiting_minutes` (new column) the minutes.
- Trip-end screen asks only for items explicitly `included === false`; the Admin All-Inclusive extra-km line is a booking note now, not a charge item (a charge item became an amount field at trip end).
- Closed-trip bill: the Admin App invoice for a COMPLETED trip was built from the QUOTE (planned 227 km, quoted fare) while the driver had closed at 315 km. Now `orders.closing_breakdown` (new JSON column, written at trip close by `build_closing_breakdown`, rebuilt for older trips by `closing_breakdown_for_order`) holds the exact lines (km billed vs driven vs minimum coverage, bata x days, permit, toll, waiting, night) plus the totals; `AdminOrderDetailResponse` returns it, the Admin order detail shows a "Final bill" card, `openInvoiceModalForOrder` fills the invoice from it, and `build_customer_bill` uses its lines (no more "Other charges / Adjustment" plug; all-inclusive shows one agreed amount).
- Invented values removed from Admin: WhatsApp / View-OTP fallbacks (booking number, fixed 9152) and fake odometer numbers (42,100 / 42,420).
- Setting `trip_otp_enforced` (owner-only, default 1) and the waiting-rate settings are in Settings.
- Design / website follow-ups are in `ANTIGRAVITY_PROMPT_2_Round2_UIUX.md`.
- 229 backend tests pass.

---

### Customer App is now OTA-ready (Claude, 2026-10-07) - branch `deploy/merged-2026-10-06`
Self-hosted OTA exactly like the Driver App: `app.json` has `runtimeVersion "1.0.0"` + `updates.url` -> `/api/app-updates/customer/manifest` (backend `KNOWN_APPS` now includes `customer`), `expo-updates ~0.28.18` in package.json/lock, `components/OtaUpdateGate.tsx` mounted in `app/_layout.tsx`, `scripts/publish-ota.js` (default app `customer`). The FIRST Customer APK ("build pannu") must be built from this tree; after that every JS-only change ships with `cd customer-app; OTA_MAX_WORKERS=1 node scripts/publish-ota.js --app customer --message "..."` (rollback: `--rollback <updateId>`). Native changes (new native package, permissions, app.json native fields, SDK upgrade) need a new APK and a bumped `runtimeVersion`.
The backend entry below went live with revision `drop-cars-api-00300` (= `53516a9`); the `customer` allowlist needs one more deploy.

### Customer App + backend (Claude, 2026-10-07) - live on revision 00300
Customer App changes ship with the first Customer APK.
- Customer App: sign-in is now required (`app/index.tsx` redirects to `/auth` without a saved session; `app/(customer)/_layout.tsx` guards every tab). Removed the made-up profile ("Karthik S.") and the fake starting wallet (Rs 450 + promo + referral code) in `contexts/WalletContext.tsx`.
- Customer App prices come from the backend now: new `POST /customer/bookings/quote-all` (one live price per vehicle from the rate card); `book/standard.tsx` uses it for vehicle cards and the summary and no longer adds invented toll / permit / 5% GST / Rs 15 fee / promo rows (the old local tariff is only an "Estimated" fallback, and for LOCAL packages). `utils/taxiPricing.ts` `fareFromServer`.
- Customer cancel + refund from the app: `POST /customer/bookings/{id}/cancel` and `/request-refund` (same rules as the website's OTP cancel, `api/routes/customer_bookings.py`), `refund_eligible` / `refund_status` on the booking; My Trips has Cancel booking / Request refund buttons and cancelled bookings move to "Past".
- Test fix: `tests/test_driver_route_requests.py` was flaky (DB clock vs process clock); 214 tests pass.
- Still open for Antigravity (website owner): admin-app endpoint for the website's site settings (advance %, pricing rules, surcharges, referral reward) - needs PHP that can be tested; Customer App coupon entry; customer forgot-password; Razorpay key from the backend instead of hardcoded in the app; LOCAL packages priced by the backend; remove the random sample pin in `book/dropbid.tsx`.

---

### Backend LIVE: Cloud Run revision `drop-cars-api-00299` = commit `8068f0b` (Claude, 2026-10-07) - branch `deploy/merged-2026-10-06`
Deployed through `scripts\deploy-backend.ps1` (run by the owner); live label `git-sha` verified equal to `8068f0b`.
OTAs published afterwards from this tree (2026-10-07): Admin App `preview` group `e5d7dfe8`, `production` group `a436c863` (settings screens, Trusted upgrade sheet, alarm/notification sounds, enquiry popup fix, 9 previously unreachable screens in Settings, update applies at app launch); Driver App self-hosted update `4e663bc0` (runtime 1.0.0). The Driver export must be run from `Drop-Cars-Full-Repo\driver-app` (its node_modules link resolves; a junction from the worktree does not).
- Staff add fixed: allowed staff permissions = built-ins (+enquiries/chats/tasks/support/accounts) + platform setting `staff_permission_keys`.
- Standard -> Trusted upgrade: `/admin/fleet-subscriptions/options`, `/{id}/payment-link`, `/{id}/payment-link/check` (Razorpay payment links; the sweep activates paid links once). Fees/channels/WhatsApp text/expiry are platform settings.
- Staff alarm for posted bookings nobody accepted (`/admin/urgent-unassigned-alarm-bookings`): rings 2 h before pickup, or at 50% of posting->pickup time if posted inside 4 h (settings `unaccepted_alarm_minutes_before`, `unaccepted_short_notice_hours`, `unaccepted_short_notice_percent`).
- Drivers get ONE "closing soon" push instead of up to 3 (setting `urgent_reminder_max_count`, default 1).
- Not included on purpose: Antigravity's `ensure_platform_smtp_settings` startup hook (hardcodes the Gmail app password and overwrites the DB value each start).
- Antigravity: before any deploy, `git pull` this branch and use `scripts\deploy-backend.ps1`; do not `gcloud run deploy` from `dropcars-review\backend`.

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
   - Default hourly tariffs aligned (Driver: ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¹250, Vendor Extra: ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¹50, Addon KM: ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¹25, Vendor Extra Addon KM: ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¹5).

2. **Booking Cards Direct Cancellation** (`(tabs)/orders.tsx`):
   - Added direct `[ Cancel ]` button on Live / Unassigned / Assigned / Running booking cards.
   - Connected to `CancelReasonModal` with wallet hold auto-refund.
   - Admin role authorization check relaxed to include all operational staff/admins.
   - Added `[ Delete ]` button on Cancelled/Expired cards for Owner.
   - Preserved floating round `+` FAB (`zIndex: 999, bottom: 24/32, right: 18`).

3. **Multi-Session Safety Rule**:
   - Strictly surgical line-by-line edits only. No file-level overwrites.
