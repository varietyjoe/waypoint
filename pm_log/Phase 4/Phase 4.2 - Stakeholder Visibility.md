# Phase 4.2 — Stakeholder Visibility

**Goal:** The status update problem disappears. Any outcome has a shareable link that shows exactly where things stand — no login, no Slack thread to dig through.

**Status:** Not Started
**Depends on:** Phase 2.0 complete (outcome_result exists), Phase 3.0 complete (today view and planning data add context)

---

## The Problem

A massive amount of professional friction is the status update. "Where are we on the pitch deck?" "Did the campaign go out?" "Is that review done?" These are questions you answer from memory, digging through Slack, or writing a summary you'll forget to update.

If every outcome has a living status card, you never write that message again. You send the link.

---

## Design Constraints

**Waypoint stays single-user.** This is not collaboration. No login for the recipient. No editing. No commenting. Read-only, snapshot-style, minimal information. The product's power comes from being opinionated and personal — adding collaboration changes the architecture fundamentally.

---

## What This Phase Delivers

By the end of 4.2:
- Any active or archived outcome can have a shareable link generated
- The link shows a minimal, clean status card — no Waypoint branding confusion, just the facts
- Claude optionally drafts a 2-sentence outcome summary on archive, ready to forward
- Links can be revoked at any time

---

## Scope

### DB

```sql
CREATE TABLE IF NOT EXISTS outcome_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
    share_token TEXT UNIQUE NOT NULL,   -- random 16-char hex, URL-safe
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT,                    -- null = no expiry
    revoked INTEGER DEFAULT 0
)
```

Token generation: `crypto.randomBytes(8).toString('hex')` — already have `src/utils/crypto.js`.

### API Routes

```
POST   /api/outcomes/:id/share         — generate share token, return URL
DELETE /api/outcomes/:id/share         — revoke share (sets revoked = 1)
GET    /s/:token                       — public status card (no auth required)
```

`GET /s/:token` is a new public route (not under `/api`). It:
1. Looks up the token in `outcome_shares`
2. If not found, revoked, or expired: returns a simple "This link is no longer active" page
3. If valid: returns the status card HTML — server-rendered, no JS required for the recipient

### Status Card — Public View

Server-rendered HTML, clean and minimal. No navigation, no Waypoint chrome, no login prompt.

```
┌──────────────────────────────────────┐
│                                      │
│  Pitch Deck — Rohter Review          │
│                                      │
│  Status:  In progress                │
│  Owner:   [first name only]          │
│  Due:     Thursday, Feb 26           │
│                                      │
│  Progress:  ████████░░  7 of 9 done  │
│                                      │
│  Last updated: Today at 11:42am      │
│                                      │
└──────────────────────────────────────┘
```

For archived outcomes, show:
```
│  Status:  Closed · Hit it            │
│  Closed:  Feb 20, 2026               │
│  Result:  Deck approved at 2x        │
```

The card shows only: title, status, due date, progress (action count), last updated. No action titles. No reflection content. No result notes beyond what's in `outcome_result` and `outcome_result_note`.

### Share UI — In App

On the outcome detail view:
- "Share status →" button (subtle, not prominent — not every outcome needs a share)
- On click: generates token via `POST /api/outcomes/:id/share`
- Shows the URL with a "Copy link" button
- Shows "Revoke" option to kill the link

### Claude Outcome Summary on Archive

When an outcome is archived (Phase 3 Complete & Close), optionally generate a 2-sentence summary:

After the user confirms the archive:
```
> Summary generated — ready to forward:
  "Pitch deck for Rohter is complete and approved by Scott.
   Final version delivered Feb 20, 2026 — deck approved at 2x valuation."

  [Copy]  [Skip]
```

This is a one-time generation at archive time, not stored in the shareable card. It's for the user to copy and send manually — email, Slack, wherever. The share link is a separate thing.

Claude prompt: "Write a 2-sentence professional outcome summary. State what was accomplished and the key result. Plain text, no markdown. First sentence: what was done. Second sentence: the result or impact."

---

## Out of Scope

- Recipients commenting, reacting, or interacting with the card in any way
- Password-protected share links (revoke is sufficient for v1)
- Embedding share cards (iframes, OG previews — nice to have but not v1)
- Automatic link expiry (manual revoke is sufficient)
- Custom branding on the public card

---

## Definition of Done

- [ ] `outcome_shares` table created with token generation using existing crypto utility
- [ ] `POST /api/outcomes/:id/share` generates token and returns full URL
- [ ] `DELETE /api/outcomes/:id/share` revokes the share
- [ ] `GET /s/:token` returns server-rendered status card for valid tokens
- [ ] Status card shows correct data: title, status, due date, progress, last updated
- [ ] Archived outcome cards show result and closed date
- [ ] Revoked or expired tokens show "no longer active" page (not a 404 or error)
- [ ] Share button in outcome detail view generates link and shows copy + revoke options
- [ ] Claude generates optional 2-sentence summary at archive time
- [ ] Summary is copyable, skippable — not mandatory
- [ ] Engineer + PM sign-off
