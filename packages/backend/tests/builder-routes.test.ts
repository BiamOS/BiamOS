// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Builder Routes Tests
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import * as schema from "../src/db/schema.js";
import { __setDb } from "../src/db/db.js";
import { builderRoutes } from "../src/routes/builder-routes.js";

// ─── Test App ───────────────────────────────────────────────

const app = new Hono();
app.route("/api/builder", builderRoutes);

// ─── Helpers ────────────────────────────────────────────────

let testDb: ReturnType<typeof drizzle>;

function req(method: string, path: string, body?: any) {
    const init: RequestInit = { method };
    if (body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    return app.request(`/api/builder${path}`, init);
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
            status TEXT NOT NULL DEFAULT 'live',
            integration_type TEXT NOT NULL DEFAULT 'api',
            endpoint_tags TEXT,
            normalized_tags TEXT,
            http_method TEXT NOT NULL DEFAULT 'GET',
            param_schema TEXT,
            group_embedding TEXT,
            sidebar_icon TEXT,
            sidebar_label TEXT,
            human_triggers TEXT,
            api_triggers TEXT,
            response_mapping TEXT,
            response_type TEXT,
            supported_intents TEXT,
            is_generic INTEGER NOT NULL DEFAULT 0,
            health_status TEXT DEFAULT 'unchecked',
            health_message TEXT,
            health_checked_at TEXT,
            allowed_blocks TEXT,
            is_template INTEGER NOT NULL DEFAULT 0,
            template_category TEXT,
            template_description TEXT
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
// POST /api/builder/magic-fill — Input Validation
// ============================================================

describe("POST /api/builder/magic-fill", () => {
    it("returns 400 when tool_name is missing", async () => {
        const res = await req("POST", "/magic-fill", {});
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.action).toBe("error");
        expect(json.message).toBeDefined();
    });

    it("returns 400 when tool_name is empty string", async () => {
        const res = await req("POST", "/magic-fill", { tool_name: "   " });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.action).toBe("error");
    });

    it("includes biam_protocol in error response", async () => {
        const res = await req("POST", "/magic-fill", {});
        const json = await res.json();
        expect(json.biam_protocol).toBe("2.0");
    });
});

// ============================================================
// POST /api/builder/import-openapi — Input Validation
// ============================================================

describe("POST /api/builder/import-openapi", () => {
    it("returns 400 when specUrl is missing", async () => {
        const res = await req("POST", "/import-openapi", {});
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.action).toBe("error");
        expect(json.message).toBeDefined();
    });

    it("returns 400 when specUrl is empty string", async () => {
        const res = await req("POST", "/import-openapi", { specUrl: "  " });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.action).toBe("error");
    });

    it("includes biam_protocol in error response", async () => {
        const res = await req("POST", "/import-openapi", {});
        const json = await res.json();
        expect(json.biam_protocol).toBe("2.0");
    });
});

// ============================================================
// POST /api/builder/build — Creator Studio
// ============================================================

describe("POST /api/builder/build", () => {
    it("returns 400 when name is missing", async () => {
        const res = await req("POST", "/build", { intent: "test" });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.action).toBe("error");
    });

    it("returns 400 when intent is missing", async () => {
        const res = await req("POST", "/build", { name: "Test" });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.action).toBe("error");
    });

    it("creates integration with minimal fields", async () => {
        const res = await req("POST", "/build", {
            name: "My Test API",
            intent: "test search lookup",
        });
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.action).toBe("integration_built");
        expect(json.integration_id).toBe("MyTestApiWidget");
        expect(json.id).toBeDefined();
        expect(json.message).toContain("MyTestApiWidget");
    });

    it("creates integration with all fields", async () => {
        const res = await req("POST", "/build", {
            name: "Weather App",
            intent: "weather forecast city",
            apiEndpoint: "https://api.weather.com/v1/forecast",
            authMethod: "apikey",
            triggers: ["show weather", "forecast for"],
            method: "POST",
            groupName: "Weather",
            sidebarIcon: "🌤",
            sidebarLabel: "Weather",
        });
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.action).toBe("integration_built");
        expect(json.integration_id).toBe("WeatherAppWidget");
    });

    it("generates correct PascalCase name from multi-word", async () => {
        const res = await req("POST", "/build", {
            name: "github issues tracker",
            intent: "track github issues",
        });
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.integration_id).toBe("GithubIssuesTrackerWidget");
    });

    it("uses triggers as intent_description when provided", async () => {
        const res = await req("POST", "/build", {
            name: "Test",
            intent: "base intent",
            triggers: ["trigger one", "trigger two"],
        });
        expect(res.status).toBe(201);

        // Verify via DB
        const all = await testDb.select().from(schema.capsules);
        const item = all.find(c => c.name === "TestWidget");
        expect(item?.intent_description).toBe("trigger one | trigger two");
    });

    it("upserts on conflict (no duplicate error)", async () => {
        await req("POST", "/build", {
            name: "Dup Test",
            intent: "first version",
        });

        const res = await req("POST", "/build", {
            name: "Dup Test",
            intent: "updated version",
        });
        expect(res.status).toBe(201);

        const all = await testDb.select().from(schema.capsules);
        const matches = all.filter(c => c.name === "DupTestWidget");
        expect(matches).toHaveLength(1);
        expect(matches[0].intent_description).toBe("updated version");
    });

    it("sets auto-builder URL when no apiEndpoint provided", async () => {
        await req("POST", "/build", {
            name: "No Endpoint",
            intent: "test",
        });

        const all = await testDb.select().from(schema.capsules);
        const item = all.find(c => c.name === "NoEndpointWidget");
        expect(item?.api_endpoint).toBe("auto-builder://NoEndpointWidget");
    });

    it("stores apiConfig from authMethod", async () => {
        await req("POST", "/build", {
            name: "Auth Test",
            intent: "test",
            authMethod: "bearer",
        });

        const all = await testDb.select().from(schema.capsules);
        const item = all.find(c => c.name === "AuthTestWidget");
        expect(item?.api_config).toBeDefined();
        const parsed = JSON.parse(item!.api_config!);
        expect(parsed.requiresAuth).toBe(true);
        expect(parsed.authType).toBe("bearer");
    });

    it("includes biam_protocol in response", async () => {
        const res = await req("POST", "/build", {
            name: "Proto Test",
            intent: "test protocol",
        });
        const json = await res.json();
        expect(json.biam_protocol).toBe("2.0");
    });
});
