# Waypoint v2 — Engineering Rebuild Plan

## Context

Waypoint is a single-user, local-first productivity app. The target frontend (`waypoint-v2.html`) is a fully-designed, production-quality static HTML/CSS/JS file with zero backend wiring. Every interaction currently operates on hardcoded in-memory data. This rebuild makes it real.

---

## Architecture Decisions (Already Locked)

- **Data hierarchy:** `Projects → Outcomes → Actions`. Projects already exist. Outcomes and Actions are new.
- **Slack access model:** User OAuth token (`xoxp-`), NOT a bot token. This means the app can read any channel or DM the authenticated user is in — no bot invitation needed. Do not change this.
- **Slack pull model:** On-demand + scheduled (NOT real-time webhooks for primary flow). Scheduled pulls track `last_run_at` timestamp and pull everything since then — no gaps, no overlaps.
- **Inbox model:** Batch morning review. Not a real-time alert system. No notification UI needed.
- **Triage classification:** Claude classifies each Slack message as `outcome` or `action`. Claude does NOT attempt to match actions to existing outcomes — the user picks the parent in the inbox UI.
- **Unassigned actions:** Valid state. Actions can exist without an outcome temporarily.
- **Start fresh:** Existing `tasks` and `inbox` data is not migrated. New tables, clean slate.
- **Single frontend:** Serve `waypoint-v2.html` as the main app immediately. No parallel v1.
- **No authentication:** Single-user app, no auth system needed.

---

## What to Keep (Touch Nothing)

| Component | Notes |
|---|---|
| `src/server.js` | Entry point, middleware, session handling — all good |
| `src/routes/slack.js` | Keep entirely, with one bug fix (see Phase 1.2) |
| `src/routes/grain.js` | Keep entirely |
| `src/integrations/slack-client.js` | Keep entirely |
| `src/integrations/grain-client.js` | Keep entirely |
| `src/utils/crypto.js` | Keep entirely |
| `src/database/oauth-tokens.js` | Keep entirely |
| `src/database/monitored-channels.js` | Keep entirely |
| `src/database/triage.js` | Keep, modify Claude prompt in Phase 1.2 |
| `src/services/claude.js` | Keep, extend with new tools in later phases |
| `database/waypoint.db` | Keep file, add new tables via migration |
| `projects` DB table | Keep entirely |
| `oauth_tokens` DB table | Keep entirely |
| `monitored_channels` DB table | Keep entirely |
| `triage_queue` DB table | Keep entirely |

## What to Trash / Ignore

| Component | Decision |
|---|---|
| `public/index.html` | Replaced by `waypoint-v2.html` — can delete |
| `public/app.js` | Replaced — can delete |
| `src/routes/api.js` (tasks/notes sections) | Tasks and Notes APIs are deprecated. Keep Projects API. Gut the rest and rebuild. |
| `src/database/tasks.js` | Deprecated — delete |
| `src/database/notes.js` | Deprecated — delete (Notes are not in v2 UI) |
| `src/database/db.js` (legacy async wrapper) | Deprecated — delete after confirming nothing depends on it |
| `src/database/workflow-tabs.js` | No kanban view in v2 — deprecate |
| `tasks` DB table | Orphaned — leave in place but ignore |
| `notes` DB table | Orphaned — leave in place but ignore |
| `workflow_tabs` DB table | Orphaned — leave in place but ignore |
| `inbox` DB table | Will be extended in Phase 1.2, not replaced |

## Technical Debt to Resolve in Phase 1.0

The codebase has a **database driver split**: `tasks.js` and `notes.js` use the old async callback-based `sqlite3` package, while all newer code uses the sync `better-sqlite3` singleton. Since both deprecated files are being deleted, this resolves itself — but make sure no remaining files import from `database/db.js` after cleanup. Standardize entirely on `better-sqlite3` going forward.

---

## New Data Model

