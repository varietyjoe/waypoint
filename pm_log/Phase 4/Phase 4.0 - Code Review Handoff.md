# Phase 4.0 — Code Review Handoff: Capture Everywhere

## Agent Prompt

You are reviewing Phase 4.0 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase added four capture vectors: a Slack slash command, an email inbound webhook, a voice note button in Focus Mode, and two polish items (Recently Closed sidebar alias + project filter tabs with quick capture). Read the files listed below, then work through every checkbox in this document. When done, log your verdict to `test_tracker/Phase 4.0 - Capture Everywhere.md`.

---

## Read These Files Before Reviewing

1. `pm_log/Phase 4/Phase 4.0 - Capture Everywhere.md` — original spec and definition of done
2. `pm_log/Phase 4/Phase 4.0 - Engineer Handoff.md` — what the engineer was instructed to build
3. `src/routes/slack.js` — Workstream 1: find `POST /waypoint-command`
4. `src/database/inbox.js` — Workstream 1 + 2: verify the `source_type` allowlist expansion at line ~47
5. `src/routes/api.js` — Workstream 2 + 4: find `POST /inbox/email-inbound`, `GET /inbox/inbound-email-address`, `GET /outcomes/recently-closed`, and `stripEmailQuotes`
6. `public/index.html` — Workstream 3 (search `toggleVoiceNote`, `initVoiceNote`, `showVoiceInboxChip`), Workstream 4 (search `loadArchivedOutcomes`), Workstream 5 (search `setProjectFilter`, `handleQuickCaptureOutcome`, `activeProjectFilter`)

---

## What Was Built

| Workstream | What it does |
|---|---|
| 1 — Slack `/waypoint` command | `POST /api/slack/waypoint-command` receives a Slack slash command, creates an inbox item with `source_type = 'slack_command'` |
| 2 — Email inbound webhook | `POST /api/inbox/email-inbound` receives a parsed email payload (Postmark/Mailgun/SendGrid), strips quoted replies, creates inbox item with `source_type = 'email_forward'`; `GET /api/inbox/inbound-email-address` exposes the configured address |
| 3 — Voice note in Focus Mode | Mic button in the Focus Mode bottom bar; uses Web Speech API; transcript appended to terminal as user message + sent to Claude; Claude prompt checks if task-like; "Add to inbox?" chip if yes |
| 4 — Recently Closed alias | `GET /api/outcomes/recently-closed` returns last 3 archived outcomes; `loadArchivedOutcomes()` updated to call this route |
| 5 — Filter tabs + quick capture | Project filter tabs above outcomes list in `renderPhase1()`; quick capture input below list creates an outcome via `POST /api/outcomes` on Enter |

**Supporting change:** `src/database/inbox.js` — `source_type` allowlist expanded to include `'slack_command'` and `'email_forward'`.

---

## Review Checklist

### Workstream 1 — Slack `/waypoint` Slash Command

**File: `src/routes/slack.js`**

- [ ] `POST /waypoint-command` handler exists in the router
- [ ] Route reads `text`, `user_id`, `channel_name`, `user_name` from `req.body`
- [ ] If `text` is empty, responds ephemerally with usage hint — does NOT create an inbox item
- [ ] Title is truncated to 120 characters if the text is longer
- [ ] Calls `await inbox.addToInbox(...)` with `source_type: 'slack_command'`
- [ ] `source_metadata` includes at minimum: `slack_user_id`, `channel_name`, `raw_text`
- [ ] HTTP response is `{ response_type: 'ephemeral', text: 'Added to your Waypoint inbox. ✓' }`
- [ ] Error path returns HTTP 200 with ephemeral error text (NOT a 500 — Slack requires 200 even on errors)
- [ ] Setup comment documents: command name `/waypoint`, request URL path, Slack App Dashboard navigation steps
- [ ] `console.log` on success, `console.error` on failure

**File: `src/database/inbox.js`**

- [ ] The `source_type` validation allowlist includes `'slack_command'` AND `'email_forward'`
- [ ] The error message for invalid `source_type` lists all valid values
- [ ] No other changes to `inbox.js` (only the allowlist line was touched)

---

### Workstream 2 — Email Forward Inbound Webhook

**File: `src/routes/api.js`**

