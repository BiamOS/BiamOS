// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Research Routes (SSE Streaming)
// ============================================================
// POST /api/research — Streams research progress via SSE,
// then delivers validated GenUI dashboard blocks.
// ============================================================

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { runResearch } from "../services/research-engine.js";
import { log } from "../utils/logger.js";

export const researchRoutes = new Hono();

// ─── POST /api/research ─────────────────────────────────────

researchRoutes.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || !body.query) {
        return c.json({ error: "Missing 'query' field" }, 400);
    }

    const query = String(body.query).trim();
    if (query.length === 0 || query.length > 500) {
        return c.json({ error: "Query must be 1-500 characters" }, 400);
    }

    log.info(`  🔬 [Research] Starting: "${query.substring(0, 60)}..."`);

    return streamSSE(c, async (stream) => {
        let eventId = 0;

        const result = await runResearch(query, (step) => {
            const id = String(++eventId);
            const event = step.phase === "done" ? "done" : step.phase === "error" ? "error" : "step";
            const data = JSON.stringify(step);

            // streamSSE writeSSE expects { event, data, id }
            stream.writeSSE({ event, data, id }).catch(() => {
                // Client disconnected — non-fatal
            });
        });

        // Send final dashboard blocks as a separate event
        await stream.writeSSE({
            event: "dashboard",
            data: JSON.stringify({ blocks: result.blocks, sources: result.sources }),
            id: String(++eventId),
        });

        log.info(`  🔬 [Research] Complete: "${query.substring(0, 40)}..." → ${result.blocks.length} blocks in ${result.totalSteps} steps`);
    });
});
