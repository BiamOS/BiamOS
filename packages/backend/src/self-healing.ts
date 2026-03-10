// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Self-Healing (Post-Bootstrap Data Migrations)
// ============================================================
// Runs after DB bootstrap on every server start. Handles:
// - Agent model upgrades (old preview models → stable)
// - Template metadata backfill (response_type, supported_intents)
// - Group embedding health check (background, non-blocking)
// - Deprecated agent cleanup
//
// All operations are idempotent and non-destructive.
// ============================================================

import { sql } from "drizzle-orm";
import { db } from "./db/db.js";
import { capsules } from "./db/schema.js";
import { MODEL_THINKING } from "./config/models.js";
import { log } from "./utils/logger.js";

// ─── Deprecated Agent Cleanup ───────────────────────────────
// NOTE: classifier, router, param-extractor are NOT deprecated!
// They are actively used by the intent pipeline (2-classifier.ts,
// 3-router.ts, 4-param-extractor.ts). Do NOT delete them.

// ─── Agent Model Upgrades ───────────────────────────────────

async function upgradeAgentModels(): Promise<void> {
    const OLD_MODELS = [
        "google/gemini-2.5-flash-lite-preview-09-2025",
        "google/gemini-2.5-flash-preview-05-20",
    ];
    const THINKING_AGENTS = ["router", "layout-architect", "blueprint-generator", "docs-verifier"];

    for (const name of THINKING_AGENTS) {
        for (const oldModel of OLD_MODELS) {
            await db.run(sql`UPDATE agents SET model = ${MODEL_THINKING} WHERE name = ${name} AND model = ${oldModel}`);
        }
    }

    // Ensure minimum max_tokens for key agents
    await db.run(sql`UPDATE agents SET max_tokens = 16384 WHERE name = 'layout-architect' AND max_tokens < 16384`);
    await db.run(sql`UPDATE agents SET max_tokens = 8192 WHERE name = 'blueprint-generator' AND max_tokens < 8192`);
    await db.run(sql`UPDATE agents SET max_tokens = 2048 WHERE name = 'router' AND max_tokens < 2048`);
    await db.run(sql`UPDATE agents SET max_tokens = 4096 WHERE name = 'docs-verifier' AND max_tokens < 4096`);
}

// ─── Template Metadata Backfill ─────────────────────────────

async function backfillTemplateMetadata(): Promise<void> {
    try {
        const { INTEGRATION_TEMPLATES } = await import("./db/integration-templates.js");
        for (const tpl of INTEGRATION_TEMPLATES) {
            for (const ep of tpl.endpoints) {
                if (ep.response_type) {
                    await db.run(sql`UPDATE capsules SET response_type = ${ep.response_type} WHERE name = ${ep.name} AND group_name = ${tpl.name} AND response_type IS NULL`);
                }
                if (ep.supported_intents) {
                    await db.run(sql`UPDATE capsules SET supported_intents = ${ep.supported_intents} WHERE name = ${ep.name} AND group_name = ${tpl.name} AND supported_intents IS NULL`);
                }
            }
            const blocksJson = JSON.stringify(tpl.allowed_blocks);
            await db.run(sql`UPDATE capsules SET allowed_blocks = ${blocksJson} WHERE group_name = ${tpl.name}`);
            await db.run(sql`UPDATE capsules SET template_category = ${tpl.category} WHERE group_name = ${tpl.name} AND template_category IS NULL`);
            await db.run(sql`UPDATE capsules SET template_description = ${tpl.description} WHERE group_name = ${tpl.name} AND template_description IS NULL`);
        }
    } catch (err) {
        log.warn("[Self-Healing] Template backfill failed:", err);
    }
}

// ─── Embedding Health Check ─────────────────────────────────

async function ensureGroupEmbeddings(): Promise<void> {
    try {
        const allCaps = await db.select().from(capsules).where(sql`status = 'live'`);
        const groupsMissing = new Map<string, string[]>();

        for (const cap of allCaps) {
            const groupName = cap.group_name || cap.name;
            if (!groupsMissing.has(groupName) && !cap.group_embedding) {
                const triggers = [
                    cap.human_triggers,
                    cap.intent_description,
                    cap.normalized_tags,
                ].filter(Boolean).join(", ");
                groupsMissing.set(groupName, [groupName, triggers]);
            }
        }

        if (groupsMissing.size > 0) {
            const apiKey = (await import("./server-utils.js")).getApiKey();
            const key = await apiKey;
            const { embedText, storeGroupEmbedding } = await import("./services/embedding-service.js");

            for (const [groupName, [name, triggers]] of groupsMissing) {
                try {
                    const embText = `${name}: ${triggers}`;
                    const embedding = await embedText(embText, key);
                    await storeGroupEmbedding(groupName, embedding);
                } catch { }
            }
        }
    } catch { }
}

// ─── Main Entry Point ───────────────────────────────────────

/**
 * Run all self-healing operations after DB bootstrap.
 * Called once on server start, before the HTTP server is ready.
 */
export async function runSelfHealing(): Promise<void> {
    await upgradeAgentModels();
    await backfillTemplateMetadata();
}

/**
 * Run non-critical background tasks after the server is listening.
 * These are fire-and-forget — failures don't affect server health.
 */
export async function runBackgroundTasks(): Promise<void> {
    await ensureGroupEmbeddings();
}
