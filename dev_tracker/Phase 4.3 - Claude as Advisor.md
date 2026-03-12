# Dev Tracker — Phase 4.3: Claude as Advisor

**Status:** Complete
**Full brief:** `pm_log/Phase 4/Phase 4.3 - Claude as Advisor.md`
**Engineer handoff:** `pm_log/Phase 4/Phase 4.3 - Engineer Handoff.md`
**Depends on:** Phase 4.2 complete and approved ✅

---

## Pre-Build Checklist

- [x] Read `src/database/patterns.js` — confirmed `getAllPatterns()` and `checkReadiness()` signatures
- [x] Read `src/database/outcomes.js` — found `archived_at` column; queries use `archived_at > ?` for date range; `outcome_result_note` is the correct column (not `result_note`)
- [x] Read `src/jobs/briefings.js` — found Friday pattern recompute cron at 11:59pm; Advisor cron added at 5:30pm in same function
- [x] Read `public/index.html` — found Advisor sidebar nav stub at line 370 (had "Soon" badge, no onclick); found `centerContent` / `rightPanel` IDs; found `escHtml()`, `setViewActive()` patterns; `init()` at line 841

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-23 | Claude | Phase 4.3 complete — all 6 files touched |

### Decisions

1. **`anthropic` client in advisor service**: `src/services/claude.js` does not export the `anthropic` instance — it exports named functions only. The fallback `new (require('@anthropic-ai/sdk'))({ apiKey: ... })` path is used at runtime. The guard `anthropic_module.anthropic ||` is kept per spec for future-proofing.

2. **Cron added to `src/jobs/briefings.js`** (not a new `src/jobs/advisor.js`): The existing `scheduleBriefings()` function already imports `prefDb` for timezone; adding the Advisor cron there was the cleanest approach and required no change to `src/server.js`.

3. **`formatAdvisorDate()` added as separate helper** to avoid shadowing any existing `formatDate` — none found in the codebase but name collision was avoided proactively.

4. **`openAdvisorReview()` renders into `rightPanel`** rather than replacing center content — consistent with Phase 3.2 Library detail pattern and keeps the history list visible.

5. **`outcome_result_note` column used** in retrospective query (not `result_note`) — verified against `src/database/outcomes.js` `initReflectionsTable()` which adds `outcome_result_note` to the outcomes table.

6. **"No action required" footer also rendered in `openAdvisorReview()` right panel** for weekly reviews — spec says "below the summary on weekly reviews", and users should see it even when reading from history.

7. **Amber dot `flex-shrink:0` added** — prevents the dot from collapsing when sibling text is long.

---

## Completion Checklist

### Workstream 1 — `src/database/advisor.js` (CREATE)
- [x] File created
- [x] `initAdvisorTables()` creates `advisor_reviews` with `IF NOT EXISTS`
- [x] Schema: `id`, `week_of TEXT NOT NULL`, `summary TEXT NOT NULL`, `review_type TEXT NOT NULL DEFAULT 'weekly'`, `has_unread_observation INTEGER DEFAULT 1`, `created_at`
- [x] `saveAdvisorReview(data)` inserts with `has_unread_observation = 1` by default; returns inserted row
- [x] `getAllAdvisorReviews()` returns all rows ordered by `created_at DESC`
- [x] `getAdvisorReview(id)` returns `null` if not found
- [x] `markReviewRead(id)` sets `has_unread_observation = 0` for that row only
- [x] `markAllReviewsRead()` sets `has_unread_observation = 0` for all rows
- [x] `hasUnreadObservation()` returns `true` if any row has `has_unread_observation = 1`
- [x] `countProactiveThisWeek()` counts `review_type = 'proactive'` rows created within last 7 days
- [x] All functions synchronous
- [x] `module.exports` exports all 8 functions
- [x] `initAdvisorTables()` called from `src/routes/api.js` at startup

