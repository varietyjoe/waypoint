const Anthropic = require('@anthropic-ai/sdk');
const userContextDb = require('../database/user-context');

console.log('🔑 Initializing Anthropic client...');
console.log('API Key present:', !!process.env.ANTHROPIC_API_KEY);

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================================
// Phase 1.4 Tool Definitions
// ============================================================

const TOOLS = [
    {
        name: 'break_into_actions',
        description: 'Break the given outcome into a concrete list of actions with time and energy estimates. Uses the user\'s known durations from context. If task types are unknown, returns questions before proposing actions.',
        input_schema: {
            type: 'object',
            properties: {
                actions: {
                    type: 'array',
                    description: 'Proposed actions for this outcome',
                    items: {
                        type: 'object',
                        properties: {
                            title:         { type: 'string' },
                            time_estimate: { type: 'integer', description: 'Estimated minutes. Use the user\'s known durations from context. Do not guess for unknown task types — put them in questions instead.' },
                            energy_type:   { type: 'string', enum: ['deep', 'light'] },
                        },
                        required: ['title', 'time_estimate', 'energy_type'],
                    },
                },
                questions: {
                    type: 'array',
                    description: 'Questions to ask the user BEFORE showing the action list. Only populate if you encounter task types with no known duration in the user\'s context. One question per unknown task type. Leave empty or omit if context covers all tasks.',
                    items: { type: 'string' },
                },
            },
            required: ['actions'],
        },
    },
    {
        name: 'brain_dump_to_outcomes',
        description: 'Convert unstructured text (meeting notes, voice-to-text, stream of consciousness) into structured outcomes and actions, assigned to the correct project.',
        input_schema: {
            type: 'object',
            properties: {
                outcomes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            title:        { type: 'string' },
                            project_name: { type: 'string', description: 'Must match an existing project name exactly' },
                            deadline:     { type: 'string', description: 'ISO date string, or null' },
                            priority:     { type: 'string', enum: ['low', 'medium', 'high'] },
                            actions: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        title:         { type: 'string' },
                                        time_estimate: { type: 'integer' },
                                        energy_type:   { type: 'string', enum: ['deep', 'light'] },
                                    },
                                    required: ['title', 'energy_type'],
                                },
                            },
                        },
                        required: ['title', 'project_name'],
                    },
                },
            },
            required: ['outcomes'],
        },
    },
    {
        name: 'bulk_reschedule',
        description: "Reschedule multiple outcomes' deadlines based on a plain-English instruction (e.g. 'push everything in PRODUCT back 2 weeks'). Returns a preview of all changes — does not mutate data directly.",
        input_schema: {
            type: 'object',
            properties: {
                updates: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            outcome_id:       { type: 'integer' },
                            title:            { type: 'string' },
                            current_deadline: { type: 'string' },
                            new_deadline:     { type: 'string', description: 'ISO date string' },
                        },
                        required: ['outcome_id', 'title', 'new_deadline'],
                    },
                },
            },
            required: ['updates'],
        },
    },
    {
        name: 'prioritize_today',
        description: 'Return a prioritized recommendation for what to focus on today, based on deadline risk, energy types, and the active outcome list. Read-only — no mutations.',
        input_schema: {
            type: 'object',
            properties: {
                recommendation: { type: 'string', description: 'Short prioritized recommendation' },
                top_outcomes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Ranked list of outcome titles to focus on',
                },
                reasoning: { type: 'string', description: '1-3 sentence explanation' },
            },
            required: ['recommendation', 'top_outcomes', 'reasoning'],
        },
    },
];

/**
 * Send a message to Claude and get a response.
 * Tools will be added in Phase 1.4 (AI Co-pilot).
 *
 * @param {string} message - The user's message
 * @param {Array} conversationHistory - Previous messages
 * @param {boolean} preview - Unused for now; preserved for future tool use
 * @returns {Promise<Object>} { text, actions }
 */
