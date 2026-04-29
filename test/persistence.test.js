'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('SQLite foreign keys cascade project deletes into outcomes and actions', () => {
  const tmpPath = path.join(os.tmpdir(), `waypoint-persistence-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(tmpPath);

  try {
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      CREATE TABLE outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL
      );
      CREATE TABLE actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        outcome_id INTEGER REFERENCES outcomes(id) ON DELETE CASCADE,
        title TEXT NOT NULL
      );
    `);

    const projectId = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Persistence Test').lastInsertRowid;
    const outcomeId = db.prepare('INSERT INTO outcomes (project_id, title) VALUES (?, ?)').run(projectId, 'Keep data').lastInsertRowid;
    db.prepare('INSERT INTO actions (outcome_id, title) VALUES (?, ?)').run(outcomeId, 'Nested action');

    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM projects').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM outcomes').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM actions').get().n, 0);
  } finally {
    try { db.close(); } catch (_) {}
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
});
