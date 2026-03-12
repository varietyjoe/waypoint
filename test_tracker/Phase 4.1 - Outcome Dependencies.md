# Code Review — Phase 4.1: Outcome Dependencies

**Status:** Code Review Complete — APPROVED
**Reviewed:** 2026-02-23
**Reviewer:** Claude Sonnet 4.6 (Code Review Agent)

---

## Review Methodology

All source files were read directly from disk. Each checklist item was verified against the live code, not the engineer's self-reported notes. Line numbers are cited for all findings.

Files inspected:
- `src/database/dependencies.js`
- `src/routes/api.js` (require block, init section, dependency routes, all three injection points)
- `src/services/claude.js` (`sendWithTools`, `proposeTodayPlan`)
- `public/index.html` (state variables, `fetchOutcomeDependencies`, `fetchCriticalPath`, `addDependency`, `removeDependency`, `renderRightP2`, `renderSidebarOutcomes`)

---

## Full Checklist

### File 1: `src/database/dependencies.js`

| # | Item | Result |
|---|---|---|
| 1 | Table schema matches spec — `id`, `outcome_id`, `depends_on_outcome_id` with `ON DELETE CASCADE` on both FK columns, `created_at`, `UNIQUE` constraint | PASS — lines 5–11; both FK columns carry `ON DELETE CASCADE`; all columns and constraint match spec exactly |
| 2 | `initDependenciesTable` logs `✅ Dependencies table initialized` | PASS — line 13: `console.log('✅ Dependencies table initialized')` |
| 3 | `addDependency` uses `INSERT OR IGNORE` | PASS — line 20: `INSERT OR IGNORE INTO outcome_dependencies` |
| 4 | `getDependencies` joins on `depends_on_outcome_id`; answers "what does this outcome depend on?" | PASS — line 38–39: `JOIN outcomes o ON o.id = od.depends_on_outcome_id WHERE od.outcome_id = ?`; returns `id, title, status` |
| 5 | `getDependents` joins on `outcome_id`; answers "what depends on this one?" | PASS — line 50–51: `JOIN outcomes o ON o.id = od.outcome_id WHERE od.depends_on_outcome_id = ?`; returns `id, title, status` |
| 6 | `hasCycle` uses BFS, not recursion — queue `[]` and `visited` Set | PASS — lines 61–82; `const visited = new Set(); const queue = [dependsOnId];` with `while (queue.length > 0)` loop |
| 7 | `hasCycle` traverses `getDependencies` direction — inner query is `SELECT depends_on_outcome_id FROM outcome_dependencies WHERE outcome_id = ?` | PASS — lines 70–72; correct direction; starting from `dependsOnId` and walking upstream |
| 8 | `getCriticalPath` filters for active upstream — `WHERE upstream.status = 'active'` on the join to `outcomes` | PASS — line 93: `WHERE upstream.status = 'active'`; archived upstream dependencies do not trigger the flag |
| 9 | `getCriticalPath` returns `blocked_by_title` per row | PASS — lines 120–127: fetches first alphabetically active blocker title; line 132: `blocked_by_title: firstBlocker ? firstBlocker.title : null` |
| 10 | `getCriticalPath` only returns active outcomes — `WHERE o.status = 'active'` on the outcome detail lookup | PASS — line 106: `WHERE o.id = ? AND o.status = 'active'`; archived outcomes are skipped with `if (!outcome) continue` |
| 11 | All functions are synchronous — no `async`, `await`, or Promises | PASS — all functions use `db.prepare().run()`, `.all()`, `.get()` directly; no async keywords anywhere in file |
| 12 | `module.exports` exports all 7 functions | PASS — lines 141–148: `initDependenciesTable`, `addDependency`, `removeDependency`, `getDependencies`, `getDependents`, `hasCycle`, `getCriticalPath` |

---

### File 2: `src/routes/api.js` — Require + Init

| # | Item | Result |
|---|---|---|
| 13 | `dependenciesDb` required at top of file | PASS — line 24: `const dependenciesDb = require('../database/dependencies');` |
| 14 | `initDependenciesTable()` called in startup init block, after `patternsDb.initPatternTables()` | PASS — line 39: `dependenciesDb.initDependenciesTable();`, which follows `patternsDb.initPatternTables()` at line 38 |

---

### File 2: `src/routes/api.js` — Route Ordering

