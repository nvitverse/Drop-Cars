# 📋 Drop Cars Platform - Master Feature Registry, System Architecture & Change Log

> **Permanent Single Source of Truth for Drop Cars Website Platform & Airport Taxi Sub-Brand**  
> **File Location**: `c:\Users\Administrator\Desktop\Drop Cars - Website\CHANGELOG_AND_FEATURE_REGISTRY.md`  
> **Last Updated**: 2026-08-03  
> **Status**: Active / Production Ready  

---

## 🏛️ SECTION 1: MASTER FEATURE REGISTRY

### Tier 1: Core Engines & Fare Calculation Architecture
1. **Tariff & Pricing Engine (`engine/tariff.php`, `data/tariffs.json`, `data/pricing.json`)**:
   - **One-Way Drop Taxi Pricing**: Per-kilometer pricing calculation with minimum distance enforcement (130 km minimum threshold per one-way booking). Includes Driver Bata calculation (₹400/day day bata, ₹200 night bata).
   - **Outstation Round-Trip Pricing**: Per-kilometer round-trip billing based on total round-trip distance (minimum 250 km/day calculation multiplier), driver daily allowance, and state-border RTO permit fees.
   - **Local Hourly Packages (`data/tariffs.json`)**: Fixed hourly and distance packages (e.g., 4 Hours / 40 km, 8 Hours / 80 km, 12 Hours / 120 km) with configured per-extra-km and per-extra-hour rates.
   - **Multi-City Route Calculator**: Computes routing and fare estimates across multiple intermediate stops and waypoints.
   - **State Border RTO Permit & Toll Handling (`api/fetch-live-toll.php`, `data/routes.json`)**: Dynamic calculation and breakdown of state border entry permit taxes (Tamil Nadu ↔ Karnataka, Kerala, Andhra Pradesh, Puducherry) and Fastag toll estimations.

2. **Routing & Dynamic SEO URL Engine (`router.php`, `core/route-engine.php`, `engine/route.php`, `engine/city.php`)**:
   - **Dynamic Route Landing Pages**: Serves thousands of route-specific pages (e.g., `/chennai-to-bangalore-taxi`, `/madurai-to-chennai-cab`) on demand without requiring physical static files. Dynamically injects route distance, optimized meta tags, title tags, fare matrices, distance breakdowns, and localized FAQ content.
   - **Dynamic City Landing Pages**: Serves localized city hubs (e.g., `/taxi-service-in-chennai`, `/taxi-service-in-coimbatore`) with city-specific content blocks, popular routes, local tourist landmarks, and available fleet options.
   - **Slug Canonicalization & 301 Redirects (`engine/route-redirect.php`)**: Automatic canonicalization of legacy URLs, trailing slash normalization, and 301 redirects to maintain search engine authority.

3. **Booking Engine & Processing Pipeline (`api/send-enquiry.php`, `api/confirm_booking.php`, `api/booking-persist.php`)**:
   - **Instant Quote & Vehicle Selection**: Real-time fare lookup for Dzire/Etios (Sedan), Ertiga/Xylo (SUV), Innova Crysta (Premium SUV), and Tempo Traveller.
   - **Booking Creation & Persistence**: Validates customer details (Name, Mobile, Pickup Address, Drop Address, Pickup Date & Time), generates a unique Booking ID (e.g., `DC-XXXXX`), and commits records to database or fallback storage.
   - **Coupon & Discount Engine (`api/apply_coupon.php`, `api/validate-coupon.php`)**: Real-time coupon code validation against `coupons` database table / `data/config.json` with percentage-based or flat rupee discounts.
   - **Advance Payment & Tracking (`api/record-advance.php`, `pages/track-booking.php`, `api/check-payment-status.php`)**: Enables customers to track booking status, view driver details, download receipt invoices, and log advance payment records.

---

### Tier 2: Sub-Brands & Specialized Frontends
1. **Drop Cars Main Website Frontend (`index.php`, `pages/`)**:
   - Primary user interface for One-Way Drop Taxi, Outstation Cabs, Local Hourly Rentals, and Multi-City travel.
   - Dynamic tabbed booking widget with seamless tab switching between One-Way, Round Trip, Hourly Package, and Airport Transfer modes.
   - Responsive UI design featuring Highway Signboard visually styled fare callouts, compact booking cards, customer reviews carousel, fleet showcase, and dynamic fare tables.

2. **Airport Taxi Sub-Brand (`pages/airport-transfer.php`, `dev-server-airporttaxi.ps1`, `router-airporttaxi.php`, `engine/airporttaxi-fare.php`, `engine/airporttaxi-home.php`, `data/airports.json`, `data/airporttaxi-tariffs.json`)**:
   - Dedicated Airport Transfer engine tailored for fixed-rate airport pickups and drops across major airports (Chennai MAA, Bangalore BLR, Coimbatore CJB, Madurai IXM, Trichy TRZ, Salem SXV, Tuticorin TCR).
   - Dedicated local development launcher (`dev-server-airporttaxi.ps1`) and standalone sub-brand router (`router-airporttaxi.php`).
   - Subdomain display name override (`subdomainConfig['airporttaxi'] => 'AirportTaxi.International'`) in `api/config.php` for customized outbound customer emails while maintaining a shared core mailer infrastructure.

