// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Shared Integration Context Service
// ============================================================
// Single source of truth for "which integrations are active".
// Used by Concierge (triage) and Classifier (intent typing).
// One DB query, one 30s TTL cache, two view functions.
// ============================================================

import { db } from "../db/db.js";
import { capsules } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { log } from "../utils/logger.js";

// ─── Types ──────────────────────────────────────────────────

interface IntegrationGroup {
    triggers: Set<string>;
    intents: Set<string>;
    type?: string;
}

// ─── Raw Data Cache ─────────────────────────────────────────

let _groupsCache: { groups: Map<string, IntegrationGroup>; timestamp: number } | null = null;
const CACHE_TTL_MS = 30_000;

/** Invalidate the shared integration context cache (call after install/create/delete) */
export function invalidateIntegrationContextCache() {
    _groupsCache = null;
}

/**
 * Load all active integrations from DB, group by group_name,
 * and extract triggers + intents. Result is cached for 30s.
 */
async function loadGroups(): Promise<Map<string, IntegrationGroup>> {
    if (_groupsCache && Date.now() - _groupsCache.timestamp < CACHE_TTL_MS) {
        return _groupsCache.groups;
    }

    const allActive = await db
        .select()
        .from(capsules)
        .where(sql`status = 'live'`);

    const groups = new Map<string, IntegrationGroup>();
    for (const cap of allActive) {
        const groupName = cap.group_name || cap.name?.replace(/Widget$/i, "") || "Unknown";
        if (!groups.has(groupName)) {
            groups.set(groupName, { triggers: new Set(), intents: new Set() });
        }
        const group = groups.get(groupName)!;

        if (cap.human_triggers) {
            cap.human_triggers.split("|").forEach((t) => {
                const trimmed = t.trim().toLowerCase();
                if (trimmed.length >= 2) group.triggers.add(trimmed);
            });
        }
        if (cap.supported_intents) {
            cap.supported_intents.split("|").forEach((t) => group.intents.add(t.trim()));
        }
        if (cap.intent_description) {
            cap.intent_description.split(/[,|]/).slice(0, 3).forEach((t) => {
                const trimmed = t.trim().toLowerCase();
                if (trimmed.length >= 3) group.triggers.add(trimmed);
            });
        }
        if (cap.integration_type) group.type = cap.integration_type;
    }

    _groupsCache = { groups, timestamp: Date.now() };
    return groups;
}

// ─── Concierge Context ──────────────────────────────────────

/**
 * Build context for Agent 0 (Concierge): lists active integrations
 * with capabilities, split by sidebar selection state.
 */
export async function getConciergeContext(allowedGroups?: string[]): Promise<string> {
    const groups = await loadGroups();

    if (groups.size === 0) {
        return "No integrations configured yet.";
    }

    const hasFilter = allowedGroups && allowedGroups.length > 0;
    const lowerAllowed = hasFilter ? allowedGroups!.map(g => g.toLowerCase()) : null;

    const activeLines: string[] = [];
    const inactiveLines: string[] = [];

    for (const [name, g] of groups.entries()) {
        const capabilities = Array.from(g.triggers).slice(0, 6).join(", ");
        const intents = g.intents.size > 0 ? ` [${Array.from(g.intents).join(", ")}]` : "";
        const type = g.type === "web" ? " (web app)" : "";
        const line = `• ${name}${type}: ${capabilities}${intents}`;

        if (!hasFilter || lowerAllowed!.some(ag => name.toLowerCase().includes(ag) || ag.includes(name.toLowerCase()))) {
            activeLines.push(line);
        } else {
            inactiveLines.push(line);
        }
    }

    let contextText = "";
    if (hasFilter) {
        contextText = `ACTIVE integrations (currently selected by user):\n${activeLines.length > 0 ? activeLines.join("\n") : "None selected."}`;
        if (inactiveLines.length > 0) {
            contextText += `\n\nAVAILABLE but NOT SELECTED integrations (user must activate these in the sidebar first):\n${inactiveLines.join("\n")}`;
            contextText += `\n\nIMPORTANT: You may ONLY use ACTIVE integrations. If the user asks for something that requires a non-active integration, tell them to activate it in the sidebar. Example: "I'd love to help with that, but the Wikipedia integration is not currently active. Please enable it in the sidebar on the left."\nDo NOT suggest or offer capabilities from non-active integrations.`;
        }
    } else {
        contextText = `Available integrations:\n${activeLines.join("\n")}`;
    }

    log.debug(`  📋 [Concierge] ${groups.size} groups loaded: ${Array.from(groups.keys()).join(", ")}`);

    // Always include global BiamOS capabilities so ANSWER covers everything
    contextText += `\n\nBIAMOS CORE CAPABILITIES (always available, mention ALL of these for ANSWER decisions):
1. API Integrations — fetch data from connected APIs (listed above) and display as interactive cards on the canvas.
2. Web Browser — open ANY website directly inside BiamOS (say "open youtube", "go to reddit", etc.).
3. Copilot Buddy — on every opened website, a smart AI copilot sidebar is available. It can answer questions about the page, do deep web research with source links, summarize pages, translate content, and extract structured data. Like a personal research assistant built into the browser.`;

    return contextText;
}

