# Phase 4.1 — Engineer Handoff: Outcome Dependencies

## Agent Prompt

You are building Phase 4.1 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase adds outcome-level dependency tracking — a lightweight graph model so Claude and the user can see which outcomes are blocking others and always prioritize the right work first. Read this entire handoff before writing a single line of code.

---

## Pre-Build Checklist

Read these files in full before touching any code:

- [ ] `pm_log/Phase 4/Phase 4.1 - Outcome Dependencies.md` — full phase spec
- [ ] `src/database/outcomes.js` — understand outcome table schema, `getOutcomeById`, `getAllOutcomes` signatures
- [ ] `src/database/actions.js` — note that `blocked_by` is a `TEXT` column, not a FK; the outcome dependency model uses a join table instead
- [ ] `src/routes/api.js` lines 1–38 — understand the require/init section; you must add your require and init call here
- [ ] `src/routes/api.js` lines 48–110 — understand how existing outcome routes are ordered (static routes like `/outcomes/archived` come BEFORE the dynamic `/outcomes/:id` — follow this same pattern for `GET /api/outcomes/critical-path`)
- [ ] `src/routes/api.js` lines 896–931 — the `POST /api/chat` route where AI Breakdown lives; understand `mode === 'tools'` path and `enrichedContext`
- [ ] `src/routes/api.js` lines 1606–1637 — the `POST /api/today/propose` route; understand the `outcomesWithActions` array built before calling `proposeTodayPlan`
- [ ] `src/routes/api.js` lines 739–779 — the `POST /api/inbox/triage-batch` route; understand how `contextSnapshot` is assembled before calling `batchTriageInbox`
- [ ] `src/services/claude.js` lines 254–337 — `sendWithTools` system prompt construction; understand how `context._patternContext` is injected (line 308); you will inject dependency context the same way
- [ ] `public/index.html` lines 952–973 — `renderSidebarOutcomes()` function; you will add lock icon logic here
- [ ] `public/index.html` lines 1729–1872 — `renderRightP2()` function; you will add the Dependencies section at the bottom, before the closing `</div>`

---

## Known Codebase State

- **DB:** `better-sqlite3` (synchronous). All DB modules use sync calls — no async/await anywhere in DB layer. New tables added via `initX()` functions in `src/database/`. Call `initX()` from `src/routes/api.js` at startup (lines 26–37).
- **Pattern:** DB modules: sync `db.prepare().run()`, `db.prepare().all()`, `db.prepare().get()`. Never use `async`/`await` in DB modules.
- **API responses:** `{ success: true, data: ... }` or `{ success: true, count: N, data: [...] }`. Errors: `res.status(4xx).json({ success: false, error: '...' })`.
- **Frontend XSS helper:** Use `escHtml()` (not `escapeHtml`) when interpolating user data into HTML strings.
- **Model ID:** `claude-sonnet-4-6`
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, `src/integrations/`, `src/utils/crypto.js`, `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`

---

## Workstream 1 — DB: `src/database/dependencies.js` (CREATE)

Create a new file `src/database/dependencies.js`. This module owns the `outcome_dependencies` join table.

```js
const db = require('./index');

function initDependenciesTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS outcome_dependencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
            depends_on_outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(outcome_id, depends_on_outcome_id)
        )
    `);
    console.log('✅ Dependencies table initialized');
}

// Add a dependency: outcome_id depends on depends_on_outcome_id
// (outcome_id cannot proceed until depends_on_outcome_id is done)
function addDependency(outcomeId, dependsOnId) {
    db.prepare(`
        INSERT OR IGNORE INTO outcome_dependencies (outcome_id, depends_on_outcome_id)
        VALUES (?, ?)
    `).run(outcomeId, dependsOnId);
}

// Remove a dependency by (outcome_id, depends_on_outcome_id) pair
function removeDependency(outcomeId, dependsOnId) {
    db.prepare(`
        DELETE FROM outcome_dependencies
        WHERE outcome_id = ? AND depends_on_outcome_id = ?
    `).run(outcomeId, dependsOnId);
}

