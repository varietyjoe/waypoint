/**
 * Standup Context Gatherer
 * Pulls real work context from git history, Claude Code sessions,
 * and the Waypoint database so interview questions can be specific
 * and grounded in what actually happened.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const actionsDb = require('../database/actions');
const outcomesDb = require('../database/outcomes');

/**
 * Gather all available work context for an interview.
 * Returns a structured object ready for formatWorkContext().
 */
function gatherWorkContext() {
    const ctx = {
        git_commits: '',
        changed_files: '',
        session_activity: [],
        completed_actions: [],
        open_actions: [],
        open_outcomes: [],
    };

    // --- Git: today's commits ---
    try {
        const today = new Date().toISOString().split('T')[0];
        const log = execSync(
            `git log --since="${today} 00:00" --format="%h %s" --stat 2>/dev/null`,
            { cwd: process.cwd(), encoding: 'utf8', timeout: 5000 }
        ).trim();
        ctx.git_commits = log || '';
    } catch (_) { /* not a git repo or no commits */ }

    // --- Git: changed files today (vs parent of today's earliest commit or HEAD~5) ---
    try {
        const changedFiles = execSync(
            'git diff --name-only HEAD~5 HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null',
            { cwd: process.cwd(), encoding: 'utf8', timeout: 5000 }
        ).trim();
        ctx.changed_files = changedFiles || '';
    } catch (_) { /* ignore */ }

    // --- Claude Code session activity ---
    ctx.session_activity = extractSessionActivity();

    // --- Waypoint: recently completed actions (last 24h) ---
    try {
        const completed = actionsDb.getRecentlyCompletedActions(1, 30);
        ctx.completed_actions = completed.map(a => ({
            title: a.title,
            outcome: a.outcome_title || null,
        }));
    } catch (_) { /* db might not be initialized */ }

    // --- Waypoint: open outcomes with progress ---
    try {
        const outcomes = outcomesDb.getAllOutcomes({ status: 'active' }).slice(0, 15);
        ctx.open_outcomes = outcomes.map(o => ({
            id: o.id,
            title: o.title,
            project: o.project_name || null,
            deadline: o.deadline || null,
        }));
    } catch (_) { /* ignore */ }

    // --- Waypoint: open actions ---
    try {
        const open = actionsDb.getAllOpenActions().slice(0, 20);
        ctx.open_actions = open.map(a => ({
            title: a.title,
            outcome: a.outcome_title || null,
        }));
    } catch (_) { /* ignore */ }

    return ctx;
}

/**
 * Read recent Claude Code session JSONL files and extract a summary
 * of what was discussed/worked on.
 */
function extractSessionActivity() {
    const summaries = [];

    try {
        const homeDir = process.env.HOME || '/root';
        // Try to find the project slug by looking for sessions matching this project
        const projectsDir = path.join(homeDir, '.claude', 'projects');
        if (!fs.existsSync(projectsDir)) return summaries;

        // Find the slug that corresponds to this working directory
        const cwd = process.cwd();
        const slug = cwd.replace(/\//g, '-').replace(/^-/, '');
        const sessionsDir = path.join(projectsDir, slug);
        if (!fs.existsSync(sessionsDir)) return summaries;

        // Get the most recent session files (today only)
        const todayMs = new Date().setHours(0, 0, 0, 0);
        const files = fs.readdirSync(sessionsDir)
            .filter(f => f.endsWith('.jsonl'))
            .map(f => {
                const full = path.join(sessionsDir, f);
                return { name: f, full, mtime: fs.statSync(full).mtimeMs };
            })
            .filter(f => f.mtime >= todayMs)
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, 3);

        for (const file of files) {
            const activity = parseSessionFile(file.full);
            if (activity) summaries.push(activity);
        }
    } catch (_) { /* session files unavailable */ }

    return summaries;
}

/**
 * Parse a single JSONL session file and extract a brief activity summary.
 * Focuses on user messages and tool result summaries.
 */
function parseSessionFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);

        const userMessages = [];
        const toolsUsed = new Set();

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);

                // Extract user messages
                if (entry.type === 'user' && entry.message?.role === 'user') {
                    const msgContent = entry.message.content;
                    if (typeof msgContent === 'string' && msgContent.length < 600) {
                        userMessages.push(msgContent);
                    } else if (Array.isArray(msgContent)) {
                        for (const block of msgContent) {
                            if (block.type === 'text' && block.text?.length < 600) {
                                userMessages.push(block.text);
                            }
                        }
                    }
                }

                // Track which tools were used (gives a sense of activity)
                if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
                    for (const block of entry.message.content) {
                        if (block.type === 'tool_use') {
                            toolsUsed.add(block.name);
                        }
                    }
                }
            } catch (_) { /* malformed line, skip */ }
        }

        if (userMessages.length === 0) return null;

        // Return the first few and last user message to capture start + end of session
        const keyMessages = userMessages.length > 5
            ? [...userMessages.slice(0, 2), '...', ...userMessages.slice(-2)]
            : userMessages;

        return keyMessages.join(' | ');
    } catch (_) {
        return null;
    }
}

/**
 * Format the gathered work context into a string block
 * for injection into Claude's system prompt.
 */
function formatWorkContext(ctx) {
    if (!ctx) return '';

    const lines = [];

    lines.push('=== TODAY\'S WORK CONTEXT ===');
    lines.push('(Use this context to make your interview questions specific. Reference actual work done.)');
    lines.push('');

    if (ctx.git_commits) {
        lines.push('--- GIT COMMITS TODAY ---');
        lines.push(ctx.git_commits);
        lines.push('');
    }

    if (ctx.changed_files) {
        lines.push('--- CHANGED FILES ---');
        lines.push(ctx.changed_files);
        lines.push('');
    }

    if (ctx.session_activity?.length > 0) {
        lines.push('--- CLAUDE CODE SESSION ACTIVITY ---');
        ctx.session_activity.forEach((s, i) => {
            lines.push(`Session ${i + 1}: ${s}`);
        });
        lines.push('');
    }

    if (ctx.completed_actions?.length > 0) {
        lines.push('--- COMPLETED ACTIONS (last 24h) ---');
        ctx.completed_actions.forEach(a => {
            const outcome = a.outcome ? ` [${a.outcome}]` : '';
            lines.push(`- ${a.title}${outcome}`);
        });
        lines.push('');
    }

    if (ctx.open_outcomes?.length > 0) {
        lines.push('--- ACTIVE OUTCOMES ---');
        ctx.open_outcomes.forEach(o => {
            const deadline = o.deadline ? ` (due ${o.deadline})` : '';
            const project = o.project ? ` [${o.project}]` : '';
            lines.push(`- ${o.title}${project}${deadline}`);
        });
        lines.push('');
    }

    if (ctx.open_actions?.length > 0) {
        lines.push('--- OPEN ACTIONS ---');
        ctx.open_actions.slice(0, 10).forEach(a => {
            const outcome = a.outcome ? ` [${a.outcome}]` : '';
            lines.push(`- ${a.title}${outcome}`);
        });
        lines.push('');
    }

    lines.push('=== END WORK CONTEXT ===');
    return lines.join('\n');
}

module.exports = { gatherWorkContext, formatWorkContext };
