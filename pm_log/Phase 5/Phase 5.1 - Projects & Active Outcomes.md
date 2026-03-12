# Phase 5.1 — Projects & Active Outcomes

**Status:** Revised — post-CVO review
**Depends on:** Phase 5.0 complete ✅
**CVO review:** `pm_log/Phase 5/Phase 5.1 - CVO Review.md`

---

## The Problem Worth Solving

Right now you can have 10 active outcomes and no answer to "what am I actually doing today." Every time you open Waypoint, you re-scan the list and re-decide. Nothing has gravity. Nothing says *this is the one*. The result is the same as having no system at all — you're productive at deciding what to work on instead of working on it.

**Activation is the answer.** It's the explicit act of saying: this is what I'm committed to today. Not browsing. Not "in my backlog." Committed. Phase 5.1 ships the manual version of this moment. A future phase will have Claude propose the activation set each morning based on your calendar, deadlines, and patterns — and you'll confirm it. But the foundation — the data model, the UI surface, the behavioral contract — gets built here.

This is one of the most important behavioral moments in the product. The brief reflects that.

---

## What This Phase Delivers

By the end of 5.1:
- Outcomes can be **activated** — explicitly committed to — and appear pinned in an "IN PROGRESS" strip at the top of the dashboard
- Activation has intentional friction past 3 outcomes: a prompt that preserves agency but creates focus
- An `activation_note` captures what you intend when you commit, seeding the future Today view
- Activated outcomes float to the top of the sidebar list and carry a distinct visual weight
- Projects are clickable and creatable — sidebar project items filter the view, a "New project" button creates inline
- Tiny task title truncation fixed as a 5.0.1 patch (see note at bottom)

---

## Primary Feature: Outcome Activation

### The Concept

