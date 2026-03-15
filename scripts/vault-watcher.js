#!/usr/bin/env node
/**
 * Vault Watcher — scripts/vault-watcher.js
 *
 * Watches a local Obsidian vault and syncs daily standups/reviews + project notes
 * to the Waypoint DB via the existing API.
 *
 * Required env vars:
 *   WAYPOINT_OS_PATH  — absolute path to the Obsidian vault
 *   WAYPOINT_API_KEY  — API key for Waypoint
 *
 * Optional env vars:
 *   WAYPOINT_API_URL  — base URL (default: http://localhost:3000)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// ── Env validation ──────────────────────────────────────────────
const vaultPath = process.env.WAYPOINT_OS_PATH;
if (!vaultPath) {
  console.error('❌  Missing required env var: WAYPOINT_OS_PATH');
  console.error('    Set it to the absolute path of your Obsidian vault, e.g.:');
  console.error('    WAYPOINT_OS_PATH=/Users/you/Vault node scripts/vault-watcher.js');
  process.exit(1);
}

const apiKey = process.env.WAYPOINT_API_KEY;
if (!apiKey) {
  console.error('❌  Missing required env var: WAYPOINT_API_KEY');
  console.error('    Set it to your Waypoint API key.');
  process.exit(1);
}

const apiBaseUrl = process.env.WAYPOINT_API_URL || 'http://localhost:3000';

// ── Directories to watch ────────────────────────────────────────
const DAILY_DIR   = path.join(vaultPath, 'daily');
const PROJECTS_DIR = path.join(vaultPath, 'projects');

// ── Debounce registry ───────────────────────────────────────────
const debounceTimers = {};

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Parse YAML-ish frontmatter from markdown content.
 * Looks for lines between leading --- markers.
 * Returns { type, date } (both may be undefined if not found).
 */
function parseFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return {};

  const block = frontmatterMatch[1];
  const typeMatch = block.match(/^type:\s*(.+)$/m);
  const dateMatch = block.match(/^date:\s*(.+)$/m);

  return {
    type: typeMatch ? typeMatch[1].trim() : undefined,
    date: dateMatch ? dateMatch[1].trim() : undefined,
  };
}

/**
 * POST a file's content to the daily-entries API.
 */
function postEntry(filePath, isProjectFile, label) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`⚠️  Could not read ${path.basename(filePath)}: ${err.message}`);
    return;
  }

  const fm = parseFrontmatter(content);

  const type = isProjectFile
    ? (fm.type || 'project_note')
    : (fm.type || path.basename(filePath, '.md').replace(/^\d{4}-\d{2}-\d{2}-?/, '') || 'note');

  const date = isProjectFile
    ? (fm.date || new Date().toISOString().slice(0, 10))
    : (fm.date || path.basename(filePath, '.md').match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || new Date().toISOString().slice(0, 10));

  const body = JSON.stringify({ type, date, content });

  const url = new URL(`${apiBaseUrl}/api/daily-entries`);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port:     url.port || (isHttps ? 443 : 80),
    path:     url.pathname,
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body),
      'x-api-key':      apiKey,
    },
  };

  const req = transport.request(options, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log(`${label} ${path.basename(filePath)}`);
    } else {
      console.error(`⚠️  API returned ${res.statusCode} for ${path.basename(filePath)}`);
    }
    // Drain response
    res.resume();
  });

  req.on('error', (err) => {
    console.error(`⚠️  Request error for ${path.basename(filePath)}: ${err.message}`);
  });

  req.write(body);
  req.end();
}

/**
 * Sync all .md files in a directory.
 */
function syncDirectory(dir, isProjectDir) {
  if (!fs.existsSync(dir)) {
    console.warn(`⚠️  Directory not found, skipping: ${dir}`);
    return;
  }

  let files;
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  } catch (err) {
    console.error(`⚠️  Could not read directory ${dir}: ${err.message}`);
    return;
  }

  for (const file of files) {
    postEntry(path.join(dir, file), isProjectDir, '✅ Synced:');
  }
}

/**
 * Watch a directory and debounce file changes.
 */
function watchDirectory(dir, isProjectDir) {
  if (!fs.existsSync(dir)) {
    console.warn(`⚠️  Watch directory not found, skipping: ${dir}`);
    return;
  }

  fs.watch(dir, (eventType, filename) => {
    if (!filename || !filename.endsWith('.md')) return;
    if (eventType !== 'change' && eventType !== 'rename') return;

    const filePath = path.join(dir, filename);
    const key = filePath;

    if (debounceTimers[key]) clearTimeout(debounceTimers[key]);

    debounceTimers[key] = setTimeout(() => {
      delete debounceTimers[key];
      if (!fs.existsSync(filePath)) return; // file was deleted
      postEntry(filePath, isProjectDir, '🔄 Updated:');
    }, 500);
  });
}

// ── Startup sync ────────────────────────────────────────────────
console.log('🚀 Waypoint Vault Watcher starting…');
console.log('   Vault:', vaultPath);
console.log('   API:  ', apiBaseUrl);
console.log('');
console.log('📦 Bulk syncing daily entries…');
syncDirectory(DAILY_DIR, false);

console.log('📦 Bulk syncing project notes…');
syncDirectory(PROJECTS_DIR, true);

// ── Start watchers ──────────────────────────────────────────────
watchDirectory(DAILY_DIR, false);
watchDirectory(PROJECTS_DIR, true);

console.log('');
console.log('👁  Watching vault at:', vaultPath);

// Keep process alive
process.stdin.resume();