// ─── Classifier Context ─────────────────────────────────────

/**
 * Build context for Agent 2 (Classifier): compact list of
 * integration groups with triggers for intent classification.
 */
export async function getClassifierContext(): Promise<string> {
    const groups = await loadGroups();

    if (groups.size === 0) return "";

    const lines = Array.from(groups.entries()).map(([name, g]) => {
        const triggerList = Array.from(g.triggers).slice(0, 8).join(", ");
        return triggerList ? `${name} (${triggerList})` : name;
    });

    return `Available integrations: ${lines.join("; ")}

RULES:
- If the entity clearly relates to a specific integration group, prefer SEARCH or ARTICLE over IMAGE/VIDEO
- Only use IMAGE/VIDEO when the user explicitly asks for photos/videos or no domain group matches
- Use NAVIGATE when the user wants to open/visit/browse a specific website or web app
- Use TOOL when the user wants to open an interactive tool (calculator, converter, timer, translator)
- Include the group domain in the entity if it helps routing (e.g. "Charizard" → entity "Pokemon Charizard")`;
}

// ─── Integration Query Matcher ──────────────────────────────

export interface MatchedIntegration {
    /** Display name of the integration group, e.g. "Open-Meteo" */
    groupName: string;
    /** The raw DB row for the best matching endpoint */
    endpoint: {
        id: number;
        name: string;
        api_endpoint: string;
        http_method: string;
        param_schema: string | null;
        api_config: string | null;
        intent_description: string;
        group_name: string | null;
    };
}

/**
 * Match a user query against installed live integrations by keyword.
 * Returns the best matching integration group + a representative endpoint,
 * or null if no integration matches.
 *
 * Called at the TOP of the universal router (before the fast-path chat regex)
 * so queries like "Wie ist das Wetter in Wien?" are correctly routed as RESEARCH
 * rather than being short-circuited as CHAT.
 */
export async function getIntegrationForQuery(query: string): Promise<MatchedIntegration | null> {
    try {
        const groups = await loadGroups();
        if (groups.size === 0) return null;

        const queryLower = query.toLowerCase();

        // Score each group by how many of its trigger keywords appear in the query
        let bestGroupName: string | null = null;
        let bestScore = 0;

        for (const [name, g] of groups.entries()) {
            let score = 0;
            for (const trigger of g.triggers) {
                if (queryLower.includes(trigger)) {
                    // Longer trigger = stronger signal (avoids single-letter false positives)
                    score += trigger.length;
                }
            }
            if (score > bestScore) {
                bestScore = score;
                bestGroupName = name;
            }
        }

        // Require a minimum meaningful score (at least one trigger of length ≥ 3 matched)
        if (bestScore < 3 || !bestGroupName) return null;

        // Load the actual endpoint row from DB for this group
        const { db } = await import("../db/db.js");
        const { capsules } = await import("../db/schema.js");
        const { eq, sql: drizzleSql } = await import("drizzle-orm");

        const rows = await db
            .select({
                id: capsules.id,
                name: capsules.name,
                api_endpoint: capsules.api_endpoint,
                http_method: capsules.http_method,
                param_schema: capsules.param_schema,
                api_config: capsules.api_config,
                intent_description: capsules.intent_description,
                group_name: capsules.group_name,
            })
            .from(capsules)
            .where(drizzleSql`status = 'live' AND (
                group_name = ${bestGroupName} OR
                name LIKE ${bestGroupName + '%'}
            )`)
            .limit(1);

        if (rows.length === 0) return null;

        log.debug(`  🔌 [IntegrationMatcher] Query matched integration "${bestGroupName}" (score=${bestScore})`);

        return { groupName: bestGroupName, endpoint: rows[0] };
    } catch (err) {
        log.warn(`  🔌 [IntegrationMatcher] Error matching query: ${(err as Error).message}`);
        return null;
    }
}

