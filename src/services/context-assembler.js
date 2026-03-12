/**
 * Context Assembler — Phase 2
 * Aggregates all data sources into a single structured payload
 * for Claude's system prompt in mobile chat mode.
 */

const actionsDb = require('../database/actions');
const dailyEntriesDb = require('../database/daily-entries');
const calendarDb = require('../database/calendar');

function assembleContext() {
    // Open actions with outcome titles
    const open_todos = actionsDb.getAllOpenActions();

    // Recently completed actions (last 7 days, max 20)
    const completed_todos = actionsDb.getRecentlyCompletedActions(7, 20);

    // Last 10 daily entries (standups + reviews)
    const daily_reviews = dailyEntriesDb.getRecentEntries(10);

    // Calendar events — stub to empty array if table empty or missing
    let calendar = [];
    try {
        calendar = calendarDb.getUpcomingEvents ? calendarDb.getUpcomingEvents(14) : [];
    } catch {
        calendar = [];
    }

    return {
        open_todos,
        completed_todos,
        daily_reviews,
        calendar,
        generated_at: new Date().toISOString(),
    };
}

/**
 * Format the context snapshot as a string for injection into Claude's system prompt.
 */
function formatContextForPrompt(ctx) {
    const lines = [];

    lines.push('=== WAYPOINT CONTEXT SNAPSHOT ===');
    lines.push(`Generated: ${ctx.generated_at}`);
    lines.push('');

    lines.push('--- OPEN TODOS ---');
    if (ctx.open_todos.length === 0) {
        lines.push('(none)');
    } else {
        for (const t of ctx.open_todos) {
            const outcome = t.outcome_title ? ` [${t.outcome_title}]` : '';
            const due = t.due_date ? ` due:${t.due_date}` : '';
            lines.push(`- [${t.id}]${outcome} ${t.title}${due}`);
        }
    }
    lines.push('');

    lines.push('--- RECENTLY COMPLETED (last 7 days) ---');
    if (ctx.completed_todos.length === 0) {
        lines.push('(none)');
    } else {
        for (const t of ctx.completed_todos) {
            const outcome = t.outcome_title ? ` [${t.outcome_title}]` : '';
            lines.push(`- ${outcome} ${t.title} (done: ${t.done_at ? t.done_at.slice(0, 10) : 'unknown'})`);
        }
    }
    lines.push('');

    lines.push('--- DAILY REVIEWS (most recent 10) ---');
    if (ctx.daily_reviews.length === 0) {
        lines.push('(none)');
    } else {
        for (const e of ctx.daily_reviews) {
            lines.push(`[${e.date} ${e.type}]\n${e.content}`);
            lines.push('');
        }
    }

    if (ctx.calendar.length > 0) {
        lines.push('--- UPCOMING CALENDAR EVENTS ---');
        for (const ev of ctx.calendar) {
            lines.push(`- ${ev.start || ev.start_time || ''} ${ev.title || ev.summary || ''}`);
        }
        lines.push('');
    }

    lines.push('=== END CONTEXT ===');
    return lines.join('\n');
}

module.exports = { assembleContext, formatContextForPrompt };
