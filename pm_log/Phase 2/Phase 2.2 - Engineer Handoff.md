# Phase 2.2 — Engineer Handoff

## Agent Prompt

You are building Phase 2.2 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase adds User Context Memory — a `user_context` table where Claude's knowledge about how the user works is stored and injected into every future Claude interaction. Read `pm_log/Phase 2/Phase 2.2 - Engineer Handoff.md` in full before writing any code, then use `dev_tracker/Phase 2.2 - User Context Memory.md` as your working checklist. Mark items complete as you finish them — not all at the end.

---

You are building Phase 2.2 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 2/Phase 2.2 - User Context Memory.md` — full phase spec
2. `dev_tracker/Phase 2.2 - User Context Memory.md` — your working checklist
3. `public/index.html` — read it fully. Find: the sidebar rendering code, the Focus Mode `sendFocusMessage()` and `renderFocusMode` overlay, and any existing settings/sidebar section
4. `src/routes/api.js` — read the full file to understand existing route patterns and the Focus Mode `buildFocusSystemPrompt` function added in Phase 2.1
5. `src/services/claude.js` — understand `sendMessage()`, `sendWithTools()`, and `streamFocusMessage()` — all three will be updated to inject context
6. `key_decisions/decisions_log.md` — no specific Phase 2.2 decision, but confirms the "ask once, remember forever" principle

**Prerequisites:** Phase 2.1 complete and approved.

---

## Known Codebase State (Read Before Coding)

- **Anthropic client:** Named `anthropic` (not `client`) in `src/services/claude.js`.
- **DB migration pattern:** New column migrations on the `outcomes` table go in `initReflectionsTable()` in `src/database/outcomes.js`. Phase 2.2 adds a new table, not new columns — create a new module (`user-context.js`) with its own `initUserContextTable()`.
- **DB init block:** In `src/routes/api.js` around lines 15–25. Add `userContextDb.initUserContextTable()` there.
- **Focus Mode system prompt:** `buildFocusSystemPrompt(action, outcome)` is a helper function in `src/routes/api.js`. It has a comment placeholder for Phase 2.2 context injection — update it here.
- **`escHtml()`:** The HTML-escaping utility in `public/index.html` is named `escHtml`, not `escapeHtml`. Use `escHtml` throughout.
- **Sidebar structure:** Read `public/index.html` to understand how the left sidebar renders projects. The "Memory" chip and context settings panel go in the sidebar below the project list.

---

## Pre-Build Checklist

- [ ] Read `pm_log/Phase 2/Phase 2.2 - User Context Memory.md` in full
- [ ] Read `src/routes/api.js` — find `buildFocusSystemPrompt` and understand where to inject context
- [ ] Read `src/services/claude.js` — understand all three exported functions before modifying
- [ ] Read `public/index.html` — find the sidebar rendering code and the Focus Mode `sendFocusMessage()` function
- [ ] Check that Phase 2.1 shipped correctly: `GET /api/focus/sessions` is NOT required, but confirm `POST /api/focus/message` exists and `streamFocusMessage` is exported from `claude.js`

---

## Workstream 1 — New DB Module: `src/database/user-context.js`

Create this file from scratch:

```js
const db = require('./index');

function initUserContextTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_context (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      key              TEXT NOT NULL,
      value            TEXT NOT NULL,
      category         TEXT,
      source           TEXT,
      source_action_id  INTEGER REFERENCES actions(id) ON DELETE SET NULL,
      source_outcome_id INTEGER REFERENCES outcomes(id) ON DELETE SET NULL,
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('✅ User context table initialized');
}

function getAllContext() {
  return db.prepare('SELECT * FROM user_context ORDER BY category, key').all();
}

// Returns a formatted string block for injection into Claude system prompts.
// Returns empty string if no context exists.
function getContextSnapshot() {
  const rows = db.prepare('SELECT key, value FROM user_context ORDER BY category, key').all();
  if (rows.length === 0) return '';

  const lines = rows.map(r => `- ${r.key}: ${r.value}`).join('\n');
  return `## What I know about how you work:\n${lines}`;
}

