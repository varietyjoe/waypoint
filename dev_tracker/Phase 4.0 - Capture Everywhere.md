# Dev Tracker — Phase 4.0: Capture Everywhere

**Status:** Complete
**Full brief:** `pm_log/Phase 4/Phase 4.0 - Capture Everywhere.md`
**Engineer handoff:** `pm_log/Phase 4/Phase 4.0 - Engineer Handoff.md`
**Depends on:** Phase 3.3 complete and approved ✅

---

## Pre-Build Checklist

- [x] Read `src/database/inbox.js` lines 44–49 — confirm the `source_type` allowlist; plan your expansion
- [x] Read `src/routes/slack.js` top 15 lines — confirm `inbox` is already required there
- [x] Read `src/routes/api.js` lines 1–38 — confirm require/init pattern before adding new routes
- [x] Search `public/index.html` for `enterFocusMode` — read the overlay HTML template in full to know where the mic button goes
- [x] Search `public/index.html` for `renderPhase1` — read the function to know where filter tabs and quick capture insert
- [x] Confirm `.env` exists at project root; add `INBOUND_EMAIL_ADDRESS=` placeholder

---

## Build Log

| Date | Engineer | Notes |
|---|---|---|
| 2026-02-23 | Claude (claude-sonnet-4-6) | All 6 workstreams implemented and smoke-tested |

### Decisions

1. **DB CHECK constraint migration (Phase 4.0 addition):** The `inbox` table had a SQLite `CHECK(source_type IN ('slack', 'grain', 'manual'))` constraint that blocked the new source types. Since SQLite doesn't support `ALTER COLUMN`, added a table-rename-and-recreate migration to `initInboxMigrations()`. The migration detects the old constraint by checking `sqlite_master.sql` for the old allowlist string, so it's idempotent and safe to re-run.

2. **`enterFocusMode(null, null)` for Library sessions:** The handoff specifies `enterFocusMode(null, null)` but the original function signature only accepts `enterFocusMode(actionId)`. The function now detects library sessions by checking `window._libraryFocusContext` when `actionId` is null. A null actionId with no library context still early-returns (safe).

3. **`POST /api/inbox` route added:** The voice note's `addVoiceNoteToInbox()` function POSTs to `/api/inbox` which didn't exist. Added a clean route for direct inbox capture used by voice notes and other manual captures.

4. **"Open in Focus →" button added to Library panel:** The existing `renderLibraryDetail()` had no such button — it was a stub per the handoff ("left as a stub"). Added the button above Copy/Delete.

5. **`initVoiceNote()` called before Library context injection:** The handoff specifies calling `initVoiceNote()` then injecting Library context. The mic button must be in the DOM (part of the overlay template) before `initVoiceNote()` tries to un-hide it. Both the button and the injection happen after `document.body.appendChild(overlay)`, so DOM ordering is correct.

---

## Completion Checklist

### Workstream 1 — Slack `/waypoint` Slash Command
- [x] `src/database/inbox.js` — `source_type` allowlist expanded to include `'slack_command'` and `'email_forward'`
- [x] `src/database/inbox.js` — error message for invalid `source_type` lists all valid values
- [x] `src/routes/slack.js` — `POST /waypoint-command` handler exists in the router
- [x] Route reads `text`, `user_id`, `channel_name`, `user_name` from `req.body`
- [x] Empty text returns ephemeral usage hint — does NOT create an inbox item
- [x] Title truncated to 120 chars if longer
- [x] Calls `await inbox.addToInbox(...)` with `source_type: 'slack_command'`
- [x] `source_metadata` includes: `slack_user_id`, `channel_name`, `raw_text`
- [x] HTTP response is `{ response_type: 'ephemeral', text: 'Added to your Waypoint inbox. ✓' }`
- [x] Error path returns HTTP 200 with ephemeral error text (NOT 500)
- [x] Setup comment documents: `/waypoint` command name, request URL path, Slack App Dashboard steps
- [x] `console.log` on success, `console.error` on failure

### Workstream 2 — Email Forward Inbound Webhook
- [x] `.env` — `INBOUND_EMAIL_ADDRESS=` placeholder line added
- [x] `stripEmailQuotes()` helper function added to `src/routes/api.js` (standalone, not inside route)
- [x] `POST /api/inbox/email-inbound` route exists in `api.js`
- [x] Route normalizes `subject` across Postmark/Mailgun/SendGrid
- [x] Route normalizes `text` body across all three providers
- [x] Route normalizes `from` / sender across all three providers
- [x] `stripEmailQuotes` removes `>` lines and breaks on `On ... wrote:` pattern
- [x] Plain text preferred; HTML fallback strips tags before storing
- [x] `title` derived from subject (stripped Fwd/Re) or first 80 chars of body
- [x] `title` truncated to 120 chars
- [x] `description` stores up to 500 chars
- [x] `source_metadata` stores: `from_name`, `from_email`, `subject`, `raw_text` (≤2000 chars)
- [x] `source_type` is `'email_forward'`
- [x] Returns 400 if both subject and body are empty
- [x] Returns `{ success: true }` on success; errors passed to `next(err)`
- [x] Setup comment documents Postmark/Mailgun/SendGrid configuration paths
- [x] `GET /api/inbox/inbound-email-address` route returns `{ success: true, address: ... }`
- [x] `<div id="inbound-email-display">` exists in Briefings settings block in `#memory-panel`
- [x] `loadInboundEmailDisplay()` function exists and fetches the address endpoint
- [x] `loadInboundEmailDisplay()` called when Memory panel opens

