// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Autopilot Engine (Phase 4)
// ============================================================
// LLM-powered action planner: breaks a user instruction into
// a sequence of DOM actions (click, type, select, wait, extract).
// Each step is executed sequentially via Electron's executeJavaScript.
// ============================================================

import { getChatUrl, getHeaders } from "../services/llm-provider.js";
import { MODEL_FAST } from "../config/models.js";
import { logTokenUsage } from "../server-utils.js";
import { log } from "../utils/logger.js";
import { safeParseJSON } from "../utils/safe-json.js";

// ─── Types ──────────────────────────────────────────────────

export interface AutopilotStep {
    /** Sequential step number */
    step: number;
    /** Action type */
    action: "click" | "type" | "select" | "wait" | "scroll" | "extract" | "navigate";
    /** CSS selector for the target element */
    selector: string;
    /** Value for type/select actions */
    value?: string;
    /** Wait duration in ms (for wait action) */
    wait_ms?: number;
    /** Human-readable description of what this step does */
    description: string;
}

export interface AutopilotPlan {
    /** Original user instruction */
    instruction: string;
    /** Target URL */
    url: string;
    /** Ordered steps to execute */
    steps: AutopilotStep[];
    /** Overall description of the plan */
    summary: string;
    /** Estimated total duration in seconds */
    estimated_seconds: number;
}

// ─── Plan Generator ─────────────────────────────────────────

const SYSTEM_PROMPT = `You are an Autopilot Agent for BiamOS, an intelligent desktop dashboard.
Given a user instruction and a page's DOM snapshot (text content + visible elements), create a step-by-step plan to automate the user's task.

AVAILABLE ACTIONS:
- click: Click an element. selector = CSS selector.
- type: Type text into an input. selector = CSS selector, value = text to type.
- select: Select an option from a dropdown. selector = CSS selector, value = option value.
- wait: Wait for content to load. wait_ms = milliseconds (max 5000).
- scroll: Scroll to an element. selector = CSS selector.
- extract: Extract text content from an element. selector = CSS selector.
- navigate: Navigate to a URL. value = URL.

RULES:
1. Use specific CSS selectors (prefer #id, [name=], [aria-label=], then .class)
2. Keep plans SHORT — minimum steps necessary (max 8 steps)
3. Add wait steps after clicks that trigger page loads
4. Always verify that selectors are likely to exist based on the DOM snapshot
5. Include extract steps if the user wants to read/get information
6. Return JSON with this exact structure:

{
    "summary": "Brief description of the plan",
    "estimated_seconds": 10,
    "steps": [
        { "step": 1, "action": "click", "selector": "#login-btn", "description": "Click the login button" },
        { "step": 2, "action": "wait", "wait_ms": 2000, "selector": "body", "description": "Wait for page to load" },
        { "step": 3, "action": "type", "selector": "#email", "value": "user@example.com", "description": "Enter email" }
    ]
}`;

export async function generateAutopilotPlan(
    instruction: string,
    url: string,
    domSnapshot: string
): Promise<AutopilotPlan> {
    const userMessage = `INSTRUCTION: ${instruction}

PAGE URL: ${url}

DOM SNAPSHOT (visible elements):
${domSnapshot.substring(0, 4000)}`;

    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("autopilot-planner");

        const response = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_FAST,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userMessage },
                ],
                temperature: 0,
                max_tokens: 1200,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) {
            log.error(`  ❌ Autopilot planner error: ${response.status}`);
            return fallbackPlan(instruction, url);
        }

        const result = await response.json();
        const usage = result.usage ?? {};
        await logTokenUsage("agent:autopilot-planner", MODEL_FAST, usage);

        const content = result.choices?.[0]?.message?.content || "";
        const parsed = safeParseJSON(content);

        if (!parsed || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
            return fallbackPlan(instruction, url);
        }

        // Validate and sanitize steps
        const steps: AutopilotStep[] = parsed.steps
            .filter((s: any) => s.action && s.selector && s.description)
            .map((s: any, i: number) => ({
                step: i + 1,
                action: validateAction(s.action),
                selector: String(s.selector),
                value: s.value ? String(s.value) : undefined,
                wait_ms: s.action === "wait" ? Math.min(Number(s.wait_ms) || 2000, 5000) : undefined,
                description: String(s.description),
            }));

        if (steps.length === 0) return fallbackPlan(instruction, url);

        return {
            instruction,
            url,
            steps,
            summary: parsed.summary || `Autopilot: ${instruction}`,
            estimated_seconds: parsed.estimated_seconds || steps.length * 3,
        };
    } catch (err) {
        log.error("  💥 Autopilot plan error:", err);
        return fallbackPlan(instruction, url);
    }
}

