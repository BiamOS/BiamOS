// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Page Fetcher
// ============================================================
// Extracts readable text from URLs for the Research Engine.
// Strategy: HTTP GET + HTML strip → Jina Reader fallback.
// All failures are non-fatal (graceful degradation).
// ============================================================

import { log } from "../utils/logger.js";

// ─── Types ──────────────────────────────────────────────────

export interface FetchedPage {
    url: string;
    title: string;
    text: string;
    wordCount: number;
    source: "http" | "jina" | "failed";
}

// ─── Config ─────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 8_000;
const MAX_TEXT_LENGTH = 15_000; // chars — MODEL_THINKING has massive context window
const JINA_BASE = "https://r.jina.ai/";

// ─── Public API ─────────────────────────────────────────────

/**
 * Fetch and extract readable text from a URL.
 * 1. Try HTTP GET + HTML strip (fastest, ~200ms)
 * 2. Fallback to Jina Reader (handles SPAs, ~1-2s)
 * 3. If both fail → return empty result (non-fatal)
 */
export async function fetchPage(url: string): Promise<FetchedPage> {
    // Strategy 1: Direct HTTP GET
    try {
        const result = await fetchDirect(url);
        if (result.wordCount >= 50) {
            log.debug(`  📄 [Fetch] Direct OK: ${url} (${result.wordCount} words)`);
            return result;
        }
        log.debug(`  📄 [Fetch] Direct too short (${result.wordCount}w), trying Jina...`);
    } catch (err) {
        log.debug(`  📄 [Fetch] Direct failed for ${url}: ${(err as Error).message}`);
    }

    // Strategy 2: Jina Reader fallback
    try {
        const result = await fetchViaJina(url);
        if (result.wordCount >= 20) {
            log.debug(`  📄 [Fetch] Jina OK: ${url} (${result.wordCount} words)`);
            return result;
        }
    } catch (err) {
        log.debug(`  📄 [Fetch] Jina failed for ${url}: ${(err as Error).message}`);
    }

    // Both failed — graceful degradation
    log.warn(`  📄 [Fetch] All strategies failed for ${url}`);
    return { url, title: "", text: "", wordCount: 0, source: "failed" };
}

/**
 * Fetch multiple URLs in parallel. Non-fatal: failed URLs return empty.
 */
export async function fetchPages(urls: string[]): Promise<FetchedPage[]> {
    return Promise.all(urls.map(fetchPage));
}

// ─── Strategy 1: Direct HTTP GET ────────────────────────────

async function fetchDirect(url: string): Promise<FetchedPage> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const resp = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml",
            },
            redirect: "follow",
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const html = await resp.text();
        const title = extractTitle(html);
        const text = stripHtml(html);
        const trimmed = text.substring(0, MAX_TEXT_LENGTH);

        return {
            url,
            title,
            text: trimmed,
            wordCount: countWords(trimmed),
            source: "http",
        };
    } finally {
        clearTimeout(timeout);
    }
}

// ─── Strategy 2: Jina Reader ────────────────────────────────

async function fetchViaJina(url: string): Promise<FetchedPage> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const jinaUrl = JINA_BASE + encodeURIComponent(url);
        const resp = await fetch(jinaUrl, {
            signal: controller.signal,
            headers: {
                Accept: "text/plain",
                // Jina returns markdown by default, text/plain is cleaner
            },
        });

        // Handle rate limiting (Guardrail #3)
        if (resp.status === 429) {
            throw new Error("Jina 429 rate limit");
        }
        if (!resp.ok) throw new Error(`Jina HTTP ${resp.status}`);

        const text = await resp.text();
        const trimmed = text.substring(0, MAX_TEXT_LENGTH);

        // Extract title from first markdown heading if present
        const titleMatch = trimmed.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : "";

        return {
            url,
            title,
            text: trimmed,
            wordCount: countWords(trimmed),
            source: "jina",
        };
    } finally {
        clearTimeout(timeout);
    }
}

// ─── HTML Processing ────────────────────────────────────────

/**
 * Extract <title> from HTML.
 */
function extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return match ? match[1].trim() : "";
}

/**
 * Strip HTML to clean readable text.
 * Removes scripts, styles, nav, footer, ads, and all tags.
 */
function stripHtml(html: string): string {
    let text = html;

    // Remove script, style, nav, footer, header, aside blocks entirely
    text = text.replace(/<(script|style|nav|footer|header|aside|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ");

    // Remove all HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, " ");

    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, " ");

    // Decode common HTML entities
    text = text
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
        .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    // Collapse whitespace
    text = text.replace(/\s+/g, " ").trim();

    return text;
}

/**
 * Count words in text.
 */
function countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
}
