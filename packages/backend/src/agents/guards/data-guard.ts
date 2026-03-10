// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Data Guard (No LLM — Pure Logic)
// ============================================================
// Validates API data BEFORE sending it to the Layout Architect.
// If data is empty or missing crucial fields, returns a fallback
// layout instead of risking LLM hallucination.
// ============================================================

import type { IntentType } from "../intent/2-classifier.js";

// ─── Types ──────────────────────────────────────────────────

export interface GuardResult {
    proceed: boolean;
    fallback?: { blocks: any[] };
    cleanedData?: any;
    /** When set, the intent type should be overridden for layout generation */
    downgradedType?: string;
}

// ─── Main Guard ─────────────────────────────────────────────

/**
 * Check API data quality before sending to Layout Architect.
 * Returns { proceed: true } if data is good, or { proceed: false, fallback: ... }
 * if the data is too bad for the LLM to handle.
 *
 * When intent type doesn't match available data (e.g. VIDEO intent but text-only data),
 * DOWNGRADES the intent type instead of blocking, so the user still gets useful results.
 */
export function dataGuard(apiData: any, intentType: IntentType, entity: string): GuardResult {
    // 1. Is the data completely empty?
    if (isDataEmpty(apiData)) {
        return {
            proceed: false,
            fallback: noResultsLayout(intentType, entity),
        };
    }

    // 2. Intent-specific checks — DOWNGRADE instead of BLOCK
    if (intentType === "IMAGE" || intentType === "IMAGES") {
        if (!hasImageUrl(apiData)) {
            return { proceed: true, downgradedType: "DATA" };
        }
    }

    if (intentType === "VIDEO") {
        if (!hasVideoUrl(apiData)) {
            // Check if we have text-based results we can show instead
            const hasText = JSON.stringify(apiData).length > 100;
            const newType = hasText ? "SEARCH" : "DATA";
            return { proceed: true, downgradedType: newType };
        }
    }

    if (intentType === "ACTION") {
        // ACTION doesn't need API data — it generates forms from param_schema
        return { proceed: true };
    }

    // 3. All checks passed
    return { proceed: true };
}

// ─── Check Functions ────────────────────────────────────────

function isDataEmpty(data: any): boolean {
    if (!data) return true;
    if (typeof data === "object" && Object.keys(data).length === 0) return true;

    // Empty array
    if (Array.isArray(data) && data.length === 0) return true;

    // Error-shaped object (only meta keys, no real data)
    if (typeof data === "object" && !Array.isArray(data)) {
        const keys = Object.keys(data);
        const metaKeys = new Set(["error", "message", "code", "status", "detail", "title", "type", "Error", "success"]);
        const allMeta = keys.every(k => metaKeys.has(k));
        if (allMeta && keys.length > 0 && keys.length <= 5) return true;
    }

    const json = JSON.stringify(data);
    // Strip all JSON structural chars + nulls
    const stripped = json.replace(/[{}\[\]",:]/g, "").replace(/null/g, "").trim();
    return stripped.length < 20;
}

function hasImageUrl(data: any): boolean {
    const json = JSON.stringify(data);
    return /\.(jpg|jpeg|png|webp|gif|svg)/i.test(json) ||
        /images\.pexels\.com|images\.unsplash\.com|photos\.pexels\.com/i.test(json) ||
        /"(src|url|image|photo|thumbnail|preview|download|medium|large)":\s*"https?:\/\//i.test(json);
}

function hasVideoUrl(data: any): boolean {
    const json = JSON.stringify(data);
    return /\.(mp4|webm|mov|avi)/i.test(json) ||
        /videos\.pexels\.com|vimeo\.com|youtube\.com/i.test(json);
}

// ─── Fallback Layouts ───────────────────────────────────────

function noResultsLayout(intentType: IntentType, entity: string): { blocks: any[] } {
    return {
        blocks: [
            { type: "title", text: `No Results: "${entity}"`, size: "h5" },
            {
                type: "callout",
                variant: "warning",
                title: "No Data Found",
                text: `The API returned no results for "${entity}". Try a different search term or check if the integration is configured correctly.`,
            },
        ],
    };
}
