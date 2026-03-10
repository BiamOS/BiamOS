// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Usage Logs Schema
// ============================================================

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Logs every LLM API call for cost tracking & analytics. */
export const usageLogs = sqliteTable("usage_logs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    timestamp: text("timestamp").notNull(),
    intent: text("intent").notNull(),
    prompt_tokens: integer("prompt_tokens").notNull().default(0),
    completion_tokens: integer("completion_tokens").notNull().default(0),
    model_name: text("model_name").notNull(),
});
