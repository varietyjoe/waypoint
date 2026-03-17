# Usage Heatmap Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub-style 30-day activity heatmap to the desktop Analytics tab, showing daily counts of actions completed + standup/review bullets.

**Architecture:** Single new API endpoint (`GET /api/analytics/heatmap`) queries existing `actions` and `daily_entries` tables, returns a date-keyed count map. Frontend renders a row of 30 colored squares above the existing stat cards.

**Tech Stack:** Express route (better-sqlite3 sync queries), vanilla JS/HTML frontend in `public/index.html`.

**Spec:** `docs/superpowers/specs/2026-03-16-usage-heatmap-design.md`

---

### Task 1: Backend — heatmap endpoint

**Files:**
- Modify: `src/routes/api.js:1949` (after the existing `/analytics` route)
- Test: `test/heatmap.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `test/heatmap.test.js`. Uses a temp in-memory DB to test the bullet-counting logic and the endpoint's query structure. Since the app uses better-sqlite3 sync queries inline in the route, we test the core logic (bullet counting + date aggregation) as a unit, then do a lightweight HTTP smoke test.

```js
// test/heatmap.test.js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// ── Unit: bullet counting ───────────────────────────────────────────────────

function countBullets(content) {
  if (!content) return 0;
  return content.split('\n').filter(line => /^\s*[-*]\s/.test(line)).length;
}

test('countBullets: counts markdown bullets', () => {
  assert.equal(countBullets('- item one\n- item two\n* item three'), 3);
});

test('countBullets: ignores non-bullet lines', () => {
  assert.equal(countBullets('hello\n- bullet\nworld'), 1);
});

test('countBullets: handles empty/null content', () => {
  assert.equal(countBullets(''), 0);
  assert.equal(countBullets(null), 0);
});

test('countBullets: handles indented bullets', () => {
  assert.equal(countBullets('  - indented\n  * also indented'), 2);
});

// ── Unit: date range generation ─────────────────────────────────────────────

function buildDateRange(endDate, days) {
  const result = {};
  const end = new Date(endDate + 'T00:00:00Z');
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    result[d.toISOString().slice(0, 10)] = 0;
  }
  return result;
}

