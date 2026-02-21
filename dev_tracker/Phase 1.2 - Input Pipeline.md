# Dev Tracker — Phase 1.2: Input Pipeline

**Status:** Complete — pending PM review
**Full brief:** `/pm_log/Phase 1.2 - Input Pipeline.md`
**Depends on:** Phase 1.0 complete (can run parallel with 1.1)

---

## Pre-Build Checklist
- [x] Phase 1.0 sign-off confirmed
- [x] Review Slack pull route at `src/routes/slack.js` line ~431 (own-messages bug)
- [x] Confirm user's Slack user ID storage location in oauth_tokens record (`scopes.user_id`)
- [x] Review existing triage/Claude prompt in `src/services/claude.js`

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-19 | Claude Sonnet 4.6 | All items complete |

---

## Blockers

None.

---

## Completion Checklist

**Bug Fix:**
- [x] Own-messages filter added to Slack pull route (`src/routes/slack.js` line ~432: `!authenticatedUserId || msg.user !== authenticatedUserId`)
- [x] Same fix applied to `POST /api/triage/process` in `src/routes/api.js`
- [x] Verified user's own messages no longer appear in triage

**Scheduler:**
- [x] `node-cron` installed
- [x] `src/services/scheduler.js` created
- [x] Scheduler initializes on server start from `slack_schedule` table
- [x] Pull window uses `last_run_at` (not fixed hours)
- [x] First-ever run defaults to 24h back
- [x] `last_run_at` updated after each successful run (via `scheduleDb.markLastRun`)
- [x] Schedule CRUD API working (`GET/POST/PUT/DELETE /api/slack/schedule`) — registered in api.js at `/api/slack/schedule`

**Triage:**
- [x] Claude prompt updated to classify `outcome` vs `action` (`classifyForInbox()` in claude.js)
- [x] `classification` and `ai_reasoning` stored on inbox items
- [x] Inbox migration applied (new columns: classification, suggested_outcome_id, ai_reasoning)

**Inbox UI:**
- [x] Classification badge visible per item (Outcome = purple, Action = blue, Unknown = gray)
- [x] AI reasoning shown (secondary text with ✦ prefix)
- [x] Action items show parent outcome picker
- [x] Outcome items show project/deadline/priority fields
- [x] "Leave unassigned" option works (default in outcome picker)
- [x] Approving Action creates actions record correctly (with or without outcome assignment)
- [x] Approving Outcome creates outcomes record correctly (requires project_id)
- [x] Inbox view accessible via inbox icon in header + ⌘4 keyboard shortcut
- [x] "Pull & Process" button triggers triage/process endpoint from inbox view

**Quick Capture:**
- [x] Default creates unassigned action (via new `POST /api/actions` endpoint)
- [x] Optional outcome picker works (dropdown populated from active outcomes)

**Markdown Import:**
- [x] `PLAN.md` format parsed correctly (projects, outcomes, actions)
- [x] `POST /api/import/plan` creates outcomes + actions from file
- [x] Deduplication works — existing titles are skipped, not duplicated
- [x] Returns correct `{ outcomes_created, actions_created, skipped }` summary
- [x] Additive only — no existing data deleted
- [x] `PLAN.md` added to `.gitignore`

---

## Files Changed

| File | Change |
|---|---|
| `src/routes/slack.js` | Bug fix only: own-messages filter at line ~432 |
| `src/services/claude.js` | Added `classifyForInbox()` function |
| `src/services/scheduler.js` | **New** — cron scheduler |
| `src/database/slack-schedule.js` | **New** — CRUD for slack_schedule table |
| `src/database/inbox.js` | Added Phase 1.2 columns + `initInboxMigrations()` |
| `src/routes/api.js` | Updated triage/process, approve endpoint, schedule CRUD, import endpoint, POST /api/actions |
| `public/index.html` | Inbox view, classification UI, quick capture update |
| `.gitignore` | Added `PLAN.md` |
| `package.json` | Added `node-cron` dependency |
