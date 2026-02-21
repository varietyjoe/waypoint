# Phase 1.5 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 1.5 just completed — it added a full mobile layout pass to `public/index.html`: a bottom tab bar, a FAB + input sheet (Quick Capture + AI mode toggle), a Mobile Home panel, responsive single-column layout below 640px, touch target sizing, font size increases, and mobile header simplification. The desktop three-column layout must be completely unchanged above 640px. Read `pm_log/Phase 1.5 - Code Review Handoff.md` in full, then verify every checklist item against the actual codebase. Report what passed, what failed, and any out-of-scope issues. End with a clear verdict: approved, or blocked with specifics. Log your results to `test_tracker/Phase 1.5 - Mobile Layout.md`.

---

You are reviewing Phase 1.5 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these files before touching anything:**
1. `pm_log/Phase 1.5 - Engineer Handoff.md` — full implementation spec (10 sections, all CSS and JS included)
2. `pm_log/Phase 1.5 Mobile Layout Brief.md` — resolved design decisions (nav model, FAB, stats deferral, AI mode)
3. `dev_tracker/Phase 1.5 - Mobile Layout.md` — the working checklist; verify each item is marked complete

**This phase touches only `public/index.html`.** If any file in `src/`, `database/`, or other backend directories was modified, flag it immediately — that is out of scope.

---

## What Was Built

Phase 1.5 is a layout-only pass. No new API endpoints, no backend changes, no new features. Everything lives in `public/index.html`.

The engineer was instructed to pick one of two approaches for the Mobile Home panel sidebar refactor (Section 4 of the handoff) and one of two approaches for font size overrides (Section 7). Both choices should be logged in `dev_tracker/Phase 1.5 - Mobile Layout.md`. Confirm they are.

---

## Review Checklist

### Pre-Build Check

- [ ] `dev_tracker/Phase 1.5 - Mobile Layout.md` shows the sidebar render approach chosen (refactored render functions with container param, or simplified standalone `renderMobileHome()`)
- [ ] `dev_tracker/Phase 1.5 - Mobile Layout.md` shows the font-size approach chosen (CSS class on generated elements, or `!important` override)
- [ ] No files outside `public/index.html` were modified

---

### 1. Breakpoint and Body Overflow

- [ ] `@media (max-width: 640px)` added to the `<style>` block in `<head>`
- [ ] `body { overflow: auto !important; height: auto !important; }` inside that media query
- [ ] The inline `overflow:hidden` and `height:100vh` on `<body>` (line 102) are **unchanged** — `!important` in the media query overrides them on mobile without touching the inline styles

---

### 2. Three-Column Layout → Single Column

- [ ] Class names `left-panel`, `right-panel`, `column-wrapper`, `center-panel` added to the corresponding elements — existing classes and inline width styles unchanged
- [ ] `@media (max-width: 640px)`: left sidebar hidden (`display: none`)
- [ ] `@media (max-width: 640px)`: right sidebar hidden (`display: none`)
- [ ] `@media (max-width: 640px)`: column wrapper stacks vertically
- [ ] `@media (max-width: 640px)`: center panel takes full width
- [ ] Desktop layout above 640px is pixel-identical to before — no regressions

---

### 3. Bottom Tab Bar

- [ ] `<nav id="mobileTabBar">` added before `</body>`, after the toast container
- [ ] `sm:hidden` class on the nav — invisible on desktop
- [ ] Fixed position, bottom-0, full width, 49px height, `z-40`
- [ ] `env(safe-area-inset-bottom)` applied for iPhone home indicator
- [ ] Four tabs: Home, Outcomes, Inbox, AI
- [ ] Inbox tab has `id="mobileInboxBadge"` badge element (hidden by default)
- [ ] `setMobileTab(tab)` function added to JS
- [ ] Home tab → renders Mobile Home panel, hides center panel
- [ ] Outcomes tab → calls `setPhase(1)`, shows center panel
- [ ] Inbox tab → calls `openInboxView()`, shows center panel
- [ ] AI tab → calls `openFabSheet('ai')`
- [ ] Active tab styling toggled via `mobile-tab-active` class
- [ ] CSS rule for `.mobile-tab-active` applies distinct active colour

---

### 4. Mobile Home Panel

- [ ] `<div id="mobileHomePanel">` added immediately after the three-column wrapper
- [ ] `sm:hidden` class — invisible on desktop
- [ ] Hidden by default on mobile (not shown until Home tab tapped)
- [ ] `min-height: calc(100vh - 48px - 49px)` set
- [ ] `renderMobileHome()` function added to JS
- [ ] Home panel renders: date, Quick Capture input + outcome picker, progress bars, active outcomes list — at minimum
- [ ] Tapping an outcome in the Home panel navigates to Phase 2 (outcome detail)

---

### 5. FAB + Input Sheet

