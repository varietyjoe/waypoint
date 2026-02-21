# Waypoint — Full Vision Design Brief
## Frontend Prototype: All 4 Phases

*For the designer agent. Produce a single static HTML file: `waypoint-vision.html`.*

---

## What You're Building

A static, non-functional design prototype that shows the complete Waypoint experience after all phases (2.x through 4.x) are built. This is a clickable mockup — not wired to a backend, but interactive enough that someone can navigate between all screens and understand the full product.

**Output:** A single HTML file (`waypoint-vision.html`) using:
- Tailwind CSS (CDN)
- Inter (Google Fonts) — existing UI
- JetBrains Mono (Google Fonts) — Focus Mode only
- Realistic placeholder data throughout (no "Lorem ipsum", use believable names and tasks)
- Simple JS for tab/screen switching only — no fetch calls, no backend

---

## Existing Design Language — Preserve This

The existing app has a clear visual identity. Do not reinvent it.

| Property | Value |
|---|---|
| Primary font | Inter, weights 300/400/500/600/700 |
| Base text | `text-gray-700`, `text-gray-800` |
| Label/meta text | `text-gray-400`, `text-gray-500`, 10–11px |
| Backgrounds | `bg-white`, `bg-gray-50` |
| Borders | `border-gray-100`, `border-gray-200` |
| Primary accent | Emerald `#10B981` / `bg-emerald-500` (actions, progress, success) |
| Secondary accent | Blue `#93C5FD` / `border-blue-300` (focus states, highlights) |
| Corner radius | `rounded-xl` (inputs, cards), `rounded-2xl` (panels, modals) |
| Shadows | Subtle: `shadow-sm`, `shadow-md`, rarely `shadow-xl` |
| Sidebar width | 220px, white, `border-r border-gray-200` |
| Right panel width | 288px, white, `border-l border-gray-200` |
| Font sizes | Everything is small and tight. Labels: 10px. Content: 11–13px. Titles: 14–15px max. |

**Tone:** Clean, professional, focused. Not playful. Not corporate. Like a well-designed developer tool.

---

## Screen Inventory

Build all 14 screens. Use a top navigation bar on the prototype (not part of the final app — just for prototype navigation) with buttons for each screen. Each screen fills the full viewport below the nav bar.

---

### Screen 1 — Dashboard: Outcomes List
*The main view. User is looking at their active outcomes across projects.*

**Layout:** Three-panel (sidebar left, center main, right panel).

**Sidebar (left, 220px):**
- Waypoint logo/wordmark at top
- Today indicator: "Today · Fri, Feb 20" with a subtle dot showing Today view is available
- Inbox badge: "● 4 new" in amber — clickable
- Section: Active outcomes (3–4 mini-rows with colored project dots)
- Section: Projects (GROWTH · PRODUCT · ADMIN with color pills)
- Section: Recently Closed (2 rows, struck through, muted)
- Bottom: Memory chip "12 context entries" + streak "🔥 5-day streak"

**Center panel:**
- Header: "Active Outcomes" with filter chips: All / GROWTH / PRODUCT
- Outcome cards (3 cards). Each card shows:
  - Project color bar on left edge
  - Outcome title (14px, medium weight)
  - Tags: deadline chip ("Due Thu"), priority chip, action count ("5 actions")
  - Progress bar (thin, emerald, with percentage)
  - Energy split: "3 deep · 2 light"
  - Bottom right: ✦ button (AI breakdown) + "Focus →" on hover
  - One card should show a `🔒` dependency lock icon
- One card in a "completion glow" state (all actions done, green border pulse)
- Quick capture input at bottom of center: "+ Add outcome…"

**Right panel (288px):**
- Header: "Execution Intelligence"
- For the selected outcome: SVG ring chart (progress), time breakdown, deadline risk block
- Deadline risk shown as colored pill: 🟡 At Risk with days calculation
- Deep/light split bar

---

### Screen 2 — Outcome Execution (Phase 2)
*User has clicked into an outcome. Action checklist view.*

