# Phase 3.0 — Calendar Integration & Today View

**Goal:** Waypoint knows what day you actually have. Claude maps your outcomes to your real available time, and before you start working you confirm a committed plan — not a wishlist.

**Status:** Not Started
**Depends on:** Phase 2.0 complete (outcome_result seeded), Phase 2.2 complete (user context exists for energy patterns)

---

## The Problem

Right now Waypoint shows you all your outcomes and says "here you go." It has no idea you have three meetings today, a hard stop at 4pm, or that your energy craters after lunch. You stare at 7 outcomes, can't do them all, and either thrash or shut down.

The Today view closes the gap between intention and reality before you even start.

---

## The Sequence (Decision #18)

```
7:45am  Slack brief arrives          → primes you, shapes your expectations
8:30am  Open app, triage new items   → processes overnight inputs
        ↓
        Today view appears           → "Here's what fits today. Confirm this?"
        ↓
        Outcomes / Focus Mode        → execution against a committed plan

12:00pm Mid-day check-in             → what's done vs what you planned
5:30pm  EOD wrap                     → actual vs planned, tomorrow preview
```

The Slack brief makes you want to open the app. The Today view is where commitment happens. These are two different jobs, two different surfaces.

---

## What This Phase Delivers

By the end of 3.0:
- Google Calendar is connected via OAuth
- Waypoint reads your events and calculates real open work windows
- After triage, the Today view proposes a committed day based on available time + action energy types
- You confirm or adjust, and the plan is locked
- Mid-day and EOD states of the Today view show progress vs plan
- Claude flags deadline risk and overcommitment before you've wasted a morning on the wrong things

---

## Scope

### Google Calendar OAuth

- Standard Google OAuth 2.0 flow — user connects once, token stored in `oauth_tokens` table (already exists)
- Scopes: `https://www.googleapis.com/auth/calendar.readonly` — read-only, no write access needed
- New service: `src/services/google-calendar.js`
  - `getEventsForDate(date)` — returns events for a given day
  - `getOpenWindows(date)` — calculates unblocked time blocks (start/end, duration in minutes)
  - `refreshTokenIfNeeded()` — handles token refresh transparently
- New route: `GET /api/calendar/today` — returns today's events + open windows
- New route: `GET /api/calendar/connect` + `GET /api/calendar/callback` — OAuth flow

**Architect for extensibility:** All calendar logic behind a provider interface (`getEvents`, `getOpenWindows`) so Outlook can slot in later without touching Today view code.

### DB: Calendar Events

```sql
CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE NOT NULL,
    provider TEXT DEFAULT 'google',
    title TEXT,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    is_blocked INTEGER DEFAULT 1,   -- 1 = unavailable for work, 0 = free
    fetched_at TEXT DEFAULT (datetime('now'))
)
```

Pull strategy: fetch on app open + once at midnight for next day. No real-time sync needed.

### DB: Daily Plans

```sql
CREATE TABLE IF NOT EXISTS daily_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,              -- 'YYYY-MM-DD'
    committed_outcome_ids TEXT,             -- JSON array of outcome IDs
    committed_action_ids TEXT,              -- JSON array of action IDs
    total_estimated_minutes INTEGER,
    available_minutes INTEGER,              -- calculated from calendar open windows
    confirmed_at TEXT,                      -- null until user confirms
    actual_completed_action_ids TEXT,       -- JSON array, updated throughout day
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
)
```

### Sidebar Navigation (Ships with Phase 3.0)

The sidebar "Views" section is the persistent navigation pattern for all secondary views. It ships with Phase 3.0 because the Today view is the first view that lives in it. Subsequent phases slot into the structure without touching the sidebar again.

**Sidebar structure (add below Projects, above Recently Closed):**

```
Views
─────
📅 Today          ← links to Today view (this phase)
📚 Library        ← stub until Phase 3.2 (show "Coming soon" or link to Today)
📊 Analytics      ← stub until Phase 3.3
💡 Advisor        ← stub until Phase 4.3; amber dot overlay when new review ready
🗃 Memory         ← links to existing Memory view (Phase 2.2)
```

