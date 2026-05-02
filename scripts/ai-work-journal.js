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
const HOOK_EVENTS_PATH = path.join(STATE_DIR, 'hook-events.jsonl');
const IDLE_MS = Number(process.env.WAYPOINT_AI_LOG_IDLE_MS || 15 * 60 * 1000);
const IGNORED_PATH_PARTS = new Set([
  '.git',
  '.obsidian',
  '.superpowers',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
]);
const IGNORED_SUFFIXES = ['.db-shm', '.db-wal', '.DS_Store'];

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function parseJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw.trim());
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function readStdinJson() {
  try {
    return parseJsonObject(fs.readFileSync(0, 'utf8'));
  } catch (_) {
    return {};
  }
}

function readArgvJson() {
  for (const arg of process.argv.slice(3)) {
    const trimmed = String(arg || '').trim();
    if (!trimmed.startsWith('{')) continue;
    const parsed = parseJsonObject(trimmed);
    if (Object.keys(parsed).length) return parsed;
  }
  return {};
}

function normalizeInput(input) {
  const normalized = { ...(input || {}) };
  const aliases = {
    'thread-id': 'thread_id',
    'turn-id': 'turn_id',
    'last-assistant-message': 'last_assistant_message',
    'input-messages': 'input_messages',
    'transcript-path': 'transcript_path',
    'tool-name': 'tool_name',
    'tool-input': 'tool_input',
  };

  for (const [from, to] of Object.entries(aliases)) {
    if (normalized[to] === undefined && normalized[from] !== undefined) {
      normalized[to] = normalized[from];
    }
  }

  if (!normalized.session_id) {
    normalized.session_id = normalized.thread_id || normalized.turn_id;
  }

  return normalized;
}

function readInputJson() {
  const stdin = readStdinJson();
  const argv = readArgvJson();
  return normalizeInput(Object.keys(stdin).length ? stdin : argv);
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

function isWorkPath(value) {
  if (!isDesktopPath(value)) return false;
  const abs = path.resolve(String(value));
  const parts = abs.split(path.sep);
  if (parts.some(part => IGNORED_PATH_PARTS.has(part))) return false;
  return !IGNORED_SUFFIXES.some(suffix => abs.endsWith(suffix));
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
      .filter(Boolean)
      .map(line => line.slice(3).trim().split(' -> ').pop())
      .map(file => path.join(root, file))
      .filter(isWorkPath);
  } catch (_) {
    return [];
  }
}

function relativeWorkPath(cwd, file) {
  const root = findGitRoot(cwd) || cwd;
  try {
    const rel = path.relative(root, file);
    return rel && !rel.startsWith('..') ? rel : file;
  } catch (_) {
    return file;
  }
}

function projectName(cwd) {
  const root = findGitRoot(cwd) || cwd || '';
  return path.basename(root) || 'Desktop project';
}

function isLowSignalSummary(summary) {
  const text = String(summary || '').trim();
  return !text
    || /^\{[\s\S]*"risk_level"[\s\S]*"outcome"[\s\S]*\}$/.test(text)
    || /^No files edited\./i.test(text)
    || /\*\*Likely Root Cause\*\*/i.test(text)
    || /settings\.json[\s\S]*(SessionStart|PostToolUse|SessionEnd)/i.test(text)
    || /subagent_notification/i.test(text)
    || /current repo state shows/i.test(summary)
    || /\bfile\(s\) changed\b/i.test(summary)
    || /\bcompleted work in\b/i.test(summary);
}

function inferChangeFromFile(file) {
  const rel = file.replace(/\\/g, '/');
  const base = path.basename(rel);
  if (/scripts\/ai-work-journal\.js|test\/ai-work-journal\.test\.js/.test(rel)) return 'fixed AI work journal logging';
  if (/\.claude\/settings\.json|\.claude\/settings\.local\.json/.test(rel)) return 'updated Claude Code hook configuration';
  if (/src\/routes\/api\.js|daily-entries/i.test(rel)) return 'improved AI work journal storage';
  if (/public\/index\.html/.test(rel)) return 'improved the Waypoint journal UI';
  if (/mockup|prototype/i.test(rel)) return 'created or refined product mockups';
  if (/drawer|rail|tile|quote|pricing|labor|cost/i.test(rel)) return 'advanced quote, labor, and cost experience work';
  if (/\.(css|scss)$/.test(base)) return 'refined styling and layout';
  if (/\.(html|hbs|ejs|njk)$/.test(base)) return 'updated UI structure and screen flows';
  if (/\.(js|mjs|cjs|ts|tsx)$/.test(base)) return 'changed application behavior';
  if (/route|api|server/i.test(rel)) return 'updated backend/API behavior';
  if (/test|spec/i.test(rel)) return 'added or updated verification coverage';
  if (/doc|readme|brief|plan/i.test(rel)) return 'updated supporting documentation';
  return `touched ${rel}`;
}