**Center panel:**
- Back breadcrumb: "← Outcomes"
- Outcome title large (15px, semibold)
- Progress bar (thicker than Screen 1 version)
- Phase buttons: [Plan] [Execute ●] [Close]
- Action checklist (5–6 actions):
  - Each row: checkbox / title / energy badge (Deep=purple, Light=blue) / time badge / "Focus →" button
  - 2 actions checked (strikethrough, muted)
  - 1 action with 🔒 blocked indicator + reason
  - 1 action in hover state showing edit icons (pencil on title, edit on time/energy)
- Inline add action input at bottom: "+ Add an action…"

**Show inline editing state on one action:**
- Title is an active text input (no border, just cursor)
- Time estimate shows as editable number input
- Energy toggle as two small buttons: [Deep] [Light]

**Right panel:** Same execution intelligence as Screen 1 but updated to show this outcome's data.

---

### Screen 3 — Complete & Close (Phase 3)
*All actions checked. User is about to archive the outcome.*

**Center panel (full width, no right panel in this state):**
- Completion card at top:
  - Large checkmark circle (emerald)
  - "All done — [outcome title]"
  - Stats row: "5 actions · 4h 30m · 100%"
- **Hit it / Didn't land toggle** (prominent, required):
  - Two large buttons side by side
  - "Hit it ✓" — when selected: fills emerald, white text
  - "Didn't land" — when selected: fills gray-700, white text
  - One of them should be in the selected state
  - Small label above: "Did this outcome succeed?" (10px, gray-500)
- **Result note** (subtle, below toggle):
  - Single-line input, gray-50 background, no label
  - Placeholder: "What was the actual result? e.g. '4 meetings booked', 'deck approved at 2x valuation'"
  - Visually lighter than the toggle — clearly optional
- Divider
- Reflection section (3 textareas: What worked / What slipped / Reusable insight)
- Archive button: full-width, dark (`bg-gray-900`), "Archive Outcome →"

---

### Screen 4 — Archive Celebration Overlay
*The moment after clicking Archive. Full-screen overlay.*

**Full viewport overlay** (`bg-gray-950`, semi-transparent: `opacity-95`):
- Center of screen:
  - Large emerald checkmark (animated in final, static here)
  - "Outcome closed" (white, 18px, light weight)
  - Outcome title (white, 22px, semibold)
  - Divider
  - Stats row in gray-400: "5 actions completed · 4h 30m of work · Hit it"
  - Spacer
  - "Well done." (white, 14px, italic, gray-300)
- Small "← Back to Waypoint" link bottom center (gray-500, 11px)
- **Confetti visual:** Scatter ~30 small colored rectangles/circles at random positions and angles across the top of the overlay. Colors: emerald, teal, purple, amber. Static representation of confetti.
- Auto-dismiss indicator: thin progress bar at very bottom, gray-700, slowly filling (show at ~40% to suggest auto-dismiss)

---

### Screen 5 — Focus Mode
*The flagship feature. Full-screen terminal takeover. Completely different aesthetic.*

**This screen is a full design departure from the rest of the app. That's intentional.**

**Full viewport, dark background: `#0d0d0d`**
**All text: JetBrains Mono monospace**

**Layout (centered column, max-width 680px, centered horizontally and vertically with slight top bias):**

```
[top-right corner: small gray "esc" label — 10px, gray-600]

[top section, vertically centered in upper 40% of screen]

> FOCUSING ON                                    [muted green, 11px, tracking-widest]
  Send an email campaign                         [white, 18px, font-weight 500]
  Get 5 meetings set up  ·  est. 45 min          [gray-500, 12px]

  ──────────────────────────────────────         [gray-800 horizontal rule]

  "The secret of getting ahead is                [gray-600, 13px, italic]
   getting started."                             [same, left-aligned]

  00:14:22                                       [gray-700, 11px — live timer]


[bottom section, pinned to bottom ~25% of screen]
  ──────────────────────────────────────         [gray-800]

  [Claude response area — scrollable, above input]

  Claude response shown as previous message:
  > I can see you've worked on email campaigns before — last week's iteration
    focused on increasing meeting bookings after high clicks but low conversions.
    Want to start from that version, or build fresh?               [gray-300, 13px]

  User message shown:
  > Start from last week's. The CTA needs to be more direct.       [#4ade80 green, 13px]

  [New Claude response, streaming state — partial text visible]
  > Got it. Here's an iteration with a more direct CTA structure:  [gray-300]

  ──────────────────────────────────────
  > [blinking cursor _ ]                         [#4ade80, input line]
  ──────────────────────────────────────

[bottom-right corner: small "⏺ recording" when voice note is active — show as inactive state]
[bottom-left corner: small "💾 Save this →" chip appears next to Claude responses]
```

