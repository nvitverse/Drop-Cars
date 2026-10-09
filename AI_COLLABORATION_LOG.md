# AI Collaboration & Change Log

This file is read by **Claude (Session 1 & 2)** and **Antigravity** to know the latest changes made across parallel sessions.

---

### Keyboard lift rewrite, sheets above the nav bar, chat Trash (Claude, 2026-10-09)
- First fix (KeyboardAvoidingView padding) left a gap under the Command Centre sheet after the keyboard closed and the sheet's input hidden behind the navigation bar (statusBarTranslucent modals draw under it). components/KeyboardSafe.tsx is now our own: reads the keyboard's real height from the screen coordinates, lifts by exactly that, back to 0 on hide, ignores itself if the system already resized the window, and lifts ONCE (LiftedContext: root / Modal lift, inner KeyboardAvoidingViews are passive). Every KeyboardAvoidingView (4 apps) and every Modal (Admin + Driver) imports it. useNavInsetWhenClosed pads bottom sheets that sit under the nav bar (Command Centre, Cancel reason, MotionBottomSheet).
- **Chat Trash:** models/chat_trash.py, crud/chat_trash.py, endpoints POST/GET /api/support/admin/trash, DELETE /api/support/admin/trash/{type}/{key}. Finished (COMPLETED) booking chats are Trash from the completion day; staff tap 'Solved - Trash' in a chat; a new message from the driver / owner pulls a support thread back out; messages stay chat_trash_days (30) days then the daily clean-up deletes them for good (the rolling 10-day purge skips Trash). Admin Chats > All > Trash is categorised like the rest (booking chats by topic, solved problems by topic) with 'CLEARS IN Nd' on each row. 	ests/test_chat_trash.py.

### Admin App: visible update gate (Claude, 2026-10-09)
- Owner never saw the Admin updates (keyboard fix etc.) arrive. Server side checked: channel preview -> branch preview, runtime 1.0.0, the manifest endpoint serves the newest update; the 09-29 local APK and the 10-04 EAS build both match (runtime 1.0.0, channel preview). The 09-25 / 09-27 local APKs are version 1.1.0 with NO channel header, so they can never receive an update. The new bundle was exported for web and renders the login screen with no JS error (no launch crash).
- components/UpdateGate.tsx (mounted in pp/_layout.tsx, replaces the silent pplyLatestUpdateOnLaunch): checks at launch and when the app comes to the front (3-minute throttle), shows a full-screen 'Updating Drop Cars Admin' box, downloads and restarts by itself; a failed download shows the reason + Try again; if the phone skipped a crashing update at start-up it says so with the reason.

### Keyboard never covers the typing box; chat suggestions; chat categories; trip-close + posting charges (Claude, 2026-10-09)
- **Keyboard (Admin + Driver apps, every screen):** on Android the app draws edge to edge so the keyboard no longer shrank the screen - chat reply box and form fields were hidden behind it. components/KeyboardSafe.tsx (KeyboardSafeView, drop-in Modal): KeyboardAvoidingView in padding mode (measures the overlap, so it does nothing when the system already resized). Root layouts wrap the Stack; 75 files' Modal now imports the keyboard-safe one; every existing ehavior={Platform.OS === 'ios' ? 'padding' : undefined|'height'} (all 4 apps) is now padding; tab bars hide while typing. Customer + Vendor apps got only the KeyboardAvoidingView fix (needs a build).
- **Chat suggestions (Admin Chats):** components/ReplySuggestions.tsx: fixed-height row (the old horizontal ScrollView collapsed and drew over the input), the replies that fit the last message come first, 'All N' opens full cards with the whole text; 15 templates in groups (documents, payment, trip, app...). Helper chat chip row fixed the same way.
- **Chats categorised (Admin):** Needs-a-reply pinned; then main category (fleet owners / drivers / vendors / customers; live / completed trip chats) > topic (login & OTP, documents, wallet & payments, subscription, trips, app problems...) > chats, each with a stacked bar and per-topic bar + unread counts (components/ChatCategories.tsx, topics from the latest message in utils/chatTopics.ts).
- **Trip close (Driver 	rip/end.tsx):** 'This booking at a glance' (km driven, what is included with amounts, what is excluded / collected on the spot, toll rule, multi-city note), included lines show amounts, excluded section shows a running total. **Toll update at close** lives in: Admin Create Booking (now a switch under Toll when ticked, with a live explanation), Vendor create-order, Driver posting (automatic when toll is not ticked), Driver trip end (the field).
- **Driver posting (create-booking.tsx):** charge items follow the one rule (ticked+amount = included with amount, ticked+0 = nothing, unticked = excluded); all-inclusive list has amount boxes and plain status lines; standard tariff sends real permit / hill / night / toll items instead of four default 'excluded' rows.

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
   - Default hourly tariffs aligned (Driver: ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹250, Vendor Extra: ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹50, Addon KM: ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹25, Vendor Extra Addon KM: ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹5).

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

<!-- Antigravity round 4 entries (appended by Claude 2026-10-10; AG's log copy was based on an old file, so only its new entries were taken) -->
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
   - Default hourly tariffs aligned (Driver: ₹250, Vendor Extra: ₹50, Addon KM: ₹25, Vendor Extra Addon KM: ₹5).
