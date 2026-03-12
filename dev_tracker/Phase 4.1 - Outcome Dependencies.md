# Dev Tracker — Phase 4.1: Outcome Dependencies

**Status:** Complete
**Full brief:** `pm_log/Phase 4/Phase 4.1 - Outcome Dependencies.md`
**Engineer handoff:** `pm_log/Phase 4/Phase 4.1 - Engineer Handoff.md`
**Depends on:** Phase 4.0 complete and approved ✅

---

## Pre-Build Checklist

- [x] Read `pm_log/Phase 4/Phase 4.1 - Outcome Dependencies.md` — full phase spec
- [x] Read `src/database/outcomes.js` — understand outcome table schema, `getOutcomeById`, `getAllOutcomes`
- [x] Read `src/database/actions.js` — note `blocked_by` is TEXT, not FK
- [x] Read `src/routes/api.js` lines 1–38 — understand require/init section
- [x] Read `src/routes/api.js` lines 48–110 — understand existing outcome route ordering (static before dynamic)
- [x] Read `src/routes/api.js` lines 896–931 — `POST /api/chat`, mode === 'tools' path
- [x] Read `src/routes/api.js` lines 1606–1637 — `POST /api/today/propose`
- [x] Read `src/routes/api.js` lines 739–779 — `POST /api/inbox/triage-batch`
- [x] Read `src/services/claude.js` lines 254–337 — `sendWithTools` system prompt construction
- [x] Read `public/index.html` lines 952–973 — `renderSidebarOutcomes()`
- [x] Read `public/index.html` lines 1729–1872 — `renderRightP2()`

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-23 | claude-sonnet-4-6 | Full implementation — all 4 files modified, all checklist items complete |

### Decisions

1. **IIFE in `renderRightP2`**: The dependency section HTML is built using an IIFE (`${(() => { ... })()}`) inside the template literal to allow local variable scoping (`depState`, `hasActiveDeps`, `depsHtml`, `dependentsHtml`) without polluting the enclosing function scope. This is consistent with the existing JS style in the file and avoids the need to extract a separate render helper.

2. **`mb-3` on Available Today card**: Changed `mb-3` on the "Available Today" section container so there is visual separation between it and the new Dependencies section. Original had no bottom margin (abuts closing `</div>` directly).

3. **`fetchCriticalPath()` called before `renderSidebarOutcomes()` in `addDependency`/`removeDependency`**: The handoff spec said to call it "at the end of both functions before renderSidebarOutcomes". We call it before `fetchOutcomeDependencies` then `renderRightPanel` then `renderSidebarOutcomes`. This ensures the sidebar lock icons are always consistent with the updated state.

4. **`GET /api/outcomes/:id/dependencies` and `GET /api/outcomes/:id/dependents` route registration order**: These are registered BEFORE `GET /api/outcomes/:id`. They take the `:id/subpath` form which Express matches on specificity, so they will correctly be distinguished from the plain `:id` route. Verified in testing.

5. **Route ordering confirmed**: `GET /api/outcomes/critical-path` → registered immediately after `GET /api/outcomes/recently-closed`, well before `GET /api/outcomes/:id`. Tested: curl confirms `{"success":true,"count":0,"data":[]}` not routed as outcome lookup.

---

## Completion Checklist

### Workstream 1 — `src/database/dependencies.js` (CREATE)
- [x] File created
- [x] `initDependenciesTable()` creates `outcome_dependencies` with `IF NOT EXISTS`
- [x] Schema: `id`, `outcome_id` (FK ON DELETE CASCADE), `depends_on_outcome_id` (FK ON DELETE CASCADE), `created_at`, `UNIQUE(outcome_id, depends_on_outcome_id)`
- [x] `initDependenciesTable()` logs `✅ Dependencies table initialized`
- [x] `addDependency(outcomeId, dependsOnId)` uses `INSERT OR IGNORE`
- [x] `removeDependency(outcomeId, dependsOnId)` removes the pair
- [x] `getDependencies(outcomeId)` returns upstream blockers (id, title, status)
- [x] `getDependents(outcomeId)` returns downstream blocked outcomes (id, title, status)
- [x] `hasCycle(outcomeId, dependsOnId)` uses BFS with visited Set; returns true if cycle detected
- [x] `getCriticalPath()` returns active outcomes blocked by active upstream deps
- [x] `getCriticalPath()` each row includes `dependency_depth` and `blocked_by_title`
- [x] All functions synchronous (no async/await)
- [x] `module.exports` exports all 7 functions

