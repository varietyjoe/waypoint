# Phase 2.1 — Engineer Handoff

## Agent Prompt

You are building Phase 2.1 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase adds Focus Mode — a full-screen, terminal-aesthetic work environment where the user can talk to Claude while working on a specific action. Read `pm_log/Phase 2/Phase 2.1 - Engineer Handoff.md` in full before writing any code, then use `dev_tracker/Phase 2.1 - Focus Mode.md` as your working checklist. Mark items complete as you finish them — not all at the end.

---

You are building Phase 2.1 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 2/Phase 2.1 - Focus Mode.md` — full phase spec
2. `dev_tracker/Phase 2.1 - Focus Mode.md` — your working checklist
3. `public/index.html` — read it fully. Find: `renderPhase2()` (action row rendering), the keydown handler, and the outermost div wrapping the full app layout (sidebar + center + right panel)
4. `src/services/claude.js` — understand the existing Anthropic client init, `sendMessage()`, and `sendWithTools()`
5. `src/routes/api.js` — understand the DB init block at the top (lines 15–21) and the route patterns

**Prerequisites:** Phase 2.0 complete and approved. ✅

---

## Known Codebase State (Read Before Coding)

These are confirmed facts about the actual codebase — do not code against the spec if it contradicts these:

- **Anthropic client:** Named `anthropic` (not `client`). Initialized as `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`.
- **`getActionById(id)` exists** in `src/database/actions.js` and is already exported. Do not recreate it.
- **DB migrations** for the `outcomes` table live inside `initReflectionsTable()` in `src/database/outcomes.js` — not `initOutcomesTable()`. Follow this pattern for any future `outcomes` column migrations, though Phase 2.1 adds no new `outcomes` columns.
- **DB init block** in `src/routes/api.js` is at lines 15–21. Add your `initFocusSessionsTable()` call there alongside the others.
- **Route export:** `module.exports = router` (plain router, not a factory function).

---

## Pre-Build Checklist

- [ ] Read `public/index.html` fully — find `renderPhase2()`, the global `keydown` handler, and identify the outermost wrapper div ID for the full app layout
- [ ] Read `src/services/claude.js` — note the `anthropic` client name and how `sendWithTools` constructs its API call (streaming uses the same client)
- [ ] Read `src/routes/api.js` lines 1–25 — understand the DB init block and require pattern before adding your new module
- [ ] Confirm `getActionById(id)` exists and is exported from `src/database/actions.js` (it does — don't recreate it)

---

## Workstream 1 — New DB Module: `src/database/focus-sessions.js`

Create this file from scratch following the exact pattern of other DB modules (`src/database/outcomes.js`, `src/database/actions.js`):

```js
const db = require('./index');

function initFocusSessionsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      action_id        INTEGER REFERENCES actions(id) ON DELETE SET NULL,
      outcome_id       INTEGER REFERENCES outcomes(id) ON DELETE SET NULL,
      started_at       TEXT DEFAULT (datetime('now')),
      ended_at         TEXT,
      duration_seconds INTEGER,
      conversation     TEXT,
      created_at       TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('✅ Focus sessions table initialized');
}

function createSession(actionId, outcomeId) {
  const result = db.prepare(
    'INSERT INTO focus_sessions (action_id, outcome_id) VALUES (?, ?)'
  ).run(actionId || null, outcomeId || null);
  return db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(result.lastInsertRowid);
}

function endSession(id, endedAt, durationSeconds, conversation) {
  db.prepare(`
    UPDATE focus_sessions
    SET ended_at = ?, duration_seconds = ?, conversation = ?
    WHERE id = ?
  `).run(endedAt, durationSeconds, conversation, id);
  return db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id);
}

function getSessionsByAction(actionId) {
  return db.prepare(
    'SELECT * FROM focus_sessions WHERE action_id = ? ORDER BY created_at DESC'
  ).all(actionId);
}

