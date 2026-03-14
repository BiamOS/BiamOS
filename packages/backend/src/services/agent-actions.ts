// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — AI Browser Agent (Action Loop)
// ============================================================
// Receives screenshot + DOM snapshot from the frontend,
// asks the LLM to decide the next action, and streams
// structured action responses back via SSE.
//
// The LLM gets tools: click, type, scroll, wait, done, ask_user
// Each tool call is streamed as a JSON event to the frontend
// which executes it via webview.executeJavaScript().
// ============================================================

import { getChatUrl, getHeaders } from "./llm-provider.js";
import { log } from "../utils/logger.js";
import { MODEL_THINKING } from "../config/models.js";
import { logTokenUsage, incrementAgentUsage } from "../server-utils.js";

// ─── Types ──────────────────────────────────────────────────

export interface AgentRequest {
    task: string;              // User's instruction, e.g. "find important email"
    page_url: string;
    page_title: string;
    dom_snapshot: string;      // Simplified DOM with selectors
    screenshot?: string;       // Base64 PNG
    history?: AgentStep[];     // Previous actions in this session
}

export interface AgentStep {
    action: string;
    selector?: string;
    value?: string;
    description: string;
    result?: string;           // What happened after execution
}

// ─── Tool Definitions ───────────────────────────────────────