### Workstream 3 — Voice Note in Focus Mode
- [x] `#focus-mic-btn` button exists in Focus Mode bottom bar HTML (`display:none` default)
- [x] `#focus-recording-indicator` span exists, also `display:none` default
- [x] `initVoiceNote()` function exists; checks Web Speech API; returns early silently if not available
- [x] If Web Speech API available, `initVoiceNote()` shows `#focus-mic-btn`
- [x] `toggleVoiceNote()` function exists and toggles start/stop recording
- [x] `startVoiceRecording()` turns mic button red and shows recording indicator
- [x] `stopVoiceRecording()` restores mic button color and hides indicator
- [x] `voiceRecognition.onresult` calls `stopVoiceRecording()`, sets `input.value = transcript`, calls `sendFocusMessage()`
- [x] `checkVoiceNoteIsTask()` async function exists; returns `true` if response contains "task"
- [x] `showVoiceInboxChip()` renders "Add to inbox?" chip with Yes/No buttons into `#focus-messages`
- [x] `addVoiceNoteToInbox()` POSTs to `/api/inbox` with `source_type: 'manual'` and `source_metadata.origin: 'voice_note'`
- [x] `addVoiceNoteToInbox()` removes the chip on click
- [x] `initVoiceNote()` called inside `enterFocusMode()` after overlay appended to DOM

### Workstream 4 — Recently Closed Sidebar
- [x] `GET /api/outcomes/recently-closed` route exists in `api.js`
- [x] Route calls `outcomesDb.getArchivedOutcomes(3)` (limit 3)
- [x] Response format: `{ success: true, count: N, data: [...] }`
- [x] Route placed before any wildcard/param routes for `/outcomes/:id`
- [x] `loadArchivedOutcomes()` fetches `/api/outcomes/recently-closed` (not `/api/outcomes/archived?limit=5`)

### Workstream 5 — Project Filter Tabs + Quick Capture
- [x] `activeProjectFilter` global variable declared (initialized to `null`)
- [x] `renderPhase1()` reads `activeProjectFilter` to filter `OUTCOMES` before rendering
- [x] Filter tabs only render when 2+ distinct projects exist
- [x] "All" tab is always first; sets `activeProjectFilter = null`
- [x] Each project tab sets `activeProjectFilter` to project `id` (integer)
- [x] Active tab has visually distinct styling
- [x] `setProjectFilter()` function exists; updates state and re-renders
- [x] `setProjectFilter()` does NOT reload from server — filters in-memory
- [x] Empty state message contextual: "No outcomes in this project" when filtered
- [x] Quick capture input `#quick-capture-outcome` exists below outcomes list
- [x] `handleQuickCaptureOutcome(event)` only fires on Enter key
- [x] If no project available, shows toast "Create a project first"
- [x] POSTs to `/api/outcomes` with `{ title, project_id }`
- [x] On success: calls `loadData()`, shows success toast
- [x] Input cleared immediately on Enter (before async fetch resolves)

### Workstream 6 — Wire "Open in Focus →" from Library
- [x] `openLibraryEntryInFocus(entryId)` function added to `public/index.html`
- [x] Function fetches `GET /api/library/${entryId}`, stashes context in `window._libraryFocusContext`
- [x] Function calls `enterFocusMode(null, null)` to open Focus Mode
- [x] In `enterFocusMode()`, Library context injection block added after `initVoiceNote()`
- [x] `window._libraryFocusContext` consumed (nulled) on use
- [x] Library content displayed in terminal as initial block
- [x] "Open in Focus →" button in `renderLibraryDetail()` has `onclick="openLibraryEntryInFocus(${entry.id})"`

### Cross-Cutting
- [x] `src/routes/grain.js` unchanged
- [x] `src/integrations/` directory unchanged
- [x] `src/utils/crypto.js` unchanged
- [x] `src/database/oauth-tokens.js` schema unchanged
- [x] No new npm packages introduced
- [x] Web clipper NOT present (explicitly deferred)

---

## Blockers

None.
