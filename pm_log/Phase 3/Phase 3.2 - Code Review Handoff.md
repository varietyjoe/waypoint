# Phase 3.2 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 3.2 just completed — it ships The Library: a searchable, tagged repository of saved work outputs, with a full-width list view, right-panel detail, inline tag editing, and Focus Mode context injection. Read `pm_log/Phase 3/Phase 3.2 - Engineer Handoff.md` in full, then verify every checklist item against the actual codebase. End with a clear verdict: approved for Phase 3.3, or blocked with specifics. Log results to `test_tracker/Phase 3.2 - The Library.md`.

---

**Read these files before reviewing:**
1. `pm_log/Phase 3/Phase 3.2 - The Library.md` — full phase spec
2. `pm_log/Phase 3/Phase 3.2 - Engineer Handoff.md` — detailed implementation spec
3. `dev_tracker/Phase 3.2 - The Library.md` — working checklist; verify each item complete

---

## What Was Built

Phase 3.2 adds one new file and modifies three:
- `src/database/library.js` — DB migration (adds 4 columns to `user_context`) + full CRUD for Library entries
- `src/services/claude.js` — `autoTagLibraryEntry` Claude function
- `src/routes/api.js` — 6 Library routes + Focus Mode injection update
- `public/index.html` — Library view (list + right panel), inline "+ tag" button, manual save modal

---

## Review Checklist

### `src/database/library.js`

- [ ] File exists and exports `initLibraryMigrations`, `getAllLibraryEntries`, `getLibraryEntry`, `saveLibraryEntry`, `updateLibraryEntry`, `deleteLibraryEntry`, `searchLibrary`, `getRelevantLibraryEntries`
- [ ] `initLibraryMigrations()` uses `db.pragma('table_info(user_context)')` to check existing columns before `ALTER TABLE`
- [ ] Adds `tags TEXT`, `title TEXT`, `word_count INTEGER`, `auto_tagged INTEGER DEFAULT 0` columns — only if not present (no double-migration crash)
- [ ] `getAllLibraryEntries(filters)` queries `WHERE category = 'saved_output'`
- [ ] Tag filter: `AND tags LIKE '%"tag"%'` pattern (JSON array substring match)
- [ ] Text filter: searches `title`, `value`, and `tags` columns with `LIKE`
- [ ] Results ordered `BY updated_at DESC`
- [ ] `getLibraryEntry(id)` returns `null` if not found (not an exception)
- [ ] `saveLibraryEntry(data)` inserts with `category = 'saved_output'`; stores `tags` as JSON string; computes `word_count` if not provided
- [ ] `updateLibraryEntry(id, data)` only updates `title` and `tags`; returns the updated entry
- [ ] `deleteLibraryEntry(id)` only deletes rows where `category = 'saved_output'` (cannot delete non-library entries)
- [ ] `searchLibrary(query)` returns max 20 results
- [ ] `getRelevantLibraryEntries(outcomeId, tags)` returns max 3 results, scored by source match and tag overlap
- [ ] All functions use synchronous `better-sqlite3` (no `await`, no `.then()`)
- [ ] `initLibraryMigrations()` is called from `src/routes/api.js` at startup
- [ ] No separate table created — Library rows live in `user_context`

---

### `src/services/claude.js` — `autoTagLibraryEntry`

