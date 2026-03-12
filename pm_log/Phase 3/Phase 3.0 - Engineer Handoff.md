# Phase 3.0 — Engineer Handoff

## Agent Prompt

You are building Phase 3.0 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase wires Waypoint to Google Calendar and ships the Today view — a committed daily plan surface with morning proposal, mid-day active state, and EOD wrap. It also ships the sidebar Views nav that all future views (Library, Analytics, Advisor, Memory) will live in. Read `pm_log/Phase 3/Phase 3.0 - Engineer Handoff.md` in full before writing any code, then use `dev_tracker/Phase 3.0 - Calendar + Today View.md` as your working checklist. Mark items complete as you finish them.

---

You are building Phase 3.0 of Waypoint — a single-user personal execution OS at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 3/Phase 3.0 - Calendar Integration & Today View.md` — full phase spec
2. `dev_tracker/Phase 3.0 - Calendar + Today View.md` — your working checklist
3. `src/routes/api.js` — understand the existing route structure, especially how outcomes, inbox, and the `POST /api/today/propose` shape should fit in
4. `src/services/claude.js` — understand `sendMessage`, `streamFocusMessage` patterns; you'll add new Claude functions here
5. `src/database/index.js` — understand the DB singleton pattern and how new tables are initialized
6. `public/index.html` — find the sidebar rendering code and the `renderCenter()` function; understand how views are switched
7. `src/database/oauth-tokens.js` — understand how Slack OAuth tokens are stored; Google Calendar will use the same table

**Prerequisites:** Phase 2.6 complete and approved. ✅

---

## Known Codebase State

- **DB:** `better-sqlite3` (synchronous). New tables added via `initX()` functions in `src/database/`. Call `initX()` from `src/routes/api.js` at startup.
- **OAuth tokens:** `oauth_tokens` table already exists with columns `provider TEXT, access_token TEXT, refresh_token TEXT, expires_at TEXT, scope TEXT, created_at TEXT`. Google Calendar will use `provider = 'google_calendar'`.
- **`src/services/claude.js`:** Exports `sendMessage`, `classifyForInbox`, `sendWithTools`, `streamFocusMessage`, `batchTriageInbox`. The `anthropic` client is already instantiated. Add new functions, update `module.exports`.
- **Sidebar:** The sidebar is rendered in `public/index.html`. Find the sidebar HTML and add the Views nav section. The `sb-item` and `sb-item.active` CSS classes already exist.
- **Model ID to use:** `claude-sonnet-4-6`
- **`escHtml`** (not `escapeHtml`) is the XSS-safe helper in `public/index.html`.

---

## Pre-Build Checklist

- [ ] Read `src/database/oauth-tokens.js` — confirm `saveOAuthToken(provider, tokenData)` and `getOAuthToken(provider)` signatures
- [ ] Read `src/routes/api.js` — find where new routes should go (calendar section, today section)
- [ ] Read `public/index.html` — find sidebar HTML, find `renderCenter()`, understand how `currentView` or equivalent state variable controls which panel renders
- [ ] Read `src/database/index.js` — understand `initDatabase()` and how to add new `initX()` calls

---

## Workstream 1 — Google Calendar Service (`src/services/google-calendar.js`)

Create a new file: `src/services/google-calendar.js`

```js
const { google } = require('googleapis');
const oauthTokensDb = require('../database/oauth-tokens');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI  // e.g. http://localhost:PORT/api/calendar/callback
  );
}

async function getAuthenticatedClient() {
  const tokenData = oauthTokensDb.getOAuthToken('google_calendar');
  if (!tokenData) throw new Error('Google Calendar not connected');

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
  });

  // Refresh token if within 5 minutes of expiry
  const expiresAt = new Date(tokenData.expires_at).getTime();
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauthTokensDb.saveOAuthToken('google_calendar', {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || tokenData.refresh_token,
      expires_at: new Date(credentials.expiry_date).toISOString(),
      scope: SCOPES.join(' '),
    });
    oauth2Client.setCredentials(credentials);
  }

  return oauth2Client;
}

