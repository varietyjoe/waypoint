# Phase 4.0 — Engineer Handoff: Capture Everywhere

## Agent Prompt

You are building Phase 4.0 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase adds four new capture vectors — a Slack slash command, an email inbound webhook, a voice note button in Focus Mode, and two polish items (Recently Closed sidebar + project filter tabs with quick capture). Read this file in full before writing a single line of code, then use `dev_tracker/Phase 4.0 - Capture Everywhere.md` as your working checklist. Mark items complete as you finish them.

---

## Read These Files Before Writing Any Code

1. `pm_log/Phase 4/Phase 4.0 - Capture Everywhere.md` — full phase spec
2. `dev_tracker/Phase 4.0 - Capture Everywhere.md` — your working checklist
3. `src/routes/slack.js` — understand existing Slack router structure; find the `inbox` require at the top, how routes are registered, and the `sendSlackDM` function at the bottom
4. `src/routes/api.js` — read the first 80 lines (requires + init block) to understand where new DB requires and `initX()` calls go
5. `src/database/inbox.js` — read `addToInbox()` in full; note the `source_type` validation allowlist at line 47 — you must expand it
6. `src/database/outcomes.js` — read `getArchivedOutcomes()` — you'll add a `getRecentlyClosed()` wrapper or alias
7. `public/index.html` — search for `enterFocusMode` (line ~4274) to find the Focus Mode overlay HTML; search for `renderPhase1` (line ~1080) to find the outcomes list; search for `sidebarRecentlyClosed` to see the already-wired sidebar slot

---

## Known Codebase State

- **Slack infrastructure:** The user OAuth token flow is in `src/routes/slack.js`. The bot token is NOT stored separately — the app uses a user OAuth token (`xoxp-`) stored via `oauthTokens`. For the slash command, Slack sends an HTTP POST to your server directly; you do NOT need a bot token for the response — you respond with JSON in the HTTP response body.
- **`inbox` source_type allowlist:** `src/database/inbox.js` line 47 hard-rejects any `source_type` not in `['slack', 'grain', 'manual']`. You must expand this list to include `'slack_command'` and `'email_forward'` — or remove the validation and store source in `source_metadata` only. Expanding the allowlist is preferred for query-ability.
- **`addToInbox` is async in signature but uses sync `better-sqlite3` internally.** Call it with `await` to stay consistent with the existing codebase pattern even though it resolves synchronously.
- **Recently Closed is partly implemented:** `ARCHIVED_OUTCOMES`, `renderRecentlyClosed()`, `loadArchivedOutcomes()`, the sidebar HTML slot (`#sidebarRecentlyClosed`), and the `GET /api/outcomes/archived` route already exist. Workstream 4 adds a dedicated alias route and ensures the data limit is correct (3, not 5).
- **Filter tabs and quick capture (Workstream 5) are frontend-only.** No new routes required. `getAllOutcomes({ project_id })` already supports project filtering.
- **Model ID:** `claude-sonnet-4-6`
- **DB:** `better-sqlite3` sync.

---

## Pre-Build Checklist

- [ ] Read `src/database/inbox.js` lines 44–49 — confirm the `source_type` allowlist; plan your expansion
- [ ] Read `src/routes/slack.js` top 15 lines — confirm `inbox` is already required there (`const inbox = require('../database/inbox')`)
- [ ] Read `src/routes/api.js` lines 1–38 — confirm require/init pattern before adding new routes
- [ ] Search `public/index.html` for `enterFocusMode` — read the overlay HTML template in full to know where the mic button goes
- [ ] Search `public/index.html` for `renderPhase1` — read the function to know where filter tabs and quick capture insert
- [ ] Confirm `.env` exists at project root; add `INBOUND_EMAIL_ADDRESS=` placeholder

---

## Workstream 1 — Slack `/waypoint` Slash Command

**File:** `src/routes/slack.js`

**Setup context (put in a comment above the handler):**
```
// SLACK SLASH COMMAND SETUP
// In your Slack app manifest or App Dashboard:
//   1. Go to Features → Slash Commands → Create New Command
//   2. Command: /waypoint
//   3. Request URL: https://your-domain.com/api/slack/waypoint-command
//   4. Short description: "Capture anything to Waypoint inbox"
//   5. Usage hint: "[any text]"
// Slack sends a POST with: token, command, text, user_id, channel_name (form-urlencoded)
// Respond within 3 seconds. The 200 JSON response IS the ephemeral reply.
```

