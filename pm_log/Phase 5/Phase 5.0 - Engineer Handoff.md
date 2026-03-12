# Phase 5.0 — Engineer Handoff

## Agent Prompt

You are building Phase 5.0 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase ships Tiny Tasks: an unassigned action tray in the sidebar, auto-classification of lightweight captures, and a snooze mechanism. Read `pm_log/Phase 5/Phase 5.0 - Engineer Handoff.md` in full before writing any code, then use `dev_tracker/Phase 5.0 - Tiny Tasks.md` as your working checklist. Mark items complete as you finish them.

---

You are building Phase 5.0 of Waypoint — a single-user personal execution OS at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 5/Phase 5.0 - Tiny Tasks.md` — full phase spec
2. `dev_tracker/Phase 5.0 - Tiny Tasks.md` — your working checklist
3. `src/database/actions.js` — understand the existing `action_type` column (already added), `getUnassignedActions()`, `updateAction()`, and the `initActionsTable()` migration pattern
4. `src/routes/api.js` — find `POST /api/actions` (around line 515), `GET /api/actions/unassigned` (around line 501), and `PUT /api/actions/:id` (around line 563); understand the allowed-fields pattern in `updateAction()`
5. `public/index.html` — find the sidebar Quick Capture block (around line 300); find `init()` (around line 840); find `populateQuickCaptureOutcomes()` (around line 771); find `OUTCOMES` and other globals (around line 610); find `escHtml()` and `showToast()` for reference

**Prerequisites:** Phase 4.0 complete ✅. `action_type TEXT DEFAULT 'standard'` already exists on the `actions` table — do NOT add it again.

---

## Known Codebase State

- **`action_type` already added:** `src/database/actions.js` `initActionsTable()` already has the `ALTER TABLE` migration for `action_type`. Confirm before touching it.
- **`getUnassignedActions()`:** exists in `actions.js` — returns `WHERE outcome_id IS NULL ORDER BY created_at DESC`. You will modify it to also filter `snoozed_until`.
- **`updateAction(id, updates)`:** already in `allowed` list: `title, time_estimate, energy_type, action_type, done, blocked, blocked_by, position, outcome_id`. This means assigning an action to an outcome (`outcome_id`) and promoting it (`action_type = 'standard'`) both work with zero DB changes — just call the existing `PUT /api/actions/:id` route.
- **`GET /api/actions/unassigned`:** exists at line ~501 in `api.js`. You will modify it to filter snoozed.
- **`POST /api/actions`:** exists at line ~515. You will add the classifier call here.
- **`better-sqlite3`** is synchronous. All DB calls are sync; no `async/await` in DB modules.
- **Sidebar HTML:** the Quick Capture block is in static HTML (not rendered by JS). The tray goes immediately below it. You'll inject it via JS into a container you add to the static HTML.
- **`OUTCOMES` global:** already populated by `loadData()`. Use it for the assign dropdown — no extra fetch needed.

---

## Pre-Build Checklist

- [ ] Read `src/database/actions.js` — confirm `action_type` migration exists; note `initActionsTable()` migration pattern for adding `snoozed_until`
- [ ] Read `src/routes/api.js` lines 498–580 — understand `GET /api/actions/unassigned`, `POST /api/actions`, and `PUT /api/actions/:id`
- [ ] Read `public/index.html` lines 300–320 — understand the sidebar Quick Capture HTML block you'll add the tray below
- [ ] Read `public/index.html` lines 610–635 — understand global variable declarations; add `UNASSIGNED` here
- [ ] Read `public/index.html` lines 840–844 — confirm `init()` runs on load; add `loadUnassigned()` call there

---

## Workstream 1 — DB: `src/database/actions.js`

### 1A — Add `snoozed_until` migration

In `initActionsTable()`, after the existing `action_type` migration block, add:

```js
if (!actionCols.includes('snoozed_until')) {
    db.exec("ALTER TABLE actions ADD COLUMN snoozed_until TEXT");
    console.log('✅ actions.snoozed_until column added');
}
```

### 1B — Update `getUnassignedActions()`

Filter out snoozed items (hide until `snoozed_until` passes):

```js
function getUnassignedActions() {
    return db.prepare(`
        SELECT * FROM actions
        WHERE outcome_id IS NULL
          AND done = 0
          AND (snoozed_until IS NULL OR snoozed_until <= datetime('now'))
        ORDER BY
          CASE WHEN action_type = 'tiny' THEN 0 ELSE 1 END,
          created_at DESC
    `).all();
}
```

Note two changes from the original: filters `done = 0` (no point showing completed), orders tiny first, and filters snoozed.

### 1C — Add `snoozeAction(id)`

```js
function snoozeAction(id) {
    db.prepare(`
        UPDATE actions SET snoozed_until = datetime('now', '+1 day') WHERE id = ?
    `).run(id);
    return db.prepare('SELECT * FROM actions WHERE id = ?').get(id);
}
```

Export it: add `snoozeAction` to `module.exports`.

---

## Workstream 2 — API: `src/routes/api.js`

### 2A — Classifier helper

Add this near the top of the route file (below the `require` block, before the first route):

```js
const TINY_VERBS = new Set([
  'call','text','email','book','pay','buy','send','check','review',
  'schedule','confirm','cancel','sign','reply','fill','drop','pick',
  'order','ask','remind','print','read',
]);

