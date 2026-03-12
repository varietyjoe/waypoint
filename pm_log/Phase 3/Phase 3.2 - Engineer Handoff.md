# Phase 3.2 — Engineer Handoff

## Agent Prompt

You are building Phase 3.2 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase ships The Library — a searchable, tagged repository of all saved outputs from Focus Mode, with a full-width list view and a right-panel entry detail. It also upgrades Focus Mode to retrieve relevant Library entries as context. Read `pm_log/Phase 3/Phase 3.2 - Engineer Handoff.md` in full before writing any code, then use `dev_tracker/Phase 3.2 - The Library.md` as your working checklist. Mark items complete as you finish them.

---

You are building Phase 3.2 of Waypoint — a single-user personal execution OS at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 3/Phase 3.2 - The Library.md` — full phase spec
2. `dev_tracker/Phase 3.2 - The Library.md` — your working checklist
3. `src/database/user-context.js` — understand the `user_context` table schema; Library extends this table
4. `src/routes/api.js` — understand how `/api/context` routes work; you'll add `/api/library` routes
5. `src/services/claude.js` — understand `streamFocusMessage`; you'll modify it to inject Library context
6. `public/index.html` — find the Memory view rendering (Phase 2.2); Library is a new sidebar-nav destination
7. `public/waypoint-vision.html` Screen 10 — reference for exact Library visual design

**Prerequisites:** Phase 2.5 complete and approved. ✅

---

## Known Codebase State

- **`user_context` table columns (Phase 2.2):** `id`, `key`, `value`, `category`, `source`, `created_at`, `updated_at`
- **Saved outputs from Phase 2.5:** Already stored in `user_context` with `category = 'saved_output'`. The Library is built on top of these rows.
- **Phase 3.2 adds 4 columns to `user_context`:** `tags TEXT`, `title TEXT`, `word_count INTEGER`, `auto_tagged INTEGER DEFAULT 0`
- **`streamFocusMessage`** in `claude.js` already accepts a system prompt. Library injection adds to that system prompt.
- **Model ID:** `claude-sonnet-4-6`
- **`escHtml`** (not `escapeHtml`) is the XSS-safe helper in `public/index.html`.

---

## Pre-Build Checklist

- [ ] Read `src/database/user-context.js` — confirm all exported functions, especially `getContextByCategory`, `saveContext`, `updateContext`
- [ ] Read `src/routes/api.js` — find the `/api/context` routes; understand `POST /api/context` and `GET /api/context`
- [ ] Read `public/index.html` — find the Memory view render function; understand how the sidebar nav (Phase 3.0) routes to views
- [ ] Confirm `user_context` table columns are as expected (run `.schema user_context` or read the init function)

---

## Workstream 1 — DB Migration (`src/database/library.js`)

Create `src/database/library.js`:

```js
const db = require('./index');

function initLibraryMigrations() {
  // Add columns to user_context if not present
  const columns = db.pragma('table_info(user_context)').map(c => c.name);

  if (!columns.includes('tags')) {
    db.exec('ALTER TABLE user_context ADD COLUMN tags TEXT');
  }
  if (!columns.includes('title')) {
    db.exec('ALTER TABLE user_context ADD COLUMN title TEXT');
  }
  if (!columns.includes('word_count')) {
    db.exec('ALTER TABLE user_context ADD COLUMN word_count INTEGER');
  }
  if (!columns.includes('auto_tagged')) {
    db.exec('ALTER TABLE user_context ADD COLUMN auto_tagged INTEGER DEFAULT 0');
  }
}

function getAllLibraryEntries(filters = {}) {
  let query = `SELECT * FROM user_context WHERE category = 'saved_output'`;
  const params = [];

  if (filters.tag) {
    query += ` AND tags LIKE ?`;
    params.push(`%"${filters.tag}"%`);
  }

  if (filters.q) {
    query += ` AND (title LIKE ? OR value LIKE ? OR tags LIKE ?)`;
    const term = `%${filters.q}%`;
    params.push(term, term, term);
  }

  query += ` ORDER BY updated_at DESC`;
  return db.prepare(query).all(...params);
}

