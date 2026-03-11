// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Browsing History Schema
// ============================================================

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Stores webview browsing history for quick access. */
export const browsingHistory = sqliteTable("browsing_history", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    url: text("url").notNull(),
    title: text("title").notNull().default(""),
    hostname: text("hostname").notNull().default(""),
    visit_count: integer("visit_count").notNull().default(1),
    last_visited: text("last_visited").notNull(),
    created_at: text("created_at").notNull(),
});

export type HistoryEntry = typeof browsingHistory.$inferSelect;
export type NewHistoryEntry = typeof browsingHistory.$inferInsert;
