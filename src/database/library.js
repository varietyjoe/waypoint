const db = require('./index');

function initLibraryMigrations() {
  // Add columns to user_context if not present — safe to call on every startup
  const columns = db.pragma('table_info(user_context)').map(c => c.name);

  if (!columns.includes('tags')) {
    db.exec('ALTER TABLE user_context ADD COLUMN tags TEXT');
  }
  if (!columns.includes('title')) {
    db.exec('ALTER TABLE user_context ADD COLUMN title TEXT');
  }
  if (!columns.includes('word_count')) {
    db.exec('ALTER TABLE user_context ADD COLUMN word_count INTEGER');
  }
  if (!columns.includes('auto_tagged')) {
    db.exec('ALTER TABLE user_context ADD COLUMN auto_tagged INTEGER DEFAULT 0');
  }
  console.log('✅ Library migrations applied');
}

function getAllLibraryEntries(filters = {}) {
  let query = `SELECT * FROM user_context WHERE category = 'saved_output'`;
  const params = [];

  if (filters.tag) {
    query += ` AND tags LIKE ?`;
    params.push(`%"${filters.tag}"%`);
  }

  if (filters.q) {
    query += ` AND (title LIKE ? OR value LIKE ? OR tags LIKE ?)`;
    const term = `%${filters.q}%`;
    params.push(term, term, term);
  }

  query += ` ORDER BY updated_at DESC`;
  return db.prepare(query).all(...params);
}

function getLibraryEntry(id) {
  return db.prepare(`SELECT * FROM user_context WHERE id = ? AND category = 'saved_output'`).get(id) || null;
}

function saveLibraryEntry(data) {
  // data: { key, value, title, tags (array), word_count, source }
  const tagsJson = JSON.stringify(data.tags || []);
  const wordCount = data.word_count || (data.value || '').trim().split(/\s+/).length;

  db.prepare(`
    INSERT INTO user_context (key, value, category, source, title, tags, word_count, auto_tagged, created_at, updated_at)
    VALUES (?, ?, 'saved_output', ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `).run(data.key || data.title || 'Saved output', data.value, data.source || 'library', data.title || null, tagsJson, wordCount);

  return db.prepare(`SELECT * FROM user_context WHERE rowid = last_insert_rowid()`).get();
}

function updateLibraryEntry(id, data) {
  const existing = getLibraryEntry(id);
  if (!existing) return null;

  const title = data.title !== undefined ? data.title : existing.title;
  const tags = data.tags !== undefined ? JSON.stringify(data.tags) : existing.tags;

  db.prepare(`
    UPDATE user_context SET title = ?, tags = ?, updated_at = datetime('now')
    WHERE id = ? AND category = 'saved_output'
  `).run(title, tags, id);

  return getLibraryEntry(id);
}

function deleteLibraryEntry(id) {
  db.prepare(`DELETE FROM user_context WHERE id = ? AND category = 'saved_output'`).run(id);
}

function searchLibrary(query) {
  const term = `%${query}%`;
  return db.prepare(`
    SELECT * FROM user_context
    WHERE category = 'saved_output'
    AND (title LIKE ? OR value LIKE ? OR tags LIKE ?)
    ORDER BY updated_at DESC
    LIMIT 20
  `).all(term, term, term);
}

function getRelevantLibraryEntries(outcomeId, tags = []) {
  // For Focus Mode injection: find entries related to this outcome or matching tags
  const entries = db.prepare(`
    SELECT * FROM user_context
    WHERE category = 'saved_output'
    ORDER BY updated_at DESC
    LIMIT 10
  `).all();

  // Score by tag overlap + source outcome match
  const scored = entries.map(e => {
    let score = 0;
    const entryTags = JSON.parse(e.tags || '[]');
    if (e.source && e.source.includes(String(outcomeId))) score += 10;
    for (const t of tags) {
      if (entryTags.includes(t)) score += 3;
    }
    return { ...e, _score: score };
  });

  return scored
    .sort((a, b) => b._score - a._score)
    .slice(0, 3);
}

module.exports = {
  initLibraryMigrations,
  getAllLibraryEntries,
  getLibraryEntry,
  saveLibraryEntry,
  updateLibraryEntry,
  deleteLibraryEntry,
  searchLibrary,
  getRelevantLibraryEntries,
};
