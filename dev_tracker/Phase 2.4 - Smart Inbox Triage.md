# Dev Tracker — Phase 2.4: Smart Inbox Triage

**Status:** Complete
**Full brief:** `pm_log/Phase 2/Phase 2.4 - Smart Inbox Triage.md`
**Engineer handoff:** `pm_log/Phase 2/Phase 2.4 - Engineer Handoff.md`
**Depends on:** Phase 2.3 complete and approved ✅

---

## Pre-Build Checklist

- [x] Read `pm_log/Phase 2/Phase 2.4 - Smart Inbox Triage.md` in full
- [x] Read `pm_log/Phase 2/Phase 2.4 - Engineer Handoff.md` in full
- [x] Read `src/database/inbox.js` — confirm `approveInboxItem(id)` and `getInboxItemById(id)` signatures
- [x] Read `src/routes/api.js` inbox routes — understand `POST /api/inbox/:id/approve` and `POST /api/inbox/:id/dismiss` semantics
- [x] Read `public/index.html` — find `loadInboxData()`, inbox rendering in `renderCenter()`, per-item approve/dismiss functions
- [x] Read `src/services/claude.js` — read `classifyForInbox` as a JSON-response pattern; read `module.exports`

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-20 | Claude | Full implementation: all 3 workstreams complete |
| 2026-02-20 | Claude | Decision: `getInboxItemById` is async in inbox.js — used `await Promise.all(...)` in the new route instead of sync `.map(...).filter(Boolean)` as written in handoff |
| 2026-02-20 | Claude | Decision: Used `encodeURIComponent(JSON.stringify(...))` + `JSON.parse(decodeURIComponent(...))` for safe inline onclick data passing in `renderTriageQuestions` and `renderTriagePreview`, avoiding HTML attribute quoting issues with arbitrary JSON strings |
| 2026-02-20 | Claude | Decision: `confirmBatchTriage` marks items via `POST /api/inbox/:id/approve` (status → 'approved'), not dismiss — semantically correct since the items were triaged and turned into outcomes/actions. The approve route requires a body; sent `{}` with Content-Type header so it falls through to the action branch safely (items triaged via batch don't go through the single-item creation path) |
| 2026-02-20 | Claude | Decision: `renderTriagePreview` and `confirmBatchTriage` pass `itemIds` via encoded inline onclick; `window._triageClusters` pattern from handoff not needed because we read DOM directly in confirm step |

---

## Completion Checklist

### Workstream 1 — `src/services/claude.js`
- [x] `batchTriageInbox(items, contextSnapshot)` added — async function using `anthropic.messages.create()` directly
- [x] Prompt instructs JSON-only response; strips markdown fences before parse
- [x] Returns `{ clusters: [...], questions: [...] }` (throws on parse error)
- [x] Added to `module.exports` alongside existing exports

### Workstream 2 — `src/routes/api.js`
- [x] `POST /api/inbox/triage-batch` route added in inbox section
- [x] Validates `itemIds` array present and non-empty
- [x] Fetches items via `inboxDb.getInboxItemById(id)` (filters falsy) — used `await Promise.all(...)` since the function is async
- [x] Calls `userContextDb.getContextSnapshot()`
- [x] Calls `claudeService.batchTriageInbox(items, contextSnapshot)`
- [x] Maps `source_item_indices` back to actual item IDs (`source_item_ids`)
- [x] Returns `{ success: true, data: { clusters, questions } }`

### Workstream 3 — `public/index.html`
- [x] `triageSelectedIds` Set declared at module level
- [x] Inbox item cards have a checkbox (`toggleTriageItem(id, checked)`)
- [x] `#triage-batch-bar` appears when ≥1 item checked, hidden otherwise
- [x] `#triage-count` updates with selection count
- [x] `toggleTriageItem(id, checked)` implemented
- [x] `startBatchTriage()` — calls `POST /api/inbox/triage-batch`, shows loading state
- [x] `showTriageLoadingState()` / `hideTriageLoadingState()` implemented
- [x] If questions: calls `renderTriageQuestions(questions, clusters, itemIds)`
- [x] If no questions: calls `renderTriagePreview(clusters, itemIds)` directly
- [x] `renderTriageQuestions(questions, pendingClusters, itemIds)` — one input per question, auto-focused first input, "Next →" button
- [x] `submitTriageQuestions(questions, clusters, itemIds)` — saves answers to `POST /api/context` (category: 'task_duration', source: 'inbox_triage'), non-blocking, then calls `renderTriagePreview`
- [x] `renderTriagePreview(clusters, itemIds)` — editable outcome title per cluster, project dropdown, editable action rows with time/energy inline edit, "Create All" + "Cancel"
- [x] `removeTriageCluster(ci)` implemented
- [x] `removeTriageAction(ci, ai)` implemented
- [x] `toggleTriageEnergy(ci, ai)` toggles deep/light
- [x] `cancelBatchTriage()` resets selection and re-renders inbox
- [x] `confirmBatchTriage(itemIds)` — reads edited values from DOM, creates outcomes via `POST /api/outcomes`, creates actions via `POST /api/actions`, marks source items as approved via `POST /api/inbox/:id/approve`
- [x] After confirm: reloads outcomes + inbox, shows success toast

### No Regressions
- [x] Per-item "Approve" and "Dismiss" buttons unchanged
- [x] `break_into_actions` ⌘K flow unchanged
- [x] Focus Mode unchanged
- [x] `brain_dump_to_outcomes`, `bulk_reschedule`, `prioritize_today` unchanged
- [x] Preserved files untouched

---

## Blockers

None. Phase complete — ready for PM review.
