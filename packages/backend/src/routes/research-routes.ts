// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Research Routes (SSE Streaming)
// ============================================================
// POST /api/research — Streams research progress via SSE,
// then delivers validated GenUI dashboard blocks.
//
// INTEGRATION FAST-PATH:
// If the query matches a live integration (e.g. Open-Meteo for
// "wetter wien"), calls the API directly and pipes the JSON
// through the GenUI generator instead of doing a web search.
// ============================================================

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { runResearch } from "../services/research-engine.js";
import { getIntegrationForQuery, type MatchedIntegration } from "../services/integration-context.js";
import { buildGenUIPrompt, GenUIResponseSchema, buildErrorFallbackBlocks } from "../prompts/genui-prompt.js";
import { getChatUrl, getHeaders } from "../services/llm-provider.js";
import { MODEL_FAST, MODEL_THINKING } from "../config/models.js";
import { logTokenUsage } from "../server-utils.js";
import { safeParseJSON } from "../utils/safe-json.js";
import { log } from "../utils/logger.js";

export const researchRoutes = new Hono();

// ─── POST /api/research ─────────────────────────────────────

researchRoutes.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || !body.query) {
        return c.json({ error: "Missing 'query' field" }, 400);
    }

    const query = String(body.query).trim();
    if (query.length === 0 || query.length > 500) {
        return c.json({ error: "Query must be 1-500 characters" }, 400);
    }

    log.info(`  🔬 [Research] Starting: "${query.substring(0, 60)}..."`);

    return streamSSE(c, async (stream) => {
        let eventId = 0;

        const emit = async (event: string, data: object) => {
            await stream.writeSSE({
                event,
                data: JSON.stringify(data),
                id: String(++eventId),
            }).catch(() => { /* client disconnected */ });
        };

        // ── INTEGRATION FAST-PATH ────────────────────────────
        // Check if a live integration matches this query.
        // If so, call the API directly and pipe into GenUI.
        const matched = await getIntegrationForQuery(query);
        if (matched) {
            log.info(`  🔌 [Research] Integration fast-path: ${matched.groupName}`);
            await emit("step", { phase: "search", status: "planning", data: { query, integration: matched.groupName } });

            const blocks = await runIntegrationResearch(query, matched, emit);

            await stream.writeSSE({
                event: "dashboard",
                data: JSON.stringify({ blocks, sources: [] }),
                id: String(++eventId),
            }).catch(() => {});

            log.info(`  🔌 [Research] Integration complete: ${matched.groupName} → ${blocks.length} blocks`);
            return;
        }

        // ── STANDARD WEB RESEARCH PATH ───────────────────────
        const result = await runResearch(query, (step) => {
            const id = String(++eventId);
            const event = step.phase === "done" ? "done" : step.phase === "error" ? "error" : "step";
            stream.writeSSE({ event, data: JSON.stringify(step), id }).catch(() => {});
        });

        await stream.writeSSE({
            event: "dashboard",
            data: JSON.stringify({ blocks: result.blocks, sources: result.sources }),
            id: String(++eventId),
        });

        log.info(`  🔬 [Research] Complete: "${query.substring(0, 40)}..." → ${result.blocks.length} blocks in ${result.totalSteps} steps`);
    });
});

// ─── Integration Research Pipeline ──────────────────────────

/**
 * Execute an integration API call and generate a GenUI dashboard from the result.
 * Replaces the web-search + page-fetch pipeline for known integrations.
 */
async function runIntegrationResearch(
    query: string,
    matched: MatchedIntegration,
    emit: (event: string, data: object) => Promise<void>,
): Promise<Array<{ type: string; [key: string]: unknown }>> {
    try {
        // ── Step 1: Build the API URL with LLM-extracted params ──
        await emit("step", { phase: "fetch", status: "reading", data: { url: matched.endpoint.api_endpoint } });

        const apiUrl = await resolveApiUrl(query, matched);
        log.debug(`  🔌 [IntegrationResearch] Resolved URL: ${apiUrl}`);

        // ── Step 2: Call the API ──────────────────────────────
        const apiData = await callIntegrationApi(apiUrl, matched);
        await emit("step", { phase: "fetch", status: "extracted", data: { integration: matched.groupName, keys: Object.keys(apiData).slice(0, 8) } });

        // ── Step 3: Pipe through GenUI ────────────────────────
        await emit("step", { phase: "synthesize", status: "generating", data: { message: "Creating dashboard from API data..." } });

        const blocks = await generateIntegrationDashboard(query, matched.groupName, apiData);
        await emit("done", { phase: "done", status: "complete", data: { blockCount: blocks.length } });

        return blocks;
    } catch (err) {
        const message = (err as Error).message;
        log.error(`  🔌 [IntegrationResearch] Error: ${message}`);
        await emit("error", { phase: "error", status: message });
        return buildErrorFallbackBlocks(`Integration call failed: ${message}`).blocks;
    }
}

/**
 * Use the LLM to extract parameter values from the user query and
 * fill them into the endpoint URL template.
 *
 * Example:
 *   template: "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"
 *   query: "wetter wien"
 *   → "https://api.open-meteo.com/v1/forecast?latitude=48.21&longitude=16.37&current_weather=true"
 */
