# HANDOFF: Drop Cars review session (2026-09-30)

For the next Claude session. The user writes in Tamil / Tanglish and prefers replies in the same language. They asked to see the full plan before any execution, to be told clearly what is a fact and what is a suggestion, and to get expert-level depth. Keep answers simple and concrete; they said earlier answers were too technical.


## 0. Read BACKLOG.md
`BACKLOG.md` is the master list of EVERY pending task (IDs A1-J6, with status, dependencies, file zones, merge order and coordination rules). It exists so that several people/agents can work in parallel without colliding. Claim a task there before starting, work on a `fix/<id>-...` branch, never on `main`. Section 6 below is only a short summary of the order; BACKLOG.md is authoritative.

## 1. Repo and branch state (read this first)
- Repo: `nvitverse/Drop-Cars`.
- **`origin/main`** has the real ecosystem: `backend/` (FastAPI, Postgres/Cloud SQL, Cloud Run), `website/` (PHP + MySQL on Hostinger), `customer-app/`, `driver-app/`, `admin-panel/` (Expo React Native). Latest commits: `503da0b` (ecosystem), `c92d94a` (swap/SOS/WhatsApp templates by another agent, Antigravity).
- **This session's branch `claude/determined-volta-yw9pe8`** has an unrelated, older history (old Node/Express + Android + Vite scaffold, commits `7d1124f`, `e0f2309`) plus my doc commits on top. Its working tree does **not** contain the website/apps. Histories are unrelated (`refusing to merge unrelated histories`); I attempted a "bring main's tree in" merge but the shell tool failed, so it was **never done**.
- To read the real code: `git fetch origin main` then `git show origin/main:<path>` or `git archive origin/main <dir>`.
- Nothing in the codebase was modified by me. I only added documents (below). Nothing has been deployed.
- Tool caveats seen: the Bash tool intermittently returned "auto mode classifier gave no verdict" (transient; retry later). The GitHub MCP tools disconnect/reconnect at times.

## 2. What I produced (all committed and pushed to the branch)
| File | Content |
|---|---|
| `ARCHITECTURE_REVIEW.md` | Full senior review: findings (with file:line), flow analysis, single-source-of-truth proposal, admin restructure, customer-app parity, roadmap. Labels: Confirmed / Verify / Suggestion. |
| `NAVIGATION_PLAN.md` | Agreed admin-app navigation, screen-by-screen mapping, Home tile priorities, swap/login design, SOS design, website features to bring over, decision: backend master for leads. |
| `ANTIGRAVITY_PROMPT_website_fixes.md` | Detailed prompt for the website fixes (booking ID, icons, km limit, audit). |
| `REVIEW_c92d94a_AND_FIX_PROMPT.md` | Verified defects in commit `c92d94a` and a T1-T8 fix prompt. |
| `HANDOFF.md` | This file. |

