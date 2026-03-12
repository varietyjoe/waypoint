/**
 * Calendar Database Access Layer — Phase 3.0
 * Tables: calendar_events, daily_plans
 */

const db = require('./index');

function initCalendarTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE NOT NULL,
      provider TEXT DEFAULT 'google',
      title TEXT,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      is_blocked INTEGER DEFAULT 1,
      fetched_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      committed_outcome_ids TEXT,
      committed_action_ids TEXT,
      total_estimated_minutes INTEGER,
      available_minutes INTEGER,
      confirmed_at TEXT,
      actual_completed_action_ids TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function upsertCalendarEvents(events) {
  const stmt = db.prepare(`
    INSERT INTO calendar_events (external_id, title, start_at, end_at, is_blocked, fetched_at)
    VALUES (@external_id, @title, @start_at, @end_at, @is_blocked, datetime('now'))
    ON CONFLICT(external_id) DO UPDATE SET
      title = excluded.title,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      fetched_at = excluded.fetched_at
  `);
  const insert = db.transaction(evts => {
    for (const e of evts) stmt.run(e);
  });
  insert(events);
}

function getEventsForDate(date) {
  return db.prepare(`
    SELECT * FROM calendar_events
    WHERE start_at >= ? AND start_at < ?
    ORDER BY start_at ASC
  `).all(`${date}T00:00:00`, `${date}T24:00:00`);
}

function getTodayPlan(date) {
  return db.prepare('SELECT * FROM daily_plans WHERE date = ?').get(date) || null;
}

function upsertDailyPlan(date, data) {
  const existing = getTodayPlan(date);
  if (existing) {
    db.prepare(`
      UPDATE daily_plans SET
        committed_outcome_ids = @committed_outcome_ids,
        committed_action_ids = @committed_action_ids,
        total_estimated_minutes = @total_estimated_minutes,
        available_minutes = @available_minutes,
        confirmed_at = @confirmed_at,
        actual_completed_action_ids = @actual_completed_action_ids,
        updated_at = datetime('now')
      WHERE date = @date
    `).run({ date, ...data });
  } else {
    db.prepare(`
      INSERT INTO daily_plans (date, committed_outcome_ids, committed_action_ids,
        total_estimated_minutes, available_minutes, confirmed_at, actual_completed_action_ids)
      VALUES (@date, @committed_outcome_ids, @committed_action_ids,
        @total_estimated_minutes, @available_minutes, @confirmed_at, @actual_completed_action_ids)
    `).run({ date, ...data });
  }
  return getTodayPlan(date);
}

module.exports = { initCalendarTables, upsertCalendarEvents, getEventsForDate, getTodayPlan, upsertDailyPlan };
