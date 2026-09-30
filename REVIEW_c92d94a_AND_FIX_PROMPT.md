# Review of commit `c92d94a` (swap safety, SOS, WhatsApp templates) and fix prompt for Antigravity

Reviewed: `origin/main` at `c92d94a`, static reading plus one real import test. Nothing was deployed or run against a database.

## Verdict
**Do not deploy the backend from `main` as it is.** The API will not start. Several claims in the completion report do not match the code.

## Verified defects (with evidence)

### 1. Backend fails to start (Critical). Reproduced.
`backend/app/api/routes/sos.py:10` and `fleet_swap.py:14` both do `from app.models.orders import Orders`. `models/orders.py` defines `class Order`, not `Orders`. Running it:
```
ImportError: cannot import name 'Orders' from 'app.models.orders'
```
`main.py` imports `sos` (line 182) and `fleet_swap` (line 225) at module level, so `import app.main` fails and uvicorn will not boot. (`Orders` is also imported in `unassigned_booking_routes.py:74` and `services/vendor_pdf_report.py:7`, which were already broken before this commit.)

### 2. "Active ride blocker" cannot work (High).
It queries `Orders.driver_id` and `Orders.order_status`. The `Order` model has neither (it has `trip_status` and `target_driver_id`). A driver's active trips live in `OrderAssignment` (driver_id, assignment_status). The status strings used ("ASSIGNED", "STARTED", "IN_PROGRESS", "ACTIVE", "CONFIRMED") were not checked against the real enums.

### 3. Every new endpoint has no authentication (Critical).
- `fleet_swap.py`: `/fleet-swap/request-swap`, `/verify-swap`, `/admin-override` depend only on `get_db`. Anyone on the internet can move any driver to any fleet owner with a 10-character reason. `admin_name` is a string the caller supplies, so the audit trail can be forged. The `initiated_by` value is also caller-supplied.
- `sos.py`: `/trigger`, `/alert`, `/stream/{id}`, `/active`, `/alerts`, `/{id}/acknowledge`, `/{id}/resolve` are all open. Anyone can list live GPS and phone numbers, resolve or dismiss a real emergency (`FALSE_ALARM`), or overwrite an alert's location. Alert IDs are sequential integers. `acknowledged_by` and `resolved_by` come from the request body.

