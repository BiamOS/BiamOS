// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Research Engine
// ============================================================
// 4-phase pipeline: Search → Fetch → Synthesize → Dashboard.
// Fully API-based — no browser, no screenshots, no DOM.
// Streams progress via callback for SSE integration.
// ============================================================

import { log } from "../utils/logger.js";
import { fetchPages, type FetchedPage } from "./page-fetcher.js";
import { getChatUrl, getHeaders } from "./llm-provider.js";
import { MODEL_FAST, MODEL_THINKING } from "../config/models.js";
import { logTokenUsage } from "../server-utils.js";
import { safeParseJSON } from "../utils/safe-json.js";
import { buildGenUIPrompt } from "../prompts/genui-prompt.js";
import { GenUIResponseSchema, buildErrorFallbackBlocks } from "../prompts/genui-prompt.js";

// ─── Types ──────────────────────────────────────────────────

export interface ResearchStep {
    phase: "search" | "fetch" | "synthesize" | "done" | "error";
    status: string;
    data?: Record<string, unknown>;
}

export interface ResearchResult {
    blocks: Array<{ type: string; [key: string]: unknown }>;
    sources: Array<{ title: string; url: string; image?: string }>;
    totalSteps: number;
}

type StepCallback = (step: ResearchStep) => void;

// ─── Config ─────────────────────────────────────────────────

const MAX_SEARCH_QUERIES = 3;
const MAX_FETCH_URLS = 3;
const DDG_TIMEOUT_MS = 5_000;
const OG_TIMEOUT_MS = 3_000;

// ─── Main Pipeline ──────────────────────────────────────────

/**
 * Execute the full research pipeline.
 * Emits progress via `onStep` callback for SSE streaming.
 */
export async function runResearch(
    query: string,
    onStep: StepCallback
): Promise<ResearchResult> {
    let stepCount = 0;

    const emit = (step: ResearchStep) => {
        stepCount++;
        onStep(step);
    };

    try {
        // ── Phase 1: SEARCH ─────────────────────────────────
        emit({ phase: "search", status: "planning", data: { query } });

        // Generate refined search queries using LLM
        const queries = await generateSearchQueries(query);
        emit({ phase: "search", status: "searching", data: { queries } });

        // Execute all searches in parallel
        let allResults = await executeSearches(queries);
        let dedupedResults = deduplicateResults(allResults);

        // Fallback: if LLM-refined queries found nothing, retry with the raw user query
        if (dedupedResults.length === 0 && !queries.includes(query)) {
            emit({ phase: "search", status: "retrying", data: { reason: "No results from refined queries, trying raw query" } });
            const rawResults = await executeSearches([query]);
            dedupedResults = deduplicateResults(rawResults);
        }

        emit({
            phase: "search",
            status: "results",
            data: {
                resultCount: dedupedResults.length,
                results: dedupedResults.slice(0, 8).map(r => ({
                    title: r.ogTitle || r.title,
                    url: r.url,
                    image: r.ogImage,
                    snippet: (r.ogDescription || r.snippet).substring(0, 120),
                })),
            },
        });

        // ── Phase 2: FETCH ──────────────────────────────────
        // Pick top URLs to fetch full content from
        const urlsToFetch = pickBestUrls(dedupedResults, MAX_FETCH_URLS);

        emit({
            phase: "fetch",
            status: "reading",
            data: { urls: urlsToFetch.map(r => ({ url: r.url, title: r.ogTitle || r.title })) },
        });

        const pages = await fetchPages(urlsToFetch.map(r => r.url));
        const successfulPages = pages.filter(p => p.wordCount > 0);

        emit({
            phase: "fetch",
            status: "extracted",
            data: {
                pagesRead: successfulPages.length,
                totalWords: successfulPages.reduce((sum, p) => sum + p.wordCount, 0),
            },
        });

        // ── Phase 3: SYNTHESIZE ─────────────────────────────
        emit({ phase: "synthesize", status: "generating", data: { message: "Creating dashboard..." } });

        // Build rich context from search results + fetched pages
        const researchData = buildResearchContext(dedupedResults, successfulPages);
        const blocks = await generateDashboard(query, researchData);

        // ── Phase 4: DELIVER ────────────────────────────────
        const sources = dedupedResults.slice(0, 6).map(r => ({
            title: r.ogTitle || r.title,
            url: r.url,
            image: r.ogImage || undefined,
        }));

        const result: ResearchResult = { blocks, sources, totalSteps: stepCount };

        emit({ phase: "done", status: "complete", data: { blockCount: blocks.length } });

        return result;
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        log.error(`  🔬 [Research] Pipeline error: ${message}`);
        emit({ phase: "error", status: message, data: { recoverable: false } });

        return {
            blocks: buildErrorFallbackBlocks(`Research failed: ${message}`).blocks,
            sources: [],
            totalSteps: stepCount,
        };
    }
}