**Step 1 — Expand `inbox` source_type allowlist in `src/database/inbox.js`:**

Find line 47:
```js
if (!source_type || !['slack', 'grain', 'manual'].includes(source_type)) {
    throw new Error('source_type must be "slack", "grain", or "manual"');
}
```

Replace with:
```js
const VALID_SOURCE_TYPES = ['slack', 'grain', 'manual', 'slack_command', 'email_forward'];
if (!source_type || !VALID_SOURCE_TYPES.includes(source_type)) {
    throw new Error(`source_type must be one of: ${VALID_SOURCE_TYPES.join(', ')}`);
}
```

**Step 2 — Add the slash command handler to `src/routes/slack.js`:**

Add this block before `module.exports = router`:

```js
/**
 * POST /api/slack/waypoint-command
 * Handles the /waypoint slash command from Slack.
 *
 * SLACK SLASH COMMAND SETUP
 * In your Slack app manifest or App Dashboard:
 *   1. Go to Features → Slash Commands → Create New Command
 *   2. Command: /waypoint
 *   3. Request URL: https://your-domain.com/api/slack/waypoint-command
 *   4. Short description: Capture anything to Waypoint inbox
 *   5. Usage hint: [any text]
 * Slack sends a POST with form-urlencoded body: token, command, text, user_id, channel_name
 * Respond within 3 seconds — this JSON response IS the ephemeral reply shown in Slack.
 */
router.post('/waypoint-command', async (req, res) => {
    try {
        const { text, user_id, channel_name, user_name } = req.body;

        const rawText = (text || '').trim();
        if (!rawText) {
            return res.json({
                response_type: 'ephemeral',
                text: 'Usage: `/waypoint [your note or task]`',
            });
        }

        await inbox.addToInbox({
            title: rawText.length > 120 ? rawText.slice(0, 117) + '…' : rawText,
            description: null,
            source_type: 'slack_command',
            source_url: null,
            source_metadata: {
                slack_user_id: user_id || null,
                slack_user_name: user_name || null,
                channel_name: channel_name || null,
                raw_text: rawText,
            },
        });

        console.log(`[Waypoint Cmd] Captured from Slack by ${user_name || user_id}: "${rawText.slice(0, 60)}"`);

        return res.json({
            response_type: 'ephemeral',
            text: 'Added to your Waypoint inbox. ✓',
        });
    } catch (err) {
        console.error('[Waypoint Cmd] Error:', err.message);
        return res.status(200).json({
            response_type: 'ephemeral',
            text: 'Something went wrong. Try again.',
        });
    }
});
```

**Note:** Slack slash command POST bodies are `application/x-www-form-urlencoded`. Express's `express.urlencoded({ extended: true })` middleware (already in `src/server.js`) handles this. Verify it is applied globally before this router; if not, add `router.use(express.urlencoded({ extended: true }))` at the top of slack.js.

---

## Workstream 2 — Email Forward Inbound Webhook

**Files:** `src/routes/api.js`, `.env`

### 2A — `.env` placeholder

Add to `.env`:
```
INBOUND_EMAIL_ADDRESS=
```

Document: User must provision an inbound email service (Postmark Inbound, Mailgun Inbound Routes, or SendGrid Inbound Parse — all have free tiers). The service parses incoming emails and POSTs a JSON payload to the webhook URL.

### 2B — Route in `src/routes/api.js`

Add this route in the INBOX section (search for `// INBOX` or near the `GET /api/inbox` route):

