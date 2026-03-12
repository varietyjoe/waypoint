# Phase 2.1 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 2.1 just completed — it adds Focus Mode: a full-screen terminal-aesthetic overlay where users work on a single action with Claude as a co-pilot. Read `pm_log/Phase 2/Phase 2.1 - Code Review Handoff.md` in full, then verify every checklist item against the actual codebase. Report what passed, what failed, and any out-of-scope issues. End with a clear verdict: approved for Phase 2.2, or blocked with specifics. Log your results to `test_tracker/Phase 2.1 - Focus Mode.md`.

---

You are reviewing Phase 2.1 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these files before touching anything:**
1. `pm_log/Phase 2/Phase 2.1 - Focus Mode.md` — full phase spec
2. `pm_log/Phase 2/Phase 2.1 - Engineer Handoff.md` — detailed implementation spec (exact code, function signatures, API contracts)
3. `dev_tracker/Phase 2.1 - Focus Mode.md` — the working checklist; verify each item is actually complete

---

## What Was Built

Phase 2.1 adds Focus Mode — one new DB module, three new API routes (including one streaming route), one new Claude service function, and significant frontend additions to `public/index.html`. Nothing architectural changed; this is additive.

Your job is to confirm the implementation is correct and safe to ship before Phase 2.2 begins.

---

## Review Checklist

### DB Module (`src/database/focus-sessions.js`)

- [ ] File exists at `src/database/focus-sessions.js`
- [ ] `initFocusSessionsTable()` creates `focus_sessions` table — confirm all 8 columns: `id`, `action_id`, `outcome_id`, `started_at`, `ended_at`, `duration_seconds`, `conversation`, `created_at`
- [ ] `action_id` and `outcome_id` use `ON DELETE SET NULL` (not CASCADE) — sessions survive action/outcome deletion
- [ ] `createSession(actionId, outcomeId)` uses `.run()` then fetches by `lastInsertRowid` — not RETURNING * (safer for SQLite compat)
- [ ] `endSession(id, endedAt, durationSeconds, conversation)` updates and returns the updated row
- [ ] `getSessionsByAction(actionId)` exists and returns ordered results
- [ ] All four functions exported in `module.exports`

### API Routes (`src/routes/api.js`)

- [ ] `focusSessionsDb` required at top of file alongside other DB modules
- [ ] `focusSessionsDb.initFocusSessionsTable()` called in the DB init block at startup (lines ~15–25)
- [ ] `POST /api/focus/sessions` — creates session, returns `{ success: true, data: session }`
- [ ] `PUT /api/focus/sessions/:id` — updates session; `conversation` field stringified if passed as object
- [ ] `buildFocusSystemPrompt(action, outcome)` helper exists — includes action title, time estimate, outcome title/description, today's date; has a comment placeholder for Phase 2.2 context injection
- [ ] `POST /api/focus/message` — sets `Content-Type: text/plain`, `Transfer-Encoding: chunked`, `Cache-Control: no-cache` headers before streaming
- [ ] Streaming route calls `claudeService.streamFocusMessage(systemPrompt, history, message)` and writes each chunk to `res`
- [ ] Streaming route calls `res.end()` after the loop completes
- [ ] Streaming route handles errors: if headers not yet sent → `next(err)`; if already streaming → `res.end()` (no crash)
- [ ] Route validates `message` is present (400 if missing) and `action` exists (404 if not found) before setting headers

### Claude Service (`src/services/claude.js`)

- [ ] `streamFocusMessage(systemPrompt, history, userMessage)` defined as `async function*` (generator)
- [ ] Uses `anthropic.messages.stream()` (not `anthropic.messages.create()`)
- [ ] Model is `claude-sonnet-4-6`
- [ ] Builds `messages` as `[...history, { role: 'user', content: userMessage }]`
- [ ] Yields text only for `event.type === 'content_block_delta'` and `event.delta?.type === 'text_delta'`
- [ ] `streamFocusMessage` added to `module.exports`
- [ ] `sendMessage()` signature and body **unchanged**
- [ ] `sendWithTools()` signature and body **unchanged**

### Frontend (`public/index.html`)

**State & constants:**
- [ ] `focusHistory`, `focusActionId`, `focusSessionId`, `focusStartTime`, `focusTimerInterval` declared at module level
- [ ] `FOCUS_QUOTES` array exists with at least 15 entries

