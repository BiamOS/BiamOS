// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Chat Route (/api/chat)
// ============================================================
// Handles direct conversational queries as Lura.
// No browser, no research — just an immediate LLM response
// with Lura's soul/identity injected as system prompt.
// ============================================================

import { Hono } from "hono";
import { getChatUrl, getHeaders } from "../services/llm-provider.js";
import { MODEL_FAST } from "../config/models.js";
import { logTokenUsage } from "../server-utils.js";
import { log } from "../utils/logger.js";
import { getConciergeContext } from "../services/integration-context.js";

export const chatRoutes = new Hono();

chatRoutes.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.query) {
        return c.json({ error: "Missing 'query' field" }, 400);
    }

    const query = String(body.query).trim();
    const history: { role: 'user' | 'assistant'; content: string }[] =
        Array.isArray(body.history) ? body.history.slice(-10) : [];

    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("chat");

        // Build system prompt: soul + base + live integration awareness
        const { soulModule } = await import("../prompt-modules/soul.js");
        const { baseModule } = await import("../prompt-modules/base.js");
        const integrationContext = await getConciergeContext().catch(() => "");
        const integrationSection = integrationContext
            ? `\n\n## INSTALLED INTEGRATIONS\nYou have access to these live API integrations that users can trigger via research queries:\n${integrationContext}`
            : "";
        const systemPrompt = [soulModule.rules, baseModule.rules].join("\n\n") + integrationSection;

        const resp = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_FAST,
                messages: [
                    { role: "system", content: systemPrompt }, // 1. Identität
                    ...history,                                  // 2. Kurzzeitgedächtnis (last 10 turns)
                    { role: "user", content: query },           // 3. Aktuelle Frage
                ],
                temperature: 0.7,
                max_tokens: 600,
            }),
        });

        if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}`);

        const result = await resp.json();
        await logTokenUsage("chat", MODEL_FAST, result.usage ?? {});

        const answer = result.choices?.[0]?.message?.content?.trim() || "...";
        log.info(`  💬 [Chat] "${query.substring(0, 40)}..." → ${answer.substring(0, 60)}...`);

        return c.json({ answer });
    } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("401")) {
            return c.json({ action: "no_api_key", error: msg }, 401);
        }
        log.warn(`  💬 [Chat] Error: ${msg}`);
        return c.json({ error: msg }, 500);
    }
});
