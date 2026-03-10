// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/db.js";
import { agents } from "../db/schema.js";
import { zValidator } from "@hono/zod-validator";
import { updateAgentSchema } from "../validators/schemas.js";
import { getProviderConfig, getModelsUrl } from "../services/llm-provider.js";
import { SEED_AGENTS } from "../agents/agent-defaults.js";
import { log } from "../utils/logger.js";

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

export { agentRoutes };