async function sendMessage(message, conversationHistory = [], preview = false, contextSnapshot = '') {
    console.log('📨 Claude Service: Sending message to API');
    console.log('Message length:', message.length);
    console.log('Conversation history length:', conversationHistory.length);

    try {
        const messages = [
            ...conversationHistory,
            { role: 'user', content: message }
        ];

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });

        const contextBlock = contextSnapshot ? `\n\n${contextSnapshot}` : '';

        const systemPrompt = `You are a helpful AI assistant integrated into Waypoint, a personal execution OS.
Today's date: ${todayStr} (${dayOfWeek})
Waypoint organizes work as: Projects → Outcomes → Actions.
- An Outcome is a meaningful deliverable (e.g. "Launch Q1 product update")
- An Action is a specific task within an outcome (e.g. "Write release notes")
Respond concisely and helpfully.${contextBlock}`;

        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: systemPrompt,
            messages: messages
        });

        console.log('✅ Received response from Claude API');
        console.log('Stop reason:', response.stop_reason);

        const text = response.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('');

        return { text, actions: [] };

    } catch (error) {
        console.error('❌ Error calling Claude API:', error.message);
        throw error;
    }
}

/**
 * Classify a raw Slack message for inbox triage.
 * Returns classification, a clean title, and one sentence of reasoning.
 *
 * @param {string} content - Raw message text
 * @returns {Promise<{ classification: string, title: string, ai_reasoning: string }>}
 */
async function classifyForInbox(content) {
    const prompt = `You are a triage assistant for a personal productivity system called Waypoint.

Waypoint organizes work as: Projects → Outcomes → Actions.
- An **Outcome** is a meaningful deliverable or goal that requires planning and multiple steps (e.g. "Launch Q1 email campaign", "Hire backend engineer").
- An **Action** is a specific, concrete task that can be done directly (e.g. "Send follow-up to Alex", "Review PR #42", "Book flight to NYC").

Given the following Slack message, classify it and suggest a clean title.

Slack message:
"""
${content}
"""

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "classification": "outcome" | "action" | "unknown",
  "title": "<concise, action-oriented title, max 80 chars>",
  "ai_reasoning": "<one sentence explaining why you classified it this way>"
}

Rules:
- Use "outcome" if the message implies a new goal, project, or deliverable that needs to be defined and broken down.
- Use "action" if the message describes a specific task that can be done as-is.
- Use "unknown" only if the message is purely social, noise, or unclassifiable.
- The title should be a clean restatement, not a quote of the message.
- Do NOT attempt to assign the action to an existing outcome — that is the user's job.`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 256,
            messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('')
            .trim();

        // Strip markdown code fences if present
        const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(jsonText);

        return {
            classification: ['outcome', 'action', 'unknown'].includes(parsed.classification)
                ? parsed.classification
                : 'unknown',
            title: (parsed.title || content.slice(0, 80)).trim(),
            ai_reasoning: (parsed.ai_reasoning || '').trim(),
        };
    } catch (err) {
        console.error('❌ classifyForInbox error:', err.message);
        return {
            classification: 'unknown',
            title: content.slice(0, 80).trim(),
            ai_reasoning: 'Classification failed; manual review needed.',
        };
    }
}

/**
 * Send a message to Claude with tool use enabled.
 * Builds a context-aware system prompt from the supplied context object.
 *
 * @param {Array}  messages - [{ role, content }] conversation
 * @param {Object} context  - injected workspace context from the frontend
 * @returns {Promise<{ type: 'tool'|'message', tool_name?, tool_input?, content? }>}
 */
