# Claude In-App Experience — RESOLVED

**Status:** RESOLVED — Feb 19, 2026
**Blocking:** ~~Phase 1.0 scope finalization~~ — Unblocked
**See:** `key_decisions/decisions_log.md` entries #12 and #13

---

## Final Decision

**UI Surface:** Command palette triggered by ⌘K, accessible from anywhere in the app.
**Contextual shortcut:** Small AI trigger button (✦) on each outcome card, opens the palette pre-loaded for that outcome.
**Claude scope:** Complex/bulk operations ONLY. Basic CRUD stays in the UI.

### What Claude does via command palette
- "Break this outcome into actions" → suggests action list, user reviews before anything is created
- "I just got out of a meeting, here's what I need to do: [brain dump]" → outcomes + actions created from unstructured text
- "We pushed the deadline to March 30 — reschedule everything in PRODUCT" → bulk update
- "What should I prioritize given my deadline risk?" → interpretation + recommendation

### What Claude does NOT do
- Add a single action (UI inline input is faster)
- Toggle an action done (UI checkbox)
- Archive an outcome (UI button)
- Anything a single UI click can already handle

### Why command palette
- One keystroke from anywhere, no panel competes with Execution Intelligence right panel
- Context injection means Claude knows your current project, outcome, action list, and deadline risk without you explaining it
- 5-10 second latency is acceptable for complex operations (nobody complains Google takes a second to search)
- ✦ button on outcome cards provides discoverability before ⌘K habit is formed

---

## How This Decision Was Made

1. Tried the v1 Claude chat live. Verdict: "fine, but slower than just adding a task myself."
2. Reframed the question: Claude shouldn't compete with the UI for simple ops. It should do things the UI can't.
3. Identified the right Claude use cases: bulk creation, brain dumps, inference, restructuring.
4. Selected command palette as the UI surface — fastest access, no real estate cost, context-aware.
5. Added contextual ✦ button on outcome cards for discoverability.

---

## Impact on Phase Plan

| Item | Was | Now |
|---|---|---|
| Basic CRUD (add action, toggle, archive) | Phase 1.4 via Claude | UI only — Phase 1.0 |
| Command palette (⌘K) UI surface | Not planned | Phase 1.4 |
| ✦ contextual button on outcome cards | Not planned | Phase 1.4 |
| Claude tools (break_into_actions, brain_dump, etc.) | Phase 1.4 generic | Phase 1.4, scoped to complex ops |
| Markdown import (PLAN.md → DB) | Not planned | Phase 1.2 |