Use icons matching the vision HTML (see `public/waypoint-vision.html` Screen 1 sidebar) — calendar, library stack, bar chart, lightbulb, database SVG icons. Stubs can be non-functional links or show a pill `Soon` — either is fine. The visual structure is what matters now.

Active state: highlighted blue with `text-blue-700 font-medium` (matches existing `.sb-item.active` pattern).

---

### Today View — UI

A new primary view, not a phase overlay. It replaces the center panel content when active (triggered after triage completes, or via the "Today" link in the sidebar Views nav).

**Three states:**

**State 1 — Proposal (morning, pre-confirm):**

Center panel:
```
Today · [Day, Date]
────────────────────────────────────

  You have 4h 20m of real work time today.

  [horizontal calendar strip: "9am Standup · 30m"  "2pm Sales Sync · 60m"  "4pm Hard stop"]

  ─────────────────────────────────────────────

  Claude's Suggested Plan

  ● DEEP   Draft pitch deck v1          Rohter Deck   90 min
  ● DEEP   Build slide deck in Canva    Rohter Deck   60 min
  ○ LIGHT  Send to Scott for review     Rohter Deck   10 min
  ○ LIGHT  Follow-up emails             Prospecting   30 min

  3h 10m of 4h 20m available · 73%
  ████████████░░░░░  (progress bar)

  ⚠ Pitch deck is due Thursday — 3 days
    Based on your history, revision takes a day.
    V1 needs to be done today.

  [Adjust]         [Confirm plan →]
────────────────────────────────────
```

The calendar strip is a horizontal scrollable row of event pills above the plan, showing today's hard commitments at a glance before the plan.

**State 2 — Active (mid-day, post-confirm):**

Center panel:
```
Today · Friday, Feb 21          12:30pm   ← live clock (JS setInterval, updates every minute)
────────────────────────────────────

  3 of 4 tasks · 2h 40m done

  ████████████░░░░  75% of plan complete  |  1h remaining

  ✓  Draft pitch deck v1       DONE · 90 min    (completed card, faded green)
  ✓  Send to Scott for review  DONE · 10 min
  ✓  Follow-up emails          DONE · 30 min
  ●  Build slide deck in Canva  Deep · 60 min   [Focus →]  ← inline Focus button

  ─────────────────────────────────────────────
  ✦  You're ahead of pace. One deep work item left —
     60 minutes, fits your 2pm block before Sales Sync.
────────────────────────────────────
```

Mid-day enhancements:
- **Live clock** in center header — `new Date().toLocaleTimeString()` formatted as `h:mma`, updated via `setInterval` every 60s
- **"Focus →" button** inline on the remaining (incomplete) task card — clicking opens Focus Mode on that specific action
- **✦ Claude note card** at the bottom — short pace assessment generated alongside the mid-day plan status. Use `POST /api/today/status` or append to the existing plan fetch. Claude prompt: "In one sentence, assess the user's progress relative to their plan and remaining time. Reference the specific remaining task and next calendar block. Plain text."

**State 3 — EOD:**
```
Today · [Day, Date]
────────────────────────────────────

  Day complete. 3 of 4 tasks done.

  ✓  Pitch Deck · done
  ✓  Send to Scott · done
  ✓  Follow-up emails · done
  ✗  Strategy doc · not done → tomorrow?

  "Strong day. The pitch deck was the
   highest-leverage item and you got it done."

  [Move unfinished to tomorrow]  [Dismiss]

────────────────────────────────────
```

---

### Today View — Right Panel ("Calendar Today")

The right panel on the Today view is a dedicated **"Calendar Today"** panel — not the Execution Intelligence panel used elsewhere.

**Right panel content (all states):**

