// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent Memory Service (Local Action Memory)
// ============================================================
// Provides RAG-style workflow lookup: before every LLM call,
// check if we've seen this task on this domain before and
// inject the known click-path into the system prompt.
// ============================================================

import { db } from "../db/db.js";
import { agentWorkflows } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { log } from "../utils/logger.js";
import { computeEmbedding, cosineSimilarity, embeddingToBase64, base64ToEmbedding } from "./embedding.js";

// ─── Types ──────────────────────────────────────────────────

export interface WorkflowMatch {
    id: number;
    domain: string;
    intent_text: string;
    steps: { action: string; description: string; selector?: string; value?: string }[];
    verified: boolean;
    success_count: number;
}

export interface WorkflowSaveResult {
    workflow_id: number;
    success_count: number;
    just_compiled: boolean; // true when this save triggered auto-verification (count reached 3)
}

// ─── Intent Hashing ─────────────────────────────────────────
// Normalize a task into a stable hash for deduplication.
// Strips filler words, lowercases, sorts keywords.

const FILLER_WORDS = new Set([
    "bitte", "please", "und", "and", "die", "der", "das", "the", "a", "an",
    "von", "from", "of", "für", "for", "in", "im", "on", "to", "zu",
    "mir", "me", "mich", "ich", "i", "es", "it", "du", "you",
    "kann", "can", "könnte", "could", "soll", "should", "will",
    "mal", "jetzt", "now", "dann", "then", "auch", "also",
    "eine", "einen", "einem", "einer",
]);

export function hashIntent(task: string): string {
    const words = task
        .toLowerCase()
        .replace(/[^a-zäöüß0-9\s]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 1 && !FILLER_WORDS.has(w))
        .sort();

    // Simple hash: join sorted keywords
    const key = words.join("|");

    // DJB2 hash for compact storage
    let hash = 5381;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) + hash + key.charCodeAt(i)) & 0xFFFFFFFF;
    }
    return hash.toString(36);
}

// ─── Extract Domain ─────────────────────────────────────────

export function extractDomain(url: string): string {
    try {
        const hostname = new URL(url).hostname;
        // Strip www.
        return hostname.replace(/^www\./, "");
    } catch {
        return "unknown";
    }
}

// ─── Save Workflow Trace ────────────────────────────────────

export async function saveWorkflowTrace(
    domain: string,
    task: string,
    steps: { action: string; description: string; selector?: string; value?: string; result?: string }[],
): Promise<number> {
    // Strip /act prefix if leaked from frontend
    const cleanTask = task.replace(/^\/act\s*/i, '').trim();
    const hash = hashIntent(cleanTask);
    const now = new Date().toISOString();

    // Filter to only meaningful action steps (skip done, ask_user)
    const cleanSteps = steps
        .filter(s => !["done", "ask_user", "take_notes"].includes(s.action))
        .map(({ action, description, selector, value }) => ({
            action, description, selector, value,
        }));

    if (cleanSteps.length === 0) {
        log.debug("  🧠 Memory: no actionable steps to save");
        return -1;
    }

    // Check if workflow already exists
    const existing = await db
        .select()
        .from(agentWorkflows)
        .where(and(
            eq(agentWorkflows.domain, domain),
            eq(agentWorkflows.intent_hash, hash),
        ))
        .limit(1);

    if (existing.length > 0) {
        const newCount = existing[0].success_count + 1;
        // ── Auto-Verify Gate (Phase 3A): 3 Assertion-verified successes → compiled ──
        // The Assertion Engine already verified each done() call deterministically.
        // 3 verified successes = this workflow is reliable enough to run without LLM.
        const autoVerify = newCount >= 3;

        await db
            .update(agentWorkflows)
            .set({
                steps_json: JSON.stringify(cleanSteps),
                success_count: newCount,
                verified: (autoVerify || !!existing[0].verified) as any,
                updated_at: now,
            })
            .where(eq(agentWorkflows.id, existing[0].id));

        if (autoVerify && !existing[0].verified) {
            log.info(`  🧠 [NeuroSymbolic] Workflow #${existing[0].id} AUTO-COMPILED after ${newCount} verified runs (${domain})`);
        } else {
            log.debug(`  🧠 Memory: updated workflow #${existing[0].id} (${domain} / ${hash}) — ${newCount} successes`);
        }

        return existing[0].id;
    }

    // Insert new workflow
    // Compute embedding for semantic matching (non-blocking: if it fails, we still save)
    let embeddingB64 = '';
    let queryEmbedding: Float32Array | null = null;
    try {
        queryEmbedding = await computeEmbedding(cleanTask);
        if (queryEmbedding) embeddingB64 = embeddingToBase64(queryEmbedding);
    } catch { /* embedding optional */ }

    // ── Semantic dedup: check if a similar verified workflow already exists ──
    if (queryEmbedding) {
        const DEDUP_THRESHOLD = 0.65;
        const allWorkflows = await db.select().from(agentWorkflows);

        for (const wf of allWorkflows) {
            if (!wf.intent_embedding || !wf.verified) continue;
            const storedEmb = base64ToEmbedding(wf.intent_embedding);
            const score = cosineSimilarity(queryEmbedding, storedEmb);

            if (score >= DEDUP_THRESHOLD) {
                // Merge: increment the existing verified workflow instead of creating a duplicate
                await db
                    .update(agentWorkflows)
                    .set({
                        success_count: wf.success_count + 1,
                        updated_at: now,
                    })
                    .where(eq(agentWorkflows.id, wf.id));

                log.debug(`  🧠 Memory: dedup merge → workflow #${wf.id} (score=${score.toFixed(3)}) "${wf.intent_text?.substring(0, 40)}" — ${wf.success_count + 1} successes`);
                return wf.id;
            }
        }
    }

    const result = await db.run(sql`
        INSERT INTO agent_workflows (domain, intent_hash, intent_text, steps_json, success_count, fail_count, verified, intent_embedding, created_at, updated_at)
        VALUES (${domain}, ${hash}, ${cleanTask}, ${JSON.stringify(cleanSteps)}, 1, 0, 0, ${embeddingB64}, ${now}, ${now})
    `);

    const newId = Number(result.lastInsertRowid ?? -1);
    log.debug(`  🧠 Memory: saved new workflow #${newId} (${domain} / ${hash})${embeddingB64 ? ' + embedding' : ''}`);
    return newId;
}

