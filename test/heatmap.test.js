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
