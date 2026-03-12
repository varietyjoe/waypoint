# Phase 2.4 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 2.4 just completed — it adds Smart Inbox Triage: a batch Claude flow where the user selects multiple inbox items, sends them to Claude for structured JSON analysis, answers any clarifying questions, reviews proposed outcomes and actions, and creates everything in one shot. Read `pm_log/Phase 2/Phase 2.4 - Code Review Handoff.md` in full, then verify every checklist item against the actual codebase. End with a clear verdict: approved for Phase 2.5, or blocked with specifics. Log results to `test_tracker/Phase 2.4 - Smart Inbox Triage.md`.

---

**Read these files before touching anything:**
1. `pm_log/Phase 2/Phase 2.4 - Smart Inbox Triage.md` — full phase spec
2. `pm_log/Phase 2/Phase 2.4 - Engineer Handoff.md` — detailed implementation spec
3. `dev_tracker/Phase 2.4 - Smart Inbox Triage.md` — working checklist; verify each item complete

---

## What Was Built

Phase 2.4 adds a multi-step batch triage flow. Three files changed:
- `src/services/claude.js`: new `batchTriageInbox(items, contextSnapshot)` async function using direct `anthropic.messages.create()` (not tool use) — parses structured JSON response
- `src/routes/api.js`: new `POST /api/inbox/triage-batch` route — fetches items, calls Claude, maps indices to IDs
- `public/index.html`: full batch triage UI — per-item checkboxes, batch bar, questions step, editable preview with cluster cards, confirm/cancel flow

---

## Review Checklist

### `src/services/claude.js`

- [ ] `batchTriageInbox(items, contextSnapshot)` is present and exported
- [ ] Uses `anthropic.messages.create()` directly (NOT `sendWithTools` or tool use)
- [ ] Model is `claude-sonnet-4-6`
- [ ] Prompt includes context block only when `contextSnapshot` is non-empty
- [ ] Prompt instructs JSON-only output with correct schema (clusters, questions)
- [ ] Response text extracts from `response.content.find(b => b.type === 'text')?.text`
- [ ] Strips markdown code fences before parsing
- [ ] `JSON.parse` wrapped in try/catch — throws with descriptive message on failure
- [ ] `module.exports` updated to include `batchTriageInbox`
- [ ] All other exports (`sendMessage`, `classifyForInbox`, `sendWithTools`, `streamFocusMessage`) unchanged

### `src/routes/api.js`

- [ ] `POST /api/inbox/triage-batch` route present in inbox section
- [ ] Validates `itemIds` array — returns 400 if missing/empty
- [ ] Fetches items using `inboxDb.getInboxItemById(id)`, filters out falsy
- [ ] Returns 404 if no valid items found
- [ ] Calls `userContextDb.getContextSnapshot()`
- [ ] Calls `claudeService.batchTriageInbox(items, contextSnapshot)`
- [ ] Maps `source_item_indices` to real item IDs (1-based index → `items[i-1]?.id`)
- [ ] Response: `{ success: true, data: { clusters: [...], questions: [...] } }`
- [ ] No new `require()` statements needed (inboxDb, userContextDb, claudeService all already imported)
- [ ] No existing inbox routes modified

### `public/index.html`

- [ ] `triageSelectedIds` is a module-level `Set`
- [ ] Each inbox item card has a checkbox input calling `toggleTriageItem(id, checked)`
- [ ] `#triage-batch-bar` element exists; hidden when selection is empty, visible when ≥1 selected
- [ ] `#triage-count` span updates correctly
- [ ] `toggleTriageItem(id, checked)` adds/removes from Set and updates bar visibility/count
- [ ] `startBatchTriage()` — calls `POST /api/inbox/triage-batch`, handles loading state
- [ ] `showTriageLoadingState()` disables button, sets text to "Thinking…"
- [ ] `hideTriageLoadingState()` re-enables button
- [ ] Error path in `startBatchTriage`: catches, hides loading state, shows toast
- [ ] If `questions.length > 0`: calls `renderTriageQuestions`, not `renderTriagePreview` directly
- [ ] If no questions: calls `renderTriagePreview` directly
- [ ] `renderTriageQuestions` renders one input per question with correct `id="triage-q-${i}"`
- [ ] First input receives focus (setTimeout or direct)
- [ ] "Next →" button calls `submitTriageQuestions` with correct args
- [ ] `submitTriageQuestions` reads answers, saves non-empty answers to `POST /api/context` (category: 'task_duration', source: 'inbox_triage')
- [ ] Context saves are non-blocking (`Promise.all().catch(() => {})`)
- [ ] After saves: calls `renderTriagePreview`
- [ ] `renderTriagePreview` renders cluster cards with editable outcome title, project dropdown, action rows
- [ ] Action rows: editable title (`id="triage-action-title-${ci}-${ai}"`), time input, energy toggle button
- [ ] `removeTriageCluster(ci)` removes the cluster element
- [ ] `removeTriageAction(ci, ai)` removes the action row
- [ ] `toggleTriageEnergy(ci, ai)` toggles between 'deep' and 'light'
- [ ] `cancelBatchTriage()` resets `triageSelectedIds` and re-renders inbox
- [ ] `confirmBatchTriage` reads edited values from DOM inputs (not from the original `clusters` argument)
- [ ] Creates outcomes via `POST /api/outcomes` with `title` and `project_id`
- [ ] Creates actions via `POST /api/actions` with `outcome_id`, `title`, `time_estimate`, `energy_type`
- [ ] Marks source inbox items as processed after creation
- [ ] Shows success/error toast
- [ ] Reloads data and updates inbox badge after confirm

### No Regressions

- [ ] Per-item "Approve" and "Dismiss" inbox buttons unchanged
- [ ] `break_into_actions` ⌘K flow unchanged
- [ ] Focus Mode unchanged
- [ ] `brain_dump_to_outcomes`, `bulk_reschedule`, `prioritize_today` unchanged
- [ ] Preserved files (`slack.js`, `grain.js`, all integrations, `oauth-tokens.js`, `monitored-channels.js`, `triage.js`, `inbox.js`) untouched

---

## What's Out of Scope

- Auto-creating outcomes without review (always shows review modal)
- Re-triaging items that were already processed
- Editing inbox items during triage

---

## When You're Done

Log results to `test_tracker/Phase 2.4 - Smart Inbox Triage.md`. Verdict: **approved for Phase 2.5** or blocked with specifics.