// Insert or update by key (case-insensitive match).
function upsertContext(key, value, category, source, sourceActionId, sourceOutcomeId) {
  const existing = db.prepare('SELECT id FROM user_context WHERE lower(key) = lower(?)').get(key);
  if (existing) {
    db.prepare(`
      UPDATE user_context
      SET value = ?, category = ?, source = ?, source_action_id = ?, source_outcome_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(value, category || null, source || null, sourceActionId || null, sourceOutcomeId || null, existing.id);
    return db.prepare('SELECT * FROM user_context WHERE id = ?').get(existing.id);
  } else {
    const result = db.prepare(`
      INSERT INTO user_context (key, value, category, source, source_action_id, source_outcome_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(key, value, category || null, source || null, sourceActionId || null, sourceOutcomeId || null);
    return db.prepare('SELECT * FROM user_context WHERE id = ?').get(result.lastInsertRowid);
  }
}

function updateContext(id, value, category) {
  db.prepare(`
    UPDATE user_context
    SET value = ?, category = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(value, category || null, id);
  return db.prepare('SELECT * FROM user_context WHERE id = ?').get(id);
}

function deleteContext(id) {
  db.prepare('DELETE FROM user_context WHERE id = ?').run(id);
}

module.exports = {
  initUserContextTable,
  getAllContext,
  getContextSnapshot,
  upsertContext,
  updateContext,
  deleteContext,
};
```

---

## Workstream 2 — API Routes (`src/routes/api.js`)

### 2A — Require and init

At the top with other DB requires:
```js
const userContextDb = require('../database/user-context');
```

In the DB init block:
```js
userContextDb.initUserContextTable();
```

### 2B — Context CRUD routes

```js
// GET /api/context — all context entries
router.get('/context', (req, res, next) => {
  try {
    const entries = userContextDb.getAllContext();
    res.json({ success: true, count: entries.length, data: entries });
  } catch (err) { next(err); }
});

// POST /api/context — add a context entry
router.post('/context', (req, res, next) => {
  try {
    const { key, value, category, source, source_action_id, source_outcome_id } = req.body;
    if (!key || !value) return res.status(400).json({ success: false, error: 'key and value required' });
    const entry = userContextDb.upsertContext(key, value, category, source, source_action_id, source_outcome_id);
    res.json({ success: true, data: entry });
  } catch (err) { next(err); }
});

// PUT /api/context/:id — update value or category
router.put('/context/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { value, category } = req.body;
    if (!value) return res.status(400).json({ success: false, error: 'value required' });
    const entry = userContextDb.updateContext(id, value, category);
    res.json({ success: true, data: entry });
  } catch (err) { next(err); }
});

// DELETE /api/context/:id — remove an entry
router.delete('/context/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    userContextDb.deleteContext(id);
    res.json({ success: true });
  } catch (err) { next(err); }
});
```

### 2C — Update `buildFocusSystemPrompt` to inject context

In `src/routes/api.js`, update the `buildFocusSystemPrompt` function to inject user context. Replace the Phase 2.2 placeholder comment with:

```js
function buildFocusSystemPrompt(action, outcome) {
  const today = new Date().toISOString().split('T')[0];
  const timeStr = action.time_estimate ? `${action.time_estimate} minutes` : 'not set';

  let prompt = `You are a focused work co-pilot. The user is actively working on this task right now. Be direct, brief, and useful. Ask one question at a time if you need clarification.

If the user mentions a task or estimates time for something you don't have in context, ask them to confirm the duration, then tell them you've noted it. Keep the question to one sentence.

## Current task
Action: ${action.title}
Time estimate: ${timeStr}
Today's date: ${today}`;

  if (outcome) {
    prompt += `\nPart of outcome: ${outcome.title}`;
    if (outcome.description) prompt += `\nOutcome description: ${outcome.description}`;
  }

  // Phase 2.2 — inject user context snapshot
  const contextSnapshot = userContextDb.getContextSnapshot();
  if (contextSnapshot) {
    prompt += `\n\n${contextSnapshot}`;
  }

  return prompt;
}
```

---

## Workstream 3 — Update `src/services/claude.js`

Update `sendMessage()` and `sendWithTools()` to accept and inject an optional context snapshot. This is purely additive — callers that don't pass context get the same behavior as before.

### 3A — Update `sendMessage`

Current signature: `async function sendMessage(message, conversationHistory = [], preview = false)`

Add an optional `contextSnapshot` parameter:

```js
async function sendMessage(message, conversationHistory = [], preview = false, contextSnapshot = '') {
  // ... existing code ...

  // In the system prompt construction, add context if present:
  const contextBlock = contextSnapshot ? `\n\n${contextSnapshot}` : '';

  const systemPrompt = `You are a helpful AI assistant integrated into Waypoint, a personal execution OS.
Today's date: ${todayStr} (${dayOfWeek})
Waypoint organizes work as: Projects → Outcomes → Actions.
- An Outcome is a meaningful deliverable (e.g. "Launch Q1 product update")
- An Action is a specific task within an outcome (e.g. "Write release notes")
Respond concisely and helpfully.${contextBlock}`;

  // rest of function unchanged
}
```

### 3B — Update `sendWithTools`

Current signature: `async function sendWithTools(messages, context)`

The `context` object already carries project/outcome data. Add context snapshot injection into its system prompt. Find where `sendWithTools` builds its system prompt and append the snapshot:

```js
// Inside sendWithTools system prompt construction:
const contextSnapshot = userContextDb.getContextSnapshot();
const contextBlock = contextSnapshot ? `\n\n${contextSnapshot}` : '';

// Append to the existing system prompt string before the API call
systemPrompt += contextBlock;
```

**Important:** To call `userContextDb` from `claude.js`, you must require it at the top of `claude.js`:
```js
const userContextDb = require('./database/user-context');
```
Wait — `claude.js` is in `src/services/`, so the path is:
```js
const userContextDb = require('../database/user-context');
```

### 3C — `streamFocusMessage` already gets context via `buildFocusSystemPrompt`

`streamFocusMessage` takes a pre-built `systemPrompt` string. Since `buildFocusSystemPrompt` now injects context (Workstream 2C), no changes needed to `streamFocusMessage` itself.

---

## Workstream 4 — Frontend: `public/index.html`

### 4A — Focus Mode "Save this" chip

In `sendFocusMessage()`, after the streaming completes and `fullResponse` is finalized, detect if the response contains a duration answer worth saving. Per the spec, **start simple**: if the assistant's response appears to mention a time duration AND the user's message contained a number or time reference, show a "Save this" chip below the response.

Simple heuristic: show the chip if `fullResponse` matches `/\d+\s*(min|hour|hr|h\b|minutes|hours)/i`.

After the streaming loop in `sendFocusMessage()`, add:

```js
// Show "Save this" chip if Claude mentioned a duration
if (/\d+\s*(min|hour|hr|h\b|minutes|hours)/i.test(fullResponse) && assistantEl) {
  const chip = document.createElement('button');
  chip.textContent = 'Save this to memory ↗';
  chip.style.cssText = 'margin-top:8px;padding:3px 10px;font-size:10px;font-family:"JetBrains Mono",monospace;color:#4ade80;border:1px solid #1f2937;background:transparent;border-radius:4px;cursor:pointer;';
  chip.onclick = () => saveContextFromFocus(userMessage, fullResponse, chip);
  assistantEl.parentNode?.insertBefore(chip, assistantEl.nextSibling);
}
```

### 4B — `saveContextFromFocus(userMessage, assistantResponse, chipEl)`

```js
async function saveContextFromFocus(userMessage, assistantResponse, chipEl) {
  // Extract a key from the user's message (truncated to 60 chars)
  const key = userMessage.slice(0, 60).trim();
  // Extract the duration from the assistant's response as the value
  const match = assistantResponse.match(/(\d+[\s\-–]*(?:min(?:utes?)?|hours?|hrs?)[^.!?\n]*)/i);
  const value = match ? match[1].trim() : assistantResponse.slice(0, 80).trim();

  chipEl.disabled = true;
  chipEl.textContent = 'Saving…';

  try {
    const res = await fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        value,
        category: 'task_duration',
        source: 'focus_mode',
        source_action_id: focusActionId,
      }),
    });
    if (res.ok) {
      chipEl.textContent = 'Saved ✓';
      chipEl.style.color = '#6b7280';
      setTimeout(() => chipEl.remove(), 2000);
    } else {
      chipEl.textContent = 'Save failed';
      chipEl.disabled = false;
    }
  } catch (e) {
    chipEl.textContent = 'Save failed';
    chipEl.disabled = false;
  }
}
```

### 4C — "Memory" section in sidebar

Read `public/index.html` to find where the left sidebar renders the project list. Below the project list, add a "Memory" section:

```html
<!-- Memory section — below project list -->
<div style="padding:16px 12px 8px;">
  <button
    onclick="toggleMemoryPanel()"
    style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:6px;background:transparent;border:none;cursor:pointer;color:#6b7280;font-size:11px;font-weight:500;letter-spacing:.04em;">
    <span style="text-transform:uppercase;letter-spacing:.06em;">Memory</span>
    <span id="memory-count" style="background:#f3f4f6;border-radius:10px;padding:1px 7px;font-size:10px;color:#9ca3af;">0</span>
  </button>
