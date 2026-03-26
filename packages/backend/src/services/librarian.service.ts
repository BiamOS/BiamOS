// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Librarian Service (V3: Auto-Distillation)
// ============================================================
// The Librarian is a background LLM call that fires AFTER a
// successful agent task where recoverySteps > 0.
//
// SEPARATION OF CONCERNS:
//   Execution Agent  — Performs, never writes to DB mid-task
//   Librarian        — Reflects post-success, distills knowledge,
//                      writes a clean selector_rule with scope metadata
//
// This prevents "Knowledge Poisoning" — the agent never saves
// panicked workarounds as facts.
// ============================================================

import { getChatUrl, getHeaders } from "./llm-provider.js";
import { ingestKnowledge } from "./domain-knowledge.service.js";
import { log } from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────

export interface TrajectoryStep {
    action: string;
    description: string;
    selector?: string;
    value?: string;
    result?: string;
}

// ─── Path Normalizer ─────────────────────────────────────────

/**
 * Normalizes a URL path to a useful prefix for knowledge scoping.
 * '/workflows/123/edit' → '/workflows'
 * '/ticket/view/456'    → '/ticket/view'
 */
function normalizePathPattern(pathname: string): string {
    const parts = pathname.split("/").filter(Boolean);
    // Keep first 2 path segments, drop dynamic IDs (pure numbers or UUIDs)
    const clean = parts
        .slice(0, 3)
        .filter(p => !/^\d+$/.test(p) && !/^[0-9a-f-]{36}$/i.test(p));
    return clean.length > 0 ? "/" + clean.join("/") : "/";
}

// ─── Librarian Trigger ───────────────────────────────────────

/**
 * Analyze a successful agent trajectory that required recovery steps
 * and distill a concise, reusable UI rule via an LLM call.
 *
 * Runs ENTIRELY in the background — never blocks the agent response.
 * Trigger condition:  task_status === 'success' AND recoverySteps > 0
 *
 * @param steps      - Filtered action steps from the completed task
 * @param url        - Full URL of the active page during the task
 * @param taskIntent - The original user task text
 * @param recoverySteps - Number of self-healing iterations required
 */
