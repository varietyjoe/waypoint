# Phase 1.6 — Mobile Stats & Polish

*Scoped Feb 20, 2026. Prerequisite: Phase 1.5 complete and approved.*

---

## Overview

Phase 1.5 ships the structural mobile layout — navigation, Quick Capture, readable text, touch targets. One deliberate deferral was made: the execution intelligence right panel (ring chart, time breakdown, deadline risk) is desktop-only in 1.5. Phase 1.6 closes that gap and applies a polish pass based on what surfaces during 1.5 testing.

This phase has two workstreams. They can be scoped and built independently.

---

## Workstream A — Execution Intelligence on Mobile

### What it is

The desktop right panel for Phase 2 (Outcome detail) shows:
- SVG ring progress chart
- Total / done / remaining time breakdown
- Deep vs. light work split
- Deadline risk with minutes-per-day calculation

On desktop this lives in a fixed 288px column. On mobile that column is hidden.

### Design decision to make before building

Choose one approach (engineer and PM to decide at kickoff):

**Option A — Inline collapsed summary in outcome detail header**
- A single line below the outcome title: e.g. `3 of 8 done · 2h 15m left · 🟡 At risk`
- Tap the line → expands to full stats inline (accordion)
- No new component; just conditional rendering in `renderPhase2()`
- Lowest build cost

**Option B — "Stats" bottom sheet triggered from outcome detail**
- Small "Stats ↑" chip in the sticky outcome detail header
- Tap → bottom sheet slides up over the content with the full right-panel stats block
- Requires the bottom sheet component (show/hide, backdrop, drag handle)
- Phase 1.5 already establishes the FAB sheet pattern — this reuses that structure

**Option C — Stats tab in outcome detail (inline scroll)**
- Two tabs in the outcome detail view: "Actions" (default) | "Stats"
- Switching tabs swaps the scrollable content area
- Medium build cost; clean UX but adds a tab pattern not elsewhere in the mobile design

PM recommendation: **Option A** for v1 (inline collapsed), revisit Option B if user feedback says the stats are too buried.

### What does NOT change

- Desktop right panel is untouched
- The stats data comes from the existing `/api/outcomes/:id/stats` endpoint (no backend changes)
- `renderRightP2()` in `public/index.html` is the source of truth for the stats content — on mobile, pull the same data and render a simplified version

---

## Workstream B — Mobile Polish Pass

This workstream is gated on Phase 1.5 shipping and real-device testing. Do not guess at what needs polish before testing on an actual iPhone in Safari.

### Known items to evaluate in testing

1. **Scroll momentum** — Does the action checklist in Phase 2 scroll smoothly on iOS Safari? The existing `overflow-y-auto` on `#centerContent` may need `-webkit-overflow-scrolling: touch` or the modern equivalent.

2. **Keyboard push-up** — When the FAB input sheet is open and the iOS keyboard appears, does the input stay visible above the keyboard? Test with `visualViewport` listener or `position: fixed` adjustment.

3. **Phase 2 back navigation** — When a user drills into an outcome (Phase 2) via the Outcomes tab, there's no "back" button to return to the outcomes list. A back button or breadcrumb in the Phase 2 header is needed. This was not in Phase 1.5 scope.

4. **FAB visibility in Phase 2** — The FAB (Quick Capture) is always visible. When the user is inside an outcome's action checklist, the FAB is still appropriate (capture an action, assign it to this outcome). Confirm it feels right or add a "hide FAB in Phase 3" rule.

5. **Outcome card tap area** — In Phase 1 (outcomes list) on mobile, tapping an outcome card navigates to Phase 2. Confirm the entire card is tappable, not just the title text.

6. **Sidebar content on Home tab** — After 1.5 ships, evaluate whether the full sidebar content (projects list, recently closed, metrics footer) is useful in the mobile Home panel or whether it should be trimmed to: date + Quick Capture + active outcomes only. Less is better on mobile.

7. **`⌘K` label visibility** — The desktop command palette shows `⌘K` hints on outcome cards. These labels don't apply on mobile. Hide them below the breakpoint.

### Explicit non-goals for 1.6

- Animated gesture-driven drawer (swipe to reveal sidebar) — too much vanilla JS complexity for the value
- Pinch-to-zoom anything
- Pull-to-refresh
- Any changes to the desktop layout

---

## Screens Added or Modified in 1.6

| # | Screen | Change |
|---|--------|--------|
| 3 | Outcome detail | Add inline stats summary / Stats sheet (Workstream A decision) |
| 8 | Nav chrome | Add back button in Phase 2 mobile header (Workstream B, item 3) |

All other screens from Phase 1.5 unchanged.

---

## Component Inventory

| Component | Description | Complexity |
|-----------|-------------|------------|
| Inline stats summary | Single collapsed line in outcome detail header, expandable | Low |
| Stats bottom sheet (if Option B chosen) | Reuses FAB sheet pattern from 1.5 | Low–Medium |
| Phase 2 back button | Small `← Outcomes` button in outcome detail header, mobile-only | Low |

---

## Prerequisites Before Building

- [ ] Phase 1.5 shipped and approved by PM
- [ ] Real-device testing completed — Workstream B items triaged (fix / defer / won't fix)
- [ ] Workstream A design decision made (Option A / B / C) and logged in `key_decisions/decisions_log.md`
- [ ] If Option B chosen: confirm with engineer that the FAB sheet pattern from 1.5 is clean enough to reuse

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 1.6 - Mobile Stats & Polish.md`. Log: which Option was chosen for Workstream A, which Workstream B items were fixed vs. deferred, and any new decisions in `key_decisions/decisions_log.md`. Flag for PM review when checklist is complete.
