const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const triageDb      = require('../database/triage');
const inboxDb       = require('../database/inbox');
const projectsDb    = require('../database/projects');
const outcomesDb    = require('../database/outcomes');
const actionsDb     = require('../database/actions');
const scheduleDb      = require('../database/slack-schedule');
const focusSessionsDb = require('../database/focus-sessions');
const userContextDb   = require('../database/user-context');
const libraryDb       = require('../database/library');
const patternsDb      = require('../database/patterns');
const { computePatterns } = require('../services/pattern-engine');
const claudeService = require('../services/claude');
const scheduler     = require('../services/scheduler');
const calendarDb    = require('../database/calendar');
const googleCalendar = require('../services/google-calendar');
const prefDb = require('../database/user-preferences');
const briefingsService = require('../services/briefings');
const { sendSlackDM } = require('./slack');
const dependenciesDb = require('../database/dependencies');
const sharesDb = require('../database/shares');
const advisorDb = require('../database/advisor');
const advisorService = require('../services/advisor');
const dailyEntriesDb = require('../database/daily-entries');
const hubspotClient = require('../integrations/hubspot-client');
const { formatSalesPulse } = require('../utils/sales-pulse-formatter');
const { assembleContext, formatContextForPrompt } = require('../services/context-assembler');

// Initialize tables on startup
projectsDb.initProjectsTable();
outcomesDb.initOutcomesTable();
outcomesDb.initReflectionsTable();
actionsDb.initActionsTable();
inboxDb.initInboxMigrations();
focusSessionsDb.initFocusSessionsTable();
userContextDb.initUserContextTable();
scheduler.init();
calendarDb.initCalendarTables();
prefDb.initUserPreferences();
libraryDb.initLibraryMigrations();
patternsDb.initPatternTables();
dependenciesDb.initDependenciesTable();
sharesDb.initSharesTable();
advisorDb.initAdvisorTables();
dailyEntriesDb.initDailyEntriesTable();

// ============================================================
// HELPERS
// ============================================================

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

// Tiny-task classifier (Phase 5.0)
const TINY_VERBS = new Set([
  'call','text','email','book','pay','buy','send','check','review',
  'schedule','confirm','cancel','sign','reply','fill','drop','pick',
  'order','ask','remind','print','read',
]);

function classifyAction(title) {
  if (!title || title.length >= 60) return 'standard';
  if (title.includes('!tiny')) return 'tiny';
  const firstWord = title.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  return TINY_VERBS.has(firstWord) ? 'tiny' : 'standard';
}

// ============================================================
// OUTCOMES
// ============================================================

/**
 * GET /api/outcomes
 * Query params: ?project_id=&status=
 * Returns each outcome with its actions embedded.
 */
