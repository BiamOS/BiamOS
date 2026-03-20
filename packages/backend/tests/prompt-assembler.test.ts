// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Assembler Tests
// ============================================================
// Tests the modular prompt assembly engine: module resolution,
// priority ordering, tool deduplication, and output assembly.
// Run: npm test -- tests/prompt-assembler.test.ts
// ============================================================

import { describe, it, expect, beforeAll } from "vitest";
import { PromptAssembler } from "../src/prompt-modules/prompt-assembler.js";
import { assembler } from "../src/prompt-modules/prompt-assembler.js";
import type { PromptModule, ToolDefinition } from "../src/prompt-modules/types.js";

// ============================================================
// Module Resolution
// ============================================================

describe("PromptAssembler.resolve", () => {
    it("always includes 'always: true' modules", () => {
        const modules = assembler.resolve("https://example.com", "do something", "action");
        const ids = modules.map(m => m.id);
        expect(ids).toContain("base");
        expect(ids).toContain("safety");
        expect(ids).toContain("interaction");
        expect(ids).toContain("cookies");
    });

    it("includes phase-action module during action phase", () => {
        const modules = assembler.resolve("https://example.com", "click the button", "action");
        const ids = modules.map(m => m.id);
        expect(ids).toContain("phase-action");
        expect(ids).toContain("forms");
        expect(ids).not.toContain("phase-research");
        expect(ids).not.toContain("phase-present");
    });

    it("includes phase-research module during research phase", () => {
        const modules = assembler.resolve("https://example.com", "search for info", "research");
        const ids = modules.map(m => m.id);
        expect(ids).toContain("phase-research");
        expect(ids).not.toContain("phase-action");
        expect(ids).not.toContain("phase-present");
        expect(ids).not.toContain("forms"); // Forms are action-phase only
    });

    it("includes phase-present module during present phase", () => {
        const modules = assembler.resolve("https://example.com", "build dashboard", "present");
        const ids = modules.map(m => m.id);
        expect(ids).toContain("phase-present");
        expect(ids).not.toContain("phase-action");
        expect(ids).not.toContain("phase-research");
    });

    it("includes platform-x module when URL matches x.com", () => {
        const modules = assembler.resolve("https://x.com/elonmusk", "find latest post", "action");
        const ids = modules.map(m => m.id);
        expect(ids).toContain("platform-x");
        expect(ids).not.toContain("platform-youtube");
        expect(ids).not.toContain("platform-gmail");
        expect(ids).not.toContain("platform-amazon");
    });

    it("includes platform-youtube module when URL matches youtube.com", () => {
        const modules = assembler.resolve("https://www.youtube.com/@mkbhd", "find latest video", "action");
        const ids = modules.map(m => m.id);
        expect(ids).toContain("platform-youtube");
        expect(ids).not.toContain("platform-x");
    });

    it("includes platform-gmail module when URL matches mail.google.com", () => {
        const modules = assembler.resolve("https://mail.google.com/mail/u/0/#inbox", "compose email", "action");
        const ids = modules.map(m => m.id);
        expect(ids).toContain("platform-gmail");
        expect(ids).not.toContain("platform-x");
        expect(ids).not.toContain("platform-youtube");
    });

    it("includes platform-amazon module when URL matches amazon.*", () => {
        const modules = assembler.resolve("https://www.amazon.de/s?k=laptop", "find cheapest laptop", "action");
        const ids = modules.map(m => m.id);
        expect(ids).toContain("platform-amazon");
        expect(ids).not.toContain("platform-x");
    });

    it("includes social-reading module on X.com when task mentions 'latest post'", () => {
        const modules = assembler.resolve("https://x.com/elonmusk", "find Elon Musk's latest post", "action");
        const ids = modules.map(m => m.id);
        expect(ids).toContain("social-reading");
        expect(ids).toContain("platform-x");
    });

    it("includes social-reading module on LinkedIn when task mentions 'show'", () => {
        const modules = assembler.resolve("https://www.linkedin.com/in/someone", "show me their posts", "action");
        const ids = modules.map(m => m.id);
        expect(ids).toContain("social-reading");
    });

    it("does NOT include social-reading on X.com for compose tasks", () => {
        const modules = assembler.resolve("https://x.com/compose", "write a tweet about AI", "action");
        const ids = modules.map(m => m.id);
        // "write" is not in the social-reading taskPatterns
        expect(ids).not.toContain("social-reading");
    });

    it("does NOT include social-reading on non-social URLs", () => {
        const modules = assembler.resolve("https://news.ycombinator.com", "find latest post", "action");
        const ids = modules.map(m => m.id);
        // URL doesn't match social-reading's URL patterns
        expect(ids).not.toContain("social-reading");
    });
});

// ============================================================
// Priority Ordering
// ============================================================

describe("PromptAssembler priority ordering", () => {
    it("sorts modules by priority (low → high)", () => {
        const modules = assembler.resolve("https://x.com/elonmusk", "find latest post", "action");
        const priorities = modules.map(m => m.priority);
        for (let i = 1; i < priorities.length; i++) {
            expect(priorities[i]).toBeGreaterThanOrEqual(priorities[i - 1]);
        }
    });

    it("base module (priority 0) always comes first", () => {
        const modules = assembler.resolve("https://x.com", "do something", "action");
        expect(modules[0].id).toBe("base");
    });
});

// ============================================================
// Tool Deduplication
// ============================================================

