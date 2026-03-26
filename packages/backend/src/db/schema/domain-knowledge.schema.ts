// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Domain Knowledge Schema (D8: Knowledge Engine)
// ============================================================
// Single-table design for the Global RAG / Domain Brain.
// Isolation is enforced via a hard `domain` metadata filter
// before any semantic search — preventing cross-domain
// knowledge contamination ("Todoist" facts never appear on
// an "n8n" page).
// ============================================================

import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

/**
 * Stores all domain-scoped knowledge chunks.
 *
 * V3 Retrieval uses a 4-tier cascading scope:
 *  Tier 1: path_pattern match (highest priority — path-specific UI rules)
 *  Tier 2: subdomain match   (host-specific rules)
 *  Tier 3: domain match      (root domain rules)
 *  Tier 4: global            (universal agent behaviors)
 */
export const domainKnowledge = sqliteTable("domain_knowledge", {
    /** UUID primary key */
    id: text("id").primaryKey(),

    /**
     * Hostname of the site this knowledge belongs to.
     * Use 'global' for universal rules that apply everywhere.
     * Examples: 'app.todoist.com', 'n8n.io', 'global'
     */
    domain: text("domain").notNull(),

    /**
     * Knowledge category — drives retrieval priority ordering.
     *  - 'user_instruction'  : Explicit user-provided guidance ("Remember: save button is hidden")
     *  - 'selector_rule'     : DOM selector / interaction hints ("Use Ctrl+K for quick-add")
     *  - 'auto_trajectory'   : Auto-learned success path (recovery_steps=0 only). Has TTL.
     *  - 'api_doc'           : Injected documentation chunk
     */
    type: text("type", {
        enum: ["user_instruction", "selector_rule", "auto_trajectory", "api_doc", "avoid_rule"],
    }).notNull(),

    /** The human-readable knowledge text injected into prompts */
    content: text("content").notNull(),

    /**
     * 384-dimensional embedding (all-MiniLM-L6-v2), base64-encoded Float32Array.
     * Nullable on insert — computed asynchronously after storage.
     */
    embedding: text("embedding"),

    /**
     * Confidence score [0.0 – 1.0].
     * User instructions default to 1.0.
     * Auto-trajectories start at 0.8 and decay on failed retrievals.
     */
    confidence: real("confidence").notNull().default(1.0),

    /** Origin of the entry: 'user' (manual teach) | 'auto' (self-learned) | 'base_rule' | 'auto_bootstrap' | 'librarian' */
    source: text("source", { enum: ["user", "auto", "base_rule", "auto_bootstrap", "librarian"] }).notNull().default("user"),


    /**
     * Schema version counter for this entry.
     * Incremented when content is updated to allow auditing.
     */
    version: integer("version").notNull().default(1),

    /**
     * V3: Optional exact subdomain target.
     * If set, this chunk is preferred when the agent is on this specific host.
     * Example: 'app.haloitsm.com'
     */
    subdomain: text("subdomain"),

    /**
     * V3: Optional URL path prefix for path-scoped rules.
     * The Librarian auto-populates this from the page URL during distillation.
     * Stored as a normalized prefix: '/workflows', '/ticket/view'
     * Matching uses TypeScript startsWith() — not SQL LIKE.
     */
    path_pattern: text("path_pattern"),

    /** ISO timestamp of initial creation */
    created_at: text("created_at").notNull(),

    /**
     * Optional expiry timestamp (ISO string).
     * Set to 30 days from creation for 'auto_trajectory' entries.
     * NULL = never expires (user-created knowledge).
     */
    expires_at: text("expires_at"),
});

export type DomainKnowledgeEntry = typeof domainKnowledge.$inferSelect;
export type NewDomainKnowledgeEntry = typeof domainKnowledge.$inferInsert;

// ─── Knowledge Type Priority (for prompt injection ordering) ─
// Lower number = higher priority in injected context block.
// avoid_rule is injected FIRST — red stop signs before green lights.
export const KNOWLEDGE_TYPE_PRIORITY: Record<string, number> = {
    avoid_rule: 0,       // ❌ AVOID rules — injected first, highest visibility
    selector_rule: 1,
    user_instruction: 2,
    auto_trajectory: 3,
    api_doc: 4,
};
