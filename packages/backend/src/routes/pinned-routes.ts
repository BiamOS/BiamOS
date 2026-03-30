// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Pinned Dashboard Routes
// ============================================================
// CRUD endpoints for pinned intents + background refresh logic.
// Pin = Intent + Params. Re-executed on a timer for fresh data.
// ============================================================

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/db.js";
import { pinnedIntents } from "../db/schema.js";

import { log } from "../utils/logger.js";

const pinnedRoutes = new Hono();

// ─── GET / — List all pinned intents ────────────────────────

pinnedRoutes.get("/", async (c) => {
    const pins = await db.select().from(pinnedIntents).orderBy(pinnedIntents.sort_order);
    return c.json({
        biam_protocol: "2.0",
        action: "pinned_list",
        pins: pins.map((p) => ({
            ...p,
            params: p.params ? JSON.parse(p.params) : null,
            last_data: p.last_data ? JSON.parse(p.last_data) : null,
            last_layout: p.last_layout ? JSON.parse(p.last_layout) : null,
            related_queries: p.related_queries ? JSON.parse(p.related_queries) : null,
        })),
    });
});

// ─── POST / — Pin a new intent ──────────────────────────────

pinnedRoutes.post("/", async (c) => {
    const body = await c.req.json<{
        query?: string;
        endpoint_id?: number;
        params?: Record<string, string>;
        related_queries?: string[];
        pin_type?: "intent" | "webview";
        url?: string;
    }>();

    const pinType = body.pin_type ?? "intent";

    // Webview pins need a URL, intent pins need a query
    if (pinType === "webview") {
        if (!body.url || typeof body.url !== "string" || body.url.trim() === "") {
            return c.json({ biam_protocol: "2.0", action: "error", message: "Missing 'url' for webview pin" }, 400);
        }
    } else {
        if (!body.query || typeof body.query !== "string" || body.query.trim() === "") {
            return c.json({ biam_protocol: "2.0", action: "error", message: "Missing or empty 'query' field" }, 400);
        }
    }

    const now = new Date().toISOString();

    // Execute the intent immediately to get initial data (skip for webviews)
    let lastData: string | null = null;
    let lastLayout: string | null = null;
    if (pinType === "intent" && body.query) {
        log.warn("[Pinned] Initial fetch skipped: classic API intents are deprecated.");
    }

    const [inserted] = await db.insert(pinnedIntents).values({
        query: (body.query ?? body.url ?? "").trim(),
        endpoint_id: body.endpoint_id ?? null,
        params: body.params ? JSON.stringify(body.params) : null,
        refresh_minutes: pinType === "webview" ? 0 : 15,
        last_data: lastData,
        last_layout: lastLayout,
        last_refreshed: now,
        sort_order: 0,
        related_queries: body.related_queries ? JSON.stringify(body.related_queries) : null,
        pin_type: pinType,
        url: body.url ?? null,
        created_at: now,
    }).returning();

    return c.json({
        biam_protocol: "2.0",
        action: "pinned_created",
        pin: {
            ...inserted,
            params: inserted.params ? JSON.parse(inserted.params) : null,
            last_data: inserted.last_data ? JSON.parse(inserted.last_data) : null,
            last_layout: inserted.last_layout ? JSON.parse(inserted.last_layout) : null,
            related_queries: inserted.related_queries ? JSON.parse(inserted.related_queries) : null,
        },
    }, 201);
});

// ─── DELETE /:id — Unpin ────────────────────────────────────

pinnedRoutes.delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) {
        return c.json({ biam_protocol: "2.0", action: "error", message: "Invalid ID" }, 400);
    }

    const [existing] = await db.select().from(pinnedIntents).where(eq(pinnedIntents.id, id)).limit(1);
    if (!existing) {
        return c.json({ biam_protocol: "2.0", action: "error", message: "Pin not found" }, 404);
    }

    await db.delete(pinnedIntents).where(eq(pinnedIntents.id, id));
    return c.json({ biam_protocol: "2.0", action: "pinned_deleted", id });
});

// ─── PATCH /:id — Update refresh interval or sort order ─────

