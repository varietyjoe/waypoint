// test/seed.test.js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Require seeder at top-level so Node's module cache handles it once.
// Side effect: this loads src/database/index.js which opens the app's real DB file.
// That's harmless — all test calls pass a temp db instance so the real DB is never written to.
const { runSeedIfEmpty } = require('../src/database/seeder');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a temporary SQLite DB with the minimum tables the seeder needs.
 * Returns { db, tmpPath } — caller must close and unlink when done.
 */
function makeTempDb() {
  const tmpPath = path.join(os.tmpdir(), `test-waypoint-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(tmpPath);

  db.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#818cf8',
      icon TEXT DEFAULT '📁',
      view_mode TEXT NOT NULL DEFAULT 'list',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      deadline TEXT,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outcome_id INTEGER,
      title TEXT NOT NULL,
      energy_type TEXT DEFAULT 'light',
      done INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  return { db, tmpPath };
}

function cleanupDb({ db, tmpPath }) {
  try { db.close(); } catch (_) {}
  try { fs.unlinkSync(tmpPath); } catch (_) {}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('seeds a fresh DB with outcomes and actions', () => {
  const tmp = makeTempDb();
  try {
    const seeded = runSeedIfEmpty(tmp.db);

    assert.equal(seeded, true, 'runSeedIfEmpty should return true when it seeds');

    const outcomes = tmp.db.prepare('SELECT * FROM outcomes').all();
    assert.ok(outcomes.length > 0, 'should have inserted at least one outcome');

    const actions = tmp.db.prepare('SELECT * FROM actions').all();
    assert.ok(actions.length > 0, 'should have inserted at least one action');

    const projects = tmp.db.prepare('SELECT * FROM projects').all();
    assert.ok(projects.length > 0, 'should have inserted at least one project');
  } finally {
    cleanupDb(tmp);
  }
});

test('skips seed when DB already has outcomes (idempotent)', () => {
  const tmp = makeTempDb();
  try {
    runSeedIfEmpty(tmp.db); // first call — seeds
    const countAfterFirst = tmp.db.prepare('SELECT COUNT(*) as n FROM outcomes').get().n;

    const seeded = runSeedIfEmpty(tmp.db); // second call — should skip

    const countAfterSecond = tmp.db.prepare('SELECT COUNT(*) as n FROM outcomes').get().n;

    assert.equal(seeded, false, 'runSeedIfEmpty should return false when skipped');
    assert.equal(countAfterFirst, countAfterSecond, 'outcome count should not change on second run');
  } finally {
    cleanupDb(tmp);
  }
});

test('all outcomes in seed reference a valid project_name', () => {
  const seed = require('../seeds/waypoint-seed');
  const projectNames = new Set(seed.projects.map(p => p.name));

  for (const o of seed.outcomes) {
    assert.ok(
      projectNames.has(o.project_name),
      `outcome "${o.title}" references unknown project "${o.project_name}"`
    );
  }
});

test('all actions in seed reference a valid outcome_title', () => {
  const seed = require('../seeds/waypoint-seed');
  const outcomeTitles = new Set(seed.outcomes.map(o => o.title));

  for (const a of seed.actions) {
    assert.ok(
      outcomeTitles.has(a.outcome_title),
      `action "${a.title}" references unknown outcome "${a.outcome_title}"`
    );
  }
});
