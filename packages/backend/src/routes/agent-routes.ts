// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { eq } from "drizzle-orm";
import { db } from "../db/db.js";
import { agents } from "../db/schema.js";
import { zValidator } from "@hono/zod-validator";
import { updateAgentSchema } from "../validators/schemas.js";
import { getProviderConfig, getModelsUrl, getChatUrl, getHeaders } from "../services/llm-provider.js";
import { MODEL_FAST } from "../config/models.js";
import { SEED_AGENTS } from "../agents/agent-defaults.js";
import { log } from "../utils/logger.js";
import { streamAgentStep } from "../services/agent-actions.js";
import { saveWorkflowTrace, feedbackWorkflow, extractDomain } from "../services/agent-memory.js";

const agentRoutes = new Hono();

// ─── Models Cache ──────────────────────────────────────────

interface ModelInfo {
    id: string;
    name: string;
    provider: string;
    context: number;
    pricing: string;
    thinking: boolean;
}

let modelsCache: ModelInfo[] = [];
let modelsCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Known thinking models (reasoning-capable)
const THINKING_PATTERNS = [
    /gemini-2\.5-(?:pro|flash)(?!.*lite)/i,
    /claude-(?:sonnet|opus)/i,
    /gpt-4o(?!.*mini)/i,
    /o1|o3|o4/i,
    /deepseek-r1/i,
    /qwq/i,
];

function isThinkingModel(id: string): boolean {
    return THINKING_PATTERNS.some(p => p.test(id));
}

