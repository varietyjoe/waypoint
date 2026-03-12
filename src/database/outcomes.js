const db = require('./index');

function initOutcomesTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS outcomes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT,
            deadline TEXT,
            priority TEXT DEFAULT 'medium',
            impact TEXT,
            status TEXT DEFAULT 'active',
            archived_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
    // Phase 3.3 — add outcome_tags column for pattern memory
    const outcomeCols = db.pragma('table_info(outcomes)').map(c => c.name);
    if (!outcomeCols.includes('outcome_tags')) {
        db.exec('ALTER TABLE outcomes ADD COLUMN outcome_tags TEXT');
    }

    // Phase 5.1 — activation columns
    if (!outcomeCols.includes('is_active')) {
        db.exec('ALTER TABLE outcomes ADD COLUMN is_active INTEGER DEFAULT 0');
    }
    if (!outcomeCols.includes('activation_note')) {
        db.exec('ALTER TABLE outcomes ADD COLUMN activation_note TEXT');
    }

    // Rich text notes column
    if (!outcomeCols.includes('notes')) {
        db.exec('ALTER TABLE outcomes ADD COLUMN notes TEXT');
    }

    console.log('✅ Outcomes table initialized');
}

function createOutcome(data) {
    const { project_id, title, description, deadline, priority = 'medium', impact } = data;
    if (!project_id) throw new Error('project_id is required');
    if (!title || !title.trim()) throw new Error('title is required');

    const result = db.prepare(`
        INSERT INTO outcomes (project_id, title, description, deadline, priority, impact)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(project_id, title.trim(), description || null, deadline || null, priority, impact || null);

    return getOutcomeById(result.lastInsertRowid);
}

function getAllOutcomes(filters = {}) {
    const { project_id, status } = filters;
    let sql = `
        SELECT o.*, p.name as project_name, p.color as project_color
        FROM outcomes o
        LEFT JOIN projects p ON p.id = o.project_id
        WHERE 1=1
    `;
    const params = [];
    if (project_id) { sql += ' AND o.project_id = ?'; params.push(parseInt(project_id)); }
    if (status)     { sql += ' AND o.status = ?';     params.push(status); }
    sql += ' ORDER BY o.created_at DESC';
    return db.prepare(sql).all(...params);
}

function getOutcomeById(id) {
    return db.prepare(`
        SELECT o.*, p.name as project_name, p.color as project_color
        FROM outcomes o
        LEFT JOIN projects p ON p.id = o.project_id
        WHERE o.id = ?
    `).get(id) || null;
}

function updateOutcome(id, updates) {
    const outcome = getOutcomeById(id);
    if (!outcome) throw new Error(`Outcome ${id} not found`);

    const allowed = ['title', 'description', 'deadline', 'priority', 'impact', 'status', 'is_active', 'activation_note', 'notes'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (fields.length === 0) throw new Error('No valid fields to update');

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = [...fields.map(f => updates[f]), id];
    db.prepare(`UPDATE outcomes SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(...values);
    return getOutcomeById(id);
}

function deleteOutcome(id) {
    const outcome = getOutcomeById(id);
    if (!outcome) return false;
    db.prepare('DELETE FROM outcomes WHERE id = ?').run(id);
    return true;
}

function archiveOutcome(id) {
    const outcome = getOutcomeById(id);
    if (!outcome) throw new Error(`Outcome ${id} not found`);
    db.prepare(`
        UPDATE outcomes
        SET status = 'archived', archived_at = datetime('now'), updated_at = datetime('now'),
            is_active = 0
        WHERE id = ?
    `).run(id);
    return getOutcomeById(id);
}

function initReflectionsTable() {
    // Migrate outcomes table with completion snapshot columns
    const cols = db.prepare('PRAGMA table_info(outcomes)').all().map(c => c.name);
    if (!cols.includes('completed_actions_count')) db.exec('ALTER TABLE outcomes ADD COLUMN completed_actions_count INTEGER');
    if (!cols.includes('total_actions_count'))     db.exec('ALTER TABLE outcomes ADD COLUMN total_actions_count INTEGER');
    if (!cols.includes('total_estimated_time'))    db.exec('ALTER TABLE outcomes ADD COLUMN total_estimated_time INTEGER');
    if (!cols.includes('deadline_hit'))            db.exec('ALTER TABLE outcomes ADD COLUMN deadline_hit INTEGER');
    if (!cols.includes('outcome_result'))          db.exec("ALTER TABLE outcomes ADD COLUMN outcome_result TEXT");
    if (!cols.includes('outcome_result_note'))     db.exec("ALTER TABLE outcomes ADD COLUMN outcome_result_note TEXT");

    db.exec(`
        CREATE TABLE IF NOT EXISTS reflections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
            what_worked TEXT,
            what_slipped TEXT,
            reusable_insight TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);
    console.log('✅ Reflections table initialized');
}

function completeOutcome(id, actionsData, reflectionData = {}, resultData = {}) {
    const outcome = getOutcomeById(id);
    if (!outcome) throw new Error(`Outcome ${id} not found`);

    const totalCount     = actionsData.length;
    const completedCount = actionsData.filter(a => a.done).length;
    const totalTime      = actionsData.reduce((s, a) => s + (a.time_estimate || 0), 0);

    let deadlineHit = null;
    if (outcome.deadline) {
        const [y, m, d] = outcome.deadline.split('-').map(Number);
        const deadlineDate = new Date(y, m - 1, d);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        deadlineHit = today <= deadlineDate ? 1 : 0;
    }

    const { outcome_result, outcome_result_note } = resultData;

    db.prepare(`
        UPDATE outcomes
        SET status = 'archived',
            archived_at = datetime('now'),
            updated_at = datetime('now'),
            is_active = 0,
            completed_actions_count = ?,
            total_actions_count = ?,
            total_estimated_time = ?,
            deadline_hit = ?,
            outcome_result = ?,
            outcome_result_note = ?
        WHERE id = ?
    `).run(completedCount, totalCount, totalTime, deadlineHit, outcome_result || null, outcome_result_note || null, id);

    const { what_worked, what_slipped, reusable_insight } = reflectionData;
    if (what_worked || what_slipped || reusable_insight) {
        db.prepare(`
            INSERT INTO reflections (outcome_id, what_worked, what_slipped, reusable_insight)
            VALUES (?, ?, ?, ?)
        `).run(id, what_worked || null, what_slipped || null, reusable_insight || null);
    }

    return getOutcomeById(id);
}

function getArchivedOutcomes(limit = 10) {
    return db.prepare(`
        SELECT o.*, p.name as project_name, p.color as project_color
        FROM outcomes o
        LEFT JOIN projects p ON p.id = o.project_id
        WHERE o.status = 'archived'
        ORDER BY o.archived_at DESC
        LIMIT ?
    `).all(limit);
}

function getReflectionByOutcome(outcomeId) {
    return db.prepare(`
        SELECT * FROM reflections WHERE outcome_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(outcomeId) || null;
}

function getStreakDays() {
    // Get all distinct days that had at least one archived outcome, ordered DESC
    const rows = db.prepare(`
        SELECT DISTINCT DATE(archived_at) as day
        FROM outcomes
        WHERE archived_at IS NOT NULL
        ORDER BY day DESC
    `).all();

    if (rows.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < rows.length; i++) {
        const rowDate = new Date(rows[i].day);
        rowDate.setHours(0, 0, 0, 0);

        const expectedDate = new Date(today);
        expectedDate.setDate(today.getDate() - i);

        if (rowDate.getTime() === expectedDate.getTime()) {
            streak++;
        } else {
            break;
        }
    }

    return streak;
}

function getTodayStats() {
    const outcomesArchivedToday = db.prepare(`
        SELECT COUNT(*) as count FROM outcomes
        WHERE status = 'archived' AND date(archived_at) = date('now', 'localtime')
    `).get().count;

    const actionsCompletedToday = db.prepare(`
        SELECT COUNT(*) as count FROM actions
        WHERE done = 1 AND date(done_at) = date('now', 'localtime')
    `).get().count;

    return {
        outcomes_archived_today: outcomesArchivedToday,
        actions_completed_today: actionsCompletedToday,
        streak_days: getStreakDays(),
    };
}

module.exports = {
    initOutcomesTable,
    initReflectionsTable,
    createOutcome,
    getAllOutcomes,
    getOutcomeById,
    updateOutcome,
    deleteOutcome,
    archiveOutcome,
    completeOutcome,
    getArchivedOutcomes,
    getReflectionByOutcome,
    getTodayStats,
    getStreakDays,
};
