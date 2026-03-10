// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Web Search Service
// ============================================================
// Lightweight web search using DuckDuckGo Instant Answer API +
// HTML scraping fallback. No API key required.
// Used by Context Chat when page context isn't sufficient.
// ============================================================

import { log } from "../utils/logger.js";

export interface SearchResult {
    title: string;
    snippet: string;
    url: string;
}

/**
 * Search the web using DuckDuckGo.
 * Returns up to `maxResults` results with title, snippet, and URL.
 */
export async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
    try {
        log.debug(`  🔍 Web Search: "${query}"`);

        // Use DuckDuckGo HTML search (no API key needed)
        const encoded = encodeURIComponent(query);
        const response = await fetch(
            `https://html.duckduckgo.com/html/?q=${encoded}`,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
            }
        );

        if (!response.ok) {
            log.warn(`  🔍 Web Search HTTP error: ${response.status}`);
            return [];
        }

        const html = await response.text();

        // Parse results from DuckDuckGo HTML
        const results: SearchResult[] = [];
        const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
            const rawUrl = match[1];
            const title = match[2].replace(/<[^>]*>/g, "").trim();
            const snippet = match[3].replace(/<[^>]*>/g, "").trim();

            // DuckDuckGo wraps URLs in a redirect — extract real URL
            let url = rawUrl;
            try {
                const parsed = new URL(rawUrl, "https://duckduckgo.com");
                const uddg = parsed.searchParams.get("uddg");
                if (uddg) url = decodeURIComponent(uddg);
            } catch { /* use raw */ }

            if (title && snippet) {
                results.push({ title, snippet, url });
            }
        }

        // Fallback: simpler regex if the above didn't match
        if (results.length === 0) {
            const simpleRegex = /<a[^>]*class="result__url"[^>]*[^>]*>([\s\S]*?)<\/a>/gi;
            const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
            const urls: string[] = [];
            const snippets: string[] = [];
            let m;
            while ((m = simpleRegex.exec(html)) && urls.length < maxResults) {
                urls.push(m[1].replace(/<[^>]*>/g, "").trim());
            }
            while ((m = snippetRegex.exec(html)) && snippets.length < maxResults) {
                snippets.push(m[1].replace(/<[^>]*>/g, "").trim());
            }
            for (let i = 0; i < Math.min(urls.length, snippets.length, maxResults); i++) {
                results.push({ title: urls[i], snippet: snippets[i], url: urls[i] });
            }
        }

        log.debug(`  🔍 Web Search: ${results.length} result(s) for "${query}"`);
        return results;
    } catch (err) {
        log.error("  🔍 Web Search error:", err);
        return [];
    }
}

/**
 * Format search results into a concise text block for LLM context.
 */
export function formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) return "No web search results found.";
    return results
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`)
        .join("\n\n");
}
