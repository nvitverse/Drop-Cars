# Drop Cars — Senior Architecture Review

Scope: backend, website, customer app, driver app, admin panel (all from `origin/main`, commit `503da0b`).
Method: static code reading only. I did not run the stack, hit a database, or exercise any API.

Labels used throughout:
- **[Confirmed]** I read the code and the behaviour follows directly from it.
- **[Verify]** Strongly suggested by the code, but needs a runtime check or a data check before you rely on it.
- **[Suggestion]** My recommendation, not a fact about the repo.

---

## 0. Read this first

1. **This session's branch is stale.** `claude/determined-volta-yw9pe8` only contains the old Node/Express + Android + Vite scaffold. The real ecosystem (backend FastAPI, website, customer-app, driver-app, admin-panel) lives on `origin/main`. I reviewed `origin/main`. Nothing in this review has been committed.
2. **The overview you pasted is mostly right, with three corrections.**
   - `customer-app/` is not only a customer app. It also contains `(driver)` and `(vendor)` route groups and a full native Kotlin tree (`app/src/main/java/in/dropcars/app/ui/{admin,driver,owner,vendor,...}`, 86 `.kt` files). That is three things in one folder.
   - `backend/app/utils/rate_card.py` holds only per-km rates and allowances. Minimum billable km lives in `utils/fare_rules.py` and `crud/new_orders.py`, and the driver-matching code is `crud/vehicle_matching.py` plus `utils/auto_dispatch.py`.
   - The admin panel has about 90 screens in one Expo Router folder, so it is a large single app, not a small panel.
3. **The website has its own full admin (PHP + MySQL/JSON), separate from the platform backend (FastAPI + Postgres).** Two databases, two admin UIs, joined by webhooks. Most of the "wire everything together" work is about this seam.

---

## 1. Executive summary — the ten things that matter most

| # | Finding | Severity |
|---|---|---|
| 1 | Customer name + phone of **every order** is readable with no login (`GET /api/orders/all`, `/api/orders/pending-all`). | Critical |
| 2 | The whole `/api/crm/*` API has **no authentication**. "Owner only" is a `user_role=owner` *query parameter that defaults to owner*. Anyone can read the webhook secret, then forge leads. | Critical |
| 3 | Start-trip / end-trip **OTP can be skipped** by sending an empty OTP. | Critical |
| 4 | Other unauthenticated admin/PII endpoints: SOS alerts (GPS + customer IDs), AI logs (driver names/docs), invoice PDFs by guessable order number, drop-bid settings write, unassigned-timeout write. | Critical / High |
| 5 | **Three different fare tables** (backend, website, customer app) and the customer app displays its *own* computed fare while the server charges another number. | High |
| 6 | **No Razorpay webhook.** Payment success depends on the app calling `/verify`. `crud/payment_reconcile.py` is an empty file. | High |
| 7 | Wallet debit/credit is read-modify-write **without row locks**. | High |
| 8 | Almost no rate limiting (2 endpoints in the whole API), so OTP/SMS/email bombing and Google Maps / LLM cost abuse are open. | High |
| 9 | The website ships **live diagnostic endpoints** (one inserts a test row on every hit) and a committed log of 354 booking/enquiry records. | High |
| 10 | Schema changes are applied by ~20 startup `ALTER` hooks and one-off scripts. No migration tool, no CI, 4 test files. | High (operational) |

Also worth knowing: `admin-panel/docs/ADMIN_FEATURE_PARITY.md` says permissions are "strictly enforced in backend decorators". My scan shows that is true for most `/admin/*` routes but **not** for the ones listed in section 2. The parity audit checked UI coverage, not authentication.

---

## 2. Findings in detail

### 2.1 Critical

**C1. Unauthenticated customer PII** — [Confirmed]
- `backend/app/api/routes/orders.py:19` `GET /orders/all` and `new_orders.py:506` `GET /orders/pending-all` take only `get_db`. Their response models (`UnifiedOrder`, `NewOrderResponse`) include `customer_name` and `customer_number`.
- Fix (keeps response schema, so no app break): add `Depends(get_current_admin)` (and vendor/owner variants where those apps genuinely call them). First check which app calls each route, so you don't lock out a shipped build.

