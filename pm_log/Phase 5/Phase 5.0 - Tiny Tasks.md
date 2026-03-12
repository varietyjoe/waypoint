# Phase 5.0 — Tiny Tasks

**Goal:** Surface unassigned, lightweight actions in a compact sidebar tray so nothing falls through the cracks — and auto-classify new one-off captures so they're treated differently from outcome-linked work.

**Status:** Ready to build
**Depends on:** Phase 4.0 complete (Capture Everywhere) ✅

---

## The Problem

Right now, capturing an action without selecting an outcome sends it into the void. The API creates the action, the toast says "Action saved", and there is nowhere in the UI to find it, assign it, or complete it. Unassigned actions are invisible.

Small tasks also feel wrong inside the outcome scaffolding. "Call the electrician" shouldn't require an outcome. It should be captured, done, and gone.

---

## What This Phase Delivers

By the end of 5.0:
- A compact **Unassigned Tray** lives below Quick Capture in the sidebar at all times
- Tiny tasks are auto-classified on capture using a lightweight heuristic (no AI needed)
- From the tray: one-tap complete, assign to an outcome, or snooze for a day
- Snoozed tasks disappear and reappear the next day
- Convert-to-standard available for tasks that grow in scope
- Cap of 5 visible items with overflow count prevents the tray becoming a junk drawer

---

## Scope

### 1. Auto-Classification Heuristic

When an action is captured without an outcome (`outcome_id IS NULL`), classify it as `action_type = 'tiny'` if **all** are true:
- Title length < 60 characters
- Title starts with a simple verb: call, text, email, book, pay, buy, send, check, review, schedule, confirm, cancel, sign, reply, fill, drop, pick, order, ask, remind, print, read — or contains `!tiny` anywhere

Otherwise default to `action_type = 'standard'`.

Classification happens server-side in `POST /api/actions` — no client-side logic.

### 2. Snooze

Add `snoozed_until TEXT` to the `actions` table. `GET /api/actions/unassigned` filters out any row where `snoozed_until > datetime('now')`. Snooze duration: always 1 day.

### 3. Unassigned Tray (Sidebar)

Below the Quick Capture box in the left sidebar. Compact, secondary — not the hero feature.

```
UNASSIGNED  (3)
─────────────────────────────
☐  Call electrician          [assign ▾] [z]
☐  Buy coffee beans          [assign ▾] [z]
☐  Review lease renewal      [assign ▾] [z]
+ 2 more
```

- `[assign ▾]` — dropdown of active outcomes + Save; saves `outcome_id` via existing `PUT /api/actions/:id`
- `[z]` — snooze button; hides item until tomorrow via `POST /api/actions/:id/snooze`
- Checkbox — completes the action immediately; removes from tray
- Cap: 5 visible items; if more, show "**+ N more**" text (no expand in V1)
- Tiny tasks shown first, standard unassigned second
- Empty state: no tray rendered (section collapses entirely when empty)

### 4. Convert to Standard

A tiny task can be promoted via the assign dropdown: select an outcome and save. That single action sets both `outcome_id` (assigned) and `action_type = 'standard'`. The task leaves the tray and appears in the outcome's action list.

---

## Out of Scope (V1)

- Recurring tasks
- AI-based classification
- Separate tiny-task table
- Mobile navigation changes
- Editing snooze duration
- Reordering tray items
- Expanding beyond 5 visible

---

## Data Model Changes

```sql
-- Already done (Phase 4.0 work)
ALTER TABLE actions ADD COLUMN action_type TEXT DEFAULT 'standard';

-- New this phase
ALTER TABLE actions ADD COLUMN snoozed_until TEXT;
```

---

## API Changes

| Method | Route | What it does |
|---|---|---|
| `POST /api/actions` | (modify existing) | Run classifier; set `action_type` when `outcome_id` is null |
| `GET /api/actions/unassigned` | (modify existing) | Filter out snoozed; return `action_type` in response |
| `POST /api/actions/:id/snooze` | **NEW** | Set `snoozed_until = datetime('now', '+1 day')` |
| `PUT /api/actions/:id` | (no change) | Already supports `outcome_id` and `action_type` updates |

---

## Files Touched

| File | What changes |
|---|---|
| `src/database/actions.js` | Add `snoozed_until` migration; update `getUnassignedActions()` to filter snoozed; add `snoozeAction(id)` |
| `src/routes/api.js` | Add classifier call in `POST /api/actions`; add `POST /api/actions/:id/snooze` route |
| `public/index.html` | `UNASSIGNED` global; `loadUnassigned()`; sidebar tray UI; `assignUnassignedAction()`; `snoozeUnassignedAction()`; call `loadUnassigned()` in `init()` |

Four files. No new files created.

---

## Definition of Done

- [ ] Capturing an action without an outcome auto-classifies it (tiny or standard) server-side
- [ ] `GET /api/actions/unassigned` filters out snoozed actions
- [ ] Unassigned tray appears in sidebar when unassigned actions exist
- [ ] Tray is empty/hidden when no unassigned actions exist
- [ ] Tiny tasks listed first in tray
- [ ] Tray caps at 5 visible items; shows "**+ N more**" when there are more
- [ ] Checkbox completes action and removes from tray immediately
- [ ] Assign dropdown lists all active outcomes; saving assigns action and removes from tray
- [ ] Assigning also sets `action_type = 'standard'` (promotes tiny → standard)
- [ ] Snooze hides action until tomorrow; reappears on next load after 24h
- [ ] Quick Capture still works as before; new captures appear in tray if unassigned
- [ ] No regression in outcome/action flows
- [ ] Engineer + PM sign-off
