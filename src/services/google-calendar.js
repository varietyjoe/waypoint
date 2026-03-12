/**
 * Google Calendar Service — Phase 3.0
 *
 * Provider-abstracted: all Google-specific logic lives here.
 * Today view routes call getEventsForDate() and getOpenWindows() only.
 * To add Outlook later, create google-calendar-outlook.js with the same exports.
 *
 * Setup:
 *  1. Create a Google Cloud project at https://console.cloud.google.com
 *  2. Enable the Google Calendar API
 *  3. Create OAuth 2.0 credentials (Web application type)
 *  4. Add http://localhost:PORT/api/calendar/callback as an authorized redirect URI
 *  5. Copy client ID, secret, and redirect URI into .env
 */

const { google } = require('googleapis');
const db = require('../database/index');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

// ─── Token storage using a dedicated google_calendar_tokens table ─────────────
// The existing oauth_tokens table has a CHECK constraint limiting service to
// 'slack' | 'grain', so we use a separate lightweight table here.

function initGoogleTokenTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_calendar_tokens (
      id INTEGER PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TEXT,
      scope TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function saveGoogleToken(tokenData) {
  const existing = db.prepare('SELECT id FROM google_calendar_tokens LIMIT 1').get();
  if (existing) {
    db.prepare(`
      UPDATE google_calendar_tokens SET
        access_token = ?,
        refresh_token = COALESCE(?, refresh_token),
        expires_at = ?,
        scope = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(tokenData.access_token, tokenData.refresh_token, tokenData.expires_at, tokenData.scope, existing.id);
  } else {
    db.prepare(`
      INSERT INTO google_calendar_tokens (access_token, refresh_token, expires_at, scope)
      VALUES (?, ?, ?, ?)
    `).run(tokenData.access_token, tokenData.refresh_token, tokenData.expires_at, tokenData.scope);
  }
}

function getGoogleToken() {
  return db.prepare('SELECT * FROM google_calendar_tokens LIMIT 1').get() || null;
}

// Initialize table immediately on require
initGoogleTokenTable();

// ─── OAuth Client ─────────────────────────────────────────────────────────────

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

async function getAuthenticatedClient() {
  const tokenData = getGoogleToken();
  if (!tokenData) throw new Error('Google Calendar not connected');

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
  });

  // Refresh token if within 5 minutes of expiry
  if (tokenData.expires_at) {
    const expiresAt = new Date(tokenData.expires_at).getTime();
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      saveGoogleToken({
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || tokenData.refresh_token,
        expires_at: new Date(credentials.expiry_date).toISOString(),
        scope: SCOPES.join(' '),
      });
      oauth2Client.setCredentials(credentials);
    }
  }

  return oauth2Client;
}

// ─── Calendar Provider Interface ──────────────────────────────────────────────

/**
 * Fetch events from primary Google Calendar for a given date.
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {Promise<Array>} Normalized event objects
 */
async function getEventsForDate(date) {
  const auth = await getAuthenticatedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const startOfDay = new Date(date + 'T00:00:00');
  const endOfDay = new Date(date + 'T23:59:59');

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (response.data.items || []).map(event => ({
    external_id: event.id,
    title: event.summary || 'Untitled event',
    start_at: event.start?.dateTime || event.start?.date,
    end_at: event.end?.dateTime || event.end?.date,
    is_blocked: 1,
  }));
}

/**
 * Calculate open work windows from a list of events.
 * Provider-agnostic: takes normalized event objects.
 * @param {Array} events - Normalized event objects from getEventsForDate
 * @param {string} workdayStart - 'HH:MM' (default '08:00')
 * @param {string} workdayEnd - 'HH:MM' (default '18:00')
 * @returns {Array} Array of { start_at, end_at, duration_minutes }
 */
function getOpenWindows(events, workdayStart = '08:00', workdayEnd = '18:00') {
  const today = new Date().toISOString().slice(0, 10);
  const dayStart = new Date(`${today}T${workdayStart}:00`).getTime();
  const dayEnd = new Date(`${today}T${workdayEnd}:00`).getTime();

  const blocked = events
    .filter(e => e.is_blocked)
    .map(e => ({
      start: new Date(e.start_at).getTime(),
      end: new Date(e.end_at).getTime(),
    }))
    .sort((a, b) => a.start - b.start);

  const windows = [];
  let cursor = dayStart;

  for (const block of blocked) {
    const blockStart = Math.max(block.start, dayStart);
    const blockEnd = Math.min(block.end, dayEnd);
    if (blockStart > cursor) {
      const duration = Math.round((blockStart - cursor) / 60000);
      if (duration >= 15) {
        windows.push({
          start_at: new Date(cursor).toISOString(),
          end_at: new Date(blockStart).toISOString(),
          duration_minutes: duration,
        });
      }
    }
    cursor = Math.max(cursor, blockEnd);
  }

  if (cursor < dayEnd) {
    const duration = Math.round((dayEnd - cursor) / 60000);
    if (duration >= 15) {
      windows.push({
        start_at: new Date(cursor).toISOString(),
        end_at: new Date(dayEnd).toISOString(),
        duration_minutes: duration,
      });
    }
  }

  return windows;
}

// ─── OAuth Flow ───────────────────────────────────────────────────────────────

function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

async function handleCallback(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  saveGoogleToken({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(tokens.expiry_date).toISOString(),
    scope: SCOPES.join(' '),
  });
  return tokens;
}

/**
 * Check if Google Calendar is currently connected.
 * @returns {boolean}
 */
function isConnected() {
  return !!getGoogleToken();
}

module.exports = { getEventsForDate, getOpenWindows, getAuthUrl, handleCallback, isConnected };
