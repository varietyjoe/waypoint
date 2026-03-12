# Phase 3.1 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 3.1 just completed — it adds three scheduled Slack briefings per day (Morning Brief, Midday Pulse, EOD Wrap), each Claude-generated and tailored to the user's actual outcomes, calendar, and plan. Read `pm_log/Phase 3/Phase 3.1 - Engineer Handoff.md` in full, then verify every checklist item against the actual codebase. End with a clear verdict: approved for Phase 3.2, or blocked with specifics. Log results to `test_tracker/Phase 3.1 - Morning Brief.md`.

---

**Read these files before reviewing:**
1. `pm_log/Phase 3/Phase 3.1 - Morning Brief.md` — full phase spec
2. `pm_log/Phase 3/Phase 3.1 - Engineer Handoff.md` — detailed implementation spec
3. `dev_tracker/Phase 3.1 - Morning Brief.md` — working checklist; verify each item complete

---

## What Was Built

Phase 3.1 adds five new files and modifies two:
- `src/database/user-preferences.js` — `user_preferences` table with defaults, `getPreference`, `setPreference`, `getAllPreferences`
- `src/services/briefings.js` — `generateMorningBrief`, `generateMiddayPulse`, `generateEODWrap`
- `src/jobs/briefings.js` — three `node-cron` schedules reading from preferences
- `src/routes/api.js` — preferences routes + test-send route
- `src/server.js` — calls `scheduleBriefings()` on startup
- `public/index.html` — Briefings settings UI in Memory/Settings panel

---

## Review Checklist

### `src/database/user-preferences.js`

- [ ] File exists and exports `initUserPreferences`, `getPreference`, `setPreference`, `getAllPreferences`
- [ ] `initUserPreferences()` creates `user_preferences` table with `IF NOT EXISTS`
- [ ] Schema: `key TEXT PRIMARY KEY`, `value TEXT NOT NULL`, `updated_at`
- [ ] Defaults seeded with `ON CONFLICT(key) DO NOTHING` — does not overwrite user-set values
- [ ] Default keys present: `timezone`, `briefings_enabled`, `briefing_slack_user_id`, `briefing_morning_time`, `briefing_midday_time`, `briefing_eod_time`
- [ ] Default times: morning `07:45`, midday `12:00`, EOD `17:30`
- [ ] `getPreference(key)` returns value string or `null` if missing
- [ ] `setPreference(key, value)` upserts — updates `updated_at`
- [ ] `getAllPreferences()` returns a plain object `{ key: value, ... }` (not an array)
- [ ] All functions use synchronous `better-sqlite3` (no `await`, no `.then()`)
- [ ] `initUserPreferences()` is called from `src/routes/api.js` at startup

---

### `src/services/briefings.js`

- [ ] File exists and exports `generateMorningBrief`, `generateMiddayPulse`, `generateEODWrap`
- [ ] All three functions are `async`
- [ ] Uses `anthropic.messages.create()` directly — not streaming, not tool use
- [ ] Model is `claude-sonnet-4-6`
- [ ] `max_tokens` is reasonable (≤ 400)
- [ ] `generateMorningBrief()` includes: active outcomes, deadline urgency, today's calendar events, inbox count
- [ ] `generateMorningBrief()` prompt instructs plain text, no markdown, no bullet points
- [ ] `generateMiddayPulse()` reads `daily_plans` for today — checks `confirmed_at` before generating; falls back gracefully if no plan confirmed
- [ ] `generateMiddayPulse()` includes committed vs completed task counts
- [ ] `generateEODWrap()` includes done/total tasks + tomorrow's calendar events
- [ ] All three return plain text strings (not JSON, not markdown)
- [ ] No `await` errors — all async calls properly awaited
- [ ] Error in one briefing does not crash the server

---

### `src/jobs/briefings.js`

- [ ] File exists and exports `scheduleBriefings`
- [ ] Uses `node-cron` — check `package.json` to confirm `node-cron` is installed
- [ ] Three separate `cron.schedule()` calls — morning, midday, EOD
- [ ] Each cron reads `briefing_*_time` from `prefDb.getPreference()` at fire time (not at schedule time — preferences can change)
- [ ] Each cron checks `briefings_enabled !== 'true'` and returns early if disabled
- [ ] Each cron checks `briefing_slack_user_id` is non-empty before sending
- [ ] Each cron has `try/catch` with `console.error` on failure — no unhandled promise rejections
- [ ] `timezone` option passed to `cron.schedule()` using stored `timezone` preference
- [ ] `scheduleBriefings()` is called from `src/server.js` after server starts

---

### `src/routes/api.js` — Preferences + Test-Send Routes

- [ ] `prefDb` (`user-preferences.js`) properly required at top of file
- [ ] `initUserPreferences()` called at startup alongside other `initX()` calls
- [ ] `GET /api/preferences` returns `{ success: true, data: { key: value, ... } }`
- [ ] `PUT /api/preferences/:key` accepts `{ value }` in body, calls `setPreference`, returns `{ success: true }`
- [ ] `POST /api/briefings/test` — calls `generateMorningBrief()` + `sendSlackDM()` and returns `{ success: true, data: { sent: text } }`
- [ ] `POST /api/briefings/test` returns `400` with error message if no Slack user ID configured
- [ ] No existing routes modified

---

### `src/routes/slack.js` (or wherever `sendSlackDM` lives)

- [ ] `sendSlackDM(userId, text)` function exists and is exported
- [ ] Uses the existing `WebClient` already instantiated in `slack.js` (no second Slack client created)
- [ ] Accepts a Slack user ID as the `channel` value (Slack API accepts user IDs for DMs)
- [ ] Does not crash if Slack bot token is unset — fails gracefully with a logged error

---

### `public/index.html` — Briefings Settings UI

- [ ] Briefings settings block exists in the Memory/Settings panel area
- [ ] Toggle (checkbox or styled switch) controls `briefings_enabled`
- [ ] Toggle `onchange` calls `savePref('briefings_enabled', ...)` with `'true'` or `'false'` string
- [ ] Slack user ID input + Save button calls `savePref('briefing_slack_user_id', value)`
- [ ] Timezone input saves on blur or button click via `savePref('timezone', value)`
- [ ] "Send me a test brief now" button calls `sendTestBrief()`
- [ ] `sendTestBrief()` calls `POST /api/briefings/test`, shows toast on success/failure, restores button text
- [ ] `loadBriefingsSettings()` reads `GET /api/preferences` and populates all fields on settings open
- [ ] `savePref(key, value)` calls `PUT /api/preferences/:key` with `{ value }` in body
- [ ] No XSS risk: user-entered values are not rendered as `innerHTML`

---

### No Regressions

- [ ] Outcomes list, actions, archive flow all work as before
- [ ] Focus Mode unchanged
- [ ] Today view (Phase 3.0) unchanged
- [ ] Memory view (Phase 2.2) accessible and unchanged
- [ ] Inbox triage unchanged
- [ ] Calendar integration (Phase 3.0) unchanged
- [ ] Preserved files (`slack.js`, `grain.js`, all integrations, `triage.js`, `oauth-tokens.js`) untouched
- [ ] Existing sidebar nav items (Today, Library, Analytics, Advisor, Memory) still render

---

## What's Out of Scope for This Phase

- Custom briefing times per-day (e.g., different times on weekends)
- Slack Block Kit formatting
- Email delivery channel
- Briefing content personalized by calendar (calendar data used if available, graceful no-op if not)

---

## When You're Done

Log results to `test_tracker/Phase 3.1 - Morning Brief.md`. Verdict: **approved for Phase 3.2** or blocked with specifics.