| # | Item | Result |
|---|---|---|
| 15 | `GET /api/outcomes/critical-path` is registered BEFORE `GET /api/outcomes/:id` | PASS — critical-path at line 139; `GET /outcomes/:id` at line 228; no route capture risk |
| 16 | New dependency sub-routes do not conflict with existing outcome sub-routes | PASS — `/dependencies` and `/dependents` do not collide with `/actions`, `/archive`, `/complete`, `/reflection`, `/stats`; shapes are distinct |

---

### File 2: `src/routes/api.js` — Dependency Routes (5 routes)

| # | Item | Result |
|---|---|---|
| 17 | `GET /api/outcomes/critical-path` calls `getCriticalPath()` and returns correct shape | PASS — lines 139–146: `dependenciesDb.getCriticalPath()`; response `{ success: true, count: path.length, data: path }` |
| 18 | `GET /api/outcomes/:id/dependencies` parses id as integer, calls `getDependencies`, returns correct shape | PASS — lines 152–160: `parseInt(req.params.id)`, `dependenciesDb.getDependencies(outcomeId)`, `{ success: true, count: deps.length, data: deps }` |
| 19 | `GET /api/outcomes/:id/dependents` parses id as integer, calls `getDependents`, returns correct shape | PASS — lines 166–174: `parseInt(req.params.id)`, `dependenciesDb.getDependents(outcomeId)`, `{ success: true, count: dependents.length, data: dependents }` |
| 20 | `POST /api/outcomes/:id/dependencies` validates `depends_on_outcome_id` — returns 400 if missing | PASS — lines 187–189: `if (!depends_on_outcome_id)` returns `res.status(400)` |
| 21 | `POST /api/outcomes/:id/dependencies` rejects self-dependency — returns 400 | PASS — lines 193–195: `if (outcomeId === dependsOnId)` returns 400 with "An outcome cannot depend on itself" |
| 22 | `POST /api/outcomes/:id/dependencies` calls `hasCycle` before `addDependency`; returns 400 if cycle detected with legible message | PASS — lines 197–199: `dependenciesDb.hasCycle(outcomeId, dependsOnId)` checked before `addDependency` at line 201; error message "This dependency would create a circular chain" |
| 23 | `POST /api/outcomes/:id/dependencies` returns updated dependency list on success | PASS — lines 202–203: calls `getDependencies(outcomeId)` and returns the full list in `data`; see Non-Blockers for note on missing `count` field |
| 24 | `DELETE /api/outcomes/:id/dependencies/:depId` calls `removeDependency(outcomeId, depId)` with both params as integers, returns `{ success: true }` | PASS — lines 213–221: both params parsed with `parseInt`; `removeDependency` called correctly; `res.json({ success: true })` |
| 25 | All 5 routes wrap logic in `try/catch` and call `next(err)` | PASS — all five routes confirmed; try/catch blocks at lines 140–146, 153–159, 167–173, 183–206, 214–221 |

---

### File 2: `src/routes/api.js` — Claude Injection Points

**Injection Point 1: AI Breakdown (`POST /api/chat`)**

| # | Item | Result |
|---|---|---|
| 26 | Injection is inside the `if (mode === 'tools')` block | PASS — line 1133: `if (mode === 'tools')` block opens; dependency injection at lines 1147–1162 is inside this block, before the `sendWithTools` call |
| 27 | `outcomeId` read from `context?.selected_outcome?.id` with optional chaining | PASS — line 1150: `const outcomeId = context?.selected_outcome?.id;` |
| 28 | `getDependencies(outcomeId)` called and filtered to `status === 'active'` | PASS — lines 1152–1153: `dependenciesDb.getDependencies(outcomeId)` then `.filter(d => d.status === 'active')` |
| 29 | Injection wrapped in `try/catch` with empty catch `(_) {}` | PASS — lines 1149 and 1162: `try { ... } catch (_) {}` |
| 30 | `enrichedContext._dependencyContext` is set, not `_patternContext` | PASS — line 1156: `enrichedContext._dependencyContext = ...`; `_patternContext` is set separately at line 1141; no clobbering |

**Injection Point 2: Today Propose (`POST /api/today/propose`)**

| # | Item | Result |
|---|---|---|
| 31 | `getCriticalPath()` called inside `try/catch` with fallback to `[]` | PASS — lines 1881–1885: `let blockedOutcomeIds = []; try { ... } catch (_) {}` |
| 32 | `blockedOutcomeIds` passed to `proposeTodayPlan` as fourth argument | PASS — line 1887: `claudeService.proposeTodayPlan(windows, outcomesWithActions, contextSnapshot, blockedOutcomeIds)` |
| 33 | `blockedOutcomeIds` is an array of integer outcome IDs, not objects | PASS — line 1884: `blockedOutcomeIds = criticalPath.map(o => o.id)`; `.id` from SQLite is an integer |