- [ ] `POST /inbox/email-inbound` route exists
- [ ] Route normalizes `subject` across Postmark (`Subject`), Mailgun (`subject`), SendGrid (`subject`) field names
- [ ] Route normalizes `text` body across all three providers
- [ ] Route normalizes `from` / sender across all three providers
- [ ] `stripEmailQuotes()` helper function exists (not inside the route handler — defined as a standalone function)
- [ ] `stripEmailQuotes` removes lines starting with `>`
- [ ] `stripEmailQuotes` breaks on `On ... wrote:` pattern (case-insensitive)
- [ ] Plain text is preferred; HTML fallback strips tags before storing
- [ ] `title` is derived from subject (stripped of Fwd/Re prefixes) or falls back to first 80 chars of body
- [ ] `title` is truncated to 120 characters
- [ ] `description` stores up to 500 chars of stripped body
- [ ] `source_metadata` stores: `from_name`, `from_email`, `subject`, `raw_text` (up to 2000 chars)
- [ ] `source_type` is `'email_forward'`
- [ ] Returns `{ success: false, error: 'Empty email body' }` with status 400 if both subject and body are empty
- [ ] Returns `{ success: true }` on success
- [ ] Error is passed to `next(err)` (uses the Express error handler — not `res.status(500)` inline)
- [ ] Setup comment documents: Postmark, Mailgun, and SendGrid configuration paths
- [ ] `GET /api/inbox/inbound-email-address` route exists and returns `{ success: true, address: process.env.INBOUND_EMAIL_ADDRESS || null }`

**File: `.env`**

- [ ] `INBOUND_EMAIL_ADDRESS=` placeholder line exists (value may be empty)

**File: `public/index.html`**

- [ ] Inbound email display `<div id="inbound-email-display">` exists inside the Briefings settings block in `#memory-panel`
- [ ] `loadInboundEmailDisplay()` JS function exists and fetches `/api/inbox/inbound-email-address`
- [ ] On fetch failure, falls back to text: `Set INBOUND_EMAIL_ADDRESS in .env`
- [ ] `loadInboundEmailDisplay()` is called when the Memory panel opens (inside `loadBriefingsSettings()` or equivalent)

---

### Workstream 3 — Voice Note in Focus Mode

**File: `public/index.html`**

