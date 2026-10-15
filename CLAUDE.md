# CLAUDE.md - Multi-Agent & Multi-Session Collaboration Guidelines

> **CRITICAL INSTRUCTION FOR ALL CLAUDE SESSIONS & ANTIGRAVITY AGENTS**
> The developer operates 2+ Claude sessions AND Antigravity IDE simultaneously on this repository.
> To prevent code regressions, lost UI features, or accidental overwrites, follow these strict rules:

---

## 1. Primary Repository: Single Source of Truth
- **Root Repository**: `C:\Users\Administrator\Desktop\Drop-Cars-Full-Repo`
- **Live Dev Server**: Expo running on `localhost:8082` (`admin-panel/`)
- All sessions must write to and read directly from this repository.

---

## 2. Strict Rule: Surgical Edits ONLY (No Blind Overwrites)
- **NEVER** rewrite, replace, or overwrite entire files when implementing a change or fixing a bug.
- **ALWAYS** perform targeted, surgical line-by-line modifications (e.g., modifying only the exact 5-10 lines needed).
- **NEVER** copy entire files from other folders/branches over existing files.

---

## 3. Concurrency Protection (Preserve Parallel Changes)
- **Always Read Fresh**: Before editing any file, inspect its current state on disk. Do not rely on previous session context, as another session may have just added a new button or layout.
- **Never Revert Existing UI**: If you see new buttons (e.g. Floating `+` FAB, Cancel button, OTP modals, Custom Packages, Filters), **DO NOT REMOVE OR OVERRIDE THEM**. Keep all existing JSX structure intact.
- **Additive Development**: Append or surgically insert new features without disturbing sibling components or styles.

---

## 4. Key Admin Panel Conventions
- **Trip Types**: `oneway`, `roundtrip`, `multicity`, `local`, `hourly`
- **Hourly Packages**: `5h / 50km`, `8h / 80km`, and `Custom / Manual (10 km/hr)`
- **Order Cancellation**: Gated for operational staff/admins; uses `apiService.cancelOrderByAdmin(orderId, reason)` with fallback `apiService.adminCancelOrder(orderId, reason)`.
- **Floating Action Buttons**: The main `+` FAB in `orders.tsx` must stay anchored at `bottom: 24/32, right: 18, zIndex: 999`.

---

## 5. Protected Antigravity Features (Strict Non-Regression Rules)
Under no circumstances should any Claude session delete, replace, or clobber the following verified Antigravity additions:

1. **Customize Booking Flow (`create-booking.tsx` & `orders.tsx`)**:
   - The `[ Customize ]` button on live booking cards routes to `create-booking.tsx` with `edit_order_id`.
   - `create-booking.tsx` must maintain the tariff-lock guard (`if (params.edit_order_id) return;`) so existing custom rates are not wiped out by default matrices.
   - In edit mode, submission calls `apiService.masterEditOrder` and `apiService.adminEditOrderFare`, and returns with `router.back()` (never post a duplicate booking).
2. **Help Catalogs & Crash Boundaries**:
   - Universal `DC_*` error codes across all apps (`driver-app`, `vendor-app`, `customer-app`, `admin-panel`).
   - `HelpSheet.tsx`, `ErrorNotice.tsx`, and `GlobalErrorBoundary.tsx` must be preserved to eliminate blank white crash screens.
3. **Spoken Tamil Glossary & i18n**:
   - Respectful colloquial Tamil ("நீங்கள்" register in `docs/i18n/GLOSSARY.md`).
   - Retain all `tr()` wrappers and loan word preservation (`OTP`, `Fastag`, `Toll`, `RC`, `FC`, `Permit`).
4. **Operations Suite in Orders (`orders.tsx`)**:
   - Retain all action buttons: `[ Customize ]`, `[ Edit ]`, `[ Cancel ]` (with reason modal & wallet hold refund), `[ Delete ]` (Owner only), `[ Recreate ]` (Expired/Auto-cancelled), `[ Move ]` (to Savaari), and the floating `+` FAB (`zIndex: 999`).
5. **Admin Management Screens**:
   - `workers-payroll.tsx` (Attendance & Petty Cashbook ledger).
   - `tax-reports.tsx` (GSTR-1, GSTR-3B, Section 9(5) ECO tax reports & credit notes).
   - `driver-tours.tsx` (Outstation tours & autopilot).
   - `website-settings.tsx` (Pricing rules, surcharges, advance payment percentages).
6. **AI Intelligence & Copilot**:
   - `Today at a Glance` daily operational digest (`/api/admin/dashboard/digest`).
   - AI draft replies (`/api/support/admin/threads/.../draft-reply`).
   - Magic voice parser (`parseBookingVoiceCommand`).
   - Customer feedback theme clustering (`/api/admin/quality/themes`).
7. **Backend Extra KM + 5% GST Settlement (`backend/app/crud/end_records.py`)**:
   - Extra distance beyond all-inclusive packages is billed with 5% GST on extra KM while preserving agreed driver payout.
8. **Number Integrity & Real Data Rule**:
   - Never reintroduce hardcoded fake number fallbacks (e.g., `|| 355` km, `|| 400` bata, `|| 15` fare).
   - Wallet balances and counts must initialize to `null` and display `—` / shimmer while loading.
9. **Modal & Keyboard Safe Rule**:
   - All modals and forms must strictly import `Modal` and `KeyboardAvoidingView` from `@/components/KeyboardSafe`.

---

## 6. Pre-Edit Checklist for Claude Sessions
Before touching any screen or endpoint:
1. Run `git status` or inspect the file on disk to see what Antigravity or another session has recently modified.
2. Read the latest entries in `AI_COLLABORATION_LOG.md`.
3. Perform surgical line-by-line insertions.
4. Verify TypeScript cleanly with `npx tsc --noEmit` before finishing your turn.
5. Log your changes in `AI_COLLABORATION_LOG.md`.

