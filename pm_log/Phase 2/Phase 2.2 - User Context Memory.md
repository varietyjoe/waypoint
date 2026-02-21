# Phase 2.2 — User Context Memory

**Goal:** Claude stops guessing. It asks once, remembers forever, and uses what it knows about how you work in every future interaction.

**Status:** Not Started
**Depends on:** Phase 2.1 complete (Focus Mode sessions exist; context is first collected there)

---

## The Problem

"Make 150 dials" takes the user 6 hours. Claude guesses 2. The plan is wrong before the day starts. One bad estimate and the user stops trusting the system.

The fix isn't a smarter guess — it's asking and remembering. The app should know how you work. It should get smarter every session. Month 3 should feel completely different from day 1.

---

## What This Phase Delivers

By the end of 2.2:
- Claude asks a clarifying question when it encounters a task type or duration it doesn't know
- The user's answer is stored permanently in a `user_context` table
- Every future Claude call (Focus Mode, AI Breakdown, Smart Inbox) is injected with the full context snapshot
- The user can view and edit their stored context (simple settings view)

---

## Examples of What Gets Stored

| Key | Value | Category |
|---|---|---|
| `150 dials` | `6 hours` | task_duration |
| `email campaign draft` | `90 minutes` | task_duration |
| `legal review` | `3–5 business days` | process_time |
| `client call` | `45 minutes` | task_duration |
| `deep work block` | `90 minutes max, 2 per day` | work_pattern |
| `writing speed` | `~400 words/hour` | work_pattern |
| `Rohter pitch deck` | `full deck = 4 hours, iteration = 90 min` | task_duration |

---

## Scope

### DB

New `user_context` table:
```sql
CREATE TABLE IF NOT EXISTS user_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    category TEXT,          -- 'task_duration' | 'work_pattern' | 'process_time' | 'preference' | 'other'
    source TEXT,            -- 'focus_mode' | 'inbox_triage' | 'ai_breakdown' | 'manual'
    source_action_id INTEGER REFERENCES actions(id) ON DELETE SET NULL,
    source_outcome_id INTEGER REFERENCES outcomes(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
)
```

New DB module: `src/database/user-context.js`
- `initUserContextTable()` — called at startup in `api.js`
- `getAllContext()` — returns all rows
- `getContextSnapshot()` — returns a formatted string for injection into Claude prompts
- `upsertContext(key, value, category, source, sourceIds)` — insert or update by key
- `deleteContext(id)`

### API Routes (in `src/routes/api.js`)

```
GET    /api/context          — returns all context entries
POST   /api/context          — { key, value, category } — manual add
PUT    /api/context/:id      — update value or category
DELETE /api/context/:id      — remove an entry
```

### Claude System Prompt Injection

Update the system prompt builder used by ALL Claude endpoints (Focus Mode, future AI Breakdown, future Inbox Triage):

```
[injected automatically at the top of every system prompt]

## What I know about how you work:
- 150 dials: 6 hours
- Email campaign draft: 90 minutes
- Deep work block: 90 min max, 2 per day
[... all context entries formatted as a list]
```

If `user_context` is empty, this section is omitted (no "I don't know anything yet" message — just no section).

### Asking for Context in Focus Mode

During a Focus Mode session, if the user mentions a task type or duration Claude doesn't have in context:
- Claude asks ONE question before estimating: *"How long does a task like this usually take you?"*
- User's answer is captured by the frontend and sent to `POST /api/context` immediately
- Claude confirms: *"Got it — I'll remember that for next time."*

This behavior is guided by the system prompt instruction (not hardcoded logic):
> "If the user mentions a task or estimates time for something you don't have in context, ask them to confirm the duration, then tell them you've noted it. Keep the question to one sentence."

The frontend Focus Mode chat handles storing the answer — it watches for a context save signal in the Claude response (e.g. a structured JSON block, or a simple heuristic: if Claude asks a duration question and the user responds with a number, auto-POST to `/api/context`).

**Implementation note:** Start simple — have the user manually confirm storage with a "Save this" chip that appears after duration answers. Don't over-engineer auto-detection.

### Context Settings View

Simple read/edit view accessible from the sidebar or settings icon:
- List of all context entries (key / value / category / source)
- Edit value inline
- Delete entry (with confirmation)
- No bulk import — entries are built organically through use

Location: a "Memory" section in the left sidebar, below the projects list. Small chip count indicator showing how many context entries exist.

---

## Out of Scope

- NLP-based auto-extraction of context from free text (too complex for v1 — rely on explicit question-and-answer)
- Context expiry or staleness detection
- Sharing context across devices or users
- Vector search over context (simple string match is sufficient for v1)

---

## Definition of Done

- [ ] `user_context` table created and initialized at startup
- [ ] GET / POST / PUT / DELETE `/api/context` routes work
- [ ] `getContextSnapshot()` returns a formatted string ready for prompt injection
- [ ] Every Claude endpoint injects context snapshot into system prompt
- [ ] Focus Mode: Claude asks about unknown durations, user can save answer via "Save this" chip
- [ ] Answer is stored via `POST /api/context` on save
- [ ] Context settings view in sidebar shows all entries, supports edit and delete
- [ ] Engineer + PM sign-off