// ─── Lookup Known Workflow ──────────────────────────────────

export async function lookupWorkflow(
    domain: string,
    task: string,
): Promise<WorkflowMatch | null> {
    // Strip /act prefix if leaked from frontend
    const cleanTask = task.replace(/^\/act\s*/i, '').trim();
    const hash = hashIntent(cleanTask);
    log.debug(`  🧠 Memory: lookup for domain="${domain}" hash="${hash}" task="${cleanTask.substring(0, 50)}..."`);

    // ── Step 1a: Exact hash match on CURRENT domain ──
    const exactResults = await db
        .select()
        .from(agentWorkflows)
        .where(and(
            eq(agentWorkflows.domain, domain),
            eq(agentWorkflows.intent_hash, hash),
        ))
        .limit(1);

    if (exactResults.length > 0) {
        const wf = exactResults[0];
        log.debug(`  🧠 Memory: exact hash match found #${wf.id} verified=${wf.verified} success=${wf.success_count}`);
        if (wf.verified) {
            return parseWorkflowMatch(wf, 'exact hash');
        }
        log.debug(`  🧠 Memory: exact match not qualified (needs verified)`);
    }

    // ── Step 1b: Exact hash match on ANY domain (cross-domain) ──
    if (exactResults.length === 0) {
        const crossDomainResults = await db
            .select()
            .from(agentWorkflows)
            .where(eq(agentWorkflows.intent_hash, hash))
            .limit(1);

        if (crossDomainResults.length > 0) {
            const wf = crossDomainResults[0];
            log.debug(`  🧠 Memory: cross-domain hash match #${wf.id} on ${wf.domain} verified=${wf.verified} success=${wf.success_count}`);
            if (wf.verified) {
                return parseWorkflowMatch(wf, `exact hash (cross-domain: ${wf.domain})`);
            }
        } else {
            log.debug(`  🧠 Memory: no exact hash match on any domain, trying semantic...`);
        }
    }

    // ── Step 2: Semantic fallback (cosine similarity, ~20ms) ──
    try {
        const queryEmbedding = await computeEmbedding(cleanTask);
        if (!queryEmbedding) {
            log.debug(`  🧠 Memory: embedding computation returned null — skipping semantic`);
            return null;
        }

        // Search current domain first, then ALL domains as cross-domain fallback
        const SIMILARITY_THRESHOLD = 0.65;
        let bestMatch: any = null;
        let bestScore = 0;

        // Load ALL workflows (cross-domain search)
        const allWorkflows = await db
            .select()
            .from(agentWorkflows);

        log.debug(`  🧠 Memory: ${allWorkflows.length} total workflows, searching semantically...`);

        for (const wf of allWorkflows) {
            // Skip unqualified workflows — STRICT ZERO TRUST: must be verified by human
            if (!wf.verified) continue;

            // Get stored embedding
            const embB64 = wf.intent_embedding;
            if (!embB64) continue;

            try {
                const storedEmb = base64ToEmbedding(embB64);
                const score = cosineSimilarity(queryEmbedding, storedEmb);

                // Prefer same-domain matches (boost by 0.03)
                const adjustedScore = wf.domain === domain ? score + 0.03 : score;
                log.debug(`  🧠 Memory:   #${wf.id} [${wf.domain}] score=${score.toFixed(3)}${wf.domain === domain ? ' (same domain +0.03)' : ''} "${wf.intent_text.substring(0, 40)}"`);

                if (adjustedScore > bestScore && score >= SIMILARITY_THRESHOLD) {
                    bestScore = adjustedScore;
                    bestMatch = wf;
                }
            } catch (e) {
                log.debug(`  🧠 Memory:   skip #${wf.id} (embedding parse error)`);
            }
        }

        if (bestMatch) {
            const crossDomain = bestMatch.domain !== domain;
            log.debug(`  🧠 Memory: ✅ semantic match! score=${bestScore.toFixed(3)} for #${bestMatch.id}${crossDomain ? ` (cross-domain: ${bestMatch.domain})` : ''}`);
            return parseWorkflowMatch(bestMatch, `semantic ${(bestScore * 100).toFixed(0)}%${crossDomain ? ` via ${bestMatch.domain}` : ''}`);
        } else {
            log.debug(`  🧠 Memory: no semantic match above threshold ${SIMILARITY_THRESHOLD}`);
        }
    } catch (err) {
        log.debug(`  🧠 Memory: semantic lookup error (non-fatal): ${err}`);
    }

    return null;
}

