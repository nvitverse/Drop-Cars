# AI Collaboration & Change Log

This file is read by **Claude (Session 1 & 2)** and **Antigravity** to know the latest changes made across parallel sessions.

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

### Unified chat program (Claude, 2026-10-01) - lives on 3 PR branches, NOT on this branch

- Branches (stacked, none merged yet): `feat/chat-phase-1-foundation` -> `feat/chat-phase-2-bots` -> `feat/chat-phase-3-command-center`. Worked in a separate git worktree (`C:\gtmp\wt-chat`), so nothing was written into this working tree.
- Admin app additions are NEW files only: `app/inbox.tsx`, `app/inbox-room.tsx`, `services/chatApi.ts`, `components/inbox/*` (own copies of the composer / voice player, so edits to `components/chat/*` or the Chats tab cannot break the inbox).
- One existing admin file is edited on the Phase 3 branch: `components/CommandCenterModal.tsx` (only the voice handler: the fake hardcoded transcript is replaced by real speech-to-text via `chatApi.transcribeVoice`, plus a status line above the input). If you edit that file, keep those two hunks.
- NOT touched: `services/api.ts`, `(tabs)/chats.tsx`, `(tabs)/_layout.tsx`, `CommandCenterFloatingButton.tsx`.
- Entry points into the new Inbox / Assistant are left for Antigravity: see `Desktop\ANTIGRAVITY_PROMPT_ChatEntryPoints.md` (start only after the PRs are merged).

### Alarms ring only while ON DUTY (Claude, 2026-10-01) - surgical edits in this tree
- New `components/AlarmDutyGate.tsx` (mounted in `app/_layout.tsx` right before the two alarm hosts, inside `StaffDutyProvider`): sets `setAlarmsAllowed(isOnDuty)`.
- `utils/alarmSound.ts`: 3 small hunks - `alarmsAllowed` flag + `setAlarmsAllowed()` (going off duty also silences a ringing alarm), and `if (!alarmsAllowed) return;` at the top of `playAlarmSound` and `playMildNotificationSound`. Reason: staff who had not tapped GO ON still heard alarms with no way to know why. Keep these hunks if you edit the file.

### Website-booking alarm follows the auto-post rule (Claude, 2026-10-02) - `components/BookingAlarmHost.tsx` only
- A confirmed website booking waiting for approval rings for ONE minute when it arrives (or until the ACKNOWLEDGE button), then never again: no snooze loop, no reminder. It stays in Website Approvals and the auto-post timing rule (`auto_post_at`, backend `crud/website_post_rules.py`) runs as usual; after posting it shows in Bookings > Upcoming. Quiet ids persist (AsyncStorage `dropcars_admin_booking_alarm_quiet_v1`).
- "HANDLE MANUALLY" button = `POST /admin/website-bookings/{id}/hold` (120 min max, never past pickup - 2 h) + stops that booking's alarm + opens `/website-booking-approvals`.
- The urgent-unassigned alarm (pickup < 1 h, no driver) is unchanged and keeps its SNOOZE (5m). No change to `services/api.ts`. Keep these hunks if you edit the file.

### Driver tariff (Claude, 2026-10-02) - Admin App > Tariffs > "Driver" tab
- New `components/DriverTariffEditor.tsx`; `app/tariffs.tsx` got 3 small surgical hunks only (import, `'driver'` added to the `activeBrand` union, a third tab button + `activeBrand === 'driver' ? <DriverTariffEditor /> : ...` before the airport branch). Talks to the new backend `GET/PUT /api/admin/driver-tariff` through `apiService.makeRequest` (no `services/api.ts` change). The backend is on branch `fix/website-booking-keeps-dispatcher-rates` (not deployed yet: the tab shows an error until it is).
- Meaning: website bookings are posted with the DRIVER fare; the rest of the customer's price goes to the extras (per km, bata, permit). Keep these hunks if you edit tariffs.tsx.

### Acceptance preference card (Claude, 2026-10-02)
- New self-contained `components/AcceptancePreferenceCard.tsx` (Trusted Partners first until a time / open to all now). Not placed anywhere yet: see `Desktop\ANTIGRAVITY_PROMPT_AcceptancePreference.md` (Booking Details in `(tabs)/orders.tsx`).

### Support chats were invisible in Admin > Chats (Claude, 2026-10-02) - `services/api.ts`, 3 small hunks
- `getSupportThreads / getSupportThread / replySupportThread` pointed at `/booking-chat/...` (booking chats only). They now use `/support/admin/threads` (list), `/support/admin/threads/{key}` (read) and POST the same path (reply). A driver's Support message (and its e-mail alert) never showed in the Chats list because of this. Keep these hunks if you edit the file.

### Chat ticks in Admin > Chats (Claude, 2026-10-02) - `app/(tabs)/chats.tsx`, 3 small hunks
- WhatsApp ticks on the admin's own messages: one tick = sent, two blue ticks = read (`Check` / `CheckCheck` next to the time). The 6 s poll now also refreshes `read` on messages already on screen (it only appended new ones, so a tick could never turn into two).
- Voice playback / duration depends on the backend media fix (private bucket gave 403, so the player never loaded and showed no length).