// What does this outcome depend on? (outcomes it is waiting for)
// Returns rows with id, title, status of the upstream outcomes
function getDependencies(outcomeId) {
    return db.prepare(`
        SELECT o.id, o.title, o.status
        FROM outcome_dependencies od
        JOIN outcomes o ON o.id = od.depends_on_outcome_id
        WHERE od.outcome_id = ?
        ORDER BY o.title ASC
    `).all(outcomeId);
}

// What outcomes depend on this one? (outcomes waiting on this one)
// Returns rows with id, title, status of the downstream outcomes
function getDependents(outcomeId) {
    return db.prepare(`
        SELECT o.id, o.title, o.status
        FROM outcome_dependencies od
        JOIN outcomes o ON o.id = od.outcome_id
        WHERE od.depends_on_outcome_id = ?
        ORDER BY o.title ASC
    `).all(outcomeId);
}

// Cycle detection: returns true if adding (outcomeId -> dependsOnId) would create a cycle.
// Uses BFS traversal: starting from dependsOnId, walks all of its dependencies.
// If outcomeId appears anywhere in that traversal, adding this edge would create a cycle.
function hasCycle(outcomeId, dependsOnId) {
    const visited = new Set();
    const queue = [dependsOnId];

    while (queue.length > 0) {
        const current = queue.shift();
        if (current === outcomeId) return true;
        if (visited.has(current)) continue;
        visited.add(current);

        const upstreams = db.prepare(`
            SELECT depends_on_outcome_id FROM outcome_dependencies WHERE outcome_id = ?
        `).all(current);

        for (const row of upstreams) {
            if (!visited.has(row.depends_on_outcome_id)) {
                queue.push(row.depends_on_outcome_id);
            }
        }
    }

    return false;
}

// Returns all outcomes that have at least one active (non-archived) upstream dependency.
// These are outcomes blocked by work that is not yet done.
// Sorted by dependency depth (outcomes with the most upstream blockers first).
function getCriticalPath() {
    // Find all outcome_id values that depend on at least one active outcome
    const blockedRows = db.prepare(`
        SELECT DISTINCT od.outcome_id
        FROM outcome_dependencies od
        JOIN outcomes upstream ON upstream.id = od.depends_on_outcome_id
        WHERE upstream.status = 'active'
    `).all();

    if (blockedRows.length === 0) return [];

    const blockedIds = blockedRows.map(r => r.outcome_id);

    // Fetch outcome details and compute depth for each
    const result = [];
    for (const id of blockedIds) {
        const outcome = db.prepare(`
            SELECT o.id, o.title, o.status, o.deadline, o.priority
            FROM outcomes o
            WHERE o.id = ? AND o.status = 'active'
        `).get(id);

        if (!outcome) continue;

        // Depth = count of distinct upstream blockers (active only)
        const depthRow = db.prepare(`
            SELECT COUNT(*) as depth
            FROM outcome_dependencies od
            JOIN outcomes upstream ON upstream.id = od.depends_on_outcome_id
            WHERE od.outcome_id = ? AND upstream.status = 'active'
        `).get(id);

        // Fetch the first (alphabetically) active upstream blocker title for tooltip use
        const firstBlocker = db.prepare(`
            SELECT upstream.title
            FROM outcome_dependencies od
            JOIN outcomes upstream ON upstream.id = od.depends_on_outcome_id
            WHERE od.outcome_id = ? AND upstream.status = 'active'
            ORDER BY upstream.title ASC
            LIMIT 1
        `).get(id);

        result.push({
            ...outcome,
            dependency_depth: depthRow.depth,
            blocked_by_title: firstBlocker ? firstBlocker.title : null,
        });
    }

    // Sort by depth descending (most-blocked outcomes first)
    result.sort((a, b) => b.dependency_depth - a.dependency_depth);
    return result;
}