function getLibraryEntry(id) {
  return db.prepare(`SELECT * FROM user_context WHERE id = ? AND category = 'saved_output'`).get(id) || null;
}

function saveLibraryEntry(data) {
  // data: { key, value, title, tags (array), word_count, source }
  const tagsJson = JSON.stringify(data.tags || []);
  const wordCount = data.word_count || (data.value || '').trim().split(/\s+/).length;

  db.prepare(`
    INSERT INTO user_context (key, value, category, source, title, tags, word_count, auto_tagged, created_at, updated_at)
    VALUES (?, ?, 'saved_output', ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `).run(data.key || data.title || 'Saved output', data.value, data.source || 'library', data.title || null, tagsJson, wordCount);

  return db.prepare(`SELECT * FROM user_context WHERE rowid = last_insert_rowid()`).get();
}

function updateLibraryEntry(id, data) {
  const existing = getLibraryEntry(id);
  if (!existing) return null;

  const title = data.title !== undefined ? data.title : existing.title;
  const tags = data.tags !== undefined ? JSON.stringify(data.tags) : existing.tags;

  db.prepare(`
    UPDATE user_context SET title = ?, tags = ?, updated_at = datetime('now')
    WHERE id = ? AND category = 'saved_output'
  `).run(title, tags, id);

  return getLibraryEntry(id);
}

function deleteLibraryEntry(id) {
  db.prepare(`DELETE FROM user_context WHERE id = ? AND category = 'saved_output'`).run(id);
}

function searchLibrary(query) {
  const term = `%${query}%`;
  return db.prepare(`
    SELECT * FROM user_context
    WHERE category = 'saved_output'
    AND (title LIKE ? OR value LIKE ? OR tags LIKE ?)
    ORDER BY updated_at DESC
    LIMIT 20
  `).all(term, term, term);
}

function getRelevantLibraryEntries(outcomeId, tags = []) {
  // For Focus Mode injection: find entries related to this outcome or matching tags
  let entries = db.prepare(`
    SELECT * FROM user_context
    WHERE category = 'saved_output'
    ORDER BY updated_at DESC
    LIMIT 10
  `).all();

  // Score by tag overlap + source outcome match
  const scored = entries.map(e => {
    let score = 0;
    const entryTags = JSON.parse(e.tags || '[]');
    if (e.source && e.source.includes(String(outcomeId))) score += 10;
    for (const t of tags) {
      if (entryTags.includes(t)) score += 3;
    }
    return { ...e, _score: score };
  });

  return scored
    .sort((a, b) => b._score - a._score)
    .slice(0, 3);
}

module.exports = {
  initLibraryMigrations,
  getAllLibraryEntries,
  getLibraryEntry,
  saveLibraryEntry,
  updateLibraryEntry,
  deleteLibraryEntry,
  searchLibrary,
  getRelevantLibraryEntries,
};
```

Call `initLibraryMigrations()` from `src/routes/api.js` at startup.

---

## Workstream 2 — Auto-Tagging Claude Function (`src/services/claude.js`)

Add `autoTagLibraryEntry(content)`:

```js
async function autoTagLibraryEntry(content) {
  const tags = [
    'campaign_draft', 'pitch_deck', 'email', 'strategy',
    'outreach', 'analysis', 'plan', 'note'
  ];

  const prompt = `You are tagging a saved work output. Assign 1–3 tags from this list: ${tags.join(', ')}.
Also suggest a short display title (5–8 words max).

Content:
${content.slice(0, 800)}

Return valid JSON only, no markdown:
{ "tags": ["tag1", "tag2"], "suggested_title": "string" }`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 128,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '';
  const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try {
    return JSON.parse(json);
  } catch {
    return { tags: ['note'], suggested_title: content.slice(0, 50).trim() };
  }
}
```

Update `module.exports` to include `autoTagLibraryEntry`.

---

## Workstream 3 — API Routes (`src/routes/api.js`)

Add a "Library" section:

```js
const libraryDb = require('../database/library');

