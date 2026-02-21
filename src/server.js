const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const apiRoutes = require('./routes/api');
const slackRoutes = require('./routes/slack');
const grainRoutes = require('./routes/grain');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware for OAuth state
app.use(session({
    secret: process.env.SESSION_SECRET || 'waypoint-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', apiRoutes);
app.use('/api/slack', slackRoutes);
app.use('/api/grain', grainRoutes);

// Root route — serve the v2 frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
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
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });
});

module.exports = app;
