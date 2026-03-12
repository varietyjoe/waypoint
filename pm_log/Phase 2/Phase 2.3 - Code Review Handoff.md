# Phase 2.3 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 2.3 just completed — it upgrades the `break_into_actions` tool to use context memory for estimates and adds a questions step before the action preview when unknown task types are encountered. Read `pm_log/Phase 2/Phase 2.3 - Code Review Handoff.md` in full, then verify every checklist item against the actual codebase. End with a clear verdict: approved for Phase 2.4, or blocked with specifics. Log results to `test_tracker/Phase 2.3 - AI Breakdown.md`.

---

**Read these files before touching anything:**
1. `pm_log/Phase 2/Phase 2.3 - AI Breakdown.md` — full phase spec
2. `pm_log/Phase 2/Phase 2.3 - Engineer Handoff.md` — detailed implementation spec
3. `dev_tracker/Phase 2.3 - AI Breakdown.md` — working checklist; verify each item complete

---

## What Was Built

Phase 2.3 updates the `break_into_actions` tool schema to include an optional `questions` array, updates the `sendWithTools` system prompt with context-grounding instructions, and adds a questions step in the ⌘K frontend flow. Two files changed.

---

## Review Checklist

### `src/services/claude.js`

- [ ] `break_into_actions` tool `description` updated — references context-grounded estimates and questions
- [ ] `break_into_actions` `input_schema` has `questions` property: `type: 'array'`, items `type: 'string'`
- [ ] `questions` is **not** in the `required` array — it's optional
- [ ] `questions` property has a `description` explaining when to populate it (unknown task types)
- [ ] `sendWithTools` system prompt — `break_into_actions` line updated to instruct Claude to use known durations and put unknowns in `questions[]`
- [ ] `sendMessage`, `streamFocusMessage`, `classifyForInbox`, `sendWithTools` signatures all **unchanged**
- [ ] All four other tools (`brain_dump_to_outcomes`, `bulk_reschedule`, `prioritize_today`) **unchanged**

### `public/index.html`

- [ ] `break_into_actions` tool result handler checks `tool_input.questions?.length > 0` (or equivalent truthy check)
- [ ] When questions present: calls `renderBreakdownQuestions` (or equivalent) before the action preview
- [ ] When no questions (or empty array): goes directly to action preview — **existing behavior unchanged**
- [ ] `renderBreakdownQuestions` renders one input per question inside the ⌘K palette
- [ ] First input is auto-focused (setTimeout or direct `.focus()`)
- [ ] Enter key on any input OR a "Continue" button triggers `submitBreakdownQuestions`
- [ ] `submitBreakdownQuestions` reads each answer by input ID
- [ ] Each non-empty answer POSTs to `/api/context` with `category: 'task_duration'`, `source: 'ai_breakdown'`
- [ ] Context saves use `Promise.all` or similar — failure of saves does NOT block proceeding to action preview
- [ ] After saves: calls the existing action preview function with the pending actions
- [ ] Existing action preview function (`renderCmdBreak` or equivalent) is **unchanged**
- [ ] Existing `createAcceptedActions` (or equivalent) is **unchanged**

### No Regressions

- [ ] ⌘K `break_into_actions` result with empty/absent `questions` → action preview appears directly (no extra step)
- [ ] `brain_dump_to_outcomes`, `bulk_reschedule`, `prioritize_today` tool flows unchanged
- [ ] Focus Mode, inline editing, Phase 3 archive unchanged
- [ ] Preserved files (`slack.js`, `grain.js`, all integrations, `oauth-tokens.js`, `monitored-channels.js`, `triage.js`, `inbox.js`) untouched

---

## What's Out of Scope

- Auto-approving actions without review (always shows review modal)
- Re-running breakdown on outcomes that already have actions
- Dependency ordering or Gantt views

---

## When You're Done

Log results to `test_tracker/Phase 2.3 - AI Breakdown.md`. Verdict: **approved for Phase 2.4** or blocked with specifics.
