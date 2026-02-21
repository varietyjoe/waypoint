# Phase 2.0 — Engineer Handoff

## Agent Prompt

You are building Phase 2.0 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase is all bug fixes and missing editing capabilities — no new features, no new architecture. Three workstreams: (1) fix the archive false-failure bug, (2) add inline editing to all outcome and action fields, (3) add a result toggle + optional note to the Complete & Close screen. Read `pm_log/Phase 2.0/Phase 2.0 - Foundation Fixes.md` in full before writing any code, then use `dev_tracker/Phase 2.0 - Foundation Fixes.md` as your working checklist.

---

You are building Phase 2.0 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 2.0 - Foundation Fixes.md` — full phase spec
2. `dev_tracker/Phase 2.0 - Foundation Fixes.md` — your working checklist; update as you go
3. `public/index.html` — the entire frontend; read it fully before touching it
4. `src/database/outcomes.js` — understand `completeOutcome()` and the existing migration pattern
5. `src/routes/api.js` — confirm `PUT /api/outcomes/:id` and `PUT /api/actions/:id` routes exist and their expected request body shapes
6. `key_decisions/decisions_log.md` — especially Decision #16 (outcome result fields)

**Prerequisites:** Phase 1.4 complete and approved.

---

## Pre-Build Checklist (Do Before Writing Code)

- [ ] Read `public/index.html` in full. Find and understand: `archiveOutcome()`, `renderPhase2()` (action row rendering), `renderPhase3()` (Complete & Close)
- [ ] Confirm `PUT /api/outcomes/:id` and `PUT /api/actions/:id` exist in `src/routes/api.js` and understand what fields each accepts in the request body
- [ ] Read `src/database/outcomes.js` — understand the existing `ALTER TABLE` migration pattern in `initOutcomesTable()` before adding new columns
- [ ] Confirm the `completeOutcome()` function signature and what fields it reads from `req.body`

---

## Workstream 1 — Fix the Archive False Failure

### The Bug

`archiveOutcome()` in `public/index.html` (around line 1832) does this:

```js
async function archiveOutcome() {
  if (!selectedId) return
  try {
    // ... collect reflection fields ...
    const res = await fetch(`/api/outcomes/${selectedId}/complete`, { ... })
    if (!res.ok) throw new Error('complete failed')

    await Promise.all([loadData(), loadArchivedOutcomes(), loadTodayStats()])  // ← the problem
    selectedId = OUTCOMES.length > 0 ? OUTCOMES[0].id : null
    currentPhase = 1
    renderAll()
    showToast('Outcome closed · Well done.', 'success')
  } catch (err) {
    showToast('Failed to archive outcome', 'warning')  // ← fires even when archive succeeded
  }
}
```

If the archive POST succeeds but any of the three reload calls throw, the catch block fires and the user sees "Failed to archive outcome" — even though the outcome was archived successfully.

### The Fix

Restructure so the success toast fires immediately after archive confirmation, and reload failures are isolated:

```js
async function archiveOutcome() {
  if (!selectedId) return
  try {
    const what_worked      = document.getElementById('reflectWorked')?.value.trim()  || ''
    const what_slipped     = document.getElementById('reflectSlipped')?.value.trim() || ''
    const reusable_insight = document.getElementById('reflectInsight')?.value.trim() || ''
    const outcome_result      = selectedOutcomeResult   // from the new toggle (Workstream 3)
    const outcome_result_note = document.getElementById('resultNote')?.value.trim() || ''

    if (!outcome_result) {
      showToast('Please select Hit it or Didn\'t land before archiving', 'warning')
      return
    }

    const res = await fetch(`/api/outcomes/${selectedId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ what_worked, what_slipped, reusable_insight, outcome_result, outcome_result_note }),
    })
    if (!res.ok) throw new Error('complete failed')

    // Archive succeeded — toast immediately, before reload
    showToast('Outcome closed · Well done.', 'success')

    // Reload separately — failures here don't mask the archive success
    selectedId   = null
    currentPhase = 1
    try {
      await Promise.all([loadData(), loadArchivedOutcomes(), loadTodayStats()])
      if (OUTCOMES.length > 0) selectedId = OUTCOMES[0].id
    } catch (reloadErr) {
      console.warn('Reload after archive failed:', reloadErr)
      // Don't show an error — the archive worked, just reload manually
    }
    renderAll()

  } catch (err) {
    showToast('Failed to archive outcome', 'warning')
  }
}
```

---

## Workstream 2 — Inline Editing

### Guiding Principles

- **No save buttons.** Edits save on blur (for text inputs) or immediately on interaction (for toggles).
- **Pencil icon on hover.** A small pencil icon (`✎`) appears on hover next to editable fields. Clicking it (or clicking the value directly) activates edit mode.
- **Inline confirmation.** On successful save, show a very brief "Saved" label next to the field (fades out in 1.5s). No toast.
- **All saves via existing PUT endpoints.** `PUT /api/outcomes/:id` and `PUT /api/actions/:id`. Both already exist.

### 2A — Outcome Inline Editing

Outcomes are displayed in the Phase 2 center panel header (when an outcome is selected). The relevant rendering is in `renderPhase2()`.

**Fields to make editable:**

| Field | Element type | Save trigger | API field name |
|---|---|---|---|
| Title | `<input type="text">` | blur or Enter | `title` |
| Description | `<textarea>` | blur | `description` |
| Deadline | `<input type="date">` | blur | `deadline` |
| Priority | `<select>` | change | `priority` |
| Impact | `<input type="text">` | blur or Enter | `impact` |

**Implementation pattern for each field:**

1. Render the field value as a `<span>` with a hover pencil icon
2. On click (span or pencil): replace span with the appropriate input element, pre-filled with the current value, focused
3. On save trigger: call `saveOutcomeField(outcomeId, fieldName, value)`
4. `saveOutcomeField()`:
   ```js
   async function saveOutcomeField(id, field, value) {
     const res = await fetch(`/api/outcomes/${id}`, {
       method: 'PUT',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ [field]: value }),
     })
     if (res.ok) {
       // Update in-memory OUTCOMES array
       const outcome = OUTCOMES.find(o => o.id === id)
       if (outcome) outcome[field] = value
       // Show brief "Saved" inline (not a toast)
       showInlineSaved(/* reference to the field element */)
       renderAll()
     }
   }
   ```
5. On ESC: cancel edit, restore the span (no API call)

**Deadline specifics:**
- Render as `<input type="date">` — value must be in `YYYY-MM-DD` format for the input, which matches the DB format
- Add a small "✕ Clear" button next to the date input to remove the deadline (send `deadline: null` to the API)
- After save, re-run the deadline display logic (`daysLeft`, display string) from the existing `normalizeOutcome()` function

### 2B — Action Inline Editing

Actions are rendered in the Phase 2 checklist by `renderPhase2()`. Each action row currently shows: checkbox / title / energy badge / time badge / blocked indicator.

**Fields to make editable:**

| Field | Element type | Save trigger | API field name |
|---|---|---|---|
| Title | `<input type="text">` | blur or Enter | `title` |
| Time estimate | `<input type="number" min="1">` | blur | `time_estimate` |
| Energy type | Two-button toggle [Deep] [Light] | immediate on click | `energy_type` |
| Blocked | Checkbox | immediate on click | `blocked` |
| Blocked reason | `<input type="text">` (appears when blocked=true) | blur or Enter | `blocked_by` |

**Energy type toggle:**
- Replace the current energy badge (static display) with two small buttons: `[Deep]` `[Light]`
- Active one is filled (purple for Deep, blue for Light), inactive is outlined
- On click: immediately call `PUT /api/actions/:id` with `{ energy_type: 'deep' | 'light' }` — no confirm step
- Update in-memory action array and re-render the row

**Blocked checkbox:**
- When checked: immediately save `{ blocked: 1 }` to the API, show the blocked reason text input inline
- When unchecked: immediately save `{ blocked: 0, blocked_by: null }`, hide the reason input
- Blocked reason input: saves on blur

**Save function:**
```js
async function saveActionField(id, fields) {
  // fields is an object: { energy_type: 'deep' } or { title: 'new title' }, etc.
  const res = await fetch(`/api/actions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (res.ok) {
    // Update in-memory OUTCOMES[x].actions array
    for (const outcome of OUTCOMES) {
      const action = (outcome.actions || []).find(a => a.id === id)
      if (action) { Object.assign(action, fields); break }
    }
    renderAll()
  }
}
```

**Title click-to-edit:**
- Clicking the action title text puts it in an inline `<input>` replacing the span
- ESC cancels (restores original text, no API call)
- Enter or blur saves

---

## Workstream 3 — Result Toggle on Complete & Close

### DB Migration

In `src/database/outcomes.js`, inside `initOutcomesTable()`, add to the existing migration block (which already checks for columns before altering):

```js
if (!cols.includes('outcome_result'))      db.exec("ALTER TABLE outcomes ADD COLUMN outcome_result TEXT");
if (!cols.includes('outcome_result_note')) db.exec("ALTER TABLE outcomes ADD COLUMN outcome_result_note TEXT");
```

Both nullable. Existing archived outcomes will have null values — that's acceptable.

### API — `POST /api/outcomes/:id/complete`

In `src/routes/api.js`, update the `/complete` route to extract and pass the new fields:

```js
router.post('/outcomes/:id/complete', (req, res, next) => {
  try {
    const outcomeId = parseInt(req.params.id);
    const outcome = outcomesDb.getOutcomeById(outcomeId);
    if (!outcome) return res.status(404).json({ success: false, error: 'Outcome not found' });

    const actions = actionsDb.getActionsByOutcome(outcomeId);
    const { what_worked, what_slipped, reusable_insight, outcome_result, outcome_result_note } = req.body || {};

    // outcome_result is required — reject if missing
    if (!outcome_result || !['hit', 'miss'].includes(outcome_result)) {
      return res.status(400).json({ success: false, error: 'outcome_result must be "hit" or "miss"' });
    }

    const result = outcomesDb.completeOutcome(
      outcomeId, actions,
      { what_worked, what_slipped, reusable_insight },
      { outcome_result, outcome_result_note: outcome_result_note || null }
    );
    res.json({ success: true, message: 'Outcome completed and archived', data: result });
  } catch (err) {
    next(err);
  }
});
```

### DB — `completeOutcome()` in `src/database/outcomes.js`

Update the function signature and the UPDATE statement to include the new fields:

```js
function completeOutcome(id, actionsData, reflectionData = {}, resultData = {}) {
  // ... existing stats calculations unchanged ...

  const { outcome_result, outcome_result_note } = resultData;

  db.prepare(`
    UPDATE outcomes
    SET status = 'archived',
        archived_at = datetime('now'),
        updated_at = datetime('now'),
        completed_actions_count = ?,
        total_actions_count = ?,
        total_estimated_time = ?,
        deadline_hit = ?,
        outcome_result = ?,
        outcome_result_note = ?
    WHERE id = ?
  `).run(completedCount, totalCount, totalTime, deadlineHit, outcome_result, outcome_result_note || null, id);

  // reflection insert unchanged
  const { what_worked, what_slipped, reusable_insight } = reflectionData;
  if (what_worked || what_slipped || reusable_insight) {
    db.prepare(`
      INSERT INTO reflections (outcome_id, what_worked, what_slipped, reusable_insight)
      VALUES (?, ?, ?, ?)
    `).run(id, what_worked || null, what_slipped || null, reusable_insight || null);
  }

  return getOutcomeById(id);
}
```

### Frontend — `renderPhase3()` in `public/index.html`

Add the result toggle at the top of the Phase 3 view, before the reflection textareas.

**A module-level variable to track selection:**
```js
let selectedOutcomeResult = null  // 'hit' | 'miss' | null
```
Reset to `null` whenever `setPhase()` is called.

**Toggle HTML (render inside `renderPhase3()` before the reflection section):**
```html
<!-- Result toggle — required -->
<div class="mb-5">
  <p class="text-gray-400 font-medium mb-3" style="font-size:10px;text-transform:uppercase;letter-spacing:.06em">
    Did this outcome succeed?
  </p>
  <div class="flex gap-3">
    <button
      id="resultHit"
      onclick="selectResult('hit')"
      class="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-500 font-semibold transition-all"
      style="font-size:13px">
      Hit it ✓
    </button>
    <button
      id="resultMiss"
      onclick="selectResult('miss')"
      class="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-500 font-semibold transition-all"
      style="font-size:13px">
      Didn't land
    </button>
  </div>
</div>

<!-- Result note — optional, subtle -->
<div class="mb-5">
  <input
    id="resultNote"
    type="text"
    placeholder="What was the actual result? e.g. '4 meetings booked', 'deck approved at 2x valuation'"
    class="w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-gray-600 placeholder-gray-300"
    style="font-size:11px">
</div>
```

**`selectResult()` function:**
```js
function selectResult(value) {
  selectedOutcomeResult = value

  const hitBtn  = document.getElementById('resultHit')
  const missBtn = document.getElementById('resultMiss')
  const archiveBtn = document.getElementById('archiveBtn')

  if (value === 'hit') {
    hitBtn.classList.add('bg-emerald-500', 'border-emerald-500', 'text-white')
    hitBtn.classList.remove('border-gray-200', 'text-gray-500')
    missBtn.classList.remove('bg-gray-700', 'border-gray-700', 'text-white')
    missBtn.classList.add('border-gray-200', 'text-gray-500')
  } else {
    missBtn.classList.add('bg-gray-700', 'border-gray-700', 'text-white')
    missBtn.classList.remove('border-gray-200', 'text-gray-500')
    hitBtn.classList.remove('bg-emerald-500', 'border-emerald-500', 'text-white')
    hitBtn.classList.add('border-gray-200', 'text-gray-500')
  }

  // Enable the archive button
  if (archiveBtn) {
    archiveBtn.disabled = false
    archiveBtn.classList.remove('opacity-40', 'cursor-not-allowed')
  }
}
```

**Archive button — disabled by default:**
Add `id="archiveBtn"` to the existing Archive button element and render it initially disabled:
```html
<button
  id="archiveBtn"
  disabled
  onclick="archiveOutcome()"
  class="flex-1 bg-gray-900 text-white font-semibold py-2.5 rounded-xl transition-colors opacity-40 cursor-not-allowed"
  style="font-size:11px">
  Archive Outcome
</button>
```

**Reset on phase change:**
In `setPhase()` (wherever phases are set), reset `selectedOutcomeResult = null` when navigating away from Phase 3.

---

## Key Constraints

- **Do not redesign Phase 3.** Add the toggle and note above the existing reflection textareas. The reflection section, archive button layout, and "Go back" button are unchanged except for the archive button's `id` and initial `disabled` state.
- **Do not add a save button to inline edits.** All saves are automatic (blur / change / immediate).
- **Both `outcome_result` columns ship in 2.0.** Do not split them across phases. (Decision #16)
- **The API rejects archives without `outcome_result`.** The frontend guards this with the disabled button, but the API also validates server-side as a safety net.
- **No regressions.** `sendMessage()` in `claude.js` is untouched. Phase 1 / Phase 2 behavior is unchanged except for the addition of inline edit affordances. The ⌘K palette from 1.4 is untouched.
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, `src/integrations/`, `src/utils/crypto.js`, `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`, `src/database/triage.js`, `src/database/inbox.js`

---

## Files You Will Touch

| File | What changes |
|---|---|
| `public/index.html` | `archiveOutcome()` restructure, `renderPhase2()` (action inline editing), `renderPhase3()` (toggle + note), new `selectResult()` function, `selectedOutcomeResult` module variable |
| `src/database/outcomes.js` | `initOutcomesTable()` migration block (2 new columns), `completeOutcome()` signature + UPDATE statement |
| `src/routes/api.js` | `POST /api/outcomes/:id/complete` — extract + validate `outcome_result`, pass to `completeOutcome()` |

That's it. Three files. Nothing else.

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 2.0 - Foundation Fixes.md` as you finish each workstream — not all at the end. Log your session date and any decisions in the Build Log table. When the full checklist is done, flag for PM review.