function inferChanges(session) {
  const files = uniq(session.files_changed).map(file => relativeWorkPath(session.cwd, file));
  return uniq(files.map(inferChangeFromFile)).slice(0, 5);
}

function executiveSummary(session) {
  if (!isLowSignalSummary(session.summary)) return session.summary.trim();
  const changes = uniq([...(session.changes || []), ...inferChanges(session)]).slice(0, 5);
  if (changes.length) {
    return `${projectName(session.cwd)}: ${changes.join(', ')}.`;
  }
  return `${session.tool === 'claude_code' ? 'Claude Code' : 'Codex'} worked in ${projectName(session.cwd)}.`;
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

function cleanAssistantSummary(value) {
  const summary = String(value || '').trim();
  if (!summary || isLowSignalSummary(summary)) return '';
  return summary
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function updateSessionFromInput(session, input, trigger) {
  const event = extractEvent(input);
  session.updated_at = nowISO();
  session.trigger = trigger;
  session.files_changed = uniq([...session.files_changed, ...event.files.filter(isWorkPath)]);
  session.desktop_paths = uniq([...session.desktop_paths, ...event.files.filter(isWorkPath)]);
  session.commands_run = uniq([...session.commands_run, ...event.commands]);
  session.tests_run = uniq([...session.tests_run, ...event.tests]);
  if (event.deployStatus) session.deploy_status = event.deployStatus;
  if (input.latest_outcome || input.outcome) session.latest_outcome = String(input.latest_outcome || input.outcome).trim();
  if (Array.isArray(input.changes)) session.changes = uniq([...(session.changes || []), ...input.changes]);

  const assistant = cleanAssistantSummary(input.last_assistant_message || input.message || '');
  if (assistant) {
    session.summary = assistant;
  }
}

function refreshGitSession(session) {
  if (!session.cwd || !isDesktopPath(session.cwd)) return;
  if (process.env.WAYPOINT_AI_LOG_INCLUDE_GIT_STATUS === '1') {
    session.files_changed = uniq([...session.files_changed, ...gitChangedFiles(session.cwd)]).filter(isWorkPath);
  }
  session.desktop_paths = uniq([...session.desktop_paths, ...session.files_changed]).filter(isWorkPath);
  session.git_branch = session.git_branch || gitBranch(session.cwd);
  session.commit_sha = session.commit_sha || gitHead(session.cwd);
}

function fallbackSummary(session) {
  return executiveSummary(session);
}

function payloadForSession(session, status = session.status || 'active') {
  refreshGitSession(session);
  const ended = nowISO();
  const finalizedAt = status === 'finalized' || status === 'paused' ? ended : null;
  const changes = uniq([...(session.changes || []), ...inferChanges(session)]);
  const notableFiles = uniq(session.files_changed)
    .map(file => relativeWorkPath(session.cwd, file))
    .slice(0, 8);
  return {
    session_id: session.session_id,
    tool: session.tool,
    cwd: session.cwd,
    project_name: projectName(session.cwd),
    started_at: session.started_at,
    updated_at: ended,
    finalized_at: finalizedAt,
    status,
    summary: fallbackSummary(session),
    latest_outcome: session.latest_outcome,
    desktop_paths: uniq(session.desktop_paths),
    files_changed: uniq(session.files_changed),
    notable_files: notableFiles,
    changes,
    commands_run: uniq(session.commands_run),
    tests_run: uniq(session.tests_run),
    deploy_status: session.deploy_status,
    git_branch: session.git_branch || null,
    commit_sha: session.commit_sha || null,
  };
}

function shouldPost(session) {
  if (!isDesktopPath(session.cwd)) return false;
  return Boolean(session.summary || session.files_changed.length || session.commands_run.length || (session.changes || []).length);
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

function appendHookEvent(event) {
  ensureStateDir();
  const safe = {
    seen_at: nowISO(),
    tool: event.tool,
    trigger: event.trigger,
    mode: process.argv[2] || 'codex-notify',
    input_keys: Object.keys(event.input || {}).sort(),
    session_id: event.session?.session_id,
    cwd: event.session?.cwd,
    summary_present: Boolean(event.session?.summary),
    files_changed_count: event.session?.files_changed?.length || 0,
    commands_run_count: event.session?.commands_run?.length || 0,
    should_post: event.shouldPost,
    skipped_reason: event.skippedReason || null,
  };
  fs.appendFileSync(HOOK_EVENTS_PATH, JSON.stringify(safe) + '\n');
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
  const postable = shouldPost(session);
  appendHookEvent({
    tool,
    trigger,
    input,
    session,
    shouldPost: postable,
    skippedReason: postable ? null : (!isDesktopPath(session.cwd) ? 'cwd_not_desktop' : 'no_summary_files_or_commands'),
  });

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
  const input = readInputJson();

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