Activating an outcome is not the same as marking it "active" (that's what `status = 'active'` means — not archived). Activation is a spotlight. It answers: "of all the things on my plate, what am I doing *today*?"

When you activate an outcome, two things happen:
1. It moves to the "IN PROGRESS" strip at the top of Phase 1 — the committed-work zone
2. You're prompted for an optional `activation_note`: *"What's your intention for this today?"* One sentence. Optional. This is not a required field — but it's the seed of the committed day. When the Today view ships, this becomes the bridge.

### Activation UX

**Activating:**
- Outcome cards in Phase 1 show an "Activate" button on hover — pill-shaped, understated, same weight as "Start executing →"
- On click: a small inline prompt appears directly on the card: *"What's your intention for this today? (optional)"* with a text input and a "Commit →" button. Pressing Enter or clicking Commit saves it. Pressing Escape cancels.
- Activated outcome moves to the IN PROGRESS strip immediately

**The 3-outcome friction prompt:**
- If the user attempts to activate a 4th (or more) outcome, a toast-style prompt fires: *"You already have 3 things in progress. Adding more reduces the focus signal. Still activate?"* with Confirm / Cancel. Not a hard block. A moment of intention.
- The cap is a soft behavioral nudge — power users can override it. The nudge is the point.

**The IN PROGRESS strip:**
- Appears above the regular outcomes list in Phase 1 when at least one outcome is activated
- Header: `IN PROGRESS` in the same `text-gray-400 font-semibold uppercase tracking-wider` style as other section headers
- Each activated outcome shows: title, progress bar, `activation_note` (if set, in muted italic below the title), and a `● In Progress` deactivation pill
- Clicking the pill deactivates — clears `is_active` and removes from strip

**Archiving behavior:**
- Archiving an activated outcome auto-clears `is_active = 0`
- No special ceremony in 5.1 — the completion moment will be amplified in a future phase when the full Today view ships

### Sidebar changes

- Activated outcomes float to the **top** of the sidebar outcomes list (sort by `is_active DESC, created_at DESC`)
- Activated outcomes get a `●` prefix dot in the project color
- The "ACTIVE" section header gains a count split: `ACTIVE  2 in progress · 5 total`

### Future state (one sentence for the engineer)

Phase 5.1 ships manual activation. A future phase will have Claude propose the activation set each morning based on calendar availability, deadlines, and work patterns — and the user confirms it. The `is_active` flag and `activation_note` field are designed to support that; build them accordingly.

---

## Supporting Work: Projects

### Clickable Sidebar Projects

Clicking a project row in the sidebar calls `setProjectFilter(p.id)` (already exists) and navigates to Phase 1. Active project is highlighted with a filled background using the project's color at low opacity (`background: ${p.color}20`).

The sidebar project rows currently have no `onclick`. One-line addition.

### New Project Button

A "New project" link in the Projects sidebar section, styled identically to the "View all" button in the Active Outcomes section: `font-size:10px`, `text-blue-500 hover:text-blue-600 font-medium`.

**Creation flow:**
- Click "New project" → inline form expands in the sidebar (no modal)
- Fields: project name (text input) + color swatch picker (6 preset colors, circle buttons)
- Press Enter or click checkmark → `POST /api/projects` → appears immediately in sidebar and Phase 1 filter tabs
- Press Escape to cancel

**Preset colors:** `#818cf8` (indigo), `#4ade80` (green), `#f87171` (red), `#fb923c` (orange), `#38bdf8` (sky), `#a78bfa` (violet)

---

## Data Model Changes

```sql
-- outcomes table
ALTER TABLE outcomes ADD COLUMN is_active INTEGER DEFAULT 0;
ALTER TABLE outcomes ADD COLUMN activation_note TEXT;
```

Both columns added via guarded migrations in `initOutcomesTable()`. `activation_note` is nullable and optional — never required.

---

## API Changes

No new routes needed.

| Method | Route | Change |
|---|---|---|
| `PUT /api/outcomes/:id` | (existing) | `is_active` and `activation_note` handled by existing update logic — verify they're not filtered out |
| `GET /api/outcomes?status=active` | (existing) | Returns both new fields via `SELECT *` — no change |
| `POST /api/projects` | (existing) | Already works — no change |

**One verification required:** Check that `PUT /api/outcomes/:id` in `src/routes/api.js` and `updateOutcome()` in `src/database/outcomes.js` do not have a hardcoded allowed-fields list that would silently drop `is_active` and `activation_note`. If they do, add both fields.

---

## Files Touched

| File | What changes |
|---|---|
| `src/database/outcomes.js` | Add `is_active` + `activation_note` migrations; verify `updateOutcome()` allows both fields |
| `public/index.html` | Sidebar: project `onclick` + highlight; New Project inline form + handler; `renderPhase1()`: IN PROGRESS strip + Activate button + inline note prompt + soft cap friction; sidebar Active count + activated sort; `renderSidebarOutcomes()` sort update |

Two files. No new files.

---

## Definition of Done

**Activation (primary):**
- [ ] `is_active INTEGER DEFAULT 0` and `activation_note TEXT` added via guarded migrations
- [ ] `updateOutcome()` and `PUT /api/outcomes/:id` accept both new fields
- [ ] Outcome cards in Phase 1 show "Activate" button on hover
- [ ] Clicking Activate shows inline `activation_note` prompt on the card (optional, Enter/Escape)
- [ ] Activated outcome moves to IN PROGRESS strip at top of Phase 1 immediately
- [ ] IN PROGRESS strip shows title, progress bar, activation_note (if set), and `● In Progress` deactivation pill
- [ ] Deactivating clears `is_active` and removes from strip
- [ ] 4th activation triggers soft friction prompt: "You already have 3 things in progress..." with Confirm/Cancel
- [ ] Archiving an outcome clears `is_active`
- [ ] Activated outcomes float to top of sidebar outcomes list
- [ ] Activated outcomes have `●` prefix dot in sidebar
- [ ] Sidebar Active section header shows `N in progress · N total`

**Projects (supporting):**
- [ ] Sidebar project rows have `onclick` calling `setProjectFilter(p.id)`; active project gets highlighted background
- [ ] "New project" link appears in sidebar Projects section, styled like "View all"
- [ ] New project inline form: name input + 6 color swatches, Enter to save, Escape to cancel
- [ ] `POST /api/projects` called on save; new project appears in sidebar and Phase 1 tabs immediately

**No regressions:**
- [ ] Existing outcome/project/action flows unchanged
- [ ] `setProjectFilter()` still works from Phase 1 tab buttons
- [ ] Archive flow clears `is_active` without breaking existing archive logic

---

## Out of Scope for 5.1

- **Tiny task expand-on-click** — this is a 5.0 patch, not a 5.1 feature. Fix it as a follow-up to Phase 5.0.
- Claude-proposed activation (Today view) — future phase
- Activation ceremony on close — future phase (amplified with Today view)
- Project deletion or editing — future phase
- Per-project Claude intelligence — future phase
