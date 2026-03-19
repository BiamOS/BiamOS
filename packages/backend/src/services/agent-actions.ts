// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — AI Browser Agent (Action Loop)
// ============================================================
// Receives screenshot + DOM snapshot from the frontend,
// asks the LLM to decide the next action, and streams
// structured action responses back via SSE.
//
// ARCHITECTURE: The backend is a STATELESS inference engine.
// All safety guards (max steps, repetition, stuck detection)
// live in the frontend (safety.ts). The backend only:
// 1. Builds the system prompt
// 2. Calls the LLM
// 3. Streams the response back
// ============================================================

import { getChatUrl, getHeaders } from "./llm-provider.js";
import { log } from "../utils/logger.js";
import { MODEL_THINKING } from "../config/models.js";
import { logTokenUsage, incrementAgentUsage } from "../server-utils.js";
import { lookupWorkflow, extractDomain } from "./agent-memory.js";
import * as fs from 'fs';
import * as path from 'path';

// ─── Feature Flags ──────────────────────────────────────────
// Set to true to enable workflow memory injection.
// Keep false during development until core DOM interactions are 100% stable.
const USE_MEMORY = false;

// Debug log file for full LLM payload auditing
const DEBUG_LOG_PATH = path.join(process.cwd(), 'agent-debug.log');

// ─── Types ──────────────────────────────────────────────────

export interface AgentRequest {
    task: string;              // User's instruction, e.g. "find important email"
    page_url: string;
    page_title: string;
    dom_snapshot: string;      // Simplified DOM with selectors
    screenshot?: string;       // Base64 PNG
    history?: AgentStep[];     // Previous actions in this session
    step_number?: number;      // Current step (from frontend SSOT)
    max_steps?: number;        // Max steps limit (from frontend SSOT)
}

export interface AgentStep {
    action: string;
    selector?: string;
    value?: string;
    description: string;
    result?: string;           // What happened after execution
}

// ─── Tool Definitions ───────────────────────────────────────
// Each tool includes a phase tag and cost indicator in its contract.
// Phases: RESEARCH (gathering info), PRESENT (rendering data), ACTION (DOM interaction)

