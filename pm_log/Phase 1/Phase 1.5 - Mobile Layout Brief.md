# Phase 1.5 — Mobile Layout Brief

---

## Message to send

> Hey — we're ready to kick off Phase 1.5. This is the mobile layout pass for Waypoint. The app is fully functional on desktop but doesn't work on mobile at all yet — fixed columns, tiny font sizes, no touch targets. The brief below has everything you need: what exists today, the screens to design, open questions you'll need to resolve, and constraints for the engineer. Before you finalize anything, plan a quick 20-min sync with [engineer] so the navigation model you pick doesn't create unnecessary build work — I've flagged the structural things he needs to weigh in on. Lmk if you have questions.

---

## Overview

Waypoint is a personal execution OS — it helps a single user manage Projects → Outcomes → Actions. The app runs locally as a Node.js server and is accessed in-browser. The backend, data model, and feature set are all fixed for this phase. **Phase 1.5 is a layout and UX layer only** — no new functionality.

The primary mobile scenario is lightweight: the user is away from their desk and wants to capture a thought, tick off an action, check what's in progress, or review something in their inbox. Full power-user sessions stay on desktop.

Target device: iPhone (primary). The app is accessed via mobile Safari on the same WiFi network as the server.

---

## What exists on desktop

### Structure

- Fixed 48px header with three zones: Logo (left, 256px) | Phase indicator (center, flex) | Inbox icon + User avatar (right, 288px)
- Three hardcoded columns below the header: **Left sidebar** (256px) | **Center panel** (flex) | **Right panel** (288px)
- `overflow: hidden` on `<body>` — intentional on desktop, breaks mobile entirely
- No responsive breakpoints anywhere in the codebase
- Font sizes run 10–15px throughout; touch targets (checkboxes, buttons) are 15px or smaller

### Left sidebar

Always visible. Contains:
- Date + Focus mode toggle
- **Quick Capture** — text input + outcome picker dropdown. Press Enter to save as an action. This is the most-used mobile feature.
- Today's progress bars (one bar per active outcome)
- Active outcomes mini-list (tap to open that outcome in Phase 2)
- Projects list
- Recently closed outcomes
- Today's metrics (outcomes closed + actions done)

### Center panel — four views, phase-routed

| Phase | View | What it shows |
|-------|------|---------------|
| 1 | Outcomes list | Cards: title, progress bar, priority badge, deadline badge, action count |
| 2 | Outcome detail | Sticky header (title + progress), scrollable action checklist, inline "Add action" input at bottom |
| 3 | Complete & Close | Completion stats card, three reflection textareas, Archive CTA |
| 4 | Inbox | AI-classified items from Slack: title, classification badge, AI reasoning, approve/dismiss actions + assignment pickers |

### Right panel — contextual per phase

| Phase | Content |
|-------|---------|
| 1 | Workspace overview: total work queued, deep/light work split bar, deadline risk rows for each outcome |
| 2 | Execution intelligence: SVG ring progress chart, time breakdown (total/done/remaining), deep vs. light split, deadline risk with minutes-per-day calculation |
| 3 | Completion snapshot stats |
| 4 | Inbox stats (pending, approved, outcomes found, actions found) |

### Navigation

Phase is switched via a pill indicator in the header center (⌘1 / ⌘2 / ⌘3 for phases, ⌘4 for inbox). **Phase 1.4 (shipping soon) adds a ⌘K AI command palette** — a full-screen modal where the user types natural language to create or query outcomes and actions. This needs a touch equivalent in the mobile design.

---

## Problems to solve

1. **Three-column layout** — no responsive breakpoints; sidebars are fixed-width and don't collapse
2. **No scrolling** — `overflow: hidden` on body is intentional on desktop; needs to be overridden per-view on mobile
3. **Font sizes** — 10px labels are unreadable on mobile; 15px checkboxes and icon-only buttons have no usable touch target
4. **Phase navigation** — the header pill indicator has no room on a 390px screen
5. **Right panel disappears** — the intelligence/stats content is currently only accessible in the desktop right column
6. **⌘K AI palette** — keyboard-only shortcut needs a touch entry point
7. **Inbox badge** — currently a small dot on the inbox icon in the header; needs a home in the mobile nav

---

## Open questions for the designer to resolve

