/**
 * Pattern Observations DB — Phase 3.3
 * Stores computed pattern observations for fast retrieval.
 * All functions are synchronous (better-sqlite3).
 */

const db = require('./index');

function initPatternTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pattern_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern_type TEXT NOT NULL,
      category TEXT,
      observation TEXT NOT NULL,
      sample_size INTEGER NOT NULL,
      data_json TEXT,
      computed_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('✅ Pattern observations table initialized');
}

function savePatternObservation(data) {
  // Clear existing patterns of same type+category before inserting fresh
  db.prepare(`
    DELETE FROM pattern_observations WHERE pattern_type = ? AND (category = ? OR (category IS NULL AND ? IS NULL))
  `).run(data.pattern_type, data.category || null, data.category || null);

  db.prepare(`
    INSERT INTO pattern_observations (pattern_type, category, observation, sample_size, data_json, computed_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(
    data.pattern_type,
    data.category || null,
    data.observation,
    data.sample_size,
    JSON.stringify(data.data_json || {})
  );
}

function getAllPatterns() {
  return db.prepare('SELECT * FROM pattern_observations ORDER BY computed_at DESC').all();
}

function getRelevantPatterns(context = {}) {
  // context: { category?, pattern_types? }
  let query = 'SELECT * FROM pattern_observations WHERE 1=1';
  const params = [];
  if (context.category) {
    query += ' AND (category = ? OR category IS NULL)';
    params.push(context.category);
  }
  if (context.pattern_types) {
    query += ` AND pattern_type IN (${context.pattern_types.map(() => '?').join(',')})`;
    params.push(...context.pattern_types);
  }
  return db.prepare(query).all(...params);
}

function checkReadiness() {
  const total = db.prepare(`SELECT COUNT(*) as count FROM outcomes WHERE status = 'archived'`).get().count;
  if (total < 20) return { globalReady: false, categoryCounts: {} };

  const categories = db.prepare(`
    SELECT outcome_tags, COUNT(*) as count FROM outcomes WHERE status = 'archived' AND outcome_tags IS NOT NULL
    GROUP BY outcome_tags
  `).all();

  const categoryCounts = {};
  for (const row of categories) {
    try {
      const tags = JSON.parse(row.outcome_tags);
      for (const tag of tags) {
        categoryCounts[tag] = (categoryCounts[tag] || 0) + row.count;
      }
    } catch {}
  }

  return { globalReady: true, categoryCounts };
}

module.exports = {
  initPatternTables,
  savePatternObservation,
  getAllPatterns,
  getRelevantPatterns,
  checkReadiness,
};
