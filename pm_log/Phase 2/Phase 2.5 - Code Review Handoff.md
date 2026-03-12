# Phase 2.5 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 2.5 just completed — it adds Persistent Focus Memory: Claude reads past session context when entering Focus Mode, sessions are summarized and cached when long, and users can save key outputs to their context memory. Read `pm_log/Phase 2/Phase 2.5 - Code Review Handoff.md` in full, then verify every checklist item against the actual codebase. End with a clear verdict: approved for Phase 2.6, or blocked with specifics. Log results to `test_tracker/Phase 2.5 - Persistent Focus Memory.md`.

---

**Read these files before touching anything:**
1. `pm_log/Phase 2/Phase 2.5 - Persistent Focus Memory.md` — full phase spec
2. `pm_log/Phase 2/Phase 2.5 - Engineer Handoff.md` — detailed implementation spec
3. `dev_tracker/Phase 2.5 - Persistent Focus Memory.md` — working checklist; verify each item complete

---

## What Was Built

Phase 2.5 adds session memory to Focus Mode. Four files changed:
- `src/database/focus-sessions.js`: `summary` column migration, `getRelevantSessions()`, `updateSessionSummary()`
- `src/services/claude.js`: `summarizeFocusSession(conversation)` for on-demand summarization
- `src/routes/api.js`: `GET /api/focus/sessions/relevant`, updated `buildFocusSystemPrompt` (5th param), updated `POST /api/focus/message` to inject past sessions
- `public/index.html`: "Save this →" chip on Claude response blocks, `saveContextFromFocusBlock()`, Memory panel Saved Outputs section

---

## Review Checklist

### `src/database/focus-sessions.js`

- [ ] `summary TEXT` column migration present in `initFocusSessionsTable` using `PRAGMA table_info` + `ALTER TABLE` pattern
- [ ] Migration is idempotent (checks before altering)
- [ ] `getRelevantSessions(actionId, outcomeId)` — queries same outcome via JOIN through `actions` table, returns up to 5 DESC
- [ ] `getRelevantSessions` falls back to same action if no outcome-level results
- [ ] `updateSessionSummary(id, summary)` — runs UPDATE, no return value needed
- [ ] `module.exports` includes both new functions

### `src/services/claude.js`

- [ ] `summarizeFocusSession(conversation)` is present
- [ ] Takes `conversation` array (not raw string)
- [ ] Uses `anthropic.messages.create()` (not streaming)
- [ ] Model is `claude-sonnet-4-6`
- [ ] Prompt instructs a 3–5 sentence summary focused on decisions and outputs
- [ ] Returns trimmed text string (empty string on no output)
- [ ] `module.exports` includes `summarizeFocusSession`
- [ ] All previous exports unchanged

### `src/routes/api.js`

- [ ] Require destructuring updated to include `getRelevantSessions`, `updateSessionSummary`
- [ ] `GET /api/focus/sessions/relevant` route present
- [ ] Route validates `actionId` and `outcomeId` query params — returns 400 if missing
- [ ] Parses `conversation` JSON from DB safely (try/catch)
- [ ] Short sessions (< 2000 chars total): returned with full `conversation` array
- [ ] Long sessions with cached `summary`: returned with `summary`, empty `conversation`
- [ ] Long sessions without cached summary: generates with `summarizeFocusSession`, caches via `updateSessionSummary`, returns summary
- [ ] `buildFocusSystemPrompt` accepts `relevantSessionBlocks` as 5th param (default `''`)
- [ ] When `relevantSessionBlocks` non-empty, prompt includes `## Past sessions on related work:` block
- [ ] `POST /api/focus/message` fetches relevant sessions before calling `buildFocusSystemPrompt`
- [ ] Relevant session fetch wrapped in try/catch — silently falls back to empty string on error
- [ ] Only first 3 sessions used in prompt
- [ ] Session blocks formatted with date and content (formatted conversation or summary)
- [ ] No existing route signatures changed

### `public/index.html`

- [ ] `appendFocusMessage` adds "Save this →" chip below assistant messages (not user messages)
- [ ] Chip button has `data-content` attribute containing the full message text
- [ ] `saveContextFromFocusBlock(btn)` present
- [ ] Reads `data-content` from button
- [ ] Auto-generates key from first 8 words of content
- [ ] POSTs to `/api/context` with `category: 'saved_output'`, `source: 'focus_mode'`
- [ ] On success: button text → "Saved ✓", button disabled
- [ ] On failure: button text → "Failed" (or similar feedback)
- [ ] Memory panel shows "Saved Outputs" section
- [ ] Saved Outputs section filters entries by `category === 'saved_output'`
- [ ] Each saved output shows: key (title), truncated value, date
- [ ] Existing task_duration section in memory panel unchanged

### No Regressions

- [ ] Focus Mode open/close/send flow unchanged
- [ ] `endSession` still stores conversation to DB
- [ ] Existing Memory panel entries (task_duration) still render correctly
- [ ] ⌘K tools unchanged
- [ ] Inbox triage flow unchanged
- [ ] Archive flow unchanged
- [ ] Preserved files untouched

---

## What's Out of Scope

- Semantic/vector search over sessions
- Bulk auto-summarization of all past sessions
- Exporting session history

---

## When You're Done

Log results to `test_tracker/Phase 2.5 - Persistent Focus Memory.md`. Verdict: **approved for Phase 2.6** or blocked with specifics.
