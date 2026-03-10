// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Intent Routes (Parallel-Optimized Pipeline)
// ============================================================
// Thin HTTP layer that delegates to:
//   - services/intent-pipeline.ts  (core 5-agent pipeline)
//   - services/sse-helpers.ts      (SSE stream creation)
//   - services/url-builder.ts      (URL template matching)
//
// OPTIMIZATION: JSON endpoint uses speculative parallel execution
// (Concierge ∥ Pipeline). SSE endpoint stays sequential because
// it already provides live step feedback.
// ============================================================

import { Hono } from "hono";
import type { BiamErrorResponse, IntentRequest } from "@biamos/shared";
import { zValidator } from "@hono/zod-validator";
import { intentSchema } from "../validators/schemas.js";
import { getApiKey } from "../server-utils.js";
import { splitIntents } from "../services/intent-splitter.js";
import { processSingleIntent, type SingleIntentResult, type DebugStep } from "../services/intent-pipeline.js";
import { createSSEStream, sseResponse } from "../services/sse-helpers.js";

// Agent Pipeline Imports
import { translateQuery } from "../agents/intent/1-translator.js";
import { triageQuery, type ConciergeResult } from "../agents/intent/0-concierge.js";
import { getWebSearchFallback } from "./pipeline-helpers.js";
import { log } from "../utils/logger.js";

const intentRoutes = new Hono();

// ─── Validation Error Handler ───────────────────────────────

function validationError(result: any, c: any) {
    if (!result.success) {
        const error: BiamErrorResponse = {
            biam_protocol: "2.0",
            action: "error",
            message: result.error.issues.map((i: any) => i.message).join(", "),
        };
        return c.json(error, 400);
    }
}

// ─── POST /intent — JSON Response (Speculative Parallel) ────

