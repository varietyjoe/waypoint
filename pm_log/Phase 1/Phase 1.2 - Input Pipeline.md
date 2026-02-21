# Phase 1.2 — Input Pipeline

**Goal:** Slack feeds the system properly. The morning review ritual works end-to-end. This is what makes the app self-sustaining rather than a manual entry system.

**Status:** Not Started
**Depends on:** Phase 1.0 complete (Phase 1.1 can run in parallel)
**Unlocks:** Phase 1.3

---

## What This Phase Delivers

By the end of 1.2, the user can:
- Have Slack messages automatically pulled at configured times (e.g. 9am, 3pm, 7pm)
- Open the inbox in the morning and see classified items — each tagged as Outcome or Action by Claude
- For Action items: pick which outcome it belongs to from a dropdown (or leave unassigned)
- For Outcome items: fill in project + deadline + priority and approve
- Clear the inbox and start the day with an accurate, current outcome list

---

## Scope

### Bug Fix — Own Messages (Do First)
In `src/routes/slack.js`, the pull route at ~line 431 explicitly keeps the user's own messages (see comment: "but keep messages from self"). This is wrong.

**Fix:** Retrieve the user's Slack user ID from the stored OAuth token (`scopes.user_id`, set during callback at line 113). During pull, add filter: `msg.user !== authenticatedUserId`.

### Scheduled Pulls
- Add `node-cron` dependency
- Create `src/services/scheduler.js` — initializes cron jobs on server start from `slack_schedule` table
- Pull window: `oldest = last_run_at` (NOT fixed hours back) — no gaps, no overlaps
- First-ever run (null `last_run_at`): default to 24 hours back
- Update `last_run_at` after each successful run

**New DB table: `slack_schedule`**
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

**New API endpoints:**
```
GET    /api/slack/schedule
POST   /api/slack/schedule        -- body: run_time, timezone
PUT    /api/slack/schedule/:id    -- enable/disable, change time
DELETE /api/slack/schedule/:id
```

### Claude Triage Prompt Update
Update the Claude prompt used in triage processing to:
1. Classify as `outcome` (a new goal/deliverable) or `action` (a specific task)
2. Return: `classification`, `title` (clean suggested title), `ai_reasoning` (1 sentence)
3. Do NOT attempt to match actions to existing outcomes — that is the user's job

### Inbox DB Migration
```sql
ALTER TABLE inbox ADD COLUMN classification TEXT;        -- 'outcome' | 'action' | 'unknown'
ALTER TABLE inbox ADD COLUMN suggested_outcome_id INTEGER REFERENCES outcomes(id);
ALTER TABLE inbox ADD COLUMN ai_reasoning TEXT;
```

### Inbox Approval Flow Updates
- **Approving an Outcome:** Creates record in `outcomes` table. User fills in project, deadline, priority inline before approving.
- **Approving an Action:** Creates record in `actions` table. User selects parent outcome from dropdown OR explicitly leaves unassigned.
- **Dismissing:** No change to existing behavior.

### Inbox UI Updates
Each inbox item must show:
- Classification badge: `Outcome` or `Action`
- AI reasoning line (small, secondary text)
- For Actions: parent outcome picker dropdown with all active outcomes + "Leave unassigned" option
- For Outcomes: project picker + deadline + priority fields before approve button

### Quick Capture Update
Left sidebar quick capture should support:
- Default: create as unassigned action
- Optional: select parent outcome from picker

### Markdown Import (PLAN.md)
A structured markdown file that Claude Code can draft or edit outside the app, then import in one command. Intended for bulk planning (start of week, major restructuring). The file is ephemeral — write, import, done. Not an ongoing sync.

**File:** `PLAN.md` at project root (gitignored)

**Format:**
```markdown
## Project: PRODUCT

### Outcome: Launch Email Campaign
Deadline: 2025-03-15 | Priority: high | Impact: Customer-facing

- [ ] Write email sequence draft (deep, 90m)
- [ ] QA automation trigger (light, 30m)
```

**Endpoint:** `POST /api/import/plan`
- Parses the file, creates outcomes + actions that don't already exist (title match)
- Additive only — never deletes existing data
- Returns: `{ outcomes_created, actions_created, skipped }`

---

## Out of Scope for This Phase
- Reflections / archive (1.3)
- Claude action suggestions (1.4)
- Grain integration (1.4)

---

## Definition of Done
- [ ] Own-messages bug fixed and verified
- [ ] Scheduled pulls run at configured times
- [ ] Pull window uses last_run_at correctly (no gaps, no duplicates)
- [ ] Schedule configurable from UI
- [ ] Claude classifies Outcome vs Action (not generic "task")
- [ ] Inbox shows classification + AI reasoning
- [ ] Action approval flow creates actions with optional outcome assignment
- [ ] Outcome approval flow creates outcomes with project/deadline/priority
- [ ] Unassigned actions visible in unassigned bucket
- [ ] Engineer + PM sign-off

---

## Key Decisions Locked
- Batch morning review model — not real-time (#8)
- Claude classifies only, user picks parent outcome (#9)
- Unassigned is a valid state (#10)
- Pull window = last_run_at, not fixed hours (#11)