### Workstream 2 — `src/services/advisor.js` (CREATE)
- [x] File created
- [x] Exports `generateWeeklyRetrospective` and `checkProactiveFlags`
- [x] Both functions are `async`
- [x] Uses `anthropic.messages.create()` directly — not streaming, not tool use
- [x] Model is `claude-sonnet-4-6`
- [x] `generateWeeklyRetrospective()` queries outcomes closed in last 7 days (`archived_at > ?`)
- [x] Includes overdue/slipped outcomes (active, created > 14 days ago, past deadline)
- [x] Includes focus session summary from `user_context` table with graceful fallback
- [x] Includes all `pattern_observations` from Phase 3.3
- [x] `getWeekOf()` returns ISO date of most recent Monday
- [x] `formatWeekOf()` NOT in advisor.js — that's frontend only
- [x] Prompt instructs: one sentence summary + 2-3 numbered observations + trusted advisor tone + plain text only
- [x] Prompt includes "if nothing notable, say so" instruction
- [x] Generated text saved via `saveAdvisorReview({ week_of, summary, review_type: 'weekly' })`
- [x] After saving weekly retro, calls `checkProactiveFlags()` (chained, not concurrent)
- [x] Logs to console on completion
- [x] `checkProactiveFlags()` calls `countProactiveThisWeek()` — returns immediately if already one this week
- [x] `checkProactiveFlags()` calls `checkReadiness()` — returns immediately if not globally ready
- [x] Proactive flag only fires when category completion rate < 40% AND sample ≥ 8
- [x] Proactive flag saved with `review_type: 'proactive'`
- [x] At most one proactive flag generated per call (returns after first match)

### Workstream 3 — Friday Cron
- [x] `cron.schedule('30 17 * * 5', ...)` added in `src/jobs/briefings.js`
- [x] Calls `advisorService.generateWeeklyRetrospective()` inside try/catch
- [x] Uses stored timezone preference from `user_preferences` (via `timezone` variable already in scope)
- [x] Cron wired up from `src/server.js` on startup (via existing `scheduleBriefings()` call — no change to server.js required)

### Workstream 4 — API Routes (`src/routes/api.js`)
- [x] `advisorDb` and `advisorService` required at top
- [x] `initAdvisorTables()` called at startup
- [x] `GET /api/advisor/reviews` — returns `{ success: true, count: N, data: [...] }` ordered newest first
- [x] `GET /api/advisor/reviews/:id` — returns 404 if not found
- [x] `POST /api/advisor/reviews/:id/read` — marks review read; returns `{ success: true }`
- [x] `GET /api/advisor/unread` — returns `{ success: true, data: { hasUnread: boolean } }`
- [x] `POST /api/advisor/generate` — manually triggers `generateWeeklyRetrospective()` (dev/test only)
- [x] No existing routes modified

### Workstream 5 — Frontend (`public/index.html`)
- [x] `checkAdvisorDot()` function exists; calls `GET /api/advisor/unread`; shows/hides `id="advisor-dot"`
- [x] `checkAdvisorDot()` called on app load (`init()`)
- [x] Amber dot element: 6×6px, amber color (#f59e0b), round, `display:none` default
- [x] `showAdvisorView()` function exists; sets Advisor as active nav item
- [x] `showAdvisorView()` fetches reviews, hides dot, marks most recent unread as read, calls `renderAdvisorView`
- [x] `renderAdvisorView(reviews)` renders most recent review prominently
- [x] Review shows week label (or "● Proactive flag"), date, full summary with `white-space:pre-wrap`
- [x] Summary text escaped with `escHtml()`
- [x] "No action required. These are observations, not tasks." footer on weekly reviews (NOT on proactive flags)
- [x] History section labeled "Previous reviews →" (exact text)
- [x] History items: week label, first ~80 chars of summary, date
- [x] Clicking history item opens full review
- [x] Empty state shows message about first review appearing Friday at 5:30pm
- [x] `formatWeekOf(weekOf)` outputs "Feb 17–21" (Mon–Fri range)
- [x] Right panel cleared when Advisor view opens; history detail renders into right panel

### No Regressions
- [x] Outcomes list, actions, archive flow unchanged
- [x] Focus Mode unchanged
- [x] Today view (Phase 3.0) unchanged
- [x] Morning Brief (Phase 3.1) unchanged
- [x] Library view (Phase 3.2) unchanged
- [x] Analytics view (Phase 3.3) unchanged
- [x] Preserved files untouched (`src/routes/slack.js`, `src/routes/grain.js`, integrations, `triage.js`, `oauth-tokens.js`)

---

## Blockers

None.
