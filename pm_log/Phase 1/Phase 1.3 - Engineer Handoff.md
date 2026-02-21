# Phase 1.3 — Engineer Handoff

## Agent Prompt

You are building Phase 1.3 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase makes archiving an outcome a real moment: it stores a completion stats snapshot, optionally captures a reflection (what worked, what slipped, reusable insight), and populates the "Recently Closed" sidebar and today's metrics panel with live data. Read `pm_log/Phase 1.3 - Close the Loop.md` in full before writing any code, then use `dev_tracker/Phase 1.3 - Close the Loop.md` as your working checklist.

---

You are building Phase 1.3 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 1.3 - Close the Loop.md` — full phase spec: schema, endpoints, frontend wiring
2. `dev_tracker/Phase 1.3 - Close the Loop.md` — your working checklist; update it as you go
3. `src/database/outcomes.js` — existing `archiveOutcome()` you will extend
4. `src/database/actions.js` — `time_estimate` is stored as INTEGER (minutes); `done_at` is set by `toggleAction()`

**Prerequisite:** Phase 1.0 is complete. This phase does not depend on 1.1 or 1.2.

---

## What You're Building

Right now "archiving" an outcome just sets `status = archived`. There is no record of how it went. This phase turns archive into a closing ritual: capture what happened (stats snapshot), optionally write a quick reflection, and surface that history in the UI — "Recently Closed" sidebar and a today's metrics panel.

## What Phase 1.3 Delivers

By the end of this phase:
- Completing an outcome captures a stats snapshot (action counts, time estimates, deadline hit/miss)
- Reflection fields (what worked, what slipped, reusable insight) are stored if filled — never required
- "Recently Closed" left sidebar list is populated from real data
- Today's metrics panel shows outcomes archived and actions completed today
- After archiving, the outcome disappears from the active list

---

## What to Build

### 1. DB Migration — Stats Snapshot Columns on `outcomes`

Add four columns to the `outcomes` table (additive migration only):

```sql
ALTER TABLE outcomes ADD COLUMN total_actions_count INTEGER;
ALTER TABLE outcomes ADD COLUMN completed_actions_count INTEGER;
ALTER TABLE outcomes ADD COLUMN total_estimated_minutes INTEGER;
ALTER TABLE outcomes ADD COLUMN deadline_hit INTEGER;   -- 1 = hit, 0 = missed, NULL = no deadline set
```

Run this migration in `src/database/outcomes.js` inside `initOutcomesTable()` using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — or guard with a try/catch since SQLite does not support `IF NOT EXISTS` on `ALTER TABLE`. Pattern used elsewhere in this project: wrap each `ALTER` in a try/catch and ignore "duplicate column" errors.

---

### 2. New File — `src/database/reflections.js`

Create this file. Follow the same sync better-sqlite3 pattern as `outcomes.js` and `actions.js`.

**`initReflectionsTable()`:**
```sql
CREATE TABLE IF NOT EXISTS reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  what_worked TEXT,
  what_slipped TEXT,
  reusable_insight TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**`createReflection(data)`:**
- Params: `{ outcome_id, what_worked, what_slipped, reusable_insight }` — all text fields optional
- Insert and return the new row

**`getReflectionByOutcomeId(outcomeId)`:**
- Return the reflection row for this outcome, or `null` if none exists

Export: `{ initReflectionsTable, createReflection, getReflectionByOutcomeId }`

---

### 3. Update `src/database/outcomes.js` — Add `completeOutcome()` and `getArchivedOutcomes()`

**Do not modify `archiveOutcome()`** — leave it for any callers that already use it.

**Add `completeOutcome(id, statsSnapshot)`:**
- `statsSnapshot`: `{ total_actions_count, completed_actions_count, total_estimated_minutes, deadline_hit }`
- Sets `status = 'archived'`, `archived_at = datetime('now')`, `updated_at = datetime('now')`
- Also writes the four stats columns in the same UPDATE
- Returns the updated outcome row via `getOutcomeById(id)`

**Add `getArchivedOutcomes(limit = 20)`:**
- Returns recently archived outcomes ordered by `archived_at DESC`
- Include `project_name`, `project_color` (join projects)
- Limit to `limit` rows

