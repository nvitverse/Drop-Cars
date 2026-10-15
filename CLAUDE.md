# CLAUDE.md - Multi-Agent & Multi-Session Collaboration Guidelines

> **CRITICAL INSTRUCTION FOR ALL CLAUDE SESSIONS & ANTIGRAVITY AGENTS**
> The developer operates 2+ Claude sessions AND Antigravity IDE simultaneously on this repository.
> To prevent code regressions, lost UI features, or accidental overwrites, follow these strict rules:

---

## 1. Primary Repository: Single Source of Truth
- **THE working copy: `C:\gtmp\wt-merged`, branch `deploy/merged-2026-10-06`** (a git worktree of the same repository). Everything that goes to phones or to Cloud Run is built from it - nothing else.
- **These are STALE COPIES and must never be edited, built, deployed or published from**: `Desktop\dropcars-review\*` (admin, backend, vendor/Driver-App, vendor/Vendor App), the other worktrees (`Desktop\Drop-Cars-Full-Repo` on `feat/brand-language-help-round4`, `C:\gtmp\wt-antigravity`, `wt-autopost`, `wt-chat`, `wt-eval`, `wt-r4`, `wt-tariff`), `C:\DPrev` and `C:\VBuild` (preview / build scratch copies). They hold older code; on 2026-10-02, 10-06 and 10-11 a deploy or OTA from one of them erased work that was live (see `AI_COLLABORATION_LOG.md`). Each has a `STALE_COPY_DO_NOT_EDIT.txt`.
- **Simple rule (owner, 2026-10-15): ONE folder to work in, GitHub is only the backup.** Desktop shortcut `DROPCARS_WORK_HERE` opens it. Claude and Antigravity both open THIS folder (never a second clone, never a "copy to test"). `scripts\backup-to-github.ps1` runs every hour by itself (Startup item `DropCars-GitHub-Backup`) and pushes the branch plus a snapshot of unfinished work to `backup/wip`; nobody has to remember to push. To restore: `git fetch; git checkout backup/wip -- <file>` or `git reset --hard origin/deploy/merged-2026-10-06`.
- Two tools in the same folder at the same moment can still clash: before you start `git status` (if something is modified that you did not touch, the other tool is working - leave those files alone), commit small and often.
- If you started in a stale folder: `git fetch`, switch to `C:\gtmp\wt-merged` (or `git worktree add` a new one from `deploy/merged-2026-10-06`), and bring your work over with `git cherry-pick` / `git merge` - never by copying files.
- Phone updates: ONLY `scripts\publish-driver-ota.ps1` / `scripts\publish-admin-ota.ps1`. Backend: ONLY `scripts\deploy-backend.ps1`. They check that the folder is committed, pushed, contains what is live, and that no registered fix was undone.

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

## 7. The regression guard (added 2026-10-15) - how fixes stay fixed
- `docs/FIX_REGISTRY.json` lists every fix that has ever been undone by an old copy of a file (file + the text that must / must not be there + why). `node scripts/regression-guard.js` checks it, plus: no react-native `Modal` in a file with a text box (use `@/components/KeyboardSafe`), no made-up phone numbers in app code. It runs in CI and inside both publish scripts.
- **When you fix something that matters, add a line to the registry in the same commit.** When a guard check fails, do NOT silence it: an older copy overwrote a fix - restore the fix (`git log -S"<text>"` shows the commit that added it).
- `backend/tests/test_route_snapshot.py` fails if an API route that existed is gone (an older backend over a newer one). After adding routes run `python -m scripts.update_route_snapshot` from `backend/` (it only adds lines).
- Never `git checkout <old>` or copy a whole file from another folder over a file: take hunks (`git merge`, `git cherry-pick`, `git apply --3way`).

---

## 6. Backend deploys: ONE branch, ONE script (added 2026-10-06)
Cloud Run serves exactly one version. A deploy from any folder replaces the live API with THAT folder's code, so a stale or half-edited copy silently deletes other people's work (this happened on 2026-10-02: a day of fixes disappeared).
- **Shared branch for the backend:** `deploy/merged-2026-10-06` (or the branch that replaced it - see the newest line in `AI_COLLABORATION_LOG.md`). Both tools start from it, commit to it (or merge into it) and push.
- **Never run `gcloud run deploy` by hand.** Use `powershell -File scripts\deploy-backend.ps1`. It refuses unless: `backend/` is fully committed, your branch contains the commit that is live now (service label `git-sha`), the commit is pushed, and the tests pass. Use `-DryRun` to only check.
- **Commit before you deploy and merge before you deploy.** If the script says "your branch does not contain what is live", run `git merge <that sha>` (or `git fetch; git merge origin/<shared branch>`), resolve, test, retry. Do not copy files from other folders to get around it.
- **Never put a password, token or key in source.** SMTP, Razorpay, Firebase and similar secrets are Cloud Run environment variables / platform settings.
- After deploying, add one line to `AI_COLLABORATION_LOG.md`: what went live, commit, revision.