async function resolveApiUrl(query: string, matched: MatchedIntegration): Promise<string> {
    const endpoint = matched.endpoint.api_endpoint;

    // If no template params, use endpoint as-is
    if (!/{[\w]+}/.test(endpoint)) return endpoint;

    // Parse param schema to know what to ask the LLM for
    let paramSchema: Array<{ name: string; type: string; required: boolean; description?: string }> = [];
    try {
        if (matched.endpoint.param_schema) {
            paramSchema = JSON.parse(matched.endpoint.param_schema);
        }
    } catch { /* ignore */ }

    if (paramSchema.length === 0) return endpoint;

    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("integration-param-resolver");

        const resp = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_FAST,
                messages: [
                    {
                        role: "system",
                        content: `You extract parameter values from a user query to fill API endpoint template variables.
Return ONLY a JSON object with parameter names as keys and their extracted values as strings.
If you cannot determine a value, use a sensible default (e.g. for city coordinates, look up the most famous city of that name).

PARAMETER SCHEMA:
${JSON.stringify(paramSchema, null, 2)}

ENDPOINT TEMPLATE: ${endpoint}`,
                    },
                    { role: "user", content: query },
                ],
                temperature: 0,
                max_tokens: 300,
                response_format: { type: "json_object" },
            }),
        });

        if (!resp.ok) throw new Error(`LLM param resolver HTTP ${resp.status}`);
        const result = await resp.json();
        await logTokenUsage("integration:param-resolver", "fast", result.usage ?? {});

        const params = safeParseJSON(result.choices?.[0]?.message?.content || "{}") as Record<string, string>;

        // Fill template
        let resolvedUrl = endpoint;
        for (const [key, value] of Object.entries(params)) {
            resolvedUrl = resolvedUrl.replace(new RegExp(`{${key}}`, "g"), String(value));
        }

        // Remove any unfilled placeholders with empty string
        resolvedUrl = resolvedUrl.replace(/{[\w]+}/g, "");

        return resolvedUrl;
    } catch (err) {
        log.warn(`  🔌 [IntegrationResearch] Param resolution failed: ${(err as Error).message}, using raw endpoint`);
        return endpoint;
    }
}

/**
 * Execute the HTTP call to the integration API.
 * Handles API key injection from api_config.
 */
async function callIntegrationApi(url: string, matched: MatchedIntegration): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
        // Parse auth config
        const apiConfig = matched.endpoint.api_config ? JSON.parse(matched.endpoint.api_config) : {};
        const headers: Record<string, string> = {
            "Accept": "application/json",
            "User-Agent": "BiamOS/2.0",
        };

        // Inject API key into headers if required
        if (apiConfig.requiresAuth && apiConfig.authType === "header" && apiConfig.apiKey) {
            headers[apiConfig.headerName || "Authorization"] = apiConfig.apiKey;
        }

        // Inject API key as query param if required
        let finalUrl = url;
        if (apiConfig.requiresAuth && apiConfig.authType === "query" && apiConfig.apiKey) {
            const separator = finalUrl.includes("?") ? "&" : "?";
            finalUrl = `${finalUrl}${separator}${apiConfig.queryParamName || "api_key"}=${apiConfig.apiKey}`;
        }

        const resp = await fetch(finalUrl, {
            method: matched.endpoint.http_method || "GET",
            headers,
            signal: controller.signal,
        });

        if (!resp.ok) throw new Error(`API returned HTTP ${resp.status}`);

        return await resp.json() as Record<string, unknown>;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Generate a GenUI dashboard from raw API JSON data.
 * Same GenUI pipeline as the research engine, but fed with API data instead of scraped text.
 */
async function generateIntegrationDashboard(
    query: string,
    integrationName: string,
    apiData: Record<string, unknown>,
): Promise<Array<{ type: string; [key: string]: unknown }>> {
    const prompt = buildGenUIPrompt(null);
    const chatUrl = await getChatUrl();
    const headers = await getHeaders("integration-dashboard");

    const userContent = `Create a dashboard for: "${query}" (data from ${integrationName} API)

=== API DATA (USE THIS — DO NOT INVENT) ===
${JSON.stringify(apiData, null, 2).substring(0, 12000)}
=== END API DATA ===

CRITICAL: ONLY use values from the API DATA above. Do NOT invent numbers or facts. If a value is missing, write "N/A".`;

    const resp = await fetch(chatUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model: MODEL_THINKING,
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: userContent },
            ],
            temperature: 0.2,
            max_tokens: 4000,
            response_format: { type: "json_object" },
        }),
    });

    if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}`);

    const result = await resp.json();
    await logTokenUsage("integration:dashboard", MODEL_THINKING, result.usage ?? {});

    const content = result.choices?.[0]?.message?.content || "";
    const parsed = safeParseJSON(content);
    if (!parsed) throw new Error("Invalid JSON from LLM");

    const validated = GenUIResponseSchema.safeParse(parsed);
    if (validated.success) return validated.data.blocks;

    // Fallback: use raw blocks if validation fails
    if (parsed.blocks && Array.isArray(parsed.blocks)) return parsed.blocks;

    throw new Error("No valid blocks in LLM response");
}
