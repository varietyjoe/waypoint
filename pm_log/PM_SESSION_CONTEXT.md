# Waypoint — PM Session Context
*Read this first every session.*

---

## PM Instructions

You are the Product Manager for Waypoint — a single-user, personal execution OS. You do NOT write code or edit project files. You keep the project on track, manage scope, write briefs, and coordinate between phases.

**Every session:**
1. Read this file to reorient
2. Ask the user where they want to pick up
3. Pull the relevant phase brief from `/pm_log/` before giving guidance
4. Update this file at the END of every session with what changed
5. Push back when scope creeps — every new idea gets evaluated against the current phase
6. Never write production code — that's for dev agents

**Key folders:**
- `pm_log/` — Phase briefs, notes, this file. Phases organised into subfolders: `Phase 1/`, `Phase 2/`, `Phase 3/`, `Phase 4/`
- `key_decisions/` — All judgment calls, trade-offs, final decisions
- `dev_tracker/` — Phase-by-phase dev progress logs
- `test_tracker/` — Code review briefs and test results
- `REBUILD_PLAN.md` — Full engineering brief (root level, hand to engineer)

---

## Project Summary

Waypoint is a single-user personal execution OS. The user manages work through a **Projects → Outcomes → Actions** hierarchy with an integrated Slack triage pipeline and an Execution Intelligence right panel.

The target frontend is `waypoint-v2.html` — a fully-designed, production-quality static HTML/CSS/JS file that needs to be wired to a real Express/SQLite backend.

**Stack:** Node.js · Express 5 · SQLite (better-sqlite3) · Anthropic SDK · Vanilla JS (no framework)

**Core workflow the product must support:**
1. Morning inbox review — Slack messages triaged overnight, user classifies as Outcome or Action, assigns to project
2. Outcome execution — Pick an outcome, work through actions (deep/light energy tagged), right panel shows deadline risk live
3. Archive ritual — Complete an outcome, capture reflection, close the loop

---

## Phase Status

| Phase | Name                   | Status   | Engineer Sign-off                      |
| ----- | ---------------------- | -------- | -------------------------------------- |
| 1.0   | Make It Real           | Complete | ✅ Approved                             |
| 1.1   | Execution Intelligence | Complete | ✅ Approved                             |
| 1.2   | Input Pipeline         | Complete | ✅ Approved (bugs fixed in 1.3 branch)  |
| 1.3   | Close the Loop         | Complete | ✅ Approved (3 deviations acknowledged) |
| 1.4   | AI Co-pilot            | Complete | ✅ Approved                             |
| 1.5   | Mobile Layout          | Scoped   | —                                      |
| 1.6   | Mobile Stats & Polish  | Scoped   | —                                      |
| 2.0   | Foundation Fixes            | Scoped   | —                                      |
| 2.1   | Focus Mode                  | Scoped   | —                                      |
| 2.2   | User Context Memory         | Scoped   | —                                      |
| 2.3   | AI Breakdown                | Scoped   | —                                      |
| 2.4   | Smart Inbox Triage          | Scoped   | —                                      |
| 2.5   | Persistent Focus Memory     | Scoped   | —                                      |
| 2.6   | Delight                     | Scoped   | —                                      |
| 3.0   | Calendar + Today View       | Scoped   | —                                      |
| 3.1   | Morning Brief               | Scoped   | —                                      |
| 3.2   | The Library                 | Scoped   | —                                      |
| 3.3   | Pattern Memory + Analytics  | Scoped   | —                                      |
| 4.0   | Capture Everywhere          | Scoped   | —                                      |
| 4.1   | Outcome Dependencies        | Scoped   | —                                      |
| 4.2   | Stakeholder Visibility      | Scoped   | —                                      |
| 4.3   | Claude as Advisor           | Scoped   | —                                      |

---

## Where We Left Off

**Session: Feb 20, 2026 (latest)**

Full roadmap session. vision.md read and internalized. Phases 2.0–4.3 scoped. Decisions #16–20 logged. Phase 2.0 engineer handoff written and ready to send to dev. Full-vision design prototype brief written (`pm_log/Design Brief - Full Vision Prototype.md`) for a designer agent to build `waypoint-vision.html`. pm_log reorganised into phase subfolders.

---

## What's Next

1. **Send Phase 2.0 engineer handoff** — `pm_log/Phase 2/Phase 2.0 - Engineer Handoff.md` is ready. Hand to dev agent.
2. **Commission the design prototype** — Send `pm_log/Design Brief - Full Vision Prototype.md` to designer agent. Output: `public/waypoint-vision.html`.
3. **After 2.0 ships:** Phase 2.1 Focus Mode — the heart of the new product. Write engineer handoff at that point.
4. **2.2 → 2.3 → 2.4 → 2.5** — Context memory, AI breakdown, smart inbox, persistent memory. Build in order.
5. **2.6** — Delight layer goes last.
6. **1.5 / 1.6** — Mobile phases. Confirm with user whether to run in parallel with 2.x or defer.

---

## Open Questions / Pending Decisions

### Decision needed: Phase 1.6 Workstream A — Stats on mobile (Option A / B / C)

After Phase 1.5 ships and you've tested on real device, pick one:

---

**Option A — Inline collapsed summary** *(PM recommendation)*
A single line in the outcome detail header: e.g. `3 of 8 done · 2h 15m left · 🟡 At risk`
Tap → expands to full stats inline (accordion).

