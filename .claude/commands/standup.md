Conduct a contextual standup or review interview with the user and save the result to Waypoint.

## Instructions

### 1. Check if already done

Run:
```bash
curl -s -H "x-api-key: $WAYPOINT_API_KEY" http://localhost:3000/api/daily-entries/today-status
```

- If `standup: true` and `review: true` → tell the user both are done for today and stop.
- If `standup: false` → conduct a standup interview.
- If `standup: true` and `review: false` and it's afternoon/evening → conduct a review interview.
- If both are false, default to standup (user can ask for review explicitly).

If the user invoked this as `/review`, conduct a review regardless.

### 2. Gather work context

Run these in parallel:

```bash
# Today's git commits
git log --since="$(date +%Y-%m-%d) 00:00" --format="%h %s" --stat 2>/dev/null
```

```bash
# Changed files
git diff --name-only HEAD~5 HEAD 2>/dev/null | head -20
```

```bash
# Waypoint open outcomes and actions
curl -s -H "x-api-key: $WAYPOINT_API_KEY" http://localhost:3000/api/outcomes?status=active
```

```bash
# Recently completed actions
curl -s -H "x-api-key: $WAYPOINT_API_KEY" "http://localhost:3000/api/actions?done=true&limit=20"
```

Also read the most recent Claude Code session file (find the latest `.jsonl` in `~/.claude/projects/-home-user-waypoint/` from today) and skim the last 30-40 entries to understand what was worked on this session.

### 3. Conduct the interview

Ask exactly 3 questions, one at a time — wait for the user's answer before moving on.

**Use the gathered context to make your first question specific.** Reference real work:
- If you see commits about "lead score" or a specific bug fix, open with that.
- If completed actions include a specific outcome, ask about how it went.
- Do NOT open with a generic "What did you accomplish?" — that's lazy. Name the thing.

**Standup questions (adapt wording to be specific):**
1. How did [specific thing you see in context] go? / What did you get done since yesterday?
2. What's your focus for today?
3. Any blockers?

**Review questions (adapt wording to be specific):**
1. How did [specific work from context] end up? What actually got done today?
2. What are you carrying into tomorrow?
3. What did you learn, or what would you do differently?

Rules:
- One question at a time. Wait for the answer.
- Short and warm. No coaching, no filler.
- After the 3rd answer, give a brief 1-sentence acknowledgment.

### 4. Save to Waypoint

After all 3 answers, compile the full interview as a readable string and save:

```bash
curl -s -X POST http://localhost:3000/api/daily-entries \
  -H "Content-Type: application/json" \
  -H "x-api-key: $WAYPOINT_API_KEY" \
  -d '{
    "date": "YYYY-MM-DD",
    "type": "standup",
    "content": "Q: [question 1]\nA: [answer 1]\n\nQ: [question 2]\nA: [answer 2]\n\nQ: [question 3]\nA: [answer 3]"
  }'
```

Use today's date in ISO format. Use `type: "review"` if conducting a review.

Confirm to the user that it was saved to Waypoint.
