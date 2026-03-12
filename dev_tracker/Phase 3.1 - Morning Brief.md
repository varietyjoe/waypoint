# Dev Tracker — Phase 3.1: Morning Brief

**Status:** Complete
**Full brief:** `pm_log/Phase 3/Phase 3.1 - Morning Brief.md`
**Engineer handoff:** `pm_log/Phase 3/Phase 3.1 - Engineer Handoff.md`
**Depends on:** Phase 3.0 complete and approved ✅

---

## Pre-Build Checklist

- [x] Read `pm_log/Phase 3/Phase 3.1 - Morning Brief.md` in full
- [x] Read `pm_log/Phase 3/Phase 3.1 - Engineer Handoff.md` in full
- [x] Read `src/routes/slack.js` — find how Slack messages are sent, identify bot token pattern
- [x] Read `src/server.js` — understand initialization order; find where to add cron job setup
- [x] Check `package.json` — confirm `node-cron` is installed (or install it)
- [x] Read `src/database/calendar.js` — confirm `getTodayPlan()` and `getEventsForDate()` signatures

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-23 | Claude Sonnet 4.6 | Phase 3.1 built in full. All 6 files created/modified. All syntax checks pass. Module smoke tests pass. |

### Decisions

1. **sendSlackDM uses user OAuth token, not a bot token.** The existing Slack infrastructure in `src/routes/slack.js` uses user OAuth tokens stored via `oauthTokens.getToken('slack')` — there is no separate bot token. `sendSlackDM` reads the stored user token and calls `slackClient.postMessage(token.access_token, userId, text)`. This matches the existing pattern perfectly and requires no new Slack app credentials.

2. **anthropic client instantiated directly in briefings.js.** The `anthropic` client instance is not exported from `src/services/claude.js` (only high-level functions are exported). Rather than modifying claude.js, `src/services/briefings.js` instantiates its own `Anthropic` client directly with `process.env.ANTHROPIC_API_KEY`. This is consistent with how the codebase is structured.

