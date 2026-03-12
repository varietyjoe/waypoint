# Phase 3.0 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 3.0 just completed — it adds Google Calendar OAuth integration, the Today view (3 states: proposal / active / EOD), and the sidebar Views navigation structure. Read `pm_log/Phase 3/Phase 3.0 - Code Review Handoff.md` in full, then verify every checklist item against the actual codebase. End with a clear verdict: approved for Phase 3.1, or blocked with specifics. Log results to `test_tracker/Phase 3.0 - Calendar + Today View.md`.

---

**Read these files before reviewing:**
1. `pm_log/Phase 3/Phase 3.0 - Calendar Integration & Today View.md` — full phase spec
2. `pm_log/Phase 3/Phase 3.0 - Engineer Handoff.md` — detailed implementation spec
3. `dev_tracker/Phase 3.0 - Calendar + Today View.md` — working checklist; verify each item complete

---

## What Was Built

Phase 3.0 adds five new files and modifies three:
- `src/services/google-calendar.js` — Google OAuth2, `getEventsForDate`, `getOpenWindows`, `getAuthUrl`, `handleCallback`
- `src/database/calendar.js` — `calendar_events` + `daily_plans` tables, CRUD functions
- New Claude functions in `src/services/claude.js`: `proposeTodayPlan`, `generateTodayRecommendation`
- New routes in `src/routes/api.js`: calendar OAuth flow + Today plan routes
- `public/index.html`: sidebar Views nav, Today view (3 states), Today right panel, live clock

---

## Review Checklist

### `src/services/google-calendar.js`

