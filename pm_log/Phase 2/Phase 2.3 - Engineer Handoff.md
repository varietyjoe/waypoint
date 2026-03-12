# Phase 2.3 — Engineer Handoff

## Agent Prompt

You are building Phase 2.3 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase upgrades the AI Breakdown feature — the `break_into_actions` tool now uses the user's context memory for accurate time estimates, and asks questions before generating when it encounters unknown task types. Read `pm_log/Phase 2/Phase 2.3 - Engineer Handoff.md` in full before writing any code, then use `dev_tracker/Phase 2.3 - AI Breakdown.md` as your working checklist. Mark items complete as you finish them.

---

You are building Phase 2.3 of Waypoint — a single-user personal execution OS at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 2/Phase 2.3 - AI Breakdown.md` — full phase spec
2. `dev_tracker/Phase 2.3 - AI Breakdown.md` — your working checklist
3. `src/services/claude.js` — find the `TOOLS` array and the `break_into_actions` definition; find `sendWithTools` and how the system prompt is built
4. `public/index.html` — search for the ⌘K command palette handler. Find the function that handles the `break_into_actions` tool result (search for `renderCmdBreak` or `break_into_actions` or `cmdBreak`). Read it and the `createAcceptedActions` function fully.

**Prerequisites:** Phase 2.2 complete and approved. ✅

---

## Known Codebase State

- **Tool invocation flow:** Frontend sends `POST /api/chat` with `{ mode: 'tools', message, context }`. Route calls `sendWithTools(messages, context)`. Returns `{ type: 'tool', tool_name: 'break_into_actions', tool_input: { actions: [...] } }`.
- **`sendWithTools` system prompt** already includes the selected outcome title/deadline/actions and the user context snapshot (Phase 2.2). The system prompt you update is inside `sendWithTools` in `src/services/claude.js`.
- **`break_into_actions` tool** is defined in the `TOOLS` array in `src/services/claude.js`. Its current `input_schema` has `actions` array only. You are adding an optional `questions` array.
- **Existing ⌘K preview modal** for `break_into_actions` is in `public/index.html`. The function is likely named `renderCmdBreak` (search the file to confirm). It renders each suggested action as an editable card. `createAcceptedActions(outcomeId, actions)` posts them to the API.
- **`escHtml` not `escapeHtml`** — correct helper name in `public/index.html`.

---

## Pre-Build Checklist

- [ ] Read `src/services/claude.js` — find the `break_into_actions` tool definition (in `TOOLS` array). Note its current `input_schema` exactly.
- [ ] Read `src/services/claude.js` — find `sendWithTools`. Read the full system prompt construction block. Note where you'll add the breakdown-specific instruction.
- [ ] Read `public/index.html` — search `break_into_actions` and `renderCmdBreak`. Find and read the function that handles the tool result and renders the action preview. Find `createAcceptedActions`.

---

## Workstream 1 — Update `break_into_actions` Tool Schema (`src/services/claude.js`)

### 1A — Update the tool's `input_schema`

In the `TOOLS` array, find the `break_into_actions` tool. Update its `input_schema` to add an optional `questions` property:

```js
{
  name: 'break_into_actions',
  description: 'Break the given outcome into a concrete list of actions with time and energy estimates. Uses the user\'s known durations from context. If task types are unknown, returns questions before proposing actions.',
  input_schema: {
    type: 'object',
    properties: {
      actions: {
        type: 'array',
        description: 'Proposed actions for this outcome',
        items: {
          type: 'object',
          properties: {
            title:         { type: 'string' },
            time_estimate: { type: 'integer', description: 'Estimated minutes. Use the user\'s known durations from context. Do not guess for unknown task types — put them in questions instead.' },
            energy_type:   { type: 'string', enum: ['deep', 'light'] },
          },
          required: ['title', 'time_estimate', 'energy_type'],
        },
      },
      questions: {
        type: 'array',
        description: 'Questions to ask the user BEFORE showing the action list. Only populate if you encounter task types with no known duration in the user\'s context. One question per unknown task type. Leave empty or omit if context covers all tasks.',
        items: { type: 'string' },
      },
    },
    required: ['actions'],
  },
}
```

### 1B — Update the system prompt in `sendWithTools`

In `sendWithTools`, find the line that describes `break_into_actions` in the tool routing instructions (near the bottom of the system prompt block). Replace or extend it:

```js
// Replace the break_into_actions line in the tool routing description with:
`- break_into_actions: decompose the selected outcome into 3–7 specific executable actions. Use the user's known durations from context for time estimates. If a task type has no known duration in context, put it in questions[] instead of guessing. Propose realistic estimates only.`
```

---

## Workstream 2 — Frontend: Questions Step + Updated Preview (`public/index.html`)

### 2A — Find the existing ⌘K handler

Read `public/index.html` and find:
1. The function that receives the `break_into_actions` tool result (likely triggered by the `type: 'tool'` response from `/api/chat`)
2. The `renderCmdBreak` (or equivalent) function
3. The `createAcceptedActions` function

### 2B — Add `renderBreakdownQuestions(questions, outcomeId, pendingActions)`

Add this function. It renders a simple questions panel inside the ⌘K palette:

```js
function renderBreakdownQuestions(questions, outcomeId, pendingActions) {
  const palette = document.getElementById('cmdPalette') // or wherever the palette content is rendered
  // Find the palette content container — check the existing code for the correct element ID
  const content = document.getElementById('cmdContent') // adjust to match actual element

  const inputs = questions.map((q, i) => `
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">${escHtml(q)}</div>
      <input
        id="breakdown-q-${i}"
        type="text"
        placeholder="Your answer…"
        style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:12px;outline:none;"
        onkeydown="if(event.key==='Enter') submitBreakdownQuestions(${JSON.stringify(questions).replace(/"/g,'&quot;')}, ${outcomeId}, this)"
      />
    </div>
  `).join('');

  content.innerHTML = `
    <div style="padding:16px;">
      <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em;">
        A couple of questions before I build your plan
      </div>
      ${inputs}
      <button
        onclick="submitBreakdownQuestions(${JSON.stringify(questions).replace(/"/g,'&quot;')}, ${outcomeId})"
        style="width:100%;margin-top:4px;padding:8px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
        Continue →
      </button>
    </div>
  `;

  // Focus first input
  setTimeout(() => document.getElementById('breakdown-q-0')?.focus(), 50);

  // Store pending actions for after questions are answered
  window._pendingBreakdownActions = pendingActions;
  window._pendingBreakdownOutcomeId = outcomeId;
}
```

**Note:** Adjust element IDs (`cmdPalette`, `cmdContent`, etc.) to match the actual palette DOM structure you find in the existing code.

### 2C — Add `submitBreakdownQuestions(questions, outcomeId)`

```js
async function submitBreakdownQuestions(questions, outcomeId) {
  const answers = questions.map((q, i) => ({
    question: q,
    answer: document.getElementById(`breakdown-q-${i}`)?.value.trim() || '',
  }));

  // Save each answer to user context
  const saves = answers
    .filter(a => a.answer)
    .map(a => fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: a.question.slice(0, 60),
        value: a.answer,
        category: 'task_duration',
        source: 'ai_breakdown',
      }),
    }));

  await Promise.all(saves).catch(() => {}); // non-blocking — proceed regardless

  // Now show the action preview with the pending actions
  const pendingActions = window._pendingBreakdownActions || [];
  window._pendingBreakdownActions = null;
  window._pendingBreakdownOutcomeId = null;

  renderCmdBreak(outcomeId, pendingActions); // adjust function name to match actual
}
```

### 2D — Update the `break_into_actions` result handler

In the existing ⌘K tool-result handler, find where it processes `tool_name === 'break_into_actions'`. Update it to check for questions first:

```js
// In the existing handler that processes tool results:
if (result.type === 'tool' && result.tool_name === 'break_into_actions') {
  const { actions = [], questions = [] } = result.tool_input;

  if (questions.length > 0) {
    // Show questions step first, pass pending actions through
    renderBreakdownQuestions(questions, selectedId, actions);
  } else {
    // No questions — go straight to action preview (existing behavior)
    renderCmdBreak(selectedId, actions); // adjust function call to match actual
  }
}
```

**Note:** The existing `renderCmdBreak` likely only takes `actions` as an argument, not `outcomeId`. Check the actual signature and adjust. If needed, pass the `selectedId` (current selected outcome) to the function or capture it from module scope.

---

## Key Constraints

- **Do not rewrite `renderCmdBreak`** — it already works. Only add the questions step before it fires.
- **Questions answers are non-blocking** — if the API save fails, proceed to the action preview anyway.
- **`sendWithTools` signature unchanged** — do not add parameters or change how the `/api/chat` route calls it.
- **No new API routes needed** — context answers go to existing `POST /api/context`, actions go to existing `POST /api/actions`.
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, `src/integrations/`, `src/utils/crypto.js`, `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`, `src/database/triage.js`, `src/database/inbox.js`.

---

## Files You Will Touch

| File | What changes |
|---|---|
| `src/services/claude.js` | `break_into_actions` tool schema (add `questions` property), `sendWithTools` system prompt (update `break_into_actions` description) |
| `public/index.html` | `renderBreakdownQuestions()`, `submitBreakdownQuestions()`, update `break_into_actions` result handler to check for questions |

Two files. Nothing else.

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 2.3 - AI Breakdown.md`. Log your session date and any decisions. Flag for PM review when done.
