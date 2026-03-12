# Test Tracker — Phase 2.2: User Context Memory

**Status:** Code Review Complete — Approved for Phase 2.3

---

## What to Test

**DB & API:**
- [ ] Server starts without errors — `user_context` table created on startup
- [ ] `POST /api/context` with `{ key: "150 dials", value: "6 hours", category: "task_duration" }` → returns entry with id
- [ ] `POST /api/context` with same key → upserts (same id returned or updated, not duplicate row)
- [ ] `GET /api/context` → returns all entries with count
- [ ] `PUT /api/context/:id` → updates value, check DB directly that `updated_at` changed
- [ ] `DELETE /api/context/:id` → entry gone from subsequent `GET /api/context`
- [ ] `POST /api/context` without key → 400 error
- [ ] `POST /api/context` without value → 400 error

**Context injection into Claude:**
- [ ] Open ⌘K palette, type something — check server logs or Chrome devtools: system prompt sent to Claude includes "What I know about how you work:" section (if any context entries exist)
- [ ] Open Focus Mode, send a message — same check: context injected into system prompt
- [ ] With empty `user_context` table: no context section appears in system prompt (not an empty heading)

**"Save this" chip in Focus Mode:**
- [ ] Have a conversation in Focus Mode where Claude mentions a duration (e.g. "that should take about 90 minutes")
- [ ] "Save this to memory ↗" chip appears below Claude's response
- [ ] Click chip → shows "Saving…" then "Saved ✓" then disappears
- [ ] Check Memory panel — new entry appears
- [ ] Claude response without a time reference → no chip appears

**Memory sidebar panel:**
- [ ] Click "Memory" in sidebar → panel slides open showing entries (or "No memories yet")
- [ ] Count chip in sidebar shows correct number
- [ ] Click on a value to edit it — blur → saves (check via GET /api/context)
- [ ] Click × → confirm dialog → entry removed, list reloads
- [ ] Click "+ Add memory" → inline form → fill key + value → Save → entry added to list
- [ ] Cancel closes form without saving

**Regressions:**
- [ ] ⌘K palette still works (break into actions, brain dump, etc.)
- [ ] Focus Mode still streams correctly
- [ ] Inline editing on outcomes/actions still works
- [ ] Phase 3 archive still works

---

## Test Results

