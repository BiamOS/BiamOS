// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Pipeline Output Validators
// ============================================================
// Validates LLM outputs after each agent call. Returns
// { valid, error, fixed } — the pipeline uses this to retry
// on failure or accept the output.
// ============================================================

import type { IntentType } from "@biamos/shared";
import { log } from "../utils/logger.js";

// ─── Concierge Validator ────────────────────────────────────

const VALID_DECISIONS = new Set(["EXECUTE", "CLARIFY", "ANSWER", "NAVIGATE", "UPDATE"]);

// Internal BiamOS features that should NEVER trigger NAVIGATE
const INTERNAL_KEYWORDS = ["shop", "integration", "settings", "einstellungen", "hilfe", "help", "dashboard", "template"];

export interface ConciergeOutput {
    decision: string;
    refined_query?: string;
    question?: string;
    suggestions?: string[];
    answer?: string;
    url?: string;
    title?: string;
    target_group?: string;
}

export function validateConcierge(output: ConciergeOutput, originalQuery: string): { valid: boolean; error?: string; fixed?: ConciergeOutput } {
    // Check decision is valid
    if (!output.decision || !VALID_DECISIONS.has(output.decision)) {
        return { valid: false, error: `Invalid decision "${output.decision}". Must be one of: ${[...VALID_DECISIONS].join(", ")}` };
    }

    // NAVIGATE must have a URL with https://
    if (output.decision === "NAVIGATE") {
        if (!output.url || !output.url.startsWith("https://")) {
            // Check if this should actually be ANSWER (internal feature)
            const queryLower = originalQuery.toLowerCase();
            if (INTERNAL_KEYWORDS.some(kw => queryLower.includes(kw))) {
                return {
                    valid: true,
                    fixed: {
                        decision: "ANSWER",
                        answer: `This is a BiamOS feature you can access from the sidebar. I can help you with your installed integrations instead.`,
                    },
                };
            }
            return { valid: false, error: `NAVIGATE requires a url starting with https://. Got: "${output.url}"` };
        }
    }

    // EXECUTE must have refined_query
    if (output.decision === "EXECUTE" && !output.refined_query) {
        return { valid: true, fixed: { ...output, refined_query: originalQuery } };
    }

    // CLARIFY must have question
    if (output.decision === "CLARIFY" && !output.question) {
        return { valid: false, error: "CLARIFY requires a question field" };
    }

    // ANSWER must have answer
    if (output.decision === "ANSWER" && !output.answer) {
        return { valid: false, error: "ANSWER requires an answer field" };
    }

    // UPDATE must have target_group
    if (output.decision === "UPDATE" && !output.target_group) {
        return { valid: false, error: "UPDATE requires a target_group field" };
    }

    // Guard: NAVIGATE for non-URL queries (no domain/URL in query)
    if (output.decision === "NAVIGATE") {
        const queryLower = originalQuery.toLowerCase();
        const hasNavigationIntent =
            /https?:\/\//.test(queryLower) ||
            /\.(com|org|net|io|de|at|ch|co|app|dev)\b/.test(queryLower) ||
            /\b(open|go to|visit|browse|öffne|google)\b/i.test(queryLower);

        if (!hasNavigationIntent) {
            // Force to ANSWER — user didn't ask to navigate
            return {
                valid: true,
                fixed: {
                    decision: "ANSWER",
                    answer: output.answer || `I don't have a matching integration for that query. Check the Integration Shop for available options.`,
                },
            };
        }
    }

    return { valid: true };
}

// ─── Classifier Validator ───────────────────────────────────

const VALID_TYPES = new Set<string>(["ARTICLE", "IMAGE", "IMAGES", "SEARCH", "DATA", "VIDEO", "ACTION", "NAVIGATE", "TOOL"]);

export interface ClassifierOutput {
    type: string;
    entity: string;
    modifier: string | null;
}

export function validateClassifier(output: ClassifierOutput): { valid: boolean; error?: string; fixed?: ClassifierOutput } {
    if (!output.type || !VALID_TYPES.has(output.type.toUpperCase())) {
        return { valid: false, error: `Invalid type "${output.type}". Must be one of: ${[...VALID_TYPES].join(", ")}` };
    }

    // Normalize type to uppercase
    if (output.type !== output.type.toUpperCase()) {
        output = { ...output, type: output.type.toUpperCase() };
    }

    // Entity must not be empty
    if (!output.entity || output.entity.trim().length === 0) {
        return { valid: false, error: "Entity must not be empty" };
    }

    return { valid: true, fixed: output.type !== output.type ? output : undefined };
}

