// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Summarize Routes Tests (formerly Scrape Routes)
// ============================================================

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { summarizeRoutes } from "../src/routes/summarize-routes.js";

// ─── Test App ───────────────────────────────────────────────

const app = new Hono();
app.route("/api/scrape", summarizeRoutes);

// ─── Helpers ────────────────────────────────────────────────

function req(method: string, path: string, body?: any) {
    const init: RequestInit = { method };
    if (body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    const url = path === "/" ? "/api/scrape" : `/api/scrape${path}`;
    return app.request(url, init);
}

// ============================================================
// POST /api/scrape — Input Validation
// ============================================================

describe("POST /api/scrape", () => {
    it("returns 400 when body is empty", async () => {
        const res = await req("POST", "/", {});
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBeDefined();
    });

    it("returns 400 when url is missing", async () => {
        const res = await req("POST", "/", {
            raw_text: "Some scraped content",
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("url");
    });

    it("returns 400 when raw_text is missing", async () => {
        const res = await req("POST", "/", {
            url: "https://gmail.com",
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("raw_text");
    });

    it("returns 400 when url is empty string", async () => {
        const res = await req("POST", "/", {
            url: "",
            raw_text: "Some content",
        });
        expect(res.status).toBe(400);
    });

    it("returns 400 when raw_text is empty string", async () => {
        const res = await req("POST", "/", {
            url: "https://gmail.com",
            raw_text: "",
        });
        expect(res.status).toBe(400);
    });

    it("returns 400 when url is not a string", async () => {
        const res = await req("POST", "/", {
            url: 42,
            raw_text: "Some content",
        });
        expect(res.status).toBe(400);
    });
});