Export both new functions alongside existing exports.

---

### 4. API Endpoints

Add these routes to `src/routes/api.js`.

**⚠️ Route order matters:** Register `GET /api/outcomes/archived` and `GET /api/outcomes/stats/today` **before** `GET /api/outcomes/:id` — otherwise Express will match the literal strings "archived" and "stats" as ID parameters.

#### `POST /api/outcomes/:id/complete`

Body (all fields optional — archive works with an empty body):
```json
{
  "what_worked": "...",
  "what_slipped": "...",
  "reusable_insight": "..."
}
```

Handler logic:
1. Fetch the outcome by id — 404 if not found
2. Query actions for this outcome to compute the stats snapshot:
   - `total_actions_count`: COUNT of actions where `outcome_id = id`
   - `completed_actions_count`: COUNT of actions where `outcome_id = id AND done = 1`
   - `total_estimated_minutes`: SUM of `time_estimate` where `outcome_id = id` (null if no actions or all null estimates)
   - `deadline_hit`: if outcome has no deadline → `null`; if `deadline >= DATE('now')` → `1`; else → `0`
3. Call `completeOutcome(id, statsSnapshot)`
4. If body has any non-empty reflection field, call `createReflection({ outcome_id: id, ...reflectionFields })`
5. Return `{ success: true, data: updatedOutcome }`

#### `GET /api/outcomes/:id/reflection`

- Fetch reflection by outcome id via `getReflectionByOutcomeId(id)`
- Return `{ success: true, data: reflection }` — `data` may be `null` if no reflection was saved

#### `GET /api/outcomes/archived`

- Call `getArchivedOutcomes()` (default limit 20)
- Return `{ success: true, count: N, data: [...] }`

#### `GET /api/outcomes/stats/today`

- Two inline DB queries:
  - `outcomes_archived_today`: `SELECT COUNT(*) FROM outcomes WHERE DATE(archived_at) = DATE('now')`
  - `actions_completed_today`: `SELECT COUNT(*) FROM actions WHERE DATE(done_at) = DATE('now')`
- Return `{ success: true, data: { outcomes_archived_today, actions_completed_today } }`

Call `initReflectionsTable()` in the init block at the top of `api.js` alongside the other `init*Table()` calls.

---

### 5. Frontend Wiring (`public/index.html`)

The Phase 3 completion card UI already exists — just wire it. Read the existing HTML structure before touching anything.

**Archive button → `POST /api/outcomes/:id/complete`:**
- Collect reflection field values from the Phase 3 form (send whatever is filled in, even if some fields are empty)
- On success: remove the outcome card from the Phase 1 active list and navigate back to Phase 1 (outcome list view)

**Phase 3 reflection form → same `POST /api/outcomes/:id/complete`:**
- Same as above — the archive button and the reflection form submit together in one call

**"Recently Closed" left sidebar list → `GET /api/outcomes/archived`:**
- Call on page load and after any successful archive
- Render each archived outcome as a list item (title + `archived_at` date, keep it minimal)

**Today's metrics panel → `GET /api/outcomes/stats/today`:**
- Call on page load and after any successful archive
- Display `outcomes_archived_today` and `actions_completed_today` counts

---

## Key Constraints

- **`archiveOutcome()`:** Do not modify — add `completeOutcome()` as a new function alongside it.
- **Reflections are optional:** The archive flow must never block on an empty reflection form.
- **Stats snapshot is computed at archive time:** Do not recalculate after the fact.
- **`deadline_hit` is `null` when no deadline is set** — not `0`. Consistent with Decision #14 in `key_decisions/decisions_log.md`.
- **Route registration order:** `GET /api/outcomes/archived` and `GET /api/outcomes/stats/today` must come before `GET /api/outcomes/:id`.
- **Do not touch:** `src/routes/grain.js`, `src/routes/slack.js`, `src/integrations/`, `src/utils/crypto.js`, `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 1.3 - Close the Loop.md` as you finish each workstream — not all at the end. Log your session date and any notable decisions in the **Build Log** table. When the full checklist is done, flag for PM review before Phase 1.4 begins.
