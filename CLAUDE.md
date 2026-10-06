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

## 5. Communication with Other Sessions
- If creating a major refactor or adding a new global component, add a brief note in `AI_COLLABORATION_LOG.md` so other Claude/Antigravity sessions are instantly aware.

---

## 6. Backend deploys: ONE branch, ONE script (added 2026-10-06)
Cloud Run serves exactly one version. A deploy from any folder replaces the live API with THAT folder's code, so a stale or half-edited copy silently deletes other people's work (this happened on 2026-10-02: a day of fixes disappeared).
- **Shared branch for the backend:** `deploy/merged-2026-10-06` (or the branch that replaced it - see the newest line in `AI_COLLABORATION_LOG.md`). Both tools start from it, commit to it (or merge into it) and push.
- **Never run `gcloud run deploy` by hand.** Use `powershell -File scripts\deploy-backend.ps1`. It refuses unless: `backend/` is fully committed, your branch contains the commit that is live now (service label `git-sha`), the commit is pushed, and the tests pass. Use `-DryRun` to only check.
- **Commit before you deploy and merge before you deploy.** If the script says "your branch does not contain what is live", run `git merge <that sha>` (or `git fetch; git merge origin/<shared branch>`), resolve, test, retry. Do not copy files from other folders to get around it.
- **Never put a password, token or key in source.** SMTP, Razorpay, Firebase and similar secrets are Cloud Run environment variables / platform settings.
- After deploying, add one line to `AI_COLLABORATION_LOG.md`: what went live, commit, revision.
