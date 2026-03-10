// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Health Routes
// ============================================================
// Health check execution and history for integrations.
// Path: /api/integrations/health
// ============================================================

import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/db.js";
import { capsules, healthChecks } from "../db/schema.js";
import {
    checkAllHealth,
    checkIntegrationHealth,
} from "../services/health-checker.js";
import { log } from "../utils/logger.js";

const integrationHealthRoutes = new Hono();

// ─── GET /health — Health status of all integrations ────────

integrationHealthRoutes.get("/", async (c) => {
    try {
        const results = await checkAllHealth();
        return c.json({
            biam_protocol: "2.0",
            action: "health_check",
            results,
        });
    } catch (err) {
        log.error("💥 Health check error:", err);
        return c.json({
            biam_protocol: "2.0", action: "error",
            message: err instanceof Error ? err.message : "Health check failed",
        }, 500);
    }
});

// ─── GET /history — Last N checks per integration ───────────

integrationHealthRoutes.get("/history", async (c) => {
    try {
        const rows = await db.select().from(healthChecks).orderBy(desc(healthChecks.checked_at)).limit(200);

        const grouped: Record<string, typeof rows> = {};
        for (const row of rows) {
            const key = row.group_name || `id-${row.integration_id}`;
            if (!grouped[key]) grouped[key] = [];
            if (grouped[key].length < 10) grouped[key].push(row);
        }

        return c.json({
            biam_protocol: "2.0",
            action: "health_history",
            history: grouped,
        });
    } catch (err) {
        log.error("💥 Health history error:", err);
        return c.json({
            biam_protocol: "2.0", action: "error",
            message: err instanceof Error ? err.message : "History fetch failed",
        }, 500);
    }
});

// ─── POST /:id — Check single integration health ────────────

integrationHealthRoutes.post("/:id", async (c) => {
    try {
        const id = Number(c.req.param("id"));
        const [integration] = await db.select({
            id: capsules.id,
            name: capsules.name,
            group_name: capsules.group_name,
            api_endpoint: capsules.api_endpoint,
            integration_type: capsules.integration_type,
            status: capsules.status,
        }).from(capsules).where(eq(capsules.id, id));

        if (!integration) {
            return c.json({ biam_protocol: "2.0", action: "error", message: "Integration not found" }, 404);
        }

        const result = await checkIntegrationHealth(integration);
        return c.json({
            biam_protocol: "2.0",
            action: "health_check_single",
            result,
        });
    } catch (err) {
        log.error("💥 Single health check error:", err);
        return c.json({
            biam_protocol: "2.0", action: "error",
            message: err instanceof Error ? err.message : "Health check failed",
        }, 500);
    }
});

export { integrationHealthRoutes };
