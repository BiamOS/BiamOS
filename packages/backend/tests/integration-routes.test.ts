// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Routes Tests
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import * as schema from "../src/db/schema.js";
import { __setDb } from "../src/db/db.js";
import { integrationRoutes } from "../src/routes/integration-routes.js";

// ─── Test App ───────────────────────────────────────────────

const app = new Hono();
app.route("/api/integrations", integrationRoutes);

// ─── Helpers ────────────────────────────────────────────────

let testDb: ReturnType<typeof drizzle>;

function req(method: string, path: string, body?: any) {
    const init: RequestInit = { method };
    if (body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    // Hono sub-router: "/api/integrations" + "" for root, not trailing "/"
    const url = path === "/" ? "/api/integrations" : `/api/integrations${path}`;
    return app.request(url, init);
}

async function seedIntegrations() {
    await testDb.insert(schema.capsules).values([
        {
            name: "WikiSearch",
            intent_description: "wikipedia search article lookup",
            api_endpoint: "https://en.wikipedia.org/api/rest_v1/page/summary/{query}",
            is_auto_generated: false,
            group_name: "Wikipedia",
            is_active: true,
            http_method: "GET",
        },
        {
            name: "WikiContent",
            intent_description: "wikipedia full page content",
            api_endpoint: "https://en.wikipedia.org/api/rest_v1/page/html/{title}",
            is_auto_generated: false,
            group_name: "Wikipedia",
            is_active: true,
            http_method: "GET",
        },
        {
            name: "PexelsSearch",
            intent_description: "photos images pictures landscape",
            api_endpoint: "https://api.pexels.com/v1/search",
            is_auto_generated: true,
            api_config: JSON.stringify({ requiresAuth: true, authType: "apikey" }),
            group_name: "Pexels",
            is_active: true,
            http_method: "GET",
        },
    ]);
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
            api_triggers TEXT,
            response_mapping TEXT,
            response_type TEXT,
            supported_intents TEXT,
            is_generic INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'live',
            integration_type TEXT NOT NULL DEFAULT 'api',
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
        CREATE TABLE health_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            integration_id INTEGER NOT NULL,
            group_name TEXT,
            status TEXT NOT NULL,
            response_time INTEGER,
            status_code INTEGER,
            message TEXT,
            checked_at TEXT NOT NULL
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
// GET /api/integrations — List All
// ============================================================

describe("GET /api/integrations", () => {
    it("returns empty array when no integrations exist", async () => {
        const res = await req("GET", "/");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.biam_protocol).toBe("2.0");
        expect(json.action).toBe("list_integrations");
        expect(json.integrations).toEqual([]);
    });

    it("returns all integrations with parsed api_config", async () => {
        await seedIntegrations();
        const res = await req("GET", "/");
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.integrations).toHaveLength(3);

        const pexels = json.integrations.find((i: any) => i.name === "PexelsSearch");
        expect(pexels.api_config).toEqual({ requiresAuth: true, authType: "apikey" });
        expect(pexels.has_embedding).toBe(false);
        expect(pexels.is_auto_generated).toBe(true);

        const wiki = json.integrations.find((i: any) => i.name === "WikiSearch");
        expect(wiki.group_name).toBe("Wikipedia");
    });

    it("returns is_active as boolean", async () => {
        await seedIntegrations();
        const res = await req("GET", "/");
        const json = await res.json();
        for (const integration of json.integrations) {
            expect(typeof integration.is_active).toBe("boolean");
        }
    });
});

// ============================================================
// PATCH /api/integrations/:id — Update
// ============================================================

