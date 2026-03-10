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
