# Slack & Grain Integration Setup Guide

## 🎉 What's Been Built

Your Waypoint app now has **real-time integrations** with Slack and Grain:

### Core Features
- ✅ **Slack Integration**: Monitor channels, auto-triage messages
- ✅ **Grain Integration**: Auto-triage meeting recordings with transcripts
- ✅ **Triage Queue**: Review incoming items in Command Palette (⌘K)
- ✅ **Encrypted Storage**: OAuth tokens encrypted at rest
- ✅ **Webhook Support**: Real-time updates (no polling)

### Database Schema
- `triage_queue` - Incoming items awaiting review
- `oauth_tokens` - Encrypted OAuth credentials
- `monitored_channels` - Slack channels being monitored
- `tasks` - Extended with `source_type`, `source_id`, `source_url`

## 🚀 Setup Instructions

### 1. Slack Setup

#### Create Slack App
1. Go to https://api.slack.com/apps
2. Click **Create New App** → **From scratch**
3. Name: "Waypoint" | Select your workspace
4. Click **Create App**

#### Configure OAuth & Permissions
1. Navigate to **OAuth & Permissions** in sidebar
2. Scroll to **Redirect URLs**
3. Add: `http://localhost:3000/api/slack/callback`
4. Scroll to **Scopes** → **Bot Token Scopes**
5. Add these scopes:
   - `channels:history`
   - `channels:read`
   - `groups:history`
   - `groups:read`
   - `chat:write`
   - `users:read`
6. Click **Save Changes**

#### Enable Event Subscriptions
1. Navigate to **Event Subscriptions** in sidebar
2. Toggle **Enable Events** to ON
3. Set **Request URL**: `http://localhost:3000/api/slack/webhook`
   - ⚠️ For local dev, use **ngrok** or **localtunnel** to expose localhost
4. Scroll to **Subscribe to bot events**
5. Add: `message.channels` and `message.groups`
6. Click **Save Changes**

#### Get Credentials
1. Navigate to **Basic Information**
2. Copy **Client ID** and **Client Secret**
3. Update `.env`:
```bash
SLACK_CLIENT_ID=your_client_id_here
SLACK_CLIENT_SECRET=your_client_secret_here
```

#### Install App to Workspace
1. Navigate to **Install App**
2. Click **Install to Workspace**
3. Review permissions and click **Allow**

### 2. Grain Setup

#### Get Grain API Credentials
1. Contact Grain support or check their developer portal
2. Request OAuth credentials for your app
3. Update `.env`:
```bash
GRAIN_CLIENT_ID=your_grain_client_id
GRAIN_CLIENT_SECRET=your_grain_client_secret
```

#### Register Webhook
1. Start your server: `npm start`
2. Visit: http://localhost:3000
3. Connect Grain through settings (TBD - UI coming)
4. POST to `/api/grain/webhook/register` to register webhook
   - Or use Grain's dashboard to manually add: `http://your-domain.com/api/grain/webhook`

### 3. Environment Variables

Your `.env` should contain:
```bash
PORT=3000
ANTHROPIC_API_KEY=your_key_here

# OAuth Token Encryption (32-byte hex key)
ENCRYPTION_KEY=66c7f5366476c840b70c64d236af5026dd310fbfe395b376640059fcfdd17260

# Session Secret
SESSION_SECRET=waypoint-session-secret-change-in-production

# Slack OAuth
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret

# Grain OAuth
GRAIN_CLIENT_ID=your_grain_client_id
GRAIN_CLIENT_SECRET=your_grain_client_secret
```

⚠️ **IMPORTANT**: Change `SESSION_SECRET` in production!

### 4. Database Migration

Already applied! Your database now includes:
- `triage_queue` table
- `oauth_tokens` table
- `monitored_channels` table
- Updated `tasks` table with source tracking

## 📖 How to Use

### Connecting Slack
1. Visit: http://localhost:3000/api/slack/authorize
2. Authorize the app in Slack
3. You'll be redirected back with success message

### Monitoring Slack Channels
```bash
# Get list of available channels
GET http://localhost:3000/api/slack/channels

# Start monitoring a channel
POST http://localhost:3000/api/slack/channels/C12345678/monitor
Body: { "channelName": "general" }

# Stop monitoring a channel
DELETE http://localhost:3000/api/slack/channels/C12345678/monitor
```

