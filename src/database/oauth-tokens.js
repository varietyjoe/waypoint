/**
 * OAuth Tokens Database Access Layer
 * Manages encrypted OAuth tokens for Slack and Grain integrations
 */

const db = require('./index');
const crypto = require('../utils/crypto');

/**
 * Store or update OAuth token for a service
 * @param {Object} tokenData
 * @param {string} tokenData.service - 'slack' or 'grain'
 * @param {string} tokenData.access_token - OAuth access token
 * @param {string} tokenData.refresh_token - OAuth refresh token (optional)
 * @param {number} tokenData.expires_at - Unix timestamp when token expires (optional)
 * @param {string} tokenData.workspace_id - Workspace/team identifier
 * @param {string} tokenData.workspace_name - Human-readable workspace name
 * @param {Object} tokenData.scopes - JSON object of granted scopes
 * @returns {Promise<void>}
 */
async function upsertToken(tokenData) {
    const { service, access_token, refresh_token, expires_at, workspace_id, workspace_name, scopes } = tokenData;

    if (!service || !['slack', 'grain'].includes(service)) {
        throw new Error('service must be "slack" or "grain"');
    }

    if (!access_token) {
        throw new Error('access_token is required');
    }

    const encrypted_access = crypto.encrypt(access_token);
    const encrypted_refresh = refresh_token ? crypto.encrypt(refresh_token) : null;

    const stmt = db.prepare(`
        INSERT INTO oauth_tokens (
            service,
            encrypted_access_token,
            encrypted_refresh_token,
            expires_at,
            workspace_id,
            workspace_name,
            scopes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(service) DO UPDATE SET
            encrypted_access_token = excluded.encrypted_access_token,
            encrypted_refresh_token = excluded.encrypted_refresh_token,
            expires_at = excluded.expires_at,
            workspace_id = excluded.workspace_id,
            workspace_name = excluded.workspace_name,
            scopes = excluded.scopes,
            updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(
        service,
        encrypted_access,
        encrypted_refresh,
        expires_at || null,
        workspace_id || null,
        workspace_name || null,
        JSON.stringify(scopes || {})
    );
}

/**
 * Get OAuth token for a service
 * @param {string} service - 'slack' or 'grain'
 * @returns {Promise<Object|null>} Decrypted token data or null if not found
 */
async function getToken(service) {
    if (!service || !['slack', 'grain'].includes(service)) {
        throw new Error('service must be "slack" or "grain"');
    }

    const stmt = db.prepare(`
        SELECT
            service,
            encrypted_access_token,
            encrypted_refresh_token,
            expires_at,
            workspace_id,
            workspace_name,
            scopes,
            created_at,
            updated_at
        FROM oauth_tokens
        WHERE service = ?
    `);

    const row = stmt.get(service);

    if (!row) {
        return null;
    }

    return {
        service: row.service,
        access_token: crypto.decrypt(row.encrypted_access_token),
        refresh_token: row.encrypted_refresh_token ? crypto.decrypt(row.encrypted_refresh_token) : null,
        expires_at: row.expires_at,
        workspace_id: row.workspace_id,
        workspace_name: row.workspace_name,
        scopes: JSON.parse(row.scopes),
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

/**
 * Delete OAuth token for a service
 * @param {string} service - 'slack' or 'grain'
 * @returns {Promise<void>}
 */
async function deleteToken(service) {
    if (!service || !['slack', 'grain'].includes(service)) {
        throw new Error('service must be "slack" or "grain"');
    }

    const stmt = db.prepare('DELETE FROM oauth_tokens WHERE service = ?');
    stmt.run(service);
}

/**
 * Check if a token exists and is not expired
 * @param {string} service - 'slack' or 'grain'
 * @returns {Promise<boolean>}
 */
async function isTokenValid(service) {
    const token = await getToken(service);

    if (!token) {
        return false;
    }

    // If no expiry set, assume valid
    if (!token.expires_at) {
        return true;
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    return token.expires_at > now;
}

module.exports = {
    upsertToken,
    getToken,
    deleteToken,
    isTokenValid
};