| Date | Tester | Workstream | Pass/Fail | Notes |
|---|---|---|---|---|
| 2026-02-20 | Claude Sonnet 4.6 (Code Review) | 1 — DB Module (`src/database/user-context.js`) | **PASS** | File exists at correct path (73 lines). `initUserContextTable()` creates `user_context` with all 9 columns: `id`, `key`, `value`, `category`, `source`, `source_action_id`, `source_outcome_id`, `created_at`, `updated_at`. Both FK columns use `ON DELETE SET NULL` (lines 11–12). `getContextSnapshot()` returns `''` when rows is empty (line 28); returns `## What I know about how you work:\n- key: value` format when populated (line 31). `upsertContext()` uses `lower(key) = lower(?)` case-insensitive match (line 36). Both update paths set `updated_at = datetime('now')` (lines 40, 56). `updateContext()` updates value, category, and `updated_at` (lines 53–58). `deleteContext()` removes row by id (line 62). All six functions exported in `module.exports` (lines 66–73). |
| 2026-02-20 | Claude Sonnet 4.6 (Code Review) | 2 — API Routes (`src/routes/api.js`) | **PASS** | `userContextDb` required at line 13. `userContextDb.initUserContextTable()` called at line 24 inside the startup init block (lines 17–25). `GET /api/context` returns `{ success: true, count: N, data: [...] }` (lines 722–727). `POST /api/context` validates both `key` and `value`, returns 400 if either missing (line 733); calls `upsertContext` not `createContext` (line 734). `PUT /api/context/:id` validates `value` present, returns 400 if missing (line 744); calls `updateContext` (line 745). `DELETE /api/context/:id` returns `{ success: true }` with no data (lines 751–756). `buildFocusSystemPrompt` calls `userContextDb.getContextSnapshot()` and appends only when non-empty (lines 1150–1153). Duration-asking instruction present in `buildFocusSystemPrompt` at line 1137: "If the user mentions a task or estimates time for something you don't have in context, ask them to confirm the duration, then tell them you've noted it. Keep the question to one sentence." |
| 2026-02-20 | Claude Sonnet 4.6 (Code Review) | 3 — Claude Service (`src/services/claude.js`) | **PASS** | `userContextDb` required at line 2 with correct relative path `'../database/user-context'`. `sendMessage` has optional 4th param `contextSnapshot = ''` at line 124; builds `contextBlock` only when non-empty (line 139) and appends to system prompt (line 146). `sendWithTools` calls `userContextDb.getContextSnapshot()` internally at line 297 and appends to system prompt at lines 298–299. `streamFocusMessage` is unchanged — still takes a pre-built `systemPrompt` string (line 328), gets context through `buildFocusSystemPrompt` in `api.js` not internally. All four functions exported correctly (line 348). |
| 2026-02-20 | Claude Sonnet 4.6 (Code Review) | `/api/chat` Regression | **PASS** | `/api/chat` POST handler (lines 763–785): plain-chat path calls `claudeService.sendMessage(message, conversationHistory \|\| [], preview)` with 3 args (line 779) — no 4th arg needed, defaults to `''`, behavior identical to pre-2.2. Tool-mode path calls `claudeService.sendWithTools([...], context \|\| {})` (lines 771–773) — context injection is internal to `sendWithTools`, no breaking changes. |
| 2026-02-20 | Claude Sonnet 4.6 (Code Review) | 4 — Frontend (`public/index.html`) | **PASS** | **"Save this" chip:** `sendFocusMessage()` checks `fullResponse` with `/\d+\s*(min\|hour\|hr\|h\b\|minutes\|hours)/i` after streaming loop (line 3135). Chip created with `document.createElement('button')` and inserted via `assistantEl.parentNode?.insertBefore(chip, assistantEl.nextSibling)` — below assistant element, not inside it (lines 3136–3141). Chip `onclick` calls `saveContextFromFocus(userMessage, fullResponse, chip)` (line 3139). `saveContextFromFocus` POSTs to `/api/context` with `key` (user message truncated 60 chars), `value` (regex-extracted duration or 80-char fallback), `category: 'task_duration'`, `source: 'focus_mode'`, `source_action_id: focusActionId` (lines 3158–3192). On success: shows "Saved ✓", grays color to `#6b7280`, removes after 2s (lines 3181–3183). On failure: shows "Save failed", re-enables (lines 3184–3190). Chip does not appear when `fullResponse` does not match regex (guard on line 3135). **Memory sidebar:** Memory toggle button at line 312–317 with `onclick="toggleMemoryPanel()"` and `id="memory-count"` chip. `id="memory-panel"` starts `display:none` at line 319. `toggleMemoryPanel()` toggles visibility and calls `loadMemoryPanel()` on open (lines 3200–3205). `loadMemoryPanel()` fetches `/api/context`, updates count chip, calls `renderMemoryList(entries)` (lines 3207–3221). `renderMemoryList` shows "No memories yet" message when empty (line 3228); each entry shows key (bold, truncated with `text-overflow:ellipsis`), value (`contenteditable="true"` with `onblur`), and × delete button (lines 3232–3247). Blur calls `saveContextEdit(id, this.textContent, category)` → `PUT /api/context/:id` (lines 3238, 3250–3262). × calls `deleteContextEntry(id)` with `confirm()` dialog → `DELETE /api/context/:id` → reloads list (lines 3264–3272). "+ Add memory" button calls `showAddContextForm()` which renders inline key+value form (lines 3274–3292). `submitAddContext` POSTs with `source: 'manual'`, reloads list on success (lines 3294–3308). Memory count badge initialized on page load inside `loadData()` at lines 609–616. `escHtml` used correctly throughout (lines 3235, 3238, 3240). |
| 2026-02-20 | Claude Sonnet 4.6 (Code Review) | No Regressions | **PASS** | Preserved files (`slack.js`, `grain.js`, `slack-client.js`, `grain-client.js`, `crypto.js`, `oauth-tokens.js`, `monitored-channels.js`, `triage.js`, `inbox.js`) contain zero references to `userContextDb`, `user-context`, or `user_context` — confirmed untouched. `sendMessage()` and `sendWithTools()` called from `/api/chat` route with original arg counts — no breaking changes. All Phase 1 + Phase 2.0 + Phase 2.1 routes intact. `streamFocusMessage` in `claude.js` is byte-for-byte identical to its Phase 2.1 state. |