intentRoutes.post("/",
    zValidator("json", intentSchema, validationError),
    async (c) => {
        let step = "init";
        try {
            const body = c.req.valid("json");
            const allowedGroups = body.groups;
            step = "validate";

            // Step 0: Check API key
            step = "api_key_check";
            const apiKey = await getApiKey();
            if (!apiKey) {
                return c.json({
                    biam_protocol: "2.0",
                    action: "no_api_key",
                    message: "⚠️ No API key configured. Please go to Settings → API Key and enter your OpenRouter key.",
                    blocks: [{
                        type: "callout", variant: "warning",
                        title: "API Key Missing",
                        text: "BiamOS requires an OpenRouter API key to process requests. You can enter it under Integrations → Usage Dashboard.",
                    }],
                }, 400);
            }

            // Agent 1: Translate (with debug timing)
            step = "translate";
            const tTranslate = Date.now();
            const translated = await translateQuery(body.text);
            const translateDebug: DebugStep = { agent: "Translator", icon: "🌐", duration_ms: Date.now() - tTranslate, input: body.text, output: translated };

            // ⚡ SPECULATIVE PARALLEL: Run Concierge + Pipeline in parallel
            step = "parallel_triage_and_process";

            // Branch A: Concierge triage (may say CLARIFY, ANSWER, or EXECUTE)
            const tConcierge = Date.now();
            const conciergePromise = triageQuery(translated, body.existing_cards, allowedGroups)
                .catch((err) => {
                    return { decision: "EXECUTE", refined_query: translated } as ConciergeResult;
                });

            // Branch B: Speculatively start splitting + processing (assumes EXECUTE)
            // ⚠️ Must have .catch() to prevent unhandled rejection if discarded
            let speculativeError: Error | null = null;
            const speculativePromise = (async () => {
                const text = translated;
                const subIntents = await splitIntents(text, apiKey);
                return processSubIntents(subIntents, allowedGroups);
            })().catch((err) => {
                speculativeError = err instanceof Error ? err : new Error(String(err));
                return [] as SingleIntentResult[];
            });

            // Wait for Concierge first
            const triage = await conciergePromise;
            const conciergeDebug: DebugStep = { agent: "Concierge", icon: "🎩", duration_ms: Date.now() - tConcierge, input: translated, output: `${triage.decision}${triage.refined_query ? ` → "${triage.refined_query}"` : ""}${triage.target_group ? ` [group: ${triage.target_group}]` : ""}` };

            // Handle non-EXECUTE decisions → discard speculative work
            const earlyResponse = await handleTriageDecision(triage, body.text, translated);
            if (earlyResponse) {
                return c.json(earlyResponse);
            }

            // EXECUTE — do we need to re-process with refined query?
            step = "process_intents";
            const refinedQuery = triage.refined_query || translated;

            // Merge Concierge's target_group into allowed groups for Router filtering
            const effectiveGroups = triage.target_group
                ? [triage.target_group, ...(allowedGroups || [])]
                : allowedGroups;

            let results: SingleIntentResult[];
            if (refinedQuery === translated && !triage.target_group) {
                // ⚡ Speculative hit — reuse already-computing results
                results = await speculativePromise;
                if (speculativeError) {
                    const subIntents = await splitIntents(refinedQuery, apiKey);
                    results = await processSubIntents(subIntents, effectiveGroups);
                } else {
                }
            } else {
                // Concierge refined the query or specified a group — need to re-process
                const subIntents = await splitIntents(refinedQuery, apiKey);
                results = await processSubIntents(subIntents, effectiveGroups);
            }

            // Inject Translator + Concierge debug into each result's _debug
            for (const r of results) {
                if (Array.isArray(r._debug)) {
                    r._debug = [translateDebug, conciergeDebug, ...r._debug];
                } else {
                    r._debug = [translateDebug, conciergeDebug];
                }
            }

            // If ALL results are errors (no matching skill), fall back to web search
            const allFailed = results.every(r => r.action === "error" || r.status === "error");
            if (allFailed) {
                const webSearchEnabled = await getWebSearchFallback();
                if (webSearchEnabled) {
                    const searchQuery = refinedQuery || translated;
                    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&igu=1`;
                    return c.json({
                        biam_protocol: "2.0", action: "navigate",
                        url: googleUrl,
                        title: `🔍 ${searchQuery}`,
                        _query: body.text,
                        _debug: results[0]?._debug,
                    });
                } else {
                    // Web search disabled — return helpful message
                    return c.json({
                        biam_protocol: "2.0", action: "multi_result",
                        results: [{
                            status: "ok", biam_protocol: "2.0", action: "render_layout",
                            integration_id: "lura-concierge",
                            layout: { blocks: [{ type: "callout", variant: "info", title: "🎩 Lura", text: `No matching integration found for "${body.text}". Enable **Web Search** in General Settings to get results from the web when no integration matches.` }] },
                            _query: body.text,
                            _debug: results[0]?._debug,
                        }],
                    });
                }
            }

            return c.json({ biam_protocol: "2.0", action: "multi_result", results });
        } catch (err) {
            log.error(`  💥 Error in step "${step}":`, err instanceof Error ? err.stack : err);
            const error: BiamErrorResponse = {
                biam_protocol: "2.0",
                action: "error",
                message: `[${step}] ${err instanceof Error ? err.message : "Internal server error"}`,
            };
            return c.json(error, 500);
        }
    });

// ─── POST /intent/stream — SSE Pipeline (Sequential + Live Steps) ─

intentRoutes.post("/stream",
    zValidator("json", intentSchema, validationError),
    async (c) => {
        c.header("Content-Type", "text/event-stream");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");
        c.header("X-Accel-Buffering", "no");

        const body = c.req.valid("json");
        const allowedGroups = body.groups;

        const { readable, sendEvent, close } = createSSEStream();

        // Run pipeline in background, writing events as we go
        (async () => {
            try {
                await sendEvent("step", { step: "init", label: "🎯 Intent received", stepIndex: 1, totalSteps: 6 });

                // Check API key
                const apiKey = await getApiKey();
                if (!apiKey) {
                    await sendEvent("result", {
                        biam_protocol: "2.0", action: "no_api_key",
                        message: "⚠️ No API key configured.",
                    });
                    await close();
                    return;
                }

                // ⚡ Agent 1 + 0: Translate + Concierge in PARALLEL
                await sendEvent("step", { step: "translate", label: "🌐 Translating & analyzing...", stepIndex: 2, totalSteps: 6 });
                const tParallel = Date.now();

                // Start both simultaneously
                const translatePromise = translateQuery(body.text);
                const conciergePromise = triageQuery(body.text, body.existing_cards, allowedGroups)
                    .catch(() => ({ decision: "EXECUTE", refined_query: body.text } as ConciergeResult));

                const [translated, rawTriage] = await Promise.all([translatePromise, conciergePromise]);

                const translateDebug: DebugStep = { agent: "Translator", icon: "🌐", duration_ms: Date.now() - tParallel, input: body.text, output: translated };

                // If translator changed the text significantly, re-triage with translated text
                let triage: ConciergeResult;
                if (translated !== body.text && translated.toLowerCase() !== body.text.toLowerCase()) {
                    await sendEvent("step", { step: "concierge", label: "🎩 Re-analyzing translated query...", stepIndex: 2, totalSteps: 6 });
                    const tConcierge = Date.now();
                    try {
                        triage = await triageQuery(translated, body.existing_cards, allowedGroups);
                    } catch {
                        triage = { decision: "EXECUTE", refined_query: translated };
                    }
                } else {
                    triage = rawTriage;
                }
                const conciergeDebug: DebugStep = { agent: "Concierge", icon: "🎩", duration_ms: Date.now() - tParallel, input: translated, output: `${triage.decision}${triage.refined_query ? ` → "${triage.refined_query}"` : ""}${triage.target_group ? ` [group: ${triage.target_group}]` : ""}` };

                // Handle UPDATE → EXECUTE
                if (triage.decision === "UPDATE") {
                    triage = { decision: "EXECUTE", refined_query: triage.refined_query || translated };
                }

                // Non-EXECUTE decisions → send result immediately
                const earlyResponse = await handleTriageDecision(triage, body.text, translated);
                if (earlyResponse) {
                    await sendEvent("result", earlyResponse);
                    await close();
                    return;
                }

                // EXECUTE path
                await sendEvent("step", { step: "splitting", label: "✂️ Splitting intents...", stepIndex: 3, totalSteps: 6 });
                const text = triage.refined_query || translated;
                const subIntents = await splitIntents(text, apiKey);

                // Send sub-intent count so frontend can show multiple skeletons
                if (subIntents.length > 1) {
                    await sendEvent("step", { step: "multi_intent", label: `📦 Processing ${subIntents.length} intents...`, count: subIntents.length, stepIndex: 3, totalSteps: 6 });
                }

                await sendEvent("step", { step: "classifying", label: "🧠 Classifying...", stepIndex: 4, totalSteps: 6 });

                // Merge Concierge's target_group into allowed groups for Router
                const effectiveGroups = triage.target_group
                    ? [triage.target_group, ...(allowedGroups || [])]
                    : allowedGroups;

                const settled = await Promise.allSettled(
                    subIntents.map(async (sub, idx) => {
                        if (subIntents.length > 1) {
                            await sendEvent("step", { step: "processing", label: `📦 Processing ${idx + 1}/${subIntents.length}...`, stepIndex: 5, totalSteps: 6 });
                        }
                        return processSingleIntent(sub, effectiveGroups);
                    })
                );

                await sendEvent("step", { step: "building_layout", label: "🎨 Building layout...", stepIndex: 5, totalSteps: 6 });

                const results = collectResults(settled, subIntents);

                // Inject Translator + Concierge debug into each result's _debug
                for (const r of results) {
                    if (Array.isArray(r._debug)) {
                        r._debug = [translateDebug, conciergeDebug, ...r._debug];
                    } else {
                        r._debug = [translateDebug, conciergeDebug];
                    }
                }

                await sendEvent("step", { step: "done", label: "✅ Done!", stepIndex: 6, totalSteps: 6 });

                // ─── Progressive Block Streaming ─────────────────────
                // Emit each block individually before the final result,
                // with delays so frontend renders them progressively.
                const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
                let blocksEmitted = false;
                for (const result of results) {
                    const blocks = (result as any)?.layout?.blocks;
                    if (Array.isArray(blocks) && blocks.length > 1) {
                        for (let i = 0; i < blocks.length; i++) {
                            await sendEvent("block", { block: blocks[i], index: i });
                            if (i < blocks.length - 1) await delay(500);
                        }
                        blocksEmitted = true;
                    }
                }
                // Give frontend time to render the last block before result replaces payload
                if (blocksEmitted) await delay(300);

                // If ALL results are errors (no matching skill), fall back to web search
                const allFailed = results.every(r => r.action === "error" || r.status === "error");
                if (allFailed) {
                    const webSearchEnabled = await getWebSearchFallback();
                    if (webSearchEnabled) {
                        const searchQuery = triage.refined_query || translated || body.text;
                        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&igu=1`;
                        await sendEvent("result", {
                            biam_protocol: "2.0", action: "navigate",
                            url: googleUrl,
                            title: `🔍 ${searchQuery}`,
                            _query: body.text,
                            _debug: results[0]?._debug,
                        });
                    } else {
                        // Web search disabled — return helpful message
                        await sendEvent("result", {
                            biam_protocol: "2.0", action: "multi_result",
                            results: [{
                                status: "ok", biam_protocol: "2.0", action: "render_layout",
                                integration_id: "lura-concierge",
                                layout: { blocks: [{ type: "callout", variant: "info", title: "🎩 Lura", text: `No matching integration found for "${body.text}". Enable **Web Search** in General Settings to get results from the web when no integration matches.` }] },
                                _query: body.text,
                                _debug: results[0]?._debug,
                            }],
                        });
                    }
                } else {
                    await sendEvent("result", { biam_protocol: "2.0", action: "multi_result", results });
                }
            } catch (err) {
                log.error("  💥 SSE pipeline error:", err);
                await sendEvent("result", {
                    biam_protocol: "2.0", action: "error",
                    message: err instanceof Error ? err.message : "Internal server error",
                });
            } finally {
                await close();
            }
        })();

        return sseResponse(readable);
    }
);

