const db = require('./index');

function initUserContextTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_context (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      key              TEXT NOT NULL,
      value            TEXT NOT NULL,
      category         TEXT,
      source           TEXT,
      source_action_id  INTEGER REFERENCES actions(id) ON DELETE SET NULL,
      source_outcome_id INTEGER REFERENCES outcomes(id) ON DELETE SET NULL,
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('✅ User context table initialized');
}

function getAllContext() {
  return db.prepare('SELECT * FROM user_context ORDER BY category, key').all();
}

// Returns a formatted string block for injection into Claude system prompts.
// Returns empty string if no context exists.
function getContextSnapshot() {
  const rows = db.prepare('SELECT key, value FROM user_context ORDER BY category, key').all();
  if (rows.length === 0) return '';

  const lines = rows.map(r => `- ${r.key}: ${r.value}`).join('\n');
  return `## What I know about how you work:\n${lines}`;
}

// Insert or update by key (case-insensitive match).
function upsertContext(key, value, category, source, sourceActionId, sourceOutcomeId) {
  const existing = db.prepare('SELECT id FROM user_context WHERE lower(key) = lower(?)').get(key);
  if (existing) {
    db.prepare(`
      UPDATE user_context
      SET value = ?, category = ?, source = ?, source_action_id = ?, source_outcome_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(value, category || null, source || null, sourceActionId || null, sourceOutcomeId || null, existing.id);
    return db.prepare('SELECT * FROM user_context WHERE id = ?').get(existing.id);
  } else {
    const result = db.prepare(`
      INSERT INTO user_context (key, value, category, source, source_action_id, source_outcome_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(key, value, category || null, source || null, sourceActionId || null, sourceOutcomeId || null);
    return db.prepare('SELECT * FROM user_context WHERE id = ?').get(result.lastInsertRowid);
  }
}

function updateContext(id, value, category) {
  db.prepare(`
    UPDATE user_context
    SET value = ?, category = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(value, category || null, id);
  return db.prepare('SELECT * FROM user_context WHERE id = ?').get(id);
}

function deleteContext(id) {
  db.prepare('DELETE FROM user_context WHERE id = ?').run(id);
}

module.exports = {
  initUserContextTable,
  getAllContext,
  getContextSnapshot,
  upsertContext,
  updateContext,
  deleteContext,
};
