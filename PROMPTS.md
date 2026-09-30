# PROMPTS: copy-paste prompts for other Claude sessions and Antigravity

The handoff files live on branch `claude/determined-volta-yw9pe8` (NOT on `main`). A new session does not read them by itself, so always start with P0.

Which tool gets what:
| Tool | Use |
|---|---|
| Any new Claude session | P0 first, then one of P1-P5 |
| Antigravity (website fixes) | `ANTIGRAVITY_PROMPT_website_fixes.md` (whole file) |
| Antigravity (swap/SOS/startup fixes) | the "PROMPT FOR ANTIGRAVITY" section of `REVIEW_c92d94a_AND_FIX_PROMPT.md` |
| Any tool, end of session | P6 |

Do not paste the whole handoff into the chat. The files are the source of truth; the prompt only tells the session where to look.

---

## P0. Session starter (paste this first, always)
```
You are joining an existing project (Drop Cars: taxi booking platform). Do not start coding yet.

1. Repo: nvitverse/Drop-Cars. The real code is on branch `main` (backend FastAPI, website PHP, customer-app, driver-app, admin-panel). The handoff docs are on branch `claude/determined-volta-yw9pe8`. Run:
   git fetch origin
   git show origin/claude/determined-volta-yw9pe8:HANDOFF.md
   git show origin/claude/determined-volta-yw9pe8:BACKLOG.md
   Also read, as needed: ARCHITECTURE_REVIEW.md, NAVIGATION_PLAN.md, REVIEW_c92d94a_AND_FIX_PROMPT.md (same branch).
2. Read HANDOFF.md fully and BACKLOG.md sections 0-2 (coordination rules, file zones, merge order) before anything else.
3. Rules: never commit to `main`; one task = one branch `fix/<id>-<name>` from the latest `main`; claim the task in BACKLOG.md before starting (tell me what to change, or push a one-line change to the docs branch if I ask); stay inside the file zone for that task; no breaking API changes; do not deploy; never claim "tests pass" or "pushed" without pasting the output / commit hash.
4. Mark every statement as Confirmed (you read the code), Verify (needs a run), or Suggestion.
5. Reply to me in Tanglish (Tamil written in English letters, technical words in English), simple language, short. I want to see your plan first and approve it before you edit.
6. First reply: tell me (a) the 5 most important facts you learned from the docs, (b) which BACKLOG tasks are still unclaimed, and (c) ask which task I want you to do.
```

## P1. Do one task (replace TASK_ID)
```
Task: BACKLOG.md item TASK_ID. (You have already read HANDOFF.md and BACKLOG.md.)
- Check the item's Status, Depends and file zone. If it is CLAIMED by someone else or a dependency is not merged, stop and tell me.
- Read the code involved first (git show origin/main:<path>). Reproduce the problem or the current behaviour where possible and paste the evidence.
- Give me a short plan: files to change, risks, what could break in shipped apps, how you will test. Wait for my OK.
- Implement on branch fix/TASK_ID-<short-name> from the latest main, in small commits. Touch hot-spot files (main.py, services/api.ts, security.py) only in tiny separate commits.
- Run the checks that apply (python -c "import app.main"; pytest; tsc --noEmit; php -l for PHP) and paste the output.
- Push the branch and tell me the commit hash. Do not merge, do not deploy. Give me a rollback note and the exact steps I must do by hand (for example uploading to Hostinger).
```

## P2. Review Antigravity's work (task A2)
```
Task: BACKLOG A2. Antigravity says it fixed T1-T8 (swap, SOS, startup) but I do not know if it is pushed.
1. git fetch origin; list branches and commits newer than c92d94a. If nothing is pushed, tell me and stop.
2. Review the real diff against the checklist in BACKLOG A2 and REVIEW_c92d94a_AND_FIX_PROMPT.md (car_id must be UUID; get_current_vehicle_owner must exist; env var names WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN; stream method; auth test covers the whole route table; tests on Postgres; tz-aware vs naive datetimes; legacy /api/sos/alert must not fail closed because the shipped customer app sends no token).
3. In a clean venv install the backend requirements, run `python -c "import app.main"` and pytest, and paste the output. If Postgres is available, run the startup migrations on an empty database and on a copy of the old schema.
4. Give me a verdict (merge / fix first / reject) with a numbered list of defects with file:line. Do not change code unless I ask.
```

## P3. Security hotfixes batch (tasks B1, B2, B5, B6, B11)
```
Tasks: BACKLOG B1, B2, B5, B6, B11 (backend auth hotfixes). Zone: Z-BACKEND-AUTH.
Before locking any route, grep customer-app, driver-app, admin-panel and website for callers so no shipped build is cut off; list the callers in your plan. Keep response schemas unchanged. Use the existing dependencies (get_current_admin, get_current_user, get_current_vendor, get_current_driver, get_current_customer). Owner-only means a token role check on the server, never a query parameter.
Also add B11: a pytest that walks the FastAPI route table and fails for any route without an auth dependency that is not in an explicit public allow-list. Stop after each task for my review.
```

## P4. Website fixes (tasks C1-C5)
Use `ANTIGRAVITY_PROMPT_website_fixes.md`. With Claude instead of Antigravity, use P1 with `TASK_ID = C1` (then C2, C3, C4, C5) and add: "Follow ANTIGRAVITY_PROMPT_website_fixes.md exactly. I upload to Hostinger myself."

## P5. Admin navigation (tasks E1-E3)
```
Tasks: BACKLOG E1, then E2, E3. Zone: Z-ADMIN-NAV. Design is in NAVIGATION_PLAN.md (tabs Home | Bookings | Chats | Fleet | More; Bookings switch [CRM | Operations]; Home tile priority list).
Navigation only: link the existing screens, do not rewrite them. Keep the permission checks (canSee) and backBehavior. Screen names must match the mapping table in NAVIGATION_PLAN.md. Show me a screenshot or a route list before and after. Do not depend on endpoints that are not merged yet (SOS, swap): leave those tiles hidden behind a flag.
```

## P6. End of session (paste at the end of any session)
```
Before you finish: update BACKLOG.md status for every task you touched (CLAIMED / IN REVIEW / DONE / BLOCKED, with branch name and commit hash), list anything you found that is not in BACKLOG.md as new items, list the files you changed, and tell me exactly what I must do next by hand. Commit and push that BACKLOG.md change to the docs branch claude/determined-volta-yw9pe8 (only if I say so). Give me a 5-line summary in Tanglish.
```