test('buildDateRange: generates 30 days ending on given date', () => {
  const range = buildDateRange('2026-03-16', 30);
  const keys = Object.keys(range);
  assert.equal(keys.length, 30);
  assert.equal(keys[0], '2026-02-15');
  assert.equal(keys[29], '2026-03-16');
  assert.ok(keys.every(k => range[k] === 0));
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test test/heatmap.test.js`
Expected: All 5 tests PASS (these test pure utility functions, no failing implementation needed first)

- [ ] **Step 3: Add the heatmap endpoint to api.js**

In `src/routes/api.js`, add the following route after the existing `router.get('/analytics', ...)` block (after line 1949):

```js
// ── Heatmap: 30-day activity grid ───────────────────────────────────────────
router.get('/analytics/heatmap', (req, res, next) => {
  try {
    const db = require('../database/index');

    // Date range: today minus 29 days through today (30 days)
    const endDate = new Date().toISOString().slice(0, 10);
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 29);
    const startDate = start.toISOString().slice(0, 10);

    // Initialize all 30 days to 0
    const heatmap = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      heatmap[d.toISOString().slice(0, 10)] = 0;
    }

    // 1. Actions completed
    const actionRows = db.prepare(`
      SELECT DATE(done_at) as date, COUNT(*) as count
      FROM actions
      WHERE done = 1 AND done_at >= ? AND DATE(done_at) <= ?
      GROUP BY DATE(done_at)
    `).all(startDate, endDate);
    for (const row of actionRows) {
      if (row.date in heatmap) heatmap[row.date] += row.count;
    }

    // 2. Standup bullets
    const standupRows = db.prepare(`
      SELECT date, content FROM daily_entries
      WHERE date >= ? AND date <= ? AND type = 'standup'
    `).all(startDate, endDate);
    for (const row of standupRows) {
      if (row.date in heatmap) {
        heatmap[row.date] += row.content
          .split('\n')
          .filter(line => /^\s*[-*]\s/.test(line)).length;
      }
    }

    // 3. Review bullets
    const reviewRows = db.prepare(`
      SELECT date, content FROM daily_entries
      WHERE date >= ? AND date <= ? AND type = 'review'
    `).all(startDate, endDate);
    for (const row of reviewRows) {
      if (row.date in heatmap) {
        heatmap[row.date] += row.content
          .split('\n')
          .filter(line => /^\s*[-*]\s/.test(line)).length;
      }
    }

    const total = Object.values(heatmap).reduce((sum, n) => sum + n, 0);
    res.json({ success: true, data: { heatmap, total } });
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Write HTTP smoke test**

Append to `test/heatmap.test.js`. Uses the same spawn-based pattern as `test/seed.test.js` — spawns a child process with controlled env to avoid double-binding the server.

```js
// ── HTTP smoke test (spawn-based, matches seed.test.js pattern) ─────────────

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

async function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

test('GET /api/analytics/heatmap returns 30-day map', async () => {
  const { spawn } = require('child_process');
  const tmpPath = path.join(os.tmpdir(), `heatmap-test-${Date.now()}.db`);
  const TEST_PORT = 19284;
  const TEST_API_KEY = 'heatmap-test-key';

  const server = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      DATABASE_PATH: tmpPath,
      PORT: String(TEST_PORT),
      WAYPOINT_API_KEY: TEST_API_KEY,
      NODE_ENV: 'test',
    },
    stdio: 'pipe',
  });

  try {
    await waitForServer(`http://localhost:${TEST_PORT}/health`);

    const res = await fetch(`http://localhost:${TEST_PORT}/api/analytics/heatmap`, {
      headers: { 'x-api-key': TEST_API_KEY },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.success);
    assert.ok(body.data.heatmap);
    assert.equal(Object.keys(body.data.heatmap).length, 30);
    assert.equal(typeof body.data.total, 'number');
  } finally {
    server.kill('SIGTERM');
    for (const ext of ['', '-shm', '-wal']) {
      try { fs.unlinkSync(tmpPath + ext); } catch (_) {}
    }
  }
});
```

- [ ] **Step 5: Run all tests**

Run: `node --test test/heatmap.test.js`
Expected: All 6 tests PASS

- [ ] **Step 6: Update package.json test script**

In `package.json`, update the test script to include the new test file:

```json
"test": "node --test test/seed.test.js test/heatmap.test.js"
```

- [ ] **Step 7: Commit**

```bash
git add test/heatmap.test.js src/routes/api.js package.json
git commit -m "feat: add GET /api/analytics/heatmap endpoint"
```

---

### Task 2: Frontend — fetch heatmap data

**Files:**
- Modify: `public/index.html:5186-5208` (`showAnalyticsView` function)

- [ ] **Step 1: Update showAnalyticsView to fetch heatmap data**

In `public/index.html`, modify the `showAnalyticsView()` function. Add the heatmap fetch to the `Promise.all` with a `.catch` fallback, and pass the result to `renderAnalyticsView`:

Replace the existing try block (lines ~5196-5203):

```js
  try {
    const [statsRes, patternsRes, heatmapData] = await Promise.all([
      fetch('/api/analytics').then(r => r.json()),
      fetch('/api/patterns').then(r => r.json()),
      fetch('/api/analytics/heatmap').then(r => r.json()).then(r => r.data || { heatmap: {}, total: 0 }).catch(() => ({ heatmap: {}, total: 0 })),
    ]);
    const stats = statsRes.data || {};
    const patterns = patternsRes.data || [];
    renderAnalyticsView(stats, patterns, heatmapData);
  }
```

- [ ] **Step 2: Update renderAnalyticsView signature**

Change the function signature on line ~5210 from:

```js
function renderAnalyticsView(stats, patterns) {
```

to:

```js
function renderAnalyticsView(stats, patterns, heatmapData) {
```

- [ ] **Step 3: Verify the app loads without errors**

Run: `npm run dev` (or `node src/server.js`)
Open the Analytics tab in the browser. Confirm it loads without errors (heatmap won't render yet, but existing cards should still work).

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: fetch heatmap data in analytics view"
```

---

### Task 3: Frontend — render heatmap grid

**Files:**
- Modify: `public/index.html:5210-5280` (`renderAnalyticsView` function)

- [ ] **Step 1: Add heatmap HTML generation inside renderAnalyticsView**

Inside `renderAnalyticsView`, add the heatmap block at the top of the `center.innerHTML` template, right after the opening `<div style="padding:24px;max-width:720px;">` and before the "Execution Analytics" header.

Add this block:

```js
      <!-- Heatmap: 30-day activity -->
      ${(() => {
        const hm = (heatmapData && heatmapData.heatmap) || {};
        const total = (heatmapData && heatmapData.total) || 0;
        const dates = Object.keys(hm).sort();
        if (dates.length === 0) return '';

        function heatColor(count) {
          if (count === 0) return '#ebedf0';
          if (count <= 2) return '#9be9a8';
          if (count <= 5) return '#40c463';
          return '#216e39';
        }

        const squares = dates.map(date => {
          const count = hm[date] || 0;
          return '<div style="width:14px;height:14px;border-radius:2px;background:' + heatColor(count) + ';" title="' + date + ': ' + count + '"></div>';
        }).join('');

        return '<div style="margin-bottom:24px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">' +
            '<div style="font-size:11px;color:#6b7280;">Last 30 days</div>' +
            '<div style="font-size:11px;color:#6b7280;">' + total + ' contributions</div>' +
          '</div>' +
          '<div style="display:flex;gap:2px;flex-wrap:wrap;">' + squares + '</div>' +
        '</div>';
      })()}
```

- [ ] **Step 2: Visual verification**

Run the dev server, open the Analytics tab. Confirm:
- A row of 30 small squares appears above the "Execution Analytics" header
- "Last 30 days" label on left, contribution count on right
- Squares are gray (if no data) or green shades (if data exists)
- Existing stat cards still render correctly below

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: render 30-day usage heatmap on analytics tab"
```

---

### Task 4: Manual end-to-end verification

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass (seed tests + heatmap tests)

- [ ] **Step 2: Visual check with real data**

Open the desktop app, go to the Analytics tab. Verify:
- Heatmap renders with real data from the database
- Days with completed actions show green squares
- Days with standup/review entries show green squares
- Color intensity scales with activity count
- Total contribution count is accurate

- [ ] **Step 3: Final commit (if any tweaks needed)**

If any adjustments were made during verification, commit them.
