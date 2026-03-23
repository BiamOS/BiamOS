// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Intent Classifier (LLM Router)
// ============================================================
// Fast LLM call (~200ms) that classifies user intent into one
// of 4 modes: RESEARCH, ACTION, ACTION_WITH_CONTEXT, CONTEXT_QUESTION.
// Replaces keyword matching for reliable intent routing.
// ============================================================

import { Hono } from "hono";
import { getChatUrl, getHeaders } from "../services/llm-provider.js";
import { MODEL_FAST } from "../config/models.js";
import { logTokenUsage } from "../server-utils.js";
import { safeParseJSON } from "../utils/safe-json.js";
import { log } from "../utils/logger.js";

export const classifyRoutes = new Hono();

// ─── Types ──────────────────────────────────────────────────

export type IntentMode = "CHAT" | "RESEARCH" | "ACTION" | "ACTION_WITH_CONTEXT" | "CONTEXT_QUESTION";
export type CrudMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface ClassifyResponse {
    mode: IntentMode;
    method: CrudMethod;
    task: string;
    confidence: number;
    allowed_tools: string[];
    forbidden: string[];
}

// ─── CRUD → Tool Mapping ────────────────────────────────────
// Principle of Least Privilege: each method only gets the tools
// it semantically needs. Tool filtering happens in the backend.

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

// ─── Classifier Prompt ──────────────────────────────────────

const CLASSIFIER_PROMPT = `You are the Manager-Agent for BiamOS. You classify the user's query into a MODE and a CRUD METHOD.

MODES (Frontend Routing):
1. RESEARCH — User wants to gather NEW INFORMATION and create a dashboard. No specific site mentioned.
   Examples: "AI news dashboard", "tech trends 2026", "was gibt es neues über Tesla"
2. ACTION — User wants to DO SOMETHING in the browser: navigate, click, type, read.
   Examples: "go to Gmail", "open X.com", "find Elon Musk's latest post on X", "send an email"
3. ACTION_WITH_CONTEXT — DO SOMETHING using data from a previous dashboard.
   Examples: "post this on X", "share the dashboard results", "schreibe eine email mit den ergebnissen"
4. CONTEXT_QUESTION — Question ABOUT the current page (text answer, no browser interaction).
   Examples: "summarize this page", "was steht auf der Seite", "translate this"

CRUD METHOD (Agent Tool Selection — CRITICAL):
For ACTION and ACTION_WITH_CONTEXT, also determine the CRUD method:
- GET — Read/observe only. Looking at pages, finding info, reading posts. No typing, no submitting.
  Examples: "find latest post", "check my inbox", "look at this profile", "what's on the page"
- POST — Create something NEW. Writing tweets, composing emails, filling forms, posting comments.
  Examples: "write a tweet", "compose an email", "send a message", "post on X"
- PUT — UPDATE something existing. Editing profiles, changing settings, updating a document.
  Examples: "change my bio", "update the title", "edit my profile", "rename this"
- DELETE — Remove something. Deleting emails, removing posts, clearing data.
  Examples: "delete this email", "remove the post", "clear my cart", "unsubscribe"

For RESEARCH and CONTEXT_QUESTION modes, always use method: "GET".

CRITICAL RULES:
- "gehe zu" / "go to" / "open" + website → ACTION (even if they say "suche")
- "was siehst du" / "describe the screen" → ACTION + GET
- "fasse zusammen" / "summarize" → CONTEXT_QUESTION + GET
- RESEARCH = no destination site, wants dashboard
- "gehe zu X und suche elon musk" → ACTION + GET
- "post this on X" / "teile das" → ACTION_WITH_CONTEXT + POST
- "send", "compose", "write", "post", "tweet" → POST
- "delete", "remove", "löschen", "entfernen" → DELETE
- "edit", "change", "update", "bearbeiten", "ändern" → PUT
- COMBINED QUERIES (research + action, e.g. "check news about X and post on Y", "search for AI trends and tweet about it"):
  These MUST be classified as RESEARCH. The research engine will gather data first.
  The user will naturally follow up with "post this" which becomes ACTION_WITH_CONTEXT.
  NEVER classify combined queries as ACTION — the agent cannot research effectively with search_web alone.
  CRITICAL: Extract ONLY the research part into the 'task' field. Drop the action part entirely.
  Example: query "search for AI news and tweet about it" → { "mode": "RESEARCH", "task": "search for AI news" }
- Default when unsure: ACTION + GET (safest)

Return ONLY a JSON object: { "mode": "...", "method": "GET"|"POST"|"PUT"|"DELETE", "task": "...", "confidence": 0.0-1.0 }`;

