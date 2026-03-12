/**
 * Briefings Service — Phase 3.1
 * Generates Morning Brief, Midday Pulse, and EOD Wrap via Claude.
 * All three return plain text strings ready for Slack DM delivery.
 */

const Anthropic = require('@anthropic-ai/sdk');
const outcomesDb = require('../database/outcomes');
const actionsDb = require('../database/actions');
const calendarDb = require('../database/calendar');
const userContextDb = require('../database/user-context');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Helper: call Claude for plain-text briefing content
async function callClaude(prompt) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content.find(b => b.type === 'text')?.text?.trim() || '';
}

async function generateMorningBrief() {
  const today = new Date().toISOString().slice(0, 10);
  const outcomes = outcomesDb.getAllOutcomes({ status: 'active' });
  const calendarEvents = calendarDb.getEventsForDate(today);
  const plan = calendarDb.getTodayPlan(today);
  const contextSnapshot = userContextDb.getContextSnapshot();

  // Inbox count — gracefully handle if inbox is unavailable
  let inboxCount = 0;
  try {
    const inboxDb = require('../database/inbox');
    const items = inboxDb.getPendingInboxItems();
    // getPendingInboxItems may be async in some versions
    if (items && typeof items.then === 'function') {
      inboxCount = (await items).length;
    } else if (Array.isArray(items)) {
      inboxCount = items.length;
    }
  } catch (e) { /* inbox may be empty or unavailable */ }

  const deadlineFlags = outcomes
    .filter(o => o.deadline)
    .map(o => `${o.title} (due ${o.deadline})`)
    .join(', ');

  const eventList = calendarEvents.length > 0
    ? calendarEvents.map(e => {
        const time = new Date(e.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${e.title} at ${time}`;
      }).join(', ')
    : 'no calendar events';

  const prompt = `Write a morning brief for a personal execution OS user. 4–6 lines max. Plain text, no markdown, no bullet points. Conversational but sharp. Surface the 1–2 most important things. End with something that makes the user want to open the app to plan their day. Do not list every outcome. Do not mention things with no urgency.

Active outcomes: ${outcomes.map(o => o.title).join(', ') || 'none'}
Deadline urgency: ${deadlineFlags || 'none'}
Calendar today: ${eventList}
Inbox items waiting for triage: ${inboxCount}
${contextSnapshot ? `\nUser context:\n${contextSnapshot}` : ''}`;

  return callClaude(prompt);
}

async function generateMiddayPulse() {
  const today = new Date().toISOString().slice(0, 10);
  const plan = calendarDb.getTodayPlan(today);

  if (!plan || !plan.confirmed_at) {
    return 'Midday check — no plan confirmed yet today. Head to Waypoint to set one.';
  }

  const committedIds = JSON.parse(plan.committed_action_ids || '[]');
  const completedIds = JSON.parse(plan.actual_completed_action_ids || '[]');
  const remaining = committedIds.length - completedIds.length;

  const prompt = `Write a midday pulse message for a personal execution OS. 2–3 lines. Plain text, no markdown. Assess whether the user is on pace, name what's done and what remains. Tone: direct, not cheerleader-y.

Tasks committed today: ${committedIds.length}
Tasks completed so far: ${completedIds.length}
Tasks remaining: ${remaining}`;

  return callClaude(prompt);
}

async function generateEODWrap() {
  const today = new Date().toISOString().slice(0, 10);
  const plan = calendarDb.getTodayPlan(today);

  if (!plan) {
    return 'End of day — no plan was set today. Tomorrow, try confirming a plan in the morning.';
  }

  const committedIds = JSON.parse(plan.committed_action_ids || '[]');
  const completedIds = JSON.parse(plan.actual_completed_action_ids || '[]');
  const notDone = committedIds.filter(id => !completedIds.includes(id));

  // Get tomorrow's calendar at a glance
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const tomorrowEvents = calendarDb.getEventsForDate(tomorrowStr);

  const prompt = `Write an end-of-day wrap for a personal execution OS. 3–4 lines. Plain text, no markdown. Acknowledge what was completed, note what carries to tomorrow, give a brief preview of tomorrow. Tone: like a trusted colleague, not a performance manager.

Done today: ${completedIds.length} of ${committedIds.length} tasks
Carrying forward: ${notDone.length} task(s)
Tomorrow: ${tomorrowEvents.length > 0 ? tomorrowEvents.map(e => e.title).join(', ') : 'no events yet'}`;

  return callClaude(prompt);
}

module.exports = { generateMorningBrief, generateMiddayPulse, generateEODWrap };
