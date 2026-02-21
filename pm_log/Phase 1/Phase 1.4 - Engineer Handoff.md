# Phase 1.4 — Engineer Handoff

## Agent Prompt

You are building Phase 1.4 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase adds an AI co-pilot: a ⌘K command palette that lets the user give Claude complex, multi-step instructions in plain English, a ✦ button on outcome cards for one-tap action breakdown, and four Claude tools (break_into_actions, brain_dump_to_outcomes, bulk_reschedule, prioritize_today). All mutating tools use a preview-before-execute pattern — nothing changes without user confirmation. Read `pm_log/Phase 1.4 - Engineer Handoff.md` in full before writing any code, then use `dev_tracker/Phase 1.4 - AI Co-pilot.md` as your working checklist.

---

You are building Phase 1.4 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 1.4 - AI Co-pilot.md` — full phase spec: scope boundary, tools, UX
2. `dev_tracker/Phase 1.4 - AI Co-pilot.md` — your working checklist; update it as you go
3. `src/services/claude.js` — understand the current `sendMessage()` structure before extending it
4. `src/routes/api.js` — find the existing `/api/chat` route you'll extend
5. `key_decisions/decisions_log.md` — especially Decisions #12 and #13 (scope boundary)

**Prerequisites:** Phases 1.0, 1.2, and 1.3 complete.

---

## Pre-Build Checklist (Do Before Writing Code)

- [ ] **Grain check:** Read `src/routes/grain.js`. Confirm with PM whether Grain is still in active use before building the Grain integration. If deferred, note it in dev_tracker and skip that workstream.
- [ ] Read the current `src/services/claude.js` in full. Understand existing sendMessage() before extending. Note what old tool definitions exist (if any) — those get removed.

---

## Scope Boundary (Firm — Do Not Cross)

Claude handles complex operations the UI cannot. Simple operations stay in the UI.

| Keep in UI | Give to Claude |
|---|---|
| Add one action (inline input) | Break an outcome into 6+ tagged actions |
| Toggle action done (checkbox) | Convert brain dump into outcomes + actions |
| Archive an outcome (button) | Push all PRODUCT deadlines back 2 weeks |
| Quick capture one item | "What should I prioritize today?" |

Do not wire Claude to intercept any of the left-column operations.

---

## What to Build

### 1. Update `src/services/claude.js` — Tool Definitions

**Remove** any old tool definitions currently in the file (prior-phase stubs or task-related tools).

**Add four new tools.** Use the Anthropic SDK tool_use schema. Model: `claude-sonnet-4-6`.

#### `break_into_actions`
```js
{
  name: "break_into_actions",
  description: "Break the given outcome into a concrete list of actions with time and energy estimates. Called when a user wants to decompose an outcome into executable steps.",
  input_schema: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title:         { type: "string" },
            time_estimate: { type: "integer", description: "Estimated minutes" },
            energy_type:   { type: "string", enum: ["deep", "light"] }
          },
          required: ["title", "energy_type"]
        }
      }
    },
    required: ["actions"]
  }
}
```

#### `brain_dump_to_outcomes`
```js
{
  name: "brain_dump_to_outcomes",
  description: "Convert unstructured text (meeting notes, voice-to-text, stream of consciousness) into structured outcomes and actions, assigned to the correct project.",
  input_schema: {
    type: "object",
    properties: {
      outcomes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title:       { type: "string" },
            project_name: { type: "string", description: "Must match an existing project name exactly" },
            deadline:    { type: "string", description: "ISO date string, or null" },
            priority:    { type: "string", enum: ["low", "medium", "high"] },
            actions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title:         { type: "string" },
                  time_estimate: { type: "integer" },
                  energy_type:   { type: "string", enum: ["deep", "light"] }
                },
                required: ["title", "energy_type"]
              }
            }
          },
          required: ["title", "project_name"]
        }
      }
    },
    required: ["outcomes"]
  }
}
```

#### `bulk_reschedule`
```js
{
  name: "bulk_reschedule",
  description: "Reschedule multiple outcomes' deadlines based on a plain-English instruction (e.g. 'push everything in PRODUCT back 2 weeks'). Returns a preview of all changes — does not mutate data directly.",
  input_schema: {
    type: "object",
    properties: {
      updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            outcome_id:       { type: "integer" },
            title:            { type: "string" },
            current_deadline: { type: "string" },
            new_deadline:     { type: "string", description: "ISO date string" }
          },
          required: ["outcome_id", "title", "new_deadline"]
        }
      }
    },
    required: ["updates"]
  }
}
```

#### `prioritize_today`
```js
{
  name: "prioritize_today",
  description: "Return a prioritized recommendation for what to focus on today, based on deadline risk, energy types, and the active outcome list. Read-only — no mutations.",
  input_schema: {
    type: "object",
    properties: {
      recommendation: { type: "string", description: "Short prioritized recommendation" },
      top_outcomes: {
        type: "array",
        items: { type: "string" },
        description: "Ranked list of outcome titles to focus on"
      },
      reasoning: { type: "string", description: "1-3 sentence explanation" }
    },
    required: ["recommendation", "top_outcomes", "reasoning"]
  }
}
```

**Add a new exported function `sendWithTools(messages, context)`:**
- `messages`: array of `{ role, content }` — the conversation so far
- `context`: the injected context object (see Section 4)
- Builds a system prompt from context and calls the Anthropic API with `tools` array and `tool_choice: "auto"`
- If Claude returns a `tool_use` content block: return `{ type: "tool", tool_name, tool_input }`
- If Claude returns a `text` content block: return `{ type: "message", content }`

Keep the existing `sendMessage()` function — it's used elsewhere (triage pipeline). Do not modify it.

---

### 2. Extend `/api/chat` in `src/routes/api.js`

The existing `/api/chat` route handles basic chat. Extend it (do not replace) to support tool-mode requests:

**Request body:**
```json
{
  "message": "Break this outcome into actions",
  "context": { ... },
  "mode": "tools"
}
```

If `mode === "tools"`:
- Call `sendWithTools([{ role: "user", content: message }], context)`
- Return `{ success: true, data: { type, tool_name, tool_input } }` or `{ type: "message", content }`

If `mode` is absent (existing behavior): call `sendMessage()` as before.

---

### 3. Context Injection

The frontend collects and sends this context object whenever opening the command palette or triggering a tool:

```js
{
  current_project: { id, name },               // whichever project is active
  selected_outcome: {                           // if an outcome is currently open
    id, title, deadline, deadline_risk,
    actions: [{ id, title, time_estimate, energy_type, done }]
  },
  active_outcomes: [                            // all active outcomes
    { id, title, project_name, deadline, deadline_risk, total_actions, completed_actions }
  ],
  projects: [{ id, name }],                     // all projects (for brain_dump matching)
  today_stats: { outcomes_archived_today, actions_completed_today }
}
```

Collect `active_outcomes` from `GET /api/outcomes?status=active` (include project join). Collect `today_stats` from `GET /api/outcomes/stats/today` (Phase 1.3). Projects from `GET /api/projects`.

---

### 4. Command Palette Frontend (`public/index.html`)

**Trigger:**
- `⌘K` (macOS) / `Ctrl+K` (Windows/Linux) anywhere in the app
- Attach the keydown listener to `document`, not to a specific element

**UI:**
- Floating overlay centered on screen, sits above all other content
- Text input focused immediately on open
- Submits on Enter
- ESC closes and discards — no state left behind, no API call made
- Show a loading state while waiting for Claude's response

**Tool result handling:**
- `break_into_actions` → render review modal (see Section 5)
- `brain_dump_to_outcomes` → render preview list (see Section 5)
- `bulk_reschedule` → render deadline diff list (see Section 5)
- `prioritize_today` → render recommendation text inline in the palette (no modal, no confirm step)
- `type: "message"` → render Claude's text response inline

**On successful completion:** close the palette and refresh relevant data (outcome list, stats panel).

---

### 5. Preview-Before-Execute Modals

All three mutating tools require explicit user confirmation before any data is written. Nothing mutates silently.

#### `break_into_actions` — Review Modal
- List each suggested action: title (editable inline), time_estimate (editable), energy_type (toggle)
- Per-action: Accept / Reject toggle
- "Create Accepted Actions" button — batch-creates only accepted actions via `POST /api/actions` for each
- "Cancel" discards everything

#### `brain_dump_to_outcomes` — Preview List
- Show each extracted outcome: title, project, deadline, priority
- Nested: its actions with title/time/energy
- Checkbox per outcome (default checked)
- "Create Selected" — creates checked outcomes via `POST /api/outcomes` then their actions via `POST /api/actions`
- For `project_name` matching: find project by case-insensitive name match; if no match, show a warning and don't create that outcome

#### `bulk_reschedule` — Deadline Diff List
- Show a table: outcome title | current deadline | → | new deadline
- Checkbox per row (default checked)
- "Apply Changes" — PATCHes checked outcomes via `PUT /api/outcomes/:id` for each
- "Cancel" discards

---

### 6. ✦ Button on Outcome Cards

- Small `✦` icon on each outcome card in the Phase 1 grid
- Clicking: opens the command palette pre-loaded with that outcome as `selected_outcome` context and pre-fills the input with "Break this outcome into actions"
- Purpose: discoverability before the ⌘K habit forms — same underlying code path

---

### 7. Grain Integration (Conditional — Confirm With PM First)

**Do not build this workstream until you've confirmed Grain is in active use.** If PM says defer, mark it in dev_tracker and skip.

If confirmed:
- Update the webhook handler in `src/routes/grain.js` — apply the same Outcome/Action classification prompt used in Phase 1.2 Slack triage (in `src/services/claude.js` or wherever triage lives)
- Resulting classified item flows into the inbox table with the same schema (`classification`, `ai_reasoning`)
- From inbox, the existing Phase 1.2 approval flow handles it (same as Slack items)
- Do not restructure `src/routes/grain.js` beyond the prompt update and inbox insertion

---

## Key Constraints

- **Scope boundary is firm.** Basic CRUD (add action, toggle done, archive outcome) stays in the UI. Do not wire Claude to intercept these. (Decisions #12, #13)
- **Preview-before-execute for all mutations.** `break_into_actions`, `brain_dump_to_outcomes`, and `bulk_reschedule` must show a preview and require explicit confirmation before writing.
- **`prioritize_today` is read-only.** It must not trigger any data writes.
- **`sendMessage()` is untouched.** Only add `sendWithTools()` alongside it.
- **Context injection is the frontend's job.** The API route receives context and passes it to claude.js — it does not query the DB for context itself.
- **Do not touch:** `src/routes/grain.js` (except for Grain integration if confirmed), `src/integrations/`, `src/utils/crypto.js`, `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 1.4 - AI Co-pilot.md` as you finish each workstream — not all at the end. Log your session date and any notable decisions in the **Build Log** table. Note whether Grain was shipped or explicitly deferred. When the full checklist is done (or Grain is confirmed-deferred), flag for PM review.
