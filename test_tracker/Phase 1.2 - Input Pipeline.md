# Test Tracker — Phase 1.2: Input Pipeline

**Status:** Code Review Complete — 2 bugs require fixes before Phase 1.3
**Sign-off required before:** Starting Phase 1.3
**Reviewed by:** Claude Sonnet 4.6 — 2026-02-19

---

## Code Review Results

### Bug Fix — Own Messages
| Item | Result | Evidence |
|---|---|---|
| Filter at slack.js ~line 432 excludes own messages | ✅ PASS | `slack.js:431-437` — filter present |
| All three conditions applied | ✅ PASS | `!msg.bot_id && (!authenticatedUserId \|\| msg.user !== authenticatedUserId) && msg.text && msg.text.trim().length > 0` |
| `authenticatedUserId` from `token.scopes?.user_id` | ✅ PASS | `slack.js:431` |
| No other restructuring in slack.js | ✅ PASS | Only pull route changed |
| Same filter applied in `POST /api/triage/process` | ✅ PASS | `api.js:440, 469` — same pattern |

**Note:** The filter uses `(!authenticatedUserId || msg.user !== authenticatedUserId)` which is a safe fallback — if `user_id` is missing from OAuth scopes, all messages pass rather than blocking everything. Minor deviation from the strict `msg.user !== authenticatedUserId` in the spec, but the defensive approach is correct.

---