// GET /api/library — all entries with optional filters
router.get('/library', (req, res, next) => {
  try {
    const { tag, q } = req.query;
    const entries = libraryDb.getAllLibraryEntries({ tag, q });
    res.json({ success: true, count: entries.length, data: entries });
  } catch (err) { next(err); }
});

// GET /api/library/search — full-text search
router.get('/library/search', (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, data: [] });
    const results = libraryDb.searchLibrary(q);
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

// GET /api/library/:id — single entry
router.get('/library/:id', (req, res, next) => {
  try {
    const entry = libraryDb.getLibraryEntry(Number(req.params.id));
    if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: entry });
  } catch (err) { next(err); }
});

// POST /api/library — save new entry (auto-tags via Claude)
router.post('/library', async (req, res, next) => {
  try {
    const { value, source } = req.body;
    if (!value) return res.status(400).json({ success: false, error: 'value required' });

    const { tags, suggested_title } = await claudeService.autoTagLibraryEntry(value);
    const entry = libraryDb.saveLibraryEntry({
      key: suggested_title || value.slice(0, 60),
      value,
      title: suggested_title,
      tags,
      source: source || 'manual',
    });
    res.json({ success: true, data: { entry, suggested_title, tags } });
  } catch (err) { next(err); }
});

// PUT /api/library/:id — update title or tags
router.put('/library/:id', (req, res, next) => {
  try {
    const { title, tags } = req.body;
    const entry = libraryDb.updateLibraryEntry(Number(req.params.id), { title, tags });
    if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: entry });
  } catch (err) { next(err); }
});

