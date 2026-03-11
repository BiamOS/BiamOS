// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Context Engine (Phase 1: Context-Augmented Browsing)
// ============================================================
// Receives page context (URL, title, text snippet) from the
// frontend webview and maps it to relevant API queries using
// the LLM + available endpoint metadata.
// ============================================================

import { db } from "../db/db.js";
import { capsules } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { getChatUrl, getHeaders } from "../services/llm-provider.js";
import { MODEL_THINKING } from "../config/models.js";
import { logTokenUsage } from "../server-utils.js";
import { log } from "../utils/logger.js";
import { safeParseJSON } from "../utils/safe-json.js";

// ─── Types ──────────────────────────────────────────────────

export interface PageContext {
    url: string;
    title: string;
    text_snippet: string;
}

export interface ContextSuggestion {
    query: string;
    reason: string;
}

export interface ContextResult {
    suggestions: ContextSuggestion[];
    confidence: number;
}

// ─── Rate Limiting ──────────────────────────────────────────

const recentAnalyses = new Map<string, number>(); // url-path → last timestamp
const COOLDOWN_MS = 30_000; // 30s per URL path

function getUrlKey(url: string): string {
    try {
        const u = new URL(url);
        return u.hostname.replace("www.", "") + u.pathname;
    } catch {
        return url;
    }
}

function isRateLimited(url: string): boolean {
    const key = getUrlKey(url);
    const last = recentAnalyses.get(key);
    if (last && Date.now() - last < COOLDOWN_MS) return true;
    recentAnalyses.set(key, Date.now());
    return false;
}

// ─── Knowledge Integration Exclusion ────────────────────────
// These integration groups provide "same-type" information that
// the user is likely already reading. Context suggestions should
// offer COMPLEMENTARY data (weather, currency, stocks), not more
// of what's already on the screen.

const CONTEXT_EXCLUDED_GROUPS = new Set([
    "wikipedia", "wiki", "dictionary", "encyclopedia",
    "wiktionary", "wikimedia", "britannica",
]);

// ─── Main Analysis Function ─────────────────────────────────

