// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent 7: Docs Verifier
// ============================================================
// Verifies API endpoints against real documentation.
// Smart URL Discovery: if docs_url fails, tries common patterns.
// ============================================================

import { runAgent, type AgentResult } from "../agent-runner.js";
import type { Blueprint } from "./6-blueprint-generator.js";

// ─── Smart URL Discovery ────────────────────────────────────

/**
 * Try to fetch a URL and return the text content if successful.
 * Returns null if the URL fails, is too short, or times out.
 */
export async function tryFetchDocs(url: string): Promise<{ text: string; url: string } | null> {
    try {
        const response = await fetch(url, {
            headers: { "User-Agent": "BiamOS/2.0" },
            signal: AbortSignal.timeout(5000),
            redirect: "follow",
        });

        if (!response.ok) return null;

        const html = await response.text();
        const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 8000);

        // Must contain API-related keywords to be useful docs
        const apiKeywords = ["endpoint", "api", "request", "response", "parameter", "auth", "token", "curl", "GET", "POST"];
        const matchCount = apiKeywords.filter(kw => text.toLowerCase().includes(kw.toLowerCase())).length;

        if (text.length < 200 || matchCount < 2) return null;

        return { text, url };
    } catch {
        return null;
    }
}

/**
 * Generate candidate docs URLs from the base_url and integration name.
 * Tries common API documentation URL patterns.
 */
function generateDocsUrls(baseUrl: string, docsUrl?: string, integrationName?: string): string[] {
    const candidates: string[] = [];

    // 1. Original docs_url first (if provided)
    if (docsUrl) candidates.push(docsUrl);

    try {
        const parsed = new URL(baseUrl);
        const domain = parsed.hostname; // e.g. "api.pexels.com"
        const baseDomain = domain.replace(/^api\./, ""); // e.g. "pexels.com"
        const protocol = parsed.protocol; // e.g. "https:"

        // 2. Common docs URL patterns
        candidates.push(
            `${protocol}//www.${baseDomain}/api/docs`,
            `${protocol}//www.${baseDomain}/docs/api`,
            `${protocol}//www.${baseDomain}/developers`,
            `${protocol}//www.${baseDomain}/developer`,
            `${protocol}//${baseDomain}/api/docs`,
            `${protocol}//${baseDomain}/docs`,
            `${protocol}//${domain}/docs`,
            `${protocol}//developer.${baseDomain}/docs`,
            `${protocol}//developers.${baseDomain}`,
            `${protocol}//docs.${baseDomain}`,
        );

        // 3. Name-based search (for well-known APIs)
        if (integrationName) {
            const name = integrationName.toLowerCase().replace(/[^a-z0-9]/g, "");
            candidates.push(
                `${protocol}//www.${baseDomain}/api`,
                `${protocol}//www.${baseDomain}/${name}/api`,
            );
        }
    } catch { /* URL parse failed */ }

    // Deduplicate
    return [...new Set(candidates)];
}

// ─── Main Function ──────────────────────────────────────────

/**
 * Verify and fix an API blueprint against its real documentation.
 * Uses Smart URL Discovery to find working docs if initial URL fails.
 */
export async function verifyBlueprint(spec: Blueprint): Promise<Blueprint> {
    const candidates = generateDocsUrls(spec.base_url, spec.docs_url, spec.integration_name);

    if (candidates.length === 0) {
        return spec;
    }

    try {
        // Try each candidate URL until one works
        let docsResult: { text: string; url: string } | null = null;

        for (const url of candidates) {
            docsResult = await tryFetchDocs(url);
            if (docsResult) {
                break;
            }
        }

        if (!docsResult) {
            // Clear the non-working docs_url so the UI doesn't show a broken link
            spec.docs_url = undefined;
            return spec;
        }

        // Update the spec with the working docs URL
        spec.docs_url = docsResult.url;

        const userMessage = `BLUEPRINT:\n${JSON.stringify(spec, null, 2)}\n\nREAL API DOCUMENTATION:\n${docsResult.text}`;

        const result = await runAgent("docs-verifier", userMessage);

        if (result.skipped) {
            return spec;
        }

        let verified: Blueprint;
        if (typeof result.output === "string") {
            verified = JSON.parse(result.raw);
        } else {
            verified = result.output;
        }

        // Preserve the working docs_url
        verified.docs_url = docsResult.url;

        // Count changes
        const changedPaths = spec.endpoints?.filter((e, i) =>
            verified.endpoints?.[i]?.path !== e.path
        ).length ?? 0;



        return verified;
    } catch {
        return spec;
    }
}
