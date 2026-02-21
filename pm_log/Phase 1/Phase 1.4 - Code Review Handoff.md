# Phase 1.4 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 1.4 just completed — it added a ⌘K command palette, a ✦ button on outcome cards, four Claude tools (break_into_actions, brain_dump_to_outcomes, bulk_reschedule, prioritize_today), preview-before-execute modals for all mutating tools, and context injection. The Grain integration was either shipped or explicitly deferred. Read `pm_log/Phase 1.4 - Code Review Handoff.md` in full, then verify every checklist item against the actual codebase. Report what passed, what failed, and any out-of-scope issues. End with a clear verdict: approved, or blocked with specifics. Log your results to `test_tracker/Phase 1.4 - AI Co-pilot.md`.

---

You are reviewing Phase 1.4 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these files before touching anything:**
1. `pm_log/Phase 1.4 - AI Co-pilot.md` — full phase spec
2. `pm_log/Phase 1.4 - Engineer Handoff.md` — detailed implementation spec (tool schemas, context shape, preview flows)
3. `dev_tracker/Phase 1.4 - AI Co-pilot.md` — the working checklist; verify each item is actually complete
4. `key_decisions/decisions_log.md` — Decisions #12 and #13 define the scope boundary you must enforce

---

## What Was Built

Phase 1.4 adds Claude as a co-pilot for complex operations. Four workstreams: Claude tool definitions in `src/services/claude.js`, a new tool-mode code path in `/api/chat`, a ⌘K command palette with context injection and preview modals in `public/index.html`, and a ✦ button on outcome cards. Grain integration was either shipped or explicitly deferred.

Your job is to confirm each workstream is correctly implemented and safe to ship.

---

## Review Checklist

### Pre-Build Check

- [ ] `dev_tracker/Phase 1.4 - AI Co-pilot.md` shows whether Grain was confirmed or explicitly deferred — one of these two states must be logged; "unknown" is not acceptable

### Claude Tool Definitions (`src/services/claude.js`)

- [ ] Old task tools (prior-phase stubs or any task/note-related tools) have been removed
- [ ] Four new tools defined: `break_into_actions`, `brain_dump_to_outcomes`, `bulk_reschedule`, `prioritize_today`
- [ ] Each tool has a correct `input_schema` (type: "object", properties, required array)
- [ ] `break_into_actions` input schema: `actions` array with `title`, `time_estimate` (integer, minutes), `energy_type` (enum: deep/light)
- [ ] `brain_dump_to_outcomes` input schema: `outcomes` array with `title`, `project_name`, optional `deadline`/`priority`, nested `actions`
- [ ] `bulk_reschedule` input schema: `updates` array with `outcome_id`, `title`, `current_deadline`, `new_deadline`
- [ ] `prioritize_today` input schema: `recommendation`, `top_outcomes` (string array), `reasoning`
- [ ] `sendWithTools(messages, context)` function added and exported
- [ ] `sendWithTools` builds system prompt from context and calls Anthropic API with `tool_choice: "auto"` and `tools` array
- [ ] `sendWithTools` returns `{ type: "tool", tool_name, tool_input }` for tool_use responses
- [ ] `sendWithTools` returns `{ type: "message", content }` for text responses
- [ ] Existing `sendMessage()` function is **unchanged** — no modifications to its signature or behavior
- [ ] Model is `claude-sonnet-4-6`

### `/api/chat` Route Extension

- [ ] Route accepts optional `mode: "tools"` in request body
- [ ] When `mode === "tools"`: calls `sendWithTools()` with message and context
- [ ] When `mode` absent: falls back to existing `sendMessage()` behavior — no regression
- [ ] Returns `{ success: true, data: { type, tool_name, tool_input } }` for tool responses

### Context Injection

- [ ] Frontend collects and sends `context` object with: `current_project`, `selected_outcome` (if open), `active_outcomes`, `projects`, `today_stats`
- [ ] `active_outcomes` sourced from `GET /api/outcomes?status=active`
- [ ] `today_stats` sourced from `GET /api/outcomes/stats/today` (Phase 1.3 endpoint)
- [ ] `projects` sourced from `GET /api/projects`
- [ ] Context is collected at palette-open time, not stale from page load

### Command Palette (`public/index.html`)