router.get('/outcomes', (req, res, next) => {
    try {
        const { project_id, status } = req.query;
        const outcomes = outcomesDb.getAllOutcomes({ project_id, status });

        // Embed actions into each outcome
        const withActions = outcomes.map(o => ({
            ...o,
            actions: actionsDb.getActionsByOutcome(o.id)
        }));

        res.json({ success: true, count: withActions.length, data: withActions });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/outcomes/archived
 * Returns recently archived outcomes ordered by archived_at desc.
 * Optional ?limit=N (default 10).
 */
router.get('/outcomes/archived', (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const outcomes = outcomesDb.getArchivedOutcomes(limit);
        res.json({ success: true, count: outcomes.length, data: outcomes });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/outcomes/stats/today
 * Returns today's completion metrics: outcomes archived + actions done.
 */
router.get('/outcomes/stats/today', (req, res, next) => {
    try {
        const stats = outcomesDb.getTodayStats();
        res.json({ success: true, data: stats });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/outcomes/recently-closed
 * Returns the 3 most recently archived outcomes with archived_at.
 * Alias for /api/outcomes/archived?limit=3, kept explicit for clarity.
 * NOTE: This route MUST remain before GET /api/outcomes/:id to avoid param capture.
 */
router.get('/outcomes/recently-closed', (req, res, next) => {
    try {
        const outcomes = outcomesDb.getArchivedOutcomes(3);
        res.json({ success: true, count: outcomes.length, data: outcomes });
    } catch (err) {
        next(err);
    }
});

// ─── OUTCOME DEPENDENCIES (Phase 4.1) ─────────────────────────────────────

/**
 * GET /api/outcomes/critical-path
 * Returns all outcomes with unresolved active upstream dependencies, sorted by depth.
 * MUST be registered before GET /api/outcomes/:id to avoid route capture.
 */
router.get('/outcomes/critical-path', (req, res, next) => {
    try {
        const path = dependenciesDb.getCriticalPath();
        res.json({ success: true, count: path.length, data: path });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/outcomes/:id/dependencies
 * Returns outcomes that this outcome depends on (upstream blockers).
 */
router.get('/outcomes/:id/dependencies', (req, res, next) => {
    try {
        const outcomeId = parseInt(req.params.id);
        const deps = dependenciesDb.getDependencies(outcomeId);
        res.json({ success: true, count: deps.length, data: deps });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/outcomes/:id/dependents
 * Returns outcomes that depend on this one (downstream — this one is blocking them).
 */
router.get('/outcomes/:id/dependents', (req, res, next) => {
    try {
        const outcomeId = parseInt(req.params.id);
        const dependents = dependenciesDb.getDependents(outcomeId);
        res.json({ success: true, count: dependents.length, data: dependents });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/outcomes/:id/dependencies
 * Body: { depends_on_outcome_id }
 * Adds a dependency: this outcome depends on depends_on_outcome_id.
 * Returns 400 if the dependency would create a cycle.
 */
router.post('/outcomes/:id/dependencies', (req, res, next) => {
    try {
        const outcomeId = parseInt(req.params.id);
        const { depends_on_outcome_id } = req.body;

        if (!depends_on_outcome_id) {
            return res.status(400).json({ success: false, error: 'depends_on_outcome_id is required' });
        }

        const dependsOnId = parseInt(depends_on_outcome_id);

        if (outcomeId === dependsOnId) {
            return res.status(400).json({ success: false, error: 'An outcome cannot depend on itself' });
        }

        if (dependenciesDb.hasCycle(outcomeId, dependsOnId)) {
            return res.status(400).json({ success: false, error: 'This dependency would create a circular chain' });
        }

        dependenciesDb.addDependency(outcomeId, dependsOnId);
        const deps = dependenciesDb.getDependencies(outcomeId);
        res.json({ success: true, data: deps });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/outcomes/:id/dependencies/:depId
 * Removes the dependency: this outcome no longer depends on depId.
 */
router.delete('/outcomes/:id/dependencies/:depId', (req, res, next) => {
    try {
        const outcomeId = parseInt(req.params.id);
        const depId     = parseInt(req.params.depId);
        dependenciesDb.removeDependency(outcomeId, depId);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/outcomes/:id
 * Returns a single outcome with its actions.
 */
router.get('/outcomes/:id', (req, res, next) => {
    try {
        const outcome = outcomesDb.getOutcomeById(parseInt(req.params.id));
        if (!outcome) return res.status(404).json({ success: false, error: 'Outcome not found' });

        res.json({
            success: true,
            data: { ...outcome, actions: actionsDb.getActionsByOutcome(outcome.id) }
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/outcomes
 * Body: { project_id, title, description, deadline, priority, impact }
 */
router.post('/outcomes', (req, res, next) => {
    try {
        const { project_id, title, description, deadline, priority, impact } = req.body;
        if (!project_id) return res.status(400).json({ success: false, error: 'project_id is required' });
        if (!title)      return res.status(400).json({ success: false, error: 'title is required' });

        const outcome = outcomesDb.createOutcome({ project_id, title, description, deadline, priority, impact });
        res.status(201).json({ success: true, message: 'Outcome created', data: { ...outcome, actions: [] } });
    } catch (err) {
        next(err);
    }
});

/**
 * PUT /api/outcomes/:id
 * Body: any subset of { title, description, deadline, priority, impact, status }
 */
router.put('/outcomes/:id', (req, res, next) => {
    try {
        const outcome = outcomesDb.updateOutcome(parseInt(req.params.id), req.body);
        res.json({ success: true, message: 'Outcome updated', data: outcome });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/outcomes/:id
 */
router.delete('/outcomes/:id', (req, res, next) => {
    try {
        const deleted = outcomesDb.deleteOutcome(parseInt(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, error: 'Outcome not found' });
        res.json({ success: true, message: 'Outcome deleted' });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/outcomes/:id/archive
 */
router.post('/outcomes/:id/archive', (req, res, next) => {
    try {
        const outcome = outcomesDb.archiveOutcome(parseInt(req.params.id));
        res.json({ success: true, message: 'Outcome archived', data: outcome });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/outcomes/:id/complete
 * Archives the outcome, stores a completion stats snapshot, and optionally saves a reflection.
 * Body: { what_worked?, what_slipped?, reusable_insight?, outcome_result (required), outcome_result_note? }
 */
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

/**
 * GET /api/outcomes/:id/reflection
 * Returns the stored reflection for an archived outcome.
 */
router.get('/outcomes/:id/reflection', (req, res, next) => {
    try {
        const outcomeId = parseInt(req.params.id);
        const outcome = outcomesDb.getOutcomeById(outcomeId);
        if (!outcome) return res.status(404).json({ success: false, error: 'Outcome not found' });

        const reflection = outcomesDb.getReflectionByOutcome(outcomeId);
        res.json({ success: true, data: reflection });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/outcomes/:id/stats
 * Returns time-weighted progress, deep/light breakdown, and deadline risk.
 */
router.get('/outcomes/:id/stats', (req, res, next) => {
    try {
        const outcomeId = parseInt(req.params.id);
        const outcome = outcomesDb.getOutcomeById(outcomeId);
        if (!outcome) return res.status(404).json({ success: false, error: 'Outcome not found' });

        const actions = actionsDb.getActionsByOutcome(outcomeId);

        const total_time  = actions.reduce((s, a) => s + (a.time_estimate || 0), 0);
        const done_time   = actions.filter(a => a.done).reduce((s, a) => s + (a.time_estimate || 0), 0);
        const remaining_time = total_time - done_time;
        const progress    = total_time > 0 ? parseFloat((done_time / total_time).toFixed(4)) : 0;

        const deep_time   = actions.filter(a => a.energy_type === 'deep').reduce((s, a) => s + (a.time_estimate || 0), 0);
        const light_time  = actions.filter(a => a.energy_type !== 'deep').reduce((s, a) => s + (a.time_estimate || 0), 0);
        const deep_done   = actions.filter(a => a.done && a.energy_type === 'deep').reduce((s, a) => s + (a.time_estimate || 0), 0);
        const light_done  = actions.filter(a => a.done && a.energy_type !== 'deep').reduce((s, a) => s + (a.time_estimate || 0), 0);
        const blocked_count = actions.filter(a => a.blocked && !a.done).length;

        const DAILY_CAPACITY = 240;
        let days_left = null;
        let minutes_per_day_needed = null;
        let deadline_risk = null;

        if (outcome.deadline) {
            const [y, m, d] = outcome.deadline.split('-').map(Number);
            const deadlineDate = new Date(y, m - 1, d);
            const today = new Date(); today.setHours(0, 0, 0, 0);
            days_left = Math.max(0, Math.ceil((deadlineDate - today) / 86400000));

            if (days_left === 0) {
                deadline_risk = remaining_time > 0 ? 'critical' : 'low';
                minutes_per_day_needed = remaining_time;
            } else {
                minutes_per_day_needed = parseFloat((remaining_time / days_left).toFixed(1));
                if (minutes_per_day_needed > DAILY_CAPACITY)       deadline_risk = 'critical';
                else if (minutes_per_day_needed > DAILY_CAPACITY * 0.5)  deadline_risk = 'high';
                else if (minutes_per_day_needed > DAILY_CAPACITY * 0.25) deadline_risk = 'medium';
                else                                                      deadline_risk = 'low';
            }
        }

        res.json({
            success: true,
            data: {
                progress,
                total_time,
                done_time,
                remaining_time,
                deep_time,
                light_time,
                deep_done,
                light_done,
                deadline_risk,
                days_left,
                minutes_per_day_needed,
                blocked_count,
            }
        });
    } catch (err) {
        next(err);
    }
});

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

// ============================================================
// ACTIONS
// ============================================================

/**
 * GET /api/actions/unassigned
 * Must be defined before /api/actions/:id to avoid route conflict.
 */
router.get('/actions/unassigned', (req, res, next) => {
    try {
        const actions = actionsDb.getUnassignedActions();
        res.json({ success: true, count: actions.length, data: actions });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/actions
 * Create an unassigned action (outcome_id is null).
 * Body: { title, time_estimate?, energy_type? }
 */
router.post('/actions', (req, res, next) => {
    try {
        const { title, time_estimate, energy_type, action_type } = req.body;
        if (!title) return res.status(400).json({ success: false, error: 'title is required' });
        // Auto-classify unassigned actions if action_type not explicitly provided
        const resolvedType = action_type || classifyAction(title);
        const action = actionsDb.createAction(null, {
            title,
            time_estimate: time_estimate || 30,
            energy_type: energy_type || 'light',
            action_type: resolvedType,
        });
        res.status(201).json({ success: true, message: 'Action created', data: action });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/outcomes/:id/actions
 */
router.get('/outcomes/:id/actions', (req, res, next) => {
    try {
        const outcome = outcomesDb.getOutcomeById(parseInt(req.params.id));
        if (!outcome) return res.status(404).json({ success: false, error: 'Outcome not found' });

        const actions = actionsDb.getActionsByOutcome(outcome.id);
        res.json({ success: true, count: actions.length, data: actions });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/outcomes/:id/actions
 * Body: { title, time_estimate, energy_type, blocked, blocked_by, position }
 */
router.post('/outcomes/:id/actions', (req, res, next) => {
    try {
        const outcomeId = parseInt(req.params.id);
        const outcome = outcomesDb.getOutcomeById(outcomeId);
        if (!outcome) return res.status(404).json({ success: false, error: 'Outcome not found' });

        const { title, time_estimate, energy_type, blocked, blocked_by, position } = req.body;
        if (!title) return res.status(400).json({ success: false, error: 'title is required' });

        const action = actionsDb.createAction(outcomeId, { title, time_estimate, energy_type, blocked, blocked_by, position });
        res.status(201).json({ success: true, message: 'Action created', data: action });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/actions/:id/snooze — snooze an unassigned action for 1 day
 */
router.post('/actions/:id/snooze', (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const action = actionsDb.snoozeAction(id);
        res.json({ success: true, data: action });
    } catch (err) {
        next(err);
    }
});

/**
 * PUT /api/actions/:id
 * Body: any subset of { title, time_estimate, energy_type, done, blocked, blocked_by, position, outcome_id }
 */
router.put('/actions/:id', (req, res, next) => {
    try {
        const action = actionsDb.updateAction(parseInt(req.params.id), req.body);
        res.json({ success: true, message: 'Action updated', data: action });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/actions/:id
 */
router.delete('/actions/:id', (req, res, next) => {
    try {
        const deleted = actionsDb.deleteAction(parseInt(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, error: 'Action not found' });
        res.json({ success: true, message: 'Action deleted' });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/actions/:id/toggle
 * Flips done boolean and sets/clears done_at.
 */
router.patch('/actions/:id/toggle', (req, res, next) => {
    try {
        const action = actionsDb.toggleAction(parseInt(req.params.id));
        res.json({ success: true, message: `Action marked ${action.done ? 'done' : 'undone'}`, data: action });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/actions/:id/reorder
 * Body: { position }
 */
router.patch('/actions/:id/reorder', (req, res, next) => {
    try {
        const { position } = req.body;
        if (position === undefined) return res.status(400).json({ success: false, error: 'position is required' });
        const action = actionsDb.reorderAction(parseInt(req.params.id), parseInt(position));
        res.json({ success: true, message: 'Action reordered', data: action });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// TRIAGE QUEUE
// ============================================================

/**
 * GET /api/triage/queue
 */
router.get('/triage/queue', async (req, res, next) => {
    try {
        const items = await triageDb.getPendingTriageItems();
        res.json({ success: true, count: items.length, items });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/triage/:id
 */
router.get('/triage/:id', async (req, res, next) => {
    try {
        const item = await triageDb.getTriageItemById(parseInt(req.params.id));
        if (!item) return res.status(404).json({ success: false, error: 'Triage item not found' });
        res.json({ success: true, data: item });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/triage/:id
 */
router.delete('/triage/:id', async (req, res, next) => {
    try {
        await triageDb.deleteTriageItem(parseInt(req.params.id));
        res.json({ success: true, message: 'Triage item removed' });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/triage/process
 * Fetches Slack messages and queues them for triage.
 * AI classification of queued items happens in Phase 1.2.
 */
router.post('/triage/process', async (req, res, next) => {
    try {
        console.log('🔄 Starting Slack message fetch for triage...');

        const slackClient          = require('../integrations/slack-client');
        const oauthTokensDb        = require('../database/oauth-tokens');
        const monitoredChannelsDb  = require('../database/monitored-channels');

        const tokenData = await oauthTokensDb.getToken('slack');
        if (!tokenData) {
            return res.json({ success: true, message: 'Slack not connected', queued: 0 });
        }

        const channels = await monitoredChannelsDb.getChannels('slack', true);
        console.log(`📡 Found ${channels.length} monitored channels`);

        const currentUserId = tokenData.scopes?.user_id;

        // Build user info cache
        const userCache = new Map();
        const getUserInfo = async (userId) => {
            if (userCache.has(userId)) return userCache.get(userId);
            const info = await slackClient.getUserInfo(tokenData.access_token, userId);
            userCache.set(userId, info);
            return info;
        };

        let queued = 0;

        // Fetch channels in parallel
        const channelResults = await Promise.all(
            channels.map(async (channel) => {
                try {
                    const messages = await slackClient.getChannelHistory(tokenData.access_token, channel.channel_id, { limit: 5 });
                    return { channel, messages };
                } catch (err) {
                    console.error(`❌ Error fetching #${channel.channel_name}:`, err.message);
                    return { channel, messages: [] };
                }
            })
        );

        // Fetch DMs in parallel
        let dmResults = [];
        try {
            const dms = await slackClient.getDMConversations(tokenData.access_token);
            dmResults = await Promise.all(
                dms.map(async (dm) => {
                    try {
                        const messages = await slackClient.getChannelHistory(tokenData.access_token, dm.id, { limit: 5 });
                        return { dm, messages };
                    } catch (err) {
                        return { dm, messages: [] };
                    }
                })
            );
        } catch (err) {
            console.error('❌ Error fetching DMs:', err.message);
        }

        let currentUserName = 'Unknown';
        if (currentUserId) {
            const info = await getUserInfo(currentUserId);
            currentUserName = info?.real_name || info?.name || 'Unknown';
        }

        // Queue channel messages
        for (const { channel, messages } of channelResults) {
            for (const msg of messages) {
                if (msg.bot_id || !msg.text?.trim()) continue;
                if (currentUserId && msg.user === currentUserId) continue;
                const existingTriage = triageDb.getTriageItemBySource('slack', msg.ts);
                const existingInbox  = inboxDb.getInboxItemByMessageTs(msg.ts);
                if (existingTriage || existingInbox) continue;

                const userInfo = await getUserInfo(msg.user);
                triageDb.addToQueue({
                    source_type: 'slack',
                    source_id: msg.ts,
                    source_url: `https://slack.com/app_redirect?channel=${channel.channel_id}&message_ts=${msg.ts}`,
                    content: msg.text,
                    metadata: {
                        channel_id: channel.channel_id,
                        channel_name: channel.channel_name,
                        user_id: msg.user,
                        user_name: userInfo?.real_name || userInfo?.name || 'Unknown',
                        timestamp: msg.ts,
                        is_from_current_user: currentUserId && msg.user === currentUserId,
                        current_user_name: currentUserName
                    }
                });
                queued++;
            }
        }

        // Queue DM messages
        for (const { dm, messages } of dmResults) {
            for (const msg of messages) {
                if (msg.bot_id || !msg.text?.trim()) continue;
                if (currentUserId && msg.user === currentUserId) continue;
                const existingTriage = triageDb.getTriageItemBySource('slack', msg.ts);
                const existingInbox  = inboxDb.getInboxItemByMessageTs(msg.ts);
                if (existingTriage || existingInbox) continue;

                const userInfo = await getUserInfo(msg.user);
                triageDb.addToQueue({
                    source_type: 'slack',
                    source_id: msg.ts,
                    source_url: `https://slack.com/app_redirect?channel=${dm.id}&message_ts=${msg.ts}`,
                    content: msg.text,
                    metadata: {
                        channel_id: dm.id,
                        channel_name: `DM with ${userInfo?.real_name || 'Unknown'}`,
                        user_id: msg.user,
                        user_name: userInfo?.real_name || 'Unknown',
                        timestamp: msg.ts,
                        is_dm: true,
                        is_from_current_user: currentUserId && msg.user === currentUserId,
                        current_user_name: currentUserName
                    }
                });
                queued++;
            }
        }

        console.log(`✅ Queued ${queued} new messages. Running Claude classification...`);

        // Classify all pending triage items → move to inbox
        const pendingItems = triageDb.getPendingTriageItems();
        let classified = 0;

        for (const item of pendingItems) {
            try {
                const result = await claudeService.classifyForInbox(item.content);
                await inboxDb.addToInbox({
                    title: result.title,
                    source_type: item.source_type,
                    source_url: item.source_url,
                    source_metadata: item.metadata,
                    classification: result.classification,
                    ai_reasoning: result.ai_reasoning,
                });
                triageDb.markTriageItemAsConverted(item.id, 0);
                classified++;
            } catch (classErr) {
                console.error(`❌ Failed to classify triage item ${item.id}:`, classErr.message);
            }
        }

        res.json({
            success: true,
            message: `Queued ${queued} new messages, classified ${classified} items`,
            queued,
            classified,
        });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// INBOX
// ============================================================

router.get('/inbox', async (req, res, next) => {
    try {
        const { status } = req.query;
        const items = status
            ? await inboxDb.getInboxItems(status)
            : await inboxDb.getPendingInboxItems();
        res.json({ success: true, count: items.length, items });
    } catch (err) {
        next(err);
    }
});

router.get('/inbox/stats', async (req, res, next) => {
    try {
        const stats = await inboxDb.getInboxStats();
        res.json({ success: true, stats });
    } catch (err) {
        next(err);
    }
});

// GET /api/inbox/inbound-email-address — expose configured inbound email address
router.get('/inbox/inbound-email-address', (req, res) => {
    res.json({ success: true, address: process.env.INBOUND_EMAIL_ADDRESS || null });
});

/**
 * POST /api/inbox
 * Create a new inbox item directly (used by voice note and other capture vectors).
 * Body: { title, source_type, source_metadata?, description? }
 */
router.post('/inbox', async (req, res, next) => {
    try {
        const { title, source_type, source_metadata, description } = req.body;
        if (!title) return res.status(400).json({ success: false, error: 'title is required' });
        const item = await inboxDb.addToInbox({
            title: title.length > 120 ? title.slice(0, 117) + '\u2026' : title,
            description: description || null,
            source_type: source_type || 'manual',
            source_url: null,
            source_metadata: source_metadata || {},
        });
        res.status(201).json({ success: true, data: item });
    } catch (err) {
        next(err);
    }
});

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
        const fromName = (body.FromFull && body.FromFull.Name) || from.split('<')[0].trim() || from;
        const fromEmailMatch = from.match(/<(.+?)>/);
        const fromEmail = (body.FromFull && body.FromFull.Email) || (fromEmailMatch && fromEmailMatch[1]) || from;

        // Prefer plain text; strip HTML tags as fallback
        let rawText = textBody || htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        // Strip quoted replies: lines starting with ">" or "On ... wrote:" blocks
        rawText = stripEmailQuotes(rawText);

        if (!rawText && !subject) {
            return res.status(400).json({ success: false, error: 'Empty email body' });
        }

        const title = subject.replace(/^(Fwd?:|Re:)\s*/i, '').trim() || rawText.slice(0, 80);

        await inboxDb.addToInbox({
            title: title.length > 120 ? title.slice(0, 117) + '\u2026' : title,
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

router.get('/inbox/:id', async (req, res, next) => {
    try {
        const item = await inboxDb.getInboxItemById(parseInt(req.params.id));
        if (!item) return res.status(404).json({ success: false, error: 'Inbox item not found' });
        res.json({ success: true, data: item });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/inbox/:id/approve
 * Phase 1.2: creates a real outcome or action from the inbox item.
 *
 * For actions:
 *   Body: { outcome_id? }  — null/omitted = unassigned
 *
 * For outcomes:
 *   Body: { project_id, deadline?, priority?, impact? }  — project_id required
 */
router.post('/inbox/:id/approve', async (req, res, next) => {
    try {
        const item = await inboxDb.getInboxItemById(parseInt(req.params.id));
        if (!item) return res.status(404).json({ success: false, error: 'Inbox item not found' });

        let created = null;

        if (item.classification === 'outcome') {
            const { project_id, deadline, priority = 'medium', impact } = req.body;
            if (!project_id) {
                return res.status(400).json({ success: false, error: 'project_id is required to approve an Outcome' });
            }
            created = outcomesDb.createOutcome({
                project_id: parseInt(project_id),
                title: item.title,
                description: item.description || null,
                deadline: deadline || null,
                priority,
                impact: impact || null,
            });
        } else {
            // Default: create as action (handles 'action' and 'unknown')
            const { outcome_id } = req.body;
            created = actionsDb.createAction(
                outcome_id ? parseInt(outcome_id) : null,
                { title: item.title, energy_type: 'light' }
            );
        }

        await inboxDb.approveInboxItem(parseInt(req.params.id));
        res.json({ success: true, message: 'Inbox item approved', created });
    } catch (err) {
        next(err);
    }
});

router.post('/inbox/:id/dismiss', async (req, res, next) => {
    try {
        const item = await inboxDb.getInboxItemById(parseInt(req.params.id));
        if (!item) return res.status(404).json({ success: false, error: 'Inbox item not found' });
        await inboxDb.rejectInboxItem(parseInt(req.params.id));
        res.json({ success: true, message: 'Inbox item dismissed' });
    } catch (err) {
        next(err);
    }
});

router.post('/inbox/:id/reject', async (req, res, next) => {
    try {
        const item = await inboxDb.rejectInboxItem(parseInt(req.params.id));
        if (!item) return res.status(404).json({ success: false, error: 'Inbox item not found' });
        res.json({ success: true, message: 'Inbox item rejected', item });
    } catch (err) {
        next(err);
    }
});

router.put('/inbox/:id', async (req, res, next) => {
    try {
        const item = await inboxDb.updateInboxItem(parseInt(req.params.id), req.body);
        res.json({ success: true, message: 'Inbox item updated', data: item });
    } catch (err) {
        next(err);
    }
});

router.delete('/inbox/:id', async (req, res, next) => {
    try {
        const deleted = await inboxDb.deleteInboxItem(parseInt(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, error: 'Inbox item not found' });
        res.json({ success: true, message: 'Inbox item deleted' });
    } catch (err) {
        next(err);
    }
});

// POST /api/inbox/triage-batch — batch triage selected inbox items with Claude
router.post('/inbox/triage-batch', async (req, res, next) => {
    try {
        const { itemIds } = req.body;
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({ success: false, error: 'itemIds array required' });
        }

        // Fetch the inbox items (getInboxItemById is async)
        const items = (await Promise.all(itemIds.map(id => inboxDb.getInboxItemById(id)))).filter(Boolean);
        if (items.length === 0) {
            return res.status(404).json({ success: false, error: 'No valid inbox items found' });
        }

        let contextSnapshot = userContextDb.getContextSnapshot();

        // Phase 3.3 — inject action_count + completion_rate patterns into triage context
        try {
            const { globalReady } = patternsDb.checkReadiness();
            if (globalReady) {
                const actionCountPatterns = patternsDb.getRelevantPatterns({ pattern_types: ['action_count', 'completion_rate'] });
                if (actionCountPatterns.length > 0) {
                    contextSnapshot = (contextSnapshot || '') + '\n\nRelevant patterns:\n' +
                        actionCountPatterns.map(p => `- ${p.observation}`).join('\n');
                }
            }
        } catch (_) {}

        // Phase 4.1 — best-effort: note active outcome titles for semantic blocker suggestion
        try {
            const activeOutcomes = outcomesDb.getAllOutcomes({ status: 'active' });
            if (activeOutcomes.length > 0) {
                const outcomeTitles = activeOutcomes.map(o => `"${o.title}"`).join(', ');
                contextSnapshot = (contextSnapshot || '') +
                    `\n\nExisting active outcomes: ${outcomeTitles}. ` +
                    `If a new outcome from triage appears to depend on one of these being completed first, ` +
                    `note it in the cluster's description field.`;
            }
        } catch (_) {}

        const result = await claudeService.batchTriageInbox(items, contextSnapshot);

        // Map source_item_indices back to actual item IDs for the frontend
        const clustersWithIds = (result.clusters || []).map(cluster => ({
            ...cluster,
            source_item_ids: (cluster.source_item_indices || []).map(i => items[i - 1]?.id).filter(Boolean),
        }));

        res.json({ success: true, data: { clusters: clustersWithIds, questions: result.questions || [] } });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// USER CONTEXT MEMORY
// ============================================================

// GET /api/context — all context entries
router.get('/context', (req, res, next) => {
  try {
    const entries = userContextDb.getAllContext();
    res.json({ success: true, count: entries.length, data: entries });
  } catch (err) { next(err); }
});

// POST /api/context — add a context entry
router.post('/context', (req, res, next) => {
  try {
    const { key, value, category, source, source_action_id, source_outcome_id } = req.body;
    if (!key || !value) return res.status(400).json({ success: false, error: 'key and value required' });
    const entry = userContextDb.upsertContext(key, value, category, source, source_action_id, source_outcome_id);
    res.json({ success: true, data: entry });
  } catch (err) { next(err); }
});

// PUT /api/context/:id — update value or category
router.put('/context/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { value, category } = req.body;
    if (!value) return res.status(400).json({ success: false, error: 'value required' });
    const entry = userContextDb.updateContext(id, value, category);
    res.json({ success: true, data: entry });
  } catch (err) { next(err); }
});

// DELETE /api/context/:id — remove an entry
router.delete('/context/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    userContextDb.deleteContext(id);
    res.json({ success: true });
  } catch (err) { next(err); }
});


// ============================================================
// LIBRARY (Phase 3.2)
// ============================================================

// GET /api/library — all entries with optional filters
router.get('/library', (req, res, next) => {
  try {
    const { tag, q } = req.query;
    const entries = libraryDb.getAllLibraryEntries({ tag, q });
    res.json({ success: true, count: entries.length, data: entries });
  } catch (err) { next(err); }
});

// GET /api/library/search — full-text search
router.get('/library/search', (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, data: [] });
    const results = libraryDb.searchLibrary(q);
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

// GET /api/library/:id — single entry
router.get('/library/:id', (req, res, next) => {
  try {
    const entry = libraryDb.getLibraryEntry(Number(req.params.id));
    if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: entry });
  } catch (err) { next(err); }
});

// POST /api/library — save new entry (auto-tags via Claude)
router.post('/library', async (req, res, next) => {
  try {
    const { value, source } = req.body;
    if (!value) return res.status(400).json({ success: false, error: 'value required' });

    const { tags, suggested_title } = await claudeService.autoTagLibraryEntry(value);
    const entry = libraryDb.saveLibraryEntry({
      key: suggested_title || value.slice(0, 60),
      value,
      title: suggested_title,
      tags,
      source: source || 'manual',
    });
    res.json({ success: true, data: { entry, suggested_title, tags } });
  } catch (err) { next(err); }
});

// PUT /api/library/:id — update title or tags
router.put('/library/:id', (req, res, next) => {
  try {
    const { title, tags } = req.body;
    const entry = libraryDb.updateLibraryEntry(Number(req.params.id), { title, tags });
    if (!entry) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: entry });
  } catch (err) { next(err); }
});

// DELETE /api/library/:id
router.delete('/library/:id', (req, res, next) => {
  try {
    libraryDb.deleteLibraryEntry(Number(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// ============================================================
// MOBILE CONTEXT
// ============================================================

router.get('/mobile/context', (req, res, next) => {
    console.log('📱 GET /api/mobile/context');
    try {
        const ctx = assembleContext();
        res.json({ success: true, data: ctx });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// CLAUDE CHAT
// ============================================================

router.post('/chat', async (req, res, next) => {
    console.log('💬 POST /api/chat');
    try {
        const { message, conversationHistory, context, mode, preview = true } = req.body;
        // Advisor tool-continuation sends empty message (history already contains the user turn)
        if (!message && mode !== 'advisor') return res.status(400).json({ success: false, error: 'Message is required' });

        // Phase 1.4: tool-mode request from command palette
        if (mode === 'tools') {
            // Phase 3.3 — inject pattern context into AI Breakdown
            const enrichedContext = context || {};
            try {
                const { globalReady } = patternsDb.checkReadiness();
                if (globalReady) {
                    const patterns = patternsDb.getRelevantPatterns({ pattern_types: ['time_accuracy', 'completion_rate', 'action_count'] });
                    if (patterns.length > 0) {
                        enrichedContext._patternContext = '\n\nRelevant patterns from this user\'s history (based on real data):\n' +
                            patterns.map(p => `- ${p.observation} (based on ${p.sample_size} outcomes)`).join('\n') +
                            '\n\nIf any pattern is directly applicable to this outcome, mention it naturally before generating actions.';
                    }
                }
            } catch (_) {}
            // Phase 4.1 — inject dependency context into AI Breakdown
            // context.selected_outcome.id is provided by the frontend when breaking down an outcome
            try {
                const outcomeId = context?.selected_outcome?.id;
                if (outcomeId) {
                    const deps = dependenciesDb.getDependencies(outcomeId);
                    const activeDeps = deps.filter(d => d.status === 'active');
                    if (activeDeps.length > 0) {
                        const depNames = activeDeps.map(d => `"${d.title}"`).join(', ');
                        enrichedContext._dependencyContext =
                            `\n\nDependency notice: This outcome depends on ${depNames}, which ${activeDeps.length === 1 ? 'is' : 'are'} still active and in progress. ` +
                            `Only generate actions for what CAN be done while waiting. ` +
                            `Include a "Follow up on ${activeDeps[0].title}" action as one of the generated actions.`;
                    }
                }
            } catch (_) {}
            const result = await claudeService.sendWithTools(
                [{ role: 'user', content: message }],
                enrichedContext
            );
            return res.json({ success: true, data: result });
        }

        // Advisor mode: full context + CRUD tools with client-side approval
        if (mode === 'advisor') {
            const ctx = assembleContext();
            const contextSnapshot = formatContextForPrompt(ctx);
            const result = await claudeService.sendAdvisorMessage(
                message,
                conversationHistory || [],
                contextSnapshot
            );
            return res.json({ success: true, ...result });
        }

        // Mobile mode: inject full context snapshot into system prompt
        if (mode === 'mobile') {
            const ctx = assembleContext();
            const contextSnapshot = formatContextForPrompt(ctx);
            const response = await claudeService.sendMessage(message, conversationHistory || [], preview, contextSnapshot);
            return res.json({ success: true, response: response.text, actions: response.actions || [] });
        }

        // Existing behaviour: plain chat (used by triage pipeline etc.)
        const response = await claudeService.sendMessage(message, conversationHistory || [], preview);
        res.json({ success: true, response: response.text, actions: response.actions || [] });
    } catch (err) {
        console.error('❌ Chat error:', err.message);
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});

// ============================================================
// PROJECTS
// ============================================================

router.get('/projects', (req, res, next) => {
    try {
        const projects = projectsDb.getAllProjects();
        res.json({ success: true, count: projects.length, data: projects });
    } catch (err) {
        next(err);
    }
});

router.get('/projects/:id', (req, res, next) => {
    try {
        const project = projectsDb.getProjectById(parseInt(req.params.id));
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
        res.json({ success: true, data: project });
    } catch (err) {
        next(err);
    }
});

router.post('/projects', (req, res, next) => {
    try {
        const { name, color, icon } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Project name is required' });
        const project = projectsDb.createProject(name, color, icon);
        res.status(201).json({ success: true, message: 'Project created', data: project });
    } catch (err) {
        next(err);
    }
});

router.put('/projects/:id', (req, res, next) => {
    try {
        const project = projectsDb.updateProject(parseInt(req.params.id), req.body);
        res.json({ success: true, message: 'Project updated', data: project });
    } catch (err) {
        next(err);
    }
});

router.delete('/projects/:id', (req, res, next) => {
    try {
        const deleted = projectsDb.deleteProject(parseInt(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, error: 'Project not found' });
        res.json({ success: true, message: 'Project deleted' });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/projects/:id/intelligence
 * Returns workspace overview for the project: totals, deep/light split, deadline risks.
 */
router.get('/projects/:id/intelligence', (req, res, next) => {
    try {
        const projectId = parseInt(req.params.id);
        const project = projectsDb.getProjectById(projectId);
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

        const outcomes = outcomesDb.getAllOutcomes({ project_id: projectId, status: 'active' });

        const DAILY_CAPACITY = 240;
        let total_queued_time = 0;
        let total_deep_time   = 0;
        let total_light_time  = 0;
        const deadline_risks  = [];

        for (const outcome of outcomes) {
            const actions = actionsDb.getActionsByOutcome(outcome.id);
            const outcomeTotal     = actions.reduce((s, a) => s + (a.time_estimate || 0), 0);
            const outcomeDone      = actions.filter(a => a.done).reduce((s, a) => s + (a.time_estimate || 0), 0);
            const outcomeRemaining = outcomeTotal - outcomeDone;

            total_queued_time += outcomeTotal;
            total_deep_time   += actions.filter(a => a.energy_type === 'deep').reduce((s, a) => s + (a.time_estimate || 0), 0);
            total_light_time  += actions.filter(a => a.energy_type !== 'deep').reduce((s, a) => s + (a.time_estimate || 0), 0);

            if (outcome.deadline) {
                const [y, m, d] = outcome.deadline.split('-').map(Number);
                const deadlineDate = new Date(y, m - 1, d);
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const days_left = Math.max(0, Math.ceil((deadlineDate - today) / 86400000));

                let risk = 'low';
                if (days_left === 0) {
                    risk = outcomeRemaining > 0 ? 'critical' : 'low';
                } else {
                    const mpd = outcomeRemaining / days_left;
                    if (mpd > DAILY_CAPACITY)            risk = 'critical';
                    else if (mpd > DAILY_CAPACITY * 0.5) risk = 'high';
                    else if (mpd > DAILY_CAPACITY * 0.25) risk = 'medium';
                }

                deadline_risks.push({ outcome_id: outcome.id, title: outcome.title, risk, days_left });
            }
        }

        const totalWork = total_deep_time + total_light_time || 1;
        const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        deadline_risks.sort((a, b) => (riskOrder[a.risk] - riskOrder[b.risk]) || (a.days_left - b.days_left));

        res.json({
            success: true,
            data: {
                total_outcomes:    outcomes.length,
                total_queued_time,
                deep_split:  parseFloat((total_deep_time  / totalWork).toFixed(2)),
                light_split: parseFloat((total_light_time / totalWork).toFixed(2)),
                deadline_risks,
            }
        });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// SLACK SCHEDULE
// ============================================================

/**
 * GET /api/slack/schedule
 */
router.get('/slack/schedule', (req, res, next) => {
    try {
        const schedules = scheduleDb.getAllSchedules();
        res.json({ success: true, count: schedules.length, data: schedules });
    } catch (err) { next(err); }
});

/**
 * POST /api/slack/schedule
 * Body: { run_time, timezone }
 */
router.post('/slack/schedule', (req, res, next) => {
    try {
        const { run_time, timezone } = req.body;
        if (!run_time) return res.status(400).json({ success: false, error: 'run_time is required' });
        const schedule = scheduleDb.createSchedule({ run_time, timezone });
        scheduler.registerJob(schedule);
        res.status(201).json({ success: true, message: 'Schedule created', data: schedule });
    } catch (err) { next(err); }
});

/**
 * PUT /api/slack/schedule/:id
 * Body: any subset of { run_time, timezone, enabled }
 */
router.put('/slack/schedule/:id', (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const schedule = scheduleDb.updateSchedule(id, req.body);
        if (req.body.enabled === false || req.body.enabled === 0) {
            scheduler.cancelJob(id);
        } else {
            scheduler.registerJob(schedule);
        }
        res.json({ success: true, message: 'Schedule updated', data: schedule });
    } catch (err) { next(err); }
});

/**
 * DELETE /api/slack/schedule/:id
 */
router.delete('/slack/schedule/:id', (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        scheduler.cancelJob(id);
        const deleted = scheduleDb.deleteSchedule(id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Schedule not found' });
        res.json({ success: true, message: 'Schedule deleted' });
    } catch (err) { next(err); }
});

// ============================================================
// PLAN.MD IMPORT
// ============================================================

/**
 * POST /api/import/plan
 * Reads PLAN.md from project root and imports outcomes + actions.
 * Additive only — existing titles are skipped (case-insensitive match).
 */
router.post('/import/plan', async (req, res, next) => {
    try {
        const planPath = path.join(__dirname, '../../PLAN.md');
        if (!fs.existsSync(planPath)) {
            return res.status(404).json({ success: false, error: 'PLAN.md not found at project root' });
        }

        const content = fs.readFileSync(planPath, 'utf8');
        const lines = content.split('\n');

        let outcomes_created = 0;
        let actions_created = 0;
        let skipped = 0;

        let currentProject = null;
        let currentOutcomeId = null;
        let currentOutcomeDeadline = null;
        let currentOutcomePriority = 'medium';
        let currentOutcomeImpact = null;

        // Fetch all projects and active outcomes for deduplication
        const allProjects = projectsDb.getAllProjects();
        const allOutcomes = outcomesDb.getAllOutcomes({ status: 'active' });

        // Helper: find project by name (case-insensitive)
        const findProject = (name) =>
            allProjects.find(p => p.name.toLowerCase() === name.toLowerCase());

        // Helper: find outcome by title+project (case-insensitive)
        const findOutcome = (title, projectId) =>
            allOutcomes.find(o =>
                o.title.toLowerCase() === title.toLowerCase() &&
                o.project_id === projectId
            );

        for (const rawLine of lines) {
            const line = rawLine.trim();

            // ## Project: NAME
            const projectMatch = line.match(/^##\s+Project:\s+(.+)$/i);
            if (projectMatch) {
                const projectName = projectMatch[1].trim();
                currentProject = findProject(projectName);
                if (!currentProject) {
                    // Create project if it doesn't exist
                    currentProject = projectsDb.createProject(projectName);
                    allProjects.push(currentProject);
                }
                currentOutcomeId = null;
                continue;
            }

            // ### Outcome: TITLE
            const outcomeMatch = line.match(/^###\s+Outcome:\s+(.+)$/i);
            if (outcomeMatch) {
                currentOutcomeId = null;
                currentOutcomeDeadline = null;
                currentOutcomePriority = 'medium';
                currentOutcomeImpact = null;

                const outcomeTitle = outcomeMatch[1].trim();
                if (!currentProject) continue;

                const existing = findOutcome(outcomeTitle, currentProject.id);
                if (existing) {
                    currentOutcomeId = existing.id;
                    skipped++;
                } else {
                    // Will be created after we read the metadata line
                    currentOutcomeId = '_pending';
                    currentOutcomeId = { title: outcomeTitle, projectId: currentProject.id };
                }
                continue;
            }

            // Deadline: YYYY-MM-DD | Priority: high | Impact: ...
            const metaMatch = line.match(/^Deadline:\s*([^\|]+)\s*(?:\|\s*Priority:\s*([^\|]+)\s*)?(?:\|\s*Impact:\s*(.+))?$/i);
            if (metaMatch && currentOutcomeId && typeof currentOutcomeId === 'object') {
                currentOutcomeDeadline = metaMatch[1]?.trim() || null;
                currentOutcomePriority = metaMatch[2]?.trim()?.toLowerCase() || 'medium';
                currentOutcomeImpact   = metaMatch[3]?.trim() || null;

                // Now create the outcome
                const newOutcome = outcomesDb.createOutcome({
                    project_id: currentOutcomeId.projectId,
                    title: currentOutcomeId.title,
                    deadline: currentOutcomeDeadline,
                    priority: currentOutcomePriority,
                    impact: currentOutcomeImpact,
                });
                allOutcomes.push(newOutcome);
                currentOutcomeId = newOutcome.id;
                outcomes_created++;
                continue;
            }

            // If we have a pending outcome without metadata yet, create it now on first action
            if (currentOutcomeId && typeof currentOutcomeId === 'object') {
                const newOutcome = outcomesDb.createOutcome({
                    project_id: currentOutcomeId.projectId,
                    title: currentOutcomeId.title,
                });
                allOutcomes.push(newOutcome);
                currentOutcomeId = newOutcome.id;
                outcomes_created++;
            }

            // - [ ] Action title (energy, Xm)
            const actionMatch = line.match(/^-\s+\[\s*[x ]?\s*\]\s+(.+)$/i);
            if (actionMatch) {
                const actionRaw = actionMatch[1].trim();

                // Parse optional (energy, Xm) suffix
                const suffixMatch = actionRaw.match(/^(.+?)\s+\(([^,)]+)(?:,\s*(\d+)m)?\)\s*$/);
                let actionTitle = actionRaw;
                let energy_type = 'light';
                let time_estimate = null;

                if (suffixMatch) {
                    actionTitle = suffixMatch[1].trim();
                    const energyRaw = suffixMatch[2]?.trim().toLowerCase();
                    energy_type = energyRaw === 'deep' ? 'deep' : 'light';
                    time_estimate = suffixMatch[3] ? parseInt(suffixMatch[3]) : null;
                }

                // Deduplication: check if this action already exists under this outcome
                const outcomeId = typeof currentOutcomeId === 'number' ? currentOutcomeId : null;
                if (outcomeId) {
                    const existingActions = actionsDb.getActionsByOutcome(outcomeId);
                    const dup = existingActions.find(a =>
                        a.title.toLowerCase() === actionTitle.toLowerCase()
                    );
                    if (dup) { skipped++; continue; }
                }

                actionsDb.createAction(outcomeId, { title: actionTitle, energy_type, time_estimate });
                actions_created++;
                continue;
            }
        }

        res.json({
            success: true,
            message: `Import complete`,
            outcomes_created,
            actions_created,
            skipped,
        });
    } catch (err) {
        next(err);
    }
});

// ============================================================
// FOCUS MODE
// ============================================================

function buildFocusSystemPrompt(action, outcome, relevantSessionBlocks = '') {
  const today = new Date().toISOString().split('T')[0];
  const timeStr = action.time_estimate ? `${action.time_estimate} minutes` : 'not set';

  let prompt = `You are a focused work co-pilot. The user is actively working on this task right now. Be direct, brief, and useful. Ask one question at a time if you need clarification.

If the user mentions a task or estimates time for something you don't have in context, ask them to confirm the duration, then tell them you've noted it. Keep the question to one sentence.

## Current task
Action: ${action.title}
Time estimate: ${timeStr}
Today's date: ${today}`;

  if (outcome) {
    prompt += `\nPart of outcome: ${outcome.title}`;
    if (outcome.description) prompt += `\nOutcome description: ${outcome.description}`;
  }

  // Phase 2.2 — inject user context snapshot
  const contextSnapshot = userContextDb.getContextSnapshot();
  if (contextSnapshot) {
    prompt += `\n\n${contextSnapshot}`;
  }

  // Phase 2.5 — inject relevant past session blocks
  if (relevantSessionBlocks) {
    prompt += `\n\n${relevantSessionBlocks}`;
  }

  return prompt;
}

// GET /api/focus/sessions/summary?outcomeId=X — total focused seconds per action for an outcome
router.get('/focus/sessions/summary', (req, res, next) => {
  try {
    const { outcomeId } = req.query;
    if (!outcomeId) return res.status(400).json({ success: false, error: 'outcomeId required' });

    const rows = focusSessionsDb.getFocusSummaryForOutcome(parseInt(outcomeId));
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/focus/sessions/relevant — retrieve relevant past sessions for Focus Mode context
router.get('/focus/sessions/relevant', async (req, res, next) => {
  try {
    const { actionId, outcomeId } = req.query;
    if (!actionId || !outcomeId) {
      return res.status(400).json({ success: false, error: 'actionId and outcomeId required' });
    }

    const sessions = focusSessionsDb.getRelevantSessions(parseInt(actionId), parseInt(outcomeId));

    // Summarize long sessions and cache the summary
    const TOKEN_THRESHOLD = 2000; // approx characters
    const enriched = await Promise.all(sessions.map(async (session) => {
      let conversation = [];
      try { conversation = JSON.parse(session.conversation || '[]'); } catch {}

      const rawText = conversation.map(m => m.content).join(' ');

      if (rawText.length < TOKEN_THRESHOLD) {
        // Short enough — return as-is
        return { ...session, conversation };
      }

      // Long session — use cached summary or generate one
      if (!session.summary) {
        const summary = await claudeService.summarizeFocusSession(conversation);
        focusSessionsDb.updateSessionSummary(session.id, summary);
        return { ...session, conversation: [], summary };
      }

      return { ...session, conversation: [], summary: session.summary };
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
});

// POST /api/focus/sessions — start a focus session
router.post('/focus/sessions', (req, res, next) => {
  try {
    const { actionId, outcomeId } = req.body;
    const session = focusSessionsDb.createSession(actionId || null, outcomeId || null);
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// PUT /api/focus/sessions/:id — end a focus session
router.put('/focus/sessions/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { ended_at, duration_seconds, conversation } = req.body;
    const conv = typeof conversation === 'string' ? conversation : JSON.stringify(conversation || []);
    const session = focusSessionsDb.endSession(id, ended_at, duration_seconds, conv);
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// POST /api/focus/message — stream a Claude response
router.post('/focus/message', async (req, res, next) => {
  try {
    const { actionId, message, history = [] } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'message required' });

    const action = actionsDb.getActionById(actionId);
    if (!action) return res.status(404).json({ success: false, error: 'Action not found' });

    const outcome = action.outcome_id ? outcomesDb.getOutcomeById(action.outcome_id) : null;

    // Phase 2.5 — inject relevant past session blocks into system prompt
    let relevantSessionBlocks = '';
    try {
      if (action.outcome_id) {
        const sessions = focusSessionsDb.getRelevantSessions(action.id, action.outcome_id);
        if (sessions.length > 0) {
          const blocks = await Promise.all(sessions.slice(0, 3).map(async (session) => {
            let conversation = [];
            try { conversation = JSON.parse(session.conversation || '[]'); } catch {}
            const rawText = conversation.map(m => m.content).join(' ');
            const dateStr = new Date(session.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            if (rawText.length < 2000) {
              const formatted = conversation.map(m => `${m.role === 'user' ? 'You' : 'Claude'}: ${m.content}`).join('\n');
              return `[Session — ${dateStr}]\n${formatted}`;
            }

            // Use cached summary or generate
            let summary = session.summary;
            if (!summary) {
              summary = await claudeService.summarizeFocusSession(conversation);
              focusSessionsDb.updateSessionSummary(session.id, summary);
            }
            return `[Session — ${dateStr}]\n${summary}`;
          }));

          relevantSessionBlocks = `## Past sessions on related work:\n${blocks.join('\n\n')}`;
        }
      }
    } catch (_) {}

    // Phase 3.2 — inject relevant Library entries (additive, does not replace session summaries)
    let libraryContext = '';
    try {
      const outcomeId = action.outcome_id || 0;
      const relevantEntries = libraryDb.getRelevantLibraryEntries(outcomeId, []);
      if (relevantEntries.length > 0) {
        libraryContext = '\n\nRelevant past work from your Library:\n' +
          relevantEntries.map(e => '[' + (e.title || e.key) + ']:\n' + e.value).join('\n\n---\n\n');
      }
    } catch (_) {}

    // Phase 3.3 — inject time accuracy patterns (additive after Library context)
    let patternContext = '';
    try {
      const { globalReady } = patternsDb.checkReadiness();
      if (globalReady) {
        const timePatterns = patternsDb.getRelevantPatterns({ pattern_types: ['time_accuracy'] });
        if (timePatterns.length > 0) {
          patternContext = '\n\nTime estimation patterns for this user:\n' +
            timePatterns.map(p => `- ${p.observation}`).join('\n');
        }
      }
    } catch (_) {}

    const systemPrompt = buildFocusSystemPrompt(action, outcome, relevantSessionBlocks + libraryContext + patternContext);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    for await (const chunk of claudeService.streamFocusMessage(systemPrompt, history, message)) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      console.error('Stream error after headers sent:', err.message);
      res.end();
    }
  }
});

// POST /api/focus/extract-context — extract and save context clues from a focus message
router.post('/focus/extract-context', async (req, res, next) => {
  try {
    const { message, actionId, outcomeId } = req.body;
    if (!message) return res.json({ success: true, updates: [] });

    const existing = userContextDb.getAllContext();
    const existingKeys = existing.map(c => c.key);

    const updates = await claudeService.extractContextUpdates(message, existingKeys);

    const saved = [];
    for (const u of updates) {
      if (!u.key || !u.value) continue;
      userContextDb.upsertContext(u.key, u.value, u.category || 'context', 'focus_mode', actionId || null, outcomeId || null);
      saved.push({ key: u.key, value: u.value });
    }

    res.json({ success: true, updates: saved });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// EXECUTION ANALYTICS (Phase 3.3)
// ============================================================

router.get('/analytics', (req, res, next) => {
  try {
    const db = require('../database/index');

    const totalClosed = db.prepare(`SELECT COUNT(*) as c FROM outcomes WHERE status = 'archived'`).get().c;
    const withResult = db.prepare(`SELECT COUNT(*) as c FROM outcomes WHERE status = 'archived' AND outcome_result IS NOT NULL`).get().c;
    const hitCount = db.prepare(`SELECT COUNT(*) as c FROM outcomes WHERE status = 'archived' AND outcome_result = 'hit'`).get().c;
    const resultsRate = withResult > 0 ? { rate_pct: Math.round((hitCount / withResult) * 100), with_data: withResult } : null;

    // Completion rate (archived vs total created in last 90 days)
    const recentTotal = db.prepare(`SELECT COUNT(*) as c FROM outcomes WHERE created_at > datetime('now', '-90 days')`).get().c;
    const recentClosed = db.prepare(`SELECT COUNT(*) as c FROM outcomes WHERE status = 'archived' AND created_at > datetime('now', '-90 days')`).get().c;
    const completionRate = recentTotal > 0 ? Math.round((recentClosed / recentTotal) * 100) : null;

    // Estimate accuracy from patterns table
    const accPattern = db.prepare(`SELECT data_json FROM pattern_observations WHERE pattern_type = 'time_accuracy' LIMIT 1`).get();
    const estimateAccuracy = accPattern ? JSON.parse(accPattern.data_json) : null;

    // By category from pattern_observations
    const catPatterns = db.prepare(`SELECT category, data_json FROM pattern_observations WHERE pattern_type = 'completion_rate'`).all();
    const byCategory = catPatterns.map(p => {
      const data = JSON.parse(p.data_json);
      return { category: p.category, rate: data.rate_pct };
    }).sort((a, b) => b.rate - a.rate);

    // Current week streak (outcomes archived this week)
    const currentStreak = db.prepare(`
      SELECT COUNT(*) as c FROM outcomes
      WHERE status = 'archived' AND archived_at > datetime('now', '-7 days')
    `).get().c;

    res.json({ success: true, data: { totalClosed, completionRate, resultsRate, estimateAccuracy, byCategory, currentStreak } });
  } catch (err) { next(err); }
});

router.get('/patterns', (req, res, next) => {
  try {
    const patterns = patternsDb.getAllPatterns();
    res.json({ success: true, data: patterns });
  } catch (err) { next(err); }
});

// ============================================================
// API INFO
// ============================================================

router.get('/', (req, res) => {
    res.json({
        name: 'Waypoint API',
        version: '2.0.0',
        phase: '1.3',
        endpoints: {
            outcomes: [
                'GET    /api/outcomes',
                'GET    /api/outcomes/archived',
                'GET    /api/outcomes/stats/today',
                'GET    /api/outcomes/:id',
                'POST   /api/outcomes',
                'PUT    /api/outcomes/:id',
                'DELETE /api/outcomes/:id',
                'POST   /api/outcomes/:id/archive',
                'POST   /api/outcomes/:id/complete',
                'GET    /api/outcomes/:id/reflection',
                'GET    /api/outcomes/:id/stats',
                'GET    /api/outcomes/:id/actions',
                'POST   /api/outcomes/:id/actions',
            ],
            actions: [
                'GET    /api/actions/unassigned',
                'PUT    /api/actions/:id',
                'DELETE /api/actions/:id',
                'PATCH  /api/actions/:id/toggle',
                'PATCH  /api/actions/:id/reorder',
            ],
            projects: [
                'GET    /api/projects',
                'GET    /api/projects/:id',
                'POST   /api/projects',
                'PUT    /api/projects/:id',
                'DELETE /api/projects/:id',
                'GET    /api/projects/:id/intelligence',
            ],
            inbox: [
                'GET    /api/inbox',
                'GET    /api/inbox/stats',
                'GET    /api/inbox/:id',
                'POST   /api/inbox/:id/approve',
                'POST   /api/inbox/:id/dismiss',
                'POST   /api/inbox/:id/reject',
                'PUT    /api/inbox/:id',
                'DELETE /api/inbox/:id',
            ],
            triage: [
                'GET    /api/triage/queue',
                'POST   /api/triage/process',
                'DELETE /api/triage/:id',
            ],
            chat: ['POST /api/chat'],
        }
    });
});


// ============================================================
// CALENDAR — Phase 3.0
// ============================================================

// GET /api/calendar/connect — redirect to Google OAuth
router.get('/calendar/connect', (req, res) => {
  res.redirect(googleCalendar.getAuthUrl());
});

// GET /api/calendar/callback — handle OAuth callback
router.get('/calendar/callback', async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');
    await googleCalendar.handleCallback(code);
    res.redirect('/?calendar=connected');
  } catch (err) { next(err); }
});

// GET /api/calendar/status — check connection status
router.get('/calendar/status', (req, res) => {
  res.json({ success: true, data: { connected: googleCalendar.isConnected() } });
});

// GET /api/calendar/today — fetch + store today's events, return events + open windows
router.get('/calendar/today', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const events = await googleCalendar.getEventsForDate(today);
    calendarDb.upsertCalendarEvents(events);
    const windows = googleCalendar.getOpenWindows(events);
    res.json({ success: true, data: { events, windows, date: today } });
  } catch (err) { next(err); }
});

// ============================================================
// TODAY PLAN — Phase 3.0
// ============================================================

// POST /api/today/propose — Claude generates committed day proposal
router.post('/today/propose', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Fetch calendar data (try live, fall back to stored)
    let calendarEvents = [];
    let windows = [];
    try {
      calendarEvents = await googleCalendar.getEventsForDate(today);
      calendarDb.upsertCalendarEvents(calendarEvents);
      windows = googleCalendar.getOpenWindows(calendarEvents);
    } catch (calErr) {
      // Calendar not connected — use stored events or empty windows
      calendarEvents = calendarDb.getEventsForDate(today);
      windows = googleCalendar.getOpenWindows(calendarEvents);
    }

    // Fetch all active outcomes + their undone/unblocked actions
    const outcomes = outcomesDb.getAllOutcomes({ status: 'active' });
    const outcomesWithActions = outcomes.map(o => ({
      outcome_id: o.id,
      outcome_title: o.title,
      deadline: o.deadline,
      actions: actionsDb.getActionsByOutcome(o.id).filter(a => !a.done && !a.blocked),
    }));

    const contextSnapshot = userContextDb.getContextSnapshot();

    // Phase 4.1 — fetch critical path and mark blocked outcome IDs
    let blockedOutcomeIds = [];
    try {
        const criticalPath = dependenciesDb.getCriticalPath();
        blockedOutcomeIds = criticalPath.map(o => o.id);
    } catch (_) {}

    const proposal = await claudeService.proposeTodayPlan(windows, outcomesWithActions, contextSnapshot, blockedOutcomeIds);

    res.json({ success: true, data: proposal });
  } catch (err) { next(err); }
});

// POST /api/today/confirm — user confirms the plan
router.post('/today/confirm', (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { action_ids, outcome_ids, available_minutes, total_estimated_minutes } = req.body;
    const plan = calendarDb.upsertDailyPlan(today, {
      committed_action_ids: JSON.stringify(action_ids || []),
      committed_outcome_ids: JSON.stringify(outcome_ids || []),
      total_estimated_minutes: total_estimated_minutes || null,
      available_minutes: available_minutes || null,
      confirmed_at: new Date().toISOString(),
      actual_completed_action_ids: '[]',
    });
    res.json({ success: true, data: plan });
  } catch (err) { next(err); }
});

// GET /api/today/status — current plan + completion state
router.get('/today/status', (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const plan = calendarDb.getTodayPlan(today);
    if (!plan) return res.json({ success: true, data: { state: 'no_plan' } });

    const committedIds = JSON.parse(plan.committed_action_ids || '[]');
    const completedIds = JSON.parse(plan.actual_completed_action_ids || '[]');

    const hour = new Date().getHours();
    const state = !plan.confirmed_at ? 'proposal'
      : hour >= 17 ? 'eod'
      : 'active';

    res.json({ success: true, data: { plan, state, committedIds, completedIds } });
  } catch (err) { next(err); }
});

// POST /api/today/complete-action — mark an action done in today's plan
router.post('/today/complete-action', (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { action_id } = req.body;
    const plan = calendarDb.getTodayPlan(today);
    if (!plan) return res.status(404).json({ success: false, error: 'No plan for today' });

    const completed = JSON.parse(plan.actual_completed_action_ids || '[]');
    if (!completed.includes(action_id)) completed.push(action_id);

    calendarDb.upsertDailyPlan(today, {
      committed_outcome_ids: plan.committed_outcome_ids,
      committed_action_ids: plan.committed_action_ids,
      total_estimated_minutes: plan.total_estimated_minutes,
      available_minutes: plan.available_minutes,
      confirmed_at: plan.confirmed_at,
      actual_completed_action_ids: JSON.stringify(completed),
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/today/recommendation — mid-day Claude recommendation
router.get('/today/recommendation', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const plan = calendarDb.getTodayPlan(today);
    if (!plan) return res.json({ success: true, data: { recommendation: null } });

    const calendarData = calendarDb.getEventsForDate(today);
    const windows = googleCalendar.getOpenWindows(calendarData);

    const committedIds = JSON.parse(plan.committed_action_ids || '[]');
    const completedIds = JSON.parse(plan.actual_completed_action_ids || '[]');
    const remainingIds = committedIds.filter(id => !completedIds.includes(id));

    const recommendation = await claudeService.generateTodayRecommendation(
      remainingIds, windows, calendarData
    );
    res.json({ success: true, data: { recommendation } });
  } catch (err) { next(err); }
});
// ============================================================
// PREFERENCES — Phase 3.1
// ============================================================

// GET /api/preferences — all user preferences
router.get('/preferences', (req, res, next) => {
  try {
    res.json({ success: true, data: prefDb.getAllPreferences() });
  } catch (err) { next(err); }
});

// PUT /api/preferences/:key — set a single preference
router.put('/preferences/:key', (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    prefDb.setPreference(key, value);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/briefings/test — send a test morning brief immediately
router.post('/briefings/test', async (req, res, next) => {
  try {
    const userId = prefDb.getPreference('briefing_slack_user_id');
    if (!userId) {
      return res.status(400).json({ success: false, error: 'No Slack user ID configured' });
    }
    const text = await briefingsService.generateMorningBrief();
    await sendSlackDM(userId, text);
    res.json({ success: true, data: { sent: text } });
  } catch (err) { next(err); }
});

// ============================================================
// ADVISOR — Phase 4.3
// ============================================================

// GET /api/advisor/reviews — all reviews, newest first
router.get('/advisor/reviews', (req, res, next) => {
  try {
    const reviews = advisorDb.getAllAdvisorReviews();
    res.json({ success: true, count: reviews.length, data: reviews });
  } catch (err) { next(err); }
});

// GET /api/advisor/reviews/:id — single review
router.get('/advisor/reviews/:id', (req, res, next) => {
  try {
    const review = advisorDb.getAdvisorReview(Number(req.params.id));
    if (!review) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: review });
  } catch (err) { next(err); }
});

// POST /api/advisor/reviews/:id/read — mark a review as read (clears amber dot)
router.post('/advisor/reviews/:id/read', (req, res, next) => {
  try {
    advisorDb.markReviewRead(Number(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/advisor/unread — returns whether any unread observation exists
router.get('/advisor/unread', (req, res, next) => {
  try {
    const hasUnread = advisorDb.hasUnreadObservation();
    res.json({ success: true, data: { hasUnread } });
  } catch (err) { next(err); }
});

// POST /api/advisor/generate — manually trigger retrospective (dev/test only)
router.post('/advisor/generate', async (req, res, next) => {
  try {
    await advisorService.generateWeeklyRetrospective();
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================
// SALES PULSE
// ============================================================

// POST /api/sales-pulse/generate — generate Slack-ready Sales Pulse post
router.post('/sales-pulse/generate', async (req, res, next) => {
  try {
    const { narrative, overrides = {}, date } = req.body || {};
    const targetDate = date ? new Date(date + 'T12:00:00') : undefined;

    // Try pulling from HubSpot if configured
    let hubspotMetrics = {};
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    const ownerId = process.env.HUBSPOT_OWNER_ID;

    if (token && token !== 'pat-na1-xxxxx') {
      try {
        hubspotMetrics = await hubspotClient.pullTodayMetrics(token, ownerId, targetDate);
      } catch (err) {
        console.warn('HubSpot pull failed, using overrides only:', err.message);
      }
    }

    // Merge: overrides win over HubSpot data
    const metrics = { ...hubspotMetrics, ...overrides };

    const message = formatSalesPulse(metrics, narrative, targetDate);

    res.json({
      success: true,
      data: { message, metrics }
    });
  } catch (err) { next(err); }
});

// ============================================================
// DAILY ENTRIES (Standups & Reviews)
// ============================================================

/**
 * GET /api/daily-entries
 * Query params: ?type=standup|review&limit=20&offset=0
 */
router.get('/daily-entries', (req, res, next) => {
  try {
    const { type, limit, offset } = req.query;
    const entries = dailyEntriesDb.getDailyEntries({
      type,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ success: true, data: entries });
  } catch (err) { next(err); }
});

/**
 * GET /api/daily-entries/:id
 */
router.get('/daily-entries/:id', (req, res, next) => {
  try {
    const entry = dailyEntriesDb.getDailyEntry(parseInt(req.params.id, 10));
    if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });
    res.json({ success: true, data: entry });
  } catch (err) { next(err); }
});

/**
 * POST /api/daily-entries
 * Body: { date, type, content }
 * Upserts — if an entry for that date+type exists, it updates content.
 */
router.post('/daily-entries', (req, res, next) => {
  try {
    const { date, type, content } = req.body || {};
    if (!date || !type || !content) {
      return res.status(400).json({ success: false, error: 'date, type, and content are required' });
    }
    if (!['standup', 'review'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type must be standup or review' });
    }
    const entry = dailyEntriesDb.upsertDailyEntry({ date, type, content });
    res.json({ success: true, data: entry });
  } catch (err) { next(err); }
});

module.exports = router;
