# BACKLOG: every pending task from the plan (single source of truth)

Last updated: 2026-09-30. Read `HANDOFF.md` first for context and decisions. Evidence for every item is in `ARCHITECTURE_REVIEW.md`, `NAVIGATION_PLAN.md`, `REVIEW_c92d94a_AND_FIX_PROMPT.md`, `ANTIGRAVITY_PROMPT_website_fixes.md`.

Status values: `TODO` (nobody started), `CLAIMED` (someone is working, see Owner/Branch), `IN REVIEW` (PR open), `DONE`, `BLOCKED` (needs a decision or input).
Nothing below is implemented on `origin/main` unless the Status says DONE. As of this update, `origin/main` = `c92d94a` (broken, see A1). Open PRs: #1 (A2 fix branch, CI green), #2 (N1 notify).

---

## 0. Coordination rules (so parallel work does not collide)
1. **Never commit to `main` directly.** One task = one branch from the latest `main`: `fix/<id>-<short-name>`. Open a PR. Rebase on `main` before asking for review.
2. **Claim before you start:** in this file change Status to `CLAIMED` and fill Owner (Claude session / Antigravity / user) and Branch. Push that one-line change to the docs branch `claude/determined-volta-yw9pe8` (or tell the user). Do not start a task that is `CLAIMED` by someone else.
3. **Stay inside your zone** (section 1). If you must touch a hot-spot file, make it a tiny separate commit and mention it in the PR.
4. **Merge order matters:** A -> B -> C/D -> F -> E -> G/H/I -> J (see section 2). Do not build UI on an endpoint that is not merged.
5. **No breaking API changes:** shipped mobile apps (customer, driver) are live. Add, do not rename or remove, unless the task says so and an app release is scheduled.
6. **Do not deploy** without the user. Deploy = manual (no CD exists). Website is uploaded to Hostinger by the user. Backend: Cloud Run. Rollback = previous Cloud Run revision.
7. Report facts as Confirmed / Verify / Suggestion. Never claim "tests pass" without pasting output. Never claim "pushed" without the commit hash on `origin`.
8. The user prefers Tamil/Tanglish replies, simple language, plan first.

## 1. File zones and hot spots
| Zone | Paths | Tasks |
|---|---|---|
| Z-BACKEND-AUTH | `backend/app/api/routes/{crm_routes,orders,new_orders,ai_automation_log_routes,drop_bid_routes,unassigned_booking_routes,tax_admin,hourly_rental,document_verification,ai_whatsapp_assistant}.py`, `core/limiter.py` | B1-B7 |
| Z-BACKEND-SOSSWAP | `routes/{sos,fleet_swap}.py`, `models/{sos_alert,fleet_swap_audit}.py`, `routes/{vehicle_owner,car_driver}.py` (login hint) | A2, B4, F1-F3 |
| Z-BACKEND-MONEY | `crud/{wallet,vendor_wallet}.py`, `routes/wallet.py`, `routes/customer_bookings.py` (verify), new webhook route | B8, B9 |
| Z-BACKEND-LEADS | `routes/{crm_routes,website_bookings}.py`, `models/{crm_models,customer_booking_request}.py` | C6, D1 (also touches B1: same file `crm_routes.py`, do B1 first) |
| Z-WEBSITE-IDS | `website/assets/js/booking-form.js`, `api/{confirm_booking,send-enquiry,airporttaxi-confirm-booking,receive-remote-lead,partner-request}.php`, `admin/includes/enquiries-schema.php` | C1, C5 |
| Z-WEBSITE-MSG | `website/includes/notification-engine.php`, `admin/pages/customize-booking.php`, email templates, `pages/thank-you.php`, `helpers/telegram.php` | C2, C3, C4 |
| Z-WEBSITE-SEC | `website/api/{test_diag_live,check_insert_error,diag_booking_id,send_email_otp}.php`, `admin/pages/settings.php`, `.gitignore` | B10 |
| Z-WEBSITE-SYNC | `website/admin/pages/sync-and-reset.php`, `includes/google-sheet-sync.php`, `api/includes/backend-client.php` | D2 |
| Z-ADMIN-NAV | `admin-panel/app/(tabs)/_layout.tsx`, `(tabs)/index.tsx`, `(tabs)/settings.tsx`, new hub screens | E1-E3, E6 |
| Z-ADMIN-FLEET | `admin-panel/app/{fleet-owner-detail,vendor-detail}.tsx`, `(tabs)/{fleet-hub,accounts,vendors,vehicle-owners}.tsx` | E4, F4, F5 |
| Z-ADMIN-CRM | `admin-panel/app/{crm,enquiries,customer-detail}.tsx`, `(tabs)/customers.tsx`, `services/crmApi.ts`, `enquiriesApi.ts` | D3, D4, E5, G* |
| Z-ADMIN-SOS | `admin-panel/app/sos-alerts.tsx`, alarm host components | E7 |
| Z-CUSTOMER-APP | `customer-app/**` (only the `(customer)` group; do not touch `(driver)`, `(vendor)`, Kotlin tree) | H* |
| Z-DRIVER-APP | `driver-app/**` | F1, F3, I* |
| Z-PLATFORM | `backend/Dockerfile`, `.github/workflows`, `backend/tests`, migrations | J* |

