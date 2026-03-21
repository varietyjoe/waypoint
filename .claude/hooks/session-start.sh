#!/bin/bash
# Waypoint session-start hook
# Checks if today's standup/review is done and notifies Claude if not.

set -euo pipefail

# Read hook input from stdin
input=$(cat)

# Only run on session startup or resume (not on compact/clear)
source=$(echo "$input" | jq -r '.source // "startup"')
if [[ "$source" != "startup" && "$source" != "resume" ]]; then
  exit 0
fi

# Check if Waypoint server is running
if ! curl -sf http://localhost:3000/health >/dev/null 2>&1; then
  exit 0
fi

# Get today's standup/review status
status=$(curl -sf -H "x-api-key: ${WAYPOINT_API_KEY:-}" http://localhost:3000/api/daily-entries/today-status 2>/dev/null || echo '{}')

standup_done=$(echo "$status" | jq -r '.data.standup // false')
review_done=$(echo "$status" | jq -r '.data.review // false')
current_hour=$(date +%H)

if [[ "$standup_done" == "false" ]]; then
  echo "⚡ No standup yet today. Waypoint is waiting. Run /standup to knock it out — I already have your work context loaded." >&2
  exit 2
elif [[ "$review_done" == "false" && "$current_hour" -ge 16 ]]; then
  echo "✅ Standup done. No end-of-day review yet — run /standup when you're ready to wrap up." >&2
  exit 2
fi

exit 0
