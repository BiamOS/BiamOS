// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Selector Routes (DOM Selector CRUD)
// ============================================================
// CRUD for saved element selectors + execute endpoint.
// Users pick elements on any website → selectors are saved →
// can be re-scraped on demand like a personal API.
// Renamed from scraper-routes.ts for clarity.
// ============================================================

import { Hono } from "hono";
import { db } from "../db/db.js";
import { scraperEndpoints } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const selectorRoutes = new Hono();

// ─── GET / — List all saved scraper endpoints ───────────────

selectorRoutes.get("/", async (c) => {
    const endpoints = await db.select().from(scraperEndpoints);
    return c.json({ endpoints });
});

// ─── GET /:id — Get a single scraper endpoint ───────────────

selectorRoutes.get("/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

    const [endpoint] = await db
        .select()
        .from(scraperEndpoints)
        .where(eq(scraperEndpoints.id, id));

    if (!endpoint) return c.json({ error: "Not found" }, 404);
    return c.json(endpoint);
});

// ─── POST / — Create a new scraper endpoint ─────────────────

selectorRoutes.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body !== "object") {
        return c.json({ error: "Invalid request body" }, 400);
    }

    const { label, url_pattern, css_selector, xpath_selector, text_anchor, extract_type, instruction } = body as {
        label?: string;
        url_pattern?: string;
        css_selector?: string;
        xpath_selector?: string;
        text_anchor?: string;
        extract_type?: string;
        instruction?: string;
    };

    if (!label || typeof label !== "string" || label.trim().length === 0) {
        return c.json({ error: "Missing or invalid 'label' field" }, 400);
    }
    if (!url_pattern || typeof url_pattern !== "string" || url_pattern.trim().length === 0) {
        return c.json({ error: "Missing or invalid 'url_pattern' field" }, 400);
    }
    if (!css_selector || typeof css_selector !== "string" || css_selector.trim().length === 0) {
        return c.json({ error: "Missing or invalid 'css_selector' field" }, 400);
    }

    const result = await db.insert(scraperEndpoints).values({
        label: label.trim(),
        url_pattern: url_pattern.trim(),
        css_selector: css_selector.trim(),
        xpath_selector: typeof xpath_selector === "string" ? xpath_selector.trim() : null,
        text_anchor: typeof text_anchor === "string" ? text_anchor.trim() : null,
        extract_type: typeof extract_type === "string" ? extract_type.trim() : "text",
        instruction: typeof instruction === "string" ? instruction.trim() : null,
        created_at: new Date().toISOString(),
    }).returning();

    return c.json(result[0], 201);
});

// ─── DELETE /:id — Delete a scraper endpoint ────────────────

selectorRoutes.delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

    const deleted = await db
        .delete(scraperEndpoints)
        .where(eq(scraperEndpoints.id, id))
        .returning();

    if (deleted.length === 0) return c.json({ error: "Not found" }, 404);
    return c.json({ success: true, id });
});

// ─── POST /:id/execute — Re-scrape a saved endpoint ────────

selectorRoutes.post("/:id/execute", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

    const [endpoint] = await db
        .select()
        .from(scraperEndpoints)
        .where(eq(scraperEndpoints.id, id));

    if (!endpoint) return c.json({ error: "Not found" }, 404);

    // Execute requires Electron IPC (frontend-driven).
    // This endpoint returns the selector info for the frontend to execute.
    return c.json({
        id: endpoint.id,
        label: endpoint.label,
        url_pattern: endpoint.url_pattern,
        css_selector: endpoint.css_selector,
        xpath_selector: endpoint.xpath_selector,
        text_anchor: endpoint.text_anchor,
        extract_type: endpoint.extract_type,
        instruction: endpoint.instruction,
        action: "execute_scraper",
    });
});
