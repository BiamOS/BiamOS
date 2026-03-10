// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Pinned Intents Schema
// ============================================================

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Stores pinned dashboard items for auto-refreshing data cards. */
export const pinnedIntents = sqliteTable("pinned_intents", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    query: text("query").notNull(),
    endpoint_id: integer("endpoint_id"),
    params: text("params"),
    refresh_minutes: integer("refresh_minutes").notNull().default(15),
    last_data: text("last_data"),
    last_layout: text("last_layout"),
    last_refreshed: text("last_refreshed"),
    sort_order: integer("sort_order").notNull().default(0),
    related_queries: text("related_queries"),
    pin_type: text("pin_type").notNull().default("intent"),
    url: text("url"),
    created_at: text("created_at").notNull(),
});

export type PinnedIntent = typeof pinnedIntents.$inferSelect;
export type NewPinnedIntent = typeof pinnedIntents.$inferInsert;
