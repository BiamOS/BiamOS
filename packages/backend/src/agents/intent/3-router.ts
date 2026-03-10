// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent 3: API Router (Orchestrator)
// ============================================================
// Routes a classified intent to the best API endpoint.
// Delegates to group-matcher.ts (group selection) and
// endpoint-scorer.ts (endpoint scoring + LLM fallback).
//
// FLOW:
//   1. Find candidate group (entity match → embedding → triggers)
//   2. Score endpoints within group using 4 signals
//   3. LLM fallback only as absolute last resort
// ============================================================

import { db } from "../../db/db.js";
import { capsules } from "../../db/schema.js";
import { sql } from "drizzle-orm";
import { log } from "../../utils/logger.js";
import type { IntentType } from "./2-classifier.js";
import {
    findEntityGroupMatch,
    embeddingFallback,
    scoreGroupRelevance,
    tokenize,
} from "./group-matcher.js";
import {
    scoreAndSelect,
    filterByHumanTriggers,
    llmEndpointSelect,
} from "./endpoint-scorer.js";

// Re-export types for external consumers
export type { RouteResult } from "./endpoint-scorer.js";

// ============================================================
// Main Router
// ============================================================

/**
 * Route a classified intent to the best API endpoint.
 *
 * @param intentType - Classified intent type (DATA, SEARCH, etc.)
 * @param entity     - Extracted entity (e.g. "Vienna")
 * @param allowedGroups - Optional sidebar filter
 * @param fullQuery  - Full translated query for context scoring
 */
export async function routeIntent(
    intentType: IntentType,
    entity: string,
    allowedGroups?: string[],
    fullQuery?: string,
): Promise<import("./endpoint-scorer.js").RouteResult | null> {
    // Load all active integrations
    let allIntegrations = await db
        .select()
        .from(capsules)
        .where(sql`status = 'live'`);

    // Filter to allowed groups if specified (sidebar selection)
    if (allowedGroups && allowedGroups.length > 0) {
        const lowerGroups = allowedGroups.map((g) => g.toLowerCase());
        allIntegrations = allIntegrations.filter((c) => {
            const groupName = (c.group_name || c.name || "").toLowerCase();
            return lowerGroups.some((lg) => groupName.includes(lg) || lg.includes(groupName));
        });
    }

    if (allIntegrations.length === 0) return null;

    const scoringCtx = { intentType, entity, fullQuery: fullQuery || entity };

    // ─── Single-Group Shortcut ──────────────────────────────
    const uniqueGroups = new Set(allIntegrations.map(c => c.group_name || c.name));
    if (uniqueGroups.size === 1) {
        log.debug(`  ⚡ Single group "${[...uniqueGroups][0]}" — skipping intent filter`);
        const result = scoreAndSelect(allIntegrations, scoringCtx);
        if (result) return result;
        return {
            integration: allIntegrations[0],
            matchedGroup: allIntegrations[0].group_name || allIntegrations[0].name,
            confidence: 0.8,
        };
    }

    // ─── Layer 0: Entity→Group Priority ─────────────────────
    const entityGroupMatch = findEntityGroupMatch(allIntegrations, entity);
    if (entityGroupMatch.length > 0) {
        const result = scoreAndSelect(entityGroupMatch, scoringCtx);
        if (result) return result;
        log.debug(`  ⚠️  Entity group match rejected by scoring — trying next layer`);
    }

    // ─── Layer 0.5: Embedding-based matching ────────────────
    const embeddingGroupMatch = await embeddingFallback(allIntegrations, entity);
    if (embeddingGroupMatch.length > 0) {
        const result = scoreAndSelect(embeddingGroupMatch, scoringCtx);
        if (result) return result;
        log.debug(`  ⚠️  Embedding group match rejected by scoring — trying next layer`);
    }

    // ─── Layer 0.7: Group Relevance Scoring ─────────────────
    const groupScores = scoreGroupRelevance(allIntegrations, scoringCtx);
    if (groupScores) {
        const { group, candidates: groupCandidates, score, debug } = groupScores;
        log.debug(`  🎯 Group scoring: "${group}" won (${score}pts) — ${debug}`);
        const result = scoreAndSelect(groupCandidates, scoringCtx);
        if (result) return result;
        log.debug(`  ⚠️  Group winner "${group}" rejected by endpoint scoring — trying all`);
    }

    // ─── Layer 1: Human Trigger Filtering ───────────────────
    let filtered = filterByHumanTriggers(allIntegrations, intentType);
    if (filtered.length === 0) {
        const qWords = tokenize(fullQuery || entity);
        const triggerMatched = allIntegrations.filter((c) => {
            const triggers = (c.human_triggers || "").toLowerCase();
            const triggerTokens = triggers.split(/[,|;]+/).map(t => t.trim()).filter(t => t.length >= 2);
            return qWords.some(w => triggerTokens.some(t => t.includes(w) || w.includes(t)));
        });
        if (triggerMatched.length > 0) {
            log.debug(`  🔄 Router: intent filter failed, but human_triggers keyword match found (${triggerMatched.length} candidates)`);
            filtered = triggerMatched;
        } else {
            log.warn(`  ❌ Router: no integration matches intent "${intentType}" — returning null`);
            return null;
        }
    }

    // Single result
    if (filtered.length === 1) {
        return {
            integration: filtered[0],
            matchedGroup: filtered[0].group_name || filtered[0].name,
            confidence: 0.85,
        };
    }

    // ─── Score and select ───────────────────────────────────
    const result = scoreAndSelect(filtered, scoringCtx);
    if (result) return result;

    // ─── Layer 2: LLM (absolute last resort) ────────────────
    return await llmEndpointSelect(filtered, intentType, entity);
}