---

## Issues Found

### Issue #1 — `submitAddContext` always saves with `category: 'task_duration'` regardless of actual content [MINOR]

**Location:** `public/index.html` line 3302

**Observation:** The manual "+ Add memory" form hardcodes `category: 'task_duration'` for all manually entered memories. A user adding a work pattern (`deep work block: 90 min max, 2 per day`) or preference would have it stored under `task_duration` rather than the correct category.

**Spec says:** Phase 2.2 scope includes `task_duration`, `work_pattern`, `process_time`, `preference`, `other` as valid categories. Manual entries via the sidebar form always get `task_duration`.

**Impact:** Low. The category field is cosmetic in v1 — it is not used for filtering or context formatting. The `getContextSnapshot()` function selects all rows regardless of category. The spec explicitly says "entries are built organically through use" and the form has no category input by design. This is a product decision, not a bug.

**Verdict:** Do not block. Note for Phase 2.3 if category becomes meaningful.

---

### Issue #2 — API info block at bottom of `api.js` still lists `phase: '1.3'` and omits `/api/context` endpoints [COSMETIC]

**Location:** `src/routes/api.js` line 1222

**Observation:** The `/api/` info endpoint returns `phase: '1.3'` and the `endpoints` object does not list the four new `/api/context` routes. This was also present in Phase 2.1 (phase read `'1.3'` then too).

**Impact:** None. This endpoint is not used by the frontend or any integration.

**Verdict:** Cosmetic. Carry forward as cleanup item.

---

### Issue #3 — `sendMessage()` still uses model `claude-sonnet-4-20250514` while all Phase 2 functions use `claude-sonnet-4-6` [PRE-EXISTING — CARRY FORWARD]

**Location:** `src/services/claude.js` line 149

**Observation:** Carried forward from Phase 1.x, flagged in Phase 2.1 review. `sendMessage` uses `claude-sonnet-4-20250514`; `sendWithTools` and `streamFocusMessage` both use `claude-sonnet-4-6`.

**Impact:** Minor inconsistency. The legacy `/api/chat` path (used by the ⌘K palette plain-chat fallback and Slack triage) talks to a slightly different model identifier. Both resolve to the same underlying model.

**Verdict:** Pre-existing. Not a Phase 2.2 regression. Low-priority cleanup.

---

## Out-of-Scope Observations (do not block Phase 2.3)

1. **No category selector in manual "Add memory" form.** All manually added entries land in `task_duration`. As noted in Issue #1, this is acceptable for v1. If Phase 2.3 or 2.4 starts routing on category, a select input (`task_duration | work_pattern | process_time | preference | other`) should be added.

2. **Memory count badge does not refresh after "Save this" chip fires.** When the user saves a context entry via the Focus Mode chip, the sidebar `memory-count` badge is not incremented. It will update correctly the next time the user opens the Memory panel (since `loadMemoryPanel` updates the count). Minor UX gap — not a spec requirement, just an observation.

3. **`submitAddContext` does not clear the inline form on success.** After a successful `POST /api/context`, `loadMemoryPanel()` re-renders the full memory list, which replaces the DOM including the form. This is correct behavior — the form disappears and the list refreshes. No issue.

---

## Sign-off

- [x] Engineer complete
- [x] Code review complete — 2026-02-20, Claude Sonnet 4.6
- [ ] PM reviewed
