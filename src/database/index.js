/**
 * Database connection using better-sqlite3
 * This replaces the async sqlite3 approach with a synchronous one
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../database/waypoint.db');

// Ensure the directory exists (Railway volume may not be mounted)
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  console.log(`📂 Creating database directory: ${dbDir}`);
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create database connection
console.log(`📦 Opening database at: ${DB_PATH}`);
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

module.exports = db;
