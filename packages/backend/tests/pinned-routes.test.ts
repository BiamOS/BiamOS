// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Pinned Routes Tests
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import * as schema from "../src/db/schema.js";
import { __setDb } from "../src/db/db.js";

// ─── Test App ───────────────────────────────────────────────

// We import the routes dynamically after DB is set up
let app: Hono;

// ─── Helpers ────────────────────────────────────────────────

let testDb: ReturnType<typeof drizzle>;

function req(method: string, path: string, body?: any) {
    const init: RequestInit = { method };
    if (body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    const url = path === "/" ? "/api/pinned" : `/api/pinned${path}`;
    return app.request(url, init);
}

async function createTables() {
    // Existing tables needed for pipeline imports
    await testDb.run(sql`
        CREATE TABLE capsules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            intent_description TEXT NOT NULL,
            api_endpoint TEXT NOT NULL,
            embedding TEXT,
            is_auto_generated INTEGER NOT NULL DEFAULT 0,
            api_config TEXT,
            group_name TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            endpoint_tags TEXT,
            normalized_tags TEXT,
            http_method TEXT NOT NULL DEFAULT 'GET',
            param_schema TEXT,
            group_embedding TEXT,
            sidebar_icon TEXT,
            sidebar_label TEXT,
            human_triggers TEXT,
            api_triggers TEXT
        );
    `);
    await testDb.run(sql`
        CREATE TABLE system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
    await testDb.run(sql`
        CREATE TABLE usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            intent TEXT NOT NULL,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            model_name TEXT NOT NULL
        );
    `);
    await testDb.run(sql`
        CREATE TABLE agents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            description TEXT NOT NULL,
            pipeline TEXT NOT NULL,
            step_order INTEGER NOT NULL,
            prompt TEXT NOT NULL,
            model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash-lite',
            is_active INTEGER NOT NULL DEFAULT 1,
            temperature INTEGER NOT NULL DEFAULT 0,
            max_tokens INTEGER NOT NULL DEFAULT 200,
            total_calls INTEGER NOT NULL DEFAULT 0,
            total_tokens_used INTEGER NOT NULL DEFAULT 0
        );
    `);
    // Pinned intents table
    await testDb.run(sql`
        CREATE TABLE pinned_intents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            endpoint_id INTEGER,
            params TEXT,
            refresh_minutes INTEGER NOT NULL DEFAULT 15,
            last_data TEXT,
            last_layout TEXT,
            last_refreshed TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            related_queries TEXT,
            pin_type TEXT NOT NULL DEFAULT 'intent',
            url TEXT,
            created_at TEXT NOT NULL
        );
    `);
}

// ─── Setup ──────────────────────────────────────────────────

beforeEach(async () => {
    const client = createClient({ url: ":memory:" });
    testDb = drizzle(client, { schema });
    __setDb(testDb);
    await createTables();

    // Re-create app with fresh routes
    const { pinnedRoutes } = await import("../src/routes/pinned-routes.js");
    app = new Hono();
    app.route("/api/pinned", pinnedRoutes);
});

// ============================================================
// GET /api/pinned — Empty list
// ============================================================

describe("GET /api/pinned", () => {
    it("returns empty list initially", async () => {
        const res = await req("GET", "/");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.biam_protocol).toBe("2.0");
        expect(json.action).toBe("pinned_list");
        expect(json.pins).toEqual([]);
    });
});

// ============================================================
// POST /api/pinned — Validation
// ============================================================

describe("POST /api/pinned", () => {
    it("returns 400 when query is missing", async () => {
        const res = await req("POST", "/", {});
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.action).toBe("error");
        expect(json.message).toContain("query");
    });

    it("returns 400 when query is empty string", async () => {
        const res = await req("POST", "/", { query: "" });
        expect(res.status).toBe(400);
    });

    it("returns 400 when query is not a string", async () => {
        const res = await req("POST", "/", { query: 42 });
        expect(res.status).toBe(400);
    });
});

// ============================================================
// DELETE /api/pinned/:id — Not found
// ============================================================

describe("DELETE /api/pinned/:id", () => {
    it("returns 404 when pin does not exist", async () => {
        const res = await req("DELETE", "/999");
        expect(res.status).toBe(404);
        const json = await res.json();
        expect(json.action).toBe("error");
    });

    it("returns 400 for invalid id", async () => {
        const res = await req("DELETE", "/abc");
        expect(res.status).toBe(400);
    });
});

// ============================================================
// PATCH /api/pinned/:id — Validation
// ============================================================

describe("PATCH /api/pinned/:id", () => {
    it("returns 400 when no valid fields", async () => {
        const res = await req("PATCH", "/1", {});
        expect(res.status).toBe(400);
    });

    it("returns 400 for invalid id", async () => {
        const res = await req("PATCH", "/abc", { refresh_minutes: 30 });
        expect(res.status).toBe(400);
    });
});
