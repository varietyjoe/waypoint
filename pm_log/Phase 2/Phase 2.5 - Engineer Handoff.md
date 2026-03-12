# Phase 2.5 — Engineer Handoff

## Agent Prompt

You are building Phase 2.5 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase adds Persistent Focus Memory — Claude reads past session notes when you open Focus Mode on related work, and you can explicitly save key outputs. Read `pm_log/Phase 2/Phase 2.5 - Engineer Handoff.md` in full before writing any code, then use `dev_tracker/Phase 2.5 - Persistent Focus Memory.md` as your working checklist. Mark items complete as you finish them.

---

You are building Phase 2.5 of Waypoint — a single-user personal execution OS at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 2/Phase 2.5 - Persistent Focus Memory.md` — full phase spec
2. `dev_tracker/Phase 2.5 - Persistent Focus Memory.md` — your working checklist
3. `src/database/focus-sessions.js` — read all functions and the table schema (`initFocusSessionsTable`)
4. `src/routes/api.js` — find `buildFocusSystemPrompt` (around line 1131), read it and all existing `/api/focus/*` routes
5. `src/services/claude.js` — read `streamFocusMessage`, `module.exports`
6. `public/index.html` — find `enterFocusMode`, `sendFocusMessage`, `appendFocusMessage`, and the Memory panel code (`toggleMemoryPanel`, `loadMemoryPanel`)

**Prerequisites:** Phase 2.1 (focus_sessions table) and Phase 2.2 (user_context) complete and approved. ✅

---

## Known Codebase State

- **`focus_sessions` table columns** (Phase 2.1): `id`, `action_id`, `started_at`, `ended_at`, `conversation` (JSON array of `{role, content}` messages)
- **`buildFocusSystemPrompt(action, outcome, project, contextSnapshot)`** in `api.js` — already injects user context (Phase 2.2). Returns a string.
- **`POST /api/focus/message`** calls `buildFocusSystemPrompt(...)`, passes to `streamFocusMessage(systemPrompt, history, userMessage)`.
- **Focus session `conversation` field**: stored as a JSON string, parsed on read. Each message is `{ role: 'user'|'assistant', content: string }`.
- **`user_context` table**: has `category` and `source` columns. `category: 'saved_output'` is the new category for saved Focus outputs.
- **`escHtml` not `escapeHtml`** — correct helper name in `public/index.html`.
- **Anthropic client:** Named `anthropic` in `claude.js`.
- **DB migrations pattern:** Use `PRAGMA table_info('focus_sessions')` — check if `summary` column exists, `ALTER TABLE` if not. Match the pattern in `initFocusSessionsTable()`.

---

## Pre-Build Checklist

- [ ] Read `src/database/focus-sessions.js` — note exact table schema and all exported functions
- [ ] Read `src/routes/api.js` — read `buildFocusSystemPrompt` fully, read `POST /api/focus/message` route fully
- [ ] Read `src/services/claude.js` — read `streamFocusMessage`, read `module.exports`
- [ ] Read `public/index.html` — find `enterFocusMode`, `appendFocusMessage`, `sendFocusMessage`, `loadMemoryPanel`, and `renderMemoryList`

---

## Workstream 1 — DB Migration: Add `summary` Column (`src/database/focus-sessions.js`)

In `initFocusSessionsTable()`, add a migration for the `summary` column after existing migrations:

```js
// Add summary column if not present
const cols = db.prepare("PRAGMA table_info('focus_sessions')").all();
if (!cols.find(c => c.name === 'summary')) {
  db.prepare("ALTER TABLE focus_sessions ADD COLUMN summary TEXT").run();
}
```

Also add two new exported functions:

```js
function getRelevantSessions(actionId, outcomeId) {
  // 1. Sessions on the same outcome (join through actions table)
  const bySameOutcome = db.prepare(`
    SELECT fs.* FROM focus_sessions fs
    JOIN actions a ON fs.action_id = a.id
    WHERE a.outcome_id = ?
    ORDER BY fs.started_at DESC
    LIMIT 5
  `).all(outcomeId);

  if (bySameOutcome.length > 0) return bySameOutcome;

  // 2. Fallback: sessions on this exact action
  return db.prepare(`
    SELECT * FROM focus_sessions
    WHERE action_id = ?
    ORDER BY started_at DESC
    LIMIT 5
  `).all(actionId);
}

function updateSessionSummary(id, summary) {
  db.prepare('UPDATE focus_sessions SET summary = ? WHERE id = ?').run(summary, id);
}
```

Update `module.exports`:
```js
module.exports = { initFocusSessionsTable, createSession, endSession, getSessionsByAction, getRelevantSessions, updateSessionSummary };
```

---

## Workstream 2 — New Claude Function (`src/services/claude.js`)

Add `summarizeFocusSession(conversation)` before `module.exports`:

```js
async function summarizeFocusSession(conversation) {
  const formatted = conversation.map(m => `${m.role === 'user' ? 'User' : 'Claude'}: ${m.content}`).join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Summarize this Focus Mode work session in 3–5 sentences. Focus on what was decided, created, or learned. Be specific about outputs and next steps. Do not mention the word "summary".\n\n${formatted}`,
    }],
  });

  return response.content.find(b => b.type === 'text')?.text?.trim() || '';
}
```

Update `module.exports`:
```js
module.exports = { sendMessage, classifyForInbox, sendWithTools, streamFocusMessage, batchTriageInbox, summarizeFocusSession };
```

---

## Workstream 3 — API: Relevant Sessions Endpoint + System Prompt Update (`src/routes/api.js`)

### 3A — Require the updated focus-sessions functions

Ensure `focusSessionsDb` destructuring includes `getRelevantSessions` and `updateSessionSummary`:
```js
const { initFocusSessionsTable, createSession, endSession, getSessionsByAction, getRelevantSessions, updateSessionSummary } = require('../database/focus-sessions');
```

### 3B — New GET route

Add before the existing `POST /api/focus/sessions` route:

```js
// GET /api/focus/sessions/relevant — retrieve relevant past sessions for Focus Mode context
router.get('/focus/sessions/relevant', async (req, res, next) => {
  try {
    const { actionId, outcomeId } = req.query;
    if (!actionId || !outcomeId) {
      return res.status(400).json({ success: false, error: 'actionId and outcomeId required' });
    }

    const sessions = getRelevantSessions(parseInt(actionId), parseInt(outcomeId));

    // Summarize long sessions and cache the summary
    const TOKEN_THRESHOLD = 2000; // approx characters
    const enriched = await Promise.all(sessions.map(async (session) => {
      let conversation = [];
      try { conversation = JSON.parse(session.conversation || '[]'); } catch {}

      const rawText = conversation.map(m => m.content).join(' ');

      if (rawText.length < TOKEN_THRESHOLD) {
        // Short enough — return as-is
        return { ...session, conversation };
      }

      // Long session — use cached summary or generate one
      if (!session.summary) {
        const summary = await claudeService.summarizeFocusSession(conversation);
        updateSessionSummary(session.id, summary);
        return { ...session, conversation: [], summary };
      }

      return { ...session, conversation: [], summary: session.summary };
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
});
```

### 3C — Update `buildFocusSystemPrompt` to accept session blocks

Update the function signature and body to accept an optional `relevantSessionBlocks` parameter:

```js
function buildFocusSystemPrompt(action, outcome, project, contextSnapshot, relevantSessionBlocks = '') {
  // ... existing prompt construction ...
  // At the end, before returning, append session blocks if present:
  let prompt = /* existing prompt string */;

  if (relevantSessionBlocks) {
    prompt += `\n\n${relevantSessionBlocks}`;
  }

  return prompt;
}
```

**Note:** Read the existing function to find the exact return statement and append at the correct point without disrupting the existing context injection.

### 3D — Update `POST /api/focus/message` to inject relevant sessions

In the `POST /api/focus/message` route, fetch relevant sessions and pass them to `buildFocusSystemPrompt`:

```js
// Before calling buildFocusSystemPrompt:
let relevantSessionBlocks = '';
try {
  const sessions = getRelevantSessions(action.id, action.outcome_id);
  if (sessions.length > 0) {
    const blocks = await Promise.all(sessions.slice(0, 3).map(async (session) => {
      let conversation = [];
      try { conversation = JSON.parse(session.conversation || '[]'); } catch {}
      const rawText = conversation.map(m => m.content).join(' ');
      const dateStr = new Date(session.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      if (rawText.length < 2000) {
        const formatted = conversation.map(m => `${m.role === 'user' ? 'You' : 'Claude'}: ${m.content}`).join('\n');
        return `[Session — ${dateStr}]\n${formatted}`;
      }

      // Use cached summary or generate
      let summary = session.summary;
      if (!summary) {
        summary = await claudeService.summarizeFocusSession(conversation);
        updateSessionSummary(session.id, summary);
      }
      return `[Session — ${dateStr}]\n${summary}`;
    }));

    relevantSessionBlocks = `## Past sessions on related work:\n${blocks.join('\n\n')}`;
  }
} catch (_) {}

const systemPrompt = buildFocusSystemPrompt(action, outcome, project, contextSnapshot, relevantSessionBlocks);
```

**Note:** Find the exact location where `buildFocusSystemPrompt` is called in the route and inject the relevant sessions block just before it.

---

## Workstream 4 — Frontend: "Save this →" Chip + Memory Panel Update (`public/index.html`)

### 4A — "Save this →" chip on Claude response blocks

In `appendFocusMessage(role, text)`, update the assistant branch to append a save chip below the message:

```js
// When role === 'assistant':
// After rendering the message content, append a save chip:
const msgId = `focus-msg-${Date.now()}`;
// Add data-msg-id to the message element so we can read its text
// Render chip below the message bubble:
const chipHtml = `
  <div style="text-align:right;margin-top:4px;">
    <button
      onclick="saveContextFromFocusBlock(this)"
      data-content="${escHtml(text)}"
      style="font-size:10px;color:#9ca3af;background:transparent;border:none;cursor:pointer;padding:2px 6px;border-radius:4px;border:1px solid #e5e7eb;">
      Save this →
    </button>
  </div>
`;
// Append chipHtml after the message bubble in the focus messages container
```

**Note:** Check the exact DOM structure of `appendFocusMessage` and insert the chip HTML correctly. The chip should be positioned below each assistant message, not inside the bubble.

### 4B — `saveContextFromFocusBlock(btn)`

```js
async function saveContextFromFocusBlock(btn) {
  const content = btn.dataset.content || btn.getAttribute('data-content') || '';
  if (!content) return;

  // Auto-generate key from first 8 words
  const key = content.trim().split(/\s+/).slice(0, 8).join(' ');

  try {
    const res = await fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        value: content,
        category: 'saved_output',
        source: 'focus_mode',
      }),
    });
    if (res.ok) {
      btn.textContent = 'Saved ✓';
      btn.disabled = true;
      btn.style.color = '#10b981';
    }
  } catch (_) {
    btn.textContent = 'Failed';
  }
}
```

### 4C — Update `enterFocusMode` to fetch relevant sessions

At the start of `enterFocusMode(actionId)`, fetch relevant sessions so they're pre-loaded for the API (they'll be fetched server-side, but this can update a status indicator):

```js
// At the beginning of enterFocusMode, optionally show a brief "Loading context…" state
// in the focus messages area while waiting for first response.
// The actual session injection happens server-side in POST /api/focus/message.
// No client-side fetch needed — the system prompt is built per-message on the server.
```

**Note:** No additional client-side fetch is needed — the server builds relevant sessions into the system prompt on every `POST /api/focus/message` call. Skip this if adding a loading state is not straightforward.

### 4D — Memory panel: add "Saved Outputs" section

In `loadMemoryPanel()` (or `renderMemoryList()`), fetch context entries with `category = 'saved_output'` and render them in a separate accordion section:

```js
// In loadMemoryPanel or equivalent:
// Existing section renders task_duration entries.
// Add a second section for saved_output entries:

