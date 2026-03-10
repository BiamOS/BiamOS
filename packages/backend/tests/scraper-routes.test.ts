// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Scraper Routes (CRUD) Tests
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import * as schema from "../src/db/schema.js";
import { __setDb } from "../src/db/db.js";

// ─── Test App ───────────────────────────────────────────────

let app: Hono;
let testDb: ReturnType<typeof drizzle>;

// ─── Helpers ────────────────────────────────────────────────

function req(method: string, path: string, body?: any) {
    const init: RequestInit = { method };
    if (body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    const url = path === "/" ? "/api/scrapers" : `/api/scrapers${path}`;
    return app.request(url, init);
}

// ─── Setup ──────────────────────────────────────────────────

beforeEach(async () => {
    const client = createClient({ url: ":memory:" });
    testDb = drizzle(client, { schema });
    __setDb(testDb);

    await testDb.run(sql`
        CREATE TABLE scraper_endpoints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            url_pattern TEXT NOT NULL,
            css_selector TEXT NOT NULL,
            xpath_selector TEXT,
            text_anchor TEXT,
            extract_type TEXT NOT NULL DEFAULT 'text',
            instruction TEXT,
            last_result TEXT,
            last_scraped TEXT,
            created_at TEXT NOT NULL
        );
    `);

    const { scraperRoutes } = await import("../src/routes/scraper-routes.js");
    app = new Hono();
    app.route("/api/scrapers", scraperRoutes);
});

// ============================================================
// POST /api/scrapers — Input Validation
// ============================================================

describe("POST /api/scrapers", () => {
    it("returns 400 when body is empty", async () => {
        const res = await req("POST", "/", {});
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBeDefined();
    });

    it("returns 400 when label is missing", async () => {
        const res = await req("POST", "/", {
            url_pattern: "https://example.com",
            css_selector: ".main",
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("label");
    });

    it("returns 400 when url_pattern is missing", async () => {
        const res = await req("POST", "/", {
            label: "Test Scraper",
            css_selector: ".main",
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("url_pattern");
    });

    it("returns 400 when css_selector is missing", async () => {
        const res = await req("POST", "/", {
            label: "Test Scraper",
            url_pattern: "https://example.com",
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("css_selector");
    });

    it("returns 400 when label is empty string", async () => {
        const res = await req("POST", "/", {
            label: "",
            url_pattern: "https://example.com",
            css_selector: ".main",
        });
        expect(res.status).toBe(400);
    });

    it("creates a scraper endpoint with valid data", async () => {
        const res = await req("POST", "/", {
            label: "HN Top Stories",
            url_pattern: "https://news.ycombinator.com",
            css_selector: ".athing",
            xpath_selector: "//tr[@class='athing']",
            extract_type: "list",
        });
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.id).toBeDefined();
        expect(json.label).toBe("HN Top Stories");
        expect(json.css_selector).toBe(".athing");
    });
});

// ============================================================
// GET /api/scrapers — List
// ============================================================

describe("GET /api/scrapers", () => {
    it("returns empty list initially", async () => {
        const res = await req("GET", "/");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.endpoints).toBeDefined();
        expect(Array.isArray(json.endpoints)).toBe(true);
        expect(json.endpoints.length).toBe(0);
    });

    it("returns created endpoints", async () => {
        await req("POST", "/", {
            label: "Test", url_pattern: "https://example.com", css_selector: ".main",
        });
        const res = await req("GET", "/");
        const json = await res.json();
        expect(json.endpoints.length).toBe(1);
    });
});

// ============================================================
// GET /api/scrapers/:id — Get by ID
// ============================================================

describe("GET /api/scrapers/:id", () => {
    it("returns 404 for non-existent id", async () => {
        const res = await req("GET", "/99999");
        expect(res.status).toBe(404);
    });

    it("returns 400 for invalid id", async () => {
        const res = await req("GET", "/invalid");
        expect(res.status).toBe(400);
    });
});

// ============================================================
// DELETE /api/scrapers/:id — Delete
// ============================================================

describe("DELETE /api/scrapers/:id", () => {
    it("returns 404 for non-existent id", async () => {
        const res = await req("DELETE", "/99999");
        expect(res.status).toBe(404);
    });

    it("deletes a created endpoint", async () => {
        const createRes = await req("POST", "/", {
            label: "To Delete", url_pattern: "https://example.com", css_selector: ".del",
        });
        const id = (await createRes.json()).id;
        const delRes = await req("DELETE", `/${id}`);
        expect(delRes.status).toBe(200);
        const json = await delRes.json();
        expect(json.success).toBe(true);
    });
});
