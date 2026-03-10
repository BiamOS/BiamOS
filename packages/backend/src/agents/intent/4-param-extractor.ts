// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent 4: Param Extractor
// ============================================================
// Extracts API parameters from the user's entity and the
// endpoint's param_schema. Skips LLM when trivial (1 param).
// ============================================================

import { runAgentJSON } from "../agent-runner.js";
import type { Integration } from "../../db/schema.js";

/**
 * Extract API parameters from the user query for the given endpoint.
 *
 * OPTIMIZATION: If the endpoint has only 1 required param and the entity
 * can be used directly, skip the LLM call entirely.
 */
export async function extractParams(
    entity: string,
    integration: Integration,
    currentDate: string
): Promise<Record<string, string>> {
    const paramSchema = parseParamSchema(integration.param_schema);
    const groupName = integration.group_name || "";

    // Fast path: no params defined at all
    if (paramSchema.length === 0) {
        return {};
    }

    // Fast path: single QUERY param → use entity directly (search APIs are forgiving)
    // Path params ALWAYS go through LLM — they need exact values (e.g. "charizard" not "pokedex charizard")
    if (paramSchema.length === 1 && paramSchema[0].required && paramSchema[0].in !== "path") {
        const param = paramSchema[0];
        const value = normalizeParamValue(entity, param, groupName, integration.name, integration.human_triggers);
        return { [param.name]: value };
    }

    // LLM path: precise param extraction (always used for path params + complex schemas)
    const context = `Entity: "${entity}"
Endpoint: ${integration.name}
Group: ${groupName || "unknown"}
API: ${integration.api_endpoint}
Current date: ${currentDate}
Required params: ${JSON.stringify(paramSchema)}

IMPORTANT: Extract the parameter value from the entity.
- Strip only group/integration names and action words (show, get, find, search, display)
- PRESERVE proper names and titles exactly as-is (e.g. "Sex on the Beach" stays "Sex on the Beach")
- For path params: extract the EXACT identifier (e.g. from "Pokedex Charizard" extract "charizard")
- For query params: keep the full name/title intact, only strip obvious intent words

Output ONLY a JSON object.`;

    try {
        const result = await runAgentJSON<Record<string, string>>("param-extractor", context);

        if (result.skipped) {
            // Extractor disabled — try entity as first param
            if (paramSchema.length > 0) {
                const value = normalizeParamValue(entity, paramSchema[0], groupName, integration.name);
                return { [paramSchema[0].name]: value };
            }
            return {};
        }

        const params = result.output;
        // Normalize all extracted params
        const normalized: Record<string, string> = {};
        for (const [key, val] of Object.entries(params)) {
            const schema = paramSchema.find((p) => p.name === key);
            normalized[key] = schema ? normalizeParamValue(String(val), schema, groupName, integration.name, integration.human_triggers) : String(val);
        }
        return normalized;
    } catch (err) {

        // Fallback: use entity as first required param
        if (paramSchema.length > 0) {
            const value = normalizeParamValue(entity, paramSchema[0], groupName, integration.name);
            return { [paramSchema[0].name]: value };
        }
        return {};
    }
}

// ─── Helpers ────────────────────────────────────────────────

interface ParamDef {
    name: string;
    type: string;
    required: boolean;
    in: string;
    description?: string;
    options?: string[];
    format?: string; // "lowercase" | "slug" | "uppercase" — auto-applied to values
}

