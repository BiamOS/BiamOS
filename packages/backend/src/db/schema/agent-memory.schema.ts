// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent Memory Schema (Local Action Memory)
// ============================================================
// Stores successful agent workflows so the agent can recall
// known click-paths for repeated tasks on the same domain.
// ============================================================

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Stores verified agent workflows — successful click-paths
 * that the agent can recall for similar future tasks.
 * 
 * Unique constraint on (domain, intent_hash) ensures the same
 * task on the same site merges into a single record.
 */
export const agentWorkflows = sqliteTable("agent_workflows", {
    id: integer("id").primaryKey({ autoIncrement: true }),

    /** Hostname of the site, e.g. "youtube.com" */
    domain: text("domain").notNull(),

    /** V3: Optional exact subdomain e.g. "app.haloitsm.com" */
    subdomain: text("subdomain"),

    /** V3: URL path prefix this workflow was recorded on, e.g. "/workflows" */
    path_pattern: text("path_pattern"),

    /** Normalized hash of the user's task intent */
    intent_hash: text("intent_hash").notNull(),

    /** Original task text for display/debugging */
    intent_text: text("intent_text").notNull(),

    /** JSON array of successful AgentStep[] */
    steps_json: text("steps_json").notNull(),

    /** Number of times this workflow succeeded */
    success_count: integer("success_count").notNull().default(1),

    /** Number of times this workflow failed */
    fail_count: integer("fail_count").notNull().default(0),

    /** User explicitly confirmed via 👍 */
    verified: integer("verified", { mode: "boolean" }).notNull().default(false),

    /** Base64-encoded 384-dim embedding vector for semantic matching */
    intent_embedding: text("intent_embedding").notNull().default(""),

    /** ISO timestamp */
    created_at: text("created_at").notNull(),

    /** ISO timestamp */
    updated_at: text("updated_at").notNull(),
});

export type AgentWorkflow = typeof agentWorkflows.$inferSelect;
export type NewAgentWorkflow = typeof agentWorkflows.$inferInsert;
