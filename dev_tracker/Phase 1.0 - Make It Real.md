# Dev Tracker — Phase 1.0: Make It Real

**Status:** ✅ Complete — Ready for PM Review
**Full brief:** `/pm_log/Phase 1.0 - Make It Real.md`
**Engineering spec:** `/REBUILD_PLAN.md`

---

## Pre-Build Checklist
- [x] Read `REBUILD_PLAN.md` in full before writing any code
- [x] Confirm DB schema with PM before running migrations
- [x] Identify and flag anything in the spec that's ambiguous

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-19 | Claude Sonnet 4.6 | Phase 1.0 implementation complete |

---

## Blockers

None.

---

## Completion Checklist

**Database:**
- [x] `outcomes` table created via migration (via `initOutcomesTable()` on server start)
- [x] `actions` table created via migration (via `initActionsTable()` on server start)
- [x] `src/database/tasks.js` deleted
- [x] `src/database/notes.js` deleted
- [x] `database/db.js` deleted
- [x] `src/database/workflow-tabs.js` deleted
- [x] No remaining imports of legacy files confirmed (grep clean on all active .js files)

**API:**
- [x] `GET/POST/PUT/DELETE /api/outcomes` working
- [x] `POST /api/outcomes/:id/archive` working
- [x] `GET/POST /api/outcomes/:id/actions` working
- [x] `GET /api/actions/unassigned` working
- [x] `PUT/DELETE /api/actions/:id` working
- [x] `PATCH /api/actions/:id/toggle` working
- [x] Existing `/api/projects` routes confirmed working
- [x] Deprecated task/note routes removed

**Frontend:**
- [x] `waypoint-v2.html` served at `GET /` (copied to `public/index.html`)
- [x] Outcomes load from API on page load
- [x] `toggleAction()` fires real fetch (`PATCH /api/actions/:id/toggle`)
- [x] `handleAddAction()` fires real fetch (`POST /api/outcomes/:id/actions`)
- [x] `archiveOutcome()` fires real fetch (`POST /api/outcomes/:id/archive`)
- [x] `handleQuickCapture()` fires real fetch (`POST /api/outcomes` using first project)
- [x] Project list sidebar wired to `GET /api/projects`
- [x] Outcomes mini-list sidebar wired to live OUTCOMES state (loaded from API)

**Cleanup:**
- [x] `public/index.html` (v1) replaced by `waypoint-v2.html`
- [x] `public/app.js` (v1) removed
- [x] `routes/` root-level empty directory confirmed and removed
- [x] Stale `api.js.backup` files removed

---

## Engineering Notes

- **Database driver:** Fully standardized on `better-sqlite3`. No remaining `sqlite3` async callbacks.
- **Projects.js:** Removed `workflow-tabs` import and `createDefaultTabsForProject` call. The orphaned `tasks` table references in `initProjectsTable()` are harmless (tasks table still exists in DB per spec, just unused).
- **Claude.js:** Tools array removed. `sendMessage()` now returns text-only. Tools will be added in Phase 1.4.
- **Triage process route:** AI classification section removed pending Phase 1.2 redesign. Slack message fetching and queueing remains functional.
- **Inbox approve route:** Task creation removed pending Phase 1.2 redesign. Approval marks item as approved only.
- **Frontend IDs:** Switched from string IDs (`'out-001'`) to integer IDs from DB. All event handlers updated accordingly.
- **Data normalisation:** `normalizeOutcome()` and `normalizeAction()` adapters map DB field names (`time_estimate`, `energy_type`, `blocked_by`) to frontend field names (`time`, `energy`, `blockedBy`). Deadline ISO dates are converted to `daysLeft` + display string.

---

## 🚩 Ready for PM Review — Phase 1.1 can begin