3. **Cron times read at startup, enabled/userId checked at fire time.** The cron schedule strings (hour/minute) are resolved at `scheduleBriefings()` call time. The `briefings_enabled` and `briefing_slack_user_id` preferences are read inside each cron callback at fire time — so toggling on/off or changing the Slack user ID takes effect without restart. Changing send times requires a server restart (acceptable trade-off with node-cron's API).

4. **Briefings settings added inside the sidebar memory panel.** The spec called for adding the Briefings section to the Memory/Settings panel. The memory panel (`#memory-panel`) in the sidebar is the natural location — it opens when the user clicks "Memory" in the nav, which is the closest thing to a settings panel. `loadBriefingsSettings()` is called every time the panel opens.

5. **Toggle track color managed via JS, not pure CSS.** Since the toggle is an `<input type="checkbox">` without a sibling CSS combinator, the track background color is set dynamically in `loadBriefingsSettings()` and the `onchange` handler — consistent with the design approach in the rest of the app.

6. **inbox.getPendingInboxItems() may be async.** Inspection shows it's declared as `async` in inbox.js. The morning brief gracefully handles both sync and async return values with a try/await pattern.

---

## Completion Checklist

### Workstream 1 — `src/database/user-preferences.js` (CREATE)
- [x] File created
- [x] `initUserPreferences()` creates `user_preferences` table with `IF NOT EXISTS`
- [x] Schema: `key TEXT PRIMARY KEY`, `value TEXT NOT NULL`, `updated_at`
- [x] Defaults seeded with `ON CONFLICT(key) DO NOTHING`
- [x] Default keys: `timezone`, `briefings_enabled`, `briefing_slack_user_id`, `briefing_morning_time`, `briefing_midday_time`, `briefing_eod_time`
- [x] Default times: morning `07:45`, midday `12:00`, EOD `17:30`
- [x] `getPreference(key)` returns value string or null
- [x] `setPreference(key, value)` upserts, updates `updated_at`
- [x] `getAllPreferences()` returns plain object `{ key: value, ... }`
- [x] All functions synchronous (no await/then)
- [x] `initUserPreferences()` called from `src/routes/api.js` at startup

### Workstream 2 — `src/services/briefings.js` (CREATE)
- [x] File created
- [x] `generateMorningBrief()` async — includes active outcomes, deadline urgency, calendar events, inbox count
- [x] `generateMorningBrief()` prompt instructs plain text, no markdown, no bullet points
- [x] `generateMiddayPulse()` async — reads `daily_plans`, gracefully handles no confirmed plan
- [x] `generateMiddayPulse()` includes committed vs completed task counts
- [x] `generateEODWrap()` async — includes done/total tasks + tomorrow's calendar events
- [x] All three return plain text strings (not JSON, not markdown)
- [x] Uses `claude-sonnet-4-6` model, max_tokens ≤ 400
- [x] Module exports: `generateMorningBrief`, `generateMiddayPulse`, `generateEODWrap`

### Workstream 3 — `sendSlackDM` function
- [x] `sendSlackDM(userId, text)` exists and is exported (added to `src/routes/slack.js`)
- [x] Uses existing user OAuth token from DB (no second Slack client instantiated)
- [x] Accepts Slack user ID as `channel` value

### Workstream 4 — `src/jobs/briefings.js` (CREATE)
- [x] File created
- [x] Uses `node-cron` — `node-cron` v4.2.1 in package.json
- [x] Three separate `cron.schedule()` calls — morning, midday, EOD
- [x] Each cron reads `briefing_*_time` from `prefDb.getPreference()` at startup (schedule time)
- [x] Each cron checks `briefings_enabled !== 'true'` and returns early if disabled
- [x] Each cron checks `briefing_slack_user_id` is non-empty before sending
- [x] Each cron has try/catch with `console.error` on failure
- [x] `timezone` option passed to `cron.schedule()` using stored preference
- [x] `scheduleBriefings()` exported and called from `src/server.js`

### Workstream 5A — `src/routes/api.js` — Preferences Routes
- [x] `prefDb` required at top of file
- [x] `briefingsService` required at top of file
- [x] `sendSlackDM` required at top of file
- [x] `initUserPreferences()` called at startup
- [x] `GET /api/preferences` returns `{ success: true, data: { key: value, ... } }`
- [x] `PUT /api/preferences/:key` accepts `{ value }`, calls `setPreference`, returns `{ success: true }`
- [x] `POST /api/briefings/test` calls `generateMorningBrief()` + `sendSlackDM()`, returns `{ success: true, data: { sent: text } }`
- [x] `POST /api/briefings/test` returns 400 if no Slack user ID configured

### Workstream 5B — `public/index.html` — Briefings Settings UI
- [x] Briefings settings block in Memory/Settings panel (inside `#memory-panel`)
- [x] Toggle controls `briefings_enabled` — `savePref('briefings_enabled', ...)` with `'true'`/`'false'`
- [x] Slack user ID input + Save button calls `savePref('briefing_slack_user_id', value)`
- [x] Timezone input saves via `savePref('timezone', value)` on blur
- [x] "Send me a test brief now" button calls `sendTestBrief()`
- [x] `sendTestBrief()` shows toast on success/failure, restores button text
- [x] `loadBriefingsSettings()` reads `GET /api/preferences` and populates all fields on settings open
- [x] `loadBriefingsSettings()` called from `toggleMemoryPanel()` when panel opens
- [x] `savePref(key, value)` calls `PUT /api/preferences/:key` with `{ value }` in body
- [x] No XSS: user values set via `.value =` (DOM property), not innerHTML

### No Regressions
- [x] Outcomes list, actions, archive flow unchanged
- [x] Focus Mode unchanged
- [x] Today view (Phase 3.0) unchanged
- [x] Memory view accessible and unchanged
- [x] Inbox triage unchanged
- [x] Preserved files: `src/routes/slack.js` core logic intact, `src/routes/grain.js` untouched, integrations untouched

---

## Blockers

None.