- [ ] File exists and exports `getEventsForDate`, `getOpenWindows`, `getAuthUrl`, `handleCallback`
- [ ] Uses `googleapis` package (not raw HTTP)
- [ ] OAuth2 client uses `process.env.GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- [ ] `getAuthenticatedClient()` reads token from `oauthTokensDb.getOAuthToken('google_calendar')`
- [ ] Token refresh: checks if within 5 min of expiry, refreshes and saves updated token
- [ ] `getEventsForDate(date)` fetches `primary` calendar for the full day, returns normalized array
- [ ] `getOpenWindows(events)` correctly calculates gaps between events, skips windows < 15 min
- [ ] `getAuthUrl()` requests `calendar.readonly` scope with `access_type: 'offline'`
- [ ] `handleCallback(code)` exchanges code for tokens and saves via `oauthTokensDb.saveOAuthToken`
- [ ] No writes to Google Calendar (read-only)

### `src/database/calendar.js`

- [ ] `initCalendarTables()` creates `calendar_events` and `daily_plans` tables with `IF NOT EXISTS`
- [ ] `calendar_events` has: `id`, `external_id UNIQUE`, `provider`, `title`, `start_at`, `end_at`, `is_blocked`, `fetched_at`
- [ ] `daily_plans` has: `id`, `date UNIQUE`, `committed_outcome_ids`, `committed_action_ids`, `total_estimated_minutes`, `available_minutes`, `confirmed_at`, `actual_completed_action_ids`, `created_at`, `updated_at`
- [ ] `upsertCalendarEvents` uses `ON CONFLICT(external_id) DO UPDATE` — no duplicates on re-fetch
- [ ] `upsertDailyPlan` upserts correctly — updates if date exists, inserts if not
- [ ] All functions use synchronous `better-sqlite3` (no `await`, no `.then()`)
- [ ] `initCalendarTables()` is called from `src/routes/api.js` at startup

### `src/services/claude.js`

- [ ] `proposeTodayPlan(windows, outcomes, contextSnapshot)` is present and exported
- [ ] Uses `anthropic.messages.create()` directly (not `sendWithTools`)
- [ ] Model is `claude-sonnet-4-6`
- [ ] Prompt includes available windows, outcomes+actions, context snapshot
- [ ] Response parsed as JSON with `clusters.replace(markdownFences).trim()` pattern
- [ ] Parse wrapped in try/catch with descriptive error
- [ ] Returns object with `committed_actions`, `available_minutes`, `committed_minutes`, `flags`, `overcommitted`
- [ ] `generateTodayRecommendation(remainingActionIds, windows, calendarEvents)` is present and exported
- [ ] Returns a plain-text string recommendation (one sentence, ≤25 words)
- [ ] `module.exports` updated to include both new functions
- [ ] All existing exports unchanged

### `src/routes/api.js`

**Calendar routes:**
- [ ] `GET /api/calendar/connect` redirects to Google Auth URL
- [ ] `GET /api/calendar/callback` exchanges code, saves token, redirects to `/?calendar=connected`
- [ ] `GET /api/calendar/today` fetches events, upserts to DB, returns events + open windows

**Today plan routes:**
- [ ] `POST /api/today/propose` fetches calendar, active outcomes+actions, calls `proposeTodayPlan`, returns proposal
- [ ] `POST /api/today/confirm` writes `committed_action_ids`, `committed_outcome_ids`, `confirmed_at` to `daily_plans`
- [ ] `GET /api/today/status` returns plan + `state: 'proposal' | 'active' | 'eod'`
- [ ] `POST /api/today/complete-action` appends action_id to `actual_completed_action_ids`
- [ ] `GET /api/today/recommendation` calls `generateTodayRecommendation`, returns recommendation string
- [ ] `calendarDb` and `googleCalendar` properly required at top of file
- [ ] No existing routes modified

### `public/index.html` — Sidebar Views Nav

- [ ] "Views" sidebar section present with Today, Library, Analytics, Advisor, Memory items
- [ ] Calendar icon for Today, correct icons for each item (matching `public/waypoint-vision.html`)
- [ ] Library, Analytics, Advisor show "Soon" badge or are visually non-interactive
- [ ] Advisor item has a commented-out or hidden amber dot slot (`id="advisor-dot"`)
- [ ] Memory item links to existing Memory view (Phase 2.2)
- [ ] Active state applies `.active` class correctly when view is switched
- [ ] `showTodayView()` sets Today as active, removes active from others

### `public/index.html` — Today View (Proposal State)

- [ ] Header: "Today · [Day, Date]" with available time subtitle
- [ ] Horizontal calendar strip renders event pills above Claude's plan
- [ ] "Claude's Suggested Plan" label above action cards
- [ ] Action cards: deep = purple dot, light = blue dot; shows outcome subtitle, energy badge, time
- [ ] Running total: "Xh Ym of Yh Zm available" + percentage + progress bar
- [ ] Flag card(s) render if `proposal.flags` is non-empty (amber left-border card)
- [ ] [Adjust] button (non-functional placeholder is acceptable for v1) and [Confirm plan →] button
- [ ] "Confirm plan →" calls `POST /api/today/confirm` with correct payload

### `public/index.html` — Today View (Active/Mid-Day State)

- [ ] Header shows "Today · [Day, Date]" + live clock right-aligned (updates every 60s)
- [ ] "N of N tasks · Xh Ym done" subtitle
- [ ] Progress bar with pace percentage
- [ ] Completed tasks: faded green card, strikethrough title, "DONE · Xm" subtitle
- [ ] Remaining task: white card with indigo border + inline "Focus →" button
- [ ] "Focus →" button opens Focus Mode on the correct action (passes action context)
- [ ] ✦ Claude note card at bottom with recommendation text
- [ ] Recommendation fetched from `GET /api/today/recommendation`

### `public/index.html` — Today View (EOD State)

- [ ] EOD state renders when `status.state === 'eod'` (hour ≥ 17)
- [ ] Shows completed vs. not-completed tasks
- [ ] Claude quote or summary present
- [ ] [Move unfinished to tomorrow] and [Dismiss] buttons present (can be stubs)

### `public/index.html` — Today Right Panel

- [ ] Right panel shows "Calendar Today" (not Execution Intelligence) when Today view is active
- [ ] Connection status indicator: "● Connected: Google Calendar"
- [ ] Event cards rendered: event name + time range + duration
- [ ] "Available Blocks" section shows calculated open windows
- [ ] Mid-day state: past events faded/crossed-out
- [ ] Mid-day state: current block highlighted "Now · [block type]" with remaining time
- [ ] Mid-day state: Recommendation card (blue tint) with Claude text

### `public/index.html` — Live Clock

- [ ] `startLiveClock(elementId)` function exists
- [ ] Updates every 60 seconds
- [ ] Previous interval cleared when function called again (no interval leak)
- [ ] Clock stops when navigating away from Today view (interval cleared)

### No Regressions

- [ ] Outcomes list, actions, archive flow all work as before
- [ ] Focus Mode unchanged
- [ ] Memory view (Phase 2.2) accessible from sidebar Memory nav item
- [ ] Inbox triage unchanged
- [ ] Preserved files (`slack.js`, `grain.js`, all integrations, `triage.js`, `oauth-tokens.js`) untouched
- [ ] Existing sidebar sections (Active Outcomes, Projects, Recently Closed) still render correctly

---

## What's Out of Scope for This Phase

- Writing events back to Google Calendar
- Multi-day planning view
- "Adjust" flow (editable plan) — can be a stub
- Outlook / other calendar providers (abstracted but not implemented)

---

## When You're Done

Log results to `test_tracker/Phase 3.0 - Calendar + Today View.md`. Verdict: **approved for Phase 3.1** or blocked with specifics.
