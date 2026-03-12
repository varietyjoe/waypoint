# Phase 4.1 — Code Review Handoff: Outcome Dependencies

## Agent Prompt

You are performing a code review for Phase 4.1 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase adds outcome-level dependency tracking. Your job is to verify correctness, safety, and completeness — not to rewrite the implementation. Work through the checklist below systematically, reading each file as directed, and record your findings. At the end, produce a verdict.

---

## Read These Files

Before starting the checklist, read:

1. `pm_log/Phase 4/Phase 4.1 - Outcome Dependencies.md` — the original spec (defines what should exist)
2. `src/database/dependencies.js` — the new DB module (Workstream 1)
3. `src/routes/api.js` — check the require block, init section, dependency routes, and three Claude injection points
4. `src/services/claude.js` — check `sendWithTools` and `proposeTodayPlan` for injections
5. `public/index.html` — check `renderSidebarOutcomes`, `renderRightP2`, and the new dependency JS functions

---

## What Was Built

Phase 4.1 introduced:

- **`src/database/dependencies.js`** (new file): `outcome_dependencies` join table with cycle detection and critical path query
- **5 new API routes** in `src/routes/api.js`: GET dependencies, GET dependents, POST add dependency (with cycle guard), DELETE remove dependency, GET critical-path
- **3 Claude injection points** in `src/routes/api.js` and `src/services/claude.js`: AI Breakdown dependency context, Today propose blocked outcome IDs, Inbox triage active outcome names
- **Frontend dependency UI** in `public/index.html`: Dependencies section in right panel (outcome detail), lock icon in sidebar outcome list, add/remove dependency UX

---

## Review Checklist

### File 1: `src/database/dependencies.js`

