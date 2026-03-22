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

// ─── Router System Prompt ───────────────────────────────────

const ROUTER_PROMPT = `You are the BiamOS Universal Router (Phase 2B). Your job is to split complex user queries into an ARRAY of discrete executable tasks.

You must look for conjunctions ("and", "und", "dann", "then", ",") and separate the intentions.

CRITICAL RULE FOR SPLITTING — READ FIRST:
If the user requests multiple actions that happen CONSECUTIVELY on the SAME website or platform
(e.g. "Go to Twitter and post a greeting", "Open Gmail and write an email to Max", "gehe zu X und erstelle einen Post"),
DO NOT split them into multiple tasks.
Combine them into a SINGLE ACTION task with the full instruction.
The browser agent is fully capable of executing multi-step tasks on one page in a single run.
ONLY split tasks if they are on COMPLETELY DIFFERENT websites, or one task is RESEARCH and the other is ACTION.
Examples of what NOT to split:
- "gehe zu X und poste eine Begrüßung" → ONE task: ACTION POST
- "öffne Gmail und schreibe eine Email an Max" → ONE task: ACTION POST
- "navigate to LinkedIn and like the first post" → ONE task: ACTION POST
Examples of what TO split:
- "recherchiere OpenAI UND öffne Gmail" → TWO tasks: RESEARCH + ACTION GET (different sites)
- "fasse den Artikel zusammen und tweete das" → TWO tasks: CONTEXT_QUESTION + ACTION_WITH_CONTEXT

CRITICAL RULES FOR MODES & METHODS:
- RESEARCH: Generating dashboards, finding info WITHOUT a specific site mentioned. Method is always GET.
- ACTION (GET): Reading, checking, finding info ON a specific site (e.g. "go to X and find Y").
- ACTION (POST/PUT/DELETE): Writing, clicking, sending, submitting, deleting.
- ACTION_WITH_CONTEXT: Taking data from a previous step and doing something with it (e.g. "post this", "share the results").
- CONTEXT_QUESTION: Simple question about the visible screen/dashboard OR the currently open webpage. Always GET.

⚠️ WEBVIEW CONTEXT RULE (HIGHEST PRIORITY):
If the context tells you "hasWebview: true", it means the user has a LIVE WEBPAGE open in their browser.
In this case, ANY query that asks to summarize, explain, translate, read, describe, or ask questions about
"this page", "the article", "the site", "this", "das", "die Seite", "den Artikel", "das hier", "davon", "darüber"
MUST be classified as CONTEXT_QUESTION — NOT as RESEARCH or ACTION.

⚠️ SCREEN VISIBILITY RULE (ALSO HIGHEST PRIORITY):
Queries asking "what do you see?", "was siehst du?", "was ist im screen?", "describe what's on screen",
"was ist da?", "was ist das?", "erkläre was du siehst" — ALWAYS classify as CONTEXT_QUESTION.
These are requests to observe and describe the current screen, never ACTION or RESEARCH.

Examples with hasWebview=true:
- "Fasse die Seite zusammen" → CONTEXT_QUESTION
- "Was steht da?" → CONTEXT_QUESTION
- "Summarize this article" → CONTEXT_QUESTION
- "Erkläre mir das" → CONTEXT_QUESTION
- "What is this page about?" → CONTEXT_QUESTION
- "Translate this" → CONTEXT_QUESTION
- "was siehst du im screen?" → CONTEXT_QUESTION
- "was siehst du?" → CONTEXT_QUESTION
- "was ist auf dem bildschirm?" → CONTEXT_QUESTION
- "describe what you see" → CONTEXT_QUESTION
- "what do you see?" → CONTEXT_QUESTION

If the user says: "Recherchiere OpenClaw und öffne Gmail", you output 2 tasks:
1. mode: RESEARCH, method: GET, task: "Recherchiere OpenClaw"
2. mode: ACTION, method: GET, task: "öffne Gmail"

If the user says: "Fasse die AI Modelle zusammen und tweete das auf X":
1. mode: RESEARCH (or CONTEXT_QUESTION), method: GET, task: "Fasse die AI Modelle zusammen"
2. mode: ACTION_WITH_CONTEXT, method: POST, task: "tweete das auf X"

You MUST return a JSON object containing a "tasks" array.
Each object in the "tasks" array MUST match this exactly:
{
  "task": "string (the isolated command)",
  "mode": "RESEARCH" | "ACTION" | "ACTION_WITH_CONTEXT" | "CONTEXT_QUESTION",
  "method": "GET" | "POST" | "PUT" | "DELETE"
}

RULE: You MUST keep the 'task' strings in the exact original language the user typed. Do not translate the tasks into English!

Respond ONLY with the JSON object. Do not include markdown blocks or extra text. Example output:
{"tasks": [{"task": "find news", "mode": "RESEARCH", "method": "GET"}, {"task": "open twitter", "mode": "ACTION", "method": "GET"}]}`;

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

    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("universal-router");

        // Build context string for the LLM — be as explicit as possible
        let contextSuffix: string;
        if (hasWebview && currentUrl) {
            contextSuffix = `\n\nCRITICAL CONTEXT: hasWebview: true | currentUrl: "${currentUrl}"\nThe user has a LIVE WEBPAGE open. Apply the WEBVIEW CONTEXT RULE above. If the user is asking about the content of this page, ALWAYS use CONTEXT_QUESTION.`;
        } else if (hasDashboard) {
            contextSuffix = "\n\nCRITICAL CONTEXT: hasDashboard: true | The user currently has a Research Dashboard or Agent Log in focus. Words like 'this', 'that', 'summarize', 'daraus', 'damit' likely refer to that dashboard. Strongly consider ACTION_WITH_CONTEXT or CONTEXT_QUESTION.";
        } else {
            contextSuffix = "\n\nCRITICAL CONTEXT: hasWebview: false | hasDashboard: false | The user is on an EMPTY canvas with no active content in focus. Do NOT use CONTEXT_QUESTION or ACTION_WITH_CONTEXT — the user is asking for something entirely new.";
        }

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
            // Map the parsed tasks to include allowed/forbidden tools dynamically
            const fullyHydratedTasks = parsed.tasks.map((t: any) => {
                const mode = (["RESEARCH", "ACTION", "ACTION_WITH_CONTEXT", "CONTEXT_QUESTION"].includes(t.mode))
                    ? t.mode as IntentMode
                    : "ACTION";
                
                let method = (["GET", "POST", "PUT", "DELETE"].includes(t.method))
                    ? t.method as CrudMethod
                    : "GET";
                
                // Safety overrides
                if (mode === "RESEARCH" || mode === "CONTEXT_QUESTION") method = "GET";

                const toolMapping = CRUD_TOOL_MAP[method];

                return {
                    task: t.task,
                    mode,
                    method,
                    allowed_tools: toolMapping.allowed,
                    forbidden: toolMapping.forbidden,
                };
            });

            log.info(`  🧭 [UniversalRouter] "${query.substring(0, 40)}..." → Split into ${fullyHydratedTasks.length} tasks!`);
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