```js
/**
 * POST /api/inbox/email-inbound
 * Inbound email webhook — receives parsed email payloads from Postmark/Mailgun/SendGrid.
 *
 * EMAIL SERVICE SETUP
 *   Postmark Inbound: Dashboard → Servers → Inbound → set webhook to:
 *     https://your-domain.com/api/inbox/email-inbound
 *   Mailgun: Routes → Create Route → action: forward to this URL
 *   SendGrid Inbound Parse: Settings → Inbound Parse → add hostname + URL
 *
 * Expected payload fields (varies by provider — normalize below):
 *   Postmark: { Subject, TextBody, HtmlBody, From, FromFull: { Email, Name } }
 *   Mailgun:  { subject, body-plain, body-html, sender, from }
 *   SendGrid: { subject, text, html, from }
 */
router.post('/inbox/email-inbound', async (req, res, next) => {
    try {
        const body = req.body;

        // Normalize across providers
        const subject  = body.Subject || body.subject || '(no subject)';
        const textBody = body.TextBody || body['body-plain'] || body.text || '';
        const htmlBody = body.HtmlBody || body['body-html'] || body.html || '';
        const from     = body.From || body.sender || body.from || '';
        const fromName = body.FromFull?.Name || from.split('<')[0].trim() || from;
        const fromEmail= body.FromFull?.Email || (from.match(/<(.+?)>/) || [])[1] || from;

        // Prefer plain text; strip HTML tags as fallback
        let rawText = textBody || htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        // Strip quoted replies: lines starting with ">" or "On ... wrote:" blocks
        rawText = stripEmailQuotes(rawText);

        if (!rawText && !subject) {
            return res.status(400).json({ success: false, error: 'Empty email body' });
        }

        const title = subject.replace(/^(Fwd?:|Re:)\s*/i, '').trim() || rawText.slice(0, 80);

        await inboxDb.addToInbox({
            title: title.length > 120 ? title.slice(0, 117) + '…' : title,
            description: rawText.slice(0, 500) || null,
            source_type: 'email_forward',
            source_url: null,
            source_metadata: {
                from_name: fromName,
                from_email: fromEmail,
                subject: subject,
                raw_text: rawText.slice(0, 2000),
            },
        });

        console.log(`[Email Inbound] Captured from ${fromEmail}: "${title.slice(0, 60)}"`);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});
```

Add the `stripEmailQuotes` helper near the top of `api.js` (after the requires, before routes):

```js
/**
 * Strip quoted reply content from an email body.
 * Removes lines starting with ">" and "On [date] ... wrote:" blocks.
 */
function stripEmailQuotes(text) {
    if (!text) return '';
    const lines = text.split('\n');
    const cleaned = [];
    for (const line of lines) {
        const trimmed = line.trim();
        // Stop at quoted reply block markers
        if (/^On .+wrote:$/i.test(trimmed)) break;
        if (trimmed.startsWith('>')) continue;
        cleaned.push(line);
    }
    return cleaned.join('\n').trim();
}
```

### 2C — Inbound email display in Settings UI (`public/index.html`)

