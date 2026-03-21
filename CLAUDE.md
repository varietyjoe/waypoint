# Waypoint — Claude Code Instructions

## Session Start: Standup Check

At the start of every session (when `source` is `startup` or `resume`), do the following **before anything else**:

1. Check if today's standup has been completed:
   ```
   curl -s -H "x-api-key: $WAYPOINT_API_KEY" http://localhost:3000/api/daily-entries/today-status
   ```

2. If the server isn't running or returns an error, skip this check silently.

3. If `standup: false` → say:
   > "You haven't done your standup yet today. Want to do it now? I can see what you've been working on and make it quick. Just say **yes** or **/standup**."

4. If `standup: true` and `review: false` and local time is past 4pm → say:
   > "Standup is done — nice. You haven't done your end-of-day review yet. Want to knock it out? **/standup** (or just say yes)."

5. If both are done → no message needed. Proceed normally.

6. If the user says yes or invokes `/standup`, run the standup/review interview using the `/standup` command instructions.

## Project Context

Waypoint is a personal execution OS. The stack:
- Backend: Node.js + Express, SQLite via better-sqlite3 (synchronous — no async/await for DB calls)
- Frontend: Vanilla HTML/CSS/JS (no build step)
- AI: Anthropic Claude API
- Entry point: `src/server.js`
- Routes: `src/routes/api.js` (~2600 lines)
- Services: `src/services/` (claude.js, context-assembler.js, standup-context.js, etc.)
- Database modules: `src/database/` (one file per table)

## Key Conventions

- DB functions are synchronous (better-sqlite3). Never add `await` to DB calls.
- API responses: `{ success: true, data: ... }` or `{ success: false, error: '...' }`
- Auth: `x-api-key` header with `WAYPOINT_API_KEY`
- No ORMs. Raw SQL via better-sqlite3 prepared statements.
- One `router.get/post/put/delete` per endpoint, try/catch with `next(err)`.
