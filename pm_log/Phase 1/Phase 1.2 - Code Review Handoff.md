# Phase 1.2 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 1.2 just completed — it fixed an own-messages bug in the Slack pull route, added scheduled pulls via node-cron, updated Claude's triage prompt to classify Outcome vs Action, migrated the inbox table, updated the inbox approval flow to create real outcomes and actions, and added a markdown bulk-import endpoint. Read `pm_log/Phase 1.2 - Code Review Handoff.md` in full, then verify every checklist item against the actual codebase. Report what passed, what failed, and any out-of-scope issues you spotted. End with a clear verdict: approved for Phase 1.3, or blocked with specifics.

---

You are reviewing Phase 1.2 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these two files before touching anything:**
1. `REBUILD_PLAN.md` — full technical spec: bug fix details, schemas, endpoint specs, PLAN.md format
2. `dev_tracker/Phase 1.2 - Input Pipeline.md` — the working checklist; verify each item is actually complete

---

## What Was Built

Phase 1.2 made the Slack input pipeline real. Six workstreams: a bug fix, scheduled pulls, Claude triage classification, inbox DB migration, inbox approval flow, and markdown bulk import.

Your job is to confirm each workstream is correctly implemented and safe to ship before Phase 1.3 begins.

---

## Review Checklist

### Bug Fix — Own Messages
- [ ] The Slack pull filter at `src/routes/slack.js` ~line 431 now excludes the authenticated user's own messages
- [ ] Filter correctly applies all three conditions: `msg.bot_id` falsy AND `msg.user !== authenticatedUserId` AND `msg.text` non-empty
- [ ] `authenticatedUserId` is sourced from the `oauth_tokens` record (`scopes.user_id`), not hardcoded
- [ ] No other restructuring in `src/routes/slack.js` beyond this fix

### Scheduled Pulls
- [ ] `node-cron` installed and in `package.json`
- [ ] `slack_schedule` table created with correct schema (`run_time`, `timezone`, `enabled`, `last_run_at`)
- [ ] `src/services/scheduler.js` exists and initializes cron jobs from `slack_schedule` on server start
- [ ] Scheduler calls the same pull logic as `POST /api/slack/pull` — not a parallel implementation
- [ ] Pull window uses `last_run_at` per schedule row, not a fixed hours-back window
- [ ] First-ever run (`last_run_at` null) defaults to 24 hours back
- [ ] `last_run_at` is updated **only after a successful pull** — not before, not on failure
- [ ] Schedule CRUD endpoints all present: `GET/POST/PUT/DELETE /api/slack/schedule`

### Claude Triage
- [ ] Triage prompt updated to classify `outcome` vs `action` (not generic "task")
- [ ] Prompt returns `classification`, `title`, `ai_reasoning` — nothing more
- [ ] Prompt explicitly does NOT attempt to match actions to existing outcomes
- [ ] No structural changes to `src/services/claude.js` beyond the prompt update

### Inbox DB Migration
- [ ] `classification` column added to `inbox` table (`'outcome' | 'action' | 'unknown'`)
- [ ] `suggested_outcome_id` column added (nullable FK to `outcomes`)
- [ ] `ai_reasoning` column added
- [ ] Migration is additive — existing inbox rows unaffected

### Inbox Approval Flow
- [ ] Approving an Action creates a record in `actions` table
- [ ] Approving an Action with no outcome selected sets `outcome_id = null` (unassigned is valid — never forced)
- [ ] Approving an Outcome creates a record in `outcomes` table with `project_id`, `deadline`, `priority`
- [ ] Dismissing an item behaves identically to before

### Inbox UI
- [ ] Classification badge (`Outcome` / `Action`) visible on each inbox item
- [ ] AI reasoning shown as secondary text
- [ ] Action items show outcome picker dropdown (all active outcomes) + "Leave unassigned" option
- [ ] Outcome items show project picker + deadline + priority fields before approve button
- [ ] Approve button for Outcomes requires project/deadline/priority to be filled before activating

### Quick Capture
- [ ] Default behavior unchanged: creates unassigned action
- [ ] Optional outcome picker added

### Markdown Import
- [ ] `POST /api/import/plan` endpoint exists
- [ ] Reads and parses `PLAN.md` from project root
- [ ] Creates outcomes and actions not already present — title match is case-insensitive
- [ ] Additive only — no existing outcomes or actions are modified or deleted
- [ ] Returns `{ outcomes_created, actions_created, skipped }`
- [ ] `PLAN.md` added to `.gitignore`

### Preserved (Do Not Flag)
These files must be untouched (except `slack.js` bug fix and `claude.js` prompt update):
- `src/routes/grain.js`
- `src/integrations/slack-client.js`, `src/integrations/grain-client.js`
- `src/utils/crypto.js`
- `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`
- `src/server.js`

---

## What's Out of Scope

Do not raise issues against functionality that belongs to later phases:
- Reflection/archive ritual (Phase 1.3)
- Claude command palette, `break_into_actions`, Grain triage update (Phase 1.4)

If you spot something clearly wrong but out of Phase 1.2 scope, note it separately — don't block sign-off on it.

---

## When You're Done

Leave review notes inline or in a summary. If the checklist is clear: signal **approved for Phase 1.3**. If there are blockers: flag them specifically — what failed, what file, what the spec says it should be.
