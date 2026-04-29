// Catch any crash during startup — must be first
process.on('uncaughtException', (err) => {
  console.error('FATAL UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
  process.exit(1);
});
const path = require('path');

require('./config/env').loadEnv();

console.log('--- Waypoint process starting ---');
console.log('Node:', process.version, '| Platform:', process.platform, process.arch);
console.log('DATABASE_PATH:', process.env.DATABASE_PATH || '(not set)');
console.log('PORT:', process.env.PORT || '(not set, will default to 3000)');

const express = require('express');
console.log('Express loaded:', require('express/package.json').version);
const session = require('express-session');
const cors = require('cors');
const db = require('./database/index');
const { initDatabase } = require('./database/bootstrap');

console.log('Initializing database...');
initDatabase();
console.log('Database initialized');

console.log('Loading routes...');
const apiRoutes = require('./routes/api');
console.log('API routes loaded');
const slackRoutes = require('./routes/slack');
const grainRoutes = require('./routes/grain');
const { scheduleBriefings } = require('./jobs/briefings');
const sharesDb = require('./database/shares');
const outcomesDb = require('./database/outcomes');
const actionsDb = require('./database/actions');
const { requireApiKey } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// CORS — allow configured origin + local dev
const allowedOrigins = [
    process.env.ALLOWED_ORIGIN,
    /^http:\/\/localhost(:\d+)?$/,
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (native mobile, curl, etc.)
        if (!origin) return callback(null, true);
        const allowed = allowedOrigins.some(o =>
            o instanceof RegExp ? o.test(origin) : o === origin
        );
        callback(allowed ? null : new Error('Not allowed by CORS'), allowed);
    },
    credentials: true,
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware for OAuth state
app.use(session({
    secret: process.env.SESSION_SECRET || 'waypoint-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
    }
}));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// ─── HEALTH CHECK — no auth ────────────────────────────────────────────────
app.get('/health', (req, res) => {
    try {
        db.prepare('SELECT 1').get();
        res.json({
            status: 'ok',
            database: 'ok',
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(503).json({
            status: 'error',
            database: 'unavailable',
            error: err.message,
            timestamp: new Date().toISOString(),
        });
    }
});

// ─── API KEY AUTH for /api/* ────────────────────────────────────────────────
// Only enforce when WAYPOINT_API_KEY is set (skips in local dev without key)
if (process.env.WAYPOINT_API_KEY) {
    app.use('/api', requireApiKey);
}

// ─── PUBLIC SHARE ROUTE — no auth ──────────────────────────────────────────
app.get('/s/:token', (req, res) => {
    const share = sharesDb.getShareByToken(req.params.token);

    const inactivePage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link no longer active</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f9fafb; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px;
            padding: 40px 48px; text-align: center; max-width: 380px; }
    h2 { font-size: 16px; font-weight: 600; color: #111827; margin: 0 0 8px; }
    p  { font-size: 13px; color: #6b7280; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h2>This link is no longer active.</h2>
    <p>The status update you were looking for has been revoked or expired.</p>
  </div>
</body>
</html>`;

    if (!share || share.revoked === 1) {
        return res.status(410).send(inactivePage);
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
        return res.status(410).send(inactivePage);
    }

    // Fetch outcome + action stats
    const outcome = outcomesDb.getOutcomeById(share.outcome_id);
    if (!outcome) return res.status(410).send(inactivePage);

    const actions = actionsDb.getActionsByOutcome(share.outcome_id);
    const totalActions = actions.length;
    const doneActions  = actions.filter(a => a.done).length;
    const pct          = totalActions > 0 ? Math.round((doneActions / totalActions) * 100) : 0;
    const filledBars   = Math.round(pct / 10);
    const progressBar  = '█'.repeat(filledBars) + '░'.repeat(10 - filledBars);

    const escHtml = s => String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    let statusHtml = '';
    if (outcome.status === 'archived') {
        const closedDate = outcome.archived_at
            ? new Date(outcome.archived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '—';
        const resultLabel = outcome.outcome_result === 'hit' ? 'Hit it' : outcome.outcome_result === 'miss' ? "Didn't land" : 'Closed';
        statusHtml = `
      <div class="row"><span class="label">Status</span><span class="value closed">Closed &middot; ${escHtml(resultLabel)}</span></div>
      <div class="row"><span class="label">Closed</span><span class="value">${escHtml(closedDate)}</span></div>
      ${outcome.outcome_result_note ? `<div class="row"><span class="label">Result</span><span class="value">${escHtml(outcome.outcome_result_note)}</span></div>` : ''}
    `;
    } else {
        const dueDisplay = outcome.deadline
            ? new Date(outcome.deadline + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
            : '—';
        const updatedDisplay = outcome.updated_at
            ? new Date(outcome.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            : '—';
        statusHtml = `
      <div class="row"><span class="label">Status</span><span class="value active">In progress</span></div>
      <div class="row"><span class="label">Due</span><span class="value">${escHtml(dueDisplay)}</span></div>
      <div class="row progress-row">
        <span class="label">Progress</span>
        <span class="value progress-val">
          <span class="prog-bar">${progressBar}</span>
          <span class="prog-count">${doneActions} of ${totalActions} done</span>
        </span>
      </div>
      <div class="row"><span class="label">Last updated</span><span class="value">${escHtml(updatedDisplay)}</span></div>
    `;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(outcome.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f9fafb; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px;
            padding: 32px 36px; max-width: 440px; width: 100%; }
    .title { font-size: 18px; font-weight: 700; color: #111827; margin: 0 0 20px; line-height: 1.3; }
    .row   { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; font-size: 13px; }
    .label { color: #9ca3af; min-width: 90px; font-size: 11px; text-transform: uppercase;
             letter-spacing: 0.05em; font-weight: 600; flex-shrink: 0; }
    .value { color: #111827; }
    .value.active { color: #2563eb; font-weight: 600; }
    .value.closed { color: #059669; font-weight: 600; }
    .progress-row { align-items: center; }
    .progress-val { display: flex; align-items: center; gap: 10px; }
    .prog-bar  { font-family: monospace; font-size: 13px; color: #374151; letter-spacing: 1px; }
    .prog-count { color: #6b7280; font-size: 11px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">${escHtml(outcome.title)}</div>
    ${statusHtml}
  </div>
</body>
</html>`;

    res.send(html);
});

// API routes
app.use('/api', apiRoutes);
app.use('/api/slack', slackRoutes);
app.use('/api/grain', grainRoutes);

// Root route — serve the v2 frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Mobile PWA
app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/mobile.html'));
});


// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.path}`
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Error caught by middleware:', err.message);
    console.error('Error stack:', err.stack);
    console.error('Error status:', err.status);
    console.error('Error type:', err.constructor.name);

    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start server
console.log('🔧 Starting Waypoint server...');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Port:', PORT);

const server = app.listen(PORT, () => {
    console.log(`🚀 Waypoint server running on http://localhost:${PORT}`);
    console.log(`📁 Serving static files from: ${path.join(__dirname, '../public')}`);
    console.log(`🔌 API endpoints available at: http://localhost:${PORT}/api`);
    console.log('✅ Server started successfully');
    if (process.env.NODE_ENV !== 'test') {
        scheduleBriefings();
    }
});

// Handle graceful shutdown — flush SQLite WAL before exit

// Periodic WAL checkpoint every 5 min — safety net against SIGKILL
const walCheckpointInterval = setInterval(() => {
    try {
        db.pragma('wal_checkpoint(PASSIVE)');
    } catch (e) {
        console.error('Periodic WAL checkpoint failed:', e.message);
    }
}, 5 * 60 * 1000);
walCheckpointInterval.unref();

function gracefulShutdown(signal) {
    console.log(`${signal} received: shutting down gracefully`);
    clearInterval(walCheckpointInterval);
    server.close(() => {
        console.log('HTTP server closed');
        try {
            db.pragma('wal_checkpoint(TRUNCATE)');
            console.log('SQLite WAL checkpointed');
            db.close();
            console.log('SQLite connection closed');
        } catch (e) {
            console.error('DB shutdown error:', e.message);
        }
        process.exit(0);
    });
    // Force exit after 5s if graceful shutdown stalls
    const forceTimer = setTimeout(() => {
        console.error('Forced shutdown after timeout');
        try { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); } catch (_) {}
        process.exit(1);
    }, 5000);
    forceTimer.unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