export async function analyzePageContext(ctx: PageContext, force = false): Promise<ContextResult> {
    // Rate-limit check (bypass for manual triggers)
    if (!force && isRateLimited(ctx.url)) {
        log.debug(`  🧠 Context Engine: rate-limited for ${getUrlKey(ctx.url)}`);
        return { suggestions: [], confidence: 0 };
    }
    if (force) log.debug(`  🧠 Context Engine: FORCED analysis for ${getUrlKey(ctx.url)}`);

    // Load available capabilities from DB
    // Use is_active which is guaranteed to exist (core column)
    let endpoints: any[];
    try {
        endpoints = await db
            .select({
                name: capsules.name,
                group_name: capsules.group_name,
                supported_intents: capsules.supported_intents,
                endpoint_tags: capsules.endpoint_tags,
                human_triggers: capsules.human_triggers,
                sidebar_label: capsules.sidebar_label,
            })
            .from(capsules)
            .where(sql`is_active = 1`);
    } catch (err) {
        log.error("  💥 Context Engine: DB query failed:", err);
        return { suggestions: [], confidence: 0 };
    }

    log.debug(`  🧠 Context Engine: ${endpoints.length} active endpoints found`);

    if (endpoints.length === 0) {
        log.debug("  🧠 Context Engine: no active integrations — skipping");
        return { suggestions: [], confidence: 0 };
    }

    // Build capability summary for the LLM
    const groupMap = new Map<string, string[]>();
    for (const ep of endpoints) {
        const group = ep.group_name || ep.name;
        // Skip knowledge/reference integrations — they duplicate what's on screen
        if (CONTEXT_EXCLUDED_GROUPS.has(group.toLowerCase())) continue;
        if (!groupMap.has(group)) groupMap.set(group, []);
        const tags = [
            ep.sidebar_label,
            ep.endpoint_tags,
            ep.human_triggers?.split("|").slice(0, 3).join(", "),
        ].filter(Boolean).join(", ");
        if (tags) groupMap.get(group)!.push(tags);
    }

    const capabilities = Array.from(groupMap.entries())
        .map(([group, tags]) => `- ${group}: ${[...new Set(tags)].join(", ")}`)
        .join("\n");

    // Build LLM prompt
    const systemPrompt = `You are a context analyzer for BiamOS, an intelligent dashboard.
The user is browsing a website. Based on the page content, extract ENTITIES
(people, cities, currencies, companies, topics) and suggest relevant queries
from the available data sources.

AVAILABLE DATA SOURCES:
${capabilities}

RULES:
1. Return ONLY queries that match available data sources above
2. Maximum 2 suggestions — pick the MOST relevant
3. Each query must be short and specific (e.g. "weather Tokyo", "EUR to JPY")
4. Do NOT suggest queries about the website itself or topics already fully covered on the current page. For example, if the user is reading a Wikipedia article about "Kurzgesagt", do NOT suggest "wikipedia Kurzgesagt" — that information is already on screen
5. Only suggest when you find CLEAR entities on the page (names, places, currencies)
6. If the page has little content or no clear entities, return empty suggestions
7. For EACH suggestion, explain WHY it's relevant in 1 short sentence
8. confidence must be 0.7+ only if entities are clearly present on the page
9. Set confidence to 0.0 if you're guessing or the page has minimal content
10. PRIORITIZE: "Page Title" (document.title) is the MOST reliable content signal — it always reflects the current page, even after SPA navigation. The "MAIN CONTENT" meta tags may be STALE on single-page apps (YouTube, Twitter, etc.) and not yet updated after navigation
11. IGNORE: Advertisements, sponsored content, cookie notices, navigation menus, sidebar recommendations, video recommendation lists. These are NOT part of the main content
12. If the page is a video, use the Page Title and og:description to understand the topic — ignore ad overlays
13. HOMEPAGES: Return confidence 0.0 ONLY if the page is clearly a ROOT homepage with NO specific content. Check the URL path: if the URL has a specific path like /watch, /wiki/, /article/, /post/, /status/, /p/ etc., it is NOT a homepage — it has specific content to analyze. Only URLs ending in / or /home or /feed with generic titles like "YouTube", "Google", "Reddit" are homepages
14. NEVER suggest a query that returns the SAME TYPE of information the user is already reading. If the user reads an article about a person, do NOT suggest searching for that person's biography. Instead suggest COMPLEMENTARY data: weather for their birthplace, stock price of their company, currency exchange for their country

Respond ONLY with JSON:
{
    "suggestions": [
        { "query": "weather Pretoria", "reason": "Elon Musk was born in Pretoria, South Africa" },
        { "query": "EUR to ZAR", "reason": "Article mentions South African economy" }
    ],
    "confidence": 0.85
}

If there are no relevant suggestions, respond with:
{ "suggestions": [], "confidence": 0.0 }`;

    // Separate structured metadata from body text so LLM knows priority
    const snippet = ctx.text_snippet.substring(0, 1500);
    const userMessage = `Page URL: ${ctx.url}
Page Title: ${ctx.title}
--- MAIN CONTENT (from meta tags — most reliable) ---
${snippet.split('\n').filter(l => l.startsWith('Title:') || l.startsWith('Description:') || l.startsWith('Meta:') || l.startsWith('Author:') || l.startsWith('Tags:') || l.startsWith('Keywords:')).join('\n') || '(none)'}
--- BODY TEXT (may contain ads — use with caution) ---
${snippet.split('\n').filter(l => !l.startsWith('Title:') && !l.startsWith('Description:') && !l.startsWith('Meta:') && !l.startsWith('Author:') && !l.startsWith('Tags:') && !l.startsWith('Keywords:')).join('\n').substring(0, 800)}`;


    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("context-engine");

        const response = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_THINKING,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage },
                ],
                temperature: 0,
                max_tokens: 300,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            log.error(`  ❌ Context Engine LLM error: ${response.status}`);
            return { suggestions: [], confidence: 0 };
        }

        const result = await response.json();
        const usage = result.usage ?? {};
        await logTokenUsage("agent:context-engine", MODEL_THINKING, usage);

        // Parse LLM response
        const content = result.choices?.[0]?.message?.content || "";
        log.debug(`  🧠 Context Engine raw LLM: ${content.substring(0, 300)}`);
        const parsed = safeParseJSON(content);

        if (!parsed) {
            log.warn(`  ⚠️ Context Engine: could not parse LLM response`);
            return { suggestions: [], confidence: 0 };
        }

        const confidence = typeof parsed.confidence === "number"
            ? Math.min(1, Math.max(0, parsed.confidence))
            : 0;

        // Confidence gate: reject low-confidence guesses
        // Lowered thresholds to be more generous with suggestions
        const minConfidence = force ? 0.2 : 0.4;
        if (confidence < minConfidence) {
            log.debug(`  🧠 Context Engine: confidence ${confidence} < ${minConfidence} — skipping`);
            return { suggestions: [], confidence };
        }

        // Parse suggestions (new format with reason)
        let suggestions: ContextSuggestion[] = [];
        if (Array.isArray(parsed.suggestions)) {
            suggestions = parsed.suggestions
                .filter((s: any) => s && typeof s.query === "string" && s.query.trim().length > 0)
                .slice(0, 2)
                .map((s: any) => ({
                    query: s.query.trim(),
                    reason: typeof s.reason === "string" ? s.reason.trim() : "",
                }));
        } else if (Array.isArray(parsed.queries)) {
            // Backwards compat: old format without reasons
            suggestions = parsed.queries
                .filter((q: unknown) => typeof q === "string" && (q as string).trim().length > 0)
                .slice(0, 2)
                .map((q: string) => ({ query: q.trim(), reason: "" }));
        }

        log.debug(`  🧠 Context Engine: ${suggestions.length} suggestions — [${suggestions.map(s => s.query).join(", ")}] (confidence: ${confidence})`);
        return { suggestions, confidence };
    } catch (err) {
        log.error("  💥 Context Engine error:", err);
        return { suggestions: [], confidence: 0 };
    }
}