```
Calendar Today
──────────────

● Connected: Google Calendar      ← green dot + connection status

[Event cards — one per event today]
  Daily Standup     9:00am – 9:30am · 30 min
  Sales Sync        2:00pm – 3:00pm · 60 min
  Hard stop         4:00pm

Available Blocks
──────────────
  9:30am – 2:00pm   4h 30m         ← emerald highlight (primary work window)
  3:00pm – 4:00pm   1h 0m          ← secondary window
```

**Mid-day right panel — additional "live" state:**

- Past/completed events: crossed-out title with faded/completed styling
- Current active block: highlighted card — "Now · Deep work block" + remaining time ("12:30pm – 2:00pm · 90 min left")
- Upcoming events: standard styling
- **Recommendation card** (Claude-generated, blue tint):
  - "Recommendation: Start [task] now — [X] minutes before [next meeting], enough to finish with buffer."
  - Generated by a new `GET /api/today/recommendation` endpoint (or appended to the mid-day status response)
  - Claude receives: remaining task, current block end time, next meeting. Returns one sentence.

Reference `public/waypoint-vision.html` Screens 6 and 7 for exact visual treatment.

### Claude Proposal Logic

New endpoint: `POST /api/today/propose`

Claude receives:
- Today's open windows (from calendar service)
- All active outcomes with their actions + time estimates + energy types
- User's context snapshot (work patterns, deep work block preferences)
- Deadlines and their risk levels (from existing stats endpoint)

Claude returns:
```json
{
  "committed_actions": [
    { "action_id": 42, "reason": "Pitch deck due Thursday, needs to start today" },
    { "action_id": 18, "reason": "Light task, fits the 12pm window" }
  ],
  "available_minutes": 260,
  "committed_minutes": 190,
  "flags": [
    "Pitch deck due Thursday — based on your history, revision takes a day. V1 must be done today."
  ],
  "overcommitted": false
}
```

Frontend renders the proposal. User can drag to reorder, remove items, or add from the unscheduled list. "Confirm plan →" writes to `daily_plans`.

### Adjust Flow

"Adjust" opens an edit state showing:
- Committed list (removable, reorderable)
- Available actions from active outcomes (addable)
- Running total of committed minutes vs available
- Claude recalculates and warns if overcommitted ("You've added 5h 30m into a 4h 20m day")

---

## Out of Scope

- Writing events back to Google Calendar
- Time blocking / calendar integration that writes to external calendar
- Multi-day planning view
- Recurring commitments or habits tracking

---

## Definition of Done

- [ ] Google Calendar OAuth connects successfully and stores token
- [ ] `GET /api/calendar/today` returns today's events and open work windows
- [ ] Calendar events stored in `calendar_events` table
- [ ] `POST /api/today/propose` returns a valid committed day proposal from Claude
- [ ] Today view renders all three states (proposal, active, EOD) correctly
- [ ] Proposal shows available time, suggested actions, deadline flags
- [ ] Horizontal calendar strip renders event pills above Claude's plan (proposal state)
- [ ] User can adjust (add/remove actions) before confirming
- [ ] "Confirm plan" writes to `daily_plans` table
- [ ] Mid-day state shows live clock updating every minute
- [ ] Mid-day state: remaining task has inline "Focus →" button
- [ ] Mid-day state: ✦ Claude note card renders at bottom with pace assessment
- [ ] EOD state shows actual vs planned with move-to-tomorrow option
- [ ] Right panel "Calendar Today" renders on all Today view states: connection status, event list, Available Blocks
- [ ] Mid-day right panel: past events faded/crossed-out, current block highlighted "Now · [type]", Recommendation card rendered
- [ ] Sidebar "Views" section ships with Today, Library (stub), Analytics (stub), Advisor (stub), Memory nav items
- [ ] Sidebar active state highlights correctly for each view
- [ ] Calendar service is provider-abstracted (Google is provider A, slot for Outlook later)
- [ ] Token refresh handled transparently
- [ ] Engineer + PM sign-off