// ─── Phase 1: Search ────────────────────────────────────────

interface SearchResult {
    title: string;
    snippet: string;
    url: string;
    domain: string;
    favicon: string;
    ogImage: string;
    ogTitle: string;
    ogDescription: string;
}

/**
 * Use LLM to generate 2-3 focused search queries from the user's request.
 */
async function generateSearchQueries(userQuery: string): Promise<string[]> {
    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("research-planner");

        const resp = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_FAST,
                messages: [
                    {
                        role: "system",
                        content: `You generate 2-3 focused web search queries for research. Return ONLY a JSON array of strings.
Example: ["Diablo 4 Season 12 news 2026", "Diablo 4 new warlock class"]
Rules:
- Add the current year (2026) to news/trends queries
- Make queries specific and varied (different angles)
- Use English for international topics
- Maximum 3 queries`,
                    },
                    { role: "user", content: userQuery },
                ],
                temperature: 0,
                max_tokens: 200,
                response_format: { type: "json_object" },
            }),
        });

        const result = await resp.json();
        await logTokenUsage("research:planner", MODEL_FAST, result.usage ?? {});

        const content = result.choices?.[0]?.message?.content || "";
        const parsed = safeParseJSON(content);

        // Handle both { queries: [...] } and plain [...]
        const queries = Array.isArray(parsed) ? parsed : parsed?.queries;
        if (Array.isArray(queries) && queries.length > 0) {
            return queries.slice(0, MAX_SEARCH_QUERIES);
        }
    } catch (err) {
        log.warn(`  🔬 [Research] Query generation failed: ${(err as Error).message}`);
    }

    // Fallback: just use the original query
    return [userQuery];
}

/**
 * Execute search with API fallbacks (Tavily -> SerpAPI -> DuckDuckGo).
 */
async function executeSearches(queries: string[]): Promise<SearchResult[]> {
    let tavilyKey = process.env.TAVILY_API_KEY;
    let serpapiKey = process.env.SERPAPI_API_KEY;

    // Try DB config gracefully
    try {
        const { db } = await import("../db/db.js");
        const { systemSettings } = await import("../db/schema.js");
        const { eq } = await import("drizzle-orm");
        if (!tavilyKey) {
            const [tRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, "TAVILY_API_KEY")).limit(1);
            if (tRow?.value) tavilyKey = tRow.value;
        }
        if (!serpapiKey) {
            const [sRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, "SERPAPI_API_KEY")).limit(1);
            if (sRow?.value) serpapiKey = sRow.value;
        }
    } catch { /* DB not accessible */ }

    // If API keys exist, handle them synchronously to avoid rate limits
    if (tavilyKey) {
        log.info(`  🔬 [Research] Using Tavily API for ${queries.length} queries`);
        const allResults: { title: string; snippet: string; url: string; domain: string; favicon: string }[] = [];
        for (const query of queries) {
            try {
                const results = await searchTavily(query, tavilyKey);
                allResults.push(...results);
            } catch (err) {
                log.warn(`  🧪 [Research] Tavily search failed for "${query}": ${(err as Error).message}`);
            }
        }
        return await enrichWithOg(allResults);
    }

    if (serpapiKey) {
        log.info(`  🔬 [Research] Using SerpAPI for ${queries.length} queries`);
        const allResults: { title: string; snippet: string; url: string; domain: string; favicon: string }[] = [];
        for (const query of queries) {
            try {
                const results = await searchSerpApi(query, serpapiKey);
                allResults.push(...results);
            } catch (err) {
                log.warn(`  🧪 [Research] SerpAPI search failed for "${query}": ${(err as Error).message}`);
            }
        }
        return await enrichWithOg(allResults);
    }

    // Fallback parallel DuckDuckGo HTML with OG
    log.info(`  🔬 [Research] No API keys. Falling back to DuckDuckGo HTML for ${queries.length} queries`);
    const searchPromises = queries.map(async (query) => {
        try {
            const results = await searchDdg(query);
            return await enrichWithOg(results);
        } catch (err) {
            log.warn(`  \u{1F52C} [Research] DuckDuckGo search failed for "${query}": ${(err as Error).message}`);
            return [];
        }
    });

    const allResults = (await Promise.all(searchPromises)).flat();
    return allResults;
}