In the Briefings settings block inside `#memory-panel` (search for `Send me a test brief now` — insert the following block immediately after that button's closing `</button>` tag and before the closing `</div>` of the Briefings section):

```html
<!-- Inbound Email Address (Phase 4.0) -->
<div style="margin-top:12px;padding-top:12px;border-top:1px solid #f3f4f6;">
  <div style="font-size:10px;color:#6b7280;margin-bottom:4px;">Inbound email address</div>
  <div id="inbound-email-display" style="font-size:11px;color:#374151;font-family:monospace;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;word-break:break-all;">
    Loading…
  </div>
  <div style="font-size:10px;color:#9ca3af;margin-top:4px;">Forward any email here to add it to your inbox.</div>
</div>
```

Add this JS function alongside the other settings loaders:

```js
function loadInboundEmailDisplay() {
  const el = document.getElementById('inbound-email-display');
  if (!el) return;
  const addr = ''; // populated from env — server must expose it or hardcode from your inbound service
  // Fetch from a lightweight endpoint or fall back to env instruction
  fetch('/api/inbox/inbound-email-address')
    .then(r => r.json())
    .then(d => { if (el) el.textContent = d.address || 'Set INBOUND_EMAIL_ADDRESS in .env'; })
    .catch(() => { if (el) el.textContent = 'Set INBOUND_EMAIL_ADDRESS in .env'; });
}
```

Add the corresponding route to `api.js`:

```js
// GET /api/inbox/inbound-email-address — expose configured inbound email address
router.get('/inbox/inbound-email-address', (req, res) => {
    res.json({ success: true, address: process.env.INBOUND_EMAIL_ADDRESS || null });
});
```

Call `loadInboundEmailDisplay()` inside `loadBriefingsSettings()` (or wherever the Memory panel opens).

---

## Workstream 3 — Voice Note in Focus Mode

**File:** `public/index.html`

**Where to insert:** Inside `enterFocusMode()`, find the bottom bar `<div>` that holds the `<textarea id="focus-input">`. It currently reads:

```html
<div style="padding:0 40px 36px;flex-shrink:0;">
  <div style="border-top:1px solid #1a1a1a;padding-top:16px;display:flex;align-items:flex-start;gap:8px;">
    <span style="color:#4ade80;font-size:13px;margin-top:3px;">&gt;</span>
    <textarea
      id="focus-input"
      ...
    ></textarea>
  </div>
</div>
```

Replace the inner `<div>` (the flex container holding the prompt and textarea) with:

```html
<div style="border-top:1px solid #1a1a1a;padding-top:16px;display:flex;align-items:flex-start;gap:8px;">
  <span style="color:#4ade80;font-size:13px;margin-top:3px;">&gt;</span>
  <textarea
    id="focus-input"
    rows="1"
    placeholder="Ask Claude anything about this task..."
    style="flex:1;background:transparent;border:none;outline:none;color:#e5e7eb;font-family:'JetBrains Mono',monospace;font-size:13px;resize:none;line-height:1.5;"
    onkeydown="focusInputKeydown(event)"
  ></textarea>
  <button
    id="focus-mic-btn"
    onclick="toggleVoiceNote()"
    title="Voice note"
    style="display:none;background:transparent;border:none;cursor:pointer;color:#6b7280;padding:2px 4px;font-size:16px;line-height:1;margin-top:2px;"
  >🎙</button>
  <span id="focus-recording-indicator" style="display:none;font-size:10px;color:#ef4444;margin-top:6px;font-family:'JetBrains Mono',monospace;">⏺ recording</span>
</div>
```

Add this JS block after `focusInputKeydown`:

```js
// ============================================================
// PHASE 4.0 — VOICE NOTE IN FOCUS MODE
// ============================================================

let voiceRecognition = null;
let voiceRecording   = false;

function initVoiceNote() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return; // Graceful degradation — hide button, do nothing

  const micBtn = document.getElementById('focus-mic-btn');
  if (micBtn) micBtn.style.display = '';

  voiceRecognition = new SpeechRecognition();
  voiceRecognition.continuous    = false;
  voiceRecognition.interimResults = false;
  voiceRecognition.lang          = 'en-US';

  voiceRecognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript.trim();
    stopVoiceRecording();
    if (!transcript) return;

    // Append transcript as a user message in the terminal
    appendFocusMessage('user', `[voice note]: ${transcript}`);

    // Check if it sounds task-like — ask Claude with a minimal prompt
    const taskCheck = await checkVoiceNoteIsTask(transcript);

    // Always send to Focus Mode as a message
    const input = document.getElementById('focus-input');
    if (input) { input.value = transcript; }
    await sendFocusMessage();

    // Show "Add to inbox?" chip if task-like
    if (taskCheck) {
      showVoiceInboxChip(transcript);
    }
  };

  voiceRecognition.onerror = (event) => {
    console.warn('[Voice] Recognition error:', event.error);
    stopVoiceRecording();
  };

  voiceRecognition.onend = () => {
    stopVoiceRecording();
  };
}

function toggleVoiceNote() {
  if (voiceRecording) {
    if (voiceRecognition) voiceRecognition.stop();
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
}

function startVoiceRecording() {
  if (!voiceRecognition) return;
  voiceRecording = true;
  const micBtn = document.getElementById('focus-mic-btn');
  const indicator = document.getElementById('focus-recording-indicator');
  if (micBtn) micBtn.style.color = '#ef4444';
  if (indicator) indicator.style.display = '';
  voiceRecognition.start();
}

function stopVoiceRecording() {
  voiceRecording = false;
  const micBtn = document.getElementById('focus-mic-btn');
  const indicator = document.getElementById('focus-recording-indicator');
  if (micBtn) micBtn.style.color = '#6b7280';
  if (indicator) indicator.style.display = 'none';
}

async function checkVoiceNoteIsTask(transcript) {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Does this sound like a task or commitment that should be tracked? Reply with only the single word "task" or "not".\n\n"${transcript}"`,
        history: [],
      }),
    });
    const data = await res.json();
    const reply = (data.reply || data.response || '').toLowerCase().trim();
    return reply.startsWith('task');
  } catch {
    return false;
  }
}

