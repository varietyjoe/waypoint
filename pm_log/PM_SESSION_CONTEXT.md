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

The target frontend is `public/waypoint-vision.html` — 14 screens, the exact end state we are building to. Every phase ships features traceable to a specific screen in that file.

**Stack:** Node.js · Express 5 · SQLite (better-sqlite3) · Anthropic SDK · Vanilla JS (no framework)

**Core workflow the product must support:**
1. Morning inbox review — Slack messages triaged overnight, user classifies as Outcome or Action, assigns to project
2. Outcome execution — Pick an outcome, work through actions (deep/light energy tagged), right panel shows deadline risk live
3. Archive ritual — Complete an outcome, capture reflection, close the loop

---

## Phase Status

| Phase | Name                        | Status    | Engineer Sign-off                      |
| ----- | --------------------------- | --------- | -------------------------------------- |
| 1.0   | Make It Real                | Complete  | ✅ Approved                             |
| 1.1   | Execution Intelligence      | Complete  | ✅ Approved                             |
| 1.2   | Input Pipeline              | Complete  | ✅ Approved (bugs fixed in 1.3 branch)  |
| 1.3   | Close the Loop              | Complete  | ✅ Approved (3 deviations acknowledged) |
| 1.4   | AI Co-pilot                 | Complete  | ✅ Approved                             |
| 1.5   | Mobile Layout               | Scoped    | —                                      |
| 1.6   | Mobile Stats & Polish       | Scoped    | —                                      |
| 2.0   | Foundation Fixes            | Complete  | ✅ Approved (4 minor non-blockers)      |
| 2.1   | Focus Mode                  | Complete  | ✅ Approved (3 minor non-blockers)      |
| 2.2   | User Context Memory         | Complete  | ✅ Approved (3 minor non-blockers)      |
| 2.3   | AI Breakdown                | Complete  | ✅ Approved (2 minor non-blockers)      |
| 2.4   | Smart Inbox Triage          | Complete  | ✅ Approved (Bug #1 patched post-review; 2 minor notes) |
| 2.5   | Persistent Focus Memory     | Complete  | ✅ Approved (clean — 0 defects)         |
| 2.6   | Delight                     | Complete  | ✅ Approved (3 polish notes — checkSpring/strikeFill unwired) |
| 3.0   | Calendar + Today View       | Complete  | ✅ Approved (6 non-blockers; separate google_calendar_tokens table — correct engineering) |
| 3.1   | Morning Brief               | Complete  | ✅ Approved (4 non-blockers; dead actionsDb import, cron-time-at-startup noted) |
| 3.2   | The Library                 | Complete  | ✅ Approved (6 non-blockers; "Open in Focus →" stub — wired in Phase 4.0) |
| 3.3   | Pattern Memory + Analytics  | Complete  | ✅ Approved (index.html regression recovered; 2 bugs patched post-review: archived_at streak fix, escHtml category) |
| 4.0   | Capture Everywhere          | Complete  | ✅ Approved (80/80; 3 minor non-blockers: empty-body guard, voice task-check ordering, emoji in console.log) |
| 4.1   | Outcome Dependencies        | Complete  | ✅ Approved (66/66; 3 minor non-blockers: POST missing count field, lock icon emoji color, module.exports hoisting pre-existing) |
| 4.2   | Stakeholder Visibility      | Complete  | ✅ Approved (68/68; 3 minor non-blockers: copyShareLink URL escaping pattern, module.exports ordering pre-existing, revoke toast color) |
| 4.3   | Claude as Advisor           | Complete  | ✅ Approved (67/67; 1 bug patched by PM: formatWeekOf hardcoded "21" → fixed to interpolate friDay) |

---

## Where We Left Off

**Session: Feb 23, 2026 (autonomous Phase 4 build — 4.0 → 4.1 → 4.2 → 4.3)**

Phase 4 build chain ran fully autonomously. All four phases approved:
- **4.0 Capture Everywhere:** Slack slash command, email inbound webhook, voice note in Focus Mode, Recently Closed alias route, project filter tabs + quick capture, "Open in Focus →" Library wiring. 80/80 — clean.
- **4.1 Outcome Dependencies:** `outcome_dependencies` join table, BFS cycle detection, critical path query, 5 API routes, 3 Claude injection points (AI Breakdown, Today Propose, Inbox Triage), lock icon in sidebar, Dependencies section in right panel. 66/66 — clean.
- **4.2 Stakeholder Visibility:** `outcome_shares` table, shareable `/s/:token` public route (no auth), Claude archive summary chip on outcome complete, share UI in right panel. 68/68 — clean.
- **4.3 Claude as Advisor:** `advisor_reviews` table, `generateWeeklyRetrospective` + `checkProactiveFlags` service, Friday 5:30pm cron, 5 Advisor API routes, Advisor view with amber dot, history list, "Previous reviews →" label, "No action required" footer. 67/67 — 1 bug patched by PM (formatWeekOf hardcoded day number fixed).

**Phase 4 is complete. The full Waypoint vision is shipped. ✅**

---

**Session: Feb 23, 2026 (vision gap analysis + Phase 4 handoff prep)**

User returned after the Phase 3 overnight run. This session focused on verification and Phase 4 prep:

- **Vision coverage audit:** Ran a full screen-by-screen inventory of `public/waypoint-vision.html` (14 screens) against all built and scoped phases. Verdict: Phases 1–4 cover 13 of 14 screens completely. **One real gap found:** "Open in Focus →" from the Library right panel — Phase 3.2 built it as a stub and no Phase 4 handoff covered wiring it. Two minor deviations also found in Phase 4.3's Advisor view.
- **Three handoff patches applied:**
  1. `pm_log/Phase 4/Phase 4.0 - Engineer Handoff.md` — Added **Workstream 6**: wires "Open in Focus →" from Library right panel. `openLibraryEntryInFocus(entryId)` fetches the entry, stashes it in `window._libraryFocusContext`, calls `enterFocusMode()`, and injects the Library content into the terminal on open. Button onclick wired in `renderLibraryDetail()`.
  2. `pm_log/Phase 4/Phase 4.3 - Engineer Handoff.md` — Added **"No action required" footer** to `renderAdvisorView()` on weekly reviews (exact vision text: *"No action required. These are observations, not tasks."*).
  3. `pm_log/Phase 4/Phase 4.3 - Engineer Handoff.md` — Fixed **`formatWeekOf()`** to output week range `"Feb 17–21"` (Mon–Fri) rather than just the Monday date.
- **All 8 Phase 4 handoff files confirmed on disk and ready to build.**
- **Phase 4 autonomous run prompt written** and placed at the top of this file.

**Phase 3 is complete (3.0–3.3). ✅ Phase 4 handoffs are ready. ✅**

---

**Session: Feb 23, 2026 (autonomous overnight run — Phases 3.0–3.3)**

User went to sleep after kicking off the 3.0–3.3 run. PM wrote all dev_tracker stubs for Phases 3.0–3.3 in parallel, then chained the full build-and-review sequence autonomously:
- **3.0 Calendar + Today View:** Dev built (Google Calendar OAuth, calendar_events + daily_plans DB, Today view 3 states, sidebar Views nav). Review approved — 6 non-blockers (proposal action cards missing energy enrichment, `module.exports` placement, hardcoded port 3000 in redirect URI).
- **3.1 Morning Brief:** Dev built (user_preferences DB, briefings service, node-cron jobs, preferences API, Briefings settings UI). Review approved — 4 non-blockers (dead actionsDb import, cron times startup-fixed, toggle double-wiring).
- **3.2 The Library:** Dev built (library.js migration on user_context, autoTagLibraryEntry, 6 Library routes, Focus Mode injection, full Library view). Review approved — 6 non-blockers (dead confirm-state code, onblur2 cosmetic, tags not passed to relevance scorer).
- **3.3 Pattern Memory + Analytics:** Dev built (patterns.js, pattern-engine.js, outcome_tags + started_at/ended_at migrations, autoTagOutcome, archive hook, 3 injection points, weekly cron, Analytics 2×2 view). **INCIDENT:** Phase 3.3 engineer accidentally corrupted index.html (Python surrogate encoding error → git checkout reverted to pre-Phase 2.1). First review pass BLOCKED on this + 2 bugs. PM dispatched frontend repair agent — all Phase 2.1–3.2 frontend features restored (file grew from 3,466 to 5,175 lines). PM patched 2 bugs directly (archived_at streak fix, escHtml category). Final review approved — 109/109.

---

## What's Next

**Phase 4 is complete. The full Waypoint vision (Phases 1–4) is shipped. ✅**

The only remaining scoped-but-not-started items are the mobile phases (1.5 / 1.6), deliberately deferred. Revisit those when ready — the Option A/B/C stats decision for 1.6 is still open in the Open Questions section below.

**Before shipping to real users:**
- Set up Slack App slash command pointing to `POST /api/slack/waypoint-command`
- Provision an inbound email service (Postmark/Mailgun/SendGrid) and set `INBOUND_EMAIL_ADDRESS` in `.env`
- Ensure the app is running on HTTPS (required for Web Speech API voice notes in production)
- Connect Google Calendar via the OAuth flow in Settings to enable Today view + Morning Brief

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

---

**Option B — Stats bottom sheet**
A "Stats ↑" chip in the sticky outcome header. Tap → sheet slides up over the content with the full ring chart, time breakdown, and deadline risk block.

- Clean separation — stats don't compete with the action list
- Slightly more build work (pattern already exists from 1.5)

---

**Option C — Actions / Stats tabs**
Two tabs in the outcome detail view: "Actions" (default) | "Stats".

- Clean UX but adds a tab pattern not used elsewhere in the mobile design
- Medium build cost

---

**How to decide:** Use the app on your phone with 1.5 live. Log your call in `key_decisions/decisions_log.md` before the 1.6 handoff is written.

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
| Feb 20–21, 2026 | Autonomous overnight run. Phase 2.0 code review returned approved (4 minor non-blockers). PM wrote Phase 2.1 + 2.2 engineer handoffs, code review handoffs, dev trackers, and test trackers. Dev agent built Phase 2.1 (Focus Mode: focus-sessions DB, streaming /api/focus/message, terminal overlay, F-key shortcut, JetBrains Mono). Reviewer approved 2.1 with 3 non-blockers. Dev agent built Phase 2.2 (User Context Memory: user-context DB, /api/context CRUD, context injection into all Claude prompts, "Save this" chip in Focus Mode, Memory sidebar panel). Reviewer approved 2.2 with 3 non-blockers. PM_SESSION_CONTEXT updated. |
| Feb 20–21, 2026 (continued) | PM wrote all handoff docs for Phases 2.3–2.6 in parallel, then chained full build+review sequence. 2.3 approved (2 non-blockers). 2.4 blocked on critical bug (actions unassigned) — PM patched directly, then approved. 2.5 approved clean (0 defects). 2.6 approved (3 polish notes: checkSpring/strikeFill unwired, "Complete & Close →" routes through setPhase(3) correctly). Phase 2 (2.0–2.6) complete. Polish pass items logged. Ready for Phase 3.0 or 1.5/1.6 mobile. |
| Feb 22, 2026 | North star vision review. Mapped `waypoint-vision.html` (14 screens) against roadmap: ~45% built, ~40% scoped, ~15% not on roadmap. Biggest unscoped gap: Google Calendar live integration (blocks Phase 3.0 scope decision). Other gaps: sidebar view navigation, recently closed sidebar section, project filter tabs, quick capture input, Library needs richer brief (tags, search, source linking). Full analysis at `pm_log/North Star Vision Gap Analysis.md`. Key decision pending: live calendar OAuth vs. manual time blocks. |
| Feb 23, 2026 | Autonomous overnight run — Phases 3.0–3.3 complete. Full build+review chain executed autonomously. INCIDENT: Phase 3.3 engineer corrupted index.html (Python encoding error → git checkout → reverted to pre-2.1). Repair agent restored all Phase 2.1–3.2 frontend features (3,466 → 5,175 lines). PM patched 2 bugs post-review (archived_at streak, escHtml category). All 4 phases approved. Phase 3 complete. |
| Feb 23, 2026 | Vision gap analysis session. Full screen-by-screen audit of waypoint-vision.html against all phases. Found 1 real gap ("Open in Focus →" from Library — stub in Phase 3.2, not wired in any Phase 4 handoff) and 2 minor Advisor deviations (missing "No action required" footer, week range format). Wrote Phase 4.0/4.1/4.2 engineer + code review handoffs (6 files). Patched Phase 4.0 handoff (Workstream 6: Library → Focus Mode wiring) and Phase 4.3 handoff (footer text, formatWeekOf week range). All 8 Phase 4 handoffs confirmed ready. Phase 4 autonomous run prompt written at top of this file. |
| Feb 23, 2026 | Autonomous Phase 4 build — 4.0 → 4.1 → 4.2 → 4.3. PM created all 4 dev_tracker stubs. Engineer + code review agents chained sequentially. 4.0: 80/80 approved. 4.1: 66/66 approved. 4.2: 68/68 approved. 4.3: BLOCKED on formatWeekOf hardcoded day number — PM patched directly (`\u201321` → `\u2013${friDay}`), re-review confirmed 67/67 approved. Full vision shipped. |