function classifyAction(title) {
  if (!title || title.length >= 60) return 'standard';
  if (title.includes('!tiny')) return 'tiny';
  const firstWord = title.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  return TINY_VERBS.has(firstWord) ? 'tiny' : 'standard';
}
```

### 2B — Update `POST /api/actions`

In the existing `POST /api/actions` handler (around line 515), add classifier logic. The current body destructuring is `{ title, time_estimate, energy_type }`. Update it:

```js
router.post('/actions', (req, res, next) => {
    try {
        const { title, time_estimate, energy_type, action_type } = req.body;
        // Auto-classify unassigned actions if action_type not explicitly provided
        const resolvedType = action_type || classifyAction(title);
        const action = actionsDb.createAction(null, {
            title,
            time_estimate: time_estimate || 30,
            energy_type: energy_type || 'light',
            action_type: resolvedType,
        });
        res.json({ success: true, data: action });
    } catch (err) {
        next(err);
    }
});
```

### 2C — Add `POST /api/actions/:id/snooze`

Add this **before** `PUT /api/actions/:id` (static routes before dynamic — already the pattern in this file):

```js
// POST /api/actions/:id/snooze — snooze an unassigned action for 1 day
router.post('/actions/:id/snooze', (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const action = actionsDb.snoozeAction(id);
        res.json({ success: true, data: action });
    } catch (err) {
        next(err);
    }
});
```

### 2D — Verify `GET /api/actions/unassigned` response

The existing route calls `actionsDb.getUnassignedActions()` and returns `{ success: true, count: N, data: [...] }`. Since you updated the DB function in Workstream 1B, this route requires no change.

---

## Workstream 3 — Frontend: `public/index.html`

### 3A — Add `UNASSIGNED` global

In the globals block (around line 622, near `FOCUS_SUMMARY`), add:

```js
let UNASSIGNED = []  // unassigned actions (tiny + standard), excludes snoozed
```

### 3B — Add `loadUnassigned()` function

Near `loadInboxData()` (around line 712):

```js
async function loadUnassigned() {
  try {
    const res = await fetch('/api/actions/unassigned')
    const data = await res.json()
    UNASSIGNED = data.data || []
    renderUnassignedTray()
  } catch (_) {}
}
```

### 3C — Add `renderUnassignedTray()` function

This renders the tray into a `<div id="unassigned-tray">` you'll add to the sidebar HTML. Add the function near `populateQuickCaptureOutcomes()`:

```js
function renderUnassignedTray() {
  const el = document.getElementById('unassigned-tray')
  if (!el) return

  const visible = UNASSIGNED.slice(0, 5)
  const overflow = UNASSIGNED.length - visible.length

  if (UNASSIGNED.length === 0) {
    el.innerHTML = ''
    el.style.display = 'none'
    return
  }

  el.style.display = 'block'

  const outcomeOptions = OUTCOMES.map(o =>
    `<option value="${o.id}">${escHtml(o.title.length > 32 ? o.title.slice(0,32)+'…' : o.title)}</option>`
  ).join('')

  el.innerHTML = `
    <div class="px-4 py-3 border-b border-gray-100">
      <div class="flex items-center justify-between mb-2">
        <div class="text-gray-400 font-semibold uppercase tracking-wider" style="font-size:10px">
          Unassigned
          <span class="ml-1 bg-gray-200 text-gray-500 rounded-full px-1.5 py-0.5" style="font-size:9px">${UNASSIGNED.length}</span>
        </div>
      </div>
      <div class="space-y-1.5">
        ${visible.map(a => `
          <div class="flex items-center gap-1.5 group" data-aid="${a.id}">
            <input
              type="checkbox"
              style="width:11px;height:11px;flex-shrink:0;cursor:pointer;"
              onchange="completeUnassignedAction(${a.id})"
              title="Mark done"
            >
            <span class="flex-1 text-gray-700 truncate" style="font-size:11px" title="${escHtml(a.title)}">${escHtml(a.title)}</span>
            <select
              style="font-size:10px;max-width:90px;border:1px solid #e5e7eb;border-radius:4px;padding:1px 3px;color:#6b7280;background:white;cursor:pointer;"
              onchange="assignUnassignedAction(${a.id}, this)"
              title="Assign to outcome"
            >
              <option value="">assign…</option>
              ${outcomeOptions}
            </select>
            <button
              onclick="snoozeUnassignedAction(${a.id})"
              style="font-size:10px;color:#d1d5db;background:transparent;border:none;cursor:pointer;padding:0 2px;flex-shrink:0;"
              title="Snooze until tomorrow"
            >z</button>
          </div>
        `).join('')}
        ${overflow > 0 ? `<div class="text-gray-400 mt-1" style="font-size:10px">+ ${overflow} more</div>` : ''}
      </div>
    </div>
  `
}
```

### 3D — Add tray action handlers

```js
async function completeUnassignedAction(id) {
  try {
    await fetch(`/api/actions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: 1 }),
    })
    UNASSIGNED = UNASSIGNED.filter(a => a.id !== id)
    renderUnassignedTray()
    showToast('Done ✓', 'success')
  } catch (_) { showToast('Failed to complete', 'warning') }
}

async function assignUnassignedAction(id, selectEl) {
  const outcomeId = selectEl.value ? parseInt(selectEl.value) : null
  if (!outcomeId) return
  try {
    await fetch(`/api/actions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome_id: outcomeId, action_type: 'standard' }),
    })
    UNASSIGNED = UNASSIGNED.filter(a => a.id !== id)
    // Refresh the outcome's actions so it appears immediately if currently viewing it
    await loadData()
    if (selectedId === outcomeId) renderCenter()
    renderUnassignedTray()
    const name = OUTCOMES.find(o => o.id === outcomeId)?.title || 'outcome'
    showToast(`Assigned to "${name.length > 28 ? name.slice(0,28)+'…' : name}"`, 'success')
  } catch (_) { showToast('Failed to assign', 'warning') }
}