describe("PromptAssembler.mergeTools", () => {
    const asm = new PromptAssembler();

    const baseTool: ToolDefinition = {
        type: "function",
        function: {
            name: "search_web",
            description: "Base search tool",
            parameters: { type: "object", properties: {} },
        },
    };

    const overrideTool: ToolDefinition = {
        type: "function",
        function: {
            name: "search_web",
            description: "Enhanced search tool from module",
            parameters: { type: "object", properties: { enhanced: { type: "boolean" } } },
        },
    };

    const newTool: ToolDefinition = {
        type: "function",
        function: {
            name: "special_action",
            description: "A new tool from a module",
            parameters: { type: "object", properties: {} },
        },
    };

    it("preserves base tools when no module tools exist", () => {
        const result = asm.mergeTools([], [baseTool]);
        expect(result).toHaveLength(1);
        expect(result[0].function.name).toBe("search_web");
    });

    it("deduplicates tools by function.name — module wins", () => {
        const moduleWithOverride: PromptModule = {
            id: "test",
            name: "Test",
            priority: 50,
            match: { always: true },
            rules: "",
            tools: [overrideTool],
        };
        const result = asm.mergeTools([moduleWithOverride], [baseTool]);
        expect(result).toHaveLength(1);
        expect(result[0].function.description).toBe("Enhanced search tool from module");
    });

    it("adds new tools from modules alongside base tools", () => {
        const moduleWithNew: PromptModule = {
            id: "test",
            name: "Test",
            priority: 50,
            match: { always: true },
            rules: "",
            tools: [newTool],
        };
        const result = asm.mergeTools([moduleWithNew], [baseTool]);
        expect(result).toHaveLength(2);
        const names = result.map(t => t.function.name);
        expect(names).toContain("search_web");
        expect(names).toContain("special_action");
    });
});

// ============================================================
// Assembly Output
// ============================================================

describe("PromptAssembler.assemble", () => {
    it("includes header with URL, task, step info", () => {
        const result = assembler.assemble({
            url: "https://x.com/elonmusk",
            task: "find latest post",
            phase: "action",
            stepNumber: 3,
            maxSteps: 30,
            historyBlock: "",
            collectedData: "",
        });
        expect(result).toContain("x.com/elonmusk");
        expect(result).toContain("find latest post");
        expect(result).toContain("STEP 3 of 30");
    });

    it("includes urgency warning when steps are low", () => {
        const result = assembler.assemble({
            url: "https://example.com",
            task: "do something",
            phase: "action",
            stepNumber: 28,
            maxSteps: 30,
            historyBlock: "",
            collectedData: "",
        });
        expect(result).toContain("WRAPPING UP");
    });

    it("includes base rules in all outputs", () => {
        const result = assembler.assemble({
            url: "https://example.com",
            task: "simple task",
            phase: "action",
            stepNumber: 1,
            maxSteps: 30,
            historyBlock: "",
            collectedData: "",
        });
        expect(result).toContain("CORE RULES");
        expect(result).toContain("TASK TYPE DETECTION");
    });

    it("includes platform-x rules when on X.com", () => {
        const result = assembler.assemble({
            url: "https://x.com/elonmusk",
            task: "find latest post",
            phase: "action",
            stepNumber: 1,
            maxSteps: 30,
            historyBlock: "",
            collectedData: "",
        });
        expect(result).toContain("PLATFORM: X.com");
        expect(result).toContain("SOCIAL MEDIA READING");
    });

    it("does NOT include YouTube rules when on Gmail", () => {
        const result = assembler.assemble({
            url: "https://mail.google.com",
            task: "compose email",
            phase: "action",
            stepNumber: 1,
            maxSteps: 30,
            historyBlock: "",
            collectedData: "",
        });
        expect(result).not.toContain("PLATFORM: YouTube");
        expect(result).toContain("PLATFORM: Gmail");
    });

    it("includes collected data at the end", () => {
        const result = assembler.assemble({
            url: "https://example.com",
            task: "task",
            phase: "action",
            stepNumber: 1,
            maxSteps: 30,
            historyBlock: "",
            collectedData: "\n📎 SEARCH RESULTS:\nSome search data",
        });
        expect(result).toContain("📎 SEARCH RESULTS");
        // Collected data should be at the end (recency attention)
        const coreRulesPos = result.indexOf("CORE RULES");
        const collectedPos = result.indexOf("📎 SEARCH RESULTS");
        expect(collectedPos).toBeGreaterThan(coreRulesPos);
    });

    it("includes next step hint when provided", () => {
        const result = assembler.assemble({
            url: "https://example.com",
            task: "research task",
            phase: "research",
            stepNumber: 3,
            maxSteps: 30,
            historyBlock: "",
            collectedData: "",
            nextStepHint: "\n⚡ NEXT STEP: Do the thing",
        });
        expect(result).toContain("⚡ NEXT STEP: Do the thing");
    });
});

// ============================================================
// Explain (Debug)
// ============================================================

describe("PromptAssembler.explain", () => {
    it("returns human-readable module list", () => {
        const explanation = assembler.explain("https://x.com/elonmusk", "find latest post", "action");
        expect(explanation.length).toBeGreaterThan(0);
        expect(explanation[0]).toContain("base");
        expect(explanation.some(e => e.includes("platform-x"))).toBe(true);
        expect(explanation.some(e => e.includes("social-reading"))).toBe(true);
    });
});
