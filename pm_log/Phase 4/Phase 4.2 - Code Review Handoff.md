# Phase 4.2 — Code Review Handoff: Stakeholder Visibility

## Agent Prompt

You are performing a code review of Phase 4.2 of Waypoint at `/Users/joetancula/Desktop/waypoint`. This phase shipped shareable outcome status links and a Claude-generated archive summary. Your job is to verify correctness, security, and consistency against the spec. Read this file in full before opening any code.

---

## Read These Files Before Reviewing

1. `pm_log/Phase 4/Phase 4.2 - Stakeholder Visibility.md` — original spec (defines scope, constraints, definition of done)
2. `pm_log/Phase 4/Phase 4.2 - Engineer Handoff.md` — the full implementation spec the engineer followed
3. `src/database/shares.js` — the new file; review in full
4. `src/services/claude.js` — look for `generateOutcomeSummary` and the updated `module.exports`
5. `src/routes/api.js` — find `sharesDb` require, `initSharesTable()` call, and the three share routes + modified complete route
6. `src/server.js` — verify route mounting order and that `GET /s/:token` is before `app.use('/api', apiRoutes)`
7. `public/index.html` — find `renderRightP2()`, `loadShareSection`, `generateShareLink`, `revokeShareLink`, `copyShareLink`, `showOutcomeSummaryChip`, and the modified `archiveOutcome()`

---

## What Was Built

Phase 4.2 shipped five workstreams:

1. **`src/database/shares.js` (new file)** — `outcome_shares` table with `initSharesTable()`, `createShare()`, `getShareByToken()`, `getShareByOutcome()`, `revokeShare()`. All synchronous (better-sqlite3). Token generation uses `require('crypto').randomBytes(8).toString('hex')`.

2. **`src/routes/api.js`** — Three new routes: `POST /api/outcomes/:id/share` (create share, return URL), `DELETE /api/outcomes/:id/share` (revoke), `GET /api/outcomes/:id/share` (current active share or null). `sharesDb.initSharesTable()` called at startup. `POST /api/outcomes/:id/complete` modified to be `async` and call `claudeService.generateOutcomeSummary()` before `res.json()`.

3. **`src/server.js`** — `GET /s/:token` public route added before `app.use('/api', apiRoutes)`. No auth middleware. Renders server-side HTML status card or "no longer active" page.

4. **`src/services/claude.js`** — `generateOutcomeSummary(outcomeTitle, outcomeResult, resultNote)` added. Returns 2-sentence plain text summary. `module.exports` updated.

5. **`public/index.html`** — Share section added to outcome detail right panel (`renderRightP2`). `loadShareSection()`, `generateShareLink()`, `revokeShareLink()`, `copyShareLink()` added. Archive summary chip (`showOutcomeSummaryChip()`) added. `archiveOutcome()` modified to parse response and call chip function.

---

## Full Review Checklist

### Workstream 1 — `src/database/shares.js`

- [ ] File exists at `src/database/shares.js`
- [ ] `initSharesTable()` uses `CREATE TABLE IF NOT EXISTS outcome_shares` with all required columns: `id`, `outcome_id` (FK → outcomes CASCADE), `share_token UNIQUE`, `created_at`, `expires_at`, `revoked INTEGER DEFAULT 0`
- [ ] Token generation uses `require('crypto').randomBytes(8).toString('hex')` — NOT `Math.random()` — NOT `require('../utils/crypto')` (that module is for AES encryption)
- [ ] `createShare(outcomeId)` calls `revokeShare(outcomeId)` before inserting — enforces one active share per outcome
- [ ] `getShareByToken(token)` returns the row or `null` — does NOT filter on `revoked` (the caller checks revoked status)
- [ ] `getShareByOutcome(outcomeId)` filters `revoked = 0` — returns the current active share only
- [ ] `revokeShare(outcomeId)` sets `revoked = 1` — does NOT delete rows
- [ ] All exported functions are synchronous (no `async`, no `.then()`, no `await` — pure better-sqlite3 sync calls)
- [ ] `module.exports` exports: `initSharesTable`, `createShare`, `getShareByToken`, `getShareByOutcome`, `revokeShare`

### Workstream 2 — `src/routes/api.js`