const AGENT_TOOLS = [
    {
        type: "function" as const,
        function: {
            name: "click_at",
            description: "Click at specific x,y coordinates on the page. Use the rect.x and rect.y values from the DOM snapshot (center of the element = x + w/2, y + h/2). You can also try a CSS selector as fallback.",
            parameters: {
                type: "object",
                properties: {
                    x: {
                        type: "number",
                        description: "X coordinate (pixels from left edge of page)",
                    },
                    y: {
                        type: "number",
                        description: "Y coordinate (pixels from top edge of page)",
                    },
                    selector: {
                        type: "string",
                        description: "Optional: CSS selector as fallback if coordinate click doesn't work",
                    },
                    description: {
                        type: "string",
                        description: "Brief description of what you're clicking and why",
                    },
                },
                required: ["x", "y", "description"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "type_text",
            description: "Click on an input/textarea/contenteditable element at x,y coordinates and type text into it. Use the rect field from the DOM snapshot to calculate the center of the element.",
            parameters: {
                type: "object",
                properties: {
                    x: {
                        type: "number",
                        description: "X coordinate of the input element (center of rect)",
                    },
                    y: {
                        type: "number",
                        description: "Y coordinate of the input element (center of rect)",
                    },
                    text: {
                        type: "string",
                        description: "The text to type",
                    },
                    clear_first: {
                        type: "boolean",
                        description: "If true, clear existing text before typing (default: true)",
                    },
                    description: {
                        type: "string",
                        description: "Brief description of what you're typing and why",
                    },
                },
                required: ["x", "y", "text", "description"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "scroll",
            description: "Scroll the page up or down to reveal more content.",
            parameters: {
                type: "object",
                properties: {
                    direction: {
                        type: "string",
                        enum: ["up", "down"],
                        description: "Scroll direction",
                    },
                    amount: {
                        type: "number",
                        description: "Pixels to scroll (default: 400)",
                    },
                    description: {
                        type: "string",
                        description: "Brief description of why you're scrolling",
                    },
                },
                required: ["direction", "description"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "navigate",
            description: "Navigate the browser to a different URL. Use this when you need to go to a completely different website (e.g. from Gmail to YouTube). Do NOT use this to click links on the current page — use click_at for that.",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description: "The full URL to navigate to (e.g. https://youtube.com)",
                    },
                    description: {
                        type: "string",
                        description: "Brief description of why you're navigating",
                    },
                },
                required: ["url", "description"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "done",
            description: "The task is complete. Provide a summary of what was accomplished.",
            parameters: {
                type: "object",
                properties: {
                    summary: {
                        type: "string",
                        description: "Summary of what was accomplished",
                    },
                },
                required: ["summary"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "ask_user",
            description: "Pause and ask the user for confirmation or input. Use this BEFORE any destructive or irreversible action (sending emails, deleting, purchasing, submitting forms, posting).",
            parameters: {
                type: "object",
                properties: {
                    question: {
                        type: "string",
                        description: "The question or confirmation prompt for the user",
                    },
                    context: {
                        type: "string",
                        description: "Brief context about what will happen if user confirms",
                    },
                },
                required: ["question"],
            },
        },
    },
];

// ─── System Prompt ──────────────────────────────────────────

function buildAgentPrompt(task: string, pageUrl: string, pageTitle: string, history: AgentStep[]): string {
    const historyBlock = history.length > 0
        ? `\nACTIONS TAKEN SO FAR:\n${history.map((s, i) => `${i + 1}. ${s.action}(${s.selector ? `at ${s.selector}` : ''}) — ${s.description}${s.result ? ` → ${s.result}` : ''}`).join('\n')}\n`
        : '';

    return `You are BiamOS Agent — an AI that controls a web browser to complete tasks for the user.
You can see a screenshot of the current page and a snapshot of the interactive DOM elements with coordinate positions.

CURRENT PAGE: ${pageUrl} (${pageTitle})
USER TASK: "${task}"
${historyBlock}
═══════════════════════════════════════════════════
CORE RULES:
═══════════════════════════════════════════════════
1. Analyze the screenshot AND DOM snapshot together to understand the current state.
2. Call exactly ONE tool per step. Never chain multiple actions.
3. Each DOM element has a "rect" field {x, y, w, h}. Click using CENTER: x + w/2, y + h/2.
4. Describe each action clearly in the user's language.
5. Maximum 15 steps. If not done by then, call done with a partial summary.

═══════════════════════════════════════════════════
SAFETY RULES:
═══════════════════════════════════════════════════
6. **SEND/SUBMIT/DELETE**: Before ANY action that sends, submits, deletes, purchases, or posts — ALWAYS call ask_user first! Include what will be sent.
7. **LOGIN/AUTH**: If you see a login page, password field, profile picker, 2FA, or CAPTCHA — IMMEDIATELY call ask_user. Say "I found a login page — please log in and tell me to continue." NEVER enter credentials.

═══════════════════════════════════════════════════
INTERACTION RULES (critical for accuracy):
═══════════════════════════════════════════════════
8. **CHECK HISTORY FIRST**: Before ANY action, read the ACTIONS TAKEN SO FAR section. If you already performed an action (e.g. clicked "Compose"), do NOT do it again — even if the UI hasn't visually changed yet. The action is recorded, trust it.
9. **NO REPEATED ACTIONS**: NEVER perform the same action twice in a row. If click_at was already called on a button, it worked. Move to the NEXT step.
10. **VERIFY VIA SCREENSHOT**: After a click that should open a dialog/modal/menu, analyze the NEW screenshot to verify before interacting with the new UI. If nothing changed, the page may be loading — wait or call ask_user.
11. **COORDINATE PRECISION**: Always use click_at with x,y from DOM snapshot rect. If an element is hidden or overlapped, try a different element.
12. **SMART RETRY**: If you clicked a position and nothing changed, try a DIFFERENT approach — never repeat the exact same action.
13. **TASK COMPLETION**: If the user asks to "open", "click", or "go to" something — click it ONCE and call done immediately. Do NOT click multiple items. One click = task done.
14. **PAGE CHANGED = SUCCESS**: If you clicked a link/video/result and the page URL or content changed — the click worked! Call done with a summary. Do NOT click another item.

═══════════════════════════════════════════════════
FORM & TEXT RULES:
═══════════════════════════════════════════════════
13. **COMPLETE TEXT IN ONE CALL**: When typing email bodies, messages, or any long text — compose the ENTIRE text in a SINGLE type_text call. Do NOT split text across multiple steps. Include greeting, body paragraphs, and sign-off all at once. After typing, proceed to the NEXT action (e.g. call ask_user or done) — do NOT re-type.
14. **NO RE-TYPING**: If ACTIONS TAKEN SO FAR shows a type_text result starting with "✓", that field is DONE. Do NOT type in the same field again. Move to the next step or call done/ask_user.
15. **TAB NAVIGATION**: In forms (email compose, contact forms), after filling one field, add "\\t" at the end to Tab to the next field instead of clicking.
16. **ENTER TO CONFIRM**: In "To" fields, add "\\n" after the email address to confirm. In search fields, add "\\n" to submit.
16. **CONTEXTUAL WRITING**: When composing text (emails, replies, messages):
    - Match the LANGUAGE of the conversation (English email → English reply, German → German)
    - Match the TONE (formal/informal) and STYLE
    - Write substantive, helpful responses — NOT generic one-liners
    - Reference specific details from context to show engagement
    - For emails: include proper greeting, body paragraphs, and sign-off
17. **NAVIGATION**: If the task requires going to a DIFFERENT website (e.g. "open YouTube", "go to Wikipedia"), use the navigate tool with the full URL. Do NOT try to search for it or click links — just navigate directly.
18. **LANGUAGE**: Always match the user's language in descriptions and composed text.`;
}

// ─── Stream Agent Step ──────────────────────────────────────

export async function streamAgentStep(
    ctx: AgentRequest,
    onEvent: (event: string) => void,
): Promise<void> {
    const systemPrompt = buildAgentPrompt(ctx.task, ctx.page_url, ctx.page_title, ctx.history || []);

    const messages: { role: string; content: any }[] = [
        { role: "system", content: systemPrompt },
    ];

    // Add screenshot + DOM as user message
    const userContent: any[] = [
        { type: "text", text: `DOM Snapshot (interactive elements with CSS selectors):\n\`\`\`\n${ctx.dom_snapshot}\n\`\`\`\n\nAnalyze the page and decide the next action to complete the task: "${ctx.task}"` },
    ];

    if (ctx.screenshot) {
        userContent.push({
            type: "image_url",
            image_url: { url: `data:image/png;base64,${ctx.screenshot}` },
        });
    }

    messages.push({ role: "user", content: userContent });

    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("agent-actions");

        log.debug(`  🤖 Agent: sending step request for task "${ctx.task.substring(0, 50)}..." (${ctx.history?.length || 0} steps so far)`);

        // Stream thinking to show the user what the AI is considering
        onEvent(`data: ${JSON.stringify({ type: "thinking", content: "Analyzing page..." })}\n\n`);

        const response = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_THINKING,
                messages,
                tools: AGENT_TOOLS,
                tool_choice: "required",  // Force a tool call
                temperature: 0.2,         // Low temp for precise actions
                max_tokens: 5000,         // Plenty of room for full email composition
            }),
        });

        if (!response.ok) {
            log.error(`  ❌ Agent LLM error: ${response.status}`);
            onEvent(`data: ${JSON.stringify({ type: "error", message: "LLM request failed" })}\n\n`);
            return;
        }

        const result = await response.json();
        await logTokenUsage("agent:browser-agent", MODEL_THINKING, result.usage ?? {});
        await incrementAgentUsage("browser-agent", result.usage ?? {});

        const message = result.choices?.[0]?.message;

        if (!message?.tool_calls || message.tool_calls.length === 0) {
            // No tool call — LLM might have given text content instead
            const content = message?.content?.trim() || "I'm not sure what to do next.";
            onEvent(`data: ${JSON.stringify({ type: "action", action: "done", args: { summary: content } })}\n\n`);
            return;
        }

        const toolCall = message.tool_calls[0];
        const actionName = toolCall.function?.name || "unknown";
        let args: Record<string, any> = {};
        try {
            args = JSON.parse(toolCall.function?.arguments || "{}");
        } catch {
            args = { description: "Could not parse action" };
        }

        log.debug(`  🤖 Agent action: ${actionName}(${JSON.stringify(args).substring(0, 100)})`);

        // Stream the action to the frontend
        onEvent(`data: ${JSON.stringify({
            type: "action",
            action: actionName,
            args,
        })}\n\n`);

    } catch (err) {
        log.error("  💥 Agent step error:", err);
        onEvent(`data: ${JSON.stringify({ type: "error", message: "Agent error occurred" })}\n\n`);
    }
}