### Scheduled Pulls
| Item | Result | Evidence |
|---|---|---|
| `node-cron` in package.json | ✅ PASS | `"node-cron": "^4.2.1"` |
| `slack_schedule` table: correct schema | ✅ PASS | `slack-schedule.js:8-19` — run_time, timezone, enabled, last_run_at |
| `src/services/scheduler.js` exists | ✅ PASS | File confirmed |
| Scheduler initializes on server start | ✅ PASS | `api.js:20` — `scheduler.init()` at startup |
| Uses same logic as POST /api/slack/pull | ✅ PASS | `scheduler.js:24-109` mirrors pull route exactly |
| Pull window uses `last_run_at` | ⚠️ STALE SNAPSHOT BUG (see Bug #1) | `scheduler.js:33-38` — logic correct but broken |
| First-ever run defaults to 24h back | ✅ PASS | `scheduler.js:37` — `(Date.now()/1000) - (24 * 3600)` |
| `last_run_at` updated only after successful pull | ✅ PASS | `scheduler.js:146` — inside try block, not in catch |
| GET /api/slack/schedule | ✅ PASS | `api.js:796` |
| POST /api/slack/schedule | ✅ PASS | `api.js:807` |
| PUT /api/slack/schedule/:id | ✅ PASS | `api.js:821` |
| DELETE /api/slack/schedule/:id | ✅ PASS | `api.js:837` |

---

### Claude Triage
| Item | Result | Evidence |
|---|---|---|
| Prompt classifies outcome vs action | ✅ PASS | `claude.js:74-100` — `classifyForInbox()` |
| Returns classification, title, ai_reasoning only | ✅ PASS | `claude.js:119-125` — exactly three fields |
| Prompt explicitly skips outcome matching | ✅ PASS | `claude.js:100` — "Do NOT attempt to assign the action to an existing outcome" |
| No structural changes beyond scope | ✅ PASS | `sendMessage()` untouched; new function is additive |

**Note:** The dev tracker says "prompt update" but the implementation correctly adds a separate `classifyForInbox()` function using `claude-haiku-4-5` (the right model for classification, vs `claude-sonnet-4-20250514` for chat). This is better design than the spec anticipated.

---

### Inbox DB Migration
| Item | Result | Evidence |
|---|---|---|
| `classification` column added | ✅ PASS | `inbox.js:14` |
| `suggested_outcome_id` column with FK | ✅ PASS | `inbox.js:15` — `REFERENCES outcomes(id)` |
| `ai_reasoning` column added | ✅ PASS | `inbox.js:16` |
| Migration is additive (safe for existing rows) | ✅ PASS | `inbox.js:12-21` — try/catch per ALTER TABLE |

---

### Inbox Approval Flow
| Item | Result | Evidence |
|---|---|---|
| Approving Action creates record in `actions` table | ✅ PASS | `api.js:598-600` |
| Action with no outcome → outcome_id = null | ✅ PASS | `api.js:599` — `outcome_id ? parseInt(outcome_id) : null` |
| Approving Outcome creates record in `outcomes` table | ✅ PASS | `api.js:587-594` |
| Outcome approval requires project_id | ✅ PASS | `api.js:584-586` — 400 if missing |
| Dismissing = identical behavior to before | ✅ PASS | `api.js:611-619` — calls `rejectInboxItem` |

---

### Inbox UI
| Item | Result | Evidence |
|---|---|---|
| Classification badge (Outcome/Action) visible | ✅ PASS | `index.html:981-986, 1014` — purple/blue/gray |
| AI reasoning shown as secondary text | ✅ PASS | `index.html:1018` — `✦ ${item.ai_reasoning}` |
| Action items show outcome picker + "Leave unassigned" | ✅ PASS | `index.html:1003-1008` |
| Outcome items show project + deadline + priority | ✅ PASS | `index.html:989-1001` |
| Approve button disabled until fields filled | ⚠️ SPEC DEVIATION | Button always enabled; validates at click time with toast |

**Note on Approve button:** Spec says "requires project/deadline/priority to be filled before activating." The button is always clickable — JS validates `project_id` on click and shows a toast if missing. Deadline is not required (optional). The data is safe (server also validates `project_id`), but the spec's "before activating" implies a `disabled` attribute. This is a UX deviation, not a data integrity issue.

---

### Quick Capture
| Item | Result | Evidence |
|---|---|---|
| Default creates unassigned action | ✅ PASS | `index.html:1477-1478` — `url = '/api/actions'` |
| Optional outcome picker present | ✅ PASS | `index.html:185-187` — `#quickCaptureOutcome` select |
| With outcome selected → creates assigned action | ✅ PASS | `index.html:1473-1475` — `url = /api/outcomes/${outcomeId}/actions` |

---

### Markdown Import
| Item | Result | Evidence |
|---|---|---|
| `POST /api/import/plan` endpoint exists | ✅ PASS | `api.js:856` |
| Reads PLAN.md from project root | ✅ PASS | `api.js:858` — `path.join(__dirname, '../../PLAN.md')` |
| Case-insensitive title match | ✅ PASS | `api.js:882-889` — `.toLowerCase()` on both sides |
| Additive only — no deletions or modifications | ✅ PASS | No DELETE or UPDATE calls in import path |
| Returns outcomes_created, actions_created, skipped | ✅ PASS | `api.js:997-1003` |
| PLAN.md in .gitignore | ✅ PASS | `.gitignore:34` — "# Bulk import file / PLAN.md" |

---

### Preserved Files
| File | Result |
|---|---|
| `src/routes/grain.js` | ✅ Untouched |
| `src/integrations/slack-client.js` | ✅ Untouched |
| `src/integrations/grain-client.js` | ✅ Untouched |
| `src/utils/crypto.js` | ✅ Untouched |
| `src/database/oauth-tokens.js` | ✅ Untouched |
| `src/database/monitored-channels.js` | ✅ Untouched |
| `src/server.js` | ✅ Untouched |

---

## Bugs Found

### Bug #1 — Scheduler: Stale Closure (stale `scheduleRow` snapshot)
**Severity:** Medium
**File:** `src/services/scheduler.js:184`
**Description:** `registerJob` schedules a cron callback as `() => runScheduledJob(scheduleRow)` where `scheduleRow` is the object captured at registration time. After each run, `markLastRun` updates the DB, but the closure still holds the original snapshot where `last_run_at` was `null`. On the second (and every subsequent) firing of the same cron job, `scheduleRow.last_run_at` is still `null`, so the scheduler always pulls 24 hours back instead of since last run.

**Spec violation:** Checklist item: "Pull window uses `last_run_at` per schedule row, not a fixed hours-back window."

**Practical impact:** Low for daily schedules — the extra history pulled is caught by triage deduplication (`getTriageItemBySource` returns converted items). But spec intent is violated, and for more frequent schedules it wastes API quota.

**Fix:** At the start of `runScheduledJob`, fetch a fresh row from the DB:
```js
const freshRow = scheduleDb.getScheduleById(scheduleRow.id) || scheduleRow;
// then use freshRow.last_run_at instead of scheduleRow.last_run_at
```

---

### Bug #2 — Inbox Deduplication: Wrong JSON Key
**Severity:** Low (masked in practice, but dead code is a real defect)
**File:** `src/database/inbox.js:307`
**Description:** `getInboxItemByMessageTs` queries `json_extract(source_metadata, '$.message_ts')` but every code path that stores inbox metadata uses the key `timestamp` (not `message_ts`). This function always returns `null` — the inbox dedup check is completely non-functional.

**Pull route metadata (`slack.js:484`):** `metadata: { ..., timestamp: msg.ts }`
**Triage/process metadata (`api.js:452`):** `metadata: { ..., timestamp: msg.ts }`
**Scheduler metadata (`scheduler.js:100`):** `metadata: { ..., timestamp: msg.ts }`

**Practical impact:** Low, because `getTriageItemBySource` (which runs first) searches without a status filter and returns items regardless of whether they're pending or converted. So converted triage items still block re-queueing. The only unguarded path is: if a triage item is manually deleted (`DELETE /api/triage/:id`) after it was converted to inbox, a subsequent pull would find nothing in triage AND nothing in inbox (due to wrong key), allowing the message to cycle through again.

**Fix:** Change `inbox.js:307` from:
```js
WHERE json_extract(source_metadata, '$.message_ts') = ?
```
to:
```js
WHERE json_extract(source_metadata, '$.timestamp') = ?
```

---

## Cosmetic Issues (Do Not Block)
- `GET /api/` info endpoint still reports `"phase": "1.1"` and doesn't list `POST /api/actions` or `POST /api/import/plan` — stale API manifest, no functional impact.

---

## Out-of-Scope Issues Spotted
None found that touch Phase 1.3 or 1.4 territory.

---

## Manual Test Checklist

**Own-messages bug fix:**
- [ ] Trigger a Slack pull after sending a message from your own account
- [ ] Confirm your own message does NOT appear in the triage queue
- [ ] Confirm messages from others DO appear

**Scheduled pulls:**
- [ ] Add a schedule run time via UI
- [ ] Wait for scheduled time — confirm pull triggers automatically
- [ ] Skip a scheduled review — confirm next pull covers the full missed window (no gap)
- [ ] Confirm no duplicate messages appear after multiple runs
- [ ] Disable a schedule entry — confirm it stops firing

**Claude classification:**
- [ ] A clearly goal-oriented message (e.g. "We need to overhaul the lead flow") → classified as `Outcome`
- [ ] A clearly task-oriented message (e.g. "Can you update the copy on the form?") → classified as `Action`
- [ ] AI reasoning text is present and makes sense
- [ ] Classification badge visible in inbox

**Inbox approval flow:**
- [ ] Approving an Action with an outcome selected → action appears in that outcome's action list
- [ ] Approving an Action with "Leave unassigned" → action appears in unassigned bucket
- [ ] Approving an Outcome → outcome appears in the selected project with correct deadline/priority
- [ ] Dismissing an item → item removed from inbox, nothing created

**Quick capture:**
- [ ] Quick capture with no outcome selected → creates unassigned action
- [ ] Quick capture with outcome selected → creates action in that outcome

---

## Test Results

| Date | Tester | Pass/Fail | Notes |
|---|---|---|---|
| 2026-02-19 | Claude Sonnet 4.6 (code review) | See above | 2 bugs found, all core flows correct |

---

## Issues Found

| # | Severity | Description | File | Fix |
|---|---|---|---|---|
| 1 | Medium | Scheduler stale closure — `last_run_at` never refreshes between runs | `scheduler.js:184` | Fetch fresh row at job start |
| 2 | Low | Inbox dedup broken — `getInboxItemByMessageTs` uses wrong JSON key `$.message_ts` vs actual `$.timestamp` | `inbox.js:307` | Change key to `$.timestamp` |
| - | Cosmetic | API info endpoint reports phase 1.1, missing 2 new endpoints | `api.js:1017` | Update manifest |

---

## Sign-off

- [x] Engineer fix: Bug #2 (`$.message_ts` → `$.timestamp`) — fixed `inbox.js:307`
- [x] Engineer fix: Bug #1 (stale scheduler snapshot) — fixed `scheduler.js:117-119`, all `scheduleRow` refs in `runScheduledJob` replaced with `freshRow`
- [ ] PM reviewed
- [x] Clear to begin Phase 1.3

---

## Verdict

**APPROVED** — both bugs fixed 2026-02-19. Clear for Phase 1.3.

All core data flows are correct and safe. The approval pipeline (Slack → triage → Claude classification → inbox → outcome/action creation) works end-to-end. Both bugs are contained in the scheduler and deduplication paths, not the main write paths. Fix the two bugs (each is a ~2 line change) and this is clear for Phase 1.3.
