// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Domain Knowledge Service (D8: Knowledge Engine)
// ============================================================
// V3 Hierarchical RAG:
//   Stage 1 (SQL):  WHERE domain IN (root, 'global') — hard filter
//   Stage 2 (TS):   4-tier scope scoring (path > subdomain > domain > global)
//   Stage 3 (TS):   Cosine similarity ranking within each tier
//
// Also handles: ingestion, TTL pruning, and self-cleaning cache.
// ============================================================

import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db/db.js";
import { domainKnowledge, KNOWLEDGE_TYPE_PRIORITY } from "../db/schema.js";
import type { DomainKnowledgeEntry, NewDomainKnowledgeEntry } from "../db/schema.js";
import {
    computeEmbedding,
    cosineSimilarity,
    embeddingToBase64,
    base64ToEmbedding,
} from "./embedding.js";
import { log } from "../utils/logger.js";

// ─── Constants ───────────────────────────────────────────────

/** Minimum cosine similarity to include a result (prevents noise) */
const SIMILARITY_THRESHOLD = 0.50;  // Lowered from 0.75 — short task queries can't reach 0.75 against long instruction text

/** Auto-trajectory TTL: 30 days in milliseconds */
const AUTO_TRAJECTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Default number of knowledge chunks to inject into a prompt */
const DEFAULT_RETRIEVAL_LIMIT = 5;

// ─── Root-Domain Helper ──────────────────────────────────────
/**
 * Strips the leftmost subdomain label so that knowledge saved for
 * 'todoist.com' is found when the agent is on 'app.todoist.com'.
 *
 * 'app.todoist.com' → 'todoist.com'
 * 'todoist.com'     → 'todoist.com'  (unchanged — already a root)
 * 'mail.google.com' → 'google.com'
 */
function extractRootDomain(domain: string): string {
    const parts = domain.split('.');
    // Only strip the subdomain if we have at least 3 parts (sub.root.tld)
    return parts.length >= 3 ? parts.slice(1).join('.') : domain;
}

// ─── Types ───────────────────────────────────────────────────

export type KnowledgeType = "user_instruction" | "selector_rule" | "auto_trajectory" | "api_doc" | "avoid_rule";
export type KnowledgeSource = "user" | "auto" | "base_rule" | "auto_bootstrap" | "librarian";


export interface IngestOptions {
    domain: string;
    /** V3: Optional exact subdomain, e.g. 'app.haloitsm.com' */
    subdomain?: string;
    /** V3: Optional URL path prefix, e.g. '/workflows' or '/ticket/view' */
    path_pattern?: string;
    type: KnowledgeType;
    content: string;
    source?: KnowledgeSource;
    /** Only for auto_trajectory — number of recovery steps taken */
    recoverySteps?: number;
}

export interface RetrievedChunk {
    id: string;
    domain: string;
    type: KnowledgeType;
    content: string;
    similarity: number;
    confidence: number;
    /** V3: Scope tier this chunk was matched at (1=path, 2=subdomain, 3=domain, 4=global) */
    tier: 1 | 2 | 3 | 4;
}

// ─── Ingest ──────────────────────────────────────────────────

/**
 * Ingest a new knowledge chunk into the Domain Brain.
 *
 * Auto-trajectory guard: only persists auto_trajectory entries with
 * recoverySteps === 0 (direct success path). Fragile workarounds
 * are silently discarded to prevent "Poisoned Knowledge" syndrome.
 */
