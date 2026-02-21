# Phase 2.4 — Smart Inbox Triage

**Goal:** The 8:30am flow. Open the app, see overnight Slack items, Claude reads them together, groups related ones, asks one question per unknown, and your day's outcomes and actions are created in under 2 minutes.

**Status:** Not Started
**Depends on:** Phase 2.2 complete (context memory), Phase 2.3 complete (breakdown pattern established)

---

## The Flow

> *8:30am. Left sidebar shows "6 new items." Click it. A stack of Slack messages appears. You dismiss 3, click Add on the other 3. Claude reads them, sees two are related — stacks them as one outcome with one action inside. The third needs a clarifying question: "How long do you think drafting this pitch deck for Rohter's review will take?" You type "90 mins." Boom — outcome created, action created, time estimate stored to memory. You're done with triage in 90 seconds.*

---

## What This Phase Delivers

By the end of 2.4:
- Claude reads ALL selected inbox items together (batch, not one by one)
- Groups related items into outcome + action clusters intelligently
- Asks one question per unknown (time estimate, project assignment, etc.) before creating
- User sees a preview of proposed outcomes/actions, can edit before committing
- Approved answers are stored to user context automatically

---

## Scope

### Inbox UI Changes

**Current state:** Items are triaged one at a time, each gets an individual Claude pass.

**New state:** Batch triage flow:
1. User sees the inbox stack (existing)
2. User marks items as "Dismiss" or "Add" (existing — keep this)
3. New: "Triage Selected →" button appears when ≥1 item is marked Add
4. On click: all "Add" items are sent to Claude together as one batch

### New API Endpoint: `POST /api/inbox/triage-batch`

Request body:
```json
{
  "itemIds": [12, 15, 19]
}
```

Server:
- Fetches the full text of each inbox item
- Injects user's context snapshot
- Sends to Claude with the batch triage prompt (see below)
- Returns Claude's proposed groupings and questions

**Batch triage prompt:**
```
You are triaging a batch of Slack messages for a personal execution OS.

User's context (how they work):
[context snapshot]

Messages to triage:
[1] "..." (from #channel, timestamp)
[2] "..."
[3] "..."

Instructions:
1. Group related messages into outcome clusters. Each cluster becomes one outcome with one or more actions.
2. Unrelated messages each become their own outcome or standalone action.
3. For each outcome, propose: title (clear, action-oriented), project assignment (if obvious from context), and a list of actions with time estimates.
4. Use the user's known durations from context. If a task type is unknown, add it to a "questions" list — one question per unknown, not per message.
5. Return JSON only.

Response shape:
{
  "clusters": [
    {
      "outcome_title": "...",
      "project_hint": "...",   // or null if unclear
      "source_item_ids": [12, 15],
      "actions": [
        { "title": "...", "time_estimate": 90, "energy_type": "deep" }
      ]
    }
  ],
  "questions": [
    { "question": "How long does it take you to draft a pitch deck?", "context_key": "pitch_deck_draft" }
  ]
}
```

### Frontend Triage Preview Flow

After Claude returns:

**Step 1 — Questions (if any):**
Simple card for each question. User types answer. "Next →" stores all answers to context and proceeds.

**Step 2 — Preview:**
Card per proposed cluster showing:
- Outcome title (editable)
- Project assignment dropdown (editable)
- Action list (editable titles, time estimates, energy toggles)
- Trash icon to remove an action or the whole cluster
- "Split" option to break a cluster into separate outcomes (stretch goal — add only if straightforward)

**Step 3 — Confirm:**
"Create All" button commits everything:
- Creates outcomes via `POST /api/outcomes`
- Creates actions via `POST /api/actions` linked to their outcome
- Marks source inbox items as triaged
- Stores any context answers via `POST /api/context`
- Returns user to the main outcomes view with new items visible

### Sidebar Indicator

The "6 new items" count in the left sidebar already exists (or is close to existing from Phase 1.2). Confirm it shows untriaged inbox item count and updates in real time after triage.

---

## Out of Scope

- Triage of email, calendar, or non-Slack sources (future)
- Auto-triage without user confirmation (always preview before creating)
- Grouping heuristics without Claude (always use Claude for grouping)
- Slack thread context (messages are taken at face value — no thread expansion in v1)

---

## Definition of Done

- [ ] Batch triage UI: "Add" / "Dismiss" per item + "Triage Selected →" CTA
- [ ] `POST /api/inbox/triage-batch` endpoint works and returns valid clusters + questions
- [ ] Questions screen: user answers stored to `user_context` before preview
- [ ] Preview screen: all clusters editable (title, project, actions, time estimates, energy)
- [ ] "Create All" creates outcomes and actions correctly in DB
- [ ] Source inbox items marked as triaged after confirmation
- [ ] Sidebar untriaged count updates after triage completes
- [ ] Main outcomes view refreshes and shows newly created outcomes immediately
- [ ] Engineer + PM sign-off
