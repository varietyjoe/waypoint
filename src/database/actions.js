const db = require('./index');

function initActionsTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            outcome_id INTEGER REFERENCES outcomes(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            time_estimate INTEGER,
            energy_type TEXT DEFAULT 'light',
            done INTEGER DEFAULT 0,
            done_at TEXT,
            blocked INTEGER DEFAULT 0,
            blocked_by TEXT,
            position INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
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
    const { title, time_estimate, energy_type = 'light', blocked = 0, blocked_by, position } = data;
    if (!title || !title.trim()) throw new Error('title is required');

    // Auto-assign position after current max for this outcome
    const maxRow = db.prepare('SELECT MAX(position) as m FROM actions WHERE outcome_id = ?').get(outcomeId || null);
    const pos = (position !== undefined && position !== null) ? position : ((maxRow?.m ?? -1) + 1);

    const result = db.prepare(`
        INSERT INTO actions (outcome_id, title, time_estimate, energy_type, blocked, blocked_by, position)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        outcomeId || null,
        title.trim(),
        time_estimate || null,
        energy_type,
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
        ORDER BY created_at DESC
    `).all();
}

function updateAction(id, updates) {
    const action = getActionById(id);
    if (!action) throw new Error(`Action ${id} not found`);

    const allowed = ['title', 'time_estimate', 'energy_type', 'done', 'blocked', 'blocked_by', 'position', 'outcome_id'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (fields.length === 0) throw new Error('No valid fields to update');

    const values = fields.map(f => {
        if (f === 'done' || f === 'blocked') return updates[f] ? 1 : 0;
        return updates[f] !== undefined ? updates[f] : null;
    });

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE actions SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
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
};