These are design decisions, but resolve them in the sync with the engineer before finalising — each has different build cost in vanilla JS.

### 1. Navigation model
How do users move between the four primary views on mobile?
- **Bottom tab bar** (Home / Outcomes / Inbox / AI) — simplest to build, conventional, but four tabs may be one too many
- **Stacked navigation** (Home → Outcomes list → Outcome detail) with a back button, Inbox accessible via header badge
- **Drawer** for sidebar content, tabs for Outcomes / Inbox / AI at the bottom

### 2. Quick Capture placement
The most important mobile interaction. Where does it live?
- Floating action button (FAB) — always thumb-reachable, opens an input sheet
- Persistent sticky input at the bottom of the screen (above nav)
- Dedicated tab in the bottom nav

### 3. Right panel stats on mobile
The execution intelligence panel (ring chart, time breakdown, deadline risk) is dense and power-user. On mobile:
- **Bottom sheet** — triggered by a "Stats" tap in the outcome detail header
- **Inline collapsed summary** — just the progress % and one key number, expanded on tap
- **Desktop-only** — drop it from mobile v1 entirely (valid call)

### 4. AI Co-pilot touch entry (Phase 1.4)
⌘K becomes what on touch?
- Floating AI button (distinct from Quick Capture FAB)
- Dedicated tab in bottom nav
- Bottom sheet triggered from a header icon
- Combined with Quick Capture (one input, context-aware)

---

## Screens to design

| # | Screen | Source |
|---|--------|--------|
| 1 | Home / Glance | Left sidebar content |
| 2 | Outcomes list | Phase 1 center |
| 3 | Outcome detail + action checklist | Phase 2 center |
| 4 | Execution stats (however you solve Q3) | Phase 2 right panel |
| 5 | Complete & Close | Phase 3 center |
| 6 | Inbox | Phase 4 center |
| 7 | AI Co-pilot entry + palette | ⌘K modal (Phase 1.4) |
| 8 | Navigation chrome | Header + phase indicator |

---

## Engineer sync agenda (20 min)

Flag these for the engineer before finalising:

**Structural constraints he needs to weigh in on:**

- The `overflow: hidden` on `<body>` is a JS architecture issue, not just CSS — the center panel is re-rendered in JavaScript on every phase change. Responsive restructuring touches those render functions, not just the layout layer. He needs to know what your nav model is before he can scope the work.
- The sidebar content (Quick Capture, progress, outcomes mini-list) doesn't live in static HTML — it's JavaScript-rendered. Moving it to a different mobile location requires changes to those render functions.
- Vanilla JS only, no component library. Animated gesture-driven drawers and sheets are real engineering work. Simple tab-switching is trivial. Pick the simplest interaction that solves the problem.

**Questions to answer in the sync:**
1. What's the cheapest nav model to build given the current JS architecture?
2. Is an animated bottom sheet feasible, or should stats be inline only?
3. What breakpoint(s) should the responsive split happen at? (`640px`? `768px`?)

---

## Constraints

- **Single codebase** — Tailwind responsive prefixes (`sm:`, `md:`) on the existing `index.html`. No separate mobile build, no React, no app framework.
- **No component library** — vanilla JS only. Don't spec interactions that require a JS UI framework.
- **Touch targets** — minimum 44×44pt per Apple HIG. Every checkbox, button, and tappable row needs to meet this.
- **Don't break desktop** — all changes are additive responsive overrides. The desktop three-column layout must remain unchanged above the agreed breakpoint.
- **Local server, same WiFi** — no offline mode or service worker needed. Assume the server is always reachable.
- **Tailwind CDN** — using the CDN version of Tailwind (not a compiled build), so custom config is limited. Stick to built-in utility classes.

---

## Deliverables

- Layouts for all 8 screens (iPhone 14 Pro / 390×844 frame)
- Resolved answers to the 4 open questions, noted in the file
- Annotated specs: breakpoint(s), touch target callouts, interaction notes (what triggers what, what dismisses what)
- Explicit call-out of anything that should remain **desktop-only** in this phase
- A simple component inventory — what new elements are being introduced (FAB, bottom sheet, tab bar, etc.) so the engineer can scope them independently

---

## Resolved Decisions

*Locked Feb 20, 2026.*

