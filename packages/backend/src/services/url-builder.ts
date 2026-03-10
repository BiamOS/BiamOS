// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — URL Builder
// ============================================================
// Builds API request URLs from template + params.
// Supports placeholder matching and smart defaults for
// unresolved optional parameters.
// ============================================================

/** Common smart defaults for API parameters */
const SMART_DEFAULTS: Record<string, string> = {
    currency: "usd", vs_currency: "usd", vs_currencies: "usd",
    language: "en", lang: "en", locale: "en",
    format: "json", output: "json",
    limit: "10", per_page: "10", count: "10",
    page: "1", offset: "0",
    order: "desc", sort: "desc",
};

/**
 * Build a URL from a template string and params object.
 * Supports exact, fuzzy, partial, and last-resort placeholder matching.
 * Unresolved placeholders use smart defaults instead of empty strings.
 */
export function buildUrl(template: string, params: Record<string, string>): string {
    let url = template;
    const usedKeys = new Set<string>();
    const paramKeys = Object.keys(params);

    // Replace path/query placeholders like {page_title}, {query}, {id}
    url = url.replace(/\{(\w+)\}/g, (match, placeholder) => {
        // 1. Exact match
        if (params[placeholder]) {
            usedKeys.add(placeholder);
            return encodeURIComponent(params[placeholder]);
        }

        // 2. Fuzzy match: normalize both sides (lowercase, strip underscores)
        const norm = (s: string) => s.toLowerCase().replace(/_/g, "");
        const normPlaceholder = norm(placeholder);
        for (const key of paramKeys) {
            if (!usedKeys.has(key) && norm(key) === normPlaceholder) {
                usedKeys.add(key);
                return encodeURIComponent(params[key]);
            }
        }

        // 3. Partial match: placeholder contains key or key contains placeholder
        for (const key of paramKeys) {
            if (!usedKeys.has(key) && (normPlaceholder.includes(norm(key)) || norm(key).includes(normPlaceholder))) {
                usedKeys.add(key);
                return encodeURIComponent(params[key]);
            }
        }

        // 4. Last resort: if only 1 unused param left, assume it's this one
        const unusedKeys = paramKeys.filter(k => !usedKeys.has(k));
        if (unusedKeys.length === 1) {
            usedKeys.add(unusedKeys[0]);
            return encodeURIComponent(params[unusedKeys[0]]);
        }

        // 5. Smart default: use common defaults for known placeholder names
        const defaultVal = SMART_DEFAULTS[placeholder.toLowerCase()];
        if (defaultVal) {
            return encodeURIComponent(defaultVal);
        }

        // Could not resolve — return empty so we clean it up below
        return "";
    });

    // Clean up empty param values from unresolved placeholders
    url = url.replace(/(\w+=)(&)/g, "$2");       // key=& → &
    url = url.replace(/[?&]\w+=(?=&|$)/g, "");   // remove empty key= at end or before &
    url = url.replace(/\?&/, "?");                // ?& → ?
    url = url.replace(/[?&]$/, "");               // trailing ? or &

    // Append unused params as query string
    const queryParams = Object.entries(params)
        .filter(([k]) => !usedKeys.has(k) && params[k])
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");

    if (queryParams) {
        url += (url.includes("?") ? "&" : "?") + queryParams;
    }

    return url;
}