export async function ingestKnowledge(opts: IngestOptions): Promise<string | null> {
    const { domain, type, content, source = "user", recoverySteps = 0, subdomain, path_pattern } = opts;

    // ─── Auto-trajectory Gate ───────────────────────────────
    // V3: Direct-success auto_trajectories still accepted.
    // Recovery paths go through the Librarian instead (librarian.service.ts).
    if (type === "auto_trajectory" && recoverySteps > 0) {
        log.info(`[DomainBrain] Auto-trajectory skipped (recovery_steps=${recoverySteps} > 0). Use Librarian for distillation.`);
        return null;
    }

    const id = randomUUID();
    const now = new Date();
    const createdAt = now.toISOString();

    const expiresAt = (type === "auto_trajectory" || source === "auto")
        ? new Date(now.getTime() + AUTO_TRAJECTORY_TTL_MS).toISOString()
        : null;

    // Confidence by source:
    // user = 1.0 (explicit), avoid_rule = 0.9 (high — red stop signs surface early),
    // librarian = 0.85, auto = 0.8, auto_bootstrap = 0.7 (fresh, unverified)
    const confidence =
        source === "user" ? 1.0
        : type === "avoid_rule" ? 0.9
        : source === "librarian" ? 0.85
        : source === "auto" ? 0.8
        : 0.7; // auto_bootstrap

    const entry: NewDomainKnowledgeEntry = {
        id,
        domain,
        subdomain: subdomain ?? null,
        path_pattern: path_pattern ?? null,
        type,
        content,
        embedding: null,
        confidence,

        source,
        version: 1,
        created_at: createdAt,
        expires_at: expiresAt,
    };

    await db.insert(domainKnowledge).values(entry);

    const scope = [domain, subdomain, path_pattern].filter(Boolean).join(" › ");
    log.info(`  📚 [KB:Ingest] domain=${scope} type=${type} source=${source} id=${id}`);

    // Compute embedding asynchronously (non-blocking)
    computeEmbedding(content)
        .then(async (vec) => {
            if (!vec) return;
            const b64 = embeddingToBase64(vec);
            await db.run(sql`UPDATE domain_knowledge SET embedding = ${b64} WHERE id = ${id}`);
            log.info(`[DomainBrain] Embedding stored for id: ${id}`);
        })
        .catch((err) => log.warn(`[DomainBrain] Async embedding failed for id ${id}:`, err));

    return id;
}


// ─── Retrieve (V3 Hierarchical) ──────────────────────────────

/**
 * V3 Hierarchical RAG retrieval.
 *
 * Accepts a full URL (or just a hostname) and applies a 4-tier
 * cascading scope engine entirely in TypeScript:
 *
 *   Tier 1 — Path match:      chunk.path_pattern && url.pathname.startsWith(path_pattern)
 *   Tier 2 — Subdomain match: chunk.subdomain === hostname
 *   Tier 3 — Domain match:    chunk.domain === rootDomain
 *   Tier 4 — Global:          chunk.domain === 'global'
 *
 * Within each tier, chunks are ranked by cosine similarity DESC.
 * A minimum of limit/2 Domain-tier chunks are always included to
 * preserve backward compatibility with existing un-scoped data.
 */
