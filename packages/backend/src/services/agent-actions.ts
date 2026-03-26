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
    trajectory?: string;       // Condensed tracking of latest results
    step_number?: number;      // Current step (from frontend SSOT)
    max_steps?: number;        // Max steps limit (from frontend SSOT)
    contextData?: string;      // Injected dashboard data for ACTION_WITH_CONTEXT
    method?: string;           // CRUD method from Manager-Agent (GET/POST/PUT/DELETE)
    allowed_tools?: string[];  // Tools the agent may use (from classifier)
    forbidden?: string[];      // Tools physically removed (from classifier)
    system_context?: string | null; // Platform Cartridge injection (appended at end of system prompt)
    domain_knowledge?: string | null; // D8 Domain Brain RAG injection (<domain_knowledge> XML block)
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

    // ── VISION / SPATIAL Tools (for Canvas Apps — n8n, Figma, Webflow) ──
    // Use these when the page is a visual canvas where DOM SoM is unreliable.
    // Coordinates are read from the neon-green RULER in the screenshot (0-100%).
    {
        type: "function" as const,
        function: {
            name: "vision_click",
            description: "[ACTION · Spatial] Click at a ruler coordinate. Use for canvas-based UIs (n8n, Figma, Webflow) where DOM elements are not in the SoM snapshot. Read X% from the TOP ruler and Y% from the LEFT ruler in the screenshot.",
            parameters: {
                type: "object",
                properties: {
                    x_pct: { type: "number", description: "Horizontal position from TOP ruler (0.0 – 100.0)" },
                    y_pct: { type: "number", description: "Vertical position from LEFT ruler (0.0 – 100.0)" },
                    description: { type: "string", description: "What you are clicking and why" },
                },
                required: ["x_pct", "y_pct", "description"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "vision_drag",
            description: "[ACTION · Spatial] Drag from one ruler coordinate to another. Essential for connecting nodes in n8n, moving objects in Figma, or reordering canvas elements. Uses smooth interpolation (15 frames) to avoid bot-detection by physics engines.",
            parameters: {
                type: "object",
                properties: {
                    start_x_pct: { type: "number", description: "Drag start X (TOP ruler, 0-100)" },
                    start_y_pct: { type: "number", description: "Drag start Y (LEFT ruler, 0-100)" },
                    end_x_pct:   { type: "number", description: "Drag end X (TOP ruler, 0-100)" },
                    end_y_pct:   { type: "number", description: "Drag end Y (LEFT ruler, 0-100)" },
                    description: { type: "string", description: "What you are dragging and why" },
                },
                required: ["start_x_pct", "start_y_pct", "end_x_pct", "end_y_pct", "description"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "vision_hover",
            description: "[ACTION · Spatial] Move the mouse to a ruler coordinate WITHOUT clicking. ALWAYS use this before vision_drag in n8n — connection ports are hidden until hover. Also use for dropdown triggers and tooltip-revealed menus.",
            parameters: {
                type: "object",
                properties: {
                    x_pct: { type: "number", description: "Hover target X (TOP ruler, 0-100)" },
                    y_pct: { type: "number", description: "Hover target Y (LEFT ruler, 0-100)" },
                    description: { type: "string", description: "What you are hovering over and why" },
                },
                required: ["x_pct", "y_pct", "description"],
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
                required: ["text", "description"],
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
    {
        type: "function" as const,
        function: {
            name: "wait",
            description: "[ACTION · Cost: zero] Wait for the page to finish rendering before taking the next action. Use when: (1) you just navigated and a modal/compose window is still loading, (2) you clicked a button and expect a UI change that hasn't appeared yet, (3) the DOM snapshot shows no expected elements. Max one wait per navigation. Do NOT use repeatedly.",
            parameters: {
                type: "object",
                properties: {
                    ms: {
                        type: "number",
                        description: "Milliseconds to wait. Use 500 for quick renders (dropdowns). Use 1000-1500 for compose windows, modals, page transitions. Max: 3000.",
                    },
                    reason: {
                        type: "string",
                        description: "Brief description of what you're waiting for (e.g. 'Waiting for Gmail compose window to fully render')",
                    },
                },
                required: ["ms", "reason"],
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

const RECENT_WINDOW = 12;      // Expanded short-term memory for Enterprise deep-work
const RESULT_CAP_FULL = 400;   // ✅ Fix 4: raised from 200 — preserves ✅/❌ feedback messages
const RESULT_CAP_SUMMARY = 150; // ✅ Fix 4: raised from 50 — keeps crucial error context

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

// ─── Phase Detection ────────────────────────────────────────
// Maps CRUD method to the legacy PromptPhase for module matching.
// Also falls back to task-based heuristic when no method is provided.

import { assembler } from "../prompt-modules/prompt-assembler.js";
import type { PromptPhase } from "../prompt-modules/types.js";

function detectPhase(task: string, history: AgentStep[], method?: string): PromptPhase {
    // CRUD method → phase mapping (new path)
    if (method) {
        switch (method) {
            case 'GET': return 'research';
            case 'POST': return 'action';
            case 'PUT': return 'action';
            case 'DELETE': return 'action';
        }
    }

    // Legacy heuristic fallback
    const lastAction = history.length > 0 ? history[history.length - 1].action : "";
    const hasSearch = history.some(s => s.action === "search_web");
    const hasGenui = history.some(s => s.action === "genui");
    const isDashboardTask = /dashboard|news|neuigkeiten|zusammenfassen|research|zeig|überblick|trends|aktuell/i.test(task);

    if (hasGenui || (isDashboardTask && hasSearch && history.some(s => s.action === "take_notes"))) {
        return "present";
    }
    if (isDashboardTask && !hasSearch) {
        return "research";
    }
    return "action";
}

// ─── CRUD Tool Filter ───────────────────────────────────────
// Principle of Least Privilege: physically remove forbidden tools
// from the API call so the LLM cannot use them.

// Tools that are ALWAYS allowed regardless of CRUD method.
// type_text is required even in GET/research tasks for website search bars
// (e.g. YouTube search, Amazon search). The prompt rule in method-get.ts
// already instructs the LLM not to fill forms — the hard filter was too aggressive.
const ALWAYS_ALLOWED_TOOLS = new Set(['type_text', 'click', 'click_at', 'navigate', 'go_back', 'scroll', 'wait', 'done', 'ask_user']);

function filterToolsByCrud(
    tools: typeof AGENT_TOOLS,
    allowedTools?: string[],
    forbiddenTools?: string[],
): typeof AGENT_TOOLS {
    let filtered = tools;
    if (allowedTools?.length || forbiddenTools?.length) {
        filtered = tools.filter(tool => {
            const name = tool.function.name;
            // Never remove core interaction tools regardless of CRUD method
            if (ALWAYS_ALLOWED_TOOLS.has(name)) return true;
            // If forbidden list exists, remove any tool in it (except always-allowed)
            if (forbiddenTools?.length && forbiddenTools.includes(name)) {
                log.debug(`  🚫 Tool filtered out: ${name} (forbidden by CRUD method)`);
                return false;
            }
            return true;
        });
    }

    // Inject Analysis field into interactive tools to build Chain-of-Thought
    const ACTION_TOOLS = new Set(['click', 'click_at', 'vision_click', 'vision_drag', 'vision_hover', 'type_text', 'scroll', 'navigate']);
    
    return filtered.map(tool => {
        if (ACTION_TOOLS.has(tool.function.name)) {
            const cloned = JSON.parse(JSON.stringify(tool));
            cloned.function.parameters.properties.analysis = {
                type: "object",
                properties: {
                    past: { type: "string", description: "What action you took in the last step and its result (Success/Fail)." },
                    present: { type: "string", description: "What changed in the DOM/Image. If the last action failed, explain why." },
                    future: { type: "string", description: "Your logical plan. If ID X failed previously, EXPLICITLY state you will NOT try X again." }
                },
                required: ["past", "present", "future"]
            };
            if (!cloned.function.parameters.required.includes("analysis")) {
                cloned.function.parameters.required.unshift("analysis");
            }
            return cloned;
        }
        return tool;
    });
}


// ─── System Prompt ──────────────────────────────────────────

function buildAgentPrompt(task: string, pageUrl: string, pageTitle: string, history: AgentStep[], stepNumber?: number, maxSteps?: number, contextData?: string, method?: string): string {
    const historyBlock = compressHistory(history);
    const collectedData = buildCollectedDataSection(history);
    const phase = detectPhase(task, history, method);

    const step = stepNumber ?? (history.length + 1);
    const limit = maxSteps ?? 30;

    // Dynamic "next step" hint for research tasks — covers every state in the flow
    let nextStepHint = '';
    const isDashboardTask = /dashboard|news|neuigkeiten|zusammenfassen|research|zeig|überblick|trends|aktuell/i.test(task);
    if (isDashboardTask) {
        const hasSearch = history.some(s => s.action === 'search_web');
        const hasNavigate = history.some(s => s.action === 'navigate');
        const hasGenui = history.some(s => s.action === 'genui');
        const navigateCount = history.filter(s => s.action === 'navigate').length;
        const noteCount = history.filter(s => s.action === 'take_notes').length;
        // Find notes taken AFTER the last navigate (= notes from current page)
        const lastNavIdx = history.map(s => s.action).lastIndexOf('navigate');
        const notesAfterLastNav = lastNavIdx >= 0 ? history.slice(lastNavIdx + 1).filter(s => s.action === 'take_notes').length : 0;

        if (!hasGenui) {
            if (hasSearch && !hasNavigate && noteCount > 0) {
                nextStepHint = '\n⚡ NEXT STEP: You have search results in your notes. NOW call navigate() to visit the BEST URL. You need REAL page content for a good dashboard.';
            } else if (hasNavigate && notesAfterLastNav === 0) {
                nextStepHint = '\n⚡ NEXT STEP: You are on a page. Call take_notes NOW to extract headlines, facts, dates, and key information you see. Then navigate to the next URL or call genui.';
            } else if (hasNavigate && notesAfterLastNav > 0 && navigateCount < 2) {
                nextStepHint = '\n⚡ NEXT STEP: Good notes! Navigate to a 2nd URL from your earlier search results for more perspectives. Or if you have enough data, call genui to create the dashboard.';
            } else if (navigateCount >= 2 && noteCount >= 2) {
                nextStepHint = '\n⚡ NEXT STEP: You visited multiple pages and collected notes. Call genui NOW to create the dashboard with ALL your data.';
            }
        }
    }

    // ── Assemble prompt from modules ────────────────────────
    return assembler.assemble({
        url: pageUrl,
        task,
        phase,
        stepNumber: step,
        maxSteps: limit,
        historyBlock,
        collectedData,
        contextData,
        nextStepHint,
    });
}

// ─── Stream Agent Step ──────────────────────────────────────

export async function streamAgentStep(
    ctx: AgentRequest,
    onEvent: (event: string) => void,
): Promise<void> {
    const history = ctx.history || [];

    // NOTE: All safety guards (max steps, repetition, stuck detection)
    // are handled by the frontend (safety.ts). The backend is stateless.

    let systemPrompt = buildAgentPrompt(ctx.task, ctx.page_url, ctx.page_title, history, ctx.step_number, ctx.max_steps, ctx.contextData, ctx.method);

    // ── Filter tools by CRUD method ─────────────────────────
    const filteredTools = filterToolsByCrud(AGENT_TOOLS, ctx.allowed_tools, ctx.forbidden);
    log.debug(`  🔧 CRUD: method=${ctx.method || 'none'}, tools=${filteredTools.length}/${AGENT_TOOLS.length} (${AGENT_TOOLS.length - filteredTools.length} filtered out)`);


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

    // ── Platform Cartridge injection (always at END to avoid Lost-in-Middle) ──
    if (ctx.system_context) {
        systemPrompt += `\n\n${'═'.repeat(50)}\n${ctx.system_context}\n${'═'.repeat(50)}`;
        log.debug(`  🗂️ [Cartridge] Injected ${ctx.system_context.length} chars of platform knowledge`);
    }

    // ── D8: Domain Brain Knowledge Injection ─────────────────
    // Retrieved by the RAG interceptor in universal-router.ts.
    // Injected AFTER the Cartridge so domain-specific user rules
    // are always the final context before the LLM acts.
    if (ctx.domain_knowledge) {
        systemPrompt += `\n\n${'═'.repeat(50)}\nDOMAIN KNOWLEDGE (what you know about this site):\n${ctx.domain_knowledge}\n${'═'.repeat(50)}`;
        log.debug(`  🧠 [DomainBrain] Injected ${ctx.domain_knowledge.length} chars of domain knowledge`);
    }

    // ── Add Trajectory as Context Prepender ──
    if (ctx.trajectory) {
        systemPrompt = `═══════════════════════════════════════════════════\nAGENT TRAJECTORY (Your recent history & results):\n═══════════════════════════════════════════════════\n${ctx.trajectory}\n\n` + systemPrompt;
    }

    const messages: { role: string; content: any }[] = [
        { role: "system", content: systemPrompt },
    ];

    // Add screenshot + DOM as user message
    const userContent: any[] = [
        { type: "text", text: `DOM Snapshot (interactive elements with Set-of-Mark IDs):\nFormat: [ID] tag "label" (aria-label: "...", placeholder: "...") — Read the aria-label and placeholder to identify WHAT each element does. NEVER guess by position or visual location alone.\n\`\`\`\n${ctx.dom_snapshot}\n\`\`\`\n\nUse click(id: N) to interact with elements by their [N] ID. Analyze the page and decide the next action to complete the task: "${ctx.task}"` },
    ];

    if (ctx.screenshot) {
        userContent.push({
            type: "image_url",
            image_url: {
                url: `data:image/png;base64,${ctx.screenshot}`,
                detail: "high",   // Fix 6: force high-res — prevents OpenRouter downscaling on small n8n nodes
            },
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
                tools: filteredTools,
                tool_choice: "required",  // Force a tool call
                temperature: 0.2,         // Low temp for precise actions
                frequency_penalty: 0.3,   // Prevent LLM text-generation loops
                presence_penalty: 0.1,    // Encourage new tokens over repetition
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
            log.error(`  ❌ Agent LLM error: Failed to parse tool arguments for ${actionName}`);
            onEvent(`data: ${JSON.stringify({ type: "error", message: `Failed to parse arguments for action: ${actionName}. The LLM provided invalid JSON.` })}\n\n`);
            return;
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
