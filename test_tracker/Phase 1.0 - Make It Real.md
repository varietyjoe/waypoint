# Test Tracker — Phase 1.0: Make It Real

**Status:** Not Started
**Sign-off required before:** Starting Phase 1.1

---

## What to Test

**Data persistence:**
- [ ] Create a project → refresh → project still exists
- [ ] Create an outcome within a project → refresh → outcome still exists
- [ ] Create actions within an outcome → refresh → actions still exist
- [ ] Check off an action → refresh → action still shows as done
- [ ] Archive an outcome → refresh → outcome gone from active list

**UI interactions:**
- [ ] Add action via inline input at bottom of action list
- [ ] Quick capture creates an unassigned action
- [ ] Project list in left sidebar shows real projects
- [ ] Outcomes mini-list in sidebar shows active outcomes only
- [ ] Archived outcome does not appear in Phase 1 card grid

**API sanity:**
- [ ] `GET /api/outcomes` returns correct data structure
- [ ] `PATCH /api/actions/:id/toggle` flips done and sets done_at
- [ ] `POST /api/outcomes/:id/archive` sets status correctly
- [ ] Old `/api/tasks` routes return 404

**Cleanup verification:**
- [ ] `GET /` serves v2.html (not v1)
- [ ] No console errors on page load
- [ ] No 404s for JS/CSS assets
- [ ] v1 `public/index.html` and `public/app.js` gone

---

## Test Results

| Date | Tester | Pass/Fail | Notes |
|---|---|---|---|
| — | — | — | — |

---

## Issues Found

None yet.

---

## Sign-off

- [ ] Engineer: all completion checklist items done
- [ ] PM: reviewed and approved
- [ ] Clear to begin Phase 1.1
