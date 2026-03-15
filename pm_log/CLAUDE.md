# Waypoint — Project Guidance for Claude

## Project Overview

Waypoint is a single-user personal productivity and execution OS. It is a self-hosted Express + SQLite monolith owned and operated by one person (the developer). There is no multi-tenancy, no user accounts, no signup flow. It's a personal tool.

**Stack:**
- **Backend:** Node.js + Express.js (`src/server.js`)
- **Database:** SQLite via `better-sqlite3` (synchronous API — no async/await on DB calls)
- **Frontend:** Vanilla HTML/CSS/JS in `/public` — no build step, no framework
- **AI:** Anthropic Claude API via `@anthropic-ai/sdk`
- **Auth:** Single API key (`WAYPOINT_API_KEY` env var), checked via `x-api-key` header

---

## Key File Map

```
waypoint/
├── src/
│   ├── server.js                  — Express app, middleware, route registration
│   ├── routes/
│   │   ├── api.js                 — All REST API routes (~2300 lines)
│   │   ├── slack.js               — Slack integration routes
│   │   └── grain.js               — Grain meeting notes integration
│   ├── database/
│   │   ├── index.js               — DB init, WAL mode, path from DATABASE_PATH env var
│   │   ├── actions.js             — Action/todo CRUD
│   │   ├── outcomes.js            — Outcome/goal CRUD
│   │   ├── projects.js            — Project grouping
│   │   ├── inbox.js               — Inbox items
│   │   ├── daily-entries.js       — Standup/review journal entries
│   │   ├── user-context.js        — User context memory
│   │   ├── patterns.js            — Execution pattern data
│   │   └── ...                    — (15+ other modules)
│   ├── services/
│   │   ├── claude.js              — Anthropic API calls, chat, tool-use
│   │   ├── context-assembler.js   — Aggregates all data for Claude's system prompt
│   │   ├── briefings.js           — Morning briefing generation
│   │   └── ...
│   ├── middleware/
│   │   └── auth.js                — requireApiKey middleware
│   └── jobs/
│       └── briefings.js           — Scheduled briefing jobs
├── public/
│   ├── index.html                 — Main v2 web frontend (vanilla JS SPA)
│   ├── mobile.html                — Mobile PWA (real data, no phone shell)
│   └── waypoint-mobile-mockup.html — Static UI mockup (reference only)
├── database/
│   └── waypoint.db                — SQLite file (local dev)
├── pm_log/                        — Phase briefs and PM session context
├── .env                           — Local env vars (never commit)
└── Procfile                       — `web: node src/server.js`
```

---

## Coding Conventions

- **Database:** Raw SQL via `better-sqlite3`. All DB modules use synchronous `.prepare().run()` / `.all()` / `.get()`. No ORMs. No async/await on DB calls.
- **Frontend:** Plain HTML + vanilla JS. No React, no Vue, no bundler. CSS custom properties for theming. Inline `<style>` and `<script>` blocks are fine.
- **API routes:** All in `src/routes/api.js` via Express Router. Pattern: try/catch with `next(err)` for errors. Response shape: `{ success: true, data: ... }` or `{ success: false, error: '...' }`.
- **No TypeScript.** No build step. No transpilation.
- **Error handling:** Middleware in `server.js` catches all. Routes use `next(err)`.
- **Env vars:** Loaded via `dotenv` at top of `server.js`. Key vars: `PORT`, `WAYPOINT_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_PATH`, `SESSION_SECRET`, `NODE_ENV`.

---

## API Authentication

All `/api/*` routes require `x-api-key: <WAYPOINT_API_KEY>` header when `WAYPOINT_API_KEY` is set in the environment. In local dev without the env var set, auth is skipped.

The mobile app stores the API key in `localStorage` under the key `waypoint_api_key` and includes it in every fetch call.

---

## Mobile Architecture

- **Route:** `GET /mobile` → serves `/public/mobile.html`
- **No server-side auth** on the `/mobile` route itself — auth is API-key based at the API layer
- **Page:** Full-screen PWA, dark iOS aesthetic, two tabs: Todos + Chat
- **Data flow:**
  1. On load → `GET /api/mobile/context` → returns `{ open_todos, completed_todos, daily_reviews, calendar }`
  2. Checkbox tap → `PATCH /api/actions/:id/toggle`
  3. New todo FAB → `POST /api/actions` with `{ title }`
  4. Chat send → `POST /api/chat` with `{ message, conversationHistory, mode: 'mobile' }`
- **PWA:** `apple-mobile-web-app-capable`, `theme-color: #0a0a0a` meta tags make it installable from Safari

---

## Railway Deployment

Railway is configured and ready. Key things to know:

1. **Procfile** is `web: node src/server.js` — Railway uses this
2. **GitHub Actions** at `.github/workflows/railway.yml` triggers on push to `main`
3. **Required env vars** in Railway dashboard:
   - `NODE_ENV=production`
   - `WAYPOINT_API_KEY=<your key>`
   - `ANTHROPIC_API_KEY=<your Anthropic key>`
   - `DATABASE_PATH=/app/database/waypoint.db`
   - `SESSION_SECRET=<random string>`
4. **Volume:** Mount a Railway volume at `/app/database` for SQLite persistence between deploys
5. **GitHub secret:** Set `RAILWAY_WEBHOOK_URL` (from Railway → Service → Settings → Deploy webhook)

### Seeding data on Railway

The local SQLite DB can't be copied directly. Two options:

**Option A (clean start):** Use the Waypoint UI after deploy to re-enter outcomes and actions.

**Option B (import local DB):**
```bash
# Dump local DB
sqlite3 database/waypoint.db .dump > dump.sql

# Import via Railway CLI
railway run sqlite3 /app/database/waypoint.db < dump.sql
```

---

## Key API Endpoints (reference)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/mobile/context` | Full context snapshot for mobile |
| POST | `/api/chat` | Chat with Claude (pass `mode: 'mobile'` for context injection) |
| GET | `/api/outcomes` | List all outcomes with actions |
| POST | `/api/actions` | Create new action (`{ title }` required) |
| PATCH | `/api/actions/:id/toggle` | Toggle action done/undone |
| PUT | `/api/actions/:id` | Update action fields |
| DELETE | `/api/actions/:id` | Delete action |
| GET | `/health` | Health check (no auth) |