async function snoozeUnassignedAction(id) {
  try {
    await fetch(`/api/actions/${id}/snooze`, { method: 'POST' })
    UNASSIGNED = UNASSIGNED.filter(a => a.id !== id)
    renderUnassignedTray()
  } catch (_) {}
}
```

### 3E — Add tray container to sidebar HTML

In the static sidebar HTML (around line 319, immediately after the closing `</div>` of the Quick Capture block), add:

```html
<!-- Unassigned Tray (Phase 5.0) — populated by renderUnassignedTray() -->
<div id="unassigned-tray" style="display:none;"></div>
```

### 3F — Wire up `init()`

In `init()` (around line 840), add `loadUnassigned()` to the initial `Promise.all`:

```js
async function init() {
  await Promise.all([loadData(), loadInboxData(), loadArchivedOutcomes(), loadTodayStats(), loadUnassigned()])
  renderAll()
  checkAdvisorDot()
}
```

Also call `loadUnassigned()` after a quick capture creates an unassigned action — in `handleQuickCapture()`, in the `else` branch (no outcomeId):

```js
} else {
  await loadUnassigned()
  renderCenter()
  renderRightPanel()
  showToast('Action saved — assign it to an outcome when ready', 'success')
}
```

---

## Key Constraints

- **Do not add `action_type` column again** — it already exists; only add `snoozed_until`
- **`getUnassignedActions()` must filter `done = 0`** — don't show completed actions in tray
- **Tiny tasks listed first** — `ORDER BY CASE WHEN action_type = 'tiny' THEN 0 ELSE 1 END`
- **Cap tray at 5 visible** — show "+ N more", no expand in V1
- **Assigning promotes to standard** — `action_type = 'standard'` set alongside `outcome_id`
- **Empty tray = no tray** — `display:none` the container when `UNASSIGNED.length === 0`
- **`POST /api/actions/:id/snooze` must be before `PUT /api/actions/:id`** — static routes before dynamic params
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, integrations, `triage.js`, `oauth-tokens.js`, `monitored-channels.js`

---

## Files You Will Touch

| File | What changes |
|---|---|
| `src/database/actions.js` | Add `snoozed_until` migration; update `getUnassignedActions()`; add `snoozeAction(id)` |
| `src/routes/api.js` | Add `classifyAction()` helper; update `POST /api/actions`; add `POST /api/actions/:id/snooze` |
| `public/index.html` | `UNASSIGNED` global; `loadUnassigned()`; `renderUnassignedTray()`; three action handlers; sidebar `#unassigned-tray` div; `init()` + `handleQuickCapture()` wiring |

Three files. No new files created.

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 5.0 - Tiny Tasks.md`. Log decisions. Flag for PM review.
