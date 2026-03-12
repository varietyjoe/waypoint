/**
 * Daily Entries DB — Standups & Reviews
 * Stores daily standup/review content synced from the Obsidian vault.
 * All functions are synchronous (better-sqlite3).
 */

const db = require('./index');

function initDailyEntriesTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('standup', 'review')),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(date, type)
    )
  `);
  console.log('✅ Daily entries table initialized');
}

function upsertDailyEntry(data) {
  // data: { date, type, content }
  const existing = db.prepare(
    `SELECT id FROM daily_entries WHERE date = ? AND type = ?`
  ).get(data.date, data.type);

  if (existing) {
    db.prepare(`
      UPDATE daily_entries SET content = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(data.content, existing.id);
    return db.prepare(`SELECT * FROM daily_entries WHERE id = ?`).get(existing.id);
  }

  db.prepare(`
    INSERT INTO daily_entries (date, type, content, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `).run(data.date, data.type, data.content);

  return db.prepare(`SELECT * FROM daily_entries WHERE rowid = last_insert_rowid()`).get();
}

function getDailyEntries({ type, limit = 20, offset = 0 } = {}) {
  if (type) {
    return db.prepare(`
      SELECT * FROM daily_entries WHERE type = ?
      ORDER BY date DESC LIMIT ? OFFSET ?
    `).all(type, limit, offset);
  }
  return db.prepare(`
    SELECT * FROM daily_entries
    ORDER BY date DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function getDailyEntry(id) {
  return db.prepare(`SELECT * FROM daily_entries WHERE id = ?`).get(id) || null;
}

function getDailyEntryByDateType(date, type) {
  return db.prepare(
    `SELECT * FROM daily_entries WHERE date = ? AND type = ?`
  ).get(date, type) || null;
}

function getRecentEntries(limit = 10) {
  return db.prepare(`
    SELECT * FROM daily_entries
    ORDER BY date DESC, type ASC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  initDailyEntriesTable,
  upsertDailyEntry,
  getDailyEntries,
  getDailyEntry,
  getDailyEntryByDateType,
  getRecentEntries,
};
