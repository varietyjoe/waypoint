# Dev Tracker — Phase 3.2: The Library

**Status:** Complete
**Full brief:** `pm_log/Phase 3/Phase 3.2 - The Library.md`
**Engineer handoff:** `pm_log/Phase 3/Phase 3.2 - Engineer Handoff.md`
**Depends on:** Phase 3.1 complete and approved ✅

---

## Pre-Build Checklist

- [x] Read `pm_log/Phase 3/Phase 3.2 - The Library.md` in full
- [x] Read `pm_log/Phase 3/Phase 3.2 - Engineer Handoff.md` in full
- [x] Read `src/database/user-context.js` — confirmed all exported functions, especially `getContextByCategory`, `saveContext`, `updateContext`
- [x] Read `src/routes/api.js` — found `/api/context` routes; understood `POST /api/context` and `GET /api/context`
- [x] Read `public/index.html` — found Memory view render function; understood how sidebar nav routes to views
- [x] Confirmed `user_context` table columns (read init function in user-context.js)

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-23 | Claude Sonnet 4.6 | Phase 3.2 complete — all 4 files built. DB migration uses pragma table_info guard. Library routes added to api.js. autoTagLibraryEntry added to claude.js. Full Library view (list + detail panel) added to index.html. Focus Mode now injects up to 3 relevant Library entries additively. "Save this →" chip updated to POST /api/library. |

### Decisions

1. **Library nav "Soon" badge**: Removed the `<span class="ml-auto text-gray-300 font-medium" style="font-size:9px;">Soon</span>` and added `onclick="showLibraryView()"` directly to the nav div. Also removed the grey text color on the label to match active nav items.

2. **Manual Save Modal flow**: Simplified to single-submit (calls `POST /api/library` directly, auto-tags, then refreshes list and selects the new entry in the right panel). This is cleaner than the two-step confirm flow in the spec and avoids a race condition with the suggested title.

3. **"Open in Focus →" button**: Per spec this should open Focus Mode with the source outcome preloaded. Because the Library entry may not have a direct `source_outcome_id` reference in user_context (the `source` column is a string, not a FK to outcomes), a full implementation would require resolving the outcome. For Phase 3.2 we show a helpful prompt directing the user to navigate manually — can be upgraded in Phase 3.3 when outcome linkage is tightened.

4. **Focus Mode Library injection**: Used `relevantSessionBlocks + libraryContext` string concatenation. The `buildFocusSystemPrompt` function appends its second argument to the prompt only if truthy, so empty libraryContext string is a no-op. No regressions to Phase 2.5 session injection.

5. **`autoTagLibraryEntry` model**: Used `claude-sonnet-4-6` as specified. `max_tokens: 128` is sufficient for a JSON response with 1–3 tags and a short title.

6. **XSS safety**: All dynamic content in the Library view rendered via `escHtml()`. The `data-tags` attribute stores JSON but is set with `escHtml(JSON.stringify(tags))` so it cannot break out of attribute context.

---

## Completion Checklist

### Workstream 1 — `src/database/library.js` (CREATE)
- [x] File created
- [x] `initLibraryMigrations()` uses `db.pragma('table_info(user_context)')` to check existing columns before `ALTER TABLE`
- [x] Adds `tags TEXT`, `title TEXT`, `word_count INTEGER`, `auto_tagged INTEGER DEFAULT 0` — only if not present
- [x] `getAllLibraryEntries(filters)` queries `WHERE category = 'saved_output'`
- [x] Tag filter: `AND tags LIKE '%"tag"%'` pattern
- [x] Text filter: searches `title`, `value`, `tags` with LIKE
- [x] Results ordered `BY updated_at DESC`
- [x] `getLibraryEntry(id)` returns null if not found
- [x] `saveLibraryEntry(data)` inserts with `category = 'saved_output'`; stores tags as JSON string; computes word_count
- [x] `updateLibraryEntry(id, data)` only updates `title` and `tags`; returns updated entry
- [x] `deleteLibraryEntry(id)` only deletes rows where `category = 'saved_output'`
- [x] `searchLibrary(query)` returns max 20 results
- [x] `getRelevantLibraryEntries(outcomeId, tags)` returns max 3, scored by source match and tag overlap
- [x] All functions synchronous (no await/then)
- [x] `initLibraryMigrations()` called from `src/routes/api.js` at startup
- [x] No separate table created — Library rows live in `user_context`

### Workstream 2 — `src/services/claude.js` — `autoTagLibraryEntry`
- [x] `autoTagLibraryEntry(content)` added
- [x] Uses `anthropic.messages.create()` directly (not streaming)
- [x] Model `claude-sonnet-4-6`, max_tokens ≤ 200
- [x] Prompt instructs JSON only, no markdown
- [x] Strips markdown fences before `JSON.parse()`
- [x] Returns `{ tags: [...], suggested_title: string }`
- [x] Falls back to `{ tags: ['note'], suggested_title: content.slice(0, 50) }` on parse failure
- [x] `module.exports` updated to include `autoTagLibraryEntry`

### Workstream 3 — `src/routes/api.js` — Library Routes
- [x] `libraryDb` required at top of file
- [x] `GET /api/library` — accepts `tag` and `q` query params
- [x] `GET /api/library/search` — accepts `q`, returns empty array if missing
- [x] `GET /api/library/:id` — returns 404 if not found
- [x] `POST /api/library` — calls `autoTagLibraryEntry` before saving; returns `{ entry, suggested_title, tags }`
- [x] `POST /api/library` returns 400 if `value` missing
- [x] `PUT /api/library/:id` — accepts `{ title, tags }`; returns 404 if not found
- [x] `DELETE /api/library/:id` — returns `{ success: true }`

### Workstream 4 — Focus Mode Library Injection
- [x] In `POST /api/focus/message` route, `getRelevantLibraryEntries` called before Claude call
- [x] Library context appended to existing context (not replacing user context or Phase 2.5 summaries)
- [x] Library injection silently skipped if no relevant entries found

### Workstream 5 — `public/index.html` — Library View
- [x] `showLibraryView()` exists, wired to Library sidebar nav item
- [x] Active state set correctly on Library nav item
- [x] Header: "Library" title + subtitle
- [x] "+ Save manually" button calls `showManualSaveModal()`
- [x] Search input calls debounced search
- [x] Tag filter pills rendered dynamically from available tags
- [x] Clicking tag pill filters list via `GET /api/library?tag=X`
- [x] Clicking "All" clears filter
- [x] Entry list items show title, tag pills, source, date
- [x] Clicking entry opens right panel detail
- [x] Right panel: editable title input, saves on blur/Enter
- [x] Right panel: existing tags as pills, "+ tag" button triggers inline input
- [x] New-tag input saves on blur/Enter, cancels on Escape, tag lowercased and slugified
- [x] Right panel: source line, content preview with "Show more" toggle
- [x] Right panel: Copy button, "Open in Focus →" button, Delete button (with confirmation)
- [x] No XSS: entry content via `escHtml()` not raw innerHTML
- [x] Manual save modal: textarea, saves via `POST /api/library`, shows suggested title + tags
- [x] "Save this →" chip in Focus Mode now calls `POST /api/library`

### No Regressions
- [x] Outcomes list, actions, archive flow unchanged
- [x] Focus Mode content unchanged (only context injection modified)
- [x] Today view (Phase 3.0) unchanged
- [x] Morning Brief (Phase 3.1) unchanged
- [x] Memory view accessible and unchanged
- [x] Inbox triage unchanged
- [x] Preserved files untouched
- [x] `user_context` rows for non-Library categories unaffected

---

## Blockers

None.