// ─── POST /classify ─────────────────────────────────────────

classifyRoutes.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.query) {
        return c.json({ error: "Missing 'query' field" }, 400);
    }

    const query = String(body.query).trim();
    const hasDashboard = !!body.hasDashboard; // frontend tells us if dashboard is active

    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("intent-classifier");

        const contextHint = hasDashboard
            ? "\n\nIMPORTANT: There is currently an active research dashboard displayed. If the user refers to 'it', 'this', 'das', 'davon', 'daraus', or 'the results', they likely mean the dashboard content → ACTION_WITH_CONTEXT."
            : "\n\nNote: There is NO active dashboard. ACTION_WITH_CONTEXT is unlikely unless the user explicitly mentions previous data.";

        const resp = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_FAST,
                messages: [
                    { role: "system", content: CLASSIFIER_PROMPT + contextHint },
                    { role: "user", content: query },
                ],
                temperature: 0,
                max_tokens: 100,
                response_format: { type: "json_object" },
            }),
        });

        if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}`);

        const result = await resp.json();
        await logTokenUsage("intent:classify", MODEL_FAST, result.usage ?? {});

        const content = result.choices?.[0]?.message?.content || "";
        const parsed = safeParseJSON(content);

        if (parsed && parsed.mode && parsed.task) {
            const mode = (["RESEARCH", "ACTION", "ACTION_WITH_CONTEXT", "CONTEXT_QUESTION"].includes(parsed.mode))
                ? parsed.mode as IntentMode
                : "ACTION"; // safe fallback

            const method = (["GET", "POST", "PUT", "DELETE"].includes(parsed.method))
                ? parsed.method as CrudMethod
                : inferMethod(mode, query);

            const toolMapping = CRUD_TOOL_MAP[method];

            log.info(`  🧭 [Classify] "${query.substring(0, 40)}..." → ${mode} / ${method} (${(parsed.confidence * 100).toFixed(0)}%)`);

            return c.json({
                mode,
                method,
                task: parsed.task,
                confidence: parsed.confidence ?? 0.8,
                allowed_tools: toolMapping.allowed,
                forbidden: toolMapping.forbidden,
            });
        }

        throw new Error("Invalid classifier response");
    } catch (err) {
        log.warn(`  🧭 [Classify] Error, falling back to heuristic: ${(err as Error).message}`);
        // Fallback: simple heuristic
        const hResult = heuristicClassify(query, hasDashboard);
        const toolMapping = CRUD_TOOL_MAP[hResult.method];
        return c.json({
            ...hResult,
            allowed_tools: toolMapping.allowed,
            forbidden: toolMapping.forbidden,
        });
    }
});

// ─── Heuristic Fallback ─────────────────────────────────────

function heuristicClassify(query: string, hasDashboard: boolean): Omit<ClassifyResponse, 'allowed_tools' | 'forbidden'> {
    const lower = query.toLowerCase();

    // ACTION_WITH_CONTEXT signals (check first — most specific)
    const contextSignals = [
        "dashboard", "daraus", "davon", "aus dem", "from the", "from that",
        "poste das", "post this", "share this", "teile das", "schreib das",
        "die ergebnisse", "the results", "was du gefunden", "what you found",
    ];
    if (hasDashboard && contextSignals.some(s => lower.includes(s))) {
        return { mode: "ACTION_WITH_CONTEXT", method: inferMethod("ACTION_WITH_CONTEXT", query), task: query, confidence: 0.7 };
    }

    // COMBINED research+action detection ("check news about X and post it")
    // MUST be checked BEFORE individual signal arrays — otherwise "send" triggers
    // actionSignals or "news" triggers researchSignals, and this block is dead code.
    const hasResearchIntent = /\b(check|search|find|look up|news|nachricht|suche nach|finde|recherche)\b/i.test(lower);
    const hasActionIntent = /\b(post|tweet|send|share|poste|teile|sende|schreib)\b/i.test(lower);
    if (hasResearchIntent && hasActionIntent) {
        // Extract just the research part for the task
        const researchTask = query.replace(/\b(and|und)\s+(then\s+)?(post|tweet|send|share|poste|teile|sende|schreib).*$/i, '').trim();
        return { mode: "RESEARCH", method: "GET", task: researchTask || query, confidence: 0.7 };
    }

    // Navigation-target check
    const navTargetSignals = [
        "gehe zu", "geh zu", "geh auf", "go to", "navigate to",
        "open ", "öffne",
    ];
    if (navTargetSignals.some(s => lower.includes(s))) {
        return { mode: "ACTION", method: inferMethod("ACTION", query), task: query, confidence: 0.8 };
    }

    // CONTEXT_QUESTION signals
    const contextQuestionSignals = [
        "zusammenfassen", "summarize", "summary", "fasse zusammen",
        "explain", "erkläre", "translate", "übersetze",
        "was steht", "what does", "what is this", "worum geht",
        "tldr", "tl;dr", "was bedeutet", "what does it mean",
    ];
    if (contextQuestionSignals.some(s => lower.includes(s))) {
        return { mode: "CONTEXT_QUESTION", method: "GET", task: query, confidence: 0.7 };
    }

    // ACTION signals
    const actionSignals = [
        "klick", "click", "login", "sign in", "submit", "send",
        "compose", "gmail", "email", "mail",
        "siehst", "describe", "screen", "see", "beschreibe",
        "scroll", "what's on",
    ];
    if (actionSignals.some(s => lower.includes(s))) {
        return { mode: "ACTION", method: inferMethod("ACTION", query), task: query, confidence: 0.7 };
    }

    // RESEARCH signals
    const researchSignals = [
        "news", "neuigkeiten", "recherche", "research",
        "zeig mir", "show me", "find out", "überblick", "trends",
        "aktuell", "latest",
    ];
    if (researchSignals.some(s => lower.includes(s))) {
        return { mode: "RESEARCH", method: "GET", task: query, confidence: 0.6 };
    }

    // Default: ACTION + GET (safest)
    return { mode: "ACTION", method: "GET", task: query, confidence: 0.5 };
}

// ─── CRUD Method Inference (Heuristic) ──────────────────────
// Used when the LLM classifier doesn't return a method, or as
// part of the keyword-based fallback.

function inferMethod(mode: IntentMode, query: string): CrudMethod {
    if (mode === "RESEARCH" || mode === "CONTEXT_QUESTION") return "GET";

    const lower = query.toLowerCase();

    // DELETE signals
    if (/\b(delete|remove|löschen|entfernen|trash|papierkorb|unsubscribe|abmelden)\b/i.test(lower)) {
        return "DELETE";
    }
    // PUT signals 
    if (/\b(edit|change|update|modify|bearbeiten|ändern|aktualisieren|rename|umbenennen)\b/i.test(lower)) {
        return "PUT";
    }
    // POST signals
    if (/\b(write|send|compose|post|tweet|publish|submit|create|schreib|sende|verfasse|poste|erstelle|veröffentliche)\b/i.test(lower)) {
        return "POST";
    }
    // Default: GET (read-only is safest)
    return "GET";
}
