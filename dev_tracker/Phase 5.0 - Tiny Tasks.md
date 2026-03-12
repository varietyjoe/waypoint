# Dev Tracker — Phase 5.0: Tiny Tasks

**Status:** Complete
**Full brief:** `pm_log/Phase 5/Phase 5.0 - Tiny Tasks.md`
**Engineer handoff:** `pm_log/Phase 5/Phase 5.0 - Engineer Handoff.md`
**Depends on:** Phase 4.0 complete ✅

---

## Pre-Build Checklist

- [x] Read `src/database/actions.js` — confirmed `action_type` already exists; noted migration pattern for `snoozed_until`
- [x] Read `src/routes/api.js` lines 498–580 — understood `GET /api/actions/unassigned`, `POST /api/actions`, `PUT /api/actions/:id`
- [x] Read `public/index.html` lines 300–320 — understood sidebar Quick Capture block
- [x] Read `public/index.html` lines 610–635 — understood globals; identified where to add `UNASSIGNED`
- [x] Read `public/index.html` lines 840–844 — confirmed `init()` location; identified `Promise.all` to extend

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-24 | Claude Sonnet 4.6 | Implemented all three workstreams per spec; no deviations |

### Decisions

- `loadUnassigned()` and `renderUnassignedTray()` placed after `loadTodayStats()` in the data-loading section of `index.html` (near `loadInboxData()` as spec specified), keeping all async data loaders grouped together.
- `completeUnassignedAction`, `assignUnassignedAction`, and `snoozeUnassignedAction` handlers placed immediately after `renderUnassignedTray()` so all tray-related functions are co-located.
- No deviations from the spec. All code matches the handoff exactly.

---

## Completion Checklist

### Workstream 1 — `src/database/actions.js`
- [x] `snoozed_until TEXT` migration added (guarded with column check)
- [x] `action_type` migration NOT duplicated
- [x] `getUnassignedActions()` filters `done = 0`
- [x] `getUnassignedActions()` filters snoozed (`snoozed_until IS NULL OR snoozed_until <= datetime('now')`)
- [x] `getUnassignedActions()` orders tiny first
- [x] `snoozeAction(id)` created — sets `snoozed_until = datetime('now', '+1 day')`, returns updated row
- [x] `snoozeAction` exported in `module.exports`

### Workstream 2 — `src/routes/api.js`
- [x] `classifyAction(title)` helper added near top of file
- [x] Classifier handles null/empty/long titles → `'standard'`
- [x] Classifier handles `!tiny` marker → `'tiny'`
- [x] Classifier checks first word against verb set
- [x] `POST /api/actions` uses `classifyAction()` when no explicit `action_type` passed
- [x] `POST /api/actions` respects explicit `action_type` when provided
- [x] `POST /api/actions/:id/snooze` route added before `PUT /api/actions/:id`
- [x] Snooze route calls `actionsDb.snoozeAction(id)`

### Workstream 3 — `public/index.html`
- [x] `let UNASSIGNED = []` added to globals block
- [x] `loadUnassigned()` function added
- [x] `loadUnassigned()` added to `init()` `Promise.all`
- [x] `loadUnassigned()` called in `handleQuickCapture()` unassigned branch
- [x] `<div id="unassigned-tray">` added to sidebar HTML after Quick Capture block
- [x] `renderUnassignedTray()` function added
- [x] Tray hidden when empty, visible when items exist
- [x] Count badge shows total count
- [x] Caps at 5 visible; shows `+ N more` text for overflow
- [x] Each item: checkbox, title, assign dropdown, snooze button
- [x] Assign dropdown uses `OUTCOMES` global; has blank default option
- [x] All text escaped with `escHtml()`
- [x] `completeUnassignedAction(id)` handler added
- [x] `assignUnassignedAction(id, selectEl)` handler added
- [x] `snoozeUnassignedAction(id)` handler added

---

## Blockers

None.
