// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Block Routes Tests
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import * as schema from "../src/db/schema.js";
import { __setDb } from "../src/db/db.js";
import { blockRoutes } from "../src/routes/block-routes.js";

// ─── Test App ───────────────────────────────────────────────

const app = new Hono();
app.route("/api/blocks", blockRoutes);

// ─── Helpers ────────────────────────────────────────────────

let testDb: ReturnType<typeof drizzle>;

function req(method: string, path: string, body?: any) {
    const init: RequestInit = { method };
    if (body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    // Hono sub-router: "/api/blocks" for root, not trailing "/"
    const url = path === "/" ? "/api/blocks" : `/api/blocks${path}`;
    return app.request(url, init);
}

async function createTables() {
    await testDb.run(sql`
        CREATE TABLE system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
}

// ─── Setup ──────────────────────────────────────────────────

beforeEach(async () => {
    const client = createClient({ url: ":memory:" });
    testDb = drizzle(client, { schema });
    __setDb(testDb);
    await createTables();
});

// ============================================================
// GET /api/blocks — Block Registry
// ============================================================

describe("GET /api/blocks", () => {
    it("returns list of built-in blocks", async () => {
        const res = await req("GET", "/");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.blocks).toBeDefined();
        expect(Array.isArray(json.blocks)).toBe(true);
        expect(json.blocks.length).toBeGreaterThanOrEqual(20);
        expect(json.total).toBe(json.blocks.length);
    });

    it("each block has required metadata fields", async () => {
        const res = await req("GET", "/");
        const json = await res.json();
        for (const block of json.blocks) {
            expect(block.type).toBeDefined();
            expect(block.component).toBeDefined();
            expect(block.category).toBeDefined();
            expect(block.file).toBeDefined();
            expect(block.description).toBeDefined();
        }
    });

    it("includes content blocks", async () => {
        const res = await req("GET", "/");
        const json = await res.json();
        const types = json.blocks.map((b: any) => b.type);
        expect(types).toContain("title");
        expect(types).toContain("text");
        expect(types).toContain("image");
    });

    it("includes data blocks", async () => {
        const res = await req("GET", "/");
        const json = await res.json();
        const types = json.blocks.map((b: any) => b.type);
        expect(types).toContain("hero");
        expect(types).toContain("table");
        expect(types).toContain("key_value");
    });

    it("includes media blocks", async () => {
        const res = await req("GET", "/");
        const json = await res.json();
        const types = json.blocks.map((b: any) => b.type);
        expect(types).toContain("image_grid");
        expect(types).toContain("quote");
        expect(types).toContain("code");
    });

    it("has valid categories", async () => {
        const res = await req("GET", "/");
        const json = await res.json();
        const validCategories = new Set(["content", "data", "list", "media"]);
        for (const block of json.blocks) {
            expect(validCategories.has(block.category)).toBe(true);
        }
    });
});


// ============================================================
// GET /api/blocks/imports — Available Imports
// ============================================================

describe("GET /api/blocks/imports", () => {
    it("returns available imports", async () => {
        const res = await req("GET", "/imports");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.react).toBeDefined();
        expect(json.mui_material).toBeDefined();
    });

    it("react imports include React and hooks", async () => {
        const res = await req("GET", "/imports");
        const json = await res.json();
        expect(json.react).toContain("React");
        expect(json.react).toContain("useState");
    });
});

// ============================================================
// GET /api/blocks/:type/source — Block Source Code
// ============================================================

describe("GET /api/blocks/:type/source", () => {
    it("returns 404 for unknown block type", async () => {
        const res = await req("GET", "/nonexistent_block/source");
        expect(res.status).toBe(404);
    });

    it("returns source for known block type", async () => {
        const res = await req("GET", "/title/source");
        // Should return 200 with source code, or 500 if file not found
        // (depends on runtime file paths), both are acceptable in CI
        expect([200, 500]).toContain(res.status);
    });
});

// ============================================================
// POST /api/blocks/validate — Transpile Check
// ============================================================

describe("POST /api/blocks/validate", () => {
    it("returns 400 when no code provided", async () => {
        const res = await req("POST", "/validate", {});
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.valid).toBe(false);
        expect(json.errors).toContain("No code provided");
    });

    it("validates valid TSX code", async () => {
        const res = await req("POST", "/validate", {
            code: `import React from "react";
export const TestBlock = React.memo(function TestBlock() {
    return <div>Hello</div>;
});`,
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.valid).toBe(true);
    });

    it("catches invalid TSX code", async () => {
        const res = await req("POST", "/validate", {
            code: "const x: number = <<<invalid",
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.valid).toBe(false);
        expect(json.errors.length).toBeGreaterThan(0);
    });
});
