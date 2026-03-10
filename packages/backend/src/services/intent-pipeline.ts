// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Intent Pipeline (6-Agent Architecture)
// ============================================================
// FLOW:
//   1. Concierge → EXECUTE/CLARIFY/NAVIGATE
//   2. Translator → English
//   3. [Cache Check] → hit? skip routing
//   4. Classifier → intent type + entity
//   5. Router → best endpoint (multi-signal scoring)
//   6. ParamExtractor → API parameters
//   7. API Call + Quality Gate + Auto-Retry
//   8. Data Guard
//   9. Layout Architect
// ============================================================

import { db } from "../db/db.js";
import { log } from "../utils/logger.js";
import { capsules } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { IntentType } from "@biamos/shared";
import { classifyIntent } from "../agents/intent/2-classifier.js";
import { routeIntent } from "../agents/intent/3-router.js";
import { extractParams } from "../agents/intent/4-param-extractor.js";
import { generateLayout } from "../agents/intent/5-layout-architect.js";
import { dataGuard } from "../agents/guards/data-guard.js";
import { layoutCache } from "../services/response-cache.js";
import { validateLayout } from "../services/pipeline-validators.js";
import { checkResponseQuality } from "../services/quality-gate.js";
import { getCachedRoute, setCachedRoute } from "../services/routing-cache.js";
import {
    getUserLanguage,
    fetchWithAuth,
    handleRedirect,
    smartFallback,
    buildCacheKey,
    getWebSearchFallback,
} from "../routes/pipeline-helpers.js";
import { buildUrl } from "./url-builder.js";

// ─── Types ──────────────────────────────────────────────────

export interface DebugStep {
    agent: string;
    icon: string;
    duration_ms: number;
    input: string;
    output: string;
    detail?: Record<string, unknown>;
}

export interface SingleIntentResult {
    status: "ok" | "error";
    _query: string;
    _debug?: DebugStep[];
    [key: string]: unknown;
}

// ─── Debug Trace Helper ─────────────────────────────────────

function trace(steps: DebugStep[], agent: string, icon: string, startMs: number, input: string, output: string, detail?: Record<string, unknown>) {
    steps.push({ agent, icon, duration_ms: Date.now() - startMs, input, output, detail });
}

// ─── Core Pipeline (6 Agents) ───────────────────────────────

