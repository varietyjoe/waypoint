// src/database/seeder.js
'use strict';

const defaultDb = require('./index');
const seed = require('../../seeds/waypoint-seed');

/**
 * Seed the DB with initial data if the outcomes table is empty.
 *
 * @param {import('better-sqlite3').Database} [db] - Optional DB instance.
 *   Defaults to the app's global DB. Pass a custom instance for testing.
 * @returns {boolean} true if seeding ran, false if skipped.
 */
function runSeedIfEmpty(db) {
  const _db = db || defaultDb;

  const { count } = _db.prepare('SELECT COUNT(*) as count FROM outcomes').get();

  if (count > 0) {
    console.log(`⏭️  Seed skipped — ${count} outcome(s) already in DB`);
    return false;
  }

  console.log('🌱 DB is empty — running startup seed...');

  _db.transaction(() => {
    // 1. Insert projects
    const projectIds = {};
    for (const p of seed.projects) {
      const existing = _db.prepare('SELECT id FROM projects WHERE name = ?').get(p.name);
      if (existing) {
        projectIds[p.name] = existing.id;
      } else {
        const result = _db
          .prepare('INSERT INTO projects (name, color, icon) VALUES (?, ?, ?)')
          .run(p.name, p.color || '#818cf8', p.icon || '📁');
        projectIds[p.name] = result.lastInsertRowid;
      }
    }

    // 2. Insert outcomes
    const outcomeIds = {};
    for (const o of seed.outcomes) {
      const projectId = projectIds[o.project_name];
      if (!projectId) throw new Error(`Seed error: unknown project_name "${o.project_name}"`);

      const result = _db
        .prepare(`
          INSERT INTO outcomes (project_id, title, description, deadline, priority, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(
          projectId,
          o.title,
          o.description || null,
          o.deadline || null,
          o.priority || 'medium',
          o.status || 'active'
        );
      outcomeIds[o.title] = result.lastInsertRowid;
    }

    // 3. Insert actions
    for (const a of seed.actions) {
      const outcomeId = outcomeIds[a.outcome_title];
      if (!outcomeId) throw new Error(`Seed error: unknown outcome_title "${a.outcome_title}"`);

      _db
        .prepare(`
          INSERT INTO actions (outcome_id, title, energy_type, done)
          VALUES (?, ?, ?, ?)
        `)
        .run(
          outcomeId,
          a.title,
          a.energy_type || 'light',
          a.done ? 1 : 0
        );
    }
  })();

  console.log(
    `✅ Seed complete — ${seed.projects.length} project(s), ` +
    `${seed.outcomes.length} outcome(s), ${seed.actions.length} action(s) inserted`
  );
  return true;
}

module.exports = { runSeedIfEmpty };