- [ ] `const sharesDb = require('../database/shares')` is present in the require block at the top
- [ ] `sharesDb.initSharesTable()` is called in the startup init section (lines ~26–38 region)
- [ ] `POST /api/outcomes/:id/share` route exists — calls `sharesDb.createShare(outcomeId)` — constructs URL as `` `${req.protocol}://${req.get('host')}/s/${share.share_token}` `` — returns `{ success: true, data: { share_url, ... } }`
- [ ] `DELETE /api/outcomes/:id/share` route exists — calls `sharesDb.revokeShare(outcomeId)` — returns `{ success: true }`
- [ ] `GET /api/outcomes/:id/share` route exists — calls `sharesDb.getShareByOutcome(outcomeId)` — returns `{ success: true, data: null }` when no active share (not a 404)
- [ ] `POST /api/outcomes/:id/complete` handler signature is now `async (req, res, next)` — previously was synchronous
- [ ] In the complete route, `claudeService.generateOutcomeSummary(...)` is called **before** `res.json()`
- [ ] Summary call is wrapped in its own try/catch — a Claude failure logs a warning but does not prevent the archive response from being sent
- [ ] `res.json(...)` spreads the result: `{ ...result, outcome_summary: outcomeSummary }` where `outcomeSummary` may be `null`
- [ ] The existing Phase 3.3 fire-and-forget `autoTagOutcome` chain is still present **after** `res.json()` — it was not removed or moved before the response
- [ ] None of the other existing routes in `api.js` were modified

### Workstream 3 — `src/server.js`

- [ ] `require('./database/shares')`, `require('./database/outcomes')`, `require('./database/actions')` are present at the top of the file (or inline in the route handler)
- [ ] `app.get('/s/:token', ...)` route is registered **before** `app.use('/api', apiRoutes)` — confirm line order
- [ ] The `/s/:token` route handler has no session requirement, no auth check, no `req.user` reference
- [ ] Invalid/revoked/expired token: returns HTTP 410 with a minimal "no longer active" HTML page — NOT a JSON error, NOT a 404
- [ ] Expired check: `share.expires_at && new Date(share.expires_at) < new Date()` before serving the card
- [ ] Outcome not found after share lookup: returns 410 inactive page (graceful — no 500)
- [ ] Status card for active outcome includes: title, "In progress" status, due date, progress bar (filled/empty block chars or equivalent), action count (X of Y done), last updated time
- [ ] Status card for archived outcome includes: title, "Closed · Hit it" or "Closed · Didn't land", closed date, result note if `outcome_result_note` is present
- [ ] Status card does NOT include: action titles, reflection content (`what_worked`, `what_slipped`, `reusable_insight`), any Waypoint chrome, any login prompt, any navigation
- [ ] HTML is served with `res.send(html)` — NOT `res.json()` — NOT `res.sendFile()`
- [ ] XSS: all user-supplied strings (outcome title, result note, dates) are HTML-escaped before interpolation into the response HTML
- [ ] No `escHtml` from `public/index.html` is imported — the public route must define its own local escape function or equivalent
- [ ] The existing `app.use('/api', apiRoutes)` line is unchanged — not moved, not wrapped

### Workstream 4 — `src/services/claude.js`

- [ ] `generateOutcomeSummary(outcomeTitle, outcomeResult, resultNote)` function exists
- [ ] Uses model `claude-sonnet-4-6` (not `claude-opus-4-6`, not `claude-haiku`)
- [ ] `max_tokens: 100` — tight limit appropriate for a 2-sentence response
- [ ] Prompt includes: outcome title, result (`hit`/`miss`/`completed`), result note (conditionally)
- [ ] Returns `response.content.find(b => b.type === 'text')?.text?.trim() || ''` — returns empty string on no content, not null/undefined
- [ ] `module.exports` line includes `generateOutcomeSummary` alongside all previously exported functions — no existing exports were removed: `sendMessage`, `classifyForInbox`, `sendWithTools`, `streamFocusMessage`, `batchTriageInbox`, `summarizeFocusSession`, `proposeTodayPlan`, `generateTodayRecommendation`, `autoTagLibraryEntry`, `autoTagOutcome`, `generateOutcomeSummary`

### Workstream 5 — `public/index.html`

**Share section in `renderRightP2()`:**
- [ ] A container `div` with id `outcome-share-section-${o.id}` is rendered inside the right panel HTML string
- [ ] Container is placed in a logical location — after the deadline/work sections, near the bottom of the panel
- [ ] `loadShareSection(selectedId)` is called after `renderRightPanel()` in `selectOutcome()`
- [ ] `loadShareSection` is also triggered after `renderRightPanel()` in `renderAll()` when `currentPhase === 2 && selectedId`

**`loadShareSection(outcomeId)` function:**
- [ ] Fetches `GET /api/outcomes/${outcomeId}/share`
- [ ] When `data.data` is non-null: renders existing share URL (truncated or full) + "Copy link" + "Revoke" buttons
- [ ] When `data.data` is null: renders "Share status →" button that calls `generateShareLink(outcomeId)`
- [ ] All user-supplied URL strings are escaped with `escHtml()` before rendering into innerHTML
- [ ] Function is async, errors are caught silently (does not crash the panel)