function extractProvider(id: string): string {
    const slash = id.indexOf("/");
    if (slash === -1) return "Other";
    const raw = id.substring(0, slash);
    // Capitalize
    const map: Record<string, string> = {
        google: "Google", anthropic: "Anthropic", openai: "OpenAI",
        meta: "Meta", mistralai: "Mistral", deepseek: "DeepSeek",
        qwen: "Qwen", cohere: "Cohere", "x-ai": "xAI",
    };
    return map[raw.toLowerCase()] || raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatPricing(model: any): string {
    const prompt = parseFloat(model.pricing?.prompt || "0");
    if (prompt === 0) return "Free";
    const perMillion = prompt * 1_000_000;
    if (perMillion < 0.01) return "Free";
    if (perMillion < 1) return `$${perMillion.toFixed(3)}/1M`;
    return `$${perMillion.toFixed(2)}/1M`;
}

// ─── GET /agents/models — LLM model list ───────────────────

agentRoutes.get("/models", async (c) => {
    // Return cache if fresh
    if (modelsCache.length > 0 && Date.now() - modelsCacheTime < CACHE_TTL) {
        return c.json({ biam_protocol: "2.0", action: "model_list", models: modelsCache });
    }

    try {
        const config = await getProviderConfig();
        const modelsUrl = await getModelsUrl();

        const headers: Record<string, string> = {};
        if (config.apiKey) {
            headers["Authorization"] = `Bearer ${config.apiKey}`;
        }

        const response = await fetch(modelsUrl, { headers });

        if (!response.ok) {
            return c.json({ biam_protocol: "2.0", action: "error", message: `Model list error (${config.provider}): ${response.status}` }, 502);
        }

        const data = await response.json();
        let models: ModelInfo[];

        if (config.provider === "ollama") {
            // Ollama /v1/models returns { data: [{ id, ... }] } or /api/tags returns { models: [...] }
            const rawModels = data.data || data.models || [];
            models = rawModels.map((m: any) => ({
                id: m.id || m.name || m.model,
                name: m.id || m.name || m.model,
                provider: "Ollama (local)",
                context: m.context_length || 0,
                pricing: "Free (local)",
                thinking: isThinkingModel(m.id || m.name || ""),
            }));
        } else if (config.provider === "lmstudio") {
            // LM Studio uses OpenAI format: { data: [...] }
            const rawModels = data.data || [];
            models = rawModels.map((m: any) => ({
                id: m.id,
                name: m.id,
                provider: "LM Studio (local)",
                context: m.context_length || 0,
                pricing: "Free (local)",
                thinking: isThinkingModel(m.id || ""),
            }));
        } else {
            // OpenRouter / Custom — same format
            models = (data.data || [])
                .filter((m: any) => m.id && m.name)
                .map((m: any) => ({
                    id: m.id,
                    name: m.name,
                    provider: extractProvider(m.id),
                    context: m.context_length || 0,
                    pricing: formatPricing(m),
                    thinking: isThinkingModel(m.id),
                }))
                .sort((a: ModelInfo, b: ModelInfo) => {
                    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
                    if (a.thinking !== b.thinking) return a.thinking ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
        }

        modelsCache = models;
        modelsCacheTime = Date.now();


        return c.json({ biam_protocol: "2.0", action: "model_list", models });
    } catch (err) {
        return c.json({
            biam_protocol: "2.0", action: "error",
            message: err instanceof Error ? err.message : "Failed to fetch models",
        }, 500);
    }
});

// ─── GET /agents — List all agents ─────────────────────────

agentRoutes.get("/", async (c) => {
    const allAgents = await db
        .select()
        .from(agents)
        .orderBy(agents.pipeline, agents.step_order);

    return c.json({
        biam_protocol: "2.0",
        action: "agent_list",
        agents: allAgents,
    });
});

// ─── GET /agents/memory — List all learned workflows ────────

agentRoutes.get("/memory", async (c) => {
    const { agentWorkflows } = await import("../db/schema.js");
    const workflows = await db
        .select()
        .from(agentWorkflows)
        .orderBy(agentWorkflows.id);

    const items = workflows.map((wf) => {
        let stepCount = 0;
        let steps: any[] = [];
        try {
            steps = JSON.parse(wf.steps_json);
            stepCount = steps.length;
        } catch { /* ignore */ }

        return {
            id: wf.id,
            domain: wf.domain,
            intent_hash: wf.intent_hash,
            intent_text: wf.intent_text,
            success_count: wf.success_count,
            fail_count: wf.fail_count,
            verified: !!wf.verified,
            has_embedding: !!wf.intent_embedding,
            step_count: stepCount,
            steps,
            created_at: wf.created_at,
            updated_at: wf.updated_at,
        };
    });

    return c.json({
        biam_protocol: "2.0",
        action: "memory_list",
        workflows: items,
        stats: {
            total: items.length,
            verified: items.filter((w) => w.verified).length,
            with_embedding: items.filter((w) => w.has_embedding).length,
            domains: [...new Set(items.map((w) => w.domain))].length,
        },
    });
});

// ─── DELETE /agents/memory/:id — Delete single workflow ─────

agentRoutes.delete("/memory/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) {
        return c.json({ error: "Invalid workflow ID" }, 400);
    }

    const { agentWorkflows } = await import("../db/schema.js");
    await db.delete(agentWorkflows).where(eq(agentWorkflows.id, id));
    log.debug(`  🧠 Memory: deleted workflow #${id}`);

    return c.json({
        biam_protocol: "2.0",
        action: "memory_deleted",
        deleted_id: id,
    });
});

// ─── DELETE /agents/memory — Clear all workflows ────────────

agentRoutes.delete("/memory", async (c) => {
    const { agentWorkflows } = await import("../db/schema.js");
    const before = await db.select().from(agentWorkflows);
    await db.delete(agentWorkflows);
    log.debug(`  🧠 Memory: cleared all ${before.length} workflows`);

    return c.json({
        biam_protocol: "2.0",
        action: "memory_cleared",
        deleted_count: before.length,
    });
});

// ─── PATCH /agents/memory/:id — Toggle verified status ──────

agentRoutes.patch("/memory/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) {
        return c.json({ error: "Invalid workflow ID" }, 400);
    }

    const body = await c.req.json().catch(() => null);
    if (body?.verified === undefined) {
        return c.json({ error: "verified field is required" }, 400);
    }

    const { agentWorkflows } = await import("../db/schema.js");
    await db
        .update(agentWorkflows)
        .set({ verified: !!body.verified, updated_at: new Date().toISOString() })
        .where(eq(agentWorkflows.id, id));

    log.debug(`  🧠 Memory: workflow #${id} ${body.verified ? "verified ✅" : "unverified"}`);

    return c.json({
        biam_protocol: "2.0",
        action: "memory_updated",
        id,
        verified: !!body.verified,
    });
});

// ─── GET /agents/:name — Get single agent ──────────────────

agentRoutes.get("/:name", async (c) => {
    const name = c.req.param("name");
    const [agent] = await db
        .select()
        .from(agents)
        .where(eq(agents.name, name))
        .limit(1);

    if (!agent) {
        return c.json({
            biam_protocol: "2.0",
            action: "error",
            message: `Agent "${name}" not found`,
        }, 404);
    }

    return c.json({
        biam_protocol: "2.0",
        action: "agent_detail",
        agent,
    });
});

// ─── PUT /agents/:name — Update agent config ───────────────

