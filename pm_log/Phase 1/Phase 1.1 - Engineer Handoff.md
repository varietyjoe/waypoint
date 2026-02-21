# Phase 1.1 — Engineer Handoff

---

You are building Phase 1.1 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `REBUILD_PLAN.md` — full technical spec including exact JSON shapes for both new endpoints
2. `dev_tracker/Phase 1.1 - Execution Intelligence.md` — your working checklist; update it as you go

**Prerequisite:** Phase 1.0 is signed off. You're clear to build.

---

## What You're Building

The right panel in `waypoint-v2.html` was already designed for execution intelligence — progress rings, deadline risk, deep/light split, available time. It's currently hardcoded or empty. Your job is to build the two computed API endpoints that power it, then wire every right-panel element to real data.

No new tables. No schema changes. This phase is pure computation on the data Phase 1.0 built.

## What Phase 1.1 Delivers

By the end of this phase:
- Opening any outcome shows a live time-weighted progress ring
- Deadline risk is calculated and surfaced before it becomes a crisis
- Deep/light work split is accurate for any outcome
- "Available Today" reflects real queued time vs. daily capacity
- The workspace overview panel is wired to real project data

---

## What to Build

### Two new API endpoints

Add both to `src/routes/api.js` (or a new `src/routes/outcomes.js` — match the pattern Phase 1.0 used).

---

**`GET /api/outcomes/:id/stats`** — per-outcome computed data:
```json
{
  "progress": 0.42,               // done_time / total_time (time-weighted, not action count)
  "total_time": 320,              // sum of ALL action time_estimates (minutes)
  "done_time": 135,               // sum of done=1 action time_estimates
  "remaining_time": 185,
  "deep_time": 200,               // total deep work minutes (all actions, done or not)
  "light_time": 120,
  "deep_done": 90,                // deep work minutes on done actions only
  "light_done": 45,
  "deadline_risk": "high",        // 'low' | 'medium' | 'high' | 'critical'
  "days_left": 10,
  "minutes_per_day_needed": 18.5,
  "blocked_count": 1
}
```

**Deadline risk logic:**
- `remaining_time / days_left` = minutes/day needed
- Compare against daily capacity (default: 240 min/day — confirm with PM before hardcoding; it should be a named constant, not a magic number)
- `low` = on track · `medium` = tight · `high` = at risk · `critical` = mathematically impossible

**Edge cases — handle all of these explicitly:**
- **No deadline set:** `days_left = null`, `minutes_per_day_needed = null`, `deadline_risk = "low"` (can't be at risk without a deadline)
- **Deadline already passed:** `days_left = 0` (or negative — clamp to 0), `deadline_risk = "critical"`
- **No actions with time estimates:** `total_time = 0`, `progress = 0`, `deadline_risk = "low"` — do not divide by zero
- **All actions done:** `progress = 1.0`, `remaining_time = 0`, `deadline_risk = "low"`

---

**`GET /api/projects/:id/intelligence`** — workspace overview for the right panel:
```json
{
  "total_outcomes": 4,
  "total_queued_time": 1240,      // sum of remaining_time across all active outcomes
  "deep_split": 0.6,              // deep_time / total_time across all active outcomes
  "light_split": 0.4,
  "deadline_risks": [
    { "outcome_id": 1, "title": "...", "risk": "critical", "days_left": 3 }
  ]
}
```

Only include **active** outcomes (status = 'active') in all aggregations.

---

### Frontend wiring (`waypoint-v2.html`)

| Right panel element | Data source |
|---|---|
| Progress ring | `GET /api/outcomes/:id/stats` on outcome selection |
| Deadline risk list (Phase 1 + Phase 2 right panels) | `deadline_risk` + `days_left` from `/stats` |
| Deep/light split bars | `deep_time`, `light_time`, `deep_done`, `light_done` from `/stats` |
| Workspace overview panel | `GET /api/projects/:id/intelligence` |
| "Available Today" panel | `total_queued_time` from `/intelligence` vs. daily capacity |

**"Available Today"** is a frontend calculation: take `total_queued_time` from the intelligence endpoint, subtract however much time is already done today, compare against daily capacity. No additional endpoint needed.

---

## Key Constraints

- **No new tables or migrations.** Query `outcomes` and `actions` only.
- **Progress is time-weighted** — `done_time / total_time`, not action count. An outcome with one 5-minute action done is not 50% complete if there are nine 30-minute actions remaining.
- **Daily capacity must be a named constant**, not a hardcoded magic number — confirm value with PM.
- **The right panel design is final.** Wire it, don't redesign it.
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, `src/integrations/`, `src/utils/crypto.js`, `src/services/claude.js`, or any OAuth/triage/inbox files.

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 1.1 - Execution Intelligence.md` as you finish it. When the full checklist is done, flag for PM review before Phase 1.2 begins.
