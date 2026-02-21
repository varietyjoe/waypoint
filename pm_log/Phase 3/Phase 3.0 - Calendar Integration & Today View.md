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

### Today View — UI

A new primary view, not a phase overlay. It replaces the center panel content when active (triggered after triage completes, or via a "Today" tab/button in the nav).

**Three states:**

**State 1 — Proposal (morning, pre-confirm):**
```
Today · [Day, Date]
────────────────────────────────────

  You have 4h 20m of real work time today.
  2 deep blocks: 9–11am, 2–4pm
  1 light window: 12–1pm

  Claude's suggested plan:
  ┌─────────────────────────────────────────┐
  │ 🟣 DEEP   Pitch Deck — Rohter · 90 min │
  │ 🟣 DEEP   Strategy doc · 60 min        │
  │ ○  LIGHT  Send to Scott · 10 min       │
  │ ○  LIGHT  Follow-up emails · 30 min    │
  └─────────────────────────────────────────┘

  Total: 3h 10m of 4h 20m available.

  ⚠ "Pitch Deck" is due Thursday — 2 days.
     Based on your history, revision usually
     takes a day. V1 needs to be done today.

  [Adjust]         [Confirm plan →]
────────────────────────────────────
```

**State 2 — Active (mid-day, post-confirm):**
```
Today · [Day, Date]
────────────────────────────────────

  3 of 4 tasks done · 2h 40m completed

  ✓  Pitch Deck — Rohter · 90 min  DONE
  ✓  Send to Scott · 10 min         DONE
  ✓  Follow-up emails · 30 min      DONE
  ○  Strategy doc · 60 min          REMAINING

  You're ahead of pace. One item left.

────────────────────────────────────
```

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
- [ ] User can adjust (add/remove actions) before confirming
- [ ] "Confirm plan" writes to `daily_plans` table
- [ ] Mid-day state updates as actions are checked off
- [ ] EOD state shows actual vs planned with move-to-tomorrow option
- [ ] Calendar service is provider-abstracted (Google is provider A, slot for Outlook later)
- [ ] Token refresh handled transparently
- [ ] Engineer + PM sign-off
