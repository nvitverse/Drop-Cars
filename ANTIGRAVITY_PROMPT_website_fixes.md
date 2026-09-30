# Prompt for Antigravity: Drop Cars website fixes (booking ID, icons, customer email/WhatsApp completeness)

Copy everything below the line into Antigravity. Work on the `website/` folder only.

---

## ROLE
You are a senior PHP/JavaScript engineer working on the production Drop Cars website (PHP 8, MySQL on Hostinger shared hosting, vanilla JS/CSS, PHPMailer, Telegram alerts). Read the code before changing it. Make small, reviewable changes. Do not refactor unrelated code.

## SETUP
```
git checkout main && git pull
git checkout -b fix/website-booking-id-and-notifications
```
The website lives in `website/`. Do NOT touch `backend/`, `admin-panel/`, `customer-app/`, `driver-app/`.

## HARD CONSTRAINTS (read first)
1. **Do not change fare math.** `website/engine/tariff.php`, `website/data/tariffs.json`, `website/data/pricing.json`, `website/api/route-distance.php`, `website/api/fare-breakdown-format.php` are protected (see `CHANGELOG_AND_FEATURE_REGISTRY.md`, "Crown Jewel"). You may only *read* values from them. After your changes run `php scripts/pre-deploy-test.php` (or `test-predeploy.ps1`) and paste the result.
2. **No breaking changes** to JSON responses of `website/api/*.php`, to the booking ID format consumed by the FastAPI bridge (`website/api/includes/backend-client.php`, `website/api/booking-persist.php`), or to existing rows in the database. Old IDs (`E…`, `C…`, `DE…`, `DC…`, `DC-123`) must still work everywhere.
3. **No secrets in the repo.** Do not read, print or commit `website/api/config.php`, `.env`, or `admin/config/database.local.php`.
4. Every PHP file you edit must pass `php -l`, have **no BOM**, and keep the existing coding style (`if (!function_exists(...))` guards, `dropcars_*` prefix).
5. Do not delete or rewrite `router.php` or any `.htaccess`.
6. Hostinger is shared hosting: keep any new logic cheap (no long loops, no heavy queries, respect PHP time limits).

---

## TASK 1: Fix booking IDs (highest priority)

### 1.1 Required behaviour (confirmed with the owner)
One **shared daily counter** across enquiries and bookings. Format: `PREFIX + YYMMDD + NN` (NN zero-padded to at least 2 digits; grows to 3 digits after 99, never wraps).