## 3. Key findings so far (evidence is in `ARCHITECTURE_REVIEW.md`)
Critical / security (all on `origin/main`, confirmed by reading code):
1. `GET /api/orders/all` and `/api/orders/pending-all` have no auth and return `customer_name` and `customer_number`.
2. Whole `/api/crm/*` API has no auth; "owner only" is a `user_role` query param defaulting to owner; `GET /crm/owner/settings` returns the webhook secret; fallback secret `dropcars_crm_secret_2026` (`crm_routes.py:50,:273`); `status_code=44` typo at `:171`.
3. Trip OTP bypass: `order_assignments.py:809` (start) and `:970` (end) only check the OTP if the driver sent one. Driver app sends `''` in some cases, so enforce with a staged rollout (log-only, override path, then enforce).
4. Other open endpoints: SOS alerts, AI automation logs (+`seed-demo`), invoice PDF by guessable order id (`tax_admin.py:800-804`), `PUT /api/dropbid/settings`, unassigned-timeout writes, `bump-fare` (also broken: imports `Orders`).
5. Three different fare tables (backend rate card, website `tariffs.json`, customer-app `TARIFF`); customer app shows a locally computed fare but the server charges `quoted_total_amount`; mock-distance fallback (28 km).
6. No Razorpay webhook (`payment_reconcile.py` is empty); wallet read-modify-write without locks (`crud/wallet.py`); only 2 rate-limited endpoints; limiter probably keyed on the Cloud Run proxy IP.
7. Website: unauthenticated diagnostic files (`api/test_diag_live.php`, `check_insert_error.php` inserts a row per hit, `diag_booking_id.php`); `website/api/storage/bookings-log.jsonl` (354 records) committed; OTP send limit stored in `$_SESSION`.
8. No CI (until Antigravity's workflow), thin tests, migrations by ~20 startup `ALTER` hooks; driver-app offline queue is dead code pointing at non-existent routes.

Booking ID bug (root cause found):
- `website/assets/js/booking-form.js` `generateBookingId()` keeps the daily counter in the customer's own `localStorage`, so every new visitor gets `...01`; `confirm_booking.php` accepts a browser-supplied `C########` ID; `airporttaxi-confirm-booking.php:138` uses `random_int(1,99)`; `receive-remote-lead.php` uses another format. The correct server generator `dropcars_next_enquiry_booking_id()` (`admin/includes/enquiries-schema.php`) is fine.
- Agreed scheme: one shared daily counter, `E` + `YYMMDD` + `NN`; when the Nth enquiry is confirmed it becomes `C` + same digits (E26093002 -> C26093002); next enquiry continues (E26093004). Use IST for the date.
- Not fixed yet (shell failure). The user also wants: enquiry icon, green tick for confirmed, and km limit in the "Send Customer" email/message, plus a search for other missing fields. All of that is in the Antigravity prompt.

## 4. Decisions made with the user
- **Admin app tabs:** `Home | Bookings | Chats | Fleet | More`. Bookings has a switch `[CRM | Operations]` only (default Operations, first card Live Bookings). Fleet is its own tab (not inside Bookings).
- **Rule:** everything related to fleet (including wallet, payouts, activation requests, duty drivers) lives in Fleet; everything customer-related lives in CRM; chats have role chips in the bottom Chats tab and the same chat is reachable from Fleet/Customer screens (filtered).
- **Home tile priority:** SOS (only when active) > Leads on-time response (countdown, turns red) > booking approvals, unassigned bookings, unread chats > fleet activation requests > wallet/payout, refunds, other requests.
- **"Money" is not a section.** Fleet money in Fleet, customer money (refunds, invoices) in CRM, company-level (GST invoices, ledger) in Operations.
- **Duty drivers:** working drivers added by a fleet owner; they live inside their fleet (with the fleet's cars) and are findable via a bulk search section (drivers, duty drivers, vendors, owners with bulk actions).
- **Swap design:** car swap with a car already in another fleet -> OTP to the car's current owner; driver swap (licence already registered) -> OTP to the driver (pop-up in the duty-driver section of the driver app). Do not reveal the other owner's identity. Block on active trips. Admin override with reason. Wrong-login redirect only after correct credentials, pre-fill only what the user typed.
- **SOS design:** long-press trigger, GPS streaming every ~10 s, push + escalation at 60 s, admin screen with call buttons and 112, must never fail closed.
- **Leads:** backend is the long-term master ("one place"); for now the website DB (Hostinger, no extra cost) stays the working store, synced to Google Sheets, with sync-then-clear. Backend needs an `external_id` + upsert to avoid duplicates, and its CRM API must get auth first.
- **Cost:** Hostinger DB is bundled in the plan (no per-call charge). Google Cloud costs come from Cloud Run request time and Cloud SQL instance size/storage, not per query. Admin app polls (8-20 s) hit the website API (Hostinger) for enquiries and the Cloud Run backend for everything else. The user never gave me billing numbers; I have no access to their Google Cloud or Hostinger accounts and was not given permission to use any token found in the sandbox environment.
- Website features worth bringing into the apps (details in `NAVIGATION_PLAN.md` section 8): scheduled festival/peak pricing with strike-through, ready-to-send message buttons, reports (top routes, coupon ROI, cancel %), customer notification matrix, upcoming-assignments board, airport tariffs.

## 5. Review of Antigravity's work
- Commit `c92d94a` (on `main`) was reviewed. The app cannot start (`from app.models.orders import Orders`; only `Order` exists; reproduced with a real `ImportError`), the new SOS and swap endpoints have no auth, the swap OTP is never delivered, the new table/columns are never created, SOS URLs got a duplicate `/sos` prefix, no swap UI exists, templates hard-code 10% commission and print `#DC-`.
- The user then pasted a T1-T8 fix report from Antigravity (local folder `C:\Users\Administrator\Desktop\dropcars-review`). **Nothing was pushed** (I fetched: `origin/main` is still `c92d94a`, no new branch). I could not verify it. Concerns I raised:
  - `car_id INTEGER` in the swap audit SQL, but `CarDetails.id` is UUID.
  - `get_current_vehicle_owner` does not exist on `main`.
  - Deployment note names `WHATSAPP_API_KEY`/`SMS_API_KEY`; the code uses `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_ACCESS_TOKEN` with `DEMO_...` defaults (silent failure).
  - `GET /api/sos/stream/{id}` (was POST).
  - Auth-allowlist test says "critical routes", may not cover the whole route table.
  - Tests use mocks; unknown database; possible timezone-aware vs naive datetime bug.
  - **Shipped customer app sends SOS with bare `axios`, no token** (`customer-app/app/(customer)/safety.tsx:79`), so requiring auth on legacy `/api/sos/alert` would make SOS fail for customers in an emergency. SOS trigger should accept (rate-limited) and only tighten after the app is updated.
  - Still not covered by T1-T8: CRM auth, orders/all PII, trip-OTP bypass, invoice enumeration, Razorpay webhook, wallet locks, website ID/icon/km fixes.

## 6. What to do next (recommended order)
1. Ask Antigravity to push its work to a branch (`fix/swap-sos-startup-and-auth`), not `main`, and open a PR. Then review the real diff, run `python -c "import app.main"` and pytest in a clean env (needs `fastapi sqlalchemy psycopg2-binary python-dotenv pydantic` plus the rest of `requirements.txt`), and check the concerns in section 5.
2. **Do not deploy the backend from `main` until `import app.main` passes.** Ask the user which revision Cloud Run runs now (if `c92d94a` was deployed the API may be down). Rollback = previous Cloud Run revision.
3. Phase 0 security hotfixes (not started): auth on CRM, `/orders/all`, `/orders/pending-all`, SOS/AI-logs/invoice/dropbid/unassigned routes; rotate the CRM webhook key; remove the fallback secret; delete or protect the three website diagnostic files; decide about `bookings-log.jsonl` in git history; staged rollout of the trip OTP check; Razorpay webhook. A route-table auth test should fail on any unauthenticated non-allow-listed route.
4. Website fixes via `ANTIGRAVITY_PROMPT_website_fixes.md`: booking ID (server-only, shared counter, E to C), icons, km limit in customer messages, missing-field audit. The user must upload to Hostinger themselves.
5. Data sync plan (`DATA_SYNC_PLAN.md` was proposed but not written): backend `external_id` + upsert, website sync flags, batch sync, verify, dry run, backup, then clear; Google Sheets as archive; keep confirmed bookings (backend already has them after a count comparison).
6. Admin navigation rebuild (navigation only first): 5 tabs, Bookings switch, Home tiles, move the Settings items to the mapping in `NAVIGATION_PLAN.md`, merge the two lead inboxes, add an SOS Home tile.
7. Cost reduction later: replace polling with push, one unread-count endpoint, keep the latest driver location in memory and save to DB at trip end, cache `get_fare_rules()`. Only after the user shares Google Cloud billing numbers.
8. Customer app: use the server quote only (remove the local tariff and mock distance), real email/phone for Razorpay, Tamil localisation, airport flow, coupons, invoices.

## 7. Open questions for the user
1. Which lead system is the "master" in the meantime? (Decision recorded: backend long term, website DB working store for now; confirm.)
2. Is a fleet owner allowed to trigger SOS, or only customers and drivers? (Not answered.)
3. Swap OTP routing as described in section 4: confirm.
4. Is "Duty driver" the same as `CarDriver` with `is_owner_driver = false`? (User described them as working drivers added by fleet owners; code has `CarDriver.vehicle_owner_id` and `is_owner_driver`.)
5. Which backend revision is live, and can they share the Cloud Run / Cloud SQL / Hostinger usage numbers?
6. Do they want `DATA_SYNC_PLAN.md` written?

## 8. Things not verified
- Runtime behaviour of anything (I never ran the stack or hit a database).
- Whether the `/crm/*` and other open endpoints are actually exposed in production (depends on deployment).
- Billing/cost numbers.
- Whether `main` is deployed automatically (no CI existed before Antigravity's workflow, so probably manual).