// ─── Shared Helpers ─────────────────────────────────────────

async function handleTriageDecision(triage: ConciergeResult, originalText: string, translated: string): Promise<any | null> {
    if (triage.decision === "UPDATE") {
        return null;
    }

    if (triage.decision === "CLARIFY") {
        return {
            biam_protocol: "2.0", action: "clarify",
            question: triage.question, suggestions: triage.suggestions || [],
            original_query: originalText,
        };
    }

    if (triage.decision === "ANSWER") {
        return {
            biam_protocol: "2.0", action: "multi_result",
            results: [{
                status: "ok", biam_protocol: "2.0", action: "render_layout",
                integration_id: "lura-concierge",
                layout: { blocks: [{ type: "callout", variant: "info", title: "🎩 Lura", text: triage.answer }] },
                _query: originalText,
            }],
        };
    }

    if (triage.decision === "NAVIGATE") {
        // If the URL is a Google search, respect the web search fallback setting
        const isGoogleSearch = triage.url?.includes("google.com/search");
        if (isGoogleSearch) {
            const webSearchEnabled = await getWebSearchFallback();
            if (!webSearchEnabled) {
                return {
                    biam_protocol: "2.0", action: "multi_result",
                    results: [{
                        status: "ok", biam_protocol: "2.0", action: "render_layout",
                        integration_id: "lura-concierge",
                        layout: { blocks: [{ type: "callout", variant: "info", title: "🎩 Lura", text: `No matching integration found. Enable **Web Search** in General Settings to search the web automatically.` }] },
                        _query: originalText,
                    }],
                };
            }
        }
        return {
            biam_protocol: "2.0", action: "navigate",
            url: triage.url, title: triage.title || triage.url,
            _query: originalText,
        };
    }

    if (triage.decision === "WEB_SEARCH") {
        const webSearchEnabled = await getWebSearchFallback();
        if (webSearchEnabled) {
            const searchQuery = triage.refined_query || translated;
            const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&igu=1`;
            return {
                biam_protocol: "2.0", action: "navigate",
                url: googleUrl,
                title: `🔍 ${searchQuery}`,
                _query: originalText,
            };
        }
        // Web search disabled — tell user to enable it
        return {
            biam_protocol: "2.0", action: "render_layout",
            integration_id: "lura-concierge",
            layout: { blocks: [{ type: "callout", variant: "info", title: "🎩 Lura", text: `No matching integration found. Enable **Web Search** in General Settings to search the web automatically.` }] },
            _query: originalText,
        };
    }

    if (triage.decision === "SCRAPE") {
        return {
            biam_protocol: "2.0", action: "scrape",
            url: triage.url,
            instruction: triage.instruction || originalText,
            _query: originalText,
        };
    }

    if (triage.decision === "AUTOPILOT") {
        return {
            biam_protocol: "2.0", action: "autopilot",
            url: triage.url,
            instruction: triage.instruction || originalText,
            _query: originalText,
        };
    }

    return null; // EXECUTE — continue pipeline
}

async function processSubIntents(subIntents: string[], allowedGroups?: string[]): Promise<SingleIntentResult[]> {
    const settled = await Promise.allSettled(
        subIntents.map((sub) => processSingleIntent(sub, allowedGroups))
    );
    return collectResults(settled, subIntents);
}

function collectResults(settled: PromiseSettledResult<SingleIntentResult>[], subIntents: string[]): SingleIntentResult[] {
    return settled.map((outcome, i) => {
        if (outcome.status === "fulfilled") return outcome.value;
        return {
            status: "error" as const, biam_protocol: "2.0", action: "error",
            message: outcome.reason instanceof Error ? outcome.reason.message : "Unknown error",
            _query: subIntents[i],
        };
    });
}

export { intentRoutes };
