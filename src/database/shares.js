const crypto = require('crypto');
const db = require('./index');

function initSharesTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS outcome_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
      share_token TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      revoked INTEGER DEFAULT 0
    )
  `);
  console.log('✅ Outcome shares table initialized');
}

function createShare(outcomeId) {
  // Revoke any existing active share first (one active share per outcome)
  revokeShare(outcomeId);
  const token = crypto.randomBytes(8).toString('hex');
  db.prepare(`
    INSERT INTO outcome_shares (outcome_id, share_token)
    VALUES (?, ?)
  `).run(outcomeId, token);
  return getShareByToken(token);
}

function getShareByToken(token) {
  return db.prepare(`
    SELECT * FROM outcome_shares WHERE share_token = ?
  `).get(token) || null;
}

function getShareByOutcome(outcomeId) {
  return db.prepare(`
    SELECT * FROM outcome_shares
    WHERE outcome_id = ? AND revoked = 0
    ORDER BY created_at DESC
    LIMIT 1
  `).get(outcomeId) || null;
}

function revokeShare(outcomeId) {
  db.prepare(`
    UPDATE outcome_shares SET revoked = 1 WHERE outcome_id = ?
  `).run(outcomeId);
}

module.exports = { initSharesTable, createShare, getShareByToken, getShareByOutcome, revokeShare };
