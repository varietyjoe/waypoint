# Phase 1.5 — Mobile Bugs

*Found during PM real-device testing, Feb 20 2026. Tested on iPhone via mobile Safari.*

---


## Joe brain dump while holding the baby
- can’t add a new outcome from the outcomes page (error says to use quick capture on the left which obviously isn’t there on mobile)
- there’s just no results page, 


## Bug 1 — Home tab shows full-screen whitespace before content

**Severity:** Blocker
**Status:** Open

**What happens:** Tapping the Home tab shows a blank full-screen gap. You have to scroll down to reach the actual Home panel content.

**Root cause:** `setMobileTab('home')` hides the `<main>` center panel but not the three-column wrapper div (`.column-wrapper`). That wrapper has `height: calc(100vh - 48px)` as an inline style, so it still occupies full viewport height even with its children hidden — pushing `#mobileHomePanel` below the fold.

**Fix:** In `setMobileTab()`, hide the `.column-wrapper` div when switching to Home, and show it again when switching to any other tab:

```js
function setMobileTab(tab) {
  const colWrapper = document.querySelector('.column-wrapper')

  if (tab === 'home') {
    currentPhase = 0
    renderMobileHome()
    document.getElementById('mobileHomePanel').classList.remove('hidden')
    if (colWrapper) colWrapper.classList.add('hidden')       // ← add
  } else {
    document.getElementById('mobileHomePanel')?.classList.add('hidden')
    if (colWrapper) colWrapper.classList.remove('hidden')    // ← add
    if (tab === 'outcomes') setPhase(1)
    if (tab === 'inbox')    openInboxView()
  }
}
```

---

## Bug 2 — "Ask AI" in FAB sheet throws: "undefined is not an object (evaluating 'result.type')"

**Severity:** Blocker
**Status:** Open

**What happens:** Tapping "Ask AI" in the FAB sheet and submitting a message throws a JavaScript error in Safari. Claude never responds.

**Root cause:** `result` is `undefined` before `.type` is accessed. Two likely causes:

1. **Wrong response key** — the `/api/chat` endpoint returns different shapes by mode in. Regular mode: `{ success: true, response: "...", actions: [] }`. Tools mode: `{ success: true, data: { type, tool_name, tool_input } }`. If `submitFabAI()` reads `json.data` but the endpoint returned the regular-mode shape, `json.data` is `undefined`.

2. **Unvalidated result** — `submitFabAI()` may be passing the response into a handler (likely the ⌘K palette's result handler) without checking whether `result` is defined first.

**Fix:** In `submitFabAI()`:
- Confirm the fetch reads from the correct response key for whichever endpoint/mode is being called
- Add a null guard before accessing `.type`: `if (!result) { showToast('Something went wrong', 'warning'); return }`

---

## Gap 3 — Cannot edit energy type (Deep / Light) on existing actions

**Severity:** Medium
**Status:** Pre-existing gap — not a 1.5 regression
**Affects:** Desktop and mobile

**What happens:** The Deep / Light badge on action rows is a static `<span>` with no click handler. There is no UI path to change an action's energy type after it is created.

**Note:** This gap is more noticeable on mobile where the ⌘K palette is harder to reach. On desktop, energy type can be set during `break_into_actions` preview, but there is no edit flow for existing actions.

**API is ready:** `PUT /api/actions/:id` accepts `energy_type`. The backend can handle it; the frontend just has no edit UI.

**Suggested fix (future phase):** Tap the energy badge to toggle between Deep / Light inline, calling `PUT /api/actions/:id` on change. Low build cost — no modal needed.

---

## Gap 4 — Cannot edit outcome priority after creation

**Severity:** Medium
**Status:** Pre-existing gap — not a 1.5 regression
**Affects:** Desktop and mobile

**What happens:** The priority badge (Critical / High / Medium) on outcome cards is a static `<span>` with no click handler. There is no UI path to change an outcome's priority after it is created.

**API is ready:** `PUT /api/outcomes/:id` accepts `priority`. The backend can handle it.

**Suggested fix (future phase):** Tap the priority badge to cycle through values (Critical → High → Medium → back), calling `PUT /api/outcomes/:id` on change. Or include priority as an editable field in an outcome edit sheet.

---

## Gap 5 — Cannot edit outcome deadline after creation

**Severity:** Medium
**Status:** Pre-existing gap — not a 1.5 regression
**Affects:** Desktop (partially — Claude's `bulk_reschedule` tool can change deadlines) and mobile (fully blocked — no ⌘K access)

**What happens:** The deadline badge on outcome cards is a static `<span>` with no click handler. On desktop, deadlines can be changed indirectly via the ⌘K `bulk_reschedule` tool. On mobile, the FAB sheet's AI mode is broken (Bug 2), so there is no path at all.

**API is ready:** `PUT /api/outcomes/:id` accepts `deadline`.

**Suggested fix (future phase):** Tap the deadline badge to open a date picker inline, calling `PUT /api/outcomes/:id` on change. On mobile, a native `<input type="date">` would be appropriate.

---

## Summary

| #   | Bug                           | Severity | Regression?                             | Blocks 1.5 approval? |
| --- | ----------------------------- | -------- | --------------------------------------- | -------------------- |
| 1   | Home tab whitespace           | Blocker  | Yes — 1.5 bug                           | Yes                  |
| 2   | Claude AI error in FAB sheet  | Blocker  | Yes — 1.5 bug                           | Yes                  |
| 3   | Can't edit action energy type | Medium   | No — pre-existing I gap                 | No                   |
| 4   | Can't edit outcome priority   | Medium   | No — pre-existing gap                   | No                   |
| 5   | Can't edit outcome deadline   | Medium   | No — pre-existing gap (worse on mobile) | No                   |

**1.5 approval is blocked by Bugs 1 and 2.** Gaps 3–5 are pre-existing and should be evaluated for a future phase — likely candidates for Phase 1.6 polish or a dedicated Phase 1.7 inline editing pass.