// ─── Step Executor Script Generator ─────────────────────────

/**
 * Generates JavaScript code to execute a single autopilot step
 * inside the webview via executeJavaScript().
 */
export function generateStepScript(step: AutopilotStep): string {
    switch (step.action) {
        case "click":
            return `
                (function() {
                    var el = document.querySelector(${JSON.stringify(step.selector)});
                    if (!el) return { success: false, error: 'Element not found: ${step.selector}' };
                    el.click();
                    return { success: true, action: 'click', selector: ${JSON.stringify(step.selector)} };
                })()
            `;
        case "type":
            return `
                (function() {
                    var el = document.querySelector(${JSON.stringify(step.selector)});
                    if (!el) return { success: false, error: 'Element not found: ${step.selector}' };
                    el.focus();
                    el.value = ${JSON.stringify(step.value || "")};
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return { success: true, action: 'type', selector: ${JSON.stringify(step.selector)} };
                })()
            `;
        case "select":
            return `
                (function() {
                    var el = document.querySelector(${JSON.stringify(step.selector)});
                    if (!el) return { success: false, error: 'Element not found: ${step.selector}' };
                    el.value = ${JSON.stringify(step.value || "")};
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return { success: true, action: 'select', selector: ${JSON.stringify(step.selector)} };
                })()
            `;
        case "scroll":
            return `
                (function() {
                    var el = document.querySelector(${JSON.stringify(step.selector)});
                    if (!el) return { success: false, error: 'Element not found: ${step.selector}' };
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return { success: true, action: 'scroll', selector: ${JSON.stringify(step.selector)} };
                })()
            `;
        case "extract":
            return `
                (function() {
                    var el = document.querySelector(${JSON.stringify(step.selector)});
                    if (!el) return { success: false, error: 'Element not found: ${step.selector}' };
                    return { success: true, action: 'extract', text: (el.innerText || el.textContent || '').substring(0, 2000) };
                })()
            `;
        case "wait":
            return `
                new Promise(function(resolve) {
                    setTimeout(function() {
                        resolve({ success: true, action: 'wait', ms: ${step.wait_ms || 2000} });
                    }, ${step.wait_ms || 2000});
                })
            `;
        case "navigate":
            return `
                (function() {
                    location.href = ${JSON.stringify(step.value || "")};
                    return { success: true, action: 'navigate', url: ${JSON.stringify(step.value || "")} };
                })()
            `;
        default:
            return `({ success: false, error: 'Unknown action: ${step.action}' })`;
    }
}

// ─── Helpers ────────────────────────────────────────────────

function validateAction(action: string): AutopilotStep["action"] {
    const valid: AutopilotStep["action"][] = ["click", "type", "select", "wait", "scroll", "extract", "navigate"];
    return valid.includes(action as any) ? (action as AutopilotStep["action"]) : "click";
}

function fallbackPlan(instruction: string, url: string): AutopilotPlan {
    return {
        instruction,
        url,
        steps: [],
        summary: `Could not create an automation plan for: "${instruction}"`,
        estimated_seconds: 0,
    };
}

