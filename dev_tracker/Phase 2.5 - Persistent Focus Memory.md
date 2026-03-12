# Dev Tracker — Phase 2.5: Persistent Focus Memory

**Status:** Complete
**Full brief:** `pm_log/Phase 2/Phase 2.5 - Persistent Focus Memory.md`
**Engineer handoff:** `pm_log/Phase 2/Phase 2.5 - Engineer Handoff.md`
**Depends on:** Phase 2.4 complete and approved ✅

---

## Pre-Build Checklist

- [x] Read `pm_log/Phase 2/Phase 2.5 - Persistent Focus Memory.md` in full
- [x] Read `pm_log/Phase 2/Phase 2.5 - Engineer Handoff.md` in full
- [x] Read `src/database/focus-sessions.js` — confirmed table schema, existing functions, `module.exports`
- [x] Read `src/routes/api.js` — read `buildFocusSystemPrompt` and `POST /api/focus/message` route fully
- [x] Read `src/services/claude.js` — read `streamFocusMessage`, `module.exports`
- [x] Read `public/index.html` — found `enterFocusMode`, `appendFocusMessage`, `sendFocusMessage`, `loadMemoryPanel`, `renderMemoryList`

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-21 | Claude Sonnet 4.6 | All four workstreams implemented. See decisions below. |

### Decisions

- **`focusSessionsDb` usage pattern:** The existing `api.js` imports `focusSessionsDb` as a module object (not destructured). Kept that pattern throughout — all new calls use `focusSessionsDb.getRelevantSessions()` and `focusSessionsDb.updateSessionSummary()` rather than destructuring.
- **`buildFocusSystemPrompt` signature change:** Changed from `(action, outcome)` to `(action, outcome, relevantSessionBlocks = '')`. The handoff spec listed a 4-param signature `(action, outcome, project, contextSnapshot, ...)` but the actual codebase function only uses `action` and `outcome` (context snapshot is fetched internally from `userContextDb`). Updated to match the actual codebase, not the spec's idealized signature.
- **Save chip placement:** The chip is appended to `assistantEl.parentNode` (the wrapper div) rather than inserted before a sibling, so it always appears below the text element at the bottom of the wrapper. This avoids ordering issues with the existing duration chip.
- **Session injection gated on `action.outcome_id`:** `getRelevantSessions` requires a non-null `outcomeId`. Added guard so sessions are only fetched when the action belongs to an outcome, preventing errors for unassigned actions.
- **`e5e7eb` border on dark background:** The "Save this →" chip uses a light border color matching the spec. The chip renders well in dark Focus Mode because the text and border are intentionally muted (grey-on-dark-black).

---

## Completion Checklist

### Workstream 1 — `src/database/focus-sessions.js`
- [x] `summary TEXT` column migration added to `initFocusSessionsTable` (PRAGMA check + ALTER TABLE if missing)
- [x] `getRelevantSessions(actionId, outcomeId)` — queries same outcome first, falls back to same action
- [x] `updateSessionSummary(id, summary)` — UPDATE focus_sessions SET summary WHERE id
- [x] `module.exports` updated with new functions

### Workstream 2 — `src/services/claude.js`
- [x] `summarizeFocusSession(conversation)` added — async, uses `anthropic.messages.create()`, 400 max_tokens, returns trimmed text
- [x] `module.exports` updated to include `summarizeFocusSession`

### Workstream 3 — `src/routes/api.js`
- [x] Require destructuring updated to include `getRelevantSessions`, `updateSessionSummary` — N/A, using module object pattern; calls are `focusSessionsDb.getRelevantSessions()` etc.
- [x] `GET /api/focus/sessions/relevant?actionId=X&outcomeId=Y` route added
- [x] Route validates `actionId` and `outcomeId` query params
- [x] Short sessions (< 2000 chars): returned with full `conversation` array
- [x] Long sessions: uses cached `summary` if present; generates + caches if not
- [x] `buildFocusSystemPrompt` updated to accept `relevantSessionBlocks` (3rd param, default `''`)
- [x] `buildFocusSystemPrompt` appends session blocks to prompt when non-empty
- [x] `POST /api/focus/message` route fetches relevant sessions before calling `buildFocusSystemPrompt`
- [x] Session injection is non-blocking — errors caught and ignored (empty string fallback)
- [x] Up to 3 sessions injected in the prompt block

### Workstream 4 — `public/index.html`
- [x] `appendFocusMessage` updated: assistant branch now wraps message in a `div` container so save chip can be appended below
- [x] `sendFocusMessage` adds "Save this →" chip after streaming completes for every assistant response
- [x] Chip button has `data-content` attribute with the full message text
- [x] `saveContextFromFocusBlock(btn)` saves to `POST /api/context` with `category: 'saved_output'`, `source: 'focus_mode'`
- [x] On success: button text changes to "Saved ✓" and is disabled
- [x] Memory panel `renderMemoryList` has "Saved Outputs" section
- [x] Saved Outputs section shows entries where `category === 'saved_output'`
- [x] Each entry shows: key, truncated value, date

### No Regressions
- [x] Existing Focus Mode open/close/send flow unchanged
- [x] `endSession` still stores conversation as before
- [x] Memory panel existing context entries (task_duration etc.) unchanged — regular entries render as before; saved_output entries appear in a separate section below
- [x] ⌘K tools, inbox triage, archive flow unchanged

---

## Blockers

None.
