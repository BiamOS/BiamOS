// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Context Routes
// ============================================================
// POST /api/context/analyze — Entity extraction + smart suggestions
// POST /api/context/ask    — Page Q&A via Context Chat Agent
// ============================================================

import { Hono } from "hono";
import { stream } from "hono/streaming";
import { analyzePageContext } from "../services/context-engine.js";
import { answerPageQuestion, streamPageQuestion } from "../services/context-chat.js";
import { ingestKnowledge } from "../services/domain-knowledge.service.js";
import { extractDomain } from "../services/agent-memory.js";

export const contextRoutes = new Hono();

// ─── POST /analyze ──────────────────────────────────────────

contextRoutes.post("/analyze", async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body !== "object") {
        return c.json(
            { error: "Invalid request body", suggestions: [], confidence: 0 },
            400
        );
    }

    const { url, title, text_snippet, force } = body as {
        url?: string;
        title?: string;
        text_snippet?: string;
        force?: boolean;
    };

    if (!url || typeof url !== "string" || url.trim().length === 0) {
        return c.json(
            { error: "Missing or invalid 'url' field", suggestions: [], confidence: 0 },
            400
        );
    }

    const result = await analyzePageContext({
        url: url.trim(),
        title: typeof title === "string" ? title.trim() : "",
        text_snippet: typeof text_snippet === "string" ? text_snippet : "",
    }, force === true);

    return c.json(result);
});

// ─── POST /ask — Context Chat Agent ─────────────────────────

contextRoutes.post("/ask", async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body !== "object") {
        return c.json({ error: "Invalid request body", answer: "", source: "general" }, 400);
    }

    const { question, page_url, page_title, page_text, history, page_screenshot } = body as {
        question?: string;
        page_url?: string;
        page_title?: string;
        page_text?: string;
        history?: { role: "user" | "assistant"; content: string }[];
        page_screenshot?: string;
    };

    if (!question || typeof question !== "string" || question.trim().length === 0) {
        return c.json({ error: "Missing 'question' field", answer: "", source: "general" }, 400);
    }

    const result = await answerPageQuestion({
        question: question.trim(),
        page_url: typeof page_url === "string" ? page_url.trim() : "",
        page_title: typeof page_title === "string" ? page_title.trim() : "",
        page_text: typeof page_text === "string" ? page_text : "",
        history: Array.isArray(history) ? history : undefined,
        page_screenshot: typeof page_screenshot === "string" ? page_screenshot : undefined,
    });

    return c.json(result);
});

// ─── POST /ask/stream — Streaming Context Chat ──────────────

contextRoutes.post("/ask/stream", async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body !== "object") {
        return c.json({ error: "Invalid request body" }, 400);
    }

    const { question, page_url, page_title, page_text, history, page_screenshot } = body as {
        question?: string;
        page_url?: string;
        page_title?: string;
        page_text?: string;
        history?: { role: "user" | "assistant"; content: string }[];
        page_screenshot?: string;
    };

    if (!question || typeof question !== "string" || question.trim().length === 0) {
        return c.json({ error: "Missing 'question' field" }, 400);
    }

    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    return stream(c, async (s) => {
        await streamPageQuestion(
            {
                question: question.trim(),
                page_url: typeof page_url === "string" ? page_url.trim() : "",
                page_title: typeof page_title === "string" ? page_title.trim() : "",
                page_text: typeof page_text === "string" ? page_text : "",
                history: Array.isArray(history) ? history : undefined,
                page_screenshot: typeof page_screenshot === "string" ? page_screenshot : undefined,
            },
            (event: string) => {
                s.write(event);
            },
        );
    });
});

// ─── POST /teach — Domain Brain Knowledge Ingestion ──────────
// User-facing "teach" endpoint. Called from the sidebar /teach
// slash command. Parses the text, infers type from keywords,
// and ingests into the Domain Brain under the current domain.
//
// Body: { text, page_url, type? }
// Returns: { domain, type, accepted }

contextRoutes.post("/teach", async (c) => {
    try {
        const body = await c.req.json().catch(() => null);
        if (!body || !body.text || !body.page_url) {
            return c.json({ error: "Missing required fields: text, page_url" }, 400);
        }

        const rawText: string = String(body.text).trim();
        const pageUrl: string = String(body.page_url).trim();

        // Strip /teach prefix if the frontend passes it through
        const content = rawText.replace(/^\/(teach|lern|remember|merke?)\s*/i, "").trim();

        if (!content) {
            return c.json({ error: "Knowledge content cannot be empty" }, 400);
        }

        const domain = extractDomain(pageUrl);
        if (!domain || domain === "unknown") {
            return c.json({ error: "Cannot extract domain from page_url" }, 400);
        }

        // ── Auto-detect type from content keywords ─────────────
        // Explicit type override from client always wins.
        let type: "user_instruction" | "selector_rule" | "api_doc" = "user_instruction";

        if (body.type && ["user_instruction", "selector_rule", "api_doc"].includes(body.type)) {
            type = body.type;
        } else {
            // Heuristic: selector/keyboard/DOM hints → selector_rule
            const selectorKeywords = /\b(css|xpath|selector|ctrl\+|cmd\+|alt\+|shortcut|keyboard|hotkey|class|id|button|div|span|#[a-z]|\.[a-z]|data-|aria-)\b/i;
            if (selectorKeywords.test(content)) {
                type = "selector_rule";
            }
        }

        const id = await ingestKnowledge({
            domain,
            type,
            content,
            source: "user",
        });

        return c.json({
            data: {
                id,
                domain,
                type,
                accepted: id !== null,
                message: `✅ Gespeichert für ${domain} (${type})`,
            },
        }, 201);
    } catch (err) {
        return c.json({ error: "Failed to ingest knowledge" }, 500);
    }
});
