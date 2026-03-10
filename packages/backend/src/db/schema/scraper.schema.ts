// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Scraper Endpoints Schema
// ============================================================

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Stores user-defined element selectors for repeatable DOM scraping. */
export const scraperEndpoints = sqliteTable("scraper_endpoints", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    label: text("label").notNull(),
    url_pattern: text("url_pattern").notNull(),
    css_selector: text("css_selector").notNull(),
    xpath_selector: text("xpath_selector"),
    text_anchor: text("text_anchor"),
    extract_type: text("extract_type").notNull().default("text"),
    instruction: text("instruction"),
    last_result: text("last_result"),
    last_scraped: text("last_scraped"),
    created_at: text("created_at").notNull(),
});

export type ScraperEndpoint = typeof scraperEndpoints.$inferSelect;
export type NewScraperEndpoint = typeof scraperEndpoints.$inferInsert;
