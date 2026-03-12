# Phase 3.1 — Engineer Handoff

## Agent Prompt

You are building Phase 3.1 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase adds three scheduled Slack messages per day — a Morning Brief, Midday Pulse, and EOD Wrap — each Claude-generated and tailored to the user's actual outcomes, calendar, and plan. Read `pm_log/Phase 3/Phase 3.1 - Engineer Handoff.md` in full before writing any code, then use `dev_tracker/Phase 3.1 - Morning Brief.md` as your working checklist. Mark items complete as you finish them.

---

You are building Phase 3.1 of Waypoint — a single-user personal execution OS at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 3/Phase 3.1 - Morning Brief.md` — full phase spec
2. `dev_tracker/Phase 3.1 - Morning Brief.md` — your working checklist
3. `src/routes/slack.js` — understand the existing Slack bot infrastructure, how `sendSlackDM` or equivalent works, where the bot token comes from
4. `src/services/claude.js` — understand the pattern for new Claude functions; use `anthropic.messages.create()` directly (not streaming, not tool use)
5. `src/server.js` — find where to add cron jobs; understand how the server initializes
6. `src/database/index.js` — understand the DB singleton; you'll add a `user_preferences` table
7. `src/database/calendar.js` — you'll read `daily_plans` and `calendar_events` from Phase 3.0

**Prerequisites:** Phase 3.0 complete and approved. ✅

---

## Known Codebase State

- **Slack infrastructure:** The bot token and Slack client are already set up in `src/routes/slack.js`. Find the existing Slack API call pattern and reuse it for DMs. The function to send a DM is either already exported or easily extractable.
- **Node-cron:** Check `package.json` — if `node-cron` is not installed, run `npm install node-cron`. Use `cron.schedule('0 45 7 * * *', fn, { timezone: 'America/Chicago' })` pattern (adjust for user's stored timezone).
- **Model ID:** `claude-sonnet-4-6`
- **`better-sqlite3`** is synchronous. All DB calls are sync.

---

## Pre-Build Checklist

- [ ] Read `src/routes/slack.js` — find how Slack messages are sent (look for `client.chat.postMessage` or similar). Identify how to get the bot token.
- [ ] Read `src/server.js` — understand initialization order; find where to add cron job setup
- [ ] Check `package.json` — confirm `node-cron` is installed (or install it)
- [ ] Read `src/database/calendar.js` — confirm `getTodayPlan()` and `getEventsForDate()` signatures

---

## Workstream 1 — DB: `user_preferences` Table (`src/database/user-preferences.js`)

Create `src/database/user-preferences.js`:

```js
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
```

Call `initUserPreferences()` from `src/routes/api.js` at startup (alongside other `initX()` calls).

---

## Workstream 2 — Briefings Service (`src/services/briefings.js`)

Create `src/services/briefings.js`:

```js
const anthropic = require('./claude').anthropic; // re-export anthropic client from claude.js, or require directly
const outcomesDb = require('../database/outcomes');
const actionsDb = require('../database/actions');
const calendarDb = require('../database/calendar');
const userContextDb = require('../database/user-context');
const prefDb = require('../database/user-preferences');

// Helper: call Claude for plain-text briefing content
async function callClaude(prompt) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content.find(b => b.type === 'text')?.text?.trim() || '';
}

