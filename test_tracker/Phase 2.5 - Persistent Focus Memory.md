# Test Tracker — Phase 2.5: Persistent Focus Memory

**Status:** Code Review Complete — APPROVED FOR PHASE 2.6
**Reviewed:** 2026-02-21
**Reviewer:** Claude Sonnet 4.6 (code review agent)

---

## Review Methodology

Each checklist item from the Code Review Handoff was verified by reading the four changed files in full:
- `src/database/focus-sessions.js`
- `src/services/claude.js`
- `src/routes/api.js` (lines 1150–1317)
- `public/index.html` (lines 3289–3679)

Preserved files were verified to exist and have unchanged timestamps.

---

## Checklist Results

### `src/database/focus-sessions.js`

- [x] `summary TEXT` column migration present in `initFocusSessionsTable` using `PRAGMA table_info` + `ALTER TABLE` pattern
  - Lines 18–21: `PRAGMA table_info('focus_sessions')` → `.find(c => c.name === 'summary')` → `ALTER TABLE focus_sessions ADD COLUMN summary TEXT`
- [x] Migration is idempotent — checks `cols.find(...)` before running ALTER TABLE
- [x] `getRelevantSessions(actionId, outcomeId)` — queries same outcome via JOIN through `actions` table, returns up to 5 DESC
  - Lines 50–57: `JOIN actions a ON fs.action_id = a.id WHERE a.outcome_id = ? ORDER BY fs.started_at DESC LIMIT 5`
- [x] `getRelevantSessions` falls back to same action if no outcome-level results
  - Lines 60–66: fallback `SELECT * FROM focus_sessions WHERE action_id = ? ORDER BY started_at DESC LIMIT 5`
- [x] `updateSessionSummary(id, summary)` — runs UPDATE, no return value
  - Line 70–71: `db.prepare('UPDATE focus_sessions SET summary = ? WHERE id = ?').run(summary, id)`
- [x] `module.exports` includes both new functions
  - Line 73: `module.exports = { initFocusSessionsTable, createSession, endSession, getSessionsByAction, getRelevantSessions, updateSessionSummary }`

**Workstream 1: PASS (6/6)**

---

### `src/services/claude.js`

- [x] `summarizeFocusSession(conversation)` is present — lines 395–408
- [x] Takes `conversation` array — parameter is `conversation`, first line maps over it
- [x] Uses `anthropic.messages.create()` (not streaming) — line 398
- [x] Model is `claude-sonnet-4-6` — line 399
- [x] Prompt instructs a 3–5 sentence summary focused on decisions and outputs — line 403: `"Summarize this Focus Mode work session in 3–5 sentences. Focus on what was decided, created, or learned. Be specific about outputs and next steps. Do not mention the word 'summary'."`
- [x] Returns trimmed text string (empty string on no output) — line 407: `response.content.find(b => b.type === 'text')?.text?.trim() || ''`
- [x] `module.exports` includes `summarizeFocusSession` — line 430
- [x] All previous exports unchanged — `sendMessage`, `classifyForInbox`, `sendWithTools`, `streamFocusMessage`, `batchTriageInbox` all present

**Workstream 2: PASS (8/8)**

---

### `src/routes/api.js`

- [x] Require destructuring updated — **NOTE:** Engineer correctly used module-object pattern (`focusSessionsDb.getRelevantSessions()`) rather than destructuring, matching the existing codebase convention. All calls work correctly. Logged as a deliberate decision in the dev tracker.
- [x] `GET /api/focus/sessions/relevant` route present — line 1193
- [x] Route validates `actionId` and `outcomeId` query params — returns 400 if missing — lines 1195–1198
- [x] Parses `conversation` JSON from DB safely with try/catch — line 1206: `try { conversation = JSON.parse(session.conversation || '[]'); } catch {}`
- [x] Short sessions (< 2000 chars total): returned with full `conversation` array — lines 1210–1212
- [x] Long sessions with cached `summary`: returned with `summary`, empty `conversation` — lines 1221–1222
- [x] Long sessions without cached summary: generates with `summarizeFocusSession`, caches via `updateSessionSummary`, returns summary — lines 1216–1219
- [x] `buildFocusSystemPrompt` accepts `relevantSessionBlocks` as 3rd param (default `''`) — line 1160: `function buildFocusSystemPrompt(action, outcome, relevantSessionBlocks = '')`
  - **NOTE:** Engineer correctly adapted the signature to match the actual codebase. The handoff spec described a 5-param signature `(action, outcome, project, contextSnapshot, relevantSessionBlocks)` but the real function only uses `action` and `outcome` (context snapshot is fetched internally from `userContextDb.getContextSnapshot()`). The actual implementation is `(action, outcome, relevantSessionBlocks = '')` which is correct and backward-compatible.
