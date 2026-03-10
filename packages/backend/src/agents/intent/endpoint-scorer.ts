// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Endpoint Scorer (Router Layer 1/2)
// ============================================================
// Multi-signal scoring for selecting the best endpoint within
// a group, plus LLM fallback as absolute last resort.
//
// SIGNALS (per endpoint):
//   - endpoint_tags keyword match                (weight: 3)
//   - intent_description keyword match            (weight: 2)
//   - Full query context keyword match            (weight: 2)
//   - supported_intents type match                (weight: 1)
// ============================================================

import type { Integration } from "../../db/schema.js";
import type { IntentType } from "./2-classifier.js";
import { runAgentJSON } from "../agent-runner.js";
import { log } from "../../utils/logger.js";
import { tokenize, type ScoringContext } from "./group-matcher.js";

// ─── Types ──────────────────────────────────────────────────

export interface RouteResult {
    integration: Integration;
    matchedGroup: string;
    confidence: number;
    _scoring?: EndpointScore[];
}

interface EndpointScore {
    name: string;
    tagScore: number;
    descScore: number;
    queryScore: number;
    intentScore: number;
    total: number;
}

// ─── Scoring Weights ────────────────────────────────────────

const WEIGHTS = {
    TAG: 3,
    DESC: 2,
    QUERY: 2,
    INTENT: 1,
} as const;

// ─── Intent Type → Fallback Keywords ────────────────────────

const INTENT_KEYWORDS: Record<IntentType, string[]> = {
    ARTICLE: ["article", "explain", "tell me about", "what is", "wiki", "summary", "describe", "information"],
    IMAGE: ["photo", "image", "picture", "show me a photo", "show me an image"],
    IMAGES: ["photos", "images", "pictures", "gallery", "show me photos"],
    SEARCH: ["search", "find", "look for", "list", "results"],
    DATA: ["weather", "data", "stats", "numbers", "metrics", "forecast", "temperature", "price", "score"],
    VIDEO: ["video", "watch", "clip", "play", "stream"],
    ACTION: ["send", "create", "write", "submit", "schedule", "delete", "post", "email", "ticket"],
    NAVIGATE: ["open", "go to", "navigate", "visit", "browse", "launch", "show me"],
    TOOL: ["calculator", "calc", "tool", "converter", "timer", "translate", "stopwatch", "unit"],
};

// ─── Multi-Signal Scoring ───────────────────────────────────

