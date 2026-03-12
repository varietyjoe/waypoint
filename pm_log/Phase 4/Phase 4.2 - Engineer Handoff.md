# Phase 4.2 — Engineer Handoff: Stakeholder Visibility

## Agent Prompt

You are building Phase 4.2 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase ships shareable outcome status links — any outcome gets a public URL the owner can send to stakeholders, no login required for the recipient. It also generates a Claude-drafted 2-sentence summary when an outcome is archived. Read this entire handoff before writing a single line of code.

---

You are building Phase 4.2 of Waypoint — a single-user personal execution OS at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing any code:**
1. `pm_log/Phase 4/Phase 4.2 - Stakeholder Visibility.md` — full phase spec
2. `src/routes/api.js` — lines 1–40 (requires + init section); lines 155–203 (archive + complete routes where the Claude summary hook goes)
3. `src/server.js` — understand how routes are mounted; the public `/s/:token` route must be added BEFORE the API router
4. `src/database/outcomes.js` — `getOutcomeById(id)`, `completeOutcome()`, and action count data
5. `src/services/claude.js` — current exports; you will add `generateOutcomeSummary` and update `module.exports`
6. `public/index.html` — `renderRightP2()` (lines ~1729–1872) for share section placement; `archiveOutcome()` function (lines ~2143–2196) for summary chip injection

---

## Known Codebase State

- **DB:** `better-sqlite3` (synchronous). New tables added via `initX()` functions in `src/database/`. Call `initX()` from `src/routes/api.js` at startup (see lines 26–37 for the existing pattern).
- **`src/services/claude.js`:** Exports `sendMessage, classifyForInbox, sendWithTools, streamFocusMessage, batchTriageInbox, summarizeFocusSession, proposeTodayPlan, generateTodayRecommendation, autoTagLibraryEntry, autoTagOutcome`. The `anthropic` client is already instantiated. Add the new function and update `module.exports`.
- **Token generation:** Do NOT import `src/utils/crypto.js` — that utility is for AES-256-GCM encryption of OAuth tokens. For share tokens, use Node's built-in `require('crypto').randomBytes(8).toString('hex')` directly in `src/database/shares.js`.
- **`escHtml`** (not `escapeHtml`) is the XSS-safe helper in `public/index.html`.
- **Model ID to use:** `claude-sonnet-4-6`
- **Route mounting in `src/server.js`:** The `GET /s/:token` public route must be registered on the `app` object BEFORE `app.use('/api', apiRoutes)` to ensure it is not captured by the API router or the 404 handler.
- **`POST /api/outcomes/:id/complete`** is the route that archives an outcome with full reflection data (lines 171–203 of `api.js`). This is where the Claude summary call goes. The simpler `POST /api/outcomes/:id/archive` (line 157) does NOT get a summary hook — it is the quick-archive with no reflection data.

---

## Pre-Build Checklist

- [ ] Read `src/routes/api.js` lines 1–40 — confirm init section pattern; note all existing `require` statements so you add `sharesDb` in the right place
- [ ] Read `src/routes/api.js` lines 171–203 — understand the existing `POST /api/outcomes/:id/complete` route before modifying it; note the existing fire-and-forget `autoTagOutcome` call that must remain intact
- [ ] Read `src/server.js` — confirm the exact line before `app.use('/api', apiRoutes)` where you will insert the public route
- [ ] Read `src/services/claude.js` bottom — confirm the current `module.exports` line before updating it
- [ ] Read `public/index.html` `renderRightP2()` function — understand where in the returned HTML string to inject the share section container div
- [ ] Read `public/index.html` `archiveOutcome()` function — understand the flow after `res.ok` to know where to inject the summary chip display logic

---

## Workstream 1 — DB: `outcome_shares` table (`src/database/shares.js`)

Create `src/database/shares.js`:

```js
const crypto = require('crypto');
const db = require('./index');

function initSharesTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS outcome_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
      share_token TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      revoked INTEGER DEFAULT 0
    )
  `);
  console.log('✅ Outcome shares table initialized');
}