export async function processSingleIntent(text: string, allowedGroups?: string[]): Promise<SingleIntentResult> {
    const startTime = Date.now();
    const currentDate = new Date().toISOString().split("T")[0];
    const debug: DebugStep[] = [];

    // ⚡ Start getUserLanguage early — don't await until layout step
    const userLanguagePromise = getUserLanguage();

    // ═══════════════════════════════════════════════════════════
    // Agents 2-4: Classifier → Router → ParamExtractor
    // ═══════════════════════════════════════════════════════════

    // Check routing cache first
    const cached = getCachedRoute(text);
    let routed: {
        integration: import("../db/schema.js").Integration;
        params: Record<string, string>;
        matchedGroup: string;
        confidence: number;
    } | null = null;

    if (cached) {
        const [ep] = await db.select().from(capsules).where(
            eq(capsules.id, cached.endpointId)
        );
        if (ep) {
            trace(debug, "Route Cache", "⚡", Date.now(), text, `Cache hit → "${ep.name}" (${cached.groupName})`);
            routed = {
                integration: ep,
                params: cached.params,
                matchedGroup: cached.groupName,
                confidence: 0.99,
            };
        }
    }

    if (!routed) {
        // Agent 2: Classify intent
        const t2 = Date.now();
        const classified = await classifyIntent(text);
        trace(debug, "Classifier", "🏷️", t2, text, `type=${classified.type}, entity="${classified.entity}"`);

        // Agent 3: Route to best endpoint
        const t3 = Date.now();
        const routeResult = await routeIntent(
            classified.type,
            classified.entity,
            allowedGroups,
            text,
        );

        if (routeResult) {
            // Agent 4: Extract params
            const t4 = Date.now();
            const params = await extractParams(
                classified.entity,
                routeResult.integration,
                currentDate,
            );
            trace(debug, "Router", "🧭", t3, text,
                `${routeResult.integration.name} (${routeResult.matchedGroup})`,
                { endpoint: routeResult.integration.name, group: routeResult.matchedGroup }
            );
            trace(debug, "ParamExtractor", "📋", t4, classified.entity,
                Object.entries(params).map(([k, v]) => `${k}="${v}"`).join(", ") || "no params"
            );

            routed = {
                integration: routeResult.integration,
                params,
                matchedGroup: routeResult.matchedGroup,
                confidence: routeResult.confidence,
            };

            // Cache successful routes
            setCachedRoute(text, routed.integration.id, routed.matchedGroup, routed.params);
        }
    }

    if (!routed) {
        trace(debug, "Router", "🧭", Date.now(), text, "❌ No match found");
        const activeCapsules = await db.select().from(capsules);
        const activeNames = activeCapsules
            .filter((c) => (c.status ?? "live") !== "inactive")
            .map((c) => c.group_name || c.name.replace(/Widget$/, ""))
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(", ");
        return {
            status: "error", biam_protocol: "2.0", action: "error",
            message: `No matching skill found for: "${text}". Available skills: ${activeNames || "none"}.`,
            _query: text, _debug: debug,
        };
    }

    // ─── Web Integration Short-Circuit ──────────────────────
    if (routed.integration.integration_type === "web") {
        trace(debug, "Web Redirect", "🌐", Date.now(), routed.integration.name, routed.integration.api_endpoint || "");
        const baseUrl = routed.integration.api_endpoint || "";
        return {
            status: "ok", biam_protocol: "2.0", action: "render_layout",
            integration_id: routed.integration.name,
            layout: {
                blocks: [{
                    type: "iframe", url: baseUrl,
                    title: routed.integration.sidebar_label || routed.matchedGroup || routed.integration.name,
                    icon: routed.integration.sidebar_icon || "🌐",
                }],
            },
            _query: text, _intent: { type: "NAVIGATE", entity: text }, _group_name: routed.matchedGroup, _debug: debug,
        };
    }

    // ─── TOOL Shortcut ──────────────────────────────────────
    // Check if any supported_intents includes TOOL
    if (routed.integration.supported_intents?.includes("TOOL")) {
        trace(debug, "Tool Shortcut", "🔧", Date.now(), text, "calculator");
        const toolLayout = { blocks: [{ type: "calculator" }] };
        return {
            status: "ok", biam_protocol: "2.0", action: "render_layout",
            integration_id: routed.integration.name, layout: toolLayout,
            _query: text, _intent: { type: "TOOL", entity: text }, _group_name: routed.matchedGroup,
            _matched_keywords: routed.integration.human_triggers || "", _debug: debug,
        };
    }

    // ─── Auto-Geocoding: resolve location → lat/lon ─────────
    // If the endpoint URL has {latitude}/{longitude} placeholders
    // but the Smart Router extracted a location-like string, resolve it.
    const LOCATION_PARAMS = ["location", "city", "town", "place", "ort", "stadt"];
    const locationParam = LOCATION_PARAMS.find(p => routed.params[p]);
    if (locationParam && !routed.params.latitude && !routed.params.longitude) {
        const urlTemplate = routed.integration.api_endpoint || "";
        if (urlTemplate.includes("{latitude}") && urlTemplate.includes("{longitude}")) {
            const tGeo = Date.now();
            const coords = await resolveGeocode(routed.params[locationParam]);
            if (coords) {
                const locName = routed.params[locationParam];
                routed.params.latitude = coords.latitude;
                routed.params.longitude = coords.longitude;
                delete routed.params[locationParam]; // Remove synthetic param
                log.debug(`  📍 Auto-Geocode: "${locName}" → ${coords.latitude}, ${coords.longitude}`);
                trace(debug, "Auto-Geocode", "📍", tGeo, locName, `${coords.latitude}, ${coords.longitude} (${coords.name})`);
            } else {
                log.warn(`  ⚠️ Auto-Geocode failed for "${routed.params[locationParam]}"`);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // API Call + Auto-Retry Cascade
    // ═══════════════════════════════════════════════════════════

    // Attempt API call with the primary route
    const allRoutes = [
        { integration: routed.integration, params: routed.params },
    ];

    let apiData: any = null;
    let url: string | undefined;
    let usedIntegration = routed.integration;
    let usedParams = routed.params;
    let apiSuccess = false;

    for (let attempt = 0; attempt < allRoutes.length && attempt < 3; attempt++) {
        const route = allRoutes[attempt];
        usedIntegration = route.integration;
        usedParams = route.params;

        // Build URL
        url = buildUrl(usedIntegration.api_endpoint, usedParams);
        const method = usedIntegration.http_method || "GET";

        // Auto-inject search query ONLY for search-type endpoints that accept query params
        const isSearchEndpoint = (usedIntegration.supported_intents || "").includes("SEARCH")
            || (usedIntegration.endpoint_tags || "").match(/search|query|find|list/);
        if (method === "GET" && url && Object.keys(usedParams).length === 0 && isSearchEndpoint) {
            const searchStopwords = new Set(["show", "me", "a", "an", "the", "find", "get", "search", "for", "of", "look", "up", "display", "give"]);
            const queryWords = text.split(/\s+/).filter(w => w.length >= 2 && !searchStopwords.has(w.toLowerCase()));
            if (queryWords.length > 0) {
                const queryStr = queryWords.join(" ");
                url = `${url}${url.includes("?") ? "&" : "?"}query=${encodeURIComponent(queryStr)}`;
            }
        }

        if (!url || url.startsWith("auto-builder://")) break;

        const t5 = Date.now();
        log.debug(`  🔗 API URL${attempt > 0 ? ` (retry #${attempt})` : ""}: ${url}`);

        let result = await fetchWithAuth(usedIntegration, url, method, usedParams);

        // Auto-retry: missing parameter injection
        let currentUrl = url;
        for (let retry = 0; retry < 3 && !result.ok && result.status >= 400 && result.status < 500; retry++) {
            const retryUrl = tryInjectMissingParam(currentUrl, result.message);
            if (!retryUrl) break;
            log.debug(`  🔄 Auto-inject param → ${retryUrl}`);
            currentUrl = retryUrl;
            result = await fetchWithAuth(usedIntegration, currentUrl, method, usedParams);
        }
        if (result.ok) url = currentUrl;

        if (!result.ok) {
            log.warn(`  ❌ API Error: ${result.status} — ${result.message}`);
            trace(debug, "API Call", "📡", t5, `${method} ${url?.substring(0, 120)}`, `❌ ${result.status}: ${result.message}`);
            // Try next alternative
            if (attempt < allRoutes.length - 1) {
                log.debug(`  🔄 Auto-Retry: trying alternative endpoint...`);
            }
            continue;
        }

        apiData = result.data;
        url = result.url || url;
        const dataSize = JSON.stringify(apiData || {}).length;
        log.debug(`  ✅ API Data: ${dataSize} bytes, type=${typeof apiData}, isArray=${Array.isArray(apiData)}`);
        if (dataSize < 500) log.debug(`  📦 Data preview:`, JSON.stringify(apiData).substring(0, 400));
        trace(debug, "API Call", "📡", t5, `${method} ${url?.substring(0, 120)}`, `✅ ${dataSize} bytes received`);

        // ─── Quality Gate ────────────────────────────────────
        const quality = checkResponseQuality(apiData, text);
        if (!quality.pass) {
            log.warn(`  🚫 Quality Gate FAIL: ${quality.reason}`);
            trace(debug, "Quality Gate", "🚫", Date.now(), url?.substring(0, 80) || "", `❌ ${quality.reason}`);
            // Try next alternative
            if (attempt < allRoutes.length - 1) {
                log.debug(`  🔄 Auto-Retry: Quality Gate failed, trying next endpoint...`);
                continue;
            }
        }

        apiSuccess = true;
        break;
    }

    // If all attempts failed → fall back to web search
    if (!apiSuccess || !apiData) {
        trace(debug, "API Call", "📡", Date.now(), text, "❌ All endpoints failed → trying web search");
        const webSearchEnabled = await getWebSearchFallback();
        if (webSearchEnabled) {
            const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}&igu=1`;
            log.debug(`  🌐 Web Search Fallback: ${text}`);
            return {
                status: "ok", biam_protocol: "2.0", action: "navigate",
                url: googleUrl, title: `🔍 ${text}`,
                _query: text, _debug: debug,
            };
        }
        return {
            status: "ok", biam_protocol: "2.0", action: "render_layout",
            integration_id: "biamos-fallback",
            layout: {
                blocks: [
                    { type: "callout", variant: "info", title: "🎩 BiamOS", text: `No data found for "${text}". Enable **Web Search** in Settings for automatic web fallback.` },
                ]
            },
            _query: text, _debug: debug,
        };
    }

    // ─── Handle Redirects ───────────────────────────────────
    apiData = await handleRedirect(usedIntegration, apiData, usedParams, buildUrl);

    // ─── Smart Fallback: thin data → search ─────────────────
    const matchedGroup = usedIntegration.group_name || usedIntegration.name;
    if (matchedGroup) {
        const fallback = await smartFallback(apiData, matchedGroup, usedIntegration.name, text, usedParams, buildUrl);
        if (fallback) {
            log.debug(`  🔄 Smart Fallback triggered`);
            trace(debug, "Smart Fallback", "🔄", Date.now(), "thin data detected", `Switched to fallback endpoint`);
            apiData = fallback.data;
            if (fallback.url) url = fallback.url;
        }
    }

    // ─── Data Guard ─────────────────────────────────────────
    // Infer intent type from response_type for Data Guard
    const intentType = inferIntentType(usedIntegration.response_type, usedIntegration.supported_intents);
    const guard = dataGuard(apiData, intentType, text);
    log.debug(`  🛡️ Data Guard: proceed=${guard.proceed}, downgraded=${guard.downgradedType || "none"}`);
    if (!guard.proceed) {
        trace(debug, "Data Guard", "🛡️", Date.now(), `type=${intentType}`, `❌ Blocked → fallback layout`);
        logPipelineSummary(text, intentType, usedIntegration, usedParams, url, apiData, "BLOCKED", null, startTime);
        return {
            status: "ok", biam_protocol: "2.0", action: "render_layout",
            integration_id: usedIntegration.name, layout: guard.fallback,
            _query: text, _intent: { type: intentType, entity: text }, _group_name: matchedGroup, _api_endpoint: url, _debug: debug,
            _pinnable: { query: text, endpoint_id: usedIntegration.id, params: usedParams },
        };
    }

    const layoutIntentType = (guard.downgradedType || intentType) as IntentType;

    // ⚡ Await the language
    const userLanguage = await userLanguagePromise;

    // ─── Layout Cache ───────────────────────────────────────
    const cacheKey = buildCacheKey(usedIntegration.name, layoutIntentType, apiData, userLanguage);
    const cachedLayout = layoutCache.get(cacheKey);
    if (cachedLayout) {
        trace(debug, "Layout Architect", "🎨", Date.now(), `type=${layoutIntentType}, lang=${userLanguage}`, `⚡ Cache hit`);
        logPipelineSummary(text, layoutIntentType, usedIntegration, usedParams, url, apiData, "CACHED", cachedLayout, startTime);
        debug.push({ agent: "Total", icon: "⏱️", duration_ms: Date.now() - startTime, input: text, output: `${debug.length} agents, cached` });
        return {
            status: "ok", biam_protocol: "2.0", action: "render_layout",
            integration_id: usedIntegration.name, layout: cachedLayout, data: apiData,
            _query: text, _intent: { type: layoutIntentType, entity: text }, _resolved_params: usedParams,
            _group_name: matchedGroup, _api_endpoint: url, _debug: debug,
            _pinnable: { query: text, endpoint_id: usedIntegration.id, params: usedParams },
        };
    }

    // ─── Agent 5: Layout Architect ──────────────────────────
    const t6 = Date.now();
    const layout = await generateLayout(layoutIntentType, text, apiData, usedIntegration, userLanguage);
    const _blockTypes = layout?.blocks?.map((b: any) => b.type) ?? [];
    log.debug(`  🎨 Layout: ${_blockTypes.length} blocks: [${_blockTypes.join(", ")}]`);
    if (_blockTypes.length <= 3) log.debug(`  🎨 Layout preview:`, JSON.stringify(layout).substring(0, 500));

    // ─── Layout Validator ───────────────────────────────────
    const layoutValidation = validateLayout(layout, apiData, text);
    if (!layoutValidation.valid) {
        log.warn(`  🛡️ Layout Validator: ${layoutValidation.error}`);
        if (layoutValidation.fallback) {
            trace(debug, "Layout Architect", "🎨", t6,
                `type=${layoutIntentType}, lang=${userLanguage}`,
                `⚠️ Validation failed → fallback layout (${layoutValidation.fallback.blocks.length} blocks)`,
            );
            layoutCache.set(cacheKey, layoutValidation.fallback);
            debug.push({ agent: "Total", icon: "⏱️", duration_ms: Date.now() - startTime, input: text, output: `${debug.length} agents, fallback layout` });
            return {
                status: "ok", biam_protocol: "2.0", action: "render_layout",
                integration_id: usedIntegration.name, layout: layoutValidation.fallback, data: apiData,
                _query: text, _intent: { type: layoutIntentType, entity: text }, _resolved_params: usedParams,
                _group_name: matchedGroup, _api_endpoint: url, _debug: debug,
                _pinnable: { query: text, endpoint_id: usedIntegration.id, params: usedParams },
            };
        }
    }

    const blockTypes = layout?.blocks?.map((b: any) => b.type).join(", ") ?? "none";
    trace(debug, "Layout Architect", "🎨", t6,
        `type=${layoutIntentType}, lang=${userLanguage}`,
        `${layout?.blocks?.length ?? 0} blocks: ${blockTypes}`,
        { block_count: layout?.blocks?.length ?? 0 }
    );

    layoutCache.set(cacheKey, layout);
    logPipelineSummary(text, layoutIntentType, usedIntegration, usedParams, url, apiData, "OK", layout, startTime);

    debug.push({ agent: "Total", icon: "⏱️", duration_ms: Date.now() - startTime, input: text, output: `${debug.length} agents completed` });

    return {
        status: "ok", biam_protocol: "2.0", action: "render_layout",
        integration_id: usedIntegration.name, layout, data: apiData,
        _query: text, _intent: { type: layoutIntentType, entity: text }, _resolved_params: usedParams,
        _group_name: matchedGroup, _api_endpoint: url, _debug: debug,
        _pinnable: { query: text, endpoint_id: usedIntegration.id, params: usedParams },
    };
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Infer IntentType from response_type and supported_intents.
 * Since we no longer have a separate classifier, we derive intent from endpoint metadata.
 */
function inferIntentType(responseType: string | null, supportedIntents: string | null): IntentType {
    // First check supported_intents (most specific)
    if (supportedIntents) {
        const intents = supportedIntents.split("|").map(s => s.trim().toUpperCase());
        // Prefer specific types over generic DATA
        for (const t of ["IMAGE", "IMAGES", "ARTICLE", "SEARCH", "VIDEO", "ACTION", "TOOL", "NAVIGATE"]) {
            if (intents.includes(t)) return t as IntentType;
        }
        if (intents.includes("DATA")) return "DATA";
    }

    // Fallback: infer from response_type
    switch (responseType) {
        case "image": return "IMAGE";
        case "image_list": return "IMAGES";
        case "article": return "ARTICLE";
        case "list": return "SEARCH";
        case "text": return "DATA";
        case "data":
        case "mixed":
        default: return "DATA";
    }
}

// ─── Pipeline Summary Logging ─────────────────────────────

export function logPipelineSummary(
    query: string,
    intentType: string,
    integration: { name: string; group_name?: string | null },
    params: Record<string, string>,
    url: string | undefined,
    apiData: any,
    status: string,
    layout: any,
    startTime: number,
) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const dataSize = JSON.stringify(apiData || {}).length;
    const blocks = layout?.blocks?.length ?? 0;
    const blockTypes = layout?.blocks?.map((b: any) => b.type).join(", ") ?? "none";
}

// ─── Auto-Retry: Missing Parameter Injection ──────────────

/**
 * When an API returns 4xx with "Missing parameter X", extract the param name
 * and inject a smart default.
 */
function tryInjectMissingParam(url: string, errorMessage: string): string | null {
    const patterns = [
        /[Mm]issing (?:required )?(?:parameter|param)[:\s]+["']?(\w+)["']?/,
        /(?:parameter|param) ["']?(\w+)["']? is required/i,
        /["'](\w+)["'] is (?:required|missing)/i,
        /required (?:parameter|field)[:\s]+["']?(\w+)["']?/i,
    ];

    let paramName: string | null = null;
    for (const pattern of patterns) {
        const match = errorMessage.match(pattern);
        if (match) { paramName = match[1]; break; }
    }

    if (!paramName) return null;

    const smartDefaults: Record<string, string> = {
        vs_currency: "usd", currency: "usd", fiat: "usd", base_currency: "usd",
        language: "en", lang: "en", locale: "en-US", lg: "en",
        country: "us", region: "us", country_code: "us",
        limit: "10", per_page: "10", page_size: "10", count: "10",
        page: "1", offset: "0",
        order: "desc", sort: "desc", sort_by: "date", direction: "desc",
        days: "7", period: "7d", interval: "daily", timeframe: "7d",
        format: "json", output: "json",
    };

    const defaultValue = smartDefaults[paramName.toLowerCase()];
    if (!defaultValue) {
        log.warn(`  ⚠️ No smart default for missing param: "${paramName}"`);
        return null;
    }

    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${paramName}=${encodeURIComponent(defaultValue)}`;
}

// ─── Auto-Geocoding Helper ────────────────────────────────

/**
 * Resolve a city/location name to latitude/longitude using Open-Meteo Geocoding API.
 * This is a FREE, no-auth-required API — works for any location worldwide.
 */
async function resolveGeocode(locationName: string): Promise<{ latitude: string; longitude: string; name: string } | null> {
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=en`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const results = data?.results || data?.items;
        if (!results || results.length === 0) return null;
        const first = results[0];
        return {
            latitude: String(first.latitude),
            longitude: String(first.longitude),
            name: first.name || locationName,
        };
    } catch {
        return null;
    }
}
