# ANTIGRAVITY - READ THIS FIRST (2026-10-12). Work rules + what to do next.

You and Claude both work on Drop Cars. On 2026-10-11 your backend deploy (Cloud Run rev 00326) and your Admin OTAs (preview channel) were built from the
OLD folders `dropcars-review/backend` and `dropcars-review/admin` (git base of 21 Sep). They did not contain the work done since 9 Oct, so LIVE LOST:
Invoices & Estimates (+ the payment/invoice links already sent to customers), Unaccepted Bookings Desk, web execution portal, Full Customize,
chat Trash, account active/inactive, document models, bot v2, vendor DropBot, real WhatsApp links (fake `dropcars.in/track/...` links and fake OTPs came back),
the desk alarm cadence, the navigation-bar fix, "no 0 flash" counts. Claude merged everything (your good work too) and redeployed:
backend rev 00327 and a merged Admin OTA. Branch: `deploy/merged-2026-10-06` (shared git repo, worktree `C:\gtmp\wt-merged`). Nothing of yours was thrown away.

## 1. ABSOLUTE RULES (no exceptions)
1. NEVER deploy the backend (`gcloud run deploy`, `deploy-backend.ps1`), NEVER `eas update`, NEVER `eas build`, NEVER `publish-ota.js` - from ANY folder.
   Claude / the owner does that, only from `C:\gtmp\wt-merged` after merge + tests. Your job ends at: code committed on a branch + the log entry.
2. Do not work in `dropcars-review/*` or `Drop-Cars-Full-Repo` working trees any more. They are stale copies. Start from the shared repo:
   `git fetch` -> `git switch -c feat/<topic> origin/deploy/merged-2026-10-06` (or work in your own worktree of the same repo). Commit small, push the branch.
3. Never copy a file from another folder over a file in the repo, and never rewrite a whole file. Surgical edits only. Always read the file fresh first.
4. Before you say "done" run: backend `pytest -q` (all green), admin/driver/vendor/customer `npx tsc --noEmit`, and `python scripts/verify_live_routes.py`
   (it compares live routes with the repo - must print 0 / 0 after Claude deploys).
5. Every change gets an entry in `AI_COLLABORATION_LOG.md`: files touched, what changed, "deployed: NO". Do not delete other people's entries.
6. Nothing hard-coded: rates, percentages, hold, fees, bata, km limits, UPI id etc. come from platform settings / driver tariff / fare rules
   (see `backend/app/utils/bot_facts.py`, `commission.get_fee_settings`, `crud/driver_tariff.py`). Never print an invented number or a fake link/OTP.

## 2. PROTECTED - do not remove, replace or "simplify"
Claude's: Invoices & Estimates (`invoices.tsx`, `billing-editor.tsx`, `billing-brands.tsx`, `billingApi.ts`, backend `billing_*`), Unaccepted Desk
(`unaccepted-desk.tsx`, `crud/unaccepted_desk.py`, desk alarms in `BookingAlarmHost.tsx`), web portal (`/p/{token}`, `portal_*`), `FullCustomizeModal` (the
"Customize" button on orders and website approvals), chat Trash (`chat_trash`), `ChatDrillDown` (Chats tiles), `openWaUrl` WhatsApp / Business chooser
(`utils/whatsapp.ts`, used by ~20 files), real links only in `whatsappTemplates.ts`, `useRememberedCounts` + dashboard/tasks count caches, `KeyboardSafe`
Modal lift above the Android navigation bar, bot v2 (`crud/support_autoreply.py`), `utils/bot_facts.py`, vendor DropBot wording, `closing_breakdown`.
Yours (kept, merged): help catalogs + `GlobalErrorBoundary`, Spoken-Tamil glossary / `uiTranslate`, Today-at-a-Glance digest, AI drafts, directives mission card
(+ complete/expire), create-booking edit mode with the tariff-lock (button "Full form" on order cards), notify-drivers button, alarm separation
(`EnquiryAlarmHost`, `alarmSound`), staff-management call buttons, Help Insights (`/api/help/insights` is now admin-only; `/api/help/events` is public telemetry),
workers-payroll, tax-reports, driver-tours, website-settings.

## 3. What to do next (your lane - all on a branch, no deploys)
A. Driver / Vendor / Customer apps: your round-4 code (language system, help catalogs) is merged. Finish it: wire `POST /api/help/events` from the three apps
   (anonymous: app, code, screen, action), make sure every screen shows `ErrorNotice` / `HelpSheet` instead of a raw error, run the i18n audit
   (`scripts/i18n-audit.js`) and fix what it reports. Do not touch money rules.
B. Vendor App DropBot (`vendor-app/app/chats.tsx`): Claude already made the backend vendor-aware. Add the "Post booking" and "How is my share calculated?"
   guided answers from the server (no numbers typed in the app).
C. Tests: add pytest for your directives endpoints (`complete`, `expire`, expiry filter) and for `help_events`. Keep `tests/test_route_auth_allowlist.py` passing
   (a new public route must be added there with a one-line reason).
D. Report anything you find odd in the website <-> backend booking flow in the log (do not change tariff / commission code - ask the owner first).

## 4. How the posting tariff works (do not change without the owner)
Website booking approved / auto-posted -> `crud/customer_booking_request.approve_customer_booking_request`:
per-km: driver rate = min(driver tariff, customer rate), the rest = extra; bata: driver 300 (Innova 400) | extra; permit by vehicle + destination | extra;
Sedan one-way 15, round trip / multi-city 14 (Admin > Tariffs > Driver, owner-editable). All-inclusive bookings: platform % and bata come from settings.
Test table: `backend/tests/test_autopost_matrix.py`.
