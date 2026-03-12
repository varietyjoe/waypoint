/**
 * Pattern Engine — Phase 3.3
 * Computes pattern observations from historical outcome and action data.
 * Observations are stored in pattern_observations for fast retrieval.
 */

const db_raw = require('../database/index');
const patternsDb = require('../database/patterns');

// Check if anthropic is exported from claude.js; if not, instantiate directly
let anthropic;
try {
  const claudeModule = require('./claude');
  anthropic = claudeModule.anthropic || null;
} catch {}

if (!anthropic) {
  const Anthropic = require('@anthropic-ai/sdk');
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function generateObservation(prompt) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content.find(b => b.type === 'text')?.text?.trim() || '';
}

async function computePatterns() {
  const { globalReady, categoryCounts } = patternsDb.checkReadiness();
  if (!globalReady) {
    console.log('[PatternEngine] Not enough data yet (< 20 closed outcomes)');
    return;
  }

  // 1. Time Estimation Accuracy (global)
  const timeData = db_raw.prepare(`
    SELECT a.time_estimate, a.started_at, a.ended_at
    FROM actions a
    WHERE a.done = 1 AND a.started_at IS NOT NULL AND a.ended_at IS NOT NULL AND a.time_estimate IS NOT NULL
  `).all();

  if (timeData.length >= 5) {
    const accuracies = timeData.map(a => {
      const actual = (new Date(a.ended_at) - new Date(a.started_at)) / 60000;
      return Math.abs(actual - a.time_estimate) / a.time_estimate;
    });
    const avgAccuracy = Math.round((1 - accuracies.reduce((s, v) => s + v, 0) / accuracies.length) * 100);

    const obs = await generateObservation(
      `In one sentence, describe this time estimation pattern for a personal execution OS: ${avgAccuracy}% accuracy based on ${timeData.length} completed tasks. Sample sentence: "Your time estimates are ${avgAccuracy}% accurate on average across ${timeData.length} timed tasks." Plain text, no markdown.`
    );
    patternsDb.savePatternObservation({
      pattern_type: 'time_accuracy',
      category: null,
      observation: obs,
      sample_size: timeData.length,
      data_json: { accuracy_pct: avgAccuracy },
    });
  }

  // 2. Completion Rate by Category
  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count < 8) continue;

    const closed = db_raw.prepare(`
      SELECT COUNT(*) as count FROM outcomes WHERE status = 'archived' AND outcome_tags LIKE ?
    `).get(`%"${category}"%`).count;

    const started = db_raw.prepare(`
      SELECT COUNT(*) as count FROM outcomes WHERE outcome_tags LIKE ?
    `).get(`%"${category}"%`).count;

    if (started < 8) continue;
    const rate = Math.round((closed / started) * 100);

    const obs = await generateObservation(
      `One sentence about this outcome category performance for a personal execution OS: "${category}" outcomes close ${rate}% of the time (${closed} of ${started}). Reference both the category name and rate. Plain text only.`
    );
    patternsDb.savePatternObservation({
      pattern_type: 'completion_rate',
      category,
      observation: obs,
      sample_size: started,
      data_json: { rate_pct: rate, closed, started },
    });
  }

  // 3. Action Count vs Completion
  const actionCountData = db_raw.prepare(`
    SELECT o.id, o.outcome_result, COUNT(a.id) as action_count
    FROM outcomes o
    LEFT JOIN actions a ON a.outcome_id = o.id
    WHERE o.status = 'archived'
    GROUP BY o.id
  `).all();

  if (actionCountData.length >= 10) {
    const highAction = actionCountData.filter(o => o.action_count >= 4);
    const highActionClose = highAction.filter(o => o.outcome_result === 'hit').length;
    const highActionRate = highAction.length > 0 ? Math.round((highActionClose / highAction.length) * 100) : null;

    if (highActionRate !== null && highAction.length >= 8) {
      const obs = await generateObservation(
        `One sentence about this pattern: outcomes with 4 or more actions close at ${highActionRate}% (based on ${highAction.length} outcomes). Useful for warning when a new outcome has too many actions. Plain text only.`
      );
      patternsDb.savePatternObservation({
        pattern_type: 'action_count',
        category: null,
        observation: obs,
        sample_size: highAction.length,
        data_json: { threshold: 4, close_rate_pct: highActionRate },
      });
    }
  }

  console.log('[PatternEngine] Patterns recomputed');
}

module.exports = { computePatterns };