function showVoiceInboxChip(transcript) {
  const container = document.getElementById('focus-messages');
  if (!container) return;

  const chip = document.createElement('div');
  chip.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:#111827;border:1px solid #22c55e;border-radius:8px;margin-top:4px;font-family:"JetBrains Mono",monospace;font-size:11px;color:#9ca3af;';
  chip.innerHTML = `
    <span style="color:#4ade80;">?</span>
    <span>Add to inbox?</span>
    <button onclick="addVoiceNoteToInbox(this, ${JSON.stringify(transcript)})"
      style="margin-left:auto;background:#22c55e;color:#000;border:none;border-radius:4px;padding:2px 10px;font-size:10px;font-family:'JetBrains Mono',monospace;cursor:pointer;font-weight:600;">
      Yes
    </button>
    <button onclick="this.closest('div').remove()"
      style="background:transparent;color:#4b5563;border:none;font-size:10px;font-family:'JetBrains Mono',monospace;cursor:pointer;">
      No
    </button>`;
  container.appendChild(chip);
  container.scrollTop = container.scrollHeight;
}

async function addVoiceNoteToInbox(btn, transcript) {
  btn.closest('div').remove();
  try {
    await fetch('/api/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: transcript.length > 120 ? transcript.slice(0, 117) + '…' : transcript,
        source_type: 'manual',
        source_metadata: { origin: 'voice_note', action_id: focusActionId },
      }),
    });
    // Show confirmation inline
    const container = document.getElementById('focus-messages');
    if (container) {
      const confirm = document.createElement('div');
      confirm.style.cssText = 'font-size:11px;color:#4ade80;font-family:"JetBrains Mono",monospace;padding:4px 0;';
      confirm.textContent = '✓ Added to inbox';
      container.appendChild(confirm);
      container.scrollTop = container.scrollHeight;
    }
  } catch {
    // Fail silently — not a critical feature
  }
}
```

Call `initVoiceNote()` at the end of `enterFocusMode()`, just before `document.getElementById('focus-input')?.focus()`:

```js
initVoiceNote();
document.getElementById('focus-input')?.focus();
```

**Note:** The `sendFocusMessage()` function reads from `#focus-input`. The voice note flow sets `input.value = transcript` and then calls `sendFocusMessage()` — this means the transcript goes through the existing streaming Claude chat path, which is intentional: the user gets Claude's contextual response about the voice note.

**Constraint:** Web Speech API requires HTTPS or localhost. In development it works on `localhost`. In production, you must be on HTTPS.

---

## Workstream 4 — Recently Closed Sidebar Section

**Files:** `src/routes/api.js`, `public/index.html`

**Codebase reality check:** This is largely already built:
- `GET /api/outcomes/archived` exists (line 70 of `api.js`)
- `ARCHIVED_OUTCOMES` global array exists
- `loadArchivedOutcomes()` fetches `?limit=5`
- `renderRecentlyClosed()` renders `#sidebarRecentlyClosed`
- `renderSidebarStats()` calls nothing — `renderRecentlyClosed()` is called from `loadData()` (line 798)

**What to add:**

### 4A — Dedicated alias route in `src/routes/api.js`

Add after `GET /api/outcomes/archived`:

```js
/**
 * GET /api/outcomes/recently-closed
 * Returns the 3 most recently archived outcomes with archived_at.
 * Alias for /api/outcomes/archived?limit=3, kept explicit for clarity.
 */
router.get('/outcomes/recently-closed', (req, res, next) => {
    try {
        const outcomes = outcomesDb.getArchivedOutcomes(3);
        res.json({ success: true, count: outcomes.length, data: outcomes });
    } catch (err) {
        next(err);
    }
});
```

### 4B — Update `loadArchivedOutcomes()` in `public/index.html`

