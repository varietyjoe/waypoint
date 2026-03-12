# Phase 3.3 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 3.3 just completed — it adds Pattern Memory (proactive pattern surfacing during AI Breakdown, Inbox Triage, and Focus Mode) and an Execution Analytics view (2×2 card grid with estimate accuracy, completion rate, results rate, and category breakdown). Read `pm_log/Phase 3/Phase 3.3 - Engineer Handoff.md` in full, then verify every checklist item against the actual codebase. End with a clear verdict: approved for Phase 4.0, or blocked with specifics. Log results to `test_tracker/Phase 3.3 - Pattern Memory & Analytics.md`.

---

**Read these files before reviewing:**
1. `pm_log/Phase 3/Phase 3.3 - Pattern Memory & Execution Analytics.md` — full phase spec
2. `pm_log/Phase 3/Phase 3.3 - Engineer Handoff.md` — detailed implementation spec
3. `dev_tracker/Phase 3.3 - Pattern Memory & Analytics.md` — working checklist; verify each item complete

---

## What Was Built

Phase 3.3 adds two new services, one new DB module, migrations on two existing DB modules, and new routes + frontend:
- `src/database/patterns.js` — `pattern_observations` table, CRUD, `checkReadiness()`
- `src/services/pattern-engine.js` — `computePatterns()` (time accuracy, completion rate, action count)
- `src/database/outcomes.js` — `outcome_tags TEXT` column migration
- `src/database/actions.js` — `started_at TEXT`, `ended_at TEXT` column migrations
- `src/services/claude.js` — `autoTagOutcome` function
- `src/routes/api.js` — `GET /api/analytics`, `GET /api/patterns`, pattern injection at 3 injection points, archive hook
- `src/server.js` or `src/jobs/` — weekly pattern recompute cron
- `public/index.html` — `showAnalyticsView()`, `renderAnalyticsView()` with 2×2 grid

---

## Review Checklist

### `src/database/patterns.js`

- [ ] File exists and exports `initPatternTables`, `savePatternObservation`, `getAllPatterns`, `getRelevantPatterns`, `checkReadiness`
- [ ] `initPatternTables()` creates `pattern_observations` table with `IF NOT EXISTS`
- [ ] Schema: `id`, `pattern_type TEXT NOT NULL`, `category TEXT`, `observation TEXT NOT NULL`, `sample_size INTEGER NOT NULL`, `data_json TEXT`, `computed_at`
- [ ] `savePatternObservation(data)` deletes existing pattern of same `pattern_type + category` before inserting fresh (no stale data accumulation)
- [ ] `getAllPatterns()` returns all rows ordered by `computed_at DESC`
- [ ] `getRelevantPatterns(context)` filters by `category` and/or `pattern_types` array; handles NULL category correctly
- [ ] `checkReadiness()` returns `{ globalReady: false }` if fewer than 20 archived outcomes
- [ ] `checkReadiness()` returns `{ globalReady: true, categoryCounts: { tag: count, ... } }` if threshold met
- [ ] `categoryCounts` is computed from `outcome_tags` JSON array (not a single tag column)
- [ ] All functions use synchronous `better-sqlite3` (no `await`, no `.then()`)
- [ ] `initPatternTables()` is called from `src/routes/api.js` at startup

---

### `src/database/outcomes.js` and `src/database/actions.js` — Migrations

- [ ] `outcome_tags TEXT` column added to `outcomes` table using `db.pragma('table_info')` guard (only if missing)
- [ ] `started_at TEXT` column added to `actions` table using same guard
- [ ] `ended_at TEXT` column added to `actions` table using same guard
- [ ] All three migrations run inside the existing `init` functions (not a separate migration script)
- [ ] No crash if columns already exist

---

### `src/services/pattern-engine.js`

- [ ] File exists and exports `computePatterns`
- [ ] `computePatterns()` is `async`
- [ ] Calls `checkReadiness()` at the start — returns immediately (no logging to user) if `globalReady` is false
- [ ] Computes **Time Accuracy:** queries `actions` with `done = 1`, `started_at IS NOT NULL`, `ended_at IS NOT NULL`; calculates average accuracy percentage
- [ ] Time accuracy only runs if ≥5 timed actions exist
- [ ] Computes **Completion Rate by Category:** iterates `categoryCounts` from `checkReadiness`; skips categories with fewer than 8 data points
- [ ] Computes **Action Count pattern:** queries outcomes with ≥4 actions; only surfaces if sample ≥8
- [ ] Each pattern calls Claude via `anthropic.messages.create()` to generate a human-readable `observation` string (plain text, one sentence)
- [ ] Each observation is saved via `savePatternObservation()` — which atomically replaces the old pattern of the same type
- [ ] `computePatterns()` logs completion to console but never throws to the caller (wrapped in try/catch or fire-and-forget)

---

### `src/services/claude.js` — `autoTagOutcome`

