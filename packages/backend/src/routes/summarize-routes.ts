// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Summarize Routes (LLM Content Summarization)
// ============================================================
// 2-stage extraction:
//   Stage 1: Raw DOM text received from Electron IPC (already extracted)
//   Stage 2: LLM summarizes/structures the text into a render-ready layout
// Renamed from scrape-routes.ts for clarity.
// ============================================================

import { Hono } from "hono";
import { getChatUrl, getHeaders } from "../services/llm-provider.js";
import { MODEL_FAST } from "../config/models.js";
import { logTokenUsage } from "../server-utils.js";
import { safeParseJSON } from "../utils/safe-json.js";
import { log } from "../utils/logger.js";
import { buildBlockCatalogPrompt } from "../prompts/block-catalog.js";

export const summarizeRoutes = new Hono();

// ─── POST /api/scrape ───────────────────────────────────────

summarizeRoutes.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body !== "object") {
        return c.json({ error: "Invalid request body" }, 400);
    }

    const { url, raw_text, instruction } = body as {
        url?: string;
        raw_text?: string;
        instruction?: string;
    };

    if (!url || typeof url !== "string" || url.trim().length === 0) {
        return c.json({ error: "Missing or invalid 'url' field" }, 400);
    }

    if (!raw_text || typeof raw_text !== "string" || raw_text.trim().length === 0) {
        return c.json({ error: "Missing or invalid 'raw_text' field" }, 400);
    }

    // Stage 2: LLM summarization
    const result = await summarizeScrapedContent(
        url.trim(),
        raw_text.trim(),
        typeof instruction === "string" ? instruction.trim() : undefined
    );

    return c.json(result);
});

// ─── LLM Summarization (Stage 2) ───────────────────────────

interface ScrapeResult {
    summary: string;
    key_points: string[];
    layout: {
        blocks: Array<{
            type: string;
            [key: string]: unknown;
        }>;
    };
}

async function summarizeScrapedContent(
    url: string,
    rawText: string,
    instruction?: string
): Promise<ScrapeResult> {
    // Use only summary-appropriate block types from the catalog
    const summaryBlocks = ["hero", "text", "list", "key_value", "callout", "table"];
    const catalog = buildBlockCatalogPrompt(summaryBlocks, "DATA");

    const systemPrompt = `You are a web content analyzer for BiamOS, an intelligent dashboard.
The user has scraped a webpage using their authenticated session (Ghost-Auth).
Analyze the raw DOM text and create a structured summary.

${instruction ? `USER INSTRUCTION: "${instruction}"` : "Summarize the key information on this page."}

AVAILABLE BLOCKS:
${catalog}

RULES:
1. Extract the most important information from the raw text
2. Ignore navigation menus, footers, cookie notices, and boilerplate
3. Focus on the main content the user would care about
4. Return a JSON object with this exact structure:
{
    "summary": "2-3 sentence summary of the page",
    "key_points": ["point 1", "point 2", ...],
    "layout": {
        "blocks": [
            { "type": "hero", "props": { "title": "Page Title", "subtitle": "Brief description" } },
            { "type": "text", "content": "Main content summary..." },
            { "type": "list", "items": [{ "label": "Key item", "value": "Detail" }] }
        ]
    }
}
5. Maximum 5 blocks in the layout
6. Keep it concise — dashboard cards, not full articles`;

    const userMessage = `URL: ${url}\n\nRaw page content (first 5000 chars):\n${rawText.substring(0, 5000)}`;

    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("scrape-summarizer");

        const response = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_FAST,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage },
                ],
                temperature: 0,
                max_tokens: 1000,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            log.error(`  ❌ Scrape LLM error: ${response.status}`);
            return fallbackResult(url, rawText);
        }

        const result = await response.json();
        const usage = result.usage ?? {};
        await logTokenUsage("agent:scrape-summarizer", MODEL_FAST, usage);

        const content = result.choices?.[0]?.message?.content || "";
        const parsed = safeParseJSON(content);

        if (!parsed || !parsed.summary) {
            return fallbackResult(url, rawText);
        }

        return {
            summary: parsed.summary || "",
            key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
            layout: parsed.layout || fallbackLayout(url, rawText),
        };
    } catch (err) {
        log.error("  💥 Scrape summarization error:", err);
        return fallbackResult(url, rawText);
    }
}

// ─── Helpers ────────────────────────────────────────────────

function fallbackResult(url: string, rawText: string): ScrapeResult {
    return {
        summary: `Scraped content from ${url}`,
        key_points: [],
        layout: fallbackLayout(url, rawText),
    };
}

function fallbackLayout(url: string, rawText: string) {
    let hostname = "";
    try { hostname = new URL(url).hostname; } catch { hostname = url; }
    return {
        blocks: [
            {
                type: "hero",
                props: {
                    title: `👻 Scraped: ${hostname}`,
                    subtitle: "Content extracted using Ghost-Auth",
                },
            },
            {
                type: "text",
                content: rawText.substring(0, 800),
            },
        ],
    };
}

