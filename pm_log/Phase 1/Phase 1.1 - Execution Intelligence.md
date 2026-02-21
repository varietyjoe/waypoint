# Phase 1.1 — Execution Intelligence

**Goal:** The right panel earns its place. Deadline risk, progress, and time breakdowns are computed from real data. This is where the app stops being a fancy to-do list.

**Status:** Not Started
**Depends on:** Phase 1.0 complete
**Unlocks:** Phase 1.2

---

## What This Phase Delivers

By the end of 1.1, the user can:
- Open any outcome and see a live time-weighted progress ring
- See which outcomes are at deadline risk before they're in crisis
- See deep/light work split for any outcome
- See "Available Today" — how much time is queued vs. how much capacity is left

The right panel in `waypoint-v2.html` was already designed for this. This phase wires it to real data.

---

## Scope

### API — New Computed Endpoints

**`GET /api/outcomes/:id/stats`**
Returns:
```json
{
  "progress": 0.42,
  "total_time": 320,
  "done_time": 135,
  "remaining_time": 185,
  "deep_time": 200,
  "light_time": 120,
  "deep_done": 90,
  "light_done": 45,
  "deadline_risk": "high",
  "days_left": 10,
  "minutes_per_day_needed": 18.5,
  "blocked_count": 1
}
```

**Deadline risk calculation logic:**
- `remaining_time / days_left` = minutes/day needed
- Compare to configurable daily capacity (default: 240 min/day)
- `low` = on track · `medium` = tight · `high` = at risk · `critical` = mathematically impossible

**`GET /api/projects/:id/intelligence`**
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

- Right panel ring chart → `GET /api/outcomes/:id/stats` on outcome selection
- Workspace overview panel → `GET /api/projects/:id/intelligence`
- Deadline risk list (Phase 1 and Phase 2 right panels)
- Deep/Light split bars
- "Available Today" panel: pull `remaining_time` from active outcomes, compare to daily capacity

---

## Out of Scope for This Phase
- Slack pipeline (1.2)
- Velocity trends, weekly completion rates (future)
- Mobile responsive layout (future)

---

## Definition of Done
- [ ] Progress ring shows real time-weighted data
- [ ] Deadline risk calculation correct and tested
- [ ] Deep/Light split accurate
- [ ] "Available Today" panel wired
- [ ] Workspace overview panel (Phase 1 right panel) wired
- [ ] No hardcoded right-panel data remains
- [ ] Engineer + PM sign-off