</div>
```

### 4D — Memory panel (collapsible, inline below sidebar Memory button)

Add a hidden panel that slides open below the Memory button. It lists all context entries with inline edit and delete:

```html
<div id="memory-panel" style="display:none;padding:0 12px 12px;">
  <div id="memory-list" style="display:flex;flex-direction:column;gap:4px;"></div>
  <button
    onclick="showAddContextForm()"
    style="margin-top:8px;width:100%;padding:5px;font-size:10px;color:#9ca3af;border:1px dashed #e5e7eb;border-radius:6px;background:transparent;cursor:pointer;">
    + Add memory
  </button>
</div>
```

### 4E — Memory panel functions

```js
let memoryPanelOpen = false;

async function toggleMemoryPanel() {
  memoryPanelOpen = !memoryPanelOpen;
  const panel = document.getElementById('memory-panel');
  if (panel) panel.style.display = memoryPanelOpen ? 'block' : 'none';
  if (memoryPanelOpen) await loadMemoryPanel();
}

async function loadMemoryPanel() {
  try {
    const res = await fetch('/api/context');
    const data = await res.json();
    const entries = data.data || [];

    // Update count chip
    const countEl = document.getElementById('memory-count');
    if (countEl) countEl.textContent = entries.length;

    renderMemoryList(entries);
  } catch (e) {
    console.warn('Failed to load memory:', e);
  }
}

