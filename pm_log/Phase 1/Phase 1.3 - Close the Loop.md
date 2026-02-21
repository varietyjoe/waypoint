# Phase 1.3 — Close the Loop

**Goal:** Phase 3 (Archive) is fully functional. Completing an outcome is a real moment with captured data — not just deleting something.

**Status:** Complete
**Depends on:** Phase 1.0 complete
**Unlocks:** Phase 1.4

---

## What This Phase Delivers

By the end of 1.3, the user can:
- Archive an outcome and optionally fill out a reflection (what worked, what slipped, reusable insight)
- See recently closed outcomes in the left sidebar, populated from real data
- See today's completion metrics (outcomes archived, actions completed)
- Review past reflections

---

## Scope

### Database
**New `reflections` table:**
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

Also store a **completion stats snapshot** when archiving an outcome (add columns to `outcomes` or a separate record):
- Total actions, completed actions, total estimated time, deadline hit/miss

### API

```
POST /api/outcomes/:id/complete
```
Body (all optional — can archive without reflection):
```json
{
  "what_worked": "...",
  "what_slipped": "...",
  "reusable_insight": "..."
}
```
Sets `status = archived`, `archived_at = now`, stores reflection.

```
GET  /api/outcomes/:id/reflection     -- retrieve stored reflection
GET  /api/outcomes/archived           -- recently archived, for left sidebar
GET  /api/outcomes/stats/today        -- today's metrics: outcomes archived, actions completed
```

### Frontend Wiring
- Wire Phase 3 reflection form → `POST /api/outcomes/:id/complete`
- Wire "Archive Outcome" button (already in v2.html) → `POST /api/outcomes/:id/complete`
- Wire "Recently Closed" left sidebar list → `GET /api/outcomes/archived`
- Wire today's metrics panel → `GET /api/outcomes/stats/today`
- After archiving, remove outcome from Phase 1 card list and redirect to Phase 1 (outcome list)

---

## Design Notes
- Reflections are optional — the archive flow should not be blocked by an empty form
- The Phase 3 completion card in v2.html already has the right UI — just needs wiring
- Completion stats snapshot gives future Claude context ("last time you did a lead flow project, it took X vs estimated Y")

---

## Out of Scope for This Phase
- Claude surfacing past reflections as context (1.4)
- Velocity trends and historical analytics (future)

---

## Definition of Done
- [x] Archiving an outcome sets status + archived_at correctly
- [x] Reflection stored if filled out (gracefully skipped if not)
- [x] Recently Closed sidebar list shows real data
- [x] Today's metrics accurate
- [x] Phase 3 UI in v2.html fully wired
- [ ] Engineer + PM sign-off