**`enterFocusMode(actionId)`:**
- [ ] Finds the action and parent outcome in the in-memory `OUTCOMES` array
- [ ] Creates focus session via `POST /api/focus/sessions` before rendering (failure is non-blocking)
- [ ] Loads JetBrains Mono from Google Fonts — adds `<link>` to `<head>` only if not already present
- [ ] Hides the main app layout (`id="app-wrapper"` or confirmed equivalent) with `display:none`
- [ ] Renders full-screen overlay appended to `document.body` with `position:fixed;inset:0;background:#0d0d0d;z-index:9999`
- [ ] Overlay contains: `> FOCUSING ON` header (green), action title, meta line (outcome · time), dimmed quote, `id="focus-timer"` element, `id="focus-messages"` container, textarea `id="focus-input"`
- [ ] Timer starts at `00:00` via `setInterval` — stored in `focusTimerInterval`
- [ ] Quote is randomly selected from `FOCUS_QUOTES` on each open
- [ ] `focusModeKeyHandler` added via `addEventListener('keydown', focusModeKeyHandler)`
- [ ] `focus-input` receives focus after render

**`exitFocusMode()`:**
- [ ] Confirms before exiting if `focusHistory.length > 0`
- [ ] `clearInterval(focusTimerInterval)` called
- [ ] `PUT /api/focus/sessions/:id` called with `ended_at`, `duration_seconds`, `conversation` — fire-and-forget (`.catch(() => {})`)
- [ ] `focus-overlay` removed from DOM
- [ ] `focusModeKeyHandler` removed via `removeEventListener`
- [ ] App wrapper `display` restored to `''`
- [ ] All five state variables reset to null/empty

**`sendFocusMessage()`:**
- [ ] Gets input text and clears the input field
- [ ] Calls `appendFocusMessage('user', userMessage)` before fetch
- [ ] Creates assistant placeholder element before fetch via `appendFocusMessage('assistant', '')`
- [ ] Sends `historySnapshot` (copy of `focusHistory` before this message) as `history`
- [ ] Reads response with `response.body.getReader()` + `TextDecoder` in a loop
- [ ] Updates assistant element's `textContent` with accumulated response as chunks arrive
- [ ] Scrolls `focus-messages` to bottom after each chunk
- [ ] Adds both user message and full assistant response to `focusHistory` **only after** successful completion
- [ ] Shows error state on the assistant element if fetch fails (does not crash)

**`appendFocusMessage(role, text)`:**
- [ ] User messages: green color, `>` prefix, uses `escapeHtml()` or `innerHTML` safely
- [ ] Assistant messages: gray color, `white-space:pre-wrap`, uses `textContent` (streaming-safe)
- [ ] Returns the created element (so `sendFocusMessage` can update it during streaming)
- [ ] Scrolls container to bottom

**Action row:**
- [ ] "Focus →" button present on each non-done action row in `renderPhase2()`
- [ ] Button hidden by default, visible on action-row hover (CSS opacity transition)
- [ ] Button click calls `enterFocusMode(action.id)` with `event.stopPropagation()`
- [ ] Button not rendered for done actions

**`F` key shortcut:**
- [ ] Pressing `F` when in Phase 2 (not in input/textarea) opens Focus Mode for first non-done action
- [ ] Does not fire when `e.target` is an INPUT, TEXTAREA, or contentEditable element
- [ ] Does not fire with `metaKey` or `ctrlKey` held

### No Regressions

- [ ] Phase 1 (outcomes list) renders correctly — ⌘K palette opens and functions
- [ ] Phase 2 (action checklist) renders — checkboxes toggle, inline editing from 2.0 still works
- [ ] Phase 3 (complete & close) — result toggle and archive still work
- [ ] `sendMessage()` and `classifyForInbox()` in `claude.js` untouched
- [ ] `src/routes/slack.js` and `src/routes/grain.js` untouched

### Preserved Files (Do Not Flag)

These must be untouched:
- `src/routes/slack.js`, `src/routes/grain.js`
- `src/integrations/slack-client.js`, `src/integrations/grain-client.js`
- `src/utils/crypto.js`
- `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`
- `src/database/triage.js`, `src/database/inbox.js`

---

## What's Out of Scope

Do not raise issues against:
- Sound / white noise (Phase 2.6)
- Pomodoro timer mode (not planned)
- User context injection into Focus Mode system prompt (Phase 2.2 — the placeholder comment is expected)
- Persistent memory / session summarization (Phase 2.5)
- Focus Mode on mobile (future)

If you spot something clearly wrong but outside Phase 2.1 scope, note it separately — don't block sign-off on it.

---

## When You're Done

Update `test_tracker/Phase 2.1 - Focus Mode.md` with your findings:
- Fill in the **Test Results** table (date, pass/fail, notes per workstream)
- List any failures under **Issues Found**
- Check the **Sign-off** boxes if approved

If the checklist is clear: signal **approved for Phase 2.2**. If there are blockers: flag them specifically — what failed, what file, what the spec says it should be.
