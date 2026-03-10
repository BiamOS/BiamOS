// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Intent Splitter Service
// ============================================================
// Detects compound queries ("Show Charizard and the weather")
// and splits them into atomic sub-intents for parallel execution.
//
// PERFORMANCE: Uses a fast-path heuristic first — only calls
// the LLM if conjunction keywords are detected. Single-intent
// queries skip the LLM entirely (zero latency added).
// ============================================================

import { MODEL_FAST } from "../config/models.js";
import { getChatUrl, getHeaders } from "./llm-provider.js";

/** Conjunction keywords that hint at multi-intent queries */
const CONJUNCTION_PATTERNS = /\b(und|and|sowie|außerdem|plus|also|additionally)\b|[,&+]/i;

/** LLM system prompt — kept minimal for speed + token savings */
const SPLIT_SYSTEM_PROMPT = `You are an Intent Splitter. You receive a sentence and split it into atomic sub-intents.

RULES:
1. Respond EXCLUSIVELY with a JSON array of strings.
2. Each string is a standalone, complete command.
3. If the sentence contains only ONE intent, return ["original text"].
4. Remove conjunctions (and, und, sowie, etc.) from the sub-intents.
5. Each sub-intent must be understandable without context.
6. Do NOT split when "and/und" connects an entity with its OWN attributes, properties, history, or details. "X and its Y" is ONE intent about X.
7. Only split when the parts refer to DIFFERENT topics, domains, or unrelated entities.

EXAMPLES:
Input: "Show me Charizard and the weather in Berlin"
Output: ["Show me Charizard", "Show me the weather in Berlin"]

Input: "Get Pokemon Pikachu and show weather"
Output: ["Get Pokemon Pikachu", "Show weather"]

Input: "What is the weather?"
Output: ["What is the weather?"]

Input: "Show Pikachu, Charizard and Blastoise"
Output: ["Show Pikachu", "Show Charizard", "Show Blastoise"]

Input: "Show me Charizard and its abilities"
Output: ["Show me Charizard and its abilities"]

Input: "Tell me about Jeff Bezos and his companies"
Output: ["Tell me about Jeff Bezos and his companies"]

Input: "Elon Musk and the weather"
Output: ["Elon Musk", "the weather"]`;

/**
 * Splits a compound user query into atomic sub-intents.
 *
 * Fast path: If no conjunction keywords found, returns [userText] immediately.
 * Slow path: Calls LLM to intelligently split the compound query.
 *
 * @param userText - The raw user input
 * @param apiKey - OpenRouter API key for LLM calls
 * @param logUsage - Optional callback to log token usage
 * @returns Array of 1..N atomic sub-intent strings
 */
export async function splitIntents(
    userText: string,
    apiKey: string,
    logUsage?: (intent: string, model: string, usage: unknown) => Promise<void>
): Promise<string[]> {
    // ─── Fast path: no conjunctions → single intent ─────────
    if (!CONJUNCTION_PATTERNS.test(userText)) {
        return [userText];
    }


    try {
        const modelName = MODEL_FAST;

        const chatUrl = await getChatUrl();
        const llmHeaders = await getHeaders("intent-splitter");
        const response = await fetch(chatUrl, {
            method: "POST",
            headers: llmHeaders,
            body: JSON.stringify({
                model: modelName,
                messages: [
                    { role: "system", content: SPLIT_SYSTEM_PROMPT },
                    { role: "user", content: userText },
                ],
                temperature: 0,
                max_tokens: 512,
            }),
        });

        if (!response.ok) {
            return [userText];
        }

        const result = await response.json();

        // Log token usage
        if (logUsage) {
            await logUsage(`split:${userText}`, modelName, result.usage);
        }

        let raw: string = result.choices?.[0]?.message?.content ?? "";

        // Strip markdown code fences if present
        raw = raw.replace(/^```(?:json)?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "").trim();

        const parsed: unknown = JSON.parse(raw);

        // Validate: must be array of non-empty strings
        if (
            !Array.isArray(parsed) ||
            parsed.length === 0 ||
            !parsed.every((item) => typeof item === "string" && item.trim().length > 0)
        ) {
            return [userText];
        }

        const subIntents = (parsed as string[]).map((s) => s.trim());
        return subIntents;
    } catch {
        // Graceful degradation: treat as single intent
        return [userText];
    }
}