**Hot spots (conflict magnets), edit as tiny isolated commits and rebase often:** `backend/app/main.py` (router includes and startup ALTER hooks), `admin-panel/services/api.ts`, `backend/app/core/security.py`, `.gitignore`, `package.json`.

## 2. Suggested merge order
A1, A2 -> B1..B7, B10, B11 (in parallel, different files) -> B8, B9, C1, C6, D1 -> C2..C5, D2 -> F1..F3 -> E1..E7 -> G, H, I -> J.

---

## A. Emergency (do first)
| ID | Task | Status | Depends | Acceptance |
|---|---|---|---|---|
| A1 | Find which Cloud Run revision is live. If `c92d94a` was deployed, roll back to the previous revision. User-only action. | TODO | user | Live revision recorded here; API healthy (`/docs` loads). |
| A2 | Antigravity T1-T8 work exists only on the user's machine (`C:\Users\Administrator\Desktop\dropcars-review`), **not pushed**. Push to `fix/swap-sos-startup-and-auth` (not `main`), open PR, then review the real diff. Review checklist: `car_id` type (must be UUID, `CarDetails.id` is UUID), `get_current_vehicle_owner` exists, env var names (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`; no silent `DEMO_` defaults in prod), `stream` method (was POST), auth test covers the WHOLE route table not a hand-picked list, tests run on Postgres not mocks, tz-aware vs naive datetime compare, migrations run on a copy of production DB, SOS legacy `/api/sos/alert` must not fail closed (see B4). | IN REVIEW, [PR #1](https://github.com/nvitverse/Drop-Cars/pull/1), branch `fix/swap-sos-startup-and-auth`, Owner: Claude session. Pushed + reviewed; CI green on `0e1f5b5` (import OK, pytest 32 passed 1 xfailed on Postgres, admin tsc OK). Remaining: migration on a prod copy (user). | user | PR merged only after: `python -c "import app.main"`, pytest, `tsc --noEmit` outputs pasted; migration tested on prod-copy. |

