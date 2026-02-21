/**
 * Grain API Client
 * Utility functions for interacting with Grain API
 */

const BASE_URL = 'https://api.grain.com/_/public-api';

/**
 * Fetch a specific recording from Grain
 * @param {string} token - Grain access token
 * @param {string} recordingId - Recording ID
 * @param {Object} options - Options
 * @param {boolean} options.includeTranscript - Include transcript
 * @param {boolean} options.includeNotes - Include intelligence notes
 * @returns {Promise<Object|null>}
 */
async function getRecording(token, recordingId, options = {}) {
    try {
        const params = new URLSearchParams();

        if (options.includeTranscript) {
            params.append('include_transcript', 'true');
        }

        if (options.includeNotes) {
            params.append('include_intelligence', 'true');
        }

        const url = `${BASE_URL}/recordings/${recordingId}${params.toString() ? '?' + params.toString() : ''}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('Grain API error:', response.status, response.statusText);
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching Grain recording:', error);
        return null;
    }
}

/**
 * List recordings from Grain
 * @param {string} token - Grain access token
 * @param {Object} options - Query options
 * @param {number} options.limit - Max recordings to fetch
 * @param {string} options.cursor - Pagination cursor
 * @returns {Promise<Object>}
 */
async function listRecordings(token, options = {}) {
    try {
        const params = new URLSearchParams();

        if (options.limit) {
            params.append('limit', options.limit);
        }

        if (options.cursor) {
            params.append('cursor', options.cursor);
        }

        const url = `${BASE_URL}/recordings${params.toString() ? '?' + params.toString() : ''}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('Grain API error:', response.status, response.statusText);
            return { recordings: [], next_cursor: null };
        }

        const data = await response.json();
        return {
            recordings: data.recordings || [],
            next_cursor: data.next_cursor || null
        };
    } catch (error) {
        console.error('Error listing Grain recordings:', error);
        return { recordings: [], next_cursor: null };
    }
}

/**
 * Register a webhook with Grain
 * @param {string} token - Grain access token
 * @param {string} webhookUrl - URL to receive webhooks
 * @param {Array<string>} events - Events to subscribe to
 * @returns {Promise<boolean>}
 */
async function registerWebhook(token, webhookUrl, events = ['recording.created', 'recording.updated']) {
    try {
        const response = await fetch(`${BASE_URL}/webhooks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: webhookUrl,
                events: events
            })
        });

        if (!response.ok) {
            console.error('Grain webhook registration error:', response.status, response.statusText);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error registering Grain webhook:', error);
        return false;
    }
}

/**
 * List registered webhooks
 * @param {string} token - Grain access token
 * @returns {Promise<Array>}
 */
async function listWebhooks(token) {
    try {
        const response = await fetch(`${BASE_URL}/webhooks`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('Grain API error:', response.status, response.statusText);
            return [];
        }

        const data = await response.json();
        return data.webhooks || [];
    } catch (error) {
        console.error('Error listing Grain webhooks:', error);
        return [];
    }
}

/**
 * Delete a webhook
 * @param {string} token - Grain access token
 * @param {string} webhookId - Webhook ID to delete
 * @returns {Promise<boolean>}
 */
async function deleteWebhook(token, webhookId) {
    try {
        const response = await fetch(`${BASE_URL}/webhooks/${webhookId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('Grain webhook deletion error:', response.status, response.statusText);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error deleting Grain webhook:', error);
        return false;
    }
}

module.exports = {
    getRecording,
    listRecordings,
    registerWebhook,
    listWebhooks,
    deleteWebhook
};