- [x] When `relevantSessionBlocks` non-empty, prompt includes `## Past sessions on related work:` block — lines 1285–1293: `relevantSessionBlocks = \`## Past sessions on related work:\n${blocks.join('\n\n')}\``
- [x] `POST /api/focus/message` fetches relevant sessions before calling `buildFocusSystemPrompt` — lines 1267–1296
- [x] Relevant session fetch wrapped in try/catch — silently falls back to empty string on error — lines 1267–1295: `try { ... } catch (_) {}`
- [x] Only first 3 sessions used in prompt — line 1272: `sessions.slice(0, 3)`
- [x] Session blocks formatted with date and content (formatted conversation or summary) — lines 1276–1289: date via `toLocaleDateString`, content formatted as `[Session — ${dateStr}]\n${formatted or summary}`
- [x] No existing route signatures changed — `POST /api/focus/sessions`, `PUT /api/focus/sessions/:id`, `POST /api/focus/message` all present and unmodified in their external contracts

**Workstream 3: PASS (13/13)**

---

### `public/index.html`

- [x] `appendFocusMessage` adds "Save this →" chip below assistant messages (not user messages) — **NOTE:** The chip is NOT added inside `appendFocusMessage` itself. It is added in `sendFocusMessage` after streaming completes (lines 3504–3512). This is a valid implementation choice — the chip needs the full `fullResponse` text after streaming finishes, which `appendFocusMessage` does not have. The spec said "chip below assistant messages"; this is satisfied.
- [x] Chip button has `data-content` attribute containing the full message text — line 3508: `saveChip.setAttribute('data-content', fullResponse)`
- [x] `saveContextFromFocusBlock(btn)` present — line 3566
- [x] Reads `data-content` from button — line 3567: `btn.dataset.content || btn.getAttribute('data-content') || ''`
- [x] Auto-generates key from first 8 words of content — line 3571: `content.trim().split(/\s+/).slice(0, 8).join(' ')`
- [x] POSTs to `/api/context` with `category: 'saved_output'`, `source: 'focus_mode'` — lines 3574–3583
- [x] On success: button text → "Saved ✓", button disabled — lines 3584–3587
- [x] On failure: button text → "Failed" — lines 3588–3593: both HTTP failure and network error paths set `btn.textContent = 'Failed'`
- [x] Memory panel shows "Saved Outputs" section — lines 3670–3675
- [x] Saved Outputs section filters entries by `category === 'saved_output'` — line 3634: `entries.filter(e => e.category === 'saved_output')`
- [x] Each saved output shows: key (title), truncated value, date — lines 3658–3661: key in bold, value with `max-height:60px;overflow:hidden`, date via `toLocaleDateString()`
- [x] Existing task_duration section in memory panel unchanged — lines 3635–3652: `regularEntries` renders all non-`saved_output` categories exactly as before

**Workstream 4: PASS (12/12)**

---

### No Regressions

- [x] Focus Mode open/close/send flow unchanged — `enterFocusMode`, `exitFocusMode`, `sendFocusMessage` core flow intact; only additive changes
- [x] `endSession` (via `exitFocusMode`) still stores conversation to DB — lines 3399–3408: PUT to `/api/focus/sessions/${focusSessionId}` with `conversation: JSON.stringify(focusHistory)` unchanged
- [x] Existing Memory panel entries (task_duration) still render correctly — `regularEntries` rendered first with full edit/delete UI, `savedOutputsHtml` appended below
- [x] ⌘K tools unchanged — `sendWithTools`, `TOOLS` array, all tool routes untouched
- [x] Inbox triage flow unchanged — inbox/triage routes and DB files unmodified
- [x] Archive flow unchanged — outcomes archive routes unmodified
- [x] Preserved files untouched — `slack.js`, `grain.js`, `crypto.js`, `triage.js`, `inbox.js`, `oauth-tokens.js`, `monitored-channels.js` all verified present with original timestamps