- Enquiries get `E`. Example: `E26093001`, `E26093002`, `E26093003`
- When an enquiry is **confirmed**, the *same number* is kept and only the prefix changes: the 2nd one becomes `C26093002`.
- The next new enquiry continues the counter: `E26093004`, `E26093005`, `E26093006`. If the 6th is confirmed it becomes `C26093006`.
- A booking created directly (no enquiry) takes the next number with prefix `C`.
- Date part must be computed in **Asia/Kolkata** (IST), not the server default timezone (Hostinger's default may be UTC). Verify what `date_default_timezone_set` is doing today and make the ID date IST explicitly.

### 1.2 The bug (root cause found in review; verify it yourself)
Every new booking currently shows `YYMMDD01` regardless of how many exist that day.

- `website/assets/js/booking-form.js`, `getDateCodeYYMMDD()` and `generateBookingId(prefix)` (approx. lines 971-995): the counter is stored in the **customer's own browser**:
  `localStorage["dropcars_booking_counter_" + kind + "_" + dateCode]`. Every new visitor starts at 0, so the ID is always `…01`. If `localStorage` fails, it falls back to `(Date.now()/1000 % 98) + 1` (random).
  It is used around line 3221: `confirmedBookingId = ... generateBookingId("C")` and then flows into the admin WhatsApp URL, the thank-you URL (`thankYouPath`, approx. line 3437) and the request to `confirm_booking.php`.
- `website/api/confirm_booking.php` (approx. lines 103-145) **trusts the browser-supplied `bookingId`** if it matches `^C\d{8,}$` and does not already exist in `bookings`. So the fake browser ID is accepted.
- `website/api/airporttaxi-confirm-booking.php` (approx. lines 121-140) builds `'C' . date('ymd') . str_pad(random_int(1, 99), 2, '0')`, which can **collide** and ignores the shared counter.
- `website/api/receive-remote-lead.php` (approx. lines 72 and 145) uses a different format (`'B'/'E' . date('YmdHis') . rand(...)`).
- The correct server-side generator already exists: `dropcars_next_enquiry_booking_id($pdo, 'E'|'C')` in `website/admin/includes/enquiries-schema.php` (approx. line 533), with `dropcars_max_daily_booking_sequence()` (approx. line 503). It combines DB max + an atomic file counter (`api/storage/seq_YYMMDD.txt`) + a uniqueness re-check. Callers that already use it correctly: `send-enquiry.php` (lines ~146 and ~1017), `admin/includes/functions.php` (~49), `admin/pages/dashboard.php` (~249), `api/partner-request.php` (~172), `api/confirm_booking.php` (only when the client ID is invalid).

### 1.3 What to change
1. **`booking-form.js`:** remove the `localStorage` counter as an ID authority. The browser must never mint a real booking ID. Use the ID returned by the server (`send-enquiry.php` already returns/creates the E-ID; make sure the JS reads and keeps it). If the UI needs something to show before the server answers, show a neutral placeholder such as "Pending", and never send that to the server.
2. **`confirm_booking.php`:** derive the C-ID **on the server**: if an existing enquiry `E<YYMMDD><NN>` (or legacy `DE`/`DC`) is referenced, look it up in `enquiries`, and convert `E → C` keeping digits (the current code already does this string swap, keep that behaviour). Only if there is no valid enquiry ID, call `dropcars_next_enquiry_booking_id($pdo, 'C')`. Do not accept an arbitrary client-supplied `C…` ID that does not correspond to a known enquiry.
3. **`airporttaxi-confirm-booking.php`:** replace `random_int` with `dropcars_next_enquiry_booking_id($pdo, 'C')` (require `enquiries-schema.php` as other endpoints do).
4. **`receive-remote-lead.php`:** use the same generator (`E`/`C`), same format.
5. **`dropcars_next_enquiry_booking_id`:** make it IST-safe, keep the file counter atomic, and make the DB fall back robust when `$pdo` is null (currently, if both the DB and the counter file are unavailable, it returns `…01`). In that case use the file counter only, and if that also fails, use a time-based unique suffix instead of `01`. Add a code comment explaining the fallback order.
6. **Uniqueness at DB level:** check `website/admin/sql/schema.sql`, `website/config/schema.sql`, `hostinger-schema.sql` for a UNIQUE index on `enquiries.booking_id` and `bookings.booking_id`. If missing, add an idempotent migration file in `website/admin/sql/` (do not run destructive statements; handle existing duplicates by reporting them, not deleting).
7. Search the whole `website/` folder (excluding `api/phpmailer`, `api/PHPMailer-master`) for any other place that creates an ID (`ymd`, `YYMMDD`, `padStart(2`, `str_pad(`, `'DC-'`, `rand(`) and list them in your report, even if you leave them unchanged.

### 1.4 Acceptance tests (write them, run them, paste output)
- A PHP CLI script `website/scripts/test-booking-id.php` that (a) calls the generator 20 times and asserts strictly increasing, gap-free numbers for the day; (b) simulates 10 parallel processes (e.g., `proc_open`) and asserts no duplicates; (c) asserts E→C conversion keeps the number (`E26093002` → `C26093002`); (d) asserts the date part uses IST by mocking a UTC late-evening time.
- Manual test notes for: normal enquiry → confirm; direct booking; airport booking; remote lead.
- Confirm old rows and old-format IDs still load in `admin/pages/enquiries.php`, `bookings.php`, `track-booking.php`, `thank-you.php`.

---

## TASK 2: Icons next to booking IDs

**Requirement (owner):** wherever a booking ID is shown, an **enquiry** (`E…`) shows an enquiry icon and a **confirmed booking** (`C…`) shows a **green tick** icon. It used to be like this and was lost.

1. Find every place an ID is rendered: admin (`admin/pages/enquiries.php`, `bookings.php`, `bookings-new.php`, `dashboard.php`, `upcoming.php`, `booking-details.php`, `customer-history.php`, `website-booking-approvals.php`, `refund-requests.php`), customer pages (`pages/thank-you.php`, `pages/track-booking.php`, `pages/customer-dashboard.php`), emails (`api/send-enquiry.php`, `api/confirm_booking.php`, `includes/notification-engine.php`), Telegram messages (`api/telegram-notify.php`, `helpers/telegram.php`), invoices and estimates (`admin/pages/booking-invoice.php`, `print-estimation.php`, `pages/invoice-gst.php`).
2. Create **one shared helper** (e.g., `dropcars_booking_id_badge(string $id, string $context = 'html'|'text')`) so the rule lives in one place:
   - `html` context (admin/web pages): Font Awesome is already used in admin (`fa-solid`). Enquiry: an appropriate icon (e.g., `fa-clipboard-question` or `fa-envelope`), neutral/blue. Confirmed: `fa-circle-check`, green (`#16a34a`). Add an accessible label (`title`/`aria-label`: "Enquiry" / "Confirmed").
   - `text` context (email subject/body and Telegram, where icon fonts do not work): enquiry `📩`, confirmed `✅`.
   - Decide type from the prefix (`E`/`DE` = enquiry, `C`/`DC` = confirmed); unknown formats show no icon (no error).
3. Emails: HTML emails must not depend on Font Awesome; use inline emoji or an inline SVG/img with fallback text.
4. Do not change the stored ID; the icon is display-only.

---

## TASK 3: "Send Customer" email / message is missing the KM limit

**Problem (owner):** when staff click the **share to customer** button (admin: `admin/pages/customize-booking.php` has the buttons "Confirmed", "Send Customer", "Advance", "Quote", "Group Post", "Updates", "Driver"; and the emails built in `api/send-enquiry.php` / `api/confirm_booking.php` / `includes/notification-engine.php`), the text/email sent to the customer does **not mention the km limit**.

Required content (values must come from the **same data the fare uses**, never hard-coded):
- One-way: minimum billable km (currently 130 km per the registry, but read it from settings/tariff data), extra km rate.
- Round trip / multi-city: included km **per day** (250 km/day per the registry), extra km rate, number of days.
- Local/hourly package: included hours and km, extra hour rate, extra km rate.
- Airport transfer: fixed fare note and waiting policy.
- Also state clearly what is included / excluded: driver bata (day/night), toll, state permit, parking, waiting charges, night charges (only if present in the data).

Steps:
1. Locate every customer-facing template that shows the fare. Start by grepping `Send Customer`, `Quote`, `fare-breakdown`, `driver_beta`, `bata`, `permit`, `toll` under `website/` (excluding vendor folders).
2. Write **one shared function** (e.g., `dropcars_km_policy_lines(array $booking): array` or similar) that returns the km-policy lines from tariff/settings data; reuse `api/fare-breakdown-format.php` helpers where they exist, *read-only*.
3. Add those lines to: the admin "Send Customer" message (WhatsApp/text), the confirmation email (customer copy), the quote message, `pages/thank-you.php`, `admin/pages/print-estimation.php`, and the Telegram admin alert if it shows fare.
4. Keep existing wording; only add the new section. Support English and (if the templates already have Tamil variants) Tamil.

---

## TASK 4: Audit for other missing information and fix what is safe

Build a table (put it in your report) of **customer-facing outputs vs fields**:

Outputs: confirmation email, quote message, advance-payment message, driver-assigned message, trip-update message, thank-you page, track-booking page, GST invoice, print estimation, Telegram admin alert.

Fields: booking ID (with icon), customer name, pickup, drop, date and time, trip type, vehicle type, **km limit and extra km rate**, fare total and breakdown, advance paid and balance, payment method/UPI info, driver name/phone/vehicle number (after assign), tracking link, cancellation & refund policy link, support/WhatsApp number, GST/company details on invoices.

Mark each cell present/missing. **Fix missing fields where the data already exists and the change is low-risk**; list the rest as follow-ups with file and line references. Do not invent data.

---

## OUT OF SCOPE (report only, do not change)
Note in your report, but do not touch, these issues found in the review:
- `website/api/test_diag_live.php`, `check_insert_error.php`, `diag_booking_id.php` are unauthenticated diagnostic endpoints (one inserts a row into `enquiries` on each request). Recommend deleting or protecting them. (The owner will decide.)
- `website/api/storage/bookings-log.jsonl` and `partner-requests.jsonl` are committed to git.
- `send_email_otp.php` rate limiting is stored in `$_SESSION` (bypassable by dropping cookies).

---

## DELIVERABLES
1. **First reply with a short plan** (files to change, risks) and wait for confirmation before editing.
2. One commit per task (Task 1, 2, 3, 4), with clear messages.
3. Updated `CHANGELOG_AND_FEATURE_REGISTRY.md` (new section for these changes).
4. A **Hostinger deploy list**: exact files to upload, any SQL to run (with rollback), and how to verify on production (steps and expected IDs).
5. A rollback note: how to revert each change.
6. Output of `php -l` for every changed PHP file, and of `scripts/pre-deploy-test.php`.

## DEFINITION OF DONE
- New enquiries on one day produce `E…01`, `E…02`, `E…03`, and so on in order, from any browser, including fresh visitors and private mode.
- Confirming the Nth enquiry produces `C` + the same number.
- No two bookings ever share an ID (tested with parallel requests).
- Enquiry and confirmed IDs show the right icon in admin, emails and Telegram.
- Customer messages and emails include the km limit and extra km rate from real tariff data.
- No protected fare code changed; pre-deploy tests pass.
