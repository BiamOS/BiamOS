// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Safe JSON Parsing Utilities
// ============================================================
// Shared utilities for safely parsing JSON from LLM responses
// and database strings. Consolidates 4 previously duplicated
// implementations.
// ============================================================

import { log } from "./logger.js";

/**
 * Safely parse JSON from LLM output.
 * Handles raw JSON, markdown code blocks, and embedded JSON objects.
 * Returns null on failure (never throws).
 */
export function safeParseJSON(text: string): any {
    const tryParse = (str: string): any => {
        try {
            const parsed = JSON.parse(str);
            // Empty {} is treated as parse failure (model returned nothing useful)
            if (parsed && typeof parsed === "object" && Object.keys(parsed).length === 0) {
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    };

    // Try direct parse first
    const direct = tryParse(text);
    if (direct) return direct;

    // Try extracting JSON from markdown code block
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
        const fromBlock = tryParse(match[1]);
        if (fromBlock) return fromBlock;
    }

    // Try finding JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        const fromMatch = tryParse(jsonMatch[0]);
        if (fromMatch) return fromMatch;
    }

    return null;
}

/**
 * Safely parse a JSON string from the database.
 * Handles null/undefined inputs and logs corrupt data.
 * Returns null on failure (never throws).
 */
export function safeParseDBJSON(raw: string | null | undefined): any {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        log.warn("⚠️ Corrupt JSON in DB:", raw.substring(0, 100));
        return null;
    }
}
