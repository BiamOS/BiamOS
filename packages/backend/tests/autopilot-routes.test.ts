// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Autopilot Routes Tests
// ============================================================

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { autopilotRoutes } from "../src/routes/autopilot-routes.js";

// ─── Test App ───────────────────────────────────────────────

const app = new Hono();
app.route("/api/autopilot", autopilotRoutes);

// ─── Helpers ────────────────────────────────────────────────

function req(method: string, path: string, body?: any) {
    const init: RequestInit = { method };
    if (body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    return app.request(`/api/autopilot${path}`, init);
}

// ============================================================
// POST /api/autopilot/plan — Input Validation
// ============================================================

describe("POST /api/autopilot/plan", () => {
    it("returns 400 when body is empty", async () => {
        const res = await req("POST", "/plan", {});
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBeDefined();
    });

    it("returns 400 when instruction is missing", async () => {
        const res = await req("POST", "/plan", { url: "https://example.com" });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("instruction");
    });

    it("returns 400 when url is missing", async () => {
        const res = await req("POST", "/plan", { instruction: "Fill out the form" });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("url");
    });

    it("returns 400 when instruction is empty", async () => {
        const res = await req("POST", "/plan", { instruction: "", url: "https://example.com" });
        expect(res.status).toBe(400);
    });

    it("returns 400 when url is empty", async () => {
        const res = await req("POST", "/plan", { instruction: "Fill out the form", url: "" });
        expect(res.status).toBe(400);
    });
});

// ============================================================
// POST /api/autopilot/step — Input Validation
// ============================================================

describe("POST /api/autopilot/step", () => {
    it("returns 400 when body is empty", async () => {
        const res = await req("POST", "/step", {});
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBeDefined();
    });

    it("returns 400 when action is missing", async () => {
        const res = await req("POST", "/step", { selector: "#btn" });
        expect(res.status).toBe(400);
    });

    it("returns 400 when selector is missing", async () => {
        const res = await req("POST", "/step", { action: "click" });
        expect(res.status).toBe(400);
    });

    it("returns script for valid step", async () => {
        const res = await req("POST", "/step", {
            step: 1,
            action: "click",
            selector: "#submit-btn",
            description: "Click submit",
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.script).toBeDefined();
        expect(json.script).toContain("submit-btn");
    });

    it("returns type script with value", async () => {
        const res = await req("POST", "/step", {
            step: 1,
            action: "type",
            selector: "#email",
            value: "test@example.com",
            description: "Enter email",
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.script).toContain("test@example.com");
    });

    it("returns wait script", async () => {
        const res = await req("POST", "/step", {
            step: 1,
            action: "wait",
            selector: "body",
            wait_ms: 3000,
            description: "Wait for load",
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.script).toContain("3000");
    });

    it("returns extract script", async () => {
        const res = await req("POST", "/step", {
            step: 1,
            action: "extract",
            selector: ".result",
            description: "Get result text",
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.script).toContain("innerText");
    });
});
