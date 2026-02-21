# Phase 1.0 — Make It Real

**Goal:** Replace every hardcoded data structure in `waypoint-v2.html` with real API calls and a real database. The app becomes usable day-to-day.

**Status:** Not Started
**Depends on:** Nothing — this is the foundation
**Unlocks:** Phase 1.1

---

## What This Phase Delivers

By the end of 1.0, the user can:
- Create a project, add outcomes to it, add actions to those outcomes
- Check off actions, add new actions inline, archive an outcome
- Use quick capture in the left sidebar
- Have all of it persist across page reloads

The right panel and Slack pipeline are not wired yet. That's 1.1 and 1.2.

---

## Scope

### Database
- New `outcomes` table (`project_id` FK, `title`, `description`, `deadline`, `priority`, `impact`, `status`, `archived_at`)
- New `actions` table (`outcome_id` nullable FK, `title`, `time_estimate`, `energy_type`, `done`, `done_at`, `blocked`, `blocked_by`, `position`)
- Delete deprecated: `src/database/tasks.js`, `src/database/notes.js`, `database/db.js`
- Standardize everything on `better-sqlite3`

### API — Build
- `GET/POST/PUT/DELETE /api/outcomes`
- `POST /api/outcomes/:id/archive`
- `GET/POST /api/outcomes/:id/actions`
- `GET /api/actions/unassigned`
- `PUT/DELETE /api/actions/:id`
- `PATCH /api/actions/:id/toggle`
- Verify existing `GET/POST/PUT/DELETE /api/projects` still work

### API — Remove
- All `/api/tasks/*` routes
- All `/api/notes/*` routes
- Kanban/workflow-tabs routes (not in v2 UI)

### Frontend
- Serve `waypoint-v2.html` as the main app at `GET /`
- Replace `OUTCOMES` hardcoded array with `fetch('/api/outcomes')` on load
- Wire: `toggleAction()` → `PATCH /api/actions/:id/toggle`
- Wire: `handleAddAction()` → `POST /api/outcomes/:id/actions`
- Wire: `archiveOutcome()` → `POST /api/outcomes/:id/archive`
- Wire: `handleQuickCapture()` → `POST /api/actions` (unassigned) or `POST /api/outcomes`
- Wire: project list sidebar → `GET /api/projects`
- Wire: outcomes mini-list sidebar → `GET /api/outcomes?status=active`
- Phase state (which outcome is selected, which phase) stays client-side — no backend needed

### Cleanup
- Remove `public/index.html` and `public/app.js` (v1 frontend)
- Investigate `routes/` at project root — appears to be a leftover directory, confirm and remove
- Remove deprecated DB access files

---

## Out of Scope for This Phase
- Right panel computed metrics (Phase 1.1)
- Slack triage pipeline updates (Phase 1.2)
- Reflections / archive ritual (Phase 1.3)
- Claude AI features (Phase 1.4)
- Focus mode toggle (future)
- Drag-to-reorder (future)

---

## Definition of Done
- [ ] Projects → Outcomes → Actions hierarchy persists in SQLite
- [ ] All v2.html interactions fire real fetch() calls
- [ ] No hardcoded data remains in the frontend
- [ ] Page reload preserves all data
- [ ] v1 frontend files removed
- [ ] No remaining imports from legacy `db.js`, `tasks.js`, `notes.js`
- [ ] Engineer + PM sign-off

---

## Key Decisions Locked
- Fresh start — no data migration from v1 (#6)
- Immediate cutover to v2.html (#5)
- Notes deprecated (#4)
- Standardize on better-sqlite3 (#3)
- Phase state is client-side only (#7)