**No Regressions: PASS (7/7)**

---

## Issues Found

**None blocking.**

One deviation from spec documented below — it is a correct engineering adaptation, not a defect:

**Spec vs. Implementation: `buildFocusSystemPrompt` signature**
- Spec described: `(action, outcome, project, contextSnapshot, relevantSessionBlocks = '')`
- Actual implementation: `(action, outcome, relevantSessionBlocks = '')`
- Reason: The actual pre-Phase-2.5 function never took `project` or `contextSnapshot` as parameters — it fetched the context snapshot internally from `userContextDb.getContextSnapshot()`. The engineer correctly read the real function before building, matched the actual codebase, and logged the deviation in the dev tracker. The result is correct and backward-compatible.

**Minor: "Save this →" chip placement**
- Spec said chip in `appendFocusMessage`. Implementation attaches chip in `sendFocusMessage` after streaming completes.
- This is preferable — the chip requires the fully streamed `fullResponse` text to populate `data-content`. Placing it in `appendFocusMessage` would only have access to the initial empty string. The engineer logged this decision correctly.

---

## What to Test Manually

**Relevant session retrieval:**
- [ ] `GET /api/focus/sessions/relevant?actionId=X&outcomeId=Y` returns sessions on the same outcome
- [ ] Returns sessions on the same action if no outcome-level sessions exist
- [ ] Returns empty array (not error) when no past sessions found

**Short session injection:**
- [ ] Open Focus Mode on a task with a past session (< 2000 chars) — Claude's first response references previous work
- [ ] System prompt includes `## Past sessions on related work:` block with raw conversation

**Long session summarization:**
- [ ] Open Focus Mode on a task with a long past session (> 2000 chars) — session is summarized before injection
- [ ] Summary is cached: check `focus_sessions.summary` column is populated
- [ ] Second open uses the cached summary (no second API call to Claude)

**No sessions:**
- [ ] Opening Focus Mode with no past related sessions — Claude does NOT mention memory or hallucinate context

**"Save this →" chip:**
- [ ] Claude response blocks in Focus Mode show "Save this →" chip
- [ ] User messages do NOT show a chip
- [ ] Clicking "Save this →" saves to `GET /api/context` (verify `source: 'focus_mode'`, `category: 'saved_output'`)
- [ ] Button changes to "Saved ✓" and becomes disabled
- [ ] Saved entry appears in Memory panel "Saved Outputs" section

**Memory panel:**
- [ ] Memory panel has a "Saved Outputs" section below regular entries
- [ ] Saved outputs show key, truncated value, and date
- [ ] Existing task_duration entries still render correctly

**Regressions:**
- [ ] Focus Mode open/close/send/exit unchanged
- [ ] ⌘K tools unchanged
- [ ] Inbox triage unchanged
- [ ] Archive flow unchanged

---

## Test Results

| Date | Tester | Workstream | Pass/Fail | Notes |
|---|---|---|---|---|
| 2026-02-21 | Code Review Agent | DB — focus-sessions.js | Pass | All 6 items verified |
| 2026-02-21 | Code Review Agent | Claude — claude.js | Pass | All 8 items verified |
| 2026-02-21 | Code Review Agent | API — api.js | Pass | All 13 items verified; signature deviation logged |
| 2026-02-21 | Code Review Agent | Frontend — index.html | Pass | All 12 items verified; chip placement deviation logged |
| 2026-02-21 | Code Review Agent | No Regressions | Pass | All 7 items verified |

---

## Verdict

**APPROVED FOR PHASE 2.6**

All 46 checklist items verified against the live codebase. Zero defects. Two deliberate deviations from the spec both represent correct engineering decisions (the engineer read the real code before building, adapted accordingly, and logged the reasoning). Implementation is complete, clean, and non-breaking.

---

## Sign-off

- [x] Engineer complete
- [x] Code review complete
- [ ] PM reviewed