async function getEventsForDate(date) {
  // date: 'YYYY-MM-DD' string
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

function getOpenWindows(events, workdayStart = '08:00', workdayEnd = '18:00') {
  // Returns array of { start_at, end_at, duration_minutes }
  // representing gaps between events within the workday window
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
  oauthTokensDb.saveOAuthToken('google_calendar', {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(tokens.expiry_date).toISOString(),
    scope: SCOPES.join(' '),
  });
  return tokens;
}

module.exports = { getEventsForDate, getOpenWindows, getAuthUrl, handleCallback };
```

**Install:** `npm install googleapis`

---

## Workstream 2 — DB Tables (`src/database/calendar.js`)

Create `src/database/calendar.js`:

```js
const db = require('./index');

function initCalendarTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE NOT NULL,
      provider TEXT DEFAULT 'google',
      title TEXT,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      is_blocked INTEGER DEFAULT 1,
      fetched_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      committed_outcome_ids TEXT,
      committed_action_ids TEXT,
      total_estimated_minutes INTEGER,
      available_minutes INTEGER,
      confirmed_at TEXT,
      actual_completed_action_ids TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function upsertCalendarEvents(events) {
  const stmt = db.prepare(`
    INSERT INTO calendar_events (external_id, title, start_at, end_at, is_blocked, fetched_at)
    VALUES (@external_id, @title, @start_at, @end_at, @is_blocked, datetime('now'))
    ON CONFLICT(external_id) DO UPDATE SET
      title = excluded.title,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      fetched_at = excluded.fetched_at
  `);
  const insert = db.transaction(evts => {
    for (const e of evts) stmt.run(e);
  });
  insert(events);
}

function getEventsForDate(date) {
  return db.prepare(`
    SELECT * FROM calendar_events
    WHERE start_at >= ? AND start_at < ?
    ORDER BY start_at ASC
  `).all(`${date}T00:00:00`, `${date}T24:00:00`);
}

function getTodayPlan(date) {
  return db.prepare('SELECT * FROM daily_plans WHERE date = ?').get(date) || null;
}

function upsertDailyPlan(date, data) {
  const existing = getTodayPlan(date);
  if (existing) {
    db.prepare(`
      UPDATE daily_plans SET
        committed_outcome_ids = @committed_outcome_ids,
        committed_action_ids = @committed_action_ids,
        total_estimated_minutes = @total_estimated_minutes,
        available_minutes = @available_minutes,
        confirmed_at = @confirmed_at,
        actual_completed_action_ids = @actual_completed_action_ids,
        updated_at = datetime('now')
      WHERE date = @date
    `).run({ date, ...data });
  } else {
    db.prepare(`
      INSERT INTO daily_plans (date, committed_outcome_ids, committed_action_ids,
        total_estimated_minutes, available_minutes, confirmed_at, actual_completed_action_ids)
      VALUES (@date, @committed_outcome_ids, @committed_action_ids,
        @total_estimated_minutes, @available_minutes, @confirmed_at, @actual_completed_action_ids)
    `).run({ date, ...data });
  }
  return getTodayPlan(date);
}

module.exports = { initCalendarTables, upsertCalendarEvents, getEventsForDate, getTodayPlan, upsertDailyPlan };
```

In `src/routes/api.js`, require and init:
```js
const calendarDb = require('../database/calendar');
// in init section:
calendarDb.initCalendarTables();
```

---

## Workstream 3 — Calendar + Today API Routes (`src/routes/api.js`)

Add a "Calendar" section to `api.js`:

```js
// ─── CALENDAR ──────────────────────────────────────────────────────────

const googleCalendar = require('../services/google-calendar');

// GET /api/calendar/connect — redirect to Google OAuth
router.get('/calendar/connect', (req, res) => {
  res.redirect(googleCalendar.getAuthUrl());
});

// GET /api/calendar/callback — handle OAuth callback
router.get('/calendar/callback', async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');
    await googleCalendar.handleCallback(code);
    res.redirect('/?calendar=connected');
  } catch (err) { next(err); }
});

// GET /api/calendar/today — fetch + store today's events, return events + open windows
router.get('/calendar/today', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const events = await googleCalendar.getEventsForDate(today);
    calendarDb.upsertCalendarEvents(events);
    const windows = googleCalendar.getOpenWindows(events);
    res.json({ success: true, data: { events, windows, date: today } });
  } catch (err) { next(err); }
});

// ─── TODAY PLAN ────────────────────────────────────────────────────────

