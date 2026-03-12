const db = require('./index');

function initFocusSessionsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      action_id        INTEGER REFERENCES actions(id) ON DELETE SET NULL,
      outcome_id       INTEGER REFERENCES outcomes(id) ON DELETE SET NULL,
      started_at       TEXT DEFAULT (datetime('now')),
      ended_at         TEXT,
      duration_seconds INTEGER,
      conversation     TEXT,
      created_at       TEXT DEFAULT (datetime('now'))
    )
  `);

  // Add summary column if not present
  const cols = db.prepare("PRAGMA table_info('focus_sessions')").all();
  if (!cols.find(c => c.name === 'summary')) {
    db.prepare("ALTER TABLE focus_sessions ADD COLUMN summary TEXT").run();
  }

  console.log('✅ Focus sessions table initialized');
}

function createSession(actionId, outcomeId) {
  const result = db.prepare(
    'INSERT INTO focus_sessions (action_id, outcome_id) VALUES (?, ?)'
  ).run(actionId || null, outcomeId || null);
  return db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(result.lastInsertRowid);
}

function endSession(id, endedAt, durationSeconds, conversation) {
  db.prepare(`
    UPDATE focus_sessions
    SET ended_at = ?, duration_seconds = ?, conversation = ?
    WHERE id = ?
  `).run(endedAt, durationSeconds, conversation, id);
  return db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id);
}

function getSessionsByAction(actionId) {
  return db.prepare(
    'SELECT * FROM focus_sessions WHERE action_id = ? ORDER BY created_at DESC'
  ).all(actionId);
}

function getRelevantSessions(actionId, outcomeId) {
  // 1. Sessions on the same outcome (join through actions table)
  const bySameOutcome = db.prepare(`
    SELECT fs.* FROM focus_sessions fs
    JOIN actions a ON fs.action_id = a.id
    WHERE a.outcome_id = ?
    ORDER BY fs.started_at DESC
    LIMIT 5
  `).all(outcomeId);

  if (bySameOutcome.length > 0) return bySameOutcome;

  // 2. Fallback: sessions on this exact action
  return db.prepare(`
    SELECT * FROM focus_sessions
    WHERE action_id = ?
    ORDER BY started_at DESC
    LIMIT 5
  `).all(actionId);
}

function updateSessionSummary(id, summary) {
  db.prepare('UPDATE focus_sessions SET summary = ? WHERE id = ?').run(summary, id);
}

// Returns { action_id, total_seconds, session_count } for each action in an outcome
function getFocusSummaryForOutcome(outcomeId) {
  return db.prepare(`
    SELECT
      fs.action_id,
      SUM(COALESCE(fs.duration_seconds, 0)) AS total_seconds,
      COUNT(*) AS session_count
    FROM focus_sessions fs
    JOIN actions a ON fs.action_id = a.id
    WHERE a.outcome_id = ?
      AND fs.ended_at IS NOT NULL
    GROUP BY fs.action_id
  `).all(outcomeId);
}

module.exports = { initFocusSessionsTable, createSession, endSession, getSessionsByAction, getRelevantSessions, updateSessionSummary, getFocusSummaryForOutcome };