**Color reference for Focus Mode:**
- Background: `#0d0d0d`
- Prompt `>` and user text: `#4ade80` (muted green)
- Claude response text: `#d1d5db` (gray-300)
- Metadata / timer / labels: `#4b5563` (gray-600)
- Input line border: `#1f2937` (gray-800)
- Horizontal rules: `#1f2937`

---

### Screen 6 — Today View: Proposal State
*After morning triage. Claude has proposed a committed day.*

**Replace center panel content. Sidebar and right panel still visible.**

**Center panel:**
- Header: "Today · Friday, Feb 20"
- Sub: "You have 4h 20m of real work time today" (gray-500, 12px)
- Calendar summary strip: 3 small event pills ("9am Standup · 30m", "2pm Sales Sync · 60m", "4pm Hard stop") — gray-100 background, 10px text
- Divider
- Section label: "CLAUDE'S SUGGESTED PLAN" (10px, gray-400, tracking-wider)
- Committed actions list (4 items):
  - Each row: energy dot (purple=deep, blue=light) / action title / outcome name (muted) / time badge
  - Row 1: 🟣 Deep · "Draft pitch deck v1" · Rohter Deck · 90 min
  - Row 2: 🟣 Deep · "Build slide deck in Canva" · Rohter Deck · 60 min
  - Row 3: ○ Light · "Send to Scott for review" · Rohter Deck · 10 min
  - Row 4: ○ Light · "Follow-up emails" · Prospecting · 30 min
- Running total: "3h 10m of 4h 20m available" — emerald progress bar
- ⚠ Flag card (amber-50 background, amber-600 border-l-2):
  - "Pitch deck is due Thursday — 3 days. Based on your history, revision takes a day. V1 needs to be done today."
- Two CTAs: [Adjust] [Confirm plan →] (Confirm is dark, primary)

**Right panel:**
- "Calendar Today" summary
- List of events with times
- "Connected: Google Calendar" indicator (green dot)

---

### Screen 7 — Today View: Active (Mid-day) State
*User has confirmed the plan. It's now 12:30pm.*

**Center panel:**
- Header: "Today · Friday, Feb 20" + current time "12:30pm"
- Progress summary: "3 of 4 tasks · 2h 40m done" — emerald progress bar at 75%
- Action list with status:
  - ✓ Draft pitch deck v1 · DONE — emerald, muted
  - ✓ Send to Scott · DONE — emerald, muted
  - ✓ Follow-up emails · DONE — emerald, muted
  - ○ Build slide deck in Canva · 60 min · [Focus →] button
- Claude note (subtle, gray-50 card): "You're ahead of pace. One deep work item left — 60 minutes, fits your 2pm block."

---

### Screen 8 — Inbox Triage (Batch Mode)
*User has clicked "4 new items." Smart batch triage view.*

**Replace center panel with triage flow. Full center width.**

**Step indicator at top:** [1. Review] → [2. Questions] → [3. Preview] → [4. Done]
Currently on Step 1.

**Item stack (4 items):**
Each item is a card with:
- Source channel badge: "#client-success" or "@sarah-dm"
- Message excerpt (1–2 lines)
- Timestamp: "Yesterday 4:32pm"
- Action buttons: [Dismiss ✕] [Add ✓] (green when selected)

Show 2 items marked "Add" (green checked), 2 items with [Dismiss] available.

**CTA at bottom:** "Triage 2 selected items →" (active, dark)

---

### Screen 9 — Inbox Triage: Preview Step
*Claude has read the 2 selected items and proposed groupings.*

**Center panel:**
Step indicator on Step 3 (Preview).

