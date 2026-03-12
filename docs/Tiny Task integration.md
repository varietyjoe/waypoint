**Goal**  
Integrate one-off, low-friction tasks (for example “Call mom”) into Waypoint without forcing full outcome planning.

**User Problem**  
Small personal/admin tasks are real work but feel too lightweight for outcome scaffolding. They either get dropped or clutter core action lists.

**Product Decision**  
Treat tiny tasks as first-class actions with a lightweight type (action_type='tiny'), surfaced in a dedicated “Tiny Lane” inside Today view.

**V1 Scope**

1. Add action_type to actions (tiny|standard, default standard).
2. Auto-classify quick captures as tiny when unassigned and likely short.
3. Add Tiny Lane UI in Today view showing unassigned tiny tasks.
4. Support one-tap complete, snooze, and convert-to-standard.
5. Keep all existing outcome/action flows intact.

**Out of Scope (V1)**

1. New standalone tiny-task table.
2. Full recurring task engine.
3. AI-heavy classification dependency.
4. New mobile navigation paradigms.

**UX Behavior**

1. Quick capture without selected outcome creates unassigned actions.
2. If capture is likely tiny, set action_type='tiny', time_estimate=5, energy_type='light'.
3. Today view shows a compact “Tiny Lane” above/beside committed plan.
4. Completing tiny tasks updates existing completion stats.
5. Tiny task can be converted to standard when it grows in scope.

**Data Model**

1. actions.action_type TEXT DEFAULT 'standard'
2. Allowed values enforced in app logic (tiny, standard).
3. Existing rows backfill naturally to standard.

**API Changes**

1. POST /api/actions accepts optional action_type.
2. POST /api/outcomes/:id/actions accepts optional action_type (defaults standard).
3. PUT /api/actions/:id allows updating action_type.
4. Add filtered read for Today lane:
    - GET /api/actions/unassigned?type=tiny or frontend filter from existing endpoint.

**Classification Heuristic (No AI dependency)**  
Set tiny when all are true:

1. No outcome_id
2. Title length under threshold (for example < 60 chars)
3. Starts with simple verb (call, text, email, book, pay, etc.) or explicit marker (!tiny)

**Success Metrics**

1. Tiny tasks completed/day.
2. Capture-to-complete time for tiny tasks.
3. % of unassigned actions that are closed within 24h.
4. Reduction in inbox/pending clutter.

**Risks**

1. Tiny lane becomes junk drawer.
2. Misclassification of meaningful work as tiny.
3. UI crowding in Today view.

**Mitigations**

1. Cap visible lane items (for example 5).
2. Add “Convert to standard” action.
3. Snooze aging + escalation prompt after repeated snoozes.
4. Keep lane visually compact and secondary.

**Rollout Plan**

1. Ship schema + API support behind passive defaults.
2. Enable tiny auto-classification on quick capture.
3. Enable Today Tiny Lane UI.
4. Observe usage for a week, then tune heuristic thresholds.

**Current Code Status**  
I already applied the first DB-layer edit to add action_type support in [actions.js](app://-/index.html#).  
I paused all further implementation per your request. If you want, I can leave it as-is or revert this single file before we continue.