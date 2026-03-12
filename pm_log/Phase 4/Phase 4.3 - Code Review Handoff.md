# Phase 4.3 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 4.3 just completed — it ships Claude as Advisor: a weekly retrospective generated every Friday, a proactive flag system (amber dot on sidebar), and an Advisor history view. Read `pm_log/Phase 4/Phase 4.3 - Engineer Handoff.md` in full, then verify every checklist item against the actual codebase. End with a clear verdict: approved, or blocked with specifics. Log results to `test_tracker/Phase 4.3 - Claude as Advisor.md`.

---

**Read these files before reviewing:**
1. `pm_log/Phase 4/Phase 4.3 - Claude as Advisor.md` — full phase spec
2. `pm_log/Phase 4/Phase 4.3 - Engineer Handoff.md` — detailed implementation spec
3. `dev_tracker/Phase 4.3 - Claude as Advisor.md` — working checklist; verify each item complete

---

## What Was Built

Phase 4.3 adds two new files and modifies two:
- `src/database/advisor.js` — `advisor_reviews` table with unread flag, CRUD, proactive-per-week limiter
- `src/services/advisor.js` — `generateWeeklyRetrospective()`, `checkProactiveFlags()`
- `src/jobs/briefings.js` (or `src/jobs/advisor.js`) — Friday 5:30pm cron
- `src/routes/api.js` — 5 Advisor routes + `initAdvisorTables()` at startup
- `public/index.html` — `showAdvisorView()`, `renderAdvisorView()`, amber dot, `checkAdvisorDot()` on load

---

## Review Checklist

### `src/database/advisor.js`

- [ ] File exists and exports `initAdvisorTables`, `saveAdvisorReview`, `getAllAdvisorReviews`, `getAdvisorReview`, `markReviewRead`, `markAllReviewsRead`, `hasUnreadObservation`, `countProactiveThisWeek`
- [ ] `initAdvisorTables()` creates `advisor_reviews` table with `IF NOT EXISTS`
- [ ] Schema: `id`, `week_of TEXT NOT NULL`, `summary TEXT NOT NULL`, `review_type TEXT NOT NULL DEFAULT 'weekly'`, `has_unread_observation INTEGER DEFAULT 1`, `created_at`
- [ ] `saveAdvisorReview(data)` inserts with `has_unread_observation = 1` by default
- [ ] `getAllAdvisorReviews()` returns all rows ordered by `created_at DESC`
- [ ] `getAdvisorReview(id)` returns `null` if not found
- [ ] `markReviewRead(id)` sets `has_unread_observation = 0` for that row only
- [ ] `hasUnreadObservation()` returns `true` if any row has `has_unread_observation = 1`
- [ ] `countProactiveThisWeek()` counts `review_type = 'proactive'` rows created within the last 7 days
- [ ] All functions use synchronous `better-sqlite3` (no `await`, no `.then()`)
- [ ] `initAdvisorTables()` is called from `src/routes/api.js` at startup

---

### `src/services/advisor.js`

- [ ] File exists and exports `generateWeeklyRetrospective`, `checkProactiveFlags`
- [ ] Both functions are `async`
- [ ] Uses `anthropic.messages.create()` directly — not streaming, not tool use
- [ ] Model is `claude-sonnet-4-6`
- [ ] `generateWeeklyRetrospective()` queries outcomes closed in the last 7 days (using `archived_at > ?`)
- [ ] Includes overdue/slipped outcomes (active, created > 14 days ago, past deadline)
- [ ] Includes focus session summary from `user_context` table (graceful fallback if none)
- [ ] Includes all `pattern_observations` from Phase 3.3
- [ ] Prompt instructs: "one sentence summary + 2-3 numbered observations + trusted advisor tone + plain text only"
- [ ] Prompt includes the "if nothing notable, say so" instruction — no fabricated observations
- [ ] Generated text saved via `saveAdvisorReview({ week_of, summary, review_type: 'weekly' })`
- [ ] After saving the weekly retro, calls `checkProactiveFlags()` (chained, not concurrent)
- [ ] `generateWeeklyRetrospective()` logs to console on completion
- [ ] `checkProactiveFlags()` calls `countProactiveThisWeek()` — returns immediately if already one this week
- [ ] `checkProactiveFlags()` calls `checkReadiness()` — returns immediately if not globally ready
- [ ] Proactive flag only fires when a category's completion rate pattern is below threshold AND sample ≥ 8
- [ ] Proactive flag saved with `review_type: 'proactive'`
- [ ] At most one proactive flag generated per `checkProactiveFlags()` call (returns after first match)