3. **Customer Portal & Auth System (`pages/customer-login.php`, `pages/customer-dashboard.php`, `api/customer_auth.php`, `api/send_email_otp.php`, `api/verify_email_otp.php`)**:
   - Email / Mobile OTP verification flow for customer authentication.
   - Personal dashboard displaying upcoming trips, completed booking history, downloadable PDF invoices, live driver tracking links, and profile management.
   - Rating & Review submission portal (`pages/review-login.php`, `api/reviews.php`).

---

### Tier 3: Location & Cost Optimization Engine
1. **Local Fuzzy Search & Offline Location Database (`data/cities.json`, `engine/cities.php`)**:
   - **Zero-API-Cost City Search**: Pre-built database of over 1,000+ South Indian cities, towns, and transit hubs (Tamil Nadu, Karnataka, Kerala, Andhra Pradesh, Puducherry, Telangana) stored locally in `data/cities.json`.
   - **Client-Side Fuzzy Matching**: Instant matching on keystroke in location dropdown pickers without triggering external web requests.

2. **Lazy Geocoding & Local Caching Architecture (`api/geocode.php`, `data/geocode_cache.json`, `data/distance_cache.json`)**:
   - **2-Tier Geocoding Strategy**: Checks local cache (`data/geocode_cache.json`) and exact city databases first. Only queries Google Maps Geocoding API (`GOOGLE_MAPS_API_KEY`) when a location is missing from local storage.
   - **Distance Matrix Caching (`data/distance_cache.json`, `api/route-distance.php`)**: Stores calculated origin-to-destination distance (km) and driving duration (mins) to eliminate repeated Google Distance Matrix API calls.
   - **Local Location Fallback Toggle**: Controlled via `enableLocalLocationFallback` in `api/config.php` to ensure uninterrupted booking functionality if external API keys expire or encounter quota errors.

---

### Tier 4: Admin Control Panel & Security Infrastructure
1. **Admin Control Panel (`/admin/`, `admin/index.php`, `admin/dashboard.php`)**:
   - **Dashboard Analytics & Booking Management (`admin/bookings.php`, `admin/booking-details.php`, `admin/customize-booking.php`)**: Full lifecycle management of bookings (Pending, Confirmed, Driver Assigned, Completed, Cancelled).
   - **Driver Assignment & Tracking (`admin/actions/assign-driver.php`, `pages/driver-live-location.php`, `api/update-driver-location.php`, `api/get-driver-location.php`)**: Assigns driver name, vehicle number, driver contact, and generates a live tracking link dispatched to customers via SMS, Telegram, and Email.
   - **Settings & Tariff Management (`admin/settings.php`, `admin/tariffs.php`, `admin/coupons.php`, `admin/reviews.php`)**: Real-time management of site configurations, driver bata rates, per-km pricing, promotional banners, discount coupons, and review approvals.
   - **Role-Based Security (`config/security.php`, `config/session.php`, `admin/includes/auth.php`)**: BCRYPT password hashing, session expiration handling, CSRF token validation, and IP blocking (`admin/blocked-ips.php`, `includes/check-blocked-main.php`).

2. **Security & Anti-Scrape Protection (`core/anti-scrape.php`, `core/rate-limiter.php`, `includes/frontend-protection.php`)**:
   - **Rate Limiting Engine (`core/rate-limiter.php`)**: Protects public APIs (`/api/send-enquiry.php`, `/api/geocode.php`) against automated brute-force or spam submissions.
   - **Anti-Scraping Shield (`core/anti-scrape.php`)**: Filters out unauthorized web bots, headless scrapers, and malicious user agents.
   - **Maintenance Mode Switch (`includes/check-maintenance.php`, `maintenance.html`)**: Rapid site-wide maintenance toggle via database settings or `api/config.php` (`maintenanceMode => true/false`).

---

### Tier 5: Notifications & External Integration API Engine
1. **Multi-Channel Notification Engine (`includes/notification-engine.php`, `helpers/telegram.php`, `api/telegram-notify.php`, `api/config.php`)**:
   - **Telegram Admin Alerts (`telegramBotToken`, `telegramChatIds`)**: Immediate alert dispatch to Telegram admin channel upon new booking enquiries, confirmations, or status updates.
   - **PHPMailer SMTP Email Dispatch (`api/phpmailer/`, `helpers/error-handler.php`)**: Formatted HTML transactional emails for customer booking confirmations, driver assignment notices, and invoices. Supports Gmail App Passwords and custom SMTP hostings with automatic fallbacks.
   - **WhatsApp & SMS Gateway Support**: Built-in feature switches (`notify_customer_sms_*`, `notify_customer_whatsapp_*`) ready for external SMS/WhatsApp API integration.
   - **Google Sheets Webhook Sync (`includes/google-sheet-sync.php`)**: Automated lead synchronization pushing new bookings directly into Google Sheets.
   - **FastAPI Cloud Run Backend Bridge (`api/config.php` - `dropcarsApiBaseUrl`)**: Connects to the Cloud Run backend (`https://drop-cars-api-207918408785.asia-south2.run.app`) to sync confirmed bookings with driver/vendor app marketplaces.

---

## 👑 SECTION 2: CROWN JEWEL / MUST-HAVE SYSTEM HIGHLIGHTS
*These components are the primary technological assets of the Drop Cars platform. They must **NEVER** be altered, deleted, or bypassed without explicit verification.*

