# Phase 2.3 — AI Breakdown

**Goal:** "Break into Actions" becomes genuinely useful. Claude reads the outcome, checks what it knows about you, and produces a realistic, time-estimated action plan — not a generic list.

**Status:** Not Started
**Depends on:** Phase 2.2 complete (context memory must exist before breakdown can use it)

---

## The Problem with the Current State

The ✦ button and ⌘K `break_into_actions` tool from Phase 1.4 return action suggestions, but they're generic. Claude has no idea how long things actually take you. "Write a pitch deck" might come back estimated at 2 hours when it's actually 6. The context layer (Phase 2.2) is the prerequisite that makes breakdown actually accurate.

---

## What This Phase Delivers

By the end of 2.3:
- Claude reads the outcome title, description, deadline, and your full context snapshot
- It proposes a realistic set of actions with time estimates grounded in what it knows about you
- If it encounters a task type with no known duration, it asks ONE question before generating
- User reviews, edits, and approves the action list before anything is created
- The review flow is fast — not a form, a quick skim-and-confirm

---

## Scope

### Trigger Points

Two ways to invoke breakdown (same as Phase 1.4):
1. ✦ button on an outcome card in Phase 1
2. ⌘K → "Break this into actions" preset

Both should now feel meaningfully different because context is injected.

### Updated Claude Tool: `break_into_actions`

Update `src/services/claude.js`:

**System prompt now includes:**
- Outcome title, description, deadline, priority
- User's full context snapshot from `user_context`
- Today's date (to calculate deadline pressure)
- Instruction: "Propose 3–7 actions. For each action, provide: title (action verb + object), time_estimate in minutes (use the user's known durations from context — do not guess for tasks you've seen before), energy_type ('deep' or 'light'). If you encounter a task type with no known duration in context, add it to a `questions` array instead of guessing."

**Response shape:**
```json
{
  "actions": [
    { "title": "Draft opening slide deck structure", "time_estimate": 30, "energy_type": "deep" },
    { "title": "Build slides in Canva", "time_estimate": 90, "energy_type": "deep" },
    { "title": "Send draft to Scott for review", "time_estimate": 10, "energy_type": "light" }
  ],
  "questions": [
    "How long does it usually take you to get feedback from Scott?"
  ]
}
```

### Review Flow (Frontend)

After Claude returns:

1. **If `questions` is non-empty:** Show a simple modal with the question(s) first. User answers inline. Answers are sent to `POST /api/context` and stored. Then the action list is shown.

2. **Action review modal:**
   - Each proposed action shown as a card: title (editable inline) / time estimate (editable inline) / energy badge (toggleable)
   - "Add" button at bottom to add a blank action manually
   - Trash icon on each card to remove
   - "Create Actions" CTA at bottom — creates all approved actions via existing `POST /api/actions` endpoint, assigns `outcome_id`
   - "Cancel" discards everything

3. Actions drop into the outcome's checklist. User is returned to Phase 2 (execution view) with the new actions visible.

### No New Backend Routes Needed

- Context questions → `POST /api/context` (Phase 2.2)
- Action creation → `POST /api/actions` (existing)
- Claude call → `POST /api/chat` or new `/api/breakdown` endpoint (engineer's choice — keep consistent with existing claude routing)

---

## Out of Scope

- Auto-approving actions without user review (always show review — trust is built through transparency)
- Dependency ordering or critical path analysis
- Gantt / timeline view of actions
- Re-running breakdown on an outcome that already has actions (ask PM before adding this)

---

## Definition of Done

- [ ] ✦ button and ⌘K both invoke updated `break_into_actions` tool
- [ ] Claude system prompt for breakdown includes full context snapshot
- [ ] If unknown durations detected, question(s) are surfaced before action list is shown
- [ ] User answers to questions are stored via `POST /api/context`
- [ ] Review modal shows all proposed actions with editable title, time estimate, energy type
- [ ] User can add, edit, or remove any action in the review modal
- [ ] "Create Actions" commits all approved actions to the DB under the correct outcome
- [ ] Actions appear in the outcome's Phase 2 checklist immediately after creation
- [ ] Engineer + PM sign-off
