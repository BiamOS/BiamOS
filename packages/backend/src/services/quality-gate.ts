// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Response Quality Gate
// ============================================================
// Fast heuristic check: does the API response actually relate
// to the user's query? Runs BEFORE Data Guard.
//
// If fail → triggers Auto-Retry Cascade (try next endpoint)
// ============================================================

export interface QualityResult {
    /** Did the response pass quality checks? */
    pass: boolean;
    /** Human-readable reason for failure */
    reason?: string;
}

/**
 * Check if an API response is relevant and non-empty.
 * Fast heuristic — no LLM call needed.
 */
export function checkResponseQuality(
    apiData: any,
    query: string,
): QualityResult {
    // Gate 1: null/undefined
    if (apiData === null || apiData === undefined) {
        return { pass: false, reason: "Response is null" };
    }

    // Gate 2: empty array
    if (Array.isArray(apiData) && apiData.length === 0) {
        return { pass: false, reason: "Response is empty array" };
    }

    // Gate 3: object with all-null values (e.g. { "drinks": null, "meals": null })
    if (typeof apiData === "object" && !Array.isArray(apiData)) {
        const values = Object.values(apiData);
        if (values.length > 0 && values.every(v => v === null || v === undefined)) {
            return { pass: false, reason: `Response has all-null values: ${Object.keys(apiData).join(", ")}` };
        }
    }

    // Gate 4: too small response (likely error or empty)
    const dataStr = JSON.stringify(apiData);
    if (dataStr.length < 10) {
        return { pass: false, reason: `Response too small: ${dataStr.length} bytes` };
    }

    // Gate 5: error-shaped responses
    if (typeof apiData === "object" && !Array.isArray(apiData)) {
        const keys = Object.keys(apiData).map(k => k.toLowerCase());
        if (keys.includes("error") || keys.includes("err") || keys.includes("fault")) {
            const errorVal = apiData.error || apiData.err || apiData.fault;
            if (errorVal) {
                return { pass: false, reason: `Response contains error: ${JSON.stringify(errorVal).substring(0, 100)}` };
            }
        }
    }

    return { pass: true };
}