Change the fetch limit from 5 to 3 to match the "recently closed" intent:

Find:
```js
const res = await fetch('/api/outcomes/archived?limit=5')
```

Replace with:
```js
const res = await fetch('/api/outcomes/recently-closed')
```

The `renderRecentlyClosed()` function and `#sidebarRecentlyClosed` slot are already correct — no further changes needed there.

---

## Workstream 5 — Project Filter Tabs + Quick Capture

**File:** `public/index.html` only — no new routes needed.

**Where to insert:** Inside `renderPhase1()`, find the return template string. The current structure is:

```js
return `<div class="p-6 fade-in">
    <div class="flex items-center justify-between mb-4">
      ...header with "Active Outcomes" title and "New Outcome" button...
    </div>
    <div class="flex items-center gap-2 mb-4 text-gray-400" style="font-size:10px">
      ...dot legend...
    </div>
    ${OUTCOMES.length === 0 ? `...empty state...` : ''}
    <div class="space-y-4">${cards}</div>
  </div>`
```

### 5A — State variable

Add near the top of the script (with other globals like `let OUTCOMES = []`):

```js
let activeProjectFilter = null; // null = "All"
```

### 5B — Update `renderPhase1()` to accept filter state

Replace the `renderPhase1` function with this updated version:

```js
function renderPhase1() {
  // Filter outcomes by selected project tab
  const filteredOutcomes = activeProjectFilter
    ? OUTCOMES.filter(o => o.project_id === activeProjectFilter)
    : OUTCOMES;

  const cards = filteredOutcomes.map(o => {
    // ... (keep ALL existing card HTML unchanged — paste it here)
  }).join('');

  // Build project filter tabs
  const distinctProjects = [];
  const seenIds = new Set();
  for (const o of OUTCOMES) {
    if (!seenIds.has(o.project_id)) {
      seenIds.add(o.project_id);
      distinctProjects.push({ id: o.project_id, name: o.project, color: o.projectColor });
    }
  }

  const tabsHtml = distinctProjects.length > 1 ? `
    <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">
      <button
        onclick="setProjectFilter(null)"
        style="padding:4px 12px;border-radius:20px;border:1px solid ${activeProjectFilter === null ? '#111827' : '#e5e7eb'};background:${activeProjectFilter === null ? '#111827' : 'transparent'};color:${activeProjectFilter === null ? '#fff' : '#6b7280'};font-size:11px;cursor:pointer;font-weight:500;">
        All
      </button>
      ${distinctProjects.map(p => `
        <button
          onclick="setProjectFilter(${p.id})"
          style="padding:4px 12px;border-radius:20px;border:1px solid ${activeProjectFilter === p.id ? p.color || '#111827' : '#e5e7eb'};background:${activeProjectFilter === p.id ? (p.color || '#111827') : 'transparent'};color:${activeProjectFilter === p.id ? '#fff' : '#6b7280'};font-size:11px;cursor:pointer;font-weight:500;">
          ${escHtml(p.name)}
        </button>
      `).join('')}
    </div>
  ` : '';

  // Quick capture input
  const quickCapture = `
    <div style="margin-top:20px;display:flex;align-items:center;gap:8px;padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
      <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
      </svg>
      <input
        id="quick-capture-outcome"
        type="text"
        placeholder="Add outcome…"
        style="flex:1;background:transparent;border:none;outline:none;font-size:12px;color:#374151;"
        onkeydown="handleQuickCaptureOutcome(event)"
      />
    </div>`;

  return `<div class="p-6 fade-in">
    <div class="flex items-center justify-between mb-4">
      <div>
        <div class="font-semibold text-gray-900 text-sm">Active Outcomes</div>
        <div class="text-gray-400 mt-0.5" style="font-size:11px">Select an outcome to begin executing on it</div>
      </div>
      <button
        class="flex items-center gap-1.5 font-medium text-white bg-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
        style="font-size:11px"
        onclick="handleNewOutcome()"
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        New Outcome
      </button>
    </div>

    <div class="flex items-center gap-2 mb-4 text-gray-400" style="font-size:10px">
      <div class="flex gap-1">
        <div class="w-2 h-2 bg-emerald-400 rounded-full"></div>
        <div class="w-2 h-2 bg-blue-400 rounded-full"></div>
        <div class="w-2 h-2 bg-amber-400 rounded-full"></div>
      </div>
      Recommended: 1–3 active outcomes at a time. You currently have ${OUTCOMES.length}.
    </div>

    ${tabsHtml}

    ${filteredOutcomes.length === 0 ? `<div class="bg-white border border-dashed border-gray-200 rounded-xl p-8 text-center">
      <div class="text-gray-400 text-sm mb-3">${activeProjectFilter ? 'No outcomes in this project' : 'No active outcomes yet'}</div>
      <div class="text-gray-300" style="font-size:11px">Use the input below or "New Outcome" to create one</div>
    </div>` : ''}

    <div class="space-y-4">${cards}</div>

    ${quickCapture}
  </div>`;
}
```

