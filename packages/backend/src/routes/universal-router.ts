// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Universal Router (Phase 2B Multi-Agent)
// ============================================================
// Splits compound user sentences into an array of isolated
// executing tasks. This enables the parallel dispatch loop.
// ============================================================

import { Hono } from "hono";
import { getChatUrl, getHeaders } from "../services/llm-provider.js";
import { MODEL_FAST } from "../config/models.js";
import { logTokenUsage } from "../server-utils.js";
import { safeParseJSON } from "../utils/safe-json.js";
import { log } from "../utils/logger.js";
import type { IntentMode, CrudMethod } from "./classify-routes.js";
import { getIntegrationForQuery } from "../services/integration-context.js";
import { matchCartridge } from "../data/platform-cartridges.js";
import { lookupWorkflow, extractDomain } from "../services/agent-memory.js";

export const universalRouter = new Hono();

// ─── CRUD → Tool Mapping ────────────────────────────────────
const CRUD_TOOL_MAP: Record<CrudMethod, { allowed: string[]; forbidden: string[] }> = {
    GET: {
        allowed: ["click", "scroll", "search_web", "take_notes", "read_page", "navigate", "go_back", "done", "ask_user", "genui"],
        forbidden: ["type_text"],
    },
    POST: {
        allowed: ["click", "click_at", "type_text", "scroll", "navigate", "go_back", "search_web", "take_notes", "done", "ask_user"],
        forbidden: [],
    },
    PUT: {
        allowed: ["click", "click_at", "type_text", "scroll", "navigate", "go_back", "done", "ask_user"],
        forbidden: ["search_web"],
    },
    DELETE: {
        allowed: ["click", "scroll", "navigate", "go_back", "done", "ask_user"],
        forbidden: ["type_text", "search_web"],
    },
};

// ─── Zero-Shot JSON Schema Router Prompt ────────────────────

const ROUTER_PROMPT = `You are BiamOS Universal Router. Analyse the user query and return ONLY valid JSON.

The JSON MUST have this exact structure, with "intent" first:
{
  "intent": {
    "language": "<ISO 639-1 code of the user's language>",
    "requires_browser_interaction": <true if user wants to navigate/click/type/scroll/go to/open/search — in ANY language>,
    "is_about_current_screen": <true ONLY for passive read-only observation: user wants you to describe/summarize/translate/read what is currently visible — e.g. "was siehst du?", "fasse zusammen", "was steht da?", "describe this". MUST be false if an action verb is present (suche, klick, geh, scroll, type, open, find)>,
    "is_pure_chat": <true ONLY if this is a meta-question about you/BiamOS/general knowledge with ZERO browser or research intent>,
    "is_read_only": <true for viewing/reading actions (GET), false for writing/posting/submitting/deleting>,
    "target": "<detected URL, site name, channel, person or search target — empty string if none>"
  },
  "tasks": [
    {
      "task": "<exact original user text — NEVER translate>",
      "mode": "CHAT" | "RESEARCH" | "ACTION" | "ACTION_WITH_CONTEXT" | "CONTEXT_QUESTION",
      "method": "GET" | "POST" | "PUT" | "DELETE"
    }
  ]
}

Mode rules (the intent block will guide you):
- requires_browser_interaction: true  → ACTION (method = GET if read-only, POST/PUT/DELETE if writing)
- is_about_current_screen: true       → CONTEXT_QUESTION
- is_pure_chat: true                  → CHAT
- Neither of the above, no site given → RESEARCH

CRITICAL SPLITTING RULES:
1. SEQUENTIAL BROWSER ACTIONS = ONE TASK: If tasks are step-by-step actions on the SAME platform/site, they MUST be a single task (not split). Splitting sequential browser tasks causes broken parallel execution.
   ❌ BAD: ["navigate to x.com", "find mr beast post"] — these run in parallel, breaking the flow
   ✅ GOOD: ["navigate to x.com and find mr beast's latest post"] — one task, one browser session
2. SPLIT ONLY for TRULY INDEPENDENT tasks on DIFFERENT platforms (e.g. "check Gmail AND post on Twitter").
3. CONTEXT PROPAGATION: Every sub-task must be 100% self-contained. If the first task establishes a platform/URL, copy it explicitly into all dependent tasks.
   ❌ BAD: ["navigate to x.com", "find mr beast's post"]
   ✅ GOOD: ["navigate to x.com", "on x.com: search for mr beast's latest post"]

RAG PATTERN (Matrix Download): When user asks to BUILD, CREATE, or CONFIGURE something on a specific complex platform, output TWO tasks:
Task 0: { "task": "Research how to [do X] on [platform]: find parameters, node names, field names, and exact steps", "mode": "RESEARCH", "method": "GET", "hidden": true, "id": "task_A" }
Task 1: { "task": "[original user task]", "mode": "ACTION_WITH_CONTEXT", "method": "POST", "depends_on": "task_A" }
Trigger platforms: n8n, Figma, Webflow, Salesforce, HaloITSM, HubSpot, Notion, Airtable, Zapier, Make.com
Do NOT trigger for: Gmail, YouTube, Twitter/X, Wikipedia — these are well-known and need no research.

Respond ONLY with the JSON. No markdown, no extra text.`;

