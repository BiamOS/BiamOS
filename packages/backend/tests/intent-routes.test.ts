// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Intent Routes Tests
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import * as schema from "../src/db/schema.js";
import { __setDb } from "../src/db/db.js";
import { intentRoutes } from "../src/routes/intent-routes.js";

// ─── Test App ───────────────────────────────────────────────

const app = new Hono();
app.route("/api/intent", intentRoutes);

// ─── Helpers ────────────────────────────────────────────────

let testDb: ReturnType<typeof drizzle>;

function req(method: string, path: string, body?: any) {
    const init: RequestInit = { method };
    if (body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    const url = path === "/" ? "/api/intent" : `/api/intent${path}`;
    return app.request(url, init);
}

async function createTables() {
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
            model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash-lite-preview-09-2025',
            is_active INTEGER NOT NULL DEFAULT 1,
            temperature INTEGER NOT NULL DEFAULT 0,
            max_tokens INTEGER NOT NULL DEFAULT 200,
            total_calls INTEGER NOT NULL DEFAULT 0,
            total_tokens_used INTEGER NOT NULL DEFAULT 0
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
// POST /api/intent — Input Validation
// ============================================================

describe("POST /api/intent", () => {
    it("returns 400 when text is missing", async () => {
        const res = await req("POST", "/", {});
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.biam_protocol).toBe("2.0");
        expect(json.action).toBe("error");
        expect(json.message).toBeDefined();
    });

    it("returns 400 when text is empty string", async () => {
        const res = await req("POST", "/", { text: "" });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.action).toBe("error");
    });

    it("returns 400 when text is not a string", async () => {
        const res = await req("POST", "/", { text: 42 });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.action).toBe("error");
    });

    it("returns 400 when text is null", async () => {
        const res = await req("POST", "/", { text: null });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.action).toBe("error");
    });

    it("returns biam_protocol 2.0 in error responses", async () => {
        const res = await req("POST", "/", {});
        const json = await res.json();
        expect(json.biam_protocol).toBe("2.0");
    });

    it("includes error message in response", async () => {
        const res = await req("POST", "/", { text: 123 });
        const json = await res.json();
        expect(json.message).toBeDefined();
        expect(typeof json.message).toBe("string");
        expect(json.message.length).toBeGreaterThan(0);
    });
});