const AGENT_TOOLS = [
    // ── RESEARCH Phase Tools ────────────────────────────────
    {
        type: "function" as const,
        function: {
            name: "search_web",
            description: "[RESEARCH · Cost: very low] Primary engine for broad discovery. Fast, stateless, multi-source. Searches the web WITHOUT leaving the current page. Returns structured results (titles, snippets, URLs). Use this for ALL information gathering — it's faster and cheaper than navigating. Max 3-4 calls per task. The user's current page stays untouched.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The search query (e.g. 'AI agent demo YouTube', 'latest Hacker News stories')",
                    },
                    description: {
                        type: "string",
                        description: "Brief description of what you're searching for and why (e.g. 'Searching for AI startups — source 2/4')",
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
            description: "[RESEARCH · Cost: zero] Your structured data extraction tool. Capture EVERYTHING you see as structured JSON items — the dashboard quality depends entirely on your notes.\n\nFor EMAILS: title=subject, source=sender, priority=urgent/normal/low, summary=2-3 sentence preview.\nFor ARTICLES: title=headline, source=publication, url=link, summary=key takeaway.\nFor PRODUCTS: title=name, details=description, summary=price + key feature.\n\nBe THOROUGH. More items with rich fields = better dashboard. Notes persist across navigations.",
            parameters: {
                type: "object",
                properties: {
                    context: {
                        type: "string",
                        description: "High-level summary of what was extracted and from where (e.g. '6 emails from Gmail inbox, 2 urgent')",
                    },
                    items: {
                        type: "array",
                        description: "Array of structured data items. Each item MUST have at least title + summary.",
                        items: {
                            type: "object",
                            properties: {
                                title: { type: "string", description: "Item title (email subject, article headline, product name)" },
                                url: { type: "string", description: "Direct link to the item (if available)" },
                                source: { type: "string", description: "Where the item came from (sender name, publication, website)" },
                                date: { type: "string", description: "Date/time of the item (any format)" },
                                category: { type: "string", description: "Category or type (e.g. 'email', 'article', 'product', 'task')" },
                                priority: { type: "string", enum: ["urgent", "high", "normal", "low"], description: "Priority level based on content" },
                                summary: { type: "string", description: "2-3 sentence summary of the item content" },
                                details: { type: "string", description: "Additional details, metadata, or full text if relevant" },
                            },
                            required: ["title", "summary"],
                        },
                    },
                },
                required: ["context", "items"],
            },
        },
    },

    // ── PRESENT Phase Tool (Phase Bridge) ───────────────────
    {
        type: "function" as const,
        function: {
            name: "genui",
            description: "[PRESENT · Phase Bridge · Cost: 1 LLM call] Renders a dashboard from collected research. TERMINAL — call ONCE after gathering data via search_web and optionally take_notes.\\n\\nBEST RESULTS: search_web first, optionally navigate 1-2 top URLs + take_notes for deeper content, then genui.\\nONLY for DASHBOARD/RESEARCH tasks. NEVER for action tasks (open, click, send, compose).",
            parameters: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string",
                        description: "Describe the dashboard purpose and summarize the data (e.g., 'Diablo 4 news: 3 articles read, key updates: Season 12, new class, patch notes'). Be specific about what content you extracted.",
                    },
                    data: {
                        type: "object",
                        description: "Pass as structured JSON with an 'items' array. Each item should have: {title, source, url, summary (real content, not just snippet), category, priority}. The richer and more detailed your data, the better the dashboard.",
                    },
                    description: {
                        type: "string",
                        description: "Brief description of the dashboard being generated.",
                    },
                },
                required: ["prompt", "description"],
            },
        },
    },

    // ── ACTION Phase Tools ──────────────────────────────────
    {
        type: "function" as const,
        function: {
            name: "click",
            description: "[ACTION · Cost: high] Click an interactive element by its Set-of-Mark ID [number] from the DOM snapshot. This is the PREFERRED click method — each element has an ID like [0], [1], [2]. Always prefer click(id) over click_at(x,y).",
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
            description: "[ACTION · Cost: high] Click at specific x,y pixel coordinates. FALLBACK only — use click(id) when the element exists in the DOM snapshot. Use this for elements NOT listed (custom UI, canvas, visual elements).",
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
            description: "[ACTION · Cost: high] Type text into a form field. PREFERRED: use 'id' from the DOM snapshot Set-of-Mark (e.g. [42] INPUT) for precise targeting. FALLBACK: use x,y coordinates only when the element is not in the SoM. Set submit_after=true for search bars.",
            parameters: {
                type: "object",
                properties: {
                    id: {
                        type: "number",
                        description: "PREFERRED: The Set-of-Mark ID from the DOM snapshot (e.g., 42 for [42] INPUT). Use this for precise element targeting — avoids coordinate-based click errors.",
                    },
                    x: {
                        type: "number",
                        description: "FALLBACK: X coordinate. Only use when 'id' is not available.",
                    },
                    y: {
                        type: "number",
                        description: "FALLBACK: Y coordinate. Only use when 'id' is not available.",
                    },
                    text: {
                        type: "string",
                        description: "The text to type",
                    },
                    clear_first: {
                        type: "boolean",
                        description: "If true, clear existing text via Ctrl+A → Delete before typing. Default: FALSE (appends). Set to true ONLY to REPLACE/correct existing content.",
                    },
                    submit_after: {
                        type: "boolean",
                        description: "If true, press Enter after typing to submit (use for search bars, login forms). Default: false.",
                    },

                    description: {
                        type: "string",
                        description: "Brief description of what you're typing and why",
                    },
                },
                required: ["id", "text", "description"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "scroll",
            description: "[ACTION · Cost: high] Scroll the page up or down to reveal more content.",
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
            description: "[ACTION · Cost: high] Heavy DOM interaction — navigate the browser to a different URL. Use ONLY when you need to go to a SPECIFIC website to INTERACT with it (compose, fill forms, log in, authenticated sessions). Do NOT use to click links on the current page (use click). Do NOT use for information gathering (use search_web).",
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
            name: "go_back",
            description: "[ACTION · Cost: high] Go back to the previous page (like the browser back button). Use after navigating away to return. Example: Gmail → YouTube → search → go_back to Gmail (draft auto-saved).",
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

    // ── ANY Phase Tools ─────────────────────────────────────
    {
        type: "function" as const,
        function: {
            name: "done",
            description: "[ANY Phase · Cost: zero] Terminal. The task is complete — summarize what was accomplished and exit.",
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
            description: "[ANY Phase · Cost: zero] Pause for human input. Use BEFORE any destructive/irreversible action (send, submit, delete, purchase, post). Also use to confirm open-ended research plans.",
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

// ─── History Compression ────────────────────────────────────
// RC-2 Fix: Prevents context window overflow by keeping only the
// last RECENT_WINDOW steps in full detail. Older steps become
// compact 1-line summaries. Result strings are always capped.

const RECENT_WINDOW = 5;
const RESULT_CAP_FULL = 200;
const RESULT_CAP_SUMMARY = 50;

export function compressHistory(history: AgentStep[]): string {
    if (history.length === 0) return '';

    const lines: string[] = [];
    const cutoff = Math.max(0, history.length - RECENT_WINDOW);

    for (let i = 0; i < history.length; i++) {
        const s = history[i];
        const num = i + 1;

        if (i < cutoff) {
            // Older steps: compact summary, heavily truncated result
            let rawResult = s.result || '';
            const markerIdx = rawResult.indexOf('__STRUCTURED__');
            if (markerIdx >= 0) rawResult = rawResult.substring(0, markerIdx).trim();
            const shortResult = rawResult ? ` → ${rawResult.substring(0, RESULT_CAP_SUMMARY)}` : '';
            lines.push(`${num}. ${s.action} — ${s.description}${shortResult}`);
        } else {
            // Recent steps: full detail, moderately capped result
            let rawResult = s.result || '';
            const markerIdx = rawResult.indexOf('__STRUCTURED__');
            if (markerIdx >= 0) rawResult = rawResult.substring(0, markerIdx).trim();
            const val = s.value ? `("${s.value.substring(0, 50)}")` : '';
            const result = rawResult ? ` → ${rawResult.substring(0, RESULT_CAP_FULL)}` : '';
            lines.push(`${num}. ${s.action}${val} — ${s.description}${result}`);
        }
    }

    return `\nACTIONS TAKEN SO FAR:\n${lines.join('\n')}\n`;
}

// ─── Collected Data Section ─────────────────────────────────
// RC-2/RC-5 Fix: Extracts search results and notes into a
// dedicated section at the END of the prompt, so the LLM always
// has research data in its attention window (regardless of how
// many steps have passed). This solves the "placeholder text" bug.

export function buildCollectedDataSection(history: AgentStep[]): string {
    const searchResults: string[] = [];
    const notes: string[] = [];

    for (const s of history) {
        if (s.action === 'search_web' && s.result) {
            // Strip the __STRUCTURED__ JSON blob — it's for the frontend genui action only,
            // NOT for the LLM prompt (it would add thousands of chars of JSON)
            let cleanResult = s.result;
            const structMarker = cleanResult.indexOf('__STRUCTURED__');
            if (structMarker >= 0) {
                cleanResult = cleanResult.substring(0, structMarker).trim();
            }
            searchResults.push(cleanResult);
        }
        if (s.action === 'take_notes' && s.result) {
            notes.push(s.result);
        }
    }

    if (searchResults.length === 0 && notes.length === 0) return '';

    let section = '\n═══════════════════════════════════════════════════\nCOLLECTED DATA (use this for composing text):\n═══════════════════════════════════════════════════';

    if (searchResults.length > 0) {
        section += '\n\n📎 SEARCH RESULTS:\n' + searchResults.join('\n---\n');
    }

    if (notes.length > 0) {
        section += '\n\n📝 NOTES:\n' + notes.join('\n---\n');
    }

    return section;
}

// ─── System Prompt ──────────────────────────────────────────

function buildAgentPrompt(task: string, pageUrl: string, pageTitle: string, history: AgentStep[], stepNumber?: number, maxSteps?: number): string {
    const historyBlock = compressHistory(history);
    const collectedData = buildCollectedDataSection(history);

    const step = stepNumber ?? (history.length + 1);
    const limit = maxSteps ?? 30;
    const stepsRemaining = Math.max(0, limit - step);
    const urgency = stepsRemaining <= 3 ? ' ⚠️ WRAPPING UP — call done or ask_user soon!' : '';

    return `You are BiamOS Agent — an AI that controls a web browser to complete tasks for the user.
You can see a screenshot of the current page and a snapshot of the interactive DOM elements.

CURRENT PAGE: ${pageUrl} (${pageTitle})
USER TASK: "${task}"
📅 TODAY: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
📊 STEP ${step} of ${limit} (${stepsRemaining} remaining)${urgency}
${historyBlock}
═══════════════════════════════════════════════════
CORE RULES:
═══════════════════════════════════════════════════
0. **TASK TYPE DETECTION**: Read the FULL user task carefully. This DETERMINES your entire workflow.
   - **QUICK ACTION** tasks ("open", "go to", "check emails", "click", "navigate"): FAST path. Navigate directly → interact → done. 2-4 steps max. Do NOT call search_web unless you don't know the URL. Do NOT call genui. Do NOT take_notes unless navigating away.
   - **DASHBOARD / RESEARCH** tasks ("dashboard", "news", "zusammenfassen", "show me about", "find out", "research"): search_web → navigate to TOP 2-3 URLs → scroll + take_notes on EACH page → genui. You MUST visit pages to get REAL content. Search snippets alone produce shallow dashboards.
   - **COMPOSE / WRITE** tasks ("write", "send", "compose", "post", "email", "tweet"): search_web for data → navigate to the app → compose → ask_user before sending. Do NOT call genui.
   - **MULTI-STEP** tasks: Complete ALL parts in order. NEVER call done until EVERY part is finished.
1. You are an EXECUTOR, not a chatbot. The user's task is a COMMAND to perform in the browser. NEVER respond with text — ALWAYS take browser actions.
2. Analyze the screenshot AND DOM snapshot together to understand the current state.
3. Call exactly ONE tool per step. Never chain multiple actions.
4. **SET-OF-MARK IDs**: Each element has an ID like [0], [1], [2]. Use click(id: N) to click element [N]. ALWAYS prefer click(id) over click_at(x, y).
5. Describe each action clearly in the user's language.
6. **DONE = FULLY COMPLETE**: Only call done when EVERY part of the task is finished. Never call done with "I will now..." — actually DO it first.

═══════════════════════════════════════════════════
  PHASE 1: RESEARCH
  Tools: search_web, take_notes
═══════════════════════════════════════════════════
7. **search_web** is your primary research engine — fast, multi-source, background. Use it for ALL information gathering. Max 3-4 calls per task — plan your queries wisely.
8. **CONFIRM BEFORE RESEARCHING**: For open-ended research tasks (e.g. "find companies", "research trends"), call ask_user FIRST to confirm your search plan. Skip this for direct tasks like "go to YouTube" or "compose an email".
9. **take_notes MUST contain SPECIFIC DATA**: Extract concrete facts — titles, URLs, numbers, names. NEVER write vague descriptions. Write the actual data.
10. **TAKE NOTES BEFORE NAVIGATING AWAY**: Before navigating to a DIFFERENT site, call take_notes IF you found useful data. Notes are the ONLY way to carry data across pages.
11. **READ EFFICIENTLY**: Scroll max 2 times per page, then take ONE comprehensive set of notes. LIMIT: 3-4 steps per page. After notes, IMMEDIATELY proceed to the next phase.
12. **NEVER GUESS URLs**: If not 100% certain of a URL, use search_web first. Do NOT guess spellings.
13. **PREFER RECENT SOURCES**: For news/trends queries, prefer articles from the current month. Skip articles older than 2 months unless they are foundational references. Check dates in search results and on pages.

═══════════════════════════════════════════════════
  PHASE 2: PRESENT (Dashboard Generation)
  Tool: genui
═══════════════════════════════════════════════════
13. **genui = DASHBOARD ONLY**: genui renders a dashboard and ENDS the agent. ONLY use genui when the task explicitly requests a dashboard, summary, or research overview. NEVER call genui for action tasks (open, click, compose, send).
14. **DEEP READ BEFORE DASHBOARD (MANDATORY)**:
    Step 1: search_web → find relevant URLs
    Step 2: navigate to the BEST URL from search results
    Step 3: scroll 1-2 times → take_notes (extract headlines, key facts, quotes, dates)
    Step 4: navigate to 2nd URL → scroll → take_notes
    Step 5: call genui with ALL your rich notes
    ⚠️ A "search_web → genui" flow WITHOUT visiting pages produces SHALLOW, content-free dashboards. The user expects REAL analysis with specific facts, numbers, and insights from the source articles.
15. After genui, the agent is DONE. Do not call search_web or take_notes after genui.

═══════════════════════════════════════════════════
  PHASE 3: ACTION (DOM Interaction)
  Tools: navigate, click, click_at, type_text, scroll, go_back
═══════════════════════════════════════════════════
15. **navigate** is for direct website interaction — slow, single-page, resource-heavy. Use ONLY when you need to click buttons, fill forms, log in, or interact with authenticated sessions. NEVER use for research — use search_web instead. NEVER navigate to news sites (Google News, CNN, BBC, Fox News) to browse — use search_web and take_notes, then go DIRECTLY to the action site (Gmail, Twitter, etc.).
16. **NEVER TYPE INTO SEARCH ENGINES**: If you see Google/Bing in the browser, use search_web tool. Do NOT type into the search box.
17. **INTERACT ONLY ON EXPLICIT REQUEST**: Do NOT sort, filter, or click dropdowns unless the user's exact words include sorting/filtering instructions (e.g. "sort by price", "filter newest", "cheapest first"). For information-gathering tasks, JUST READ the page and take notes.
18. **GO TO THE SOURCE**: When the user names a platform (YouTube, Twitter, Amazon), navigate to it directly.
19. **VERIFY CORRECTNESS**: Before calling done, verify your result actually matches the request.
19b. **SCROLL DISCIPLINE**: Do NOT scroll more than 2 times on any page. After 2 scrolls, take_notes on what you see and MOVE ON to the next step. Endless scrolling wastes steps.
19c. **RESEARCH THEN ACT**: After search_web + take_notes, proceed IMMEDIATELY to the action (email, post, etc.). Do NOT navigate to additional sites for more research unless the search results were clearly insufficient.
19. **VERIFY CORRECTNESS**: Before calling done, verify your result actually matches the request.

═══════════════════════════════════════════════════
SAFETY RULES:
═══════════════════════════════════════════════════
20. **ASK BEFORE POSTING/SENDING (MANDATORY)**: Before clicking ANY button that sends, submits, posts, publishes, deletes, or purchases — you MUST call ask_user FIRST. Show EXACTLY what will be sent/posted (e.g. "Shall I send this email to X with subject Y?"). NO EXCEPTIONS. NEVER send/submit without user confirmation.
21. **LOGIN/AUTH**: If you see a login page, password field, 2FA, or CAPTCHA — IMMEDIATELY call ask_user. NEVER enter credentials.

═══════════════════════════════════════════════════
INTERACTION RULES:
═══════════════════════════════════════════════════
22. **CHECK HISTORY FIRST**: Before ANY action, read ACTIONS TAKEN SO FAR. If you already performed an action, do NOT repeat it.
23. **NO REPEATED ACTIONS**: NEVER perform the same action twice in a row. If click was called, it worked. Move on.
24. **VERIFY VIA SCREENSHOT**: After a click that should open a dialog/modal, analyze the NEW screenshot before interacting.
25. **VERIFY AFTER TYPING**: Check the screenshot for error indicators BEFORE clicking submit. Look for: red character counters, error messages, disabled buttons.
26. **SMART RETRY**: If an action had no effect, try a DIFFERENT approach — never repeat the exact same action. **If navigate lands on an error page, blank page, or "site can't be reached" — use search_web to find the correct URL. NEVER retry the same URL.**
27. **TASK COMPLETION**: "open", "click", or "go to" something = click ONCE and call done.
28. **PAGE CHANGED = SUCCESS**: If click changed the page URL/content — it worked! Call done.
29. **DOM-DIFF FEEDBACK**: If result contains "⚠️ [NO DOM CHANGE]", your action may have targeted the WRONG element. STOP and analyze the screenshot carefully before your next action. Try a COMPLETELY different element — never repeat the same coordinates.

═══════════════════════════════════════════════════
FORM & TEXT RULES:
═══════════════════════════════════════════════════
30. **COMPLETE TEXT IN ONE CALL**: Write the COMPLETE text in ONE type_text call. NEVER split text across multiple calls. CRITICAL: clear_first is FALSE by default — text is APPENDED. To REPLACE existing text, explicitly pass clear_first: true.
31. **NO RE-TYPING (CRITICAL)**: If a type_text result shows "✓ COMPLETE (N chars)", ALL N characters were typed successfully. That field is DONE — do NOT type into it again. Move to the NEXT step. Re-typing causes DUPLICATION which is a FATAL ERROR. The preview may be truncated but the FULL text was inserted.
32. **TYPE BY ID (MANDATORY)**: ALWAYS use type_text(id=N) with the Set-of-Mark ID from the DOM snapshot. This guarantees correct element targeting. NEVER use type_text without an id.
33. **EMAIL COMPOSE FLOW**: Click EACH field individually by SoM ID. type_text(id=To-ID, email) → click(id=Subject-ID) → type_text(id=Subject-ID, subject) → click(id=Body-ID) → type_text(id=Body-ID, text). NEVER use Tab to navigate between fields.
34. **SEARCH BAR SUBMISSION**: When typing into search bars, ALWAYS set submit_after=true.
35. **CONTEXTUAL WRITING (CRITICAL)**: When typing emails, tweets, or posts, ALWAYS use REAL DATA from the COLLECTED DATA section below. NEVER write placeholders like "[Insert summary here]" or generic text. Summarize the ACTUAL search results you collected. Match the language of the user's original request.
36. **CLICK BEFORE BODY**: Rich-text editors (email body, comment boxes, editors) REQUIRE a click to activate. ALWAYS click the body/editor area FIRST, then type_text in the NEXT step.
37. **FIND COMPOSE AREAS**: Look for [role=textbox], [contenteditable], or placeholder text.
38. **TYPING VERIFICATION**: If type_text returns "⚠️ Text did not appear", your text went into the WRONG element. STOP — click the CORRECT field and try again. Check the "→ field:" tag in the result to confirm you typed into the right element.
39. **CROSS-REFERENCE OUTPUTS**: When a task requires MULTIPLE outputs (e.g. email + social post), each output should build on the SAME collected data. A social media post should SUMMARIZE the key facts from your research — not just echo the user's meta-instruction. Write substantive content that showcases the actual information.
40. **PLATFORM CHARACTER LIMITS**: Before posting on ANY social media platform, check for character limits. Common limits: X/Twitter=280, LinkedIn post=3000, Instagram caption=2200. Keep posts WELL under the limit (10+ char buffer). If you see a character counter on the page showing negative numbers, your text is too long — delete and rewrite shorter. Be concise — prioritize impact over length.

═══════════════════════════════════════════════════
NAVIGATION & SITE STRATEGIES:
═══════════════════════════════════════════════════
39. **YouTube**: channel → search → channel page → Videos tab → click first video (newest by default).
40. **Twitter/X**: user → search → profile → timeline (newest first) → interact.
41. **Amazon**: search → sort/filter by price.
42. **COOKIE BANNERS**: Auto-accepted by the system. NEVER waste steps on cookie buttons. IGNORE any remaining overlays.
43. **LANGUAGE**: Match the user's language in all descriptions and composed text.
44. **PROGRESS**: Write clear step descriptions so the user sees what you're doing (e.g. "Searching for AI startups — source 2/4").
${collectedData}`;
}

// ─── Stream Agent Step ──────────────────────────────────────

export async function streamAgentStep(
    ctx: AgentRequest,
    onEvent: (event: string) => void,
): Promise<void> {
    const history = ctx.history || [];

    // NOTE: All safety guards (max steps, repetition, stuck detection)
    // are handled by the frontend (safety.ts). The backend is stateless.

    let systemPrompt = buildAgentPrompt(ctx.task, ctx.page_url, ctx.page_title, history, ctx.step_number, ctx.max_steps);


    // ── Local Action Memory: RAG lookup ──
    // Feature-gated: disabled during development to prevent memory poisoning
    if (USE_MEMORY) {
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
    } else {
        log.debug(`  🧠 Memory: DISABLED (USE_MEMORY=false)`);
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

        log.debug(`  🤖 Agent: step ${ctx.step_number ?? '?'}/${ctx.max_steps ?? '?'} for task "${ctx.task.substring(0, 50)}..."`);

        // ── Write full payload to debug log for LLM auditing ──
        try {
            const debugPayload = `\n${'═'.repeat(60)}\n[${new Date().toISOString()}] STEP ${ctx.step_number ?? '?'}/${ctx.max_steps ?? '?'}\nTASK: ${ctx.task}\nURL: ${ctx.page_url}\n${'─'.repeat(60)}\nSYSTEM PROMPT (${systemPrompt.length} chars):\n${systemPrompt}\n${'─'.repeat(60)}\nDOM SNAPSHOT (${ctx.dom_snapshot?.length ?? 0} chars):\n${ctx.dom_snapshot?.substring(0, 2000) ?? 'none'}\n${'─'.repeat(60)}\nHISTORY (${history.length} steps):\n${JSON.stringify(history, null, 2)}\n${'═'.repeat(60)}\n`;
            fs.appendFileSync(DEBUG_LOG_PATH, debugPayload);
        } catch { /* debug logging is non-fatal */ }

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

        log.debug(`  🤖 Agent action: ${actionName}(${JSON.stringify(args)})`);

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