**Injection Point 3: Inbox Triage Batch (`POST /api/inbox/triage-batch`)**

| # | Item | Result |
|---|---|---|
| 34 | Injection is inside a `try/catch` with empty catch | PASS — lines 986–995: `try { ... } catch (_) {}` |
| 35 | Active outcome titles appended to `contextSnapshot`, not replacing it | PASS — line 990: `contextSnapshot = (contextSnapshot || '') + ...`; additive pattern correctly used |
| 36 | Appended text instructs Claude to note potential blockers in cluster description — advisory only, not auto-create | PASS — line 992–993: `"note it in the cluster's description field"`; no auto-creation instruction present |

---

### File 3: `src/services/claude.js`

**`sendWithTools` function:**

| # | Item | Result |
|---|---|---|
| 37 | `_dependencyContext` is injected into the system prompt | PASS — lines 312–315: `if (context._dependencyContext) { systemPrompt += context._dependencyContext; }` |
| 38 | `_dependencyContext` injection does not replace `_patternContext` injection — both present | PASS — `_patternContext` injection at lines 308–310 and `_dependencyContext` at lines 313–315 are both present as sequential blocks |

**`proposeTodayPlan` function:**

| # | Item | Result |
|---|---|---|
| 39 | Function signature accepts `blockedOutcomeIds` as 4th parameter with default `[]` | PASS — line 531: `async function proposeTodayPlan(windows, outcomes, contextSnapshot, blockedOutcomeIds = [])` |
| 40 | Blocked outcome IDs are included in the prompt with explicit IDs for Claude matching | PASS — lines 543–545: `blockedOutcomeIds.join(', ')` embeds actual integer IDs in the prompt string |
| 41 | Blocked note is conditional — only present when `blockedOutcomeIds.length > 0` | PASS — line 543: `const blockedNote = blockedOutcomeIds.length > 0 ? ... : ''` |

---

### File 4: `public/index.html`

**State variables:**

| # | Item | Result |
|---|---|---|
| 42 | `OUTCOME_DEPS` declared as object | PASS — line 619: `let OUTCOME_DEPS = {}` |
| 43 | `CRITICAL_PATH_IDS` declared as Set | PASS — line 620: `let CRITICAL_PATH_IDS = new Set()` |
| 44 | `CRITICAL_PATH_TITLES` declared as object | PASS — line 621: `let CRITICAL_PATH_TITLES = {}` |

**Functions:**

| # | Item | Result |
|---|---|---|
| 45 | `fetchOutcomeDependencies(id)` calls both `/dependencies` and `/dependents` in parallel via `Promise.all`, stores in `OUTCOME_DEPS[id]` | PASS — lines 791–806: `Promise.all([fetch(.../dependencies), fetch(.../dependents)])`; result stored at `OUTCOME_DEPS[id]` |
| 46 | `fetchCriticalPath()` calls `GET /api/outcomes/critical-path` and populates both `CRITICAL_PATH_IDS` and `CRITICAL_PATH_TITLES` | PASS — lines 808–821: fetches `/api/outcomes/critical-path`; populates `CRITICAL_PATH_IDS` as a `new Set` and `CRITICAL_PATH_TITLES` map |
| 47 | `fetchOutcomeDependencies` called from `selectOutcome(id)` after `fetchOutcomeStats`, followed by `renderRightPanel()` | PASS — lines 890–892: `await fetchOutcomeStats(id)` then `await fetchOutcomeDependencies(id)` then `renderRightPanel()` |
| 48 | `fetchCriticalPath` called from `loadData()` so sidebar lock state is populated on initial load | PASS — line 696: `await fetchCriticalPath()` inside `loadData` function |
| 49 | `addDependency(outcomeId, selectEl)` reads `selectEl.value`, calls POST, handles 400 with toast, on success calls `fetchOutcomeDependencies`, `renderRightPanel`, `renderSidebarOutcomes` | PASS — lines 2115–2137: reads `selectEl.value`; `!res.ok` path calls `showToast(data.error ...)`; success path calls all three refresh calls |
| 50 | `removeDependency(outcomeId, dependsOnId)` calls DELETE and on success refreshes deps and re-renders | PASS — lines 2139–2149: DELETE call followed by `fetchCriticalPath`, `fetchOutcomeDependencies`, `renderRightPanel`, `renderSidebarOutcomes` |
| 51 | Both `addDependency` and `removeDependency` call `fetchCriticalPath()` so sidebar lock icon reflects updated state | PASS — `addDependency` line 2130; `removeDependency` line 2142: both call `fetchCriticalPath()` before re-render |