agentRoutes.put("/:name",
    zValidator("json", updateAgentSchema, (result, c) => {
        if (!result.success) {
            return c.json({
                biam_protocol: "2.0",
                action: "error",
                message: result.error.issues.map((i) => i.message).join(", "),
            }, 400);
        }
    }),
    async (c) => {
        const name = c.req.param("name");
        const body = c.req.valid("json");

        // Check agent exists
        const [existing] = await db
            .select()
            .from(agents)
            .where(eq(agents.name, name))
            .limit(1);

        if (!existing) {
            return c.json({
                biam_protocol: "2.0",
                action: "error",
                message: `Agent "${name}" not found`,
            }, 404);
        }

        // Build update object
        const updates: Record<string, any> = {};
        if (body.prompt !== undefined) updates.prompt = body.prompt;
        if (body.model !== undefined) updates.model = body.model;
        if (body.is_active !== undefined) updates.is_active = body.is_active;
        if (body.temperature !== undefined) updates.temperature = body.temperature;
        if (body.max_tokens !== undefined) updates.max_tokens = body.max_tokens;

        if (Object.keys(updates).length > 0) {
            await db
                .update(agents)
                .set(updates)
                .where(eq(agents.name, name));
        }

        // Return updated agent
        const [updated] = await db
            .select()
            .from(agents)
            .where(eq(agents.name, name))
            .limit(1);


        return c.json({
            biam_protocol: "2.0",
            action: "agent_updated",
            agent: updated,
        });
    }
);
// ─── Reset Agent to Default ────────────────────────────────

agentRoutes.post("/:name/reset", async (c) => {
    const name = c.req.param("name");

    // Find default config
    const defaults = SEED_AGENTS.find((a) => a.name === name);
    if (!defaults) {
        return c.json({
            biam_protocol: "2.0",
            action: "error",
            message: `No default config found for agent "${name}"`,
        }, 404);
    }

    // Check agent exists in DB
    const [existing] = await db
        .select()
        .from(agents)
        .where(eq(agents.name, name))
        .limit(1);

    if (!existing) {
        return c.json({
            biam_protocol: "2.0",
            action: "error",
            message: `Agent "${name}" not found in database`,
        }, 404);
    }

    // Reset to defaults
    await db
        .update(agents)
        .set({
            prompt: defaults.prompt,
            model: defaults.model,
            temperature: defaults.temperature,
            max_tokens: defaults.max_tokens,
        })
        .where(eq(agents.name, name));

    // Return updated agent
    const [updated] = await db
        .select()
        .from(agents)
        .where(eq(agents.name, name))
        .limit(1);

    log.debug(`  🔄 Agent "${name}" reset to defaults`);

    return c.json({
        biam_protocol: "2.0",
        action: "agent_reset",
        agent: updated,
    });
});

// ─── POST /act — AI Browser Agent Step (SSE) ───────────────
// Receives screenshot + DOM snapshot, returns the next action.
// The frontend calls this in a loop until "done" or "ask_user".

agentRoutes.post("/act", async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body || !body.task) {
        return c.json({ error: "task is required" }, 400);
    }

    log.debug(`  🤖 Agent /act: task="${body.task?.substring(0, 60)}" steps=${body.history?.length || 0}`);

    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    return stream(c, async (s) => {
        await streamAgentStep(
            {
                task: body.task,
                page_url: body.page_url || "",
                page_title: body.page_title || "",
                dom_snapshot: body.dom_snapshot || "",
                screenshot: body.screenshot || undefined,
                history: body.history || [],
                step_number: body.step_number ?? undefined,
                max_steps: body.max_steps ?? undefined,
            },
            (event) => {
                s.write(event);
            },
        );
    });
});

// ─── POST /agents/search — Web search for AI agent ──────────
// Fetches web search results so the agent doesn't need to navigate away.

