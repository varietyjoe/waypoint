# Dev Tracker — Phase 5.1: Projects & Active Outcomes

**Status:** In Progress

---

## Completion Checklist

### Data Model — src/database/outcomes.js
- [ ] is_active INTEGER DEFAULT 0 migration added (guarded)
- [ ] activation_note TEXT migration added (guarded)
- [ ] updateOutcome() allows is_active and activation_note (no silent drop)
- [ ] archiveOutcome() clears is_active = 0 on archive
- [ ] completeOutcome() clears is_active = 0 on complete

### API — src/routes/api.js
- [ ] PUT /api/outcomes/:id passes is_active and activation_note through

### Frontend — public/index.html
- [ ] IN PROGRESS strip renders above outcomes list when activations exist
- [ ] Activated outcomes excluded from regular list
- [ ] Strip shows title, progress bar, activation_note (if set), deactivation pill
- [ ] Deactivation pill clears is_active and removes from strip
- [ ] Activate button visible on hover on non-activated outcome cards
- [ ] Clicking Activate shows inline activation_note prompt on card
- [ ] Enter/Commit saves activation; Escape cancels
- [ ] 4th activation triggers soft friction: confirm prompt fires
- [ ] Archiving an outcome clears is_active
- [ ] Activated outcomes float to top of sidebar list (is_active DESC sort)
- [ ] Activated outcomes show ● prefix dot in sidebar
- [ ] Sidebar Active header shows "N in progress · N total"
- [ ] Sidebar project rows have onclick → setProjectFilter + showPhase(1)
- [ ] Active project row highlighted with color at low opacity
- [ ] "New project" link added to sidebar Projects section
- [ ] New project inline form: name input + 6 color swatches
- [ ] Enter/checkmark saves via POST /api/projects; appears immediately
- [ ] Escape cancels inline form

### No Regressions
- [ ] Existing outcome/project/action flows unchanged
- [ ] setProjectFilter() still works from Phase 1 tab buttons
- [ ] Archive flow works; is_active cleared without breaking archive logic
- [ ] Focus Mode, Today view, Advisor view unchanged
- [ ] Preserved files untouched