**`renderRightP2()` — Dependencies section:**

| # | Item | Result |
|---|---|---|
| 52 | Dependencies section appears at the bottom of the right panel when `phase === 2` | PASS — lines 2011–2070: IIFE at end of `renderRightP2()` return string, above closing `</div>` at line 2071 |
| 53 | "Blocked by" list shows existing dependencies with title, status, and remove button per dep | PASS — lines 2018–2027: each dep renders title, status, and `×` button |
| 54 | "Blocking" list shows dependents (read-only, no remove button) | PASS — lines 2029–2037: dependents rendered without a remove button |
| 55 | Remove button calls `removeDependency(outcomeId, dep.id)` with correct IDs | PASS — line 2025: `onclick="removeDependency(${o.id}, ${d.id})"` |
| 56 | Add dropdown filters out self — current outcome does not appear in options | PASS — line 2065: `.filter(ao => ao.id !== o.id && ...)` |
| 57 | Add dropdown filters out already-added dependencies | PASS — line 2065: `&& !depState.dependencies.find(d => d.id === ao.id)` |
| 58 | Add dropdown uses `onchange="addDependency(outcomeId, this)"` — passes select element | PASS — line 2062: `onchange="addDependency(${o.id}, this)"` |
| 59 | Amber "Blocked" indicator appears when `hasActiveDeps` is true | PASS — lines 2040–2046: `${hasActiveDeps ? \`<div class="... bg-amber-50 border border-amber-100 ...\`}` |
| 60 | `escHtml()` used on all user-supplied text rendered into HTML | PASS — lines 2022, 2034, 2066: `escHtml(d.title)`, `escHtml(d.title)`, `escHtml(ao.title)`; also line 1022 in sidebar |
| 61 | `OUTCOME_DEPS[o.id]` safely accessed with fallback | PASS — line 2013: `OUTCOME_DEPS[o.id] \|\| { dependencies: [], dependents: [] }` |

**`renderSidebarOutcomes()` — Lock icon:**

| # | Item | Result |
|---|---|---|
| 62 | Lock icon rendered only when `CRITICAL_PATH_IDS.has(o.id)` | PASS — line 1021: `${CRITICAL_PATH_IDS.has(o.id) ? ...}` |
| 63 | Lock icon uses `text-gray-400` | PASS — line 1022: `class="text-gray-400 shrink-0"` on the span; see Non-Blockers for note on emoji vs SVG |
| 64 | Lock icon has `title` attribute reading "Blocked by: [upstream outcome name]" sourced from `CRITICAL_PATH_TITLES` | PASS — line 1022: `title="Blocked by: ${escHtml(CRITICAL_PATH_TITLES[o.id] \|\| 'upstream outcome')}"` |
| 65 | Lock icon and deadline risk dot are mutually exclusive in the trailing slot | PASS — lines 1021–1025: ternary structure renders lock OR risk dot OR nothing; they cannot appear simultaneously |
| 66 | `escHtml()` used on `CRITICAL_PATH_TITLES[o.id]` in `title` attribute | PASS — line 1022: `escHtml(CRITICAL_PATH_TITLES[o.id] \|\| 'upstream outcome')` |

---

## Checklist Summary

| Section | Items | Pass | Fail |
|---|---|---|---|
| File 1 — `dependencies.js` schema + functions | 12 | 12 | 0 |
| File 2 — require + init | 2 | 2 | 0 |
| File 2 — route ordering | 2 | 2 | 0 |
| File 2 — 5 dependency routes | 9 | 9 | 0 |
| File 2 — Claude injection points (3) | 11 | 11 | 0 |
| File 3 — `claude.js` (`sendWithTools` + `proposeTodayPlan`) | 5 | 5 | 0 |
| File 4 — `index.html` state variables | 3 | 3 | 0 |
| File 4 — `index.html` functions | 7 | 7 | 0 |
| File 4 — `renderRightP2` dependencies section | 10 | 10 | 0 |
| File 4 — `renderSidebarOutcomes` lock icon | 5 | 5 | 0 |
| **TOTAL** | **66** | **66** | **0** |

