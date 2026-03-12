# North Star Vision Gap Analysis
*Reference: `public/waypoint-vision.html` — 14-screen full vision prototype*
*Written: Feb 22, 2026*

---

## Summary

The vision prototype has 14 distinct screens covering the full product arc. After Phases 1.0–2.6, we're at roughly **45% of the vision built, 40% scoped, 15% not yet on the roadmap**. The one structurally significant unscoped gap is Google Calendar integration. Everything else is small-to-medium additive work.

---

## Built — Phases 1.0–2.6 ✅

| Vision screen | What's live |
|---|---|
| Dashboard (Screen 1) | Outcomes list, progress bars, right panel execution intelligence, confetti + completion banner |
| Execution detail (Screen 2) | Action list, inline editing, blocked actions, phase buttons |
| Close flow (Screen 3) | Reflection form, "Hit it / Didn't land", result notes |
| Archive celebration (Screen 4) | Full-center overlay with stats, confetti, auto-dismiss |
| Focus Mode (Screen 5) | Terminal overlay, streaming Claude conversation, timer, past session memory injection |
| Inbox triage (Screen 8) | Per-item approve/dismiss + batch triage with AI clustering and cluster preview (Screen 9) |
| Memory (Screen 13) | Work Patterns + Saved Outputs sections; 12-fact counter |
| AI Breakdown | ⌘K palette, questions step, context-grounded estimates |
| Streak counter | Sidebar footer, updates after archive |
| Sound toggle | Off by default, Web Audio API tones |

---

## Scoped but not yet built — Phases 3.0–4.3

| Vision screen | Phase | Notes |
|---|---|---|
| Today view — Claude's daily plan, available time calculation (Screen 6) | 3.0 + 3.1 | Calendar integration decision affects scope (see below) |
| Today Active — mid-day state, current task highlighted (Screen 7) | 3.0 | Requires calendar data or manual time blocks |
| Library — saved outputs with tags, search, entry detail (Screen 10) | 3.2 | Vision is richer than current brief implies — see below |
| Analytics — estimate accuracy, completion rate, by-category (Screen 11) | 3.3 | Requires ~20+ closed outcomes to be meaningful |
| Advisor — weekly review observations, pattern insights (Screen 12) | 4.3 | Depends on 3.3 data layer |
| Outcome dependencies — lock icon, waiting-on person (Screen 2 detail) | 4.1 | `blocked_by` field exists in DB, UI not built |
| Status Card — shareable embeddable outcome widget (Screen 14) | 4.2 | Standalone page/embed format |

---

## Not yet scoped — Gaps in the roadmap

### 1. Google Calendar live integration *(significant — blocks Phase 3.0 scope)*

Screens 6 and 7 show real calendar event data pulled live: specific event names, times, and available focus blocks calculated dynamically from calendar gaps. Phase 3.0 is currently scoped as "Calendar + Today View" but the brief does not specify whether this is:

**Option A — Live Google Calendar OAuth integration**
- Pulls events via Calendar API
- Calculates available blocks automatically
- Claude's daily plan is aware of hard commitments
- Infrastructure precedent: Slack OAuth already exists in `src/routes/`, `src/database/oauth-tokens.js`
- Engineering cost: medium-high (new OAuth flow, background sync, event storage)
- This is what the vision shows

**Option B — Manual time block input**
- User tells the app "I have 4h 20m today" or sets recurring availability
- Claude generates a plan against manual blocks
- No external API
- Engineering cost: low-medium
- Gets to the today-plan UX quickly, drops the calendar integration

**Decision needed before Phase 3.0 handoff.** The calendar question changes the scope of 3.0 significantly. If live integration, 3.0 becomes a medium-large phase with an OAuth flow and event sync route. If manual, 3.0 is faster but the vision's calendar-awareness won't land.

---

### 2. Sidebar navigation to all views *(medium)*

The vision sidebar has a "Views" section with Library, Analytics, Advisor, and Memory as clickable nav destinations, with a notification badge on Advisor when a new weekly review is ready. Currently the sidebar doesn't have this nav structure — these destinations (once built) would need to be reachable from a persistent sidebar, not just through ⌘K.

Not currently in any phase brief. Could be scoped as part of 3.2 (Library) or as a standalone nav polish phase.

---

### 3. Recently Closed section in sidebar *(small)*

The sidebar shows 2–3 recently archived outcomes with their closure dates. Not built or scoped. Small addition — could be added to 3.0 or as part of any phase that touches the sidebar.

---

### 4. Project filter tabs on outcomes list *(small)*

"All · GROWTH · PRODUCT" filter buttons above the outcome cards in Screen 1. Not built or scoped. Could be added to any phase — low cost, high utility.

---

### 5. Quick capture input *(small)*

"Add outcome…" quick capture text input below the outcomes list. Not built or scoped. Small addition — could be added alongside Phase 3.0 or a sidebar polish pass.

---

### 6. Library depth — tags and richer entry detail *(medium, relevant to Phase 3.2)*

The vision's Library (Screen 10) is richer than the current Phase 3.2 brief implies:
- Tag system (not just categories) — user-defined tags like `#campaign_draft`, `#email`, `#pitch_deck`
- Tag filter bar (clickable tag pills)
- Full-text search across saved outputs
- Entry detail panel with editable title, source link back to origin outcome, full content preview with "Show more", Copy button, and "Open in Focus →"

The Phase 3.2 brief should be written to cover all of this, not just a basic list view.

---

### 7. Focus Mode recording indicator *(small)*

The vision's Focus Mode shows an active "⏺ recording" indicator alongside the "Save this →" chip. Unclear if this implies audio transcription or just a session-active visual. Low priority, but worth noting.

---

## The Three Things That Matter Most

1. **Decide the calendar question** before writing the Phase 3.0 handoff. It's the biggest structural branch point left on the roadmap.

2. **Expand the Phase 3.2 Library brief** to cover the full vision: tags, search, source linking, rich entry detail. The current brief undersells the screen.

3. **Add sidebar navigation** to one of the 3.x phases. Once Library, Analytics, and Advisor exist, they need to be reachable without friction. The vision treats the sidebar Views section as primary nav.

---

## Vision Coverage by Phase (Rough)

| Stage | Built? | % of vision |
|---|---|---|
| Phase 1.0–2.6 | ✅ Done | ~45% |
| Phase 3.0–3.3 | Scoped | ~25% |
| Phase 4.0–4.3 | Scoped | ~15% |
| Unscoped gaps | ❌ Not on roadmap | ~15% |
