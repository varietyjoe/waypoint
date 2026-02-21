# Phase 1.4 — AI Co-pilot

**Goal:** Claude handles complex operations the UI fundamentally cannot. Fast, contextual, and clearly scoped.

**Status:** Not Started
**Depends on:** Phases 1.0, 1.2, 1.3 complete

---

## Scope Boundary (Important)

Claude does NOT replace UI for simple operations. This was validated by testing the v1 chat live — simple ops via Claude are slower than the UI. The boundary is firm:

| Operation | Who does it |
|---|---|
| Add one action | UI inline input |
| Toggle action done | UI checkbox |
| Archive an outcome | UI button |
| Quick capture one item | UI quick capture |
| Break an outcome into 6 tagged actions | Claude (⌘K or ✦ button) |
| Convert post-meeting brain dump into outcomes + actions | Claude (⌘K) |
| Push all PRODUCT deadlines back 2 weeks | Claude (⌘K) |
| "What should I prioritize today?" | Claude (⌘K) |

---

## What This Phase Delivers

By the end of 1.4, the user can:
- Hit ⌘K from anywhere and give Claude a complex instruction in plain English
- Click ✦ on any outcome card to immediately break it into suggested actions
- Dump post-meeting notes into Claude and have it create structured outcomes + actions
- Ask Claude what to prioritize given current deadline risk
- Bulk reschedule an entire project with one instruction

---

## Scope

### Command Palette (⌘K)
- Floating overlay, triggered from anywhere in the app
- On open, injects context: current project, selected outcome + its actions, deadline risk summary, active outcome list
- Natural language input → Claude selects and runs the appropriate tool
- Uses existing preview-before-execute pattern from `src/services/claude.js`
- Closes on completion or ESC

### Contextual ✦ Button on Outcome Cards
- Small ✦ icon on each outcome card in the Phase 1 grid
- Opens command palette pre-loaded with that outcome's context and a "break into actions" preset
- Purpose: discoverability before ⌘K habit is formed

### New Claude Tools
Update `src/services/claude.js` — remove old task tools, add:

**`break_into_actions`**
- Input: outcome context (auto-injected)
- Output: suggested action list with `title`, `time_estimate`, `energy_type` for each
- UX: user sees a review modal — accept/edit/reject each action individually before any are created

**`brain_dump_to_outcomes`**
- Input: unstructured text from user (meeting notes, voice-to-text, stream of consciousness)
- Output: extracted outcomes + actions, assigned to correct project
- UX: preview before creating

**`bulk_reschedule`**
- Input: plain English instruction (e.g. "push everything in PRODUCT to March 30")
- Output: updated deadlines across affected outcomes
- UX: preview showing every deadline that will change, confirm before executing

**`prioritize_today`**
- Input: full outcome list + deadline risk data (auto-injected)
- Output: clear, ranked recommendation with reasoning
- UX: conversational response, no data mutations

### Grain Integration
**Check with PM before building.** Confirm Grain is still in active use. If yes:
- Update `src/routes/grain.js` webhook handler to classify meeting notes using the same Outcome/Action prompt as Slack triage (Phase 1.2)
- Wire to inbox approval flow (same as Slack — creates outcomes or actions)
- Infrastructure is already preserved, just needs prompt update

---

## Out of Scope
- Velocity trends, weekly review summaries (future)
- Social features (permanent non-goal)
- Claude replacing any basic UI interaction (permanent non-goal)

---

## Definition of Done
- [ ] ⌘K opens command palette from anywhere in app
- [ ] Context injection correct (project, outcome, deadline risk)
- [ ] `break_into_actions` returns usable suggestions
- [ ] Review modal allows per-action accept/edit/reject
- [ ] `brain_dump_to_outcomes` creates correct structure from unstructured input
- [ ] `bulk_reschedule` previews all changes before executing
- [ ] `prioritize_today` returns useful, context-aware recommendation
- [ ] ✦ button on outcome cards opens palette pre-loaded for that outcome
- [ ] Old task tools removed from `claude.js`
- [ ] Grain integration shipped or explicitly deferred (confirm with PM)
- [ ] Engineer + PM sign-off
