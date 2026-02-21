/**
 * Slack Pull Scheduler
 * Reads the slack_schedule table on startup and registers cron jobs.
 * Each job pulls messages from Slack using the same logic as POST /api/slack/pull.
 */

const cron = require('node-cron');
const scheduleDb = require('../database/slack-schedule');
const triageDb   = require('../database/triage');
const inboxDb    = require('../database/inbox');
const oauthTokens = require('../database/oauth-tokens');
const slackClient = require('../integrations/slack-client');
const claudeService = require('./claude');

/** Active cron jobs keyed by schedule row ID */
const activeJobs = {};

/**
 * Pull Slack messages for all conversations and queue them in triage.
 * Mirrors the logic of POST /api/slack/pull.
 * @param {Object} scheduleRow - Row from slack_schedule (has last_run_at, id)
 * @returns {Promise<{ added: number, pulled: number }>}
 */
async function runPull(scheduleRow) {
    const token = await oauthTokens.getToken('slack');
    if (!token) {
        console.log('⏩ Scheduler: Slack not connected, skipping pull');
        return { added: 0, pulled: 0 };
    }

    // Determine oldest timestamp
    let oldestTimestamp;
    if (scheduleRow.last_run_at) {
        oldestTimestamp = String(new Date(scheduleRow.last_run_at).getTime() / 1000);
    } else {
        // Default: 24 hours back
        oldestTimestamp = String((Date.now() / 1000) - (24 * 3600));
    }

    const authenticatedUserId = token.scopes?.user_id;

    // Get all conversations
    const allConversations = await slackClient.getAllConversations(token.access_token);
    const targetConversations = [
        ...allConversations.channels.map(c => c.id),
        ...allConversations.dms.map(c => c.id),
        ...allConversations.groupDms.map(c => c.id),
    ];

    const messages = await slackClient.pullMessagesFromConversations(
        token.access_token,
        targetConversations,
        { oldest: oldestTimestamp, limit: 100 }
    );

    // Filter: no bots, not authenticated user, non-empty
    const relevantMessages = messages.filter(msg =>
        !msg.bot_id &&
        (!authenticatedUserId || msg.user !== authenticatedUserId) &&
        msg.text &&
        msg.text.trim().length > 0
    );

    const conversationInfoCache = {};
    const userInfoCache = {};
    let addedCount = 0;

    for (const msg of relevantMessages) {
        if (!conversationInfoCache[msg.conversation_id]) {
            conversationInfoCache[msg.conversation_id] = await slackClient.getChannelInfo(
                token.access_token, msg.conversation_id
            );
        }
        const convInfo = conversationInfoCache[msg.conversation_id];

        if (!userInfoCache[msg.user]) {
            userInfoCache[msg.user] = await slackClient.getUserInfo(token.access_token, msg.user);
        }
        const userInfo = userInfoCache[msg.user];

        let conversationName = convInfo?.name || 'Unknown';
        if (convInfo?.is_im) {
            conversationName = `DM with ${userInfo?.real_name || userInfo?.name || 'Unknown'}`;
        }

        const messageUrl = `https://app.slack.com/client/${token.workspace_id}/${msg.conversation_id}/p${msg.ts.replace('.', '')}`;

        const existingTriage = triageDb.getTriageItemBySource('slack', msg.ts);
        const existingInbox  = inboxDb.getInboxItemByMessageTs(msg.ts);

        if (!existingTriage && !existingInbox) {
            triageDb.addToQueue({
                source_type: 'slack',
                source_id: msg.ts,
                source_url: messageUrl,
                content: msg.text,
                metadata: {
                    conversation_id: msg.conversation_id,
                    conversation_name: conversationName,
                    user_id: msg.user,
                    user_name: userInfo?.real_name || userInfo?.name || 'Unknown',
                    timestamp: msg.ts,
                },
            });
            addedCount++;
        }
    }

    return { added: addedCount, pulled: relevantMessages.length };
}

/**
 * Run pull + Claude classification for a schedule row.
 * Updates last_run_at only on success.
 * @param {Object} scheduleRow
 */
async function runScheduledJob(scheduleRow) {
    // Fetch a fresh row so last_run_at reflects the most recent DB state, not the closure value
    const freshRow = scheduleDb.getScheduleById(scheduleRow.id) || scheduleRow;
    console.log(`⏰ Scheduler: running job for schedule ${freshRow.id} (${freshRow.run_time})`);
    try {
        const { added, pulled } = await runPull(freshRow);
        console.log(`✅ Scheduler: pulled ${pulled} messages, added ${added} to triage`);

        // Classify pending triage items → inbox
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
            } catch (err) {
                console.error(`❌ Scheduler: failed to classify triage item ${item.id}:`, err.message);
            }
        }
        console.log(`✅ Scheduler: classified ${classified} items into inbox`);

        // Update last_run_at only after successful pull
        scheduleDb.markLastRun(freshRow.id);
    } catch (err) {
        console.error(`❌ Scheduler: job for schedule ${freshRow.id} failed:`, err.message);
        // last_run_at is NOT updated on failure
    }
}

/**
 * Convert "HH:MM" time string to a cron expression "MM HH * * *".
 * @param {string} runTime - e.g. "09:00"
 * @returns {string} cron expression
 */
function timeToCron(runTime) {
    const [hour, minute] = runTime.split(':').map(Number);
    return `${minute} ${hour} * * *`;
}

/**
 * Register a single cron job for a schedule row.
 * Cancels any existing job for the same ID first.
 * @param {Object} scheduleRow
 */
function registerJob(scheduleRow) {
    // Cancel existing job if any
    if (activeJobs[scheduleRow.id]) {
        activeJobs[scheduleRow.id].stop();
        delete activeJobs[scheduleRow.id];
    }

    if (!scheduleRow.enabled) return;

    const cronExpr = timeToCron(scheduleRow.run_time);

    if (!cron.validate(cronExpr)) {
        console.error(`❌ Scheduler: invalid cron expression "${cronExpr}" for schedule ${scheduleRow.id}`);
        return;
    }

    const job = cron.schedule(cronExpr, () => runScheduledJob(scheduleRow), {
        timezone: scheduleRow.timezone || 'America/New_York',
        scheduled: true,
    });

    activeJobs[scheduleRow.id] = job;
    console.log(`✅ Scheduler: registered job ${scheduleRow.id} at ${scheduleRow.run_time} (${scheduleRow.timezone})`);
}

/**
 * Cancel a cron job by schedule ID.
 * @param {number} id
 */
function cancelJob(id) {
    if (activeJobs[id]) {
        activeJobs[id].stop();
        delete activeJobs[id];
        console.log(`🛑 Scheduler: cancelled job ${id}`);
    }
}

/**
 * Initialize all enabled schedules from the DB on server start.
 */
function init() {
    scheduleDb.initSlackScheduleTable();
    const schedules = scheduleDb.getAllSchedules();
    console.log(`📅 Scheduler: found ${schedules.length} schedule(s)`);
    for (const row of schedules) {
        registerJob(row);
    }
}

module.exports = { init, registerJob, cancelJob, runScheduledJob };