pinnedRoutes.patch("/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) {
        return c.json({ biam_protocol: "2.0", action: "error", message: "Invalid ID" }, 400);
    }

    const body = await c.req.json<{
        refresh_minutes?: number;
        sort_order?: number;
        related_queries?: string[];
        url?: string;
        query?: string;
    }>();

    const updates: Record<string, unknown> = {};
    if (typeof body.refresh_minutes === "number" && body.refresh_minutes > 0) {
        updates.refresh_minutes = body.refresh_minutes;
    }
    if (typeof body.sort_order === "number") {
        updates.sort_order = body.sort_order;
    }
    if (Array.isArray(body.related_queries)) {
        updates.related_queries = JSON.stringify(body.related_queries);
    }
    if (typeof body.url === "string" && body.url.trim()) {
        updates.url = body.url.trim();
    }
    if (typeof body.query === "string" && body.query.trim()) {
        updates.query = body.query.trim();
    }

    if (Object.keys(updates).length === 0) {
        return c.json({ biam_protocol: "2.0", action: "error", message: "No valid fields to update" }, 400);
    }

    await db.update(pinnedIntents).set(updates).where(eq(pinnedIntents.id, id));

    const [updated] = await db.select().from(pinnedIntents).where(eq(pinnedIntents.id, id)).limit(1);
    if (!updated) {
        return c.json({ biam_protocol: "2.0", action: "error", message: "Pin not found" }, 404);
    }

    return c.json({
        biam_protocol: "2.0",
        action: "pinned_updated",
        pin: {
            ...updated,
            params: updated.params ? JSON.parse(updated.params) : null,
            last_data: updated.last_data ? JSON.parse(updated.last_data) : null,
            last_layout: updated.last_layout ? JSON.parse(updated.last_layout) : null,
        },
    });
});

// ─── POST /refresh — Force-refresh all or specific pin ──────

pinnedRoutes.post("/refresh", async (c) => {
    const { id } = await c.req.json<{ id?: number }>().catch(() => ({ id: undefined }));

    let refreshed = 0;

    if (id) {
        // Refresh a single pin
        const [pin] = await db.select().from(pinnedIntents).where(eq(pinnedIntents.id, id)).limit(1);
        if (!pin) {
            return c.json({ biam_protocol: "2.0", action: "error", message: "Pin not found" }, 404);
        }
        const ok = await refreshPin(pin);
        if (ok) refreshed = 1;
    } else {
        // Force-refresh ALL pins (bypass staleness check)
        const pins = await db.select().from(pinnedIntents).all();
        for (const pin of pins) {
            const ok = await refreshPin(pin);
            if (ok) refreshed++;
        }
        log.debug(`[Pinned] Force refresh: ${refreshed}/${pins.length} pins updated`);
    }

    return c.json({
        biam_protocol: "2.0",
        action: "pinned_refreshed",
        refreshed,
    });
});

// ─── POST /refresh-stale — Auto-refresh only stale pins ─────

pinnedRoutes.post("/refresh-stale", async (c) => {
    const refreshed = await refreshAllPins();
    return c.json({ biam_protocol: "2.0", action: "pinned_stale_refreshed", refreshed });
});

// ─── Refresh Logic (exported for background timer) ──────────

async function refreshPin(pin: typeof pinnedIntents.$inferSelect) {
    // Skip refresh for webview pins — they don't need API data
    if (pin.pin_type === "webview") return false;
    // API intents reflect the legacy V1 system running via /api/intent
    // Because the old intent pipeline has been deleted in Phase 5, classic API 
    // intents cannot be refreshed anymore. 
    return false;
}

export async function refreshAllPins() {
    const pins = await db.select().from(pinnedIntents).all();
    let refreshed = 0;

    log.debug(`[Pinned] Stale check: ${pins.length} pins total`);
    for (const pin of pins) {
        // Skip pins that were refreshed recently
        if (pin.last_refreshed) {
            const staleMinutes = Math.round((Date.now() - new Date(pin.last_refreshed).getTime()) / 60000);
            if (staleMinutes < pin.refresh_minutes) {
                log.debug(`[Pinned] Pin #${pin.id} ("${pin.query}"): ${staleMinutes}m old, needs ${pin.refresh_minutes}m — SKIP`);
                continue;
            }
            log.debug(`[Pinned] Pin #${pin.id} ("${pin.query}"): ${staleMinutes}m old, needs ${pin.refresh_minutes}m — STALE, refreshing`);
        }

        const success = await refreshPin(pin);
        if (success) refreshed++;
    }

    log.debug(`[Pinned] Background refresh: ${refreshed}/${pins.length} pins updated`);
    return refreshed;
}

export { pinnedRoutes };
