// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Changelog Routes
// ============================================================
// CRUD for changelog / release notes entries.
// ============================================================

import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/db.js";
import { changelog } from "../db/schema.js";

const changelogRoutes = new Hono();

/** Current app version — bump this on releases */
export const APP_VERSION = "2.2.0-alpha";

// ─── GET / — List all changelog entries ─────────────────────

changelogRoutes.get("/", async (c) => {
    try {
        const entries = await db.select().from(changelog).orderBy(desc(changelog.id));
        return c.json({ version: APP_VERSION, entries });
    } catch (err) {
        return c.json({ message: "Failed to load changelog" }, 500);
    }
});

// ─── GET /version — Current version ─────────────────────────

changelogRoutes.get("/version", (c) => {
    return c.json({ version: APP_VERSION });
});

// ─── POST / — Create a new changelog entry ──────────────────

changelogRoutes.post("/", async (c) => {
    try {
        const { version, date, entries } = await c.req.json<{
            version: string;
            date: string;
            entries: { type: string; text: string }[];
        }>();

        if (!version || !entries?.length) {
            return c.json({ message: "version and entries are required" }, 400);
        }

        const [inserted] = await db.insert(changelog).values({
            version,
            date: date || new Date().toISOString().split("T")[0],
            entries: JSON.stringify(entries),
            created_at: new Date().toISOString(),
        }).returning();

        return c.json({ message: "Changelog entry created", entry: inserted }, 201);
    } catch (err) {
        return c.json({ message: `Failed: ${err instanceof Error ? err.message : err}` }, 500);
    }
});

// ─── PUT /:id — Update a changelog entry ────────────────────

changelogRoutes.put("/:id", async (c) => {
    try {
        const id = parseInt(c.req.param("id"));
        const { version, date, entries } = await c.req.json<{
            version?: string;
            date?: string;
            entries?: { type: string; text: string }[];
        }>();

        const updates: Record<string, string> = {};
        if (version) updates.version = version;
        if (date) updates.date = date;
        if (entries) updates.entries = JSON.stringify(entries);

        await db.update(changelog).set(updates).where(eq(changelog.id, id));
        return c.json({ message: "Updated" });
    } catch (err) {
        return c.json({ message: `Failed: ${err instanceof Error ? err.message : err}` }, 500);
    }
});

// ─── DELETE /:id — Delete a changelog entry ─────────────────

changelogRoutes.delete("/:id", async (c) => {
    try {
        const id = parseInt(c.req.param("id"));
        await db.delete(changelog).where(eq(changelog.id, id));
        return c.json({ message: "Deleted" });
    } catch (err) {
        return c.json({ message: `Failed: ${err instanceof Error ? err.message : err}` }, 500);
    }
});

export { changelogRoutes };
