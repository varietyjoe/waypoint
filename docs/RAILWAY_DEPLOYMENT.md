# Railway Deployment

Waypoint runs as one long-lived Express process with a SQLite database on a
Railway volume.

## Service

Railway should use the checked-in `Dockerfile`. The checked-in
`railway.json` pins the builder to Dockerfile mode and configures `/health` as
the deploy healthcheck.

Required service variables:

```text
NODE_ENV=production
WAYPOINT_API_KEY=<long random key>
ANTHROPIC_API_KEY=<Anthropic key>
SESSION_SECRET=<long random string>
DATABASE_PATH=/app/database/waypoint.db
```

Optional integration variables:

```text
ALLOWED_ORIGIN=<browser origin that may call the API>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
GRAIN_CLIENT_ID=
GRAIN_CLIENT_SECRET=
HUBSPOT_ACCESS_TOKEN=
HUBSPOT_OWNER_ID=
ENCRYPTION_KEY=
```

## Volume

Mount a Railway volume at:

```text
/app/database
```

The app defaults `DATABASE_PATH` to `/app/database/waypoint.db` in Docker, and
startup creates the directory, initializes tables, and seeds an empty database.

## Deploy Behavior

`/health` returns `200` only after the process can query SQLite. That keeps a
bad database mount or unreadable volume from being promoted as a healthy
deployment.

OAuth routes use secure cookies in production, so the Express app enables
`trust proxy` under `NODE_ENV=production` for Railway's HTTPS proxy.
