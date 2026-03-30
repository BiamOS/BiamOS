// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { eq } from "drizzle-orm";
import { db } from "../db/db.js";
import { safeParseJSON } from "../utils/safe-json.js";
import { agents } from "../db/schema.js";
import { zValidator } from "@hono/zod-validator";
import { updateAgentSchema } from "../validators/schemas.js";
import { getProviderConfig, getModelsUrl, getChatUrl, getHeaders } from "../services/llm-provider.js";
import { MODEL_FAST } from "../config/models.js";
import { SEED_AGENTS } from "../agents/agent-defaults.js";
import { log } from "../utils/logger.js";
import { streamAgentStep } from "../services/agent-actions.js";
import { saveWorkflowTrace, feedbackWorkflow, extractDomain } from "../services/agent-memory.js";
import { analyzeAndDistillTrajectory } from "../services/librarian.service.js";


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
                method: body.method || undefined,
                allowed_tools: body.allowed_tools || [],
                forbidden: body.forbidden || [],
                system_context: body.system_context || null,
                domain_knowledge: body.domain_knowledge || null,
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
            if (uddg) return uddg;
        } catch { /* use raw */ }
        return rawUrl.replace(/&amp;/g, '&');
    }

    // Parse DDG HTML with multiple fallback strategies
    function parseDdgResults(html: string): { title: string; snippet: string; url: string; favicon: string; domain: string }[] {
        const results: { title: string; snippet: string; url: string; favicon: string; domain: string }[] = [];
        const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();
        const getDomain = (u: string) => { try { return new URL(u).hostname.replace('www.', ''); } catch { return ''; } };
        const getFavicon = (u: string) => { try { return `https://www.google.com/s2/favicons?domain=${new URL(u).hostname}&sz=64`; } catch { return ''; } };

        // Strategy 1: Block-by-block parsing (avoids catastrophic regex backtracking)
        const blocks = html.split(/class="result__title"/i);
        for (let i = 1; i < blocks.length && results.length < MAX_RESULTS; i++) {
            const block = blocks[i];

            // Skip ad results
            if (i > 0 && blocks[i - 1].includes("result--ad")) continue;

            const linkMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"/i);
            if (!linkMatch) continue;

            const titleMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
            const title = titleMatch ? stripTags(titleMatch[1]) : "";

            const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
            const snippet = snippetMatch ? stripTags(snippetMatch[1]) : "";

            const rawUrl = linkMatch[1];
            // Skip ad results
            if (rawUrl.includes("ad_provider") || rawUrl.includes("ad_domain")) continue;

            const url = extractRealUrl(rawUrl);
            if (title) {
                results.push({ url, title, snippet, favicon: getFavicon(url), domain: getDomain(url) });
            }
        }
        if (results.length > 0) return results;

        // Strategy 2: Links with snippets as separate divs
        const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs;
        const snippetRegex = /<[^>]*class="result__snippet"[^>]*>(.*?)<\/(?:a|div|span)>/gs;
        const links: { url: string; title: string }[] = [];
        const snippets: string[] = [];
        let match;

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
                favicon: getFavicon(l.url),
                domain: getDomain(l.url),
            }));
        }

        // Strategy 3: Bare minimum — any result link
        const bareRegex = /<a[^>]*class="[^"]*result[^"]*"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs;
        while ((match = bareRegex.exec(html)) !== null && results.length < MAX_RESULTS) {
            const title = stripTags(match[2]);
            if (title.length > 3) {
                const cleanUrl = extractRealUrl(match[1]);
                results.push({ url: cleanUrl, title, snippet: '', favicon: getFavicon(cleanUrl), domain: getDomain(cleanUrl) });
            }
        }

        return results;
    }

    // ─── OG Metadata Fetcher ─────────────────────────────────
    // Fetch og:image, og:description, og:title from each result URL in parallel.
    // 3s timeout per URL — slow sites are gracefully skipped.
    async function enrichWithOgMetadata(
        results: { title: string; snippet: string; url: string; favicon: string; domain: string }[]
    ): Promise<{ title: string; snippet: string; url: string; favicon: string; domain: string; ogImage: string; ogDescription: string; ogTitle: string }[]> {
        const OG_TIMEOUT = 3000;

        const fetches = results.map(async (r) => {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), OG_TIMEOUT);
                const resp = await fetch(r.url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; BiamBot/1.0)',
                        'Accept': 'text/html',
                    },
                });
                clearTimeout(timer);

                // Only read first 20KB to find OG tags (they're in <head>)
                const reader = resp.body?.getReader();
                let html = '';
                if (reader) {
                    const decoder = new TextDecoder();
                    let bytesRead = 0;
                    while (bytesRead < 20000) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        html += decoder.decode(value, { stream: true });
                        bytesRead += value.length;
                    }
                    reader.cancel();
                }

                // Parse OG tags
                const getOg = (prop: string): string => {
                    const m = html.match(new RegExp(`<meta[^>]*property=["']og:${prop}["'][^>]*content=["']([^"']*)["']`, 'i'))
                        || html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${prop}["']`, 'i'));
                    return m?.[1] || '';
                };

                return {
                    ...r,
                    ogImage: getOg('image'),
                    ogDescription: getOg('description') || r.snippet,
                    ogTitle: getOg('title') || r.title,
                };
            } catch {
                return { ...r, ogImage: '', ogDescription: r.snippet, ogTitle: r.title };
            }
        });

        const settled = await Promise.allSettled(fetches);
        return settled.map((s, i) =>
            s.status === 'fulfilled' ? s.value : { ...results[i], ogImage: '', ogDescription: results[i].snippet, ogTitle: results[i].title }
        );
    }

    try {
        let results: { title: string; snippet: string; url: string; favicon: string; domain: string }[] = [];

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                log.debug(`  🔍 Agent search: retry ${attempt}/${MAX_RETRIES} after empty result`);
                await new Promise(r => setTimeout(r, 1000 * attempt)); // Backoff
            }

            // Auto-detect news queries and add time filter (past month)
            const newsKeywords = /\b(news|neuigkeiten|aktuell|latest|trends|recent|neue|today|heute|this week|diese woche|2026)\b/i;
            const timeFilter = (newsKeywords.test(query) && attempt === 0) ? '&df=m' : '';
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}${timeFilter}`;
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

        // Enrich with OG metadata (parallel, 3s timeout per URL)
        log.debug(`  🔍 Enriching ${results.length} results with OG metadata...`);
        const enriched = await enrichWithOgMetadata(results);
        const ogCount = enriched.filter(r => r.ogImage).length;
        log.debug(`  🔍 OG enrichment: ${ogCount}/${enriched.length} have og:image`);

        // Format as text for the agent — include OG images for richer dashboards
        const text = enriched.length > 0
            ? enriched.map((r, i) => `${i + 1}. ${r.ogTitle || r.title}${r.ogDescription ? ' — ' + r.ogDescription.substring(0, 150) : ''}${r.ogImage ? ' [image: ' + r.ogImage + ']' : ''} (${r.url})`).join('\n')
            : 'No results found for: ' + query;

        log.debug(`  🔍 Agent search: ${enriched.length} results found`);

        return c.json({
            biam_protocol: "2.0",
            action: "search_results",
            query,
            results: text,
            structured: enriched, // Structured JSON with OG metadata
            count: enriched.length,
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

// ─── POST /agents/genui — Generate Block-JSON dashboard ─────
// The LLM generates an array of BiamOS blocks (from the block catalog).
// The frontend renders them using the existing BlockRenderer.

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

        const { buildGenUIPrompt, GenUIResponseSchema, buildErrorFallbackBlocks } = await import("../prompts/genui-prompt.js");
        const systemPrompt = buildGenUIPrompt(data);

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
                temperature: 0.5,
                max_tokens: 6000,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => "");
            log.error(`  🎨 GenUI LLM error: ${response.status} ${errText.substring(0, 200)}`);
            return c.json({ error: `LLM error: ${response.status}` }, 502);
        }

        const result = await response.json();
        let raw = result.choices?.[0]?.message?.content || "";
        log.debug(`  🎨 GenUI raw (first 300): ${raw.substring(0, 300)}`);

        // Record usage for the layout architect dashboard
        const usage = result.usage ?? {};
        await import("../server-utils.js").then(({ logTokenUsage, incrementAgentUsage }) => {
            logTokenUsage("agent:layout-architect", MODEL_FAST, usage).catch(() => {});
            incrementAgentUsage("layout-architect", usage).catch(() => {});
        });

        // Use safeParseJSON — handles markdown fences, prose wrapping, embedded JSON
        const parsed = safeParseJSON(raw);
        if (!parsed) {
            log.error(`  🎨 GenUI: LLM returned invalid JSON — raw content: ${raw.substring(0, 500)}`);
            const fallback = buildErrorFallbackBlocks("LLM returned invalid JSON — could not parse response.");
            return c.json({ biam_protocol: "2.0", action: "genui_render", ...fallback });
        }

        const validation = GenUIResponseSchema.safeParse(parsed);
        if (!validation.success) {
            log.error(`  🎨 GenUI: Block validation failed:`, validation.error.issues);
            // Try to salvage: if parsed has a blocks array, filter to valid blocks only
            const anyParsed = parsed as Record<string, unknown>;
            if (Array.isArray(anyParsed?.blocks) && anyParsed.blocks.length > 0) {
                log.debug(`  🎨 GenUI: Salvaging ${anyParsed.blocks.length} blocks (some may have invalid types)`);
                return c.json({
                    biam_protocol: "2.0",
                    action: "genui_render",
                    blocks: anyParsed.blocks,
                });
            }
            const fallback = buildErrorFallbackBlocks("LLM returned blocks with invalid structure.");
            return c.json({ biam_protocol: "2.0", action: "genui_render", ...fallback });
        }

        log.debug(`  🎨 GenUI: generated ${validation.data.blocks.length} blocks`);

        return c.json({
            biam_protocol: "2.0",
            action: "genui_render",
            blocks: validation.data.blocks,
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

        // V3 Librarian: Fire-and-forget distillation when the agent
        // struggled (recoverySteps > 0) but ultimately succeeded.
        // Non-blocking — never delays the agent response.
        const recoverySteps: number = body.recoverySteps ?? 0;
        const url: string = body.url ?? body.domain;
        if (recoverySteps > 0 && body.steps?.length > 0) {
            analyzeAndDistillTrajectory(
                body.steps,
                url,
                body.task,
                recoverySteps
            ).catch(() => { /* Librarian failure is non-critical */ });
        }

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

// ─── GET /agents/memory/match — Find matching workflow ──────

agentRoutes.get("/memory/match", async (c) => {
    const q = c.req.query("q");
    const domain = c.req.query("domain");

    if (!q || !domain) {
        return c.json({ error: "q (task) and domain are required" }, 400);
    }

    try {
        const { lookupWorkflow } = await import("../services/agent-memory.js");
        const match = await lookupWorkflow(domain, q);

        if (match) {
            return c.json({
                biam_protocol: "2.0",
                action: "memory_match",
                match,
            });
        } else {
            return c.json({
                biam_protocol: "2.0",
                action: "memory_nomatch",
                match: null,
            });
        }
    } catch (err) {
        log.error(`  🧠 Memory match error: ${err}`);
        return c.json({ error: "Failed to lookup workflow" }, 500);
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


// ─── POST /agents/knowledge — Matrix Download (Headless Research) ──────────
// Runs a silent, headless research pass in the backend RAM.
// Returns a compressed knowledge string for context injection into the
// ACTION_WITH_CONTEXT agent. No webview involved, no dashboard rendered.

agentRoutes.post("/knowledge", async (c) => {
    const body = await c.req.json().catch(() => null);
    const { task, platform } = body || {};
    if (!task) return c.json({ error: "task is required" }, 400);

    const cacheKey = `${platform || 'generic'}::${task.slice(0, 80)}`;
    log.info(`  🧠 [Matrix Download] Researching: "${task}"`);

    try {
        const { getChatUrl, getHeaders } = await import("../services/llm-provider.js");
        const { MODEL_FAST } = await import("../config/models.js");

        const systemPrompt = `You are a knowledge extraction agent. Your ONLY job is to research the given task and return concise, actionable knowledge.