async function generateMorningBrief() {
  const today = new Date().toISOString().slice(0, 10);
  const outcomes = outcomesDb.getActiveOutcomes();
  const calendarEvents = calendarDb.getEventsForDate(today);
  const plan = calendarDb.getTodayPlan(today);
  const contextSnapshot = userContextDb.getContextSnapshot();

  // Inbox count
  let inboxCount = 0;
  try {
    const inboxDb = require('../database/inbox');
    inboxCount = inboxDb.getPendingInboxItems().length;
  } catch (e) { /* inbox may be empty */ }

  const deadlineFlags = outcomes
    .filter(o => o.deadline)
    .map(o => `${o.title} (due ${o.deadline})`)
    .join(', ');

  const prompt = `Write a morning brief for a personal execution OS user. 4–6 lines max. Plain text, no markdown, no bullet points. Conversational but sharp. Surface the 1–2 most important things. End with something that makes the user want to open the app to plan their day. Do not list every outcome. Do not mention things with no urgency.

Active outcomes: ${outcomes.map(o => o.title).join(', ') || 'none'}
Deadline urgency: ${deadlineFlags || 'none'}
Calendar today: ${calendarEvents.length > 0 ? calendarEvents.map(e => `${e.title} at ${new Date(e.start_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`).join(', ') : 'no events fetched yet'}
Inbox items waiting: ${inboxCount}
${contextSnapshot ? `\nUser context:\n${contextSnapshot}` : ''}`;

  return callClaude(prompt);
}

async function generateMiddayPulse() {
  const today = new Date().toISOString().slice(0, 10);
  const plan = calendarDb.getTodayPlan(today);

  if (!plan || !plan.confirmed_at) {
    return 'Midday check — no plan confirmed yet today. Head to Waypoint to set one.';
  }

  const committedIds = JSON.parse(plan.committed_action_ids || '[]');
  const completedIds = JSON.parse(plan.actual_completed_action_ids || '[]');
  const remaining = committedIds.length - completedIds.length;

  const prompt = `Write a midday pulse message for a personal execution OS. 2–3 lines. Plain text, no markdown. Assess whether the user is on pace, name what's done and what remains. Tone: direct, not cheerleader-y.

Tasks committed today: ${committedIds.length}
Tasks completed so far: ${completedIds.length}
Tasks remaining: ${remaining}`;

  return callClaude(prompt);
}

async function generateEODWrap() {
  const today = new Date().toISOString().slice(0, 10);
  const plan = calendarDb.getTodayPlan(today);

  if (!plan) {
    return 'End of day — no plan was set today. Tomorrow, try confirming a plan in the morning.';
  }

  const committedIds = JSON.parse(plan.committed_action_ids || '[]');
  const completedIds = JSON.parse(plan.actual_completed_action_ids || '[]');
  const notDone = committedIds.filter(id => !completedIds.includes(id));

  // Get tomorrow's calendar at a glance
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const tomorrowEvents = calendarDb.getEventsForDate(tomorrowStr);

  const prompt = `Write an end-of-day wrap for a personal execution OS. 3–4 lines. Plain text, no markdown. Acknowledge what was completed, note what carries to tomorrow, give a brief preview of tomorrow. Tone: like a trusted colleague, not a performance manager.

Done today: ${completedIds.length} of ${committedIds.length} tasks
Carrying forward: ${notDone.length} task(s)
Tomorrow: ${tomorrowEvents.length > 0 ? tomorrowEvents.map(e => e.title).join(', ') : 'no events yet'}`;

  return callClaude(prompt);
}

module.exports = { generateMorningBrief, generateMiddayPulse, generateEODWrap };
```

**Note:** If `anthropic` is not exported from `claude.js`, require `@anthropic-ai/sdk` directly in this file — the client is instantiated with `ANTHROPIC_API_KEY` from env.

---

## Workstream 3 — Slack DM Send Function

In `src/routes/slack.js` (or a new `src/services/slack.js`), add or extract a `sendSlackDM(userId, text)` function:

```js
async function sendSlackDM(userId, text) {
  // Use the existing Slack WebClient already instantiated in slack.js
  // or: const { WebClient } = require('@slack/web-api');
  //     const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  await client.chat.postMessage({
    channel: userId,  // Slack accepts user ID as channel for DMs
    text,
  });
}
```

Export it so `src/jobs/briefings.js` can import it.

---

## Workstream 4 — Cron Jobs (`src/jobs/briefings.js`)

Create `src/jobs/briefings.js`:

```js
const cron = require('node-cron');
const briefingsService = require('../services/briefings');
const prefDb = require('../database/user-preferences');
const { sendSlackDM } = require('../routes/slack'); // adjust import path

