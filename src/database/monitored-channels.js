/**
 * Monitored Channels Database Access Layer
 * Manages Slack channels and Grain recordings that are monitored for new content
 */

const db = require('./index');

/**
 * Add a channel/recording to monitor
 * @param {Object} channelData
 * @param {string} channelData.service - 'slack' or 'grain'
 * @param {string} channelData.channel_id - Slack channel ID or Grain recording filter ID
 * @param {string} channelData.channel_name - Human-readable name
 * @param {boolean} channelData.enabled - Whether monitoring is active
 * @returns {Promise<number>} ID of created record
 */
async function addChannel(channelData) {
    const { service, channel_id, channel_name, enabled = true } = channelData;

    if (!service || !['slack', 'grain'].includes(service)) {
        throw new Error('service must be "slack" or "grain"');
    }

    if (!channel_id) {
        throw new Error('channel_id is required');
    }

    const stmt = db.prepare(`
        INSERT INTO monitored_channels (service, channel_id, channel_name, enabled)
        VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(service, channel_id, channel_name || null, enabled ? 1 : 0);
    return result.lastInsertRowid;
}

/**
 * Get all monitored channels for a service
 * @param {string} service - 'slack' or 'grain'
 * @param {boolean} enabledOnly - Only return enabled channels
 * @returns {Promise<Array>}
 */
async function getChannels(service, enabledOnly = false) {
    if (service && !['slack', 'grain'].includes(service)) {
        throw new Error('service must be "slack" or "grain"');
    }

    let query = `
        SELECT
            id,
            service,
            channel_id,
            channel_name,
            enabled,
            created_at
        FROM monitored_channels
    `;

    const params = [];
    const conditions = [];

    if (service) {
        conditions.push('service = ?');
        params.push(service);
    }

    if (enabledOnly) {
        conditions.push('enabled = 1');
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY channel_name ASC';

    const stmt = db.prepare(query);
    const rows = stmt.all(...params);

    return rows.map(row => ({
        id: row.id,
        service: row.service,
        channel_id: row.channel_id,
        channel_name: row.channel_name,
        enabled: row.enabled === 1,
        created_at: row.created_at
    }));
}

/**
 * Get a specific monitored channel
 * @param {string} service - 'slack' or 'grain'
 * @param {string} channel_id - Channel/recording ID
 * @returns {Promise<Object|null>}
 */
async function getChannel(service, channel_id) {
    if (!service || !['slack', 'grain'].includes(service)) {
        throw new Error('service must be "slack" or "grain"');
    }

    const stmt = db.prepare(`
        SELECT
            id,
            service,
            channel_id,
            channel_name,
            enabled,
            created_at
        FROM monitored_channels
        WHERE service = ? AND channel_id = ?
    `);

    const row = stmt.get(service, channel_id);

    if (!row) {
        return null;
    }

    return {
        id: row.id,
        service: row.service,
        channel_id: row.channel_id,
        channel_name: row.channel_name,
        enabled: row.enabled === 1,
        created_at: row.created_at
    };
}

/**
 * Update a monitored channel
 * @param {number} id - Channel record ID
 * @param {Object} updates
 * @param {string} updates.channel_name - New name
 * @param {boolean} updates.enabled - Enable/disable monitoring
 * @returns {Promise<void>}
 */
async function updateChannel(id, updates) {
    const { channel_name, enabled } = updates;

    const fields = [];
    const params = [];

    if (channel_name !== undefined) {
        fields.push('channel_name = ?');
        params.push(channel_name);
    }

    if (enabled !== undefined) {
        fields.push('enabled = ?');
        params.push(enabled ? 1 : 0);
    }

    if (fields.length === 0) {
        throw new Error('No fields to update');
    }

    params.push(id);

    const stmt = db.prepare(`
        UPDATE monitored_channels
        SET ${fields.join(', ')}
        WHERE id = ?
    `);

    stmt.run(...params);
}

/**
 * Remove a monitored channel
 * @param {number} id - Channel record ID
 * @returns {Promise<void>}
 */
async function removeChannel(id) {
    const stmt = db.prepare('DELETE FROM monitored_channels WHERE id = ?');
    stmt.run(id);
}

/**
 * Remove a monitored channel by service and channel_id
 * @param {string} service - 'slack' or 'grain'
 * @param {string} channel_id - Channel/recording ID
 * @returns {Promise<void>}
 */
async function removeChannelByServiceId(service, channel_id) {
    if (!service || !['slack', 'grain'].includes(service)) {
        throw new Error('service must be "slack" or "grain"');
    }

    const stmt = db.prepare('DELETE FROM monitored_channels WHERE service = ? AND channel_id = ?');
    stmt.run(service, channel_id);
}

/**
 * Check if a channel is being monitored
 * @param {string} service - 'slack' or 'grain'
 * @param {string} channel_id - Channel/recording ID
 * @returns {Promise<boolean>}
 */
async function isChannelMonitored(service, channel_id) {
    const channel = await getChannel(service, channel_id);
    return channel !== null && channel.enabled;
}

module.exports = {
    addChannel,
    getChannels,
    getChannel,
    updateChannel,
    removeChannel,
    removeChannelByServiceId,
    isChannelMonitored
};