// ─── Param Extractor Validator ──────────────────────────────

export function validateParams(
    params: Record<string, unknown>,
    paramSchema?: Array<{ name: string; required?: boolean }>
): { valid: boolean; error?: string; fixed?: Record<string, string> } {
    if (typeof params !== "object" || params === null || Array.isArray(params)) {
        return { valid: false, error: "Params must be a JSON object" };
    }

    // Remove null/undefined values
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== "") {
            cleaned[key] = String(value);
        }
    }

    return { valid: true, fixed: cleaned };
}

// ─── Layout Validator ───────────────────────────────────────

export interface LayoutOutput {
    blocks: Array<{ type: string;[key: string]: unknown }>;
}

export function validateLayout(
    layout: LayoutOutput | null,
    apiData: unknown,
    entity: string
): { valid: boolean; error?: string; fallback?: LayoutOutput } {
    // Null or missing layout
    if (!layout || !layout.blocks) {
        return {
            valid: false,
            error: "Layout is null or has no blocks array",
            fallback: buildFallbackLayout(entity, apiData),
        };
    }

    // Empty blocks array — this is the blank card bug
    if (layout.blocks.length === 0) {
        return {
            valid: false,
            error: "Layout has 0 blocks — blank card would result",
            fallback: buildFallbackLayout(entity, apiData),
        };
    }

    // Check for fabricated image URLs (not in source data)
    const dataStr = JSON.stringify(apiData || {});
    for (const block of layout.blocks) {
        if (block.type === "image" || block.type === "hero_image") {
            const url = (block as any).url || (block as any).src;
            if (url && typeof url === "string" && url.startsWith("http") && !dataStr.includes(url)) {
                // Fabricated URL — remove this block
                log.warn(`  ⚠️  Layout Validator: Removed fabricated image URL: ${url.substring(0, 80)}`);
                layout.blocks = layout.blocks.filter(b => b !== block);
            }
        }
    }

    // After removing fabricated URLs, check if we still have blocks
    if (layout.blocks.length === 0) {
        return {
            valid: false,
            error: "All blocks contained fabricated URLs",
            fallback: buildFallbackLayout(entity, apiData),
        };
    }

    return { valid: true };
}

// ─── Fallback Layout Builder ────────────────────────────────

function buildFallbackLayout(entity: string, apiData: unknown): LayoutOutput {
    const blocks: Array<{ type: string;[key: string]: unknown }> = [
        { type: "title", text: entity },
    ];

    // Try to extract useful key-value pairs from the API data
    if (apiData && typeof apiData === "object") {
        const entries = flattenForDisplay(apiData as Record<string, unknown>, 8);
        if (entries.length > 0) {
            blocks.push({
                type: "key_value",
                items: entries.map(([k, v]) => ({ label: k, value: String(v) })),
            });
        }

        // Check for image URLs in the data
        const imageUrls = extractImageUrls(apiData);
        if (imageUrls.length > 0) {
            blocks.push({ type: "hero_image", url: imageUrls[0], alt: entity });
        }
    }

    return { blocks };
}

// ─── Helpers ────────────────────────────────────────────────

function flattenForDisplay(obj: Record<string, unknown>, maxEntries: number, prefix = ""): Array<[string, unknown]> {
    const result: Array<[string, unknown]> = [];

    for (const [key, value] of Object.entries(obj)) {
        if (result.length >= maxEntries) break;
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (value === null || value === undefined) continue;
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            // Skip very long strings and internal fields
            if (typeof value === "string" && (value.length > 200 || key.startsWith("_"))) continue;
            result.push([fullKey, value]);
        } else if (typeof value === "object" && !Array.isArray(value)) {
            result.push(...flattenForDisplay(value as Record<string, unknown>, maxEntries - result.length, fullKey));
        }
    }

    return result;
}

function extractImageUrls(data: unknown): string[] {
    const urls: string[] = [];
    const str = JSON.stringify(data);
    const regex = /https?:\/\/[^\s"',]+\.(?:jpg|jpeg|png|gif|webp|svg)/gi;
    let match;
    while ((match = regex.exec(str)) !== null && urls.length < 5) {
        urls.push(match[0]);
    }
    return urls;
}
