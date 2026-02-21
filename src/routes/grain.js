/**
 * Grain OAuth and Webhook Routes
 */

const express = require('express');
const router = express.Router();
const oauthTokens = require('../database/oauth-tokens');
const monitoredChannels = require('../database/monitored-channels');
const triage = require('../database/triage');
const grainClient = require('../integrations/grain-client');

/**
 * GET /api/grain/authorize
 * Initiates Grain OAuth flow
 */
router.get('/authorize', (req, res) => {
    const clientId = process.env.GRAIN_CLIENT_ID;

    if (!clientId) {
        return res.status(500).json({ error: 'Grain client ID not configured' });
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/grain/callback`;
    const state = Math.random().toString(36).substring(7);

    // Store state in session for verification
    req.session.grainOauthState = state;

    const authorizeUrl = `https://grain.com/_/public-api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code`;

    res.redirect(authorizeUrl);
});

/**
 * GET /api/grain/callback
 * Handles Grain OAuth callback
 */
router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        return res.status(400).json({ error: `Grain OAuth error: ${error}` });
    }

    if (!code) {
        return res.status(400).json({ error: 'No authorization code provided' });
    }

    // Verify state
    if (state !== req.session.grainOauthState) {
        return res.status(400).json({ error: 'Invalid state parameter' });
    }

    try {
        const clientId = process.env.GRAIN_CLIENT_ID;
        const clientSecret = process.env.GRAIN_CLIENT_SECRET;
        const redirectUri = `${req.protocol}://${req.get('host')}/api/grain/callback`;

        // Exchange code for token
        const response = await fetch('https://api.grain.com/_/public-api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                redirect_uri: redirectUri
            })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            return res.status(400).json({ error: `Grain API error: ${data.error || 'Unknown error'}` });
        }

        // Calculate expiry timestamp
        const expiresAt = data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : null;

        // Store OAuth token
        await oauthTokens.upsertToken({
            service: 'grain',
            access_token: data.access_token,
            refresh_token: data.refresh_token || null,
            expires_at: expiresAt,
            workspace_id: 'default',
            workspace_name: 'Grain Workspace',
            scopes: data.scope ? { scopes: data.scope.split(' ') } : {}
        });

        // Clean up session
        delete req.session.grainOauthState;

        // Redirect to settings page with success
        res.redirect('/?grain=connected');
    } catch (error) {
        console.error('Grain OAuth error:', error);
        res.status(500).json({ error: 'Failed to complete Grain authorization' });
    }
});

/**
 * POST /api/grain/webhook
 * Receives Grain events via webhook
 */
router.post('/webhook', async (req, res) => {
    try {
        const { event, data } = req.body;

        // Handle new recording event
        if (event === 'recording.created' || event === 'recording.updated') {
            const recordingId = data.id;

            // Get token to fetch recording details
            const token = await oauthTokens.getToken('grain');

            if (token) {
                // Fetch full recording with transcript
                const recording = await grainClient.getRecording(token.access_token, recordingId, {
                    includeTranscript: true,
                    includeNotes: true
                });

                if (recording) {
                    // Extract key information
                    const title = recording.title || 'Untitled Recording';
                    const transcript = recording.transcript || '';
                    const notes = recording.intelligence_notes || '';
                    const recordingUrl = recording.url || `https://grain.com/share/${recordingId}`;
                    const participants = recording.participants || [];

                    // Build content for triage
                    let content = `**${title}**\n\n`;

                    if (participants.length > 0) {
                        content += `Participants: ${participants.map(p => p.name).join(', ')}\n\n`;
                    }

                    if (notes) {
                        content += `**Notes:**\n${notes}\n\n`;
                    }

                    if (transcript) {
                        // Limit transcript length for preview
                        const truncatedTranscript = transcript.length > 500
                            ? transcript.substring(0, 500) + '...'
                            : transcript;
                        content += `**Transcript:**\n${truncatedTranscript}`;
                    }

                    // Add to triage queue
                    await triage.addToQueue({
                        source_type: 'grain',
                        source_id: recordingId,
                        source_url: recordingUrl,
                        content: content,
                        metadata: {
                            recording_id: recordingId,
                            title: title,
                            created_at: recording.created_at,
                            duration: recording.duration,
                            participants: participants.map(p => p.name)
                        }
                    });

                    console.log(`Added Grain recording to triage: ${title}`);
                }
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error processing Grain webhook:', error);
        res.status(500).send('Error processing webhook');
    }
});

/**
 * POST /api/grain/webhook/register
 * Register webhook with Grain
 */
router.post('/webhook/register', async (req, res) => {
    try {
        const token = await oauthTokens.getToken('grain');

        if (!token) {
            return res.status(401).json({ error: 'Grain not connected' });
        }

        const webhookUrl = `${req.protocol}://${req.get('host')}/api/grain/webhook`;
        const success = await grainClient.registerWebhook(token.access_token, webhookUrl);

        if (success) {
            res.json({ success: true, webhook_url: webhookUrl });
        } else {
            res.status(500).json({ error: 'Failed to register webhook' });
        }
    } catch (error) {
        console.error('Error registering Grain webhook:', error);
        res.status(500).json({ error: 'Failed to register webhook' });
    }
});

/**
 * GET /api/grain/status
 * Get Grain connection status
 */
router.get('/status', async (req, res) => {
    try {
        const token = await oauthTokens.getToken('grain');
        const isValid = await oauthTokens.isTokenValid('grain');

        res.json({
            connected: !!token && isValid,
            workspace: token ? token.workspace_name : null
        });
    } catch (error) {
        console.error('Error fetching Grain status:', error);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

/**
 * DELETE /api/grain/disconnect
 * Disconnect Grain integration
 */
router.delete('/disconnect', async (req, res) => {
    try {
        await oauthTokens.deleteToken('grain');

        res.json({ success: true });
    } catch (error) {
        console.error('Error disconnecting Grain:', error);
        res.status(500).json({ error: 'Failed to disconnect' });
    }
});

module.exports = router;