module.exports = {
    initDependenciesTable,
    addDependency,
    removeDependency,
    getDependencies,
    getDependents,
    hasCycle,
    getCriticalPath,
};
```

---

## Workstream 2 — API Routes (`src/routes/api.js`)

### 2A — Add require and init at startup

At the top of `api.js`, in the require block (after the existing requires, around line 21):

```js
const dependenciesDb = require('../database/dependencies');
```

In the init section (after line 37, after `patternsDb.initPatternTables()`):

```js
dependenciesDb.initDependenciesTable();
```

### 2B — Add dependency routes

**CRITICAL ORDERING RULE:** `GET /api/outcomes/critical-path` must be registered BEFORE `GET /api/outcomes/:id`. The existing codebase already follows this pattern — `GET /api/outcomes/archived` and `GET /api/outcomes/stats/today` are both registered before `GET /api/outcomes/:id`. Insert the critical-path route in that same static-before-dynamic section (after line 91, before the `GET /api/outcomes/:id` route at line 97).

Insert this block after `GET /api/outcomes/stats/today` and before `GET /api/outcomes/:id`:

```js
// ─── OUTCOME DEPENDENCIES (Phase 4.1) ─────────────────────────────────────

/**
 * GET /api/outcomes/critical-path
 * Returns all outcomes with unresolved active upstream dependencies, sorted by depth.
 * MUST be registered before GET /api/outcomes/:id to avoid route capture.
 */