RULES:
- Use search_web to find documentation, tutorials, or guides
- Use take_notes to record key facts (parameters, steps, UI elements, API fields)
- Use done() with a markdown summary when you have enough to guide an AI agent
- Max 5 steps total — be fast and precise
- Output: dense markdown, max 600 tokens, NO fluff
- Focus on: exact UI steps, field names, parameter names, required inputs

TASK: ${task}`;

        // Call LLM with headless research tools (no genui, no browser tools)
        const chatUrl = await getChatUrl();
        const headers = await getHeaders();

        const tools = [
            {
                type: "function",
                function: {
                    name: "search_web",
                    description: "Search the web for documentation or tutorials",
                    parameters: {
                        type: "object",
                        properties: { query: { type: "string" } },
                        required: ["query"],
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "take_notes",
                    description: "Record key facts extracted from research",
                    parameters: {
                        type: "object",
                        properties: {
                            context: { type: "string" },
                            items: { type: "array", items: { type: "string" } },
                        },
                        required: ["context", "items"],
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "done",
                    description: "Return the final knowledge summary",
                    parameters: {
                        type: "object",
                        properties: { knowledge: { type: "string", description: "Dense markdown knowledge summary" } },
                        required: ["knowledge"],
                    },
                },
            },
        ];

        const messages: any[] = [{ role: "system", content: systemPrompt }];
        let knowledge = "";
        const MAX_STEPS = 5;

        for (let step = 0; step < MAX_STEPS; step++) {
            const resp = await fetch(chatUrl, {
                method: "POST",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify({ model: MODEL_FAST, messages, tools, tool_choice: "auto" }),
            });

            if (!resp.ok) throw new Error(`LLM error: ${resp.status}`);
            const data = await resp.json();
            const msg = data.choices?.[0]?.message;
            if (!msg) break;

            messages.push(msg);

            const toolCalls = msg.tool_calls || [];
            if (toolCalls.length === 0) {
                // Text response fallback
                knowledge = msg.content || "";
                break;
            }

            let done = false;
            const toolResults: any[] = [];

            for (const tc of toolCalls) {
                const fnName = tc.function?.name;
                let args: any = {};
                try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* */ }

                let result = "";

                if (fnName === "search_web") {
                    log.info(`  🧠 [Matrix] search_web: "${args.query}"`);
                    // Use the existing backend search endpoint
                    try {
                        const searchResp = await fetch("http://localhost:3001/api/agents/search", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ query: args.query }),
                        });
                        const searchData = await searchResp.json();
                        result = searchData.results || "No results found";
                    } catch {
                        result = "Search unavailable";
                    }
                } else if (fnName === "take_notes") {
                    result = `Notes recorded: ${args.context} — ${(args.items || []).join(", ")}`;
                } else if (fnName === "done") {
                    knowledge = args.knowledge || "";
                    result = "Knowledge extracted.";
                    done = true;
                }

                toolResults.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content: result,
                });
            }

            messages.push(...toolResults);
            if (done) break;
        }

        if (!knowledge) {
            knowledge = "Could not extract specific knowledge. Proceed with general AI judgment.";
        }

        log.info(`  🧠 [Matrix Download] Complete (${knowledge.length} chars)`);
        return c.json({ knowledge, cacheKey });

    } catch (err) {
        log.error(`  🧠 [Matrix Download] Error: ${err}`);
        return c.json({ error: String(err) }, 500);
    }
});

export { agentRoutes };

