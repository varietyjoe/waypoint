# Right Sidebar Redesign

**Date:** 2026-03-18
**Status:** Approved

## Summary

Replace the underused right sidebar (execution intelligence, deadline risk, work type split) with a three-zone layout that's always useful: a countdown timer, a done-today list, and a context-sensitive bottom section that shows either a recent updates feed or an outcome brief with AI-powered timeline.

Move the existing execution intelligence content into the Analytics tab.

## Design

### Zone 1: Time Left Today (always visible)
- Countdown to 5:00 PM local time, updating every minute
- Large numeric display (e.g. "3h 42m") with label "until 5:00 PM"
- Progress bar showing % of workday elapsed (assumes 9 AM–5 PM)
- Styled with subtle green gradient background matching current app aesthetic

### Zone 2: Done Today (always visible)
- Compact list of actions completed today
- Each item: green checkbox + strikethrough action title
- Count shown in header ("Done Today **4**")
- Populated from actions marked done where `updated_at` is today

### Zone 3: Bottom Section (context-sensitive)

#### State A — No outcome selected: Recent Updates Feed
- Shows the latest timeline entry from each active outcome
- Each entry is a clickable card: outcome name, relative timestamp, preview of last update text
- Clicking a card navigates to that outcome (selects it in center panel)
- Label: "Recent Updates"

#### State B — Outcome selected: Timeline + AI Summary
- **AI Summary card** at top (blue-tinted background): 1-3 sentence auto-generated summary of the outcome's full timeline. Regenerated each time a new entry is added.
- **Scrollable timeline** below: each entry shows date, your raw text. Newest first. Green left-border for user entries.
- **Input bar** at bottom: text input + send button. User types an update, it gets saved as a timeline entry, and the AI summary regenerates.

### Data Model

New table: `outcome_timeline`
- `id` INTEGER PRIMARY KEY
- `outcome_id` INTEGER (FK to outcomes)
- `content` TEXT (user's raw update text)
- `ai_summary` TEXT (nullable — stored on the outcome itself, not per-entry)
- `created_at` DATETIME

Add column to `outcomes` table:
- `ai_summary` TEXT (the current AI-generated summary for this outcome)

### API Endpoints

- `GET /api/outcomes/:id/timeline` — returns timeline entries for an outcome
- `POST /api/outcomes/:id/timeline` — add a new entry, triggers AI summary regeneration
- `GET /api/timeline/recent` — returns latest entry per active outcome (for the feed)

### Analytics Tab: Absorb Execution Intelligence

Move the following from the right sidebar into the Analytics view:
- Progress ring / completion percentage per outcome
- Time breakdown (estimated, completed, remaining)
- Work type split (deep vs light)
- Deadline risk indicators

These become a new section in the existing Analytics tab, below the current heatmap.

## Out of Scope
- Mobile implementation (future follow-up)
- Editing/deleting timeline entries
- Timeline entries from automated sources (only manual for now)