---

## Non-Blockers

1. **`POST /api/outcomes/:id/dependencies` success response is missing `count` field.** Line 203 returns `{ success: true, data: deps }` without a `count` field, breaking the standard `{ success: true, count: N, data: [...] }` pattern used throughout the rest of `api.js`. The frontend does not read a `count` field from this response, so there is no functional defect, but the inconsistency is worth aligning on a future pass.

2. **Lock icon uses emoji `🔒` rather than SVG.** Line 1022 renders a `🔒` emoji inside a `<span class="text-gray-400 ...">`. The `text-gray-400` class has no effect on emoji rendering — the lock will display in full color on all platforms regardless of the class. All other icons in the sidebar and right panel use inline SVG, which is controllable via CSS color utilities. This is a cosmetic inconsistency; the icon works and is informative, but it will not visually match the "subtle grey" intent described in the spec.

3. **`module.exports` in `claude.js` is placed before `proposeTodayPlan` and `generateTodayRecommendation` are defined.** `module.exports` at line 516 references both `proposeTodayPlan` (defined at line 531) and `generateTodayRecommendation` (defined at line 593), which appear after the export statement. This works in Node.js because function declarations are hoisted, and both are `async function` declarations (not arrow-function assignments), so no runtime error occurs. However, the ordering is unconventional and could confuse future engineers. This is a pre-existing pattern from Phase 3.0, not introduced by Phase 4.1, and does not constitute a Phase 4.1 defect.

---

## Blockers

None.

---

## What to Test Manually

1. Create two outcomes A and B. On A's detail panel, add B as a dependency — confirm B appears in the "Blocked by" list and A disappears from B's "Add dependency" dropdown (self-filter working).
2. Try adding A as a dependency of B (after step 1) — confirm 400 response and toast "This dependency would create a circular chain" appears.
3. Confirm the lock icon appears in the sidebar next to B after the dependency is set. Hover it — confirm tooltip reads "Blocked by: [A's title]".
4. Remove the dependency. Confirm the lock icon disappears from the sidebar.
5. Navigate to `POST /api/today/propose` — with B blocked by A, confirm B's outcome ID does not appear in `committed_actions` (Claude receives the blocked IDs).
6. Use AI Breakdown on outcome B (which depends on A) — confirm the dependency notice appears in Claude's system prompt context and the breakdown acknowledges the blocked state.
7. Run inbox triage-batch — confirm active outcome titles are appended to the context snapshot sent to Claude.
8. Archive outcome A — confirm B is no longer flagged as blocked (cascade-delete removes the dependency row or `getCriticalPath` filters it via `upstream.status = 'active'`).
9. Reload the app — confirm lock icon state is populated on initial load without needing to click an outcome first.

---

## Test Results

| Test | Status |
|---|---|
| Dependency add + "Blocked by" list renders | NOT RUN (code review only) |
| Cycle detection returns 400 + toast | NOT RUN (code review only) |
| Lock icon visible + tooltip correct | NOT RUN (code review only) |
| Lock icon disappears on dependency removal | NOT RUN (code review only) |
| Today propose excludes blocked outcome IDs | NOT RUN (code review only) |
| AI Breakdown dependency notice | NOT RUN (code review only) |
| Inbox triage context injection | NOT RUN (code review only) |
| Archive clears lock icon | NOT RUN (code review only) |
| Initial load populates lock state | NOT RUN (code review only) |

---

## Verdict

**APPROVED for Phase 4.2.**

All 66 checklist items pass across all four files. No blocking defects were identified. Three non-blocking observations are noted — a missing `count` field on the POST route response (cosmetic, no functional impact), an emoji lock icon that cannot be tinted grey via CSS (cosmetic, does not affect function or readability), and a pre-existing module.exports ordering quirk in `claude.js` that predates this phase. None of these warrant holding the release.

The implementation is structurally sound: cycle detection is BFS-correct and covers transitive chains, cascade-delete is applied to both FK columns, route ordering is correct, all three Claude injection points are guarded by try/catch so dependency errors cannot cascade into the surrounding endpoints, and the frontend state machine correctly refreshes lock state on both add and remove operations.

Phase 4.1 is complete. Phase 4.2 is cleared to begin.

---

## Sign-off Checkboxes

- [ ] Engineer — implementation self-verified
- [x] Code Reviewer — review complete, no blockers
- [ ] PM — cleared for Phase 4.2