| Crown Jewel System | Key Files | Critical Functionality & Protection Guidelines |
| :--- | :--- | :--- |
| **1. Dynamic SEO Routing Engine** | `router.php`, `core/route-engine.php`, `engine/route.php`, `engine/city.php` | Generates thousands of SEO landing pages (`/chennai-to-bangalore-taxi`) and city pages (`/taxi-service-in-chennai`) dynamically without disk bloat. **NEVER delete `router.php` or break `.htaccess` rewrite rules.** |
| **2. Zero-Cost Location & Offline Cache Engine** | `data/cities.json`, `data/distance_cache.json`, `data/geocode_cache.json`, `api/geocode.php` | Provides instant local city lookup and caches Google Maps API calls to reduce cloud API expenses. **NEVER overwrite or wipe cache JSON files without backing up.** |
| **3. Core Tariff & Fare Calculator Engine** | `engine/tariff.php`, `data/tariffs.json`, `api/route-distance.php`, `api/fare-breakdown-format.php` | Computes accurate fares with minimum km rules, round-trip return distance calculations, driver bata, night bata, state permit fees, and tax breakdowns. **NEVER modify fare math without running `test-predeploy.ps1`.** |
| **4. Multi-Channel Notification Engine** | `includes/notification-engine.php`, `helpers/telegram.php`, `api/config.php` | Dispatches instant booking notifications to Telegram admin channel and sends customer HTML emails via PHPMailer SMTP. **NEVER remove Telegram/SMTP fallback loops.** |
| **5. Pre-Deployment Automated Audit Suite** | `scripts/pre-deploy-test.php`, `test-predeploy.ps1`, `PRE_DEPLOYMENT_TESTING.md` | Runs 9 automated checks (PHP syntax, BOM detection, DB health, API keys, page loading, pricing dry-run) before packaging code for production. **ALWAYS run before uploading updates.** |
| **6. Shared Airport Taxi Sub-Brand Engine** | `pages/airport-transfer.php`, `engine/airporttaxi-fare.php`, `router-airporttaxi.php`, `dev-server-airporttaxi.ps1` | Provides dedicated airport transfer frontend while reusing backend booking, tariff, and notification modules with custom branding (`AirportTaxi.International`). |

---

## 🔄 SECTION 3: STEP-BY-STEP REVERT & ROLLBACK PROCEDURES

### 1. Web Page & Routing Subsystem Rollback
If a newly deployed routing rule or page update breaks landing pages or produces 404 / 500 errors:
1. **Immediate `.htaccess` / `router.php` Revert**:
   - Restore `router.php` and `.htaccess` from the latest backup or git commit.
   - Verify PHP syntax with zero errors:
     ```powershell
     php -l router.php
     ```
2. **Clear Cache Files**:
   - Verify `data/routes_cache.json` is valid JSON (reset content to `{}` if corrupted).
3. **Execute Routing Verification via Automated Suite**:
   ```powershell
   php scripts/pre-deploy-test.php
   ```
4. **Deploy Revert to Hostinger**:
   - Upload verified `router.php` and `.htaccess` to Hostinger `public_html/`.

---

### 2. Location & Geocoding Cache Engine Rollback
If Google Maps API returns errors or location search breaks:
1. **Enable Offline Fallback Mode**:
   - Open `api/config.php` and set:
     ```php
     'enableLocalLocationFallback' => true,
     ```
2. **Restore Offline Cities JSON**:
   - Ensure `data/cities.json` is intact (~36KB). If corrupted, restore from `backup-code/` or git history.
3. **Reset Geocode & Distance Cache**:
   - If `data/distance_cache.json` or `data/geocode_cache.json` contains malformed JSON, reset file contents to `{}`.
4. **Test Geocoding API Endpoint**:
   - Access `/api/geocode.php?query=Chennai` in browser to confirm valid JSON output.

---

### 3. Tariff & Fare Calculator Engine Rollback
If fare calculations output incorrect numbers, missing driver bata, or zero distance:
1. **Restore Core Tariff Files**:
   - Revert `engine/tariff.php`, `data/tariffs.json`, and `data/pricing.json`.
2. **Execute Pricing Dry-Run Audit**:
   - Run the automated pre-deployment test launcher:
     ```powershell
     .\test-predeploy.ps1
     ```
   - Test Suite 7 ("Live Fare Calculation Simulation") will verify distance, base fare, per-km rate, and total calculation math.
3. **Database Tariff Sync (If DB-Driven)**:
   - Check the `tariffs` table in MySQL database. If custom rates were corrupted, execute `config/complete-production-database.sql` to restore default tariff records.

---

### 4. Admin Panel & Database Schema Rollback
If admin login fails or database queries throw SQL errors:
1. **Check Database Connection Credentials**:
   - Verify `config/db.local.php` (local environment) or production credentials in `config/db.php`.
2. **Restore Database Schema**:
   - Import `config/complete-production-database.sql` or `config/hostinger-schema.sql` via phpMyAdmin or MySQL CLI.
3. **Re-seed Admin Credentials**:
   - Run `config/seed-local-admin.sql` or reset admin password in `admins` table using `BCRYPT` hash.
4. **Clear Session Cookies**:
   - Clear browser cookies for `/admin/` to remove stale session tokens.

---

### 5. Notification Systems (Telegram & Email) Rollback
If booking notifications stop working or emails bounce:
1. **Telegram Rollback & Diagnostic**:
   - Verify `telegramBotToken` and `telegramChatIds` in `api/config.php`.
   - Test Telegram API endpoint manually:
     ```powershell
     curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getMe"
     ```
2. **PHPMailer / SMTP Credentials Audit**:
   - Check `api/config.php` for `smtpUsername` and `gmailAppPassword`.
   - Run `api/test-smtp.php` directly to test email dispatch and read SMTP handshake log.
   - If Gmail App Password was revoked, generate a new key and update `api/config.php`.