// POST /api/today/propose — Claude generates committed day proposal
router.post('/today/propose', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const calendarData = await googleCalendar.getEventsForDate(today);
    const windows = googleCalendar.getOpenWindows(calendarData);

    // Fetch all active outcomes + actions
    const outcomes = outcomesDb.getActiveOutcomes();
    const allActions = outcomes.flatMap(o => ({
      outcome_id: o.id,
      outcome_title: o.title,
      deadline: o.deadline,
      actions: actionsDb.getActionsByOutcome(o.id).filter(a => !a.done && !a.blocked),
    }));

    const contextSnapshot = userContextDb.getContextSnapshot();
    const proposal = await claudeService.proposeTodayPlan(windows, allActions, contextSnapshot);

    res.json({ success: true, data: proposal });
  } catch (err) { next(err); }
});

// POST /api/today/confirm — user confirms the plan
router.post('/today/confirm', (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { action_ids, outcome_ids, available_minutes } = req.body;
    const plan = calendarDb.upsertDailyPlan(today, {
      committed_action_ids: JSON.stringify(action_ids || []),
      committed_outcome_ids: JSON.stringify(outcome_ids || []),
      total_estimated_minutes: req.body.total_estimated_minutes || null,
      available_minutes: available_minutes || null,
      confirmed_at: new Date().toISOString(),
      actual_completed_action_ids: '[]',
    });
    res.json({ success: true, data: plan });
  } catch (err) { next(err); }
});

// GET /api/today/status — current plan + completion state
router.get('/today/status', (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const plan = calendarDb.getTodayPlan(today);
    if (!plan) return res.json({ success: true, data: { state: 'no_plan' } });

    const committedIds = JSON.parse(plan.committed_action_ids || '[]');
    const completedIds = JSON.parse(plan.actual_completed_action_ids || '[]');

    // Determine state
    const hour = new Date().getHours();
    const state = !plan.confirmed_at ? 'proposal'
      : hour >= 17 ? 'eod'
      : 'active';

    res.json({ success: true, data: { plan, state, committedIds, completedIds } });
  } catch (err) { next(err); }
});

