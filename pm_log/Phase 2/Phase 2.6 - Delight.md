# Phase 2.6 — Delight

**Goal:** Every win feels earned. The product celebrates with you. Checking off the last action, closing an outcome, or ending a Focus session should feel like something — not like updating a spreadsheet.

**Status:** Not Started
**Depends on:** Phase 2.0 complete (foundation solid before layering delight on top)

---

## Philosophy

Delight is not decoration. It's feedback. When you check off an action, the animation tells your brain "that counted." When confetti fires, you feel the win. When the streak ticks up, you want to keep it going.

Every moment of delight in this phase should be tied to a real user accomplishment — not random animation. No sparkles on hover. Confetti on outcomes closed.

---

## What This Phase Delivers

By the end of 2.6:
- Checking off actions has a satisfying, tactile feel
- Completing all actions on an outcome triggers a visible celebration before "Complete & Close" appears
- Archiving an outcome is a moment, not a button click
- The dashboard shows a streak counter that makes you want to come back tomorrow
- Sound is available (off by default)

---

## Scope

### 1. Checkbox Micro-Animation

**Current state:** Checkbox toggle is instant, basic.

**New state:** Spring-physics check animation:
- On check: checkmark draws in with a quick spring (scale 0 → 1.1 → 1.0, 150ms)
- Row title gets strikethrough with a wipe-right animation (not instant)
- Subtle row background flash: white → light green → transparent (200ms)
- On uncheck: reverse, no flash

Implementation: CSS keyframes + a brief JS class add/remove on the action row. No library needed.

### 2. All Actions Complete — Celebration State

When the last unchecked action is checked off in Phase 2:

**Step 1 (immediate):** The progress bar at the top animates to 100% and turns green (already transitions, just make it feel better — longer easing, slight overshoot).

**Step 2 (500ms delay):** Confetti fires. Use `canvas-confetti` (CDN, ~12kb, no build step).
- Duration: 2.5 seconds
- Colors: `['#4ade80', '#22d3ee', '#a78bfa', '#f59e0b']` (green, teal, purple, amber)
- Spread from top-center of the viewport

**Step 3 (simultaneous with confetti):** A completion banner slides down from the top of the Phase 2 content area:
```
✓ All done · [outcome title]
[Complete & Close →] button
```
Banner has a celebration feel: green background, white text, slight shadow. Not a toast — it stays until dismissed or clicked.

### 3. Archive Moment

**Current state:** Archive button → reload → back to dashboard. Toast at the bottom says "Outcome closed."

**New state:**
1. Archive button click → button shows loading spinner briefly (300ms)
2. Full-center overlay fades in (dark, semi-transparent) with:
   ```
   ✓  Outcome closed
   [Outcome title]

   [X actions completed]  [X hours of work]  [Hit it / Didn't land]

   "Well done."
   ```
3. Overlay auto-dismisses after 2.5 seconds (or user clicks anywhere to dismiss early)
4. App reloads to dashboard behind the overlay, so when it dismisses it's already fresh
5. Then the regular toast optionally re-confirms (or remove the toast — the overlay is enough)

### 4. Streak Counter

New element in the left sidebar below the project list:

```
🔥 3-day streak
5 outcomes closed this week
```

- Streak = consecutive days with ≥1 outcome archived
- Uses `getTodayStats()` endpoint data already available
- Add `streak_days` to the stats endpoint response (calculate from `outcomes` table `archived_at` column)
- Counter updates each time an outcome is archived (no page reload needed — update in place after archive)

### 5. Focus Mode — Session End Moment

When user exits Focus Mode (ESC):
- Brief terminal fade: screen brightens slightly, then fades back to the main app
- If the associated action was checked off during the session: small toast on return — "Action done. Session saved."
- If not: "Session saved. Pick up where you left off."

### 6. Sound (Optional, Off by Default)

A settings toggle: "Sounds · On / Off"

If on:
- Action check: soft click (like a mechanical keyboard key)
- All actions complete: short ascending chime
- Archive: warm success sound

Sound files: three tiny `.mp3` or `.ogg` files in `/public/sounds/`. Use the Web Audio API or simple `<audio>` elements. If this adds complexity, defer to a later polish pass.

---

## Out of Scope

- Gamification beyond streaks (points, levels, badges — not the product vision)
- Sharing achievements
- Animated onboarding
- Haptic feedback (mobile-only, evaluate in Phase 2.7)

---

## Definition of Done

- [ ] Action checkbox has spring micro-animation on check/uncheck
- [ ] Row strikethrough animates with wipe-right on check
- [ ] Progress bar animates smoothly to 100% when last action checked
- [ ] Confetti fires when all actions on an outcome are complete
- [ ] Completion banner slides in with "Complete & Close →" CTA
- [ ] Archive produces full-center overlay with stats summary, auto-dismisses in 2.5s
- [ ] Sidebar shows streak counter and weekly outcome count
- [ ] Streak counter updates in real time after each archive
- [ ] Focus Mode exit has brief transition back to main app
- [ ] Sound toggle in settings works (on/off persists in localStorage)
- [ ] If sounds on: action check, completion, and archive have distinct sounds
- [ ] No layout regressions — delight is additive, nothing breaks
- [ ] Engineer + PM sign-off