router.get('/outcomes/critical-path', (req, res, next) => {
    try {
        const path = dependenciesDb.getCriticalPath();
        res.json({ success: true, count: path.length, data: path });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/outcomes/:id/dependencies
 * Returns outcomes that this outcome depends on (upstream blockers).
 */
router.get('/outcomes/:id/dependencies', (req, res, next) => {
    try {
        const outcomeId = parseInt(req.params.id);
        const deps = dependenciesDb.getDependencies(outcomeId);
        res.json({ success: true, count: deps.length, data: deps });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/outcomes/:id/dependents
 * Returns outcomes that depend on this one (downstream — this one is blocking them).
 */
router.get('/outcomes/:id/dependents', (req, res, next) => {
    try {
        const outcomeId = parseInt(req.params.id);
        const dependents = dependenciesDb.getDependents(outcomeId);
        res.json({ success: true, count: dependents.length, data: dependents });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/outcomes/:id/dependencies
 * Body: { depends_on_outcome_id }
 * Adds a dependency: this outcome depends on depends_on_outcome_id.
 * Returns 400 if the dependency would create a cycle.
 */
router.post('/outcomes/:id/dependencies', (req, res, next) => {
    try {
        const outcomeId = parseInt(req.params.id);
        const { depends_on_outcome_id } = req.body;

        if (!depends_on_outcome_id) {
            return res.status(400).json({ success: false, error: 'depends_on_outcome_id is required' });
        }

        const dependsOnId = parseInt(depends_on_outcome_id);

        if (outcomeId === dependsOnId) {
            return res.status(400).json({ success: false, error: 'An outcome cannot depend on itself' });
        }

        if (dependenciesDb.hasCycle(outcomeId, dependsOnId)) {
            return res.status(400).json({ success: false, error: 'This dependency would create a circular chain' });
        }

        dependenciesDb.addDependency(outcomeId, dependsOnId);
        const deps = dependenciesDb.getDependencies(outcomeId);
        res.json({ success: true, data: deps });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/outcomes/:id/dependencies/:depId
 * Removes the dependency: this outcome no longer depends on depId.
 */
router.delete('/outcomes/:id/dependencies/:depId', (req, res, next) => {
    try {
        const outcomeId = parseInt(req.params.id);
        const depId     = parseInt(req.params.depId);
        dependenciesDb.removeDependency(outcomeId, depId);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});
```

### 2C — Claude injection point 1: AI Breakdown (`POST /api/chat`, mode === 'tools')

In the `POST /api/chat` route (around line 903), find the `if (mode === 'tools')` block. Currently it builds `enrichedContext` and injects `_patternContext`. Add a dependency injection step immediately after the pattern injection `try/catch` block, before calling `claudeService.sendWithTools`:

```js
// Phase 4.1 — inject dependency context into AI Breakdown
// context.selected_outcome.id is provided by the frontend when breaking down an outcome
try {
    const outcomeId = context?.selected_outcome?.id;
    if (outcomeId) {
        const deps = dependenciesDb.getDependencies(outcomeId);
        const activeDeps = deps.filter(d => d.status === 'active');
        if (activeDeps.length > 0) {
            const depNames = activeDeps.map(d => `"${d.title}"`).join(', ');
            enrichedContext._dependencyContext =
                `\n\nDependency notice: This outcome depends on ${depNames}, which ${activeDeps.length === 1 ? 'is' : 'are'} still active and in progress. ` +
                `Only generate actions for what CAN be done while waiting. ` +
                `Include a "Follow up on ${activeDeps[0].title}" action as one of the generated actions.`;
        }
    }
} catch (_) {}
```

Then in `src/services/claude.js`, inside `sendWithTools`, add injection of `_dependencyContext` immediately after the `_patternContext` injection (after line 310):

```js
// Phase 4.1 — inject dependency context if provided
if (context._dependencyContext) {
    systemPrompt += context._dependencyContext;
}
```

### 2D — Claude injection point 2: Today Propose (`POST /api/today/propose`)

In the `POST /api/today/propose` route (around line 1606), after the `outcomesWithActions` array is built (after line 1630), add a critical path check before calling `proposeTodayPlan`:

```js
// Phase 4.1 — fetch critical path and mark blocked outcome IDs
let blockedOutcomeIds = [];
try {
    const criticalPath = dependenciesDb.getCriticalPath();
    blockedOutcomeIds = criticalPath.map(o => o.id);
} catch (_) {}
```

Then pass `blockedOutcomeIds` into the call. Update the call to `proposeTodayPlan` to include it:

```js
const proposal = await claudeService.proposeTodayPlan(windows, outcomesWithActions, contextSnapshot, blockedOutcomeIds);
```

In `src/services/claude.js`, update the `proposeTodayPlan` function signature and prompt to accept and use `blockedOutcomeIds`:

```js
async function proposeTodayPlan(windows, outcomes, contextSnapshot, blockedOutcomeIds = []) {
```

Inside the prompt string in `proposeTodayPlan`, after the `outcomeStr` block, add:

```js
const blockedNote = blockedOutcomeIds.length > 0
    ? `\n\nBlocked outcomes (do NOT commit to today's plan — they have unresolved upstream dependencies): outcome IDs [${blockedOutcomeIds.join(', ')}]\n`
    : '';
```

And insert `${blockedNote}` into the prompt before the `Instructions:` line.

### 2E — Claude injection point 3: Inbox Triage Batch (`POST /api/inbox/triage-batch`)

In the `POST /api/inbox/triage-batch` route (around line 767), after the `contextSnapshot` is assembled with patterns (after the pattern `try/catch` block, before the `batchTriageInbox` call), add a best-effort note about existing active outcomes that might be upstream blockers:

```js
// Phase 4.1 — best-effort: note active outcome titles for semantic blocker suggestion
try {
    const activeOutcomes = outcomesDb.getAllOutcomes({ status: 'active' });
    if (activeOutcomes.length > 0) {
        const outcomeTitles = activeOutcomes.map(o => `"${o.title}"`).join(', ');
        contextSnapshot = (contextSnapshot || '') +
            `\n\nExisting active outcomes: ${outcomeTitles}. ` +
            `If a new outcome from triage appears to depend on one of these being completed first, ` +
            `note it in the cluster's description field.`;
    }
} catch (_) {}
```

---

## Workstream 3 — Frontend: Dependencies section in outcome detail (`public/index.html`)

### 3A — Add `OUTCOME_DEPS` state variable

Near the top of the script section, alongside the other state variables (where `OUTCOMES`, `selectedId`, etc. are declared), add:

```js
let OUTCOME_DEPS = {}  // { [outcomeId]: { dependencies: [], dependents: [] } }
```

### 3B — Add `fetchOutcomeDependencies(id)` function

Add this async function near the other data-fetching helpers (near `fetchOutcomeStats`):

```js
async function fetchOutcomeDependencies(id) {
    try {
        const [depsRes, dependentsRes] = await Promise.all([
            fetch(`/api/outcomes/${id}/dependencies`),
            fetch(`/api/outcomes/${id}/dependents`),
        ]);
        const depsData      = await depsRes.json();
        const dependentsData = await dependentsRes.json();
        OUTCOME_DEPS[id] = {
            dependencies: depsData.data || [],
            dependents:   dependentsData.data || [],
        };
    } catch (_) {
        OUTCOME_DEPS[id] = { dependencies: [], dependents: [] };
    }
}
```

### 3C — Call `fetchOutcomeDependencies` when an outcome is selected

In the `selectOutcome(id)` function (around line 832), after `await fetchOutcomeStats(id)`, add:

```js
await fetchOutcomeDependencies(id);
renderRightPanel();
```

### 3D — Add dependency section to `renderRightP2()`

In `renderRightP2()` (around line 1784), at the very bottom of the returned HTML string, just before the final `</div>` closing tag, add the Dependencies section:

```js
// Dependency section — fetch current state or fall back to empty
const depState = OUTCOME_DEPS[o.id] || { dependencies: [], dependents: [] };
const hasActiveDeps = depState.dependencies.filter(d => d.status === 'active').length > 0;

const depsHtml = depState.dependencies.length === 0
    ? `<div class="text-gray-400" style="font-size:10px">None</div>`
    : depState.dependencies.map(d => `
        <div class="flex items-center justify-between py-1">
            <div class="flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full shrink-0 ${d.status === 'active' ? 'bg-amber-400' : 'bg-emerald-400'}"></span>
                <span class="text-gray-700" style="font-size:11px">${escHtml(d.title)}</span>
                <span class="text-gray-400" style="font-size:10px">(${d.status})</span>
            </div>
            <button onclick="removeDependency(${o.id}, ${d.id})" class="text-gray-300 hover:text-red-400 transition-colors ml-2" style="font-size:11px;line-height:1" title="Remove dependency">×</button>
        </div>`
    ).join('');

const dependentsHtml = depState.dependents.length === 0
    ? `<div class="text-gray-400" style="font-size:10px">None</div>`
    : depState.dependents.map(d => `
        <div class="flex items-center gap-1.5 py-1">
            <span class="w-1.5 h-1.5 rounded-full shrink-0 ${d.status === 'active' ? 'bg-blue-400' : 'bg-gray-300'}"></span>
            <span class="text-gray-600" style="font-size:11px">${escHtml(d.title)}</span>
            <span class="text-gray-400" style="font-size:10px">(${d.status})</span>
        </div>`
    ).join('');
```

Then in the returned HTML string, at the bottom before the closing `</div>`:

```js
${hasActiveDeps ? `
    <div class="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-100 rounded-lg mb-3">
        <svg class="w-3 h-3 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        <span class="text-amber-700 font-medium" style="font-size:10px">Blocked — upstream work in progress</span>
    </div>` : ''}

<div class="text-gray-400 font-semibold uppercase tracking-wider mb-2" style="font-size:10px">Dependencies</div>

<div class="mb-2">
    <div class="text-gray-500 mb-1" style="font-size:10px">Blocked by</div>
    ${depsHtml}
</div>

<div class="mb-3">
    <div class="text-gray-500 mb-1" style="font-size:10px">Blocking</div>
    ${dependentsHtml}
</div>

<div class="mt-2">
    <div class="text-gray-500 mb-1" style="font-size:10px">Add dependency</div>
    <select id="dep-add-select-${o.id}" onchange="addDependency(${o.id}, this)" class="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white" style="font-size:11px">
        <option value="">Select an outcome to block on...</option>
        ${(window._ALL_ACTIVE_OUTCOMES_FOR_DEPS || [])
            .filter(ao => ao.id !== o.id && !depState.dependencies.find(d => d.id === ao.id))
            .map(ao => `<option value="${ao.id}">${escHtml(ao.title)}</option>`)
            .join('')}
    </select>
</div>
```

### 3E — Add `addDependency` and `removeDependency` JS functions

```js
async function addDependency(outcomeId, selectEl) {
    const dependsOnId = parseInt(selectEl.value);
    if (!dependsOnId) return;
    try {
        const res = await fetch(`/api/outcomes/${outcomeId}/dependencies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ depends_on_outcome_id: dependsOnId }),
        });
        const data = await res.json();
        if (!res.ok) {
            showToast(data.error || 'Could not add dependency', 'warning');
            selectEl.value = '';
            return;
        }
        await fetchOutcomeDependencies(outcomeId);
        renderRightPanel();
        renderSidebarOutcomes(); // re-render in case lock icon state changed
    } catch (_) {
        showToast('Failed to add dependency', 'warning');
    }
}

async function removeDependency(outcomeId, dependsOnId) {
    try {
        await fetch(`/api/outcomes/${outcomeId}/dependencies/${dependsOnId}`, { method: 'DELETE' });
        await fetchOutcomeDependencies(outcomeId);
        renderRightPanel();
        renderSidebarOutcomes();
    } catch (_) {
        showToast('Failed to remove dependency', 'warning');
    }
}
```

### 3F — Populate the add-dependency dropdown data

The dropdown filter uses `window._ALL_ACTIVE_OUTCOMES_FOR_DEPS`. Populate it in `loadData()` (or wherever `OUTCOMES` is loaded) after the OUTCOMES array is set:

```js
window._ALL_ACTIVE_OUTCOMES_FOR_DEPS = OUTCOMES.map(o => ({ id: o.id, title: o.title }));
```

---

## Workstream 4 — Frontend: Lock icon in sidebar (`public/index.html`)

### 4A — Add `CRITICAL_PATH_IDS` state variable

```js
let CRITICAL_PATH_IDS = new Set()     // outcome IDs that are on the critical path (blocked)
let CRITICAL_PATH_TITLES = {}          // { [outcomeId]: blockedByTitle } for tooltip
```

### 4B — Add `fetchCriticalPath()` function

```js
async function fetchCriticalPath() {
    try {
        const res  = await fetch('/api/outcomes/critical-path');
        const data = await res.json();
        CRITICAL_PATH_IDS = new Set((data.data || []).map(o => o.id));
        CRITICAL_PATH_TITLES = {};
        (data.data || []).forEach(o => {
            CRITICAL_PATH_TITLES[o.id] = o.blocked_by_title || 'upstream outcome';
        });
    } catch (_) {
        CRITICAL_PATH_IDS = new Set();
        CRITICAL_PATH_TITLES = {};
    }
}
```

### 4C — Call `fetchCriticalPath()` on load and after dependency changes

In the main `loadData()` function (wherever `renderSidebarOutcomes()` is called after data loads), add:

```js
await fetchCriticalPath();
```

Also call `fetchCriticalPath()` at the end of both `addDependency` and `removeDependency` before `renderSidebarOutcomes()`.

### 4D — Add lock icon to `renderSidebarOutcomes()`

In `renderSidebarOutcomes()` (line 952), inside the `OUTCOMES.map(o => {...})` callback, the current last line of each row renders the risk dot. Add the lock icon in that same position, rendered only when the outcome is in `CRITICAL_PATH_IDS`:

Replace the existing trailing risk dot line (the line with `${risk === 'high' ? ...}`) with:

```js
${CRITICAL_PATH_IDS.has(o.id)
    ? `<span class="text-gray-400 shrink-0" style="font-size:10px" title="Blocked by: ${escHtml(CRITICAL_PATH_TITLES[o.id] || 'upstream outcome')}">🔒</span>`
    : risk === 'high'   ? '<div class="w-1.5 h-1.5 bg-red-400 rounded-full shrink-0"></div>'
    : risk === 'medium' ? '<div class="w-1.5 h-1.5 bg-amber-400 rounded-full shrink-0"></div>'
    : ''}
```

The lock icon uses `text-gray-400` — intentionally subtle, not alarming. The `title` attribute gives the tooltip on hover.

---

## Workstream 5 — Claude Injection Summary

All three injection points are in `api.js` and `claude.js`. Here is a consolidated view of what touches what:

| Injection Point | File | What Changes |
|---|---|---|
| AI Breakdown (`POST /api/chat`, `mode === 'tools'`) | `src/routes/api.js` | Add `_dependencyContext` to `enrichedContext` before `sendWithTools` call |
| AI Breakdown system prompt | `src/services/claude.js` | Inject `context._dependencyContext` into system prompt inside `sendWithTools` |
| Today Propose (`POST /api/today/propose`) | `src/routes/api.js` | Call `getCriticalPath()`, pass `blockedOutcomeIds` to `proposeTodayPlan` |
| Today Propose prompt | `src/services/claude.js` | Update `proposeTodayPlan` signature + add blocked outcome note to prompt |
| Inbox Triage Batch (`POST /api/inbox/triage-batch`) | `src/routes/api.js` | Append active outcome titles to `contextSnapshot` before `batchTriageInbox` |

---

## Key Constraints

- **Never auto-create dependencies.** The only way a dependency is created is via an explicit `POST /api/outcomes/:id/dependencies` call triggered by a user action in the UI.
- **Cycle detection is hard-required.** `hasCycle` must be called before every `addDependency`. A cycle returns HTTP 400 — never silently ignore it or insert anyway.
- **Self-dependency rejected.** An outcome cannot depend on itself. Check `outcomeId === dependsOnId` before the cycle check and return 400.
- **Lock icon is informational only.** It does NOT prevent editing, working on, or completing a blocked outcome. Never gate any action on lock status.
- **Route ordering.** `GET /api/outcomes/critical-path` must be registered before `GET /api/outcomes/:id`. If you register it after, Express will match "critical-path" as `:id` and call `getOutcomeById('critical-path')` which returns null. The existing codebase already demonstrates this pattern with `/outcomes/archived` and `/outcomes/stats/today`.
- **DB sync.** All functions in `dependencies.js` must be synchronous. No `async`/`await`. No Promises.
- **`better-sqlite3` UNIQUE constraint.** `addDependency` uses `INSERT OR IGNORE` — duplicate inserts are silently ignored rather than throwing. This is intentional.
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, `src/integrations/`, `src/utils/crypto.js`, `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`

---

## Files You Will Touch

| File | Change |
|---|---|
| `src/database/dependencies.js` | **CREATE** — full dependency table + CRUD + cycle check + critical path |
| `src/routes/api.js` | Add `require` + `initDependenciesTable()` call; add 5 dependency routes; add 3 Claude injection points |
| `src/services/claude.js` | Inject `_dependencyContext` in `sendWithTools`; update `proposeTodayPlan` signature + prompt |
| `public/index.html` | `OUTCOME_DEPS` state; `fetchOutcomeDependencies`; `fetchCriticalPath`; `CRITICAL_PATH_IDS`; `addDependency`/`removeDependency` functions; Dependencies section in `renderRightP2`; lock icon in `renderSidebarOutcomes` |

Four files total. No new npm packages required.

---

## When You're Done

- [ ] Server starts without errors; `✅ Dependencies table initialized` appears in console
- [ ] `POST /api/outcomes/:id/dependencies` adds a dependency and returns 400 on cycle
- [ ] `GET /api/outcomes/critical-path` returns blocked outcomes correctly
- [ ] Outcome detail right panel shows Dependencies section with add/remove working
- [ ] Removing a dependency re-renders the section with the dependency gone
- [ ] Blocked outcomes show lock icon in sidebar with correct tooltip text
- [ ] Amber "Blocked" indicator appears in right panel header when outcome has active upstream deps
- [ ] AI Breakdown prompt includes dependency notice when outcome is blocked
- [ ] Today propose excludes blocked outcome IDs from committed plan context
- [ ] Inbox triage context includes active outcome names for semantic suggestion
- [ ] No circular dependency can be created (test: A→B, B→A should 400 on second POST)

Log completion in `dev_tracker/Phase 4.1 - Outcome Dependencies.md`. Flag for code review.
