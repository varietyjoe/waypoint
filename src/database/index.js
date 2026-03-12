/**
 * Database connection using better-sqlite3
 * This replaces the async sqlite3 approach with a synchronous one
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../database/waypoint.db');

// Create database connection
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

module.exports = db;
