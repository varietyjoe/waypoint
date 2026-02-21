/**
 * Slack OAuth and Webhook Routes
 */

const express = require('express');
const router = express.Router();
const oauthTokens = require('../database/oauth-tokens');
const monitoredChannels = require('../database/monitored-channels');
const triage = require('../database/triage');
const inbox = require('../database/inbox');
const slackClient = require('../integrations/slack-client');

/**
 * GET /api/slack/authorize
 * Initiates Slack OAuth flow
 */
router.get('/authorize', (req, res) => {
    const clientId = process.env.SLACK_CLIENT_ID;

    if (!clientId) {
        return res.status(500).json({ error: 'Slack client ID not configured' });
    }

    // User token scopes - these let us read as the USER, not as a bot
    // This means we can access any channel/DM the user is in without inviting a bot
    const userScopes = [
        'channels:history',   // Read messages in public channels user is in
        'channels:read',      // List public channels
        'groups:history',     // Read messages in private channels user is in
        'groups:read',        // List private channels
        'im:history',         // Read DM messages
        'im:read',            // List DM conversations
        'mpim:history',       // Read group DM messages
        'mpim:read',          // List group DM conversations
        'users:read'          // Get user info for message context
    ];

    // Use HTTPS if behind a proxy (like ngrok) or if X-Forwarded-Proto is https
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const redirectUri = `${protocol}://${req.get('host')}/api/slack/callback`;
    const state = Math.random().toString(36).substring(7);

    // Store state in session for verification
    req.session.slackOauthState = state;

    // IMPORTANT: Using user_scope instead of scope to get a User Token (xoxp-) instead of Bot Token (xoxb-)
    const authorizeUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&user_scope=${userScopes.join(',')}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    res.redirect(authorizeUrl);
});

/**
 * GET /api/slack/callback
 * Handles Slack OAuth callback
 */
router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        return res.status(400).json({ error: `Slack OAuth error: ${error}` });
    }

    if (!code) {
        return res.status(400).json({ error: 'No authorization code provided' });
    }

    // Verify state
    if (state !== req.session.slackOauthState) {
        return res.status(400).json({ error: 'Invalid state parameter' });
    }

    try {
        const clientId = process.env.SLACK_CLIENT_ID;
        const clientSecret = process.env.SLACK_CLIENT_SECRET;
        const protocol = req.get('x-forwarded-proto') || req.protocol;
        const redirectUri = `${protocol}://${req.get('host')}/api/slack/callback`;

        // Exchange code for token
        const response = await fetch('https://slack.com/api/oauth.v2.access', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                redirect_uri: redirectUri
            })
        });

        const data = await response.json();

        if (!data.ok) {
            return res.status(400).json({ error: `Slack API error: ${data.error}` });
        }

        // With user_scope, the token is in authed_user.access_token (not data.access_token)
        // This gives us a User Token (xoxp-) that can read anything the user can read
        const userToken = data.authed_user?.access_token;
        const userScopes = data.authed_user?.scope;
        const userId = data.authed_user?.id;

        if (!userToken) {
            return res.status(400).json({ error: 'No user token received - make sure user_scope is set' });
        }

        // Store OAuth token
        await oauthTokens.upsertToken({
            service: 'slack',
            access_token: userToken,
            workspace_id: data.team.id,
            workspace_name: data.team.name,
            scopes: userScopes ? { scopes: userScopes.split(','), user_id: userId } : {}
        });

        // Clean up session
        delete req.session.slackOauthState;

        // Redirect to settings page with success
        res.redirect('/?slack=connected');
    } catch (error) {
        console.error('Slack OAuth error:', error);
        res.status(500).json({ error: 'Failed to complete Slack authorization' });
    }
});

/**
 * POST /api/slack/webhook
 * Receives Slack events via webhook
 */
router.post('/webhook', async (req, res) => {
    const { type, challenge, event } = req.body;

    // Handle URL verification challenge
    if (type === 'url_verification') {
        return res.json({ challenge });
    }

    // Handle events
    if (type === 'event_callback' && event) {
        try {
            // Only process message events
            if (event.type === 'message' && !event.subtype) {
                const channelId = event.channel;
                const messageText = event.text;
                const messageTs = event.ts;
                const userId = event.user;

                // Check if channel is monitored
                const isMonitored = await monitoredChannels.isChannelMonitored('slack', channelId);

                if (isMonitored) {
                    // Get token to fetch additional context
                    const token = await oauthTokens.getToken('slack');

                    if (token) {
                        // Fetch user info
                        const userInfo = await slackClient.getUserInfo(token.access_token, userId);
                        const userName = userInfo ? userInfo.real_name || userInfo.name : 'Unknown User';

                        // Fetch channel info
                        const channelInfo = await slackClient.getChannelInfo(token.access_token, channelId);
                        const channelName = channelInfo ? channelInfo.name : 'Unknown Channel';

                        // Build message URL
                        const messageUrl = `https://app.slack.com/client/${token.workspace_id}/${channelId}/${messageTs.replace('.', '')}`;

                        // Add to triage queue
                        await triage.addToQueue({
                            source_type: 'slack',
                            source_id: messageTs,
                            source_url: messageUrl,
                            content: messageText,
                            metadata: {
                                channel_id: channelId,
                                channel_name: channelName,
                                user_id: userId,
                                user_name: userName,
                                timestamp: messageTs
                            }
                        });

                        console.log(`Added Slack message to triage: ${channelName} - ${userName}`);
                    }
                }
            }

            res.status(200).send('OK');
        } catch (error) {
            console.error('Error processing Slack webhook:', error);
            res.status(500).send('Error processing webhook');
        }
    } else {
        res.status(200).send('OK');
    }
});

