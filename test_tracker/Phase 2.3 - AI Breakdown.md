# Test Tracker — Phase 2.3: AI Breakdown

**Status:** Code Review Complete — APPROVED FOR PHASE 2.4
**Review Date:** 2026-02-20
**Reviewer:** Claude (claude-sonnet-4-6)

---

## What to Test

**Context-grounded estimates:**
- [ ] Open ⌘K → "Break this outcome into actions" on an outcome — Claude returns time estimates that match your context memory (e.g. if "150 dials = 6 hours" is in memory, actions involving calling should reflect that)
- [ ] With empty `user_context` table — Claude still returns actions, just with generic estimates

**Questions flow:**
- [ ] On an outcome with task types NOT in context — Claude returns a `questions` array before the action list
- [ ] Questions panel renders inside the ⌘K palette with one input per question
- [ ] Typing an answer and pressing Enter submits (or "Continue →" button)
- [ ] Answers are stored to `GET /api/context` (verify new entries appear)
- [ ] After answering — action preview modal appears with the proposed actions

**No-questions flow:**
- [ ] On an outcome where all task types ARE in context — action preview appears directly with no questions step
- [ ] Existing action preview UI (editable cards, per-action checkboxes, "Create Actions") still works

**Regressions:**
- [ ] `brain_dump_to_outcomes` via ⌘K still works
- [ ] `bulk_reschedule` via ⌘K still works
- [ ] `prioritize_today` via ⌘K still works
- [ ] Focus Mode unchanged
- [ ] Phase 3 archive unchanged

---

## Code Review Results

### `src/services/claude.js`

| # | Checklist Item | Result | Notes |
|---|---|---|---|
| 1 | `break_into_actions` tool `description` updated — references context-grounded estimates and questions | PASS | Line 18: `'Break the given outcome into a concrete list of actions with time and energy estimates. Uses the user\'s known durations from context. If task types are unknown, returns questions before proposing actions.'` |
| 2 | `break_into_actions` `input_schema` has `questions` property: `type: 'array'`, items `type: 'string'` | PASS | Lines 35–39: `questions: { type: 'array', description: '...', items: { type: 'string' } }` — correct shape |
| 3 | `questions` is NOT in the `required` array | PASS | Line 41: `required: ['actions']` — only `actions` required |
| 4 | `questions` property has a `description` explaining when to populate it | PASS | Line 37: describes exactly when to populate, including "Leave empty or omit if context covers all tasks" |
| 5 | `sendWithTools` system prompt `break_into_actions` line updated to instruct Claude to use known durations and put unknowns in `questions[]` | PASS | Line 300: `'- break_into_actions: decompose the selected outcome into 3–7 specific executable actions. Use the user\'s known durations from context for time estimates. If a task type has no known duration in context, put it in questions[] instead of guessing. Propose realistic estimates only.'` |
| 6 | `sendMessage`, `streamFocusMessage`, `classifyForInbox`, `sendWithTools` signatures all unchanged | PASS | All four function signatures verified at lines 130, 184, 254, 334 — none altered |
| 7 | All four other tools (`brain_dump_to_outcomes`, `bulk_reschedule`, `prioritize_today`) unchanged | PASS | Lines 44–119 verified — schemas untouched |

### `public/index.html`

