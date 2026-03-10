// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agents Schema
// ============================================================

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

/**
 * Stores configuration for each AI agent in the pipeline.
 * Agents are organized into pipelines (intent / builder) and
 * executed in step_order sequence. Each agent has its own prompt,
 * model, and usage stats — fully editable via Settings UI.
 */
export const agents = sqliteTable("agents", {
    id: integer("id").primaryKey({ autoIncrement: true }),

    /** Unique agent identifier, e.g. "translator", "classifier" */
    name: text("name").notNull().unique(),

    /** Display name with emoji, e.g. "🌐 Translator" */
    display_name: text("display_name").notNull(),

    /** Short description of what this agent does */
    description: text("description").notNull(),

    /** Which pipeline: "intent" or "builder" */
    pipeline: text("pipeline").notNull(),

    /** Execution order within the pipeline (1, 2, 3...) */
    step_order: integer("step_order").notNull(),

    /** The system prompt sent to the LLM */
    prompt: text("prompt").notNull(),

    /** OpenRouter model identifier */
    model: text("model").notNull().default("google/gemini-2.5-flash-lite"),

    /** Whether this agent is active (skipped if false) */
    is_active: integer("is_active", { mode: "boolean" }).notNull().default(true),

    /** LLM temperature (0 = deterministic, 1 = creative) */
    temperature: real("temperature").notNull().default(0),

    /** Maximum output tokens */
    max_tokens: integer("max_tokens").notNull().default(200),

    /** Lifetime call count for this agent */
    total_calls: integer("total_calls").notNull().default(0),

    /** Lifetime tokens consumed by this agent */
    total_tokens_used: integer("total_tokens_used").notNull().default(0),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