function createShare(outcomeId) {
  // Revoke any existing active share first (one active share per outcome)
  revokeShare(outcomeId);
  const token = crypto.randomBytes(8).toString('hex');
  db.prepare(`
    INSERT INTO outcome_shares (outcome_id, share_token)
    VALUES (?, ?)
  `).run(outcomeId, token);
  return getShareByToken(token);
}

function getShareByToken(token) {
  return db.prepare(`
    SELECT * FROM outcome_shares WHERE share_token = ?
  `).get(token) || null;
}

function getShareByOutcome(outcomeId) {
  return db.prepare(`
    SELECT * FROM outcome_shares
    WHERE outcome_id = ? AND revoked = 0
    ORDER BY created_at DESC
    LIMIT 1
  `).get(outcomeId) || null;
}

function revokeShare(outcomeId) {
  db.prepare(`
    UPDATE outcome_shares SET revoked = 1 WHERE outcome_id = ?
  `).run(outcomeId);
}

module.exports = { initSharesTable, createShare, getShareByToken, getShareByOutcome, revokeShare };
```

**Notes:**
- `createShare` revokes any existing active share before creating a new one — one active share per outcome at a time.
- `revokeShare` sets `revoked = 1` — does NOT delete the row. Keeps audit trail.
- All functions are synchronous (better-sqlite3 — no async/await).

---

## Workstream 2 — API Routes (`src/routes/api.js`)

### 2A — Add require + init at startup

At the top of `api.js`, after the existing requires, add:

```js
const sharesDb = require('../database/shares');
```

In the init section (after line 37, where `patternsDb.initPatternTables()` is called), add:

```js
sharesDb.initSharesTable();
```

### 2B — Add three share routes

Add a `// ─── OUTCOME SHARES ───` section to `api.js`. Place it after the outcomes section and before the actions section.

```js
// ============================================================
// OUTCOME SHARES
// ============================================================

/**
 * POST /api/outcomes/:id/share
 * Creates (or re-creates) a shareable link for this outcome.
 * Returns { share_url }
 */
router.post('/outcomes/:id/share', (req, res, next) => {
  try {
    const outcomeId = parseInt(req.params.id);
    const outcome = outcomesDb.getOutcomeById(outcomeId);
    if (!outcome) return res.status(404).json({ success: false, error: 'Outcome not found' });

    const share = sharesDb.createShare(outcomeId);
    const shareUrl = `${req.protocol}://${req.get('host')}/s/${share.share_token}`;
    res.json({ success: true, data: { share_url: shareUrl, share_token: share.share_token, created_at: share.created_at } });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/outcomes/:id/share
 * Revokes the active share for this outcome.
 */
