// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — User Prompt Modules Schema
// ============================================================
// Stores user-created prompt modules (platform rules) that
// extend the agent's behavior on specific websites.
// ============================================================

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * User-created prompt modules — extends the agent with custom
 * platform navigation rules created via the Prompt Library UI.
 */
export const userPromptModules = sqliteTable("user_prompt_modules", {
    id: integer("id").primaryKey({ autoIncrement: true }),

    /** Unique module ID, e.g. "user-github" */
    module_id: text("module_id").notNull().unique(),

    /** Display name, e.g. "GitHub" */
    name: text("name").notNull(),

    /** Sort priority (50 = platform default) */
    priority: integer("priority").notNull().default(50),

    /** URL match patterns as JSON array of regex strings
     *  e.g. ["github\\.com", "gist\\.github\\.com"] */
    url_patterns: text("url_patterns").notNull(),

    /** Task match patterns (optional) as JSON array */
    task_patterns: text("task_patterns"),

    /** Phase filter as JSON array, e.g. ["action", "research"] */
    phases: text("phases"),

    /** The actual prompt rules text */
    rules: text("rules").notNull(),

    /** Is this module currently active? */
    is_active: integer("is_active", { mode: "boolean" }).notNull().default(true),

    /** Source: "ai_generated" | "manual" | "imported" */
    source: text("source").notNull().default("manual"),

    /** Original URL that was analyzed (for re-analysis) */
    source_url: text("source_url"),

    /** ISO timestamp */
    created_at: text("created_at").notNull(),

    /** ISO timestamp */
    updated_at: text("updated_at").notNull(),
});

export type UserPromptModule = typeof userPromptModules.$inferSelect;
export type NewUserPromptModule = typeof userPromptModules.$inferInsert;
