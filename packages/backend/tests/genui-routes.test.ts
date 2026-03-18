// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — GenUI Route Tests
// ============================================================

import { describe, it, expect, vi, beforeAll } from "vitest";

// ─── Mock the LLM fetch so we don't call real APIs ──────────

const MOCK_HTML = `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"><\/script></head><body class="bg-gray-900 text-white"><h1>Test Dashboard</h1><button onclick="triggerAgent('Contact Andreas')">Contact</button></body></html>`;

// Mock the fetch globally for LLM calls
const originalFetch = globalThis.fetch;
beforeAll(() => {
    globalThis.fetch = vi.fn(async (url: any, opts: any) => {
        const urlStr = typeof url === "string" ? url : url?.toString?.() || "";
        // Mock LLM chat completions
        if (urlStr.includes("/chat/completions")) {
            return new Response(JSON.stringify({
                choices: [{ message: { content: MOCK_HTML } }],
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        // Fallback for DB calls — use original
        return originalFetch(url, opts);
    }) as any;
});

// ─── Test App ───────────────────────────────────────────────

import { Hono } from "hono";
import { agentRoutes } from "../src/routes/agent-routes.js";

const app = new Hono();
app.route("/api/agents", agentRoutes);

// ─── Helpers ────────────────────────────────────────────────

function req(method: string, path: string, body?: any) {
    const init: RequestInit = { method };
    if (body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    return app.request(`/api/agents${path}`, init);
}

// ============================================================
// POST /api/agents/genui — Input Validation
// ============================================================

describe("POST /api/agents/genui", () => {
    it("returns 400 when body is empty", async () => {
        const res = await req("POST", "/genui", {});
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("prompt");
    });

    it("returns 400 when prompt is missing", async () => {
        const res = await req("POST", "/genui", { data: { foo: "bar" } });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("prompt");
    });

    it("returns 400 when prompt is empty string", async () => {
        const res = await req("POST", "/genui", { prompt: "" });
        expect(res.status).toBe(400);
    });

    it("returns 400 when prompt is whitespace only", async () => {
        const res = await req("POST", "/genui", { prompt: "   " });
        expect(res.status).toBe(400);
    });

    it("returns HTML for valid prompt", async () => {
        const res = await req("POST", "/genui", {
            prompt: "Show me a test dashboard with 3 leads",
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.biam_protocol).toBe("2.0");
        expect(json.action).toBe("genui_render");
        expect(json.html).toContain("<!DOCTYPE html>");
        expect(json.html).toContain("triggerAgent");
    });

    it("accepts optional data parameter", async () => {
        const res = await req("POST", "/genui", {
            prompt: "Display these leads",
            data: { leads: [{ name: "Andreas K.", bio: "Tech Lead" }] },
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.html).toBeDefined();
    });
});
