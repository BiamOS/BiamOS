// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Server Utilities
// ============================================================
// Shared helpers used across route files.
// Extracted from server.ts monolith for modularity.
// ============================================================

import { eq, sum, sql } from "drizzle-orm";
import { db } from "./db/db.js";
import { systemSettings, usageLogs, agents } from "./db/schema.js";
import { log } from "./utils/logger.js";

// ─── Constants ──────────────────────────────────────────────

// ─── API Key Resolution ─────────────────────────────────────

/** Resolve API key: DB setting > env variable */
export async function getApiKey(): Promise<string> {
    try {
        const row = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.key, "OPENROUTER_API_KEY"))
            .limit(1);
        if (row.length > 0 && row[0].value) return row[0].value;
    } catch (err) { log.warn("[server-utils] DB API key lookup failed, using env:", err); }
    return process.env.OPENROUTER_API_KEY ?? "";
}

// ─── Token Usage Logging ────────────────────────────────────

/** Log token usage from an OpenRouter API response */
export async function logTokenUsage(
    intent: string,
    model: string,
    usage: any
) {
    try {
        await db.insert(usageLogs).values({
            timestamp: new Date().toISOString(),
            intent,
            model_name: model,
            prompt_tokens: usage?.prompt_tokens ?? 0,
            completion_tokens: usage?.completion_tokens ?? 0,
        });
    } catch {
    }
}

// ─── Token Stats ────────────────────────────────────────────

/** Get aggregated token usage stats */
export async function getTokenStats() {
    const totals = await db
        .select({
            total_prompt: sum(usageLogs.prompt_tokens),
            total_completion: sum(usageLogs.completion_tokens),
        })
        .from(usageLogs);

    const recentLogs = await db
        .select()
        .from(usageLogs)
        .orderBy(usageLogs.id)
        .limit(50);

    return {
        total_prompt_tokens: Number(totals[0]?.total_prompt ?? 0),
        total_completion_tokens: Number(totals[0]?.total_completion ?? 0),
        total_tokens:
            Number(totals[0]?.total_prompt ?? 0) +
            Number(totals[0]?.total_completion ?? 0),
        recent_calls: recentLogs.length,
    };
}

// ─── Agent Usage Increment ──────────────────────────────────

/**
 * Increment usage stats for a named agent in the agents table.
 * Use this for services that bypass runAgent() but still want
 * their LLM usage reflected in the Agent Pipeline dashboard.
 */
export async function incrementAgentUsage(
    agentName: string,
    usage: { prompt_tokens?: number; completion_tokens?: number }
) {
    const totalTokens = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
    if (totalTokens === 0) return;
    try {
        await db.run(sql`
            UPDATE agents
            SET total_calls = total_calls + 1,
                total_tokens_used = total_tokens_used + ${totalTokens}
            WHERE name = ${agentName}
        `);
    } catch { /* best effort */ }
}