- Lowest build cost — no new component, just a conditional render in `renderPhase2()`
- Stats are always visible at a glance without an extra tap
- Can feel cluttered if the outcome title is long
- Best if you find yourself wanting to reference stats quickly while checking off actions

---

**Option B — Stats bottom sheet**
A "Stats ↑" chip in the sticky outcome header. Tap → sheet slides up over the content with the full ring chart, time breakdown, and deadline risk block. Reuses the FAB sheet pattern from 1.5.

- Clean separation — stats don't compete with the action list
- Slightly more build work (medium, not high — pattern already exists from 1.5)
- Best if you find the action checklist needs all available screen space and you rarely consult stats mid-session

---

**Option C — Actions / Stats tabs**
Two tabs in the outcome detail view: "Actions" (default) | "Stats". Switching swaps the scrollable area.

- Clean UX but adds a tab pattern not used elsewhere in the mobile design
- Medium build cost
- Best if you find yourself frequently switching between doing actions and checking progress

---

**How to decide:** Tonight, use the app on your phone with 1.5 live. When you're inside an outcome working through actions, ask: do I want stats visible at all times (A), accessible on demand without leaving the list (B), or is a full dedicated view worth an extra tap (C)? Log your call in `key_decisions/decisions_log.md` before the 1.6 handoff is written.

---

## Session Log

| Date | Summary |
|---|---|
| Feb 19, 2026 | Initial PM session. Full discovery, scoping, phased roadmap built. 13 key decisions made and logged. REBUILD_PLAN.md created. Docs structure set up. Claude in-app experience scoped and resolved: command palette (⌘K) + contextual ✦ button, complex/bulk ops only. REBUILD_PLAN.md and all phase briefs updated. |
| Feb 19, 2026 | Phase 1.0 engineer handoff sent to dev. Phase 1.0 code review handoff drafted (with agent prompt). Phase 1.1 engineer handoff drafted. PM_SESSION_CONTEXT updated. |
| Feb 19, 2026 | Phase 1.0 code review approved. Phase 1.1 engineer handoff tightened (edge cases, route guidance, Available Today clarified) and sent to dev. Phase 1.0 marked Complete. |
| Feb 19, 2026 | Phase 1.1 code review handoff drafted (with agent prompt). Ready to send when dev signals done. |
| Feb 19, 2026 | Phase 1.2 engineer handoff and code review handoff drafted (both with agent prompts). Ready to queue once 1.1 clears review. |
| Feb 19, 2026 | Phase 1.1 code review findings processed. Decisions #14 and #15 logged. REBUILD_PLAN.md and test tracker updated. Phase 1.1 marked Complete. |
| Feb 19, 2026 | Phase 1.2 engineer handoff sent to dev. Phase 1.2 marked In Progress. |
| Feb 19, 2026 | Phase 1.3 and 1.4 engineer + code review handoffs drafted (all with agent prompts). Logging instructions added: engineers → dev_tracker, reviewers → test_tracker. 1.3 briefs also patched to include logging. Confirmed 1.3 can run in parallel with 1.2 code review. |
| Feb 19, 2026 | Phase 1.2 code review findings surfaced — conditional approval, 2 bugs. Dev already on 1.3 so fixes folded into 1.3 branch. 1.3 code review doc updated to verify both 1.2 fixes as blockers. 1.2 + 1.3 will clear review together. |
| Feb 19, 2026 | Phase 1.3 code review completed — approved. Both 1.2 bugs confirmed fixed. 3 deviations found and documented in test_tracker/Phase 1.4. Phase 1.4 engineer handoff already sent. Deviations section in test_tracker must be surfaced to dev manually (handoff prompt doesn't reference test_tracker). 1.2 and 1.3 both marked Complete. |
| Feb 20, 2026 | Phase 1.5 mobile layout scoped. All 4 design decisions resolved. Engineer handoff written (10 sections, implementation-ready). Phase 1.6 scoped (2 workstreams: mobile stats, polish pass). PM session context and phase table updated. |
| Feb 20, 2026 | Phase 1.4 code review approved. 1.5 engineer handoff reviewed — 3 issues found and fix prompt sent to designer. Option A/B/C decision for 1.6 Workstream A written up in Open Questions for PM review. Phase table updated (1.4 complete). |
| Feb 20, 2026 | Product vision session. Full rethink. Phases 2.0–2.6 scoped and written: Foundation Fixes, Focus Mode (terminal aesthetic + Claude co-pilot), User Context Memory, AI Breakdown, Smart Inbox Triage, Persistent Focus Memory, Delight. Phase table updated. Next: Phase 2.0 engineer handoff. |
| Feb 20, 2026 | Read vision.md. Phases 3.0–4.3 scoped and written. Decisions #18–20 logged: Today view is primary decision surface (Slack brief is ambient pre-game), pattern memory gates (20 global / 8 per-category, never time-based, confidence labeled, in-context only), Library ships before Pattern Memory (3.2 then 3.3). Full roadmap: 16 phases through 4.3. |
| Feb 20, 2026 | Phase 2.0 engineer handoff written (`pm_log/Phase 2/Phase 2.0 - Engineer Handoff.md`) + dev_tracker created. Full-vision design prototype brief written (`pm_log/Design Brief - Full Vision Prototype.md`) — 14 screens, ready for designer agent. pm_log reorganised into phase subfolders (Phase 1/, Phase 2/, Phase 3/, Phase 4/). Session context updated. |
