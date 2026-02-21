const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const triageDb      = require('../database/triage');
const inboxDb       = require('../database/inbox');
const projectsDb    = require('../database/projects');
const outcomesDb    = require('../database/outcomes');
const actionsDb     = require('../database/actions');
const scheduleDb    = require('../database/slack-schedule');
const claudeService = require('../services/claude');
const scheduler     = require('../services/scheduler');

// Initialize tables on startup
projectsDb.initProjectsTable();
outcomesDb.initOutcomesTable();
outcomesDb.initReflectionsTable();
actionsDb.initActionsTable();
inboxDb.initInboxMigrations();
scheduler.init();

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
router.post('/outcomes/:id/complete', (req, res, next) => {
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
        res.json({ success: true, message: 'Outcome completed and archived', data: result });
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
        const { title, time_estimate, energy_type } = req.body;
        if (!title) return res.status(400).json({ success: false, error: 'title is required' });
        const action = actionsDb.createAction(null, { title, time_estimate, energy_type });
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

// ============================================================
// CLAUDE CHAT
// ============================================================

router.post('/chat', async (req, res, next) => {
    console.log('💬 POST /api/chat');
    try {
        const { message, conversationHistory, context, mode, preview = true } = req.body;
        if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

        // Phase 1.4: tool-mode request from command palette
        if (mode === 'tools') {
            const result = await claudeService.sendWithTools(
                [{ role: 'user', content: message }],
                context || {}
            );
            return res.json({ success: true, data: result });
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

module.exports = router;
