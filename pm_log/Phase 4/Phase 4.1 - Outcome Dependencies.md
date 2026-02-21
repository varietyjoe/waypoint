# Phase 4.1 — Outcome Dependencies

**Goal:** Claude can see the chain. When one outcome is blocking two others, it surfaces that — and makes sure you're working on the right thing first.

**Status:** Not Started
**Depends on:** Phase 3.0 complete (Today view is where dependency flags surface most naturally)

---

## What This Phase Delivers

A lightweight dependency model at the outcome level. Not a Gantt chart — a way to say "this outcome can't move until that one is done," and have Claude use that information to prioritize intelligently.

By the end of 4.1:
- Outcomes can be marked as blocking or blocked by other outcomes
- Claude flags the critical path during triage, breakdown, and Today view planning
- You never accidentally work on a downstream outcome while the upstream blocker sits untouched

---

## Scope

### DB

**Existing:** `actions` table already has `blocked_by TEXT`. Phase 4.1 adds the same concept at the outcome level.

```sql
CREATE TABLE IF NOT EXISTS outcome_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
    depends_on_outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(outcome_id, depends_on_outcome_id)
)
```

`outcome_id` is blocked by `depends_on_outcome_id`. Read as: "outcome X cannot proceed until outcome Y is done."

### API Routes

```
GET    /api/outcomes/:id/dependencies     — what does this outcome depend on?
GET    /api/outcomes/:id/dependents       — what outcomes depend on this one?
POST   /api/outcomes/:id/dependencies     — { depends_on_outcome_id } — add a dependency
DELETE /api/outcomes/:id/dependencies/:depId — remove a dependency
GET    /api/outcomes/critical-path        — returns outcomes sorted by dependency depth
```

### Frontend — Setting Dependencies

On the outcome detail view (Phase 1 / 2), a "Blocked by" section:
- Shows existing dependencies ("Blocked by: Draft v1 complete")
- Dropdown to add: search/select from other active outcomes
- Click to remove
- Visually subtle — this isn't the main UI, it's supplementary

### Claude Integration — Three Surfacing Points

**1. Today view (Phase 3.0):**
When proposing the committed day, Claude checks the dependency graph:
```
> Note: "Send to Rohter" depends on "Get Scott's approval," which depends on
  "Draft v1 complete." The draft hasn't started yet. That's the critical chain —
  want me to prioritize it?
```

**2. During triage (Phase 2.4):**
When creating a new outcome, Claude checks if any existing outcomes would logically be upstream:
```
> This looks like it might depend on "Pitch Deck v1" being done first.
  Should I mark it as blocked until that's complete?
```

**3. During AI Breakdown (Phase 2.3):**
When breaking an outcome into actions, Claude checks if the outcome itself is blocked:
```
> This outcome is blocked by "Scott's approval." Until that arrives, the
  only actionable item is "Follow up with Scott." Want me to only schedule
  that one for now?
```

### Dependency Visualization

In the sidebar outcome list, blocked outcomes get a subtle indicator:
- Small lock icon `🔒` next to the outcome title if it has unresolved upstream dependencies
- Tooltip on hover: "Blocked by: Draft v1 complete"

No complex graph visualization. Text + icon is sufficient for v1.

---

## Out of Scope

- Circular dependency detection (validate on write — reject if it would create a cycle)
- Multi-level dependency chains visualized as a graph
- Cross-project dependencies (same project only in v1)
- Auto-blocking based on Claude inference (always explicit user action to set a dependency)

---

## Definition of Done

- [ ] `outcome_dependencies` table created
- [ ] Dependency CRUD routes work correctly
- [ ] Circular dependency validation on POST (returns 400 if cycle detected)
- [ ] Outcome detail view shows "Blocked by" section with add/remove
- [ ] Blocked outcomes show lock icon in sidebar list
- [ ] Today view proposal flags critical path blockers
- [ ] AI Breakdown checks if outcome is blocked before generating full action list
- [ ] Inbox Triage can suggest dependencies when creating related outcomes
- [ ] Engineer + PM sign-off
