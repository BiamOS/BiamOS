// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration CRUD Routes
// ============================================================
// Core CRUD: list, create, update, delete integrations.
// Path: /api/integrations
// ============================================================

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db/db.js";
import { capsules } from "../db/schema.js";
import { patchIntegrationSchema, createIntegrationSchema } from "../validators/schemas.js";
import { invalidateConciergeCache } from "../agents/intent/0-concierge.js";
import { clearRoutingCache } from "../services/routing-cache.js";
import { log } from "../utils/logger.js";
import { safeParseDBJSON } from "../utils/safe-json.js";

const integrationCrudRoutes = new Hono();

// ─── Helpers ────────────────────────────────────────────────

/** @deprecated Use safeParseDBJSON from utils/safe-json.js directly */
export function safeParseJSON(raw: string | null): any {
    return safeParseDBJSON(raw);
}

// ─── GET / — List all ───────────────────────────────────────

integrationCrudRoutes.get("/", async (c) => {
    try {
        const allIntegrations = await db.select().from(capsules);
        return c.json({
            biam_protocol: "2.0",
            action: "list_integrations",
            integrations: allIntegrations.map((cap) => ({
                id: cap.id,
                name: cap.name,
                intent_description: cap.intent_description,
                api_endpoint: cap.api_endpoint,
                is_auto_generated: cap.is_auto_generated,
                has_embedding: cap.embedding !== null,
                api_config: safeParseJSON(cap.api_config),
                group_name: cap.group_name ?? null,
                is_active: cap.is_active ?? true,
                status: cap.status ?? "live",
                sidebar_icon: cap.sidebar_icon ?? null,
                sidebar_label: cap.sidebar_label ?? null,
                human_triggers: cap.human_triggers ?? null,
                http_method: cap.http_method ?? "GET",
                health_status: cap.health_status ?? "unchecked",
                health_message: cap.health_message ?? null,
                health_checked_at: cap.health_checked_at ?? null,
                allowed_blocks: safeParseJSON(cap.allowed_blocks),
                integration_type: cap.integration_type ?? "api",
                category: cap.template_category ?? null,
                endpoint_tags: cap.endpoint_tags ?? null,
                response_type: cap.response_type ?? null,
                supported_intents: cap.supported_intents ?? null,
                description: cap.template_description ?? null,
            })),
        });
    } catch (err) {
        log.error("💥 Error listing integrations:", err);
        return c.json({ biam_protocol: "2.0", action: "error", message: "Failed to list integrations" }, 500);
    }
});

// ─── POST / — Create new integration ────────────────────────

integrationCrudRoutes.post("/",
    zValidator("json", createIntegrationSchema),
    async (c) => {
        try {
            const body = c.req.valid("json");

            if (!body.name || !body.api_endpoint) {
                return c.json({ biam_protocol: "2.0", action: "error", message: "name and api_endpoint are required" }, 400);
            }

            const [inserted] = await db.insert(capsules).values({
                name: body.name,
                intent_description: body.intent_description || "",
                api_endpoint: body.api_endpoint,
                http_method: body.http_method || "GET",
                group_name: body.group_name ?? null,
                sidebar_icon: body.sidebar_icon ?? null,
                sidebar_label: body.sidebar_label ?? null,
                human_triggers: body.human_triggers ?? null,
                api_triggers: body.api_triggers ?? null,
                param_schema: body.param_schema ?? null,
                endpoint_tags: body.endpoint_tags ?? null,
                response_mapping: body.response_mapping ?? null,
                api_config: body.api_config ? JSON.stringify(body.api_config) : null,
                integration_type: body.integration_type || "api",
                is_active: body.is_active !== false,
                status: body.status || (body.api_config?.requiresAuth ? "auth_needed" : "live"),
                response_type: (body as any).response_type ?? null,
                supported_intents: (body as any).supported_intents ?? null,
                template_category: (body as any).category ?? null,
            }).returning();

            invalidateConciergeCache();
            clearRoutingCache();

            return c.json({
                biam_protocol: "2.0",
                action: "integration_created",
                integration: inserted,
                message: `Integration "${body.name}" created successfully.`,
            }, 201);
        } catch (err) {
            log.error("💥 Create error:", err);
            return c.json({
                biam_protocol: "2.0", action: "error",
                message: err instanceof Error ? err.message : "Create failed",
            }, 500);
        }
    });

