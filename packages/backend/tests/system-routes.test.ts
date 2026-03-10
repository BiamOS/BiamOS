// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — System Routes Tests
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import * as schema from "../src/db/schema.js";
import { __setDb } from "../src/db/db.js";
import { systemRoutes } from "../src/routes/system-routes.js";

// ─── Test App ───────────────────────────────────────────────

const app = new Hono();
app.route("/api/system", systemRoutes);

let testDb: ReturnType<typeof drizzle>;

function req(method: string, path: string, body?: any) {
    const init: RequestInit = { method };
    if (body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    return app.request(`/api/system${path}`, init);
}

async function createTables() {
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
}

beforeEach(async () => {
    const client = createClient({ url: ":memory:" });
    testDb = drizzle(client, { schema });
    __setDb(testDb);
    await createTables();
});

// ============================================================
// GET /api/system/stats
// ============================================================

describe("GET /api/system/stats", () => {
    it("returns zero stats when no usage logs exist", async () => {
        await testDb.run(
            sql`INSERT INTO system_settings (key, value) VALUES ('OPENROUTER_API_KEY', 'sk-test-12345678-abcd')`
        );

        const res = await req("GET", "/stats");
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.stats.total_tokens).toBe(0);
        expect(json.stats.total_prompt_tokens).toBe(0);
        expect(json.stats.total_completion_tokens).toBe(0);
        expect(json.stats.api_calls).toBe(0);
        expect(json.stats.masked_api_key).toBeDefined();
    });

    it("returns correct stats after logging usage", async () => {
        await testDb.run(
            sql`INSERT INTO system_settings (key, value) VALUES ('OPENROUTER_API_KEY', 'sk-test-12345678-abcd')`
        );
        await testDb.insert(schema.usageLogs).values([
            { timestamp: "2024-01-01T00:00:00Z", intent: "test", prompt_tokens: 100, completion_tokens: 50, model_name: "gpt-4" },
            { timestamp: "2024-01-01T01:00:00Z", intent: "test2", prompt_tokens: 200, completion_tokens: 100, model_name: "gpt-4" },
        ]);

        const res = await req("GET", "/stats");
        const json = await res.json();

        expect(json.stats.total_prompt_tokens).toBe(300);
        expect(json.stats.total_completion_tokens).toBe(150);
        expect(json.stats.total_tokens).toBe(450);
        expect(json.stats.api_calls).toBe(2);
    });

    it("masks API key properly", async () => {
        await testDb.run(
            sql`INSERT INTO system_settings (key, value) VALUES ('OPENROUTER_API_KEY', 'sk-test-verylongapikey-1234')`
        );

        const res = await req("GET", "/stats");
        const json = await res.json();

        expect(json.stats.masked_api_key).toMatch(/^sk-test-.*1234$/);
        expect(json.stats.masked_api_key).toContain("•");
    });
});

// ============================================================
// POST /api/system/key — Update API Key
// ============================================================

describe("POST /api/system/key", () => {
    it("saves a new API key", async () => {
        const res = await req("POST", "/key", { key: "sk-new-test-key-12345678" });
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.action).toBe("key_updated");

        const rows = await testDb.select().from(schema.systemSettings);
        expect(rows.find((r) => r.key === "OPENROUTER_API_KEY")?.value).toBe("sk-new-test-key-12345678");
    });

    it("rejects keys shorter than 10 chars", async () => {
        const res = await req("POST", "/key", { key: "short" });
        expect(res.status).toBe(400);
    });

    it("rejects empty key", async () => {
        const res = await req("POST", "/key", { key: "" });
        expect(res.status).toBe(400);
    });

    it("updates existing key via upsert", async () => {
        await testDb.run(
            sql`INSERT INTO system_settings (key, value) VALUES ('OPENROUTER_API_KEY', 'sk-old-key-123456789')`
        );

        const res = await req("POST", "/key", { key: "sk-updated-key-987654321" });
        expect(res.status).toBe(200);

        const rows = await testDb.select().from(schema.systemSettings);
        const keyRow = rows.filter((r) => r.key === "OPENROUTER_API_KEY");
        expect(keyRow).toHaveLength(1);
        expect(keyRow[0].value).toBe("sk-updated-key-987654321");
    });
});