// ─── POST /api/intent/route ─────────────────────────────────

universalRouter.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.query) {
        return c.json({ error: "Missing 'query' field" }, 400);
    }

    const query = String(body.query).trim();
    const hasDashboard = !!body.hasDashboard;
    const hasWebview = !!body.hasWebview;
    const currentUrl = typeof body.currentUrl === 'string' ? body.currentUrl : '';

    log.info(`  🧭 [UniversalRouter] query="${query.substring(0, 40)}" hasWebview=${hasWebview} currentUrl="${currentUrl.substring(0, 60)}"`);

    try {

    // ── PRE-FAST-PATH: Muscle Memory (Trajectory Replay) ──────────
    if (hasWebview && currentUrl) {
        const domain = extractDomain(currentUrl);
        const memoryMatch = await lookupWorkflow(domain, query);
        if (memoryMatch) {
            log.info(`  🧭 [UniversalRouter] 🧠 Muscle Memory Hit! Replaying ${memoryMatch.steps.length} steps for "${query}" on ${domain}`);
            return c.json([{
                task: query,
                mode: 'ACTION' as IntentMode,
                method: 'GET' as CrudMethod, 
                allowed_tools: CRUD_TOOL_MAP['GET'].allowed,
                forbidden: CRUD_TOOL_MAP['GET'].forbidden,
                muscle_memory: memoryMatch.steps,
                memory_id: memoryMatch.id,
            }]);
        }
    }

    const chatUrl = await getChatUrl();
    const headers = await getHeaders("universal-router");

    // ── PRE-FAST-PATH: Integration matcher (language-agnostic, runs before LLM) ────
    if (!hasWebview) {
        const matched = await getIntegrationForQuery(query);
        if (matched) {
            log.info(`  🧭 [UniversalRouter] "${query.substring(0, 40)}" → RESEARCH (integration fast-path: ${matched.groupName})`);
            return c.json([{
                task: query,
                mode: 'RESEARCH' as IntentMode,
                method: 'GET' as CrudMethod,
                allowed_tools: CRUD_TOOL_MAP['GET'].allowed,
                forbidden: CRUD_TOOL_MAP['GET'].forbidden,
                _integrationGroup: matched.groupName,
            }]);
        }
    }

    // ── PRE-FAST-PATH: Pronoun follow-up guard ────────────────
    // Detects queries like "kannst du es erledigen?", "mach das", "do it for me"
    // that are AMBIGUOUS FOLLOW-UPS — they have no self-contained action noun.
    // These MUST stay in CHAT because the agent has zero context about what "it" is.
    // Without this guard, the agent spawns blindly and makes destructive mistakes.
    if (hasWebview) {
        const qLower = query.toLowerCase().trim();
        // Matches short queries (≤12 words) that are primarily pronouns/verbs without a concrete target
        const wordCount = qLower.split(/\s+/).length;
        const pronounPatterns = /\b(es|das|dies|it|this|that|ihm|ihr|die sache|die|das ding|den rest|das gleiche)\b/;
        const abstractVerbs = /\b(erledige|erledigen|mach|mache|tup|tu|do it|do that|schick|schicke|send|sende|ausführ|ausführen|proceed|weiter|weitermach|go ahead|fahr fort)\b/i;
        // Also catches "kannst du X?" / "kannst du es X?" style queries with no concrete object
        const politeRequest = /^(kannst du|könntest du|bitte|please|can you|could you|würdest du|magst du)/i;

        if (wordCount <= 12 && pronounPatterns.test(qLower) && (abstractVerbs.test(qLower) || politeRequest.test(qLower))) {
            // Check if there's NO concrete action noun (URL, app name, specific task noun)
            const hasConcreteTarget = /\b(ticket|note|notiz|email|mail|message|nachricht|linkedin|twitter|facebook|gmail|haloitsm|form|workflow|report|bericht|https?:\/\/)\b/i.test(qLower);
            if (!hasConcreteTarget) {
                log.info(`  🧭 [UniversalRouter] PRONOUN-GUARD: "${query.substring(0, 40)}" → CHAT (ambiguous follow-up, no concrete target)`);
                return c.json([{
                    task: query,
                    mode: 'CHAT' as IntentMode,
                    method: 'GET' as CrudMethod,
                    allowed_tools: CRUD_TOOL_MAP['GET'].allowed,
                    forbidden: CRUD_TOOL_MAP['GET'].forbidden,
                }]);
            }
        }
    }

    // ── Build context suffix: minimal, just facts for the schema ────────────
    const contextSuffix = hasWebview && currentUrl
        ? `\n\nCONTEXT: hasWebview=true, currentUrl="${currentUrl}"`
        : hasDashboard
        ? `\n\nCONTEXT: hasWebview=false, hasDashboard=true`
        : `\n\nCONTEXT: hasWebview=false, hasDashboard=false`;

        const dynamicPrompt = ROUTER_PROMPT + contextSuffix;

        const resp = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_FAST,
                messages: [
                    { role: "system", content: dynamicPrompt },
                    { role: "user", content: query },
                ],
                temperature: 0,
                max_tokens: 1500,
                response_format: { type: "json_object" },
            }),
        });

        if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}`);

        const result = await resp.json();
        await logTokenUsage("intent:route", MODEL_FAST, result.usage ?? {});

        const content = result.choices?.[0]?.message?.content || "";
        const parsed = safeParseJSON(content);

        if (parsed && Array.isArray(parsed.tasks)) {
            const intent = parsed.intent ?? {};

            // ── Hard TypeScript overrides (language-agnostic) ────────────────
            // These override LLM task-level hallucinations using the intent block.
            // The LLM reasons about intent first (CoT), we enforce the rules here.
            const fullyHydratedTasks = parsed.tasks.map((t: any) => {
                let mode = (["CHAT", "RESEARCH", "ACTION", "ACTION_WITH_CONTEXT", "CONTEXT_QUESTION"].includes(t.mode))
                    ? t.mode as IntentMode
                    : "ACTION";

                let method = (["GET", "POST", "PUT", "DELETE"].includes(t.method))
                    ? t.method as CrudMethod
                    : "GET";

                // 🔒 HARD OVERRIDE 1: Browser interaction + live webview → always ACTION
                if (intent.requires_browser_interaction && hasWebview && mode === 'CHAT') {
                    log.info(`  🧭 [Override] CHAT → ACTION (requires_browser_interaction=true, hasWebview=true)`);
                    mode = 'ACTION';
                }

                // 🔒 HARD OVERRIDE 1b: Non-empty target + live webview = navigation intent.
                // Catches polite/question-form navigation ("kannst du kd csapat gehen?")
                // where LLM sets requires_browser_interaction=false but still detects a target.
                if (hasWebview && intent.target && intent.target.trim() !== '' && mode === 'CHAT') {
                    log.info(`  🧭 [Override] CHAT → ACTION (target="${intent.target}", hasWebview=true)`);
                    mode = 'ACTION';
                    method = 'GET';
                }

                // 🔒 HARD OVERRIDE 2: About current screen → always CONTEXT_QUESTION
                if (intent.is_about_current_screen && hasWebview) {
                    mode = 'CONTEXT_QUESTION';
                }

                // 🔒 HARD OVERRIDE 2b: Browser interaction beats screen observation —
                // BUT only when the query contains HARD action verbs (click/type/fill/send/delete).
                // Visual-inspection verbs (schau/look/check/zeig/analyze) stay as CONTEXT_QUESTION.
                if (intent.requires_browser_interaction && mode === 'CONTEXT_QUESTION') {
                    const query_lower = query.toLowerCase();
                    const hardActionVerbs = /\b(click|klick|press|drück|type|tipp|fill|ausfüll|send|schick|submit|absend|delete|lösch|create|erstell|add|hinzufüg|open a new|navigate to|gehe zu|go to)\b/i;
                    const visualVerbs = /\b(schau|look|check|prüf|zeig|show|analyze|analysier|what do you see|was siehst|lese|read|scan|inspect|inspizier|verify if|ist das|is this)\b/i;
                    if (hardActionVerbs.test(query_lower) && !visualVerbs.test(query_lower)) {
                        log.info(`  🧭 [Override] CONTEXT_QUESTION → ACTION (hard action verb detected, no visual verb)`);
                        mode = 'ACTION';
                    } else {
                        log.info(`  🧭 [Override 2b BLOCKED] kept CONTEXT_QUESTION — visual/inspection query or no hard action verb`);
                    }
                }

                // 🔒 HARD OVERRIDE 3: RESEARCH/CONTEXT_QUESTION are always GET
                if (mode === 'RESEARCH' || mode === 'CONTEXT_QUESTION') method = 'GET';

                // 🔒 HARD OVERRIDE 4: is_read_only → cap at GET
                if (intent.is_read_only && method !== 'GET') method = 'GET';

                const toolMapping = CRUD_TOOL_MAP[method];
                return {
                    task: t.task,
                    mode,
                    method,
                    allowed_tools: toolMapping.allowed,
                    forbidden: toolMapping.forbidden,
                    // ✅ Bug 1 fix: pass through DAG fields so frontend respects pipeline ordering
                    ...(t.id        !== undefined && { id: t.id }),
                    ...(t.depends_on !== undefined && { depends_on: t.depends_on }),
                    ...(t.hidden    !== undefined && { hidden: t.hidden }),
                };
            });

            // ── Platform Cartridge injection ──────────────────────────────
            // Match query + currentUrl against known enterprise platforms.
            // Inject domain knowledge at END of system prompt (Lost-in-Middle fix).
            const cartridge = matchCartridge(query, currentUrl);
            if (cartridge) {
                log.info(`  🗂️ [Cartridge] Matched platform for "${query.substring(0, 30)}" — injecting ${cartridge.editor_type} profile`);
                fullyHydratedTasks.forEach((t: any) => {
                    // ✅ Bug 2 fix: inject UI knowledge ONLY into tasks that actually interact with the platform
                    // RESEARCH tasks run on DuckDuckGo/web — don't confuse them with platform UI rules
                    if (t.mode === 'ACTION' || t.mode === 'ACTION_WITH_CONTEXT' || t.mode === 'CONTEXT_QUESTION') {
                        t.system_context = cartridge.system_prompt_injection;
                    }
                });
            }

            const langTag = intent.language ? ` [${intent.language}]` : '';
            log.info(`  🧭 [UniversalRouter] "${query.substring(0, 40)}..."${langTag} → Split into ${fullyHydratedTasks.length} tasks!`);
            return c.json(fullyHydratedTasks);
        }

        throw new Error("Invalid router response structure");
    } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("401")) {
            log.warn(`  🧭 [UniversalRouter] LLM Unauthorized (401). Aborting.`);
            return c.json({ action: "no_api_key", error: msg }, 401);
        }
        log.warn(`  🧭 [UniversalRouter] Error, falling back to single task: ${msg}`);
        // Fallback: Just treat the entire query as a single ACTION GET
        const toolMapping = CRUD_TOOL_MAP["GET"];
        return c.json([{
            task: query,
            mode: "ACTION",
            method: "GET",
            allowed_tools: toolMapping.allowed,
            forbidden: toolMapping.forbidden,
        }]);
    }
});
