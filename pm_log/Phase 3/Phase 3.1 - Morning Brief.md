# Phase 3.1 — Morning Brief

**Goal:** Waypoint finds you before you find it. A short, un-actionable Slack message at 7:45am that orients you, flags the important things, and makes you want to open the app.

**Status:** Not Started
**Depends on:** Phase 3.0 complete (calendar data makes the brief meaningfully smarter)

---

## The Design Principle

The brief must not be a to-do list. If you can act from the brief, you don't open the app. The brief should:
- Tell you the shape of your day
- Surface the one or two things that matter most
- Create a mild pull toward opening Waypoint

It should read like a text from a smart colleague who's already looked at your calendar and your work, not like an automated digest.

---

## What This Phase Delivers

Three scheduled messages via Slack DM — three moments in the day where Waypoint shows up without being asked:

| Message | Time | Length | Job |
|---|---|---|---|
| Morning Brief | 7:45am local | 4–6 lines | Orient + prime |
| Midday Pulse | 12:00pm local | 2–3 lines | Trajectory check |
| EOD Wrap | 5:30pm local | 3–4 lines | Celebrate + preview tomorrow |

---

## Scope

### Scheduled Sends

Three cron jobs added to `src/server.js` (or extracted to `src/jobs/briefings.js`):
- `0 7 45 * * *` — Morning Brief (adjust for timezone)
- `0 12 0 * * *` — Midday Pulse
- `0 17 30 * * *` — EOD Wrap

**Timezone handling:** Store user's timezone preference in a new `user_preferences` table (single-row, key-value or structured). Default: UTC. User sets it once in settings. All cron jobs calculate local send time from stored timezone.

```sql
CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
)
-- e.g. key='timezone', value='America/Chicago'
-- e.g. key='briefings_enabled', value='true'
-- e.g. key='briefing_slack_user_id', value='U012AB3CD'
```

### Slack Delivery

Uses existing Slack bot infrastructure (`src/routes/slack.js`, existing bot token). New function: `sendSlackDM(userId, text)`. The Slack user ID is stored in `user_preferences`.

On first setup, prompt the user to confirm their Slack user ID (or look it up via the Slack API from their connected account). One-time setup, stored permanently.

### Content Generation

New service: `src/services/briefings.js`
- `generateMorningBrief()` — calls Claude with the brief prompt
- `generateMiddayPulse()` — calls Claude with midday prompt
- `generateEODWrap()` — calls Claude with EOD prompt

Each function:
1. Pulls the data it needs (outcomes, deadline risk, calendar events, today's plan if confirmed, stats)
2. Builds a prompt for Claude
3. Claude returns plain text (not JSON) — the actual Slack message copy
4. Send via Slack DM

**No new API endpoints needed.** These are internal jobs, not user-triggered.

### Morning Brief Content

Claude receives:
- Active outcomes + deadline risk for each
- Today's calendar open windows (from Phase 3.0)
- Today's proposed/confirmed plan (if triage already happened)
- Inbox item count waiting for triage
- User's context snapshot

Claude generates something like:
```
Good morning. Today looks like a 4-hour day — two deep blocks.

Your most urgent outcome is the Rohter pitch deck (due Thursday).
If V1 isn't drafted today, you'll be tight.

3 items in your inbox from yesterday. Triage at 8:30?
```

**Prompt instruction for Claude:** "Write a morning brief in 4–6 lines. Plain text, no markdown, no bullet points. Conversational but sharp. Surface the 1-2 most important things. End with something that makes the user want to open the app. Do not list every outcome. Do not mention things with no urgency."

### Midday Pulse Content

Claude receives:
- Today's confirmed plan
- Which actions have been checked off since morning
- Remaining committed actions + their time estimates
- Current time (to assess whether pace is on track)

Claude generates something like:
```
Midday check: 2 of 4 tasks done. You're on pace.

Pitch deck draft is done — that was the critical one.
Strategy doc is still open. 60 minutes when you're ready.
```

### EOD Wrap Content

Claude receives:
- Today's confirmed plan
- Which actions were completed vs not completed
- Any outcomes fully closed today
- Tomorrow's calendar at a glance

Claude generates something like:
```
Strong day. 3 of 4 tasks done.

The pitch deck draft is complete — that was the one that mattered.
Strategy doc carries to tomorrow. 60 minutes, morning block.

Tomorrow: 3.5 hours of work time. Looks manageable.
```

### Settings

A "Briefings" section in app settings (alongside the Memory view from Phase 2.2):
- Toggle: Briefings on / off
- Time overrides: adjust default send times (7:45 / 12:00 / 5:30)
- Timezone selector
- Slack user ID (set once, editable)
- Preview button: "Send me a test morning brief now"

---

## Out of Scope

- Email delivery (Slack only — the infrastructure is already there)
- Per-message on/off toggles (all three ship together; if briefings are on, all three send)
- Rich formatting / Block Kit in Slack messages (plain text only — cleaner, faster to build)
- Weekday vs weekend logic in v1 (all 7 days — add weekday-only as a settings option if user requests)

---

## Definition of Done

- [ ] Three cron jobs fire at correct local times based on stored timezone
- [ ] `user_preferences` table stores timezone + Slack user ID
- [ ] Morning Brief sent at 7:45am with correct content (outcomes, deadline flags, inbox count)
- [ ] Midday Pulse sent at 12:00pm with on-pace/behind assessment
- [ ] EOD Wrap sent at 5:30pm with actual vs planned comparison
- [ ] All three messages sound like Claude wrote them, not like a system digest
- [ ] Briefings settings section: toggle, time overrides, timezone, test send
- [ ] Briefings respect the on/off toggle (off = no sends, no errors)
- [ ] Engineer + PM sign-off
