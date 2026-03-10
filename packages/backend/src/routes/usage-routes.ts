// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Usage Routes
// ============================================================
// Token usage statistics and token reset.
// ============================================================

import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { sum } from "drizzle-orm";
import { db } from "../db/db.js";
import { usageLogs } from "../db/schema.js";
import { getApiKey } from "../server-utils.js";
import { log } from "../utils/logger.js";

const usageRoutes = new Hono();

// ─── GET /stats — Token Usage + System Info ─────────────────

usageRoutes.get("/stats", async (c) => {
    try {
        const totals = await db
            .select({
                total_prompt: sum(usageLogs.prompt_tokens),
                total_completion: sum(usageLogs.completion_tokens),
            })
            .from(usageLogs);

        const totalPrompt = Number(totals[0]?.total_prompt ?? 0);
        const totalCompletion = Number(totals[0]?.total_completion ?? 0);

        const countResult = await db.select().from(usageLogs);
        const callCount = countResult.length;

        const apiKey = await getApiKey();
        const masked = apiKey.length > 12
            ? apiKey.slice(0, 8) + "•".repeat(apiKey.length - 12) + apiKey.slice(-4)
            : "•".repeat(apiKey.length);

        return c.json({
            biam_protocol: "2.0",
            action: "system_stats",
            stats: {
                total_prompt_tokens: totalPrompt,
                total_completion_tokens: totalCompletion,
                total_tokens: totalPrompt + totalCompletion,
                api_calls: callCount,
                masked_api_key: masked,
            },
        });
    } catch (err) {
        log.error("💥 Stats error:", err);
        return c.json({ error: "Stats konnten nicht geladen werden" }, 500);
    }
});

// ─── DELETE /tokens — Reset token usage stats ───────────────

usageRoutes.delete("/tokens", async (c) => {
    try {
        await db.run(sql`DELETE FROM usage_logs`);
        await db.run(sql`UPDATE agents SET total_calls = 0, total_tokens_used = 0`);

        return c.json({
            ok: true,
            message: "Token usage reset",
        });
    } catch (err) {
        log.error("💥 Token reset error:", err);
        return c.json({ error: "Failed to reset tokens" }, 500);
    }
});

export { usageRoutes };
