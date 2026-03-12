# Dev Tracker — Phase 3.0: Calendar + Today View

**Status:** Complete
**Full brief:** `pm_log/Phase 3/Phase 3.0 - Calendar Integration & Today View.md`
**Engineer handoff:** `pm_log/Phase 3/Phase 3.0 - Engineer Handoff.md`
**Depends on:** Phase 2.6 complete and approved ✅

---

## Pre-Build Checklist

- [x] Read `pm_log/Phase 3/Phase 3.0 - Calendar Integration & Today View.md` in full
- [x] Read `pm_log/Phase 3/Phase 3.0 - Engineer Handoff.md` in full
- [x] Read `src/database/oauth-tokens.js` — confirmed `saveOAuthToken(provider, tokenData)` and `getOAuthToken(provider)` signatures
- [x] Read `src/routes/api.js` — found where new routes should go (calendar section, today section)
- [x] Read `public/index.html` — found sidebar HTML, `renderCenter()`, view-switching via `currentPhase`
- [x] Read `src/database/index.js` — understood `initDatabase()` and how to add new `initX()` calls

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-23 | Claude Sonnet 4.6 | Phase 3.0 complete. All 6 files built. Server tested — calendar/status and today/status endpoints respond correctly. JS syntax validated. |

### Decisions

1. **`oauth_tokens` table incompatible with Google Calendar** — The existing `oauth_tokens` table has a `CHECK(service IN ('slack', 'grain'))` constraint that prevents inserting `provider = 'google_calendar'`. Decision: created a separate `google_calendar_tokens` table inside `src/services/google-calendar.js` itself (initialized on require). This keeps the existing `src/database/oauth-tokens.js` completely untouched (as required) and avoids any schema migration. The token storage is lightweight and internal to the calendar service.

2. **`getActiveOutcomes()` doesn't exist** — `outcomesDb` only exports `getAllOutcomes(filters)`. Decision: used `outcomesDb.getAllOutcomes({ status: 'active' })` in the `/api/today/propose` route. No DB change needed.

3. **Today view uses `currentPhase = 5`** — The existing view-switching pattern uses `currentPhase` integers (1-4). Decision: assigned `currentPhase = 5` for Today view. Added phase 5 handler to `renderCenter()`, `renderRightPanel()`, and `renderPhaseIndicator()`. This is clean and follows the existing pattern.

4. **`showMemoryView()` was not previously defined** — Memory was accessed via `toggleMemoryPanel()` directly. Decision: defined `showMemoryView()` in the Today view JS block to call `setViewActive('nav-memory')` + `toggleMemoryPanel()`. The sidebar Memory item now uses this cleaner function.

5. **`showTodayAdjust()` is a stub** — The full adjust flow (drag/reorder, add/remove actions, running total recalculation) is complex enough to merit a Phase 3.x enhancement. For Phase 3.0, "Adjust" shows an alert explaining it's coming. The Confirm plan flow is fully functional.

6. **`openFocusModeFromToday()` uses `openFocusMode()`** — The mid-day "Focus →" button calls the existing Focus Mode function after navigating to the correct outcome, maintaining compatibility with all existing Focus Mode functionality.

---

## Completion Checklist

