# Phase 1.0 — Engineer Handoff Prompt

---

You are building Phase 1.0 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these two files before writing a single line of code:**
1. `REBUILD_PLAN.md` — your full technical spec: what to keep, what to delete, data schemas, API endpoints, and frontend wiring
2. `dev_tracker/Phase 1.0 - Make It Real.md` — your working checklist; update it as you go

---

## What You're Building

The target frontend (`waypoint-v2.html`) is a fully-designed, production-quality HTML/CSS/JS file that currently runs on hardcoded in-memory data. Your job is to make it real — wire every interaction to a real Express API backed by SQLite.

The data model is a three-level hierarchy: **Projects → Outcomes → Actions**. Projects already exist in the DB. You're adding Outcomes and Actions.

## What Phase 1.0 Delivers

By the end of this phase:
- A user can create a project, add outcomes to it, add actions to those outcomes
- Actions can be checked off, added inline, and outcomes can be archived
- Everything persists across page reloads
- `waypoint-v2.html` is served as the main app — v1 is gone

The right panel, Slack pipeline, and Claude AI features are NOT in this phase. Don't touch them.

## Key Constraints

- **Start fresh.** Do not migrate existing tasks or inbox data. The old `tasks` and `inbox` tables are orphaned — leave them in place but ignore them.
- **Standardize on `better-sqlite3`.** Delete `src/database/tasks.js`, `src/database/notes.js`, and `database/db.js`. Every new DB file uses the sync better-sqlite3 pattern from `src/database/index.js`.
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, `src/integrations/`, `src/utils/crypto.js`, or any OAuth/triage/inbox database files. Those are preserved for later phases.
- **Investigate `routes/` at the project root** — it appears to be an empty leftover directory. Confirm and remove it.
- Phase state (which outcome is selected, which phase the user is in) is client-side only. No backend persistence needed for that.

## When You're Done

Mark each item complete in `dev_tracker/Phase 1.0 - Make It Real.md` as you finish it. When the full checklist is done, flag for PM review before Phase 1.1 begins.
