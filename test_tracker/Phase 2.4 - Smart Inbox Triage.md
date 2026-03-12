# Test Tracker — Phase 2.4: Smart Inbox Triage

**Status:** Approved ✅ — Bug #1 patched by PM agent post-review

**Review date:** 2026-02-20
**Reviewer:** Claude (code review agent)
**Patch date:** 2026-02-20
**Verdict:** Approved for Phase 2.5. Bug #1 fixed (action URL changed to `/api/outcomes/${outcomeId}/actions`). Bug #2 (no pre-flight project validation) and Note #3 (duplicate triage-count id) are non-blocking minor items.

---

## Checklist Results

### `src/services/claude.js`

- [x] `batchTriageInbox(items, contextSnapshot)` is present and exported (line 342)
- [x] Uses `anthropic.messages.create()` directly — not `sendWithTools` or tool use (line 379)
- [x] Model is `claude-sonnet-4-6` (line 380)
- [x] Prompt includes context block only when `contextSnapshot` is non-empty (lines 347–349)
- [x] Prompt instructs JSON-only output with correct schema (clusters, questions) (lines 351–377)
- [x] Response text extracted via `response.content.find(b => b.type === 'text')?.text` (line 385)
- [x] Strips markdown code fences before parsing (line 387)
- [x] `JSON.parse` wrapped in try/catch — throws with descriptive message on failure (lines 388–392)
- [x] `module.exports` updated to include `batchTriageInbox` (line 415)
- [x] All other exports (`sendMessage`, `classifyForInbox`, `sendWithTools`, `streamFocusMessage`) unchanged

**Workstream 1 verdict: PASS**

---

### `src/routes/api.js`

- [x] `POST /api/inbox/triage-batch` route present in inbox section (line 718)
- [x] Validates `itemIds` array — returns 400 if missing/empty (lines 721–723)
- [x] Fetches items using `inboxDb.getInboxItemById(id)`, filters out falsy — correctly uses `await Promise.all(...)` because `getInboxItemById` is async (line 726)
- [x] Returns 404 if no valid items found (lines 727–729)
- [x] Calls `userContextDb.getContextSnapshot()` (line 731)
- [x] Calls `claudeService.batchTriageInbox(items, contextSnapshot)` (line 732)
- [x] Maps `source_item_indices` to real item IDs (1-based index → `items[i-1]?.id`) (lines 735–738)
- [x] Response: `{ success: true, data: { clusters: [...], questions: [...] } }` (line 740)
- [x] No new `require()` statements needed (inboxDb, userContextDb, claudeService all already imported)
- [x] No existing inbox routes modified

**Route ordering note (non-blocking):** The new route `POST /inbox/triage-batch` is registered at line 718, after parameterized routes `POST /inbox/:id/approve`, `POST /inbox/:id/dismiss`, `POST /inbox/:id/reject`. Those three all require a second URL segment (e.g. `/inbox/123/approve`), so they will NOT match `POST /inbox/triage-batch`. However, if a future route `POST /inbox/:id` (no sub-path) were added above line 718, it would shadow `triage-batch`. Current ordering is safe but worth documenting.

**Workstream 2 verdict: PASS**

---

### `public/index.html`