- [ ] `⌘K` (macOS) opens the palette from Phase 1 (outcome list view)
- [ ] `⌘K` opens the palette from Phase 2 (inside an outcome)
- [ ] Text input is focused immediately on open
- [ ] Enter submits; ESC closes without making any API call
- [ ] Loading state shown while waiting for Claude
- [ ] `prioritize_today` result displayed inline in palette — no modal, no confirm step
- [ ] Conversational `type: "message"` response displayed inline
- [ ] On successful completion: palette closes and relevant data refreshes (outcome list, stats)
- [ ] No state left behind after ESC or completion close

### ✦ Button on Outcome Cards

- [ ] ✦ icon visible on each outcome card in the Phase 1 grid
- [ ] Clicking opens the command palette with that outcome pre-loaded as `selected_outcome`
- [ ] Input pre-filled with "Break this outcome into actions"
- [ ] Uses the same code path as the ⌘K palette — not a separate implementation

### Preview Modals — `break_into_actions`

- [ ] Review modal renders after Claude returns tool result
- [ ] Each suggested action shows: title (editable inline), time_estimate (editable), energy_type (toggleable)
- [ ] Per-action accept/reject — individual control
- [ ] "Create Accepted Actions" creates only accepted actions, nothing else
- [ ] Actions created via `POST /api/actions` with correct `outcome_id` (the selected outcome)
- [ ] "Cancel" creates nothing

### Preview Modals — `brain_dump_to_outcomes`

- [ ] Preview list renders all extracted outcomes with project, deadline, priority, and nested actions
- [ ] Per-outcome checkbox (default checked)
- [ ] "Create Selected" creates only checked outcomes + their actions
- [ ] `project_name` matched case-insensitively to existing projects
- [ ] If project name has no match: warning shown, that outcome skipped — does not crash
- [ ] Created outcomes use `POST /api/outcomes`; their actions use `POST /api/actions`

### Preview Modals — `bulk_reschedule`

- [ ] Deadline diff table rendered: outcome title | current deadline | → | new deadline
- [ ] Per-row checkbox (default checked)
- [ ] "Apply Changes" patches only checked outcomes via `PUT /api/outcomes/:id`
- [ ] "Cancel" changes nothing

### `prioritize_today` — Read-Only

- [ ] Tool result rendered without a confirm step — no "Apply" button
- [ ] Confirmed: no `PUT`, `POST`, or `DELETE` calls triggered by this tool's response

### Scope Boundary (Regression Check)

- [ ] Adding one action via the UI inline input still works normally (Claude not involved)
- [ ] Toggling an action done via checkbox still works (Claude not involved)
- [ ] Archiving an outcome via the Phase 3 button still works (Claude not involved)
- [ ] Quick capture still works as before

### Grain Integration (if shipped)

- [ ] PM confirmation of Grain active use is logged in dev_tracker
- [ ] `src/routes/grain.js` webhook handler now classifies items as Outcome/Action using the same triage prompt as Phase 1.2
- [ ] Classified Grain items flow into the `inbox` table with `classification`, `ai_reasoning` columns populated
- [ ] Existing inbox approval flow handles Grain items identically to Slack items
- [ ] No restructuring of `src/routes/grain.js` beyond prompt + inbox insertion

If Grain was explicitly deferred:
- [ ] Deferral is logged in dev_tracker — this is acceptable, not a blocker

### Preserved Files (Do Not Flag)

These must be untouched (except Grain integration if confirmed):
- `src/routes/grain.js` — unless Grain integration was confirmed and shipped
- `src/integrations/slack-client.js`, `src/integrations/grain-client.js`
- `src/utils/crypto.js`
- `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`
- `src/services/claude.js` — `sendMessage()` must be unchanged; only additions allowed

---

## What's Out of Scope

Do not raise issues against:
- Velocity trends or weekly review summaries (future)
- Social features (permanent non-goal)
- Claude intercepting basic UI operations — that is the scope boundary working correctly, not a missing feature

If you spot something clearly wrong but outside Phase 1.4 scope, note it separately — don't block sign-off on it.

---

## When You're Done

Update `test_tracker/Phase 1.4 - AI Co-pilot.md` with your findings:
- Fill in the **Test Results** table (date, pass/fail, notes per workstream)
- List any failures under **Issues Found**
- Check the **Sign-off** boxes if approved

If the checklist is clear: signal **approved**. If there are blockers: flag them specifically — what failed, what file, what the spec says it should be.