- [ ] FAB `<button id="fabBtn">` added — `sm:hidden`, fixed position, bottom-right, 52×52px
- [ ] FAB positioned above tab bar: `bottom: calc(49px + 16px)`
- [ ] `<div id="fabSheet">` added — `sm:hidden`, fixed, bottom of screen, above tab bar, hidden by default
- [ ] `<div id="fabBackdrop">` added — `sm:hidden`, fixed inset-0, hidden by default; tap dismisses sheet
- [ ] Drag handle rendered at top of sheet
- [ ] Two-pill mode toggle: **Add Action** (default) | **Ask AI**
- [ ] `<input id="fabInput">` — `font-size: 16px` (mandatory — prevents iOS Safari zoom)
- [ ] Outcome picker (`<select id="fabOutcomeSelect">`) shown in Add Action mode, hidden in Ask AI mode
- [ ] `openFabSheet(mode)`, `closeFabSheet()`, `setFabMode(mode)` functions added
- [ ] `populateFabOutcomePicker()` mirrors desktop outcome list
- [ ] `handleFabInput(e)` — Enter in Add Action mode submits capture; Enter in AI mode submits AI query
- [ ] `submitFabCapture()` — if `outcomeId` set: posts to `POST /api/outcomes/${outcomeId}/actions`; if null: posts to `POST /api/actions` — **confirm correct routing, not a single flat POST /api/actions for both cases**
- [ ] After successful capture: `closeFabSheet()`, `showToast()`, `loadData()`, `renderAll()`
- [ ] `FEATURES = { aiPalette: false }` declared near top of `<script>` block
- [ ] `submitFabAI()` — if `!FEATURES.aiPalette`: shows "coming soon" toast and returns; does not crash

---

### 6. Touch Targets

- [ ] `@media (max-width: 640px)`: `.action-check` width and height increased to 20px minimum
- [ ] `@media (max-width: 640px)`: `.action-row` has `min-height: 44px`
- [ ] `@media (max-width: 640px)`: `.outcome-card` has `min-height: 44px`
- [ ] `@media (max-width: 640px)`: `.sidebar-outcome`, `.project-row` have `min-height: 44px`
- [ ] Icon-only buttons in header (inbox icon, focus toggle) have 44×44px tap area via wrapper or padding

---

### 7. Font Sizes

- [ ] `@media (max-width: 640px)` overrides increase labels and metadata from 10–11px to at least 12px on mobile
- [ ] Quick Capture `<input>` (desktop sidebar): `font-size: 16px` on mobile — **confirm, as it's currently 11px**
- [ ] FAB `<input id="fabInput">`: `font-size: 16px` — confirm in the HTML
- [ ] Inline "Add action" `<input>` in Phase 2 action list: `font-size: 16px` on mobile — **confirm, as it's currently 12px**
- [ ] Phase 3 reflection `<textarea>` elements: `font-size: 16px` on mobile — **confirm, as they're currently 11px**
- [ ] Approach used (class-based or `!important`) logged in dev_tracker

---

### 8. Header on Mobile

- [ ] `@media (max-width: 640px)`: `#phaseIndicator` hidden (`display: none`)
- [ ] `@media (max-width: 640px)`: `#inboxNavBtn` (header inbox icon) hidden — redundant with Inbox tab badge
- [ ] Logo and user avatar remain visible on mobile
- [ ] Header height (48px) unchanged on mobile

---

### 9. Body Padding for Fixed Elements

- [ ] `@media (max-width: 640px)`: `#centerContent` has `padding-bottom: calc(49px + env(safe-area-inset-bottom) + 16px)`
- [ ] `@media (max-width: 640px)`: `#mobileHomePanel` has the same `padding-bottom`
- [ ] Content in Phase 1, 2, 3, and Inbox views is not obscured by the tab bar at the bottom of the scroll

---

### 10. Inbox Badge — Mobile Tab

- [ ] `updateInboxBadge()` function updated to also target `#mobileInboxBadge`
- [ ] Mobile badge shows same count as desktop header badge
- [ ] Mobile badge hidden when count is 0

---

### Phase 3 (Complete & Close) on Mobile

- [ ] Three `.reflect-area` textareas: `font-size: 16px` on mobile (iOS zoom prevention)
- [ ] Textareas have sufficient `min-height` to be usable on a small screen
- [ ] Archive button and Back button meet 44×44pt touch target

---

### Desktop Regression Check

These must be verified unchanged above 640px. Do not test on mobile for this section — use desktop browser width.

- [ ] Three-column layout (256px left | flex center | 288px right) intact
- [ ] Header three-zone layout intact
- [ ] Phase pill indicator visible and functional
- [ ] Right panel renders correctly for all phases (1, 2, 3, inbox)
- [ ] Quick Capture in left sidebar works as before
- [ ] All keyboard shortcuts (⌘1–⌘4, ⌘K) functional on desktop
- [ ] FAB, tab bar, and mobile home panel are invisible on desktop (`sm:hidden` working)

---

### Preserved Files (Do Not Flag)

Everything outside `public/index.html` must be untouched:
- All files in `src/`
- All files in `database/`
- All files in `pm_log/`, `key_decisions/`, `test_tracker/`

---

## What's Out of Scope

Do not raise issues against:
- Execution intelligence on mobile (ring chart, time breakdown, deadline risk) — deliberately deferred to Phase 1.6
- Animated gesture-driven drawers or swipe interactions — explicit non-goal
- Offline mode or service worker
- Any backend functionality
- AI mode in the FAB sheet not being fully wired — `FEATURES.aiPalette: false` is the correct state until Phase 1.4 is confirmed live

If you spot something clearly wrong but outside Phase 1.5 scope, note it separately — do not block sign-off on it.

---

## When You're Done

Update `test_tracker/Phase 1.5 - Mobile Layout.md` with your findings:
- Fill in the **Test Results** table (date, workstream, pass/fail, notes)
- List any failures under **Issues Found**
- Check the **Sign-off** boxes if approved

If the checklist is clear: signal **approved**. If there are blockers: flag them specifically — what failed, what file, what the spec says it should be.
