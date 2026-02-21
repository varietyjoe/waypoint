# Phase 3.3 — Pattern Memory & Execution Analytics

**Goal:** Claude has looked at months of your work and has a perspective. It surfaces that perspective at exactly the right moment — not as a notification, not in the brief, but when you're about to do something where the pattern applies.

**Status:** Not Started
**Depends on:** Phase 3.2 complete (Library exists as data source) + minimum data corpus (see Readiness Gate below)

---

## The Readiness Gate (Decision #19)

Pattern Memory must not surface patterns until the data is meaningful.

**Global floor:** 20 closed outcomes before any pattern is ever shown to the user.
**Per-category floor:** 8 data points in a specific category before that category's pattern surfaces.
**Confidence labeling:** Every pattern observation is labeled with its sample size. "Based on 11 sales outcomes…" The user can calibrate how much weight to give it.
**In-context only:** Patterns surface only in moments where they're relevant — mid-triage, mid-breakdown, mid-Focus. Never as a standalone notification. Never in the Slack brief. The user is about to do something where the pattern applies; that's when Claude mentions it.

If neither gate is met, Pattern Memory is silent. No "not enough data yet" messaging — just silence.

---

## What This Phase Delivers

By the end of 3.3:
- Claude tracks patterns across closed outcomes, results data, and Focus session history
- In relevant moments, Claude proactively surfaces one observation ("Quick note: tasks like this have taken you 40% longer than estimated. Want me to adjust?")
- A new Execution Analytics view shows your metrics over time — proof the product is working
- The flywheel becomes visible: estimate accuracy improves, completion rate is measurable, results rate is tracked

---

## The Patterns Claude Tracks

### Time Estimation Accuracy
- Per task type: "Your email campaign actions are estimated at 90 min on average, but take 2h 15m"
- Source: `actions.time_estimate` vs actual time (requires tracking `started_at`/`ended_at` on actions — add in this phase or approximate from Focus session `duration_seconds`)
- When surfaced: during AI Breakdown, when Claude is estimating a similar action type

### Completion Rate by Outcome Type
- "Outcomes tagged as prospecting close at 60%. Outcomes with ≤3 actions close at 90%."
- Source: `outcomes` table, categorized by tags Claude assigns on archive (add `outcome_tags TEXT` column)
- When surfaced: during triage, when user is creating an outcome with many actions

### Results Rate
- "You've set 5-meeting goals 6 times. Average result: 3.1 meetings booked."
- Source: `outcome_result` ('hit'/'miss') + `outcome_result_note` (parsed for magnitude)
- Claude extracts the metric from free-text notes ("4 meetings booked" → target: 5, result: 4, rate: 80%)
- When surfaced: during triage when a similar goal is being created

### Estimation Drift
- "You're getting more accurate. 6 weeks ago estimates were off by 40%. Now they're off by 18%."
- Source: historical comparison of planned vs actual across time windows
- When surfaced: in Execution Analytics view, not proactively mid-session

### Action Count vs Completion
- "This outcome has 7 actions. Outcomes with 4+ actions close at a 60% rate for you. Trim to the 3 most critical?"
- Source: action count at time of archive vs outcome_result
- When surfaced: during AI Breakdown review, when reviewing an outcome with many actions

---

## Scope

### DB Changes

**Add to `outcomes` table (migration):**
```sql
ALTER TABLE outcomes ADD COLUMN outcome_tags TEXT;  -- JSON array, auto-assigned by Claude on archive
```

**Add to `actions` table (migration):**
```sql
ALTER TABLE actions ADD COLUMN started_at TEXT;   -- set when Focus Mode opens on this action
ALTER TABLE actions ADD COLUMN ended_at TEXT;     -- set when action is checked off
```

**New table: `pattern_observations`** (stores computed patterns for fast retrieval)
```sql
CREATE TABLE IF NOT EXISTS pattern_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_type TEXT NOT NULL,     -- 'time_accuracy' | 'completion_rate' | 'results_rate' | 'action_count'
    category TEXT,                  -- e.g. 'prospecting', 'email_campaign', 'pitch_deck'
    observation TEXT NOT NULL,      -- human-readable Claude-generated observation
    sample_size INTEGER NOT NULL,
    data_json TEXT,                 -- raw numbers for the analytics view
    computed_at TEXT DEFAULT (datetime('now'))
)
```