### 5C — Add the two new functions

```js
function setProjectFilter(projectId) {
  activeProjectFilter = projectId;
  render(); // or call: document.getElementById('centerContent').innerHTML = renderPhase1()
}

async function handleQuickCaptureOutcome(e) {
  if (e.key !== 'Enter') return;
  const input = document.getElementById('quick-capture-outcome');
  const title = input?.value.trim();
  if (!title) return;
  input.value = '';

  // Determine which project to assign: use filter if active, else first project
  const projectId = activeProjectFilter || (PROJECTS[0]?.id || null);
  if (!projectId) {
    showToast('Create a project first', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/outcomes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, project_id: projectId }),
    });
    if (!res.ok) throw new Error('create failed');
    await loadData();
    showToast('Outcome created', 'success');
  } catch {
    showToast('Failed to create outcome', 'warning');
  }
}
```

**Note on `setProjectFilter`:** Check how `render()` is called in this codebase — look for the central render function. If it's named differently (e.g., `renderAll()`), use that. Alternatively, call `document.getElementById('centerContent').innerHTML = renderPhase1()` directly if `currentPhase === 1`.

---

## Workstream 6 — Wire "Open in Focus →" from Library

**File:** `public/index.html` only.

**Context:** Phase 3.2 built the Library right detail panel with an "Open in Focus →" button, but left it as a stub. This workstream wires it. The vision intent: clicking this button on any Library entry opens Focus Mode with that entry's content pre-injected as Claude context — letting the user pick up where they left off on a saved artifact.

**How it works:** Focus Mode needs an action and outcome to display in the header. Library entries saved from Focus Mode have a `source` field. For entries with no associated outcome (manually saved), open an exploratory Focus session with no header action — just the Library entry as context.

**Step 1 — Add `openLibraryEntryInFocus(entryId)` alongside the other Library JS functions:**

```js
async function openLibraryEntryInFocus(entryId) {
  try {
    const res = await fetch(`/api/library/${entryId}`);
    const data = await res.json();
    const entry = data.data;
    if (!entry) return;

    // Stash the Library context so enterFocusMode can inject it
    window._libraryFocusContext = {
      title: entry.title || entry.key || 'Library entry',
      content: entry.value || '',
    };

    // Open Focus Mode — use null action/outcome for library-driven sessions
    enterFocusMode(null, null);
  } catch (err) {
    console.error('[Library] Failed to open in Focus:', err);
  }
}
```

**Step 2 — Inject Library context into Focus Mode's initial state.**

Inside `enterFocusMode()`, just after `initVoiceNote()` and before `document.getElementById('focus-input')?.focus()`, add:

```js
// Library context injection (Phase 4.0)
if (window._libraryFocusContext) {
  const ctx = window._libraryFocusContext;
  window._libraryFocusContext = null; // consume it

  // Show the library entry as an initial system message in the terminal
  const messages = document.getElementById('focus-messages');
  if (messages) {
    const block = document.createElement('div');
    block.style.cssText = 'padding:10px 0 16px;border-bottom:1px solid #1a1a1a;margin-bottom:12px;';
    block.innerHTML = `
      <div style="font-size:10px;color:#4b5563;font-family:'JetBrains Mono',monospace;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Library: ${escHtml(ctx.title)}</div>
      <div style="font-size:12px;color:#9ca3af;font-family:'JetBrains Mono',monospace;white-space:pre-wrap;line-height:1.6;">${escHtml(ctx.content.slice(0, 600))}${ctx.content.length > 600 ? '\n…' : ''}</div>
    `;
    messages.appendChild(block);
  }

  // Pre-fill the input with a prompt so user can immediately converse about the entry
  const input = document.getElementById('focus-input');
  if (input) input.placeholder = `Ask Claude about "${ctx.title}"…`;

  // Store it on the session so the backend Focus route can inject it as context
  window._focusLibraryPayload = { title: ctx.title, content: ctx.content };
}
```