### Workstream 1 — `src/services/google-calendar.js` (CREATE)
- [x] File created
- [x] `getOAuth2Client()` uses `process.env.GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- [x] `getAuthenticatedClient()` reads token from internal `getGoogleToken()` (separate table — see Decision #1)
- [x] Token refresh logic: checks expiry within 5 min, refreshes and saves updated token
- [x] `getEventsForDate(date)` fetches `primary` calendar for full day, returns normalized array
- [x] `getOpenWindows(events)` calculates gaps, skips windows < 15 min
- [x] `getAuthUrl()` requests `calendar.readonly` scope with `access_type: 'offline'`
- [x] `handleCallback(code)` exchanges code and saves via `saveGoogleToken()`
- [x] Module exports: `getEventsForDate`, `getOpenWindows`, `getAuthUrl`, `handleCallback`, `isConnected`
- [x] `googleapis` package installed (`npm install googleapis`)

### Workstream 2 — `src/database/calendar.js` (CREATE)
- [x] File created
- [x] `initCalendarTables()` creates `calendar_events` and `daily_plans` with `IF NOT EXISTS`
- [x] `calendar_events` schema correct (external_id UNIQUE, provider, title, start_at, end_at, is_blocked, fetched_at)
- [x] `daily_plans` schema correct (date UNIQUE, committed_outcome_ids, committed_action_ids, total_estimated_minutes, available_minutes, confirmed_at, actual_completed_action_ids)
- [x] `upsertCalendarEvents(events)` uses `ON CONFLICT(external_id) DO UPDATE`
- [x] `getEventsForDate(date)` queries correctly
- [x] `getTodayPlan(date)` returns null if no plan
- [x] `upsertDailyPlan(date, data)` upserts correctly
- [x] `initCalendarTables()` called from `src/routes/api.js` at startup

### Workstream 3 — `src/routes/api.js` — Calendar + Today Routes
- [x] `GET /api/calendar/connect` redirects to Google Auth URL
- [x] `GET /api/calendar/callback` exchanges code, saves token, redirects to `/?calendar=connected`
- [x] `GET /api/calendar/status` returns connection status
- [x] `GET /api/calendar/today` fetches events, upserts to DB, returns events + open windows
- [x] `POST /api/today/propose` fetches calendar, outcomes, calls `proposeTodayPlan`, returns proposal
- [x] `POST /api/today/confirm` writes plan to `daily_plans`
- [x] `GET /api/today/status` returns plan + `state: 'proposal' | 'active' | 'eod'`
- [x] `POST /api/today/complete-action` appends action_id to `actual_completed_action_ids`
- [x] `GET /api/today/recommendation` calls `generateTodayRecommendation`
- [x] `calendarDb` and `googleCalendar` properly required

### Workstream 4 — `src/services/claude.js` — New Claude Functions
- [x] `proposeTodayPlan(windows, outcomes, contextSnapshot)` added
- [x] `proposeTodayPlan` uses `anthropic.messages.create()` with model `claude-sonnet-4-6`
- [x] Response parsed as JSON with try/catch
- [x] Returns `{ committed_actions, available_minutes, committed_minutes, flags, overcommitted }`
- [x] `generateTodayRecommendation(remainingActionIds, windows, calendarEvents)` added
- [x] `generateTodayRecommendation` returns plain-text string (≤25 words)
- [x] `module.exports` updated to include both new functions

### Workstream 5 — `public/index.html` — Sidebar + Today View
- [x] Views sidebar section added (Today, Library, Analytics, Advisor, Memory)
- [x] Calendar icon for Today, correct icons for each item
- [x] Library, Analytics show "Soon" badge; Advisor has no badge (non-functional)
- [x] Advisor item has commented-out amber dot slot for Phase 4.3
- [x] Memory item links to existing Memory view via `showMemoryView()`
- [x] `setViewActive()` helper manages `.active` class correctly
- [x] `sb-item` and `sb-item.active` CSS classes added to `<style>` block
- [x] `showTodayView()` function exists and sets Today as active (phase 5)
- [x] Today view — Proposal state: header, calendar strip, Claude's plan, action cards, running total, flags, confirm button
- [x] Today view — Active state: live clock, progress bar, completed/remaining tasks, Focus → button, Claude note card
- [x] Today view — EOD state: completion summary, task checklist, move/dismiss buttons, Claude reflection
- [x] Right panel shows "Calendar Today" when Today view is active
- [x] `startLiveClock(elementId)` function exists, updates every 60s, clears interval on navigate away
- [x] `renderPhaseIndicator()` updated to show "Today" breadcrumb for phase 5
- [x] `setPhase()` updated to clear Today clock and nav active state when navigating away
- [x] `.env` updated with Google Calendar env var placeholders

### No Regressions
- [x] Outcomes list, actions, archive flow unchanged
- [x] Focus Mode unchanged
- [x] Memory view accessible from sidebar (now via `showMemoryView()`)
- [x] Inbox triage unchanged
- [x] Preserved files untouched (`slack.js`, `grain.js`, `oauth-tokens.js`, `crypto.js`)

---

## Blockers

None — build complete.