### `outcomes` table
```sql
CREATE TABLE outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  deadline TEXT,                         -- ISO date string e.g. "2025-02-28"
  priority TEXT DEFAULT 'medium',        -- 'critical' | 'high' | 'medium'
  impact TEXT,                           -- free text e.g. "Customer-facing"
  status TEXT DEFAULT 'active',          -- 'active' | 'archived'
  archived_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### `actions` table
```sql
CREATE TABLE actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outcome_id INTEGER REFERENCES outcomes(id) ON DELETE CASCADE,  -- nullable = unassigned
  title TEXT NOT NULL,
  time_estimate INTEGER,                 -- minutes
  energy_type TEXT DEFAULT 'light',      -- 'deep' | 'light'
  done INTEGER DEFAULT 0,               -- boolean
  done_at TEXT,
  blocked INTEGER DEFAULT 0,            -- boolean
  blocked_by TEXT,                       -- free text reason e.g. "Waiting on code review"
  position INTEGER DEFAULT 0,           -- ordering within an outcome
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### `reflections` table (Phase 1.3)
```sql
CREATE TABLE reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  what_worked TEXT,
  what_slipped TEXT,
  reusable_insight TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### `slack_schedule` table (Phase 1.2)
```sql
CREATE TABLE slack_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_time TEXT NOT NULL,               -- e.g. "09:00" in 24h format
  timezone TEXT DEFAULT 'America/New_York',
  enabled INTEGER DEFAULT 1,
  last_run_at TEXT,                     -- ISO timestamp of last successful pull
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Inbox table additions (Phase 1.2)
Add columns to existing `inbox` table via migration:
```sql
ALTER TABLE inbox ADD COLUMN classification TEXT;       -- 'outcome' | 'action' | 'unknown'
ALTER TABLE inbox ADD COLUMN suggested_outcome_id INTEGER REFERENCES outcomes(id);
ALTER TABLE inbox ADD COLUMN ai_reasoning TEXT;
```

---

## Phase 1.0 — Make It Real

**Goal:** Replace every hardcoded data structure in `waypoint-v2.html` with real API calls. The app becomes usable day-to-day.

### Server Changes
- Move `waypoint-v2.html` to `public/index.html` (replaces v1)
- Or configure Express to serve `waypoint-v2.html` at `GET /`

### Database
- Create migration: add `outcomes` and `actions` tables
- Clean up deprecated files: `src/database/tasks.js`, `src/database/notes.js`, `database/db.js`
- Create `src/database/outcomes.js` — sync better-sqlite3 CRUD
- Create `src/database/actions.js` — sync better-sqlite3 CRUD

### API — New Endpoints (build in `src/routes/api.js` or new `src/routes/outcomes.js`)

**Outcomes:**
```
GET    /api/outcomes                    # all outcomes, optional ?project_id=&status=
GET    /api/outcomes/:id                # single outcome with actions
POST   /api/outcomes                    # create (body: project_id, title, description, deadline, priority, impact)
PUT    /api/outcomes/:id                # update
DELETE /api/outcomes/:id               # delete
POST   /api/outcomes/:id/archive        # set status=archived, archived_at=now
```

**Actions:**
```
GET    /api/outcomes/:id/actions        # list actions for an outcome
POST   /api/outcomes/:id/actions        # create action (body: title, time_estimate, energy_type, blocked, blocked_by, position)
GET    /api/actions/unassigned          # actions with no outcome_id
PUT    /api/actions/:id                 # update (title, time_estimate, energy_type, done, blocked, blocked_by, position, outcome_id)
DELETE /api/actions/:id                # delete
PATCH  /api/actions/:id/toggle          # flip done boolean, set/clear done_at
PATCH  /api/actions/:id/reorder         # update position within outcome
```

**Projects (keep existing, verify these work):**
```
GET    /api/projects
GET    /api/projects/:id
POST   /api/projects
PUT    /api/projects/:id
DELETE /api/projects/:id
```

### Frontend Wiring (`waypoint-v2.html`)

Replace all hardcoded `OUTCOMES` array operations with `fetch()` calls:

| Current hardcoded operation | Becomes |
|---|---|
| Initial `OUTCOMES` array | `GET /api/outcomes` on page load |
| `toggleAction(actionId)` | `PATCH /api/actions/:id/toggle` |
| `handleAddAction(outcomeId, title)` | `POST /api/outcomes/:id/actions` |
| `archiveOutcome(outcomeId)` | `POST /api/outcomes/:id/archive` |
| `handleQuickCapture(text)` | `POST /api/outcomes` (if phrased as outcome) or `POST /api/actions` |
| Project list in left sidebar | `GET /api/projects` |
| Outcomes mini-list in left sidebar | `GET /api/outcomes?status=active` |

Phase state (which outcome is selected, which phase the user is in) can remain client-side — it does not need to persist to the backend.

---

## Phase 1.1 — Execution Intelligence

**Goal:** The right panel becomes genuinely useful. Deadline risk, progress, and time breakdowns are computed from real data.

### API — New Computed Endpoints

