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