**Cluster card 1:**
- Header: "Outcome (new)" badge
- Title (editable): "Pitch Deck — Rohter Review & Approval"
- Project dropdown: [GROWTH ▾]
- Actions nested below (2 items):
  - "Draft v1 · 90 min · Deep" [edit] [✕]
  - "Send to Scott for review · 10 min · Light" [edit] [✕]
- Small note: "From 2 related messages" — gray-400, 10px

**Cluster card 2:**
- Header: "Standalone Action" badge
- Title (editable): "Follow up with Rohter about Thursday meeting"
- Parent outcome dropdown: [— assign to outcome —]
- "15 min · Light"

**CTA:** [← Back] [Create All →]

---

### Screen 10 — Library View
*User has clicked "Library" in the sidebar.*

**Replace center panel with Library.**

**Center panel:**
- Header: "Library" + "Save manually +" button (right)
- Search bar: "Search your saved work…"
- Tag filter pills: [All] [campaign_draft] [pitch_deck] [email] [strategy] [outreach]
  - "email" is active/selected
- Entry list (filtered to email tag):
  - "Campaign v3 — Meeting-focused CTA" · Feb 15 · #campaign_draft #email
  - "Cold outreach sequence — Q1" · Feb 10 · #outreach #email
  - "Re-engagement campaign draft" · Jan 28 · #campaign_draft #email
- Each entry: title / date / tags / "Open in Focus →" link

**Detail panel (right panel area):**
Selected entry (Campaign v3) showing:
- Title (editable)
- Tags (editable chips)
- From: "Outcome: Get 5 meetings set up · Feb 15"
- Full content preview (first 150 chars, then "Show more")
- [Copy] [Open in Focus →] [Delete]

---

### Screen 11 — Execution Analytics
*User has clicked "Analytics" in the sidebar.*

**Center panel (full width, no right panel):**
- Header: "Execution Analytics"
- Sub: "Based on 34 closed outcomes."
- 4 metric blocks in a 2×2 grid (or stacked on narrower view):

  **Block 1: Estimate Accuracy**
  - "68% accurate"
  - CSS bar (emerald, ~68% wide)
  - "Improving: was 52% six weeks ago" (green upward trend note)

  **Block 2: Completion Rate**
  - "89% of outcomes closed"
  - CSS bar (nearly full, emerald)
  - "🔥 5-outcome streak this week"

  **Block 3: Results Rate**
  - "64% outcomes marked 'Hit it'"
  - CSS bar (~64%, amber color)
  - "Where result data exists (28 of 34 outcomes)"

  **Block 4: By Category**
  - Table:
    - ✓ Admin · 100%
    - ✓ Research · 90%
    - ✓ Product · 82%
    - ⚠ Prospecting · 60% (amber)
    - ⚠ Email Campaign · 55% (amber)

- Bottom note: "Patterns update weekly. Next update: Monday."

---

### Screen 12 — Advisor: Weekly Review
*User has clicked "Advisor" in the sidebar. Friday EOD.*

**Center panel:**
- Header: "Weekly Review · Feb 17–21"
- Sub: "4 outcomes closed · 11 actions done · 3h 40m in Focus sessions" (gray-500, 12px)
- Divider
- **Observation 1** (numbered, full paragraph text, Inter 13px, gray-700):
  "You closed 3 of 4 outcomes on time this week. The one that slipped — prospecting — was started Wednesday. Your pattern is to begin prospecting outcomes mid-week, and they typically need more runway than that. Of your last 12 prospecting outcomes, 9 were started Wednesday or later. Starting on Monday may help."
- **Observation 2:**
  "Your email campaigns have had strong open rates (43% average over 4 weeks) but booking conversions remain below target — 2.1% against a 5% goal. This is consistent across 4 consecutive campaigns. The pattern is in the conversion step, not the open. A focused session on CTA strategy may be worth scheduling."
- **Observation 3:**
  "Focus sessions averaged 74 minutes this week. Your stated ideal is 90 minutes. Worth checking: are sessions ending naturally or are you getting pulled away mid-session?"
- Divider
- Footer: "No action required. These are observations, not tasks." (10px, gray-400, italic)
- "Previous reviews →" link

