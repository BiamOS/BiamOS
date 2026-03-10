// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Pipeline Helpers
// ============================================================
// Extracted from intent-routes.ts to decompose the 240-line
// processSingleIntent into testable, focused functions.
// ============================================================

import { createHash } from "crypto";
import { db } from "../db/db.js";
import { capsules, systemSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { Integration } from "../db/schema.js";
import { applyAuth } from "../services/auth-middleware.js";
import { filterApiData } from "../services/api-data-filter.js";
import { log } from "../utils/logger.js";

// ─── Language Settings ─────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
    en: "English",
    de: "German",
    es: "Spanish",
    fr: "French",
    ja: "Japanese",
};

export async function getUserLanguage(): Promise<string> {
    try {
        const langRow = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.key, "user_language"));
        if (langRow.length > 0) return LANG_NAMES[langRow[0].value] || "English";
    } catch (err) { log.warn("[pipeline] language setting lookup failed:", err); }
    return "English";
}

/**
 * Check if web search fallback is enabled (default: true).
 * When enabled, unmatched queries open a Google search iframe card.
 * Users can disable this in General Settings.
 */
export async function getWebSearchFallback(): Promise<boolean> {
    try {
        const row = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.key, "web_search_fallback"));
        if (row.length > 0) return row[0].value !== "false";
    } catch (err) { log.warn("[pipeline] web search fallback setting lookup failed:", err); }
    return true; // default: enabled
}

// ─── API Fetch with Auth ───────────────────────────────────

export interface ApiCallResult {
    ok: true;
    data: any;
    url: string;
    rawSize: number;
    filteredSize: number;
}

export interface ApiCallError {
    ok: false;
    status: number;
    message: string;
}

export async function fetchWithAuth(
    integration: Integration,
    url: string,
    method: string,
    params: Record<string, string>
): Promise<ApiCallResult | ApiCallError> {
    let fetchOptions: RequestInit = { method, signal: AbortSignal.timeout(10000) };

    if (["POST", "PUT", "PATCH"].includes(method)) {
        fetchOptions.headers = { "Content-Type": "application/json" };
        fetchOptions.body = JSON.stringify(params);
    }

    const authed = applyAuth(integration, url, fetchOptions);
    const response = await fetch(authed.url, authed.fetchOptions);


    if (response.ok) {
        let rawData: any;
        const contentType = response.headers.get("content-type") || "";
        try {
            if (contentType.includes("json") || contentType.includes("javascript")) {
                rawData = await response.json();
            } else {
                // Non-JSON response — wrap as text
                const text = await response.text();
                try { rawData = JSON.parse(text); } catch {
                    rawData = { _raw_text: text.substring(0, 5000) };
                }
            }
        } catch (parseErr) {
            return { ok: false, status: response.status, message: "API returned unparseable response" };
        }
        const rawSize = JSON.stringify(rawData).length;

        // Detect error-shaped 200 OK responses (e.g. {"error": "missing param"})
        if (typeof rawData === "object" && rawData !== null && !Array.isArray(rawData)) {
            const keys = Object.keys(rawData);
            const hasErrorField = "error" in rawData || "Error" in rawData;
            const hasStatusError = rawData.status === "error" || rawData.status === false;
            const hasOnlyMeta = keys.every(k =>
                ["error", "message", "code", "status", "detail", "title", "type", "Error"].includes(k)
            );
            if ((hasErrorField || hasStatusError) && (keys.length <= 4 || hasOnlyMeta)) {
                const msg = rawData.error || rawData.Error || rawData.message || rawData.detail || "API returned error in 200 OK";
                return { ok: false, status: 200, message: String(msg).substring(0, 200) };
            }
        }

        const filtered = filterApiData(rawData, integration.name, integration);
        const filteredSize = JSON.stringify(filtered).length;
        return { ok: true, data: filtered, url: authed.url, rawSize, filteredSize };
    }

    const errText = await response.text();
    return { ok: false, status: response.status, message: errText.substring(0, 100) };
}

// ─── Handle Wikipedia Redirect ─────────────────────────────

export async function handleRedirect(
    integration: Integration,
    apiData: any,
    params: Record<string, string>,
    buildUrl: (template: string, params: Record<string, string>) => string
): Promise<any> {
    if (!apiData?._redirect) return apiData;

    const redirectTarget = apiData._redirect;
    const redirectUrl = buildUrl(integration.api_endpoint, {
        [Object.keys(params)[0] || "title"]: redirectTarget,
    });

    try {
        const fetchOptions: RequestInit = { method: "GET", signal: AbortSignal.timeout(10000) };
        const authed = applyAuth(integration, redirectUrl, fetchOptions);
        const redirectResponse = await fetch(authed.url, authed.fetchOptions);
        if (redirectResponse.ok) {
            const rawData = await redirectResponse.json();
            const filtered = filterApiData(rawData, integration.name, integration);
            return filtered;
        }
    } catch (err) {
        log.warn("[pipeline] redirect follow-up failed:", err);
    }

    return apiData;
}

// ─── Smart Fallback: thin data → search ────────────────────

export interface FallbackResult {
    data: any;
    url?: string;
    overrideType?: "SEARCH";
}

export async function smartFallback(
    apiData: any,
    matchedGroup: string,
    currentIntegrationName: string,
    entity: string,
    params: Record<string, string>,
    buildUrl: (template: string, params: Record<string, string>) => string
): Promise<FallbackResult | null> {
    const dataContent = JSON.stringify(apiData || {});
    const contentChars = dataContent.replace(/[{}\[\]",:]/g, "").replace(/null|undefined/g, "").trim().length;

    if (contentChars >= 100) return null;

    // Look for a search endpoint in the same group
    const allGroupIntegrations = await db
        .select()
        .from(capsules)
        .where(eq(capsules.group_name, matchedGroup));

    const searchEndpoint = allGroupIntegrations.find(
        (c) =>
            c.name !== currentIntegrationName &&
            (c.intent_description?.toLowerCase().includes("search") ||
                c.api_endpoint?.includes("search") ||
                c.api_endpoint?.includes("srsearch"))
    );

    if (!searchEndpoint) return null;

    const searchUrl = buildUrl(searchEndpoint.api_endpoint, {
        [Object.keys(params)[0] || "query"]: entity,
    });

    try {
        const fetchOptions: RequestInit = { method: "GET", signal: AbortSignal.timeout(10000) };
        const authed = applyAuth(searchEndpoint, searchUrl, fetchOptions);
        const searchResponse = await fetch(authed.url, authed.fetchOptions);
        if (searchResponse.ok) {
            const rawData = await searchResponse.json();
            const filtered = filterApiData(rawData, searchEndpoint.name, searchEndpoint);
            return { data: filtered, url: authed.url, overrideType: "SEARCH" };
        }
    } catch (err) {
        log.warn("[pipeline] search fallback failed:", err);
    }

    return null;
}

// ─── Cache Key (uses hash instead of full JSON.stringify) ───

export function buildCacheKey(integrationName: string, intentType: string, data: any, language?: string): string {
    const dataHash = createHash("md5")
        .update(JSON.stringify(data))
        .digest("hex");
    return `${integrationName}:${intentType}:${language || "en"}:${dataHash}`;
}