### Workstream 2 — API Routes (`src/routes/api.js`)
- [x] `const dependenciesDb = require('../database/dependencies')` in require block
- [x] `dependenciesDb.initDependenciesTable()` called in startup init section
- [x] `GET /api/outcomes/critical-path` registered BEFORE `GET /api/outcomes/:id`
- [x] `GET /api/outcomes/critical-path` returns `{ success: true, count: N, data: [...] }`
- [x] `GET /api/outcomes/:id/dependencies` returns upstream blockers
- [x] `GET /api/outcomes/:id/dependents` returns downstream blocked outcomes
- [x] `POST /api/outcomes/:id/dependencies` validates `depends_on_outcome_id` (400 if missing)
- [x] `POST /api/outcomes/:id/dependencies` rejects self-dependency (400)
- [x] `POST /api/outcomes/:id/dependencies` calls `hasCycle` before `addDependency`; returns 400 on cycle
- [x] `POST /api/outcomes/:id/dependencies` returns updated dependency list on success
- [x] `DELETE /api/outcomes/:id/dependencies/:depId` removes the dependency
- [x] All 5 routes use try/catch + `next(err)`
- [x] Claude injection 1 (AI Breakdown): `_dependencyContext` set on `enrichedContext` when outcome has active deps; inside `try/catch`; inside `if (mode === 'tools')` only
- [x] Claude injection 2 (Today Propose): `getCriticalPath()` called; `blockedOutcomeIds` passed to `proposeTodayPlan`; inside try/catch with fallback `[]`
- [x] Claude injection 3 (Inbox Triage): active outcome titles appended to `contextSnapshot`; inside try/catch

### Workstream 3 — `src/services/claude.js`
- [x] `sendWithTools` injects `_dependencyContext` into system prompt
- [x] `_dependencyContext` injection is additive (does NOT replace `_patternContext`)
- [x] `proposeTodayPlan` signature updated to accept `blockedOutcomeIds = []` as 4th param
- [x] Blocked outcome IDs mentioned in prompt (conditional — only when `blockedOutcomeIds.length > 0`)

### Workstream 4 — Frontend (`public/index.html`)
- [x] `OUTCOME_DEPS` state variable declared (`let OUTCOME_DEPS = {}`)
- [x] `CRITICAL_PATH_IDS` declared as `new Set()`
- [x] `CRITICAL_PATH_TITLES` declared as `{}`
- [x] `fetchOutcomeDependencies(id)` calls both endpoints in parallel; stores in `OUTCOME_DEPS[id]`
- [x] `fetchCriticalPath()` populates `CRITICAL_PATH_IDS` and `CRITICAL_PATH_TITLES`
- [x] `fetchOutcomeDependencies` called from `selectOutcome(id)` after `fetchOutcomeStats`
- [x] `fetchCriticalPath()` called from `loadData()`
- [x] `window._ALL_ACTIVE_OUTCOMES_FOR_DEPS` populated in `loadData()` after OUTCOMES loaded
- [x] Dependencies section added to `renderRightP2()` — "Blocked by" list + "Blocking" list + add dropdown
- [x] "Blocked by" list shows remove (×) button per dependency
- [x] Add dropdown filters out self and already-added deps
- [x] Amber "Blocked" banner appears when `hasActiveDeps` is true
- [x] `addDependency(outcomeId, selectEl)` function exists; handles cycle error toast; refreshes on success
- [x] `removeDependency(outcomeId, dependsOnId)` function exists; refreshes on success
- [x] Both `addDependency` and `removeDependency` call `fetchCriticalPath()` + `renderSidebarOutcomes()`
- [x] Lock icon in `renderSidebarOutcomes()` — shown only when `CRITICAL_PATH_IDS.has(o.id)`
- [x] Lock icon uses gray color and has `title` attribute with upstream outcome name
- [x] Lock icon and risk dot are mutually exclusive in the trailing slot
- [x] `escHtml()` used on all user-supplied text in dependency HTML

---

## Blockers

None.
