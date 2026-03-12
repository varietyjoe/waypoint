# Test Tracker — Phase 5.0: Tiny Tasks

**Status:** APPROVED
**Review date:** 2026-02-24
**Reviewer:** Claude Sonnet 4.6
**Code review brief:** `pm_log/Phase 5/Phase 5.0 - Code Review Handoff.md`

---

## Verdict

**APPROVED.** All 40 checklist items pass. Implementation matches spec exactly. No regressions introduced. One non-blocking observation logged below.

---

## Results

### `src/database/actions.js`

- [x] `snoozed_until TEXT` migration added via `IF NOT EXISTS` pattern — lines 32–35 check `actionCols.includes('snoozed_until')` before calling `ALTER TABLE`
- [x] `action_type` migration NOT duplicated — existing block at lines 29–31 untouched; only `snoozed_until` added
- [x] `getUnassignedActions()` filters `done = 0` — confirmed at line 80
- [x] `getUnassignedActions()` filters snoozed — `snoozed_until IS NULL OR snoozed_until <= datetime('now')` at line 82
- [x] `getUnassignedActions()` orders tiny first — `ORDER BY CASE WHEN action_type = 'tiny' THEN 0 ELSE 1 END, created_at DESC` at lines 83–85
- [x] `snoozeAction(id)` sets `snoozed_until = datetime('now', '+1 day')` and returns updated row — lines 132–137
- [x] `snoozeAction` exported in `module.exports` — line 149
- [x] All functions synchronous — no `async/await` anywhere in file

---

### `src/routes/api.js`

- [x] `classifyAction(title)` helper exists — lines 75–80, placed after `require` block before first route
- [x] Classifier returns `'standard'` for null, empty, or title length >= 60 — `if (!title || title.length >= 60) return 'standard'`
- [x] Classifier returns `'tiny'` for `!tiny` marker — `if (title.includes('!tiny')) return 'tiny'`
- [x] Classifier checks first word against `TINY_VERBS` set — all 22 specified verbs present; first word extracted, lowercased, stripped of non-alpha chars
- [x] `POST /api/actions` uses `classifyAction(title)` when no explicit `action_type` — `const resolvedType = action_type || classifyAction(title)` at line 534
- [x] `POST /api/actions` respects explicit `action_type` when provided — caller override via `action_type || ...` short-circuit
- [x] `POST /api/actions/:id/snooze` route exists — lines 582–593
- [x] Snooze route defined before `PUT /api/actions/:id` — snooze at line 585, PUT at line 599
- [x] `GET /api/actions/unassigned` route code unchanged — lines 515–522, no route-level changes needed
- [x] No existing routes broken or modified unintentionally

---

### `public/index.html`

**Globals & data loading:**

- [x] `let UNASSIGNED = []` declared in globals block — line 629
- [x] `loadUnassigned()` function exists — lines 748–755; fetches `/api/actions/unassigned`, stores in `UNASSIGNED`, calls `renderUnassignedTray()`
- [x] `loadUnassigned()` included in `init()` `Promise.all` — line 978
- [x] `loadUnassigned()` called in `handleQuickCapture()` else branch — line 2481

**Sidebar tray:**

- [x] `<div id="unassigned-tray" style="display:none;">` in sidebar HTML — line 323, immediately after Quick Capture block closing `</div>`
- [x] `renderUnassignedTray()` targets `id="unassigned-tray"` — `document.getElementById('unassigned-tray')` at line 758
- [x] Tray hidden (`display:none`) when `UNASSIGNED.length === 0` — lines 764–768
- [x] Tray shown (`display:block`) when `UNASSIGNED.length > 0` — line 770
- [x] Count badge shows total unassigned count (not just visible 5) — `${UNASSIGNED.length}` at line 781
- [x] Only 5 items rendered; overflow shown as `+ N more` — `UNASSIGNED.slice(0, 5)` at line 761; overflow text at line 809
- [x] Each item has checkbox, truncated title, assign dropdown, snooze button — lines 786–806
- [x] Assign dropdown populated from `OUTCOMES` global — `OUTCOMES.map(...)` at line 772; no extra fetch
- [x] Assign dropdown has blank default `<option value="">assign…</option>` — line 799
- [x] All user-provided text escaped via `escHtml()` — `a.title` escaped in title attribute and span content (line 793); `o.title` escaped in option text (line 773); `o.id` is a DB integer (safe unescaped)

**Action handlers:**

- [x] `completeUnassignedAction(id)` — `PUT /api/actions/:id` with `{done: 1}`; filters from `UNASSIGNED`; calls `renderUnassignedTray()`; shows `'Done ✓'` toast — lines 815–826
- [x] `assignUnassignedAction(id, selectEl)` — `PUT /api/actions/:id` with `{outcome_id, action_type: 'standard'}`; filters from `UNASSIGNED`; calls `loadData()` then `renderCenter()` if current outcome selected; shows assign toast — lines 828–845
- [x] `snoozeUnassignedAction(id)` — `POST /api/actions/:id/snooze`; filters from `UNASSIGNED`; calls `renderUnassignedTray()` — lines 847–853
- [x] None of the three handlers causes a full page reload or loses app state — all use optimistic local mutation plus targeted re-renders

---

### No Regressions

- [x] `POST /api/actions` with explicit `action_type` still works — `action_type || classifyAction(title)` short-circuits correctly
- [x] `PUT /api/actions/:id` unchanged — route handler unmodified
- [x] Quick Capture unassigned path works — calls `POST /api/actions`, then `loadUnassigned()`, `renderCenter()`, `renderRightPanel()`
- [x] Quick Capture with outcome selected still navigates to Phase 2 — `POST /api/outcomes/:id/actions` branch unchanged
- [x] Outcomes list (Phase 1) loads correctly — `loadData()` and `renderAll()` untouched
- [x] Phase 2 action list loads correctly — `getActionsByOutcome()` unchanged; assigned actions (outcome_id IS NOT NULL) excluded from tray by query
- [x] Completing an action via Phase 2 checkbox does not appear in tray — tray only shows `outcome_id IS NULL AND done = 0`
- [x] Focus Mode, Today view, Advisor view — no code in those paths touched
- [x] Preserved files untouched — `src/routes/grain.js`, `src/database/triage.js`, `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`, all integrations confirmed clean via git diff

**Note on `src/routes/slack.js`:** File shows as modified relative to the Phase 2.1 snapshot commit, but the change (adding `POST /api/slack/waypoint-command`) was introduced by Phase 4.0 (Capture Everywhere) — it predates Phase 5.0 entirely. Not a Phase 5.0 regression.

---

## Non-Blocking Observations

1. **`done_at` not set when completing from tray.** `completeUnassignedAction` calls `PUT /api/actions/:id` with `{done: 1}`, which routes through `updateAction()`. This function does not set `done_at`. Only `PATCH /api/actions/:id/toggle` (used by Phase 2 checkboxes) sets `done_at`. Actions completed from the tray will have `done = 1` but `done_at = NULL`. This may affect Phase 3.3 pattern analytics that use `done_at` for time-of-day stats. Low severity — recommend Phase 5.x cleanup to have `updateAction` set `done_at` when `done` transitions to 1.

2. **Silent error on snooze failure.** `snoozeUnassignedAction` catches errors silently (`catch (_) {}`). A failure toast would improve UX but is not required by spec. Out of scope for 5.0.
