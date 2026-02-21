# Test Tracker — Phase 1.4: AI Co-pilot

**Status:** Code Review Complete — APPROVED

---

## Phase 1.3 Handoff — Deviations Dev Must Know Before Starting

Phase 1.3 code review completed 2026-02-19. Core functionality is working end-to-end and Phase 1.4 is cleared to start, but three interface deviations from the Phase 1.3 spec were found. If Phase 1.4 dev codes against the spec rather than the actual codebase, they will hit bugs. Brief them on all three before they write anything.

### 1. DB column is `total_estimated_time`, not `total_estimated_minutes`

The Phase 1.3 spec called the snapshot column `total_estimated_minutes`. The engineer used `total_estimated_time` — consistently, so it works — but the name is wrong per spec. Any Phase 1.4 Claude tool that queries or documents this column must use `total_estimated_time`.

### 2. No `reflections.js` file — import from `outcomes.js` instead

The spec required a standalone `src/database/reflections.js`. It was never created; all reflection logic lives in `outcomes.js`. If Phase 1.4 code does `require('../database/reflections')`, the server will fail to start. The correct import is:

```js
const { getReflectionByOutcome } = require('../database/outcomes');
```

Note the function is also named `getReflectionByOutcome(id)`, not `getReflectionByOutcomeId(id)` as the spec described.

### 3. `completeOutcome()` takes an actions array, not a stats snapshot

The spec described `completeOutcome(id, statsSnapshot)` where the endpoint pre-computes the snapshot. The actual signature is `completeOutcome(id, actionsArray, reflectionData)` — it takes the raw actions and computes stats internally. Calling it with a precomputed stats object will silently produce wrong snapshot data. The correct call pattern (matching what the endpoint already does) is:

```js
const actions = actionsDb.getActionsByOutcome(outcomeId);
outcomesDb.completeOutcome(outcomeId, actions, { what_worked, what_slipped, reusable_insight });
```

---

## What to Test

**Phase 1.3 Deviation Regressions:**
- [ ] Claude tool that reads archived outcome data uses column `total_estimated_time` (not `total_estimated_minutes`) — query returns a value, not null
- [ ] No `require('../database/reflections')` anywhere in 1.4 code — server starts without error
- [ ] Any 1.4 code that calls `completeOutcome()` passes `(outcomeId, actionsArray, reflectionData)` — not a pre-computed stats object
- [ ] `getReflectionByOutcome(id)` called correctly (not `getReflectionByOutcomeId`) if 1.4 reads reflections

**Command Palette:**
- [ ] ⌘K opens from Phase 1 (outcome list view)
- [ ] ⌘K opens from Phase 2 (inside an outcome)
- [ ] Context injection correct — Claude references the right outcome/project without being told
- [ ] ESC closes cleanly, no state left behind

**Break Into Actions (✦ button + ⌘K):**
- [ ] ✦ button visible on outcome cards
- [ ] Clicking ✦ opens palette pre-filled for that outcome
- [ ] Claude returns a sensible action breakdown (not generic filler)
- [ ] Review modal shows all suggestions
- [ ] Can edit a suggestion before accepting
- [ ] Can reject individual suggestions
- [ ] Only accepted actions are created — nothing creates without user approval
- [ ] Created actions appear in correct outcome with correct energy type + time estimate

**Brain Dump:**
- [ ] Multi-sentence unstructured input → correctly extracted outcomes and actions
- [ ] Assigned to the right project
- [ ] Preview shown before anything is created

**Bulk Reschedule:**
- [ ] "Push everything in PRODUCT to March 30" → preview shows every affected deadline
- [ ] Confirming applies all changes correctly
- [ ] Cancelling creates nothing

**Prioritize Today:**
- [ ] Response references actual deadline risk data (not generic advice)
- [ ] No unintended data mutations from this tool

**Scope Boundary (regression check):**
- [ ] Claude does NOT intercept simple UI operations (adding one action, toggling done, archiving)
- [ ] Those interactions still work via UI as expected

---

## Test Results

