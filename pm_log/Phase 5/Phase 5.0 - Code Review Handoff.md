# Phase 5.0 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 5.0 just completed — it ships Tiny Tasks: auto-classification of unassigned captures, a sidebar unassigned tray with complete/assign/snooze, and a snooze mechanism. Read `pm_log/Phase 5/Phase 5.0 - Engineer Handoff.md` in full, then verify every checklist item against the actual codebase. End with a clear verdict: **approved** or **blocked with specifics**. Log results to `test_tracker/Phase 5.0 - Tiny Tasks.md`.

---

**Read these files before reviewing:**
1. `pm_log/Phase 5/Phase 5.0 - Tiny Tasks.md` — full phase spec
2. `pm_log/Phase 5/Phase 5.0 - Engineer Handoff.md` — detailed implementation spec
3. `dev_tracker/Phase 5.0 - Tiny Tasks.md` — working checklist; verify each item marked complete

---

## What Was Built

Phase 5.0 modifies three files:
- `src/database/actions.js` — `snoozed_until` migration; updated `getUnassignedActions()`; new `snoozeAction(id)`
- `src/routes/api.js` — `classifyAction()` helper; updated `POST /api/actions`; new `POST /api/actions/:id/snooze`
- `public/index.html` — `UNASSIGNED` global; `loadUnassigned()`; `renderUnassignedTray()`; three action handlers; `#unassigned-tray` div in sidebar; `init()` and `handleQuickCapture()` wiring

---

## Review Checklist

### `src/database/actions.js`

- [ ] `snoozed_until TEXT` column added via migration in `initActionsTable()` using `IF NOT EXISTS` pattern (check for column, then `ALTER TABLE`)
- [ ] `action_type` migration NOT duplicated — only `snoozed_until` added
- [ ] `getUnassignedActions()` filters `done = 0` (no completed actions in tray)
- [ ] `getUnassignedActions()` filters snoozed: `snoozed_until IS NULL OR snoozed_until <= datetime('now')`
- [ ] `getUnassignedActions()` orders tiny first: `ORDER BY CASE WHEN action_type = 'tiny' THEN 0 ELSE 1 END, created_at DESC`
- [ ] `snoozeAction(id)` sets `snoozed_until = datetime('now', '+1 day')` and returns updated row
- [ ] `snoozeAction` exported in `module.exports`
- [ ] All functions synchronous (`better-sqlite3` — no `async/await`)

---

### `src/routes/api.js`

- [ ] `classifyAction(title)` helper exists — returns `'tiny'` or `'standard'`
- [ ] Classifier returns `'standard'` if title is null, empty, or ≥ 60 chars
- [ ] Classifier returns `'tiny'` if `!tiny` marker present in title
- [ ] Classifier checks first word against a set of simple verbs (call, text, email, book, pay, buy, send, check, review, schedule, confirm, cancel, sign, reply, fill, drop, pick, order, ask, remind, print, read — or similar)
- [ ] `POST /api/actions` uses `classifyAction(title)` when no explicit `action_type` provided
- [ ] `POST /api/actions` still works when `action_type` is explicitly passed (caller override respected)
- [ ] `POST /api/actions/:id/snooze` route exists — calls `actionsDb.snoozeAction(id)`
- [ ] `POST /api/actions/:id/snooze` defined **before** `PUT /api/actions/:id` (static route before dynamic)
- [ ] `GET /api/actions/unassigned` unchanged in route code — DB function change handles filtering
- [ ] No existing routes broken or modified unintentionally

---

### `public/index.html`

**Globals & data loading:**
- [ ] `let UNASSIGNED = []` declared in globals block
- [ ] `loadUnassigned()` function exists — fetches `GET /api/actions/unassigned`, stores in `UNASSIGNED`, calls `renderUnassignedTray()`
- [ ] `loadUnassigned()` included in `init()` `Promise.all` call
- [ ] `loadUnassigned()` called in `handleQuickCapture()` else branch (when unassigned) so tray updates immediately

**Sidebar tray:**
- [ ] `<div id="unassigned-tray" style="display:none;">` exists in sidebar HTML immediately after Quick Capture block
- [ ] `renderUnassignedTray()` targets `id="unassigned-tray"`
- [ ] Tray hidden (`display:none`) when `UNASSIGNED.length === 0`
- [ ] Tray shows when `UNASSIGNED.length > 0`
- [ ] Count badge shows total unassigned count (not just visible 5)
- [ ] Only 5 items rendered; overflow shown as `+ N more` text
- [ ] Each item: checkbox, truncated title, assign dropdown, snooze button
- [ ] Assign dropdown populated from `OUTCOMES` global (no extra fetch)
- [ ] Assign dropdown has a blank default `<option value="">assign…</option>` as first option
- [ ] All user-provided text escaped via `escHtml()`

**Action handlers:**
- [ ] `completeUnassignedAction(id)` — `PUT /api/actions/:id` with `{done: 1}`; removes from `UNASSIGNED`; calls `renderUnassignedTray()`; shows "Done ✓" toast
- [ ] `assignUnassignedAction(id, selectEl)` — `PUT /api/actions/:id` with `{outcome_id, action_type: 'standard'}`; removes from `UNASSIGNED`; calls `loadData()` then re-renders if current outcome; shows assign toast
- [ ] `snoozeUnassignedAction(id)` — `POST /api/actions/:id/snooze`; removes from `UNASSIGNED`; calls `renderUnassignedTray()`
- [ ] None of the three handlers causes a full page reload or loses app state

---

### No Regressions

- [ ] `POST /api/actions` with explicit `action_type` still works (existing callers unaffected)
- [ ] `PUT /api/actions/:id` unchanged — no regression in action editing
- [ ] Quick Capture in sidebar still works — captured actions appear in tray when unassigned
- [ ] Quick Capture with outcome selected still navigates to Phase 2 as before
- [ ] Outcomes list (Phase 1) loads correctly
- [ ] Phase 2 action list loads correctly; assigned actions do NOT appear in tray
- [ ] Completing an action via Phase 2 checkbox does not show it in the unassigned tray
- [ ] Focus Mode unchanged
- [ ] Today view unchanged
- [ ] Advisor view unchanged
- [ ] Preserved files untouched: `src/routes/slack.js`, `src/routes/grain.js`, `src/database/triage.js`, `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`, all integrations

---

## What's Out of Scope (do not flag as missing)

- Recurring tasks
- AI-based classification
- Editing snooze duration
- Reordering tray items
- Expanding past 5 items
- Mobile navigation changes

---

## When You're Done

Log results to `test_tracker/Phase 5.0 - Tiny Tasks.md`. Verdict: **approved** or blocked with specifics.