async function sendWithTools(messages, context = {}) {
    console.log('🔧 Claude Service: sendWithTools called');

    const today     = new Date();
    const todayStr  = today.toISOString().split('T')[0];
    const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });

    // Build context-aware system prompt
    let systemPrompt = `You are an AI co-pilot for Waypoint, a personal execution OS.\n\nToday: ${todayStr} (${dayOfWeek})\n\nWaypoint organizes work as: Projects → Outcomes → Actions.\n- An Outcome is a meaningful deliverable (e.g. "Launch Q1 product update")\n- An Action is a specific task within an outcome (e.g. "Write release notes")\n\n`;

    if (context.current_project) {
        systemPrompt += `Current Project: ${context.current_project.name}\n`;
    }

    if (context.selected_outcome) {
        const o = context.selected_outcome;
        systemPrompt += `\nSelected Outcome: "${o.title}"\n`;
        if (o.deadline)      systemPrompt += `Deadline: ${o.deadline}${o.deadline_risk ? ` (Risk: ${o.deadline_risk})` : ''}\n`;
        if (o.actions && o.actions.length) {
            systemPrompt += `Actions (${o.actions.length} total):\n`;
            o.actions.forEach(a => {
                systemPrompt += `  - ${a.title} [${a.energy_type}, ${a.time_estimate || '?'}m]${a.done ? ' ✓' : ''}\n`;
            });
        }
    }

    if (context.active_outcomes && context.active_outcomes.length) {
        systemPrompt += `\nAll Active Outcomes:\n`;
        context.active_outcomes.forEach(o => {
            let line = `  - "${o.title}" [${o.project_name}`;
            if (o.deadline)       line += `, due ${o.deadline}`;
            if (o.deadline_risk)  line += `, ${o.deadline_risk} risk`;
            line += `, ${o.completed_actions}/${o.total_actions} actions done]`;
            systemPrompt += line + '\n';
        });
    }

    if (context.projects && context.projects.length) {
        systemPrompt += `\nProjects: ${context.projects.map(p => p.name).join(', ')}\n`;
    }

    if (context.today_stats) {
        const s = context.today_stats;
        systemPrompt += `\nToday's Progress: ${s.outcomes_archived_today} outcomes closed, ${s.actions_completed_today} actions completed\n`;
    }

    systemPrompt += `\nUse the most appropriate tool for the user's request:\n- break_into_actions: decompose the selected outcome into 3–7 specific executable actions. Use the user's known durations from context for time estimates. If a task type has no known duration in context, put it in questions[] instead of guessing. Propose realistic estimates only.\n- brain_dump_to_outcomes: convert unstructured notes/text into structured outcomes and actions\n- bulk_reschedule: preview and apply deadline changes for multiple outcomes\n- prioritize_today: recommend what to focus on today based on deadlines and progress (read-only)\n\nIf the user's request doesn't map to a tool, respond conversationally.`;

    // Phase 2.2 — inject user context snapshot
    const contextSnapshot = userContextDb.getContextSnapshot();
    const contextBlock = contextSnapshot ? `\n\n${contextSnapshot}` : '';
    systemPrompt += contextBlock;

    // Phase 3.3 — inject pattern context if provided (AI Breakdown)
    if (context._patternContext) {
        systemPrompt += context._patternContext;
    }

    // Phase 4.1 — inject dependency context if provided
    if (context._dependencyContext) {
        systemPrompt += context._dependencyContext;
    }

    try {
        const response = await anthropic.messages.create({
            model:      'claude-sonnet-4-6',
            max_tokens: 4096,
            system:     systemPrompt,
            messages,
            tools:      TOOLS,
            tool_choice: { type: 'auto' },
        });

        console.log('✅ sendWithTools response — stop_reason:', response.stop_reason);

        const toolBlock = response.content.find(b => b.type === 'tool_use');
        if (toolBlock) {
            console.log('🔧 Tool used:', toolBlock.name);
            return { type: 'tool', tool_name: toolBlock.name, tool_input: toolBlock.input };
        }

        const textBlock = response.content.find(b => b.type === 'text');
        return { type: 'message', content: textBlock ? textBlock.text : '' };

    } catch (error) {
        console.error('❌ sendWithTools error:', error.message);
        throw error;
    }
}

/**
 * Batch triage a list of inbox items with Claude.
 * Returns clustered outcomes with proposed actions, plus any clarifying questions.
 *
 * @param {Array}  items           - Array of inbox item objects (id, title, description)
 * @param {string} contextSnapshot - User context snapshot from userContextDb.getContextSnapshot()
 * @returns {Promise<{ clusters: Array, questions: Array }>}
 */
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

