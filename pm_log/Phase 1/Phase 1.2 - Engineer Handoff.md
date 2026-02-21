# Phase 1.2 — Engineer Handoff

## Agent Prompt

You are building Phase 1.2 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase makes the Slack input pipeline real: fix an own-messages bug, add scheduled pulls with node-cron, update Claude's triage prompt to classify Outcome vs Action, update the inbox approval flow to create real outcomes and actions, and add a markdown bulk-import endpoint. Read `pm_log/Phase 1.2 - Engineer Handoff.md` in full before writing any code, then use `dev_tracker/Phase 1.2 - Input Pipeline.md` as your working checklist.

---

You are building Phase 1.2 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `REBUILD_PLAN.md` — full technical spec: bug fix details, schema, all endpoint specs, PLAN.md format
2. `dev_tracker/Phase 1.2 - Input Pipeline.md` — your working checklist; update it as you go

**Prerequisite:** Phase 1.0 is signed off. Phase 1.1 can be running in parallel — 1.2 does not depend on it.

---

## What You're Building

The Slack integration exists but has gaps: it captures the user's own messages, runs only on-demand, and dumps raw messages into the inbox without classification. This phase closes all three gaps and adds two input methods: an inbox approval flow that creates real outcomes and actions, and a markdown import for bulk planning.

## What Phase 1.2 Delivers

By the end of this phase:
- Scheduled Slack pulls run automatically at configured times
- Claude classifies each inbox item as Outcome or Action with a reasoning line
- Approving an Action creates a real action record, with optional outcome assignment
- Approving an Outcome creates a real outcome record, with project/deadline/priority
- Bulk planning via `PLAN.md` import works end-to-end
- The user's own messages no longer pollute the inbox

---

## What to Build

### 1. Bug Fix — Own Messages (Do This First)

In `src/routes/slack.js` around line 431, there is a comment explicitly keeping the user's own messages. Fix this before anything else.

**The filter for kept messages must be:**
```
msg.bot_id is falsy
AND msg.user !== authenticatedUserId
AND msg.text is non-empty
```

The authenticated user's Slack user ID is stored in the `oauth_tokens` record under `scopes.user_id` — this is set during the OAuth callback at line ~113. Retrieve it and use it as the filter value.

Do not restructure `src/routes/slack.js` beyond this fix.

---

### 2. Scheduled Pulls

**Install:** `node-cron`

**New table:**
```sql
CREATE TABLE slack_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_time TEXT NOT NULL,        -- e.g. "09:00" 24h format
  timezone TEXT DEFAULT 'America/New_York',
  enabled INTEGER DEFAULT 1,
  last_run_at TEXT,              -- ISO timestamp of last successful pull
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Create `src/services/scheduler.js`:**
- Initializes cron jobs on server start from the `slack_schedule` table
- Each scheduled run calls the same pull logic as `POST /api/slack/pull` — do not duplicate the implementation
- Pull window: `oldest = last_run_at` for that schedule row (not a fixed hours-back window)
- First-ever run (`last_run_at` is null): default to 24 hours back
- Update `last_run_at` on that row **only after a successful pull**
- Each schedule row has its own independent `last_run_at` — two configured times each track their own window

**New API endpoints:**
```
GET    /api/slack/schedule              -- list all configured run times
POST   /api/slack/schedule              -- body: { run_time, timezone }
PUT    /api/slack/schedule/:id          -- enable/disable or change time
DELETE /api/slack/schedule/:id
```

---

### 3. Claude Triage Prompt Update

In `src/services/claude.js` (or wherever triage processing lives), update the Claude prompt to:

1. Classify as `outcome` (a new goal/deliverable to be defined and executed) or `action` (a specific task to be done)
2. Return: `classification`, `title` (clean suggested title), `ai_reasoning` (1 sentence)
3. **Do not** attempt to match actions to existing outcomes — that is the user's job

Do not change the underlying service structure — update the prompt only.

---

### 4. Inbox DB Migration

```sql
ALTER TABLE inbox ADD COLUMN classification TEXT;        -- 'outcome' | 'action' | 'unknown'
ALTER TABLE inbox ADD COLUMN suggested_outcome_id INTEGER REFERENCES outcomes(id);
ALTER TABLE inbox ADD COLUMN ai_reasoning TEXT;
```

Additive migration only — no existing inbox data is affected.

---

### 5. Inbox Approval Flow

**Approving an Action:**
- Creates a record in the `actions` table
- User picks parent outcome from a dropdown of active outcomes, OR explicitly selects "Leave unassigned"
- Unassigned is a valid state — `outcome_id` may be null

**Approving an Outcome:**
- Creates a record in the `outcomes` table
- User must fill in: project (picker), deadline, priority before the approve button activates

**Dismissing:** No change to existing behavior.

---

### 6. Inbox UI Updates (`waypoint-v2.html`)

Each inbox item must display:
- Classification badge: `Outcome` or `Action`
- AI reasoning line (small, secondary text)
- For Action items: outcome picker dropdown (all active outcomes) + "Leave unassigned" option
- For Outcome items: project picker + deadline + priority fields inline, before the approve button

---

### 7. Quick Capture Update

Left sidebar quick capture:
- Default behavior: create as unassigned action (no change from current)
- Add: optional outcome picker so the user can assign at capture time

---

### 8. Markdown Import (PLAN.md)

**File:** `PLAN.md` at project root (gitignored — add to `.gitignore` if not already there)

**Format:**
```markdown
## Project: PRODUCT

### Outcome: Launch Email Campaign
Deadline: 2025-03-15 | Priority: high | Impact: Customer-facing

- [ ] Write email sequence draft (deep, 90m)
- [ ] QA automation trigger (light, 30m)
- [ ] Review with team (light, 20m)
```

**Endpoint:** `POST /api/import/plan`
- Reads and parses `PLAN.md` from project root
- Creates outcomes and actions that don't already exist — match on title, **case-insensitive**
- **Additive only** — never deletes or modifies existing data
- Returns: `{ outcomes_created, actions_created, skipped }`

---

## Key Constraints

- **`src/routes/slack.js`:** Touch only for the bug fix. Do not restructure.
- **`src/services/claude.js`:** Update the triage prompt only. Do not change service structure.
- **Do not touch:** `src/routes/grain.js`, `src/integrations/`, `src/utils/crypto.js`, `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`
- **Scheduler calls pull logic, doesn't duplicate it.** One implementation, two callers.
- **`last_run_at` updates only on success.** A failed pull must not advance the window.
- **Unassigned actions are valid.** Never force an outcome assignment.

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 1.2 - Input Pipeline.md` as you finish it. When the full checklist is done, flag for PM review before Phase 1.3 begins.