**C2. CRM API is open** — [Confirmed] `backend/app/api/routes/crm_routes.py`
- `GET /crm/leads`, `PATCH /crm/leads/{id}`, `POST /crm/leads/{id}/convert`, `GET /crm/owner/financials`, `GET|PUT /crm/owner/settings` have no auth dependency.
- Role gate is `user_role: str = Query("owner")` (lines ~226, 263, 285). The admin app also hard-codes it: `crmApi.getOwnerFinancials('owner')` in `admin-panel/app/crm.tsx:82`.
- `GET /crm/owner/settings` returns `webhook_secret_key`. The lead-intake webhook is protected by that key, and the fallback default is the string `dropcars_crm_secret_2026` (`crm_routes.py:50`, `:273`), which is also shown as placeholder text in the UI (`crm.tsx:92`, `:657`). An attacker can read the key, or simply overwrite it with `PUT`.
- Separate bug: `crm_routes.py:171` uses `status_code=44` (typo for 404), which raises a server error instead of "not found".
- Fix: real JWT auth + role check on the server, remove the fallback key (fail closed if unset), rotate the key.

**C3. Trip OTP bypass** — [Confirmed] `backend/app/api/routes/order_assignments.py:809` (start) and `:970` (end)
```python
if assignment.start_trip_otp and otp and otp.strip() and otp.strip() != assignment.start_trip_otp:
    raise HTTPException(400, "Incorrect trip start code ...")
```
`otp` defaults to `""`. The check only fires when the driver *supplies* a value, so omitting it skips verification. The docstring says the OTP "proves the driver actually reached the real customer". The website trip-link path (`website_bookings.py:535`) does require it, but has no attempt limit on a 4-digit code.
- **Rollout risk, [Verify]:** the driver app sends `(otp || '').trim()` and its own comment says the value is "only compared when the assignment actually has a stored OTP" (`driver-app/services/driver/carDriverService.ts:41`). Some flows may legitimately start without an OTP (customer never got the email, vendor-posted bookings). Do **not** flip this on blindly.
- [Suggestion] Ship in three steps: (a) log-only for a week, counting empty-OTP starts; (b) add a driver-app "customer didn't receive it → resend / request admin override with reason" path; (c) enforce behind an env flag. Also add an attempt cap (e.g. 5 wrong tries per assignment) and a 6-digit code.

**C4. Other unauthenticated endpoints** — [Confirmed by reading each handler]
| Route | File | Exposure |
|---|---|---|
| `GET /sos/alerts`, `POST /sos/alert` | `sos.py:19,36` | anyone can list the last 100 SOS alerts (customer id, GPS, tracking link) or spam-create alerts |
| `GET /admin/ai-automation-logs`, `/{id}`, `POST /seed-demo` | `ai_automation_log_routes.py:13,76,105` | driver names/doc-verification data; anyone can write fake logs into production |
| `GET /bookings/{id}/invoice-pdf` (+3 aliases) | `tax_admin.py:800-804` | GST invoice looked up by `order_id`, invoice id or number; digits-only ids are accepted, so it is **enumerable** |
| `PUT /api/dropbid/settings` | `drop_bid_routes.py:248` | anyone can flip "allow change bid" |
| `POST /admin/settings/unassigned-timeout`, `POST /admin/auto-remove-unassigned` | `unassigned_booking_routes.py:15,33` | anyone can change the timeout or trigger the auto-removal sweep |
| `PUT /orders/{id}/bump-fare` | `unassigned_booking_routes.py:64` | unauthenticated, but currently also **broken**: line 74 imports `Orders`, the model is `Order`, so it 500s. Fix the auth *before* fixing the import |
| `POST /refresh-rental-hrs-data`, `/documents/verify-image`, `/documents/verify-face-match`, `/ai/chat-assistant` | various | unauthenticated calls that cost money (OCR / face match / LLM) |

Routes that looked unauthenticated in my first scan but are fine: everything in `savaari_routes.py`, `announcements.py`, `quality.py` (auth is on a later line of the signature), and `booking_chat.py` (auth via `_resolve_caller`). Sign-in, sign-up, quote, city lists and password-reset are public on purpose.

### 2.2 High

**H1. Three fare tables that disagree** — [Confirmed]
| Source | Sedan (one-way) | Driver beta / allowance |
|---|---|---|
| Backend default `utils/rate_card.py` | ₹14/km | ₹300 allowance |
| Customer app `constants/bookingConfig.ts` `TARIFF.ONEWAY` | ₹14/km | ₹400 beta, +5% GST, +₹40/100 km toll estimate |
| Website `data/tariffs.json` | ₹15/km | ₹400 beta |

