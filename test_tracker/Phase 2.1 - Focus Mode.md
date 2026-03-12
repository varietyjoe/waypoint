# Test Tracker — Phase 2.1: Focus Mode

**Status:** Code Review Complete — Approved for Phase 2.2

---

## What to Test

**DB & API:**
- [x] Server starts without errors — `focus_sessions` table created on startup
- [x] `POST /api/focus/sessions` returns `{ success: true, data: { id, action_id, outcome_id, started_at } }`
- [x] `PUT /api/focus/sessions/:id` with ended_at, duration_seconds, conversation → session updated in DB
- [x] `POST /api/focus/message` streams a response — check network tab shows chunked transfer, text arrives incrementally

**Focus Mode entry:**
- [x] Click "Focus →" button on an action row — Focus Mode opens
- [x] Press `F` key when in Phase 2 — Focus Mode opens for first non-done action
- [x] App layout (sidebar, center, right panel) is hidden while Focus Mode is open
- [x] Overlay is full-screen, dark background (#0d0d0d), JetBrains Mono font
- [x] Action title visible in header
- [x] Parent outcome and time estimate shown in meta line
- [x] A motivational quote is displayed (dimmed)
- [x] Timer starts at 00:00 and counts up
- [x] Input is focused on open

**Focus Mode conversation:**
- [x] Type a message and press Enter → message appears in green with `>` prefix
- [x] Claude response streams in line by line (not all at once) in gray
- [x] Response is visible before it finishes (real-time streaming, not batched)
- [x] Second message uses prior conversation as history — Claude maintains context
- [x] Shift+Enter inserts newline (does not send)

**Focus Mode exit:**
- [x] Press ESC → confirms "Leave this session? It'll be saved." if conversation is non-empty
- [x] Click [esc] label in top-right → same confirm behavior
- [x] After confirm: overlay removed, app layout restored, all state reset
- [x] Session saved to DB (check `focus_sessions` table: ended_at, duration_seconds, conversation populated)
- [x] Exit with no messages: no confirm dialog shown, exits immediately

**Regressions:**
- [x] ⌘K palette still opens and functions
- [x] Action checkboxes toggle done correctly
- [x] Inline editing from Phase 2.0 still works on outcome and action fields
- [x] Phase 3 archive with result toggle still works

---

## Test Results

| Date | Tester | Workstream | Pass/Fail | Notes |
|---|---|---|---|---|
| 2026-02-21 | Claude Sonnet 4.6 (Code Review) | 1 — DB Module (`src/database/focus-sessions.js`) | **PASS** | File exists. All 8 columns present with correct types. `action_id` and `outcome_id` both use `ON DELETE SET NULL` (confirmed via `sqlite_master` query). `createSession` uses `.run()` then fetches by `lastInsertRowid`. `endSession` updates and returns row. `getSessionsByAction` returns `ORDER BY created_at DESC`. All four functions exported. Smoke-tested end-to-end: init → create → end → list all return correct shapes. |
| 2026-02-21 | Claude Sonnet 4.6 (Code Review) | 2 — API Routes (`src/routes/api.js`) | **PASS** | `focusSessionsDb` required at line 12. `initFocusSessionsTable()` called at line 22 inside the startup init block (lines 16–23). `POST /api/focus/sessions` and `PUT /api/focus/sessions/:id` both match spec exactly. `buildFocusSystemPrompt` defined as a module-level helper with correct content (action title, time estimate, today's date, outcome title/description, Phase 2.2 placeholder comment). Streaming route: Content-Type `text/plain; charset=utf-8`, Transfer-Encoding `chunked`, Cache-Control `no-cache` all set. Validations (400 missing message, 404 missing action) fire **before** headers are set — correct ordering. Error handler checks `res.headersSent` before routing to `next(err)` vs `res.end()`. `res.end()` called after the generator loop. |
| 2026-02-21 | Claude Sonnet 4.6 (Code Review) | 3 — Claude Service (`src/services/claude.js`) | **PASS** | `streamFocusMessage` added as `async function*` (confirmed `AsyncGeneratorFunction` constructor). Uses `anthropic.messages.stream()`. Model is `claude-sonnet-4-6`. Builds `messages` as `[...history, { role: 'user', content: userMessage }]`. Yields only on `content_block_delta` + `text_delta`. Added to `module.exports` alongside `sendMessage`, `classifyForInbox`, `sendWithTools`. Git diff confirms `sendMessage()` and `sendWithTools()` bodies are byte-for-byte unchanged — only the export line and new function were added. |
| 2026-02-21 | Claude Sonnet 4.6 (Code Review) | 4 — Frontend (`public/index.html`) | **PASS** | All five state variables declared at module level. `FOCUS_QUOTES` has exactly 20 entries (verified by parsing array). `focusModeKeyHandler` defined at module level (named function, removable). `enterFocusMode`: finds action+outcome in `OUTCOMES`, creates session (failure non-blocking), loads JetBrains Mono conditionally, hides `#app-wrapper`, renders overlay with `position:fixed;inset:0;background:#0d0d0d;z-index:9999`, starts timer at 00:00, adds keydown listener, focuses input. `exitFocusMode`: confirms if history non-empty, `clearInterval`, fire-and-forget PUT, removes overlay, removes keydown listener, restores `app-wrapper`, resets all 5 state vars to null/empty. `appendFocusMessage`: user messages green `escHtml` with `>` prefix; assistant gray `textContent` (streaming-safe) with `white-space:pre-wrap`; returns element; scrolls container. `sendFocusMessage`: clears input, appends user message, creates assistant placeholder, takes history snapshot, streams with ReadableStream reader + TextDecoder, updates `textContent` per chunk, scrolls, commits both messages to history after completion, sets error color on failure. Focus button on non-done actions only (`!a.done`), with `event.stopPropagation()`, opacity-0 by default, CSS `.action-row:hover .focus-btn { opacity: 1 !important }`. F key shortcut checks `currentPhase === 2`, `selectedId`, guards on INPUT/TEXTAREA/contentEditable, no metaKey/ctrlKey. Git diff shows zero lines removed from `index.html` — pure additive. |
| 2026-02-21 | Claude Sonnet 4.6 (Code Review) | No Regressions | **PASS** | Preserved files (`slack.js`, `grain.js`, all integrations, `oauth-tokens.js`, `monitored-channels.js`, `triage.js`, `inbox.js`) show zero diff vs pre-Phase-2.1 git snapshot. `sendMessage()` and `classifyForInbox()` in `claude.js` bodies unchanged. No lines removed from `index.html`. All Phase 1 + Phase 2.0 functionality untouched. |

---

## Issues Found

### Issue #1 — `escapeHtml` vs `escHtml` name deviation from spec [MINOR — no functional impact]

**Spec says** (engineer handoff 4D): "Check if `escapeHtml` already exists. If not, add it."

**Actual code:** The codebase uses `escHtml()` (not `escapeHtml`). The function exists at `public/index.html` line 2366 and is functionally identical (same four replacements: `&`, `<`, `>`, `"`). The engineer correctly identified this in the build log and updated all Focus Mode overlay uses to `escHtml`. All six uses inside Focus Mode (`focusAction.title`, `metaStr`, `quote`, user messages in `appendFocusMessage`) call `escHtml`.

**Impact:** None — the correct function is used everywhere. The handoff spec's note about `escapeHtml` was a naming mismatch that the engineer handled correctly.

---

### Issue #2 — `mobileHomePanel` is outside `#app-wrapper` [OUT OF SCOPE — mobile, no desktop impact]

**Observation:** `#app-wrapper` closes at line 326. `#mobileHomePanel` at line 331 (`class="sm:hidden hidden"`) is outside the wrapper and is not hidden when Focus Mode sets `app-wrapper.style.display = 'none'`.

**Impact on desktop:** None. The mobile panel is `hidden` by default and `sm:hidden` on desktop, so it is never visible on desktop. The focus overlay at `z-index:9999` with `position:fixed;inset:0` fully covers the viewport regardless.

**Impact on mobile:** The mobile panel would remain in the DOM while Focus Mode is open. However, mobile Focus Mode is explicitly out of scope for Phase 2.1 (per both the phase spec and the review handoff). No blocker.

---

### Issue #3 — No `outcomesDb.getOutcomeById` import check in streaming route [OBSERVATION — no bug]

The streaming route at line 1140 of `api.js` calls `outcomesDb.getOutcomeById(action.outcome_id)`. The `outcomesDb` module is required at line 9. `getOutcomeById` is confirmed to exist in `src/database/outcomes.js` (used elsewhere in the file). This is a note for completeness — no issue.

---

## Out-of-Scope Observations (do not block Phase 2.2)

1. **`sendMessage()` model ID is `claude-sonnet-4-20250514`** — the legacy chat route uses an older model ID string whereas `sendWithTools()` and `streamFocusMessage()` both use `claude-sonnet-4-6`. Carried forward from Phase 1.x. Low priority cleanup item, not a Phase 2.1 regression.

2. **API info block at the bottom of `api.js` still lists `phase: '1.3'`** (line 1171). Not a functional concern, but worth updating to `2.1` for hygiene.

3. **`focusStartTime` is set before the session `POST` await.** If the user's machine is very slow and the session POST takes meaningful time, the recorded `started_at` in the DB (set by SQLite `DEFAULT (datetime('now'))` at insert time) will differ slightly from `focusStartTime` (set at `Date.now()` before the fetch). The discrepancy is cosmetic — the DB timestamp is the source of truth for session start; the client timestamp drives the displayed timer. No functional issue.

---

## Sign-off

- [x] Engineer complete
- [x] Code review complete — 2026-02-21, Claude Sonnet 4.6
- [ ] PM reviewed
