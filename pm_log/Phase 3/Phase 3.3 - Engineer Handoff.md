# Phase 3.3 — Engineer Handoff

## Agent Prompt

You are building Phase 3.3 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase adds Pattern Memory — proactive pattern surfacing during AI Breakdown, Inbox Triage, and Focus Mode — and an Execution Analytics view showing estimate accuracy, completion rate, results rate, and category breakdowns in a 2×2 card grid. Read `pm_log/Phase 3/Phase 3.3 - Engineer Handoff.md` in full before writing any code, then use `dev_tracker/Phase 3.3 - Pattern Memory & Analytics.md` as your working checklist. Mark items complete as you finish them.

---

You are building Phase 3.3 of Waypoint — a single-user personal execution OS at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 3/Phase 3.3 - Pattern Memory & Execution Analytics.md` — full phase spec
2. `dev_tracker/Phase 3.3 - Pattern Memory & Analytics.md` — your working checklist
3. `src/database/outcomes.js` — understand how outcomes are fetched; you'll add `outcome_tags` column
4. `src/database/actions.js` — understand actions schema; you'll add `started_at` + `ended_at` columns
5. `src/routes/api.js` — find AI Breakdown, Inbox Triage, and Focus Mode routes; pattern injection is added there
6. `src/services/claude.js` — understand existing Claude call patterns; you'll add `computePatterns` and `autoTagOutcome`

**Prerequisites:** Phase 3.2 complete and approved. ✅

---

## Known Codebase State

- **Readiness gates:** Patterns must NOT surface until ≥20 closed outcomes globally and ≥8 per category. Enforce in `checkReadiness()`.
- **Pattern observations:** Pre-computed and stored in `pattern_observations` table; not computed live per request.
- **Recompute trigger:** On every outcome archive AND weekly cron job (Friday midnight or Saturday 12:01am).
- **Model ID:** `claude-sonnet-4-6`
- **Analytics view:** 2×2 card grid. Reference `public/waypoint-vision.html` Screen 11.

---

## Pre-Build Checklist

- [ ] Read `src/database/outcomes.js` — find `archiveOutcome()` or equivalent; you'll call pattern recompute here
- [ ] Read `src/routes/api.js` — find the AI Breakdown route (Phase 2.3), the Inbox Triage route (Phase 2.4), and the Focus Mode route (Phase 2.1); understand where to inject pattern context
- [ ] Read `src/database/actions.js` — confirm `started_at` / `ended_at` don't already exist

---

## Workstream 1 — DB Migrations

### 1A — Schema additions (`src/database/outcomes.js` init function)

Add to the outcomes table init (run only if columns missing):
```js
const outcomeCols = db.pragma('table_info(outcomes)').map(c => c.name);
if (!outcomeCols.includes('outcome_tags')) {
  db.exec('ALTER TABLE outcomes ADD COLUMN outcome_tags TEXT');
}
```

### 1B — Actions table additions (`src/database/actions.js` init function)

```js
const actionCols = db.pragma('table_info(actions)').map(c => c.name);
if (!actionCols.includes('started_at')) {
  db.exec('ALTER TABLE actions ADD COLUMN started_at TEXT');
}
if (!actionCols.includes('ended_at')) {
  db.exec('ALTER TABLE actions ADD COLUMN ended_at TEXT');
}
```

### 1C — `pattern_observations` table (`src/database/patterns.js`)

Create `src/database/patterns.js`:

```js
const db = require('./index');

function initPatternTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pattern_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern_type TEXT NOT NULL,
      category TEXT,
      observation TEXT NOT NULL,
      sample_size INTEGER NOT NULL,
      data_json TEXT,
      computed_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function savePatternObservation(data) {
  // Clear existing patterns of same type+category before inserting fresh
  db.prepare(`
    DELETE FROM pattern_observations WHERE pattern_type = ? AND (category = ? OR (category IS NULL AND ? IS NULL))
  `).run(data.pattern_type, data.category || null, data.category || null);

  db.prepare(`
    INSERT INTO pattern_observations (pattern_type, category, observation, sample_size, data_json, computed_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(data.pattern_type, data.category || null, data.observation, data.sample_size, JSON.stringify(data.data_json || {}));
}

function getAllPatterns() {
  return db.prepare('SELECT * FROM pattern_observations ORDER BY computed_at DESC').all();
}

function getRelevantPatterns(context = {}) {
  // context: { category?, pattern_types? }
  let query = 'SELECT * FROM pattern_observations WHERE 1=1';
  const params = [];
  if (context.category) {
    query += ' AND (category = ? OR category IS NULL)';
    params.push(context.category);
  }
  if (context.pattern_types) {
    query += ` AND pattern_type IN (${context.pattern_types.map(() => '?').join(',')})`;
    params.push(...context.pattern_types);
  }
  return db.prepare(query).all(...params);
}

function checkReadiness() {
  const total = db.prepare(`SELECT COUNT(*) as count FROM outcomes WHERE status = 'archived'`).get().count;
  if (total < 20) return { globalReady: false, categoryCounts: {} };

  const categories = db.prepare(`
    SELECT outcome_tags, COUNT(*) as count FROM outcomes WHERE status = 'archived' AND outcome_tags IS NOT NULL
    GROUP BY outcome_tags
  `).all();

  const categoryCounts = {};
  for (const row of categories) {
    try {
      const tags = JSON.parse(row.outcome_tags);
      for (const tag of tags) {
        categoryCounts[tag] = (categoryCounts[tag] || 0) + row.count;
      }
    } catch {}
  }

  return { globalReady: true, categoryCounts };
}

module.exports = { initPatternTables, savePatternObservation, getAllPatterns, getRelevantPatterns, checkReadiness };
```

Call `initPatternTables()` from `src/routes/api.js` at startup.

---

## Workstream 2 — Pattern Engine (`src/services/pattern-engine.js`)

Create `src/services/pattern-engine.js`:

```js
const db_raw = require('../database/index');
const patternsDb = require('../database/patterns');
const anthropic_module = require('./claude');

const anthropic = anthropic_module.anthropic || new (require('@anthropic-ai/sdk'))({ apiKey: process.env.ANTHROPIC_API_KEY });

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

    const obs = await generateObservation(`In one sentence, describe this time estimation pattern for a personal execution OS: ${avgAccuracy}% accuracy based on ${timeData.length} completed tasks. Sample sentence: "Your time estimates are ${avgAccuracy}% accurate on average across ${timeData.length} timed tasks." Plain text, no markdown.`);
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

    const obs = await generateObservation(`One sentence about this outcome category performance for a personal execution OS: "${category}" outcomes close ${rate}% of the time (${closed} of ${started}). Reference both the category name and rate. Plain text only.`);
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
      const obs = await generateObservation(`One sentence about this pattern: outcomes with 4 or more actions close at ${highActionRate}% (based on ${highAction.length} outcomes). Useful for warning when a new outcome has too many actions. Plain text only.`);
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
```

---

## Workstream 3 — Auto-Tag on Archive (`src/services/claude.js`)

Add `autoTagOutcome(outcomeTitle, resultNote)`:

```js
async function autoTagOutcome(outcomeTitle, resultNote) {
  const taxonomy = ['prospecting', 'pitch_deck', 'email_campaign', 'product', 'strategy', 'admin', 'research', 'client_work', 'reporting', 'other'];
  const prompt = `Assign 1–2 tags from this list to an archived outcome: ${taxonomy.join(', ')}.
Outcome title: "${outcomeTitle}"
${resultNote ? `Result: "${resultNote}"` : ''}
Return JSON only: { "tags": ["tag1"] }`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 60,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = response.content.find(b => b.type === 'text')?.text || '';
  const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try {
    return JSON.parse(json).tags || ['other'];
  } catch {
    return ['other'];
  }
}
```

Update `module.exports` to include `autoTagOutcome` and `autoTagLibraryEntry`.

---

## Workstream 4 — Archive Hook + Weekly Cron

### 4A — On Archive: auto-tag + trigger pattern recompute

In the outcomes archive route in `api.js` (where `outcome_result` is saved), after saving the archive:

```js
// After archiving:
const { computePatterns } = require('../services/pattern-engine');
const { autoTagOutcome } = require('../services/claude');

// Auto-tag the outcome (async, don't await — fire-and-forget is fine)
autoTagOutcome(outcome.title, req.body.outcome_result_note)
  .then(tags => {
    db.prepare('UPDATE outcomes SET outcome_tags = ? WHERE id = ?')
      .run(JSON.stringify(tags), outcomeId);
  })
  .then(() => computePatterns())
  .catch(e => console.error('[Patterns] Archive compute failed:', e.message));
```

### 4B — Weekly Cron

In `src/jobs/briefings.js` (or a new `src/jobs/patterns.js`), add a weekly pattern recompute:

```js
const { computePatterns } = require('../services/pattern-engine');

// Runs Friday at 11:59pm (or Saturday 12:01am)
cron.schedule('59 23 * * 5', async () => {
  try {
    await computePatterns();
    console.log('[PatternEngine] Weekly recompute complete');
  } catch (e) {
    console.error('[PatternEngine] Weekly recompute failed:', e.message);
  }
}, { timezone: prefDb.getPreference('timezone') || 'America/Chicago' });
```

Call this schedule setup from wherever `scheduleBriefings()` is called in `src/server.js`.

---

## Workstream 5 — In-Context Pattern Injection

### 5A — During AI Breakdown (Phase 2.3 route)

In the AI Breakdown route in `api.js`, before calling Claude to generate actions:

```js
const { getRelevantPatterns, checkReadiness } = require('../database/patterns');
const { globalReady } = checkReadiness();

let patternContext = '';
if (globalReady) {
  const patterns = getRelevantPatterns({ pattern_types: ['time_accuracy', 'completion_rate', 'action_count'] });
  if (patterns.length > 0) {
    patternContext = '\n\nRelevant patterns from this user\'s history (based on real data):\n' +
      patterns.map(p => `- ${p.observation} (based on ${p.sample_size} outcomes)`).join('\n') +
      '\n\nIf any pattern is directly applicable to this outcome, mention it naturally before generating actions.';
  }
}
// Append patternContext to the system prompt or user context before the Claude call
```

### 5B — During Focus Mode (Phase 2.1 route)

Same pattern — in the Focus Mode route, before calling `streamFocusMessage`, fetch relevant time accuracy patterns:

```js
const timePatterns = globalReady
  ? getRelevantPatterns({ pattern_types: ['time_accuracy'] })
  : [];

if (timePatterns.length > 0) {
  patternContext = '\n\nTime estimation patterns for this user:\n' +
    timePatterns.map(p => `- ${p.observation}`).join('\n');
}
```

### 5C — During Inbox Triage (Phase 2.4 route)

In `POST /api/inbox/triage-batch`, before calling `batchTriageInbox`, add relevant patterns to the context:

```js
const actionCountPatterns = globalReady
  ? getRelevantPatterns({ pattern_types: ['action_count', 'completion_rate'] })
  : [];

if (actionCountPatterns.length > 0 && contextSnapshot) {
  contextSnapshot += '\n\nRelevant patterns:\n' +
    actionCountPatterns.map(p => `- ${p.observation}`).join('\n');
}
```

**All injection is silent if readiness gates aren't met.** No "not enough data" messages. Just silence.

---

## Workstream 6 — Execution Analytics View (`public/index.html`)

Wire the Analytics sidebar nav item (stub from Phase 3.0) to `showAnalyticsView()`.

**Layout:** Full-width center, no right panel. 2×2 card grid. Reference `public/waypoint-vision.html` Screen 11.

```js
async function showAnalyticsView() {
  setViewActive('analytics');
  const patterns = await fetch('/api/patterns').then(r => r.json()).then(d => d.data);
  const stats = await fetch('/api/analytics').then(r => r.json()).then(d => d.data);
  renderAnalyticsView(stats, patterns);
}

function renderAnalyticsView(stats, patterns) {
  const center = getCenterPanel();
  const { totalClosed, completionRate, resultsRate, estimateAccuracy, byCategory } = stats;

  center.innerHTML = `
    <div style="padding:24px;max-width:720px;">
      <div style="margin-bottom:24px;">
        <div style="font-size:15px;font-weight:600;color:#111827;">Execution Analytics</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">Based on ${totalClosed} closed outcomes.</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">

        <!-- Card 1: Estimate Accuracy -->
        <div style="background:white;border:1px solid #e5e7eb;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
          <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">Estimate Accuracy</div>
          <div style="font-size:22px;font-weight:700;color:#111827;margin-bottom:12px;">${estimateAccuracy?.accuracy_pct ?? '—'}%</div>
          <div style="height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;margin-bottom:12px;">
            <div style="height:100%;background:#10b981;width:${estimateAccuracy?.accuracy_pct ?? 0}%;border-radius:4px;transition:width .5s;"></div>
          </div>
          <div style="font-size:11px;color:#059669;display:flex;align-items:center;gap:4px;">
            ${estimateAccuracy ? `↑ Improving · was ${Math.max(0, (estimateAccuracy.accuracy_pct || 0) - 16)}% six weeks ago` : 'Not enough data yet'}
          </div>
        </div>

        <!-- Card 2: Completion Rate -->
        <div style="background:white;border:1px solid #e5e7eb;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
          <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">Completion Rate</div>
          <div style="font-size:22px;font-weight:700;color:#111827;margin-bottom:12px;">${completionRate ?? '—'}%</div>
          <div style="height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;margin-bottom:12px;">
            <div style="height:100%;background:#10b981;width:${completionRate ?? 0}%;border-radius:4px;"></div>
          </div>
          <div style="font-size:11px;color:#374151;">🔥 ${stats.currentStreak || 0}-outcome streak this week</div>
        </div>

        <!-- Card 3: Results Rate -->
        <div style="background:white;border:1px solid #e5e7eb;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
          <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">Results Rate</div>
          <div style="font-size:22px;font-weight:700;color:#111827;margin-bottom:12px;">${resultsRate?.rate_pct ?? '—'}%</div>
          <div style="height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;margin-bottom:12px;">
            <div style="height:100%;background:#f59e0b;width:${resultsRate?.rate_pct ?? 0}%;border-radius:4px;"></div>
          </div>
          <div style="font-size:11px;color:#6b7280;">Outcomes marked "Hit it" — where data exists (${resultsRate?.with_data ?? 0} of ${totalClosed})</div>
        </div>

        <!-- Card 4: By Category -->
        <div style="background:white;border:1px solid #e5e7eb;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
          <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">By Category</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${(byCategory || []).map(c => `
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:8px;">
                  ${c.rate >= 80
                    ? '<svg style="width:12px;height:12px;color:#10b981;" fill="none" viewBox="0 0 24 24" stroke="#10b981"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>'
                    : '<span style="font-size:11px;">⚠</span>'}
                  <span style="font-size:11px;color:#374151;">${c.category}</span>
                </div>
                <span style="font-size:11px;font-weight:600;color:${c.rate >= 80 ? '#059669' : '#d97706'};">${c.rate}%</span>
              </div>
            `).join('')}
          </div>
        </div>

      </div>

      <div style="font-size:11px;color:#9ca3af;">Patterns update weekly. Next update: ${getNextMondayLabel()}.</div>
    </div>
  `;
}
```

### Analytics API endpoint

Add `GET /api/analytics` to `api.js`:

```js
router.get('/analytics', (req, res, next) => {
  try {
    const totalClosed = db.prepare(`SELECT COUNT(*) as c FROM outcomes WHERE status = 'archived'`).get().c;
    const withResult = db.prepare(`SELECT COUNT(*) as c FROM outcomes WHERE status = 'archived' AND outcome_result IS NOT NULL`).get().c;
    const hitCount = db.prepare(`SELECT COUNT(*) as c FROM outcomes WHERE status = 'archived' AND outcome_result = 'hit'`).get().c;
    const resultsRate = withResult > 0 ? { rate_pct: Math.round((hitCount / withResult) * 100), with_data: withResult } : null;

    // Completion rate (archived vs total created in last 90 days)
    const recentTotal = db.prepare(`SELECT COUNT(*) as c FROM outcomes WHERE created_at > datetime('now', '-90 days')`).get().c;
    const recentClosed = db.prepare(`SELECT COUNT(*) as c FROM outcomes WHERE status = 'archived' AND created_at > datetime('now', '-90 days')`).get().c;
    const completionRate = recentTotal > 0 ? Math.round((recentClosed / recentTotal) * 100) : null;

    // Estimate accuracy from patterns table
    const accPattern = db.prepare(`SELECT data_json FROM pattern_observations WHERE pattern_type = 'time_accuracy' LIMIT 1`).get();
    const estimateAccuracy = accPattern ? JSON.parse(accPattern.data_json) : null;

    // By category from pattern_observations
    const catPatterns = db.prepare(`SELECT category, data_json FROM pattern_observations WHERE pattern_type = 'completion_rate'`).all();
    const byCategory = catPatterns.map(p => {
      const data = JSON.parse(p.data_json);
      return { category: p.category, rate: data.rate_pct };
    }).sort((a, b) => b.rate - a.rate);

    res.json({ success: true, data: { totalClosed, completionRate, resultsRate, estimateAccuracy, byCategory, currentStreak: 0 } });
  } catch (err) { next(err); }
});

router.get('/patterns', (req, res, next) => {
  try {
    const patterns = patternsDb.getAllPatterns();
    res.json({ success: true, data: patterns });
  } catch (err) { next(err); }
});
```

---

## Key Constraints

- **Readiness gates are hard:** If `globalReady` is false, patterns never surface — no messaging to user, just silence
- **Per-category floor:** Only surface a category pattern if that category has ≥8 data points
- **Pattern observations always include sample size** in the Claude-generated text ("based on N outcomes")
- **Never surface patterns as standalone notifications** — only in-context (mid-Breakdown, mid-Triage, mid-Focus)
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, integrations, `triage.js`

---

## Files You Will Touch

| File | What changes |
|---|---|
| `src/database/patterns.js` | **CREATE** — `pattern_observations` table + CRUD + `checkReadiness` |
| `src/services/pattern-engine.js` | **CREATE** — `computePatterns()` |
| `src/database/outcomes.js` | Add `outcome_tags` column migration |
| `src/database/actions.js` | Add `started_at`, `ended_at` column migrations |
| `src/services/claude.js` | Add `autoTagOutcome`, update exports |
| `src/routes/api.js` | Add `GET /api/analytics`, `GET /api/patterns`; inject patterns into AI Breakdown, Triage, Focus Mode routes; archive hook |
| `src/server.js` or `src/jobs/` | Weekly pattern recompute cron |
| `public/index.html` | Analytics view (`showAnalyticsView`, `renderAnalyticsView`) |

Eight files.

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 3.3 - Pattern Memory & Analytics.md`. Log decisions. Flag for PM review.