// POST /api/today/complete-action — mark an action done in today's plan
router.post('/today/complete-action', (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { action_id } = req.body;
    const plan = calendarDb.getTodayPlan(today);
    if (!plan) return res.status(404).json({ success: false, error: 'No plan for today' });

    const completed = JSON.parse(plan.actual_completed_action_ids || '[]');
    if (!completed.includes(action_id)) completed.push(action_id);

    calendarDb.upsertDailyPlan(today, {
      committed_outcome_ids: plan.committed_outcome_ids,
      committed_action_ids: plan.committed_action_ids,
      total_estimated_minutes: plan.total_estimated_minutes,
      available_minutes: plan.available_minutes,
      confirmed_at: plan.confirmed_at,
      actual_completed_action_ids: JSON.stringify(completed),
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/today/recommendation — mid-day Claude recommendation
router.get('/today/recommendation', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const plan = calendarDb.getTodayPlan(today);
    if (!plan) return res.json({ success: true, data: { recommendation: null } });

    const calendarData = calendarDb.getEventsForDate(today);
    const windows = googleCalendar.getOpenWindows(calendarData);

    const committedIds = JSON.parse(plan.committed_action_ids || '[]');
    const completedIds = JSON.parse(plan.actual_completed_action_ids || '[]');
    const remainingIds = committedIds.filter(id => !completedIds.includes(id));

    const recommendation = await claudeService.generateTodayRecommendation(
      remainingIds, windows, calendarData
    );
    res.json({ success: true, data: { recommendation } });
  } catch (err) { next(err); }
});
```

**Note:** `outcomesDb`, `actionsDb`, `userContextDb`, `claudeService` are already required in `api.js`. Add `calendarDb` and `googleCalendar` requires at the top.

---

## Workstream 4 — Claude Functions (`src/services/claude.js`)

Add two new functions:

```js
async function proposeTodayPlan(windows, outcomes, contextSnapshot) {
  const windowStr = windows.map(w =>
    `${new Date(w.start_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}–${new Date(w.end_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}: ${w.duration_minutes} min`
  ).join('\n');

  const outcomeStr = outcomes.map(o =>
    `Outcome: ${o.outcome_title}${o.deadline ? ` (due ${o.deadline})` : ''}\n` +
    o.actions.map(a => `  - ${a.title} [${a.energy_type || 'deep'}, ${a.time_estimate || '?'} min]`).join('\n')
  ).join('\n\n');

  const contextBlock = contextSnapshot ? `\nUser work patterns:\n${contextSnapshot}\n` : '';

  const prompt = `You are planning someone's workday. Today's available work windows:
${windowStr}
${contextBlock}
Active outcomes and their next actions:
${outcomeStr}

Instructions:
1. Select the highest-priority actions that fit within available time
2. Match deep-energy actions to larger blocks, light actions to smaller windows
3. Flag any deadline risk
4. Return valid JSON only — no markdown, no explanation

Response format:
{
  "committed_actions": [
    { "action_id": number, "outcome_id": number, "reason": "string" }
  ],
  "available_minutes": number,
  "committed_minutes": number,
  "flags": ["string"],
  "overcommitted": boolean
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '';
  const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try {
    return JSON.parse(json);
  } catch (e) {
    throw new Error(`Today proposal parse error: ${e.message}`);
  }
}

async function generateTodayRecommendation(remainingActionIds, windows, calendarEvents) {
  if (!remainingActionIds.length) return 'All planned tasks complete. Solid day.';

  const now = new Date();
  const nextEvent = calendarEvents
    .filter(e => new Date(e.start_at) > now)
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0];

  const currentWindow = windows.find(w =>
    new Date(w.start_at) <= now && new Date(w.end_at) >= now
  );

  const prompt = `Mid-day assessment for a productivity app. In one sentence, tell the user what to do next. Be specific: name the current work window time if available, mention the next meeting if there is one, and reference that there's still work remaining. Plain text, no markdown. Max 25 words.

Current time: ${now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
Current block: ${currentWindow ? `${new Date(currentWindow.start_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}–${new Date(currentWindow.end_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : 'none'}
Next meeting: ${nextEvent ? `${nextEvent.title} at ${new Date(nextEvent.start_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : 'none'}
Remaining tasks: ${remainingActionIds.length}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content.find(b => b.type === 'text')?.text?.trim() || '';
}
```

Update `module.exports`:
```js
module.exports = { sendMessage, classifyForInbox, sendWithTools, streamFocusMessage, batchTriageInbox, proposeTodayPlan, generateTodayRecommendation };
```

---

## Workstream 5 — Frontend: Sidebar Views Nav + Today View (`public/index.html`)

### 5A — Sidebar Views Section

In the sidebar HTML (inside the `<aside>` sidebar element), add a new "Views" section. Find the existing "Recently Closed" or "Projects" sidebar section and insert above it:

```html
<!-- Views nav -->
<div class="px-3 py-3 border-b border-gray-100">
  <div class="text-gray-400 font-semibold uppercase tracking-wider mb-1.5 px-1" style="font-size:10px;">Views</div>
  <div class="space-y-0.5">
    <div class="sb-item flex items-center gap-2 px-2 py-1.5" id="nav-today" onclick="showTodayView()">
      <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
      <span style="font-size:11px;">Today</span>
    </div>
    <div class="sb-item flex items-center gap-2 px-2 py-1.5" id="nav-library">
      <!-- Library icon SVG -->
      <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
      </svg>
      <span class="text-gray-400" style="font-size:11px;">Library</span>
      <span class="ml-auto text-gray-300 font-medium" style="font-size:9px;">Soon</span>
    </div>
    <div class="sb-item flex items-center gap-2 px-2 py-1.5" id="nav-analytics">
      <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
      </svg>
      <span class="text-gray-400" style="font-size:11px;">Analytics</span>
      <span class="ml-auto text-gray-300 font-medium" style="font-size:9px;">Soon</span>
    </div>
    <div class="sb-item flex items-center gap-2 px-2 py-1.5" id="nav-advisor">
      <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
      </svg>
      <span class="text-gray-400 flex-1" style="font-size:11px;">Advisor</span>
      <!-- Amber dot — hidden until Phase 4.3, but slot reserved: -->
      <!-- <span class="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0" id="advisor-dot" style="display:none;"></span> -->
    </div>
    <div class="sb-item flex items-center gap-2 px-2 py-1.5" id="nav-memory" onclick="showMemoryView()">
      <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
      </svg>
      <span style="font-size:11px;">Memory</span>
    </div>
  </div>
</div>
```

**Active state helper:** When a view becomes active, add `.active` to the relevant `nav-*` div and set the icon + text color to blue. Remove active from others.

### 5B — Today View Render

Add `showTodayView()` and a `renderTodayView()` function. The Today view replaces the center panel content (same pattern as how Focus Mode or the Memory panel are shown).

**Proposal state (morning, no confirmed plan):**
- Fetch `GET /api/calendar/today` for events + windows
- Fetch `POST /api/today/propose` for Claude's plan
- Render:
  - Header: "Today · [Day, Date]" + available time subtitle
  - Calendar strip: horizontal scrollable row of event pills (`9am Standup · 30m`, etc.)
  - Divider
  - "Claude's Suggested Plan" label
  - Action card list (deep=purple dot, light=blue dot, with outcome subtitle + energy badge + time)
  - Running total bar
  - ⚠ Flag card(s) for deadline risks (from `proposal.flags`)
  - [Adjust] and [Confirm plan →] buttons

**Active state (mid-day, confirmed plan):**
- Header: "Today · [Day, Date]" + live clock (right-aligned)
- "N of N tasks · Xh Ym done" subtitle
- Progress bar with pace percentage
- Task list: completed tasks = faded green card with strikethrough; remaining task = white card with indigo border + "Focus →" button
- ✦ Claude note card at bottom (fetch from `GET /api/today/recommendation`)

**EOD state:**
- Header: "Today · [Day, Date]"
- "Day complete. N of N tasks done."
- Task checklist (done vs. not done)
- Claude quote from `GET /api/today/recommendation` (EOD flavor)
- [Move unfinished to tomorrow] + [Dismiss] buttons

**State detection:** Use `GET /api/today/status` which returns `state: 'proposal' | 'active' | 'eod'`.

### 5C — Today Right Panel ("Calendar Today")

When Today view is active, the right panel renders the "Calendar Today" panel — replace the Execution Intelligence panel. Structure:

```
Calendar Today
──────────────
● Connected: Google Calendar

[Event cards: one per event, name + time range + duration]

Available Blocks
──────────────
[Block cards with time range + duration]
```

In the mid-day active state, additionally:
- Past events: faded, crossed-out title
- Current block: highlighted (blue background), "Now · Deep work block", remaining time
- A "Recommendation" card (blue tint) with the recommendation text from `GET /api/today/recommendation`

### 5D — Live Clock

In the mid-day state, add a live clock to the center header:

```js
let _clockInterval = null;

function startLiveClock(elementId) {
  clearInterval(_clockInterval);
  function update() {
    const el = document.getElementById(elementId);
    if (!el) { clearInterval(_clockInterval); return; }
    const now = new Date();
    const h = now.getHours() % 12 || 12;
    const m = now.getMinutes().toString().padStart(2, '0');
    const ampm = now.getHours() >= 12 ? 'pm' : 'am';
    el.textContent = `${h}:${m}${ampm}`;
  }
  update();
  _clockInterval = setInterval(update, 60000);
}
```

Call `startLiveClock('today-clock')` after rendering the active state. Stop the interval when navigating away from Today.

---

## Environment Variables Needed

Add to `.env`:
```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:PORT/api/calendar/callback
```

User will need to create a Google Cloud project and enable the Google Calendar API. Document the setup steps in a `CALENDAR_SETUP.md` or in a comment at the top of `google-calendar.js`.

---

## Key Constraints

- **Provider-abstracted:** All calendar logic is in `src/services/google-calendar.js`. The Today view routes only call `getEventsForDate` and `getOpenWindows` — they never import `googleapis` directly. This allows Outlook to slot in as provider B later.
- **Read-only:** Never write events back to Google Calendar. `readonly` scope only.
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, all integrations, `src/utils/crypto.js`, `src/database/oauth-tokens.js` (only use it — don't modify the table schema).
- **Existing views unchanged:** Focus Mode, Inbox, Outcomes list, Archive flow all unchanged.

---

## Files You Will Touch

| File | What changes |
|---|---|
| `src/services/google-calendar.js` | **CREATE** — Calendar OAuth + events + open windows |
| `src/database/calendar.js` | **CREATE** — `calendar_events` + `daily_plans` tables |
| `src/services/claude.js` | Add `proposeTodayPlan`, `generateTodayRecommendation` |
| `src/routes/api.js` | Add calendar OAuth routes + Today plan routes |
| `public/index.html` | Sidebar Views nav, `showTodayView()`, Today render (3 states), right panel, live clock |
| `.env` | Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |

Six files (+ env).

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 3.0 - Calendar + Today View.md`. Log decisions. Flag for PM review.
