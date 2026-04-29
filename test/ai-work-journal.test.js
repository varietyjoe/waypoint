'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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

function startServer(port, apiKey) {
  const tmpPath = path.join(os.tmpdir(), `ai-work-waypoint-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const server = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      DATABASE_PATH: tmpPath,
      PORT: String(port),
      WAYPOINT_API_KEY: apiKey,
      NODE_ENV: 'test',
    },
    stdio: 'pipe',
  });
  return { server, tmpPath };
}

function cleanup(server, tmpPath) {
  server.kill('SIGTERM');
  for (const ext of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(tmpPath + ext); } catch (_) {}
  }
}

test('POST /api/journal/ai-work validates and upserts an AI work journal entry', async () => {
  const port = 19285;
  const apiKey = 'ai-work-test-key';
  const { server, tmpPath } = startServer(port, apiKey);
  const baseUrl = `http://localhost:${port}`;

  try {
    await waitForServer(`${baseUrl}/health`);

    const invalid = await fetch(`${baseUrl}/api/journal/ai-work`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ tool: 'codex', summary: 'missing session' }),
    });
    assert.equal(invalid.status, 400);

    const payload = {
      session_id: 'codex:test-session',
      tool: 'codex',
      cwd: '/Users/joetancula/Desktop/projects/waypoint',
      started_at: '2026-04-29T10:00:00.000Z',
      summary: 'Implemented automatic AI work journaling.',
      files_changed: ['/Users/joetancula/Desktop/projects/waypoint/src/routes/api.js'],
      commands_run: ['npm test'],
      tests_run: ['npm test'],
      status: 'active',
    };

    const created = await fetch(`${baseUrl}/api/journal/ai-work`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(payload),
    });
    assert.equal(created.status, 200);
    const createdBody = await created.json();
    assert.equal(createdBody.success, true);
    assert.equal(createdBody.data.type, 'ai_work');
    assert.equal(createdBody.data.session_id, 'codex:test-session');

    const updated = await fetch(`${baseUrl}/api/journal/ai-work`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ ...payload, summary: 'Updated rolling summary.', status: 'paused' }),
    });
    assert.equal(updated.status, 200);
    const updatedBody = await updated.json();
    assert.equal(updatedBody.data.id, createdBody.data.id);
    assert.equal(updatedBody.data.status, 'paused');

    const list = await fetch(`${baseUrl}/api/daily-entries?type=ai_work&limit=10`, {
      headers: { 'x-api-key': apiKey },
    });
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.success, true);
    assert.equal(listBody.data.length, 1);
  } finally {
    cleanup(server, tmpPath);
  }
});

test('standup and review daily entries still reject ai_work through the legacy endpoint', async () => {
  const port = 19286;
  const apiKey = 'legacy-journal-test-key';
  const { server, tmpPath } = startServer(port, apiKey);
  const baseUrl = `http://localhost:${port}`;

  try {
    await waitForServer(`${baseUrl}/health`);

    const aiViaLegacy = await fetch(`${baseUrl}/api/daily-entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ date: '2026-04-29', type: 'ai_work', content: 'not allowed here' }),
    });
    assert.equal(aiViaLegacy.status, 400);

    const standup = await fetch(`${baseUrl}/api/daily-entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ date: '2026-04-29', type: 'standup', content: 'Ship the logger.' }),
    });
    assert.equal(standup.status, 200);
    const body = await standup.json();
    assert.equal(body.success, true);
    assert.equal(body.data.type, 'standup');
  } finally {
    cleanup(server, tmpPath);
  }
});

test('AI work logger supports dry-run, offline queue, and drain', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waypoint-ai-log-'));
  const script = path.join(__dirname, '..', 'scripts', 'ai-work-journal.js');
  const hookInput = {
    cwd: '/Users/joetancula/Desktop/projects/waypoint',
    session_id: 'logger-test-session',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    last_assistant_message: 'Logger test completed.',
  };

  try {
    const dry = spawnSync('node', [script, 'claude-stop', '--dry-run'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, WAYPOINT_AI_LOG_STATE_DIR: stateDir },
      input: JSON.stringify(hookInput),
      encoding: 'utf8',
    });
    assert.equal(dry.status, 0);
    assert.match(dry.stdout, /Logger test completed/);

    const offline = spawnSync('node', [script, 'claude-stop'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        WAYPOINT_AI_LOG_STATE_DIR: stateDir,
        WAYPOINT_API_URL: 'http://127.0.0.1:9',
        WAYPOINT_API_KEY: 'test-key',
      },
      input: JSON.stringify(hookInput),
      encoding: 'utf8',
    });
    assert.equal(offline.status, 0);
    const queuePath = path.join(stateDir, 'queue.jsonl');
    assert.ok(fs.existsSync(queuePath));

    const drain = spawnSync('node', [script, 'drain', '--dry-run'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, WAYPOINT_AI_LOG_STATE_DIR: stateDir },
      encoding: 'utf8',
    });
    assert.equal(drain.status, 0);
    assert.equal(fs.existsSync(queuePath), false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('AI work logger strips git porcelain status from scanned files', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waypoint-ai-log-'));
  const repoRoot = fs.mkdtempSync(path.join(__dirname, '..', '.tmp-ai-log-git-'));
  const script = path.join(__dirname, '..', 'scripts', 'ai-work-journal.js');
  const filePath = path.join(repoRoot, 'note.txt');

  try {
    spawnSync('git', ['init'], { cwd: repoRoot, encoding: 'utf8' });
    fs.writeFileSync(filePath, 'before\n');
    spawnSync('git', ['add', 'note.txt'], { cwd: repoRoot, encoding: 'utf8' });
    spawnSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    fs.writeFileSync(filePath, 'after\n');

    const dry = spawnSync('node', [script, 'codex-notify', '--dry-run'], {
      cwd: repoRoot,
      env: { ...process.env, WAYPOINT_AI_LOG_STATE_DIR: stateDir },
      input: JSON.stringify({
        cwd: repoRoot,
        session_id: 'porcelain-test-session',
        last_assistant_message: 'Porcelain parsing test.',
      }),
      encoding: 'utf8',
    });

    assert.equal(dry.status, 0);
    assert.match(dry.stdout, new RegExp(filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(dry.stdout, /\/M note\.txt/);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
