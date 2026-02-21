# Phase 2.5 — Persistent Focus Memory

**Goal:** Claude remembers what you worked on together. When you open a new Focus session on a related task, it already knows what was drafted last week, what worked, and where you left off.

**Status:** Not Started
**Depends on:** Phase 2.1 complete (focus_sessions table exists and sessions are being stored)

---

## The Moment

> *You open Focus Mode on "Send an email campaign." Claude says: "Last week we drafted an iteration of your November campaign — it got high clicks but low bookings, so we made it more meeting-focused. Want to iterate further, or start fresh?"*

That's not magic — it's just reading the stored session from Phase 2.1 and injecting it as context. But it feels like a co-pilot who actually knows you.

---

## What This Phase Delivers

By the end of 2.5:
- When Focus Mode opens, Claude retrieves relevant past sessions and loads them as context
- Claude references past work naturally ("Last time we worked on this…")
- User can explicitly save key outputs from a session ("Save this draft")
- Saved outputs are tagged and retrievable in future sessions

---

## Scope

### Relevance Matching

When Focus Mode opens for an action, the system retrieves relevant past sessions by:

1. **Same outcome** — sessions on any action under the same outcome
2. **Same action** — sessions on this exact action (resuming interrupted work)
3. **Same project** — sessions on actions in the same project (lower priority, only if 1 and 2 are empty)

Retrieval: `SELECT * FROM focus_sessions WHERE outcome_id = ? ORDER BY started_at DESC LIMIT 5`

For project-level: join through actions → outcomes → projects.

### Session Summarization

Past sessions can be long. Before injecting, summarize them:
- If session conversation is < 2000 tokens: inject as-is (formatted as "Past session on [date]: ...")
- If session conversation is > 2000 tokens: summarize with a Claude call first, cache the summary

Cache: add `summary TEXT` column to `focus_sessions` table. Populate on first retrieval after session ends.

New API endpoint: `GET /api/focus/sessions/relevant?actionId=X&outcomeId=Y`
- Returns up to 3 relevant sessions with summaries (or raw conversation if short)

### System Prompt Injection in Focus Mode

Update the Focus Mode system prompt builder to include:

```
## Past sessions on related work:
[Session 1 — Jan 15, 2026 — "Send an email campaign"]
We drafted an email campaign iteration focused on increasing meeting bookings.
Key output: email subject line and body targeting click-heavy but booking-light audiences.
The user wanted to test a more direct CTA approach.

[Session 2 — ...]
```

If no relevant sessions: this section is omitted. Claude does not mention memory unless it has something to reference.

### Explicit Save: "Remember This"

Users can explicitly save a key output from a Focus session:
- During the session, a "Save this →" chip appears next to any Claude response block
- On click: saves the message content to `user_context` with:
  - `key`: auto-generated from first 8 words of the message, editable in a small popover
  - `value`: full message content
  - `category`: `'saved_output'`
  - `source`: `'focus_mode'`
  - `source_action_id`, `source_outcome_id`
- Confirmation: "Saved to memory" inline toast

These saved outputs appear in the context snapshot and are retrievable in any future session.

### Memory View Update

The Memory settings view (Phase 2.2) adds a "Saved Outputs" section showing all `category = 'saved_output'` entries, with preview, date, and source outcome/action link.

---

## Out of Scope

- Semantic / vector search over past sessions (simple recency + outcome matching is sufficient for v1)
- Auto-summarization of all sessions in bulk (summarize on-demand at retrieval time)
- Sharing sessions with teammates
- Export of session history

---

## Definition of Done

- [ ] `GET /api/focus/sessions/relevant` returns correctly matched past sessions
- [ ] Focus Mode system prompt includes past session summaries when relevant sessions exist
- [ ] Sessions with > 2000 tokens are summarized before injection (summary cached to DB)
- [ ] "Save this →" chip appears on Claude response blocks during Focus session
- [ ] Saved outputs stored to `user_context` with correct category and source
- [ ] Memory settings view shows saved outputs section
- [ ] If no relevant sessions: Claude does not reference memory (no hallucinated context)
- [ ] Engineer + PM sign-off