/** Tavily Search API wrapper */
async function searchTavily(query: string, apiKey: string): Promise<{ title: string; snippet: string; url: string; domain: string; favicon: string }[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const resp = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: apiKey,
                query: query,
                search_depth: "advanced",
                include_raw_content: false,
                include_answers: false,
                max_results: 8
            }),
            signal: controller.signal
        });
        if (!resp.ok) throw new Error(`Tavily API returned ${resp.status}`);
        const data = await resp.json();
        
        return (data.results || []).map((r: any) => {
            let domain = "";
            try { domain = new URL(r.url).hostname.replace("www.", ""); } catch {}
            return {
                title: r.title || "",
                snippet: r.content || r.snippet || "",
                url: r.url,
                domain: domain,
                favicon: domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : ""
            };
        });
    } finally {
        clearTimeout(timeout);
    }
}

/** SerpAPI Search wrapper */
async function searchSerpApi(query: string, apiKey: string): Promise<{ title: string; snippet: string; url: string; domain: string; favicon: string }[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const searchUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&engine=google&num=8`;
        const resp = await fetch(searchUrl, { signal: controller.signal });
        if (!resp.ok) throw new Error(`SerpAPI returned ${resp.status}`);
        const data = await resp.json();
        
        return (data.organic_results || []).map((r: any) => {
            let domain = "";
            try { domain = new URL(r.link).hostname.replace("www.", ""); } catch {}
            return {
                title: r.title || "",
                snippet: r.snippet || "",
                url: r.link,
                domain: domain,
                favicon: domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : ""
            };
        });
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * DuckDuckGo HTML search — extracted from agent-routes.ts.
 */
async function searchDdg(query: string): Promise<{ title: string; snippet: string; url: string; domain: string; favicon: string }[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DDG_TIMEOUT_MS);

    try {
        const newsKeywords = /\b(news|neuigkeiten|aktuell|latest|trends|recent|neue|today|heute|this week|diese woche|2026)\b/i;
        const useTimeFilter = newsKeywords.test(query);

        // First attempt: with time filter if applicable
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}${useTimeFilter ? "&df=m" : ""}`;
        const resp = await fetch(searchUrl, {
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
            },
        });
        const html = await resp.text();
        const results = parseDdgResults(html);

        // Fallback: if time filter returned 0 results, retry without it
        if (results.length === 0 && useTimeFilter) {
            log.debug(`  🔬 [Research] Time-filtered search empty for "${query}", retrying without filter...`);
            clearTimeout(timeout);
            const fallbackController = new AbortController();
            const fallbackTimeout = setTimeout(() => fallbackController.abort(), DDG_TIMEOUT_MS);
            try {
                const fallbackUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
                const fallbackResp = await fetch(fallbackUrl, {
                    signal: fallbackController.signal,
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                        Accept: "text/html,application/xhtml+xml",
                        "Accept-Language": "en-US,en;q=0.9",
                    },
                });
                const fallbackHtml = await fallbackResp.text();
                return parseDdgResults(fallbackHtml);
            } finally {
                clearTimeout(fallbackTimeout);
            }
        }

        return results;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Parse DDG HTML results.
 * Uses block-by-block splitting instead of a single mega-regex
 * to avoid catastrophic backtracking on large HTML responses.
 */