describe("PATCH /api/integrations/:id", () => {
    it("updates api_endpoint", async () => {
        await seedIntegrations();
        const listRes = await req("GET", "/");
        const { integrations } = await listRes.json();
        const wiki = integrations.find((i: any) => i.name === "WikiSearch");

        const res = await req("PATCH", `/${wiki.id}`, {
            api_endpoint: "https://new-api.example.com/search",
        });
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.integration.api_endpoint).toBe("https://new-api.example.com/search");
    });

    it("updates intent_description", async () => {
        await seedIntegrations();
        const listRes = await req("GET", "/");
        const { integrations } = await listRes.json();
        const wiki = integrations.find((i: any) => i.name === "WikiSearch");

        const res = await req("PATCH", `/${wiki.id}`, {
            intent_description: "wiki knowledge encyclopedia",
        });
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.integration.intent_description).toBe("wiki knowledge encyclopedia");
    });

    it("updates api_config (sets auth)", async () => {
        await seedIntegrations();
        const listRes = await req("GET", "/");
        const { integrations } = await listRes.json();
        const wiki = integrations.find((i: any) => i.name === "WikiSearch");

        const res = await req("PATCH", `/${wiki.id}`, {
            api_config: { requiresAuth: true, authType: "bearer" },
        });
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.integration.api_config).toEqual({
            requiresAuth: true,
            authType: "bearer",
        });
    });

    it("toggles is_active", async () => {
        await seedIntegrations();
        const listRes = await req("GET", "/");
        const { integrations } = await listRes.json();
        const wiki = integrations.find((i: any) => i.name === "WikiSearch");

        const res = await req("PATCH", `/${wiki.id}`, { is_active: false });
        expect(res.status).toBe(200);

        // PATCH response doesn't include is_active, verify via GET
        const afterRes = await req("GET", "/");
        const afterJson = await afterRes.json();
        const updated = afterJson.integrations.find((i: any) => i.name === "WikiSearch");
        expect(updated.is_active).toBe(false);
    });

    it("updates sidebar_icon and sidebar_label", async () => {
        await seedIntegrations();
        const listRes = await req("GET", "/");
        const { integrations } = await listRes.json();
        const wiki = integrations.find((i: any) => i.name === "WikiSearch");

        const res = await req("PATCH", `/${wiki.id}`, {
            sidebar_icon: "📖",
            sidebar_label: "Wiki",
        });
        expect(res.status).toBe(200);

        // PATCH response doesn't include sidebar fields, verify via GET
        const afterRes = await req("GET", "/");
        const afterJson = await afterRes.json();
        const updated = afterJson.integrations.find((i: any) => i.name === "WikiSearch");
        expect(updated.sidebar_icon).toBe("📖");
        expect(updated.sidebar_label).toBe("Wiki");
    });
});

// ============================================================
// DELETE /api/integrations/:id — Remove
// ============================================================

describe("DELETE /api/integrations/:id", () => {
    it("deletes an integration", async () => {
        await seedIntegrations();
        const listRes = await req("GET", "/");
        const { integrations } = await listRes.json();
        const pexels = integrations.find((i: any) => i.name === "PexelsSearch");

        const res = await req("DELETE", `/${pexels.id}`);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.action).toBe("integration_deleted");

        const afterRes = await req("GET", "/");
        const afterJson = await afterRes.json();
        expect(afterJson.integrations).toHaveLength(2);
        expect(afterJson.integrations.find((i: any) => i.name === "PexelsSearch")).toBeUndefined();
    });

    it("returns 404 for non-existent id", async () => {
        const res = await req("DELETE", "/99999");
        expect(res.status).toBe(404);
    });
});

// ============================================================
// GET /api/integrations/:id/export — Export .lura
// ============================================================

describe("GET /api/integrations/:id/export", () => {
    it("exports an integration as .lura format", async () => {
        await seedIntegrations();
        const listRes = await req("GET", "/");
        const { integrations } = await listRes.json();
        const wiki = integrations.find((i: any) => i.name === "WikiSearch");

        const res = await req("GET", `/${wiki.id}/export`);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.lura_format).toBe("1.0");
        expect(json.integration.name).toBe("WikiSearch");
        expect(json.integration.api_endpoint).toBeDefined();
    });

    it("returns 404 for non-existent id", async () => {
        const res = await req("GET", "/99999/export");
        expect(res.status).toBe(404);
    });
});

// ============================================================
// POST /api/integrations/import — Import .lura
// ============================================================

describe("POST /api/integrations/import", () => {
    it("imports a .lura package", async () => {
        const luraPackage = {
            lura_format: "1.0",
            integration: {
                name: "TestImport",
                intent_description: "test import integration",
                api_endpoint: "https://api.test.com/v1/data",
                api_config: null,
            },
        };

        const res = await req("POST", "/import", luraPackage);
        expect(res.status).toBe(201);

        const json = await res.json();
        expect(json.action).toBe("integration_imported");

        const listRes = await req("GET", "/");
        const listJson = await listRes.json();
        expect(listJson.integrations.find((i: any) => i.name === "TestImport")).toBeDefined();
    });
});