export function scoreAndSelect(candidates: Integration[], ctx: ScoringContext): RouteResult | null {
    if (candidates.length === 0) return null;

    // Single candidate: validate relevance
    if (candidates.length === 1) {
        const c = candidates[0];
        const queryTokens = tokenize(ctx.fullQuery);
        const tagText = [c.endpoint_tags || "", c.api_triggers || ""].join(" ").toLowerCase();
        const descText = (c.intent_description || "").toLowerCase();
        const tagTokens = tokenize(tagText);
        const descTokens = tokenize(descText);
        const hasRelevance = queryTokens.some(w =>
            tagTokens.some(t => t.includes(w) || w.includes(t)) ||
            descTokens.some(t => t.includes(w) || w.includes(t))
        );
        if (!hasRelevance) {
            log.debug(`  ❌ Single candidate "${c.name}" has zero relevance to query — rejecting`);
            return null;
        }
        return { integration: c, matchedGroup: c.group_name || c.name, confidence: 0.85 };
    }

    const entityTokens = tokenize(ctx.entity);
    const queryTokens = tokenize(ctx.fullQuery);

    const scores: EndpointScore[] = candidates.map(c => {
        const tagText = [c.endpoint_tags || "", c.api_triggers || ""].join(" ").toLowerCase();
        const tagTokens = tokenize(tagText);
        let tagScore = 0;
        for (const word of queryTokens) {
            if (tagTokens.some(t => t.includes(word) || word.includes(t))) tagScore++;
        }

        const descText = (c.intent_description || "").toLowerCase();
        const descTokens = tokenize(descText);
        let descScore = 0;
        for (const word of queryTokens) {
            if (descTokens.some(t => t.includes(word) || word.includes(t))) descScore++;
        }

        let queryScore = 0;
        for (const word of entityTokens) {
            if (tagText.includes(word) || descText.includes(word)) queryScore++;
        }

        let intentScore = 0;
        if (c.supported_intents) {
            const intents = c.supported_intents.split("|").map(s => s.trim().toUpperCase());
            if (intents.includes(ctx.intentType)) intentScore = 1;
        }

        const total = tagScore * WEIGHTS.TAG + descScore * WEIGHTS.DESC + queryScore * WEIGHTS.QUERY + intentScore * WEIGHTS.INTENT;
        return { name: c.name, tagScore, descScore, queryScore, intentScore, total };
    });

    const indexed = scores.map((s, i) => ({ ...s, idx: i }));
    indexed.sort((a, b) => b.total - a.total);

    log.debug(`  📊 Endpoint Scoring (query: "${ctx.fullQuery.substring(0, 60)}"):`);
    for (const s of indexed) {
        log.debug(`     ${s.total.toString().padStart(3)}pts  ${s.name}  [tag:${s.tagScore}×${WEIGHTS.TAG} desc:${s.descScore}×${WEIGHTS.DESC} query:${s.queryScore}×${WEIGHTS.QUERY} intent:${s.intentScore}×${WEIGHTS.INTENT}]`);
    }

    const winner = indexed[0];
    const runnerUp = indexed[1];

    // Minimum relevance floor
    if (winner.tagScore === 0 && winner.descScore === 0 && winner.queryScore === 0) {
        log.debug(`  ❌ No meaningful match — best score (${winner.total}pts) is intent-only → rejecting all`);
        return null;
    }

    // Action word validation
    const entTokens = tokenize(ctx.entity);
    const qryTokens = tokenize(ctx.fullQuery);
    const actionTokens = qryTokens.filter(w => !entTokens.some(e => e.includes(w) || w.includes(e)));

    if (actionTokens.length > 0 && winner.total > 0) {
        const winnerC = candidates[winner.idx];
        const winnerText = [winnerC.endpoint_tags || "", winnerC.api_triggers || "", winnerC.intent_description || ""].join(" ").toLowerCase();
        const winnerTokens = tokenize(winnerText);
        const actionOverlap = actionTokens.some(w => winnerTokens.some(t => t.includes(w) || w.includes(t)));
        if (!actionOverlap) {
            log.debug(`  ❌ Winner "${winner.name}" matched entity but NOT action words [${actionTokens.join(", ")}] → rejecting`);
            return null;
        }
    }

    // Clear winner
    if (winner.total > 0 && winner.total > runnerUp.total) {
        const gap = winner.total - runnerUp.total;
        log.debug(`  ✅ Winner: "${winner.name}" (gap: ${gap}pts)`);
        return {
            integration: candidates[winner.idx],
            matchedGroup: candidates[winner.idx].group_name || candidates[winner.idx].name,
            confidence: Math.min(0.95, 0.6 + (gap * 0.05)),
            _scoring: scores,
        };
    }

    // Tiebreaker
    if (winner.total > 0 && winner.total === runnerUp.total) {
        const tied = indexed.filter(s => s.total === winner.total);
        const tiePreference = resolveTie(tied, candidates, ctx.intentType as IntentType, ctx.fullQuery);
        if (tiePreference !== null) {
            const pick = tied[tiePreference];
            log.debug(`  🔀 Tiebreaker resolved: "${pick.name}" (intent=${ctx.intentType})`);
            return {
                integration: candidates[pick.idx],
                matchedGroup: candidates[pick.idx].group_name || candidates[pick.idx].name,
                confidence: 0.8,
                _scoring: scores,
            };
        }
    }

    log.debug(`  ⚠️  Scoring tied or zero — falling to LLM`);
    return null;
}

// ─── Tie Resolution ─────────────────────────────────────────