```
GET /api/outcomes/:id/stats
```
Returns:
```json
{
  "progress": 0.42,               // done_time / total_time (time-weighted)
  "total_time": 320,              // sum of all action time_estimates (minutes)
  "done_time": 135,               // sum of done action time_estimates
  "remaining_time": 185,
  "deep_time": 200,               // total deep work minutes
  "light_time": 120,
  "deep_done": 90,
  "light_done": 45,
  "deadline_risk": "high",        // 'low' | 'medium' | 'high' | 'critical' | null (null = no deadline set)
  "days_left": 10,
  "minutes_per_day_needed": 18.5,
  "blocked_count": 1
}
```

**Deadline risk calculation:**
- `remaining_time / days_left` = minutes/day needed
- Compare against a reasonable daily capacity (suggest making this configurable, default 240 min/day of focused work)
- `low` = on track, `medium` = tight, `high` = at risk, `critical` = mathematically impossible

```
GET /api/projects/:id/intelligence
```
Returns workspace overview for Phase 1 right panel:
```json
{
  "total_outcomes": 4,
  "total_queued_time": 1240,
  "deep_split": 0.6,
  "light_split": 0.4,
  "deadline_risks": [
    { "outcome_id": 1, "title": "...", "risk": "critical", "days_left": 3 }
  ]
}
```

### Frontend Wiring

- Wire right panel ring chart to `/api/outcomes/:id/stats` on outcome selection
- Wire workspace overview panel to `/api/projects/:id/intelligence`
- Wire deadline risk list in both Phase 1 and Phase 2 right panels
- Wire "Available Today" panel: use local action list filtered to not-done + not-blocked for the selected outcome (not `total_queued_time` from intelligence endpoint)

---

## Phase 1.2 — The Input Pipeline

**Goal:** Slack feeds the system properly. Morning review ritual works end-to-end.

### Bug Fix (do this first)
In `src/routes/slack.js`, the pull route at line 431 explicitly keeps the user's own messages. Fix:

The `oauth_tokens` record stores the user's Slack user ID in `scopes.user_id` (set during OAuth callback). During the pull, retrieve this ID and filter:
```
Filter: msg.bot_id is falsy AND msg.user !== authenticatedUserId AND msg.text is non-empty
```

### Scheduled Pulls (node-cron)
- Add `node-cron` dependency
- Create `src/services/scheduler.js` — initializes cron jobs on server start
- On each scheduled run: call the same logic as `POST /api/slack/pull`, update `last_run_at` in `slack_schedule`
- Pull window: `oldest = last_run_at` (not a fixed hours-back window)
- If `last_run_at` is null (first run ever), default to 24 hours back

**Schedule API:**
```
GET    /api/slack/schedule              # list configured run times
POST   /api/slack/schedule              # add a run time (body: run_time "09:00", timezone)
PUT    /api/slack/schedule/:id          # update (enable/disable, change time)
DELETE /api/slack/schedule/:id         # remove a run time
```

### Claude Triage Prompt Update
In `src/services/claude.js` (or wherever triage processing lives), update the Claude prompt for triage to:

1. Classify the message as `outcome` (a new goal/deliverable that needs to be defined and executed) or `action` (a specific task someone wants done)
2. Return `classification`, `title` (suggested clean title), `ai_reasoning` (1 sentence why)
3. Do NOT attempt to match actions to existing outcomes — that's the user's job

### Inbox DB Migration
Add `classification`, `suggested_outcome_id`, `ai_reasoning` columns to `inbox` table (see schema above).

### Inbox Approval Flow Updates
- **Approving an outcome:** Creates a record in `outcomes` table (user fills in project, deadline, priority before approving)
- **Approving an action:** Creates a record in `actions` table — user must select parent outcome from dropdown (or explicitly leave unassigned)
- **Dismissing:** No change to existing behavior

### Inbox UI Changes (`waypoint-v2.html` or separate inbox view)
Each inbox item needs:
- Classification badge: `Outcome` or `Action` (from Claude)
- AI reasoning text (small, secondary)
- For `Action` items: parent outcome picker dropdown (list of active outcomes) + "Leave unassigned" option
- For `Outcome` items: project picker + deadline + priority fields before approve

### Quick Capture Update
Left sidebar quick capture input should offer:
- Default: create as unassigned action
- Option to specify parent outcome inline (e.g. `#outcome-name` syntax or a picker)

### Markdown Import (PLAN.md)
A structured markdown format for bulk outcome/action creation. Intended to be drafted or edited by Claude Code outside the app, then imported in one command. The file is ephemeral — write, import, done. Not an ongoing sync.

**File location:** `PLAN.md` at project root (gitignored)

