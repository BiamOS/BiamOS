// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Import/Export Routes
// ============================================================
// Export integrations as .biam packages, import from packages.
// Path: /api/integrations/:id/export, /api/integrations/import
// ============================================================

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db/db.js";
import { capsules } from "../db/schema.js";
import { importBiamSchema } from "../validators/schemas.js";
import { invalidateConciergeCache } from "../agents/intent/0-concierge.js";
import { clearRoutingCache } from "../services/routing-cache.js";
import { safeParseJSON } from "./integration-crud-routes.js";
import { log } from "../utils/logger.js";

const importExportRoutes = new Hono();

// ─── GET /:id/export — Export as .biam ──────────────────────

importExportRoutes.get("/:id/export", async (c) => {
    try {
        const id = Number(c.req.param("id"));
        const [integration] = await db.select().from(capsules).where(eq(capsules.id, id));

        if (!integration) {
            return c.json({ biam_protocol: "2.0", action: "error", message: "Integration nicht gefunden" }, 404);
        }

        const biamPackage = {
            lura_format: "1.0",
            exported_at: new Date().toISOString(),
            integration: {
                name: integration.name,
                intent_description: integration.intent_description,
                api_endpoint: integration.api_endpoint,
                is_auto_generated: integration.is_auto_generated,
                api_config: safeParseJSON(integration.api_config),
            },
        };

        return c.json(biamPackage);
    } catch (err) {
        log.error("💥 Export error:", err);
        return c.json({ biam_protocol: "2.0", action: "error", message: "Export failed" }, 500);
    }
});

// ─── POST /import — Import .biam package ────────────────────

importExportRoutes.post("/import",
    zValidator("json", importBiamSchema),
    async (c) => {
        try {
            const biamPackage = c.req.valid("json");

            if (!biamPackage.integration?.name) {
                return c.json({ biam_protocol: "2.0", action: "error", message: "Invalid .biam format" }, 400);
            }

            await db.insert(capsules).values({
                name: biamPackage.integration.name,
                intent_description: biamPackage.integration.intent_description,
                api_endpoint: biamPackage.integration.api_endpoint,
                api_config: biamPackage.integration.api_config ? JSON.stringify(biamPackage.integration.api_config) : null,
            });

            invalidateConciergeCache();
            clearRoutingCache();

            return c.json({
                biam_protocol: "2.0",
                action: "integration_imported",
                integration_name: biamPackage.integration.name,
                message: `Integration "${biamPackage.integration.name}" imported successfully.`,
            }, 201);
        } catch (err) {
            log.error("💥 Import error:", err);
            return c.json({
                biam_protocol: "2.0", action: "error",
                message: err instanceof Error ? err.message : "Import failed",
            }, 500);
        }
    });

export { importExportRoutes };
