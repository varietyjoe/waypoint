const Anthropic = require('@anthropic-ai/sdk');

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
        description: 'Break the given outcome into a concrete list of actions with time and energy estimates. Called when a user wants to decompose an outcome into executable steps.',
        input_schema: {
            type: 'object',
            properties: {
                actions: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            title:         { type: 'string' },
                            time_estimate: { type: 'integer', description: 'Estimated minutes' },
                            energy_type:   { type: 'string', enum: ['deep', 'light'] },
                        },
                        required: ['title', 'energy_type'],
                    },
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
async function sendMessage(message, conversationHistory = [], preview = false) {
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

        const systemPrompt = `You are a helpful AI assistant integrated into Waypoint, a personal execution OS.

Today's date: ${todayStr} (${dayOfWeek})

Waypoint organizes work as: Projects → Outcomes → Actions.
- An Outcome is a meaningful deliverable (e.g. "Launch Q1 product update")
- An Action is a specific task within an outcome (e.g. "Write release notes")

Respond concisely and helpfully. AI tools for creating/managing outcomes and actions are coming in a future update.`;

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

    systemPrompt += `\nUse the most appropriate tool for the user's request:\n- break_into_actions: decompose an outcome into specific executable actions\n- brain_dump_to_outcomes: convert unstructured notes/text into structured outcomes and actions\n- bulk_reschedule: preview and apply deadline changes for multiple outcomes\n- prioritize_today: recommend what to focus on today based on deadlines and progress (read-only)\n\nIf the user's request doesn't map to a tool, respond conversationally.`;

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

module.exports = { sendMessage, classifyForInbox, sendWithTools };
