# Phase 4.0 — Capture Everywhere

**Goal:** Commitments and ideas don't only arrive via Slack. They come in email, in conversations, mid-meeting. The app that captures everything wins.

**Status:** Not Started
**Depends on:** Phase 2.4 complete (Smart Inbox Triage — capture feeds the same inbox pipeline)

---

## What This Phase Delivers

Four new capture vectors, all feeding the existing inbox → triage pipeline:

| Vector | How it works | Use case |
|---|---|---|
| Slack bot `/waypoint` | `/waypoint [text]` in any channel or DM | Mid-meeting, quick context capture without leaving Slack |
| Email forward | Forward any email to your Waypoint address | Email-born commitments, client requests |
| Voice note in Focus Mode | "Claude, note that…" during a session | Mid-task ideas without breaking flow |
| Web clipper | Browser extension to clip content as a research action | Stretch — add only if the above are solid |

---

## Scope

### 1. Slack Bot `/waypoint` Command

**What it does:** `/waypoint [any text]` creates an inbox item instantly from any Slack channel or DM.

- Register as a Slack slash command in the app manifest (already have bot infrastructure)
- Route: `POST /api/slack/waypoint-command` (new handler in `src/routes/slack.js`)
- Parses: the full text after `/waypoint`
- Creates an inbox item with `source = 'slack_command'`, `raw_text = [text]`, `channel = [channel name]`
- Responds ephemerally in Slack: "Added to your Waypoint inbox. ✓"
- The item appears in the inbox at next triage

**Why this matters:** Right now Slack items enter Waypoint only via the scheduled pull from monitored channels. The slash command is push — you decide in the moment, from anywhere.

### 2. Email Forward

**What it does:** User forwards any email to a dedicated Waypoint address → it appears in the inbox.

- Provision a dedicated inbound email address (use a service like Postmark Inbound, Mailgun, or SendGrid Inbound Parse — all have free tiers)
- Webhook: `POST /api/inbox/email-inbound`
- Parses: subject (→ title), body text (→ raw_text), sender (→ metadata)
- Creates inbox item with `source = 'email_forward'`
- Strips quoted replies and signatures before storing

**Setup:** User's email address is shown in settings: `waypoint-[user-id]@inbound.yourapp.com` (or similar). One-line instruction: "Forward any email to this address to add it to your inbox."

**Note:** This requires provisioning an inbound email service. Evaluate cost/complexity at kickoff. Postmark Inbound is the simplest path.

### 3. Voice Note in Focus Mode

**What it does:** During a Focus Mode session, user can speak a note that gets captured without breaking flow.

- Trigger: dedicated "Note" button in Focus Mode UI (small microphone icon, bottom bar)
- Uses Web Speech API (`SpeechRecognition`) — no third-party service, runs in browser
- On click: recording indicator appears, user speaks, stops on click or silence
- Transcript displayed inline in the terminal as a message prefixed with `[voice note]:`
- Automatically saved to the session conversation (just like a typed message)
- If the note sounds like a task ("We need to follow up with Rohter about pricing") → Claude optionally suggests creating an inbox item: "Want to add this as a triage item?"

**Graceful degradation:** Web Speech API is not supported in all browsers. If unavailable, the button is hidden. No error, no fallback required — it's an enhancement.

### 4. Web Clipper (Stretch — evaluate last)

**What it does:** Browser extension that clips a page, article, or selected text as a research-type action under an outcome.

- Simple Chrome/Safari extension (manifest v3)
- On clip: sends selected text + URL + page title to `POST /api/inbox/clip`
- Creates inbox item with `source = 'web_clip'`, `url = [source url]`
- User triages it normally in the morning inbox

**This is a stretch goal.** Build it only if the other three vectors are solid and there's clear demand. A browser extension adds a separate distribution and maintenance surface.

---

## Out of Scope

- Zapier / Make / webhook integrations (third-party automations)
- SMS or phone call capture
- WhatsApp or other messaging platforms
- Native mobile share extension (evaluate after web clipper proves the use case)

---

## Definition of Done

- [ ] `/waypoint [text]` slash command creates inbox item from any Slack channel/DM
- [ ] Slack command responds ephemerally with confirmation
- [ ] Inbound email webhook creates inbox item from forwarded email
- [ ] User's inbound email address shown in settings
- [ ] Email body is stripped of quoted replies + signatures before storing
- [ ] Voice note button in Focus Mode triggers Web Speech API recording
- [ ] Voice note transcript appears in terminal as a session message
- [ ] Claude optionally suggests creating inbox item from task-sounding voice notes
- [ ] Voice note button hidden gracefully if Web Speech API unsupported
- [ ] Web clipper: Engineer + PM evaluate at kickoff — include or defer
- [ ] All new sources appear in inbox with correct `source` label
- [ ] All new items feed the existing Smart Inbox Triage flow unchanged
- [ ] Engineer + PM sign-off
