# Phase 1.0 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 1.0 just completed — it wired a static HTML frontend to a real Express/SQLite backend using a Projects → Outcomes → Actions data model. Read `pm_log/Phase 1.0 - Code Review Handoff.md` in full, then verify every item in the checklist against the actual codebase. Report what passed, what failed, and any out-of-scope issues you spotted. End with a clear verdict: approved for Phase 1.1, or blocked with specifics.

---

You are reviewing Phase 1.0 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these two files before touching anything:**
1. `REBUILD_PLAN.md` — the full technical spec: schemas, endpoints, frontend wiring, and what was preserved vs. deleted
2. `dev_tracker/Phase 1.0 - Make It Real.md` — the working checklist; verify each item is actually complete

---

## What Was Built

Phase 1.0 wired the `waypoint-v2.html` frontend to a real Express API backed by SQLite. The data model is `Projects → Outcomes → Actions`. Projects already existed. Outcomes and Actions were added from scratch.

Your job is to confirm the implementation matches the spec and is safe to ship before Phase 1.1 begins.

---

## Review Checklist

### Database
- [ ] `outcomes` table exists with correct schema (all columns, correct types, FK to `projects`)
- [ ] `actions` table exists with correct schema (`outcome_id` is nullable, FK to `outcomes`)
- [ ] `src/database/outcomes.js` and `src/database/actions.js` exist, use `better-sqlite3` (sync, not async callbacks)
- [ ] `src/database/tasks.js`, `src/database/notes.js`, `database/db.js` are deleted
- [ ] No remaining file imports from any of those three deleted files

### API
- [ ] All Outcomes endpoints present and working: `GET /api/outcomes`, `GET /api/outcomes/:id`, `POST`, `PUT`, `DELETE`, `POST /api/outcomes/:id/archive`
- [ ] All Actions endpoints present and working: `GET /api/outcomes/:id/actions`, `POST /api/outcomes/:id/actions`, `GET /api/actions/unassigned`, `PUT /api/actions/:id`, `DELETE /api/actions/:id`, `PATCH /api/actions/:id/toggle`
- [ ] Existing Projects endpoints still work: `GET/POST/PUT/DELETE /api/projects`
- [ ] All `/api/tasks/*` and `/api/notes/*` routes are removed

### Frontend
- [ ] `waypoint-v2.html` is served at `GET /` — opening the app loads v2
- [ ] `public/index.html` and `public/app.js` (v1 files) are deleted
- [ ] No hardcoded `OUTCOMES` array remains in `waypoint-v2.html`
- [ ] `toggleAction()` fires `PATCH /api/actions/:id/toggle`
- [ ] `handleAddAction()` fires `POST /api/outcomes/:id/actions`
- [ ] `archiveOutcome()` fires `POST /api/outcomes/:id/archive`
- [ ] `handleQuickCapture()` fires the correct endpoint
- [ ] Project list sidebar loads from `GET /api/projects`
- [ ] Outcomes mini-list sidebar loads from `GET /api/outcomes?status=active`
- [ ] Phase state (selected outcome, current phase) is client-side only — no backend calls for navigation state

### Cleanup
- [ ] `routes/` at project root is gone (it was an empty leftover directory)
- [ ] `src/database/workflow-tabs.js` is deleted or confirmed unused
- [ ] No remaining references to the old async `sqlite3` callback pattern in any active files

### Preserved (Do Not Flag)
These files must be untouched — flag it if they've been modified:
- `src/routes/slack.js`, `src/routes/grain.js`
- `src/integrations/slack-client.js`, `src/integrations/grain-client.js`
- `src/utils/crypto.js`, `src/database/oauth-tokens.js`
- `src/database/monitored-channels.js`, `src/database/triage.js`
- `src/services/claude.js`
- `src/server.js`
- Orphaned DB tables (`tasks`, `notes`, `workflow_tabs`, `inbox`) — leave in place, not your concern

---

## What's Out of Scope

Do not raise issues against functionality that belongs to later phases:
- Right panel computed metrics (Phase 1.1)
- Scheduled Slack pulls, triage classification updates (Phase 1.2)
- Reflection/archive ritual (Phase 1.3)
- Claude command palette (Phase 1.4)

If you spot something clearly wrong but out of Phase 1.0 scope, note it separately — don't block sign-off on it.

---

## When You're Done

Leave review notes inline or in a summary. If the checklist is clear: signal **approved for Phase 1.1**. If there are blockers: flag them specifically — what failed, what file, what the spec says it should be.
