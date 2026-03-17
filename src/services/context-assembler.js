/**
 * Context Assembler — Phase 2
 * Aggregates all data sources into a single structured payload
 * for Claude's system prompt in mobile chat mode.
 */

const actionsDb = require('../database/actions');
const dailyEntriesDb = require('../database/daily-entries');
const calendarDb = require('../database/calendar');
const outcomesDb = require('../database/outcomes');
const projectsDb = require('../database/projects');

function assembleContext(options = {}) {
    const projectId = options.projectId ? parseInt(options.projectId, 10) : null;
    const selectedProject = projectId ? projectsDb.getProjectById(projectId) : null;

    // Open actions with outcome titles
    const open_todos = actionsDb.getAllOpenActions().filter(t =>
        !projectId || t.outcome_project_id === projectId
    );

    // Recently completed actions (last 7 days, max 20)
    const completed_todos = actionsDb.getRecentlyCompletedActions(7, 20).filter(t =>
        !projectId || t.outcome_project_id === projectId
    );

    // Last 10 daily entries (standups + reviews)
    const daily_reviews = dailyEntriesDb.getRecentEntries(10);

    // Calendar events — stub to empty array if table empty or missing
    let calendar = [];
    try {
        calendar = calendarDb.getUpcomingEvents ? calendarDb.getUpcomingEvents(14) : [];
    } catch {
        calendar = [];
    }

    // Active outcomes with progress computed from their actions
    let outcomes = [];
    try {
        const rawOutcomes = outcomesDb.getAllOutcomes({ status: 'active', project_id: projectId || undefined });
        outcomes = rawOutcomes.map(o => {
            const actions = actionsDb.getActionsByOutcome(o.id);
            const actions_total = actions.length;
            const actions_done  = actions.filter(a => a.done).length;
            const progress_pct  = actions_total > 0 ? Math.round((actions_done / actions_total) * 100) : 0;
            return {
                id:            o.id,
                title:         o.title,
                status:        o.status,
                project_name:  o.project_name,
                deadline:      o.deadline || null,
                priority:      o.priority,
                progress_pct,
                actions_total,
                actions_done,
            };
        });
    } catch {
        outcomes = [];
    }

    return {
        open_todos,
        completed_todos,
        daily_reviews,
        calendar,
        outcomes,
        selected_project: selectedProject
            ? { id: selectedProject.id, name: selectedProject.name, color: selectedProject.color, icon: selectedProject.icon }
            : null,
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
    if (ctx.selected_project) {
        lines.push(`Workspace: Project "${ctx.selected_project.name}"`);
    } else {
        lines.push('Workspace: ALL projects');
    }
    lines.push('');

    lines.push('--- OUTCOMES ---');
    if (!ctx.outcomes || ctx.outcomes.length === 0) {
        lines.push('(none)');
    } else {
        for (const o of ctx.outcomes) {
            const deadline = o.deadline ? `deadline:${o.deadline}` : 'no deadline';
            const projectName = o.project_name ? `${o.project_name} | ` : '';
            lines.push(`- [${o.id}] ${projectName}${o.title} | ${o.status} | ${deadline} | ${o.progress_pct}% (${o.actions_done}/${o.actions_total} done)`);
        }
    }
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