### Q1 — Navigation model: Bottom tab bar ✅

Four tabs: **Home · Outcomes · Inbox · AI**

- **Home** → mobile-only view rendering the left sidebar content (date, Quick Capture, progress bars, active outcomes mini-list, projects, metrics) in a single-column scroll
- **Outcomes** → calls `setPhase(1)`; tapping an outcome card navigates to phase 2 (detail), then phase 3 (archive) as sub-navigation within the tab
- **Inbox** → calls `openInboxView()`; inbox badge count lives on this tab icon, not the header
- **AI** → opens the FAB sheet in AI mode (see Q4)

Cheapest to build: `setPhase()` already orchestrates render calls. The tab bar is a caller layer on top of it, plus a `currentPhase = 0` Home mode. No navigation stack needed.

**Engineer note:** The sidebar content (Quick Capture, progress bars, active outcomes mini-list) is JS-rendered into specific DOM IDs in the `<aside>`. On mobile, those same render functions need to target a new `#mobileHome` container instead. The render functions require a small refactor to accept a target element, or the mobile Home panel duplicates the IDs — engineer should pick the approach and note it in dev_tracker.

### Q2 — Quick Capture: FAB (opens input sheet) ✅

- Fixed FAB button, bottom-right corner, positioned above the tab bar (bottom offset = tab bar height + 12px)
- Tap → fixed input sheet slides up from bottom: capture input + outcome picker dropdown + mode toggle (see Q4)
- Submit (Enter or button tap) → saves and closes sheet
- Tap outside sheet → dismisses without saving
- No animation library. Show/hide is sufficient. A `transform: translateY` transition (150ms) is acceptable if trivial to add; skip if it adds complexity.

**Engineer note:** `handleQuickCapture()` currently references `#quickCaptureInput` and `#quickCaptureOutcome` by ID. The FAB sheet introduces new elements with different IDs. Refactor `handleQuickCapture(event)` to accept an optional `inputEl, outcomeEl` param pair, defaulting to the existing desktop IDs. This keeps both paths working from one function.

### Q3 — Right panel stats: Desktop-only in Phase 1.5 ✅

Execution intelligence (ring chart, time breakdown, deadline risk, minutes-per-day) does not appear on mobile in this phase. The right `<aside>` is hidden below the breakpoint.

Deferred to **Phase 1.6**. See `pm_log/Phase 1.6 - Mobile Stats & Polish.md`.

### Q4 — AI Co-pilot touch entry: Combined with Quick Capture (mode toggle) ✅

The FAB sheet (Q2) has a two-pill toggle at the top: **Add Action** (default) | **Ask AI**

- **Add Action mode** → current Quick Capture behavior (input + outcome picker, Enter to save)
- **Ask AI mode** → input sends to the ⌘K handler (`/api/chat` with `mode: "tools"`); outcome picker hidden; response renders inline in the sheet
- One FAB, one sheet, one input. No second button, no dedicated AI tab.

If Phase 1.4 ships before 1.5: the AI mode wires to the same `sendWithTools()` path. If 1.4 is still in progress, the AI toggle can be hidden behind a feature flag (`FEATURES.aiPalette`) and activated when 1.4 ships.

---

## Component Inventory (for engineer scoping)

| Component | Description | Complexity |
|-----------|-------------|------------|
| Bottom tab bar | Fixed 4-tab nav bar, 49px tall, above safe area inset | Low |
| FAB button | Fixed circle button, 52×52px, bottom-right | Low |
| FAB input sheet | Fixed bottom panel, show/hide with optional slide transition | Low–Medium |
| Mobile Home panel | `#mobileHome` container; sidebar render functions retarget here | Medium (refactor) |
| Touch target wrappers | Padding/min-height on `.action-check`, icon buttons, tappable rows | Low |
| Inline inbox badge | Badge count moved from header icon to Inbox tab | Low |

Desktop-only (unchanged): right panel, header phase pill indicator, keyboard shortcuts (⌘K, ⌘1–⌘4)

---

## Breakpoint

**640px** (`sm:` Tailwind prefix). Below 640px = mobile layout. Above = desktop three-column unchanged.

All responsive changes are additive overrides — mobile-first where practical, `sm:` prefixes to restore desktop behavior.
