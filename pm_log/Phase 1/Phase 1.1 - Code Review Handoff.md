# Phase 1.1 — Code Review Handoff

## Agent Prompt

You are a code reviewer for Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. Phase 1.1 just completed — it added two computed API endpoints powering the right panel (progress, deadline risk, deep/light split, workspace overview) and wired all right-panel elements in `waypoint-v2.html` to real data. Read `pm_log/Phase 1.1 - Code Review Handoff.md` in full, then verify every checklist item against the actual codebase. Report what passed, what failed, and any out-of-scope issues you spotted. End with a clear verdict: approved for Phase 1.2, or blocked with specifics.

---

You are reviewing Phase 1.1 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these two files before touching anything:**
1. `REBUILD_PLAN.md` — the full technical spec including exact JSON shapes and deadline risk logic
2. `dev_tracker/Phase 1.1 - Execution Intelligence.md` — the working checklist; verify each item is actually complete

---

## What Was Built

Phase 1.1 wired the right panel in `waypoint-v2.html` to real computed data. No new tables were created — all computation runs against the `outcomes` and `actions` tables Phase 1.0 built. Two new read-only API endpoints were added.

Your job is to confirm the implementation matches the spec, the logic is correct, and edge cases are handled before Phase 1.2 begins.

---

## Review Checklist

### API — Endpoints

- [ ] `GET /api/outcomes/:id/stats` exists and returns the correct shape: `progress`, `total_time`, `done_time`, `remaining_time`, `deep_time`, `light_time`, `deep_done`, `light_done`, `deadline_risk`, `days_left`, `minutes_per_day_needed`, `blocked_count`
- [ ] `GET /api/projects/:id/intelligence` exists and returns: `total_outcomes`, `total_queued_time`, `deep_split`, `light_split`, `deadline_risks[]`
- [ ] Intelligence endpoint aggregates **active outcomes only** (status = 'active')

### API — Logic

- [ ] `progress` is time-weighted (`done_time / total_time`), not action count
- [ ] `deadline_risk` has four correct values: `low` · `medium` · `high` · `critical`
- [ ] Daily capacity is a **named constant**, not a hardcoded magic number
- [ ] Edge case: outcome with no deadline → `days_left = null`, `minutes_per_day_needed = null`, `deadline_risk = "low"`
- [ ] Edge case: deadline already passed → `days_left = 0`, `deadline_risk = "critical"`
- [ ] Edge case: no actions with time estimates → `total_time = 0`, `progress = 0`, no division by zero
- [ ] Edge case: all actions done → `progress = 1.0`, `remaining_time = 0`, `deadline_risk = "low"`

### Frontend

- [ ] Progress ring fires `GET /api/outcomes/:id/stats` on outcome selection
- [ ] Deadline risk list wired in both Phase 1 and Phase 2 right panels
- [ ] Deep/light split bars wired to `deep_time`, `light_time`, `deep_done`, `light_done`
- [ ] "Available Today" panel wired — uses `total_queued_time` from intelligence endpoint, no new endpoint
- [ ] Workspace overview panel wired to `GET /api/projects/:id/intelligence`
- [ ] No hardcoded right-panel values remain in `waypoint-v2.html`

### Preserved (Do Not Flag)

These files must be untouched — flag it if they've been modified:
- `src/routes/slack.js`, `src/routes/grain.js`
- `src/integrations/slack-client.js`, `src/integrations/grain-client.js`
- `src/utils/crypto.js`, `src/database/oauth-tokens.js`
- `src/database/monitored-channels.js`, `src/database/triage.js`
- `src/services/claude.js`
- `src/server.js`

---

## What's Out of Scope

Do not raise issues against functionality that belongs to later phases:
- Slack triage pipeline (Phase 1.2)
- Reflection/archive ritual (Phase 1.3)
- Claude command palette (Phase 1.4)
- Velocity trends, weekly completion rates (future)

If you spot something clearly wrong but out of Phase 1.1 scope, note it separately — don't block sign-off on it.

---

## When You're Done

Leave review notes inline or in a summary. If the checklist is clear: signal **approved for Phase 1.2**. If there are blockers: flag them specifically — what failed, what file, what the spec says it should be.
