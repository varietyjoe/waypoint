# Phase 2.6 — Engineer Handoff

## Agent Prompt

You are building Phase 2.6 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase adds Delight — checkbox micro-animations, confetti + completion banner when all actions are done, an archive overlay with stats, a streak counter in the sidebar, Focus Mode exit fade, and an optional sound toggle. Read `pm_log/Phase 2/Phase 2.6 - Engineer Handoff.md` in full before writing any code, then use `dev_tracker/Phase 2.6 - Delight.md` as your working checklist. Mark items complete as you finish them.

---

You are building Phase 2.6 of Waypoint — a single-user personal execution OS at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 2/Phase 2.6 - Delight.md` — full phase spec
2. `dev_tracker/Phase 2.6 - Delight.md` — your working checklist
3. `src/database/outcomes.js` — read `getTodayStats` or wherever archived outcomes are queried, read all exported functions and `module.exports`
4. `src/routes/api.js` — find `/api/outcomes/stats/today` route (or wherever stats are returned), find `archiveOutcome` route, find `renderSidebarStats`/`loadTodayStats`
5. `public/index.html` — find `toggleAction()`, `archiveOutcome()`, `renderSidebarStats()`, `loadTodayStats()`, `exitFocusMode()`. Read each one fully before changing anything.

**Prerequisites:** Phase 2.5 complete and approved. ✅

---

## Known Codebase State

- **`toggleAction()` in `public/index.html`**: does optimistic UI update, PATCHes the action, calculates completion percentage. When `pct === 100`, calls `showToast('All actions complete…')`. **This is where confetti + banner goes.**
- **`archiveOutcome()` in `public/index.html`**: sends DELETE/PATCH request, shows toast, reloads. **This is where the overlay goes.**
- **`loadTodayStats()` in `public/index.html`**: fetches `/api/outcomes/stats/today`, calls `renderSidebarStats(data)`.
- **`renderSidebarStats(data)` in `public/index.html`**: renders today's stats in the sidebar. Currently shows `outcomes_archived_today` and `actions_completed_today`. **Add streak here.**
- **`/api/outcomes/stats/today` route in `api.js`**: calls `getTodayStats()` from outcomes.js. Returns `{ outcomes_archived_today, actions_completed_today }`.
- **`getTodayStats()` in `src/database/outcomes.js`**: returns the stats object. **Add `streak_days` here.**
- **`outcomes` table**: has `archived_at TEXT` column (ISO date string) set when an outcome is archived. Use this for streak calculation.
- **`escHtml` not `escapeHtml`** — correct helper name.
- **canvas-confetti**: load from CDN `https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js`. Exposes `confetti()` globally.
- **Sound files**: create `/public/sounds/` directory. Three files: `check.mp3`, `complete.mp3`, `archive.mp3`. Use short Web Audio API tones (no external library) or `<audio>` elements. Sound is **off by default** — stored in `localStorage` key `waypoint_sound_enabled`.

---

## Pre-Build Checklist

- [ ] Read `src/database/outcomes.js` — find `getTodayStats()`, note its return shape, confirm `archived_at` column is available
- [ ] Read `src/routes/api.js` — find `/api/outcomes/stats/today` route, find the archive outcome route
- [ ] Read `public/index.html` — read `toggleAction()` in full, `archiveOutcome()` in full, `renderSidebarStats()` in full, `exitFocusMode()` in full

---

## Workstream 1 — Streak Counter (`src/database/outcomes.js`)

Add `getStreakDays()` function:

```js
function getStreakDays() {
  // Get all distinct days that had at least one archived outcome, ordered DESC
  const rows = db.prepare(`
    SELECT DISTINCT DATE(archived_at) as day
    FROM outcomes
    WHERE archived_at IS NOT NULL
    ORDER BY day DESC
  `).all();

  if (rows.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < rows.length; i++) {
    const rowDate = new Date(rows[i].day);
    rowDate.setHours(0, 0, 0, 0);

    const expectedDate = new Date(today);
    expectedDate.setDate(today.getDate() - i);

    if (rowDate.getTime() === expectedDate.getTime()) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}
```

Update `getTodayStats()` to include `streak_days`:

```js
function getTodayStats() {
  // existing queries...
  return {
    outcomes_archived_today: /* existing */,
    actions_completed_today: /* existing */,
    streak_days: getStreakDays(),
  };
}
```

Update `module.exports` to include `getStreakDays` (optional — it's called internally, but export for testability).

---

## Workstream 2 — Frontend: Animations + Confetti + Completion Banner (`public/index.html`)

### 2A — Add canvas-confetti CDN

In `<head>`, add after the Tailwind CDN script:
```html
<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>
```

### 2B — Add CSS keyframes

In the `<style>` block, add:
```css
@keyframes checkSpring {
  0%   { transform: scale(0); }
  70%  { transform: scale(1.15); }
  100% { transform: scale(1); }
}
@keyframes strikeFill {
  from { width: 0; }
  to   { width: 100%; }
}
@keyframes rowFlash {
  0%   { background-color: transparent; }
  30%  { background-color: #f0fdf4; }
  100% { background-color: transparent; }
}
@keyframes bannerSlideDown {
  from { transform: translateY(-100%); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
@keyframes overlayFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes focusExitFade {
  0%   { opacity: 1; filter: brightness(1); }
  50%  { opacity: 0.7; filter: brightness(1.3); }
  100% { opacity: 0; }
}

.action-check-anim {
  animation: checkSpring 150ms ease-out forwards;
}
.action-row-flash {
  animation: rowFlash 200ms ease-out forwards;
}
```

### 2C — Update `toggleAction()` to add checkbox animation + confetti + completion banner

Find `toggleAction()` in `public/index.html`. Read it fully. Then:

1. After the optimistic DOM update (when checking an action), add the animation class to the action row:
```js
// Add to the action row element when marking done:
const row = document.querySelector(`[data-action-id="${actionId}"]`); // adjust selector to match actual
if (row && done) {
  row.classList.add('action-row-flash');
  row.addEventListener('animationend', () => row.classList.remove('action-row-flash'), { once: true });
}
```

2. When `pct === 100` (all actions complete), replace the existing toast with confetti + banner:
```js
if (pct === 100) {
  // Fire confetti after 500ms
  setTimeout(() => {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { x: 0.5, y: 0.1 },
        colors: ['#4ade80', '#22d3ee', '#a78bfa', '#f59e0b'],
      });
    }
  }, 500);

  // Show completion banner
  showCompletionBanner(outcomeId, outcomeTitle); // see 2D
}
```

**Note:** `outcomeId` and `outcomeTitle` — find where these are available in the current `toggleAction` scope. Read the existing function to see what variables are accessible or what you can extract from the DOM.

### 2D — `showCompletionBanner(outcomeId, outcomeTitle)`

```js
function showCompletionBanner(outcomeId, outcomeTitle) {
  // Remove any existing banner
  document.getElementById('completion-banner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'completion-banner';
  banner.style.cssText = `
    position: sticky; top: 0; z-index: 100;
    background: #16a34a; color: #fff;
    padding: 12px 16px;
    display: flex; align-items: center; justify-content: space-between;
    border-radius: 8px; margin-bottom: 8px;
    animation: bannerSlideDown 300ms ease-out forwards;
    box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3);
  `;
  banner.innerHTML = `
    <span style="font-size:13px;font-weight:600;">✓ All done · ${escHtml(outcomeTitle)}</span>
    <button
      onclick="archiveOutcome(${outcomeId}); this.closest('#completion-banner').remove();"
      style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:6px;padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;margin-left:12px;">
      Complete &amp; Close →
    </button>
  `;

  // Insert at the top of the actions list for this outcome
  // Find the outcome's action container in the DOM and prepend
  const actionsContainer = document.querySelector(`[data-outcome-id="${outcomeId}"] .actions-list`)
    || document.getElementById(`outcome-actions-${outcomeId}`); // adjust to actual selector
  if (actionsContainer) {
    actionsContainer.parentElement.insertBefore(banner, actionsContainer);
  }
}
```

**Note:** Find the actual container selector by reading `toggleAction` and the action rendering code.

---

## Workstream 3 — Archive Overlay (`public/index.html`)

Find `archiveOutcome()`. Read it fully. Then update it to:

1. Before the archive API call: collect stats (actions count + total hours):
```js
async function archiveOutcome(outcomeId) {
  // Collect stats before archiving
  let actionsDone = 0;
  let totalMinutes = 0;
  try {
    const actionsRes = await fetch(`/api/actions?outcome_id=${outcomeId}`);
    const actionsData = await actionsRes.json();
    const actions = actionsData.data || [];
    actionsDone = actions.filter(a => a.done).length;
    totalMinutes = actions.filter(a => a.done).reduce((sum, a) => sum + (a.time_estimate || 0), 0);
  } catch (_) {}

  const outcomeTitle = /* read from DOM or module state — find how archiveOutcome currently knows the title */;

  // Show archive overlay immediately
  showArchiveOverlay(outcomeTitle, actionsDone, totalMinutes);

  // Archive API call (runs behind overlay)
  try {
    await fetch(`/api/outcomes/${outcomeId}`, { method: /* check existing */ });
  } catch (_) {}

  // Reload data behind the overlay
  await Promise.all([loadData()]);
  renderAll?.();
}
```

2. `showArchiveOverlay(title, actionsDone, totalMinutes)`:
```js
function showArchiveOverlay(title, actionsDone, totalMinutes) {
  document.getElementById('archive-overlay')?.remove();

  const hours = totalMinutes >= 60
    ? `${(totalMinutes / 60).toFixed(1)}h`
    : `${totalMinutes}m`;

  const overlay = document.createElement('div');
  overlay.id = 'archive-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 999;
    background: rgba(0,0,0,0.75);
    display: flex; align-items: center; justify-content: center;
    animation: overlayFadeIn 300ms ease-out forwards;
    cursor: pointer;
  `;
  overlay.onclick = () => overlay.remove();
  overlay.innerHTML = `
    <div style="text-align:center;color:#fff;padding:40px;" onclick="event.stopPropagation()">
      <div style="font-size:48px;margin-bottom:16px;">✓</div>
      <div style="font-size:22px;font-weight:700;margin-bottom:8px;">Outcome closed</div>
      <div style="font-size:15px;color:rgba(255,255,255,0.8);margin-bottom:24px;max-width:320px;">${escHtml(title)}</div>
      <div style="display:flex;gap:32px;justify-content:center;margin-bottom:24px;">
        <div><div style="font-size:24px;font-weight:700;">${actionsDone}</div><div style="font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:.05em;">Actions</div></div>
        <div><div style="font-size:24px;font-weight:700;">${hours}</div><div style="font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:.05em;">Work</div></div>
      </div>
      <div style="font-size:14px;color:rgba(255,255,255,0.5);">Well done.</div>
    </div>
  `;

  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2500);
}
```

**Note:** Read the existing `archiveOutcome` function before modifying. Match its exact API call and reload pattern — only layer the overlay on top without breaking the existing flow. The existing reload (using `loadData()` and `renderAll()` or equivalent) must still run.

---

## Workstream 4 — Streak Counter in Sidebar (`public/index.html`)

In `renderSidebarStats(data)`, add streak display. `data.streak_days` is now included from the API.

```js
// Add to renderSidebarStats — after the existing stats:
if (data.streak_days && data.streak_days > 0) {
  // Append a streak row to the stats container
  // Format: "🔥 3-day streak" (use text, not emoji, if unsure about rendering)
  const streakEl = document.createElement('div');
  streakEl.style.cssText = 'font-size:11px;color:#374151;padding:4px 0;';
  streakEl.textContent = `${data.streak_days > 1 ? '🔥 ' : ''}${data.streak_days}-day streak`;
  // Append to the stats container — adjust selector to match actual container
  statsContainer.appendChild(streakEl);
}
```

**Note:** Read `renderSidebarStats` fully before modifying. Match the existing rendering pattern (it may use innerHTML, in which case add the streak to the HTML string instead of appendChild).

---

## Workstream 5 — Focus Mode Exit Fade (`public/index.html`)

Find `exitFocusMode()`. Read it fully. Update the exit transition:

```js
function exitFocusMode() {
  // Existing: hides focus overlay, shows main app, clears state
  // New: add a brief CSS transition on the focus container before hiding

  const focusContainer = document.getElementById('focusMode') // adjust to actual ID
    || document.querySelector('.focus-mode-container');

  if (focusContainer) {
    focusContainer.style.transition = 'opacity 300ms ease-out, filter 300ms ease-out';
    focusContainer.style.opacity = '0';
    focusContainer.style.filter = 'brightness(1.3)';

    setTimeout(() => {
      // Existing hide logic goes here
      focusContainer.style.display = 'none';
      focusContainer.style.opacity = '';
      focusContainer.style.filter = '';
      focusContainer.style.transition = '';

      // Show action checked toast
      if (focusActionId) {
        const wasChecked = /* check if the focus action is now done */;
        showToast(wasChecked ? 'Action done. Session saved.' : 'Session saved. Pick up where you left off.');
      }

      // Clear focus state (existing)
    }, 300);

    return; // Don't run synchronous hide logic below
  }

  // Fallback: run existing exit logic if element not found
  /* existing exit logic */
}
```

**Note:** Read `exitFocusMode` carefully. It currently runs synchronous hide logic. You need to wrap the existing body in the setTimeout without breaking it. Identify where it sets display:none and where it clears state variables.

---

## Workstream 6 — Sound Toggle (`public/index.html`)

### 6A — Settings toggle

Add a sound toggle somewhere accessible in the settings area (or sidebar):
```html
<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;">
  <span style="font-size:12px;color:#374151;">Sounds</span>
  <button id="sound-toggle-btn" onclick="toggleSound()"
    style="font-size:11px;padding:3px 10px;border-radius:12px;border:1px solid #e5e7eb;cursor:pointer;background:transparent;color:#6b7280;">
    Off
  </button>
</div>
```

### 6B — Sound functions

```js
let soundEnabled = localStorage.getItem('waypoint_sound_enabled') === 'true';

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('waypoint_sound_enabled', soundEnabled);
  const btn = document.getElementById('sound-toggle-btn');
  if (btn) btn.textContent = soundEnabled ? 'On' : 'Off';
}

function playSound(type) {
  if (!soundEnabled) return;
  // Use Web Audio API for tiny generated tones (no audio files needed)
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'check') {
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'complete') {
      // Ascending chime: two notes
      osc.frequency.value = 660;
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'archive') {
      osc.type = 'sine';
      osc.frequency.value = 523;
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch (_) {}
}

// Initialize toggle button state on load
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('sound-toggle-btn');
  if (btn) btn.textContent = soundEnabled ? 'On' : 'Off';
});
```

### 6C — Wire up sounds

- In `toggleAction()`, when checking (not unchecking) an action: `playSound('check')`
- In `toggleAction()`, when `pct === 100`: `playSound('complete')`
- In `archiveOutcome()` (or `showArchiveOverlay()`): `playSound('archive')`

---

## Key Constraints

- **No layout regressions** — all delight features are additive (overlays, animations, chips). Nothing moves or breaks existing UI.
- **canvas-confetti is CDN-only** — no npm, no build step.
- **Sound off by default** — `localStorage.getItem('waypoint_sound_enabled')` returns `null` on first load, treated as `false`.
- **Web Audio API tones only** — no audio files, no `/public/sounds/` directory needed.
- **Archive overlay does NOT block data reload** — `loadData()` / `renderAll()` must still run behind the overlay.
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, all integrations, crypto, oauth-tokens, monitored-channels, triage.js, inbox.js.

---

## Files You Will Touch

| File | What changes |
|---|---|
| `src/database/outcomes.js` | `getStreakDays()`, update `getTodayStats()` to include `streak_days`, update `module.exports` |
| `public/index.html` | canvas-confetti CDN, CSS keyframes, `toggleAction` animation + confetti + banner, `showCompletionBanner`, archive overlay in `archiveOutcome`, `showArchiveOverlay`, `renderSidebarStats` streak display, `exitFocusMode` fade transition, `playSound`, `toggleSound`, sound toggle UI |

Two files.

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 2.6 - Delight.md`. Log decisions. Flag for PM review.