| # | Checklist Item | Result | Notes |
|---|---|---|---|
| 8 | `break_into_actions` result handler checks `tool_input.questions?.length > 0` | PASS | Line 2552 (⌘K handler): `if (questions.length > 0)` — also line 3773 (FAB handler). Both use `const { actions = [], questions = [] } = result.tool_input` default destructuring, so `questions` is always an array before the length check |
| 9 | When questions present: calls `renderBreakdownQuestions` before action preview | PASS | Lines 2553, 3774: `renderBreakdownQuestions(questions, outcomeId, actions)` |
| 10 | When no questions (or empty array): goes directly to action preview — existing behavior unchanged | PASS | Lines 2555, 3776: `renderCmdBreak(actions)` — same call as pre-Phase 2.3 |
| 11 | `renderBreakdownQuestions` renders one input per question inside the ⌘K palette | PASS | Lines 2728–2764: maps `questions` to one `<input id="breakdown-q-${i}">` per question, writes to `cmdPaletteContent` |
| 12 | First input is auto-focused | PASS | Line 2763: `setTimeout(() => document.getElementById('breakdown-q-0')?.focus(), 50)` |
| 13 | Enter key on any input OR a "Continue" button triggers `submitBreakdownQuestions` | PASS | Line 2737: `onkeydown="if(event.key==='Enter') submitBreakdownQuestions()"` on each input; line 2750: `onclick="submitBreakdownQuestions()"` on Continue button |
| 14 | `submitBreakdownQuestions` reads each answer by input ID | PASS | Lines 2767–2771: reads `document.getElementById(\`breakdown-q-\${i}\`)` for each question index |
| 15 | Each non-empty answer POSTs to `/api/context` with `category: 'task_duration'`, `source: 'ai_breakdown'` | PASS | Lines 2776–2785: `fetch('/api/context', ...)` with `category: 'task_duration'`, `source: 'ai_breakdown'` — filtered to non-empty answers only |
| 16 | Context saves use `Promise.all` — failure does NOT block proceeding to action preview | PASS | Line 2787: `await Promise.all(saves).catch(() => {})` — `.catch(() => {})` swallows errors and execution continues unconditionally |
| 17 | After saves: calls existing action preview function with pending actions | PASS | Line 2796: `renderCmdBreak(pendingActions)` |
| 18 | Existing `renderCmdBreak` is unchanged | PASS | Lines 2612–2662: function is unmodified; still takes `actions` array only, reads `outcomeId` from module-scoped `cmdContext` |
| 19 | Existing `createAcceptedActions` is unchanged | PASS | Lines 2680–2724: function is unmodified |

### No Regressions

| # | Checklist Item | Result | Notes |
|---|---|---|---|
| 20 | ⌘K `break_into_actions` result with empty/absent `questions` → action preview appears directly | PASS | Default destructure `questions = []` ensures `questions.length > 0` is false; falls through to `renderCmdBreak(actions)` |
| 21 | `brain_dump_to_outcomes`, `bulk_reschedule`, `prioritize_today` tool flows unchanged | PASS | Both ⌘K and FAB handlers still route these tools identically (lines 2558–2560, 3779–3781) |
| 22 | Focus Mode, inline editing, Phase 3 archive unchanged | PASS | Only two files touched (claude.js, index.html); no Focus Mode or archive code was modified |
| 23 | Preserved files untouched | PASS | `slack.js`, `grain.js`, all integrations, `oauth-tokens.js`, `monitored-channels.js`, `triage.js`, `inbox.js` — all confirmed present with pre-Phase 2.3 modification timestamps |

---

## Issues Found

### Minor / Non-Blocking

**1. `window._pendingBreakdownOutcomeId` is stored but never read.**

- `renderBreakdownQuestions` stores `outcomeId` into `window._pendingBreakdownOutcomeId` (line 2760), and `submitBreakdownQuestions` clears it (line 2793), but never reads it.
- `renderCmdBreak` obtains the outcomeId independently from module-scoped `cmdContext.selected_outcome.id` (line 2643), so the action preview works correctly.
- This is a dead write — no functional impact. The correct outcomeId reaches `createAcceptedActions` via `renderCmdBreak`'s own lookup. No action required before Phase 2.4; could be cleaned up at any time.

**2. `submitBreakdownQuestions` takes no arguments — departs from engineer handoff spec (`submitBreakdownQuestions(questions, outcomeId)`).**

- The handoff spec (2C) defined the function as `async function submitBreakdownQuestions(questions, outcomeId)`. The implementation reads questions and outcomeId from `window._pending*` globals instead.
- This is a valid implementation choice — it avoids inline-HTML argument serialization (no `JSON.stringify` in `onkeydown` attribute). The behavior is identical. Not a bug.

No blocking issues found.

---

## Test Results

| Date | Tester | Workstream | Pass/Fail | Notes |
|---|---|---|---|---|
| 2026-02-20 | Claude (claude-sonnet-4-6) | Workstream 1 — claude.js tool schema | PASS | All 7 items verified |
| 2026-02-20 | Claude (claude-sonnet-4-6) | Workstream 2 — frontend questions + handler | PASS | All 12 items verified |
| 2026-02-20 | Claude (claude-sonnet-4-6) | No Regressions | PASS | All 4 regression items verified |

---

## Verdict

**APPROVED FOR PHASE 2.4**

All 23 checklist items pass. Both handler paths (⌘K command palette and ✦ FAB) were updated consistently. The questions step is correctly gated, non-blocking on context saves, and falls through to the existing `renderCmdBreak` flow cleanly. The two minor observations above are cosmetic/non-functional and do not block progression.

---

## Sign-off

- [x] Engineer complete
- [x] Code review complete
- [ ] PM reviewed
