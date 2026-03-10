// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent Runner (Central Execution Engine)
// ============================================================
// Loads agent config from DB, calls the LLM, tracks usage stats.
// Every agent in both pipelines goes through this single function.
// Supports multiple LLM providers via llm-provider service.
// ============================================================

import { db } from "../db/db.js";
import { agents } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { logTokenUsage } from "../server-utils.js";
import { getChatUrl, getHeaders } from "../services/llm-provider.js";
import {
    sanitizeJSON,
    repairTruncatedJSON,
    aggressiveJSONRepair,
} from "../utils/json-repair.js";

// ─── Types ──────────────────────────────────────────────────

export interface AgentResult {
    output: any;
    raw: string;
    tokens_in: number;
    tokens_out: number;
    tokens_total: number;
    model: string;
    duration_ms: number;
    skipped: boolean;
}

// ─── Main Runner ────────────────────────────────────────────

/**
 * Run a named agent from the DB with the given user input.
 * Loads prompt/model from `agents` table, calls OpenRouter, updates stats.
 */
export async function runAgent(
    agentName: string,
    userInput: string,
    context?: string
): Promise<AgentResult> {
    const start = Date.now();

    // 1. Load agent config from DB
    const [agent] = await db
        .select()
        .from(agents)
        .where(eq(agents.name, agentName))
        .limit(1);

    if (!agent) {
        throw new Error(`Agent "${agentName}" not found in database`);
    }

    // 2. Check if active
    if (!agent.is_active) {
        return {
            output: null, raw: "",
            tokens_in: 0, tokens_out: 0, tokens_total: 0,
            model: agent.model, duration_ms: 0, skipped: true,
        };
    }

    // 3. Build the user message (with optional context)
    const userMessage = context
        ? `${context}\n\n${userInput}`
        : userInput;

    // 4. Call LLM via configured provider
    const chatUrl = await getChatUrl();
    const headers = await getHeaders(agent.name);
    const response = await fetch(chatUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model: agent.model,
            messages: [
                { role: "system", content: agent.prompt },
                { role: "user", content: userMessage },
            ],
            temperature: agent.temperature,
            max_tokens: agent.max_tokens,
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Agent "${agentName}" LLM error ${response.status}: ${errText.substring(0, 200)}`);
    }

    const result = await response.json();
    const usage = result.usage ?? {};
    const tokensIn = usage.prompt_tokens ?? 0;
    const tokensOut = usage.completion_tokens ?? 0;
    const tokensTotal = tokensIn + tokensOut;
    const thinkingTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0;
    const finishReason = result.choices?.[0]?.finish_reason ?? "unknown";
    const durationMs = Date.now() - start;

    // Debug: log thinking tokens and finish reason for thinking agents
    if (thinkingTokens > 0 || agentName === "layout-architect") {
    }

    // 5. Extract raw text
    let raw = (result.choices?.[0]?.message?.content ?? "").trim();
    raw = raw.replace(/^```(?:json)?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "").trim();

    // Debug: for layout-architect, log the tail of the raw output
    if (agentName === "layout-architect" && raw.length > 100) {
    }

    // 6. Try to parse as JSON (most agents output JSON)
    let output: any = raw;
    try {
        output = JSON.parse(sanitizeJSON(raw));
    } catch (e) {
        // Thinking models may output reasoning text before JSON — extract JSON portion
        const jsonStart = raw.search(/[\{\[]/);
        if (jsonStart > 0) {
            const jsonPart = raw.substring(jsonStart).trim();
            try {
                output = JSON.parse(sanitizeJSON(jsonPart));
                raw = jsonPart;
            } catch {
                raw = jsonPart;
            }
        }
        if (typeof output === "string" && agentName === "layout-architect") {
        }
    }

    // 7. Update usage stats in DB
    await db.run(sql`
        UPDATE agents
        SET total_calls = total_calls + 1,
            total_tokens_used = total_tokens_used + ${tokensTotal}
        WHERE name = ${agentName}
    `);

    // 8. Log to usage_logs table
    await logTokenUsage(`agent:${agentName}`, agent.model, usage);

    // 9. Console log

    return {
        output, raw,
        tokens_in: tokensIn, tokens_out: tokensOut, tokens_total: tokensTotal,
        model: agent.model, duration_ms: durationMs, skipped: false,
    };
}

/**
 * Run an agent but ensure the output is valid JSON.
 * Uses 3-stage recovery: normal parse → repair truncated JSON → retry LLM.
 */
export async function runAgentJSON<T = any>(
    agentName: string,
    userInput: string,
    context?: string
): Promise<AgentResult & { output: T }> {
    const result = await runAgent(agentName, userInput, context);
    if (result.skipped) return result as any;

    // Stage 1: Already parsed as JSON
    if (typeof result.output !== "string") {
        return result as any;
    }

    // Stage 2: Try to repair truncated JSON
    const repaired = repairTruncatedJSON(result.raw);
    if (repaired) {
        return { ...result, output: repaired } as any;
    }

    // Stage 2.5: Try aggressive position-based repair
    const aggressiveRepair = aggressiveJSONRepair(result.raw);
    if (aggressiveRepair) {
        return { ...result, output: aggressiveRepair } as any;
    }

    // Stage 3: Retry with LLM
    const retry = await runAgent(agentName, userInput, context);
    if (typeof retry.output !== "string") {
        return retry as any;
    }

    const repairedRetry = repairTruncatedJSON(retry.raw);
    if (repairedRetry) {
        return { ...retry, output: repairedRetry } as any;
    }

    const aggressiveRetry = aggressiveJSONRepair(retry.raw);
    if (aggressiveRetry) {
        return { ...retry, output: aggressiveRetry } as any;
    }

    throw new Error(`Agent "${agentName}" did not return valid JSON after retry: ${retry.raw.substring(0, 200)}`);
}

