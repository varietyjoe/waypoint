/**
 * User Preferences Database Module — Phase 3.1
 * Stores key-value preferences for timezone, briefing settings, etc.
 */

const db = require('./index');

function initUserPreferences() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Seed defaults if not present
  const defaults = {
    timezone: 'America/Chicago',
    briefings_enabled: 'true',
    briefing_slack_user_id: '',
    briefing_morning_time: '07:45',
    briefing_midday_time: '12:00',
    briefing_eod_time: '17:30',
  };

  const upsert = db.prepare(`
    INSERT INTO user_preferences (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO NOTHING
  `);

  const insertDefaults = db.transaction(defs => {
    for (const [key, value] of Object.entries(defs)) {
      upsert.run(key, value);
    }
  });
  insertDefaults(defaults);
}

function getPreference(key) {
  const row = db.prepare('SELECT value FROM user_preferences WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setPreference(key, value) {
  db.prepare(`
    INSERT INTO user_preferences (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value));
}

function getAllPreferences() {
  const rows = db.prepare('SELECT key, value FROM user_preferences').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

module.exports = { initUserPreferences, getPreference, setPreference, getAllPreferences };