agentRoutes.post("/search", async (c) => {
    const body = await c.req.json().catch(() => null);
    const query = body?.query || '';

    if (!query) {
        return c.json({ error: "query is required" }, 400);
    }

    log.debug(`  🔍 Agent search: "${query}"`);

    const MAX_RESULTS = 8;
    const MAX_RETRIES = 2;

    // Extract real URL from DDG redirect wrapper
    function extractRealUrl(rawUrl: string): string {
        try {
            const u = rawUrl.replace(/&amp;/g, '&');
            const parsed = new URL(u, "https://duckduckgo.com");
            const uddg = parsed.searchParams.get("uddg");
            if (uddg) return decodeURIComponent(uddg);
        } catch { /* use raw */ }
        return rawUrl.replace(/&amp;/g, '&');
    }

    // Parse DDG HTML with multiple fallback strategies
    function parseDdgResults(html: string): { title: string; snippet: string; url: string }[] {
        const results: { title: string; snippet: string; url: string }[] = [];
        const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();

        // Strategy 1: Full match (title + snippet + URL)
        const fullRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>.*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gs;
        let match;
        while ((match = fullRegex.exec(html)) !== null && results.length < MAX_RESULTS) {
            results.push({
                url: extractRealUrl(match[1]),
                title: stripTags(match[2]),
                snippet: stripTags(match[3]),
            });
        }
        if (results.length > 0) return results;

        // Strategy 2: Links with snippets as separate divs
        const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs;
        const snippetRegex = /<[^>]*class="result__snippet"[^>]*>(.*?)<\/(?:a|div|span)>/gs;
        const links: { url: string; title: string }[] = [];
        const snippets: string[] = [];

        while ((match = linkRegex.exec(html)) !== null && links.length < MAX_RESULTS) {
            links.push({ url: extractRealUrl(match[1]), title: stripTags(match[2]) });
        }
        while ((match = snippetRegex.exec(html)) !== null) {
            snippets.push(stripTags(match[1]));
        }
        if (links.length > 0) {
            return links.map((l, i) => ({
                ...l,
                snippet: snippets[i] || '',
            }));
        }

        // Strategy 3: Bare minimum — any result link
        const bareRegex = /<a[^>]*class="[^"]*result[^"]*"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs;
        while ((match = bareRegex.exec(html)) !== null && results.length < MAX_RESULTS) {
            const title = stripTags(match[2]);
            if (title.length > 3) {
                results.push({ url: extractRealUrl(match[1]), title, snippet: '' });
            }
        }

        return results;
    }

    try {
        let results: { title: string; snippet: string; url: string }[] = [];

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                log.debug(`  🔍 Agent search: retry ${attempt}/${MAX_RETRIES} after empty result`);
                await new Promise(r => setTimeout(r, 1000 * attempt)); // Backoff
            }

            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            const resp = await fetch(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });
            const html = await resp.text();
            results = parseDdgResults(html);

            if (results.length > 0) break;
        }

        // Format as text for the agent (backward compatible)
        const text = results.length > 0
            ? results.map((r, i) => `${i + 1}. ${r.title}${r.snippet ? ' — ' + r.snippet : ''}${r.url ? ' (' + r.url + ')' : ''}`).join('\n')
            : 'No results found for: ' + query;

        log.debug(`  🔍 Agent search: ${results.length} results found`);

        return c.json({
            biam_protocol: "2.0",
            action: "search_results",
            query,
            results: text,
            structured: results, // Structured JSON for future use
            count: results.length,
        });
    } catch (err) {
        log.error(`  🔍 Agent search error: ${err}`);
        return c.json({
            biam_protocol: "2.0",
            action: "search_results",
            query,
            results: `Search failed: ${err instanceof Error ? err.message : 'unknown error'}`,
            count: 0,
        });
    }
});

// ─── POST /agents/genui — Generate interactive HTML dashboard ─
// The LLM generates a full Tailwind-styled HTML page that gets
// loaded into the webview as a Data-URI sandbox. Buttons call
// triggerAgent() which posts back to BiamOS via console-message.

