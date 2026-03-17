const db = require('./index');

function initActionsTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            outcome_id INTEGER REFERENCES outcomes(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            time_estimate INTEGER,
            energy_type TEXT DEFAULT 'light',
            action_type TEXT DEFAULT 'standard',
            done INTEGER DEFAULT 0,
            done_at TEXT,
            blocked INTEGER DEFAULT 0,
            blocked_by TEXT,
            position INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
    // Phase 3.3 — add started_at and ended_at for time tracking
    const actionCols = db.pragma('table_info(actions)').map(c => c.name);
    if (!actionCols.includes('started_at')) {
        db.exec('ALTER TABLE actions ADD COLUMN started_at TEXT');
    }
    if (!actionCols.includes('ended_at')) {
        db.exec('ALTER TABLE actions ADD COLUMN ended_at TEXT');
    }
    if (!actionCols.includes('action_type')) {
        db.exec("ALTER TABLE actions ADD COLUMN action_type TEXT DEFAULT 'standard'");
    }
    if (!actionCols.includes('snoozed_until')) {
        db.exec("ALTER TABLE actions ADD COLUMN snoozed_until TEXT");
        console.log('✅ actions.snoozed_until column added');
    }

    console.log('✅ Actions table initialized');
}

function getActionsByOutcome(outcomeId) {
    return db.prepare(`
        SELECT * FROM actions
        WHERE outcome_id = ?
        ORDER BY position ASC, created_at ASC
    `).all(outcomeId);
}

function getActionById(id) {
    return db.prepare('SELECT * FROM actions WHERE id = ?').get(id) || null;
}

function createAction(outcomeId, data) {
    const { title, time_estimate, energy_type = 'light', action_type = 'standard', blocked = 0, blocked_by, position } = data;
    if (!title || !title.trim()) throw new Error('title is required');

    // Auto-assign position after current max for this outcome
    const maxRow = db.prepare('SELECT MAX(position) as m FROM actions WHERE outcome_id = ?').get(outcomeId || null);
    const pos = (position !== undefined && position !== null) ? position : ((maxRow?.m ?? -1) + 1);

    const result = db.prepare(`
        INSERT INTO actions (outcome_id, title, time_estimate, energy_type, action_type, blocked, blocked_by, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        outcomeId || null,
        title.trim(),
        time_estimate || null,
        energy_type,
        action_type || 'standard',
        blocked ? 1 : 0,
        blocked_by || null,
        pos
    );

    return getActionById(result.lastInsertRowid);
}

function getUnassignedActions() {
    return db.prepare(`
        SELECT * FROM actions
        WHERE outcome_id IS NULL
          AND done = 0
          AND (snoozed_until IS NULL OR snoozed_until <= datetime('now'))
        ORDER BY
          CASE WHEN action_type = 'tiny' THEN 0 ELSE 1 END,
          created_at DESC
    `).all();
}

function updateAction(id, updates) {
    const action = getActionById(id);
    if (!action) throw new Error(`Action ${id} not found`);

    const allowed = ['title', 'time_estimate', 'energy_type', 'action_type', 'done', 'blocked', 'blocked_by', 'position', 'outcome_id'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (fields.length === 0) throw new Error('No valid fields to update');

    const values = fields.map(f => {
        if (f === 'done' || f === 'blocked') return updates[f] ? 1 : 0;
        return updates[f] !== undefined ? updates[f] : null;
    });

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    // If done is being set to 1, stamp done_at; if being cleared, null it out
    const doneAt = 'done' in updates
        ? (updates.done ? `, done_at = datetime('now')` : `, done_at = NULL`)
        : '';
    db.prepare(`UPDATE actions SET ${setClause}${doneAt}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
    return getActionById(id);
}

function deleteAction(id) {
    const action = getActionById(id);
    if (!action) return false;
    db.prepare('DELETE FROM actions WHERE id = ?').run(id);
    return true;
}

function toggleAction(id) {
    const action = getActionById(id);
    if (!action) throw new Error(`Action ${id} not found`);
    const newDone = action.done ? 0 : 1;
    db.prepare(`
        UPDATE actions
        SET done = ?, done_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END,
            updated_at = datetime('now')
        WHERE id = ?
    `).run(newDone, newDone, id);
    return getActionById(id);
}

function reorderAction(id, position) {
    db.prepare(`UPDATE actions SET position = ?, updated_at = datetime('now') WHERE id = ?`).run(position, id);
    return getActionById(id);
}

function snoozeAction(id) {
    db.prepare(`
        UPDATE actions SET snoozed_until = datetime('now', '+1 day') WHERE id = ?
    `).run(id);
    return db.prepare('SELECT * FROM actions WHERE id = ?').get(id);
}

function getAllOpenActions() {
    return db.prepare(`
        SELECT a.*, o.title AS outcome_title, o.project_id AS outcome_project_id
        FROM actions a
        LEFT JOIN outcomes o ON a.outcome_id = o.id
        WHERE a.done = 0
        ORDER BY a.outcome_id ASC, a.position ASC, a.created_at ASC
    `).all();
}

function getRecentlyCompletedActions(days = 7, limit = 20) {
    return db.prepare(`
        SELECT a.*, o.title AS outcome_title, o.project_id AS outcome_project_id
        FROM actions a
        LEFT JOIN outcomes o ON a.outcome_id = o.id
        WHERE a.done = 1
          AND a.done_at >= datetime('now', ? || ' days')
        ORDER BY a.done_at DESC
        LIMIT ?
    `).all(`-${days}`, limit);
}

module.exports = {
    initActionsTable,
    getActionsByOutcome,
    getActionById,
    createAction,
    getUnassignedActions,
    updateAction,
    deleteAction,
    toggleAction,
    reorderAction,
    snoozeAction,
    getAllOpenActions,
    getRecentlyCompletedActions,
};
