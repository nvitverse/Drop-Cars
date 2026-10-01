# HANDOFF: Drop Cars review session (2026-09-30)

For the next Claude session. The user writes in Tamil / Tanglish and prefers replies in the same language. They asked to see the full plan before any execution, to be told clearly what is a fact and what is a suggestion, and to get expert-level depth. Keep answers simple and concrete; they said earlier answers were too technical.


## 0. Read BACKLOG.md
`BACKLOG.md` is the master list of EVERY pending task (IDs A1-J6, with status, dependencies, file zones, merge order and coordination rules). It exists so that several people/agents can work in parallel without colliding. Claim a task there before starting, work on a `fix/<id>-...` branch, never on `main`. Section 6 below is only a short summary of the order; BACKLOG.md is authoritative. **Section 9 at the end is the ready-to-paste takeover prompt for a new session.**

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
- **Admin app tabs (UPDATED 2026-10-01, owner's decision):** `Home | Operations | Chats | Fleet | More`. The bottom tab is named Operations and has a switch `[CRM | Bookings]` only (default CRM; Bookings segment's first card is Live Bookings; Home tiles deep-link into the right segment). The older wording "Bookings tab > [CRM | Operations]" is obsolete. Fleet is its own tab (not inside Bookings).
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
6. Admin navigation rebuild (navigation only first): 5 tabs (Operations tab with [CRM | Bookings] switch, default CRM), Home tiles, move the Settings items to the mapping in `NAVIGATION_PLAN.md`, merge the two lead inboxes, add an SOS Home tile.
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

---