function parseParamSchema(raw: string | null): ParamDef[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Common words that appear in entities but are NOT valid API parameter values.
 * These are intent modifiers or navigational words — kept GLOBAL, no domain-specific terms.
 */
const CONTEXT_WORDS = new Set([
    // Intent modifiers — stripped from ANYWHERE in the entity
    "show", "get", "find", "search", "lookup", "fetch", "display",
    "details", "info", "information", "about", "data",
    // Content request words
    "article", "page", "entry", "profile", "recipe", "tutorial", "guide",
    "photo", "image", "picture", "video", "gallery",
    // Domain-agnostic result words
    "price", "prices", "cost", "value", "rate", "rates",
    "weather", "forecast", "temperature",
    "status", "state", "result", "results", "output",
    "current", "latest", "recent", "new", "today", "now",
    "popular", "trending", "top", "best", "random",
    // Action words
    "me", "my", "some", "all", "list", "more", "give", "tell", "what", "how",
]);

/**
 * Words stripped from START/END only — preserved in the MIDDLE of proper names.
 * "Sex on the Beach" → keeps "the" and "on" (middle), but
 * "the Bitcoin" → strips "the" (edge)
 */
const EDGE_ONLY_WORDS = new Set([
    "the", "a", "an", "of", "for", "with", "from", "by", "in", "on", "to",
]);

/**
 * Extract domain-specific stop words from integration metadata.
 * E.g. group "Pokemon" + name "GetpokemonbynameWidget" + triggers "pokedex | pokemon"
 * → ["pokemon", "getpokemonbyname", "pokedex", "get", "byname"]
 */
function getGroupStopWords(groupName: string, integrationName?: string, humanTriggers?: string | null): Set<string> {
    const stopWords = new Set<string>();
    if (groupName) {
        stopWords.add(groupName.toLowerCase());
        // Also add sub-words from camelCase/snake_case group names
        groupName.toLowerCase().split(/[_\s-]+/).forEach((w) => { if (w.length >= 3) stopWords.add(w); });
    }
    if (integrationName) {
        // Extract meaningful words from "GetpokemonbynameWidget" style names
        const cleaned = integrationName
            .replace(/Widget$/i, "")
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .toLowerCase();
        cleaned.split(/[\s_-]+/).forEach((w) => { if (w.length >= 3) stopWords.add(w); });
    }
    if (humanTriggers) {
        // Extract individual words from human_triggers "pokedex | pokemon | find pokemon"
        humanTriggers.toLowerCase().split(/[|,]/).forEach((phrase) => {
            phrase.trim().split(/\s+/).forEach((w) => { if (w.length >= 3) stopWords.add(w); });
        });
    }
    return stopWords;
}

/**
 * Normalize a parameter value for API compatibility:
 * 1. Strip integration/group name from entity (e.g. "Pokemon Pikachu" → "Pikachu")
 * 2. Strip common context/modifier words (e.g. "Pokedex Charizard" → "Charizard")
 * 3. Apply format rules (lowercase for path params, explicit format hints)
 */
function normalizeParamValue(value: string, param: ParamDef, groupName: string, integrationName?: string, humanTriggers?: string | null): string {
    let v = value.trim();

    // Build combined stop-words: global + group-specific + trigger-derived
    const groupStops = getGroupStopWords(groupName, integrationName, humanTriggers);

    // Strip all stop-words — but preserve articles INSIDE the phrase (proper names)
    // "Sex on the Beach cocktail recipe" → strip "cocktail", "recipe" from anywhere
    // But "the", "on", "a" only stripped from START/END, not middle
    const words = v.split(/\s+/);
    if (words.length > 1) {
        // First pass: remove intent/context words from anywhere
        const afterContext = words.filter((w) => {
            const wLower = w.toLowerCase();
            return !CONTEXT_WORDS.has(wLower) && !groupStops.has(wLower);
        });

        if (afterContext.length > 0) {
            // Second pass: trim navigational words from edges only
            let start = 0;
            let end = afterContext.length - 1;
            while (start <= end && EDGE_ONLY_WORDS.has(afterContext[start].toLowerCase())) start++;
            while (end >= start && EDGE_ONLY_WORDS.has(afterContext[end].toLowerCase())) end--;
            const trimmed = afterContext.slice(start, end + 1);
            v = trimmed.length > 0 ? trimmed.join(" ") : afterContext.join(" ");
        }
    }

    // Apply explicit format from param_schema
    if (param.format) {
        switch (param.format.toLowerCase()) {
            case "lowercase": v = v.toLowerCase(); break;
            case "uppercase": v = v.toUpperCase(); break;
            case "slug": v = v.toLowerCase().replace(/\s+/g, "-"); break;
        }
    }

    // Auto-lowercase path params (REST APIs are usually case-sensitive)
    if (param.in === "path") {
        v = v.toLowerCase();
    }

    return v;
}

