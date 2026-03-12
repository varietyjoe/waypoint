/**
 * Advisor Service — Phase 4.3
 * Generates weekly retrospectives and proactive flags using Claude.
 * Weekly retrospective fires every Friday at 5:30pm via the Advisor cron.
 */

const db_raw = require('../database/index');
const advisorDb = require('../database/advisor');
const patternsDb = require('../database/patterns');
const userContextDb = require('../database/user-context');
const anthropic_module = require('./claude');

// Use exported anthropic instance if available, otherwise instantiate directly
const anthropic = anthropic_module.anthropic || new (require('@anthropic-ai/sdk'))({ apiKey: process.env.ANTHROPIC_API_KEY });

async function callClaude(prompt, maxTokens = 600) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content.find(b => b.type === 'text')?.text?.trim() || '';
}

function getWeekOf() {
  // Returns the ISO date of the most recent Monday
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = (day === 0) ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

async function generateWeeklyRetrospective() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Outcomes closed this week
  const closedThisWeek = db_raw.prepare(`
    SELECT title, outcome_result, outcome_result_note, archived_at, outcome_tags
    FROM outcomes
    WHERE status = 'archived' AND archived_at > ?
    ORDER BY archived_at DESC
  `).all(sevenDaysAgo);

  // Outcomes that slipped (created > 14 days ago, still active, past deadline)
  const slipped = db_raw.prepare(`
    SELECT title, deadline, outcome_tags
    FROM outcomes
    WHERE status = 'active' AND created_at < datetime('now', '-14 days') AND deadline < date('now')
  `).all();

  // Focus session summary from user_context
  let focusSummary = 'Not available';
  try {
    const sessions = db_raw.prepare(`
      SELECT value, created_at FROM user_context
      WHERE category = 'session_summary' AND created_at > ?
      ORDER BY created_at DESC LIMIT 10
    `).all(sevenDaysAgo);
    focusSummary = sessions.length > 0
      ? `${sessions.length} session(s) this week`
      : 'No Focus sessions this week';
  } catch (_) {}

  // Pattern observations from Phase 3.3
  const patterns = patternsDb.getAllPatterns();
  const patternContext = patterns.length > 0
    ? patterns.map(p => `- ${p.observation} (based on ${p.sample_size} data points)`).join('\n')
    : 'Not enough historical data yet.';

  // User context snapshot
  let contextSnapshot = '';
  try {
    contextSnapshot = userContextDb.getContextSnapshot() || '';
  } catch (_) {}

  const weekOf = getWeekOf();

  const prompt = `Write a weekly retrospective for a personal execution OS user. Follow this exact structure:

Line 1: One sentence summary of what happened this week (e.g. "4 outcomes closed, 11 actions done, 2 Focus sessions.").
Then: 2-3 numbered observations. Each observation should name a pattern, give evidence from the data, and suggest a possible implication — but do not prescribe action. If nothing significant is worth observing, say so in one short line instead of fabricating observations.

Tone: trusted advisor, not performance manager. Never say "you failed." Name patterns, not judgments. Plain text only — no markdown, no bold, no headers.

Data for this week:
Outcomes closed: ${closedThisWeek.length > 0
    ? closedThisWeek.map(o => `"${o.title}" — ${o.outcome_result || 'no result'}`).join(', ')
    : 'none'}
Overdue/slipped outcomes: ${slipped.length > 0 ? slipped.map(o => o.title).join(', ') : 'none'}
Focus sessions: ${focusSummary}

Historical patterns:
${patternContext}
${contextSnapshot ? `\nUser context:\n${contextSnapshot}` : ''}`;

  const summary = await callClaude(prompt, 600);

  advisorDb.saveAdvisorReview({ week_of: weekOf, summary, review_type: 'weekly' });
  console.log('[Advisor] Weekly retrospective generated for week of', weekOf);

  // After weekly retro, check for proactive flags
  await checkProactiveFlags();
}

async function checkProactiveFlags() {
  // Max one proactive flag per week
  if (advisorDb.countProactiveThisWeek() > 0) return;

  const { globalReady } = patternsDb.checkReadiness();
  if (!globalReady) return;

  // Check for threshold-crossing patterns
  // 1. Same category completion rate < 40% with sample >= 8
  const completionPatterns = db_raw.prepare(`
    SELECT category, data_json FROM pattern_observations WHERE pattern_type = 'completion_rate'
  `).all();

  for (const p of completionPatterns) {
    try {
      const data = JSON.parse(p.data_json);
      if (data.rate_pct !== undefined && data.rate_pct < 40 && data.started >= 8) {
        // Low completion rate in this category — worth flagging
        const prompt = `Write one strategic observation (2-3 sentences) for a personal execution OS user about a pattern that needs attention. This is a proactive flag, not a weekly review. Plain text only.

Pattern: "${p.category}" outcomes close only ${data.rate_pct}% of the time (${data.started} outcomes tracked). This is below a healthy threshold. Name the pattern and suggest one possible implication without prescribing specific action.`;

        const summary = await callClaude(prompt, 200);
        advisorDb.saveAdvisorReview({
          week_of: getWeekOf(),
          summary,
          review_type: 'proactive',
        });
        console.log('[Advisor] Proactive flag generated for category:', p.category);
        return; // Only one proactive flag per week
      }
    } catch (_) {}
  }
}

module.exports = { generateWeeklyRetrospective, checkProactiveFlags };
