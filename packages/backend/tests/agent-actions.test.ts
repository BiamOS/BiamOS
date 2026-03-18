// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent Action Tests
// ============================================================
// Tests for RC-2 (History Compression) and RC-4 (Search) fixes.
// Run: npm test -- tests/agent-actions.test.ts

import { describe, it, expect, vi, beforeAll } from "vitest";
import { compressHistory, buildCollectedDataSection, type AgentStep } from "../src/services/agent-actions.js";

// ─── Helpers ────────────────────────────────────────────────

function makeStep(action: string, description: string, result?: string, value?: string): AgentStep {
    return { action, description, result, value };
}

// ============================================================
// compressHistory
// ============================================================

describe("compressHistory", () => {
    it("returns empty string for empty history", () => {
        expect(compressHistory([])).toBe("");
    });

    it("includes all steps verbatim when ≤5 steps", () => {
        const steps = [
            makeStep("click", "Clicked compose", "✓ Clicked compose"),
            makeStep("type_text", "Typed email", "✓ typed", "hello@test.com"),
        ];
        const result = compressHistory(steps);
        expect(result).toContain("ACTIONS TAKEN SO FAR");
        expect(result).toContain("1. click");
        expect(result).toContain("2. type_text");
        // Should include value in parens for recent steps
        expect(result).toContain('("hello@test.com")');
    });

    it("compresses older steps when >5 steps", () => {
        const steps = Array.from({ length: 8 }, (_, i) =>
            makeStep("click", `Click step ${i + 1}`, `✓ Result for step ${i + 1} with lots of extra text that should be truncated in the summary`)
        );
        const result = compressHistory(steps);

        // Steps 1-3 should be compressed (no value in parens)
        expect(result).toContain("1. click — Click step 1");
        expect(result).toContain("2. click — Click step 2");
        expect(result).toContain("3. click — Click step 3");

        // Steps 4-8 should be full (recent window)
        expect(result).toContain("4. click — Click step 4");
    });

    it("caps result strings in summary (≤50 chars)", () => {
        const longResult = "x".repeat(200);
        const steps = Array.from({ length: 7 }, (_, i) =>
            makeStep("click", `step ${i}`, longResult)
        );
        const result = compressHistory(steps);

        // First step (compressed) should have result truncated to 50 chars
        const lines = result.split("\n");
        const firstStep = lines.find(l => l.startsWith("1."));
        expect(firstStep).toBeDefined();
        // The result portion after "→ " should be ≤50 chars
        const resultPart = firstStep!.split("→ ")[1];
        expect(resultPart!.length).toBeLessThanOrEqual(50);
    });

    it("caps result strings in recent steps (≤200 chars)", () => {
        const longResult = "y".repeat(500);
        const steps = [makeStep("search_web", "searching", longResult)];
        const result = compressHistory(steps);

        const resultPart = result.split("→ ")[1];
        // Remove trailing newline
        const cleaned = resultPart!.trim();
        expect(cleaned.length).toBeLessThanOrEqual(200);
    });
});

// ============================================================
// buildCollectedDataSection
// ============================================================

describe("buildCollectedDataSection", () => {
    it("returns empty string when no search or notes exist", () => {
        const steps = [
            makeStep("click", "Clicked button", "✓ done"),
            makeStep("navigate", "Went to gmail", "✓ navigated"),
        ];
        expect(buildCollectedDataSection(steps)).toBe("");
    });

    it("extracts search_web results into COLLECTED DATA section", () => {
        const steps = [
            makeStep("search_web", "Searching AI news", "✓ Search results:\n1. OpenAI releases GPT-5\n2. Google Gemini update"),
            makeStep("click", "Clicked compose", "✓ done"),
        ];
        const result = buildCollectedDataSection(steps);
        expect(result).toContain("COLLECTED DATA");
        expect(result).toContain("📎 SEARCH RESULTS");
        expect(result).toContain("OpenAI releases GPT-5");
    });

    it("extracts take_notes results", () => {
        const steps = [
            makeStep("take_notes", "Notes from inbox", '📝 Notes saved: {"context":"5 emails","items":[{"title":"Meeting","summary":"Tomorrow 10am"}]}'),
        ];
        const result = buildCollectedDataSection(steps);
        expect(result).toContain("COLLECTED DATA");
        expect(result).toContain("📝 NOTES");
        expect(result).toContain("5 emails");
    });

    it("combines search results and notes", () => {
        const steps = [
            makeStep("search_web", "Search 1", "Result A"),
            makeStep("take_notes", "Notes 1", "Note data here"),
            makeStep("search_web", "Search 2", "Result B"),
        ];
        const result = buildCollectedDataSection(steps);
        expect(result).toContain("📎 SEARCH RESULTS");
        expect(result).toContain("📝 NOTES");
        expect(result).toContain("Result A");
        expect(result).toContain("Result B");
        expect(result).toContain("Note data here");
    });

    it("ignores steps without results", () => {
        const steps = [
            makeStep("search_web", "Search without result"),
            makeStep("take_notes", "Notes without result"),
        ];
        expect(buildCollectedDataSection(steps)).toBe("");
    });
});

