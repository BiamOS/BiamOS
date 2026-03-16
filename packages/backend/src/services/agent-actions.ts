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
import { lookupWorkflow, extractDomain } from "./agent-memory.js";

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
            name: "click",
            description: "Click an interactive element by its Set-of-Mark ID [number] from the DOM snapshot. This is the PREFERRED way to click — each element in the snapshot has an ID like [0], [1], [2]. Use this instead of click_at whenever possible.",
            parameters: {
                type: "object",
                properties: {
                    id: {
                        type: "number",
                        description: "The Set-of-Mark ID of the element to click (e.g., 7 for element [7] in the DOM snapshot)",
                    },
                    description: {
                        type: "string",
                        description: "Brief description of what you're clicking and why",
                    },
                },
                required: ["id", "description"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "click_at",
            description: "Click at specific x,y coordinates on the page. This is a FALLBACK — prefer click(id) when the element is in the DOM snapshot. Use this only for elements NOT listed in the snapshot, or when you need to click a specific pixel location.",
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
    {
        type: "function" as const,
        function: {
            name: "go_back",
            description: "Go back to the previous page (like pressing the browser back button). Use this after navigating to another site to return to where you were. For example: compose email on Gmail → navigate to YouTube → search → go_back to Gmail (draft is auto-saved).",
            parameters: {
                type: "object",
                properties: {
                    description: {
                        type: "string",
                        description: "Brief description of why you're going back",
                    },
                },
                required: ["description"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "search_web",
            description: "Search the web WITHOUT leaving the current page. Use this to look up information (YouTube videos, Wikipedia facts, news, etc.) while staying on the current page. The search runs in the background and returns results as text. ALWAYS prefer this over navigate when you need to FIND information from another site.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The search query (e.g. 'AI agent demo YouTube', 'latest Hacker News stories')",
                    },
                    description: {
                        type: "string",
                        description: "Brief description of what you're searching for and why",
                    },
                },
                required: ["query", "description"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "take_notes",
            description: "Save important observations, facts, or content to your scratchpad. These notes persist across page navigations and are visible in your action history. CRITICAL: Before navigating away from a page, ALWAYS use take_notes to save any information you'll need later (e.g., product descriptions, article summaries, key facts). Without this, you will FORGET everything on the current page when you navigate.",
            parameters: {
                type: "object",
                properties: {
                    notes: {
                        type: "string",
                        description: "The information to remember. Be specific and detailed — include names, descriptions, key facts, URLs.",
                    },
                },
                required: ["notes"],
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
You can see a screenshot of the current page and a snapshot of the interactive DOM elements.

CURRENT PAGE: ${pageUrl} (${pageTitle})
USER TASK: "${task}"
${historyBlock}
═══════════════════════════════════════════════════
CORE RULES:
═══════════════════════════════════════════════════
0. You are an EXECUTOR, not a chatbot. The user's task is a COMMAND to perform in the browser, not a question to answer. If the task says "write a tweet about X" — you must navigate to Twitter, compose the tweet with appropriate content, and post it. NEVER respond with text — ALWAYS take browser actions.
1. Analyze the screenshot AND DOM snapshot together to understand the current state.
2. Call exactly ONE tool per step. Never chain multiple actions.
3. **SET-OF-MARK IDs**: Each element in the DOM snapshot has an ID like [0], [1], [2]. Use click(id: 7) to click element [7]. This is MORE RELIABLE than click_at(x, y) because coordinates are resolved exactly. ALWAYS prefer click(id) over click_at(x, y).
4. Use click_at(x, y) ONLY for elements NOT listed in the snapshot (e.g., custom UI components, canvas, visual elements).
5. Describe each action clearly in the user's language.
6. **DONE = FULLY COMPLETE**: Only call done when EVERY part of the user's task is finished. If the task says "do X, then Y, then Z" — you must complete ALL of X, Y, AND Z before calling done. Never call done with "I will now..." — actually DO it first, then call done.
7. You have up to 40 steps. Use them all if needed to complete the full task.

═══════════════════════════════════════════════════
PRECISION & INTENT RULES:
═══════════════════════════════════════════════════
8. **FOLLOW USER INTENT EXACTLY**: Parse the user's request word-by-word. Words like "newest/latest/most recent" mean you MUST sort/filter by date — you cannot just click the first result from a Google search. Words like "cheapest" mean sort by price. Words like "most viewed/popular" mean sort by views. NEVER take shortcuts.
9. **GO TO THE SOURCE**: When the user names a specific platform (YouTube, Twitter, Amazon, etc.), you MUST navigate to that platform and perform the action there. Example: "find the newest video from X on YouTube" → navigate to youtube.com → search for X → sort by upload date → click the newest. Do NOT Google-search for it as a shortcut.
10. **VERIFY CORRECTNESS**: Before calling done, verify that your result actually matches what the user asked for. If they said "newest" — check the upload date. If they said "from channel X" — verify the channel name.

═══════════════════════════════════════════════════
PLANNING RULES (for multi-step tasks):
═══════════════════════════════════════════════════
11. **PLAN FIRST**: For complex tasks involving multiple websites or multiple phases, mentally break the task into phases BEFORE acting. Example: "find newest video from X on YouTube and play it" → Phase 1: navigate to YouTube → Phase 2: search for X → Phase 3: use YouTube filters for newest → Phase 4: click the video → done.
12. **TAKE NOTES BEFORE NAVIGATING**: Before navigating away from a page, ALWAYS call take_notes to save everything you'll need later. When you navigate to a new page, you LOSE all information about the previous page — the screenshot and DOM snapshot will show the NEW page only. Your notes in the action history are the ONLY way to carry information across pages.
13. **READ EFFICIENTLY**: When reading a page, scroll 2-3 times and take ONE set of notes summarizing the key points. Do NOT take notes after every scroll — scroll first to get the full picture, then take ONE comprehensive note. LIMIT: spend at most 4-5 steps reading ANY single page before moving to the next phase of your task. You do NOT need to read every word.
14. **NEVER GUESS URLs**: If you are not 100% certain of a website's exact URL, use search_web first to find it. Do NOT guess spellings. If navigate fails, use search_web to find the correct URL and try again.

═══════════════════════════════════════════════════
SAFETY RULES:
═══════════════════════════════════════════════════
15. **ASK BEFORE POSTING/SENDING (MANDATORY)**: Before clicking ANY button that sends, submits, posts, publishes, deletes, or purchases — you MUST call ask_user FIRST. Show the user EXACTLY what will be sent/posted. This applies to: Post buttons, Send buttons, Submit buttons, Reply buttons, Tweet/Post buttons, Delete buttons, Buy/Purchase buttons. NO EXCEPTIONS — even if the user's task says "post it", you must confirm the content first.
16. **LOGIN/AUTH**: If you see a login page, password field, profile picker, 2FA, or CAPTCHA — IMMEDIATELY call ask_user. Say "I found a login page — please log in and tell me to continue." NEVER enter credentials.

═══════════════════════════════════════════════════
INTERACTION RULES (critical for accuracy):
═══════════════════════════════════════════════════
17. **CHECK HISTORY FIRST**: Before ANY action, read the ACTIONS TAKEN SO FAR section. If you already performed an action (e.g. clicked "Compose"), do NOT do it again — even if the UI hasn't visually changed yet. The action is recorded, trust it.
18. **NO REPEATED ACTIONS**: NEVER perform the same action twice in a row. If click was already called on a button, it worked. Move to the NEXT step.
19. **VERIFY VIA SCREENSHOT**: After a click that should open a dialog/modal/menu, analyze the NEW screenshot to verify before interacting with the new UI. If nothing changed, the page may be loading — wait or call ask_user.
20. **VERIFY AFTER TYPING**: After typing text into a compose area, ALWAYS check the screenshot for error indicators BEFORE clicking submit/post/send. Look for: red character counters (e.g. "-33"), error messages, warning banners, disabled buttons. If the text is too long, SHORTEN it first, then try again.
21. **SMART RETRY**: If you clicked an element and nothing changed, try a DIFFERENT approach — never repeat the exact same action.
22. **TASK COMPLETION**: If the user asks to "open", "click", or "go to" something — click it ONCE and call done immediately. Do NOT click multiple items. One click = task done.
23. **PAGE CHANGED = SUCCESS**: If you clicked a link/video/result and the page URL or content changed — the click worked! Call done with a summary. Do NOT click another item.

═══════════════════════════════════════════════════
FORM & TEXT RULES:
═══════════════════════════════════════════════════
24. **COMPLETE TEXT IN ONE CALL**: When typing email bodies, messages, or long text — write the COMPLETE text in ONE type_text call. Include greeting + all paragraphs + sign-off in ONE call. CRITICAL: if you call type_text on the same field twice, the SECOND call OVERWRITES the first! So NEVER split body text across multiple type_text calls.
25. **NO RE-TYPING (CRITICAL)**: If ACTIONS TAKEN SO FAR shows ANY type_text with "✓", that field is DONE. STOP typing. Call done or ask_user IMMEDIATELY. Repeating a type_text that already shows ✓ is a FATAL ERROR — you will overwrite the content and loop forever.
26. **TAB BETWEEN FIELDS (CRITICAL)**: In email compose and forms, use "\\\\t" at end of text to Tab to next field. NEVER click on Subject separately — always Tab from To to Subject! Email flow: type_text("email\\\\n") in To, then type_text("Subject text\\\\t") tabs to body, then type_text("Body text") in body area.
27. **ENTER TO CONFIRM**: Use "\\\\n" at end to confirm in To fields and submit in search fields.
28. **CONTEXTUAL WRITING**: When composing text (emails, replies, messages):
    - Match the LANGUAGE of the conversation (English email → English reply, German → German)
    - Match the TONE (formal/informal) and STYLE
    - Write substantive, helpful responses — NOT generic one-liners
    - Reference specific details from context to show engagement
    - For emails: include proper greeting, body paragraphs, and sign-off
29. **CLICK BEFORE TYPING (CRITICAL)**: Many modern editors (Twitter, Notion, Slack) only activate their editable area AFTER you click on it. ALWAYS use click on a compose/text area FIRST, wait for the next step, then use type_text. Look for elements with role="textbox" or placeholder text like "What's happening?" — click them to activate the editor.
30. **FIND COMPOSE AREAS**: Look for [role=textbox], [contenteditable], or elements with placeholder text. On Twitter/X, the "What's happening?" area is a [role=textbox] — click it first to activate the editor, then type_text in the next step.

═══════════════════════════════════════════════════
NAVIGATION RULES:
═══════════════════════════════════════════════════
31. **NAVIGATE vs SEARCH_WEB**: Use navigate to go to a website when the user mentions a specific platform by name (YouTube, Twitter, Gmail, Amazon, etc.) or when you need to INTERACT with a site (play a video, compose a tweet, buy a product). Use search_web ONLY when you need to LOOK UP information in the background without leaving the current page (e.g., "compose an email mentioning the latest tech news" — use search_web to find news, stay on Gmail).
32. **SITE-SPECIFIC STRATEGIES**:
    - **YouTube**: To find the newest video from a channel → navigate to youtube.com → search for the channel → go to the channel page → click "Videos" tab → videos are sorted by newest first by default → click the first (top-left) video.
    - **Twitter/X**: To find a user's latest tweet → navigate to x.com → search for the user → go to their profile → the timeline shows newest first → interact with the first tweet.
    - **Amazon**: To find cheapest product → search → use sort/filter by price.
33. **LANGUAGE**: Always match the user's language in descriptions and composed text.
34. **DOM-DIFF FEEDBACK**: If a step result contains "⚠️ [NO DOM CHANGE]", your click/action had no visible effect on the page. The element may be wrong, blocked by an overlay, or not interactive. Try a DIFFERENT element or approach — never retry the same action.`;
}

// ─── Stream Agent Step ──────────────────────────────────────

export async function streamAgentStep(
    ctx: AgentRequest,
    onEvent: (event: string) => void,
): Promise<void> {
    let systemPrompt = buildAgentPrompt(ctx.task, ctx.page_url, ctx.page_title, ctx.history || []);

    // ── Local Action Memory: RAG lookup ──
    // Check if we have a known workflow for this domain + intent
    try {
        const domain = extractDomain(ctx.page_url);
        const match = await lookupWorkflow(domain, ctx.task);
        if (match) {
            const stepsText = match.steps
                .map((s, i) => `${i + 1}. ${s.action}${s.value ? `("${s.value}")` : ''} — ${s.description}`)
                .join('\n');
            systemPrompt += `\n\n═══════════════════════════════════════════════════
KNOWN WORKFLOW (from ${match.verified ? 'verified ✅' : `${match.success_count}x successful`} previous runs):
═══════════════════════════════════════════════════
A similar task on ${match.domain} has succeeded before with this path:
${stepsText}

Follow this path if the page structure looks similar. If the DOM has changed significantly, fall back to your standard reasoning.`;
            log.debug(`  🧠 Memory: injected workflow #${match.id} into prompt (${match.steps.length} steps)`);
        }
    } catch (err) {
        log.debug(`  🧠 Memory: lookup error (non-fatal): ${err}`);
    }

    const messages: { role: string; content: any }[] = [
        { role: "system", content: systemPrompt },
    ];

    // Add screenshot + DOM as user message
    const userContent: any[] = [
        { type: "text", text: `DOM Snapshot (interactive elements with Set-of-Mark IDs):\n\`\`\`\n${ctx.dom_snapshot}\n\`\`\`\n\nUse click(id: N) to interact with elements by their [N] ID. Analyze the page and decide the next action to complete the task: "${ctx.task}"` },
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