- [ ] `autoTagOutcome(outcomeTitle, resultNote)` is present and exported
- [ ] Uses `anthropic.messages.create()` directly (not streaming)
- [ ] Model is `claude-sonnet-4-6`
- [ ] `max_tokens` is small (≤ 100)
- [ ] Uses consistent taxonomy: `['prospecting', 'pitch_deck', 'email_campaign', 'product', 'strategy', 'admin', 'research', 'client_work', 'reporting', 'other']`
- [ ] Returns array of 1–2 tags
- [ ] Falls back to `['other']` on parse failure
- [ ] `module.exports` updated to include `autoTagOutcome`
- [ ] All existing exports unchanged (including `autoTagLibraryEntry` from Phase 3.2)

---

### `src/routes/api.js` — Analytics Endpoints

- [ ] `patternsDb` properly required at top of file
- [ ] `GET /api/analytics` returns: `totalClosed`, `completionRate`, `resultsRate`, `estimateAccuracy`, `byCategory`, `currentStreak`
- [ ] `completionRate` is computed from last 90 days (not all-time)
- [ ] `resultsRate` only counts outcomes that have `outcome_result` set (not null)
- [ ] `estimateAccuracy` pulled from `pattern_observations WHERE pattern_type = 'time_accuracy'`
- [ ] `byCategory` pulled from `pattern_observations WHERE pattern_type = 'completion_rate'`; sorted by rate descending
- [ ] `GET /api/patterns` returns all `pattern_observations` rows via `getAllPatterns()`
- [ ] No existing routes modified

---

### `src/routes/api.js` — Pattern Injection

**Archive hook:**
- [ ] In the outcome archive route, after saving the archive, `autoTagOutcome` is called as fire-and-forget (no `await` blocking the response)
- [ ] After tagging, `computePatterns()` is triggered (also fire-and-forget)
- [ ] Fire-and-forget has `.catch(e => console.error(...))` — no unhandled promise rejections
- [ ] Archive hook does not modify the JSON response to the frontend

**AI Breakdown route (Phase 2.3):**
- [ ] `checkReadiness()` called before the Claude call
- [ ] Pattern context only injected if `globalReady === true`
- [ ] Pattern context appended to system prompt / user context string — not replacing it
- [ ] Silent if readiness not met (no "not enough data" message in Claude's response)

**Focus Mode route (Phase 2.1):**
- [ ] Time accuracy patterns injected when `globalReady === true`
- [ ] Injection is additive (appended after user context + Library context from Phase 3.2)
- [ ] Silent if no patterns exist

**Inbox Triage route (Phase 2.4):**
- [ ] `action_count` and `completion_rate` patterns injected into `contextSnapshot` when `globalReady === true`
- [ ] Silent if readiness not met

---

### Weekly Pattern Recompute Cron

- [ ] `cron.schedule('59 23 * * 5', ...)` or equivalent fires weekly (Friday or Saturday early)
- [ ] Calls `computePatterns()` inside try/catch
- [ ] Uses stored `timezone` preference
- [ ] Wired up from `src/server.js` on startup (alongside `scheduleBriefings()`)

---

### `public/index.html` — Analytics View

- [ ] `showAnalyticsView()` function exists, sets Analytics as active nav item
- [ ] Fetches both `GET /api/analytics` and `GET /api/patterns`
- [ ] `renderAnalyticsView(stats, patterns)` renders a **2×2 card grid** (not a list, not CSS bars)
- [ ] **Card 1 — Estimate Accuracy:** hero number (22px font), progress bar, improvement note (or "Not enough data yet")
- [ ] **Card 2 — Completion Rate:** hero number, progress bar, streak info
- [ ] **Card 3 — Results Rate:** hero number (amber bar), supplementary line showing outcomes with data
- [ ] **Card 4 — By Category:** list of category + rate pairs; checkmark icon if ≥80%, warning icon if below
- [ ] All hero numbers display `—` (em dash) when no data exists (not `0%` or `null`)
- [ ] Footer: "Patterns update weekly. Next update: [label]."
- [ ] All numbers rendered safely (not via raw `innerHTML` with user data)
- [ ] No right panel when Analytics view is active (full-width center)

---

### No Regressions

- [ ] Outcomes list, actions, archive flow all work as before
- [ ] Focus Mode unchanged (only context injection modified)
- [ ] Today view (Phase 3.0) unchanged
- [ ] Morning Brief (Phase 3.1) unchanged
- [ ] Library view (Phase 3.2) unchanged
- [ ] Memory view (Phase 2.2) accessible
- [ ] Inbox triage unchanged
- [ ] Preserved files (`slack.js`, `grain.js`, all integrations, `triage.js`, `oauth-tokens.js`) untouched
- [ ] Existing `user_context` and `outcomes` table data unaffected (migrations are additive only)

---

## What's Out of Scope for This Phase

- Patterns surfaced as standalone notifications (only in-context injection)
- Analytics chart rendering (bars + numbers only)
- Category patterns below the 8-data-point floor
- Multi-user pattern separation

---

## When You're Done

Log results to `test_tracker/Phase 3.3 - Pattern Memory & Analytics.md`. Verdict: **approved for Phase 4.0** or blocked with specifics.
