// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Merged Agent: Translate + Classify (Pipeline Step 1)
// ============================================================
// Combines translation + intent classification into a single
// LLM call. Reduces pipeline from 6 → 3 LLM calls.
//
// FAST PATH: Skips LLM entirely for English input.
// ============================================================

import { runAgentJSON } from "../agent-runner.js";
import { getClassifierContext } from "../../services/integration-context.js";
import { translationCache } from "../../services/response-cache.js";
import type { IntentType } from "@biamos/shared";

// ─── Types ──────────────────────────────────────────────────

export interface TranslateClassifyResult {
    english_query: string;
    type: IntentType;
    entity: string;
}

// Valid intent types (closed enum)
const VALID_TYPES = new Set<string>(["ARTICLE", "IMAGE", "IMAGES", "SEARCH", "DATA", "VIDEO", "ACTION", "NAVIGATE", "TOOL"]);

// ─── English Detection ──────────────────────────────────────

function isLikelyEnglish(text: string): boolean {
    if (/[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/i.test(text)) return false;
    if (/[^\x00-\x7F]/.test(text)) return false;

    const words = text.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !/^\d+$/.test(w));
    if (words.length === 0) return true;

    const EN_WORDS = new Set([
        "show", "get", "find", "search", "open", "go", "give", "tell", "list", "play",
        "watch", "read", "create", "send", "delete", "update", "refresh", "check",
        "the", "for", "about", "with", "from", "into", "this", "that",
        "what", "how", "where", "when", "which", "who", "why",
        "weather", "news", "price", "recipe", "photo", "image", "video", "latest",
        "top", "best", "random", "current", "today", "popular", "trending",
        "stories", "articles", "results", "data", "info", "information",
        "please", "can", "you", "and", "not", "all", "new", "old",
    ]);

    const englishCount = words.filter(w => EN_WORDS.has(w)).length;
    return englishCount / words.length > 0.5;
}

// ─── Main Function ──────────────────────────────────────────

/**
 * Translate + Classify in ONE LLM call.
 * For English input, skips translation and only classifies.
 * Returns: { english_query, type, entity }
 */
export async function translateAndClassify(userText: string): Promise<TranslateClassifyResult> {
    const trimmed = userText.trim();
    const alreadyEnglish = isLikelyEnglish(trimmed);

    // Check translation cache for non-English input
    const cachedTranslation = alreadyEnglish ? null : translationCache.get(trimmed);

    // Build integration context for classification
    const context = await getClassifierContext();

    // If we already have a cached translation, we only need classification
    if (cachedTranslation) {
        const result = await runAgentJSON<{ type: string; entity: string }>(
            "classifier",
            cachedTranslation,
            context || undefined,
        );
        return {
            english_query: cachedTranslation,
            type: validateType(result.output?.type),
            entity: result.output?.entity || cachedTranslation,
        };
    }

    // For English input, we only need classification (skip translation)
    if (alreadyEnglish) {
        const result = await runAgentJSON<{ type: string; entity: string }>(
            "classifier",
            trimmed,
            context || undefined,
        );
        return {
            english_query: trimmed,
            type: validateType(result.output?.type),
            entity: result.output?.entity || trimmed,
        };
    }

    // Non-English + no cache → single LLM call for both translate + classify
    const combinedPrompt = `Translate the following query to concise English, then classify its intent.

USER QUERY: "${trimmed}"

Respond with ONLY valid JSON:
{"english_query": "...", "type": "DATA|SEARCH|ARTICLE|IMAGE|IMAGES|VIDEO|ACTION|NAVIGATE|TOOL", "entity": "..."}

RULES:
- english_query: The query translated to concise English. Preserve proper nouns and URLs exactly.
- type: Intent type (DATA for specific data, SEARCH for listings, ARTICLE for detailed info, IMAGE/IMAGES for pictures, NAVIGATE for website requests, TOOL for calculator/converter).
- entity: The core subject extracted from the query, stripped of action words.`;

    try {
        const result = await runAgentJSON<TranslateClassifyResult>(
            "classifier",  // reuse classifier agent config (same model/temp)
            combinedPrompt,
            context || undefined,
        );

        const output = result.output;
        const englishQuery = output?.english_query || trimmed;

        // Cache the translation for future use
        if (englishQuery !== trimmed) {
            translationCache.set(trimmed, englishQuery);
        }

        return {
            english_query: englishQuery,
            type: validateType(output?.type),
            entity: output?.entity || englishQuery,
        };
    } catch {
        // Fallback: no translation, generic classification
        return {
            english_query: trimmed,
            type: "ARTICLE",
            entity: trimmed,
        };
    }
}

function validateType(type: string | undefined): IntentType {
    if (type && VALID_TYPES.has(type)) return type as IntentType;
    return "ARTICLE";
}