function parseDdgResults(html: string): { title: string; snippet: string; url: string; domain: string; favicon: string }[] {
    const results: { title: string; snippet: string; url: string; domain: string; favicon: string }[] = [];

    // Split by result blocks — each result starts with class="result__title"
    const blocks = html.split(/class="result__title"/i);
    // Skip first block (everything before the first result)
    for (let i = 1; i < blocks.length && results.length < 8; i++) {
        const block = blocks[i];

        // Skip ad results (they have result--ad class in surrounding HTML)
        if (i > 0 && blocks[i - 1].includes("result--ad")) continue;

        // Extract link URL from result__a (tolerant: allows extra CSS classes)
        const linkMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"/i);
        if (!linkMatch) continue;

        // Extract title (text content of the result__a link)
        const titleMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "";

        // Extract snippet from result__snippet
        const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, "").trim() : "";

        const rawUrl = linkMatch[1];
        let url = rawUrl;
        try {
            const parsed = new URL(rawUrl, "https://duckduckgo.com");
            const uddg = parsed.searchParams.get("uddg");
            if (uddg) url = decodeURIComponent(uddg);
        } catch { /* use raw */ }

        // Skip ad results (uddg containing ad_provider or ad_domain)
        if (rawUrl.includes("ad_provider") || rawUrl.includes("ad_domain")) continue;

        let domain = "";
        try { domain = new URL(url).hostname.replace("www.", ""); } catch { /* skip */ }

        if (title && snippet) {
            results.push({ title, snippet, url, domain, favicon: `https://icons.duckduckgo.com/ip3/${domain}.ico` });
        }
    }

    return results;
}

/**
 * Enrich search results with OG metadata (parallel, 3s timeout).
 */
async function enrichWithOg(
    results: { title: string; snippet: string; url: string; domain: string; favicon: string }[]
): Promise<SearchResult[]> {
    const fetches = results.map(async (r) => {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), OG_TIMEOUT_MS);
            const resp = await fetch(r.url, {
                signal: controller.signal,
                headers: { "User-Agent": "Mozilla/5.0 (compatible; BiamBot/1.0)", Accept: "text/html" },
            });
            clearTimeout(timer);

            const reader = resp.body?.getReader();
            let html = "";
            if (reader) {
                const decoder = new TextDecoder();
                let bytesRead = 0;
                while (bytesRead < 20000) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    html += decoder.decode(value, { stream: true });
                    bytesRead += value.length;
                }
                reader.cancel();
            }

            const getOg = (prop: string): string => {
                const m =
                    html.match(new RegExp(`<meta[^>]*property=["']og:${prop}["'][^>]*content=["']([^"']*)["']`, "i")) ||
                    html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${prop}["']`, "i"));
                return m?.[1] || "";
            };

            return { ...r, ogImage: getOg("image"), ogDescription: getOg("description") || r.snippet, ogTitle: getOg("title") || r.title };
        } catch {
            return { ...r, ogImage: "", ogDescription: r.snippet, ogTitle: r.title };
        }
    });

    const settled = await Promise.allSettled(fetches);
    return settled.map((s, i) =>
        s.status === "fulfilled" ? s.value : { ...results[i], ogImage: "", ogDescription: results[i].snippet, ogTitle: results[i].title }
    );
}

/**
 * Deduplicate results by URL.
 */
function deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
    });
}

/**
 * Pick best URLs to fetch full content from.
 * Prefers URLs with OG images (= real articles, not link farms).
 */
function pickBestUrls(results: SearchResult[], max: number): SearchResult[] {
    const withImage = results.filter(r => r.ogImage);
    const withoutImage = results.filter(r => !r.ogImage);

    return [...withImage, ...withoutImage].slice(0, max);
}

// ─── Phase 3: Synthesize ────────────────────────────────────