function resolveTie(
    tied: Array<EndpointScore & { idx: number }>,
    candidates: Integration[],
    intentType: IntentType,
    query: string,
): number | null {
    const NAME_PREFS: Partial<Record<IntentType, string[]>> = {
        ARTICLE: ["search", "summary", "article", "detail", "content", "get", "fetch"],
        SEARCH: ["search", "find", "list", "query", "lookup"],
        DATA: ["data", "stats", "current", "latest", "price", "forecast"],
        IMAGE: ["photo", "image", "picture", "random"],
        IMAGES: ["photos", "images", "gallery", "search"],
        VIDEO: ["video", "search", "list"],
        NAVIGATE: ["open", "page", "url", "web"],
    };

    const prefs = NAME_PREFS[intentType];
    if (!prefs) return null;

    const queryLower = query.toLowerCase();
    const isSpecificQuery = queryLower.length > 10 || /\b(recipe|by name|search|find|about)\b/i.test(queryLower);

    let bestIdx = -1;
    let bestRank = Infinity;

    for (let i = 0; i < tied.length; i++) {
        const name = tied[i].name.toLowerCase();
        if (isSpecificQuery && name.includes("random")) continue;

        for (let rank = 0; rank < prefs.length; rank++) {
            if (name.includes(prefs[rank])) {
                if (rank < bestRank) {
                    bestRank = rank;
                    bestIdx = i;
                }
                break;
            }
        }
    }

    if (bestIdx === -1) {
        const queryWords = queryLower.split(/\s+/);
        let maxOverlap = 0;
        for (let i = 0; i < tied.length; i++) {
            const desc = (candidates[tied[i].idx].intent_description || "").toLowerCase();
            const overlap = queryWords.filter(w => w.length > 2 && desc.includes(w)).length;
            if (overlap > maxOverlap) {
                maxOverlap = overlap;
                bestIdx = i;
            }
        }
    }

    return bestIdx >= 0 ? bestIdx : null;
}

// ─── Human Trigger Filter ───────────────────────────────────

export function filterByHumanTriggers(integrations: Integration[], intentType: IntentType): Integration[] {
    // Priority 1: supported_intents field
    const intentMatched = integrations.filter((c) => {
        if (!c.supported_intents) return false;
        return c.supported_intents.split("|").map(s => s.trim().toUpperCase()).includes(intentType);
    });
    if (intentMatched.length > 0) return intentMatched;

    // Priority 2: human_triggers + intent keywords
    const intentKeywords = INTENT_KEYWORDS[intentType] || [];
    const triggerMatched = integrations.filter((c) => {
        if (!c.human_triggers) return false;
        const triggers = c.human_triggers.toLowerCase().split("|").map((t) => t.trim());
        return triggers.some((trigger) => intentKeywords.some((kw) => trigger.includes(kw)));
    });
    if (triggerMatched.length > 0) return triggerMatched;

    // Priority 3: intent_description fallback
    return integrations.filter((c) => {
        const desc = (c.intent_description || "").toLowerCase();
        const tags = (c.endpoint_tags || "").toLowerCase();
        const combined = `${desc} ${tags}`;
        return intentKeywords.some((kw) => combined.includes(kw));
    });
}

// ─── LLM Endpoint Selection (last resort) ───────────────────

export async function llmEndpointSelect(
    candidates: Integration[],
    intentType: IntentType,
    entity: string,
): Promise<RouteResult | null> {
    const endpointList = candidates.map((c, i) => ({
        index: i,
        name: c.name,
        group: c.group_name || null,
        api_triggers: c.api_triggers || c.endpoint_tags || c.intent_description || c.name,
        method: c.http_method || "GET",
    }));

    const context = `Intent: ${intentType}, Entity: "${entity}"

Available endpoints (pre-filtered):
${JSON.stringify(endpointList, null, 2)}

Pick the best endpoint and explain why.`;

    try {
        const result = await runAgentJSON<{ endpoint_index: number; confidence: number; reasoning: string }>(
            "router",
            context,
        );

        if (result.skipped) {
            return {
                integration: candidates[0],
                matchedGroup: candidates[0].group_name || candidates[0].name,
                confidence: 0.5,
            };
        }

        const idx = result.output.endpoint_index;
        const confidence = result.output.confidence || 0.7;
        if (idx >= 0 && idx < candidates.length && confidence >= 0.4) {
            const picked = candidates[idx];
            return { integration: picked, matchedGroup: picked.group_name || picked.name, confidence };
        }
        log.debug(`  ❌ LLM router confidence too low (${confidence}) — rejecting`);
    } catch { }

    log.debug(`  ❌ Router: no reliable endpoint match — returning null`);
    return null;
}