## B. Security hotfixes (Phase 0; no response-schema changes)
Before locking any route, grep `customer-app`, `driver-app`, `admin-panel`, `website` for callers so shipped builds are not cut off.
| ID | Task | Status | Depends | Acceptance |
|---|---|---|---|---|
| B1 | `/api/crm/*`: real JWT auth (admin; owner-only via token role, never `user_role` query param). Rotate webhook key, remove fallback `dropcars_crm_secret_2026` (fail closed if unset). Fix `status_code=44` -> 404. Update `admin-panel/app/crm.tsx:82` (hard-coded `'owner'`) and `services/crmApi.ts`. Lead intake webhook keeps key auth, compare with `hmac.compare_digest`. | TODO | - | Unauthenticated calls return 401/403; admin app CRM still works. |
| B2 | Auth on `GET /api/orders/all` and `GET /api/orders/pending-all` (leak `customer_name`, `customer_number`). Check which app calls them (vendor? owner?) and allow those roles. | TODO | - | 401 without token; owner/vendor/admin apps still load lists. |
| B3 | Trip OTP bypass (`order_assignments.py:809` start, `:970` end): enforce only when an OTP is stored. **Staged:** (1) log-only counter of empty-OTP starts for ~1 week; (2) driver-app "customer didn't get OTP" -> resend / admin override with reason; (3) enforce behind env flag `TRIP_OTP_ENFORCED`. Also 6-digit, attempt cap (5), limiter on website `/website/trip-link/{token}/start`. | TODO | driver-app change (I2) | Empty OTP rejected when flag on; legit no-OTP flows have an override path. |
| B4 | SOS: (a) admin routes (`active`, `alerts`, `acknowledge`, `resolve`) admin-only, names from token; (b) **trigger must never fail closed**: accept, rate-limit by IP + phone, verify token only if present; (c) update `customer-app/(customer)/safety.tsx:79` (bare `axios`, no token) to send the token, THEN tighten; (d) real alerting: push to on-duty admins, 60 s escalation via WhatsApp/SMS, activity log. (Antigravity T4 covers part; reconcile with A2.) | PARTLY IN REVIEW ([PR #1](https://github.com/nvitverse/Drop-Cars/pull/1)): (a) done, (b) legacy alert open + rate limited + pushes staff, (d) push to admins done. (c) customer-app token and 60 s WhatsApp/SMS escalation still TODO. | A2 | Customer SOS works from the currently shipped app; admin endpoints reject non-admins. |
| B5 | Auth on: `GET /admin/ai-automation-logs`, `/{id}`, remove or protect `seed-demo`; `PUT /dropbid/settings`; `/admin/settings/unassigned-timeout` (POST), `/admin/auto-remove-unassigned`; `PUT /orders/{id}/bump-fare` (also fix import `Orders` -> `Order`); `POST /refresh-rental-hrs-data`; auth or rate-limit `/documents/verify-image`, `/verify-face-match`, `/ai/chat-assistant` (cost abuse). | PARTLY IN REVIEW ([PR #1](https://github.com/nvitverse/Drop-Cars/pull/1)): unassigned-timeout GET/POST, auto-remove-unassigned, bump-fare locked (bump-fare now 410, it wrote a non-existent column). Rest TODO; each open route is listed in `backend/tests/test_route_auth_allowlist.py` KNOWN_OPEN_TODO. | - | Route-table test (B11) passes. |
| B6 | Invoice PDF routes (`tax_admin.py:800-804`): require customer/admin auth and ownership of the booking; stop accepting digit-only ids from anonymous callers (use a signed token in the emailed link if needed). | TODO | - | Enumeration by order number returns 401/404. |
| B7 | Rate limits: phone/email OTP request, sign-in, password reset, quote, geocode, AI endpoints. Fix client-IP detection (uvicorn `--proxy-headers --forwarded-allow-ips`, or trusted-proxy config) so limits are per client, not per Cloud Run frontend. Website key compare `hmac.compare_digest` (`website_bookings.py:50`). | TODO | J4 | Verified per-client limiting. |
| B8 | Razorpay: webhook (`payment.captured`), idempotent mark-paid, reconcile job for "captured but not verified"; implement `crud/payment_reconcile.py` (currently 0 bytes). | TODO | - | Kill-the-app-after-payment test still ends with a paid booking. |
| B9 | Wallet: atomic updates or `SELECT ... FOR UPDATE` in `crud/wallet.py`, `vendor_wallet.py`; concurrency test. | TODO | - | Two parallel debits cannot overdraw. |
| B10 | Website: delete or password-protect `api/test_diag_live.php`, `check_insert_error.php` (inserts a row per hit), `diag_booking_id.php`; move OTP send rate limit out of `$_SESSION` (`send_email_otp.php:28`); verify CSRF on admin POSTs (none found under `admin/`); `settings.php:115` deletes a blocked IP via GET; decide on purging `website/api/storage/*.jsonl` from git history (user decision); make sure `init-admin.php` default creds and `seed-local-admin.sql` are never run on prod. | TODO | user decision on history purge | Diagnostic URLs return 403/404. |
| B11 | Test that walks the FastAPI route table and fails for any route without an auth dependency that is not in an explicit public allow-list (sign-in/up, quotes, city lists, password reset, token links, webhooks). | IN REVIEW ([PR #1](https://github.com/nvitverse/Drop-Cars/pull/1)): walks every route's dependency tree; open routes must be listed; list can only shrink; SOS/fleet-swap strict. | - | Runs in CI. |
| B12 | Cleanups: remove debug `print()` (`security.py:96` prints `token_version`, others in `order_assignments.py`, `orders.py`); pin CORS for admin web build; shorten customer token lifetime (10 years) with refresh; run container as non-root. | TODO | - | - |
| B13 | Unauthenticated routes with no B-item yet (found by the B11 test): `booking-chat` threads/orders (GET+POST), `carpool` journeys/requests, `driver/route-requests` (POST/GET/DELETE), `orders/{id}/trigger-route-assign`, both `advance-received` PUTs, `profile-edit-requests/submit`, `trip-review/link/{order_id}`. Grep callers first. | TODO | - | Remove each from KNOWN_OPEN_TODO in the same PR. |
| B14 | Unassigned-booking auto-removal is a silent no-op on main: `utils/unassigned_booking_expiry.py` filters `NewOrder.Driver_assigned`/`Car_assigned` (do not exist), catches the error and returns success. Recorded as strict xfail in `tests/test_unassigned_booking_expiry.py`. | TODO | - | xfail flips to pass. |
| B15 | `fleet_driver_swap_audit.otp_code` (plaintext OTPs from c92d94a) is still on prod; clearing it deletes data, needs the owner's OK. | BLOCKED (owner decision) | A2 | Column nulled or dropped. |
| N1 | Manual "Notify drivers again" alarm (Vendor/Admin/Driver App) + uploaded MP3 applied to new-booking pushes. Vendor App button lives in the separate vendor repo (not in this monorepo). | IN REVIEW, [PR #2](https://github.com/nvitverse/Drop-Cars/pull/2), branch `feat/manual-notify-drivers`, Owner: Claude session. Depends on [PR #1](https://github.com/nvitverse/Drop-Cars/pull/1) (main does not import). | A2 | Verified merged on #1: pytest 32 passed 1 xfailed; admin + driver tsc OK. |

## C. Website fixes (Antigravity prompt: `ANTIGRAVITY_PROMPT_website_fixes.md`)
| ID | Task | Status | Depends | Acceptance |
|---|---|---|---|---|
| C1 | **Booking ID.** Root cause: `booking-form.js` `generateBookingId()` counter in the browser `localStorage`; `confirm_booking.php` trusts a browser `C########`; `airporttaxi-confirm-booking.php:138` uses `random_int(1,99)`. Scheme (agreed): one shared daily counter, `E`/`C` + `YYMMDD` + `NN`; confirming keeps the number (`E26093002` -> `C26093002`); next enquiry continues (`E26093004`). IST date. Server-only IDs. UNIQUE index on `booking_id` (report existing duplicates, do not delete). Fix generator fallback (never return `...01` when DB and counter file are both unavailable). | TODO (prompt written, not run) | - | CLI test: 20 sequential + 10 parallel calls, no gaps/duplicates; E to C keeps number. |
| C2 | Icons: enquiry icon on `E...`, **green tick** on `C...`, everywhere an ID is shown (admin lists, emails, Telegram, customer pages). One shared helper; emoji (`📩`, `✅`) in email/Telegram. | TODO | C1 (same ID format) | Visible in admin, email and Telegram. |
| C3 | Km limit (min billable km / included km per day / extra km rate) in the "Send Customer" message, confirmation email, quote message, thank-you, print-estimation. Read from tariff data, never hard-code. Do not change fare math. | TODO | - | Present in all listed outputs. |
| C4 | Audit table: customer-facing outputs vs fields (booking ID, pickup/drop, date/time, vehicle, km limit, fare, advance/balance, driver details, tracking link, cancellation policy, support number); fix low-risk gaps, list the rest. | TODO | C3 | Table in PR. |
| C5 | Other places that mint IDs: `receive-remote-lead.php` (`'B'/'E' . date('YmdHis') . rand`), `check-trip-status.php` (`'DC-' . id` fallback), etc. | TODO | C1 | Single generator. |
| C6 | Website -> backend booking sync idempotency: `CustomerBookingRequest` has no external website booking id column, so retries can create duplicate bookings. Add `external_id` (unique) + upsert; outbox/retry buffer on the website. | TODO | B1 for `/crm/lead` | Replaying the same POST twice yields one booking. |

## D. Leads and data sync (decision: backend master long term; website DB is the working store now)
| ID | Task | Status | Depends | Acceptance |
|---|---|---|---|---|
| D1 | Backend `crm_leads`: add `external_id` (unique, upsert), response-time fields, notes, alarm fields needed by the SLA logic; authenticate intake by website key. | TODO | B1 | Replay-safe intake. |
| D2 | Website "sync then clear": per-row flags (`synced_backend`, `synced_sheet`, `verified`), 50-row batches (Hostinger time limits), dry run, mandatory backup first, verify by asking backend "do these ids exist?", delete only rows with both flags; 90-day retention for enquiries; keep confirmed/completed bookings (backend has them) after a count comparison; clear only on button click. `sendToGoogleSheet` currently times out at 1 s fire-and-forget, so "synced" cannot be trusted; add real confirmation. | TODO | D1, C6 | Dry run report; no row deleted without both flags. |
| D3 | Merge the two lead inboxes in the admin app (`enquiries.tsx` reads the website API; `crm.tsx` reads backend `crm_leads`) into one list with a source tag and de-duplication by phone + time. | TODO | D1 | One inbox. |
| D4 | Lead SLA: Home tile with countdown that turns red (reuse `EnquiryAlarmHost` logic and 5-min/15-min star thresholds). | TODO | D3 | Tile visible on Home. |
| D5 | Write `DATA_SYNC_PLAN.md` from D1-D2. | TODO | - | File exists. |
| D6 | Google Sheets: restrict sharing (contains phone numbers); monthly row-count check. Ops task for the user. | TODO | - | - |

## E. Admin app navigation (navigation first, no screen rewrites)
Layout (UPDATED 2026-10-01, owner's decision): `Home | Operations | Chats | Fleet | More`; the Operations tab has switch `[CRM | Bookings]` (default CRM; Bookings segment's first card Live Bookings; Home tiles deep-link into the right segment). Older wording "Bookings tab > [CRM | Operations]" is obsolete. Full screen mapping in `NAVIGATION_PLAN.md`.
| ID | Task | Status | Depends | Acceptance |
|---|---|---|---|---|
| E1 | Tab bar (rename Bookings tab to Operations) and the [CRM | Bookings] switch (default CRM) (`(tabs)/_layout.tsx`); keep permission keys via `canSee`. | TODO | - | 5 tabs, back-behaviour preserved. |
| E2 | Home tiles in priority order with counts and oldest-wait time: SOS (only when active) > leads on-time > approvals / unassigned / unread chats > fleet activation > wallet & payout / refunds / other requests. Use `/admin/dashboard/needs-attention` where it fits. | TODO | E1, D4, E7 | - |
| E3 | Fleet tab: fleet owners, drivers, duty drivers (inside each fleet with its cars), vendors, cars, activation requests (documents, face audit, profile edits), wallet & payments (wallet, payouts, transfers, cash audit, billing, referral claims), quality, vacant cities, bulk search + bulk actions. | TODO | E1 | - |
| E4 | CRM segment: leads/enquiries, customers, refunds, coupons, banners, analytics, website/brand, customer chat button. Move Customers and Ratings out of Fleet. | TODO | E1, D3 | - |
| E5 | Chats: role chips `All / Customer / Fleet owner / Driver / Duty driver / Vendor / Booking`. **Verify** backend messages carry a role tag; add it if not. | TODO | - | Filters work. |
| E6 | More: regroup Settings by job (pricing & rules, alerts & channels, team, platform); remove duplicate menu entries (Dashboard lists Emergency Bids, GST Invoices, Staff Management twice; Settings links `notification-settings` and `alarm-settings` twice). | TODO | E1 | - |
| E7 | SOS in admin: fix URLs to match backend, global red banner + siren (reuse alarm hosts), Home tile, names from the logged-in staff (currently hard-coded `'Duty Operator'`), push instead of 10 s polling. | TODO | A2, B4 | Alarm rings without the SOS screen open. |
| E8 | Later: split `orders.tsx` (4.6k lines), `create-booking.tsx`, `team-hub.tsx`; retire `(tabs)/settings.tsx`. | TODO | E6 | - |

## F. Fleet, driver and car swap; login redirect (design in `NAVIGATION_PLAN.md` section 6)
| ID | Task | Status | Depends | Acceptance |
|---|---|---|---|---|
| F1 | Driver swap: OTP goes **to the driver** (push + pop-up in driver app duty-driver section via `GET /fleet-swap/pending-for-driver`, SMS/email fallback); OTP never returned in API; 6 digits, hashed, 10 min, 5 attempts, UUID swap id, per-user rate limit. Blocked by active assignment / pending payout. | IN REVIEW ([PR #1](https://github.com/nvitverse/Drop-Cars/pull/1)): OTP push to driver (helper was missing, now real), never in responses (tested), hashed, tz-aware 10 min, 5 attempts, re-check at verify. Needs E2E on a device. | A2 | E2E on a device. |
| F2 | Car swap: car number already registered under another owner -> OTP to that owner; mask identity; same safety rules. | IN REVIEW ([PR #1](https://github.com/nvitverse/Drop-Cars/pull/1)): OTP now actually pushed to the current owner (was never sent). | A2 | - |
| F3 | Wrong-login redirect: only after correct credentials return `redirect_hint`; apps switch screen and pre-fill only what the user typed; no account-existence leak before auth. Extend the existing `signin-as-owner`. | IN REVIEW ([PR #1](https://github.com/nvitverse/Drop-Cars/pull/1)): keeps 404 NOT_REGISTERED (a 200 without token broke the shipped Driver App); hint in `X-Account-Role-Hint` header after the password matches. App side (read the header) TODO. | - | - |
| F4 | Swap UI in admin `fleet-owner-detail.tsx` (request, OTP, admin override with reason >= 10 chars; admin name from token). c92d94a has none. | IN REVIEW ([PR #1](https://github.com/nvitverse/Drop-Cars/pull/1)): admin can only use the audited override (OTP routes need a fleet-driver token); payload fixed. | F1 | - |
| F5 | Fleet bulk search section (drivers + duty drivers + vendors + owners, select, bulk notify/block/activate/export). Base: `(tabs)/accounts.tsx`. | TODO | E3 | - |

## G. Website features to bring into the apps (details in `NAVIGATION_PLAN.md` section 8)
| ID | Task | Status |
|---|---|---|
| G1 | Scheduled festival/peak pricing (from/to dates, old price strike-through, reason note); needs backend rate-card date fields; admin Pricing screen; customer app strike-through. Website source: `tariffs.json` fields `is_dynamic`, `strike_on`, `effective_from/until`, `old_per_km_rate`, `reasoning_note`. | TODO |
| G2 | Ready-to-send messages per booking (Confirmed, Quote, Advance, Driver details, Group post, Updates), editable Tamil/English. Fix c92d94a templates: commission from `/admin/commission-rates` (hard-coded 10% now), advance % from settings, print booking ID as stored (`#DC-` prefix conflicts with the new ID scheme). | TODO |
| G3 | Reports: top routes, coupon usage/ROI, cancel % and reasons. | TODO |
| G4 | Customer notification matrix (event x Email/SMS/WhatsApp). | TODO |
| G5 | Upcoming assignments board (next 24 h, unassigned, one-tap post). | TODO |
| G6 | Airport tariffs (7 airports) and airport flow. | TODO |
| G7 | Live toll cache per route (limit Google Routes cost). | TODO |
| G8 | Google Calendar sync. | TODO (low) |
| G9 | Quote follow-up reminder (no reply in ~2 h), repeat-customer tag, one-tap lead -> booking (`/crm/leads/{id}/convert` exists). | TODO |

## H. Customer app
| ID | Task | Status |
|---|---|---|
| H1 | Server quote only: delete local `TARIFF` (`constants/bookingConfig.ts`) and mock distance table (`utils/taxiPricing.ts`); render `FareBreakdownOut` lines; show an error when the quote call fails instead of silently using a 28 km fallback. | TODO |
| H2 | Razorpay: take `key` from the `/pay` response (hard-coded `rzp_live_...` id at `standard.tsx:485`), real customer email/phone (currently `<phone>@dropcars.in`, fallback `9999999999`). | TODO |
| H3 | Airport flow, popular routes tiles, coupon at checkout, invoice center (after B6), track by booking id, cancellation policy shown before booking, in-app refund request, Tamil localisation. | TODO |
| H4 | SOS: send auth token in `safety.tsx` (prerequisite for tightening B4). | TODO |

## I. Driver app
| ID | Task | Status |
|---|---|---|
| I1 | Rebuild the offline queue (`services/offline/offlineQueueService.ts` is unused and calls non-existent routes) against the real endpoints with client-generated idempotency keys. | TODO |
| I2 | Empty-OTP override / "resend" UI (B3), swap pop-up (F1), wrong-login redirect handling (F3). | TODO |
| I3 | Driver-side SOS trigger (if approved). | TODO (decision) |

## J. Platform, cost, hygiene
| ID | Task | Status |
|---|---|---|
| J1 | Alembic baseline; replace the ~20 startup `ALTER` hooks and the `Testing code/run_*_migration.py` scripts. | TODO |
| J2 | CI: verify Antigravity's `.github/workflows/ci.yml` after A2; add tests for fare rules, OTP, wallet concurrency, auth allow-list. | TODO |
| J3 | Cost (after billing numbers): replace polling with push (admin polls 8-20 s: booking alarm 8 s, enquiry alarm 10 s, unread chats 20 s x2 calls, Bookings list 20 s, Chats 10 s; driver location write every 20 s; customer live-trip 12 s), single unread-count endpoint, buffer driver location and write at trip end, cache `get_fare_rules()` (opens a new DB session per call), review pool sizes (`pool_size=20`, `max_overflow=10` per instance). | TODO (blocked on user sending Cloud SQL / Cloud Run / Hostinger numbers) |
| J4 | Dockerfile: non-root user, `--proxy-headers`, worker count, drop `tesseract` if unused. | TODO |
| J5 | Repo hygiene: `customer-app/` contains `(driver)` and `(vendor)` route groups and a 86-file Kotlin tree; decide whether to split. `admin-panel/docs/ADMIN_FEATURE_PARITY.md` claims strict backend permission enforcement and "0 missing"; correct it. | TODO (decision) |
| J6 | Git housekeeping: branch `claude/determined-volta-yw9pe8` has unrelated history (old scaffold) plus 5 doc commits. Recommended: open a PR that adds only the `*.md` docs to `main` (or keep the docs on a `docs/` folder), and stop using the old-scaffold history. | TODO (decision) |

---

## Open decisions (BLOCKED until the user answers)
1. Fleet owner can trigger SOS? (default suggestion: yes)
2. Swap OTP routing: car -> car's current owner, driver -> driver. Confirm.
3. `Duty driver` = `CarDriver` with `is_owner_driver = false` (added by a fleet owner)? Confirm.
4. Purge `website/api/storage/*.jsonl` from git history? (needs force-push and key rotation thinking)
5. Split `customer-app/`? Bring only the docs into `main`?
6. Which Cloud Run revision is live? Billing numbers?
