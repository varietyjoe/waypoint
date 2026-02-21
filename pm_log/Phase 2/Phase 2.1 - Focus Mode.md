# Phase 2.1 — Focus Mode

**Goal:** When you're working on an action, the app disappears and Claude shows up. Terminal aesthetic, full screen, no distractions.

**Status:** Not Started
**Depends on:** Phase 2.0 complete

---

## The Moment

You click into an action — "Send an email campaign." The screen goes dark. The rest of the app is gone. It's just you, the task, and a Claude terminal waiting for your input. This is where the work actually happens.

This is the highest-leverage feature in the product. Everything else organizes work. Focus Mode is where you do it.

---

## What This Phase Delivers

By the end of 2.1, the user can:
- Enter Focus Mode from any action with one click
- Work inside a terminal-aesthetic full-screen view with zero UI distraction
- Talk to Claude about the task — it knows what the action is, what outcome it belongs to, and how long you have
- Leave Focus Mode and have the session stored (used in Phase 2.5 for persistent memory)

---

## Aesthetic & Design Direction

| Property | Value |
|---|---|
| Background | `#0d0d0d` |
| Font | JetBrains Mono (load from Google Fonts — one `<link>` tag) |
| Prompt color | `#4ade80` (muted green) |
| Text color | `#e5e7eb` (light gray) |
| Cursor | Blinking block `█` or underscore |
| Layout | Full viewport, centered column, max-width ~680px |

**What's visible:**
```
[top]
  > FOCUSING ON
    [action title]
    [parent outcome title] · est. [time estimate]

  [rotating motivational quote, dimmed]

  [live timer: 00:00 elapsed]

[bottom, pinned]
  ──────────────────────────────────────────────
  > [user input here, blinking cursor]
  ──────────────────────────────────────────────
  [Claude response streams in above the input, line by line]
```

**Entry / exit:**
- Enter: button on action row in Phase 2 ("Focus →" or a terminal icon), or keyboard shortcut `F`
- Exit: `ESC` key, or a small `[esc]` label in top-right corner
- On exit: confirms with user if there's an active conversation ("Leave this session? It'll be saved.")

---

## Scope

### Frontend

New render function `renderFocusMode(actionId)` in `public/index.html`:
- Hides the entire app layout (sidebar, center, right panel) — `display: none` on the root wrapper
- Renders the Focus Mode overlay at full viewport
- Loads JetBrains Mono from Google Fonts on first render (or preload in `<head>`)
- Rotating quote: hardcoded array of 15–20 quotes, picks one on render (no API call)
- Live timer: `setInterval` every second, formatted as `mm:ss`
- Input: single `<textarea>` or `<input>` at bottom, Enter to send, Shift+Enter for newline
- Claude responses: stream into the terminal above the input, line by line
- All Focus Mode text uses `font-family: 'JetBrains Mono', monospace`

### Claude Integration

New API endpoint: `POST /api/focus/message`

Request body:
```json
{
  "actionId": 42,
  "message": "user message",
  "history": [ { "role": "user"|"assistant", "content": "..." } ]
}
```

Response: streaming text (use `Transfer-Encoding: chunked` or SSE)

**System prompt injected automatically:**
- Action title and time estimate
- Parent outcome title and description
- Today's date
- User's full context snapshot from `user_context` table (Phase 2.2 — placeholder empty for now)
- Instruction: "You are a focused work co-pilot. The user is actively working on this task right now. Be direct, brief, and useful. Ask one question at a time if you need clarification."

### Session Storage

New `focus_sessions` table:
```sql
CREATE TABLE IF NOT EXISTS focus_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER REFERENCES actions(id) ON DELETE SET NULL,
    outcome_id INTEGER REFERENCES outcomes(id) ON DELETE SET NULL,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    duration_seconds INTEGER,
    conversation TEXT,  -- JSON array of {role, content} messages
    created_at TEXT DEFAULT (datetime('now'))
)
```

- Session starts when Focus Mode opens: `POST /api/focus/sessions` → returns session ID
- Conversation stored client-side during session
- Session closes when user exits: `PUT /api/focus/sessions/:id` with `{ ended_at, duration_seconds, conversation }`
- New DB module: `src/database/focus-sessions.js`
- New routes in `src/routes/api.js` under `/api/focus/`

---

## Out of Scope

- Sound / white noise (Phase 2.6 or later)
- Pomodoro timer mode
- Sharing or exporting focus sessions
- Focus Mode on mobile (Phase 2.7 will evaluate)
- Persistent memory across sessions (Phase 2.5 — Focus Mode just stores sessions, 2.5 reads them back)

---

## Definition of Done

- [ ] Focus Mode opens from action row button and hides the rest of the app
- [ ] Terminal aesthetic renders correctly: dark bg, JetBrains Mono, green prompt
- [ ] Action title, parent outcome, and time estimate display correctly
- [ ] Motivational quote rotates on each open
- [ ] Live timer runs from 0:00
- [ ] User can type a message and receive a streaming Claude response
- [ ] Claude response streams line by line into the terminal (not all at once)
- [ ] Claude system prompt includes action context and outcome context
- [ ] ESC exits Focus Mode and restores the app layout
- [ ] Focus session is saved to `focus_sessions` table on exit (action_id, outcome_id, duration, conversation)
- [ ] No regressions on main app layout or phase navigation
- [ ] Engineer + PM sign-off
