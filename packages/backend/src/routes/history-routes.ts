// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Browsing History Routes
// ============================================================
// CRUD endpoints for webview browsing history.
// ============================================================

import { Hono } from "hono";
import { eq, desc, like } from "drizzle-orm";
import { db } from "../db/db.js";
import { browsingHistory } from "../db/schema.js";

export const historyRoutes = new Hono();

// ─── GET / — List recent history ─────────────────────────────

historyRoutes.get("/", async (c) => {
    const limit = parseInt(c.req.query("limit") ?? "50", 10);
    const search = c.req.query("q") ?? "";

    let entries;
    if (search) {
        entries = await db
            .select()
            .from(browsingHistory)
            .where(like(browsingHistory.url, `%${search}%`))
            .orderBy(desc(browsingHistory.last_visited))
            .limit(limit)
            .all();
    } else {
        entries = await db
            .select()
            .from(browsingHistory)
            .orderBy(desc(browsingHistory.last_visited))
            .limit(limit)
            .all();
    }

    return c.json({ biam_protocol: "2.0", entries });
});

// ─── POST / — Record a visit (upsert by URL) ────────────────

historyRoutes.post("/", async (c) => {
    const { url, title } = await c.req.json<{ url: string; title?: string }>();
    if (!url) return c.json({ error: "url required" }, 400);

    // Skip blank/internal URLs
    if (url === "about:blank" || url.startsWith("data:")) {
        return c.json({ biam_protocol: "2.0", action: "skipped" });
    }

    let hostname = "";
    try { hostname = new URL(url).hostname; } catch { /* invalid */ }

    const now = new Date().toISOString();

    // Check if URL already exists
    const [existing] = await db
        .select()
        .from(browsingHistory)
        .where(eq(browsingHistory.url, url))
        .limit(1)
        .all();

    if (existing) {
        // Update visit count + title + timestamp
        await db.update(browsingHistory).set({
            visit_count: existing.visit_count + 1,
            last_visited: now,
            title: title || existing.title,
        }).where(eq(browsingHistory.id, existing.id));
        return c.json({ biam_protocol: "2.0", action: "updated", id: existing.id });
    }

    // New entry
    const result = await db.insert(browsingHistory).values({
        url,
        title: title ?? "",
        hostname,
        visit_count: 1,
        last_visited: now,
        created_at: now,
    });

    return c.json({ biam_protocol: "2.0", action: "created", id: result.lastInsertRowid });
});

// ─── DELETE / — Clear all history ────────────────────────────

historyRoutes.delete("/", async (c) => {
    await db.delete(browsingHistory);
    return c.json({ biam_protocol: "2.0", action: "cleared" });
});

export { historyRoutes as default };