**Step 3 — Wire the "Open in Focus →" button in `renderLibraryDetail()` (the right panel renderer).**

Find the "Open in Focus →" button in the Library right panel HTML. It currently has no onclick. Replace:

```html
<button style="...">Open in Focus →</button>
```

With:

```html
<button onclick="openLibraryEntryInFocus(${entry.id})" style="...">Open in Focus →</button>
```

(Exact style attributes remain unchanged — only add the `onclick`.)

**Constraint:** `window._libraryFocusContext` and `window._focusLibraryPayload` are consumed once and nulled out — they must not persist across Focus sessions.

---

## Key Constraints

- **DO NOT TOUCH:** `src/routes/grain.js`, `src/integrations/`, `src/utils/crypto.js`, `src/database/oauth-tokens.js` schema
- **`inbox` source_type validation:** You must expand the allowlist in `src/database/inbox.js` line 47 before any new `addToInbox()` call will succeed with `'slack_command'` or `'email_forward'`
- **Voice note `sendFocusMessage()`:** The existing function reads from `#focus-input`. Set `input.value = transcript` before calling it, do NOT duplicate the streaming logic
- **Voice note degradation:** If `window.SpeechRecognition` and `window.webkitSpeechRecognition` are both undefined, the `#focus-mic-btn` must remain `display:none`. No error shown.
- **Slack slash command body format:** Slack POSTs `application/x-www-form-urlencoded` — not JSON. Confirm `express.urlencoded()` is applied before the slack router in `src/server.js`
- **Email inbound:** The route accepts the webhook payload, but the actual email provisioning (Postmark/Mailgun/SendGrid account setup) is the user's responsibility. Document the setup in a comment.
- **Web clipper is DEFERRED.** Do not implement it.
- **Model ID:** `claude-sonnet-4-6`

---

## Files You Will Touch

| File | Change |
|---|---|
| `src/routes/slack.js` | Add `POST /api/slack/waypoint-command` handler |
| `src/database/inbox.js` | Expand `source_type` allowlist to include `'slack_command'` and `'email_forward'` |
| `src/routes/api.js` | Add `POST /api/inbox/email-inbound`, `GET /api/inbox/inbound-email-address`, `GET /api/outcomes/recently-closed`; add `stripEmailQuotes()` helper |
| `public/index.html` | Voice note mic button + JS in Focus Mode; Library "Open in Focus →" wiring (`openLibraryEntryInFocus`, context injection in `enterFocusMode`); `loadArchivedOutcomes` URL update; `setProjectFilter()`, `handleQuickCaptureOutcome()`, `activeProjectFilter` global, updated `renderPhase1()`; inbound email display in settings |
| `.env` | Add `INBOUND_EMAIL_ADDRESS=` placeholder |

Five files.

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 4.0 - Capture Everywhere.md`. Log any decisions or deviations. Flag for PM + code review.

Key verification steps before marking complete:
1. `/waypoint hello from Slack` creates an inbox item with `source_type = 'slack_command'` — verify in DB
2. POST to `/api/inbox/email-inbound` with a sample Postmark payload creates an inbox item with `source_type = 'email_forward'`
3. In Focus Mode, the mic button appears only if Web Speech API is available; clicking records, transcript appears in terminal, Claude responds, "Add to inbox?" chip appears
4. `GET /api/outcomes/recently-closed` returns at most 3 archived outcomes with `archived_at`
5. Project tabs render only when there are 2+ distinct projects; "All" tab shows all; clicking a project tab filters the list; Enter in quick capture creates an outcome
6. "Open in Focus →" button in Library right panel opens Focus Mode with the entry's content displayed in the terminal and pre-injected as context