- [x] `triageSelectedIds` is a module-level `Set` (line 511)
- [x] Each inbox item card has a checkbox input calling `toggleTriageItem(id, checked)` (lines 1477–1482)
- [x] `#triage-batch-bar` element exists; hidden initially, visible when ≥1 selected (lines 1520–1526)
- [x] `#triage-count` span present and updates correctly (line 1524 / line 1932)
- [x] `toggleTriageItem(id, checked)` adds/removes from Set and updates bar visibility/count (lines 1924–1933)
- [x] `startBatchTriage()` calls `POST /api/inbox/triage-batch`, handles loading state (lines 1935–1961)
- [x] `showTriageLoadingState()` disables button, sets text to `'Thinking…'` (lines 1963–1966)
- [x] `hideTriageLoadingState()` re-enables button (lines 1968–1971)
- [x] Error path in `startBatchTriage`: catches, hides loading state, shows toast (lines 1957–1960)
- [x] If `questions.length > 0`: calls `renderTriageQuestions`, not `renderTriagePreview` (lines 1952–1956)
- [x] If no questions: calls `renderTriagePreview` directly (line 1955)
- [x] `renderTriageQuestions` renders one input per question with correct `id="triage-q-${i}"` (lines 1976–1982)
- [x] First input receives focus via `setTimeout` (line 2000)
- [x] "Next →" button calls `submitTriageQuestions` with correct args — uses `encodeURIComponent/JSON.stringify` pattern for safe data passing (line 1994)
- [x] `submitTriageQuestions` reads answers, saves non-empty answers to `POST /api/context` (category: 'task_duration', source: 'inbox_triage') (lines 2003–2021)
- [x] Context saves are non-blocking via `Promise.all().catch(() => {})` (line 2019)
- [x] After saves: calls `renderTriagePreview` (line 2020)
- [x] `renderTriagePreview` renders cluster cards with editable outcome title, project dropdown, action rows (lines 2023–2088)
- [x] Action rows: editable title (`id="triage-action-title-${ci}-${ai}"`), time input (`id="triage-action-time-${ci}-${ai}"`), energy toggle button (`id="triage-energy-${ci}-${ai}"`) (lines 2033–2045)
- [x] `removeTriageCluster(ci)` removes the cluster element (lines 2090–2092)
- [x] `removeTriageAction(ci, ai)` removes the action row (lines 2094–2097)
- [x] `toggleTriageEnergy(ci, ai)` toggles between 'deep' and 'light' (lines 2099–2104)
- [x] `cancelBatchTriage()` resets `triageSelectedIds` and re-renders inbox (lines 2106–2109)
- [x] `confirmBatchTriage` reads edited values from DOM inputs — does NOT use the original `clusters` argument (lines 2111–2177)
- [x] Creates outcomes via `POST /api/outcomes` with `title` and `project_id` (lines 2129–2136)
- [**FAIL**] Creates actions via `POST /api/actions` with `outcome_id`, `title`, `time_estimate`, `energy_type` — **SEE CRITICAL BUG #1 below**
- [x] Marks source inbox items as processed after creation — uses `POST /api/inbox/:id/approve` (line 2163–2165)
- [x] Shows success/error toast (lines 2167–2171)
- [x] Reloads data and updates inbox badge after confirm (lines 2173–2176)

### No Regressions

- [x] Per-item "Approve" and "Dismiss" inbox buttons unchanged (lines 1494–1504)
- [x] `break_into_actions` ⌘K flow unchanged — no references to it in modified sections
- [x] Focus Mode unchanged
- [x] `brain_dump_to_outcomes`, `bulk_reschedule`, `prioritize_today` unchanged
- [x] Preserved files: `slack.js` (modified 2026-02-19, pre-Phase 2.4), `grain.js` (modified Jan 24), all integrations (Jan 27 / Jan 24), `crypto.js` (Jan 24), `oauth-tokens.js` (Jan 24), `monitored-channels.js` (Jan 24), `triage.js` (Jan 24), `inbox.js` (Feb 19, pre-Phase 2.4) — all untouched by Phase 2.4

---

## Issues Found

### BUG 1 — CRITICAL: Actions created unassigned (not linked to outcome)

**Severity:** Critical — the core data commitment of the feature is broken

**Location:** `public/index.html` lines 2146–2155 + `src/routes/api.js` lines 290–299

**What happens:** `confirmBatchTriage` sends actions to `POST /api/actions`:
```js
body: JSON.stringify({
  outcome_id: outcomeId,
  title: actionTitle,
  time_estimate: timeEstimate,
  energy_type: energyType,
}),
```

**The `POST /api/actions` route ignores `outcome_id`:**
```js
router.post('/actions', (req, res, next) => {
    const { title, time_estimate, energy_type } = req.body;  // outcome_id not destructured
    const action = actionsDb.createAction(null, { ... });     // always null
```

`actionsDb.createAction(null, ...)` hardcodes `outcome_id = null`, creating every action as unassigned. All actions created through batch triage land in the "unassigned" pool instead of being linked to their outcomes. This silently succeeds (HTTP 201) with no error, so the user sees a success toast while the data is wrong.

