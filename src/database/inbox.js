/**
 * Inbox Database Access Layer
 * Manages suggested tasks from AI analysis
 */

const db = require('./index');

/**
 * Run additive migrations for Phase 1.2 columns.
 * Uses try/catch because SQLite has no ALTER TABLE IF NOT EXISTS.
 */
function initInboxMigrations() {
    // Phase 1.2 — additive column migrations
    const migrations = [
        "ALTER TABLE inbox ADD COLUMN classification TEXT",
        "ALTER TABLE inbox ADD COLUMN suggested_outcome_id INTEGER REFERENCES outcomes(id)",
        "ALTER TABLE inbox ADD COLUMN ai_reasoning TEXT",
    ];
    for (const sql of migrations) {
        try { db.prepare(sql).run(); } catch (_) { /* column already exists */ }
    }

    // Phase 4.0 — expand source_type CHECK constraint to include 'slack_command' and 'email_forward'
    // SQLite does not support ALTER COLUMN, so we recreate the table if the constraint is still narrow.
    // Detect the old constraint by checking the table SQL in sqlite_master.
    try {
        const schemaMeta = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='inbox'").get();
        const hasNarrowCheck = schemaMeta && schemaMeta.sql.includes("source_type IN ('slack', 'grain', 'manual')");
        if (hasNarrowCheck) {
            db.exec(`
                PRAGMA foreign_keys = OFF;

                ALTER TABLE inbox RENAME TO inbox_old_phase40;

                CREATE TABLE inbox (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT,
                    priority TEXT DEFAULT 'Medium' CHECK(priority IN ('Low', 'Medium', 'High')),
                    due_date TEXT,
                    source_type TEXT NOT NULL CHECK(source_type IN ('slack', 'grain', 'manual', 'slack_command', 'email_forward')),
                    source_url TEXT,
                    source_metadata TEXT,
                    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    processed_at DATETIME,
                    classification TEXT,
                    suggested_outcome_id INTEGER REFERENCES outcomes(id),
                    ai_reasoning TEXT
                );

                INSERT INTO inbox SELECT * FROM inbox_old_phase40;

                DROP TABLE inbox_old_phase40;

                PRAGMA foreign_keys = ON;
            `);
            console.log('✅ Inbox source_type CHECK constraint expanded (Phase 4.0)');
        }
    } catch (migErr) {
        console.error('❌ Inbox Phase 4.0 migration failed:', migErr.message);
    }

    console.log('✅ Inbox Phase 1.2 columns ready');
}

/**
 * Add a suggested task to inbox
 * @param {Object} suggestion
 * @returns {Promise<Object>} Created inbox item
 */
async function addToInbox(suggestion) {
    const {
        title,
        description,
        priority = 'Medium',
        due_date,
        source_type,
        source_url,
        source_metadata,
        classification = null,
        suggested_outcome_id = null,
        ai_reasoning = null,
    } = suggestion;

    if (!title) {
        throw new Error('title is required');
    }

    const VALID_SOURCE_TYPES = ['slack', 'grain', 'manual', 'slack_command', 'email_forward'];
    if (!source_type || !VALID_SOURCE_TYPES.includes(source_type)) {
        throw new Error(`source_type must be one of: ${VALID_SOURCE_TYPES.join(', ')}`);
    }

    const stmt = db.prepare(`
        INSERT INTO inbox (
            title,
            description,
            priority,
            due_date,
            source_type,
            source_url,
            source_metadata,
            status,
            classification,
            suggested_outcome_id,
            ai_reasoning
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `);

    const result = stmt.run(
        title,
        description || null,
        priority,
        due_date || null,
        source_type,
        source_url || null,
        JSON.stringify(source_metadata || {}),
        classification,
        suggested_outcome_id,
        ai_reasoning
    );

    return getInboxItemById(result.lastInsertRowid);
}

/**
 * Get all pending inbox items
 * @returns {Promise<Array>}
 */
async function getPendingInboxItems() {
    const stmt = db.prepare(`
        SELECT
            id,
            title,
            description,
            priority,
            due_date,
            source_type,
            source_url,
            source_metadata,
            status,
            created_at,
            processed_at,
            classification,
            suggested_outcome_id,
            ai_reasoning
        FROM inbox
        WHERE status = 'pending'
        ORDER BY created_at DESC
    `);

    const rows = stmt.all();

    return rows.map(row => ({
        ...row,
        source_metadata: JSON.parse(row.source_metadata || '{}')
    }));
}