export async function retrieveKnowledge(
    domainOrUrl: string,
    query: string,
    limit: number = DEFAULT_RETRIEVAL_LIMIT
): Promise<RetrievedChunk[]> {
    const now = new Date().toISOString();

    // Parse URL — tolerate plain hostnames
    let hostname = domainOrUrl;
    let pathname = "/";
    try {
        const u = domainOrUrl.startsWith("http") ? new URL(domainOrUrl) : new URL(`https://${domainOrUrl}`);
        hostname = u.hostname;
        pathname = u.pathname;
    } catch { /* keep defaults */ }

    const rootDomain = extractRootDomain(hostname);

    // Stage 1: Pull all candidate rows for this root domain (single SQL query)
    const candidates = await db.all<DomainKnowledgeEntry>(sql`
        SELECT *
        FROM domain_knowledge
        WHERE domain IN (${hostname}, ${rootDomain}, 'global')
          AND (expires_at IS NULL OR expires_at > ${now})
    `);

    if (candidates.length === 0) return [];

    // Stage 2: Compute query embedding for semantic ranking
    const queryVec = await computeEmbedding(query);

    // ─── Score each candidate ────────────────────────────────
    const scored: RetrievedChunk[] = [];

    for (const candidate of candidates) {
        // V3: Assign scope tier based on metadata
        let tier: 1 | 2 | 3 | 4;
        if (
            candidate.path_pattern &&
            hostname !== 'global' &&
            pathname.startsWith(candidate.path_pattern)
        ) {
            tier = 1; // Path-specific match (highest priority)
        } else if (candidate.subdomain && candidate.subdomain === hostname) {
            tier = 2; // Subdomain-specific match
        } else if (candidate.domain === 'global') {
            tier = 4; // Global rules
        } else {
            tier = 3; // Root domain match
        }

        // Compute semantic similarity
        let similarity = 0;
        if (candidate.embedding && queryVec) {
            try {
                const vec = base64ToEmbedding(candidate.embedding);
                similarity = cosineSimilarity(queryVec, vec);
            } catch {
                similarity = 0;
            }
        } else if (!candidate.embedding) {
            // Keyword fallback for freshly ingested entries without embeddings yet
            if (candidate.type === 'user_instruction' || candidate.type === 'selector_rule') {
                similarity = 1.0; // Treat as fully relevant
            }
        }

        // Apply threshold — Tier 1 (path-specific) always bypasses threshold
        if (tier !== 1 && queryVec && similarity < SIMILARITY_THRESHOLD) continue;

        scored.push({
            id: candidate.id,
            domain: candidate.domain,
            type: candidate.type as KnowledgeType,
            content: candidate.content,
            similarity,
            confidence: candidate.confidence,
            tier,
        });
    }

    if (scored.length === 0) return [];

    // Stage 3: Sort — tier ASC → type priority ASC → similarity DESC
    scored.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        const pa = KNOWLEDGE_TYPE_PRIORITY[a.type] ?? 99;
        const pb = KNOWLEDGE_TYPE_PRIORITY[b.type] ?? 99;
        if (pa !== pb) return pa - pb;
        return b.similarity - a.similarity;
    });

    const result = scored.slice(0, limit);

    // Log tier breakdown
    const tierCounts = [1, 2, 3, 4].map(t => {
        const n = result.filter(c => c.tier === t).length;
        return n > 0 ? `tier${t}=${n}` : null;
    }).filter(Boolean).join(" ");
    log.info(`  🧠 [DomainBrain] path=${pathname} ${tierCounts || 'no_match'} → ${result.length} chunk(s) injected`);

    return result;
}


// ─── Self-Cleaning Cache ──────────────────────────────────────

/**
 * Immediately invalidates a failed auto_trajectory entry.
 *
 * Called by the agent executor when a retrieved trajectory fails
 * to prevent it from being used again. Only deletes 'auto_trajectory'
 * type entries — user instructions are never auto-deleted.
 */
export async function invalidateTrajectory(id: string): Promise<void> {
    await db.run(sql`
        DELETE FROM domain_knowledge
        WHERE id = ${id}
          AND type = 'auto_trajectory'
    `);
    log.info(`[DomainBrain] Invalidated failed auto_trajectory: ${id}`);
}

// ─── TTL Pruning ─────────────────────────────────────────────

/**
 * Removes all expired knowledge entries.
 * Should be called periodically (e.g. on server startup or via cron).
 * Only affects entries with a non-null expires_at in the past.
 */
export async function pruneExpiredKnowledge(): Promise<number> {
    const now = new Date().toISOString();
    const result = await db.run(sql`
        DELETE FROM domain_knowledge
        WHERE expires_at IS NOT NULL
          AND expires_at <= ${now}
    `);
    const count = (result as any).changes ?? 0;
    if (count > 0) {
        log.info(`[DomainBrain] Pruned ${count} expired knowledge entries`);
    }
    return count;
}

// ─── Prompt Formatter ────────────────────────────────────────

/**
 * Formats retrieved chunks into an XML block for prompt injection.
 *
 * avoid_rule chunks are prefixed with "❌ AVOID:" so the LLM
 * immediately recognizes them as prohibitions (red stop signs).
 * Positive rules keep their original content.
 *
 * Returns empty string if no chunks.
 */
export function formatKnowledgeBlock(domain: string, chunks: RetrievedChunk[]): string {
    if (chunks.length === 0) return "";

    const rules = chunks
        .map((c) => {
            const prefix = c.type === "avoid_rule" ? "❌ AVOID: " : "";
            return `  <rule type="${c.type}">${prefix}${c.content}</rule>`;
        })
        .join("\n");

    return `<domain_knowledge domain="${domain}">\n${rules}\n</domain_knowledge>`;
}

