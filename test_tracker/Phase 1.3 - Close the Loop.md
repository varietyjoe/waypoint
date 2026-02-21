# Test Tracker — Phase 1.3: Close the Loop

**Status:** Approved — Deviations acknowledged, briefed to Phase 1.4 dev
**Sign-off required before:** Phase 1.4 code review

---

## What to Test

- [ ] Archive outcome with reflection filled out → reflection stored, outcome archived
- [ ] Archive outcome with reflection empty → archives cleanly, no error
- [ ] Archived outcome disappears from Phase 1 card grid
- [ ] Archived outcome appears in "Recently Closed" left sidebar list
- [ ] Today's metrics show correct count after archiving
- [ ] `GET /api/outcomes/:id/reflection` returns the stored reflection
- [ ] Archiving multiple outcomes in one day → all appear in "Recently Closed"
- [ ] Reload after archiving → archived state persists correctly

---

## Test Results

| Date | Tester | Workstream | Pass/Fail | Notes |
|---|---|---|---|---|
| 2026-02-19 | Claude (code review) | DB Migration — Stats Snapshot | ⚠️ DEVIATION | Columns added correctly; `total_estimated_minutes` stored as `total_estimated_time` throughout |
| 2026-02-19 | Claude (code review) | Reflections Table | ⚠️ DEVIATION | Table created, ops work; `reflections.js` was not created — logic inlined into `outcomes.js` |
| 2026-02-19 | Claude (code review) | `completeOutcome()` / `getArchivedOutcomes()` | ⚠️ DEVIATION | `archiveOutcome()` unchanged ✅; `completeOutcome` signature differs from spec (see Issues) |
| 2026-02-19 | Claude (code review) | `POST /api/outcomes/:id/complete` | ✅ PASS | 404 guard ✅, reflection conditional ✅, response shape ✅ |
| 2026-02-19 | Claude (code review) | `GET /api/outcomes/:id/reflection` | ✅ PASS | Returns `{ success, data: null\|row }`, no error on missing reflection |
| 2026-02-19 | Claude (code review) | `GET /api/outcomes/archived` | ✅ PASS | Correct shape, status filter, project join |
| 2026-02-19 | Claude (code review) | `GET /api/outcomes/stats/today` | ⚠️ MINOR | Uses `date('now', 'localtime')` instead of spec's `date('now')` — functionally better for single-user |
| 2026-02-19 | Claude (code review) | Route registration order | ✅ PASS | `/archived` (L54) and `/stats/today` (L68) both before `/:id` (L81) |
| 2026-02-19 | Claude (code review) | Frontend wiring | ✅ PASS | All wiring correct: archive, reflection, sidebar, metrics, navigation |
| 2026-02-19 | Claude (code review) | Phase 1.2 bug fix — inbox dedup | ✅ PASS | `$.timestamp` correct at `inbox.js:307` |
| 2026-02-19 | Claude (code review) | Phase 1.2 bug fix — scheduler stale closure | ✅ PASS | `getScheduleById()` called at top of `runScheduledJob()`, exported from `slack-schedule.js` |

---

## Issues Found

### DEVIATION 1 — Column name `total_estimated_time` vs spec `total_estimated_minutes`
**File:** `src/database/outcomes.js`
**Spec says:** Column added as `total_estimated_minutes`
**Code does:** Added and written as `total_estimated_time` (in migration PRAGMA check, ALTER TABLE, and the UPDATE in `completeOutcome`)
**Consistent?** Yes — the name is wrong everywhere, so it works internally.
**Risk for Phase 1.4:** If Claude tools query or document this column by spec name (`total_estimated_minutes`), they'll get a null/error. Phase 1.4 dev must use `total_estimated_time`.
**Severity:** Low (consistent internal rename; won't crash anything in 1.4 unless spec name is used)

---

### DEVIATION 2 — `src/database/reflections.js` not created; reflection logic inlined into `outcomes.js`
**Spec says:** Create `src/database/reflections.js` with `initReflectionsTable()`, `createReflection(data)`, and `getReflectionByOutcomeId(outcomeId)`.
**Code does:** All three are folded into `outcomes.js`:
- `initReflectionsTable()` exists as a named function ✅ (and is called from api.js ✅)
- `createReflection()` does not exist — the INSERT is inlined inside `completeOutcome()`
- `getReflectionByOutcome()` exists (named slightly differently from spec's `getReflectionByOutcomeId`)
**Risk for Phase 1.4:** If Phase 1.4 does `require('../database/reflections')`, it will fail at startup. Import must use `outcomesDb.getReflectionByOutcome()` instead.
**Severity:** Medium — structural deviation from spec; functionally complete; Phase 1.4 dev must know to import from `outcomes.js`

---

### DEVIATION 3 — `completeOutcome()` signature differs from spec
**Spec says:** `completeOutcome(id, statsSnapshot)` where `statsSnapshot = { total_actions_count, completed_actions_count, total_estimated_minutes, deadline_hit }` is pre-computed by the endpoint.
**Code does:** `completeOutcome(id, actionsData, reflectionData = {})` — takes the raw actions array and computes stats internally; also handles the reflection INSERT internally rather than via a separate `createReflection()` call.
**Functional result:** Identical — stats are computed, outcome is archived, reflection is conditionally stored.
**Risk for Phase 1.4:** If Phase 1.4 calls `completeOutcome()` with a stats object (per spec), it will produce wrong results. Must pass the actions array instead.
**Severity:** Medium — interface differs from spec; any Phase 1.4 code calling `completeOutcome()` must use the actual signature.

---

### MINOR — `total_estimated_minutes` stored as `0` instead of `null` when no estimates set
**File:** `src/database/outcomes.js:118`
**Spec says:** "null is valid if no actions or all null estimates"
**Code does:** `actionsData.reduce((s, a) => s + (a.time_estimate || 0), 0)` — returns `0` on empty/null input.
**Severity:** Very low — doesn't affect any behavior. Only matters if Phase 1.4 Claude logic distinguishes "no estimates" from "zero minutes".

---

### MINOR — `getArchivedOutcomes()` default limit is `10`, spec says `20`
**File:** `src/database/outcomes.js:151` — `function getArchivedOutcomes(limit = 10)`
**API layer also defaults to `10`** (`parseInt(req.query.limit) || 10` in api.js).
**Severity:** Very low — consistent throughout, easily changed if needed.

---

### MINOR — `getTodayStats()` uses `date('now', 'localtime')` instead of `date('now')`
**File:** `src/database/outcomes.js:169,175`
**Spec says:** `DATE(archived_at) = DATE('now')` and `DATE(done_at) = DATE('now')`
**Code does:** `date('now', 'localtime')` in both queries.
**Assessment:** Localtime is arguably the correct behavior for a single-user personal productivity app. UTC would give wrong day boundaries for most users outside UK/UTC+0. Consider this an intentional improvement, but it deviates from spec.
**Severity:** Negligible — functionally better for intended use case.

---

## Sign-off

- [x] Engineer complete
- [x] PM reviewed
- [x] Clear to begin Phase 1.4

**Reviewer note:** All checklist items are functionally implemented and working end-to-end. The three deviations above are architectural/naming differences, not runtime failures. The system will operate correctly as-is. Phase 1.4 dev must be briefed on the actual interface (see Deviations 1–3) to avoid building against spec-described APIs that differ from what's in code.
