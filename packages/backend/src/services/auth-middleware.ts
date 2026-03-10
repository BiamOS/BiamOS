// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Auth Middleware
// ============================================================
// Reads api_config from a capsule and injects authentication
// headers/params into outgoing API requests.
//
// Supports:
//   - API Key (header or query param)
//   - Bearer Token
//   - Basic Auth
//   - OAuth2 (client credentials — future)
// ============================================================

import { type Integration } from "../db/schema.js";

// ─── Types ──────────────────────────────────────────────────

export interface AuthConfig {
    requiresAuth: boolean;
    authType?: "apikey" | "bearer" | "oauth2" | "basic";
    authHeaderName?: string;     // e.g. "Authorization", "X-API-Key"
    authPrefix?: string;         // e.g. "Bearer" (for bearer type)
    authKey?: string;            // the actual token/key value
    authQueryParam?: string;     // for APIs that use ?api_key=xxx
    authQueryValue?: string;     // the value for query param auth
}

interface AuthResult {
    headers: Record<string, string>;
    queryParams: Record<string, string>;
}

// ─── Parse Auth Config ──────────────────────────────────────

/**
 * Parse the api_config JSON from a capsule into a typed AuthConfig.
 */
function parseAuthConfig(integration: Integration): AuthConfig | null {
    if (!integration.api_config) return null;
    try {
        const raw = JSON.parse(integration.api_config);
        if (!raw.requiresAuth) return null;
        // Normalize field names: UI stores headerName/apiKey, code expects authHeaderName/authKey
        const config: AuthConfig = {
            requiresAuth: true,
            authType: raw.authType,
            authHeaderName: raw.authHeaderName || raw.headerName,
            authPrefix: raw.authPrefix,
            authKey: raw.authKey || raw.apiKey,
            authQueryParam: raw.authQueryParam,
            authQueryValue: raw.authQueryValue,
        };
        return config;
    } catch {
        return null;
    }
}

// ─── Build Auth ─────────────────────────────────────────────

/**
 * Build authentication headers and query params from a capsule's config.
 * Returns empty objects if no auth is required.
 */
export function buildAuth(integration: Integration): AuthResult {
    const result: AuthResult = { headers: {}, queryParams: {} };
    const config = parseAuthConfig(integration);
    if (!config) return result;

    switch (config.authType) {
        case "bearer": {
            const headerName = config.authHeaderName || "Authorization";
            const prefix = config.authPrefix || "Bearer";
            const token = config.authKey || "";
            result.headers[headerName] = `${prefix} ${token}`;
            break;
        }

        case "apikey": {
            if (config.authQueryParam) {
                // Query param style: ?api_key=xxx
                result.queryParams[config.authQueryParam] = config.authQueryValue || config.authKey || "";
            } else {
                // Header style: X-API-Key: xxx
                const headerName = config.authHeaderName || "X-API-Key";
                result.headers[headerName] = config.authKey || "";
            }
            break;
        }

        case "basic": {
            const headerName = config.authHeaderName || "Authorization";
            // authKey expected as "user:password"
            const encoded = Buffer.from(config.authKey || "").toString("base64");
            result.headers[headerName] = `Basic ${encoded}`;
            break;
        }

        case "oauth2": {
            // For now, treat as bearer token
            const headerName = config.authHeaderName || "Authorization";
            result.headers[headerName] = `Bearer ${config.authKey || ""}`;
            break;
        }
    }

    return result;
}

// ─── Apply Auth to Fetch Options ────────────────────────────

/**
 * Applies auth from a capsule's config to a fetch RequestInit + URL.
 * Returns the updated URL (with query params if needed) and fetch options.
 */
export function applyAuth(
    integration: Integration,
    url: string,
    fetchOptions: RequestInit
): { url: string; fetchOptions: RequestInit } {
    const auth = buildAuth(integration);

    // Merge auth headers into existing headers
    const existingHeaders = (fetchOptions.headers || {}) as Record<string, string>;
    fetchOptions.headers = { ...existingHeaders, ...auth.headers };

    // Append query params to URL
    const queryEntries = Object.entries(auth.queryParams);
    if (queryEntries.length > 0) {
        const separator = url.includes("?") ? "&" : "?";
        const queryStr = queryEntries
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join("&");
        url = `${url}${separator}${queryStr}`;
    }

    if (Object.keys(auth.headers).length > 0) {
    }

    return { url, fetchOptions };
}