function renderMemoryList(entries) {
  const list = document.getElementById('memory-list');
  if (!list) return;

  if (entries.length === 0) {
    list.innerHTML = '<div style="font-size:10px;color:#d1d5db;padding:4px 0;">No memories yet. They\'ll be collected as you work.</div>';
    return;
  }

  list.innerHTML = entries.map(entry => `
    <div style="display:flex;align-items:flex-start;gap:6px;padding:5px 0;border-bottom:1px solid #f9fafb;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:10px;font-weight:500;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(entry.key)}</div>
        <div
          contenteditable="true"
          onblur="saveContextEdit(${entry.id}, this.textContent, '${escHtml(entry.category || '')}')"
          style="font-size:10px;color:#6b7280;outline:none;cursor:text;"
        >${escHtml(entry.value)}</div>
      </div>
      <button
        onclick="deleteContextEntry(${entry.id})"
        style="flex-shrink:0;background:transparent;border:none;color:#d1d5db;font-size:12px;cursor:pointer;padding:0 2px;line-height:1;"
        title="Delete">×</button>
    </div>
  `).join('');
}

async function saveContextEdit(id, newValue, category) {
  const value = newValue.trim();
  if (!value) return;
  try {
    await fetch(`/api/context/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, category }),
    });
  } catch (e) {
    console.warn('Failed to save context edit:', e);
  }
}

async function deleteContextEntry(id) {
  if (!confirm('Remove this memory?')) return;
  try {
    await fetch(`/api/context/${id}`, { method: 'DELETE' });
    await loadMemoryPanel();
  } catch (e) {
    console.warn('Failed to delete context entry:', e);
  }
}

function showAddContextForm() {
  const list = document.getElementById('memory-list');
  if (!list) return;
  // Insert a simple inline form at top of list
  const form = document.createElement('div');
  form.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:6px 0;border-bottom:1px solid #f3f4f6;margin-bottom:4px;';
  form.innerHTML = `
    <input id="new-ctx-key" placeholder="What (e.g. 150 dials)"
      style="font-size:10px;border:1px solid #e5e7eb;border-radius:4px;padding:3px 6px;outline:none;" />
    <input id="new-ctx-val" placeholder="Duration or note (e.g. 6 hours)"
      style="font-size:10px;border:1px solid #e5e7eb;border-radius:4px;padding:3px 6px;outline:none;" />
    <div style="display:flex;gap:4px;">
      <button onclick="submitAddContext()" style="flex:1;font-size:10px;padding:3px;background:#111827;color:#fff;border:none;border-radius:4px;cursor:pointer;">Save</button>
      <button onclick="this.closest('div[style]').remove()" style="font-size:10px;padding:3px 8px;background:transparent;border:1px solid #e5e7eb;border-radius:4px;cursor:pointer;color:#9ca3af;">Cancel</button>
    </div>
  `;
  list.insertBefore(form, list.firstChild);
  document.getElementById('new-ctx-key')?.focus();
}

async function submitAddContext() {
  const key = document.getElementById('new-ctx-key')?.value.trim();
  const value = document.getElementById('new-ctx-val')?.value.trim();
  if (!key || !value) return;
  try {
    await fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, category: 'task_duration', source: 'manual' }),
    });
    await loadMemoryPanel();
  } catch (e) {
    console.warn('Failed to add context:', e);
  }
}
```

### 4F — Initialize memory count on page load

In the existing `loadData()` function (or wherever data is initialized on page load), add a call to update the memory count badge in the sidebar:

```js
// Fetch memory count for sidebar chip
fetch('/api/context')
  .then(r => r.json())
  .then(data => {
    const el = document.getElementById('memory-count');
    if (el) el.textContent = (data.data || []).length;
  })
  .catch(() => {});
```

---

## Key Constraints

- **`escHtml`** (not `escapeHtml`) — use the correct helper name from Phase 2.1.
- **`sendMessage()` parameter is additive** — the 4th `contextSnapshot` parameter defaults to `''`, so all existing callers (`/api/chat` route) work without changes.
- **Do not change `sendWithTools` signature** — context injection is internal, using `userContextDb` directly inside the function.
- **"Save this" chip uses a simple regex heuristic** — do not over-engineer auto-detection. Manual "Add memory" in the panel is the primary path.
- **Memory panel is a sidebar accordion** — not a new page, not a modal.
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, `src/integrations/`, `src/utils/crypto.js`, `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`, `src/database/triage.js`, `src/database/inbox.js`.

---

## Files You Will Touch

| File | What changes |
|---|---|
| `src/database/user-context.js` | New file — create from scratch |
| `src/routes/api.js` | Require + init, 4 CRUD routes, update `buildFocusSystemPrompt` |
| `src/services/claude.js` | Require user-context module, inject snapshot into `sendMessage` and `sendWithTools` |
| `public/index.html` | "Save this" chip in `sendFocusMessage`, `saveContextFromFocus`, Memory sidebar section + all panel functions, count init in `loadData` |

Four files. Nothing else.

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 2.2 - User Context Memory.md` as you finish each workstream. Log your session date and any decisions in the Build Log table. When the full checklist is done, flag for PM review.