module.exports = { initFocusSessionsTable, createSession, endSession, getSessionsByAction };
```

---

## Workstream 2 — Add to `src/routes/api.js`

### 2A — Require and init the new module

At the top of `api.js`, add alongside the other DB requires:
```js
const focusSessionsDb = require('../database/focus-sessions');
```

In the DB init block (around line 15–21), add:
```js
focusSessionsDb.initFocusSessionsTable();
```

### 2B — Session routes

```js
// POST /api/focus/sessions — start a focus session
router.post('/focus/sessions', (req, res, next) => {
  try {
    const { actionId, outcomeId } = req.body;
    const session = focusSessionsDb.createSession(actionId || null, outcomeId || null);
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// PUT /api/focus/sessions/:id — end a focus session
router.put('/focus/sessions/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { ended_at, duration_seconds, conversation } = req.body;
    const conv = typeof conversation === 'string' ? conversation : JSON.stringify(conversation || []);
    const session = focusSessionsDb.endSession(id, ended_at, duration_seconds, conv);
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});
```

### 2C — Streaming message route

Add a helper function `buildFocusSystemPrompt` in `api.js` (not in claude.js — it's route-specific logic):

```js
function buildFocusSystemPrompt(action, outcome) {
  const today = new Date().toISOString().split('T')[0];
  const timeStr = action.time_estimate ? `${action.time_estimate} minutes` : 'not set';

  let prompt = `You are a focused work co-pilot. The user is actively working on this task right now. Be direct, brief, and useful. Ask one question at a time if you need clarification.

## Current task
Action: ${action.title}
Time estimate: ${timeStr}
Today's date: ${today}`;

  if (outcome) {
    prompt += `\nPart of outcome: ${outcome.title}`;
    if (outcome.description) prompt += `\nOutcome description: ${outcome.description}`;
  }

  // Phase 2.2 will inject user_context here — placeholder for now
  return prompt;
}
```

Add the streaming route:

```js
// POST /api/focus/message — stream a Claude response
router.post('/focus/message', async (req, res, next) => {
  try {
    const { actionId, message, history = [] } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'message required' });

    const action = actionsDb.getActionById(actionId);
    if (!action) return res.status(404).json({ success: false, error: 'Action not found' });

    const outcome = action.outcome_id ? outcomesDb.getOutcomeById(action.outcome_id) : null;
    const systemPrompt = buildFocusSystemPrompt(action, outcome);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    for await (const chunk of claudeService.streamFocusMessage(systemPrompt, history, message)) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      console.error('Stream error after headers sent:', err.message);
      res.end();
    }
  }
});
```

---

## Workstream 3 — Add to `src/services/claude.js`

Add the streaming generator function. Add it after `sendWithTools` and before `module.exports`:

```js
async function* streamFocusMessage(systemPrompt, history, userMessage) {
  const messages = [
    ...history,
    { role: 'user', content: userMessage }
  ];

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}
```

Update the exports at the bottom of `claude.js`:
```js
module.exports = { sendMessage, sendWithTools, streamFocusMessage };
```

**Do not modify `sendMessage()` or `sendWithTools()`.** Only add. The existing `anthropic` client instance is reused as-is.

---

## Workstream 4 — Frontend: `public/index.html`

### 4A — Module-level variables

Add these near the top of the `<script>` block alongside other module-level variables (`OUTCOMES`, `selectedId`, etc.):

```js
// Focus Mode state
let focusHistory    = [];    // { role: 'user'|'assistant', content: string }[]
let focusActionId   = null;
let focusSessionId  = null;
let focusStartTime  = null;
let focusTimerInterval = null;
```

### 4B — Quotes constant

Add this constant near the module-level variables:

```js
const FOCUS_QUOTES = [
  'Do the work.',
  'One thing at a time.',
  'The work is the shortcut.',
  'Clarity comes from action, not thought.',
  'Start. Everything else follows.',
  'The next hour is all that matters.',
  'Move the needle.',
  'Be here.',
  'Deep work is the superpower.',
  'Progress, not perfection.',
  'You already know what to do.',
  'One focused hour beats a scattered day.',
  'Ship something.',
  'Excellence is a habit.',
  'Done is better than perfect.',
  'Finish what you started.',
  'This is the work.',
  'Make it real.',
  'The obstacle is the way.',
  'Focus is a force multiplier.',
];
```

### 4C — Named ESC key handler (module-level function)

Define this as a named function at module level so it can be properly removed on exit:

```js
function focusModeKeyHandler(e) {
  if (e.key === 'Escape') exitFocusMode();
}
```

### 4D — `enterFocusMode(actionId)`

```js
async function enterFocusMode(actionId) {
  // Find action + parent outcome in memory
  let focusAction = null;
  let parentOutcome = null;
  for (const outcome of OUTCOMES) {
    const found = (outcome.actions || []).find(a => a.id === actionId);
    if (found) { focusAction = found; parentOutcome = outcome; break; }
  }
  if (!focusAction) return;

  // Set state
  focusActionId  = actionId;
  focusHistory   = [];
  focusStartTime = Date.now();

  // Create session record (non-blocking — failure doesn't block Focus Mode)
  try {
    const res = await fetch('/api/focus/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId, outcomeId: parentOutcome?.id || null }),
    });
    const data = await res.json();
    focusSessionId = data.data?.id || null;
  } catch (e) {
    focusSessionId = null;
  }

  // Load JetBrains Mono if not already loaded
  if (!document.querySelector('link[href*="JetBrains+Mono"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap';
    document.head.appendChild(link);
  }

  // Hide main app layout — find the outermost wrapper div containing the full layout.
  // Add id="app-wrapper" to that div in the HTML if it doesn't already have a unique ID.
  const appWrapper = document.getElementById('app-wrapper');
  if (appWrapper) appWrapper.style.display = 'none';

  // Pick quote
  const quote = FOCUS_QUOTES[Math.floor(Math.random() * FOCUS_QUOTES.length)];

  // Build meta string
  const timeStr = focusAction.time || focusAction.time_estimate
    ? `${focusAction.time || focusAction.time_estimate} min`
    : '';
  const metaStr = [parentOutcome?.title, timeStr].filter(Boolean).join(' · ');

  // Render overlay
  const overlay = document.createElement('div');
  overlay.id = 'focus-overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;background:#0d0d0d;z-index:9999;',
    'display:flex;flex-direction:column;',
    'font-family:"JetBrains Mono",monospace;',
  ].join('');

  overlay.innerHTML = `
    <div style="position:absolute;top:20px;right:24px;">
      <span style="color:#374151;font-size:11px;cursor:pointer;" onclick="exitFocusMode()">[esc]</span>
    </div>

    <div style="padding:40px 40px 0;flex-shrink:0;">
      <div style="color:#4ade80;font-size:10px;letter-spacing:.1em;margin-bottom:10px;">&gt; FOCUSING ON</div>
      <div style="color:#e5e7eb;font-size:20px;font-weight:600;line-height:1.3;">${escapeHtml(focusAction.title)}</div>
      ${metaStr ? `<div style="color:#6b7280;font-size:12px;margin-top:6px;">${escapeHtml(metaStr)}</div>` : ''}
      <div style="color:#1f2937;font-size:11px;font-style:italic;margin-top:20px;max-width:480px;">${escapeHtml(quote)}</div>
      <div id="focus-timer" style="color:#4ade80;font-size:12px;margin-top:16px;letter-spacing:.05em;">00:00</div>
    </div>

    <div id="focus-messages" style="flex:1;overflow-y:auto;padding:24px 40px;display:flex;flex-direction:column;gap:16px;"></div>

    <div style="padding:0 40px 36px;flex-shrink:0;">
      <div style="border-top:1px solid #1a1a1a;padding-top:16px;display:flex;align-items:flex-start;gap:8px;">
        <span style="color:#4ade80;font-size:13px;margin-top:3px;">&gt;</span>
        <textarea
          id="focus-input"
          rows="1"
          placeholder="Ask Claude anything about this task..."
          style="flex:1;background:transparent;border:none;outline:none;color:#e5e7eb;font-family:'JetBrains Mono',monospace;font-size:13px;resize:none;line-height:1.5;"
          onkeydown="focusInputKeydown(event)"
        ></textarea>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Start timer
  const timerEl = document.getElementById('focus-timer');
  focusTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - focusStartTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${mm}:${ss}`;
  }, 1000);

  document.addEventListener('keydown', focusModeKeyHandler);
  document.getElementById('focus-input')?.focus();
}
```

**Note on `escapeHtml`:** Check if this function already exists in `public/index.html`. If not, add it:
```js
function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```

**Note on action time field:** After `normalizeOutcome()`, the time estimate may be on `action.time` not `action.time_estimate`. Check the normalized shape and use whichever field holds the number.

### 4E — `exitFocusMode()`

```js
async function exitFocusMode() {
  if (focusHistory.length > 0) {
    if (!confirm("Leave this session? It'll be saved.")) return;
  }

  clearInterval(focusTimerInterval);
  const durationSeconds = Math.floor((Date.now() - focusStartTime) / 1000);

  // Save session (fire and forget — don't block exit)
  if (focusSessionId) {
    fetch(`/api/focus/sessions/${focusSessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ended_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        conversation: JSON.stringify(focusHistory),
      }),
    }).catch(() => {});
  }

  document.getElementById('focus-overlay')?.remove();
  document.removeEventListener('keydown', focusModeKeyHandler);

  const appWrapper = document.getElementById('app-wrapper');
  if (appWrapper) appWrapper.style.display = '';

  // Reset state
  focusActionId      = null;
  focusSessionId     = null;
  focusHistory       = [];
  focusStartTime     = null;
  focusTimerInterval = null;
}
```

### 4F — `appendFocusMessage(role, text)`

```js
function appendFocusMessage(role, text) {
  const container = document.getElementById('focus-messages');
  if (!container) return null;

  const el = document.createElement('div');
  if (role === 'user') {
    el.style.cssText = 'color:#4ade80;font-size:13px;line-height:1.5;';
    el.innerHTML = `<span style="margin-right:8px;">&gt;</span>${escapeHtml(text)}`;
  } else {
    // Assistant: textContent for streaming safety; pre-wrap for newlines
    el.style.cssText = 'color:#9ca3af;font-size:13px;line-height:1.7;white-space:pre-wrap;';
    el.textContent = text;
  }

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}
```

### 4G — `sendFocusMessage()`

```js
async function sendFocusMessage() {
  const input = document.getElementById('focus-input');
  const userMessage = input?.value.trim();
  if (!userMessage) return;

  input.value = '';

  appendFocusMessage('user', userMessage);
  const assistantEl = appendFocusMessage('assistant', '');

  const historySnapshot = [...focusHistory]; // snapshot before mutation

  try {
    const response = await fetch('/api/focus/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionId: focusActionId,
        message: userMessage,
        history: historySnapshot,
      }),
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullResponse += chunk;
      if (assistantEl) {
        assistantEl.textContent = fullResponse;
        const messages = document.getElementById('focus-messages');
        if (messages) messages.scrollTop = messages.scrollHeight;
      }
    }

    // Commit both messages to history after successful response
    focusHistory.push({ role: 'user', content: userMessage });
    focusHistory.push({ role: 'assistant', content: fullResponse });

  } catch (err) {
    if (assistantEl) {
      assistantEl.textContent = '[Error: Could not reach Claude. Try again.]';
      assistantEl.style.color = '#ef4444';
    }
  }
}
```

### 4H — `focusInputKeydown(e)`

```js
function focusInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendFocusMessage();
  }
}
```

### 4I — Add "Focus →" button to action rows in `renderPhase2()`

Inside `renderPhase2()`, find where each action row is rendered. Add a small "Focus →" button to each non-done action row. It should be subtle — placed at the right edge of the row, visible on hover.

Example pattern to add inside the action row HTML (adjust to match actual row structure):
```html
<button
  onclick="event.stopPropagation(); enterFocusMode(${action.id})"
  style="margin-left:auto;padding:2px 8px;font-size:10px;color:#9ca3af;border:1px solid #e5e7eb;border-radius:4px;background:transparent;cursor:pointer;opacity:0;transition:opacity 0.15s;"
  class="focus-btn"
  title="Enter Focus Mode">
  Focus →
</button>
```

Add to your `<style>` block to make the button appear on row hover:
```css
.action-row:hover .focus-btn { opacity: 1 !important; }
```

Do not show the Focus button on done actions (`if (!action.done)`).

### 4J — `F` key shortcut

In the existing global `keydown` handler (or add a new one if none exists for this), add:

```js
// F key — enter Focus Mode for first pending action in selected outcome
if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) {
  // Don't fire when user is typing in an input
  if (['INPUT','TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;
  if (currentPhase === 2 && selectedId) {
    const outcome = OUTCOMES.find(o => o.id === selectedId);
    const firstPending = (outcome?.actions || []).find(a => !a.done);
    if (firstPending) enterFocusMode(firstPending.id);
  }
}
```

### 4K — Find and tag the main app wrapper

Read `public/index.html` to find the outermost div that wraps sidebar + center + right panel. Add `id="app-wrapper"` to it if it doesn't have a unique, stable ID. This is what `enterFocusMode` and `exitFocusMode` toggle with `display:none` / `''`.

---

## Key Constraints

- **Do not modify** `sendMessage()` or `sendWithTools()` in `claude.js` — only add `streamFocusMessage`.
- **`getActionById` already exists** in `actions.js` — do not recreate it.
- **No sound, no Pomodoro timer, no sharing** — explicitly out of scope for 2.1.
- **Phase 2.2 context injection** is a placeholder comment in `buildFocusSystemPrompt` — do not implement it now.
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, `src/integrations/`, `src/utils/crypto.js`, `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`, `src/database/triage.js`, `src/database/inbox.js`.
- **No regressions** — ⌘K palette, Phase 1/2/3 navigation, action toggles, inline editing from 2.0, all must still work.

---

## Files You Will Touch

| File | What changes |
|---|---|
| `src/database/focus-sessions.js` | New file — create from scratch |
| `src/routes/api.js` | Add require, init call, 3 new routes, `buildFocusSystemPrompt` helper |
| `src/services/claude.js` | Add `streamFocusMessage` generator, update exports |
| `public/index.html` | Module-level vars, FOCUS_QUOTES, 7 new functions, action row Focus button, F-key shortcut, app-wrapper id |

That's it. Four files.

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 2.1 - Focus Mode.md` as you finish each workstream — not all at the end. Log your session date and any decisions in the Build Log table. When the full checklist is done, flag for PM review.