/**
 * Build the data context for GenUI from search results + fetched pages.
 */
function buildResearchContext(
    searchResults: SearchResult[],
    pages: FetchedPage[]
): Record<string, unknown> {
    return {
        search_results: searchResults.slice(0, 8).map(r => ({
            title: r.ogTitle || r.title,
            snippet: (r.ogDescription || r.snippet).substring(0, 200),
            url: r.url,
            source: r.domain,
            image: r.ogImage || null,
        })),
        page_content: pages.map(p => ({
            url: p.url,
            title: p.title,
            text: p.text.substring(0, 15000), // MODEL_THINKING has massive context — give it real content
            wordCount: p.wordCount,
        })),
        sources_count: searchResults.length,
        pages_read: pages.length,
    };
}

/**
 * Generate the final GenUI dashboard blocks.
 */
async function generateDashboard(
    query: string,
    data: Record<string, unknown>
): Promise<Array<{ type: string; [key: string]: unknown }>> {
    try {
        // Build GenUI prompt WITHOUT data (data goes in USER message)
        const prompt = buildGenUIPrompt(null);
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("research-dashboard");

        // Format research data as a clear, readable context for the LLM
        let userContent = `Create a dashboard for: "${query}"\n\n`;
        userContent += `=== RESEARCH DATA (USE THIS — DO NOT INVENT) ===\n\n`;

        const searchResults = (data.search_results as any[]) || [];
        if (searchResults.length > 0) {
            userContent += `SEARCH RESULTS (${searchResults.length} found):\n`;
            for (const r of searchResults) {
                userContent += `• [${r.title}](${r.url}) — ${r.source}\n  ${r.snippet}\n`;
                if (r.image) userContent += `  Image: ${r.image}\n`;
            }
            userContent += `\n`;
        }

        const pageContent = (data.page_content as any[]) || [];
        if (pageContent.length > 0) {
            userContent += `PAGE CONTENT (${pageContent.length} pages read):\n`;
            for (const p of pageContent) {
                userContent += `--- ${p.title || p.url} (${p.wordCount} words) ---\n`;
                userContent += `URL: ${p.url}\n`;
                userContent += `${p.text}\n\n`;
            }
        }

        userContent += `=== END RESEARCH DATA ===\n\n`;
        userContent += `CRITICAL: ONLY use URLs, titles, facts and quotes from the RESEARCH DATA above. Do NOT invent URLs (no example.com). Do NOT use placeholder text like "..." or "Title or Snippet". Every URL, statistic, and fact in your dashboard MUST come from the data above. If data is missing, write "No data available" instead of making something up.`;

        const resp = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_THINKING,  // Use thinking model for reasoning + anti-hallucination
                messages: [
                    { role: "system", content: prompt },
                    { role: "user", content: userContent },
                ],
                temperature: 0.2,
                max_tokens: 4000,
                response_format: { type: "json_object" },
            }),
        });

        if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}`);

        const result = await resp.json();
        await logTokenUsage("research:dashboard", MODEL_THINKING, result.usage ?? {});

        const content = result.choices?.[0]?.message?.content || "";
        const parsed = safeParseJSON(content);

        if (!parsed) throw new Error("Invalid JSON from LLM");

        // Validate with Zod schema (Guardrail: strict block types)
        const validated = GenUIResponseSchema.safeParse(parsed);
        if (validated.success) {
            log.debug(`  🔬 [Research] Dashboard: ${validated.data.blocks.length} blocks generated`);
            return validated.data.blocks;
        }

        // If validation fails, try using raw blocks anyway
        log.warn(`  🔬 [Research] Dashboard validation warning: ${validated.error.message}`);
        if (parsed.blocks && Array.isArray(parsed.blocks)) {
            return parsed.blocks;
        }

        throw new Error("No valid blocks in response");
    } catch (err) {
        log.error(`  🔬 [Research] Dashboard generation error: ${(err as Error).message}`);
        return buildErrorFallbackBlocks(`Dashboard generation failed: ${(err as Error).message}`).blocks;
    }
}