**Fix required:** Either:
1. (Preferred) Replace `POST /api/actions` with `POST /api/outcomes/:id/actions` in `confirmBatchTriage` — that route correctly accepts `outcome_id` from the URL parameter and links the action to the outcome.
2. Or update the `POST /api/actions` route to accept and use `outcome_id` from the request body.

Option 1 requires changing the fetch URL in `confirmBatchTriage` from `/api/actions` to `/api/outcomes/${outcomeId}/actions` and removing `outcome_id` from the body.

---

### BUG 2 — FUNCTIONAL: `confirmBatchTriage` silently skips outcomes with no project selected

**Severity:** Medium — UX defect, no data corruption but user gets silent partial creation

**Location:** `public/index.html` lines 2122–2125

**What happens:**
```js
if (!title || !projectId) {
  errors.push(`Outcome ${ci + 1}: select a project and provide a title`);
  continue;
}
```

The error is pushed to the `errors` array and the loop continues. At the end, `errors.length > 0` shows a warning toast with only `errors[0]`. The issue: this message appears *after* all other outcomes are created. There is no pre-flight validation preventing the user from hitting "Create All" without a project. The test tracker's acceptance criterion calls for an "inline error or validation message" — the current behavior only shows a warning toast after partial creation, which may confuse users who don't understand why some outcomes appeared and others didn't.

This is not a blocker on its own but should be noted for the engineer to decide: pre-flight DOM validation before committing, or the current post-hoc toast is acceptable.

---

### NOTE 3 — Minor: `hideTriageLoadingState` reconstructs button HTML with `innerHTML`

**Severity:** Low / cosmetic

**Location:** `public/index.html` line 1970

```js
if (btn) { btn.disabled = false; btn.innerHTML = `Triage Selected (<span id="triage-count">${triageSelectedIds.size}</span>) →`; }
```

This duplicates `id="triage-count"` in the DOM if the element already exists from the initial render (line 1524). After `hideTriageLoadingState`, there will briefly be two elements with `id="triage-count"`. `document.getElementById('triage-count')` in `toggleTriageItem` will find only the first one (inside `#triage-batch-bar` in the original render), but after `hideTriageLoadingState` runs, the button *is* the element with the id. The behavior is inconsistent. Not crashing but fragile.

---

### NOTE 4 — Minor: `getInboxItemById` is async; confirmed correct handling

**Severity:** Informational (pass)

The dev tracker noted that `getInboxItemById` is async, and the engineer correctly used `await Promise.all(itemIds.map(id => inboxDb.getInboxItemById(id)))` in the route (line 726). The handoff spec showed a sync `.map().filter(Boolean)` pattern which would have failed. The engineer's adaptation is correct.

---

## Test Results

| Date | Tester | Workstream | Pass/Fail | Notes |
|---|---|---|---|---|
| 2026-02-20 | Claude (code review) | claude.js | PASS | All checklist items verified |
| 2026-02-20 | Claude (code review) | api.js route | PASS | Route logic correct; route ordering safe |
| 2026-02-20 | Claude (code review) | index.html UI | FAIL | Actions created unassigned (Bug #1) |
| 2026-02-20 | Claude (code review) | No regressions | PASS | All preserved files confirmed untouched |

---

## Sign-off

- [x] Engineer complete
- [x] Code review complete — **BLOCKED on Bug #1**
- [ ] PM reviewed

---

## Required Fix Before Phase 2.5

**In `public/index.html`, `confirmBatchTriage` (around line 2146):**

Change:
```js
await fetch('/api/actions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    outcome_id: outcomeId,
    title: actionTitle,
    time_estimate: timeEstimate,
    energy_type: energyType,
  }),
});
```

To:
```js
await fetch(`/api/outcomes/${outcomeId}/actions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: actionTitle,
    time_estimate: timeEstimate,
    energy_type: energyType,
  }),
});
```

This routes action creation through the existing `POST /api/outcomes/:id/actions` endpoint (api.js line 320), which correctly passes `outcomeId` to `actionsDb.createAction(outcomeId, ...)`.

No other files need to change to fix Bug #1.