**Sidebar:** Shows "Advisor ●" as the active nav item with a subtle amber dot (indicating a new observation is available).

---

### Screen 13 — Context Memory Settings
*User has clicked "Memory" in the sidebar.*

**Center panel:**
- Header: "Memory"
- Sub: "12 facts stored · Claude uses these in every session"
- Tab row: [Work Patterns] [Saved Outputs] — Work Patterns active
- Entry table:
  | Key | Value | Category | Source |
  |---|---|---|---|
  | 150 dials | 6 hours | task_duration | Focus: Prospecting |
  | Email campaign draft | 90 minutes | task_duration | Focus: Get 5 meetings |
  | Client call | 45 minutes | task_duration | Manual |
  | Deep work block | 90 min max, 2/day | work_pattern | Manual |
  | Writing speed | ~400 words/hour | work_pattern | Focus: Content |
  | Legal review | 3–5 business days | process_time | AI Breakdown |
- Each row: edit (pencil icon) + delete (trash icon)
- "+ Add manually" button below the table

**Saved Outputs tab** (show inactive, label only):
- Would show Library entries with category='saved_output'

---

### Screen 14 — Stakeholder Status Card (Public)
*This is a standalone page — no sidebar, no app chrome. A shareable public URL.*

**Full page, clean, centered. Max-width 480px. White background. Subtle shadow.**

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  Pitch Deck — Rohter Review                      │
│  (16px, semibold, gray-900)                      │
│                                                  │
│  Status    In progress                           │
│  Due        Thursday, Feb 27                     │
│  Owner      Joe T.                               │
│                                                  │
│  Progress  ████████████░░░░  7 of 9 actions done │
│                                                  │
│  Last updated  Today at 2:14pm                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

- All labels (Status, Due, Owner, etc.) in gray-400, 11px, uppercase, tracking-wide
- All values in gray-800, 13px
- Progress bar: emerald fill, gray-100 track
- Absolutely no Waypoint chrome, login prompt, or navigation
- Footer: "Powered by Waypoint" in gray-300, 10px (the only branding)
- Show an archived version below it (as a second card):
  - Status: Closed · Hit it
  - Closed: Feb 20, 2026
  - Result: Deck approved at 2x valuation

---

## Special Instructions

### Focus Mode
This is the most important screen to get right. It should feel like a completely different product — in a good way. Someone seeing it for the first time should think "oh, this is where the real work happens." The JetBrains Mono font, the `#0d0d0d` background, the green `>` prompt — these are non-negotiable. Everything else in the app is clean and light. Focus Mode is dark and terminal. The contrast is the point.

### Realistic Data
Use the same running narrative throughout all screens:
- User: Joe T.
- Key outcome: "Pitch Deck — Rohter Review & Approval" (GROWTH project, due Thursday)
- Sub-outcomes: "Get 5 meetings set up" (has email campaign, dials, DM actions)
- Project colors: GROWTH = blue/indigo, PRODUCT = purple, ADMIN = gray
- The email campaign story should be consistent (high clicks, low bookings, iterating toward better CTA)

### Navigation (Prototype Only)
A narrow top bar (`bg-gray-900`, `text-white`, `h-8`) with small text buttons for each screen:
`[1. Dashboard] [2. Execution] [3. Close] [4. Archive] [5. Focus] [6. Today] [7. Today Active] [8. Triage] [9. Triage Preview] [10. Library] [11. Analytics] [12. Advisor] [13. Memory] [14. Status Card]`

Clicking a button shows that screen, hides all others. Active screen gets a subtle highlight.

### What Success Looks Like
Someone who has never seen this product should be able to click through all 14 screens and understand:
1. What the product does
2. What Focus Mode is and why it's different
3. How the morning-to-EOD flow works (brief → triage → today → focus → close)
4. How Claude shows up at each step
5. That the product gets smarter over time (Library, Memory, Advisor)

---

## Output

Single file: `waypoint-vision.html`
Save to: `/Users/joetancula/Desktop/waypoint/public/waypoint-vision.html`

No external dependencies beyond Tailwind CDN and Google Fonts. Must open correctly from the filesystem (`file://`) without a server.
