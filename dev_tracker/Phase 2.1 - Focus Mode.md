# Dev Tracker — Phase 2.1: Focus Mode

**Status:** Complete — Ready for PM Review
**Full brief:** `pm_log/Phase 2/Phase 2.1 - Focus Mode.md`
**Engineer handoff:** `pm_log/Phase 2/Phase 2.1 - Engineer Handoff.md`
**Depends on:** Phase 2.0 complete and approved ✅

---

## Pre-Build Checklist

- [x] Read `pm_log/Phase 2/Phase 2.1 - Focus Mode.md` in full
- [x] Read `pm_log/Phase 2/Phase 2.1 - Engineer Handoff.md` in full
- [x] Read `public/index.html` — find `renderPhase2()`, global keydown handler, outermost app wrapper div
- [x] Read `src/services/claude.js` — confirm `anthropic` client name and exports
- [x] Read `src/routes/api.js` lines 1–25 — understand DB init block
- [x] Confirm `getActionById(id)` exists and is exported from `src/database/actions.js`

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-20 | Claude (claude-sonnet-4-6) | Building Phase 2.1. escHtml already exists (not escapeHtml). column-wrapper + header wrapped in #app-wrapper. Focus overlay is fixed/z-9999 so covers header visually regardless. |

---

## Completion Checklist

### Workstream 1 — DB Module (`src/database/focus-sessions.js`)
- [x] File created at `src/database/focus-sessions.js`
- [x] `initFocusSessionsTable()` creates `focus_sessions` table with correct schema (all 8 columns)
- [x] `createSession(actionId, outcomeId)` inserts and returns the new session row
- [x] `endSession(id, endedAt, durationSeconds, conversation)` updates and returns the row
- [x] `getSessionsByAction(actionId)` returns sessions ordered by created_at DESC
- [x] All four functions exported in `module.exports`

### Workstream 2 — API Routes (`src/routes/api.js`)
- [x] `focusSessionsDb` required at top of file
- [x] `focusSessionsDb.initFocusSessionsTable()` called in DB init block at startup
- [x] `POST /api/focus/sessions` — creates session, returns `{ success: true, data: session }`
- [x] `PUT /api/focus/sessions/:id` — updates session with ended_at, duration_seconds, conversation (JSON string)
- [x] `buildFocusSystemPrompt(action, outcome)` helper defined — includes action title, time, outcome title/description, today's date
- [x] `POST /api/focus/message` — sets chunked headers, streams Claude response, ends response on completion
- [x] Streaming route handles mid-stream errors without crashing (checks `res.headersSent`)

### Workstream 3 — Claude Service (`src/services/claude.js`)
- [x] `streamFocusMessage(systemPrompt, history, userMessage)` added as async generator function
- [x] Uses `anthropic.messages.stream()` with model `claude-sonnet-4-6`, max_tokens 1024
- [x] Builds messages array as `[...history, { role: 'user', content: userMessage }]`
- [x] Yields `event.delta.text` for each `content_block_delta` / `text_delta` event
- [x] Added to `module.exports`
- [x] `sendMessage()` and `sendWithTools()` are **unchanged**

### Workstream 4 — Frontend (`public/index.html`)
- [x] `id="app-wrapper"` added to outermost app layout div (wraps both header and column-wrapper)
- [x] Module-level variables added: `focusHistory`, `focusActionId`, `focusSessionId`, `focusStartTime`, `focusTimerInterval`
- [x] `FOCUS_QUOTES` array defined with 20 quotes
- [x] `focusModeKeyHandler(e)` defined at module level (calls `exitFocusMode()` on ESC)
- [x] `enterFocusMode(actionId)` implemented — finds action+outcome, creates session, hides app, renders overlay, starts timer, adds ESC listener, focuses input
- [x] JetBrains Mono loaded from Google Fonts on first Focus Mode enter (not on every enter)
- [x] Overlay renders: FOCUSING ON header, action title, meta (outcome · time), quote, timer, messages area, input area, [esc] corner label
- [x] Timer starts at 00:00 and counts up in mm:ss
- [x] Quote is randomly selected from FOCUS_QUOTES on each enter
- [x] `exitFocusMode()` — confirms if history non-empty, saves session, removes overlay, removes ESC listener, restores app, resets all state
- [x] `appendFocusMessage(role, text)` — user messages in green with `>` prefix; assistant in gray with `white-space:pre-wrap`; returns element reference
- [x] `sendFocusMessage()` — gets input, appends user message, creates assistant placeholder, streams from `/api/focus/message`, updates element as chunks arrive, commits to focusHistory on completion
- [x] `focusInputKeydown(e)` — Enter (without Shift) calls `sendFocusMessage()`
- [x] "Focus →" button added to non-done action rows in `renderPhase2()` — subtle, visible on hover, calls `enterFocusMode(action.id)`, does not show on done actions
- [x] `F` key shortcut — when in Phase 2 and not in an input, opens Focus Mode for first non-done action of selected outcome
- [x] `escHtml()` confirmed present (codebase uses `escHtml` not `escapeHtml` — all overlay uses updated accordingly)

### No Regressions
- [x] Phase 1 (outcomes list) renders correctly, ⌘K palette works — no changes to Phase 1 rendering
- [x] Phase 2 (action checklist) renders correctly, checkboxes toggle, inline editing from 2.0 works — only addition is Focus button on non-done rows
- [x] Phase 3 (complete & close) result toggle and archive work — untouched
- [x] `sendMessage()` and `sendWithTools()` and `classifyForInbox()` in `claude.js` untouched — only `streamFocusMessage` added
- [x] Slack and Grain routes untouched

---

## Blockers

None at start.