/**
 * Parse a raw DB row into a WorkflowMatch.
 * Includes quality filtering to reject bad/dangerous replays.
 */
function parseWorkflowMatch(wf: any, matchType: string): WorkflowMatch | null {
    let steps: WorkflowMatch['steps'] = [];
    try {
        steps = JSON.parse(wf.steps_json);
    } catch {
        return null;
    }

    // ── Quality guard: reject replays with clearly broken steps ──
    // These patterns indicate a workflow was recorded incorrectly (e.g. agent
    // said "I will now close the browser" as a final step and it got saved).
    const BAD_STEP_PATTERNS = [
        /close the browser/i,
        /i will now close/i,
        /closing the browser/i,
        /closing browser/i,
        /browser closed/i,
        /session ended/i,
        /shutting down/i,
    ];
    const hasBadStep = steps.some(s => {
        const text = `${s.description || ''} ${s.action || ''}`;
        return BAD_STEP_PATTERNS.some(p => p.test(text));
    });
    if (hasBadStep) {
        log.warn(`  🧠 Memory: workflow #${wf.id} REJECTED — contains invalid step (e.g. 'close browser'). Marking as failed.`);
        // Mark as unverified so it won't be a first-choice match next time
        db.run(sql`UPDATE agent_workflows SET verified = 0, fail_count = fail_count + 1 WHERE id = ${wf.id}`).catch(() => {});
        return null;
    }

    // ── Minimum steps guard: single-step replays are usually noise ──
    if (steps.length < 2) {
        log.debug(`  🧠 Memory: workflow #${wf.id} skipped — only ${steps.length} step(s), too short to be reliable`);
        return null;
    }

    log.debug(`  🧠 Memory: found workflow #${wf.id} for ${wf.domain} (${matchType}, ${wf.verified ? '✅ verified' : `${wf.success_count}x success`})`);

    return {
        id: wf.id,
        domain: wf.domain,
        intent_text: wf.intent_text,
        steps,
        verified: !!wf.verified,
        success_count: wf.success_count,
    };
}

// ─── Feedback ───────────────────────────────────────────────

export async function feedbackWorkflow(id: number, positive: boolean): Promise<void> {
    const now = new Date().toISOString();

    if (positive) {
        await db
            .update(agentWorkflows)
            .set({ verified: true, updated_at: now })
            .where(eq(agentWorkflows.id, id));
        log.debug(`  🧠 Memory: workflow #${id} marked as VERIFIED ✅`);
    } else {
        // Increment fail count, unverify
        await db.run(sql`
            UPDATE agent_workflows
            SET fail_count = fail_count + 1, verified = 0, updated_at = ${now}
            WHERE id = ${id}
        `);
        log.debug(`  🧠 Memory: workflow #${id} marked as FAILED ❌`);
    }
}