function parseCronTime(timeStr, timezone) {
  // timeStr: 'HH:MM', timezone: IANA string
  const [hour, minute] = timeStr.split(':').map(Number);
  return { hour, minute };
}

function scheduleBriefings() {
  const timezone = prefDb.getPreference('timezone') || 'America/Chicago';

  // Morning Brief
  const morning = parseCronTime(prefDb.getPreference('briefing_morning_time') || '07:45', timezone);
  cron.schedule(`${morning.minute} ${morning.hour} * * *`, async () => {
    const enabled = prefDb.getPreference('briefings_enabled');
    const userId = prefDb.getPreference('briefing_slack_user_id');
    if (enabled !== 'true' || !userId) return;
    try {
      const text = await briefingsService.generateMorningBrief();
      await sendSlackDM(userId, text);
      console.log('[Briefings] Morning brief sent');
    } catch (e) { console.error('[Briefings] Morning brief failed:', e.message); }
  }, { timezone });

  // Midday Pulse
  const midday = parseCronTime(prefDb.getPreference('briefing_midday_time') || '12:00', timezone);
  cron.schedule(`${midday.minute} ${midday.hour} * * *`, async () => {
    const enabled = prefDb.getPreference('briefings_enabled');
    const userId = prefDb.getPreference('briefing_slack_user_id');
    if (enabled !== 'true' || !userId) return;
    try {
      const text = await briefingsService.generateMiddayPulse();
      await sendSlackDM(userId, text);
      console.log('[Briefings] Midday pulse sent');
    } catch (e) { console.error('[Briefings] Midday pulse failed:', e.message); }
  }, { timezone });

  // EOD Wrap
  const eod = parseCronTime(prefDb.getPreference('briefing_eod_time') || '17:30', timezone);
  cron.schedule(`${eod.minute} ${eod.hour} * * *`, async () => {
    const enabled = prefDb.getPreference('briefings_enabled');
    const userId = prefDb.getPreference('briefing_slack_user_id');
    if (enabled !== 'true' || !userId) return;
    try {
      const text = await briefingsService.generateEODWrap();
      await sendSlackDM(userId, text);
      console.log('[Briefings] EOD wrap sent');
    } catch (e) { console.error('[Briefings] EOD wrap failed:', e.message); }
  }, { timezone });

  console.log('[Briefings] Scheduled: morning, midday, EOD');
}

module.exports = { scheduleBriefings };
```

In `src/server.js`, call after server starts:
```js
const { scheduleBriefings } = require('./jobs/briefings');
scheduleBriefings();
```

---

## Workstream 5 — API Routes + Settings UI

### 5A — Preferences API (`src/routes/api.js`)

Add routes for preferences:

```js
// GET /api/preferences — all preferences
router.get('/preferences', (req, res, next) => {
  try {
    res.json({ success: true, data: prefDb.getAllPreferences() });
  } catch (err) { next(err); }
});