3. **Disable Non-Essential Channels**:
   - Temporarily set `'enableEmailNotifications_Customer' => false` or `'enableTelegramNotifications_Admin' => false` in `api/config.php` if an external service is timing out and blocking booking submissions.

---

### 6. Sub-Brand Airport Taxi Rollback
If Airport Transfer pages or packages break:
1. **Verify Standalone Airport Server**:
   - Run `dev-server-airporttaxi.ps1` to test the sub-brand locally on port 8080.
2. **Check Tariff & Airport JSON**:
   - Ensure `data/airports.json` and `data/airporttaxi-tariffs.json` are valid JSON.
3. **Subdomain Email Config Revert**:
   - Ensure `subdomainConfig` in `api/config.php` is properly configured.

---

## 📜 SECTION 4: CHRONOLOGICAL CHANGE LOG

### [2026-08-04] - Non-Booking-Form Pass: Reviews DB/Page Disconnect, Mobile Table Overflow, Review Schema
Scoped deliberately to avoid `assets/js/location-picker.js`, `booking-form.js`, `ui-controls.js`, and both the main-site and airport-transfer booking widgets, since those are being actively edited in the IDE this session (bringing airport-page booking form features into the main form).

- **FIXED (significant, previously invisible)**: `includes/reviews.php` `dropcars_get_all_reviews()` — the public `/reviews` "view all" page was **only ever reading the static `data/reviews-extended.php` file** and never queried the database. This meant the entire admin review-moderation panel (`admin/reviews.php` — approve, edit, hide, delete against the real `reviews` DB table, fed by genuine customer submissions via `/api/reviews.php`) had **zero effect** on that page: nothing an admin approved ever appeared there, and nothing an admin hid or deleted ever disappeared from there — it just silently showed the same 29 hardcoded reviews regardless. Now merges real, `is_approved = 1` database reviews (most recent first, up to 200) with the curated file as supplementary filler, falling back to curated-only if the DB is unavailable.
- **FIXED (live display bug)**: `pages/reviews.php` — the display loop read `$r['customer_name']` / `$r['trip_route']`, but `data/reviews-extended.php` stores those under `name` / `trip`. Every one of the 29 curated reviews was silently showing generic "Verified Guest" / "Intercity Trip" instead of the actual curated names and routes. Fixed with a fallback chain that reads either key shape (needed anyway now that DB rows and curated rows are merged in the same list). Also wired up the `reply` field (10 written company responses) that existed in the curated data but was never rendered anywhere - now shown as a "Response from Drop Cars" quote block.
- **ADDED**: `pages/reviews.php` — `AggregateRating` + per-review `Review` JSON-LD schema, computed live from the same review list rendered on the page (can't drift out of sync). Caveat: Google's structured-data guidelines restrict rich review snippets for reviews of your own business hosted on your own site, so this may not surface star ratings directly in Google search results - it's still valid, correct structured data and may be honored by other engines / future policy, but that specific outcome isn't guaranteed.
- **FIXED (mobile)**: `pages/services.php` — the "Us vs. Traditional Taxis" comparison table's wrapper used `overflow: hidden` (only ever intended for the rounded-corner clipping trick), so on any phone narrower than the table's natural width the third column ("Traditional Taxi ❌") was silently cut off rather than reachable. Switched to `overflow-x: auto` with a `min-width` on the table so it scrolls horizontally instead, plus a `max-width: 600px` breakpoint that tightens padding/font-size so less scrolling is needed.
- **AUDITED (no changes needed)**: swept `vehicle-section.css`, `services-slider.css`, `routes-section.css`, `trust-section.css`, `about-us.css` and several others for mobile overflow risk (fixed pixel widths, missing breakpoints) - all were already sound (fluid units, `auto-fit` grids, or existing `max-width: calc(100vw - Npx)` guards), so left untouched rather than making speculative changes.

---

### [2026-08-04] - Search Quality Overhaul: Fixed False-Positive Fuzzy Matches, Landmark/Type Ranking, Faster Remote Fallback
- **FIXED (root cause)**: `assets/js/location-picker.js` `localSearch()` — the consonant-skeleton fuzzy tier had no first-letter gate and allowed skeletons as short as 3 characters, so a query like "ammapettai" (skeleton "mpt") was matching completely unrelated places sharing that 3-letter fragment anywhere in their skeleton — "Usilampatti", "Chromepet", "Pichavaram", "Athirampattinam" (user-reported, with screenshots). Now requires the first letter to match and the query skeleton to either be a true prefix of the target's skeleton or cover ≥60% of it. Verified with a standalone Node harness against the real dataset: "ammapettai" no longer returns any of those false positives.
- **TIGHTENED**: Levenshtein typo-match threshold from 2/3 down to 1/2 (by query length) — at the old threshold, "chenai" was fuzzy-matching "Chengam" and "Cheyyar" (real but unrelated towns, distance 2–3) alongside the correct "Chennai" (distance 1). Single-letter typos (the overwhelming majority of real typing mistakes) still match correctly.
- **ADDED**: "Ammapettai (Thanjavur)" and "Kottakuppam" to the local dataset — both were missing entirely, which is the actual reason they returned nothing (or noise) locally; no amount of fuzzy-matching tuning can find a place that isn't in the dataset. "Kottakuppam" was referenced in an earlier changelog entry as a working example but had never actually been added — confirmed and fixed. Also added **"Tiruvannamalai"** (alias "arunachala") which was missing outright despite being a major pilgrimage town.
- **ADDED**: `type` field (`"landmark"`, reserved `"business"`, default plain place) plus ~24 curated landmark/temple/waterfall/sanctuary entries (Arunachala Hill & Temple, Meenakshi Amman Temple, Brihadeeswarar Temple, Ramanathaswamy Temple, Kutralam/Hogenakkal/Athirappilly Falls, Mudumalai/Anamalai/Vedanthangal/Bandipur reserves, Marina Beach, Shore Temple, Sripuram Golden Temple, Munnar Tea Gardens, etc.) with a distinct landmark icon in the dropdown.
- **CHANGED (ranking)**: `localSearch()` sort now ranks name-prefix and alias-prefix matches as one combined top tier (previously alias-matched places like "Tiruvannamalai" via its "arunachala" alias lost to any literal name-prefix match), then breaks ties by type — plain place > landmark > business — so e.g. searching "arunacha" now returns "Tiruvannamalai" (place, via alias) first, then "Arunachala Hill" / "Arunachaleswarar Temple" (landmarks), matching the requested "place, then landmark, businesses last" ordering.
- **FIXED (perceived speed / duplicate API cost)**: the "Search maps for '...'" manual click and the automatic background lookup (fires while typing) were each independently hitting `/api/geocode.php` for the same query — clicking "Search maps for..." after the silent background attempt had already failed meant a second, fully redundant network round trip, which is what made lookups like "Vengaya Velur" (user-reported, with screenshot) feel slow. Added `fetchGeocodeCached()`, a shared per-query Promise cache used by both paths, so an identical query is only ever fetched once. Also lowered the auto-fetch trigger from 5+ typed letters to 4+ and the debounce from 300ms to 220ms so the network round trip starts sooner (the external geocoding API's own latency can't be reduced, but starting it earlier reduces the wait once the user stops typing), and added an automatic non-clickable "Searching nearby maps for '...'" row so the live lookup is visible without the user needing to click anything first.
- **NOTE (scope)**: The user asked for comprehensive local coverage of "main and rural city names and attraction or landmark or street names." Hand-curating every village/landmark/street in South India isn't feasible in one pass — the existing architecture already grows the local dataset for free over time via `data/geocode_cache.json` (every remote lookup gets cached and is merged into the local search pool on next page load, per the original zero-API-cost design), so coverage will improve organically as real customers search. This pass fixed the matching-quality bugs, added the specific places reported as missing, and seeded a meaningful landmark set for major destinations as a starting point.

---

### [2026-08-04] - Critical Fix: Location Search Totally Broken (Corrupted File From Concurrent Edits)
- **FIXED (critical)**: `assets/js/location-picker.js` — location search stopped suggesting anything at all (not even GPS/recents). Root cause: the file had a valid, fully-working IIFE that correctly closed with `})();` at line 1446, but ~155 lines of stale/duplicate leftover code (a dangling `else` branch, a second copy of the `input` event handler, a second `bindAllLocationInputs()`, duplicate `DOMContentLoaded`/`focusin` bindings, a duplicate share-route-button block, and an orphaned unmatched `catch { ... } })();`) were appended after it, outside of any function. This is a JavaScript syntax error — when a `<script>` file fails to parse, the browser runs **none** of the code in it, not just the broken part, which is why suggestions vanished entirely rather than only degrading. Deleted the orphaned tail; the file now parses cleanly (`node -c` verified) and every function (`localSearch`, `searchAirports`, `getNearestAirport`, `isFieldRestrictedToAirports`, `shouldOfferGpsOption`, `renderDropdown`, `attachLocationPicker`, `bindAllLocationInputs`, etc.) is defined exactly once, and the `dc-dropdown-active` floating-button-hide toggle is intact in `showDropdown()`/`hideDropdown()`.
- **PROCESS NOTE**: This is at least the second time this file has been corrupted by two AI tools (this assistant + an IDE-based assistant) saving to the same file concurrently — the earlier occurrence stripped functions out entirely (causing `ReferenceError`s), this one appended a dead/duplicate tail (causing a parse error). Both are silent to the end user (no visible error, "just doesn't work"), which makes them slow to diagnose. Flagging again: if both tools keep editing `location-picker.js` in the same window, this will likely recur.

---

### [2026-08-03] - Floating Button Gap Fix, Fuzzy-Match UI Cue & Real 404 Typo-Redirects
- **FIXED**: `assets/css/ai-assistant.css` — the AI assistant trigger (`#dc-ai-trigger`) was never wired into the `html.dc-dropdown-active`/`html.dc-keyboard-open` hide mechanism that `assets/css/whatsapp.css` already used for the Call/WhatsApp buttons, so it alone stayed visible and could overlap the location dropdown. Added matching hide rules.
- **ENHANCED**: `assets/js/location-picker.js` — the fuzzy/typo-tolerant matches added earlier today (`isFuzzy` flag from `localSearch()`) weren't actually reaching the rendered dropdown item. Now propagated through, with a distinct icon and a "Did you mean this?" cue so users can tell a suggestion was typo-corrected rather than an exact match.
- **ADDED**: `includes/paths.php`, `engine/route.php`, `engine/city.php` — new `dropcars_find_closest_slug()` helper (first-letter-gated Levenshtein match against known city slugs). Previously, `engine/route.php` called `SEOCore::getCityBySlug($slug, true)` which *always* synthesizes a fake generic city page for any non-empty slug — so a misspelled URL like `/kotkupm-to-chennai` silently rendered a thin, wrong "Kotkupm" page instead of 404ing or landing on the real page. `engine/city.php` had the opposite problem (hard 404 with no fallback). Both now 301-redirect to the correct real city/route page when a confident typo match exists, and fall through to prior behavior (dynamic synthesis / 404) otherwise so genuinely novel-but-real place names aren't force-redirected.

---

### [2026-08-03] - Location Fuzzy Search, Floating Button Collision Fix & Smart 404 Routing
- **ADDED**: `assets/js/location-picker.js` — Fuzzy & Typo-Tolerant Search (`localSearch()`). Added Levenshtein distance calculation and consonant-skeleton normalization (`replace(/[aeiou\s\-\.\']/g, '').replace(/([a-z])\1+/g, '$1')`). Misspelled queries like `kotkupm` now match `Kottakuppam`, `chenai` matches `Chennai`, and `trichy` matches `Tiruchirappalli`.
- **FIXED**: `assets/css/whatsapp.css`, `assets/css/footer.css`, `assets/js/location-picker.js` — Floating action buttons (WhatsApp, Call, AI Assistant) overlap. Added `html.dc-dropdown-active` toggle to `document.documentElement` whenever the location picker dropdown opens; all floating launcher widgets automatically hide cleanly (`display: none !important`) so they never obstruct dropdown suggestions or input fields.
- **FIXED**: `assets/css/footer.css` — Wasted whitespace at page bottom. Optimized footer bottom padding from `6.5rem` to `4.8rem` on mobile and `5rem` to `4.2rem` on desktop.
- **ENHANCED**: `assets/js/location-picker.js` — Instant Location Search & 5+ Letter Geocoding.
  1. Added major railway stations and central hubs (`Chennai Central Railway Station`, `Chennai Egmore`, `KSR Bengaluru / Bangalore Central`, `Coimbatore Junction`, `Madurai Junction`, `Trichy Junction`) directly to default local dataset for 0ms instant matching.
  2. Automatic Geocoding on 5+ letters (`q.length >= 5`): automatically fetches remote map results from `/api/geocode.php` after 300ms. All fetched geocoded locations are stored on the server in `data/geocode_cache.json` for 0-API-cost repeat lookups.
  3. Reordered dropdown items so instant local matches and remote geocoded results ALWAYS display at the top, and the manual `Search maps for "..."` option is ALWAYS pinned as the VERY LAST ROW at the bottom of the dropdown list.
- **ENHANCED & EXPANDED**: `assets/js/location-picker.js`, `api/geocode.php` — State Tier 1 Priority & Server Cache Loading.
  1. Updated state sorting (`getJsStateRank()` & `usort()`) so matches in **Tamil Nadu** and **Puducherry** are ALWAYS sorted to Rank 1 at the VERY TOP of the dropdown above all other states.
  2. Added **Vedanthangal (Vedanthangal Bird Sanctuary)**, **Pichavaram**, **Mudumalai**, **Anamalai**, **Hosur**, **Hyderabad**, **Secunderabad**, **Guntur**, **Vijayawada**, **Visakhapatnam (Vizag)**, **Tirupati**, **Chittoor**, **Nellore**, **Ongole**, **Kurnool**, **Anantapur** to instant lookup dataset.
  19. **High-Contrast Warm Gold Accent & White Glass Badge**: Updated `assets/css/page-animations.css` and `assets/css/light-theme.css`. Changed `.page-hero__title .accent` (`Every Journey`) to glowing warm amber gold (`#fbbf24` with `0 2px 16px rgba(251, 191, 36, 0.5)` glow) and updated `.page-hero__badge` to luminous white glass (`#ffffff`). Creates maximum AAA-level high contrast against the royal blue banner backdrop.

---

### [2026-08-03] - Location Engine Bug Fixes (user-reported)
- **FIXED**: `assets/js/location-picker.js` — normal pickup/drop fields (one-way, round trip, hourly, multi-city on the homepage) were showing airport suggestions mixed in with city results. Root cause: `searchAirports()` was called and concatenated into results unconditionally for every field, before the airport-restriction check; only airport-restricted fields (the actual airport-transfer flow) filtered them back out. Airport matches are now only computed/shown for fields explicitly marked airport-restricted — normal fields show cities, railway stations, and landmarks only, per spec.
- **FIXED**: `assets/js/location-picker.js` — the "Search maps for '...'" dropdown option (shown when a typed query has no local match) silently filled the field with the raw, unenriched typed text whenever the `/api/geocode.php` lookup returned zero results or failed (network error, API issue, etc.) — this looked exactly like a valid selection but had no city/state context and wasn't a real, verified location. Replaced the silent fallback with a clear "No matching location found" / "Couldn't reach map search" message inside the dropdown row, with an explicit opt-in "Use '...' anyway" link if the user still wants to proceed with free text. New function: `showNoResultsRow()`.
- **ADDED**: `assets/js/location-picker.js` — "popular destinations" shown when a pickup/drop field is focused empty are now ranked using the curated `priority` field already present in every entry of `data/cities.json` (1–10 scale, `isHub: true` for top cities like Chennai/Bangalore) instead of an arbitrary "first 6 cities" / letter-match fallback. Shown with a star icon (`isPopular`) to distinguish from recent/plain results. Per-user "recent selections" (last 5 places picked, stored in `localStorage`) already existed and is unchanged. A true cross-user "most booked routes" ranking from live booking data was scoped but not built this pass — would need a new aggregation endpoint against the bookings table; flagged as a future enhancement if wanted.

---

### [2026-08-03] - Follow-Up Cleanup: FOUC Hack Removal, JS Dedup, Mobile Fixes & Admin Security
- **FIXED**: Removed the `media="print" onload="this.media='all'"` async-CSS hack (and its paired redundant `<noscript>` fallback) from 20 files: `engine/route.php`, `engine/city.php`, `engine/airporttaxi-home.php`, `engine/tariff.php`, `engine/cities.php`, `pages/contact.php`, `pages/about-us.php`, `pages/airport-transfer.php`, `pages/customer-dashboard.php`, `pages/driver-partner.php`, `pages/fleet-partner.php`, `pages/payment-policy.php`, `pages/privacy.php`, `pages/refund-policy.php`, `pages/reviews.php`, `pages/services.php`, `pages/terms.php`, `pages/thank-you.php`, `pages/track-booking.php`, `pages/vendor-partner.php`. All stylesheets across the entire root tree now load synchronously — the FOUC directive from the original audit is now fully complete (previously only `index.php`/`engine/shell.php`/`pages/developer.php` were covered).
- **FIXED**: Deduped `resetFare()` in `assets/js/booking-form.js` (was declared twice, second silently overrode the first — removed the dead earlier copy after confirming no state was lost).
- **FIXED**: Deduped `showTyping`, `removeTyping`, `scrollToBottom`, `escapeHtml` in `assets/js/ai-assistant.js` (each declared twice in the same scope — kept the later, correct set, removed the dead earlier set).
- **FIXED (mobile)**: `assets/css/booking-form.css` — `.booking-card--home .trip-type-block` mobile negative margin (`-1rem`/16px) didn't match the card's mobile padding (12px), clipping the trip-type tab strip by 4px on every phone. Corrected to `-12px`.
- **FIXED (mobile)**: `assets/css/navbar.css` — the mobile hamburger `.menu-button` touch target was only enlarged to 36×36px below 380px, leaving it at a sub-standard 28×28px for the vast majority of real phone widths (381–900px, i.e. essentially every iPhone/Android). Moved the size bump into the existing 480px breakpoint so it covers real-world devices.
- **SECURITY FIX**: Deleted `admin/admin/` — a second, unreferenced-by-code but directly URL-accessible (e.g. `/admin/admin/index.php`) full duplicate of the admin panel. It shared the same database name and session cookie namespace as the real admin panel but its `auth.php`/`actions/login.php` had none of the real panel's hardening (no session-token binding/rotation, no rate limiting) — an unmonitored authentication bypass into live admin accounts. Confirmed via full-codebase grep that nothing in the live app referenced it before removal. Moved to Recycle Bin (recoverable) rather than permanently deleted.

---

### [2026-08-03] - Full-Codebase Audit: Copy/SEO Optimization, Location Engine Fix & Security Hardening
- **COPY/SEO**: De-duplicated repetitive "South India" phrasing in `index.php`, `pages/about-us.php`, `pages/contact.php`, `engine/city.php`, `engine/route.php`; injected high-intent primary keywords (One-Way Drop Taxi, Outstation Cab Service, Fixed Per-KM Rates, Zero Return Fares) and geo-targeted keywords (Tamil Nadu, Karnataka, Kerala, Andhra Pradesh, Pondicherry, Chennai–Bangalore, Coimbatore) into headlines, meta descriptions, and JSON-LD, while retaining natural regional mentions (schema `areaServed`, specific city callouts).
- **FIXED**: Multi-word search matching gap in `location-picker.js`'s `localSearch()` (city/pickup-drop fields) — `searchAirports()` already had word-split AND-matching, `localSearch()` did not.
- **FIXED**: Z-index mismatch in `location-picker.js`/dropdown CSS — a `!important` stylesheet rule (999999) was silently overriding the JS-applied inline `z-index` (9999999), making the intended value dead code. Both now agree at 9999999.
- **HARDENED (JS)**: Added `"use strict"` to `booking-form.js` and two non-strict `DOMContentLoaded` callbacks in `ui-controls.js`. Confirmed all `fetch()` calls in `booking-form.js`, `maps-integration.js`, `ai-assistant.js` already had `.catch()`/try-catch handling.
- **HARDENED (PHP)**: Added `?? default` null-coalescing to unguarded `$_POST` lookups in `admin/pages/promotions.php`, `coupons.php`, `banners.php`, `tariffs.php`. Added top-level exception/fatal-error safety nets to `api/confirm_booking.php` and `api/send-enquiry.php` so uncaught errors return structured JSON instead of a broken response. Confirmed no SQL injection risk — all first-party queries use PDO prepared statements.
- **SECURITY FIX**: Retired `admin/actions/login.php` — a legacy login endpoint that bypassed the rate-limiting and `session_token` binding enforced by the real `admin/pages/login.php`. It now returns HTTP 410 and points callers to the hardened login flow instead of authenticating anyone.
- **SECURITY FIX**: Hardened `api/test-smtp.php` — replaced the hardcoded diagnostic token (`dropcarstest2024`, committed in source) with a server-environment-variable check (`SMTP_TEST_TOKEN`) compared via `hash_equals()`; stopped printing the SMTP app password (even masked) and full email addresses in output. Endpoint now fails closed by default.
- **VERIFIED, NO CHANGE NEEDED**: `.trip-type-options`/`.oneway-subtypes` spacing and mobile menu drawer contrast (light + dark) in `assets/css/light-theme.css` / `dark-mode.css`; brand logo (PNG + text mark) parity in `engine/shell.php`; FOUC async-CSS hacks absent from `index.php`/`pages/developer.php`/`engine/shell.php`; booking form `method="post" action="javascript:void(0);" novalidate` in `index.php`/`pages/airport-transfer.php`; admin per-session-token validation and "log out all devices" token invalidation in `admin/includes/auth.php`/`admin/pages/settings.php`.
- **FLAGGED FOR FOLLOW-UP (not fixed, out of this pass's scope)**: `media="print" onload` async-CSS hack still present in `pages/contact.php`, `pages/about-us.php`, `engine/route.php`, `engine/cities.php`, `engine/tariff.php`, `engine/airporttaxi-home.php`, and several other `pages/*.php` files. The nested `admin/admin/` directory tree appears to be an unreferenced leftover copy — not touched, worth confirming it can be safely removed. Duplicate function declarations (dead code, not bugs) in `booking-form.js` (`resetFare`) and `ai-assistant.js` (`showTyping`, `removeTyping`, `scrollToBottom`, `escapeHtml`).

---

### [2026-08-03] - Platform Synchronization, Pre-Deployment Testing & Master Documentation
- **ADDED**: Comprehensive Master Log File `CHANGELOG_AND_FEATURE_REGISTRY.md` as the permanent single source of truth for the platform.
- **ADDED**: Automated Pre-Deployment Verification System (`scripts/pre-deploy-test.php` and `test-predeploy.ps1`) covering 9 comprehensive test suites (PHP linting, UTF-8 BOM audit, DB health, API keys, page loading, fare simulation, popup DOM audit, and package sync safety).
- **FIXED**: Airport transfer page load issues and dynamic route handling bugs (`pages/airport-transfer.php`, `router.php`).
- **UPDATED**: Hostinger deployment packaging scripts (`sync-deploy.ps1`, `sync-public-html.ps1`) with automatic BOM stripping and timestamp conflict detection.
- **ENHANCED**: Notification Engine with subdomain mail sender support (`subdomainConfig['airporttaxi'] => 'AirportTaxi.International'`) and Telegram admin alert dispatching.

---

### [2026-07-25] - Airport Transfer Sub-Brand Engine & Fare Matrix Expansion
- **ADDED**: Standalone local development script for Airport Taxi (`dev-server-airporttaxi.ps1`) and dedicated router (`router-airporttaxi.php`).
- **ADDED**: Fixed airport transfer packages dataset (`data/airporttaxi-tariffs.json`, `data/airports.json`) covering major airport hubs across South India (Chennai, Bangalore, Coimbatore, Madurai, Trichy, Salem, Tuticorin).
- **ENHANCED**: `pages/airport-transfer.php` frontend with interactive pickup/drop airport selector, fare estimator, and flight number input fields.

---

### [2026-07-24] - AI Floating Assist & Frontend UI Enhancements
- **FIXED**: Floating AI widget interaction and modal triggers across main landing pages.
- **UPDATED**: Responsive layout styles for mobile screens, highway signboard styled tariff highlights, and compact booking forms (`components/booking-form.html`, `assets/css/`).

---

### [2026-07-15] - Core Tariff Engine, RTO Permits & Zero-Cost Location Engine
- **ADDED**: Offline location fuzzy search engine (`data/cities.json`, `engine/cities.php`) covering 1000+ South Indian cities, eliminating unnecessary Google Maps Geocoding API calls.
- **ADDED**: Distance matrix caching (`data/distance_cache.json`) and geocode caching (`data/geocode_cache.json`).
- **ENHANCED**: Fare Calculator Engine (`engine/tariff.php`) to calculate minimum one-way distances (130 km min), outstation round-trip (250 km/day min), driver bata (day ₹400 / night ₹200), and state-border RTO permit fee breakdowns.

---

### [2026-06-30] - Admin Control Panel, Security Architecture & Anti-Scraping Shield
- **ADDED**: Comprehensive Admin Control Panel (`/admin/`) with dashboard analytics, live booking management, driver assignment workflow, tariff manager, coupon code manager, and customer review moderation.
- **ADDED**: Security Suite (`config/security.php`, `core/rate-limiter.php`, `core/anti-scrape.php`) featuring CSRF protection, BCRYPT password hashing, session expiry controls, rate limiting, and IP blocking.
- **ADDED**: Multi-channel notification engine (`includes/notification-engine.php`) integrating PHPMailer SMTP and Telegram Bot API alerts.
- **ADDED**: Distance matrix caching (`data/distance_cache.json`) and geocode caching (`data/geocode_cache.json`).
- **ENHANCED**: Fare Calculator Engine (`engine/tariff.php`) to calculate minimum one-way distances (130 km min), outstation round-trip (250 km/day min), driver bata (day ₹400 / night ₹200), and state-border RTO permit fee breakdowns.

---

### [2026-06-30] - Admin Control Panel, Security Architecture & Anti-Scraping Shield
- **ADDED**: Comprehensive Admin Control Panel (`/admin/`) with dashboard analytics, live booking management, driver assignment workflow, tariff manager, coupon code manager, and customer review moderation.
- **ADDED**: Security Suite (`config/security.php`, `core/rate-limiter.php`, `core/anti-scrape.php`) featuring CSRF protection, BCRYPT password hashing, session expiry controls, rate limiting, and IP blocking.
- **ADDED**: Multi-channel notification engine (`includes/notification-engine.php`) integrating PHPMailer SMTP and Telegram Bot API alerts.
