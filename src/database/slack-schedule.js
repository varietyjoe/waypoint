/**
 * Slack Schedule Database Access Layer
 * Manages scheduled Slack pull times.
 */

const db = require('./index');

function initSlackScheduleTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS slack_schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_time TEXT NOT NULL,
            timezone TEXT DEFAULT 'America/New_York',
            enabled INTEGER DEFAULT 1,
            last_run_at TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    `);
    console.log('✅ slack_schedule table initialized');
}

function getAllSchedules() {
    return db.prepare('SELECT * FROM slack_schedule ORDER BY run_time ASC').all();
}

function getScheduleById(id) {
    return db.prepare('SELECT * FROM slack_schedule WHERE id = ?').get(id) || null;
}

function createSchedule({ run_time, timezone = 'America/New_York' }) {
    if (!run_time) throw new Error('run_time is required');
    const result = db.prepare(`
        INSERT INTO slack_schedule (run_time, timezone) VALUES (?, ?)
    `).run(run_time, timezone);
    return getScheduleById(result.lastInsertRowid);
}

function updateSchedule(id, updates) {
    const schedule = getScheduleById(id);
    if (!schedule) throw new Error(`Schedule ${id} not found`);

    const allowed = ['run_time', 'timezone', 'enabled'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (fields.length === 0) throw new Error('No valid fields to update');

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updates[f]);
    db.prepare(`UPDATE slack_schedule SET ${setClause} WHERE id = ?`).run(...values, id);
    return getScheduleById(id);
}

function markLastRun(id) {
    db.prepare(`UPDATE slack_schedule SET last_run_at = datetime('now') WHERE id = ?`).run(id);
}

function deleteSchedule(id) {
    const result = db.prepare('DELETE FROM slack_schedule WHERE id = ?').run(id);
    return result.changes > 0;
}

module.exports = {
    initSlackScheduleTable,
    getAllSchedules,
    getScheduleById,
    createSchedule,
    updateSchedule,
    markLastRun,
    deleteSchedule,
};