| Date | Tester | Workstream | Pass/Fail | Notes |
|---|---|---|---|---|
| 2026-02-20 | Claude Sonnet 4.6 (code review) | Pre-build check | PASS | Grain deferral explicitly logged in dev_tracker |
| 2026-02-20 | Claude Sonnet 4.6 (code review) | Tool definitions (`claude.js`) | PASS | All 4 tools match spec schemas exactly; `sendWithTools` exported; `sendMessage` signature unchanged |
| 2026-02-20 | Claude Sonnet 4.6 (code review) | `/api/chat` route extension | PASS | `mode: "tools"` branch calls `sendWithTools`; existing path unchanged |
| 2026-02-20 | Claude Sonnet 4.6 (code review) | Context injection | PASS | All 5 context fields present; `buildContext()` called at palette-open time |
| 2026-02-20 | Claude Sonnet 4.6 (code review) | Command palette (⌘K) | PASS | Global keydown handler; focus on open; Enter/ESC wired; loading state; data refresh on close |
| 2026-02-20 | Claude Sonnet 4.6 (code review) | ✦ button | PASS | On every card; opens palette with correct outcome and preset text; same code path |
| 2026-02-20 | Claude Sonnet 4.6 (code review) | `break_into_actions` preview | PASS | Editable title/time/energy per row; per-action checkbox; only accepted created; cancel discards |
| 2026-02-20 | Claude Sonnet 4.6 (code review) | `brain_dump_to_outcomes` preview | PASS | Project matching case-insensitive; no-match warning shown; no crash; checked outcomes + actions created |
| 2026-02-20 | Claude Sonnet 4.6 (code review) | `bulk_reschedule` preview | PASS | Deadline diff table; per-row checkbox; Apply uses `PUT /api/outcomes/:id`; Cancel discards |
| 2026-02-20 | Claude Sonnet 4.6 (code review) | `prioritize_today` read-only | PASS | Inline display only; no Apply button; no write calls reachable from render function |
| 2026-02-20 | Claude Sonnet 4.6 (code review) | Scope boundary regression | PASS | Basic CRUD (add action, toggle, archive, quick capture) paths unchanged; Claude not wired into them |
| 2026-02-20 | Claude Sonnet 4.6 (code review) | Grain deferral | PASS | `grain.js` untouched; deferral explicitly noted in dev_tracker |
| 2026-02-20 | Claude Sonnet 4.6 (code review) | Preserved files | PASS | `grain.js`, `slack-client.js`, `grain-client.js`, `crypto.js`, `oauth-tokens.js`, `monitored-channels.js` — no modifications |
| 2026-02-20 | Claude Sonnet 4.6 (code review) | Phase 1.3 deviation regressions | PASS | No `require('../database/reflections')`; no `completeOutcome()` call; no `total_estimated_minutes` reference in 1.4 code |

---

## Issues Found

### Non-blocking observations (do not hold sign-off)

**1. `buildContext()` uses cached globals, not a fresh API fetch at palette-open time**
- **File:** `public/index.html`, `buildContext()` function (~line 1698)
- **What it does:** Uses module-level `OUTCOMES`, `PROJECTS`, `TODAY_STATS`, `OUTCOME_STATS` globals rather than calling the API fresh when the palette opens.
- **Why it's fine:** Globals are refreshed by `loadData()` at init and after every mutation. The intent of the spec — "not stale from page load" — is met. `TODAY_STATS` in particular is only fetched at init and after outcome completion, so could lag after other unrelated actions, but this doesn't affect correctness of any tool.
- **Action:** None required. Acceptable.

**2. `break_into_actions` uses `POST /api/outcomes/:id/actions` instead of `POST /api/actions`**
- **File:** `public/index.html`, `createAcceptedActions()` (~line 1990)
- **What it does:** Uses the nested route `POST /api/outcomes/${outcomeId}/actions` to create accepted actions.
- **Why it's fine:** The spec checklist said "POST /api/actions with correct outcome_id" — but the flat `POST /api/actions` route creates *unassigned* actions (null outcome_id). The nested route validates the outcome exists and correctly assigns the outcome_id. The implementation is functionally more correct than the spec instruction.
- **Action:** None required. Implementation is better than the spec's route suggestion.

**3. `brain_dump_to_outcomes` no-match project shows dropdown instead of auto-skipping**
- **File:** `public/index.html`, `renderCmdDump()` (~line 2026)
- **What it does:** When Claude returns a `project_name` with no match, shows a warning label AND leaves the project dropdown at empty ("— select project —"). The outcome is only skipped if the user doesn't manually pick a project before clicking "Create Selected."
- **Why it's fine:** The spec said "warning shown, that outcome skipped." The implementation shows the warning and still skips if no project is selected (the skip happens in `createDumpOutcomes()`). Allowing the user to manually correct the project is better UX. Does not crash. Spec intent met.
- **Action:** None required.

**4. API info route still annotated as phase 1.3**
- **File:** `src/routes/api.js`, line 1083: `phase: '1.3'`
- **Impact:** Cosmetic only — the `GET /api/` info endpoint returns the wrong phase number.
- **Action:** Minor cleanup, not a blocker.

**5. `sendMessage()` uses `claude-sonnet-4-20250514`; `sendWithTools()` uses `claude-sonnet-4-6`**
- **File:** `src/services/claude.js`, lines 149 vs 299
- **What it means:** The two functions use different model IDs. The spec requires `claude-sonnet-4-6` for the new `sendWithTools` (satisfied ✓) and says `sendMessage()` must be unchanged. The `claude-sonnet-4-20250514` model ID in `sendMessage` was inherited from the pre-1.4 codebase and was not modified in this phase.
- **Action:** None required. This was pre-existing.

---

## Sign-off

- [x] Engineer complete (logged 2026-02-20)
- [x] Code review complete (2026-02-20) — **APPROVED**
- [ ] PM reviewed