**Format:**
```markdown
## Project: PRODUCT

### Outcome: Launch Email Campaign
Deadline: 2025-03-15 | Priority: high | Impact: Customer-facing

- [ ] Write email sequence draft (deep, 90m)
- [ ] QA automation trigger (light, 30m)
- [ ] Review with team (light, 20m)

### Outcome: Generate Weekly Reports
Deadline: 2025-03-01 | Priority: medium

- [ ] Pull data from analytics (light, 45m)
- [ ] Draft report template (deep, 60m)
```

**API endpoint:**
```
POST /api/import/plan
```
Behavior:
- Reads and parses `PLAN.md` from project root
- Creates outcomes and actions that don't already exist (match on title, case-insensitive)
- Additive only — never deletes existing data
- Returns: `{ outcomes_created, actions_created, skipped }`

---

## Phase 1.3 — Close the Loop

**Goal:** Phase 3 (Archive) is fully functional. Completing an outcome is a real moment with data.

### Database
- Create `reflections` table (see schema above)

### API
```
POST /api/outcomes/:id/complete
```
Body:
```json
{
  "what_worked": "...",
  "what_slipped": "...",
  "reusable_insight": "..."
}
```
Sets `status = archived`, `archived_at = now`, stores reflection. Reflections are optional — allow archiving without filling them out.

```
GET /api/outcomes/:id/reflection        # retrieve stored reflection
GET /api/outcomes/archived              # recently archived outcomes for left sidebar
```

**Completion stats snapshot** — store on archive:
- Total actions, completed actions, total estimated time, deadline hit/miss

### Frontend Wiring
- Wire Phase 3 reflection form to `POST /api/outcomes/:id/complete`
- Wire "Recently Closed" left sidebar list to `GET /api/outcomes/archived`
- Wire today's metrics panel (outcomes completed today, actions done)

---

## Phase 1.4 — AI Co-pilot

**Goal:** Claude handles complex operations the UI fundamentally cannot. Fast, contextual, and scoped.

**Critical scope boundary:** Claude does NOT replace UI interactions for simple operations. Adding one action, toggling done, archiving an outcome — these stay in the UI. Claude is for bulk, inference, and unstructured-to-structured work only. This boundary was validated by testing the v1 chat live: simple ops via Claude are slower than the UI. Complex ops are where Claude wins decisively.

### UI Surface: Command Palette (⌘K)

Floating overlay, accessible via ⌘K from anywhere in the app. On open, Claude receives injected context:
- Current active project
- Selected outcome (if any) — title, description, deadline, existing actions
- Today's deadline risk summary
- Active outcome list

The palette accepts natural language input. All tools use the existing preview-before-execute pattern already in `src/services/claude.js`.

### Contextual ✦ Button on Outcome Cards

Each outcome card in the Phase 1 grid gets a small ✦ trigger button. Clicking it opens the command palette pre-loaded with that outcome's context and a "break into actions" preset. Provides discoverability before the ⌘K habit is formed.

### Claude Tools

Update `src/services/claude.js` with new tools targeting the outcomes/actions model:

| Tool | Trigger | What it does |
|---|---|---|
| `break_into_actions` | ✦ button or ⌘K | Receives outcome context, returns suggested action list with `title`, `time_estimate`, `energy_type`. User reviews in a modal — accept/edit/reject each before any are created. |
| `brain_dump_to_outcomes` | ⌘K | Receives unstructured text (e.g. post-meeting notes), extracts and creates outcomes + actions in the correct project. |
| `bulk_reschedule` | ⌘K | Receives a date change instruction, updates deadlines across a project's outcomes. |
| `prioritize_today` | ⌘K | Receives full outcome + deadline risk context, returns a clear prioritization recommendation. |

Remove old tools targeting the deprecated tasks model: `create_task`, `update_task`, `complete_task`, `delete_task`, `list_tasks`, `create_note`.

### Grain Integration
Confirm with PM whether Grain is still in active use before building. If yes: update the Grain webhook handler in `src/routes/grain.js` to classify meeting notes using the same Outcome/Action prompt as the Slack triage pipeline (Phase 1.2). Infrastructure is preserved — just needs prompt update and inbox approval flow wired to new model.

---

## Key Numbers (for reference)

- Live DB: 2 projects, 19 tasks (to be ignored), 19 inbox items (to be ignored)
- Existing Slack integration: user-token OAuth, `xoxp-` token, scopes: `channels:history`, `groups:history`, `im:history`, `mpim:history`, `users:read`, `channels:read`, `groups:read`, `im:read`, `mpim:read`
- Stack: Node.js, Express 5, better-sqlite3, Anthropic SDK (`claude-sonnet-4-20250514`), vanilla JS frontend (no framework)