The rate card is admin-editable in the backend, so live values may differ from all three. The point is that there are three places to keep in sync and nothing forces them to agree.
- The customer create-booking payload has **no fare field**, so the server prices the booking and a customer cannot set their own price. Good.
- But `standard.tsx:394` shows `computeStandardFare(...)` (local tariff + GST + toll guess) while charging `booking.quoted_total_amount` (`:475`). Any difference is a "you charged me more than you showed me" complaint.
- `utils/taxiPricing.ts` still contains a hash-based mock distance table, with a flat 28 km fallback. If the quote call fails, `standard.tsx:380` swallows the error ("never block the booking flow") and the UI silently shows the mock number.
- `get_fare_rules()` opens a fresh DB session on every call (`fare_rules.py:27`), and it is called on each quote/confirm.

**H2. No payment webhook** — [Confirmed that none exists in the routes; Verify in Razorpay dashboard]
Payment completion depends on the app calling `/customer/bookings/{id}/verify` after checkout. If the app is killed, offline, or crashes between capture and verify, money is captured but the booking is not marked paid. `crud/payment_reconcile.py` is 0 bytes and unreferenced.

**H3. Wallet race conditions** — [Confirmed pattern; Verify with a concurrent test]
`crud/wallet.py:52-69` reads the balance, checks it, computes a new value in Python, then writes. There is no `SELECT ... FOR UPDATE` or atomic `UPDATE ... SET balance = balance - :x WHERE balance >= :x`. Only ~24 places in the whole backend take row locks, and none are in `wallet.py` or `vendor_wallet.py`. Two simultaneous trip-accepts (hold debits) can both pass the check.

**H4. Rate limiting is nearly absent** — [Confirmed]
`@limiter.limit` appears twice in the whole API (start-trip and end-trip). Unthrottled: phone/email OTP request, password reset, sign-in, quote, geocode, AI assistant, document AI. `core/limiter.py` keys on `get_remote_address`, and the Dockerfile's `CMD` has no `--proxy-headers/--forwarded-allow-ips`, so behind Cloud Run it likely keys on the proxy's IP rather than the client's [Verify]. That means the existing 5-per-10-minute trip limit could throttle unrelated drivers together.