// ============================================================
// /act Route — Integration Test
// ============================================================

// Mock fetch for LLM calls
const originalFetch = globalThis.fetch;
beforeAll(() => {
    globalThis.fetch = vi.fn(async (url: any, opts: any) => {
        const urlStr = typeof url === "string" ? url : url?.toString?.() || "";
        if (urlStr.includes("/chat/completions")) {
            return new Response(JSON.stringify({
                choices: [{
                    message: {
                        tool_calls: [{
                            function: {
                                name: "done",
                                arguments: JSON.stringify({ summary: "Test complete" }),
                            },
                        }],
                    },
                }],
                usage: { prompt_tokens: 100, completion_tokens: 50 },
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        // DDG search mock
        if (urlStr.includes("duckduckgo.com")) {
            return new Response(`
                <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fai-news">AI News Today</a>
                <a class="result__snippet">Latest developments in artificial intelligence</a>
                <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fml-update">ML Update</a>
                <a class="result__snippet">Machine learning breakthroughs this week</a>
            `, { status: 200, headers: { "Content-Type": "text/html" } });
        }
        return originalFetch(url, opts);
    }) as any;
});

import { Hono } from "hono";
import { agentRoutes } from "../src/routes/agent-routes.js";

const app = new Hono();
app.route("/api/agents", agentRoutes);

function req(method: string, path: string, body?: any) {
    const init: RequestInit = { method };
    if (body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    return app.request(`/api/agents${path}`, init);
}

describe("POST /api/agents/act", () => {
    it("returns 400 when task is missing", async () => {
        const res = await req("POST", "/act", {});
        expect(res.status).toBe(400);
    });

    it("accepts step_number and max_steps", async () => {
        const res = await req("POST", "/act", {
            task: "test task",
            page_url: "https://example.com",
            page_title: "Test",
            dom_snapshot: "[0] button 'Click me'",
            history: [
                { action: "click", description: "Clicked button", result: "✓ done" },
            ],
            step_number: 2,
            max_steps: 30,
        });
        expect(res.status).toBe(200);
        // SSE response — read events
        const text = await res.text();
        expect(text).toContain("data:");
    });

    it("handles history with search results (COLLECTED DATA test)", async () => {
        const res = await req("POST", "/act", {
            task: "compose email about AI news",
            page_url: "https://mail.google.com",
            page_title: "Gmail",
            dom_snapshot: "[0] div[role=textbox] 'Compose'",
            history: [
                { action: "search_web", description: "Searched AI news", result: "✓ Search results:\n1. GPT-5 released\n2. Gemini update" },
                { action: "take_notes", description: "Took notes", result: "Notes: 2 articles about AI" },
                { action: "click", description: "Opened compose", result: "✓ Compose opened" },
            ],
            step_number: 4,
            max_steps: 30,
        });
        expect(res.status).toBe(200);
    });
});

// ============================================================
// /search Route — Integration Test
// ============================================================

describe("POST /api/agents/search", () => {
    it("returns 400 when query is missing", async () => {
        const res = await req("POST", "/search", {});
        expect(res.status).toBe(400);
    });

    it("returns structured results for valid query", async () => {
        const res = await req("POST", "/search", { query: "AI news 2024" });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.biam_protocol).toBe("2.0");
        expect(json.action).toBe("search_results");
        expect(json.count).toBeGreaterThan(0);
        // New: structured results array
        expect(json.structured).toBeDefined();
        expect(Array.isArray(json.structured)).toBe(true);
        expect(json.structured[0]).toHaveProperty("title");
        expect(json.structured[0]).toHaveProperty("url");
        // Should extract real URL from DDG redirect
        expect(json.structured[0].url).toContain("example.com");
    });

    it("returns text results (backward compatible)", async () => {
        const res = await req("POST", "/search", { query: "test query" });
        const json = await res.json();
        expect(typeof json.results).toBe("string");
        expect(json.results).toContain("1.");
    });
});
