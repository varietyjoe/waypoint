# Phase 2.4 — Engineer Handoff

## Agent Prompt

You are building Phase 2.4 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase adds Smart Inbox Triage — a batch Claude triage flow where the user selects multiple inbox items, sends them to Claude together, answers clarifying questions, reviews proposed outcomes/actions, and creates everything in one shot. Read `pm_log/Phase 2/Phase 2.4 - Engineer Handoff.md` in full before writing any code, then use `dev_tracker/Phase 2.4 - Smart Inbox Triage.md` as your working checklist. Mark items complete as you finish them.

---

You are building Phase 2.4 of Waypoint — a single-user personal execution OS at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 2/Phase 2.4 - Smart Inbox Triage.md` — full phase spec
2. `dev_tracker/Phase 2.4 - Smart Inbox Triage.md` — your working checklist
3. `src/database/inbox.js` — understand the inbox table schema and all exported functions, especially `getInboxItemById`, `approveInboxItem`, `getPendingInboxItems`
4. `src/routes/api.js` — read all existing `/api/inbox/*` routes (around lines 600–715), understand the inbox rendering and approval flow
5. `public/index.html` — find the inbox rendering code (search `loadInboxData`, `renderCenter` inbox branch, `approveInboxItem`, `dismissInboxItem`). Understand how the current per-item triage UI works.
6. `src/services/claude.js` — read `classifyForInbox` as a pattern for a new structured JSON Claude call; read `module.exports`

**Prerequisites:** Phase 2.3 complete and approved. ✅

---

## Known Codebase State

- **Inbox table columns:** `id`, `title`, `description`, `priority`, `due_date`, `source_type`, `source_url`, `source_metadata` (JSON), `status` ('pending'|'approved'|'rejected'), `created_at`, `processed_at`, `classification` ('outcome'|'action'|'unknown'), `suggested_outcome_id`, `ai_reasoning`
- **Existing per-item flow:** Each inbox item shows "Approve" and "Dismiss" buttons. Approve creates an outcome or action directly. This flow is unchanged — batch triage is an additional path.
- **`approveInboxItem(id)` in `inbox.js`** sets `status = 'approved'`, `processed_at = now`. It does NOT create outcomes/actions (that's done in the route). Call this directly to mark items as triaged after batch creation.
- **Anthropic client:** Named `anthropic` in `claude.js`. Pattern for structured JSON: use `anthropic.messages.create()` with a prompt instructing JSON-only output, then parse the response text.
- **`escHtml` not `escapeHtml`** — correct helper name in `public/index.html`.
- **`userContextDb`** is already required in `api.js` and `claude.js` (Phase 2.2). Use `userContextDb.getContextSnapshot()` in the new route.

---

## Pre-Build Checklist

- [ ] Read `src/database/inbox.js` — confirm `approveInboxItem(id)` signature and what it does
- [ ] Read `src/routes/api.js` inbox routes — understand what `POST /api/inbox/:id/approve` does vs. what `inboxDb.approveInboxItem` does
- [ ] Read `public/index.html` — find `loadInboxData()`, the inbox section in `renderCenter()`, and the per-item approve/dismiss functions
- [ ] Read `src/services/claude.js` — read `classifyForInbox` as a JSON-response Claude call pattern

---

## Workstream 1 — New Claude Function (`src/services/claude.js`)

Add `batchTriageInbox(items, contextSnapshot)` before `module.exports`:

```js
async function batchTriageInbox(items, contextSnapshot) {
  const itemsList = items.map((item, i) =>
    `[${i + 1}] "${item.title}"${item.description ? ': ' + item.description : ''}`
  ).join('\n');

  const contextBlock = contextSnapshot
    ? `\nUser's context (how they work):\n${contextSnapshot}\n`
    : '';

  const prompt = `You are triaging a batch of inbox items for a personal execution OS.${contextBlock}
Items to triage:
${itemsList}

Instructions:
1. Group related items into outcome clusters. Each cluster = one outcome with actions.
2. Unrelated items each become their own cluster.
3. For each outcome, propose: a clear action-oriented title, a project hint (or null), and a list of actions with time estimates and energy types.
4. Use the user's known durations from context. If a task type is unknown, add ONE question per unknown (not per item).
5. Return valid JSON only — no markdown fences, no explanation.

Response format:
{
  "clusters": [
    {
      "outcome_title": "string",
      "project_hint": "string or null",
      "source_item_indices": [1, 2],
      "actions": [
        { "title": "string", "time_estimate": 90, "energy_type": "deep" }
      ]
    }
  ],
  "questions": [
    { "question": "string", "context_key": "string" }
  ]
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '';
  // Strip markdown code fences if Claude adds them despite instructions
  const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try {
    return JSON.parse(json);
  } catch (e) {
    throw new Error(`Batch triage parse error: ${e.message}. Raw: ${json.slice(0, 200)}`);
  }
}
```

Update `module.exports`:
```js
module.exports = { sendMessage, classifyForInbox, sendWithTools, streamFocusMessage, batchTriageInbox };
```

---

## Workstream 2 — New API Route (`src/routes/api.js`)

Add this route in the inbox section (after the existing inbox routes):

```js
// POST /api/inbox/triage-batch — batch triage selected inbox items with Claude
router.post('/inbox/triage-batch', async (req, res, next) => {
  try {
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ success: false, error: 'itemIds array required' });
    }

    // Fetch the inbox items
    const items = itemIds.map(id => inboxDb.getInboxItemById(id)).filter(Boolean);
    if (items.length === 0) {
      return res.status(404).json({ success: false, error: 'No valid inbox items found' });
    }

    const contextSnapshot = userContextDb.getContextSnapshot();
    const result = await claudeService.batchTriageInbox(items, contextSnapshot);

    // Map source_item_indices back to actual item IDs for the frontend
    const clustersWithIds = (result.clusters || []).map(cluster => ({
      ...cluster,
      source_item_ids: (cluster.source_item_indices || []).map(i => items[i - 1]?.id).filter(Boolean),
    }));

    res.json({ success: true, data: { clusters: clustersWithIds, questions: result.questions || [] } });
  } catch (err) {
    next(err);
  }
});
```

**Note:** `inboxDb` is already required. `userContextDb` and `claudeService` are already required. No new requires needed.

---

## Workstream 3 — Frontend: Batch Triage UI (`public/index.html`)

### 3A — Add "Triage Selected →" button to inbox view

In the inbox section of `renderCenter()` (or wherever inbox items are rendered), add:
1. A checkbox per inbox item (in addition to existing Approve/Dismiss buttons)
2. A "Triage Selected →" button that appears when ≥1 item is checked

The checkbox should be a module-level set: `let triageSelectedIds = new Set()`.

Each inbox item card gets a checkbox:
```html
<input
  type="checkbox"
  onchange="toggleTriageItem(${item.id}, this.checked)"
  style="width:14px;height:14px;cursor:pointer;accent-color:#111827;"
  title="Select for batch triage"
/>
```

The "Triage Selected →" button (placed above the inbox list):
```html
<div id="triage-batch-bar" style="display:none;padding:8px 0;margin-bottom:8px;">
  <button
    onclick="startBatchTriage()"
    style="width:100%;padding:8px 12px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
    Triage Selected (<span id="triage-count">0</span>) →
  </button>
</div>
```

```js
let triageSelectedIds = new Set();

function toggleTriageItem(id, checked) {
  if (checked) triageSelectedIds.add(id);
  else triageSelectedIds.delete(id);

  const count = triageSelectedIds.size;
  const bar = document.getElementById('triage-batch-bar');
  const countEl = document.getElementById('triage-count');
  if (bar) bar.style.display = count > 0 ? 'block' : 'none';
  if (countEl) countEl.textContent = count;
}
```

### 3B — `startBatchTriage()`

```js
async function startBatchTriage() {
  if (triageSelectedIds.size === 0) return;

  const itemIds = [...triageSelectedIds];
  showTriageLoadingState();

  try {
    const res = await fetch('/api/inbox/triage-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds }),
    });
    if (!res.ok) throw new Error('Triage failed');
    const data = await res.json();

    const { clusters, questions } = data.data;

    if (questions && questions.length > 0) {
      renderTriageQuestions(questions, clusters, itemIds);
    } else {
      renderTriagePreview(clusters, itemIds);
    }
  } catch (err) {
    hideTriageLoadingState();
    showToast('Triage failed — try again', 'warning');
  }
}

function showTriageLoadingState() {
  const btn = document.querySelector('[onclick="startBatchTriage()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Thinking…'; }
}

function hideTriageLoadingState() {
  const btn = document.querySelector('[onclick="startBatchTriage()"]');
  if (btn) { btn.disabled = false; btn.textContent = `Triage Selected (${triageSelectedIds.size}) →`; }
}
```

### 3C — `renderTriageQuestions(questions, clusters, itemIds)`

Render a questions step in the center panel:

```js
function renderTriageQuestions(questions, pendingClusters, itemIds) {
  // Find the main content area in the center panel to replace with triage UI
  // Check the existing DOM structure and use the correct container
  const container = document.getElementById('centerContent') // adjust to match actual
    || document.querySelector('.center-panel-content');      // fallback

  const inputs = questions.map((q, i) => `
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">${escHtml(q.question)}</div>
      <input id="triage-q-${i}" type="text" placeholder="Your answer…"
        style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:12px;outline:none;" />
    </div>
  `).join('');

  container.innerHTML = `
    <div style="padding:20px;max-width:560px;margin:0 auto;">
      <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:16px;text-transform:uppercase;letter-spacing:.05em;">
        Quick questions before I build your plan
      </div>
      ${inputs}
      <button onclick="submitTriageQuestions(${JSON.stringify(questions).replace(/"/g,'&quot;')}, ${JSON.stringify(pendingClusters).replace(/"/g,'&quot;')}, ${JSON.stringify(itemIds).replace(/"/g,'&quot;')})"
        style="width:100%;margin-top:4px;padding:10px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
        Next →
      </button>
    </div>
  `;
  setTimeout(() => document.getElementById('triage-q-0')?.focus(), 50);
}
```

**Note:** Find the correct center panel container element in `public/index.html` and adjust the selector.

### 3D — `submitTriageQuestions(questions, clusters, itemIds)`

```js
async function submitTriageQuestions(questions, clusters, itemIds) {
  const saves = questions.map((q, i) => {
    const answer = document.getElementById(`triage-q-${i}`)?.value.trim();
    if (!answer) return Promise.resolve();
    return fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: q.context_key || q.question.slice(0, 60),
        value: answer,
        category: 'task_duration',
        source: 'inbox_triage',
      }),
    });
  });

  await Promise.all(saves).catch(() => {});
  renderTriagePreview(clusters, itemIds);
}
```

### 3E — `renderTriagePreview(clusters, itemIds)`

```js
function renderTriagePreview(clusters, itemIds) {
  const container = document.getElementById('centerContent') // adjust to match actual
    || document.querySelector('.center-panel-content');

  // Build the projects dropdown options (reuse existing PROJECTS global)
  const projectOptions = PROJECTS.map(p =>
    `<option value="${p.id}">${escHtml(p.name)}</option>`
  ).join('');

  const clusterCards = clusters.map((cluster, ci) => {
    const actionRows = cluster.actions.map((a, ai) => `
      <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #f9fafb;">
        <input type="text" value="${escHtml(a.title)}"
          id="triage-action-title-${ci}-${ai}"
          style="flex:1;border:none;outline:none;font-size:11px;color:#374151;background:transparent;" />
        <input type="number" value="${a.time_estimate || ''}" min="1"
          id="triage-action-time-${ci}-${ai}"
          style="width:48px;border:1px solid #e5e7eb;border-radius:4px;padding:2px 4px;font-size:10px;text-align:center;" />
        <span style="font-size:9px;color:#9ca3af;">min</span>
        <button onclick="toggleTriageEnergy(${ci}, ${ai})" id="triage-energy-${ci}-${ai}"
          style="font-size:9px;padding:2px 6px;border-radius:4px;border:1px solid #e5e7eb;background:transparent;cursor:pointer;color:#6b7280;">
          ${a.energy_type || 'deep'}
        </button>
        <button onclick="removeTriageAction(${ci}, ${ai})"
          style="background:transparent;border:none;color:#d1d5db;font-size:12px;cursor:pointer;">×</button>
      </div>
    `).join('');

    return `
      <div id="triage-cluster-${ci}" style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:10px;">
        <input type="text" value="${escHtml(cluster.outcome_title)}"
          id="triage-outcome-title-${ci}"
          style="width:100%;border:none;outline:none;font-size:13px;font-weight:600;color:#111827;margin-bottom:8px;" />
        <select id="triage-project-${ci}"
          style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:4px 8px;font-size:11px;margin-bottom:8px;color:#374151;">
          <option value="">— select project —</option>
          ${projectOptions}
        </select>
        <div id="triage-actions-${ci}">${actionRows}</div>
        <button onclick="removeTriageCluster(${ci})"
          style="margin-top:8px;font-size:10px;color:#9ca3af;background:transparent;border:none;cursor:pointer;">
          Remove this outcome
        </button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="padding:20px;max-width:560px;margin:0 auto;">
      <div style="font-size:11px;font-weight:600;color:#374151;margin-bottom:16px;text-transform:uppercase;letter-spacing:.05em;">
        Review your plan
      </div>
      <div id="triage-clusters">${clusterCards}</div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button onclick="confirmBatchTriage(${JSON.stringify(clusters).replace(/"/g,'&quot;')}, ${JSON.stringify(itemIds).replace(/"/g,'&quot;')})"
          style="flex:1;padding:10px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
          Create All
        </button>
        <button onclick="cancelBatchTriage()"
          style="padding:10px 16px;background:transparent;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;color:#6b7280;cursor:pointer;">
          Cancel
        </button>
      </div>
    </div>
  `;

  // Store clusters reference for confirm step
  window._triageClusters = clusters;
  window._triageItemIds = itemIds;
}

function removeTriageCluster(ci) {
  document.getElementById(`triage-cluster-${ci}`)?.remove();
}

function removeTriageAction(ci, ai) {
  document.getElementById(`triage-action-title-${ci}-${ai}`)?.closest('div[style]')?.remove();
}

function toggleTriageEnergy(ci, ai) {
  const btn = document.getElementById(`triage-energy-${ci}-${ai}`);
  if (!btn) return;
  const current = btn.textContent.trim();
  btn.textContent = current === 'deep' ? 'light' : 'deep';
}

function cancelBatchTriage() {
  triageSelectedIds = new Set();
  // Re-render the inbox view
  loadInboxData().then(() => renderCenter());
}
```

### 3F — `confirmBatchTriage(clusters, itemIds)`

```js
async function confirmBatchTriage(originalClusters, itemIds) {
  const clusterEls = document.querySelectorAll('[id^="triage-cluster-"]');
  const errors = [];

  for (let ci = 0; ci < clusterEls.length; ci++) {
    const el = clusterEls[ci];
    if (!el || el.style.display === 'none') continue;

    const title = document.getElementById(`triage-outcome-title-${ci}`)?.value.trim();
    const projectId = document.getElementById(`triage-project-${ci}`)?.value;

    if (!title || !projectId) {
      errors.push(`Outcome ${ci + 1}: select a project and provide a title`);
      continue;
    }

    try {
      // Create outcome
      const outcomeRes = await fetch('/api/outcomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, project_id: parseInt(projectId) }),
      });
      if (!outcomeRes.ok) throw new Error('outcome creation failed');
      const outcomeData = await outcomeRes.json();
      const outcomeId = outcomeData.data?.id;

      // Create actions for this outcome
      const actionRows = el.querySelectorAll('[id^="triage-action-title-' + ci + '-"]');
      for (let ai = 0; ai < actionRows.length; ai++) {
        const actionTitle = document.getElementById(`triage-action-title-${ci}-${ai}`)?.value.trim();
        const timeEstimate = parseInt(document.getElementById(`triage-action-time-${ci}-${ai}`)?.value) || null;
        const energyType = document.getElementById(`triage-energy-${ci}-${ai}`)?.textContent.trim() || 'deep';

        if (!actionTitle) continue;
        await fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            outcome_id: outcomeId,
            title: actionTitle,
            time_estimate: timeEstimate,
            energy_type: energyType,
          }),
        });
      }
    } catch (e) {
      errors.push(`Outcome ${ci + 1}: ${e.message}`);
    }
  }

  // Mark source inbox items as approved
  await Promise.all(itemIds.map(id =>
    fetch(`/api/inbox/${id}/dismiss`, { method: 'POST' }).catch(() => {})
    // Using dismiss here; alternatively add a mark-triaged route. If approve route
    // doesn't work cleanly for batch, use PUT /api/inbox/:id with status update.
  ));

  if (errors.length > 0) {
    showToast(`Some items failed: ${errors[0]}`, 'warning');
  } else {
    showToast('Triage complete — outcomes and actions created', 'success');
  }

  triageSelectedIds = new Set();
  await Promise.all([loadData(), loadInboxData()]);
  renderAll();
  updateInboxBadge();
}
```

**Note on marking items triaged:** The `POST /api/inbox/:id/dismiss` marks items as `rejected`. If that's semantically wrong, check whether `PUT /api/inbox/:id` accepts a `status` field, or add a `POST /api/inbox/:id/approve` call (which marks `approved`). Read the existing `approveInboxItem` route and DB function to confirm. Use whichever correctly marks the item as processed without triggering re-creation.

---

## Key Constraints

- **Existing per-item approve/dismiss flow is unchanged** — batch triage is additive.
- **All outcomes created via `POST /api/outcomes`** (existing). All actions via `POST /api/actions` (existing). No new creation routes.
- **`batchTriageInbox` uses direct `anthropic.messages.create()`** — not `sendWithTools`. The tool use pattern isn't suitable here; this needs a structured JSON return.
- **Do not touch:** `src/routes/slack.js`, `src/routes/grain.js`, all integrations, crypto, oauth-tokens, monitored-channels, triage.js (the scheduler), `src/database/inbox.js` (only add to `module.exports` if needed — the existing functions are sufficient).

---

## Files You Will Touch

| File | What changes |
|---|---|
| `src/services/claude.js` | Add `batchTriageInbox`, update `module.exports` |
| `src/routes/api.js` | Add `POST /api/inbox/triage-batch` route |
| `public/index.html` | `triageSelectedIds`, `toggleTriageItem`, batch bar, `startBatchTriage`, `showTriageLoadingState`, `renderTriageQuestions`, `submitTriageQuestions`, `renderTriagePreview`, `confirmBatchTriage`, `cancelBatchTriage`, helper functions |

Three files.

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 2.4 - Smart Inbox Triage.md`. Log decisions. Flag for PM review.
