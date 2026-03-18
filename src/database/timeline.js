const db = require('./index');

function initTimelineTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS outcome_timeline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Add ai_summary column to outcomes table
    const outcomeCols = db.pragma('table_info(outcomes)').map(c => c.name);
    if (!outcomeCols.includes('ai_summary')) {
        db.exec('ALTER TABLE outcomes ADD COLUMN ai_summary TEXT');
        console.log('✅ Added ai_summary column to outcomes');
    }

    console.log('✅ Timeline table initialized');
}

function getTimelineByOutcome(outcomeId) {
    return db.prepare(`
        SELECT * FROM outcome_timeline
        WHERE outcome_id = ?
        ORDER BY created_at DESC
    `).all(outcomeId);
}

function addTimelineEntry(outcomeId, content) {
    const result = db.prepare(`
        INSERT INTO outcome_timeline (outcome_id, content)
        VALUES (?, ?)
    `).run(outcomeId, content.trim());
    return db.prepare('SELECT * FROM outcome_timeline WHERE id = ?').get(result.lastInsertRowid);
}

function getRecentTimeline() {
    // Latest entry per active outcome
    return db.prepare(`
        SELECT t.*, o.title AS outcome_title, o.project_id, p.name AS project_name, p.color AS project_color
        FROM outcome_timeline t
        JOIN outcomes o ON o.id = t.outcome_id
        LEFT JOIN projects p ON p.id = o.project_id
        WHERE o.status = 'active'
          AND t.id IN (
            SELECT MAX(id) FROM outcome_timeline GROUP BY outcome_id
          )
        ORDER BY t.created_at DESC
    `).all();
}

function updateOutcomeSummary(outcomeId, summary) {
    db.prepare(`UPDATE outcomes SET ai_summary = ?, updated_at = datetime('now') WHERE id = ?`).run(summary, outcomeId);
}

function getCompletedToday() {
    return db.prepare(`
        SELECT a.id, a.title, a.done_at, a.outcome_id,
               o.title AS outcome_title, o.project_id
        FROM actions a
        LEFT JOIN outcomes o ON o.id = a.outcome_id
        WHERE a.done = 1
          AND date(a.done_at) = date('now', 'localtime')
        ORDER BY a.done_at DESC
    `).all();
}

module.exports = {
    initTimelineTable,
    getTimelineByOutcome,
    addTimelineEntry,
    getRecentTimeline,
    updateOutcomeSummary,
    getCompletedToday,
};
