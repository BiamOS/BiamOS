// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent 1: Translator
// ============================================================
// Translates any-language user input → concise English command.
// OPTIMIZATION: Skips LLM call when input is already English.
// ============================================================

import { runAgent } from "../agent-runner.js";
import { translationCache } from "../../services/response-cache.js";

/**
 * Detect if text is likely already English.
 * Two-phase check:
 *   1. Non-ASCII chars (ä, ö, ü, Cyrillic, etc.) → NOT English
 *   2. Positive match: majority of words must be common English words
 * This prevents false positives on German ASCII words like "gulaschsuppe", "zeige", "hund".
 */
function isLikelyEnglish(text: string): boolean {
    // Phase 1: Contains non-ASCII → definitely not English
    if (/[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/i.test(text)) return false;
    if (/[^\x00-\x7F]/.test(text)) return false;

    // Phase 2: Positive English verification
    // Extract meaningful words (3+ chars, ignore numbers)
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !/^\d+$/.test(w));
    if (words.length === 0) return true; // single short word like "hi"

    // Common English command words used in BiamOS queries
    const EN_WORDS = new Set([
        // Commands
        "show", "get", "find", "search", "open", "go", "give", "tell", "list", "play",
        "watch", "read", "create", "send", "delete", "update", "refresh", "check",
        // Prepositions/articles
        "the", "for", "about", "with", "from", "into", "this", "that",
        // Question words
        "what", "how", "where", "when", "which", "who", "why",
        // Common nouns/adjectives in queries
        "weather", "news", "price", "recipe", "photo", "image", "video", "latest",
        "top", "best", "random", "current", "today", "popular", "trending",
        "stories", "articles", "results", "data", "info", "information",
        // Misc
        "please", "can", "you", "and", "not", "all", "new", "old",
    ]);

    const englishCount = words.filter(w => EN_WORDS.has(w)).length;
    // Require >50% of words to be known English
    return englishCount / words.length > 0.5;
}

/**
 * Translate user query from any language to English.
 * Uses cache to avoid redundant LLM calls.
 * FAST PATH: Skips LLM entirely for English input.
 */
export async function translateQuery(userText: string): Promise<string> {
    const trimmed = userText.trim();

    // Fast path: already English → skip LLM call entirely
    if (isLikelyEnglish(trimmed)) {
        return trimmed;
    }

    // Check cache first
    const cached = translationCache.get(trimmed);
    if (cached) {
        return cached;
    }

    try {
        const result = await runAgent("translator", trimmed);

        if (result.skipped) return trimmed;

        // Translator returns plain text, not JSON
        const translated = (typeof result.output === "string"
            ? result.output
            : result.raw
        ).trim();

        translationCache.set(trimmed, translated);
        return translated;
    } catch (err) {

        return trimmed;
    }
}

