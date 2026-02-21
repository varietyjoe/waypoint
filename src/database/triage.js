/**
 * Triage Queue Database Access Layer
 * Manages items from Slack/Grain awaiting user review
 */

const db = require('./index');

/**
 * Add item to triage queue
 * @param {Object} item
 * @param {string} item.source_type - 'slack' or 'grain'
 * @param {string} item.source_id - External ID
 * @param {string} item.source_url - Link to source
 * @param {string} item.content - Message/transcript content
 * @param {Object} item.metadata - Additional context
 * @returns {number} ID of created item
 */
function addToQueue(item) {
    const { source_type, source_id, source_url, content, metadata } = item;

    if (!source_type || !['slack', 'grain'].includes(source_type)) {
        throw new Error('source_type must be "slack" or "grain"');
    }

    if (!source_id) {
        throw new Error('source_id is required');
    }

    if (!content) {
        throw new Error('content is required');
    }

    const stmt = db.prepare(`
        INSERT INTO triage_queue (
            source_type,
            source_id,
            source_url,
            content,
            metadata
        ) VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        source_type,
        source_id,
        source_url || null,
        content,
        JSON.stringify(metadata || {})
    );

    return result.lastInsertRowid;
}

/**
 * Get all pending triage items
 * @returns {Array} Pending triage items
 */
function getPendingTriageItems() {
    const stmt = db.prepare(`
        SELECT * FROM triage_queue
        WHERE status = 'pending'
        ORDER BY created_at DESC
    `);

    const rows = stmt.all();

    return rows.map(row => ({
        ...row,
        metadata: JSON.parse(row.metadata || '{}')
    }));
}

/**
 * Get triage item by ID
 * @param {number} id
 * @returns {Object|null}
 */
function getTriageItemById(id) {
    const stmt = db.prepare('SELECT * FROM triage_queue WHERE id = ?');
    const row = stmt.get(id);

    if (!row) {
        return null;
    }

    return {
        ...row,
        metadata: JSON.parse(row.metadata || '{}')
    };
}

/**
 * Get all triage items
 * @returns {Array}
 */
function getAllTriageItems() {
    const stmt = db.prepare('SELECT * FROM triage_queue ORDER BY created_at DESC');
    const rows = stmt.all();

    return rows.map(row => ({
        ...row,
        metadata: JSON.parse(row.metadata || '{}')
    }));
}

/**
 * Get triage items by status
 * @param {string} status - 'pending', 'converted', or 'dismissed'
 * @returns {Array}
 */
function getTriageItemsByStatus(status) {
    const validStatuses = ['pending', 'converted', 'dismissed'];
    if (!validStatuses.includes(status)) {
        throw new Error(`status must be one of: ${validStatuses.join(', ')}`);
    }

    const stmt = db.prepare(`
        SELECT * FROM triage_queue
        WHERE status = ?
        ORDER BY created_at DESC
    `);

    const rows = stmt.all(status);

    return rows.map(row => ({
        ...row,
        metadata: JSON.parse(row.metadata || '{}')
    }));
}

/**
 * Get triage item by source
 * @param {string} source_type
 * @param {string} source_id
 * @returns {Object|null}
 */
function getTriageItemBySource(source_type, source_id) {
    const stmt = db.prepare(`
        SELECT * FROM triage_queue
        WHERE source_type = ? AND source_id = ?
    `);

    const row = stmt.get(source_type, source_id);

    if (!row) {
        return null;
    }

    return {
        ...row,
        metadata: JSON.parse(row.metadata || '{}')
    };
}

/**
 * Update triage item
 * @param {number} id
 * @param {Object} updates
 * @returns {void}
 */
function updateTriageItem(id, updates) {
    const allowedFields = ['status', 'content', 'metadata'];
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

    if (fields.length === 0) {
        throw new Error('No valid fields to update');
    }

    // Handle metadata serialization
    const processedUpdates = { ...updates };
    if (processedUpdates.metadata) {
        processedUpdates.metadata = JSON.stringify(processedUpdates.metadata);
    }

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => processedUpdates[field]);
    values.push(id);

    const stmt = db.prepare(`UPDATE triage_queue SET ${setClause} WHERE id = ?`);
    stmt.run(...values);
}

/**
 * Mark triage item as converted (task created from it)
 * @param {number} id
 * @param {number} taskId - ID of the created task
 * @returns {void}
 */
function markTriageItemAsConverted(id, taskId) {
    const stmt = db.prepare(`
        UPDATE triage_queue
        SET status = 'converted', converted_task_id = ?
        WHERE id = ?
    `);

    stmt.run(taskId, id);
}

/**
 * Delete triage item (dismiss)
 * @param {number} id
 * @returns {void}
 */
function deleteTriageItem(id) {
    const stmt = db.prepare('DELETE FROM triage_queue WHERE id = ?');
    stmt.run(id);
}

/**
 * Mark triage item as dismissed
 * @param {number} id
 * @returns {void}
 */
function markTriageItemAsDismissed(id) {
    const stmt = db.prepare(`
        UPDATE triage_queue
        SET status = 'dismissed'
        WHERE id = ?
    `);

    stmt.run(id);
}

/**
 * Count pending triage items
 * @returns {number}
 */
function countPendingTriageItems() {
    const stmt = db.prepare(`
        SELECT COUNT(*) as count
        FROM triage_queue
        WHERE status = 'pending'
    `);

    const result = stmt.get();
    return result.count;
}

module.exports = {
    addToQueue,
    getPendingTriageItems,
    getTriageItemById,
    getAllTriageItems,
    getTriageItemsByStatus,
    getTriageItemBySource,
    updateTriageItem,
    markTriageItemAsConverted,
    markTriageItemAsDismissed,
    deleteTriageItem,
    countPendingTriageItems
};
