# Test Tracker — Phase 1.1: Execution Intelligence

**Status:** Code Review Complete — Approved for Phase 1.2
**Sign-off required before:** Starting Phase 1.2

---

## PM Prompt

> Phase 1.1 code review is done. Pasting the findings below — two small fixes to log before Phase 1.3, plus one spec discrepancy to resolve. Nothing blocks Phase 1.2.
>
> **Item 1 — API returns `null` instead of `"low"` for no-deadline outcomes**
> The spec says `deadline_risk` should be `"low"` when an outcome has no deadline. The API currently returns `null`. The frontend handles it gracefully (renders "No Deadline" instead of "On Track"), so nothing looks wrong today. But Phase 1.3 reads this value when building completion stats, so it should be fixed before then.
> Decision needed: should no-deadline outcomes show "No Deadline" (current frontend behaviour) or "On Track / Low" (spec value)? Whichever we pick, the API and frontend should agree.
>
> **Item 2 — `deep_done` / `light_done` are returned from the stats endpoint but not rendered**
> The split bar in the Phase 2 right panel shows total deep vs light time, but doesn't use the done-vs-remaining breakdown by energy type. Two options: (a) add a second progress layer to the bar showing how much deep/light work is complete, or (b) remove those fields from the spec since they're not being displayed. Currently they're dead API surface.
>
> **Item 3 — "Available Today" panel spec conflict (informational, no action required)**
> The review checklist said this panel should use `total_queued_time` from the intelligence endpoint. REBUILD_PLAN.md says "pull remaining_time from active outcomes." The implementation uses the local action list filtered to not-done + not-blocked for the selected outcome. That's actually the most useful behaviour — it shows what you can act on right now. Logging this so the specs are consistent going forward; no code change needed.

---

## What to Test

- [ ] Progress ring reflects correct percentage (time-weighted, not count-weighted)
- [ ] Checking off a deep action updates both progress ring and deep/light split
- [ ] Deadline risk shows `critical` when mathematically impossible to finish on time
- [ ] Deadline risk shows `low` when comfortably on track
- [ ] "Available Today" panel updates when actions are checked off
- [ ] Workspace overview (Phase 1 right panel) shows correct total outcomes + queued time
- [ ] Deadline risk list in Phase 1 right panel orders by most at-risk first
- [ ] Right panel updates without full page reload when switching between outcomes

---

## Code Review Results

**Reviewed:** 2026-02-19
**Verdict:** Approved for Phase 1.2

### Passed

| Item | Detail |
|---|---|
| `GET /api/outcomes/:id/stats` shape | All 12 fields present, correct envelope |
| `GET /api/projects/:id/intelligence` shape | All 5 fields present, deadline_risks sorted correctly |
| Intelligence filters active outcomes only | `status: 'active'` filter confirmed at `api.js:649` |
| Progress is time-weighted | `done_time / total_time` with division-by-zero guard at `api.js:143` |
| Four risk levels correct | `low/medium/high/critical` with thresholds matching dev tracker spec |
| `DAILY_CAPACITY` is a named constant | Defined as `240` in both endpoints — minor: defined twice, not module-scoped |
| Edge: deadline passed | `days_left = 0`, `critical` when remaining > 0, `low` when all done |
| Edge: no time estimates | `total_time = 0`, `progress = 0`, no crash |
| Edge: all actions done | `progress = 1.0`, `remaining_time = 0`, `deadline_risk = "low"` |
| Progress ring fires on outcome selection | `fetchOutcomeStats()` called in `selectOutcome()`, re-renders after |
| Stats refresh on action toggle | `fetchOutcomeStats()` called after toggle at `index.html:1173` |
| Stats refresh on action add | `fetchOutcomeStats()` called after add at `index.html:1243` |
| Phase 1 deadline risk list wired | Reads from `PROJECT_INTEL`, falls back to local `getRisk()` |
| Phase 2 deadline risk wired | Reads `stats?.deadline_risk`, shows `minutes_per_day_needed` in message |
| Workspace overview wired to intelligence | `loadData()` kicks off `fetchProjectIntelligence()` for all projects |
| No hardcoded right-panel values | All values computed from `OUTCOMES`, `OUTCOME_STATS`, or `PROJECT_INTEL` |
| All preserved files untouched | `slack.js`, `grain.js`, `slack-client.js`, `crypto.js`, `oauth-tokens.js`, `monitored-channels.js`, `triage.js` all pre-Phase 1.1 timestamps |
| `server.js` / `claude.js` content clean | Feb 19 timestamps are Phase 1.0 setup; content matches expected state |

### Issues Found

| # | Severity | Issue | File | Fix Target |
|---|---|---|---|---|
| 1 | Low | `deadline_risk` returns `null` instead of `"low"` when outcome has no deadline | `api.js:154, 673` | Before Phase 1.3 |
| 2 | Low | `deep_done` and `light_done` returned from stats endpoint but never rendered in split bar | `index.html` | PM decision required (see prompt above) |
| 3 | Informational | "Available Today" uses local action list; spec documents conflict on intended data source | `index.html:984` | Update specs to match implementation |

### Out-of-Scope Observations

- `GET /api/outcomes/archived` already exists (Phase 1.3 feature landed early). Works fine, no conflicts.
- When `days_left = 0`, `minutes_per_day_needed` is set to `remaining_time` (the full remaining load, not a rate). Semantically odd. Worth revisiting during Phase 1.3 completion stats work.

---

## Test Results

| Date | Tester | Pass/Fail | Notes |
|---|---|---|---|
| — | — | — | — |

---

## Sign-off

- [x] Code review complete (2026-02-19)
- [x] PM reviewed (2026-02-19)
- [x] Clear to begin Phase 1.2

**PM Notes:**
- Item 1: `deadline_risk` returns `null` for no-deadline outcomes — keeping `null` as valid documented value (Decision #14). Fix `null` handling in Phase 1.3 completion stats code.
- Item 2: `deep_done` / `light_done` to be rendered as second progress layer on split bar (Decision #15). Dev to implement before Phase 1.3.
- Item 3: "Available Today" spec updated to match implementation — uses local action list filtered to not-done + not-blocked. No code change.