- [ ] `autoTagLibraryEntry(content)` is present and exported
- [ ] Uses `anthropic.messages.create()` directly (not streaming)
- [ ] Model is `claude-sonnet-4-6`
- [ ] `max_tokens` is small (≤ 200)
- [ ] Prompt instructs Claude to return JSON only, no markdown
- [ ] Strips markdown fences from response before `JSON.parse()` (`replace(/^```(?:json)?\n?/, '')`)
- [ ] Returns `{ tags: [...], suggested_title: string }`
- [ ] Falls back gracefully on parse failure: returns `{ tags: ['note'], suggested_title: content.slice(0, 50) }`
- [ ] `module.exports` updated to include `autoTagLibraryEntry`
- [ ] All existing exports unchanged

---

### `src/routes/api.js` — Library Routes

- [ ] `libraryDb` properly required at top of file
- [ ] `GET /api/library` — accepts `tag` and `q` query params, returns `{ success: true, count: N, data: [...] }`
- [ ] `GET /api/library/search` — accepts `q`, returns empty array if `q` missing
- [ ] `GET /api/library/:id` — returns `404` if entry not found
- [ ] `POST /api/library` — calls `autoTagLibraryEntry` before saving; returns `{ success: true, data: { entry, suggested_title, tags } }`
- [ ] `POST /api/library` returns `400` if `value` is missing
- [ ] `PUT /api/library/:id` — accepts `{ title, tags }`; returns `404` if not found
- [ ] `DELETE /api/library/:id` — returns `{ success: true }` (no body required)
- [ ] No existing routes modified

---

### `src/routes/api.js` — Focus Mode Library Injection

- [ ] In the `POST /api/focus/message` route (or wherever `streamFocusMessage` is called), `getRelevantLibraryEntries` is called before the Claude call
- [ ] Library context is appended to existing context — it does not replace user context snapshot or Phase 2.5 session summaries
- [ ] Library injection is silently skipped if no relevant entries found (no empty section appended)
- [ ] Injection format: `'\n\nRelevant past work from your Library:\n[title]:\n[content]'`

---

### `public/index.html` — Library View

**Navigation:**
- [ ] `showLibraryView()` function exists and is wired to the Library sidebar nav item (from Phase 3.0)
- [ ] Setting active state on Library nav item removes active from other nav items

**Center list panel:**
- [ ] Header: "Library" title + "Your saved work, outputs, and artifacts" subtitle
- [ ] "+ Save manually" button present and calls `showManualSaveModal()`
- [ ] Search input calls debounced search (`oninput` or `debounceLibrarySearch`)
- [ ] Tag filter pills rendered dynamically from available tags in entries
- [ ] Clicking a tag pill filters the list via `GET /api/library?tag=X`
- [ ] Clicking "All" or active tag clears the filter
- [ ] Entry list items show title (or key fallback), tag pills, source, and date
- [ ] Clicking an entry selects it and opens the right panel detail

**Right detail panel:**
- [ ] Editable title input pre-filled with entry title; saves on blur or Enter
- [ ] Existing tags rendered as pills
- [ ] "+ tag" button triggers inline new-tag input (not a modal)
- [ ] New-tag input saves on blur/Enter, cancels on Escape; tag lowercased and slugified
- [ ] Source line shows outcome context and date
- [ ] Content preview truncated at ~200 chars with "Show more" toggle
- [ ] Copy button copies entry content to clipboard
- [ ] "Open in Focus →" button opens Focus Mode with the relevant outcome
- [ ] Delete button (red) shows confirmation before calling `DELETE /api/library/:id`
- [ ] No XSS: entry content rendered via `escHtml()` (not raw `innerHTML`)

**Manual save modal:**
- [ ] Modal has textarea for pasting content
- [ ] On save: calls `POST /api/library`, shows suggested title + tags
- [ ] User can edit before confirming (or immediately saves — either is acceptable for v1)

**"Save this →" chip (Phase 2.5 integration):**
- [ ] "Save this →" chip in Focus Mode now calls `POST /api/library` (not the old `POST /api/context` saved_output path)

---

### No Regressions

- [ ] Outcomes list, actions, archive flow all work as before
- [ ] Focus Mode content unchanged (only context injection modified)
- [ ] Today view (Phase 3.0) unchanged
- [ ] Morning Brief (Phase 3.1) unchanged
- [ ] Memory view (Phase 2.2) accessible and unchanged — Library is a separate view
- [ ] Inbox triage unchanged
- [ ] Preserved files (`slack.js`, `grain.js`, all integrations, `triage.js`, `oauth-tokens.js`) untouched
- [ ] `user_context` table rows for non-Library categories (e.g., `category = 'user_note'`) are unaffected

---

## What's Out of Scope for This Phase

- Full-text search using SQLite FTS (LIKE-based is acceptable)
- Automatic extraction of content from sessions without explicit "Save this →" click
- Tagging taxonomy expansion (8 tags defined in handoff; PM to expand later)
- Library entries from non-Focus sources

---

## When You're Done

Log results to `test_tracker/Phase 3.2 - The Library.md`. Verdict: **approved for Phase 3.3** or blocked with specifics.
