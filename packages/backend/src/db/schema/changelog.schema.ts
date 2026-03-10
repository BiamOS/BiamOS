// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Changelog Schema
// ============================================================

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Stores changelog / release notes entries. */
export const changelog = sqliteTable("changelog", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    version: text("version").notNull(),
    date: text("date").notNull(), // ISO date string
    entries: text("entries").notNull(), // JSON array of { type, text }
    created_at: text("created_at").default(new Date().toISOString()),
});

export type ChangelogEntry = typeof changelog.$inferSelect;
export type NewChangelogEntry = typeof changelog.$inferInsert;