- [ ] `#focus-mic-btn` button element exists in the Focus Mode bottom bar HTML (inside `enterFocusMode()`'s `overlay.innerHTML`)
- [ ] `#focus-mic-btn` has `style="display:none"` as its default state
- [ ] `#focus-recording-indicator` span exists adjacent to the mic button, also `display:none` by default
- [ ] `initVoiceNote()` function exists
- [ ] `initVoiceNote()` checks `window.SpeechRecognition || window.webkitSpeechRecognition` and returns early (silently) if neither is defined
- [ ] If Web Speech API IS available, `initVoiceNote()` sets `#focus-mic-btn` to `display:''` (shows it)
- [ ] `toggleVoiceNote()` function exists and toggles between start and stop recording
- [ ] `startVoiceRecording()` turns mic button color to red and shows recording indicator
- [ ] `stopVoiceRecording()` restores mic button color and hides recording indicator
- [ ] `voiceRecognition.onresult` calls `stopVoiceRecording()`, then sets `input.value = transcript`, then calls `sendFocusMessage()` — does NOT re-implement the streaming logic
- [ ] `checkVoiceNoteIsTask()` async function exists; POSTs to an existing Claude endpoint; returns `true` only if response contains `"task"` (not `"not task"`)
- [ ] `showVoiceInboxChip()` renders a chip with "Add to inbox?" + Yes/No buttons into `#focus-messages`
- [ ] `addVoiceNoteToInbox()` POSTs to `/api/inbox` with `source_type: 'manual'` (or another valid type) and `source_metadata.origin: 'voice_note'`
- [ ] `addVoiceNoteToInbox()` removes the chip on click regardless of success/failure
- [ ] `initVoiceNote()` is called inside `enterFocusMode()` after the overlay is appended to the DOM
- [ ] `voiceRecognition` and `voiceRecording` state variables are reset/handled correctly when `exitFocusMode()` is called (recognition stopped if active)

---

### Workstream 4 — Recently Closed Sidebar

**File: `src/routes/api.js`**

- [ ] `GET /api/outcomes/recently-closed` route exists
- [ ] Route calls `outcomesDb.getArchivedOutcomes(3)` (limit of 3, not 5 or 10)
- [ ] Response format matches existing pattern: `{ success: true, count: N, data: [...] }`
- [ ] Route is placed before any wildcard/param routes for `/outcomes/:id` to avoid shadowing

**File: `public/index.html`**

- [ ] `loadArchivedOutcomes()` fetches `/api/outcomes/recently-closed` (not `/api/outcomes/archived?limit=5`)
- [ ] `renderRecentlyClosed()` function is unchanged from pre-phase (it was already correct)
- [ ] `#sidebarRecentlyClosed` DOM slot is present in sidebar HTML

---

### Workstream 5 — Project Filter Tabs + Quick Capture

**File: `public/index.html`**

- [ ] `activeProjectFilter` global variable declared at module level (initialized to `null`)
- [ ] `renderPhase1()` reads `activeProjectFilter` to filter the `OUTCOMES` array before rendering cards
- [ ] Filter tabs HTML only renders when there are 2 or more distinct projects (single-project installs show no tabs)
- [ ] "All" tab is always first; it sets `activeProjectFilter = null`
- [ ] Each project tab sets `activeProjectFilter` to the project's `id` (integer)
- [ ] Active tab has visually distinct styling (filled background vs. outline)
- [ ] Clicking a tab calls `setProjectFilter()` which updates state and re-renders the outcomes list
- [ ] `setProjectFilter()` does not reload data from the server — it filters the existing `OUTCOMES` array in memory
- [ ] Empty state message is contextual: "No outcomes in this project" when filtered, "No active outcomes yet" when unfiltered
- [ ] Quick capture input `#quick-capture-outcome` exists below the outcomes list with `placeholder="Add outcome…"`
- [ ] `handleQuickCaptureOutcome(event)` only fires on `Enter` key
- [ ] If no project is available, shows a `showToast('Create a project first', 'warning')` and does not submit
- [ ] POSTs to `/api/outcomes` with at minimum `{ title, project_id }`
- [ ] On success: calls `loadData()` (or equivalent), shows success toast
- [ ] On error: shows warning toast
- [ ] Input is cleared immediately on Enter (before the async fetch resolves), not after

---

### Cross-Cutting Concerns

- [ ] `src/routes/grain.js` is unchanged
- [ ] `src/integrations/` directory is unchanged
- [ ] `src/utils/crypto.js` is unchanged
- [ ] `src/database/oauth-tokens.js` schema is unchanged
- [ ] No `better-sqlite3` calls wrapped in `async/await` inside DB modules (DB layer is sync)
- [ ] New `api.js` routes follow the `try { ... } catch (err) { next(err); }` pattern
- [ ] No new npm packages introduced without mention (check `package.json` diff — this phase should require zero new packages)
- [ ] `console.log` prefix convention followed: `[Waypoint Cmd]`, `[Email Inbound]` etc.
- [ ] Web clipper is NOT present (it was explicitly deferred)

---

## What's Out of Scope

The following were explicitly deferred or excluded from Phase 4.0. Flag as a blocker ONLY if they were accidentally implemented (scope creep):

- **Web clipper** — browser extension deferred entirely; no `/api/inbox/clip` route should exist
- **Zapier / Make / webhook integrations** — out of scope
- **SMS, WhatsApp, phone capture** — out of scope
- **Native mobile share extension** — out of scope
- **Bot token DM sending** — the Slack command uses HTTP response body for the ephemeral reply; no `client.chat.postMessage` is needed for Workstream 1

---

## When You're Done

Log your findings to `test_tracker/Phase 4.0 - Capture Everywhere.md`.

Use this format:

```
## Phase 4.0 Code Review — [date]

**Reviewer verdict:** [Approved for Phase 4.1 / Blocked]

### Workstream results
- WS1 Slack command: [Pass / Fail — notes]
- WS2 Email inbound: [Pass / Fail — notes]
- WS3 Voice note: [Pass / Fail — notes]
- WS4 Recently Closed: [Pass / Fail — notes]
- WS5 Filter tabs + quick capture: [Pass / Fail — notes]

### Blockers (must fix before Phase 4.1)
- [list or "none"]

### Warnings (non-blocking)
- [list or "none"]
```

**Approval criteria:** All 5 workstreams pass with no blockers. Warnings are acceptable — note them and move on. If any workstream is blocked, the engineer must fix and re-submit for review before Phase 4.1 begins.