async function summarizeFocusSession(conversation) {
  const formatted = conversation.map(m => `${m.role === 'user' ? 'User' : 'Claude'}: ${m.content}`).join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Summarize this Focus Mode work session in 3–5 sentences. Focus on what was decided, created, or learned. Be specific about outputs and next steps. Do not mention the word "summary".\n\n${formatted}`,
    }],
  });

  return response.content.find(b => b.type === 'text')?.text?.trim() || '';
}

async function* streamFocusMessage(systemPrompt, history, userMessage) {
  const messages = [
    ...history,
    { role: 'user', content: userMessage }
  ];

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}


// ============================================================
// Phase 3.2 — Auto-Tag Library Entry
// ============================================================

/**
 * Auto-tag a saved Library entry using Claude.
 * Returns { tags: string[], suggested_title: string }
 *
 * @param {string} content - The raw saved content to tag
 * @returns {Promise<{ tags: string[], suggested_title: string }>}
 */
async function autoTagLibraryEntry(content) {
  const tags = [
    'campaign_draft', 'pitch_deck', 'email', 'strategy',
    'outreach', 'analysis', 'plan', 'note'
  ];

  const prompt = `You are tagging a saved work output. Assign 1–3 tags from this list: ${tags.join(', ')}.
Also suggest a short display title (5–8 words max).

Content:
${content.slice(0, 800)}

Return valid JSON only, no markdown:
{ "tags": ["tag1", "tag2"], "suggested_title": "string" }`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 128,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '';
  const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try {
    return JSON.parse(json);
  } catch {
    return { tags: ['note'], suggested_title: content.slice(0, 50).trim() };
  }
}


// ============================================================
// Phase 3.3 — Auto-Tag Outcome on Archive
// ============================================================

/**
 * Auto-tag an archived outcome using Claude.
 * Returns an array of 1-2 tags from the consistent taxonomy.
 *
 * @param {string} outcomeTitle - Title of the archived outcome
 * @param {string} resultNote   - Optional result note from the user
 * @returns {Promise<string[]>} Array of 1-2 tags
 */
async function autoTagOutcome(outcomeTitle, resultNote) {
  const taxonomy = ['prospecting', 'pitch_deck', 'email_campaign', 'product', 'strategy', 'admin', 'research', 'client_work', 'reporting', 'other'];
  const prompt = `Assign 1-2 tags from this list to an archived outcome: ${taxonomy.join(', ')}.
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

// ============================================================
// Phase 4.2 — Archive Summary
// ============================================================

/**
 * Generate a 2-sentence professional summary of a completed outcome.
 *
 * @param {string} outcomeTitle  - Title of the archived outcome
 * @param {string} outcomeResult - 'hit' or 'miss'
 * @param {string|null} resultNote - Optional result note from the user
 * @returns {Promise<string>} 2-sentence summary, plain text
 */
async function generateOutcomeSummary(outcomeTitle, outcomeResult, resultNote) {
  const prompt = `Write a 2-sentence professional outcome summary. First sentence: what was accomplished. Second sentence: the key result or impact. Plain text, no markdown. Tone: professional, concise.

Outcome: "${outcomeTitle}"
Result: ${outcomeResult || 'completed'}
${resultNote ? `Result note: "${resultNote}"` : ''}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content.find(b => b.type === 'text')?.text?.trim() || '';
}

// ============================================================
// Focus Mode — Context Extraction
// ============================================================

async function extractContextUpdates(userMessage, existingKeys) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const existingList = existingKeys.length > 0 ? existingKeys.join(', ') : 'none';

  const prompt = `Today is ${today}.

Analyze this message someone sent to their AI assistant while working on a task. Extract ONLY information valuable to remember in future sessions — things like:
- What they're currently working on and why
- Constraints, deadlines, or blockers they mentioned
- Preferences or working patterns revealed
- Important context about their situation

Do NOT extract: questions they asked, casual phrasing, or task-specific details that won't matter later.
Do NOT duplicate existing keys: ${existingList}

Message: "${userMessage}"

Respond with ONLY a JSON array. Each item: {"key": "short label (under 40 chars)", "value": "what to remember, include date if time-sensitive", "category": "current_work|preferences|constraints|context"}. Return [] if nothing meaningful to save.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content.find(b => b.type === 'text')?.text?.trim() || '[]';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]);
  } catch (_) {
    return [];
  }
}

