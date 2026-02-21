# Phase 2.0 — Foundation Fixes

**Goal:** Kill every paper cut that breaks trust. No new features — just make the existing product work completely and correctly.

**Status:** Not Started
**Depends on:** Phase 1.4 complete

---

## Why This Before Anything Else

Phases 2.1+ introduce powerful new capabilities. But if the basic flows are broken or incomplete, those capabilities land on an unstable foundation. A user who gets a "Failed to archive outcome" toast loses confidence in the whole system. Fix the cracks first.

---

## What This Phase Delivers

By the end of 2.0, the user can:
- Archive an outcome and always see the correct success/failure result
- Edit any field on an outcome or action after creation (no more being stuck with a typo or wrong estimate)
- Mark an outcome as "Hit it" or "Didn't land" when closing
- Trust that what they see in the app reflects reality

---

## Scope

### Bug Fix: Archive False Failure

**Problem:** `archiveOutcome()` in the frontend calls `Promise.all([loadData(), loadArchivedOutcomes(), loadTodayStats()])` inside the same try/catch as the archive POST. If any of the three reload calls fails, the catch block shows "Failed to archive outcome" — even though the archive itself succeeded.

**Fix:**
- Show the success toast immediately after `res.ok` is confirmed, before the reload
- Move the reload calls outside (or into a separate try/catch) so reload failures don't mask archive success
- File: `public/index.html`, function `archiveOutcome()`

### Inline Editing — Outcomes

Add edit capability for all outcome fields. Clicking a field value puts it into edit mode inline.

| Field | Input type | Notes |
|---|---|---|
| Title | Text input | Save on blur or Enter |
| Description | Textarea | Save on blur |
| Deadline | Date picker | Clear button to remove |
| Priority | Select (High / Medium / Low) | |
| Impact | Text input | |

- Edit icon (pencil) appears on hover next to each field in the outcome detail view
- PUT to `/api/outcomes/:id` on save — endpoint already exists
- Show a brief inline confirmation ("Saved") on success, no toast needed

### Inline Editing — Actions

Add edit capability for all action fields directly in the action checklist row.

| Field | Input type | Notes |
|---|---|---|
| Title | Text input | Save on Enter or blur |
| Time estimate | Number input (minutes) | Save on blur |
| Energy type | Toggle button (Deep / Light) | Immediate save on click |
| Blocked | Checkbox + text input for reason | Text input appears when blocked is checked |

- Clicking the action title opens it for edit
- Energy type toggle and blocked checkbox save immediately on interaction (no separate save step)
- PUT to `/api/actions/:id` — endpoint already exists

### Success / Fail Toggle on Complete & Close

**Problem:** Phase 3 (Complete & Close) captures reflections but has no way to record whether the outcome was actually achieved — or by how much.

**Fix (Decision #16):** Two fields, shipped together.

**Field 1 — Binary result (required):**
- Required toggle at the top of Phase 3, before reflection fields
- Two prominent buttons: **"Hit it"** and **"Didn't land"**
- Archive button is disabled until one is selected — this is the behavioral change that matters
- Forces honest self-assessment before closing the loop

**Field 2 — Result note (optional):**
- Single-line text input below the toggle, not a textarea
- Placeholder: `"What was the actual result? e.g. '4 meetings booked', 'deck approved at 2x valuation'"`
- No label that implies it's required — visually subtle, placeholder-only
- If left blank, archive proceeds without friction
- Captures magnitude for Phase 3.x pattern memory ("hit 3 of 5 goals" is a different signal than "hit 5 of 5")

**Why both now:** `outcome_result_note` is a second column at near-zero marginal cost. Data not captured in 2.0 is permanently lost when Phase 3.x pattern memory arrives.

**DB migration:**
```sql
ALTER TABLE outcomes ADD COLUMN outcome_result TEXT       -- 'hit' | 'miss' (required, gates archive)
ALTER TABLE outcomes ADD COLUMN outcome_result_note TEXT  -- free text, nullable
```
- Both columns added in `initOutcomesTable()` migration block
- Existing archived outcomes: both null (acceptable — predates this feature)
- Both values passed to `/api/outcomes/:id/complete` in request body

---

## Out of Scope

- Redesigning Phase 3 layout (just add the toggle and wire it up)
- Bulk editing
- Undo/redo
- Any new Claude integration

---

## Definition of Done

- [ ] Archiving an outcome always shows the correct toast — success when archive worked, failure only when archive actually failed
- [ ] All outcome fields editable inline in Phase 1/2 detail view
- [ ] All action fields editable inline in Phase 2 checklist
- [ ] Energy type toggle and blocked checkbox save on click (no save button needed)
- [ ] Phase 3 shows Hit it / Didn't land toggle, archive button disabled until one is selected
- [ ] Result note input is present, visually subtle, single-line, placeholder-only — no label implying required
- [ ] Leaving result note blank does not block archive
- [ ] Both `outcome_result` and `outcome_result_note` stored in DB and returned in outcome data
- [ ] No regressions on existing archive, action toggle, or phase navigation
- [ ] Engineer + PM sign-off