- [ ] **Table schema matches spec.** Verify `outcome_dependencies` table has: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE`, `depends_on_outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE`, `created_at TEXT DEFAULT (datetime('now'))`, `UNIQUE(outcome_id, depends_on_outcome_id)`. Both FK columns must have `ON DELETE CASCADE`.
- [ ] **`initDependenciesTable` logs to console.** Should print `✅ Dependencies table initialized` — consistent with other init functions in the codebase.
- [ ] **`addDependency` uses `INSERT OR IGNORE`.** Duplicate inserts must be silently ignored, not thrown. Confirm the statement is `INSERT OR IGNORE INTO outcome_dependencies`.
- [ ] **`getDependencies` joins on `depends_on_outcome_id`.** The function answers "what does this outcome depend on?" — the JOIN must be `JOIN outcomes o ON o.id = od.depends_on_outcome_id WHERE od.outcome_id = ?`. Columns returned must include `id`, `title`, `status`.
- [ ] **`getDependents` joins on `outcome_id`.** The function answers "what depends on this one?" — the JOIN must be `JOIN outcomes o ON o.id = od.outcome_id WHERE od.depends_on_outcome_id = ?`. Columns returned must include `id`, `title`, `status`.
- [ ] **`hasCycle` uses BFS, not recursion.** Should use a queue (`[]`) and a `visited` Set. Should return `true` if `outcomeId` is found when traversing from `dependsOnId`. Should return `false` if no cycle found.
- [ ] **`hasCycle` traverses `getDependencies` direction.** Starting from `dependsOnId`, it should follow the chain in the upstream direction (what does dependsOnId depend on? what does that depend on? etc.). The inner query must be `SELECT depends_on_outcome_id FROM outcome_dependencies WHERE outcome_id = ?`.
- [ ] **`getCriticalPath` filters for active upstream.** The query identifying blocked outcomes must join to `outcomes upstream` on `depends_on_outcome_id` and filter `WHERE upstream.status = 'active'`. It must not flag outcomes whose dependencies are already archived.
- [ ] **`getCriticalPath` returns `blocked_by_title`.** Each row in the result must include `blocked_by_title` — the title of the first alphabetically-sorted active upstream blocker. This field is used by the sidebar tooltip.
- [ ] **`getCriticalPath` only returns active outcomes.** The inner lookup for outcome details must filter `WHERE o.status = 'active'` — archived outcomes should not appear in the critical path even if they had dependencies.
- [ ] **All functions are synchronous.** No `async`, no `await`, no Promises anywhere in this file. All DB calls use `db.prepare().run()`, `.all()`, or `.get()` directly.
- [ ] **`module.exports` exports all 7 functions:** `initDependenciesTable`, `addDependency`, `removeDependency`, `getDependencies`, `getDependents`, `hasCycle`, `getCriticalPath`.

---

### File 2: `src/routes/api.js` — Require + Init

- [ ] **`dependenciesDb` is required at the top.** The line `const dependenciesDb = require('../database/dependencies');` must appear in the require block (around lines 1–24).
- [ ] **`initDependenciesTable()` is called in the init section.** The line `dependenciesDb.initDependenciesTable();` must appear in the startup init block (around lines 26–38), after `patternsDb.initPatternTables()`.

---

### File 2: `src/routes/api.js` — Route Ordering

- [ ] **`GET /api/outcomes/critical-path` is registered BEFORE `GET /api/outcomes/:id`.** Search for `router.get('/outcomes/critical-path'` and `router.get('/outcomes/:id'`. Confirm the critical-path route registration appears at a lower line number. If the order is reversed, any request to `/api/outcomes/critical-path` will be captured by `:id` and fail with a 404.
- [ ] **New `GET /api/outcomes/:id/dependencies` and `GET /api/outcomes/:id/dependents` routes do not conflict with existing outcome sub-routes.** Confirm no route shape collision with `/outcomes/:id/actions`, `/outcomes/:id/archive`, `/outcomes/:id/complete`, `/outcomes/:id/reflection`, `/outcomes/:id/stats`.

---

### File 2: `src/routes/api.js` — Dependency Routes (5 routes)

- [ ] **`GET /api/outcomes/critical-path`** calls `dependenciesDb.getCriticalPath()` and returns `{ success: true, count: N, data: [...] }`.
- [ ] **`GET /api/outcomes/:id/dependencies`** parses `req.params.id` as integer, calls `dependenciesDb.getDependencies(outcomeId)`, returns `{ success: true, count: N, data: [...] }`.
- [ ] **`GET /api/outcomes/:id/dependents`** parses `req.params.id` as integer, calls `dependenciesDb.getDependents(outcomeId)`, returns `{ success: true, count: N, data: [...] }`.
- [ ] **`POST /api/outcomes/:id/dependencies` validates `depends_on_outcome_id`.** Returns 400 if missing.
- [ ] **`POST /api/outcomes/:id/dependencies` rejects self-dependency.** Returns 400 with a clear message if `outcomeId === dependsOnId`.
- [ ] **`POST /api/outcomes/:id/dependencies` calls `hasCycle` before `addDependency`.** The cycle check must happen before any write. Returns 400 if `hasCycle` returns `true`. Confirm the error message is user-legible (e.g., "This dependency would create a circular chain").
- [ ] **`POST /api/outcomes/:id/dependencies` returns updated dependency list.** On success, it calls `getDependencies(outcomeId)` and returns the full updated list — not just a success boolean.
- [ ] **`DELETE /api/outcomes/:id/dependencies/:depId`** calls `dependenciesDb.removeDependency(outcomeId, depId)` with both params parsed as integers. Returns `{ success: true }`.
- [ ] **All 5 routes wrap their logic in try/catch and call `next(err)`** on failure — consistent with every other route in this file.

---

### File 2: `src/routes/api.js` — Claude Injection Points

**Injection Point 1: AI Breakdown (`POST /api/chat`)**

- [ ] **Injection is inside the `if (mode === 'tools')` block.** The dependency context must not leak into the plain-chat path.
- [ ] **`outcomeId` is read from `context?.selected_outcome?.id`.** Optional chaining must be used — `context` may not always be provided.
- [ ] **`getDependencies(outcomeId)` is called and filtered to `status === 'active'`.** Only active (not archived) upstream dependencies trigger the injection.
- [ ] **The injection uses a `try/catch` with an empty catch `(_) {}`.** Dependency injection is best-effort — a DB error must not crash the chat endpoint.
- [ ] **`enrichedContext._dependencyContext` is set, not `enrichedContext._patternContext`** — verify the correct property key is used to avoid clobbering the pattern injection.

**Injection Point 2: Today Propose (`POST /api/today/propose`)**

- [ ] **`getCriticalPath()` is called inside a `try/catch` with fallback to `[]`.** Calendar connection errors must not cascade into dependency errors.
- [ ] **`blockedOutcomeIds` is passed to `proposeTodayPlan`.** The function call must include blocked IDs as the fourth argument (or equivalent).
- [ ] **`blockedOutcomeIds` content is meaningful.** It must be an array of integer outcome IDs, not an array of objects.

**Injection Point 3: Inbox Triage Batch (`POST /api/inbox/triage-batch`)**

- [ ] **Injection is inside a `try/catch` with empty catch.** Triage must not fail if the outcomes query fails.
- [ ] **Active outcome titles are appended to `contextSnapshot`**, not replacing it. The `contextSnapshot = (contextSnapshot || '') + ...` pattern must be used.
- [ ] **The appended text instructs Claude to note potential blockers in the cluster description** — not to auto-create dependencies. The injection is advisory only.

---

### File 3: `src/services/claude.js`

**`sendWithTools` function:**

- [ ] **`_dependencyContext` is injected into the system prompt.** Look for a block that checks `context._dependencyContext` and appends it to `systemPrompt`. Should follow the same pattern as `_patternContext` injection (Phase 3.3).
- [ ] **`_dependencyContext` injection does not replace `_patternContext` injection.** Both must be present.

**`proposeTodayPlan` function:**

- [ ] **Function signature accepts `blockedOutcomeIds` as 4th parameter with default `[]`:** `async function proposeTodayPlan(windows, outcomes, contextSnapshot, blockedOutcomeIds = [])`.
- [ ] **Blocked outcome IDs are mentioned in the prompt.** The prompt must tell Claude not to commit blocked outcomes. Verify the exact IDs (not just a generic note) are included so Claude can match them against the `committed_actions` it generates.
- [ ] **The blocked note is conditional** — it should only appear in the prompt when `blockedOutcomeIds.length > 0`. No unnecessary noise when there are no blocked outcomes.

---

### File 4: `public/index.html`

**State variables:**

- [ ] **`OUTCOME_DEPS` is declared** as an object (e.g., `let OUTCOME_DEPS = {}`). Used to cache per-outcome dependency data between renders.
- [ ] **`CRITICAL_PATH_IDS` is declared** as a Set (e.g., `let CRITICAL_PATH_IDS = new Set()`).
- [ ] **`CRITICAL_PATH_TITLES` is declared** as an object (e.g., `let CRITICAL_PATH_TITLES = {}`). Used for sidebar tooltip text.

**Functions:**

- [ ] **`fetchOutcomeDependencies(id)` calls both `/dependencies` and `/dependents` endpoints** in parallel (Promise.all) and stores results in `OUTCOME_DEPS[id]`.
- [ ] **`fetchCriticalPath()` calls `GET /api/outcomes/critical-path`** and populates both `CRITICAL_PATH_IDS` (Set of IDs) and `CRITICAL_PATH_TITLES` (map of ID→blockedByTitle).
- [ ] **`fetchOutcomeDependencies` is called from `selectOutcome(id)`** after `fetchOutcomeStats`, followed by a `renderRightPanel()` call.
- [ ] **`fetchCriticalPath` is called from `loadData()`** (or equivalent main data load function) so the sidebar lock state is populated on initial load.
- [ ] **`addDependency(outcomeId, selectEl)` reads `selectEl.value`**, calls `POST /api/outcomes/:id/dependencies`, handles the 400 cycle error by showing a toast, and on success calls `fetchOutcomeDependencies`, `renderRightPanel`, `renderSidebarOutcomes`.
- [ ] **`removeDependency(outcomeId, dependsOnId)` calls `DELETE /api/outcomes/:id/dependencies/:depId`** and on success refreshes deps and re-renders.
- [ ] **Both `addDependency` and `removeDependency` call `fetchCriticalPath()`** (or `renderSidebarOutcomes` after updating critical path state) so the sidebar lock icon reflects the updated state.

**`renderRightP2()` — Dependencies section:**

- [ ] **Dependencies section appears at the bottom of the right panel** when an outcome is selected (phase === 2). It must be inside the returned HTML string, above the final closing `</div>`.
- [ ] **"Blocked by" list shows existing dependencies** with outcome title, status, and a remove (×) button per dependency.
- [ ] **"Blocking" list shows dependents** (read-only — no remove button, as those are not this outcome's dependencies to manage).
- [ ] **The remove button calls `removeDependency(outcomeId, dep.id)`** with the correct IDs.
- [ ] **The add dropdown (`<select>`) filters out self** (the current outcome must not appear in the dropdown options).
- [ ] **The add dropdown filters out already-added dependencies** (outcomes already in `depState.dependencies` must not appear as options).
- [ ] **The add dropdown uses `onchange="addDependency(outcomeId, this)`** — passes the select element, not the value, so the function can reset the select after use.
- [ ] **Amber "Blocked" indicator appears in the panel** when `hasActiveDeps` is true (i.e., at least one dependency has `status === 'active'`). Must use amber color scheme consistent with other warning UI in the panel.
- [ ] **`escHtml()` is used** on all user-supplied text rendered into HTML (outcome titles in the dependency lists, tooltip text).
- [ ] **`OUTCOME_DEPS[o.id]` is safely accessed** with a fallback: `OUTCOME_DEPS[o.id] || { dependencies: [], dependents: [] }` — no crash if deps not yet loaded.

**`renderSidebarOutcomes()` — Lock icon:**

- [ ] **Lock icon is rendered only when `CRITICAL_PATH_IDS.has(o.id)`** — not for all outcomes.
- [ ] **Lock icon uses `text-gray-400`** — same grey as surrounding text. Not alarming.
- [ ] **Lock icon has a `title` attribute** that reads "Blocked by: [upstream outcome name]" — sourced from `CRITICAL_PATH_TITLES[o.id]`.
- [ ] **When lock icon is shown, the deadline risk dot is not shown for the same outcome** — they are mutually exclusive in the trailing slot. Both being shown simultaneously would clutter the row.
- [ ] **`escHtml()` is used** on the `CRITICAL_PATH_TITLES[o.id]` value in the `title` attribute.

---

## What's Out of Scope

Do not flag the following as issues — they are explicitly deferred:

- **Graph visualization.** No dependency tree or Gantt chart. Text + icon is the full v1 UI.
- **Cross-project dependencies.** Not required for 4.1. Same-project dependencies only.
- **Automated dependency suggestions.** Claude may note potential blockers in triage context, but never auto-creates a dependency. Only explicit user action creates a dependency.
- **Blocking outcomes from being worked on.** The lock icon is informational only. Locked outcomes must remain fully editable.
- **Multi-level dependency chain display.** The UI shows direct dependencies and direct dependents only — not the full transitive graph.
- **Outcome-level `blocked` field.** There is no `blocked` column added to the `outcomes` table. The `outcome_dependencies` join table is the only new schema.

---

## When You're Done

Log your verdict in a new file: `test_tracker/Phase 4.1 - Outcome Dependencies.md`

Include:

- **Verdict:** `APPROVED for Phase 4.2` or `BLOCKED — see findings`
- **Date reviewed**
- Any findings that must be fixed before approval (blocking issues)
- Any findings that are non-blocking but should be noted (warnings)
- Confirmation that all checklist items were verified against the actual code

If blocked, list the specific file + line number + issue for each blocking item. The engineer should fix only those items and re-submit for re-review of the flagged items only.