---

### Friday Cron

- [ ] `cron.schedule('30 17 * * 5', ...)` or equivalent — fires at Friday 5:30pm (or Monday 8:00am — confirm with PM)
- [ ] Calls `advisorService.generateWeeklyRetrospective()` inside `try/catch`
- [ ] Uses stored `timezone` preference from `user_preferences`
- [ ] Cron wired up from `src/server.js` on startup

---

### `src/routes/api.js` — Advisor Routes

- [ ] `advisorDb` and `advisorService` properly required at top of file
- [ ] `initAdvisorTables()` called at startup
- [ ] `GET /api/advisor/reviews` — returns `{ success: true, count: N, data: [...] }` ordered newest first
- [ ] `GET /api/advisor/reviews/:id` — returns `404` if not found
- [ ] `POST /api/advisor/reviews/:id/read` — marks one review as read; returns `{ success: true }`
- [ ] `GET /api/advisor/unread` — returns `{ success: true, data: { hasUnread: boolean } }`
- [ ] `POST /api/advisor/generate` — manually triggers `generateWeeklyRetrospective()` (dev/test helper)
- [ ] No existing routes modified

---

### `public/index.html` — Advisor View

**Amber dot:**
- [ ] `checkAdvisorDot()` function exists — calls `GET /api/advisor/unread`
- [ ] `checkAdvisorDot()` shows/hides `id="advisor-dot"` element based on `hasUnread`
- [ ] `checkAdvisorDot()` is called on app load (inside `init()` or `DOMContentLoaded`)
- [ ] Amber dot element uses `w-1.5 h-1.5 bg-amber-500 rounded-full` or equivalent inline style (6×6px, amber/amber-500, round)
- [ ] Dot is hidden by default (`display: none`)

**`showAdvisorView()`:**
- [ ] Function exists, sets Advisor as active nav item
- [ ] Fetches `GET /api/advisor/reviews`
- [ ] Hides the amber dot on open
- [ ] Marks the most recent unread review as read via `POST /api/advisor/reviews/:id/read`
- [ ] Calls `renderAdvisorView(reviews)`

**`renderAdvisorView(reviews)`:**
- [ ] Most recent review rendered prominently (not in the history list)
- [ ] Review shows: week label (or "Proactive flag"), date, full summary text
- [ ] Proactive flags labeled "● Proactive flag" (not "Week of …")
- [ ] Summary rendered with `white-space: pre-wrap` so line breaks are preserved
- [ ] Summary text escaped via `escHtml()` — no XSS
- [ ] History section labeled "Previous reviews →" (exact text per vision)
- [ ] History items show: week label, first ~80 chars of summary, date
- [ ] Clicking a history item opens the full review (right panel or inline — either acceptable)
- [ ] Empty state: message explaining first review appears Friday at 5:30pm (not an empty blank)
- [ ] No right panel when Advisor view is active (full-width center, same as Analytics)

---

### No Regressions

- [ ] Outcomes list, actions, archive flow all work as before
- [ ] Focus Mode unchanged
- [ ] Today view (Phase 3.0) unchanged
- [ ] Morning Brief (Phase 3.1) unchanged
- [ ] Library view (Phase 3.2) unchanged
- [ ] Analytics view (Phase 3.3) unchanged
- [ ] Memory view (Phase 2.2) accessible
- [ ] Inbox triage unchanged
- [ ] Preserved files (`slack.js`, `grain.js`, all integrations, `triage.js`, `oauth-tokens.js`) untouched
- [ ] Phase 3.3 pattern engine and weekly cron still fire correctly (Friday cron for Advisor doesn't conflict)

---

## What's Out of Scope for This Phase

- Claude initiating unsolicited Slack DMs outside briefing cadence
- Advisor observations sent to Slack (retrospective is in-app only)
- Goal-setting or OKR features
- Multi-user advisor separation
- Editing or deleting past retrospectives

---

## When You're Done

Log results to `test_tracker/Phase 4.3 - Claude as Advisor.md`. Verdict: **approved** or blocked with specifics.
