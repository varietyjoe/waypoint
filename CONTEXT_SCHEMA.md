# Waypoint Mobile Context Schema

`GET /api/mobile/context` returns the following JSON payload. This endpoint requires the `x-api-key` header.

## Response Shape

```json
{
  "success": true,
  "data": {
    "open_todos": [TodoItem],
    "completed_todos": [TodoItem],
    "daily_reviews": [DailyEntry],
    "calendar": [CalendarEvent],
    "generated_at": "2026-03-12T10:00:00.000Z"
  }
}
```

## TodoItem

```json
{
  "id": 42,
  "outcome_id": 7,
  "outcome_title": "Launch Q1 product update",
  "title": "Write release notes",
  "time_estimate": 30,
  "energy_type": "deep",
  "action_type": "standard",
  "done": 0,
  "done_at": null,
  "blocked": 0,
  "blocked_by": null,
  "position": 2,
  "snoozed_until": null,
  "created_at": "2026-03-01T09:00:00",
  "updated_at": "2026-03-10T14:30:00"
}
```

`completed_todos` have `done: 1` and a non-null `done_at`, limited to the last 7 days (max 20).

## DailyEntry

```json
{
  "id": 15,
  "date": "2026-03-12",
  "type": "standup",
  "content": "Today I'm focusing on...",
  "created_at": "2026-03-12T09:00:00",
  "updated_at": "2026-03-12T09:00:00"
}
```

`type` is either `"standup"` or `"review"`. Returns the 10 most recent entries ordered by date DESC.

## CalendarEvent

```json
{
  "id": 3,
  "title": "1:1 with Sam",
  "start_time": "2026-03-13T14:00:00",
  "end_time": "2026-03-13T14:30:00",
  "calendar_id": "primary"
}
```

Returns events from today through the next 14 days. Returns `[]` if Google Calendar is not connected.

## Mobile Chat

`POST /api/chat` with `"mode": "mobile"` injects the full context snapshot into Claude's system prompt before calling the Anthropic API. The system prompt prefix is:

> "You are JT's personal assistant with full context of his work at Alignable."

followed by the formatted context snapshot.

## Authentication

All `/api/*` routes require:
```
x-api-key: <WAYPOINT_API_KEY>
```

Returns `401` if the header is missing or invalid.