## 2026-10-02 (Claude) — driver-app/app/(tabs)/chats.tsx
- Pinned "Drop Cars Admin" row under the Help Bot in the chat list (header fragment, unread badge); DISPATCH excluded from the main list so it is not shown twice. "+" new-chat sheet untouched.

## 2026-10-02 (Claude) — admin-panel/services/api.ts (re-applied)
- getSupportThreads/getSupportThread/replySupportThread call /support/admin/threads again (an earlier edit was overwritten by another tool's save). Please don't revert to /booking-chat/*; that is the reason Support messages were missing in Admin > Chats.

## 2026-10-02 10:15 (Claude) — admin Chats
- NEW file admin-panel/services/supportApi.ts (Support inbox calls -> /api/support/admin/threads). chats.tsx and (tabs)/_layout.tsx import it. services/api.ts keeps being saved back to the old /booking-chat/* versions of getSupportThreads etc. — please do NOT use those three api.ts methods; use supportApi.
- chats.tsx load(): a failed/timed-out request no longer wipes the list ("No chats yet" after chats appeared); last good data is kept, polls don't overlap.

## 2026-10-02 (Claude) — admin-panel/app/(tabs)/chats.tsx
- Added QUICK_REPLIES chips above the reply box (tap fills the input). Imports ScrollView. Nothing else in the file changed.

## 2026-10-02 (Claude) — driver-app subscription top-up flow
- app/subscription.tsx + app/(tabs)/wallet.tsx: "Add money for plan" now carries `plan`; after the payment the wallet screen returns to /subscription?autoPlan=... which buys the plan automatically (drivers paid ₹199 and never got the subscription).

## 2026-10-02 (Claude) — driver-app hold wording + subscription purpose
- Hold wording (min ₹500; commission deducted, rest refunded): components/BookingCard.tsx, TripRulesModal.tsx, wallet/SecurityHoldInfoModal.tsx, app/(tabs)/{chats,drop-bid,wallet}.tsx (text only).
- services/payment/paymentService.ts, contexts/WalletContext.tsx, wallet.tsx: top-up carries `purpose` (subscription_monthly|yearly) so the backend activates the plan on payment.

## 2026-10-02 (Claude) — admin-panel/components/DriverTariffEditor.tsx
- Added the "Round-trip km" column (km_rate_round) next to One-way km. Backend defaults now hold the owner's driver tariff.

## 2026-10-02 (Claude) — Website Approvals redesign
- app/website-booking-approvals.tsx REWRITTEN (same API calls + new ones): cards show Confirmed time, highlighted PICKUP, exact auto-post date/time + why, driver|extra preview; Customize, Change time, checkbox select + bulk Post now / Hold / Release. New backend routes in routes/website_booking_schedule.py (uses apiService.makeRequest, not api.ts).
- components/BookingAlarmHost.tsx: held bookings ring once, 15 min before their hold ends (pickup - 2 hrs). Added `is_held` + LAST_WINDOW_MS; ack uses the `:last` key.

## 2026-10-02 (Claude) — admin-panel/app/(tabs)/orders.tsx
- isOrderStarted now = trip STARTED or assignment DRIVING (was: assignment ASSIGNED, so any booking with a driver added showed as "Running", e.g. #345 two days before pickup). Driver-added-not-started bookings now sit under "Assigned".

## 2026-10-02 (Claude) — Admin Chats home
- app/(tabs)/chats.tsx: list now opens with 2 pinned chats (Command Centre -> existing modal, Information -> new screen) and ONE folded row "Driver & booking chats · N" (unread badge); the thread list shows only when that row is opened or while searching. Header count removed.
- NEW app/info-chat.tsx: "Information" chat for staff doubts (local rule answers; no network).

## 2026-10-02 (Claude) — Command Centre
- app/_layout.tsx: removed <CommandCenterFloatingButton /> (and its import). Command Centre now opens from Chats > Command Centre only.
- NEW utils/commandSmart.ts: live brief + commands (pending, unassigned, today/tomorrow, booking #id, support, post/hold/release all with a yes/no confirmation). context/CommandCenterContext.tsx: calls smartIntent before the old parser; opening shows a live brief. components/CommandCenterModal.tsx: 6 new quick chips.

## 2026-10-05 (Claude) — auto-logout / loading / type-check, then Admin OTA
- services/api.ts: a 401 / "not authenticated" on any NON-profile call no longer clears the session; it is confirmed against /admin/profile (one check at a time, every 20 s at most, network/5xx/timeouts never log out). Only /admin/profile (or /admin/me) can end the session directly. getAuthToken() is wrapped in try/catch.
- app/(tabs)/index.tsx: loadData / onRefresh always end the spinners (try/finally).
- TypeScript: fixed 8 errors in enquiries.tsx and fleet-subscriptions.tsx (title -> accessibilityLabel, 'warning' toast -> 'info', null -> undefined, distance_km cast). `tsc --noEmit` = 0 errors.
- Published the Admin OTA from the working tree (preview + production), which includes everything uncommitted in admin-panel at that moment.