### Connecting Grain
1. Visit: http://localhost:3000/api/grain/authorize
2. Authorize the app in Grain
3. Register webhook: `POST /api/grain/webhook/register`

### Using the Triage Queue
1. Press **⌘K** (Command+K) to open Command Palette
2. See incoming Slack messages and Grain recordings at the top
3. Click items to:
   - **Create Task** - Convert to a task with source tracking
   - **View Source** - Open in Slack/Grain
   - **Dismiss** - Remove from queue

### API Endpoints

#### Triage Queue
- `GET /api/triage/queue` - Get all triage items
- `GET /api/triage/:id` - Get specific item
- `DELETE /api/triage/:id` - Dismiss item

#### Slack
- `GET /api/slack/authorize` - Start OAuth
- `GET /api/slack/callback` - OAuth callback
- `POST /api/slack/webhook` - Receive events
- `GET /api/slack/channels` - List channels
- `POST /api/slack/channels/:id/monitor` - Monitor channel
- `DELETE /api/slack/channels/:id/monitor` - Unmonitor
- `GET /api/slack/status` - Connection status
- `DELETE /api/slack/disconnect` - Disconnect

#### Grain
- `GET /api/grain/authorize` - Start OAuth
- `GET /api/grain/callback` - OAuth callback
- `POST /api/grain/webhook` - Receive events
- `POST /api/grain/webhook/register` - Register webhook
- `GET /api/grain/status` - Connection status
- `DELETE /api/grain/disconnect` - Disconnect

## 🔐 Security Features

1. **Encrypted Tokens**: OAuth tokens encrypted using AES-256-GCM
2. **Session Security**: OAuth state verification to prevent CSRF
3. **Environment Isolation**: All secrets in `.env`, not committed
4. **Secure Storage**: better-sqlite3 with WAL mode

## 🐛 Troubleshooting

### Slack Webhook Not Receiving Events
- Make sure you exposed localhost via ngrok/localtunnel
- Verify Request URL in Slack app settings shows ✅ verified
- Check server logs for incoming requests

### OAuth Flow Fails
- Verify Client ID and Secret in `.env`
- Check redirect URIs match exactly (including http/https)
- Clear browser cookies and try again

### Triage Queue Empty
- Verify channels are being monitored: `GET /api/slack/channels`
- Check webhook is receiving events (see server logs)
- Ensure OAuth token is valid: `GET /api/slack/status`

## 🎯 Next Steps

### UI Polish (Recommended)
- Add Settings page with integration status
- Add button to connect Slack/Grain from UI
- Show monitored channels in settings
- Add visual indicators for source type in task list

### Claude Integration (Recommended)
- Update Claude service to handle triage items
- Add tools for creating tasks from triage
- Smart auto-categorization of incoming items

### Advanced Features
- Message threading (reply to Slack from Waypoint)
- Auto-tagging based on content
- Smart notifications
- Meeting highlights extraction from Grain

## 📁 Files Created

### Backend
- `src/database/index.js` - better-sqlite3 connection
- `src/database/triage.js` - Triage queue layer
- `src/database/oauth-tokens.js` - OAuth token management
- `src/database/monitored-channels.js` - Channel monitoring
- `src/utils/crypto.js` - Encryption utilities
- `src/routes/slack.js` - Slack routes
- `src/routes/grain.js` - Grain routes
- `src/integrations/slack-client.js` - Slack API client
- `src/integrations/grain-client.js` - Grain API client
- `database/migrations/001_add_integrations.sql` - Schema

### Frontend
- Updated `public/index.html`:
  - Triage section in Command Palette
  - JavaScript functions for triage handling
  - Styles for triage items

### Updated
- `src/server.js` - Added routes and session middleware
- `src/routes/api.js` - Added triage endpoints
- `src/database/tasks.js` - Added source tracking
- `.env` - Added new environment variables

---

## 🎊 You're All Set!

Your Waypoint is now a **triage powerhouse**! Messages from Slack and recordings from Grain will flow into your Command Palette, ready to be converted into actionable tasks.

Need help? Check the troubleshooting section or review the code comments.