# 9. READY-TO-PASTE TAKEOVER PROMPT (autonomous; no questions) - UPDATED 2026-10-01
Paste everything inside the fence below as the FIRST message of a new Claude session (ideally Claude Code on the owner's machine). This version reflects what is ALREADY merged on `origin/main` (PR #1 to #18). The older version of this prompt (written when main was `c92d94a`) is obsolete: do not use it.

````
You are taking over an in-progress engineering project for "Drop Cars" (outstation / one-way taxi platform, Tamil Nadu) from other Claude sessions. Work autonomously. Do NOT ask me questions that are answered below. Decisions are already made. Stop and ask ONLY if you are about to: deploy, force-push, delete data/history, use credentials, or push to `main`.

## HOW TO REPLY
I write Tamil/Tanglish. Reply in Tanglish (Tamil in English letters, technical words in English), simple and short. After each step give a 5-line status: what you did, evidence (command output / commit hash), what is next. Label claims Confirmed / Verify / Suggestion. Never claim "tests pass" or "pushed" without pasting the output or the commit hash.

## REPO
github.com/nvitverse/Drop-Cars
- Real code: branch `main` (backend FastAPI + Postgres/Cloud SQL on Cloud Run; website PHP + MySQL on Hostinger; customer-app, driver-app, admin-panel = Expo React Native). Other people/sessions are merging PRs into main continuously.
- Handoff docs: branch `claude/determined-volta-yw9pe8` (unrelated older history; only the docs matter):
    git fetch origin
    git show origin/claude/determined-volta-yw9pe8:HANDOFF.md
    git show origin/claude/determined-volta-yw9pe8:BACKLOG.md      (master task list A1..J6 + B13-B15, N1; file zones; merge order)
    git show origin/claude/determined-volta-yw9pe8:NAVIGATION_PLAN.md
    git show origin/claude/determined-volta-yw9pe8:ARCHITECTURE_REVIEW.md
    git show origin/claude/determined-volta-yw9pe8:ANTIGRAVITY_PROMPT_website_fixes.md
- IMPORTANT: BACKLOG.md statuses LAG behind main (its header still says "main = c92d94a"). Before starting ANY task, verify its real state on origin/main with `git grep` / `git show origin/main:<path>`. Trust the code, not the doc. Note PR #7 ("restore code silently lost in the 2026-09-25 13:31 deploy"): deployments have dropped code before, so never assume main == what runs in production.

## STEP 0 (do first, small): sync the docs to reality
Run the checks in the list below, then update BACKLOG.md statuses/header to match main (DONE + PR numbers), and push ONLY that change to the docs branch (fast-forward; fetch first because other sessions also edit BACKLOG.md; never force-push).

## ALREADY DONE ON main (verified by reading origin/main on 2026-10-01; do NOT redo)
- A2/T1-T8: the `Orders` import crash is fixed; swap + SOS + startup migrations merged (PR #1); CI `.github/workflows/ci.yml` and backend/tests exist (BACKLOG records: import OK, pytest 32 passed + 1 xfailed on Postgres, admin tsc OK at 0e1f5b5). Car swap (`/fleet-swap/request-car-swap`), `GET /fleet-swap/pending-for-driver`, swap UI in admin `fleet-owner-detail.tsx` exist.
- B1: /api/crm/* now needs get_current_admin; `user_role` query param is ignored; the `status_code=44` typo is gone. (Verify: webhook key rotated by the owner? `_LEAKED_DEFAULT_KEY` constant is kept to reject the old default.)
- B2: GET /orders/all and /orders/pending-all need an admin token. (Verify callers: vendor/owner apps that used them may now get 401.)
- B5: auth added on unassigned-booking routes, AI automation logs, dropbid settings. B11: route-table "open routes" test (PR #1, #4; commit d36078d "nothing answers without a login except sign-in/up and token links").
- F3 backend half: wrong-login hint is returned as `X-Account-Role-Hint` header after the password matches (404 NOT_REGISTERED is kept so the shipped Driver App does not break).
- Other merged PRs not in the original plan (do not redo/revert): #2 "Notify drivers again" + notification MP3, #3 OTP visibility + deadline warnings, #5 sounds on every notification, #6 nine latent NameErrors + CI guard, #7 restore lost code, #8 connect to Cloud SQL through the socket (DB_HOST=/cloudsql/...), #9 WhatsApp-style chat, #10 OTA max workers, #11 remove Vendor checkbox in admin Post booking, #12 customer number typed with a space, #13/#15 admin min km + website bata + "Km limit loads real route km" (this is the ADMIN quote/post-booking form, not the website customer emails), #14/#16 customer number countdown + reveal rule, #17 form polish + place search hygiene, #18 extras + GST for all-inclusive + per-booking commission %. Branch `feat/admin-lead-select` is not merged yet.

## STILL PENDING (verified NOT done on main on 2026-10-01)
Security / money (highest priority):
- B3 trip OTP bypass: order_assignments.py ~816 still `if assignment.start_trip_otp and otp and otp.strip() and otp.strip() != ...`; the end-trip check has the same pattern. Driver app sends '' in some flows -> staged rollout: log-only counter, driver-app resend/override, then enforce behind env flag TRIP_OTP_ENFORCED; 6 digits; 5-attempt cap; website trip-link start has no limiter.
- B4 SOS: customer app still posts with bare axios and no token (customer-app/app/(customer)/safety.tsx:79 -> /api/sos/alert); no push/60 s escalation in sos.py; no SOS Home tile / global siren in admin. SOS trigger must NEVER fail closed (accept, rate-limit by IP+phone, verify token only if present; send the token from the app first, tighten later).
- B7 rate limits: only fleet_swap, geocode, order_assignments (start/end trip), sos have @limiter.limit. Missing: phone/email OTP request, sign-in, password reset, quote, AI/OCR endpoints; client-IP detection behind Cloud Run (--proxy-headers); hmac.compare_digest for website key (website_bookings.py:50).
- B8 no Razorpay webhook (crud/payment_reconcile.py is empty); B9 no wallet row locks (crud/wallet.py, vendor_wallet.py).
- B6 invoice-PDF ownership/auth: Verify (could not confirm from a grep).
- B13 unauthenticated routes found by the B11 test (booking-chat threads/orders, carpool, driver/route-requests, trigger-route-assign, advance-received PUTs, ...). B14 unassigned-booking auto-removal is a silent no-op (utils/unassigned_booking_expiry.py filters NewOrder.Driver_assigned/Car_assigned which do not exist; strict xfail test). B15 `fleet_driver_swap_audit.otp_code` plaintext OTPs from c92d94a still on prod: nulling/dropping needs the owner's OK (BLOCKED).
- B10 website: api/test_diag_live.php, check_insert_error.php (inserts a row per hit), diag_booking_id.php still exist; website/api/storage/bookings-log.jsonl + partner-requests.jsonl still committed (do NOT purge history); send_email_otp.php rate limit is in $_SESSION; CSRF/GET-delete review.
Website (the owner's original request; website/ has had NO commits since d36078d):
- C1 booking ID: website/assets/js/booking-form.js:983 still keeps the daily counter in browser localStorage; confirm_booking.php:129-132 still trusts a browser-supplied C######## id; airporttaxi-confirm-booking.php uses random_int(1,99) (Verify); receive-remote-lead.php other format. Correct server generator: dropcars_next_enquiry_booking_id() in website/admin/includes/enquiries-schema.php (~533). AGREED SCHEME: one shared daily counter, E/C + YYMMDD + NN (2 digits, grows past 99); confirming keeps the number (E26093002 -> C26093002); next enquiry continues (E26093004); IST date; server-generated only; UNIQUE index on booking_id; generator fallback must never return ...01.
- C2 icons: enquiry icon on E..., green tick on C... everywhere an id is shown (admin, email, Telegram, customer pages). C3 km limit (min billable km / included km per day / extra km rate) in the website "Send Customer" message, confirmation email, quote, thank-you, print-estimation, read from tariff data. C4 missing-fields audit table. C5 other id generators. Follow ANTIGRAVITY_PROMPT_website_fixes.md exactly; I upload to Hostinger myself.
- C6/D1 backend external_id + upsert (CustomerBookingRequest and CrmLead have no external id) before any sync; D2 sync-then-clear (flags, 50-row batches, dry run, backup, verify, 90-day retention for enquiries; sendToGoogleSheet is 1 s fire-and-forget so "synced" cannot be trusted); D3 merge the two lead inboxes; D4 lead SLA Home tile.
Admin app structure (NAVIGATION_PLAN.md): E1-E7 not started. Tabs are still Dashboard / Bookings / Tasks / Chats / Fleet. Target (UPDATED 2026-10-01): Home | Operations | Chats | Fleet | More; inside Operations a switch [CRM | Bookings], default CRM.
Apps: F3 app side (apps must read X-Account-Role-Hint and switch screen / pre-fill only what the user typed); H1-H3 customer app (server quote only, Razorpay key/email, airport/coupons/invoices/Tamil); I1 driver offline queue (services/offline/offlineQueueService.ts is unused, calls non-existent routes); G1-G9 website features (festival pricing, message buttons, reports, notification matrix, upcoming board, airport tariffs).
Platform: J1 Alembic baseline, J3 polling -> push (needs billing numbers), J4 Dockerfile non-root + proxy headers, J5/J6 repo hygiene.
Owner-only: A1 which Cloud Run revision is live and run PR #1 migrations on a copy of prod DB; rotate the CRM webhook key if not done; B15 decision.

## DECISIONS ALREADY MADE (do not re-ask)
- Admin app tabs (UPDATED 2026-10-01, owner's decision; the older "Bookings tab > [CRM | Operations]" wording is obsolete): Home | Operations | Chats | Fleet | More. The Operations tab has a switch [CRM | Bookings] only (default CRM because leads need an on-time response; Bookings segment's first card is Live Bookings; Home tiles deep-link into the right segment). All fleet things (incl. wallet, payouts, activation requests, duty drivers) live in Fleet; all customer things in CRM; Chats has role chips (All / Customer / Fleet owner / Driver / Duty driver / Vendor / Booking chats).
- Home tiles in priority order: SOS (only when active) > Leads on-time response (countdown turns red) > booking approvals / unassigned / unread chats > fleet activation requests > wallet & payout / refunds / other requests. No section called "Money": fleet money in Fleet, customer money in CRM, company money (GST invoices, ledger) in Operations.
- Duty driver = working driver added by a fleet owner (CarDriver.vehicle_owner_id, is_owner_driver=false); lives inside that fleet with its cars; Fleet has a bulk-search section (drivers + duty drivers + vendors + owners) with bulk actions.
- Swap: car already registered under another owner -> 6-digit OTP to that car's current owner; driver already registered -> OTP to the driver (push + pop-up in driver app duty-driver section, SMS/email fallback). Never reveal the other owner's identity (mask). Block on active assignment / pending payout. Admin override needs reason >= 10 chars and the admin name from the token.
- SOS: fleet owner CAN trigger it. Long-press, location every ~10 s, push to on-duty admins, escalation at 60 s (WhatsApp/SMS), admin screen with call buttons + 112, global banner + siren (reuse alarm hosts). Backend env vars: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN (they silently default to DEMO_ values: make prod fail loudly).
- Leads: backend is the long-term master; for now the website DB (Hostinger, no extra cost) is the working store, synced to Google Sheets; "sync to backend, verify, then clear".
- Cost: Hostinger DB is bundled (no per-call cost). Google Cloud cost comes from Cloud Run request time and Cloud SQL size, not per query. Admin app polls every 8-20 s (booking alarm 8 s, enquiry alarm 10 s hits the Hostinger API, unread chats 20 s x2, Bookings list 20 s); driver location writes every 20 s; customer live-trip 12 s. Later: replace polling with push. Billing numbers not provided; do not guess.
- Do NOT purge git history and do NOT split customer-app now.
- Do not change fare math (website engine/tariff.php, data/tariffs.json; backend utils/rate_card.py, fare_rules.py, crud/new_orders.py).

## RULES
- Never commit to main. One task = one branch `fix/<id>-<name>` from the latest main; open a PR; do not merge; do not deploy (backend deploy is manual on Cloud Run; I upload website files to Hostinger myself). You MAY push branches and open PRs.
- Check BACKLOG.md and open PRs/branches (git branch -r, PR list) before starting so you do not collide with another session. Stay inside the task's file zone (BACKLOG.md section 1). Hot-spot files (backend/app/main.py, admin-panel/services/api.ts, core/security.py, .gitignore) only in tiny separate commits; rebase often.
- No breaking API changes (shipped customer/driver apps depend on current routes/response shapes). No secrets in code or logs (no full phone numbers in logs). Never use credentials/tokens found in the environment unless I explicitly tell you to.
- Before locking any route, grep customer-app, driver-app, admin-panel, website for callers and list them.

## WHAT TO DO, IN THIS ORDER (execute; report after each step)
STEP 0: sync BACKLOG.md to main (see above).
STEP 1: B3 trip OTP staged rollout (backend log-only + flag first; driver-app resend/override after).
STEP 2: B4 customer-app safety.tsx sends the token + SOS never fail-closed + push to on-duty admins + 60 s escalation + admin Home tile/banner/siren.
STEP 3: C1 -> C2 -> C3 -> C4 -> C5 website fixes (this can run in parallel with Steps 1-2 in another session: different file zone). Provide the exact Hostinger upload list + rollback notes.
STEP 4: B8 Razorpay webhook + reconcile; B9 wallet locks + concurrency test; B7 rate limits + proxy headers + compare_digest.
STEP 5: B10 website diagnostic files/OTP limit/CSRF; B13 + B14; B6 verify/fix.
STEP 6: C6/D1 external_id + upsert, then D2 sync-then-clear, D3/D4.
STEP 7: F3 app side, then E1-E7 admin navigation, then H, I, G, J in the merge order of BACKLOG.md section 2.

## STOP CONDITIONS
Stop and tell me only if: something needs deploying, a force-push or history rewrite, credentials, deleting data (including B15), or two tasks collide on the same file. Otherwise keep going.

## AT THE END OF EVERY STEP
Update BACKLOG.md statuses (CLAIMED / IN REVIEW / DONE / BLOCKED with branch + PR + commit hash) by pushing that one change to the docs branch claude/determined-volta-yw9pe8 (fetch first; fast-forward only), list new findings not in BACKLOG, and give me a 5-line Tanglish summary plus the exact manual steps I must do.

## YOUR FIRST MESSAGE
Do not ask me anything. Read the docs, run STEP 0, then start STEP 1 and report what you found.
````
