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
      type TEXT NOT NULL CHECK(type IN ('standup', 'review', 'ai_work')),
      session_id TEXT,
      content TEXT NOT NULL,
      source TEXT,
      status TEXT,
      finalized_at TEXT,
      parsed_data TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  migrateDailyEntriesSchema();
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_entries_daily_unique
    ON daily_entries(date, type)
    WHERE type IN ('standup', 'review')
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_entries_ai_session_unique
    ON daily_entries(date, type, session_id)
    WHERE type = 'ai_work' AND session_id IS NOT NULL
  `);
  console.log('✅ Daily entries table initialized');
}

function migrateDailyEntriesSchema() {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'daily_entries'").get();
  const tableSql = table?.sql || '';
  const needsRebuild = tableSql.includes("type IN ('standup', 'review')") || tableSql.includes('UNIQUE(date, type)');

  if (needsRebuild) {
    const oldCols = db.pragma('table_info(daily_entries)').map(c => c.name);
    const parsedExpr = oldCols.includes('parsed_data') ? 'parsed_data' : 'NULL';
    db.exec(`
      DROP INDEX IF EXISTS idx_daily_entries_daily_unique;
      DROP INDEX IF EXISTS idx_daily_entries_ai_session_unique;
      ALTER TABLE daily_entries RENAME TO daily_entries_old_ai_work;
      CREATE TABLE daily_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('standup', 'review', 'ai_work')),
        session_id TEXT,
        content TEXT NOT NULL,
        source TEXT,
        status TEXT,
        finalized_at TEXT,
        parsed_data TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO daily_entries (id, date, type, content, parsed_data, created_at, updated_at)
      SELECT id, date, type, content, ${parsedExpr}, created_at, updated_at
      FROM daily_entries_old_ai_work;
      DROP TABLE daily_entries_old_ai_work;
    `);
    return;
  }

  const cols = db.pragma('table_info(daily_entries)').map(c => c.name);
  const migrations = [
    ['session_id', 'ALTER TABLE daily_entries ADD COLUMN session_id TEXT'],
    ['source', 'ALTER TABLE daily_entries ADD COLUMN source TEXT'],
    ['status', 'ALTER TABLE daily_entries ADD COLUMN status TEXT'],
    ['finalized_at', 'ALTER TABLE daily_entries ADD COLUMN finalized_at TEXT'],
    ['parsed_data', 'ALTER TABLE daily_entries ADD COLUMN parsed_data TEXT'],
  ];
  for (const [name, sql] of migrations) {
    if (!cols.includes(name)) {
      try { db.exec(sql); } catch (_) {}
    }
  }
}

function upsertDailyEntry(data) {
  // data: { date, type, content }
  const type = data.type || 'standup';
  const existing = db.prepare(
    `SELECT id FROM daily_entries WHERE date = ? AND type = ?`
  ).get(data.date, type);

  const parsedJson = data.parsed_data ? (typeof data.parsed_data === 'string' ? data.parsed_data : JSON.stringify(data.parsed_data)) : null;

  if (existing) {
    db.prepare(`
      UPDATE daily_entries SET content = ?, parsed_data = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(data.content, parsedJson, existing.id);
    return db.prepare(`SELECT * FROM daily_entries WHERE id = ?`).get(existing.id);
  }

  db.prepare(`
    INSERT INTO daily_entries (date, type, content, parsed_data, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(data.date, type, data.content, parsedJson);

  return db.prepare(`SELECT * FROM daily_entries WHERE rowid = last_insert_rowid()`).get();
}

function upsertAiWorkEntry(data) {
  const {
    date,
    session_id,
    content,
    parsed_data,
    source = 'ai',
    status = 'active',
    finalized_at = null,
  } = data;

  if (!date) throw new Error('date is required');
  if (!session_id) throw new Error('session_id is required');
  if (!content || !content.trim()) throw new Error('content is required');

  const parsedJson = parsed_data
    ? (typeof parsed_data === 'string' ? parsed_data : JSON.stringify(parsed_data))
    : null;

  const existing = db.prepare(`
    SELECT id FROM daily_entries
    WHERE date = ? AND type = 'ai_work' AND session_id = ?
  `).get(date, session_id);

  if (existing) {
    db.prepare(`
      UPDATE daily_entries
      SET content = ?, parsed_data = ?, source = ?, status = ?, finalized_at = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(content.trim(), parsedJson, source, status, finalized_at, existing.id);
    return getDailyEntry(existing.id);
  }

  db.prepare(`
    INSERT INTO daily_entries (date, type, session_id, content, parsed_data, source, status, finalized_at, created_at, updated_at)
    VALUES (?, 'ai_work', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(date, session_id, content.trim(), parsedJson, source, status, finalized_at);

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

function updateParsedData(id, parsedData) {
  const json = typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData);
  db.prepare('UPDATE daily_entries SET parsed_data = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(json, id);
  return db.prepare('SELECT * FROM daily_entries WHERE id = ?').get(id);
}

module.exports = {
  initDailyEntriesTable,
  upsertDailyEntry,
  upsertAiWorkEntry,
  getDailyEntries,
  getDailyEntry,
  getDailyEntryByDateType,
  getRecentEntries,
  updateParsedData,
};
