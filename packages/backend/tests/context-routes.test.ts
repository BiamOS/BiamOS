// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Context Routes Tests
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { contextRoutes } from "../src/routes/context-routes.js";

// ─── Test App ───────────────────────────────────────────────

const app = new Hono();
app.route("/api/context", contextRoutes);

// ─── Helpers ────────────────────────────────────────────────

function req(method: string, path: string, body?: any) {
    const init: RequestInit = { method };
    if (body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    return app.request(`/api/context${path}`, init);
}

// ============================================================
// POST /api/context/analyze — Input Validation
// ============================================================

describe("POST /api/context/analyze", () => {
    it("returns 400 when body is empty", async () => {
        const res = await req("POST", "/analyze", {});
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBeDefined();
        expect(json.suggestions).toEqual([]);
    });

    it("returns 400 when url is missing", async () => {
        const res = await req("POST", "/analyze", {
            title: "Test Page",
            text_snippet: "Some content",
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("url");
        expect(json.suggestions).toEqual([]);
    });

    it("returns 400 when url is empty string", async () => {
        const res = await req("POST", "/analyze", {
            url: "",
            title: "Test Page",
            text_snippet: "Some content",
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("url");
    });

    it("returns 400 when url is not a string", async () => {
        const res = await req("POST", "/analyze", {
            url: 42,
            title: "Test Page",
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("url");
    });

    it("returns confidence 0 in error responses", async () => {
        const res = await req("POST", "/analyze", {});
        const json = await res.json();
        expect(json.confidence).toBe(0);
    });
});
