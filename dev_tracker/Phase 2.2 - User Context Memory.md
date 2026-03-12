# Dev Tracker — Phase 2.2: User Context Memory

**Status:** Complete — Ready for PM Review
**Full brief:** `pm_log/Phase 2/Phase 2.2 - User Context Memory.md`
**Engineer handoff:** `pm_log/Phase 2/Phase 2.2 - Engineer Handoff.md`
**Depends on:** Phase 2.1 complete and approved

---

## Pre-Build Checklist

- [x] Read `pm_log/Phase 2/Phase 2.2 - User Context Memory.md` in full
- [x] Read `pm_log/Phase 2/Phase 2.2 - Engineer Handoff.md` in full
- [x] Read `public/index.html` — find sidebar rendering code, Focus Mode `sendFocusMessage()`, and confirm `escHtml` (not `escapeHtml`) is the correct helper name
- [x] Read `src/routes/api.js` — find `buildFocusSystemPrompt` and understand the placeholder for Phase 2.2 context injection
- [x] Read `src/services/claude.js` — understand all three exported functions before modifying
- [x] Confirm Phase 2.1 shipped: `POST /api/focus/message` exists and `streamFocusMessage` is in `module.exports`

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-20 | Claude (claude-sonnet-4-6) | Starting implementation. All pre-build reads complete. Phase 2.1 confirmed shipped. All four workstreams implemented and syntax-verified. Ready for PM review. |

---

## Completion Checklist

### Workstream 1 — DB Module (`src/database/user-context.js`)
- [x] File created at `src/database/user-context.js`
- [x] `initUserContextTable()` creates `user_context` table with correct schema (9 columns)
- [x] `getAllContext()` returns all rows ordered by category, key
- [x] `getContextSnapshot()` returns formatted string block or empty string if no entries
- [x] `upsertContext(key, value, category, source, sourceActionId, sourceOutcomeId)` — insert or update by key (case-insensitive match)
- [x] `updateContext(id, value, category)` — updates value and category
- [x] `deleteContext(id)` — removes row
- [x] All six functions exported in `module.exports`

### Workstream 2 — API Routes (`src/routes/api.js`)
- [x] `userContextDb` required at top of file
- [x] `userContextDb.initUserContextTable()` called in DB init block at startup
- [x] `GET /api/context` — returns all entries with count
- [x] `POST /api/context` — upserts by key, validates key + value present (400 if missing)
- [x] `PUT /api/context/:id` — updates value and category (400 if value missing)
- [x] `DELETE /api/context/:id` — removes entry, returns `{ success: true }`
- [x] `buildFocusSystemPrompt` updated — calls `userContextDb.getContextSnapshot()` and appends block to system prompt if non-empty
- [x] System prompt instruction for duration-asking added to `buildFocusSystemPrompt`

### Workstream 3 — Claude Service (`src/services/claude.js`)
- [x] `userContextDb` required at top of `claude.js` (path: `'../database/user-context'`)
- [x] `sendMessage` updated — accepts optional 4th param `contextSnapshot = ''`; appends to system prompt if non-empty; all existing callers still work without passing it
- [x] `sendWithTools` updated — calls `userContextDb.getContextSnapshot()` internally and appends to its system prompt
- [x] `streamFocusMessage` unchanged (context injection happens in `buildFocusSystemPrompt` in api.js)
- [x] No changes to function signatures of `sendMessage` or `sendWithTools` that break existing callers

### Workstream 4 — Frontend (`public/index.html`)

**"Save this" chip in Focus Mode:**
- [x] After `sendFocusMessage()` streaming completes, checks `fullResponse` with regex `/\d+\s*(min|hour|hr|h\b|minutes|hours)/i`
- [x] If match: "Save this to memory ↗" chip renders below assistant element
- [x] Clicking chip calls `saveContextFromFocus(userMessage, fullResponse, chipEl)`
- [x] `saveContextFromFocus` POSTs to `/api/context` with key (from user message), value (extracted duration), category: 'task_duration', source: 'focus_mode'
- [x] On success: chip shows "Saved ✓" (grayed), disappears after 2 seconds
- [x] On failure: chip shows "Save failed", re-enables

**Memory sidebar section:**
- [x] "Memory" label + count chip added to sidebar below project list
- [x] Clicking toggles `memory-panel` visibility
- [x] `loadMemoryPanel()` fetches `/api/context` and renders entries
- [x] Memory count chip updates to show total entry count
- [x] Each entry shows: key (bold, truncated), value (editable contenteditable), × delete button
- [x] Editing value (contenteditable blur) calls `saveContextEdit(id, newValue, category)` → `PUT /api/context/:id`
- [x] Clicking × calls `deleteContextEntry(id)` with confirm dialog → `DELETE /api/context/:id`, reloads list
- [x] "+ Add memory" button opens inline form with key + value inputs
- [x] Submitting form POSTs to `/api/context` with category 'task_duration', source 'manual', reloads list
- [x] Memory count badge initialized on page load (fetch `/api/context`, set count)

### No Regressions
- [x] Phase 1 (outcomes list) and ⌘K palette render correctly — no changes to those render paths
- [x] Phase 2 (action checklist) renders correctly, inline editing works — no changes to action CRUD
- [x] Focus Mode still opens, streams, and saves sessions — `streamFocusMessage` and session routes unchanged
- [x] Phase 3 archive with result toggle still works — `completeOutcome` route unchanged
- [x] `/api/chat` route (used by ⌘K palette) still works — `sendMessage` called without 4th param and defaults to empty context
- [x] `sendWithTools` still works for all four ⌘K tools — signature unchanged, context injected internally
- [x] Slack and Grain routes untouched — confirmed not modified

---

## Blockers

None at start.
