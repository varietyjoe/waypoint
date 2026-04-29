#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DESKTOP_ROOT = '/Users/joetancula/Desktop';
const REPO_ROOT = path.resolve(__dirname, '..');
const STATE_DIR = process.env.WAYPOINT_AI_LOG_STATE_DIR || path.join(os.homedir(), '.waypoint-ai-log');
const STATE_PATH = path.join(STATE_DIR, 'sessions.json');
const QUEUE_PATH = path.join(STATE_DIR, 'queue.jsonl');
const CONFIG_PATH = path.join(STATE_DIR, 'config.json');
const IDLE_MS = Number(process.env.WAYPOINT_AI_LOG_IDLE_MS || 15 * 60 * 1000);

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function readDotEnv(filePath) {
  try {
    const out = {};
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      out[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
    return out;
  } catch (_) {
    return {};
  }
}

function readConfig() {
  const envFile = readDotEnv(path.join(REPO_ROOT, '.env'));
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {}

  return {
    apiUrl: process.env.WAYPOINT_API_URL || fileConfig.apiUrl || envFile.WAYPOINT_API_URL || 'http://localhost:3000',
    apiKey: process.env.WAYPOINT_API_KEY || fileConfig.apiKey || envFile.WAYPOINT_API_KEY || '',
    dryRun: process.argv.includes('--dry-run') || process.env.WAYPOINT_AI_LOG_DRY_RUN === '1',
  };
}

function loadState() {
  ensureStateDir();
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch (_) {
    return { sessions: {} };
  }
}

function saveState(state) {
  ensureStateDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function hashId(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 16);
}

function todayISO(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function uniq(values) {
  return [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))];
}

function isDesktopPath(value) {
  if (!value) return false;
  const abs = path.resolve(String(value));
  return abs === DESKTOP_ROOT || abs.startsWith(DESKTOP_ROOT + path.sep);
}

function findGitRoot(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return null;
  }
}

function gitBranch(cwd) {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch (_) {
    return null;
  }
}

function gitHead(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch (_) {
    return null;
  }
}

function gitChangedFiles(cwd) {
  const root = findGitRoot(cwd);
  if (!root) return [];
  try {
    const output = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.replace(/^.. /, '').split(' -> ').pop())
      .map(file => path.join(root, file))
      .filter(isDesktopPath);
  } catch (_) {
    return [];
  }
}

function sessionKey(tool, input, cwd) {
  const date = todayISO();
  const source = input.session_id || input.transcript_path || input.cwd || cwd || process.cwd();
  return `${tool}:${date}:${hashId(String(source))}`;
}

function getSession(state, tool, input, cwd) {
  const key = sessionKey(tool, input, cwd);
  if (!state.sessions[key]) {
    state.sessions[key] = {
      session_id: key,
      tool,
      cwd,
      started_at: nowISO(),
      updated_at: nowISO(),
      files_changed: [],
      desktop_paths: [],
      commands_run: [],
      tests_run: [],
      deploy_status: null,
      latest_outcome: null,
      summary: '',
      status: 'active',
    };
  }
  return state.sessions[key];
}

function extractEvent(input) {
  const toolName = input.tool_name || input.toolName || '';
  const toolInput = input.tool_input || input.toolInput || {};
  const event = {
    files: [],
    commands: [],
    tests: [],
    deployStatus: null,
  };

  const filePath = toolInput.file_path || toolInput.path || toolInput.notebook_path;
  if (filePath) event.files.push(filePath);
  if (Array.isArray(toolInput.file_paths)) event.files.push(...toolInput.file_paths);
  if (toolName === 'Bash' && toolInput.command) {
    const command = String(toolInput.command);
    event.commands.push(command);
    if (/\b(npm test|node --test|pytest|uv run pytest|cargo test|go test)\b/.test(command)) {
      event.tests.push(command);
    }
    if (/\b(git push|railway|gh run|vercel --prod|npm run deploy)\b/.test(command)) {
      event.deployStatus = command;
    }
  }

  return event;
}

function updateSessionFromInput(session, input, trigger) {
  const event = extractEvent(input);
  session.updated_at = nowISO();
  session.trigger = trigger;
  session.files_changed = uniq([...session.files_changed, ...event.files.filter(isDesktopPath)]);
  session.desktop_paths = uniq([...session.desktop_paths, ...event.files.filter(isDesktopPath)]);
  session.commands_run = uniq([...session.commands_run, ...event.commands]);
  session.tests_run = uniq([...session.tests_run, ...event.tests]);
  if (event.deployStatus) session.deploy_status = event.deployStatus;

  const assistant = input.last_assistant_message || input.message || '';
  if (assistant && typeof assistant === 'string') {
    session.summary = assistant.trim().slice(0, 1200);
  }
}

