# Usage Heatmap — GitHub-style Activity Graph

## Summary

A 30-day GitHub-style contribution heatmap on the desktop Analytics tab. Counts actions completed, standup bullets, and review bullets per day and renders them as colored squares with intensity based on total count.

## Motivation

Provide a quick visual "did I show up today?" signal on the Analytics tab. Inspired by GitHub's contribution graph but powered entirely by Waypoint data.

## Data Sources

Three signals, summed into one count per day:

1. **Actions completed** — `actions` table, rows where `done = 1`, grouped by `DATE(done_at)`
2. **Standup bullets** — `daily_entries` where `type = 'standup'`, count content lines starting with `-` or `*` (trimmed)
3. **Review bullets** — `daily_entries` where `type = 'review'`, same bullet-counting logic

## Backend

### New endpoint: `GET /api/analytics/heatmap`

**Auth:** Standard API key (existing middleware).

**Query logic:**
- Compute date range: today minus 29 days through today (30 days inclusive)
- Query 1: `SELECT DATE(done_at) as date, COUNT(*) as count FROM actions WHERE done = 1 AND done_at >= :startDate AND DATE(done_at) <= :endDate GROUP BY DATE(done_at)`
- Query 2: `SELECT date, content FROM daily_entries WHERE date >= :startDate AND date <= :endDate AND type = 'standup'`
- Query 3: `SELECT date, content FROM daily_entries WHERE date >= :startDate AND date <= :endDate AND type = 'review'`
- For queries 2 and 3, count bullet lines per entry — standard markdown bullets: `- text` or `* text` (regex: `/^\s*[-*]\s/`)
- Merge all three into a single `{ [date]: count }` map
- Fill missing days with 0
- `total` is the sum of counts across all 30 days

**Response shape** (follows project convention of `{ success, data }` wrapper):
```json
{
  "success": true,
  "data": {
    "heatmap": {
      "2026-03-16": 5,
      "2026-03-15": 0,
      "2026-03-14": 3
    },
    "total": 47
  }
}
```

### Where to add the endpoint

In `src/routes/api.js`, near the existing `GET /api/analytics` route. The query logic can live inline — it's simple enough that a separate DB module is unnecessary.

## Frontend

### Placement

Top of the Analytics tab, above the existing 4 stat cards. Rendered inside `renderAnalyticsView()` in `public/index.html`.

### Layout

- A single horizontal row of 30 squares, most recent day on the right
- Each square: 14px x 14px, 2px gap, rounded corners (2px border-radius)
- Header line: "Last 30 days" label on the left, total count on the right (e.g., "47 contributions")
- Weekday labels are not needed for a 30-day row

### Color scale

4 intensity levels:

| Count | Color   | Hex       |
|-------|---------|-----------|
| 0     | Gray    | `#ebedf0` |
| 1-2   | Light   | `#9be9a8` |
| 3-5   | Medium  | `#40c463` |
| 6+    | Dark    | `#216e39` |

### Data fetching

`showAnalyticsView()` already fetches `/api/analytics` and `/api/patterns`. Add a parallel fetch to `/api/analytics/heatmap` with a `.catch(() => ({ heatmap: {}, total: 0 }))` fallback so a heatmap failure does not break the Analytics tab. Pass the result as a third argument: `renderAnalyticsView(stats, patterns, heatmapData)`.

### Known limitations

- Dates are UTC-based (`datetime('now')` in SQLite). An action completed at 11 PM local could show as the next day. This is a systemic Waypoint behavior, not specific to the heatmap.
- Color thresholds (0, 1-2, 3-5, 6+) are initial guesses and may need tuning after seeing real data.

## Out of Scope

- Hover tooltips on squares
- Click-to-drill-down per day
- Breakdown by category (actions vs standup vs review)
- New database tables
- Mobile PWA
- Configurable time range

## Files Changed

1. `src/routes/api.js` — new `GET /api/analytics/heatmap` endpoint
2. `public/index.html` — fetch heatmap data in `showAnalyticsView()`, render grid in `renderAnalyticsView()`