/**
 * GET /api/slack/channels
 * Get list of Slack channels
 */
router.get('/channels', async (req, res) => {
    try {
        const token = await oauthTokens.getToken('slack');

        if (!token) {
            return res.status(401).json({ error: 'Slack not connected' });
        }

        const channels = await slackClient.getChannels(token.access_token);
        res.json({ channels });
    } catch (error) {
        console.error('Error fetching Slack channels:', error);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

/**
 * POST /api/slack/channels/:channelId/monitor
 * Add a channel to monitoring
 */
router.post('/channels/:channelId/monitor', async (req, res) => {
    try {
        const { channelId } = req.params;
        const { channelName } = req.body;

        const id = await monitoredChannels.addChannel({
            service: 'slack',
            channel_id: channelId,
            channel_name: channelName,
            enabled: true
        });

        res.json({ success: true, id });
    } catch (error) {
        console.error('Error adding monitored channel:', error);
        res.status(500).json({ error: 'Failed to add channel' });
    }
});

/**
 * DELETE /api/slack/channels/:channelId/monitor
 * Remove a channel from monitoring
 */
router.delete('/channels/:channelId/monitor', async (req, res) => {
    try {
        const { channelId } = req.params;

        await monitoredChannels.removeChannelByServiceId('slack', channelId);

        res.json({ success: true });
    } catch (error) {
        console.error('Error removing monitored channel:', error);
        res.status(500).json({ error: 'Failed to remove channel' });
    }
});

/**
 * GET /api/slack/status
 * Get Slack connection status
 */
router.get('/status', async (req, res) => {
    try {
        const token = await oauthTokens.getToken('slack');
        const monitored = await monitoredChannels.getChannels('slack', true);

        res.json({
            connected: !!token,
            workspace: token ? token.workspace_name : null,
            monitored_channels: monitored.length
        });
    } catch (error) {
        console.error('Error fetching Slack status:', error);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

/**
 * DELETE /api/slack/disconnect
 * Disconnect Slack integration
 */
router.delete('/disconnect', async (req, res) => {
    try {
        await oauthTokens.deleteToken('slack');

        // Optionally remove all monitored channels
        const channels = await monitoredChannels.getChannels('slack');
        for (const channel of channels) {
            await monitoredChannels.removeChannel(channel.id);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error disconnecting Slack:', error);
        res.status(500).json({ error: 'Failed to disconnect' });
    }
});

/**
 * POST /api/slack/monitor-all
 * Monitor all public Slack channels
 */
router.post('/monitor-all', async (req, res) => {
    try {
        const token = await oauthTokens.getToken('slack');

        if (!token) {
            return res.status(401).json({ error: 'Slack not connected' });
        }

        // Get all channels
        const channels = await slackClient.getChannels(token.access_token);

        let monitoredCount = 0;
        for (const channel of channels) {
            // Check if already monitored
            const isMonitored = await monitoredChannels.isChannelMonitored('slack', channel.id);

            if (!isMonitored) {
                await monitoredChannels.addChannel({
                    service: 'slack',
                    channel_id: channel.id,
                    channel_name: channel.name,
                    enabled: true
                });
                monitoredCount++;
            }
        }

        res.json({
            success: true,
            message: `Started monitoring ${monitoredCount} new channels`,
            totalChannels: channels.length
        });
    } catch (error) {
        console.error('Error monitoring all channels:', error);
        res.status(500).json({ error: 'Failed to monitor all channels' });
    }
});

/**
 * GET /api/slack/conversations
 * Get all conversations (channels, DMs, group DMs) the user is part of
 * This is the key endpoint for user token approach
 */
router.get('/conversations', async (req, res) => {
    try {
        const token = await oauthTokens.getToken('slack');

        if (!token) {
            return res.status(401).json({ error: 'Slack not connected' });
        }

        const conversations = await slackClient.getAllConversations(token.access_token);

        // Enrich DMs with user info
        const enrichedDms = await Promise.all(
            conversations.dms.map(async (dm) => {
                const userInfo = await slackClient.getUserInfo(token.access_token, dm.user);
                return {
                    ...dm,
                    user_name: userInfo ? userInfo.real_name || userInfo.name : 'Unknown',
                    user_profile: userInfo?.profile
                };
            })
        );

        res.json({
            channels: conversations.channels,
            dms: enrichedDms,
            groupDms: conversations.groupDms,
            total: conversations.all.length
        });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

/**
 * POST /api/slack/pull
 * Pull recent messages from selected conversations and add to triage queue
 * This replaces webhook-based approach with on-demand polling
 */
router.post('/pull', async (req, res) => {
    try {
        const token = await oauthTokens.getToken('slack');

        if (!token) {
            return res.status(401).json({ error: 'Slack not connected' });
        }

        const {
            conversationIds,  // Optional: specific conversations to pull from
            hoursBack = 24,   // How far back to look (default 24 hours)
            includeChannels = true,
            includeDms = true,
            includeGroupDms = true
        } = req.body;

        // Calculate oldest timestamp
        const oldestTimestamp = String((Date.now() / 1000) - (hoursBack * 3600));

        let targetConversations = conversationIds;

        // If no specific conversations provided, get all based on flags
        if (!targetConversations || targetConversations.length === 0) {
            const allConversations = await slackClient.getAllConversations(token.access_token);

            targetConversations = [];
            if (includeChannels) {
                targetConversations.push(...allConversations.channels.map(c => c.id));
            }
            if (includeDms) {
                targetConversations.push(...allConversations.dms.map(c => c.id));
            }
            if (includeGroupDms) {
                targetConversations.push(...allConversations.groupDms.map(c => c.id));
            }
        }

        // Pull messages from all target conversations
        const messages = await slackClient.pullMessagesFromConversations(
            token.access_token,
            targetConversations,
            { oldest: oldestTimestamp, limit: 100 }
        );

        // Filter: no bots, not the authenticated user's own messages, non-empty text
        const authenticatedUserId = token.scopes?.user_id;
        const relevantMessages = messages.filter(msg =>
            !msg.bot_id &&
            (!authenticatedUserId || msg.user !== authenticatedUserId) &&
            msg.text &&
            msg.text.trim().length > 0
        );

        // Get conversation info for context
        const conversationInfoCache = {};
        const userInfoCache = {};

        let addedCount = 0;
        for (const msg of relevantMessages) {
            // Get conversation info
            if (!conversationInfoCache[msg.conversation_id]) {
                conversationInfoCache[msg.conversation_id] = await slackClient.getChannelInfo(
                    token.access_token,
                    msg.conversation_id
                );
            }
            const convInfo = conversationInfoCache[msg.conversation_id];

            // Get user info
            if (!userInfoCache[msg.user]) {
                userInfoCache[msg.user] = await slackClient.getUserInfo(
                    token.access_token,
                    msg.user
                );
            }
            const userInfo = userInfoCache[msg.user];

            // Determine conversation name
            let conversationName = convInfo?.name || 'Unknown';
            if (convInfo?.is_im) {
                conversationName = `DM with ${userInfo?.real_name || userInfo?.name || 'Unknown'}`;
            } else if (convInfo?.is_mpim) {
                conversationName = convInfo.name || 'Group DM';
            }

            // Build source URL
            const messageUrl = `https://app.slack.com/client/${token.workspace_id}/${msg.conversation_id}/p${msg.ts.replace('.', '')}`;

            // Check if already in triage queue or inbox (deduplication)
            const existingTriageItem = triage.getTriageItemBySource('slack', msg.ts);
            const existingInboxItem = inbox.getInboxItemByMessageTs(msg.ts);

            if (!existingTriageItem && !existingInboxItem) {
                triage.addToQueue({
                    source_type: 'slack',
                    source_id: msg.ts,
                    source_url: messageUrl,
                    content: msg.text,
                    metadata: {
                        conversation_id: msg.conversation_id,
                        conversation_name: conversationName,
                        conversation_type: convInfo?.is_im ? 'dm' : (convInfo?.is_mpim ? 'group_dm' : 'channel'),
                        user_id: msg.user,
                        user_name: userInfo?.real_name || userInfo?.name || 'Unknown',
                        timestamp: msg.ts
                    }
                });
                addedCount++;
            }
        }

        res.json({
            success: true,
            pulled: relevantMessages.length,
            added: addedCount,
            skipped: relevantMessages.length - addedCount,
            conversationsScanned: targetConversations.length
        });
    } catch (error) {
        console.error('Error pulling Slack messages:', error);
        res.status(500).json({ error: 'Failed to pull messages' });
    }
});

/**
 * GET /api/slack/dms
 * Get list of DM conversations with user info
 */
router.get('/dms', async (req, res) => {
    try {
        const token = await oauthTokens.getToken('slack');

        if (!token) {
            return res.status(401).json({ error: 'Slack not connected' });
        }

        const dms = await slackClient.getDMConversations(token.access_token);

        // Enrich with user info
        const enrichedDms = await Promise.all(
            dms.map(async (dm) => {
                const userInfo = await slackClient.getUserInfo(token.access_token, dm.user);
                return {
                    id: dm.id,
                    user_id: dm.user,
                    user_name: userInfo?.real_name || userInfo?.name || 'Unknown',
                    display_name: userInfo?.profile?.display_name || '',
                    is_active: !dm.is_archived
                };
            })
        );

        res.json({ dms: enrichedDms });
    } catch (error) {
        console.error('Error fetching DMs:', error);
        res.status(500).json({ error: 'Failed to fetch DMs' });
    }
});

module.exports = router;
