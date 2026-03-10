// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — JSON Repair Utilities
// ============================================================
// Extracted from agent-runner.ts — pure utility functions for
// sanitizing and repairing truncated/malformed JSON output
// from LLM responses.
// ============================================================

// ─── JSON Sanitization ──────────────────────────────────────

/**
 * Fix common LLM JSON errors before parsing.
 * Handles: trailing commas, HTML entities, control chars,
 * unescaped tabs/backslashes/newlines in string values.
 */
export function sanitizeJSON(raw: string): string {
    let s = raw;
    // NOTE: Do NOT strip // comments — they appear in URLs (https://...)
    // Remove trailing commas before } or ]
    s = s.replace(/,\s*([\]}])/g, "$1");
    // Decode common HTML entities that Wikipedia sends
    s = s.replace(/&#0?39;/g, "'");
    s = s.replace(/&#0?34;/g, '\\"');
    s = s.replace(/&amp;/g, "&");
    s = s.replace(/&lt;/g, "<");
    s = s.replace(/&gt;/g, ">");
    s = s.replace(/&quot;/g, '\\"');
    s = s.replace(/&nbsp;/g, " ");
    // Fix unescaped control characters inside strings
    s = s.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match) => {
        return match
            .replace(/\t/g, "\\t")
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")
            .replace(/\f/g, "\\f")
            .replace(/[\x00-\x1f]/g, ""); // strip other control chars
    });
    return s;
}

// ─── Truncated JSON Repair ──────────────────────────────────

/**
 * Attempt to repair truncated JSON by closing unclosed brackets/braces.
 * Common when LLM output hits max_tokens and gets cut off mid-JSON.
 * Handles: incomplete strings, dangling objects in arrays, unclosed brackets.
 */
export function repairTruncatedJSON(raw: string): any | null {
    let s = raw.trim();

    // Strip markdown code fences if present
    s = s.replace(/^```(?:json)?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "").trim();

    // Must start with { or [
    if (!s.startsWith("{") && !s.startsWith("[")) return null;

    // Try parsing as-is first
    try {
        return JSON.parse(sanitizeJSON(s));
    } catch { /* continue to repair */ }

    // ── Pass 1: Remove trailing incomplete string value ──
    s = s.replace(/,?\s*"[^"]*":\s*"[^"]*$/m, "");

    // ── Pass 2: Remove trailing incomplete object in array ──
    const lastCompleteBrace = findLastCompleteObject(s);
    if (lastCompleteBrace > 0 && lastCompleteBrace < s.length - 2) {
        s = s.substring(0, lastCompleteBrace + 1);
    }

    // ── Pass 3: Remove trailing incomplete key ──
    s = s.replace(/,?\s*"[^"]*$/m, "");

    // ── Pass 4: Remove trailing commas ──
    s = s.replace(/,\s*$/, "");

    // ── Pass 5: Count and close unclosed brackets ──
    let braces = 0;
    let brackets = 0;
    let inString = false;
    let escaped = false;

    for (const ch of s) {
        if (escaped) { escaped = false; continue; }
        if (ch === "\\") { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === "{") braces++;
        if (ch === "}") braces--;
        if (ch === "[") brackets++;
        if (ch === "]") brackets--;
    }

    // Remove trailing commas (again, after passes)
    s = s.replace(/,\s*$/, "");

    // Close open brackets/braces
    for (let i = 0; i < brackets; i++) s += "]";
    for (let i = 0; i < braces; i++) s += "}";

    try {
        return JSON.parse(sanitizeJSON(s));
    } catch {
        return null;
    }
}

// ─── Find Last Complete Object ──────────────────────────────

/**
 * Find the position of the last complete JSON object (closing }).
 * Walks from start to find a `}` that properly closes a nested object.
 */
export function findLastCompleteObject(s: string): number {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let lastCompletePos = -1;

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (escaped) { escaped = false; continue; }
        if (ch === "\\") { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;

        if (ch === "{") depth++;
        if (ch === "}") {
            depth--;
            if (depth >= 1) {
                lastCompletePos = i;
            }
        }
    }
    return lastCompletePos;
}

// ─── Aggressive JSON Repair ─────────────────────────────────

/**
 * Try harder to fix JSON by extracting the error position
 * and attempting position-based repair.
 */
export function aggressiveJSONRepair(raw: string): any | null {
    const sanitized = sanitizeJSON(raw);

    // Try standard parse
    try {
        return JSON.parse(sanitized);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "";

        // Extract position from error: "at position 238"
        const posMatch = msg.match(/position\s+(\d+)/i);
        if (!posMatch) return null;
        const pos = parseInt(posMatch[1]);

        // Log context around error
        const start = Math.max(0, pos - 40);
        const end = Math.min(sanitized.length, pos + 40);
        const context = sanitized.substring(start, end);
        const pointer = " ".repeat(Math.min(pos - start, 40)) + "^";

        // Strategy: find the problematic string value and escape internal quotes
        let openQuote = pos;
        while (openQuote > 0 && sanitized[openQuote] !== '"') openQuote--;

        if (openQuote > 0) {
            const before = sanitized.substring(0, openQuote);
            const rest = sanitized.substring(openQuote);
            const endMatch = rest.match(/^"((?:[^"\\]|\\.)*)"\\s*([,}\]:])/)
            if (!endMatch) {
                const realEnd = rest.match(/"[^"]*?"\s*[,}\]:]/);
                if (realEnd) {
                    // Skip this broken string
                }
            }
        }

        // Last resort: try removing the problematic character
        const fixed = sanitized.substring(0, pos) + sanitized.substring(pos + 1);
        try {
            return JSON.parse(fixed);
        } catch {
            return null;
        }
    }
}
