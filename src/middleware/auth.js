/**
 * API key authentication middleware for mobile/external access.
 * Checks x-api-key header against WAYPOINT_API_KEY env var.
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 */

const crypto = require('crypto');

function requireApiKey(req, res, next) {
    const provided = req.headers['x-api-key'];
    const expected = process.env.WAYPOINT_API_KEY;

    if (!expected) {
        console.error('❌ WAYPOINT_API_KEY env var not set');
        return res.status(500).json({ error: 'Server misconfiguration' });
    }

    if (!provided) {
        return res.status(401).json({ error: 'Missing x-api-key header' });
    }

    try {
        const providedBuf = Buffer.from(provided);
        const expectedBuf = Buffer.from(expected);

        if (
            providedBuf.length !== expectedBuf.length ||
            !crypto.timingSafeEqual(providedBuf, expectedBuf)
        ) {
            return res.status(401).json({ error: 'Invalid API key' });
        }
    } catch {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
}

module.exports = { requireApiKey };
