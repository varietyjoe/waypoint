/**
 * Slack API Client
 * Utility functions for interacting with Slack API
 */

/**
 * Fetch user information from Slack
 * @param {string} token - Slack access token
 * @param {string} userId - Slack user ID
 * @returns {Promise<Object|null>}
 */
async function getUserInfo(token, userId) {
    try {
        const response = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            return null;
        }

        return data.user;
    } catch (error) {
        console.error('Error fetching Slack user info:', error);
        return null;
    }
}

/**
 * Fetch channel information from Slack
 * @param {string} token - Slack access token
 * @param {string} channelId - Slack channel ID
 * @returns {Promise<Object|null>}
 */
async function getChannelInfo(token, channelId) {
    try {
        const response = await fetch(`https://slack.com/api/conversations.info?channel=${channelId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            return null;
        }

        return data.channel;
    } catch (error) {
        console.error('Error fetching Slack channel info:', error);
        return null;
    }
}

/**
 * Get list of all channels the bot can see
 * @param {string} token - Slack access token
 * @returns {Promise<Array>}
 */
async function getChannels(token) {
    try {
        const response = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            return [];
        }

        return data.channels || [];
    } catch (error) {
        console.error('Error fetching Slack channels:', error);
        return [];
    }
}

/**
 * Fetch message history from a channel
 * @param {string} token - Slack access token
 * @param {string} channelId - Slack channel ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Max messages to fetch
 * @param {string} options.oldest - Oldest timestamp to fetch from
 * @returns {Promise<Array>}
 */
async function getChannelHistory(token, channelId, options = {}) {
    try {
        const params = new URLSearchParams({
            channel: channelId,
            limit: options.limit || 100
        });

        if (options.oldest) {
            params.append('oldest', options.oldest);
        }

        const response = await fetch(`https://slack.com/api/conversations.history?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            return [];
        }

        return data.messages || [];
    } catch (error) {
        console.error('Error fetching Slack channel history:', error);
        return [];
    }
}

/**
 * Get list of DM conversations
 * @param {string} token - Slack access token
 * @returns {Promise<Array>}
 */
async function getDMConversations(token) {
    try {
        const response = await fetch('https://slack.com/api/conversations.list?types=im', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            return [];
        }

        return data.channels || [];
    } catch (error) {
        console.error('Error fetching Slack DM conversations:', error);
        return [];
    }
}

/**
 * Get list of group DM conversations (mpim)
 * @param {string} token - Slack access token
 * @returns {Promise<Array>}
 */
async function getGroupDMConversations(token) {
    try {
        const response = await fetch('https://slack.com/api/conversations.list?types=mpim', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            return [];
        }

        return data.channels || [];
    } catch (error) {
        console.error('Error fetching Slack group DM conversations:', error);
        return [];
    }
}

/**
 * Get ALL conversations the user is part of (channels, DMs, group DMs)
 * This is the key function for user token approach - returns everything the user can see
 * @param {string} token - Slack user access token
 * @returns {Promise<Object>} Object containing channels, dms, and groupDms arrays
 */
async function getAllConversations(token) {
    try {
        // Fetch all conversation types in parallel
        const response = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel,im,mpim&limit=1000', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            return { channels: [], dms: [], groupDms: [], all: [] };
        }

        const conversations = data.channels || [];

        // Categorize by type
        const channels = conversations.filter(c => c.is_channel || c.is_group);
        const dms = conversations.filter(c => c.is_im);
        const groupDms = conversations.filter(c => c.is_mpim);

        return {
            channels,
            dms,
            groupDms,
            all: conversations
        };
    } catch (error) {
        console.error('Error fetching all Slack conversations:', error);
        return { channels: [], dms: [], groupDms: [], all: [] };
    }
}

/**
 * Pull recent messages from multiple conversations
 * @param {string} token - Slack access token
 * @param {Array<string>} conversationIds - Array of conversation IDs to pull from
 * @param {Object} options - Query options
 * @param {string} options.oldest - Only fetch messages newer than this timestamp
 * @param {number} options.limit - Max messages per conversation (default 50)
 * @returns {Promise<Array>} Array of messages with conversation context
 */
async function pullMessagesFromConversations(token, conversationIds, options = {}) {
    const allMessages = [];
    const limit = options.limit || 50;

    // Process conversations in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < conversationIds.length; i += batchSize) {
        const batch = conversationIds.slice(i, i + batchSize);

        const batchPromises = batch.map(async (conversationId) => {
            const messages = await getChannelHistory(token, conversationId, {
                limit,
                oldest: options.oldest
            });

            // Add conversation context to each message
            return messages.map(msg => ({
                ...msg,
                conversation_id: conversationId
            }));
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(messages => allMessages.push(...messages));

        // Small delay between batches to respect rate limits
        if (i + batchSize < conversationIds.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return allMessages;
}

/**
 * Post a message to a Slack channel
 * @param {string} token - Slack access token
 * @param {string} channelId - Slack channel ID
 * @param {string} text - Message text
 * @returns {Promise<boolean>}
 */
async function postMessage(token, channelId, text) {
    try {
        const response = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                channel: channelId,
                text: text
            })
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Slack API error:', data.error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error posting Slack message:', error);
        return false;
    }
}

module.exports = {
    getUserInfo,
    getChannelInfo,
    getChannels,
    getChannelHistory,
    getDMConversations,
    getGroupDMConversations,
    getAllConversations,
    pullMessagesFromConversations,
    postMessage
};