### 4. Swap OTP is never delivered (High).
`request-swap` stores a 6-digit OTP and responds "Verification OTP sent", but nothing sends it (no push, SMS or email) and it is not returned. The flow cannot be completed by a real user. The code comment says "secure numeric OTP" but uses `random.randint`; use `secrets`. Also, a swap can be requested unlimited times (no rate limit), so 5 attempts per request does not stop brute force, and `swap_id` is a guessable integer (an attacker can burn the 5 attempts of a victim's pending swap).
The agreed design (OTP to the driver, shown as a pop-up in the duty-driver section; car swap OTP to the car's current owner) is not implemented. Car swap is missing entirely. There is no swap UI (`fleet-owner-detail.tsx` has no swap code).

### 4b. Database tables and columns are not created (High).
- `Base.metadata.create_all(...)` runs at `main.py:90`. The new model `fleet_swap_audit` is imported at line 227, after that, and there is no `CREATE TABLE`, so the table will not exist.
- `sos_alerts` already exists in production. 12 new columns were added to the model with no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (the project's own pattern for this). Reads and writes on `sos_alerts` will fail with "column does not exist", which also breaks the old SOS endpoint.

### 5. SOS URLs changed and no longer match callers (High).
`sos.py` now has `APIRouter(prefix="/sos")` while `main.py:183` also includes it with `prefix="/api/sos"`. Real paths become `/api/sos/sos/alert`, `/api/sos/sos/trigger`, etc. The old contract `POST /api/sos/alert` (used by existing clients) returns 404, which breaks the "no breaking API changes" rule. The admin screen calls `/sos/alerts` (`sos-alerts.tsx:75`), which becomes `/api/sos/alerts` and does not exist, so the screen cannot load. The report's paths (`/api/sos/trigger`, `/api/sos/stream/:id`) do not match the code either (`:id` is Express syntax; this is FastAPI).

### 6. SOS is not a real-time alert (Medium).
No push, WhatsApp, SMS or escalation. The server only logs. The admin screen polls `/sos/alerts` every 10 seconds and only when that screen is open. There is no global banner, no siren audio and no Home tile, so nobody sees an SOS unless the SOS screen is already open. Acknowledge/resolve names are hard-coded `'Duty Operator'`.

### 7. WhatsApp templates (Medium).
- Group Post hard-codes a 10% app commission (`Math.round(grossFare * 0.1)`). Commission is admin-configurable in the backend (`/admin/commission-rates`), so drivers can be shown the wrong net payout.
- Advance request hard-codes 20% (only used if `advanceAmount` is missing).
- Booking ID is printed as `#DC-${bid}`. The agreed ID format is `E/C + YYMMDD + NN` (e.g. `C26093002`), so this prints `#DC-C26093002`.

### 8. Claims that cannot be verified
"Token security scanning pass … all files clean": there is no scan config or CI in the repo, and the repo still contains: `website/api/storage/bookings-log.jsonl` (354 records), two `google-services.json` files, a hard-coded live Razorpay key id in `customer-app/.../standard.tsx`, and a default CRM webhook secret string in `backend/app/api/routes/crm_routes.py`. "100% perfect" and "production safety standard" are not supported: no tests were added, and the app does not start.

### Still not done (not claimed, but from the earlier review)
CRM API auth, `/api/orders/all` and `/orders/pending-all` PII exposure, trip OTP bypass (`order_assignments.py:809, :970`), invoice PDF enumeration, Razorpay webhook, wallet locking, website booking ID / icon / km-limit fixes.

---

# PROMPT FOR ANTIGRAVITY (copy from here)

## Role
You are a senior FastAPI + React Native engineer. Fix the defects below in `backend/` and `admin-panel/` of the Drop Cars repo. Read the code first. Reply with a short plan and wait for confirmation before editing.

## Setup
```
git checkout main && git pull
git checkout -b fix/swap-sos-startup-and-auth
```

## Hard constraints
1. **No breaking API changes.** Shipped mobile apps call existing routes. Keep `POST /api/sos/alert` working with the same request/response keys (`status`, `alert_id`, `message`).
2. No secrets in code or logs. No phone numbers in full in logs.
3. Do not touch fare code (`utils/rate_card.py`, `utils/fare_rules.py`, `crud/new_orders.py`).
4. Follow the existing patterns: `Depends(get_current_admin)`, `get_current_user` (fleet owner), `get_current_driver`, `get_current_customer`; startup `ALTER TABLE ... IF NOT EXISTS` hooks in `main.py`.

## Tasks (in order)

**T1. Make the app start.**
- In `sos.py` and `fleet_swap.py` replace `Orders` with `Order` and use only columns that exist. Confirm `import app.main` succeeds. Add a CI smoke test `python -c "import app.main"` (pytest is fine).
- Also fix `unassigned_booking_routes.py:74` and `services/vendor_pdf_report.py:7` (same wrong name).

**T2. Fix the active-trip check.**
Use `OrderAssignment` (driver_id, `assignment_status`) and the real enums in `models/order_assignments.py` and `models/orders.py` (`Trip_status`). A driver is "on a trip" if they have any assignment that is not CANCELLED/COMPLETED. Add a unit test with fixture data.

**T3. Database.**
- Import `models.fleet_swap_audit` (and any other new model) **before** `Base.metadata.create_all` at `main.py:90`, or add an explicit `CREATE TABLE IF NOT EXISTS`.
- Add `ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS ...` for all new columns: driver_id, triggered_by_role, customer_phone, driver_phone, driver_name, car_number, acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution_notes, updated_at (with sensible defaults for existing rows, e.g. `updated_at = created_at`, `triggered_by_role = 'CUSTOMER'`).

**T4. SOS routes.**
- Remove the duplicate prefix so the final paths are `/api/sos/alert` (legacy, unchanged contract), `/api/sos/trigger`, `/api/sos/stream/{id}`, `/api/sos/active`, `/api/sos/alerts`, `/api/sos/{id}/acknowledge`, `/api/sos/{id}/resolve`. Add a test that lists the router paths.
- **Auth:** trigger/stream need a valid customer, driver or fleet-owner token; take `role` and the user's id from the token, never from the body. `stream` must only be accepted from the creator of that alert. `active`, `alerts`, `acknowledge`, `resolve` are **admin-only** (`get_current_admin`); `acknowledged_by`/`resolved_by` come from the admin identity, not the body. Add a rate limit on `trigger` (e.g. 5/min per user).
- **Real-time:** on `trigger`, send Expo/FCM push to all on-duty admins using the existing notification helpers, and log to the activity log. If not acknowledged within 60 s, escalate (second push + WhatsApp/SMS via `utils/whatsapp_notifier.py` / `utils/sms_gateway.py`). Keep secrets out of logs.
- Enrich from the order using the real `Order` fields (id, customer number, assigned driver via `OrderAssignment`).

**T5. Fleet swap.**
- **Auth:** `request-swap` requires a fleet-owner token and the new owner is the caller (ignore `new_owner_id`/`initiated_by` from the body). `verify-swap` requires the same owner token. `admin-override` requires `get_current_admin` with Owner role; `admin_name` comes from the token.
- **OTP:** generate with `secrets.randbelow`, store only a hash, compare in constant time, 6 digits, 10 minutes, max 5 attempts per swap, one-time use. Rate-limit `request-swap` (per driver and per owner). Use a non-guessable swap id (UUID).
- **Delivery (agreed design):** the OTP goes to the **driver**: push notification plus an endpoint the driver app can poll for a pending-swap pop-up (`GET /api/fleet-swap/pending-for-driver`), with SMS/email fallback. Never return the OTP in an API response.
- **Car swap:** add the same flow for a car (`CarDetails.car_number` already registered under another owner). The OTP goes to the car's current owner. Do not reveal the old owner's name or phone to the requester (mask it).
- **Rules:** block if the driver/car has an active assignment, a pending payout or unsettled wallet dispute. Driver wallet, rating and subscription stay with the driver. Record everything in `FleetDriverSwapAudit`.
- When a fleet owner or duty driver tries to sign in through the wrong login (owner login vs duty-driver login) **after a correct password/OTP**, return a `redirect_hint` so the app can switch to the right screen and pre-fill only the phone number the user typed. Do not reveal account existence before authentication.

**T6. Admin panel.**
- Fix API paths to match T4/T5. Add the swap UI in `fleet-owner-detail.tsx` (request, enter OTP, admin override with reason). Show the SOS red banner and siren globally (reuse the existing alarm host components) and add a Home tile. Use `acknowledged_by`/`resolved_by` from the logged-in staff. Replace 10-second polling with push where possible.

**T7. WhatsApp templates.**
- `whatsappTemplates.ts`: read the commission % from the backend (`GET /admin/commission-rates`) and the advance % from settings; if unavailable, do not print a payout figure. Print the booking ID exactly as stored (no `#DC-` prefix).

**T8. Tests and CI.**
- pytest: import smoke; a test that walks the FastAPI route table and fails if any route outside an explicit allow-list has no auth dependency; swap flow (happy path, wrong OTP x5 → locked, expired, active-trip block, unauthenticated → 401); SOS lifecycle (`ACTIVE → ACKNOWLEDGED → RESOLVED/FALSE_ALARM`), legacy `/api/sos/alert` still returns the same keys.
- Add a GitHub Actions workflow that runs the smoke import, pytest and `tsc --noEmit` for the admin panel on every push.

## Deliverables
1. Plan first, then one commit per task (T1…T8).
2. A migration note listing the SQL that will run at startup.
3. Output of `python -c "import app.main"`, pytest, and `tsc --noEmit`.
4. A rollback note per task.
5. Do not deploy. Report what needs a manual deploy step.

## Definition of done
- `import app.main` succeeds and the server boots against a fresh and an existing database.
- No SOS or swap route is reachable without the right token; the admin endpoints reject non-admins.
- A real SOS reaches on-duty admins by push within seconds without the SOS screen being open.
- A swap can be completed end to end by a real user (OTP arrives on the driver's device) and is blocked during an active trip.
- Legacy `POST /api/sos/alert` still works.
