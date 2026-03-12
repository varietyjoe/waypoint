# Phase 2.2 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 2.2 just completed — it adds User Context Memory: a `user_context` table, four CRUD API routes, context injection into all Claude prompts, a "Save this" chip in Focus Mode, and a Memory panel in the sidebar. Read `pm_log/Phase 2/Phase 2.2 - Code Review Handoff.md` in full, then verify every checklist item against the actual codebase. Report what passed, what failed, and any out-of-scope issues. End with a clear verdict: approved for Phase 2.3, or blocked with specifics. Log your results to `test_tracker/Phase 2.2 - User Context Memory.md`.

---

You are reviewing Phase 2.2 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these files before touching anything:**
1. `pm_log/Phase 2/Phase 2.2 - User Context Memory.md` — full phase spec
2. `pm_log/Phase 2/Phase 2.2 - Engineer Handoff.md` — detailed implementation spec
3. `dev_tracker/Phase 2.2 - User Context Memory.md` — the working checklist; verify each item is actually complete

---

## What Was Built

Phase 2.2 adds persistent user context: a new DB module, four REST routes, context injection into `sendMessage`, `sendWithTools`, and `buildFocusSystemPrompt`, a "Save this" chip in the Focus Mode chat, and a Memory accordion in the sidebar. Everything is additive — no existing behavior should change.

---

## Review Checklist

### DB Module (`src/database/user-context.js`)

- [ ] File exists at `src/database/user-context.js`
- [ ] `initUserContextTable()` creates `user_context` table with all 9 columns: `id`, `key`, `value`, `category`, `source`, `source_action_id`, `source_outcome_id`, `created_at`, `updated_at`
- [ ] `source_action_id` and `source_outcome_id` use `ON DELETE SET NULL` (not CASCADE)
- [ ] `getContextSnapshot()` returns empty string `''` when table is empty (not a string containing "I don't know anything yet" or similar)
- [ ] `getContextSnapshot()` returns formatted block with `## What I know about how you work:` heading when entries exist
- [ ] `upsertContext()` checks for existing key with **case-insensitive** match (`lower(key) = lower(?)`) before deciding insert vs update
- [ ] `upsertContext()` sets `updated_at = datetime('now')` on update
- [ ] `updateContext(id, value, category)` updates value, category, and `updated_at`
- [ ] `deleteContext(id)` removes the row
- [ ] All six functions exported in `module.exports`

### API Routes (`src/routes/api.js`)

- [ ] `userContextDb` required at top of file
- [ ] `userContextDb.initUserContextTable()` called in DB init block at startup
- [ ] `GET /api/context` returns `{ success: true, count: N, data: [...] }`
- [ ] `POST /api/context` validates both `key` and `value` present — returns 400 if either missing
- [ ] `POST /api/context` calls `upsertContext` (not `createContext`) — existing key is updated, not duplicated
- [ ] `PUT /api/context/:id` validates `value` present — returns 400 if missing
- [ ] `DELETE /api/context/:id` returns `{ success: true }` (no data needed)
- [ ] `buildFocusSystemPrompt` calls `userContextDb.getContextSnapshot()` and appends the result to the system prompt **only if non-empty**
- [ ] `buildFocusSystemPrompt` system prompt now includes the duration-asking instruction: "If the user mentions a task or estimates time for something you don't have in context, ask them to confirm the duration…"

### Claude Service (`src/services/claude.js`)

- [ ] `userContextDb` required at the top of `claude.js` with correct relative path (`'../database/user-context'`)
- [ ] `sendMessage` has optional 4th parameter `contextSnapshot = ''` — callers that pass 3 args still work identically
- [ ] `sendMessage` appends context block to system prompt only when `contextSnapshot` is non-empty
- [ ] `sendWithTools` calls `userContextDb.getContextSnapshot()` internally and appends to its system prompt
- [ ] `streamFocusMessage` is **unchanged** — context is handled by `buildFocusSystemPrompt` in api.js

### `/api/chat` Route (Regression Check)

- [ ] The existing `/api/chat` POST handler still calls `sendMessage(message, history)` or `sendWithTools(messages, context)` — no breaking changes from the new signature

### Frontend (`public/index.html`)

**"Save this" chip:**
- [ ] `sendFocusMessage()` checks `fullResponse` with regex `/\d+\s*(min|hour|hr|h\b|minutes|hours)/i` after streaming completes
- [ ] Chip element renders below the assistant message element (not inside it, not as a toast)
- [ ] Chip button calls `saveContextFromFocus(userMessage, fullResponse, chipEl)`
- [ ] `saveContextFromFocus` sends `POST /api/context` with `key` (from user message, truncated), `value` (extracted duration or truncated response), `category: 'task_duration'`, `source: 'focus_mode'`
- [ ] On API success: chip shows "Saved ✓", grayed, then disappears after 2s
- [ ] On API failure: chip shows "Save failed" and re-enables (does not crash)
- [ ] Chip does not appear if `fullResponse` does not match the regex

**Memory sidebar section:**
- [ ] "Memory" toggle button and `memory-count` chip present in sidebar below project list
- [ ] `memory-panel` with `id="memory-panel"` starts hidden (`display:none`)
- [ ] `toggleMemoryPanel()` toggles panel visibility and calls `loadMemoryPanel()` on open
- [ ] `loadMemoryPanel()` fetches `/api/context` and calls `renderMemoryList(entries)`
- [ ] `renderMemoryList` shows "No memories yet" message when entries is empty
- [ ] Each entry renders: key (bold, truncated), value (editable `contenteditable`), × delete button
- [ ] Blurring a contenteditable value calls `saveContextEdit(id, newValue, category)` → `PUT /api/context/:id`
- [ ] × button calls `deleteContextEntry(id)` — shows `confirm()` dialog, then `DELETE /api/context/:id`, then reloads list
- [ ] "+ Add memory" button renders inline form (key input, value input, Save/Cancel)
- [ ] Submitting form calls `POST /api/context` with `source: 'manual'`, reloads list on success
- [ ] Memory count badge is initialized on page load (not just when panel opens)

### No Regressions

- [ ] Phase 1 (outcomes list) and ⌘K palette still work
- [ ] Phase 2 (action checklist), Phase 3 (complete & close) still work
- [ ] Focus Mode (Phase 2.1) still opens, streams Claude responses, saves sessions
- [ ] `sendMessage()` called from `/api/chat` without 4th param — no error, behavior identical to pre-2.2
- [ ] `sendWithTools()` called from `/api/chat` — still works, context injection is internal
- [ ] Slack and Grain routes untouched

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
- NLP-based auto-extraction of context (Phase 2.2 uses simple regex heuristic and manual entry by design)
- Context expiry or staleness detection (not planned for v1)
- Vector search over context (simple string match is intentional)
- AI Breakdown context injection (Phase 2.3)
- Smart Inbox Triage context injection (Phase 2.4)

If you spot something clearly wrong but outside 2.2 scope, note it — don't block sign-off on it.

---

## When You're Done

Update `test_tracker/Phase 2.2 - User Context Memory.md` with your findings:
- Fill in the **Test Results** table (date, pass/fail, notes per workstream)
- List any failures under **Issues Found**
- Check the **Sign-off** boxes if approved

If the checklist is clear: signal **approved for Phase 2.3**. If there are blockers: flag them specifically — what failed, what file, what the spec says it should be.