router.delete('/outcomes/:id/share', (req, res, next) => {
  try {
    const outcomeId = parseInt(req.params.id);
    sharesDb.revokeShare(outcomeId);
    res.json({ success: true, message: 'Share revoked' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/outcomes/:id/share
 * Returns the current active share for this outcome, or null.
 */
router.get('/outcomes/:id/share', (req, res, next) => {
  try {
    const outcomeId = parseInt(req.params.id);
    const share = sharesDb.getShareByOutcome(outcomeId);
    if (!share) return res.json({ success: true, data: null });

    const shareUrl = `${req.protocol}://${req.get('host')}/s/${share.share_token}`;
    res.json({ success: true, data: { share_url: shareUrl, share_token: share.share_token, created_at: share.created_at } });
  } catch (err) {
    next(err);
  }
});
```

### 2C — Modify `POST /api/outcomes/:id/complete` to include Claude summary

The existing route (lines 171–203) ends with:
```js
res.json({ success: true, message: 'Outcome completed and archived', data: result });

// Phase 3.3 — fire-and-forget: auto-tag outcome + trigger pattern recompute
claudeService.autoTagOutcome(...)...
```

Change the route handler to be `async` and insert the summary call **before** `res.json`. The fire-and-forget tag call must remain intact after. The updated route:

```js
router.post('/outcomes/:id/complete', async (req, res, next) => {
  try {
    const outcomeId = parseInt(req.params.id);
    const outcome = outcomesDb.getOutcomeById(outcomeId);
    if (!outcome) return res.status(404).json({ success: false, error: 'Outcome not found' });

    const actions = actionsDb.getActionsByOutcome(outcomeId);
    const { what_worked, what_slipped, reusable_insight, outcome_result, outcome_result_note } = req.body || {};

    if (!outcome_result || !['hit', 'miss'].includes(outcome_result)) {
      return res.status(400).json({ success: false, error: 'outcome_result must be "hit" or "miss"' });
    }

    const result = outcomesDb.completeOutcome(
      outcomeId, actions,
      { what_worked, what_slipped, reusable_insight },
      { outcome_result, outcome_result_note: outcome_result_note || null }
    );

    // Phase 4.2 — generate Claude summary synchronously before responding
    let outcomeSummary = null;
    try {
      outcomeSummary = await claudeService.generateOutcomeSummary(
        outcome.title,
        outcome_result,
        outcome_result_note || null
      );
    } catch (summaryErr) {
      console.warn('[Phase 4.2] Summary generation failed:', summaryErr.message);
    }

    res.json({ success: true, message: 'Outcome completed and archived', data: { ...result, outcome_summary: outcomeSummary } });

    // Phase 3.3 — fire-and-forget: auto-tag outcome + trigger pattern recompute
    claudeService.autoTagOutcome(outcome.title, outcome_result_note || '')
      .then(tags => {
        return require('../database/index').prepare('UPDATE outcomes SET outcome_tags = ? WHERE id = ?')
          .run(JSON.stringify(tags), outcomeId);
      })
      .then(() => computePatterns())
      .catch(e => console.error('[Patterns] Archive compute failed:', e.message));

  } catch (err) {
    next(err);
  }
});
```

**Important:** Change `(req, res, next) => {` to `async (req, res, next) => {`. The existing `try/catch` wrapper handles any thrown errors. The summary call is wrapped in its own try/catch so a Claude failure never blocks the archive response.

---

## Workstream 3 — Public Status Card Route (`src/server.js`)

The `GET /s/:token` route must be added to `src/server.js` directly on the `app` object, BEFORE `app.use('/api', apiRoutes)`. It has no auth middleware.

In `src/server.js`, after the existing `require` statements at the top, add:

```js
const sharesDb = require('./database/shares');
const outcomesDb = require('./database/outcomes');
const actionsDb = require('./database/actions');
```

Then, before the line `app.use('/api', apiRoutes)`, insert:

```js
// ─── PUBLIC SHARE ROUTE — no auth ──────────────────────────────────────────
app.get('/s/:token', (req, res) => {
  const share = sharesDb.getShareByToken(req.params.token);

  const inactivePage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link no longer active</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f9fafb; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px;
            padding: 40px 48px; text-align: center; max-width: 380px; }
    h2 { font-size: 16px; font-weight: 600; color: #111827; margin: 0 0 8px; }
    p  { font-size: 13px; color: #6b7280; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h2>This link is no longer active.</h2>
    <p>The status update you were looking for has been revoked or expired.</p>
  </div>
</body>
</html>`;

  if (!share || share.revoked === 1) {
    return res.status(410).send(inactivePage);
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return res.status(410).send(inactivePage);
  }

  // Fetch outcome + action stats
  const outcome = outcomesDb.getOutcomeById(share.outcome_id);
  if (!outcome) return res.status(410).send(inactivePage);

  const actions = actionsDb.getActionsByOutcome(share.outcome_id);
  const totalActions = actions.length;
  const doneActions  = actions.filter(a => a.done).length;
  const pct          = totalActions > 0 ? Math.round((doneActions / totalActions) * 100) : 0;
  const filledBars   = Math.round(pct / 10);
  const progressBar  = '█'.repeat(filledBars) + '░'.repeat(10 - filledBars);

  const escHtml = s => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  let statusHtml = '';
  if (outcome.status === 'archived') {
    const closedDate = outcome.archived_at
      ? new Date(outcome.archived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    const resultLabel = outcome.outcome_result === 'hit' ? 'Hit it' : outcome.outcome_result === 'miss' ? "Didn't land" : 'Closed';
    statusHtml = `
      <div class="row"><span class="label">Status</span><span class="value closed">Closed &middot; ${escHtml(resultLabel)}</span></div>
      <div class="row"><span class="label">Closed</span><span class="value">${escHtml(closedDate)}</span></div>
      ${outcome.outcome_result_note ? `<div class="row"><span class="label">Result</span><span class="value">${escHtml(outcome.outcome_result_note)}</span></div>` : ''}
    `;
  } else {
    const dueDisplay = outcome.deadline
      ? new Date(outcome.deadline + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      : '—';
    const updatedDisplay = outcome.updated_at
      ? new Date(outcome.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '—';
    statusHtml = `
      <div class="row"><span class="label">Status</span><span class="value active">In progress</span></div>
      <div class="row"><span class="label">Due</span><span class="value">${escHtml(dueDisplay)}</span></div>
      <div class="row progress-row">
        <span class="label">Progress</span>
        <span class="value progress-val">
          <span class="prog-bar">${progressBar}</span>
          <span class="prog-count">${doneActions} of ${totalActions} done</span>
        </span>
      </div>
      <div class="row"><span class="label">Last updated</span><span class="value">${escHtml(updatedDisplay)}</span></div>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(outcome.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f9fafb; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px;
            padding: 32px 36px; max-width: 440px; width: 100%; }
    .title { font-size: 18px; font-weight: 700; color: #111827; margin: 0 0 20px; line-height: 1.3; }
    .row   { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; font-size: 13px; }
    .label { color: #9ca3af; min-width: 90px; font-size: 11px; text-transform: uppercase;
             letter-spacing: 0.05em; font-weight: 600; flex-shrink: 0; }
    .value { color: #111827; }
    .value.active { color: #2563eb; font-weight: 600; }
    .value.closed { color: #059669; font-weight: 600; }
    .progress-row { align-items: center; }
    .progress-val { display: flex; align-items: center; gap: 10px; }
    .prog-bar  { font-family: monospace; font-size: 13px; color: #374151; letter-spacing: 1px; }
    .prog-count { color: #6b7280; font-size: 11px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">${escHtml(outcome.title)}</div>
    ${statusHtml}
  </div>
</body>
</html>`;

  res.send(html);
});
```

**Key constraint:** This route has NO session/auth middleware. No `app.use(session(...))` wrapping. It must be reachable without any login. Mount it before `app.use('/api', apiRoutes)`.

---

## Workstream 4 — Claude Archive Summary (`src/services/claude.js`)

Add the following function to `claude.js`, after the existing `autoTagOutcome` function:

```js
async function generateOutcomeSummary(outcomeTitle, outcomeResult, resultNote) {
  const prompt = `Write a 2-sentence professional outcome summary. First sentence: what was accomplished. Second sentence: the key result or impact. Plain text, no markdown. Tone: professional, concise.

Outcome: "${outcomeTitle}"
Result: ${outcomeResult || 'completed'}
${resultNote ? `Result note: "${resultNote}"` : ''}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content.find(b => b.type === 'text')?.text?.trim() || '';
}
```

Update `module.exports` at the bottom of the file — add `generateOutcomeSummary` to the existing exports object:

```js
module.exports = { sendMessage, classifyForInbox, sendWithTools, streamFocusMessage, batchTriageInbox, summarizeFocusSession, proposeTodayPlan, generateTodayRecommendation, autoTagLibraryEntry, autoTagOutcome, generateOutcomeSummary };
```

---

## Workstream 5 — Frontend: Share UI + Archive Summary Chip (`public/index.html`)

### 5A — Share Section in Right Panel (`renderRightP2`)

In `renderRightP2()`, at the end of the returned HTML string, just before the closing `</div>` of the panel, add a share section container. The container is populated asynchronously by `loadShareSection(outcomeId)`:

```js
// At the end of the return template string in renderRightP2(), before the final </div>:
  <!-- Share -->
  <div class="text-gray-400 font-semibold uppercase tracking-wider mb-2 mt-3" style="font-size:10px">Share Status</div>
  <div id="outcome-share-section-${o.id}">
    <div class="text-gray-300" style="font-size:10px">Loading…</div>
  </div>
```

After `renderRightPanel()` is called in `selectOutcome()`, trigger the async load:

```js
// In selectOutcome(), after renderRightPanel() calls:
if (selectedId) loadShareSection(selectedId);
```

Also call it after `renderRightPanel()` in `renderAll()` when phase is 2 and selectedId exists:
```js
// In renderAll() after renderRightPanel():
if (currentPhase === 2 && selectedId) loadShareSection(selectedId);
```

### 5B — Share JS functions

Add the following functions in the JS section of `public/index.html`:

```js
// ============================================================
// SHARE STATUS — Phase 4.2
// ============================================================

async function loadShareSection(outcomeId) {
  const el = document.getElementById(`outcome-share-section-${outcomeId}`);
  if (!el) return;
  try {
    const res = await fetch(`/api/outcomes/${outcomeId}/share`);
    const data = await res.json();
    if (data.data) {
      // Active share exists — show URL + Revoke
      el.innerHTML = `
        <div class="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <div class="text-gray-600 font-medium mb-2" style="font-size:10px">Active link</div>
          <div class="text-gray-500 break-all mb-2" style="font-size:9px;line-height:1.4">${escHtml(data.data.share_url)}</div>
          <div class="flex gap-2">
            <button onclick="copyShareLink('${escHtml(data.data.share_url)}')"
              class="flex-1 bg-gray-900 text-white rounded-lg font-medium py-1.5 hover:bg-gray-700 transition-colors"
              style="font-size:10px">Copy link</button>
            <button onclick="revokeShareLink(${outcomeId})"
              class="border border-gray-200 text-gray-500 rounded-lg font-medium py-1.5 px-3 hover:bg-gray-50 transition-colors"
              style="font-size:10px">Revoke</button>
          </div>
        </div>`;
    } else {
      // No active share — show generate button
      el.innerHTML = `
        <button onclick="generateShareLink(${outcomeId})"
          class="w-full border border-gray-200 text-gray-600 rounded-xl py-2 font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
          style="font-size:11px">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
          </svg>
          Share status →</button>`;
    }
  } catch (e) {
    el.innerHTML = '';
  }
}

async function generateShareLink(outcomeId) {
  try {
    const res = await fetch(`/api/outcomes/${outcomeId}/share`, { method: 'POST' });
    if (!res.ok) throw new Error('share failed');
    await loadShareSection(outcomeId);
  } catch (e) {
    showToast('Failed to generate share link', 'warning');
  }
}

async function revokeShareLink(outcomeId) {
  try {
    const res = await fetch(`/api/outcomes/${outcomeId}/share`, { method: 'DELETE' });
    if (!res.ok) throw new Error('revoke failed');
    await loadShareSection(outcomeId);
    showToast('Share link revoked', 'info');
  } catch (e) {
    showToast('Failed to revoke share link', 'warning');
  }
}

function copyShareLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link copied!', 'success');
  }).catch(() => {
    showToast('Copy failed — use browser copy', 'warning');
  });
}
```

### 5C — Archive Summary Chip

In `archiveOutcome()` in `public/index.html`, the archive API call is currently:

```js
const res = await fetch(`/api/outcomes/${archivingId}/complete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ what_worked, what_slipped, reusable_insight, outcome_result, outcome_result_note }),
})
if (!res.ok) throw new Error('complete failed')
```

After the `if (!res.ok)` check, parse the response and conditionally show the summary chip:

```js
const archiveData = await res.json();
const summary = archiveData.data?.outcome_summary;

// Phase 2.6: show archive overlay (existing)
playSound('archive')
showArchiveOverlay(archivingTitle, actionsDone, totalMinutes)

// Phase 4.2: show summary chip if Claude returned one
if (summary) {
  showOutcomeSummaryChip(summary);
}
```

Add the chip function:

```js
// ============================================================
// OUTCOME SUMMARY CHIP — Phase 4.2
// ============================================================

function showOutcomeSummaryChip(summaryText) {
  // Remove any existing chip
  document.getElementById('outcome-summary-chip')?.remove();

  const chip = document.createElement('div');
  chip.id = 'outcome-summary-chip';
  chip.style.cssText = `
    position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
    background:#fff; border:1px solid #e5e7eb; border-radius:16px;
    padding:16px 20px; max-width:480px; width:calc(100% - 48px);
    box-shadow:0 8px 24px rgba(0,0,0,0.10); z-index:1000;
    animation:fadeInUp 250ms ease-out forwards;
  `;

  chip.innerHTML = `
    <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">
      Summary generated — ready to forward
    </div>
    <div style="font-size:13px;color:#111827;line-height:1.5;margin-bottom:12px;">
      ${escHtml(summaryText)}
    </div>
    <div style="display:flex;gap:8px;">
      <button
        onclick="navigator.clipboard.writeText(${JSON.stringify(summaryText)}).then(()=>showToast('Summary copied!','success')); document.getElementById('outcome-summary-chip')?.remove();"
        style="flex:1;background:#111827;color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:11px;font-weight:600;cursor:pointer;">
        Copy
      </button>
      <button
        onclick="document.getElementById('outcome-summary-chip')?.remove();"
        style="border:1px solid #e5e7eb;background:#fff;color:#6b7280;border-radius:8px;padding:7px 16px;font-size:11px;font-weight:500;cursor:pointer;">
        Skip
      </button>
    </div>
  `;

  document.body.appendChild(chip);

  // Auto-dismiss after 10 seconds if not interacted with
  setTimeout(() => {
    const el = document.getElementById('outcome-summary-chip');
    if (el) {
      el.style.transition = 'opacity 400ms ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }
  }, 10000);
}
```

You may need to add a `fadeInUp` keyframe to the `<style>` section if it is not already present:

```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateX(-50%) translateY(12px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

---

## Key Constraints

| Constraint | Detail |
|---|---|
| Token generation | `require('crypto').randomBytes(8).toString('hex')` — 16 hex chars. NOT `Math.random()`. NOT `src/utils/crypto.js` (that's for OAuth AES encryption). |
| Public route placement | `GET /s/:token` must be registered on `app` in `src/server.js` BEFORE `app.use('/api', apiRoutes)`. No session or auth middleware wraps it. |
| Status card content | Shows ONLY: title, status, due date, progress count, last updated (active) or result + closed date (archived). NO action titles. NO reflection text. NO result notes beyond `outcome_result` + `outcome_result_note`. |
| Revoke behavior | `revoked = 1` only — row is never deleted. Keeps audit trail. |
| Model ID | `claude-sonnet-4-6` |
| Archive summary | Called synchronously before `res.json()` in `POST /api/outcomes/:id/complete`. Wrapped in try/catch so a Claude failure never blocks the archive response. |
| Fire-and-forget tag call | The existing `claudeService.autoTagOutcome(...)` chain in `POST /api/outcomes/:id/complete` must remain intact. The summary call goes BEFORE `res.json()`. The tag call stays AFTER `res.json()`. |
| Do not touch | `src/routes/slack.js`, `src/routes/grain.js`, `src/integrations/`, `src/utils/crypto.js`, `src/database/oauth-tokens.js`, `src/database/monitored-channels.js` |

---

## Files You Will Touch

| File | Change |
|---|---|
| `src/database/shares.js` | **CREATE** — `outcome_shares` table + CRUD functions |
| `src/services/claude.js` | Add `generateOutcomeSummary`, update `module.exports` |
| `src/routes/api.js` | Add `sharesDb` require + `initSharesTable()` call + 3 share routes + async summary in complete route |
| `src/server.js` | Add `GET /s/:token` public route + 3 requires before route mounts |
| `public/index.html` | Share section in `renderRightP2()` + `loadShareSection/generateShareLink/revokeShareLink/copyShareLink` functions + `showOutcomeSummaryChip()` + `archiveOutcome()` modification |

Five files.

---

## When You're Done

1. Log completed workstreams and any deviations to `dev_tracker/Phase 4.2 - Stakeholder Visibility.md` (create if it does not exist).
2. Verify manually:
   - Visit `GET /api/outcomes/1/share` (should return `null` initially)
   - Call `POST /api/outcomes/1/share` → get back a `share_url`
   - Visit the URL in a private/incognito browser window (no auth) → status card renders
   - Call `DELETE /api/outcomes/1/share` → revisit URL → "no longer active" page
   - Archive an outcome via Phase 3 Complete & Close → summary chip appears, [Copy] copies text, [Skip] dismisses
3. Flag for PM review and code review. Do not move to Phase 4.3 until code review passes.
