# AI Collaboration & Change Log

This file is read by **Claude (Session 1 & 2)** and **Antigravity** to know the latest changes made across parallel sessions.

---

### Merged Antigravity `feat/missing-screens` (Claude, 2026-10-08) - commit `157180b`, NOT yet deployed / OTA'd
Merged with corrections: extra-km billing now pays the driver and updates the split (`all_inclusive_extra_km` + tests); the all-inclusive bill no longer double-counts the markup; the website settings PHP uses the real `api/config.php` keys and backs up / verifies before replacing (NOT uploaded to the live site - test on a copy first) and the Admin screen calls it through `services/siteSettingsApi.ts` (it used to report a fake success); GST reports, driver settlements (two new routes), credit note and tours endpoints aligned to the real backend. Details and the rules for next time: `ANTIGRAVITY_PROMPT_2_Round2_UIUX.md` section 1b. 237 backend tests pass; admin and driver apps type-check.

### Merged Antigravity `feat/missing-screens` (Claude, 2026-10-08) - commit `157180b`, NOT yet deployed / OTA'd
Merged with corrections: extra-km billing now pays the driver and updates the split (`all_inclusive_extra_km` + tests); all-inclusive bill no longer double-counts the markup; website settings PHP uses the real `api/config.php` keys and backs up / verifies before replacing (NOT uploaded to the live site - test on a copy first) and the Admin screen calls it through `services/siteSettingsApi.ts` (it used to report a fake success); GST reports, driver settlements (two new routes), credit note and tours endpoints aligned to the real backend. Details and the rules for next time are in `ANTIGRAVITY_PROMPT_2_Round2_UIUX.md` section 1b. 237 backend tests pass; admin and driver apps type-check.

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
   - Default hourly tariffs aligned (Driver: ₹250, Vendor Extra: ₹50, Addon KM: ₹25, Vendor Extra Addon KM: ₹5).

2. **Booking Cards Direct Cancellation** (`(tabs)/orders.tsx`):
   - Added direct `[ Cancel ]` button on Live / Unassigned / Assigned / Running booking cards.
   - Connected to `CancelReasonModal` with wallet hold auto-refund.
   - Admin role authorization check relaxed to include all operational staff/admins.
   - Added `[ Delete ]` button on Cancelled/Expired cards for Owner.
   - Preserved floating round `+` FAB (`zIndex: 999, bottom: 24/32, right: 18`).

3. **Multi-Session Safety Rule**:
   - Strictly surgical line-by-line edits only. No file-level overwrites.
