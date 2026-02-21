# Dev Tracker — Phase 1.4: AI Co-pilot

**Status:** Complete (pending test sign-off)
**Full brief:** `/pm_log/Phase 1.4 - AI Co-pilot.md`
**Depends on:** Phases 1.0, 1.2, 1.3 complete

---

## Pre-Build Checklist
- [x] Confirmed Grain is NOT in active use — Grain integration deferred, marked below
- [x] Reviewed `src/services/claude.js` — no old tool definitions existed (prior phase had a stub comment only)
- [x] Reviewed Phase 1.3 deviations from test_tracker before writing any code:
  - `total_estimated_time` column name — confirmed no impact (context injection uses in-memory normalized data, not raw DB columns)
  - No `reflections.js` file — confirmed no impact (Phase 1.4 tools don't touch reflections)
  - `completeOutcome()` signature — confirmed no impact (none of the four tools call completion)

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-20 | Claude Sonnet 4.6 | Full Phase 1.4 build. See details below. Grain explicitly deferred. |

### What was built (2026-02-20)

**`src/services/claude.js`**
- Added `TOOLS` constant with all four tool definitions: `break_into_actions`, `brain_dump_to_outcomes`, `bulk_reschedule`, `prioritize_today`
- Added `sendWithTools(messages, context)` — builds a context-aware system prompt from the injected context object (current project, selected outcome + actions, all active outcomes with deadline risk, project list, today's stats), calls `claude-sonnet-4-6` with `tool_choice: auto`, returns `{ type: "tool", tool_name, tool_input }` or `{ type: "message", content }`
- `sendMessage()` and `classifyForInbox()` are untouched

**`src/routes/api.js`**
- Extended `POST /api/chat`: if `mode === "tools"` in the request body, calls `sendWithTools()` with the message and injected context, returns `{ success: true, data: { type, ... } }`. All existing behaviour (no mode / plain chat) is unchanged.

**`public/index.html`**
- `normalizeOutcome()` — added `deadlineISO` field to preserve the raw ISO date string from the API. The `deadline` field remains the display string ("Feb 19") as before; `deadlineISO` is what gets sent to Claude so it can reason about dates correctly.
- `renderPhase1()` — added a ✦ button to the top-right of each outcome card. Clicking it opens the command palette pre-loaded with that outcome as context and "Break this outcome into actions" pre-filled. Click is stopped from propagating to the card's `selectOutcome` handler.
- Command palette HTML — a full-screen overlay (`z-50`) centered at ~12vh. Clicking the backdrop closes it; clicking the panel does not.
- Command palette JS — full implementation:
  - `buildContext(overrideOutcome)` — assembles the context object from current in-memory state (OUTCOMES, PROJECTS, OUTCOME_STATS, TODAY_STATS). Takes an optional override outcome for the ✦ button flow.
  - `openCommandPalette(presetOutcome, presetText)` / `openCommandPaletteForOutcome(outcomeId)` — open with optional pre-context and pre-filled input
  - `closeCommandPalette()` — hides overlay, clears `cmdContext` and `cmdToolData`
  - `submitCommandPalette()` — POSTs to `/api/chat` with `mode: "tools"`, shows loading state, routes the result to the appropriate renderer
  - `renderCmdMessage()` — plain text response with "Ask again" / "Close"
  - `renderCmdPrioritize()` — shows ranked outcome list + reasoning inline in the palette; no confirmation step, no mutations
  - `renderCmdBreak()` — break_into_actions preview: editable title, time estimate, deep/light toggle, accept/reject per action. "Create Accepted Actions" batches `POST /api/outcomes/:id/actions`, then navigates to Phase 2 for the outcome.
  - `renderCmdDump()` — brain_dump preview: per-outcome checkbox, project dropdown (auto-matched by name, warns on no match), optional deadline input. "Create Selected" creates outcomes then their actions sequentially.
  - `renderCmdReschedule()` — bulk_reschedule preview: table of title | current deadline → new deadline, checkbox per row. "Apply Changes" PATCHes each checked outcome via `PUT /api/outcomes/:id`.
- Keyboard listener extended: `⌘K` / `Ctrl+K` toggles the palette; global `ESC` closes it if open.
- `@keyframes spin` and `@keyframes cmdIn` added to the style block.

---

## Blockers

None.

---

## Completion Checklist

**Command Palette:**
- [x] ⌘K opens floating overlay from anywhere in app
- [x] Context injected on open: current project, selected outcome + actions, deadline risk, active outcome list
- [x] Natural language routes to correct tool
- [x] Preview-before-execute pattern working for all mutating tools
- [x] ESC closes palette cleanly

**Outcome Card ✦ Button:**
- [x] ✦ button visible on each outcome card
- [x] Clicking opens palette pre-loaded with that outcome's context
- [x] "Break into actions" preset populated

**Claude Tools:**
- [x] `break_into_actions` — tool definition, preview modal, accept/edit/reject per action, batch create
- [x] `brain_dump_to_outcomes` — tool definition, preview list, project matching, create selected
- [x] `bulk_reschedule` — tool definition, deadline diff preview, apply selected changes
- [x] `prioritize_today` — tool definition, inline read-only result, no mutations
- [x] No old task tools to remove — `claude.js` had no prior tool definitions

**Grain:**
- [ ] **DEFERRED** — PM has not confirmed Grain is in active use. Do not build until confirmed. Infrastructure in `src/routes/grain.js` is preserved and untouched.