// DELETE /api/library/:id
router.delete('/library/:id', (req, res, next) => {
  try {
    libraryDb.deleteLibraryEntry(Number(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});
```

---

## Workstream 4 — Focus Mode Library Injection (`src/services/claude.js`)

Modify `streamFocusMessage` to accept and inject relevant Library entries. The function already takes a system prompt or context — extend it:

In the route that calls `streamFocusMessage` (in `api.js`, the `/api/focus/message` route), before calling the function, fetch relevant Library entries:

```js
// In POST /api/focus/message route (existing):
const outcomeId = req.body.outcome_id;
const relevantEntries = libraryDb.getRelevantLibraryEntries(outcomeId || 0, []);

let libraryContext = '';
if (relevantEntries.length > 0) {
  libraryContext = '\n\nRelevant past work from your Library:\n' +
    relevantEntries.map(e => `[${e.title || e.key}]:\n${e.value}`).join('\n\n---\n\n');
}

// Append libraryContext to the existing context/system prompt before calling streamFocusMessage
```

The injection is additive — it appends to whatever context already exists (user context snapshot, past session summary from Phase 2.5). Do not replace the existing context injection.

---

## Workstream 5 — Frontend: Library View (`public/index.html`)

### 5A — `showLibraryView()` Navigation

Wire the Library sidebar nav item (added in Phase 3.0) to a `showLibraryView()` function. Set the active state.

### 5B — Library View Layout

The Library view has a center list panel and a right detail panel (same three-column layout as the main Dashboard).

**Center panel:**

```html
<div style="padding:24px;">

  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
    <div>
      <div style="font-size:15px;font-weight:600;color:#111827;">Library</div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px;">Your saved work, outputs, and artifacts</div>
    </div>
    <button onclick="showManualSaveModal()"
      style="display:flex;align-items:center;gap:6px;border:1px solid #e5e7eb;background:transparent;padding:6px 12px;border-radius:10px;font-size:11px;font-weight:500;cursor:pointer;">
      + Save manually
    </button>
  </div>

  <!-- Search -->
  <div style="position:relative;margin-bottom:16px;">
    <input id="library-search" type="text" placeholder="Search your saved work…" oninput="debounceLibrarySearch(this.value)"
      style="width:100%;padding:10px 12px 10px 36px;border:1px solid #e5e7eb;border-radius:10px;font-size:12px;outline:none;" />
    <!-- search icon svg -->
  </div>

  <!-- Tag filters -->
  <div id="library-tag-filters" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;">
    <!-- rendered dynamically from available tags -->
  </div>

  <!-- Entry list -->
  <div id="library-entry-list" style="display:flex;flex-direction:column;gap:8px;">
    <!-- rendered dynamically -->
  </div>

</div>
```

**Right detail panel:**
When an entry is selected, the right panel shows:
- Editable title (inline `<input>`)
- Tags as pills + "**+ tag**" button (inline button, not a modal — clicking appends a new `<input>` tag pill that saves on blur/Enter)
- Source line (outcome + date)
- Content preview with "Show more" toggle (collapse > ~200 chars)
- Copy button
- "Open in Focus →" button (opens Focus Mode with that outcome)
- Delete button (red text, below CTAs)

### 5C — Tag Filter Interaction

- Clicking a tag filter pill sets it as active (dark background)
- Active tag filters the entry list via `GET /api/library?tag=X`
- Clicking "All" clears the filter

### 5D — Inline "+ tag" Button

```js
function addTagToEntry(entryId, entryTagsEl) {
  // Append a new input pill inline after existing tags
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'new tag';
  input.style.cssText = 'border:1px dashed #d1d5db;border-radius:20px;padding:2px 8px;font-size:10px;outline:none;width:80px;';

  const saveTag = async () => {
    const tag = input.value.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '_');
    if (!tag) { input.remove(); return; }

    // Read current tags from data attr or re-fetch entry
    const current = JSON.parse(input.closest('[data-tags]')?.dataset.tags || '[]');
    const updated = [...new Set([...current, tag])];

    await fetch(`/api/library/${entryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: updated }),
    });
    renderLibraryDetail(await (await fetch(`/api/library/${entryId}`)).json().then(d => d.data));
  };

  input.addEventListener('blur', saveTag);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') saveTag(); if (e.key === 'Escape') input.remove(); });
  entryTagsEl.appendChild(input);
  input.focus();
}
```

### 5E — Manual Save Modal

Simple modal: textarea for pasting content → "Save" → calls `POST /api/library` → shows suggested title + tags → user confirms or edits → saved.

### 5F — "Save this →" Chip (Phase 2.5 integration)

Phase 2.5 already has a "Save this →" chip in Focus Mode. Update its handler to call `POST /api/library` instead of the old `POST /api/context` saved_output path. The Library route will auto-tag it. If Phase 2.5 already calls a `/api/context` route with `category: 'saved_output'`, redirect that to `POST /api/library` — or add a migration path that tags existing saved_output entries.

---

## Key Constraints

- **Always require explicit save** — never auto-extract content from sessions without user clicking "Save this →"
- **Library is built on `user_context` table** — do not create a separate table; extend via migration
- **Tags are stored as JSON array string** in the `tags` column (e.g., `'["email","campaign_draft"]'`)
- **Focus Mode injection is additive** — do not remove or replace existing context injections (user context snapshot, session summaries from Phase 2.5)
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, integrations, preserved files

---

## Files You Will Touch

| File | What changes |
|---|---|
| `src/database/library.js` | **CREATE** — migration + CRUD for Library entries |
| `src/services/claude.js` | Add `autoTagLibraryEntry`, update Focus Mode injection |
| `src/routes/api.js` | Add Library routes, update Focus Mode route for Library injection |
| `public/index.html` | Library view (list + right panel), inline "+ tag" button, manual save modal |

Four files (+ wiring Library nav item from Phase 3.0 sidebar).

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 3.2 - The Library.md`. Log decisions. Flag for PM review.