agentRoutes.post("/genui", async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body?.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
        return c.json({ error: "prompt is required" }, 400);
    }

    const prompt = body.prompt.trim();
    const data = body.data || null;

    log.debug(`  🎨 GenUI: prompt="${prompt.substring(0, 60)}"`);

    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("GenUI");

        const systemPrompt = `You are an expert dashboard designer for BiamOS. Transform provided data into stunning, information-rich HTML dashboards.

YOUR PHILOSOPHY: Be CREATIVE with layout, design, icons, badges, and visual hierarchy. Be STRICT about data accuracy — never invent facts, URLs, or content. If data is missing, skip that field — don't fake it.

DATA FORMAT:
- Data arrives as structured JSON with an "items" array. Each item has: title, url, source, date, category, priority, summary, details.
- Iterate the items array to build cards. Use every field that exists — skip missing fields gracefully.
- Additional context may be in "search_context" (text from web searches).

DATA RULES:
1. All text, URLs, and numbers MUST come from the provided data. NEVER invent URLs or use placeholders (example.com, etc.).
2. You CAN and SHOULD add: emoji indicators (🔴 urgent, 🟡 medium, 🟢 low), status badges, priority tags, category labels, and visual cues derived from the tone/content of the data.
3. If an item has priority "urgent" or "high" — highlight it prominently with red accents, badges, or icons.
4. Filter out navigation aids: search engine results (Gmail, Proton Mail links, login pages) are NOT dashboard content. Only show real user data.

SUMMARY HEADER:
- Start with a contextual emoji + summary line: "📬 6 Emails — 2 urgent, 1 action required" or "📰 5 Articles from today's AI news".
- Below the summary, add a quick-glance stats bar if applicable (e.g., urgent count, categories, date range).

INTERACTIVITY:
- Items WITH URLs: use <a href="URL" target="_blank"> styled as cyan links or buttons.
- Items WITHOUT URLs: make cards EXPANDABLE with onclick="this.querySelector('.detail').classList.toggle('hidden')". Show a "▼ Details" indicator so users know they can click.
- ACTION BUTTONS: For items where follow-up actions make sense (reply to email, visit profile, etc.), add a button that calls:
  onclick="biam.prefillCommand('/act <describe the action with full context>')"
  Example: onclick="biam.prefillCommand('/act Reply to John\\'s email about the Q2 deadline')"
  This pre-fills the user's command input — they press Enter to execute. Do NOT auto-trigger anything.
- ALWAYS show core info at a glance (title, from/source, date, priority) — full detail only on expand.

DESIGN LANGUAGE:
- <!DOCTYPE html> with Tailwind CDN + Inter font.
- Dark theme: bg-gray-950 body, bg-gray-800/bg-gray-850 cards, text-white headings.
- Color-coded left borders: border-l-4 border-red-500 (urgent), border-yellow-500 (important), border-cyan-500 (normal), border-gray-600 (low priority).
- Cards in "grid grid-cols-1 md:grid-cols-2 gap-4" (2 columns on desktop, 1 on mobile).
- Each card: rounded-xl p-5, subtle hover effect (hover:bg-gray-750 transition-colors), cursor-pointer for expandable cards.
- Card inner structure: 
  * Top row: title (font-semibold text-lg) + date badge (text-xs bg-gray-700 rounded-full px-2 py-0.5)
  * Meta row: from/source in text-sm text-gray-400 + any priority badges
  * Snippets: 2-3 lines of preview text in text-sm text-gray-300 (visible by default)
  * Expandable detail: hidden div with full content, rich text, metadata
  * Action button (if applicable): small cyan button calling biam.prefillCommand()
- If items have actionable deadlines, show a "⏰ Due: Today" or "📅 Deadline: Tomorrow" tag.
- Use smooth transitions: transition-all duration-200.
- Body padding: p-6 max-w-6xl mx-auto.
4. Output ONLY valid HTML. No markdown, no explanations, no code fences.`;



        const userMessage = data
            ? `${prompt}\n\nHere is the data to display:\n${JSON.stringify(data, null, 2)}`
            : prompt;

        const response = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_FAST,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage },
                ],
                temperature: 0.3,
                max_tokens: 8000,
            }),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => "");
            log.error(`  🎨 GenUI LLM error: ${response.status} ${errText.substring(0, 200)}`);
            return c.json({ error: `LLM error: ${response.status}` }, 502);
        }

        const result = await response.json();
        let html = result.choices?.[0]?.message?.content || "";

        // Strip markdown fences if the LLM wrapped it anyway
        html = html.replace(/^```html?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

        if (!html || !html.includes("<")) {
            return c.json({ error: "LLM did not return valid HTML" }, 502);
        }

        log.debug(`  🎨 GenUI: generated ${html.length} chars of HTML`);

        return c.json({
            biam_protocol: "2.0",
            action: "genui_render",
            html,
        });
    } catch (err) {
        log.error(`  🎨 GenUI error: ${err}`);
        return c.json({
            error: err instanceof Error ? err.message : "GenUI generation failed",
        }, 500);
    }
});

// ─── POST /agents/memory/save — Save agent workflow trace ───

agentRoutes.post("/memory/save", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.domain || !body?.task || !body?.steps) {
        return c.json({ error: "domain, task, and steps are required" }, 400);
    }

    try {
        const id = await saveWorkflowTrace(body.domain, body.task, body.steps);
        return c.json({
            biam_protocol: "2.0",
            action: "memory_saved",
            workflow_id: id,
        });
    } catch (err) {
        log.error(`  🧠 Memory save error: ${err}`);
        return c.json({ error: "Failed to save workflow" }, 500);
    }
});

// ─── POST /agents/memory/feedback — 👍/👎 workflow ──────────

agentRoutes.post("/memory/feedback", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body?.workflow_id == null || body?.positive == null) {
        return c.json({ error: "workflow_id and positive are required" }, 400);
    }

    try {
        await feedbackWorkflow(body.workflow_id, body.positive);
        return c.json({
            biam_protocol: "2.0",
            action: body.positive ? "workflow_verified" : "workflow_rejected",
        });
    } catch (err) {
        log.error(`  🧠 Memory feedback error: ${err}`);
        return c.json({ error: "Failed to update workflow" }, 500);
    }
});

export { agentRoutes };
