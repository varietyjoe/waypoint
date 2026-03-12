# Phase 3.2 — The Library

**Goal:** Everything you build with Claude in Focus Mode becomes findable, reusable, and permanent. Your best thinking compounds instead of evaporating.

**Status:** Not Started
**Depends on:** Phase 2.5 complete (focus sessions stored, "Save this →" chip exists)

---

## The Problem

Right now Focus Mode sessions are stored (Phase 2.1) and recent ones are surfaced in the next relevant session (Phase 2.5). But there's no way to search across all your past work, no way to see everything you've built in a given domain, and no way for Claude to systematically find the best previous version of something.

You've solved this problem for email before. You built a pitch framework for Henderson. You wrote a great opening for a deck last month. That work exists in session storage — but it's effectively invisible.

The Library makes it visible.

---

## The Difference Between Library and Context Memory

These are architecturally separate and do different jobs:

| | Context Memory (Phase 2.2) | The Library (Phase 3.2) |
|---|---|---|
| Stores | Facts about how you work | Full work product outputs |
| Example | "150 dials = 6 hours" | Full email campaign draft, v2 |
| Size | Short strings | Paragraphs to full documents |
| Retrieval | Injected into every Claude call | Surfaced on demand or in Focus context |
| Purpose | Inform estimates + behavior | Reuse and iterate on past work |

The Library feeds Pattern Memory (Phase 3.3). It's the corpus that makes pattern analysis meaningful.

---

## What This Phase Delivers

By the end of 3.2:
- All "Save this →" outputs from Focus Mode (Phase 2.5) are indexed in the Library
- New Library view in the app: searchable, filterable by outcome / project / tag
- Claude automatically tags saved outputs by type on save
- When Focus Mode opens, Claude searches the Library for relevant past work and surfaces it
- You can browse your Library, open any saved output, and reference or copy it

---

## Scope

### DB: Library Entries

The Library is built on top of the existing `user_context` table entries with `category = 'saved_output'` (Phase 2.5). In Phase 3.2, we extend this with better structure:

```sql
-- Extend user_context table (or create a dedicated table if engineer prefers separation)
-- If extending user_context, add these columns via migration:
ALTER TABLE user_context ADD COLUMN tags TEXT;          -- JSON array: ['campaign_draft', 'email', 'pitch']
ALTER TABLE user_context ADD COLUMN title TEXT;         -- user-editable display name
ALTER TABLE user_context ADD COLUMN word_count INTEGER; -- for display
ALTER TABLE user_context ADD COLUMN auto_tagged INTEGER DEFAULT 0; -- 1 if Claude tagged it
```

**Tag taxonomy (Claude assigns on save):**

| Tag | Description |
|---|---|
| `campaign_draft` | Email or ad campaign copy |
| `pitch_deck` | Pitch or presentation content |
| `email` | Standalone email copy |
| `strategy` | Strategic frameworks, thinking, decisions |
| `outreach` | Sales or prospecting messages |
| `analysis` | Data interpretation, trend analysis |
| `plan` | Project or outcome plans |
| `note` | General notes or thinking |

Tags are not exclusive — an output can have multiple tags.

### Auto-Tagging on Save

When user clicks "Save this →" in Focus Mode (Phase 2.5 chip):
1. Content is sent to `POST /api/library` with the raw text
2. Server calls Claude with a tagging prompt: "Given this content, assign 1-3 tags from this taxonomy: [list]. Return JSON: { tags: [], suggested_title: '' }"
3. Tags and suggested title stored with the entry
4. User sees the suggested title in the save confirmation popover — can edit before confirming

This replaces the Phase 2.5 behavior of auto-generating the title from the first 8 words. Smarter tagging from the start.

### API Routes

```
GET    /api/library                  — all entries, supports ?tag=X&project_id=Y&q=search_term
GET    /api/library/:id              — single entry with full content
POST   /api/library                  — save new entry (auto-tags on server)
PUT    /api/library/:id              — update title or tags
DELETE /api/library/:id              — remove entry
GET    /api/library/search?q=X       — full-text search across key + value + tags
```

New DB module: `src/database/library.js`
- `initLibraryMigrations()` — adds columns to user_context if not present
- `getAllLibraryEntries(filters)` — query with optional tag/project filters
- `searchLibrary(query)` — SQLite FTS or LIKE search across title + content
- `saveLibraryEntry(data)` — insert with auto-tag call
- `updateLibraryEntry(id, data)`
- `deleteLibraryEntry(id)`

### Library View — UI

New view accessible from the left sidebar (below Memory, above Projects, or as a sidebar tab).

**Layout:**
```
Library                              [+ Save manually]
────────────────────────────────────

Search: [_________________________]

Filter: All · campaign_draft · email · pitch_deck · strategy

────────────────────────────────────

Campaign v3 — Meeting-focused       #campaign_draft #email
Pitch Deck — Henderson opening      #pitch_deck #strategy
Follow-up sequence — cold outreach  #outreach #email
Q1 sales strategy framework         #strategy

────────────────────────────────────
```

Clicking an entry opens a detail panel showing:
- Title (editable inline — click to edit, border appears)
- Tags (editable): existing tags render as pills; an inline **"+ tag"** button sits next to the last pill, clicking it appends a new editable tag input inline (not a separate form)
- Full content (read-only, "Show more" collapses beyond ~5 lines)
- Copy button
- Source outcome + date
- "Open in Focus Mode" button (opens a new Focus session on the source outcome with this entry preloaded)
- Delete button (below primary actions — red text, confirm on click)

Manual save: "Save manually" button opens a simple form — paste content, Claude auto-tags, user confirms.

### Focus Mode Integration

When Focus Mode opens, the system searches the Library for relevant entries:
- Query: same outcome_id, same tags as the action's outcome type, same project
- Returns up to 3 most relevant (by recency + tag match)
- Injected into Focus Mode system prompt as: "Relevant past work from your Library: [entries]"

This is an upgrade from Phase 2.5 which only retrieved past *session conversations*. The Library retrieves past *saved outputs* — the actual deliverables, not the chat that produced them.

---

## Out of Scope

- Vector / semantic search (SQLite FTS or LIKE is sufficient for v1 — revisit if corpus grows large)
- Version history on individual Library entries
- Sharing Library entries externally
- Automatic extraction of library-worthy content without user confirmation (always require explicit save)

---

## Definition of Done

- [ ] `user_context` table extended with `tags`, `title`, `word_count`, `auto_tagged` columns
- [ ] `POST /api/library` auto-tags content via Claude and stores result
- [ ] All existing `saved_output` entries from Phase 2.5 backfilled with auto-tags (migration script)
- [ ] `GET /api/library` returns entries with tag filter + text search support
- [ ] Library view renders in sidebar: search, tag filters, entry list
- [ ] Entry detail panel shows full content, editable title/tags, copy button
- [ ] "Save manually" flow works (paste → auto-tag → confirm)
- [ ] Focus Mode retrieves and injects relevant Library entries into system prompt
- [ ] "Open in Focus Mode" button on Library entries works
- [ ] Engineer + PM sign-off