// PUT /api/preferences/:key — set a preference
router.put('/preferences/:key', (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    prefDb.setPreference(key, value);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/briefings/test — send test morning brief now
router.post('/briefings/test', async (req, res, next) => {
  try {
    const userId = prefDb.getPreference('briefing_slack_user_id');
    if (!userId) return res.status(400).json({ success: false, error: 'No Slack user ID configured' });
    const text = await briefingsService.generateMorningBrief();
    await sendSlackDM(userId, text);
    res.json({ success: true, data: { sent: text } });
  } catch (err) { next(err); }
});
```

### 5B — Settings UI (`public/index.html`)

Add a "Briefings" section to the Memory/Settings panel (wherever the Memory view from Phase 2.2 lives). After the Memory tab area, add a "Briefings" settings block:

```html
<div style="margin-top:24px;padding-top:20px;border-top:1px solid #f3f4f6;">
  <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">Briefings</div>

  <!-- Toggle -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
    <span style="font-size:12px;color:#374151;">Daily briefings</span>
    <label style="position:relative;display:inline-block;width:36px;height:20px;">
      <input type="checkbox" id="briefings-toggle" onchange="savePref('briefings_enabled', this.checked ? 'true' : 'false')"
        style="opacity:0;width:0;height:0;">
      <span id="briefings-toggle-track" style="position:absolute;inset:0;background:#d1d5db;border-radius:10px;cursor:pointer;transition:.2s;"></span>
    </label>
  </div>

  <!-- Slack User ID -->
  <div style="margin-bottom:12px;">
    <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Slack user ID</div>
    <div style="display:flex;gap:8px;">
      <input id="briefings-slack-id" type="text" placeholder="U012AB3CD"
        style="flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:12px;outline:none;" />
      <button onclick="savePref('briefing_slack_user_id', document.getElementById('briefings-slack-id').value)"
        style="padding:6px 12px;background:#111827;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;">Save</button>
    </div>
  </div>

  <!-- Timezone -->
  <div style="margin-bottom:12px;">
    <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Timezone</div>
    <input id="briefings-timezone" type="text" placeholder="America/Chicago"
      onblur="savePref('timezone', this.value)"
      style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:12px;outline:none;" />
  </div>

  <!-- Test send -->
  <button onclick="sendTestBrief()"
    style="width:100%;padding:8px;background:transparent;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;color:#374151;cursor:pointer;">
    Send me a test brief now
  </button>
</div>
```

```js
async function savePref(key, value) {
  await fetch(`/api/preferences/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
}

async function sendTestBrief() {
  const btn = document.querySelector('[onclick="sendTestBrief()"]');
  if (btn) btn.textContent = 'Sending…';
  try {
    const res = await fetch('/api/briefings/test', { method: 'POST' });
    const data = await res.json();
    if (data.success) showToast('Test brief sent to Slack', 'success');
    else showToast(data.error || 'Send failed', 'warning');
  } catch (e) {
    showToast('Send failed', 'warning');
  }
  if (btn) btn.textContent = 'Send me a test brief now';
}

// On settings open: load saved preferences into fields
async function loadBriefingsSettings() {
  const res = await fetch('/api/preferences');
  const data = await res.json();
  const prefs = data.data;
  const toggle = document.getElementById('briefings-toggle');
  const slackId = document.getElementById('briefings-slack-id');
  const timezone = document.getElementById('briefings-timezone');
  if (toggle) toggle.checked = prefs.briefings_enabled === 'true';
  if (slackId) slackId.value = prefs.briefing_slack_user_id || '';
  if (timezone) timezone.value = prefs.timezone || 'America/Chicago';
}
```

---

## Key Constraints

- **Cron jobs must respect the `briefings_enabled` preference** — check at fire time, not at schedule time
- **Briefings send only if `briefing_slack_user_id` is set** — no default target
- **Plain text only** — no Slack Block Kit, no markdown in the Slack messages
- **Do not touch:** `src/routes/slack.js` core logic, `src/routes/grain.js`, all integrations, preserved DB tables

---

## Files You Will Touch

| File | What changes |
|---|---|
| `src/database/user-preferences.js` | **CREATE** — `user_preferences` table + CRUD |
| `src/services/briefings.js` | **CREATE** — `generateMorningBrief`, `generateMiddayPulse`, `generateEODWrap` |
| `src/jobs/briefings.js` | **CREATE** — three cron jobs |
| `src/routes/api.js` | Add preferences routes + test-send route |
| `src/server.js` | Call `scheduleBriefings()` on startup |
| `public/index.html` | Briefings settings UI in Memory/Settings panel |

Six files.

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 3.1 - Morning Brief.md`. Log decisions. Flag for PM review.