**`generateShareLink(outcomeId)` function:**
- [ ] Calls `POST /api/outcomes/${outcomeId}/share`
- [ ] On success: calls `loadShareSection(outcomeId)` to re-render
- [ ] On failure: calls `showToast('...', 'warning')`

**`revokeShareLink(outcomeId)` function:**
- [ ] Calls `DELETE /api/outcomes/${outcomeId}/share`
- [ ] On success: calls `loadShareSection(outcomeId)` + shows toast
- [ ] On failure: shows warning toast

**`copyShareLink(url)` function:**
- [ ] Uses `navigator.clipboard.writeText(url)`
- [ ] On success: calls `showToast('...', 'success')` or equivalent
- [ ] On failure: handles gracefully (clipboard not available in some contexts)

**`archiveOutcome()` modification:**
- [ ] Response from `POST /api/outcomes/.../complete` is now parsed: `const archiveData = await res.json()`
- [ ] `outcome_summary` is read from `archiveData.data?.outcome_summary`
- [ ] `showOutcomeSummaryChip(summary)` is called only when `summary` is truthy (not when `null` or empty string)
- [ ] The existing `playSound('archive')` and `showArchiveOverlay(...)` calls are unchanged and still present
- [ ] The existing reload sequence (`loadData()`, `loadArchivedOutcomes()`, `loadTodayStats()`) is unchanged

**`showOutcomeSummaryChip(summaryText)` function:**
- [ ] Renders a fixed-position chip in the viewport (not inside any scrolling container)
- [ ] Contains the summary text (escaped with `escHtml()` or equivalent)
- [ ] Contains a [Copy] button: copies `summaryText` to clipboard, shows success toast, dismisses chip
- [ ] Contains a [Skip] button: dismisses chip immediately
- [ ] Auto-dismisses after 10 seconds with a fade/opacity transition
- [ ] Removes any existing chip (`document.getElementById('outcome-summary-chip')?.remove()`) before appending a new one

---

## What Is Out of Scope

Do not flag the following as issues — they are explicitly out of scope for Phase 4.2:

- Password-protected share links (revoke is sufficient for v1)
- Automatic link expiry (the `expires_at` column exists but is not set — manual revoke only)
- OG preview / meta tags on the `/s/:token` page
- Embedding via iframe
- Custom branding on the public card
- Recipients interacting with the card (commenting, reacting)
- Owner name / attribution on the public card
- Share links for the simple `POST /api/outcomes/:id/archive` quick-archive route (only the `complete` route gets the summary)
- Any changes to `src/routes/slack.js`, `src/routes/grain.js`, `src/integrations/`, `src/utils/crypto.js`, `src/database/oauth-tokens.js`, `src/database/monitored-channels.js`

---

## Common Failure Patterns to Watch For

| Risk | What to Check |
|---|---|
| Route order bug | If `GET /s/:token` is registered AFTER `app.use('/api', apiRoutes)` or AFTER the 404 handler, it will never be reached. Confirm line order in `server.js`. |
| Auth middleware wrapping public route | If `GET /s/:token` is inside a session-required block, recipients get a login redirect. Confirm it has no auth wrapper. |
| XSS in status card | Outcome titles and result notes are user input. Confirm they are HTML-escaped in the server-rendered card. The `escHtml` function from `index.html` is NOT available in server code. |
| `async` route but missing `await` | If `POST .../complete` was made async but `generateOutcomeSummary` is not awaited, the summary will always be null. |
| `res.json()` before summary call | If `res.json()` is called before `await generateOutcomeSummary(...)`, the response is sent without the summary. Response cannot be written twice. |
| Tag chain moved before `res.json()` | The `autoTagOutcome` fire-and-forget chain must remain after `res.json()`. If it was accidentally moved before the response, it blocks the response time with pattern recompute. |
| `getShareByToken` filtering revoked | `getShareByToken` is used by the public route and should return ANY row for the token (even revoked) so the caller can explicitly check `share.revoked === 1`. If the DB function filters out revoked rows, revoked tokens return 404-style behavior instead of 410 + "no longer active". |
| Missing `loadShareSection` trigger | If `loadShareSection` is not called after `renderRightPanel()` in `selectOutcome()`, the share section will always show "Loading…" when switching outcomes. |
| `outcome_summary` not in response spread | If the `res.json` call in the complete route does not spread `outcome_summary`, the frontend chip never fires. Check `{ ...result, outcome_summary: outcomeSummary }`. |

---

## When You're Done

Log your verdict to `test_tracker/Phase 4.2 - Stakeholder Visibility.md` (create if it does not exist).

Include:
- Date reviewed
- Files reviewed (with line ranges for key changes)
- Any issues found (critical / minor / nitpick)
- Verdict: **approved for Phase 4.3** or **blocked — list issues**

If blocked, the engineer must address all critical issues and re-submit for review before Phase 4.3 begins.