Patterns are recomputed weekly (cron job) or on-demand when new outcomes are archived.

### Pattern Computation Service

New: `src/services/pattern-engine.js`

Functions:
- `checkReadiness()` — returns { globalReady: bool, categoryCounts: {} }
- `computePatterns()` — runs all pattern queries, calls Claude to generate human-readable observations, stores to `pattern_observations`
- `getRelevantPatterns(context)` — given context (outcome type, action type, project), returns patterns that apply, respecting the per-category floor

**Recompute trigger:** After every outcome archive + weekly cron job.

### In-Context Surfacing

Three injection points:

**1. During AI Breakdown (Phase 2.3):**
Before Claude generates actions, the pattern engine is queried for patterns relevant to this outcome type. If found:
```
> Quick note: "prospecting" outcomes have taken you 40% longer than estimated on average
  (based on 9 outcomes). I'll factor that in — want me to pad estimates by 30%?
```
User responds: "Yes" or "No" or "Use 20% instead." Response stored.

**2. During Smart Inbox Triage (Phase 2.4):**
When Claude is creating outcomes from inbox items, pattern engine checks for relevant signals:
```
> Heads up: this outcome has 6 proposed actions. Outcomes with 4+ actions close at 58%
  for you (based on 12 outcomes). Want me to trim to the 3 most critical and defer the rest?
```

**3. During Focus Mode (Phase 2.1):**
At session start, Claude checks for relevant time accuracy patterns:
```
> Tasks like "email campaign draft" have taken you about 2h 15m on average —
  your estimate is 90 min. Want to adjust your committed time for today?
```

All three are one-line interjections. Claude doesn't lecture. It flags once and moves on.

### Outcome Auto-Tagging on Archive

When an outcome is archived, Claude assigns 1-2 tags from a consistent taxonomy:
`prospecting | pitch_deck | email_campaign | product | strategy | admin | research | client_work | reporting | other`

These tags are the categories used for per-category pattern floors. Consistent taxonomy = reliable pattern grouping.

### Execution Analytics View

New view accessible from the sidebar (below Library).

**Four metrics, visualized simply:**

```
Execution Analytics
────────────────────────────────────

  Estimate Accuracy               [last 30 days]
  ████████████░░░░░░  68% accurate
  Improving: was 52% six weeks ago

  Completion Rate
  ██████████████████  89% of outcomes closed
  Streak: 4 outcomes this week

  Results Rate        [where result data exists]
  ████████████░░░░░░  64% outcomes marked "Hit it"

  Top category by completion:
  ✓ Admin (100%) · ✓ Research (90%) · ⚠ Prospecting (60%)

────────────────────────────────────
  Based on 34 closed outcomes.
  Patterns update weekly.
```

No charts or SVG required — CSS bar representations are sufficient and simpler. Keep the view fast and readable.

---

## Out of Scope

- Real-time pattern recomputation (weekly is sufficient)
- ML model training (Claude handles all inference — no separate ML pipeline)
- Sharing analytics externally
- Team-level analytics (single-user product, permanent non-goal for now)

---

## Definition of Done

- [ ] Readiness gate enforced: no patterns surface below 20 global / 8 per-category floor
- [ ] `outcome_tags` column added and auto-populated on archive
- [ ] `started_at` / `ended_at` on actions updated correctly
- [ ] Pattern computation runs on archive + weekly cron
- [ ] `pattern_observations` table stores computed patterns with sample size
- [ ] Patterns surface in-context during AI Breakdown, Inbox Triage, and Focus Mode
- [ ] All pattern observations include sample size label ("Based on 11 outcomes…")
- [ ] No pattern surfaces as a standalone notification or in the Slack brief
- [ ] Execution Analytics view renders all four metrics with data
- [ ] Analytics view shows "Based on N closed outcomes" at bottom
- [ ] Engineer + PM sign-off