function refreshGitSession(session) {
  if (!session.cwd || !isDesktopPath(session.cwd)) return;
  session.files_changed = uniq([...session.files_changed, ...gitChangedFiles(session.cwd)]);
  session.desktop_paths = uniq([...session.desktop_paths, ...session.files_changed]);
  session.git_branch = session.git_branch || gitBranch(session.cwd);
  session.commit_sha = session.commit_sha || gitHead(session.cwd);
}

function fallbackSummary(session) {
  if (session.summary) return session.summary;
  const bits = [];
  bits.push(`${session.tool === 'claude_code' ? 'Claude Code' : 'Codex'} completed work in ${session.cwd || 'a Desktop workspace'}.`);
  if (session.files_changed.length) bits.push(`${session.files_changed.length} file(s) changed.`);
  if (session.commands_run.length) bits.push(`${session.commands_run.length} command(s) run.`);
  return bits.join(' ');
}

function payloadForSession(session, status = session.status || 'active') {
  refreshGitSession(session);
  const ended = nowISO();
  const finalizedAt = status === 'finalized' || status === 'paused' ? ended : null;
  return {
    session_id: session.session_id,
    tool: session.tool,
    cwd: session.cwd,
    started_at: session.started_at,
    updated_at: ended,
    finalized_at: finalizedAt,
    status,
    summary: fallbackSummary(session),
    latest_outcome: session.latest_outcome,
    desktop_paths: uniq(session.desktop_paths),
    files_changed: uniq(session.files_changed),
    commands_run: uniq(session.commands_run),
    tests_run: uniq(session.tests_run),
    deploy_status: session.deploy_status,
    git_branch: session.git_branch || null,
    commit_sha: session.commit_sha || null,
  };
}

function shouldPost(session) {
  if (!isDesktopPath(session.cwd)) return false;
  return Boolean(session.summary || session.files_changed.length || session.commands_run.length);
}

async function postPayload(payload) {
  const config = readConfig();
  if (config.dryRun) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return true;
  }
  if (!config.apiKey) throw new Error('Missing WAYPOINT_API_KEY');

  const res = await fetch(`${config.apiUrl.replace(/\/$/, '')}/api/journal/ai-work`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Waypoint API ${res.status}: ${text.slice(0, 200)}`);
  }
  return true;
}

function queuePayload(payload, error) {
  ensureStateDir();
  fs.appendFileSync(QUEUE_PATH, JSON.stringify({ payload, error: String(error?.message || error), queued_at: nowISO() }) + '\n');
}

async function drainQueue() {
  ensureStateDir();
  if (!fs.existsSync(QUEUE_PATH)) return;
  const rows = fs.readFileSync(QUEUE_PATH, 'utf8').split(/\r?\n/).filter(Boolean);
  const remaining = [];
  for (const row of rows) {
    try {
      const item = JSON.parse(row);
      await postPayload(item.payload);
    } catch (_) {
      remaining.push(row);
    }
  }
  if (remaining.length) fs.writeFileSync(QUEUE_PATH, remaining.join('\n') + '\n');
  else fs.rmSync(QUEUE_PATH, { force: true });
}

async function flushSession(session, status) {
  if (!shouldPost(session)) return;
  const payload = payloadForSession(session, status);
  try {
    await drainQueue();
    await postPayload(payload);
  } catch (err) {
    queuePayload(payload, err);
  }
}

async function handleHook(tool, trigger, input) {
  const cwd = input.cwd || process.cwd();
  const state = loadState();
  const session = getSession(state, tool, input, cwd);
  updateSessionFromInput(session, input, trigger);

  if (trigger === 'stop' || trigger === 'codex-turn-ended') {
    await flushSession(session, 'active');
  } else if (trigger === 'session-end') {
    session.status = 'finalized';
    await flushSession(session, 'finalized');
  }

  saveState(state);
}

async function sweepIdle() {
  const state = loadState();
  const cutoff = Date.now() - IDLE_MS;
  for (const session of Object.values(state.sessions)) {
    if (session.status === 'finalized' || session.status === 'paused') continue;
    if (new Date(session.updated_at).getTime() > cutoff) continue;
    session.status = 'paused';
    await flushSession(session, 'paused');
  }
  saveState(state);
}

async function main() {
  const mode = process.argv[2] || 'codex-notify';
  const input = readStdinJson();

  if (mode === 'sweep') {
    await sweepIdle();
  } else if (mode === 'drain') {
    await drainQueue();
  } else if (mode === 'claude-session-start') {
    await handleHook('claude_code', 'session-start', input);
  } else if (mode === 'claude-post-tool') {
    await handleHook('claude_code', 'post-tool', input);
  } else if (mode === 'claude-stop') {
    await handleHook('claude_code', 'stop', input);
  } else if (mode === 'claude-session-end') {
    await handleHook('claude_code', 'session-end', input);
  } else {
    await handleHook('codex', 'codex-turn-ended', input);
  }

  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
}

main().catch(err => {
  queuePayload({ session_id: `logger-error:${Date.now()}`, tool: 'codex', summary: 'AI work logger failed', status: 'paused' }, err);
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
});