/**
 * Get inbox item by ID
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function getInboxItemById(id) {
    const stmt = db.prepare(`
        SELECT
            id,
            title,
            description,
            priority,
            due_date,
            source_type,
            source_url,
            source_metadata,
            status,
            created_at,
            processed_at,
            classification,
            suggested_outcome_id,
            ai_reasoning
        FROM inbox
        WHERE id = ?
    `);

    const row = stmt.get(id);

    if (!row) {
        return null;
    }

    return {
        ...row,
        source_metadata: JSON.parse(row.source_metadata || '{}')
    };
}

/**
 * Get all inbox items (with optional status filter)
 * @param {string} status - Optional: 'pending', 'approved', 'rejected'
 * @returns {Promise<Array>}
 */
async function getInboxItems(status = null) {
    let query = `
        SELECT
            id,
            title,
            description,
            priority,
            due_date,
            source_type,
            source_url,
            source_metadata,
            status,
            created_at,
            processed_at,
            classification,
            suggested_outcome_id,
            ai_reasoning
        FROM inbox
    `;

    const params = [];
    if (status) {
        query += ' WHERE status = ?';
        params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = db.prepare(query);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();

    return rows.map(row => ({
        ...row,
        source_metadata: JSON.parse(row.source_metadata || '{}')
    }));
}

/**
 * Approve an inbox item (optionally creating a task)
 * @param {number} id
 * @param {boolean} createTask - Whether to create a task from this item
 * @returns {Promise<Object>}
 */
async function approveInboxItem(id, createTask = true) {
    const stmt = db.prepare(`
        UPDATE inbox
        SET status = 'approved',
            processed_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `);

    stmt.run(id);

    return getInboxItemById(id);
}

/**
 * Reject an inbox item
 * @param {number} id
 * @returns {Promise<Object>}
 */
async function rejectInboxItem(id) {
    const stmt = db.prepare(`
        UPDATE inbox
        SET status = 'rejected',
            processed_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `);

    stmt.run(id);

    return getInboxItemById(id);
}

/**
 * Update an inbox item
 * @param {number} id
 * @param {Object} updates
 * @returns {Promise<Object>}
 */
async function updateInboxItem(id, updates) {
    const allowedFields = ['title', 'description', 'priority', 'due_date'];
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
    }

    if (fields.length === 0) {
        return getInboxItemById(id);
    }

    values.push(id);

    const stmt = db.prepare(`
        UPDATE inbox
        SET ${fields.join(', ')}
        WHERE id = ?
    `);

    stmt.run(...values);

    return getInboxItemById(id);
}

/**
 * Delete an inbox item
 * @param {number} id
 * @returns {Promise<boolean>}
 */
async function deleteInboxItem(id) {
    const stmt = db.prepare('DELETE FROM inbox WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
}

/**
 * Get inbox statistics
 * @returns {Promise<Object>}
 */
async function getInboxStats() {
    const stmt = db.prepare(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM inbox
    `);

    return stmt.get();
}

/**
 * Check if an inbox item exists by message timestamp
 * Used for deduplication - checks if a Slack message was already processed
 * @param {string} messageTs - The Slack message timestamp
 * @returns {Object|null} The inbox item if found, null otherwise
 */
function getInboxItemByMessageTs(messageTs) {
    const stmt = db.prepare(`
        SELECT id, status, source_metadata
        FROM inbox
        WHERE json_extract(source_metadata, '$.timestamp') = ?
    `);

    const row = stmt.get(messageTs);

    if (!row) {
        return null;
    }

    return {
        ...row,
        source_metadata: JSON.parse(row.source_metadata || '{}')
    };
}

module.exports = {
    initInboxMigrations,
    addToInbox,
    getPendingInboxItems,
    getInboxItemById,
    getInboxItems,
    approveInboxItem,
    rejectInboxItem,
    updateInboxItem,
    deleteInboxItem,
    getInboxStats,
    getInboxItemByMessageTs
};
