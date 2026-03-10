// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Group Matcher (Router Layer 0/0.5/0.7)
// ============================================================
// Finds the best integration GROUP for a user query using:
//   L0:   Entity → Group name/metadata matching
//   L0.5: Semantic embedding cosine similarity
//   L0.7: Multi-signal group relevance scoring
// ============================================================

import type { Integration } from "../../db/schema.js";
import { embedText, findTopGroups } from "../../services/embedding-service.js";
import { log } from "../../utils/logger.js";

// ─── Shared Tokenizer ───────────────────────────────────────

const STOP_WORDS = new Set([
    "the", "a", "an", "in", "for", "of", "is", "it", "to", "me", "my",
    "show", "tell", "get", "find", "give", "make", "what", "how", "can",
    "this", "that", "with", "from", "about", "next", "last", "please",
    "want", "need", "would", "could", "should", "like", "also",
]);

export function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[\s,|;:]+/)
        .map(w => w.replace(/[^a-z0-9äöüß-]/g, ""))
        .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
}

// ─── Layer 0: Entity → Group Name Match ─────────────────────

const COMMON_WORDS = new Set(["the", "and", "for", "new", "how", "get", "set", "top", "all", "web", "app", "use", "can", "not", "one", "two", "any", "our", "see", "now", "way", "may", "day", "too", "its", "let", "say", "has", "him", "old", "big"]);
const LEGACY_GENERIC = new Set(["wikipedia", "pexels", "unsplash", "google", "youtube"]);

export function findEntityGroupMatch(integrations: Integration[], entity: string): Integration[] {
    const entityLower = entity.toLowerCase();
    const entityWords = entityLower.split(/\s+/).filter((w) => w.length >= 3 && !COMMON_WORDS.has(w));

    const groups = [...new Set(integrations.map((c) => c.group_name || "").filter(Boolean))];
    const nonGenericGroups = groups.filter((g) => {
        const gLower = g.toLowerCase();
        if (gLower.length < 3) return false;
        const groupIntegration = integrations.find((c) => (c.group_name || "").toLowerCase() === gLower);
        if (groupIntegration?.is_generic === 1) return false;
        return !LEGACY_GENERIC.has(gLower);
    });

    // Strategy 1: entity contains group name
    const directMatch = nonGenericGroups.filter((g) => entityLower.includes(g.toLowerCase()));
    if (directMatch.length > 0) {
        return integrations.filter((c) =>
            directMatch.some((g) => (c.group_name || "").toLowerCase() === g.toLowerCase())
        );
    }

    // Strategy 2: entity words appear in integration's metadata
    for (const group of nonGenericGroups) {
        const groupIntegrations = integrations.filter((c) =>
            (c.group_name || "").toLowerCase() === group.toLowerCase()
        );
        for (const cap of groupIntegrations) {
            const searchable = [
                cap.name || "",
                cap.human_triggers || "",
                cap.intent_description || "",
            ].join(" ").toLowerCase();

            if (entityWords.some((word) => searchable.includes(word))) {
                return groupIntegrations;
            }
        }
    }

    return [];
}

// ─── Layer 0.5: Embedding Fallback ──────────────────────────

export async function embeddingFallback(integrations: Integration[], entity: string): Promise<Integration[]> {
    const hasEmbeddings = integrations.some((c) => c.group_embedding || c.embedding);
    if (!hasEmbeddings) return [];

    try {
        const { getApiKey } = await import("../../server-utils.js");
        const apiKey = await getApiKey();
        const queryEmbedding = await embedText(entity, apiKey);
        const topGroups = await findTopGroups(queryEmbedding, 3);

        if (topGroups.length > 0 && topGroups[0].score > 0.5) {
            const topGroup = topGroups[0].groupName;
            return integrations.filter((c) => (c.group_name || c.name) === topGroup);
        }
    } catch { }

    return [];
}

// ─── Layer 0.7: Group Relevance Scoring ─────────────────────

export interface GroupScoreResult {
    group: string;
    candidates: Integration[];
    score: number;
    debug: string;
}

export interface ScoringContext {
    intentType: string;
    entity: string;
    fullQuery: string;
}

export function scoreGroupRelevance(integrations: Integration[], ctx: ScoringContext): GroupScoreResult | null {
    const groups = new Map<string, Integration[]>();
    for (const c of integrations) {
        const g = c.group_name || c.name;
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(c);
    }

    if (groups.size < 2) return null;

    const queryTokens = tokenize(ctx.fullQuery);
    const entityTokens = tokenize(ctx.entity);
    const allTokens = [...new Set([...queryTokens, ...entityTokens])];

    if (allTokens.length === 0) return null;

    const scored: { group: string; score: number; candidates: Integration[] }[] = [];

    for (const [group, candidates] of groups) {
        let groupScore = 0;
        const first = candidates[0];

        // Tier 1: Group Title (×3)
        const titleText = [group, first.sidebar_label || ""].join(" ").toLowerCase();
        const titleTokens = tokenize(titleText);
        for (const word of allTokens) {
            if (titleTokens.some(t => t.includes(word) || word.includes(t))) groupScore += 3;
        }

        // Tier 2: Human Triggers (×2)
        const triggerText = (first.human_triggers || "").toLowerCase();
        const triggerTokens = triggerText.split(/[|,;]+/).map(t => t.trim()).filter(t => t.length >= 2);
        for (const word of allTokens) {
            if (triggerTokens.some(t => t.includes(word) || word.includes(t))) groupScore += 2;
        }

        // Tier 3: Endpoint Metadata (×1)
        const endpointMeta = candidates.map(c => [c.endpoint_tags || "", c.intent_description || ""].join(" ").toLowerCase()).join(" ");
        const metaTokens = tokenize(endpointMeta);
        for (const word of allTokens) {
            if (metaTokens.some(t => t.includes(word) || word.includes(t))) groupScore += 1;
        }

        scored.push({ group, score: groupScore, candidates });
    }

    scored.sort((a, b) => b.score - a.score);

    const winner = scored[0];
    const runnerUp = scored[1];
    const debugStr = scored.map(s => `${s.group}:${s.score}`).join(", ");

    const gap = winner.score - runnerUp.score;
    if (winner.score > 0 && (gap >= 2 || (runnerUp.score > 0 && winner.score / runnerUp.score >= 1.5))) {
        return { group: winner.group, candidates: winner.candidates, score: winner.score, debug: debugStr };
    }

    log.debug(`  ⚠️  Group scores too close: ${debugStr}`);
    return null;
}