**H5. Website ships debug/diagnostic endpoints and committed data** — [Confirmed]
- `website/api/test_diag_live.php` (turns on `display_errors`, dumps latest enquiries/bookings), `check_insert_error.php` (**inserts a row into `enquiries` on every request**), `diag_booking_id.php` (consumes booking-id sequence numbers, lists today's enquiries with names/phones). None checks a login.
- `website/api/storage/bookings-log.jsonl` (354 lines) and `partner-requests.jsonl` are committed. `.htaccess` blocks web access, but they are in git history. Rows I sampled are test data [Verify the rest].
- Website OTP send limit is stored in `$_SESSION` (`api/send_email_otp.php:28`), so a client that drops its cookie resets it.
- No `csrf` token usage found anywhere under `website/admin/` even though the registry lists CSRF protection [Verify `config/security.php`]. Also `settings.php:115` deletes a blocked-IP row from a `$_GET` parameter (state change on GET).

**H6. Database migrations and startup** — [Confirmed]
`Base.metadata.create_all` plus about 20 `@app.on_event("startup")` hooks doing `ALTER TABLE` / enum edits in `main.py`, and ~20 `run_*_migration.py` scripts in a folder named `Testing code/`. No Alembic. On Cloud Run every cold start (and every parallel instance) re-runs these. There is no record of what has run where.

**H7. No CI, thin tests** — [Confirmed] No `.github/` workflows; `backend/tests` has 4 files (AI logs, doc verification, route requests, unassigned expiry). Fare math, wallet, OTP and auth have none. The website has a good pre-deploy script (`scripts/pre-deploy-test.php`) but it is manual.

**H8. Offline trip queue is dead code** — [Confirmed] `driver-app/services/offline/offlineQueueService.ts` is imported by nothing, and posts to `/api/orders/{id}/start-trip`, `/end-trip`, `/odometer`, `/driver-location`, none of which exist on the backend (the real routes are `/assignments/driver/start-trip/{id}` and `/orders/driver/end-trip/{id}`). Drivers on highways with bad signal have no working offline protection.

### 2.3 Medium / Low

- **M1** `website_bookings.py:50` compares the shared key with `==` (use `hmac.compare_digest`). Low.
- **M2** `security.py:96` `print(token_version)`; other `print()` debug lines in `order_assignments.py` and `orders.py`. Noise and mild info leak.
- **M3** Long-lived tokens: drivers/owners/vendors 6 months, customers 10 years, no refresh. `token_version` exists for force-logout on drivers/owners/vendors [Verify it is checked for customers].
- **M4** `CORS allow_origins=["*"]` (`main.py:143`). Acceptable for bearer-token APIs, but pin it for the admin web build.
- **M5** Dockerfile runs as root, one worker, and installs `tesseract-ocr` in every image.
- **M6** Razorpay prefill uses a fake email `<phone>@dropcars.in` and fallback phone `9999999999` (`standard.tsx:490-491`), so receipts and failed-payment mails go nowhere. The live Razorpay key **id** is hard-coded (`:485`). The id is public by design, but it should come from the `/pay` response so test/live can't drift.
- **M7** Website `init-admin.php` is guarded (only works when the `admins` table is empty), but it creates `admin@dropcars.in / admin@dc` on first run, and `config/seed-local-admin.sql` does `DELETE FROM admins` then inserts the same default. Fine for local dev; make sure neither is ever run on production.
- **M8** `driver-app/google-services.json` (two copies) is committed. It holds client-side Firebase keys, not secrets, but restrict them by package name/SHA.
- **M9** Screens of 2,000–4,600 lines (`orders.tsx` 4,621, `create-booking.tsx` 3,863, driver `index.tsx` 3,263). These are hard to review and easy to break.
- **M10** Duplicated menu entries in the admin app: Dashboard lists Emergency Bids, GST Invoices and Staff Management twice each; Settings links `notification-settings` and `alarm-settings` from two places each.

---

## 3. Flow analysis and how I'd improve it

### 3.1 Booking lifecycle as it exists today
1. **Create** — website (`/website/bookings`), customer app, admin manual booking, vendor/driver-posted bookings, Savaari monitor. All except vendor/driver posts land as `CustomerBookingRequest` (PENDING).
2. **Approve** — admin approval queue. If nobody approves in time it **auto-posts anyway** (`auto_approve_expired_booking_requests`).
3. **Broadcast / match** — `NewOrder` → FCM to eligible drivers/owners, or manual assign, drop-bid, return-cab dispatch, vacant-city escalation.
4. **Accept / assign** → customer gets driver + car (OTP is **emailed**).
5. **Execute** — start OTP + odometer photo → trip → end OTP + odometer photo, tolls/extras.
6. **Bill & settle** — `end_records` recomputes km with min-km rules, commission, wallet, cash audit, GST invoice, payout.
7. **After-trip** — token review link, ratings, quality/penalty cases.

### 3.2 Gaps and improvements [Suggestion]
| Stage | Gap | Improvement |
|---|---|---|
| Quote | 3 fare tables; app shows local fare | One server quote endpoint is the only source; app + website render its `fare` breakdown verbatim. Cache by route + car type + day. |
| Website→backend | Two DBs, two lead systems (website `enquiries` vs backend `crm_leads`), no visible idempotency key on `/website/bookings` [Verify] | Add an idempotency key + outbox on the website side, and a nightly reconciliation that diffs both stores. |
| Approval | Auto-approve on timeout can publish a booking with a stale price | Re-quote at approval time; show a countdown and an SLA badge in Ops; page the owner before auto-post. |
| Dispatch | Unassigned bookings auto-remove after 30 min | Before removing: escalate (fare bump prompt, alternative vehicle class, call customer), and tell the customer. |
| OTP | Emailed only; bypassable | Show OTP inside "My Trip", also push/WhatsApp/SMS; enforce with a staged rollout (see C3). |
| Trip | Odometer photos are not machine-checked | You already ship `tesseract-ocr`; OCR the speedometer image and flag mismatch vs typed km for review. Also capture toll receipts for pass-through charges. |
| Payment | Client-driven verify | Razorpay webhook (`payment.captured`) + reconcile job; idempotent `mark_paid`. |
| Wallet | Lost-update risk | Atomic SQL updates or `FOR UPDATE`; ledger `balance_after` becomes a check, not the source. |
| Driver offline | No working queue | Rebuild against real routes, with client-generated idempotency keys. |
| Comms | Email-first for an Indian mobile audience | WhatsApp/SMS templates for confirmation, driver assigned, OTP, trip started/ended, invoice. |

### 3.3 Customer identity
Website: email OTP + session. App: Firebase phone/Google + password. Backend: JWT + `find_or_create_guest_customer`. [Verify] A customer who books on the website and later logs in to the app should see that booking; matching by phone number is the natural key. Make "claim my bookings by phone OTP" an explicit step.

---

## 4. Single source of truth — recommended architecture [Suggestion]

| Entity | Owner (authoritative) | Consumers |
|---|---|---|
| Tariff / rate card / fare rules / route distances | **Backend** (`platform_settings`) | website (public cached `GET /public/tariffs`), customer app, admin quote screen |
| Serviceable cities / airports / popular routes | Backend | website (`cities.json` becomes a build/cache artefact), apps |
| Customers | Backend | website login, app login, CRM |
| Leads / enquiries | **One** system (recommend backend `crm_leads`) | website form, admin CRM inbox, Google Ads call log |
| Coupons, banners, announcements | Backend | website, customer app |
| Reviews | Backend `trip_reviews` | website review pages, app, CRM |
| Website content (hero, SEO, section visibility, theme) | Website admin today → backend CMS later | website |

Phasing: keep the existing bridge (`api/admin-app-*.php`, `website_bookings.py`, `website_status_webhook.py`) while you harden it, then migrate one entity at a time. Do not attempt a big-bang merge of the PHP and FastAPI stacks.

---

## 5. Admin app restructure: **CRM** and **Operations**

### 5.1 What's wrong today (facts)
- 20 tab files plus ~70 stack screens; only 4 tabs are visible (Bookings, Tasks, Chats, Fleet) plus a Dashboard, everything else is reached via the Dashboard tile grid or Settings.
- Settings is a grab-bag: "Customer App Pricing & Rules" contains Analytics, Savaari Monitor, Data Archive, Alarm Control; "Driver checks & alerts" contains Coupons, Banners, Payout Requests and Waiting cities. The sections are organised by *which app is affected*, not by *what job you are doing*.
- `crm.tsx` (leads pipeline) and `enquiries.tsx` (website enquiries) are two different lead inboxes.

### 5.2 Proposed structure [Suggestion]
Bottom tabs (5): **Home · Operations · CRM · Chats · More**. `More` is a thin "Control Center" so the two big sections stay clean. Each big section opens a hub screen with 4–5 grouped cards, each card showing a live count badge. Permission keys you already have (`bookings`, `fleet`, `documents`, `accounts`, `marketing`, `logs`) map straight onto this.

```
OPERATIONS  (run today's trips, supply and money)
├─ Dispatch            Bookings board · Unassigned & Emergency bids · Website approvals ·
│                      Create booking / Quote · Find driver / Assign car · Live map ·
│                      Vendor bookings · Savaari monitor · Vacant cities (return cabs) ·
│                      Car-substitution requests · Ops tasks
├─ Fleet & Partners    Fleet hub · Vehicle owners · Vendors · Own fleet (+requests) · Cars · Drivers
├─ Verification        Documents queue · Account docs · Car docs · Face audit ·
│                      Profile-edit queue · Review tasks · Expiry alerts
├─ Money               Payout requests · Refund requests · Wallet · Transfers ·
│                      Cash audit · Billing automation · GST invoices · Accounts ledger
└─ Safety & Quality    SOS alerts · Ratings & quality cases · Penalties · Cancellations audit

CRM  (customers, demand and the website)
├─ Inbox               Enquiries (missed-alarm tab) · Leads pipeline · Follow-ups · Support & booking chats
├─ Customers           Directory · Customer detail · Insights (repeat / churn) · Reviews & feedback ·
│                      Referral claims & history
├─ Marketing           Coupons · Banners · Announcements / push broadcasts · Referral rules · Gift cards
├─ Website & Brand     (the "advanced" version of the website admin, see 5.3)
└─ Growth analytics    Analytics · Ad ROI (CPL / cost per conversion) · Source attribution ·
                       Staff response-time performance

MORE / CONTROL CENTER  (rarely touched, owner-heavy)
├─ Pricing & Rules     Tariffs · Fare rules · Rate card · Route distances · Cities / serviceable ·
│                      Car models · New-car-year · Assignment priority · Drop-bid & unassigned timeout
├─ Channels & Alerts   Email/SMTP · Notification triggers & sounds · Enquiry alarm · Maps API keys ·
│                      Website integrations / API keys
├─ Team                Staff · Roles & permissions · Activity log · Daily records · Team hub · Password/PIN
└─ Platform            System health · AI automation logs · Blocked IPs · Data archive · Audit logs
```
Every one of the ~89 screens in `REDESIGN_STATUS.md` fits one of these buckets; nothing needs to be deleted.

### 5.3 "Website & Brand" — parity with the website admin, then better
The website admin's Settings page has about 35 cards. Below is what they are, and where each lands in the app. The app already talks to the website through `api/admin-app-*.php` for enquiries, banners, coupons, tariffs, blocked IPs, referral claims and Sheets sync; extend that bridge rather than rebuilding.

| Website admin capability | In the app today | Proposed home |
|---|---|---|
| Enquiries, bookings, approvals, refunds, upcoming, customers, reports | mostly yes | Inbox / Dispatch / Customers |
| Tariffs, AirportTaxi tariffs | tariffs yes; airport tariffs not seen | Pricing & Rules (add airport tab) |
| Promotions: coupons, banners | yes | Marketing |
| Hero copy, top announcement bar, section visibility, SEO overrides, live-chat widget, logo | no | **Website & Brand** |
| WhatsApp number + editable templates, cancellation policy text | partly (`app-content`) | Website & Brand (single copy shared with the app) |
| Theme management, subdomain management, Websites & Domains (multi-brand) | only `website-integrations` | Website & Brand |
| SMTP, Telegram, SMS gateway, customer-notification matrix | SMTP + notification settings yes | Channels & Alerts |
| Google Sheets sync, bulk operations, print estimation, customize booking | sync yes | Website & Brand / Dispatch |
| Blocked IPs, spam protection, diagnostics, self-test | blocked IPs + system health | Platform |

Ways to go beyond the website admin [Suggestion]: role-scoped visibility, an audit trail for every settings change (who/when/old→new), draft-then-publish for hero/SEO/tariff edits, "test send" buttons for SMTP/WhatsApp/Telegram, a per-website context switch like the website's "Website Context" selector, and one-tap rollback of a settings version.

### 5.4 Navigation rules that will keep it tidy [Suggestion]
1. **Organise by job, not by app** (Dispatch, Verification, Money) instead of "Customer / Vendor / Driver".
2. **One screen, one home.** Remove duplicate entries (see M10); the same screen may be *linked* from Home "quick actions", but only defined once.
3. **Badges everywhere that has a queue** (approvals, documents, payouts, refunds, missed enquiries, SOS). A "Needs attention" strip on Home reads from `/admin/dashboard/needs-attention`, which already exists.
4. **Two dashboards, one shell.** Home shows role-appropriate KPIs. Operations Home = live trips, unassigned, approvals, SOS. CRM Home = new leads, missed enquiries, conversion, ad ROI.
5. **Search-first**: a global search (booking id, phone, driver, vehicle number) in the header.
6. **Split the mega-screens** (`orders.tsx`, `create-booking.tsx`, `team-hub.tsx`) into feature folders as you move them; do it during the restructure, not before.

---

## 6. Customer app — using the website as the reference

| Capability | Website | Customer app (from code search) | Suggestion |
|---|---|---|---|
| Instant quote with real distance | yes (`engine/tariff.php`, cached distances) | partial: real distance via server quote, but local fare and mock fallback | show the **server** fare only |
| One-way / round trip / multi-city / hourly | yes | yes | keep |
| Airport transfers (7 airports, fixed fare) | yes (`airport-transfer.php`) | no dedicated flow found [Verify] | add an Airport tab fed by the same airport table |
| Popular routes with fixed fares (the SEO pages) | yes | only mentioned in home/carpool [Verify] | "Popular routes" tiles from the backend route table |
| Coupons at checkout | yes (`validate-coupon`, `apply_coupon`) | only a mention on the home screen [Verify] | apply coupon on the booking summary |
| Transparent fare lines (bata, permit, toll, night) | yes (`fare-breakdown-format.php`) | summary only | render the server `FareBreakdownOut` as line items |
| Cancel with OTP + refund request | yes | cancel exists; refund only via wallet [Verify] | show the cancellation policy *before* booking and let users request a refund in-app |
| GST invoice view / download | yes (`invoice-gst.php`, `pay-gst-invoice`) | no UI found | "Invoices" in My Trips (backend endpoint exists; secure it first, C4) |
| Track booking by ID (guest) | yes (`track-booking.php`) | `live-trip.tsx` (logged-in) | add "track by booking id" |
| Share live location with family | tracking link | `safety.tsx` [Verify] | one-tap share + SOS on the trip screen |
| Reviews | token link | backend has ratings; UI [Verify] | prompt after trip, deep link from push |
| Language | English (site) | no `locales/` folder, while the driver app has one | Tamil first, since your AI assistant already answers in Tamil |

Engineering changes in the app [Suggestion]: delete the local `TARIFF` and the mock distance table; use the quote response as the single price object; get Razorpay `key` from the `/pay` response; pass the real customer email/phone to Razorpay; surface quote failures instead of silently falling back; and split `index.tsx` (2,487), `dropbid.tsx` (2,789), `standard.tsx` (2,230).

---

## 7. Wiring matrix — who reacts to each event [Suggestion]

| Event | Source | Customer app | Driver app | Admin **Operations** | Admin **CRM** | Website |
|---|---|---|---|---|---|---|
| Booking created | website / app / admin | confirmation | — | approval queue + badge | lead → customer timeline | status page |
| Approved / posted | admin or timeout | "finding driver" | broadcast push | live board | conversion | track page |
| Driver assigned | driver / admin | driver+car+OTP card, push | trip card | board + map | — | driver link / SMS |
| Trip started / ended | driver | live trip, receipt | OTP + odometer | telemetry, cash audit | LTV update | track page |
| Payment captured | Razorpay webhook | receipt | earnings | reconciliation view | revenue | invoice |
| Cancellation / refund | customer / admin | status | trip removed | refund queue | churn signal | status |
| SOS | customer | — | — | **top-of-screen alert** | — | — |
| Review submitted | customer | thanks | rating | quality case if low | feedback | reviews page |
| Lead / enquiry | website / call / ads | — | — | — | Inbox (one system) | source tag |

---

## 8. Roadmap [Suggestion]

**Phase 0 — this week, no API shape changes**
1. Put auth on every route in C1, C2, C4. Keep response schemas identical. Before each, grep the three mobile apps for callers so no shipped build is locked out.
2. Rotate the CRM webhook key; remove the `dropcars_crm_secret_2026` fallback.
3. Delete or password-protect the three website diagnostic files; purge `website/api/storage/*.jsonl` from git history if it contains real customers.
4. Start the OTP rollout (log-only first).
5. Add a Razorpay webhook + reconcile job.

**Phase 1 — 2–4 weeks**
6. Wallet atomic updates + a concurrency test. Rate limits on OTP/login/quote/geocode/AI, with `--proxy-headers` and a trusted-proxy setting.
7. Alembic baseline, moving the startup `ALTER` hooks into versioned migrations. GitHub Actions: lint, the 4 existing tests, plus new tests for fare rules, OTP, auth-required-on-admin-routes (a test that walks the router and fails on any unauthenticated non-allow-listed route).
8. Server-authoritative fare in the customer app and website.

**Phase 2 — 1–2 months**
9. Admin app restructure into Operations / CRM / Control Center (start with navigation only; the screens do not need rewriting).
10. Unify leads; customer-app parity items (airport, coupons, invoices, Tamil).
11. Rebuild the driver offline queue against real endpoints.

**Phase 3 — later**
12. Move website content/coupons/tariffs to backend as source of truth; retire duplicated PHP data files.

---

## 9. Decisions I need from you

1. **Third bucket.** You asked for two major sections (CRM and Operations). I added a thin "More / Control Center" for pricing rules, channels, staff and platform tools, because those don't belong to either and would otherwise re-create the Settings dumping ground. Are you happy with that, or do you want them folded inside the two sections?
2. **Where does "Website & Brand" live** — inside CRM (my suggestion) or as its own third tab?
3. **Auth hotfixes.** Do you want me to implement Phase 0 items 1–3 now on a branch? They are small and reversible, but item 1 needs your confirmation about which endpoints the shipped apps still call.
4. **Repo layout.** Should `customer-app/` be split so the driver/vendor route groups and the Kotlin tree stop living there?
5. **Which lead system wins** — backend `crm_leads` or the website `enquiries` table?