const savedOutputs = allContext.filter(c => c.category === 'saved_output');

if (savedOutputs.length > 0) {
  const savedHtml = savedOutputs.map(entry => `
    <div style="padding:8px 0;border-bottom:1px solid #f9fafb;">
      <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:2px;">${escHtml(entry.key)}</div>
      <div style="font-size:11px;color:#6b7280;white-space:pre-wrap;max-height:60px;overflow:hidden;">${escHtml(entry.value)}</div>
      <div style="font-size:10px;color:#9ca3af;margin-top:2px;">${new Date(entry.created_at).toLocaleDateString()}</div>
    </div>
  `).join('');

  // Append a "Saved Outputs" section to the memory panel
  // Find the memory panel HTML template in loadMemoryPanel and add this section
}
```

**Note:** Read the existing memory panel structure in `loadMemoryPanel` / `renderMemoryList` to find the correct insertion point.

---

## Key Constraints

- **`buildFocusSystemPrompt` signature change is backward-compatible** — `relevantSessionBlocks` defaults to `''`, so any existing callers (if any) still work without updating.
- **Session summarization is non-blocking** — if it fails, skip the session block entirely (no throw). Wrap in try/catch.
- **Context saves are non-blocking** — same pattern as Phase 2.3 and 2.4.
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, all integrations, crypto, oauth-tokens, monitored-channels, `src/database/triage.js`, `src/database/inbox.js`.

---

## Files You Will Touch

| File | What changes |
|---|---|
| `src/database/focus-sessions.js` | Add `summary` column migration, `getRelevantSessions()`, `updateSessionSummary()`, update `module.exports` |
| `src/services/claude.js` | Add `summarizeFocusSession()`, update `module.exports` |
| `src/routes/api.js` | Update require, add `GET /api/focus/sessions/relevant`, update `buildFocusSystemPrompt` signature + body, update `POST /api/focus/message` to inject relevant sessions |
| `public/index.html` | "Save this →" chip in `appendFocusMessage`, `saveContextFromFocusBlock()`, Memory panel Saved Outputs section |

Four files.

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 2.5 - Persistent Focus Memory.md`. Log decisions. Flag for PM review.
