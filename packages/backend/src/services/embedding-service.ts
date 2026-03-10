// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Embedding Service
// ============================================================
// Generates text embeddings via Gemini API for semantic search.
// Stores embeddings as JSON arrays in SQLite.
// Used for L2 (Retrieve) in the 4-layer intent pipeline.
// ============================================================

import { db } from "../db/db.js";
import { capsules } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { getEmbeddingsUrl, getEmbeddingHeaders, hasEmbeddingSupport } from "./llm-provider.js";
import { log } from "../utils/logger.js";

// ─── Types ──────────────────────────────────────────────────

export interface GroupMatch {
    groupName: string;
    score: number;
    integrationIds: number[];
}

// ─── Embedding Generation ───────────────────────────────────

/**
 * Generate a text embedding via the configured LLM provider.
 * Returns a float array (768 dims for text-embedding-004).
 * Falls back to OpenRouter for embeddings when using local providers.
 */
export async function embedText(
    text: string,
    apiKey: string
): Promise<number[]> {
    // Check embedding support
    const supported = await hasEmbeddingSupport();
    if (!supported) {
        throw new Error("Embeddings not available: no OpenRouter API key configured for local provider");
    }

    const embeddingsUrl = await getEmbeddingsUrl();
    const headers = await getEmbeddingHeaders();

    const response = await fetch(embeddingsUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model: "openai/text-embedding-3-small",
            input: text,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Embedding API error ${response.status}: ${err}`);
    }

    const result = await response.json();
    const embedding = result.data?.[0]?.embedding;

    if (!Array.isArray(embedding)) {
        throw new Error("Invalid embedding response");
    }

    return embedding;
}

// ─── Cosine Similarity ──────────────────────────────────────

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 (opposite) and 1 (identical).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
}

// ─── Group Search ───────────────────────────────────────────

/**
 * Find the top-K matching integration groups by embedding similarity.
 * Only considers active capsules with embeddings.
 *
 * Returns deduplicated groups sorted by best match score.
 */
export async function findTopGroups(
    queryEmbedding: number[],
    k: number = 3
): Promise<GroupMatch[]> {
    // Load all active capsules that have embeddings
    const allIntegrations = await db
        .select()
        .from(capsules)
        .where(sql`status = 'live'`);

    // Group by group_name, collect embeddings
    const groupMap = new Map<
        string,
        { ids: number[]; embedding: number[] | null }
    >();

    for (const cap of allIntegrations) {
        const key = cap.group_name || cap.name;

        if (!groupMap.has(key)) {
            // Try group_embedding first, fall back to individual embedding
            let embedding: number[] | null = null;
            if (cap.group_embedding) {
                try {
                    embedding = JSON.parse(cap.group_embedding);
                } catch (err) { log.warn(`[Embedding] Failed to parse group_embedding for ${cap.name}:`, err); }
            } else if (cap.embedding) {
                try {
                    embedding = JSON.parse(cap.embedding);
                } catch (err) { log.warn(`[Embedding] Failed to parse embedding for ${cap.name}:`, err); }
            }
            groupMap.set(key, { ids: [cap.id], embedding });
        } else {
            groupMap.get(key)!.ids.push(cap.id);
        }
    }

    // Score each group
    const scored: GroupMatch[] = [];
    for (const [groupName, group] of groupMap) {
        if (!group.embedding) continue;
        const score = cosineSimilarity(queryEmbedding, group.embedding);
        scored.push({
            groupName,
            score,
            integrationIds: group.ids,
        });
    }

    // Sort by score descending, return top K
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
}

/**
 * Store an embedding for a group in all capsules of that group.
 */
export async function storeGroupEmbedding(
    groupName: string,
    embedding: number[]
): Promise<void> {
    const embeddingJson = JSON.stringify(embedding);
    await db
        .update(capsules)
        .set({ group_embedding: embeddingJson })
        .where(sql`group_name = ${groupName} OR (group_name IS NULL AND name = ${groupName})`);
}