export async function analyzeAndDistillTrajectory(
    steps: TrajectoryStep[],
    url: string,
    taskIntent: string,
    recoverySteps: number
): Promise<void> {
    if (recoverySteps <= 0 || steps.length === 0) return;

    // Parse URL for scoping metadata
    let hostname = url;
    let pathname = "/";
    let rootDomain = url;
    try {
        const u = new URL(url.startsWith("http") ? url : `https://${url}`);
        hostname = u.hostname;
        pathname = u.pathname;
        const parts = hostname.split(".");
        rootDomain = parts.length >= 3 ? parts.slice(1).join(".") : hostname;
    } catch { /* keep defaults */ }

    const pathPattern = normalizePathPattern(pathname);

    // Format steps as a readable trace for the LLM
    const trace = steps
        .map((s, i) => `  ${i + 1}. [${s.action}] ${s.description}${s.value ? ` → "${s.value}"` : ""}`)
        .join("\n");

    const prompt = `You are a knowledge distillation agent for an AI browser automation system.

The agent was asked to: "${taskIntent}"
The agent is working on: ${url}
The agent struggled ${recoverySteps} time(s) before succeeding.

Agent step trace:
${trace}

Your job: Distill the single most important UI insight from this trace into a concise, reusable rule.
This rule will be injected into future agent prompts when working on "${pathPattern}" paths.

Requirements:
- Max 200 characters
- Focus on the specific UI challenge (hidden buttons, modal interactions, navigation quirks)
- Write it as a direct instruction, not a description
- Do NOT include domain names or URLs in the rule

Respond ONLY with valid JSON:
{"type": "selector_rule", "content": "<your rule here>"}
or
{"type": "user_instruction", "content": "<your rule here>"}`;

    log.info(`  📖 [Librarian] Distilling trajectory for ${hostname}${pathPattern} (${recoverySteps} recovery steps, ${steps.length} actions)`);

    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("Librarian");

        const res = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-lite-001",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 150,
                temperature: 0.3,
            }),
        });

        if (!res.ok) {
            log.warn(`  📖 [Librarian] LLM call failed: ${res.status} ${res.statusText}`);
            return;
        }

        const data = await res.json() as any;
        const raw = data?.choices?.[0]?.message?.content?.trim() ?? "";

        // Extract JSON from the response (handle markdown code fences)
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            log.warn(`  📖 [Librarian] Could not extract JSON from response: ${raw.substring(0, 100)}`);
            return;
        }

        const parsed = JSON.parse(jsonMatch[0]) as { type: "selector_rule" | "user_instruction"; content: string };
        if (!parsed.type || !parsed.content) {
            log.warn(`  📖 [Librarian] Invalid response schema:`, parsed);
            return;
        }

        // Clamp to 200 chars
        const content = parsed.content.substring(0, 200);

        // Ingest with full V3 scope metadata
        const id = await ingestKnowledge({
            domain: rootDomain,
            subdomain: hostname !== rootDomain ? hostname : undefined,
            path_pattern: pathPattern !== "/" ? pathPattern : undefined,
            type: parsed.type,
            content,
            source: "auto",
        });

        if (id) {
            log.info(`  ✨ [Librarian] Distilled rule saved: domain=${rootDomain} path=${pathPattern} id=${id}`);
            log.info(`  ✨ [Librarian] Rule: "${content}"`);
        }

        // ─── V5: Negative Rule (avoid_rule) ─────────────────
        // Write what FAILED alongside what worked. Red stop signs
        // are injected first (priority 0) to prevent repeat mistakes.
        const negativePrompt = `You are an AI agent failure analyst for a browser automation system.

The agent was asked to: "${taskIntent}"
The agent is working on: ${url}
The agent needed ${recoverySteps} recovery attempt(s) before succeeding.

Agent step trace (including failed attempts):
${trace}

Your job: Identify the single most critical MISTAKE the agent made before finally succeeding.
Write a concise "AVOID" rule that will prevent this mistake in the future.

Requirements:
- Max 150 characters
- Start with the forbidden action, not with "AVOID"
- Be specific about what went wrong, not what should be done instead
- Focus on the most dangerous or time-wasting mistake

Respond ONLY with valid JSON:
{"content": "<what the agent should avoid>"}`;

        try {
            const negRes = await fetch(chatUrl, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: "google/gemini-2.0-flash-lite-001",
                    messages: [{ role: "user", content: negativePrompt }],
                    max_tokens: 100,
                    temperature: 0.2,
                }),
            });

            if (negRes.ok) {
                const negData = await negRes.json() as any;
                const negRaw = negData?.choices?.[0]?.message?.content?.trim() ?? "";
                const negMatch = negRaw.match(/\{[\s\S]*\}/);
                if (negMatch) {
                    const negParsed = JSON.parse(negMatch[0]) as { content: string };
                    if (negParsed.content?.trim()) {
                        const avoidContent = negParsed.content.trim().substring(0, 150);
                        const avoidId = await ingestKnowledge({
                            domain: rootDomain,
                            subdomain: hostname !== rootDomain ? hostname : undefined,
                            path_pattern: pathPattern !== "/" ? pathPattern : undefined,
                            type: "avoid_rule",
                            content: avoidContent,
                            source: "librarian",
                        });
                        if (avoidId) {
                            log.info(`  🚫 [Librarian] Avoid rule saved: "${avoidContent}"`);
                        }
                    }
                }
            }
        } catch {
            // Non-critical negative rule — never crash
        }

    } catch (err) {
        // Never let Librarian errors bubble up — it's a background enhancement
        log.warn(`  📖 [Librarian] Distillation error (non-critical):`, err);
    }
}