// ============================================================
// Advisor CRUD Tools
// ============================================================

const ADVISOR_TOOLS = [
  {
    name: 'mark_action_done',
    description: 'Toggle an action as done or undone.',
    input_schema: {
      type: 'object',
      properties: {
        action_id:    { type: 'number', description: 'The numeric ID of the action' },
        action_title: { type: 'string', description: 'Human-readable title for the confirmation prompt' },
        done:         { type: 'boolean', description: 'true = mark done, false = mark undone' },
      },
      required: ['action_id', 'action_title', 'done'],
    },
  },
  {
    name: 'create_action',
    description: 'Add a new action to an outcome.',
    input_schema: {
      type: 'object',
      properties: {
        outcome_id:    { type: 'number', description: 'ID of the outcome to add the action to' },
        outcome_title: { type: 'string', description: 'Human-readable outcome name for the confirmation prompt' },
        title:         { type: 'string', description: 'Action title' },
        time_estimate: { type: 'number', description: 'Estimated minutes (optional)' },
      },
      required: ['outcome_id', 'outcome_title', 'title'],
    },
  },
  {
    name: 'create_outcome',
    description: 'Create a new outcome.',
    input_schema: {
      type: 'object',
      properties: {
        title:    { type: 'string' },
        deadline: { type: 'string', description: 'ISO date string YYYY-MM-DD or null' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_outcome',
    description: 'Update an existing outcome — title, deadline, or status.',
    input_schema: {
      type: 'object',
      properties: {
        outcome_id:    { type: 'number' },
        outcome_title: { type: 'string', description: 'Current title for confirmation prompt' },
        updates: {
          type: 'object',
          description: 'Fields to update. Allowed: title, deadline, status, priority',
          properties: {
            title:    { type: 'string' },
            deadline: { type: 'string' },
            status:   { type: 'string' },
            priority: { type: 'string' },
          },
        },
      },
      required: ['outcome_id', 'outcome_title', 'updates'],
    },
  },
];

/**
 * Send a message to Claude in Advisor mode with CRUD tools.
 * Returns either a tool_call (for client-side approval) or a plain message.
 *
 * @param {string} message              - The user's message (may be empty if continuing after tool_result)
 * @param {Array}  conversationHistory  - Previous messages
 * @param {string} contextSnapshot      - Formatted context string from formatContextForPrompt()
 * @returns {Promise<Object>}
 */
async function sendAdvisorMessage(message, conversationHistory = [], contextSnapshot = '') {
  // Only append user message if non-empty; if empty the last item in history is already the user turn
  const messages = message
    ? [...conversationHistory, { role: 'user', content: message }]
    : [...conversationHistory];

  const systemPrompt = `You are the Waypoint Advisor — a focused, direct thinking partner embedded in the user's execution OS. You have full context of their outcomes, actions, and daily reviews.

You can take actions on the user's behalf using your tools. ALWAYS describe what you're about to do before calling a tool, so the user knows what to expect. Only call ONE tool at a time.

When a user asks you to do something that maps to a tool, use the tool. When they're just asking questions or thinking out loud, respond conversationally.

${contextSnapshot ? contextSnapshot : ''}`;

  const response = await anthropic.messages.create({
    model:       'claude-sonnet-4-6',
    max_tokens:  1024,
    system:      systemPrompt,
    tools:       ADVISOR_TOOLS,
    tool_choice: { type: 'auto' },
    messages,
  });

  // If Claude used a tool, return the tool call for client-side approval
  if (response.stop_reason === 'tool_use') {
    const toolUse   = response.content.find(b => b.type === 'tool_use');
    const textBefore = response.content.find(b => b.type === 'text')?.text || null;
    return {
      type:              'tool_call',
      tool_use_id:       toolUse.id,
      tool_name:         toolUse.name,
      tool_input:        toolUse.input,
      text_before:       textBefore,
      assistant_content: response.content,
    };
  }

  // Plain text response
  return {
    type: 'message',
    text: response.content.find(b => b.type === 'text')?.text || '',
  };
}

// ============================================================
// Phase 3.0 — Today Plan Functions
// ============================================================

/**
 * Generate a committed day proposal based on available calendar windows,
 * active outcomes/actions, and user context.
 *
 * @param {Array}  windows         - Open work windows from googleCalendar.getOpenWindows()
 * @param {Array}  outcomes        - Active outcomes with their actions
 * @param {string} contextSnapshot - User context from userContextDb.getContextSnapshot()
 * @returns {Promise<Object>} { committed_actions, available_minutes, committed_minutes, flags, overcommitted }
 */
async function proposeTodayPlan(windows, outcomes, contextSnapshot, blockedOutcomeIds = []) {
  const windowStr = windows.map(w =>
    `${new Date(w.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(w.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${w.duration_minutes} min`
  ).join('\n');

  const outcomeStr = outcomes.map(o =>
    `Outcome: ${o.outcome_title}${o.deadline ? ` (due ${o.deadline})` : ''}\n` +
    (o.actions || []).map(a => `  - [id:${a.id}] ${a.title} [${a.energy_type || 'deep'}, ${a.time_estimate || '?'} min]`).join('\n')
  ).join('\n\n');

  const contextBlock = contextSnapshot ? `\nUser work patterns:\n${contextSnapshot}\n` : '';

  const blockedNote = blockedOutcomeIds.length > 0
    ? `\n\nBlocked outcomes (do NOT commit to today's plan — they have unresolved upstream dependencies): outcome IDs [${blockedOutcomeIds.join(', ')}]\n`
    : '';

  const prompt = `You are planning someone's workday. Today's available work windows:
${windowStr}
${contextBlock}
Active outcomes and their next actions:
${outcomeStr}
${blockedNote}
Instructions:
1. Select the highest-priority actions that fit within available time
2. Match deep-energy actions to larger blocks, light actions to smaller windows
3. Flag any deadline risk
4. Return valid JSON only — no markdown, no explanation

Response format:
{
  "committed_actions": [
    { "action_id": number, "outcome_id": number, "reason": "string" }
  ],
  "available_minutes": number,
  "committed_minutes": number,
  "flags": ["string"],
  "overcommitted": boolean
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '';
  const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try {
    return JSON.parse(json);
  } catch (e) {
    throw new Error(`Today proposal parse error: ${e.message}`);
  }
}

/**
 * Generate a mid-day recommendation based on remaining tasks and calendar.
 *
 * @param {Array}  remainingActionIds - Action IDs not yet completed
 * @param {Array}  windows            - Open work windows
 * @param {Array}  calendarEvents     - Today's events
 * @returns {Promise<string>} One-sentence recommendation (plain text)
 */
async function generateTodayRecommendation(remainingActionIds, windows, calendarEvents) {
  if (!remainingActionIds.length) return 'All planned tasks complete. Solid day.';

  const now = new Date();
  const nextEvent = calendarEvents
    .filter(e => new Date(e.start_at) > now)
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0];

  const currentWindow = windows.find(w =>
    new Date(w.start_at) <= now && new Date(w.end_at) >= now
  );

  const prompt = `Mid-day assessment for a productivity app. In one sentence, tell the user what to do next. Be specific: name the current work window time if available, mention the next meeting if there is one, and reference that there's still work remaining. Plain text, no markdown. Max 25 words.

Current time: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
Current block: ${currentWindow ? `${new Date(currentWindow.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(currentWindow.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'none'}
Next meeting: ${nextEvent ? `${nextEvent.title} at ${new Date(nextEvent.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'none'}
Remaining tasks: ${remainingActionIds.length}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content.find(b => b.type === 'text')?.text?.trim() || '';
}

module.exports = { sendMessage, classifyForInbox, sendWithTools, streamFocusMessage, batchTriageInbox, summarizeFocusSession, proposeTodayPlan, generateTodayRecommendation, autoTagLibraryEntry, autoTagOutcome, generateOutcomeSummary, extractContextUpdates, sendAdvisorMessage };