// ─── PATCH /:id — Update details ────────────────────────────

integrationCrudRoutes.patch("/:id",
    zValidator("json", patchIntegrationSchema),
    async (c) => {
        try {
            const id = Number(c.req.param("id"));
            const body = c.req.valid("json");

            const [existing] = await db.select().from(capsules).where(eq(capsules.id, id));
            if (!existing) {
                return c.json({ biam_protocol: "2.0", action: "error", message: "Integration not found" }, 404);
            }

            const updates: Record<string, any> = {};
            if (body.name !== undefined) updates.name = body.name;
            if (body.intent_description !== undefined) updates.intent_description = body.intent_description;
            if (body.api_endpoint !== undefined) updates.api_endpoint = body.api_endpoint;
            if (body.api_config !== undefined) updates.api_config = JSON.stringify(body.api_config);
            if (body.group_name !== undefined) updates.group_name = body.group_name;
            if (body.is_active !== undefined) updates.is_active = body.is_active ? 1 : 0;
            if (body.status !== undefined) updates.status = body.status;
            if (body.sidebar_icon !== undefined) updates.sidebar_icon = body.sidebar_icon;
            if (body.sidebar_label !== undefined) updates.sidebar_label = body.sidebar_label;
            if ((body as any).human_triggers !== undefined) updates.human_triggers = (body as any).human_triggers;
            if (body.allowed_blocks !== undefined) updates.allowed_blocks = body.allowed_blocks ? JSON.stringify(body.allowed_blocks) : null;
            if ((body as any).category !== undefined) updates.template_category = (body as any).category;
            if ((body as any).description !== undefined) updates.template_description = (body as any).description;
            if ((body as any).endpoint_tags !== undefined) updates.endpoint_tags = (body as any).endpoint_tags;
            if ((body as any).response_type !== undefined) updates.response_type = (body as any).response_type;
            if ((body as any).supported_intents !== undefined) updates.supported_intents = (body as any).supported_intents;

            if (Object.keys(updates).length > 0) {
                await db.update(capsules).set(updates).where(eq(capsules.id, id));
            }

            const [updated] = await db.select().from(capsules).where(eq(capsules.id, id));
            return c.json({
                biam_protocol: "2.0",
                action: "integration_updated",
                integration: {
                    id: updated.id,
                    name: updated.name,
                    intent_description: updated.intent_description,
                    api_endpoint: updated.api_endpoint,
                    is_auto_generated: updated.is_auto_generated,
                    has_embedding: updated.embedding !== null,
                    api_config: safeParseJSON(updated.api_config),
                    group_name: updated.group_name ?? null,
                    is_active: updated.is_active ?? true,
                    status: updated.status ?? "live",
                    sidebar_icon: updated.sidebar_icon ?? null,
                    sidebar_label: updated.sidebar_label ?? null,
                    human_triggers: updated.human_triggers ?? null,
                    http_method: updated.http_method ?? "GET",
                    allowed_blocks: safeParseJSON(updated.allowed_blocks),
                    integration_type: updated.integration_type ?? "api",
                },
            });
        } catch (err) {
            log.error("💥 Patch error:", err);
            return c.json({
                biam_protocol: "2.0", action: "error",
                message: err instanceof Error ? err.message : "Update failed",
            }, 500);
        }
    });

// ─── DELETE /:id — Remove integration ───────────────────────

integrationCrudRoutes.delete("/:id", async (c) => {
    try {
        const id = Number(c.req.param("id"));
        const [integration] = await db.select().from(capsules).where(eq(capsules.id, id));

        if (!integration) {
            return c.json({ biam_protocol: "2.0", action: "error", message: "Integration not found" }, 404);
        }

        await db.delete(capsules).where(eq(capsules.id, id));
        invalidateConciergeCache();
        clearRoutingCache();

        return c.json({
            biam_protocol: "2.0",
            action: "integration_deleted",
            integration_id: integration.name,
            message: `Integration "${integration.name}" deleted.`,
        });
    } catch (err) {
        log.error("💥 Delete error:", err);
        return c.json({
            biam_protocol: "2.0", action: "error",
            message: err instanceof Error ? err.message : "Delete failed",
        }, 500);
    }
});

export { integrationCrudRoutes };
