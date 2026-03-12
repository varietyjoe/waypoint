#!/usr/bin/env node
/**
 * Backfill daily entries from the Obsidian vault into SQLite.
 * Reads markdown files from waypoint-os/daily/ matching pattern YYYY-MM-DD-{standup|review}.md
 * and upserts them into the daily_entries table.
 *
 * Usage: node scripts/backfill-daily-entries.js [vault-path]
 * Default vault path: /Users/joetancula/Desktop/waypoint-os
 */

const fs = require('fs');
const path = require('path');
const dailyEntriesDb = require('../src/database/daily-entries');

dailyEntriesDb.initDailyEntriesTable();

const vaultPath = process.argv[2] || '/Users/joetancula/Desktop/waypoint-os';
const dailyDir = path.join(vaultPath, 'daily');

const FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})-(standup|review)\.md$/;

const files = fs.readdirSync(dailyDir).filter(f => FILE_PATTERN.test(f));

console.log(`Found ${files.length} daily entry files to backfill.\n`);

let count = 0;
for (const file of files) {
  const match = file.match(FILE_PATTERN);
  const date = match[1];
  const type = match[2];
  const content = fs.readFileSync(path.join(dailyDir, file), 'utf-8');

  // Strip frontmatter (everything between --- ... ---)
  const stripped = content.replace(/^---[\s\S]*?---\n*/, '').trim();

  const entry = dailyEntriesDb.upsertDailyEntry({ date, type, content: stripped });
  console.log(`  ✅ ${file} → id=${entry.id}`);
  count++;
}

console.log(`\nBackfill complete: ${count} entries synced.`);
